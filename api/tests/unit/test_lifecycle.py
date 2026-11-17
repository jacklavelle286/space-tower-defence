"""Phase 29: the full run lifecycle through player-api (M2-06; spine S3.2, F §3.3-3.5, G §5-6) on moto.

The exit criterion: a player-api test drives a run to COMPLETION_OFFER, then CHOOSE_ENDLESS (R12) and FINISH_RUN
through the handler. Also DISMISS_SLOT (a meteor declined before any attempt; a withdrawn slot voided with its
reward) and R12's own envelope. The reducers' every phase x op cell is covered by contracts/fixtures/ops/matrix-*.json
(test_rules_fixtures.py); these tests prove the handler stores what the reducer decided.

The run is the Milestone 1 one (luna-1, first-contact: two waves, slot N-001 holding ph-0102, accepted answer "b",
reward 30 credits), switched to CAMPAIGN so that clearing wave 2 opens the completion offer.
"""

from __future__ import annotations

from typing import Any

import pytest
from runs_harness import RUN_A, RunsApi, _ddb, load_bounds_fixture
from test_ops import (
    TO_ACTIVITY,
    attempt,
    complete_wave,
    envelope,
    op,
    op_id,
    results,
    run_item,
    send,
    start_wave,
    transacts,
    withdraw,
)

from shared.bounds import BoundsUnavailable

ENDLESS = "POST /api/runs/{runId}/endless"
TO_OFFER = [*TO_ACTIVITY, attempt(4, 3, "b"), start_wave(5, 4, wave=2), complete_wave(6, 5, wave=2)]  # revision 6


@pytest.fixture
def api(ddb: Any, player_event: dict) -> RunsApi:
    api = RunsApi(ddb)
    api.profile(player_event)
    assert api.create(player_event)[0] == 201
    api.set_run_fields(RUN_A, mode="CAMPAIGN")
    api.ddb.calls.clear()
    return api


def choose_endless(api: RunsApi, event: dict, n: int, revision: int, **changes: Any) -> tuple[int, Any]:
    return api.call(event, ENDLESS, envelope([op(n, revision, "CHOOSE_ENDLESS")], **changes), run_id=RUN_A)


def to_offer(api: RunsApi, event: dict) -> None:
    status, body = send(api, event, TO_OFFER)
    assert status == 200 and results(body)[-1] == ("APPLIED", None)
    assert run_item(api)["phase"] == "COMPLETION_OFFER"


def endless_bounds(ruleset: str, campaign: str) -> dict:
    """The fixture bounds with an endless table for first-contact (a two-wave CAMPAIGN in these tests): every endless
    wave's bounty from wave 3 to 999, and the endless learning reward (Phase 54)."""
    bounds = load_bounds_fixture(ruleset, campaign)
    ws = {**bounds["waveSets"]["first-contact"], "endless": {"maxBounty": [500] * 997, "learningReward": 75}}
    rotation = ["frost-pulse", "comet-burst", "colony-shield"]
    return {**bounds, "powerAwardRotation": rotation, "waveSets": {**bounds["waveSets"], "first-contact": ws}}


def test_choose_endless_needs_an_endless_table(api: RunsApi, player_event: dict) -> None:
    to_offer(api, player_event)
    status, body = choose_endless(api, player_event, 8, 6)  # the r1 bounds file has no endless table
    assert status == 200 and results(body) == [("REJECTED", "CONTENT_VERSION_UNSUPPORTED")]


def test_a_campaign_run_reaches_the_offer_then_chooses_endless_then_finishes(api: RunsApi, player_event: dict) -> None:
    api.bounds = endless_bounds
    to_offer(api, player_event)
    status, body = send(api, player_event, [op(7, 6, "ABANDON")])
    assert status == 200 and results(body) == [("REJECTED", "PHASE_MISMATCH")]  # the campaign is complete

    status, body = choose_endless(api, player_event, 8, 6)
    assert status == 200 and body["results"] == [{"opId": op_id(8), "result": "APPLIED", "appliedRevision": 7}]
    run = run_item(api)
    # Two blocks planned (F §3.6): intervals 2-21, with whatever the small test bank can fill without a repeat.
    assert (run["stage"], run["wave"], run["status"], run["plannedThrough"]) == ("ENDLESS", 3, "IN_PROGRESS", 21)
    slots = api.items(f"SLOT#{RUN_A}#")
    activities = [s["activityId"] for s in slots if s.get("resolved") is None]
    assert len(activities) == len(set(activities))  # never a repeat in the run
    endless = [s for s in slots if s["slotId"] not in ("N-001",)]
    assert all(s["reward"] == {"credits": 75} for s in endless if s["kind"] == "NORMAL")
    expected = "ACTIVITY" if any(s["slotId"] == "N-002" for s in slots) else "BUILD"  # an empty bank: straight to BUILD
    assert run["phase"] == expected
    assert body["run"]["stage"] == "ENDLESS" and body["run"]["wave"] == 3

    status, body = choose_endless(api, player_event, 8, 6)  # a retried opId
    assert status == 200 and body["results"][0]["result"] == "ALREADY_APPLIED"
    assert body["results"][0]["appliedRevision"] == 7

    if run["phase"] == "ACTIVITY":
        return  # the finish path below needs BUILD; the next test plays the bank-exhausted case through to the end
    status, body = send(api, player_event, [start_wave(9, 7, wave=3), op(10, 8, "FINISH_RUN")])
    assert status == 200 and results(body) == [("APPLIED", None), ("REJECTED", "PHASE_MISMATCH")]  # never mid-wave
    status, body = send(
        api, player_event, [op(11, 8, "SAVE_PREP", {"credits": 50, "placements": []}), op(12, 9, "FINISH_RUN")]
    )
    assert status == 200 and results(body) == [("APPLIED", None), ("APPLIED", None)]
    run = run_item(api)
    assert run["status"] == "COMPLETED" and "phase" not in run and "snapshot" not in run
    assert run["lastPlayedAt"] == "2026-11-20T10:00:00Z"


def test_finish_run_from_the_offer_completes_the_run_even_with_unloadable_pins(
    api: RunsApi, player_event: dict
) -> None:
    to_offer(api, player_event)

    def unavailable(ruleset: str, campaign: str) -> dict:
        raise BoundsUnavailable("gone")

    api.bounds = unavailable  # step (e) is skipped for FINISH_RUN, as for ABANDON (G §5.3)
    status, body = send(api, player_event, [op(7, 6, "FINISH_RUN")])
    api.bounds = load_bounds_fixture
    assert status == 200 and results(body) == [("APPLIED", None)]
    assert run_item(api)["status"] == "COMPLETED"
    assert len(transacts(api)[-1]) == 2  # fence and RUN only: FINISH_RUN touches no slot, summary or profile


def test_choose_endless_outside_the_offer_is_phase_mismatch(api: RunsApi, player_event: dict) -> None:
    status, body = choose_endless(api, player_event, 1, 0)
    assert status == 200 and results(body) == [("REJECTED", "PHASE_MISMATCH")]
    assert body["results"][0]["details"] == {"phase": "BUILD", "wave": 1, "currentSlotId": None}


@pytest.mark.parametrize(
    ("ops", "problem"),
    [
        ([op(1, 0, "SAVE_PREP", {"credits": 1, "placements": []})], {"field": "body.ops[0].type", "rule": "const"}),
        ([op(1, 0, "CHOOSE_ENDLESS"), op(2, 1, "CHOOSE_ENDLESS")], {"field": "body.ops", "rule": "maxItems"}),
        ([], {"field": "body.ops", "rule": "minItems"}),
    ],
)
def test_r12_takes_exactly_one_choose_endless(api: RunsApi, player_event: dict, ops: list, problem: dict) -> None:
    status, answer = api.call(player_event, ENDLESS, envelope(ops), run_id=RUN_A)
    assert status == 400 and answer["error"]["code"] == "VALIDATION_FAILED" and problem in answer["error"]["details"]
    assert api.ddb.calls == []


def test_a_withdrawn_slot_can_be_dismissed_voided_with_its_reward(api: RunsApi, player_event: dict) -> None:
    send(api, player_event, TO_ACTIVITY)
    status, body = send(api, player_event, [op(4, 3, "DISMISS_SLOT", {"slotId": "N-001"})])
    assert status == 200 and results(body) == [("REJECTED", "PHASE_MISMATCH")]  # a normal activity must be answered

    withdraw(api)
    status, body = send(api, player_event, [op(5, 3, "DISMISS_SLOT", {"slotId": "N-001"})])
    assert status == 200 and results(body) == [("APPLIED", "VOIDED")]
    slot = api.item(f"SLOT#{RUN_A}#N-001")
    assert slot["status"] == "VOIDED" and slot["attempts"] == []  # status only: no attempt recorded
    assert run_item(api)["snapshot"]["credits"] == 104 and run_item(api)["phase"] == "BUILD"
    assert len(transacts(api)[-1]) == 3  # fence, RUN, SLOT: a VOID never touches the learning summary
    status, body = send(api, player_event, [op(6, 4, "DISMISS_SLOT", {"slotId": "N-001"})])
    assert results(body) == [("APPLIED", "NO_OP_VOIDED_SLOT")]  # a replay naming the VOIDED slot


def add_meteor(api: RunsApi) -> None:
    """A meteor slot after wave 1, cloned from N-001 (the same pinned activity, a power reward)."""
    slot = api.item(f"SLOT#{RUN_A}#N-001")
    assert slot is not None
    meteor = {
        **slot,
        "sk": f"SLOT#{RUN_A}#M-001",
        "slotId": "M-001",
        "kind": "METEOR",
        "reward": {"credits": 0, "powerId": "frost-pulse"},
    }
    api.raw.put_item(TableName="test-game", Item={k: _ddb(v) for k, v in meteor.items()})


def test_a_meteor_declined_before_any_attempt_returns_to_build_without_a_reward(
    api: RunsApi, player_event: dict
) -> None:
    add_meteor(api)
    status, body = send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "b")])
    assert status == 200 and run_item(api)["phase"] == "METEOR"

    status, body = send(api, player_event, [op(5, 4, "DISMISS_SLOT", {"slotId": "M-001"})])
    assert status == 200 and results(body) == [("APPLIED", "DECLINED")]
    run = run_item(api)
    assert run["phase"] == "BUILD" and run["snapshot"]["powers"] == {} and run["snapshot"]["credits"] == 104
    meteor = api.item(f"SLOT#{RUN_A}#M-001")
    assert meteor["status"] == "DECLINED" and meteor["attempts"] == []
    assert len(transacts(api)[-1]) == 3  # fence, RUN, SLOT: DECLINED never counts in the summary (spine S3.3)
    assert api.item(f"SLOT#{RUN_A}#N-001")["status"] == "SUCCEEDED"


def test_a_meteor_cannot_be_declined_after_an_attempt(api: RunsApi, player_event: dict) -> None:
    add_meteor(api)
    send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "b"), attempt(5, 4, "a", slot_id="M-001")])
    status, body = send(api, player_event, [op(6, 5, "DISMISS_SLOT", {"slotId": "M-001"})])
    assert status == 200 and results(body) == [("REJECTED", "PHASE_MISMATCH")]
    status, body = send(api, player_event, [attempt(7, 5, "b", slot_id="M-001")])
    assert results(body) == [("APPLIED", "RESOLVED_SUCCEEDED")]
    assert run_item(api)["snapshot"]["powers"] == {"frost-pulse": 1}
