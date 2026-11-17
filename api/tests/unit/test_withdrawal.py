"""Phase 44: withdrawal and VOID (M3-09; F §4.4; spine S3.3; owner decision D-9).

A withdrawn pinned version voids the slot: no judging, the reward exactly once, the learning summary unchanged, the
phase moves on. Only an UNRESOLVED slot is voided: one the child already resolved stays as recorded (D-9). Every VOID is
logged with code VOIDED and its slotId (the audit trail of a withdrawal reaching a run). The reducers' cells are in
contracts/fixtures/ops/m1-void-withdrawn.json and matrix-dismiss-withdrawn.json.
"""

from __future__ import annotations

from typing import Any

import pytest
from runs_harness import RunsApi
from test_ops import SLOT, SUM, TO_ACTIVITY, attempt, op, op_lines, results, run_item, send, withdraw


@pytest.fixture
def api(ddb: Any, player_event: dict) -> RunsApi:
    api = RunsApi(ddb)
    api.profile(player_event)
    assert api.create(player_event)[0] == 201
    return api


def test_dismissing_a_withdrawn_slot_voids_it_once_and_logs_the_void(api: RunsApi, player_event: dict) -> None:
    send(api, player_event, TO_ACTIVITY)
    credits = run_item(api)["snapshot"]["credits"]
    withdraw(api)
    status, body = send(api, player_event, [op(4, 3, "DISMISS_SLOT", {"slotId": "N-001"})])
    assert status == 200 and results(body) == [("APPLIED", "VOIDED")]
    assert run_item(api)["snapshot"]["credits"] == credits + 30  # the reward, once
    assert api.item(SLOT)["status"] == "VOIDED" and api.item(SUM) is None  # the summary never counts a VOID
    line = op_lines(api)[-1]
    assert (line["type"], line["slotId"], line["code"], line["level"]) == ("DISMISS_SLOT", "N-001", "VOIDED", "INFO")
    _, body = send(api, player_event, [op(5, 4, "SUBMIT_ATTEMPT", {"slotId": "N-001", "answer": "b"})])
    assert results(body) == [("APPLIED", "NO_OP_VOIDED_SLOT")]
    assert run_item(api)["snapshot"]["credits"] == credits + 30  # still once


def test_a_slot_resolved_before_the_withdrawal_stays_as_recorded(api: RunsApi, player_event: dict) -> None:
    send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "b")])  # SUCCEEDED, +30
    credits = run_item(api)["snapshot"]["credits"]
    withdraw(api)
    _, body = send(api, player_event, [op(5, 4, "DISMISS_SLOT", {"slotId": "N-001"})])
    assert results(body) == [("REJECTED", "PHASE_MISMATCH")]  # not the current slot any more: nothing to void
    assert api.item(SLOT)["status"] == "SUCCEEDED" and api.item(SUM)["succeeded"] == 1
    assert run_item(api)["snapshot"]["credits"] == credits
