"""Phase 43: learning summaries (M3-08; G §3 R2; spine S3.3; C26).

The SUM#<subject>#<topicId> counters are written inside the resolving op's transaction (shared/ops.py), so they count
each resolution exactly once: a replayed op answers ALREADY_APPLIED and writes nothing, and a VOIDED or DECLINED slot
never counts. R2 returns them as counts only.
"""

from __future__ import annotations

from typing import Any

import pytest
from runs_harness import PK, RunsApi, _ddb
from test_ops import TO_ACTIVITY, attempt, op, results, send, withdraw

PROGRESS = "GET /api/me/progress"
TOPIC = {"subject": "phonics", "topicId": "phonics-gpc-consonant-digraphs"}


@pytest.fixture
def api(ddb: Any, player_event: dict) -> RunsApi:
    api = RunsApi(ddb)
    api.profile(player_event)
    assert api.create(player_event)[0] == 201
    return api


def progress(api: RunsApi, event: dict) -> dict:
    status, body = api.call(event, PROGRESS)
    assert status == 200
    return body


def test_a_new_player_has_no_summaries(api: RunsApi, player_event: dict) -> None:
    assert progress(api, player_event) == {"summaries": [], "planets": {}, "badges": {}}


def test_a_correct_answer_counts_once_and_a_replay_changes_nothing(api: RunsApi, player_event: dict) -> None:
    batch = [*TO_ACTIVITY, attempt(4, 3, "a"), attempt(5, 4, "b")]  # one wrong try, then right: one resolution
    _, body = send(api, player_event, batch)
    assert results(body)[-1] == ("APPLIED", "RESOLVED_SUCCEEDED")
    summary = progress(api, player_event)["summaries"]
    assert summary == [{**TOPIC, "completed": 1, "succeeded": 1, "failed": 0, "lastResolvedAt": "2026-11-20T10:00:00Z"}]
    _, body = send(api, player_event, batch)  # the whole batch again (a lost response)
    assert all(r == ("ALREADY_APPLIED", None) for r in results(body))
    assert progress(api, player_event)["summaries"] == summary


def test_three_wrong_answers_count_as_one_failed(api: RunsApi, player_event: dict) -> None:
    send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "a"), attempt(5, 4, "c"), attempt(6, 5, "d")])
    assert progress(api, player_event)["summaries"][0] == {
        **TOPIC,
        "completed": 1,
        "succeeded": 0,
        "failed": 1,
        "lastResolvedAt": "2026-11-20T10:00:00Z",
    }


def test_voided_and_declined_slots_never_count(api: RunsApi, player_event: dict) -> None:
    withdraw(api)
    send(api, player_event, [*TO_ACTIVITY, op(4, 3, "DISMISS_SLOT", {"slotId": "N-001"})])
    assert progress(api, player_event)["summaries"] == []


def test_counts_only_never_answers(api: RunsApi, player_event: dict) -> None:
    send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "b")])
    body = progress(api, player_event)
    assert set(body) == {"summaries", "planets", "badges"}
    assert set(body["summaries"][0]) == {"subject", "topicId", "completed", "succeeded", "failed", "lastResolvedAt"}
    assert '"b"' not in api.bodies[-1] and "ageBand" not in api.bodies[-1]


def test_planets_and_badges_come_from_the_profile(api: RunsApi, player_event: dict) -> None:
    api.raw.update_item(
        TableName="test-game",
        Key={"pk": {"S": PK}, "sk": {"S": "PROFILE"}},
        UpdateExpression="SET #p = :p",
        ExpressionAttributeNames={"#p": "planets"},
        ExpressionAttributeValues={":p": _ddb({"luna-1": {"bestCompletedWave": 12}})},
    )
    assert progress(api, player_event)["planets"] == {"luna-1": {"bestCompletedWave": 12}}


def test_no_profile_is_404(ddb: Any, player_event: dict) -> None:
    status, body = RunsApi(ddb).call(player_event, PROGRESS)
    assert (status, body["error"]["code"]) == (404, "PROFILE_NOT_FOUND")
