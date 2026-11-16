"""Phase 41 (M3-06, C25): the template generators, their snapshots, and the publish check over the whole domain.

Snapshots. Each released `(kind, version)` has one file, api/tests/snapshots/generators/<KIND>-v<version>.json, built
from CASES below: per case the template, the number of instances, a SHA-256 over every instance in enumeration order,
and a spread of full instances to read. The files are never edited. A test regenerates every case and compares it
with its file, so any change to what a released version produces fails here. New behaviour is a new version with a
new file. To write the file of a NEW version (only when it does not exist yet), run

    GENERATOR_SNAPSHOTS_WRITE=1 api/.venv/bin/pytest -k generators

which writes missing files and never overwrites one; without the variable a missing file is a failure.
"""

from __future__ import annotations

import ast
import hashlib
import json
import os
from pathlib import Path
from typing import Any

import pytest
from conftest import API, REPO

from shared import generators
from shared.activity_types import answer_shape_ok
from shared.content import (
    definition_problems,
    header_fields,
    template_report,
    validation_extras,
)
from shared.generators.base import Instance, Output, distractors
from shared.generators.numbers import MISSING_FORMS
from shared.generators.words import number_word

SNAPSHOTS = API / "tests" / "snapshots" / "generators"
WRITE = os.environ.get("GENERATOR_SNAPSHOTS_WRITE") == "1"
SAMPLE = 8

TRACK_10 = {"numberSet": {"kind": "RANGE", "min": 0, "max": 10, "step": 1}, "display": "TRACK"}
TRACK_20 = {"numberSet": {"kind": "RANGE", "min": 0, "max": 20, "step": 1}, "display": "TRACK"}
GRID_100 = {"numberSet": {"kind": "RANGE", "min": 0, "max": 100, "step": 1}, "display": "GRID"}
ALL_BOND_FORMS = ["a + ? = T", "? + a = T", "T - a = ?", "T - ? = a"]
ALL_MISSING_FORMS = ["a + ? = c", "? + b = c", "c = a + ?", "a - ? = c", "? - b = c", "c = ? - b"]
ALL_TIMES_FORMS = ["m x t = ?", "t x m = ?", "p / t = ?", "? x t = p"]


def tpl(kind: str, domain: dict[str, Any], presentation: dict[str, Any] | None = None) -> dict[str, Any]:
    out: dict[str, Any] = {"generatorKind": kind, "generatorVersion": 1, "domain": domain}
    if presentation is not None:
        out["presentation"] = presentation
    return out


# (kind, version) -> [(case name, interactionType, template)]. Part of each released snapshot: never edited.
CASES: dict[tuple[str, int], list[tuple[str, str, dict[str, Any]]]] = {
    ("ONE_MORE_LESS", 1): [
        (
            "to10-track",
            "NUMBER_SELECT",
            tpl("ONE_MORE_LESS", {"range": {"min": 0, "max": 10}, "changes": [1, -1]}, TRACK_10),
        ),
        ("to100-typed", "TYPED", tpl("ONE_MORE_LESS", {"range": {"min": 0, "max": 100}, "changes": [1, -1, 10, -10]})),
        ("to20-choice", "MULTIPLE_CHOICE", tpl("ONE_MORE_LESS", {"range": {"min": 0, "max": 20}, "changes": [1, -1]})),
    ],
    ("BOND_TO", 1): [
        (
            "c25-ma-0301",
            "NUMBER_SELECT",
            tpl(
                "BOND_TO",
                {"totals": [20], "part": {"min": 1, "max": 19}, "forms": ["a + ? = T", "? + a = T"]},
                TRACK_20,
            ),
        ),
        (
            "to5-10-typed",
            "TYPED",
            tpl("BOND_TO", {"totals": [5, 10], "part": {"min": 0, "max": 10}, "forms": ALL_BOND_FORMS}),
        ),
        (
            "tens-to100-choice",
            "MULTIPLE_CHOICE",
            tpl("BOND_TO", {"totals": [100], "part": {"min": 10, "max": 90}, "forms": ALL_BOND_FORMS}),
        ),
    ],
    ("ADD_WITHIN", 1): [
        (
            "within10-track",
            "NUMBER_SELECT",
            tpl("ADD_WITHIN", {"a": {"min": 0, "max": 10}, "b": {"min": 0, "max": 10}, "max": 10}, TRACK_10),
        ),
        (
            "within20-cross-typed",
            "TYPED",
            tpl("ADD_WITHIN", {"a": {"min": 2, "max": 9}, "b": {"min": 2, "max": 9}, "max": 20, "crossTen": "ONLY"}),
        ),
        (
            "plus-tens-choice",
            "MULTIPLE_CHOICE",
            tpl("ADD_WITHIN", {"a": {"min": 10, "max": 79}, "b": {"min": 10, "max": 30}, "max": 100, "shape": "TENS"}),
        ),
        ("three-one-digit-typed", "TYPED", tpl("ADD_WITHIN", {"a": {"min": 1, "max": 9}, "max": 20, "shape": "THREE"})),
    ],
    ("SUB_WITHIN", 1): [
        (
            "within10-track",
            "NUMBER_SELECT",
            tpl("SUB_WITHIN", {"a": {"min": 0, "max": 10}, "b": {"min": 0, "max": 10}}, TRACK_10),
        ),
        (
            "within20-no-cross-typed",
            "TYPED",
            tpl("SUB_WITHIN", {"a": {"min": 10, "max": 20}, "b": {"min": 1, "max": 9}, "crossTen": "NEVER"}),
        ),
        (
            "minus-tens-choice",
            "MULTIPLE_CHOICE",
            tpl("SUB_WITHIN", {"a": {"min": 20, "max": 99}, "b": {"min": 10, "max": 50}, "shape": "TENS"}),
        ),
    ],
    ("MISSING_NUMBER", 1): [
        (
            "within20-typed",
            "TYPED",
            tpl("MISSING_NUMBER", {"max": 20, "parts": {"min": 1, "max": 19}, "forms": ALL_MISSING_FORMS}),
        ),
        (
            "within20-track",
            "NUMBER_SELECT",
            tpl(
                "MISSING_NUMBER",
                {"max": 20, "parts": {"min": 0, "max": 20}, "forms": ["a + ? = c", "? - b = c"]},
                TRACK_20,
            ),
        ),
        (
            "within10-choice",
            "MULTIPLE_CHOICE",
            tpl("MISSING_NUMBER", {"max": 10, "parts": {"min": 1, "max": 9}, "forms": ALL_MISSING_FORMS}),
        ),
    ],
    ("DOUBLE_HALVE", 1): [
        ("to10-track", "NUMBER_SELECT", tpl("DOUBLE_HALVE", {"n": {"min": 0, "max": 5}, "ops": ["DOUBLE"]}, TRACK_10)),
        ("to20-typed", "TYPED", tpl("DOUBLE_HALVE", {"n": {"min": 1, "max": 20}, "ops": ["DOUBLE", "HALVE"]})),
        ("to20-choice", "MULTIPLE_CHOICE", tpl("DOUBLE_HALVE", {"n": {"min": 2, "max": 20}, "ops": ["HALVE"]})),
    ],
    ("SKIP_COUNT", 1): [
        (
            "2-5-10-typed",
            "TYPED",
            tpl(
                "SKIP_COUNT",
                {
                    "steps": [2, 5, 10],
                    "start": {"min": 0, "max": 20},
                    "directions": ["FORWARDS", "BACKWARDS"],
                    "asks": ["NEXT", "GAP"],
                    "max": 100,
                },
            ),
        ),
        (
            "threes-five-terms-choice",
            "MULTIPLE_CHOICE",
            tpl(
                "SKIP_COUNT",
                {
                    "steps": [3],
                    "start": {"min": 0, "max": 30},
                    "directions": ["FORWARDS"],
                    "asks": ["GAP"],
                    "terms": 5,
                    "max": 50,
                },
            ),
        ),
        (
            "tens-grid",
            "NUMBER_SELECT",
            tpl(
                "SKIP_COUNT",
                {
                    "steps": [10],
                    "start": {"min": 0, "max": 69},
                    "directions": ["FORWARDS"],
                    "asks": ["NEXT"],
                    "max": 100,
                },
                GRID_100,
            ),
        ),
    ],
    ("SEQUENCE_GAP", 1): [
        (
            "to100-typed",
            "TYPED",
            tpl("SEQUENCE_GAP", {"start": {"min": 0, "max": 97}, "directions": ["FORWARDS", "BACKWARDS"]}),
        ),
        (
            "to100-grid",
            "NUMBER_SELECT",
            tpl("SEQUENCE_GAP", {"start": {"min": 20, "max": 60}, "directions": ["FORWARDS"], "terms": 5}, GRID_100),
        ),
        (
            "to50-choice",
            "MULTIPLE_CHOICE",
            tpl("SEQUENCE_GAP", {"start": {"min": 0, "max": 46}, "directions": ["FORWARDS", "BACKWARDS"]}),
        ),
    ],
    ("NUMBER_WORD", 1): [
        (
            "to20-both-choice",
            "MULTIPLE_CHOICE",
            tpl("NUMBER_WORD", {"n": {"min": 1, "max": 20}, "directions": ["WORD_TO_NUMERAL", "NUMERAL_TO_WORD"]}),
        ),
        ("to100-typed", "TYPED", tpl("NUMBER_WORD", {"n": {"min": 20, "max": 100}, "directions": ["WORD_TO_NUMERAL"]})),
        (
            "to20-track",
            "NUMBER_SELECT",
            tpl("NUMBER_WORD", {"n": {"min": 1, "max": 20}, "directions": ["WORD_TO_NUMERAL"]}, TRACK_20),
        ),
    ],
    ("PLACE_VALUE", 1): [
        (
            "all-choice",
            "MULTIPLE_CHOICE",
            tpl("PLACE_VALUE", {"n": {"min": 10, "max": 99}, "asks": ["TENS", "ONES", "NUMBER"]}),
        ),
        ("number-typed", "TYPED", tpl("PLACE_VALUE", {"n": {"min": 10, "max": 99}, "asks": ["NUMBER"]})),
        (
            "tens-track",
            "NUMBER_SELECT",
            tpl("PLACE_VALUE", {"n": {"min": 10, "max": 99}, "asks": ["TENS", "ONES"]}, TRACK_10),
        ),
    ],
    ("TIMES_TABLE", 1): [
        (
            "2-5-10-choice",
            "MULTIPLE_CHOICE",
            tpl("TIMES_TABLE", {"tables": [2, 5, 10], "multiplier": {"min": 1, "max": 12}, "forms": ALL_TIMES_FORMS}),
        ),
        (
            "tens-typed",
            "TYPED",
            tpl(
                "TIMES_TABLE",
                {"tables": [10], "multiplier": {"min": 1, "max": 10}, "forms": ["m x t = ?", "p / t = ?"]},
            ),
        ),
        (
            "twos-track",
            "NUMBER_SELECT",
            tpl("TIMES_TABLE", {"tables": [2], "multiplier": {"min": 1, "max": 10}, "forms": ["t x m = ?"]}, TRACK_20),
        ),
    ],
    ("COUNT_OBJECTS", 1): [
        (
            "dice-track",
            "NUMBER_SELECT",
            tpl("COUNT_OBJECTS", {"count": {"min": 1, "max": 6}, "arrangements": ["DICE"]}, TRACK_10),
        ),
        (
            "dice-choice",
            "MULTIPLE_CHOICE",
            tpl("COUNT_OBJECTS", {"count": {"min": 1, "max": 6}, "arrangements": ["DICE"]}),
        ),
        (
            "dice-typed",
            "TYPED",
            tpl("COUNT_OBJECTS", {"count": {"min": 2, "max": 5}, "arrangements": ["DICE"]}, {"maxLength": 1}),
        ),
    ],
    ("COUNT_OUT", 1): [
        (
            "to10-stars-rockets",
            "OBJECT_MOVE",
            tpl(
                "COUNT_OUT", {"target": {"min": 2, "max": 10}, "extras": [2, 3], "objects": ["obj-star", "obj-rocket"]}
            ),
        ),
        (
            "every-object",
            "OBJECT_MOVE",
            tpl(
                "COUNT_OUT",
                {
                    "target": {"min": 3, "max": 5},
                    "extras": [2],
                    "objects": [
                        "obj-star",
                        "obj-rocket",
                        "obj-alien",
                        "obj-comet",
                        "obj-planet",
                        "obj-moon-rock",
                        "obj-alien-egg",
                    ],
                },
            ),
        ),
    ],
    ("SHARE_EQUALLY", 1): [
        (
            "all",
            "OBJECT_MOVE",
            tpl(
                "SHARE_EQUALLY",
                {"totals": [4, 6, 8, 10, 12], "groups": [2, 3], "objects": ["obj-star", "obj-alien-egg"]},
            ),
        ),
    ],
    ("ODD_EVEN_SORT", 1): [
        ("1-to-12", "OBJECT_MOVE", tpl("ODD_EVEN_SORT", {"values": {"min": 1, "max": 12}})),
        ("41-to-50", "OBJECT_MOVE", tpl("ODD_EVEN_SORT", {"values": {"min": 41, "max": 50}})),
    ],
    ("PICK_EXTREME", 1): [
        (
            "to10",
            "MULTIPLE_CHOICE",
            tpl("PICK_EXTREME", {"values": {"min": 1, "max": 10}, "asks": ["LARGEST", "SMALLEST"]}),
        ),
        (
            "20s-smallest",
            "MULTIPLE_CHOICE",
            tpl("PICK_EXTREME", {"values": {"min": 20, "max": 35}, "asks": ["SMALLEST"]}),
        ),
    ],
    ("ORDER_NUMBERS", 1): [
        (
            "three-to10",
            "ARRANGE",
            tpl(
                "ORDER_NUMBERS",
                {"values": {"min": 0, "max": 10}, "count": 3, "directions": ["ASCENDING", "DESCENDING"]},
            ),
        ),
        (
            "four-30s",
            "ARRANGE",
            tpl("ORDER_NUMBERS", {"values": {"min": 30, "max": 42}, "count": 4, "directions": ["ASCENDING"]}),
        ),
        (
            "five-teens",
            "ARRANGE",
            tpl("ORDER_NUMBERS", {"values": {"min": 10, "max": 20}, "count": 5, "directions": ["DESCENDING"]}),
        ),
    ],
}


def full(interaction_type: str, template: dict[str, Any]) -> list[dict[str, Any]]:
    prepared, problems = generators.prepare(template, interaction_type)
    assert prepared is not None, problems
    raw = generators.domain_params(prepared)
    assert raw is not None
    return [i.resolved(prepared.kind, prepared.version) for i in generators.instances(prepared, raw)]


def digest(instances: list[dict[str, Any]]) -> str:
    text = json.dumps(instances, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(text.encode()).hexdigest()


def spread(count: int) -> list[int]:
    return sorted({(count - 1) * i // (SAMPLE - 1) for i in range(SAMPLE)}) if count else []


def snapshot(kind: str, version: int) -> dict[str, Any]:
    cases = []
    for name, interaction_type, template in CASES[(kind, version)]:
        instances = full(interaction_type, template)
        cases.append(
            {
                "name": name,
                "interactionType": interaction_type,
                "template": template,
                "domainSize": len(instances),
                "sha256": digest(instances),
                "instances": {str(i): instances[i] for i in spread(len(instances))},
            }
        )
    return {"kind": kind, "version": version, "cases": cases}


def snapshot_path(kind: str, version: int) -> Path:
    return SNAPSHOTS / f"{kind}-v{version}.json"


# --- Snapshots per (kind, version) ----------------------------------------------------------------------------------


def test_every_released_generator_has_cases_and_a_snapshot_file_and_nothing_else_does() -> None:
    assert set(CASES) == set(generators.REGISTRY)
    files = {p.name for p in SNAPSHOTS.glob("*.json")} if SNAPSHOTS.is_dir() else set()
    assert files <= {snapshot_path(k, v).name for k, v in generators.REGISTRY}, "a snapshot with no generator"


@pytest.mark.parametrize(("kind", "version"), sorted(CASES), ids=lambda v: str(v))
def test_generator_output_matches_its_snapshot(kind: str, version: int) -> None:
    path = snapshot_path(kind, version)
    current = snapshot(kind, version)
    if not path.exists():
        if not WRITE:
            pytest.fail(f"no snapshot for {kind} v{version}: write it once with GENERATOR_SNAPSHOTS_WRITE=1")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(current, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    stored = json.loads(path.read_text(encoding="utf-8"))
    assert stored == current, f"{kind} v{version} changed its output: a change in behaviour is a new version"


@pytest.mark.parametrize(("kind", "version"), sorted(CASES), ids=lambda v: str(v))
def test_every_case_covers_each_output_type_and_passes_the_exhaustive_check(kind: str, version: int) -> None:
    cases = CASES[(kind, version)]
    assert {t for _, t, _ in cases} == set(generators.REGISTRY[(kind, version)].outputs)
    for name, interaction_type, template in cases:
        report = template_report({"interactionType": interaction_type, "template": template})
        assert report.problems == [], name
        assert 0 < report.domain_size <= generators.DOMAIN_MAX


# --- Pure, deterministic, canonical ---------------------------------------------------------------------------------


def test_generators_do_no_io_and_use_no_library_randomness() -> None:
    forbidden = {"random", "time", "datetime", "os", "io", "boto3", "botocore", "pathlib", "secrets", "uuid"}
    for path in sorted((API / "shared" / "generators").glob("*.py")):
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name.split(".")[0] for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module.split(".")[0]]
            assert not set(names) & forbidden, f"{path.name} imports {names}"
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                assert node.func.id not in ("open", "print", "input"), f"{path.name} calls {node.func.id}"


def test_the_same_parameters_give_the_same_instance() -> None:
    for (kind, _version), cases in CASES.items():
        for _, interaction_type, template in cases:
            assert full(interaction_type, template) == full(interaction_type, json.loads(json.dumps(template))), kind


VECTORS = json.loads((REPO / "contracts" / "fixtures" / "answers" / "vectors.json").read_text(encoding="utf-8"))


def test_the_python_shape_check_agrees_with_the_answer_vectors() -> None:
    for vector in VECTORS["shape"]:
        assert answer_shape_ok(vector["answer"]) is vector["valid"], vector
    for vector in VECTORS["canonical"]:
        if "expected" in vector:
            assert answer_shape_ok(vector["expected"]), vector["name"]


def test_every_generated_answer_is_already_canonical() -> None:
    """Every accepted answer of every instance has the canonical shape of the vectors, and the form the canonicaliser
    produces for its type (C20.1): the exhaustive check runs `check_answers`, which refuses anything else, and
    web/shared/src/learning/generated.test.ts feeds the snapshots through the TypeScript canonicaliser itself."""
    for cases in CASES.values():
        for name, interaction_type, template in cases:
            for instance in full(interaction_type, template):
                [answer] = instance["answerSpecification"]["accepted"]
                assert answer_shape_ok(answer), (name, answer)
                if interaction_type in ("NUMBER_SELECT", "TYPED"):
                    assert answer == str(int(answer)), (name, answer)  # no sign, no leading zero


# --- Helpers ----------------------------------------------------------------------------------------------------------


def test_number_words_are_british_and_hyphenated() -> None:
    assert [number_word(n) for n in (0, 12, 20, 21, 40, 64, 99, 100)] == [
        "zero", "twelve", "twenty", "twenty-one", "forty", "sixty-four", "ninety-nine", "one hundred",
    ]  # fmt: skip
    with pytest.raises(ValueError):
        number_word(101)


def test_distractors_are_in_range_distinct_never_the_answer_or_removed() -> None:
    wrong = distractors(5, [6, 4, 7, 3, 15, -5, 5, 6], 0, 10, "k")
    assert wrong is not None and len(set(wrong)) == 3 and 5 not in wrong and all(0 <= w <= 10 for w in wrong)
    assert distractors(0, [1, -1, 2, -2, 10, -10], 0, 1, "k") is None  # only one usable: removed from the domain


def test_count_out_never_holds_more_than_12() -> None:
    for instance in full("OBJECT_MOVE", CASES[("COUNT_OUT", 1)][0][2]):
        payload = instance["activityPayload"]
        assert payload["sourceCount"] <= 12
        assert payload["sourceCount"] - instance["params"]["target"] in (2, 3)


def test_order_numbers_never_stores_the_answer_order() -> None:
    for _, interaction_type, template in CASES[("ORDER_NUMBERS", 1)]:
        for instance in full(interaction_type, template):
            stored = ",".join(t["value"] for t in instance["activityPayload"]["tiles"])
            assert stored not in instance["answerSpecification"]["accepted"]


# --- The template check (prepare and the publish check) -------------------------------------------------------------


def rules(problems: list[dict[str, str]]) -> set[tuple[str, str]]:
    return {(p["field"], p["rule"]) for p in problems}


@pytest.mark.parametrize(
    ("interaction_type", "template", "expected"),
    [
        ("TYPED", "not an object", {("template", "type")}),
        (
            "TYPED",
            {"generatorKind": "BOND_TO"},
            {("template.generatorVersion", "required"), ("template.domain", "required")},
        ),
        ("TYPED", {**tpl("BOND_TO", {}), "extra": 1}, {("template.extra", "additionalProperties")}),
        ("TYPED", tpl("MAKE_TEA", {}), {("template.generatorKind", "unknown_generator")}),
        ("TYPED", {**tpl("BOND_TO", {}), "generatorVersion": 2}, {("template.generatorVersion", "unknown_version")}),
        ("PICTURE_SELECT", tpl("PATTERN_NEXT", {}), {("template.generatorKind", "not_supported_yet")}),
        ("ARRANGE", tpl("BOND_TO", {}), {("interactionType", "generator_output")}),
        (
            "TYPED",
            tpl("NUMBER_WORD", {"n": {"min": 1, "max": 20}, "directions": ["NUMERAL_TO_WORD"]}),
            {("interactionType", "generator_output")},
        ),
        (
            "TYPED",
            tpl("BOND_TO", {"totals": [7], "part": {"min": 5, "max": 1}, "forms": ["a = b"], "colour": "red"}),
            {
                ("template.domain.totals", "enum"),
                ("template.domain.part", "range"),
                ("template.domain.forms", "enum"),
                ("template.domain.colour", "additionalProperties"),
            },
        ),
        (
            "NUMBER_SELECT",
            tpl("BOND_TO", {"totals": [10], "part": {"min": 0, "max": 10}, "forms": ["a + ? = T"]}),
            {("template.presentation.numberSet", "required"), ("template.presentation.display", "required")},
        ),
        (
            "TYPED",
            tpl("BOND_TO", {"totals": [10], "part": {"min": 0, "max": 10}, "forms": ["a + ? = T"]}, {"maxLength": 4}),
            {("template.presentation.maxLength", "range")},
        ),
        (
            "MULTIPLE_CHOICE",
            tpl("ADD_WITHIN", {"a": {"min": 1, "max": 9}, "max": 20, "shape": "THREE", "crossTen": "ONLY"}),
            {("template.domain.crossTen", "shape_three")},
        ),
    ],
)
def test_a_template_that_cannot_be_prepared_names_the_field_and_rule(
    interaction_type: str, template: Any, expected: set[tuple[str, str]]
) -> None:
    report = template_report({"interactionType": interaction_type, "template": template})
    assert rules(report.problems) == expected
    assert report.domain_size == 0


def test_publish_refuses_a_template_whose_domain_has_an_invalid_instance() -> None:
    # Bonds to 20 answered on a 0-10 track: every answer above 10 is not on the track.
    template = tpl("BOND_TO", {"totals": [20], "part": {"min": 1, "max": 19}, "forms": ["a + ? = T"]}, TRACK_10)
    report = template_report({"interactionType": "NUMBER_SELECT", "template": template})
    assert report.domain_size == 19
    assert report.problems[0] == {"field": "template.instances.0.answerSpecification.accepted.0", "rule": "not_in_set"}
    assert {p["rule"] for p in report.problems} == {"not_in_set"}
    # Typed answers longer than the keypad allows.
    typed = tpl("ADD_WITHIN", {"a": {"min": 5, "max": 9}, "b": {"min": 5, "max": 9}, "max": 20}, {"maxLength": 1})
    assert ("template.instances.0.answerSpecification.accepted.0", "max_length") in rules(
        template_report({"interactionType": "TYPED", "template": typed}).problems
    )


def test_the_problem_list_is_capped_but_every_instance_is_counted() -> None:
    template = tpl("ADD_WITHIN", {"a": {"min": 0, "max": 40}, "b": {"min": 0, "max": 40}, "max": 80}, TRACK_10)
    report = template_report({"interactionType": "NUMBER_SELECT", "template": template})
    assert len(report.problems) == 10 and report.domain_size == 41 * 41


def test_the_5000_cap_counts_instances_and_refuses_more() -> None:
    # C25.3 rule 1 caps the domain at 5,000 INSTANCES: the pairs a build keeps (a + b <= 100), not the raw pairs.
    def report(a_max: int, b_max: int) -> Any:
        domain = {"a": {"min": 0, "max": a_max}, "b": {"min": 0, "max": b_max}, "max": 100}
        return template_report({"interactionType": "TYPED", "template": tpl("ADD_WITHIN", domain)})

    at_cap = report(84, 95)  # 8,160 raw pairs, exactly 5,000 instances
    assert at_cap.problems == [] and at_cap.domain_size == generators.DOMAIN_MAX == 5000
    over = report(86, 91)  # 8,004 raw pairs, 5,001 instances
    assert rules(over.problems) == {("template.domain", "domain_too_large")}  # refused, never sampled
    assert over.domain_size == 0 and over.sample == []
    within_100 = report(99, 50)  # 5,100 raw pairs, 3,875 instances: allowed (refused when the cap counted raw pairs)
    assert within_100.problems == [] and within_100.domain_size == 3875


def test_enumeration_stops_at_the_work_bound() -> None:
    # MISSING_NUMBER over parts 0-100 in all six forms is 61,206 raw combinations: never enumerated past the bound.
    forms = list(MISSING_FORMS)
    template = tpl("MISSING_NUMBER", {"max": 100, "parts": {"min": 0, "max": 100}, "forms": forms})
    prepared, _ = generators.prepare(template, "TYPED")
    assert prepared is not None and generators.domain_params(prepared) is None
    assert generators.ENUMERATION_MAX == 10 * generators.DOMAIN_MAX
    assert rules(template_report({"interactionType": "TYPED", "template": template}).problems) == {
        ("template.domain", "domain_too_large")
    }


def test_an_empty_domain_is_refused() -> None:
    template = tpl("SKIP_COUNT", {"steps": [10], "start": {"min": 90, "max": 95}, "directions": ["FORWARDS"],
                                  "asks": ["NEXT"], "max": 100})  # fmt: skip
    assert rules(template_report({"interactionType": "TYPED", "template": template}).problems) == {
        ("template.domain", "domain_empty")
    }


# --- TEMPLATE definitions (content.py) ------------------------------------------------------------------------------

MA_0301 = {
    "schemaVersion": 1, "activityId": "ma-0301", "title": "Bonds to 20", "authoringMode": "TEMPLATE",
    "subject": "maths", "topicId": "maths-bonds-to20", "minAge": 6, "maxAge": 7, "rewardCategory": "NORMAL",
    "interactionType": "NUMBER_SELECT", "audioRequirement": "NONE", "speechDefinitionReferences": {},
    "curriculumReference": ["NC14.Ma.Y1.AS-2", "NC14.Ma.Y2.AS-2"],
    # The C25.5 worked record's template, written out as the plan gives it (not taken from CASES).
    "template": {"generatorKind": "BOND_TO", "generatorVersion": 1,
        "domain": {"totals": [20], "part": {"min": 1, "max": 19}, "forms": ["a + ? = T", "? + a = T"]},
        "presentation": {"numberSet": {"kind": "RANGE", "min": 0, "max": 20, "step": 1}, "display": "TRACK"}},
}  # fmt: skip


def test_the_c25_worked_template_record_is_valid() -> None:
    assert definition_problems(MA_0301, "ma-0301") == []
    assert MA_0301["template"] == CASES[("BOND_TO", 1)][0][2]  # the snapshot case is the plan's record
    extras = validation_extras(MA_0301)
    assert extras["domainSize"] == 38
    sample = extras["sample"]
    assert [s["index"] for s in sample] == [0, 9, 18, 27, 37]  # smallest, three middle, largest (C25.3 rule 3)
    assert sample[0]["prompt"] == {"text": "1 + ? = 20"} and sample[0]["answerSpecification"] == {"accepted": ["19"]}
    assert all(s["interactionType"] == "NUMBER_SELECT" for s in sample)
    assert header_fields(MA_0301)["authoringMode"] == "TEMPLATE" and "domainSize" not in header_fields(MA_0301)
    assert header_fields(MA_0301, 38)["domainSize"] == 38
    assert validation_extras({**MA_0301, "authoringMode": "FIXED"}) == {"domainSize": 1}


def test_a_template_refuses_fixed_fields_and_question_clips() -> None:
    doc = {
        **MA_0301,
        "prompt": {"text": "Make 20"},
        "visualAssetReferences": [],
        "speechDefinitionReferences": {"prompt": {"speechId": "x"}, "instruction": {"speechId": "instruction-a"}},
    }
    assert rules(definition_problems(doc, "ma-0301")) == {
        ("prompt", "not_for_template"),
        ("visualAssetReferences", "not_for_template"),
    }
    del doc["prompt"], doc["visualAssetReferences"]
    assert rules(definition_problems(doc, "ma-0301")) == {("speechDefinitionReferences.prompt", "not_for_template")}


def test_a_template_refuses_required_audio_with_one_clear_rule() -> None:
    instruction = {"instruction": {"speechId": "instruction-make-twenty"}}
    for speech in ({}, instruction):
        doc = {**MA_0301, "audioRequirement": "REQUIRED", "speechDefinitionReferences": speech}
        assert rules(definition_problems(doc, "ma-0301")) == {("audioRequirement", "not_for_template")}
    assert (
        definition_problems(
            {**MA_0301, "audioRequirement": "OPTIONAL", "speechDefinitionReferences": instruction}, "ma-0301"
        )
        == []
    )


def test_a_fixed_activity_may_not_carry_a_template() -> None:
    from test_activity_types import EXAMPLES  # the FIXED examples Phase 36 checks

    doc = {**EXAMPLES["multiple-choice"], "template": MA_0301["template"]}
    assert ("template", "not_for_fixed") in rules(definition_problems(doc, doc["activityId"]))


def test_a_template_instance_has_the_shape_of_a_fixed_step() -> None:
    instance = Instance({"n": 1}, "Hi there", {"mode": "NUMERIC", "maxLength": 1}, ("1",))
    assert instance.resolved("K", 1) == {
        "generatorKind": "K",
        "generatorVersion": 1,
        "params": {"n": 1},
        "prompt": {"text": "Hi there"},
        "activityPayload": {"mode": "NUMERIC", "maxLength": 1},
        "answerSpecification": {"accepted": ["1"]},
        "visualAssetReferences": [],
    }
    assert Output("TYPED").max_length == 3
