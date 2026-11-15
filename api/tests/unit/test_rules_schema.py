"""The contract validator in Python (mirrors web/game-core/src/rules/schema.test.ts case for case).

Strict schemas (unknown fields fail), the supported keywords, and the fixed problem order both languages share. The
last tests check that the Python keyword list equals the generator's, and that the schemas use no other keyword, so a
new keyword cannot be silently ignored by one side.
"""

from __future__ import annotations

import json
import re
from typing import Any

import pytest
from conftest import REPO

from shared.rules import LIMITS, SCHEMAS, validate
from shared.rules.schema import ANNOTATIONS, SUPPORTED_KEYWORDS

OP_ID = "00000000-0000-4000-8000-000000000001"
SESSION_ID = "00000000-0000-4000-8000-0000000000aa"


def op(type_: str, payload: Any) -> dict[str, Any]:
    return {
        "opId": OP_ID,
        "expectedRevision": 0,
        "type": type_,
        "payload": payload,
        "clientTime": "2026-11-15T10:00:00Z",
    }


def problem(field: str, rule: str) -> dict[str, str]:
    return {"field": field, "rule": rule}


COMPLETE_WAVE = {
    "wave": 1,
    "credits": 74,
    "placements": [{"padId": "p03", "classId": "nova", "level": 1, "targeting": "FRONT"}],
    "colony": {"health": 20, "shield": 0},
    "powers": {"frost-pulse": 1},
}
VALID = [
    ("SAVE_PREP", {"credits": 150, "placements": []}),
    ("START_WAVE", {"wave": 1, "credits": 150, "placements": []}),
    ("COMPLETE_WAVE", COMPLETE_WAVE),
    ("SUBMIT_ATTEMPT", {"slotId": "N-001", "answer": "c"}),
    ("DEFEAT", {"wave": 1}),
    ("ABANDON", {}),
]


@pytest.mark.parametrize(("type_", "payload"), VALID)
def test_accepts_a_valid_op(type_: str, payload: dict[str, Any]) -> None:
    assert validate("op.schema.json", op(type_, payload)) == []


@pytest.mark.parametrize(("type_", "payload"), VALID)
def test_refuses_an_unknown_payload_field(type_: str, payload: dict[str, Any]) -> None:
    assert validate("op.schema.json", op(type_, {**payload, "extra": 1})) == [
        problem("op.payload.extra", "additionalProperties")
    ]


def test_refuses_unknown_fields_inside_nested_objects_too() -> None:
    payload = {
        **COMPLETE_WAVE,
        "placements": [{"padId": "p03", "classId": "nova", "level": 1, "targeting": "FRONT", "damage": 99}],
        "colony": {"health": 20, "shield": 0, "regen": 1},
    }
    assert validate("op.schema.json", op("COMPLETE_WAVE", payload)) == [
        problem("op.payload.placements[0].damage", "additionalProperties"),
        problem("op.payload.colony.regen", "additionalProperties"),
    ]


def test_checks_power_names_with_property_names_and_charges_as_counts() -> None:
    payload = {**COMPLETE_WAVE, "powers": {"Frost_Pulse": 1, "comet-burst": -1}}
    assert validate("op.schema.json", op("COMPLETE_WAVE", payload)) == [
        problem("op.payload.powers.Frost_Pulse", "propertyNames"),
        problem("op.payload.powers.comet-burst", "minimum"),
    ]


def test_booleans_and_fractions_are_not_integers_but_one_point_zero_is() -> None:
    assert validate("op.schema.json", op("DEFEAT", {"wave": True})) == [problem("op.payload.wave", "type")]
    assert validate("op.schema.json", op("DEFEAT", {"wave": 1.5})) == [problem("op.payload.wave", "type")]
    assert validate("op.schema.json", op("DEFEAT", {"wave": 1.0})) == []


def test_bounds_waves_to_1_999_and_credits_to_32_bits() -> None:
    assert validate("op.schema.json", op("DEFEAT", {"wave": 0})) == [problem("op.payload.wave", "minimum")]
    assert validate("op.schema.json", op("DEFEAT", {"wave": 1000})) == [problem("op.payload.wave", "maximum")]
    assert validate("op.schema.json", op("SAVE_PREP", {"credits": 2147483648, "placements": []})) == [
        problem("op.payload.credits", "maximum")
    ]


def answer(text: str) -> list[dict[str, str]]:
    return validate("op.schema.json", op("SUBMIT_ATTEMPT", {"slotId": "N-001", "answer": text}))


def test_limits_the_answer_to_64_characters_of_the_canonical_alphabet() -> None:
    assert answer("a" * 64) == []
    assert answer("a" * 65) == [problem("op.payload.answer", "maxLength"), problem("op.payload.answer", "pattern")]
    assert answer("") == [problem("op.payload.answer", "pattern")]
    assert answer("c\n") == [problem("op.payload.answer", "pattern")]  # Python's $ alone would accept this


def test_counts_string_length_in_code_points() -> None:
    # 64 astral characters are 128 UTF-16 units but 64 characters: only the pattern fails, not maxLength.
    assert answer("\U0001f680" * 64) == [problem("op.payload.answer", "pattern")]


def test_checks_slot_ids() -> None:
    assert validate("op.schema.json", op("SUBMIT_ATTEMPT", {"slotId": "N-1", "answer": "c"})) == [
        problem("op.payload.slotId", "pattern")
    ]
    assert validate("op.schema.json", op("SUBMIT_ATTEMPT", {"slotId": "N-١٢٣", "answer": "c"})) == [
        problem("op.payload.slotId", "pattern")  # [0-9] is ASCII only, as in JavaScript
    ]


def test_reports_an_op_that_is_not_an_object_at_the_root() -> None:
    assert validate("op.schema.json", "SAVE_PREP") == [problem("op", "type")]
    assert validate("op.schema.json", None) == [problem("op", "type")]


def test_reports_a_missing_payload_once() -> None:
    rest = {key: value for key, value in op("SAVE_PREP", {}).items() if key != "payload"}
    assert validate("op.schema.json", rest) == [problem("op.payload", "required")]


def test_sorts_unknown_keys_by_utf16_code_unit_like_javascript() -> None:
    # By code point U+FF5E comes first; JavaScript compares UTF-16 units, and U+1F680 starts with 0xD83D < 0xFF5E.
    keys = ["\uff5e", "\U0001f680"]
    payload = {key: 1 for key in keys}
    fields = [p["field"] for p in validate("op.schema.json", op("ABANDON", payload))]
    assert fields == ["op.payload.\U0001f680", "op.payload.\uff5e"]


def envelope(ops: list[Any], **extra: Any) -> dict[str, Any]:
    return {"protocolVersion": 1, "sessionId": SESSION_ID, "generation": 7, "ops": ops, **extra}


def test_envelope_accepts_1_to_25_ops() -> None:
    assert validate("op-envelope.schema.json", envelope([op("ABANDON", {})]), "body") == []
    assert validate("op-envelope.schema.json", envelope([op("ABANDON", {})] * 25), "body") == []


def test_envelope_refuses_an_empty_batch_and_a_batch_of_26() -> None:
    assert validate("op-envelope.schema.json", envelope([]), "body") == [problem("body.ops", "minItems")]
    assert validate("op-envelope.schema.json", envelope([op("ABANDON", {})] * 26), "body") == [
        problem("body.ops", "maxItems")
    ]


def test_envelope_refuses_unknown_fields_and_checks_every_op_payload_included() -> None:
    bad = envelope([op("ABANDON", {}), op("CHOOSE_ENDLESS", {}), op("DEFEAT", {"wave": 1, "x": 1})], runId=SESSION_ID)
    assert validate("op-envelope.schema.json", bad, "body") == [
        problem("body.ops[1].type", "enum"),
        problem("body.ops[2].payload.x", "additionalProperties"),
        problem("body.runId", "additionalProperties"),
    ]


def test_envelope_requires_the_session_fields() -> None:
    assert validate("op-envelope.schema.json", {"protocolVersion": 1, "ops": [op("ABANDON", {})]}, "body") == [
        problem("body.sessionId", "required"),
        problem("body.generation", "required"),
    ]


def test_run_state_refuses_a_slot_with_more_than_three_attempts() -> None:
    def attempt(n: int) -> dict[str, Any]:
        return {"n": n, "attemptId": OP_ID, "answer": "a", "correct": False}

    state = {
        "mode": "CHALLENGE",
        "status": "IN_PROGRESS",
        "stage": "AUTHORED",
        "phase": "ACTIVITY",
        "wave": 2,
        "finalWave": 2,
        "highestCompletedWave": 1,
        "campaignCompleted": False,
        "plannedThrough": 1,
        "revision": 3,
        "powerChargeCap": 2,
        "snapshot": {"credits": 0, "placements": [], "colony": {"health": 20, "shield": 0}, "powers": {}},
        "slots": [
            {
                "slotId": "N-001",
                "kind": "NORMAL",
                "status": "UNRESOLVED",
                "attempts": [attempt(1), attempt(2), attempt(3), attempt(4)],
                "accepted": ["c"],
                "withdrawn": False,
                "reward": {"credits": 30},
            }
        ],
    }
    assert validate("run-state.schema.json", state, "state") == [
        problem("state.slots[0].attempts", "maxItems"),
        problem("state.slots[0].attempts[3].n", "maximum"),
    ]


def test_raises_for_an_unknown_schema() -> None:
    with pytest.raises(ValueError, match="unknown schema"):
        validate("nope.schema.json", {})


# --- the contracts are read from contracts/, the same files TypeScript is generated from ---


def test_limits_and_schemas_are_the_contract_files() -> None:
    limits = json.loads((REPO / "contracts" / "limits.json").read_text(encoding="utf-8"))
    del limits["$comment"]
    assert limits == LIMITS
    assert sorted(SCHEMAS) == sorted(p.name for p in (REPO / "contracts" / "schemas").glob("*.schema.json"))


def test_supported_keywords_equal_the_generators_list() -> None:
    source = (REPO / "web" / "game-core" / "scripts" / "gen-contracts.ts").read_text(encoding="utf-8")
    supported = re.search(r"SUPPORTED_KEYWORDS: readonly string\[\] = \[(.*?)\];", source, re.DOTALL)
    annotations = re.search(r"ANNOTATIONS: readonly string\[\] = \[(.*?)\];", source, re.DOTALL)
    assert supported and annotations
    assert tuple(re.findall(r'"([^"]+)"', supported.group(1))) == SUPPORTED_KEYWORDS
    assert tuple(re.findall(r'"([^"]+)"', annotations.group(1))) == ANNOTATIONS


def _keywords(schema: Any, where: str) -> list[tuple[str, str]]:
    """Every (keyword, place) in a schema, walking the same sub-schemas as the generator's checkKeywords."""
    found: list[tuple[str, str]] = []
    if not isinstance(schema, dict):
        return found
    for key, value in schema.items():
        found.append((key, where))
        if key in ("properties", "$defs"):
            for name, sub in value.items():
                found += _keywords(sub, f"{where}/{key}/{name}")
        elif key in ("items", "additionalProperties", "propertyNames", "if", "then"):
            found += _keywords(value, f"{where}/{key}")
        elif key == "allOf":
            for i, sub in enumerate(value):
                found += _keywords(sub, f"{where}/allOf/{i}")
    return found


def test_schemas_use_only_supported_keywords() -> None:
    allowed = set(SUPPORTED_KEYWORDS) | set(ANNOTATIONS)
    unknown = [(key, where) for name, schema in SCHEMAS.items() for key, where in _keywords(schema, name)]
    assert [entry for entry in unknown if entry[0] not in allowed] == []
