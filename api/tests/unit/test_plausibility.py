"""Phase 30: plausibility bounds (spine S6, F §6.1; M2-07).

The shared vectors (contracts/fixtures/plausibility/vectors.json, also read by plausibility.test.ts) pin the rules in
both languages; then the handler refuses a forged checkpoint with CHECKPOINT_OUT_OF_BOUNDS and applies nothing.
The property test over thousands of simulated legitimate waves is in web/game-core (the simulation is TypeScript).
"""

from __future__ import annotations

import json
from typing import Any

import pytest
from conftest import REPO
from runs_harness import RunsApi
from test_ops import (
    TO_ACTIVITY,
    attempt,
    complete_wave,
    op,
    op_id,
    results,
    run_item,
    save_prep,
    send,
    start_wave,
    transacts,
)

from shared.bounds import parse_bounds
from shared.plausibility import plausibility_problems, snapshot_value

VECTORS = json.loads((REPO / "contracts" / "fixtures" / "plausibility" / "vectors.json").read_text(encoding="utf-8"))


def test_the_vector_bounds_file_is_a_valid_bounds_file() -> None:
    assert parse_bounds(VECTORS["bounds"], "test", "test")["mechanics"] == 3


@pytest.mark.parametrize("vector", VECTORS["vectors"], ids=lambda v: v["name"])
def test_vector(vector: dict[str, Any]) -> None:
    assert plausibility_problems(VECTORS["bounds"], vector["run"], vector["op"]) == vector["problems"]


def test_value_is_credits_plus_cumulative_costs() -> None:
    bounds = VECTORS["bounds"]
    placements = [{"padId": "p01", "classId": "nova", "level": 3, "targeting": "FRONT"}]
    assert snapshot_value(bounds, 7, placements) == 7 + 260


# --- Through the handler ------------------------------------------------------------------------------------------


@pytest.fixture
def api(ddb: Any, player_event: dict) -> RunsApi:
    api = RunsApi(ddb)
    api.profile(player_event)
    assert api.create(player_event)[0] == 201
    api.ddb.calls.clear()
    return api


def test_a_forged_complete_wave_with_extra_credits_is_out_of_bounds(api: RunsApi, player_event: dict) -> None:
    # The Milestone 1 run: 150 credits; wave 1 offers 24 credits. Two Novas (100) and 50 credits at the wave start.
    status, body = send(api, player_event, [save_prep(1, 0), start_wave(2, 1)])
    assert results(body) == [("APPLIED", None), ("APPLIED", None)]
    before = run_item(api)
    calls = len(transacts(api))

    status, body = send(api, player_event, [complete_wave(3, 2, credits=75), complete_wave(4, 2, credits=74)])
    assert status == 200
    assert body["results"][0] == {
        "opId": op_id(3),
        "result": "REJECTED",
        "code": "CHECKPOINT_OUT_OF_BOUNDS",
        "details": [{"field": "op.payload.credits", "rule": "value"}],
    }
    assert body["results"][1]["result"] == "NOT_PROCESSED"  # the first REJECTED stops the batch
    assert run_item(api)["revision"] == before["revision"] and len(transacts(api)) == calls  # nothing written

    status, body = send(api, player_event, [complete_wave(4, 2, credits=74)])  # exactly 24 more: allowed
    assert results(body) == [("APPLIED", None)]


def test_preparation_cannot_add_value_and_powers_cannot_appear(api: RunsApi, player_event: dict) -> None:
    _, body = send(api, player_event, [save_prep(1, 0, credits=101)])  # 101 + 50 > 150
    assert results(body) == [("REJECTED", "CHECKPOINT_OUT_OF_BOUNDS")]
    send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "b")])  # +30 learning reward: 104 + 100 = 204
    _, body = send(api, player_event, [save_prep(5, 4, credits=154)])  # 154 + 50 = 204: the reward is spendable
    assert results(body) == [("APPLIED", None)]
    payload = {
        "wave": 2,
        "credits": 154,
        "placements": [{"padId": "p04", "classId": "nova", "level": 1, "targeting": "FRONT"}],
        "colony": {"health": 20, "shield": 0},
        "powers": {"frost-pulse": 1},
    }
    send(api, player_event, [start_wave(6, 5, wave=2, credits=104)])
    _, body = send(api, player_event, [op(7, 6, "COMPLETE_WAVE", payload)])
    assert results(body) == [("REJECTED", "CHECKPOINT_OUT_OF_BOUNDS")]
    assert body["results"][0]["details"] == [{"field": "op.payload.powers.frost-pulse", "rule": "power"}]
    assert run_item(api)["phase"] == "IN_WAVE"
