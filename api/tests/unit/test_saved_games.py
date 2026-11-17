"""Phase 32: saved games (M2-12; G §4 R7, §8; spine S8.1 G9; F §12.8).

R7 lists the caller's open or finished runs, newest first, in pages with an opaque cursor; the soft cap of five open
runs is tested in test_runs.py (RUN_LIMIT_REACHED). The G9 prune keeps the 50 most recently ended runs: when an op
ends the 51st, the oldest ended run goes, its slots first and its RUN item last, and a prune that fails never changes
the op's answer.
"""

from __future__ import annotations

from typing import Any

import pytest
from botocore.exceptions import ClientError
from runs_harness import PK, RUN_A, RunsApi, _ddb
from test_ops import op, results, send

from shared.prune import runs_to_prune
from shared.runlist import decode_cursor, encode_cursor

RUNS = "GET /api/runs"


@pytest.fixture
def api(ddb: Any, player_event: dict) -> RunsApi:
    api = RunsApi(ddb)
    api.profile(player_event)
    assert api.create(player_event)[0] == 201
    return api


def put_run(api: RunsApi, run_id: str, status: str, last_played: str, *, slots: int = 0) -> None:
    """A stored run (cloned from RUN_A's item) with `slots` slot items, for list and prune tests."""
    base = api.item(f"RUN#{RUN_A}")
    assert base is not None
    item = {k: v for k, v in base.items() if k not in ("phase", "snapshot")} if status != "IN_PROGRESS" else dict(base)
    item.update({"sk": f"RUN#{run_id}", "status": status, "lastPlayedAt": last_played})
    api.raw.put_item(TableName="test-game", Item={k: _ddb(v) for k, v in item.items()})
    for n in range(1, slots + 1):
        slot = {"pk": PK, "sk": f"SLOT#{run_id}#N-{n:03d}", "slotId": f"N-{n:03d}", "status": "SUCCEEDED"}
        api.raw.put_item(TableName="test-game", Item={k: _ddb(v) for k, v in slot.items()})


def run_id(n: int) -> str:
    return f"00000000-0000-4000-a000-{n:012d}"


# --- R7 -------------------------------------------------------------------------------------------------------------


def test_open_and_finished_runs_are_listed_apart_newest_first(api: RunsApi, player_event: dict) -> None:
    put_run(api, run_id(1), "DEFEATED", "2026-11-18T09:00:00Z")
    put_run(api, run_id(2), "COMPLETED", "2026-11-19T09:00:00Z")
    put_run(api, run_id(3), "IN_PROGRESS", "2026-11-21T09:00:00Z")
    status, body = api.call(player_event, RUNS, query={"state": "open"})
    assert status == 200 and body["nextCursor"] is None
    assert [r["runId"] for r in body["items"]] == [run_id(3), RUN_A]
    assert set(body["items"][0]) >= {"runId", "planetId", "waveSetId", "mode", "status", "wave", "playable"}
    status, body = api.call(player_event, RUNS, query={"state": "done"})
    assert [(r["runId"], r["status"]) for r in body["items"]] == [(run_id(2), "COMPLETED"), (run_id(1), "DEFEATED")]
    assert "snapshot" not in body["items"][0]  # a summary, not a view


def test_pages_follow_the_cursor_to_the_end(api: RunsApi, player_event: dict) -> None:
    for n in range(1, 8):
        put_run(api, run_id(n), "ABANDONED", f"2026-11-1{n}T09:00:00Z")
    seen: list[str] = []
    query = {"state": "done", "limit": "3"}
    while True:
        status, body = api.call(player_event, RUNS, query=query)
        assert status == 200 and len(body["items"]) <= 3
        seen += [r["runId"] for r in body["items"]]
        if body["nextCursor"] is None:
            break
        query = {"state": "done", "limit": "3", "cursor": body["nextCursor"]}
    assert seen == [run_id(n) for n in range(7, 0, -1)]


@pytest.mark.parametrize(
    ("query", "field"),
    [
        ({}, "state"),
        ({"state": "all"}, "state"),
        ({"state": "open", "limit": "0"}, "limit"),
        ({"state": "open", "limit": "51"}, "limit"),
        ({"state": "open", "limit": "ten"}, "limit"),
        ({"state": "open", "cursor": "not base64 json"}, "cursor"),
        ({"state": "open", "cursor": encode_cursor("done", 3)}, "cursor"),  # made for the other state
    ],
)
def test_bad_queries_are_400_naming_the_field(api: RunsApi, player_event: dict, query: dict, field: str) -> None:
    status, body = api.call(player_event, RUNS, query=query)
    assert status == 400 and body["error"]["code"] == "VALIDATION_FAILED"
    assert body["error"]["details"][0]["field"] == field


def test_the_cursor_is_opaque_and_checked() -> None:
    assert decode_cursor(encode_cursor("done", 20), "done") == 20
    assert "{" not in encode_cursor("done", 20)  # base64url, not readable JSON


def test_no_profile_is_404(ddb: Any, player_event: dict) -> None:
    status, body = RunsApi(ddb).call(player_event, RUNS, query={"state": "open"})
    assert (status, body["error"]["code"]) == (404, "PROFILE_NOT_FOUND")


# --- G9 prune -------------------------------------------------------------------------------------------------------


def test_runs_to_prune_keeps_the_newest_ended_runs() -> None:
    runs = [{"sk": f"RUN#r{n}", "status": "COMPLETED", "lastPlayedAt": f"2026-11-{n:02d}"} for n in range(1, 6)]
    runs.append({"sk": "RUN#open", "status": "IN_PROGRESS", "lastPlayedAt": "2026-10-01"})
    assert runs_to_prune(runs, keep=3) == ["r1", "r2"]  # oldest first; an open run is never pruned
    assert runs_to_prune(runs, keep=50) == []


def test_ending_the_51st_run_prunes_the_oldest_with_its_slots(api: RunsApi, player_event: dict) -> None:
    for n in range(1, 51):
        put_run(api, run_id(n), "COMPLETED", f"2026-10-{1 + n // 2:02d}T{n % 24:02d}:00:00Z", slots=2 if n == 1 else 0)
    assert len(api.items(f"SLOT#{run_id(1)}#")) == 2
    status, body = send(api, player_event, [op(1, 0, "ABANDON")])  # RUN_A ends: 51 ended runs
    assert status == 200 and results(body) == [("APPLIED", None)]
    assert api.item(f"RUN#{run_id(1)}") is None and api.items(f"SLOT#{run_id(1)}#") == []
    assert api.item(f"RUN#{run_id(2)}") is not None and api.item(f"RUN#{RUN_A}") is not None
    assert len([r for r in api.items("RUN#") if r["status"] != "IN_PROGRESS"]) == 50
    assert any(line.get("code") == "PRUNED" and line.get("pruned") == 1 for line in api.logger.lines())


def test_a_failed_prune_never_changes_the_op_result(api: RunsApi, player_event: dict) -> None:
    for n in range(1, 51):
        put_run(api, run_id(n), "COMPLETED", f"2026-10-{1 + n // 2:02d}T{n % 24:02d}:00:00Z", slots=1)

    def refuse(**_: Any) -> Any:
        raise ClientError({"Error": {"Code": "InternalServerError", "Message": "x"}}, "BatchWriteItem")

    api.ddb.batch_write_item = refuse  # type: ignore[method-assign]
    status, body = send(api, player_event, [op(1, 0, "ABANDON")])
    assert status == 200 and results(body) == [("APPLIED", None)]
    assert api.item(f"RUN#{RUN_A}")["status"] == "ABANDONED"
    assert api.item(f"RUN#{run_id(1)}") is not None  # the RUN item goes last, so nothing is half-deleted
    assert any(
        line.get("code") == "PRUNE_FAILED" and line.get("errorType") == "ClientError" for line in api.logger.lines()
    )
