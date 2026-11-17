"""The rules reducer for every run op except CREATE_RUN (spine S3.2, F sections 3.3-3.5; M1-14, M2-06).

Python mirror of web/game-core/src/rules/reducer.ts: same functions, same check order, same refusal codes, same
results. contracts/fixtures/ops/*.json checks that both languages agree (api/tests/unit/test_rules_fixtures.py and
reducer.test.ts read the same files).

reduce(state, op) is a pure function: it never changes `state` or `op`, reads no clock and does no I/O, and it
returns either the new state or a refusal with a named code. Results are plain dicts shaped like the TypeScript
objects. Like the TypeScript, a new state may share unchanged parts (slots, snapshot) with the old one: treat both as
read-only.

Check order, taken from the server's per-op order (spine S7.1, G section 5.3) minus the server-only steps:
  envelope  the op's own fields (opId, expectedRevision, type, payload is an object, clientTime) -> VALIDATION_FAILED
  (c)       run terminal                                                                       -> RUN_TERMINAL
  (d)       expectedRevision != revision                                                       -> STALE_REVISION
  (f)       phase, wave and current slot (F section 3.5)                                       -> PHASE_MISMATCH
  (g)       payload schema                                                                     -> VALIDATION_FAILED
Not here: (a) duplicates (the pure reducers have no duplicate memory, I.2.3), (b) the session fence and
(e) loadable pins (the handler's job), and (h) plausibility bounds (Phase 30, needs the bounds file).

(f) compares a payload field (wave, slotId) only when it has the right JSON type; a missing or wrongly typed
field is left for (g) to refuse, so the same bad op gets the same code in both languages.

CHOOSE_ENDLESS is online only (G section 6) and arrives only through R12. Endless block planning (F section 3.6)
selects content, so it is not here: the handler adds the planned slots to the state before calling reduce (Phase 54).

Integers only: JSON allows 74.0 for 74 and JavaScript cannot tell them apart, so every value copied from an op into
the state goes through _plain(), which turns an integral float into an int. The state then serialises exactly as the
TypeScript state does, and boto3's serialiser (which refuses floats) can store it.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from shared.rules.contracts import LIMITS
from shared.rules.next_phase import current_slot_id, next_phase
from shared.rules.schema import is_integer, validate

RunState = dict[str, Any]
ReduceResult = dict[str, Any]
"""{"result": "APPLIED", "state", "outcome"?, "attempt"?} or {"result": "REJECTED", "code", "details"?}."""

PAYLOAD_PREFIX = "op.payload."


def _plain(value: Any) -> Any:
    """A deep copy of a JSON value with every integral float turned into an int (JavaScript has one number type)."""
    if isinstance(value, dict):
        return {key: _plain(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [_plain(inner) for inner in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def _wave_matches(payload: Mapping[str, Any], wave: int) -> bool:
    """`wave` must equal the run's wave when it is an integer; any other value is left for the schema step."""
    value = payload.get("wave")
    return not is_integer(value) or value == wave


def _names_voided_slot(state: RunState, slot_id: Any) -> bool:
    """SUBMIT_ATTEMPT and DISMISS_SLOT naming a slot that is already VOIDED (the no-op of F section 3.3, any phase)."""
    return isinstance(slot_id, str) and any(s["slotId"] == slot_id and s["status"] == "VOIDED" for s in state["slots"])


def _open_current_slot(state: RunState, slot_id: str) -> dict[str, Any] | None:
    """The current slot, when `slot_id` names it and it is still UNRESOLVED; else None."""
    slot = next((s for s in state["slots"] if s["slotId"] == slot_id), None)
    if slot_id == current_slot_id(state) and slot is not None and slot["status"] == "UNRESOLVED":
        return slot
    return None


def _gate(state: RunState, phase: str, op: Mapping[str, Any]) -> str:
    """What step (f) decided: "ok" (go on), "voided-slot" (the VOIDED-slot no-op) or "mismatch"."""
    payload: Mapping[str, Any] = op["payload"]
    op_type = op["type"]
    if op_type == "SAVE_PREP":
        return "ok" if phase in ("BUILD", "IN_WAVE") else "mismatch"
    if op_type == "START_WAVE":
        return "ok" if phase in ("BUILD", "IN_WAVE") and _wave_matches(payload, state["wave"]) else "mismatch"
    if op_type in ("COMPLETE_WAVE", "DEFEAT"):
        return "ok" if phase == "IN_WAVE" and _wave_matches(payload, state["wave"]) else "mismatch"
    if op_type == "ABANDON":
        return "mismatch" if state["campaignCompleted"] else "ok"
    if op_type in ("SUBMIT_ATTEMPT", "DISMISS_SLOT"):
        slot_id = payload.get("slotId")
        if _names_voided_slot(state, slot_id):
            return "voided-slot"
        if phase not in ("ACTIVITY", "METEOR"):
            return "mismatch"
        if not isinstance(slot_id, str):
            return "ok"
        slot = _open_current_slot(state, slot_id)
        if slot is None:
            return "mismatch"
        if op_type == "SUBMIT_ATTEMPT":
            return "ok"
        # Only a meteor slot before any attempt (DECLINED; owner decision D-11) or a withdrawn slot (VOIDED).
        return "ok" if slot["withdrawn"] or (slot["kind"] == "METEOR" and not slot["attempts"]) else "mismatch"
    if op_type == "FINISH_RUN":
        return "ok" if state["campaignCompleted"] and phase != "IN_WAVE" else "mismatch"
    if op_type == "CHOOSE_ENDLESS":
        return "ok" if phase == "COMPLETION_OFFER" else "mismatch"
    raise ValueError(f"unknown op type {op_type}")  # unreachable: the envelope step checked the type


def _grant(snapshot: Mapping[str, Any], reward: Mapping[str, Any], power_charge_cap: int) -> dict[str, Any]:
    """Add a slot's pinned reward: credits, or one power charge unless that power is already at its cap."""
    powers = snapshot["powers"]
    if "powerId" in reward:
        power_id = reward["powerId"]
        held = powers.get(power_id, 0)
        if held < power_charge_cap:
            powers = {**powers, power_id: held + 1}
    return {**snapshot, "credits": snapshot["credits"] + reward["credits"], "powers": powers}


def _finish(state: RunState, status: str) -> RunState:
    """A terminal run keeps its fields but loses `phase` and `snapshot` (spine S3.1, S4)."""
    rest = {key: value for key, value in state.items() if key not in ("phase", "snapshot")}
    return {**rest, "status": status}


def _need_snapshot(state: RunState) -> dict[str, Any]:
    snapshot = state.get("snapshot")
    if snapshot is None:
        raise ValueError("invalid run state: an IN_PROGRESS run has no snapshot")
    return snapshot


def _submit_attempt(state: RunState, op: Mapping[str, Any], revision: int) -> ReduceResult:
    payload = op["payload"]
    interval = state["wave"] - 1
    index = next((i for i, s in enumerate(state["slots"]) if s["slotId"] == payload["slotId"]), None)
    if index is None:
        raise ValueError("invalid run state: the current slot is missing")
    slot = state["slots"][index]
    snapshot = _need_snapshot(state)

    def replace(new_slot: dict[str, Any]) -> list[dict[str, Any]]:
        return [new_slot if i == index else s for i, s in enumerate(state["slots"])]

    if slot["withdrawn"]:
        # VOID: no judging, no attempt counted, the reward granted once, and the phase moves on (spine S3.3).
        slots = replace({**slot, "status": "VOIDED"})
        return {
            "result": "APPLIED",
            "outcome": "VOIDED",
            "state": {
                **state,
                "revision": revision,
                "slots": slots,
                "phase": next_phase(slots, interval),
                "snapshot": _grant(snapshot, slot["reward"], state["powerChargeCap"]),
            },
        }

    n = len(slot["attempts"]) + 1
    answer = payload["answer"]
    correct = answer in slot["accepted"]
    status = "SUCCEEDED" if correct else "FAILED" if n >= LIMITS["attemptsPerSlot"] else "UNRESOLVED"
    slots = replace(
        {
            **slot,
            "status": status,
            "attempts": [*slot["attempts"], {"n": n, "attemptId": op["opId"], "answer": answer, "correct": correct}],
        }
    )
    outcome = "RESOLVED_SUCCEEDED" if correct else "RESOLVED_FAILED" if status == "FAILED" else "INCORRECT"
    new_state: RunState = {**state, "revision": revision, "slots": slots}
    if status != "UNRESOLVED":
        new_state["phase"] = next_phase(slots, interval)
    new_state["snapshot"] = _grant(snapshot, slot["reward"], state["powerChargeCap"]) if correct else snapshot
    return {
        "result": "APPLIED",
        "outcome": outcome,
        "attempt": {"n": n, "correct": correct, "slotStatus": status, "rewardGranted": correct},
        "state": new_state,
    }


def _dismiss_slot(state: RunState, op: Mapping[str, Any], revision: int) -> ReduceResult:
    index = next((i for i, s in enumerate(state["slots"]) if s["slotId"] == op["payload"]["slotId"]), None)
    if index is None:
        raise ValueError("invalid run state: the current slot is missing")
    slot = state["slots"][index]
    snapshot = _need_snapshot(state)
    # Withdrawn wins: VOIDED with its reward, exactly as a SUBMIT_ATTEMPT on it would be (spine S3.3). Otherwise the
    # child declined a meteor before trying it: DECLINED, no reward, and it never counts in the learning summary.
    voided = bool(slot["withdrawn"])
    slots = [
        {**slot, "status": "VOIDED" if voided else "DECLINED"} if i == index else s
        for i, s in enumerate(state["slots"])
    ]
    return {
        "result": "APPLIED",
        "outcome": "VOIDED" if voided else "DECLINED",
        "state": {
            **state,
            "revision": revision,
            "slots": slots,
            "phase": next_phase(slots, state["wave"] - 1),
            "snapshot": _grant(snapshot, slot["reward"], state["powerChargeCap"]) if voided else snapshot,
        },
    }


def _complete_wave(state: RunState, op: Mapping[str, Any], revision: int) -> RunState:
    payload = _plain(op["payload"])
    wave = payload["wave"]
    snapshot = {
        "credits": payload["credits"],
        "placements": payload["placements"],
        "colony": payload["colony"],
        "powers": payload["powers"],
    }
    cleared = {**state, "revision": revision, "snapshot": snapshot, "highestCompletedWave": wave}
    if state["stage"] == "AUTHORED" and wave == state["finalWave"]:
        # CAMPAIGN: the offer screen (wave stays at finalWave). CHALLENGE: the run is complete (J-1).
        if state["mode"] == "CAMPAIGN":
            return {**cleared, "campaignCompleted": True, "phase": "COMPLETION_OFFER"}
        return _finish(cleared, "COMPLETED")
    if wave >= LIMITS["endless"]["finalWave"]:
        return _finish(cleared, "COMPLETED")
    # Endless block planning (F section 3.6) needs the server's content selection, so it is not part of this reducer.
    return {**cleared, "wave": wave + 1, "phase": next_phase(state["slots"], wave)}


def reduce(state: RunState, op: Any) -> ReduceResult:
    """Apply one op to a run.

    `op` is untrusted (it may come from a request body, a fixture or a test), so it is validated against
    contracts/schemas/op.schema.json here; `state` is trusted to match contracts/schemas/run-state.schema.json.
    """
    problems = validate("op.schema.json", op)
    envelope_problems = [p for p in problems if not p["field"].startswith(PAYLOAD_PREFIX)]
    if envelope_problems:
        return {"result": "REJECTED", "code": "VALIDATION_FAILED", "details": envelope_problems}
    valid: Mapping[str, Any] = op  # its own fields are checked; the payload is checked at (g) below

    if state["status"] != "IN_PROGRESS":
        return {"result": "REJECTED", "code": "RUN_TERMINAL"}
    if valid["expectedRevision"] != state["revision"]:
        return {"result": "REJECTED", "code": "STALE_REVISION"}
    phase = state.get("phase")
    if phase is None:
        raise ValueError("invalid run state: an IN_PROGRESS run has no phase")

    decision = _gate(state, phase, valid)
    if decision == "mismatch":
        return {
            "result": "REJECTED",
            "code": "PHASE_MISMATCH",
            "details": {"phase": phase, "wave": state["wave"], "currentSlotId": current_slot_id(state)},
        }
    payload_problems = [p for p in problems if p["field"].startswith(PAYLOAD_PREFIX)]
    if payload_problems:
        return {"result": "REJECTED", "code": "VALIDATION_FAILED", "details": payload_problems}

    revision = state["revision"] + 1
    if decision == "voided-slot":
        # A replayed op naming an already-VOIDED slot: applied, but changes nothing except the revision (F section 3.3).
        return {"result": "APPLIED", "outcome": "NO_OP_VOIDED_SLOT", "state": {**state, "revision": revision}}

    op_type = valid["type"]
    if op_type in ("SAVE_PREP", "START_WAVE"):
        payload = _plain(valid["payload"])
        snapshot = {**_need_snapshot(state), "credits": payload["credits"], "placements": payload["placements"]}
        next_ = "BUILD" if op_type == "SAVE_PREP" else "IN_WAVE"
        return {"result": "APPLIED", "state": {**state, "revision": revision, "snapshot": snapshot, "phase": next_}}
    if op_type == "COMPLETE_WAVE":
        return {"result": "APPLIED", "state": _complete_wave(state, valid, revision)}
    if op_type == "SUBMIT_ATTEMPT":
        return _submit_attempt(state, valid, revision)
    if op_type == "DEFEAT":
        return {"result": "APPLIED", "state": _finish({**state, "revision": revision}, "DEFEATED")}
    if op_type == "ABANDON":
        return {"result": "APPLIED", "state": _finish({**state, "revision": revision}, "ABANDONED")}
    if op_type == "DISMISS_SLOT":
        return _dismiss_slot(state, valid, revision)
    if op_type == "FINISH_RUN":
        return {"result": "APPLIED", "state": _finish({**state, "revision": revision}, "COMPLETED")}
    if op_type == "CHOOSE_ENDLESS":
        # wave = finalWave + 1; the phase comes from the interval just reached, finalWave (normally N-<finalWave>).
        final_wave = state["finalWave"]
        return {
            "result": "APPLIED",
            "state": {
                **state,
                "revision": revision,
                "stage": "ENDLESS",
                "wave": final_wave + 1,
                "phase": next_phase(state["slots"], final_wave),
            },
        }
    raise ValueError(f"unknown op type {op_type}")  # unreachable: the envelope step checked the type
