"""G5 (apply one op) against DynamoDB Local (Phase 17, gate G-13; ADR-0021). CI only.

The ops route's transaction (ConditionCheck SESSION + Update RUN [+ SLOT] [+ SUM#] [+ PROFILE]) is run for real:

- a whole Milestone 1 activity applied in DynamoDB Local, then the same batch replayed (ALREADY_APPLIED, no writes);
- the same batch sent twice at the same moment from two threads (the duplicate-delivery race of spine S7.1): every op
  lands exactly once and the reward is granted once;
- three refusals made real by changing the table between the handler's reads and its transaction. Their shapes,
  reduced as test_g7_ddblocal.py reduces them, are compared with the recorded files in api/tests/fixtures/ddb/
  (g5-*.json), which test_ops.py feeds to the handler on moto. Record with DDB_FIXTURES_RECORD=1, as for G7.
"""

from __future__ import annotations

import copy
import json
import os
import threading
from typing import Any

import pytest
import test_g7_ddblocal as g7
from test_g7_ddblocal import DDB_FIXTURES, MY_SESSION, OTHER_HOLDER, RECORD_ENV, RUN_A, Harness, create_body

OPS = "POST /api/runs/{runId}/ops"
NOVA = [{"padId": "p04", "classId": "nova", "level": 1, "targeting": "FRONT"}]
SOURCE = "DynamoDB Local (CI service container, see .github/workflows/ci.yml)"


def op_id(n: int) -> str:
    return f"00000000-0000-4000-8000-{n:012d}"


def op(n: int, revision: int, type_: str, payload: dict[str, Any]) -> dict[str, Any]:
    return {"opId": op_id(n), "expectedRevision": revision, "type": type_, "payload": payload,
            "clientTime": "2026-11-20T10:01:00Z"}  # fmt: skip


SNAPSHOT = {"placements": NOVA, "colony": {"health": 20, "shield": 0}, "powers": {}}
TO_ACTIVITY = [
    op(1, 0, "SAVE_PREP", {"credits": 100, "placements": NOVA}),
    op(2, 1, "START_WAVE", {"wave": 1, "credits": 100, "placements": NOVA}),
    op(3, 2, "COMPLETE_WAVE", {"wave": 1, "credits": 124, **SNAPSHOT}),
]


def wrong(n: int, revision: int) -> dict[str, Any]:
    return op(n, revision, "SUBMIT_ATTEMPT", {"slotId": "N-001", "answer": "a"})


def right(n: int, revision: int) -> dict[str, Any]:
    return op(n, revision, "SUBMIT_ATTEMPT", {"slotId": "N-001", "answer": "b"})


def send(h: Harness, ops: list[dict[str, Any]], generation: int = 1) -> tuple[int, Any]:
    event = copy.deepcopy(h.event)
    event["routeKey"] = event["requestContext"]["routeKey"] = OPS
    event["pathParameters"] = {"runId": RUN_A}
    event["body"] = json.dumps({"protocolVersion": 1, "sessionId": MY_SESSION, "generation": generation, "ops": ops})
    response = h.router.handle(event)
    return response["statusCode"], json.loads(response["body"])


def outcomes(body: dict[str, Any]) -> list[tuple[str, str | None]]:
    return [(r["result"], r.get("code") or r.get("outcome")) for r in body["results"]]


def ready(h: Harness) -> None:
    """A profile, the M1 run (MY_SESSION holds the lease at generation 1), played to its activity."""
    h.profile()
    assert h.call("POST /api/runs", create_body())[0] == 201
    status, body = send(h, TO_ACTIVITY)
    assert status == 200 and [r["result"] for r in body["results"]] == ["APPLIED"] * 3


# --- Scenarios: plain functions of a Harness, so the same steps record the files from any DynamoDB --------------------


def scenario_applied_and_replayed(h: Harness) -> None:
    ready(h)
    batch = [wrong(4, 3), right(5, 4)]
    status, first = send(h, batch)
    assert status == 200 and outcomes(first) == [("APPLIED", "INCORRECT"), ("APPLIED", "RESOLVED_SUCCEEDED")]
    run, slot = h.get(f"RUN#{RUN_A}"), h.get(f"SLOT#{RUN_A}#N-001")
    assert run["revision"] == 5 and run["phase"] == "BUILD" and run["snapshot"]["credits"] == 154
    assert slot["status"] == "SUCCEEDED" and [a["attemptId"] for a in slot["attempts"]] == [op_id(4), op_id(5)]
    summary = h.get("SUM#phonics#phonics-gpc-consonant-digraphs")
    assert (summary["completed"], summary["succeeded"], summary["failed"]) == (1, 1, 0)

    transactions = h.recorder.transactions
    status, replay = send(h, batch)
    assert status == 200 and [r["result"] for r in replay["results"]] == ["ALREADY_APPLIED"] * 2
    assert replay["results"][1]["attempt"] == first["results"][1]["attempt"]
    assert h.recorder.transactions == transactions and h.get(f"RUN#{RUN_A}") == run


def scenario_concurrent_duplicates(h: Harness) -> None:
    """The same batch delivered twice at once. Whatever the interleaving, nothing lands twice."""
    ready(h)
    batch = [wrong(4, 3), wrong(5, 4), right(6, 5)]
    barrier = threading.Barrier(2)
    answers: list[tuple[int, Any]] = []

    def deliver() -> None:
        barrier.wait()
        answers.append(send(h, batch))

    threads = [threading.Thread(target=deliver) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=60)
    assert len(answers) == 2
    for status, body in answers:
        assert status in (200, 503), body  # 503 THROTTLED only if one op lost three races in a row
        assert {r["result"] for r in body["results"]} <= {"APPLIED", "ALREADY_APPLIED", "NOT_PROCESSED"}
    for index in range(len(batch)):
        applied = [body["results"][index]["result"] for _, body in answers].count("APPLIED")
        assert applied <= 1, f"op {index} applied twice"
    run, slot = h.get(f"RUN#{RUN_A}"), h.get(f"SLOT#{RUN_A}#N-001")
    landed = [entry["opId"] for entry in run["recentOps"]]
    assert len(landed) == len(set(landed))
    assert len(slot["attempts"]) == len({a["attemptId"] for a in slot["attempts"]})
    if run["revision"] == 6:  # both batches finished: the reward exactly once
        assert slot["status"] == "SUCCEEDED" and run["snapshot"]["credits"] == 154
        assert h.get("SUM#phonics#phonics-gpc-consonant-digraphs")["succeeded"] == 1


def scenario_fence_lost(h: Harness) -> dict[str, Any]:
    """Another device takes the lease between the handler's reads and its transaction: reason 0 (SESSION)."""
    ready(h)
    h.recorder.before = lambda: h.put("SESSION", **{**OTHER_HOLDER, "generation": 2})
    status, body = send(h, [wrong(4, 3)])
    assert status == 409 and body["error"]["code"] == "STALE_SESSION"
    assert outcomes(body) == [("STALE_SESSION", None)] and body["run"]["revision"] == 3
    assert h.get(f"SLOT#{RUN_A}#N-001")["attempts"] == []
    return h.recorder.refusals[0]


def scenario_revision_raced(h: Harness) -> dict[str, Any]:
    """Another writer moves the run on first: reason 1 (RUN). The re-read answers STALE_REVISION."""
    ready(h)

    def bump() -> None:
        h.client.update_item(
            TableName=h.game,
            Key={"pk": {"S": h.pk}, "sk": {"S": f"RUN#{RUN_A}"}},
            UpdateExpression="SET #r = :r",
            ExpressionAttributeNames={"#r": "revision"},
            ExpressionAttributeValues={":r": {"N": "4"}},
        )

    h.recorder.before = bump
    status, body = send(h, [wrong(4, 3)])
    assert status == 200 and outcomes(body) == [("REJECTED", "STALE_REVISION")]
    assert h.get(f"SLOT#{RUN_A}#N-001")["attempts"] == []
    return h.recorder.refusals[0]


def scenario_duplicate_race(h: Harness) -> dict[str, Any]:
    """The same resolving attempt lands first through another delivery: the loser's RUN and SLOT conditions fail,
    and its re-read answers ALREADY_APPLIED. The reward is granted once."""
    ready(h)
    winner: list[tuple[int, Any]] = []
    h.recorder.before = lambda: winner.append(send(h, [right(4, 3)]))
    status, body = send(h, [right(4, 3)])
    assert outcomes(winner[0][1]) == [("APPLIED", "RESOLVED_SUCCEEDED")]
    assert status == 200 and outcomes(body) == [("ALREADY_APPLIED", None)]
    assert body["results"][0]["attempt"]["rewardGranted"] is True
    assert h.get(f"RUN#{RUN_A}")["snapshot"]["credits"] == 154
    return h.recorder.refusals[0]


SCENARIOS = {
    "g5-fence-lost": scenario_fence_lost,
    "g5-revision-raced": scenario_revision_raced,
    "g5-duplicate-race": scenario_duplicate_race,
}


def check_recorded(name: str, observed: dict[str, Any], source: str) -> None:
    path = DDB_FIXTURES / f"{name}.json"
    if os.environ.get(RECORD_ENV) == "1":
        comment = f"Recorded by api/tests/integration/test_g5.py, scenario {name}; see README.md here."
        path.write_text(json.dumps({"$comment": comment, "source": source, **observed}, indent=2) + "\n")
        return
    recorded = json.loads(path.read_text())
    expected = {key: recorded[key] for key in ("Error", "CancellationReasons", "Item") if key in recorded}
    if expected != observed:
        pytest.fail(
            f"{path.name} differs from what DynamoDB returned. Observed (set {RECORD_ENV}=1 to record):\n"
            + json.dumps(observed, indent=2)
        )


# --- The ddblocal tests --------------------------------------------------------------------------------------------

content_table = g7.content_table  # test_g7_ddblocal.py's fixtures, shared by name
harness = g7.harness


@pytest.mark.ddblocal
def test_g5_applies_an_activity_and_a_replay_writes_nothing(harness: Harness) -> None:
    scenario_applied_and_replayed(harness)


@pytest.mark.ddblocal
def test_g5_the_same_batch_sent_twice_at_once_lands_once(harness: Harness) -> None:
    scenario_concurrent_duplicates(harness)


@pytest.mark.ddblocal
@pytest.mark.parametrize("name", sorted(SCENARIOS))
def test_g5_refusal_is_handled_and_matches_the_recorded_shape(harness: Harness, name: str) -> None:
    observed = SCENARIOS[name](harness)
    check_recorded(name, observed, source=SOURCE)
