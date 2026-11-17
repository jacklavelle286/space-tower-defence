"""Phase 17: the ops batch, POST /api/runs/{runId}/ops (G §5, spine S7.1, F §8; M1-17) on moto.

The exit criteria come first: a replayed batch returns ALREADY_APPLIED with the original result; a wrong
expectedRevision stops the batch and later ops are NOT_PROCESSED; the third wrong answer resolves FAILED; a correct one
grants the reward exactly once (also when two deliveries of the same op race).

Races are made real as in test_runs.py: `Ddb.before_transact` changes the table between the handler's reads and its
transaction, so moto's own cancellation answers the handler. The G5 refusal shapes recorded in api/tests/fixtures/ddb/
(test_g5.py records and checks them against DynamoDB Local in CI) are fed to the handler as well.

The run used throughout is the Milestone 1 one (luna-1, first-contact: two waves, slot N-001 holding ph-0102, whose
accepted answer is "b", reward 30 credits).
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import pytest
from conftest import CapturedLogger, event_for, load_handler
from runs_harness import (
    CONTENT_TABLE,
    DDB_FIXTURES,
    MY_SESSION,
    OTHER_SESSION,
    OTHER_SUB,
    PK,
    RUN_A,
    RUN_B,
    Clock,
    RunsApi,
    _ddb,
    load_bounds_fixture,
)

from shared.bounds import BoundsUnavailable
from shared.ops import RECENT_OPS, jitter_seconds

OPS = "POST /api/runs/{runId}/ops"
SLOT = f"SLOT#{RUN_A}#N-001"
SUM = "SUM#phonics#phonics-gpc-consonant-digraphs"
NOVA_P04 = {"padId": "p04", "classId": "nova", "level": 1, "targeting": "FRONT"}
NOVA_P05 = {"padId": "p05", "classId": "nova", "level": 1, "targeting": "FRONT"}
VERSION_KEY = {"pk": {"S": "ACT#ph-0102"}, "sk": {"S": "V#20261120T120000Z"}}


def op_id(n: int) -> str:
    return f"00000000-0000-4000-8000-{n:012d}"


def op(n: int, revision: int, type_: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "opId": op_id(n),
        "expectedRevision": revision,
        "type": type_,
        "payload": payload if payload is not None else {},
        "clientTime": "2026-11-20T10:01:00Z",
    }


def save_prep(n: int, revision: int, credits: int = 100, placements: Sequence[dict] = (NOVA_P04,)) -> dict:
    return op(n, revision, "SAVE_PREP", {"credits": credits, "placements": list(placements)})


def start_wave(n: int, revision: int, wave: int = 1, credits: int = 50) -> dict:
    return op(n, revision, "START_WAVE", {"wave": wave, "credits": credits, "placements": [NOVA_P04, NOVA_P05]})


def complete_wave(n: int, revision: int, wave: int = 1, credits: int = 74) -> dict:
    payload = {
        "wave": wave,
        "credits": credits,
        "placements": [NOVA_P04, NOVA_P05],
        "colony": {"health": 20, "shield": 0},
        "powers": {},
    }
    return op(n, revision, "COMPLETE_WAVE", payload)


def attempt(n: int, revision: int, answer: str, slot_id: str = "N-001") -> dict:
    return op(n, revision, "SUBMIT_ATTEMPT", {"slotId": slot_id, "answer": answer})


TO_ACTIVITY = [save_prep(1, 0), start_wave(2, 1), complete_wave(3, 2)]  # BUILD -> IN_WAVE -> ACTIVITY (revision 3)


def envelope(ops: list[dict], generation: int = 1, session_id: str = MY_SESSION, **changes: Any) -> dict[str, Any]:
    return {"protocolVersion": 1, "sessionId": session_id, "generation": generation, "ops": ops, **changes}


@pytest.fixture
def api(ddb: Any, player_event: dict) -> RunsApi:
    api = RunsApi(ddb)
    api.profile(player_event)
    assert api.create(player_event)[0] == 201  # MY_SESSION holds the lease at generation 1
    api.ddb.calls.clear()
    return api


def send(api: RunsApi, event: dict, ops: list[dict], run_id: str = RUN_A, **changes: Any) -> tuple[int, Any]:
    return api.call(event, OPS, envelope(ops, **changes), run_id=run_id)


def results(body: dict) -> list[tuple[str, str | None]]:
    return [(r["result"], r.get("code") or r.get("outcome")) for r in body["results"]]


def run_item(api: RunsApi) -> dict:
    item = api.item(f"RUN#{RUN_A}")
    assert item is not None
    return item


def transacts(api: RunsApi) -> list[list[dict]]:
    return [kwargs["TransactItems"] for name, kwargs in api.ddb.calls if name == "transact_write_items"]


def op_lines(api: RunsApi) -> list[dict]:
    return [line for line in api.logger.lines() if "opId" in line]


def withdraw(api: RunsApi) -> None:
    api.raw.update_item(
        TableName=CONTENT_TABLE,
        Key=VERSION_KEY,
        UpdateExpression="SET #w = :w",
        ExpressionAttributeNames={"#w": "withdrawn"},
        ExpressionAttributeValues={":w": _ddb({"at": "2026-11-20T09:00:00Z", "reason": "made-up test reason"})},
    )


def recorded(name: str) -> dict:
    data = json.loads((DDB_FIXTURES / f"{name}.json").read_text())
    return {key: data[key] for key in ("Error", "CancellationReasons") if key in data}


# --- Exit criteria --------------------------------------------------------------------------------------------------


def test_a_replayed_batch_returns_already_applied_with_the_original_result(api: RunsApi, player_event: dict) -> None:
    batch = [*TO_ACTIVITY, attempt(4, 3, "a")]
    status, first = send(api, player_event, batch)
    stored = {"run": run_item(api), "slot": api.item(SLOT)}
    writes = len(transacts(api))

    replay_status, replay = send(api, player_event, batch)

    assert (status, replay_status) == (200, 200)
    assert results(first) == [("APPLIED", None), ("APPLIED", None), ("APPLIED", None), ("APPLIED", "INCORRECT")]
    assert [r["result"] for r in replay["results"]] == ["ALREADY_APPLIED"] * 4
    assert [r["appliedRevision"] for r in replay["results"]] == [r["appliedRevision"] for r in first["results"]]
    assert replay["results"][3]["attempt"] == first["results"][3]["attempt"]
    assert first["results"][3]["attempt"] == {
        "n": 1,
        "correct": False,
        "slotStatus": "UNRESOLVED",
        "rewardGranted": False,
    }
    assert len(transacts(api)) == writes  # nothing written by the replay
    assert {"run": run_item(api), "slot": api.item(SLOT)} == stored
    assert replay["run"] == first["run"]
    assert first["run"]["revision"] == 4 and first["run"]["recentOpIds"] == [op_id(n) for n in (1, 2, 3, 4)]


def test_a_wrong_expected_revision_stops_the_batch_and_later_ops_are_not_processed(
    api: RunsApi, player_event: dict
) -> None:
    status, body = send(api, player_event, [save_prep(1, 0), save_prep(2, 5), start_wave(3, 1)])

    assert status == 200
    assert results(body) == [("APPLIED", None), ("REJECTED", "STALE_REVISION"), ("NOT_PROCESSED", None)]
    assert body["results"][2] == {"opId": op_id(3), "result": "NOT_PROCESSED"}
    assert "details" not in body["results"][1] and "appliedRevision" not in body["results"][1]
    assert body["run"]["revision"] == 1 and body["run"]["phase"] == "BUILD"  # op 3 was never looked at
    assert len(transacts(api)) == 1


def test_the_third_wrong_answer_resolves_failed_without_a_reward(api: RunsApi, player_event: dict) -> None:
    send(api, player_event, TO_ACTIVITY)
    credits = run_item(api)["snapshot"]["credits"]

    status, body = send(api, player_event, [attempt(4, 3, "a"), attempt(5, 4, "c"), attempt(6, 5, "d")])

    assert status == 200
    assert results(body) == [("APPLIED", "INCORRECT"), ("APPLIED", "INCORRECT"), ("APPLIED", "RESOLVED_FAILED")]
    assert body["results"][2]["attempt"] == {"n": 3, "correct": False, "slotStatus": "FAILED", "rewardGranted": False}
    slot = api.item(SLOT)
    assert slot["status"] == "FAILED"
    assert [(a["n"], a["attemptId"], a["answer"], a["correct"]) for a in slot["attempts"]] == [
        (1, op_id(4), "a", False),
        (2, op_id(5), "c", False),
        (3, op_id(6), "d", False),
    ]
    assert all(a["recordedAt"] == "2026-11-20T10:00:00Z" for a in slot["attempts"])
    run = run_item(api)
    assert run["phase"] == "BUILD" and run["snapshot"]["credits"] == credits  # no reward, no penalty
    summary = api.item(SUM)
    assert (summary["completed"], summary["succeeded"], summary["failed"]) == (1, 0, 1)

    status, body = send(api, player_event, [attempt(7, 6, "b")])  # the slot is no longer current
    assert results(body) == [("REJECTED", "PHASE_MISMATCH")]
    assert body["results"][0]["details"] == {"phase": "BUILD", "wave": 2, "currentSlotId": None}


def test_a_correct_answer_grants_the_reward_exactly_once(api: RunsApi, player_event: dict) -> None:
    send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "a")])
    before = run_item(api)["snapshot"]["credits"]

    status, body = send(api, player_event, [attempt(5, 4, "b")])
    assert status == 200 and results(body) == [("APPLIED", "RESOLVED_SUCCEEDED")]
    assert body["results"][0]["attempt"] == {"n": 2, "correct": True, "slotStatus": "SUCCEEDED", "rewardGranted": True}
    assert run_item(api)["snapshot"]["credits"] == before + 30
    assert body["run"]["phase"] == "BUILD" and body["run"]["snapshot"]["credits"] == before + 30

    # The same op again (a lost response): already applied, no second reward.
    status, body = send(api, player_event, [attempt(5, 4, "b")])
    assert status == 200 and results(body) == [("ALREADY_APPLIED", None)]
    assert body["results"][0]["attempt"]["rewardGranted"] is True
    # The same answer as a new op: the slot is resolved, so it is no longer current.
    status, body = send(api, player_event, [attempt(6, 5, "b")])
    assert results(body) == [("REJECTED", "PHASE_MISMATCH")]

    assert run_item(api)["snapshot"]["credits"] == before + 30
    assert api.item(SLOT)["status"] == "SUCCEEDED" and len(api.item(SLOT)["attempts"]) == 2
    summary = api.item(SUM)
    assert (summary["completed"], summary["succeeded"], summary["failed"]) == (1, 1, 0)


def test_two_deliveries_of_the_correct_answer_racing_grant_one_reward(api: RunsApi, player_event: dict) -> None:
    """The loser of a duplicate-delivery race: its transaction is cancelled, it re-reads, and step (a) answers
    ALREADY_APPLIED (spine S7.1)."""
    send(api, player_event, TO_ACTIVITY)
    before = run_item(api)["snapshot"]["credits"]
    winner: list[tuple[int, Any]] = []
    api.ddb.before_transact = lambda: winner.append(send(api, player_event, [attempt(4, 3, "b")]))

    status, body = send(api, player_event, [attempt(4, 3, "b")])

    assert winner[0][0] == 200 and results(winner[0][1]) == [("APPLIED", "RESOLVED_SUCCEEDED")]
    assert status == 200 and results(body) == [("ALREADY_APPLIED", None)]
    assert body["results"][0]["appliedRevision"] == 4
    assert body["results"][0]["attempt"] == {"n": 1, "correct": True, "slotStatus": "SUCCEEDED", "rewardGranted": True}
    assert run_item(api)["snapshot"]["credits"] == before + 30 and run_item(api)["revision"] == 4
    assert api.item(SUM)["succeeded"] == 1
    assert api.sleeps and all(0.02 <= s <= 0.1 for s in api.sleeps)  # one jittered pause before the re-read


# --- The rest of a run ----------------------------------------------------------------------------------------------


def test_the_whole_milestone_1_run_completes_and_a_lost_final_response_is_already_applied(
    api: RunsApi, player_event: dict
) -> None:
    batch = [*TO_ACTIVITY, attempt(4, 3, "b"), save_prep(5, 4, credits=104), start_wave(6, 5, wave=2, credits=54)]
    assert results(send(api, player_event, batch)[1])[-1] == ("APPLIED", None)
    final = [complete_wave(7, 6, wave=2, credits=86)]

    status, body = send(api, player_event, final)

    assert status == 200 and results(body) == [("APPLIED", None)]
    run = run_item(api)
    assert run["status"] == "COMPLETED" and run["highestCompletedWave"] == 2
    assert "snapshot" not in run and "phase" not in run  # removed when the run ends (spine S3.1, S4)
    assert "snapshot" not in body["run"] and body["run"]["status"] == "COMPLETED"
    assert len(transacts(api)[-1]) == 2  # CHALLENGE: fence + RUN, PROFILE untouched (spine S3.2)
    profile = api.item("PROFILE")
    assert profile["planets"] == {} and profile["badges"] == {}

    status, body = send(api, player_event, final)  # F §11.2: the response to the final op was lost
    assert status == 200 and results(body) == [("ALREADY_APPLIED", None)]
    assert body["results"][0]["appliedRevision"] == 7

    status, body = send(api, player_event, [op(8, 7, "ABANDON")])
    assert results(body) == [("REJECTED", "RUN_TERMINAL")]


def test_defeat_and_abandon_end_the_run(api: RunsApi, player_event: dict) -> None:
    status, body = send(api, player_event, [save_prep(1, 0), start_wave(2, 1), op(3, 2, "DEFEAT", {"wave": 1})])
    assert status == 200 and results(body)[-1] == ("APPLIED", None)
    assert run_item(api)["status"] == "DEFEATED" and "snapshot" not in run_item(api)

    assert api.create(player_event, run_id=RUN_B)[0] == 201  # the same holder: generation 1 still
    status, body = send(api, player_event, [op(4, 0, "ABANDON")], run_id=RUN_B)
    assert status == 200 and results(body) == [("APPLIED", None)]
    assert api.item(f"RUN#{RUN_B}")["status"] == "ABANDONED"


def test_a_campaign_wave_raises_the_best_wave_on_the_profile_only_when_it_changes(
    api: RunsApi, player_event: dict
) -> None:
    api.set_run_fields(RUN_A, mode="CAMPAIGN")
    send(api, player_event, TO_ACTIVITY)
    assert len(transacts(api)[-1]) == 3  # fence, RUN, PROFILE
    assert api.item("PROFILE")["planets"] == {"luna-1": {"bestCompletedWave": 1}}
    condition = transacts(api)[-1][2]["Update"]["ConditionExpression"]
    assert condition == "attribute_exists(#pk)"

    api.raw.update_item(
        TableName="test-game",
        Key={"pk": {"S": PK}, "sk": {"S": "PROFILE"}},
        UpdateExpression="SET #p = :p",
        ExpressionAttributeNames={"#p": "planets"},
        ExpressionAttributeValues={":p": _ddb({"luna-1": {"bestCompletedWave": 2}})},
    )
    batch = [attempt(4, 3, "b"), start_wave(5, 4, wave=2), complete_wave(6, 5, wave=2)]
    status, body = send(api, player_event, batch)
    assert status == 200 and results(body)[-1] == ("APPLIED", None)
    # Best already 2, so `planets` is not written; but clearing the final wave earns the campaign badge (C12, Phase 52).
    update = transacts(api)[-1][2]["Update"]
    assert (
        "#planets" not in update["UpdateExpression"]
        and "campaign-luna-1" in update["ExpressionAttributeNames"].values()
    )
    assert api.item("PROFILE")["planets"] == {"luna-1": {"bestCompletedWave": 2}}
    run = run_item(api)
    assert run["phase"] == "COMPLETION_OFFER" and run["campaignCompletedAt"] == "2026-11-20T10:00:00Z"
    assert run["status"] == "IN_PROGRESS"


# --- The fence (b) and duplicates first (a) -------------------------------------------------------------------------


def test_a_stale_first_op_is_409_stale_session_with_results_and_the_run(api: RunsApi, player_event: dict) -> None:
    status, body = send(api, player_event, [save_prep(1, 0), start_wave(2, 1)], generation=0)

    assert status == 409
    assert body["error"]["code"] == "STALE_SESSION"
    assert body["error"]["requestId"] == player_event["requestContext"]["requestId"]
    assert body["results"] == [
        {"opId": op_id(1), "result": "STALE_SESSION"},
        {"opId": op_id(2), "result": "NOT_PROCESSED"},
    ]
    assert body["run"]["revision"] == 0
    assert transacts(api) == []


def test_a_resend_after_a_takeover_is_already_applied_not_stale(api: RunsApi, player_event: dict) -> None:
    """Why (a) comes first (G §5.3): the ops really were applied before another device took over."""
    batch = [save_prep(1, 0), start_wave(2, 1)]
    send(api, player_event, batch)
    api.set_session(generation=2, sessionId=OTHER_SESSION, runId=RUN_A, leaseExpiresAt="2026-11-20T10:03:00Z",
                    released=False, deviceLabel="Bedroom tablet", lastRenewedAt="2026-11-20T10:00:00Z")  # fmt: skip

    status, body = send(api, player_event, batch)
    assert status == 200 and [r["result"] for r in body["results"]] == ["ALREADY_APPLIED"] * 2

    status, body = send(api, player_event, [*batch, complete_wave(3, 2)])  # a new op after the duplicates
    assert status == 200  # not the first op: 200 with the per-op STALE_SESSION
    assert results(body) == [("ALREADY_APPLIED", None), ("ALREADY_APPLIED", None), ("STALE_SESSION", None)]


def test_a_duplicate_found_only_on_the_slot_still_counts(api: RunsApi, player_event: dict) -> None:
    """The attempt identity is permanent on the slot (F §8.4), even after recentOps has moved on."""
    send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "a")])
    api.set_run_fields(RUN_A, recentOps=[])

    status, body = send(api, player_event, [attempt(4, 3, "a")])

    assert status == 200
    assert body["results"] == [
        {
            "opId": op_id(4),
            "result": "ALREADY_APPLIED",
            "attempt": {"n": 1, "correct": False, "slotStatus": "UNRESOLVED", "rewardGranted": False},
        }
    ]
    assert len(api.item(SLOT)["attempts"]) == 1


def test_recent_ops_keeps_the_last_32(api: RunsApi, player_event: dict) -> None:
    for start in range(0, 40, 20):
        batch = [save_prep(100 + n, n, credits=100) for n in range(start, start + 20)]
        assert results(send(api, player_event, batch)[1])[-1] == ("APPLIED", None)
    recent = run_item(api)["recentOps"]
    assert len(recent) == RECENT_OPS == 32
    assert recent[0] == {"opId": op_id(108), "revision": 9} and recent[-1] == {"opId": op_id(139), "revision": 40}


# --- Step (i): retries ----------------------------------------------------------------------------------------------


CONFLICT = {
    "Error": {"Code": "TransactionCanceledException"},
    "CancellationReasons": [{"Code": "None"}, {"Code": "TransactionConflict"}],
}


def test_three_refused_transactions_stop_the_batch_with_503_and_what_landed(api: RunsApi, player_event: dict) -> None:
    send(api, player_event, [save_prep(1, 0)])
    api.ddb.transact_failures = [CONFLICT, CONFLICT, CONFLICT]

    status, body = send(api, player_event, [save_prep(1, 0), start_wave(2, 1), complete_wave(3, 2)])

    assert status == 503 and body["error"]["code"] == "THROTTLED"
    assert results(body) == [("ALREADY_APPLIED", None), ("NOT_PROCESSED", None), ("NOT_PROCESSED", None)]
    assert body["run"]["revision"] == 1
    assert len(api.sleeps) == 2 and all(0.02 <= s <= 0.1 for s in api.sleeps)
    assert [(line["result"], line.get("code")) for line in op_lines(api)[-2:]] == [
        ("ALREADY_APPLIED", None),
        ("NOT_PROCESSED", "THROTTLED"),
    ]


def test_every_retry_reads_again(api: RunsApi, player_event: dict) -> None:
    """A cancellation goes back to (a) with fresh reads (the review risk: a retry that reuses a stale read)."""
    api.ddb.transact_failures = [CONFLICT]
    status, body = send(api, player_event, [save_prep(1, 0)])
    assert status == 200 and results(body) == [("APPLIED", None)]
    names = api.ddb.names()
    first, second = names.index("transact_write_items"), len(names) - 1 - names[::-1].index("transact_write_items")
    assert first != second and "get_item" in names[first:second]


def test_a_revision_race_re_reads_and_answers_stale_revision(api: RunsApi, player_event: dict) -> None:
    api.ddb.before_transact = lambda: api.set_run_fields(RUN_A, revision=1)  # another writer got there first
    status, body = send(api, player_event, [save_prep(1, 0), start_wave(2, 1)])
    assert status == 200 and results(body) == [("REJECTED", "STALE_REVISION"), ("NOT_PROCESSED", None)]


def test_a_lease_lost_during_the_transaction_is_stale_session(api: RunsApi, player_event: dict) -> None:
    api.ddb.before_transact = lambda: api.set_session(generation=2, sessionId=OTHER_SESSION)
    status, body = send(api, player_event, [save_prep(1, 0)])
    assert status == 409 and body["error"]["code"] == "STALE_SESSION"
    assert run_item(api)["revision"] == 0


@pytest.mark.parametrize("name", ["g5-fence-lost", "g5-revision-raced", "g5-duplicate-race"])
def test_recorded_g5_refusals_lead_to_a_fresh_read(api: RunsApi, player_event: dict, name: str) -> None:
    """Whatever the recorded cancellation says, the op goes back to (a): one code path (F §12.3)."""
    send(api, player_event, TO_ACTIVITY)
    api.ddb.transact_failures = [recorded(name)]
    status, body = send(api, player_event, [attempt(4, 3, "b")])
    assert status == 200 and results(body) == [("APPLIED", "RESOLVED_SUCCEEDED")]
    assert len(api.sleeps) == 1


def test_an_unexpected_dynamodb_error_is_500_internal(api: RunsApi, player_event: dict) -> None:
    api.ddb.transact_failures = [{"Error": {"Code": "ValidationException"}}]
    status, body = send(api, player_event, [save_prep(1, 0)])
    assert status == 500 and body["error"]["code"] == "INTERNAL"
    assert api.sleeps == []


def test_jitter_is_20_to_100_ms() -> None:
    assert jitter_seconds(lambda: 0.0) == pytest.approx(0.02)
    assert jitter_seconds(lambda: 1.0) == pytest.approx(0.1)


# --- The transactions (F §12.3) -------------------------------------------------------------------------------------


def test_each_op_is_one_transaction_with_the_fence_first(api: RunsApi, player_event: dict) -> None:
    send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "a"), attempt(5, 4, "b")])
    shapes = [[next(iter(action)) for action in actions] for actions in transacts(api)]
    assert shapes == [
        ["ConditionCheck", "Update"],  # SAVE_PREP
        ["ConditionCheck", "Update"],  # START_WAVE
        ["ConditionCheck", "Update"],  # COMPLETE_WAVE (CHALLENGE, not final)
        ["ConditionCheck", "Update", "Update"],  # wrong attempt: + SLOT
        ["ConditionCheck", "Update", "Update", "Update"],  # resolving attempt: + SLOT + SUM#
    ]
    fence, run, slot, summary = transacts(api)[-1]
    assert fence["ConditionCheck"]["ConditionExpression"] == "#sessionId = :sessionId AND #generation = :generation"
    assert fence["ConditionCheck"]["Key"]["sk"] == {"S": "SESSION"}
    assert run["Update"]["ConditionExpression"] == "#revision = :expected"
    assert run["Update"]["ExpressionAttributeValues"][":expected"] == {"N": "4"}
    assert slot["Update"]["ConditionExpression"] == "attribute_exists(#pk) AND #status = :unresolved"
    assert summary["Update"]["Key"]["sk"] == {"S": SUM}
    assert "ConditionExpression" not in summary["Update"]
    assert run["Update"]["UpdateExpression"].startswith("SET #revision = :revision, #recentOps = :recentOps")


# --- VOID (F §4.4) --------------------------------------------------------------------------------------------------


def test_an_attempt_on_a_withdrawn_version_voids_the_slot_and_still_rewards(api: RunsApi, player_event: dict) -> None:
    send(api, player_event, TO_ACTIVITY)
    before = run_item(api)["snapshot"]["credits"]
    withdraw(api)

    status, body = send(api, player_event, [attempt(4, 3, "a")])

    assert status == 200 and results(body) == [("APPLIED", "VOIDED")]
    assert "attempt" not in body["results"][0]
    slot = api.item(SLOT)
    assert slot["status"] == "VOIDED" and slot["attempts"] == []  # no judging, no attempt counted
    assert run_item(api)["snapshot"]["credits"] == before + 30 and run_item(api)["phase"] == "BUILD"
    assert api.item(SUM) is None  # the learning summary is unchanged by VOID
    assert len(transacts(api)[-1]) == 3

    # An offline branch still holding the slot sends another attempt naming it: an APPLIED no-op (revision + 1).
    status, body = send(api, player_event, [attempt(5, 4, "b")])
    assert status == 200 and results(body) == [("APPLIED", "NO_OP_VOIDED_SLOT")]
    assert run_item(api)["revision"] == 5 and run_item(api)["snapshot"]["credits"] == before + 30
    assert len(transacts(api)[-1]) == 2


def test_a_missing_version_is_treated_as_withdrawn_and_logged_at_error(api: RunsApi, player_event: dict) -> None:
    send(api, player_event, TO_ACTIVITY)
    api.raw.delete_item(TableName=CONTENT_TABLE, Key=VERSION_KEY)
    status, body = send(api, player_event, [attempt(4, 3, "a")])
    assert status == 200 and results(body) == [("APPLIED", "VOIDED")]
    line = op_lines(api)[-1]
    assert line["level"] == "ERROR" and line["code"] == "VERSION_MISSING" and line["result"] == "APPLIED"


def test_deleting_the_pinned_activity_voids_its_slot_and_keeps_the_run(api: RunsApi, player_event: dict) -> None:
    """R31 (owner decision 2026-11-16): the operator deletes ph-0102 while this run, which pinned it, is in progress.
    The run view, the pack and the next attempt treat the missing pin like a withdrawn version: nothing fails, the
    slot is voided with its reward, and the run's progress is kept."""
    send(api, player_event, TO_ACTIVITY)
    before = run_item(api)
    admin = load_handler("admin_api")
    router = admin.make_router(admin.Deps(content=lambda: api.content), CapturedLogger())
    event = event_for(player_event, "DELETE /api/admin/activities/{id}", cognito__groups="[admin]")
    event["pathParameters"] = {"id": "ph-0102"}
    assert router.handle(event)["statusCode"] == 200
    assert api.content.get_item("ACT#ph-0102", "V#20261120T120000Z") is None

    status, view = api.call(player_event, "GET /api/runs/{runId}", run_id=RUN_A)
    assert status == 200 and view["currentSlot"]["withdrawn"] is True
    status, pack = api.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)
    assert status == 200 and pack["slots"][0]["withdrawn"] is True and "answerSpecification" not in pack["slots"][0]

    status, body = send(api, player_event, [attempt(4, 3, "b")])  # even the right answer: there is nothing to judge
    assert status == 200 and results(body) == [("APPLIED", "VOIDED")]
    after = run_item(api)
    assert after["snapshot"]["credits"] == before["snapshot"]["credits"] + 30 and after["phase"] == "BUILD"
    assert after["highestCompletedWave"] == before["highestCompletedWave"] and after["status"] == "IN_PROGRESS"
    assert api.item(SLOT)["status"] == "VOIDED" and api.item(SUM) is None


# --- Per-op rejections ----------------------------------------------------------------------------------------------


def test_a_bad_payload_is_a_per_op_rejection_after_the_ops_before_it(api: RunsApi, player_event: dict) -> None:
    status, body = send(api, player_event, [save_prep(1, 0), save_prep(2, 1, credits=-1), save_prep(3, 2)])
    assert status == 200
    assert results(body) == [("APPLIED", None), ("REJECTED", "VALIDATION_FAILED"), ("NOT_PROCESSED", None)]
    assert body["results"][1]["details"] == [{"field": "op.payload.credits", "rule": "minimum"}]
    assert run_item(api)["revision"] == 1


@pytest.mark.parametrize(
    ("placement", "problem"),
    [
        ({**NOVA_P04, "padId": "p99"}, {"field": "op.payload.placements[0].padId", "rule": "enum"}),
        ({**NOVA_P04, "classId": "pip"}, {"field": "op.payload.placements[0].classId", "rule": "enum"}),
        ({**NOVA_P04, "targeting": "CROWD"}, {"field": "op.payload.placements[0].targeting", "rule": "enum"}),
    ],
)
def test_placements_are_checked_against_the_pinned_bounds_file(
    api: RunsApi, player_event: dict, placement: dict, problem: dict
) -> None:
    status, body = send(api, player_event, [save_prep(1, 0, placements=[placement])])
    assert status == 200 and results(body) == [("REJECTED", "VALIDATION_FAILED")]
    assert body["results"][0]["details"] == [problem]


def test_an_op_in_the_wrong_phase_is_phase_mismatch_with_details(api: RunsApi, player_event: dict) -> None:
    _, body = send(api, player_event, [complete_wave(1, 0)])
    assert results(body) == [("REJECTED", "PHASE_MISMATCH")]
    assert body["results"][0]["details"] == {"phase": "BUILD", "wave": 1, "currentSlotId": None}

    send(api, player_event, TO_ACTIVITY)
    _, body = send(api, player_event, [save_prep(4, 3)])
    assert body["results"][0]["details"] == {"phase": "ACTIVITY", "wave": 2, "currentSlotId": "N-001"}


def test_unloadable_pins_refuse_every_op_except_abandon(api: RunsApi, player_event: dict) -> None:
    def unavailable(ruleset: str, campaign: str) -> dict:
        raise BoundsUnavailable("gone")

    api.bounds = unavailable
    status, body = send(api, player_event, [save_prep(1, 0)])
    assert status == 200 and results(body) == [("REJECTED", "CONTENT_VERSION_UNSUPPORTED")]
    status, body = send(api, player_event, [op(2, 0, "ABANDON")])
    assert status == 200 and results(body) == [("APPLIED", None)]
    assert run_item(api)["status"] == "ABANDONED"
    api.bounds = load_bounds_fixture


# --- Batch-level refusals (nothing processed) -----------------------------------------------------------------------


@pytest.mark.parametrize(
    ("body", "problem"),
    [
        (envelope([]), {"field": "body.ops", "rule": "minItems"}),
        (envelope([save_prep(n, n) for n in range(26)]), {"field": "body.ops", "rule": "maxItems"}),
        (envelope([op(1, 0, "CHOOSE_ENDLESS")]), {"field": "body.ops[0].type", "rule": "enum"}),
        (envelope([op(1, 0, "CREATE_RUN")]), {"field": "body.ops[0].type", "rule": "enum"}),
        (envelope([save_prep(1, 0)], unknownKey=1), {"field": "body", "rule": "additionalProperties"}),
        (envelope([{**save_prep(1, 0), "extra": 1}]), {"field": "body.ops[0]", "rule": "additionalProperties"}),
        (envelope([{**save_prep(1, 0), "opId": "not-a-uuid"}]), {"field": "body.ops[0].opId", "rule": "pattern"}),
        ({**envelope([save_prep(1, 0)]), "generation": -1}, {"field": "body.generation", "rule": "minimum"}),
    ],
)
def test_envelope_problems_are_400_before_any_op(api: RunsApi, player_event: dict, body: dict, problem: dict) -> None:
    status, answer = api.call(player_event, OPS, body, run_id=RUN_A)
    assert status == 400 and set(answer) == {"error"}
    assert answer["error"]["code"] == "VALIDATION_FAILED" and problem in answer["error"]["details"]
    assert "unknownKey" not in json.dumps(answer) and "extra" not in json.dumps(answer)  # key names are not echoed
    assert api.ddb.calls == []  # nothing read, nothing written


def test_size_and_json_are_checked_on_the_raw_body(api: RunsApi, player_event: dict) -> None:
    status, answer = api.call(player_event, OPS, raw="{" + " " * 65536 + "}", run_id=RUN_A)
    assert status == 400 and answer["error"]["details"] == [{"field": "body", "rule": "max_bytes"}]
    status, answer = api.call(player_event, OPS, raw="[1]", run_id=RUN_A)
    assert status == 400 and answer["error"]["details"] == [{"field": "body", "rule": "json"}]
    status, answer = api.call(player_event, OPS, envelope([save_prep(1, 0)]), run_id="not-a-uuid")
    assert status == 400 and answer["error"]["details"] == [{"field": "runId", "rule": "pattern"}]
    assert api.ddb.calls == []


def test_a_newer_protocol_version_is_409_protocol_unsupported(api: RunsApi, player_event: dict) -> None:
    status, answer = send(api, player_event, [save_prep(1, 0)], protocolVersion=2)
    assert status == 409 and set(answer) == {"error"} and answer["error"]["code"] == "PROTOCOL_UNSUPPORTED"
    assert api.ddb.calls == []


def test_another_players_run_is_not_found(api: RunsApi, player_event: dict) -> None:
    status, answer = api.call(player_event, OPS, envelope([save_prep(1, 0)]), run_id=RUN_A, sub=OTHER_SUB)
    assert status == 404 and set(answer) == {"error"} and answer["error"]["code"] == "NOT_FOUND"
    status, answer = send(api, player_event, [save_prep(1, 0)], run_id=RUN_B)
    assert status == 404 and answer["error"]["code"] == "NOT_FOUND"
    assert transacts(api) == []


# --- Logs (G §15) ---------------------------------------------------------------------------------------------------


def test_one_allow_listed_log_line_per_op_with_its_result(api: RunsApi, player_event: dict) -> None:
    api.clock.now = Clock("2026-11-20T10:00:05Z").now
    send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "d"), save_prep(5, 4), save_prep(6, 5)])
    lines = op_lines(api)
    assert [(line["type"], line["result"], line.get("code")) for line in lines] == [
        ("SAVE_PREP", "APPLIED", None),
        ("START_WAVE", "APPLIED", None),
        ("COMPLETE_WAVE", "APPLIED", None),
        ("SUBMIT_ATTEMPT", "APPLIED", None),
        ("SAVE_PREP", "REJECTED", "PHASE_MISMATCH"),
    ]  # the NOT_PROCESSED ops were never looked at, so they have no line
    for line in lines:
        assert line["runId"] == RUN_A and line["routeKey"] == OPS and line["generation"] == 1
        assert line["requestId"] == player_event["requestContext"]["requestId"]
        assert "droppedFields" not in line
    assert lines[3]["slotId"] == "N-001" and lines[3]["revision"] == 4
    request_line = api.logger.lines()[-1]
    assert request_line["routeKey"] == OPS and request_line["status"] == 200 and "opId" not in request_line
    text = "".join(api.logger.stream.getvalue())
    assert MY_SESSION not in text and '"d"' not in text and "answer" not in text


def test_the_ops_path_uses_only_get_item_and_transactions(api: RunsApi, player_event: dict) -> None:
    """Every write is fenced (a transaction), and every read is a GetItem: player-api's role allows GetItem, Query
    and the transaction's actions on `game`, not BatchGetItem (E.6.4)."""
    send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "b")])
    assert set(api.ddb.names()) == {"get_item", "transact_write_items"}


def test_a_placement_must_be_on_a_pad_of_the_wave_sets_map() -> None:
    """Gate M LD2: with per-set pads (schema 2), a pad of another map is refused at step (g), like an unknown pad."""
    from shared.ops import pinned_value_problems

    bounds = {
        "pads": {"p01": {"opensAfterWave": 0}, "z01": {"opensAfterWave": 0}},
        "classes": {"nova": {"levelCosts": [50, 60, 150], "targeting": ["FRONT", "FAST"]}},
        "waveSets": {"zig": {"classes": ["nova"], "pads": ["z01"]}, "old": {"classes": ["nova"]}},
    }

    def op(pad: str) -> dict:
        placement = {"padId": pad, "classId": "nova", "level": 1, "targeting": "FRONT"}
        return {"type": "SAVE_PREP", "payload": {"placements": [placement]}}

    assert pinned_value_problems(op("z01"), bounds, "zig") == []
    refused = [{"field": "op.payload.placements[0].padId", "rule": "enum"}]
    assert pinned_value_problems(op("p01"), bounds, "zig") == refused
    assert pinned_value_problems(op("p01"), bounds, "old") == []  # no per-set pads: any pad of the planet
