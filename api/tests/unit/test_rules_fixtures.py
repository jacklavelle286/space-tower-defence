"""The shared contract fixtures against the Python rules mirror (Phase 12, M1-14; I section I.2.3).

Reads contracts/fixtures/ directly, never a copy, with the runner described in contracts/fixtures/README.md, the same
one web/game-core/src/rules/reducer.test.ts and next-phase.test.ts use. Results are compared twice: with ==, for a
readable diff, and as canonical JSON, because Python's == calls True equal to 1 and 1.0 equal to 1, and the server's
state must serialise exactly as the TypeScript state does.
"""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from conftest import REPO

from shared.content import INTERACTION_TYPES
from shared.rules import current_slot_id, next_phase, reduce, slot_id_for, validate
from shared.rules.contracts import LIMITS

FIXTURES = REPO / "contracts" / "fixtures"
OPS_DIR = FIXTURES / "ops"
FILES = sorted(path.name for path in OPS_DIR.glob("*.json"))


def load(name: str) -> dict[str, Any]:
    return json.loads((OPS_DIR / name).read_text(encoding="utf-8"))


def as_js(value: Any) -> Any:
    """A JSON value as JavaScript holds it: 1.0 and 1 are the same number, so an integral float becomes an int."""
    if isinstance(value, dict):
        return {key: as_js(inner) for key, inner in value.items()}
    if isinstance(value, list):
        return [as_js(inner) for inner in value]
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def assert_same(actual: Any, expected: Any, label: str) -> None:
    """Equal as JSON, types included: true is not 1, and the result holds no float where JavaScript has an integer."""
    assert actual == expected, label
    canonical = json.dumps(as_js(expected), sort_keys=True, ensure_ascii=False)
    assert json.dumps(actual, sort_keys=True, ensure_ascii=False) == canonical, label


def verdict(result: dict[str, Any]) -> dict[str, Any]:
    """The reducer's answer without the state, in the shape a fixture's `expect` uses."""
    return {key: value for key, value in result.items() if key != "state"}


def run_sequence(fixture: dict[str, Any]) -> int:
    """Run every step of an op-sequence fixture; return how many ops were sent to the reducer."""
    actual = copy.deepcopy(fixture["start"])
    expected = copy.deepcopy(fixture["start"])
    sent = 0
    for index, step in enumerate(fixture["steps"]):
        if "resend" in step:
            continue  # duplicate memory is the handler's job, not the pure reducer's (I.2.3)
        label = f"{fixture['name']} step {index}" + (f" ({step['note']})" if "note" in step else "")
        want = {key: value for key, value in step["expect"].items() if key not in ("state", "removed")}
        changes = step["expect"].get("state")
        op = copy.deepcopy(step["op"])
        state_before, op_before = copy.deepcopy(actual), copy.deepcopy(op)

        result = reduce(actual, op)
        sent += 1

        assert actual == state_before and op == op_before, f"{label}: the reducer changed its inputs"
        assert_same(verdict(result), want, label)
        if result["result"] == "APPLIED":
            expected = {**expected, **(changes or {})}
            for key in step["expect"].get("removed", []):
                del expected[key]
            assert_same(result["state"], expected, label)
            assert validate("run-state.schema.json", result["state"], "state") == [], label
            actual = result["state"]
        else:
            assert changes is None, f"{label}: a refusal changes nothing"
    return sent


def test_fixtures_exist() -> None:
    assert len(FILES) > 0


@pytest.mark.parametrize("name", FILES)
def test_fixture_is_well_formed(name: str) -> None:
    fixture = load(name)
    assert f"{fixture['name']}.json" == name
    assert len(fixture["sources"]) > 0
    assert validate("run-state.schema.json", fixture["start"], "start") == []


@pytest.mark.parametrize("name", FILES)
def test_fixture_gives_the_expected_result_and_state_after_every_op(name: str) -> None:
    assert run_sequence(load(name)) > 0


def test_fixtures_cover_every_op_type_refusal_code_and_outcome() -> None:
    steps = [step for name in FILES for step in load(name)["steps"]]
    types = {step["op"].get("type") for step in steps if isinstance(step.get("op"), dict)}
    assert {"SAVE_PREP", "START_WAVE", "COMPLETE_WAVE", "SUBMIT_ATTEMPT", "DEFEAT", "ABANDON"} <= types
    codes = {step["expect"]["code"] for step in steps if "code" in step["expect"]}
    assert codes == {"PHASE_MISMATCH", "RUN_TERMINAL", "STALE_REVISION", "VALIDATION_FAILED"}
    outcomes = {step["expect"]["outcome"] for step in steps if "outcome" in step["expect"]}
    assert outcomes == {"INCORRECT", "NO_OP_VOIDED_SLOT", "RESOLVED_FAILED", "RESOLVED_SUCCEEDED", "VOIDED"}


def test_a_broken_expectation_fails_the_runner() -> None:
    """The runner really compares: change one expected value and it must fail (build-phases Phase 12, review 4)."""
    fixture = load("m1-challenge-happy-path.json")
    step = next(s for s in fixture["steps"] if s["expect"].get("state", {}).get("revision") is not None)
    step["expect"]["state"]["revision"] += 1
    with pytest.raises(AssertionError):
        run_sequence(fixture)


# --- reduce: the promises about the reducer itself (mirrors the "reduce" block of reducer.test.ts) ---

START = load("m1-challenge-happy-path.json")["start"]
SAVE_PREP = {
    "opId": "00000000-0000-4000-8000-000000000001",
    "expectedRevision": 0,
    "type": "SAVE_PREP",
    "clientTime": "2026-11-15T10:00:00Z",
    "payload": {"credits": 100, "placements": [{"padId": "p03", "classId": "nova", "level": 1, "targeting": "FRONT"}]},
}


def test_reduce_never_changes_its_inputs_and_shares_nothing_mutable_with_the_op() -> None:
    state, op = copy.deepcopy(START), copy.deepcopy(SAVE_PREP)
    result = reduce(state, op)
    assert state == START and op == SAVE_PREP
    assert result["result"] == "APPLIED"
    assert result["state"]["snapshot"]["placements"][0] is not op["payload"]["placements"][0]
    assert result["state"]["snapshot"]["placements"] is not op["payload"]["placements"]


def test_reduce_gives_the_same_answer_for_the_same_inputs() -> None:
    assert reduce(START, SAVE_PREP) == reduce(START, SAVE_PREP)


@pytest.mark.parametrize("junk", [None, 42, "SAVE_PREP", [], {}, True])
def test_reduce_refuses_every_non_op_with_validation_failed_instead_of_raising(junk: Any) -> None:
    result = reduce(START, junk)
    assert result["result"] == "REJECTED" and result["code"] == "VALIDATION_FAILED"


def test_reduce_names_a_reason_for_every_refusal() -> None:
    refusals = [s["expect"].get("code") for n in FILES for s in load(n)["steps"] if s["expect"]["result"] == "REJECTED"]
    assert refusals and all(isinstance(code, str) and code for code in refusals)


def test_reduce_raises_on_a_broken_run_state_rather_than_guessing() -> None:
    no_phase = {key: value for key, value in START.items() if key != "phase"}
    with pytest.raises(ValueError, match="no phase"):
        reduce(no_phase, SAVE_PREP)


def test_integral_floats_from_an_op_become_ints_in_the_state() -> None:
    """JSON 100.0 is JavaScript's 100: the state must hold an int, as boto3's serialiser refuses floats."""
    op = copy.deepcopy(SAVE_PREP)
    op["expectedRevision"] = 0.0
    op["payload"]["credits"] = 100.0
    op["payload"]["placements"][0]["level"] = 1.0
    result = reduce(START, op)
    assert result["result"] == "APPLIED"
    assert_same(result["state"]["snapshot"]["credits"], 100, "credits")
    assert_same(result["state"]["snapshot"]["placements"][0]["level"], 1, "level")
    assert_same(result["state"]["revision"], 1, "revision")


# --- next-phase.json (mirrors next-phase.test.ts) ---

NEXT_PHASE = json.loads((FIXTURES / "next-phase.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("vector", NEXT_PHASE["cases"], ids=lambda v: v["name"])
def test_next_phase_vector(vector: dict[str, Any]) -> None:
    assert next_phase(vector["slots"], vector["interval"]) == vector["expected"]


def test_next_phase_vectors_cover_all_three_answers() -> None:
    assert {case["expected"] for case in NEXT_PHASE["cases"]} == {"ACTIVITY", "METEOR", "BUILD"}


@pytest.mark.parametrize("vector", NEXT_PHASE["slotIds"], ids=lambda v: v["expected"])
def test_slot_id(vector: dict[str, Any]) -> None:
    assert slot_id_for(vector["kind"], vector["interval"]) == vector["expected"]


def test_current_slot_is_derived_from_phase_and_wave() -> None:
    assert current_slot_id({"phase": "ACTIVITY", "wave": 2}) == "N-001"
    assert current_slot_id({"phase": "METEOR", "wave": 10}) == "M-009"
    for phase in ("BUILD", "IN_WAVE", "COMPLETION_OFFER"):
        assert current_slot_id({"phase": phase, "wave": 10}) is None
    assert current_slot_id({"wave": 10}) is None


# --- answers/vectors.json: the answer shape Python checks (S3.3, C20.1) ---

ANSWERS = json.loads((FIXTURES / "answers" / "vectors.json").read_text(encoding="utf-8"))


def answer_problems(answer: Any) -> list[dict[str, str]]:
    op = {**SAVE_PREP, "type": "SUBMIT_ATTEMPT", "payload": {"slotId": "N-001", "answer": answer}}
    return [p for p in validate("op.schema.json", op) if p["field"] == "op.payload.answer"]


@pytest.mark.parametrize("vector", ANSWERS["shape"], ids=lambda v: repr(v["answer"])[:40])
def test_answer_shape_vector(vector: dict[str, Any]) -> None:
    assert (answer_problems(vector["answer"]) == []) is vector["valid"]


def test_every_canonical_answer_passes_the_shape_check() -> None:
    outputs = [v["expected"] for v in ANSWERS["canonical"] + ANSWERS["twoStep"] if "expected" in v]
    assert outputs
    for answer in outputs:
        assert answer_problems(answer) == [], answer


def test_answer_vectors_cover_all_six_interaction_types() -> None:
    """Shape only on this side (C20.1): Python never canonicalises. The vectors name only real interaction types, and
    every one of the six (MULTIPLE_CHOICE; PICTURE_SELECT and NUMBER_SELECT from Phase 37; OBJECT_MOVE, ARRANGE and
    TYPED from Phase 38, each mode) has an accepted output that passes the shape check."""
    types = {v["interactionType"] for v in ANSWERS["canonical"]}
    assert types == set(INTERACTION_TYPES)
    for interaction_type in INTERACTION_TYPES:
        vectors = [v for v in ANSWERS["canonical"] if v["interactionType"] == interaction_type]
        outputs = [v["expected"] for v in vectors if "expected" in v]
        assert outputs, interaction_type
        assert all(answer_problems(answer) == [] for answer in outputs), interaction_type
    modes = {v["mode"] for v in ANSWERS["canonical"] if "mode" in v and "expected" in v}
    assert modes == {"DISTRIBUTE", "SORT", "LETTERS", "SEQUENCE", "NUMERIC", "WORD"}


def test_two_step_answers_are_the_step_answers_joined_by_the_step_joiner() -> None:
    """C20.3: a two-step answer is "<step 1>|<step 2>", one string of at most 64 characters; each part alone is also
    of the canonical shape, and the limit's stepJoiner is the one reserved separator no step answer contains."""
    joiner = LIMITS["answer"]["stepJoiner"]
    assert joiner in LIMITS["answer"]["reservedSeparators"]
    accepted = [v for v in ANSWERS["twoStep"] if "expected" in v]
    assert accepted
    for vector in accepted:
        parts = vector["expected"].split(joiner)
        assert len(parts) == len(vector["steps"]), vector["name"]
        assert all(answer_problems(part) == [] for part in parts), vector["name"]
    assert any(v.get("refused") == "NOT_CANONICAL" and "64" in v["name"] for v in ANSWERS["twoStep"])
