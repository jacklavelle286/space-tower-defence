"""Phase 36 (M3-02): definition checks for all six interaction types and two-step activities (C20.1, C20.3, C22.2).

Pure checks of shared/content.py `definition_problems` and shared/activity_types.py: one valid example per type and
mode (also used by the moto lifecycle tests in test_admin_lifecycle.py), then the per-type rules, the reserved
separators, the 64-character answer limit, two-step joining, pictures from the asset manifest, and the manifest kept in
step with docs/art/asset-catalogue.json.
"""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from conftest import REPO

from shared.activity_types import ASSET_MANIFEST, buildable, number_set_values
from shared.content import definition_problems

BASE: dict[str, Any] = {
    "schemaVersion": 1,
    "title": "Example",
    "rewardCategory": "NORMAL",
    "authoringMode": "FIXED",
    "minAge": 5,
    "maxAge": 6,
    "audioRequirement": "NONE",
    "curriculumReference": ["NC14.Ma.Y1.NPV-1"],
    "prompt": {"text": "Which one is right?"},
    "speechDefinitionReferences": {},
    "source": "HANDWRITTEN",
}


def activity(activity_id: str, subject: str, topic: str, interaction_type: str, **fields: Any) -> dict[str, Any]:
    return {
        **copy.deepcopy(BASE),
        "activityId": activity_id,
        "subject": subject,
        "topicId": topic,
        "interactionType": interaction_type,
        **fields,
    }


def pictures(*ids: str) -> list[dict[str, str]]:
    return [{"id": "abcdef"[i], "assetId": f"pic-{name}", "alt": f"a {name}"} for i, name in enumerate(ids)]


EXAMPLES: dict[str, dict[str, Any]] = {
    "multiple-choice": activity(
        "ma-9001",
        "maths",
        "maths-number-bonds-10",
        "MULTIPLE_CHOICE",
        activityPayload={
            "optionStyle": "NUMERAL",
            "options": [{"id": i, "text": t} for i, t in zip("abcd", ("3", "4", "6", "7"), strict=True)],
        },
        answerSpecification={"accepted": ["c"]},
    ),
    "picture-select": activity(
        "sp-9001",
        "spelling",
        "spelling-cvc-words",
        "PICTURE_SELECT",
        prompt={"text": "Which picture is a cat?"},
        visualAssetReferences=["pic-cat", "pic-dog", "pic-sun", "pic-hat"],
        activityPayload={"options": pictures("cat", "dog", "sun", "hat"), "layout": "GRID"},
        answerSpecification={"accepted": ["a"]},
    ),
    "number-select": activity(
        "ma-9002",
        "maths",
        "maths-count-objects-to10",
        "NUMBER_SELECT",
        prompt={"text": "How many spots?"},
        visualAssetReferences=["dice-5"],
        activityPayload={
            "numberSet": {"kind": "RANGE", "min": 0, "max": 10, "step": 1},
            "display": "TRACK",
            "stimulus": {"assetId": "dice-5", "alt": "a dice"},
        },
        answerSpecification={"accepted": ["5"]},
    ),
    "object-move-distribute": activity(
        "ma-9003",
        "maths",
        "maths-sharing",
        "OBJECT_MOVE",
        prompt={"text": "Share the stars fairly."},
        visualAssetReferences=["obj-star"],
        activityPayload={
            "mode": "DISTRIBUTE",
            "objectAssetId": "obj-star",
            "objectAlt": "a star",
            "sourceCount": 6,
            "zones": [{"id": "z1", "label": "Red rocket"}, {"id": "z2", "label": "Blue rocket"}],
            "requireAllPlaced": True,
        },
        answerSpecification={"accepted": ["z1=3;z2=3"]},
    ),
    "object-move-sort": activity(
        "sp-9002",
        "spelling",
        "spelling-vowel-digraphs",
        "OBJECT_MOVE",
        prompt={"text": "Sort the words by their spelling."},
        activityPayload={
            "mode": "SORT",
            "objects": [
                {"id": "o1", "text": "tree", "alt": "tree"},
                {"id": "o2", "text": "sea", "alt": "sea"},
                {"id": "o3", "text": "feet", "alt": "feet"},
                {"id": "o4", "text": "leaf", "alt": "leaf"},
            ],
            "bins": [{"id": "ee", "label": "ee"}, {"id": "ea", "label": "ea"}],
        },
        answerSpecification={"accepted": ["o1=ee;o2=ea;o3=ee;o4=ea"]},
    ),
    "arrange-letters": activity(
        "sp-9003",
        "spelling",
        "spelling-cvc-words",
        "ARRANGE",
        prompt={"text": "Spell the word."},
        visualAssetReferences=["pic-cat"],
        activityPayload={
            "mode": "LETTERS",
            "tiles": [
                {"id": "t1", "value": "t"},
                {"id": "t2", "value": "a"},
                {"id": "t3", "value": "c"},
                {"id": "t4", "value": "s"},
            ],
            "slots": 3,
            "cue": {"assetId": "pic-cat", "alt": "a cat"},
        },
        answerSpecification={"accepted": ["cat"]},
    ),
    "arrange-sequence": activity(
        "ma-9004",
        "maths",
        "maths-compare-numbers-100",
        "ARRANGE",
        prompt={"text": "Put the numbers in order."},
        activityPayload={
            "mode": "SEQUENCE",
            "tiles": [{"id": f"n{i}", "value": v} for i, v in enumerate(("38", "83", "30", "80"))],
            "slots": 4,
            "orderLabel": "smallest first",
        },
        answerSpecification={"accepted": ["30,38,80,83"]},
    ),
    "typed-numeric": activity(
        "ma-9005",
        "maths",
        "maths-add-within-20",
        "TYPED",
        prompt={"text": "What is 5 add 3?"},
        activityPayload={"mode": "NUMERIC", "maxLength": 2},
        answerSpecification={"accepted": ["8"]},
    ),
    "typed-word": activity(
        "sp-9004",
        "spelling",
        "spelling-suffix-ing",
        "TYPED",
        minAge=6,  # D-7: no typed words at age 5
        maxAge=7,
        prompt={"text": "Add ing to hop."},
        activityPayload={"mode": "WORD", "maxLength": 8, "cue": {"text": "hop + ing"}},
        answerSpecification={"accepted": ["hopping"], "caseSensitive": False},
    ),
    "two-step": activity(
        "ma-9006",
        "maths",
        "maths-place-value",
        "MULTIPLE_CHOICE",
        rewardCategory="METEOR",
        prompt={"text": "How many tens in 34?"},
        activityPayload={
            "optionStyle": "NUMERAL",
            "options": [{"id": i, "text": t} for i, t in zip("abcd", ("2", "4", "3", "5"), strict=True)],
        },
        additionalSteps=[
            {
                "interactionType": "NUMBER_SELECT",
                "prompt": {"text": "So how much are the tens worth?"},
                "activityPayload": {"numberSet": {"kind": "LIST", "values": [10, 20, 30, 40, 50]}, "display": "TRACK"},
                "answerSpecification": {"accepted": ["30"]},
            }
        ],
        answerSpecification={"accepted": ["c|30"]},
    ),
}


def check(definition: dict[str, Any]) -> set[tuple[str, str]]:
    return {(p["field"], p["rule"]) for p in definition_problems(definition, definition["activityId"])}


def changed(name: str, path: str, value: Any) -> dict[str, Any]:
    """A copy of EXAMPLES[name] with the value at dotted `path` replaced (a value of DELETE removes it)."""
    doc = copy.deepcopy(EXAMPLES[name])
    *parents, last = path.split(".")
    target: Any = doc
    for part in parents:
        target = target[int(part)] if isinstance(target, list) else target[part]
    if value is DELETE:
        del target[int(last) if isinstance(target, list) else last]
    elif isinstance(target, list):
        target[int(last)] = value
    else:
        target[last] = value
    return doc


DELETE = object()


@pytest.mark.parametrize("name", sorted(EXAMPLES))
def test_every_example_is_valid(name: str) -> None:
    assert check(EXAMPLES[name]) == set()


@pytest.mark.parametrize(
    ("name", "path", "value", "expected"),
    [
        # MULTIPLE_CHOICE (D-8: four to six options; text unique after case-folding)
        ("multiple-choice", "activityPayload.options.3", DELETE, {("activityPayload.options", "count")}),
        ("multiple-choice", "activityPayload.options.1.text", "3", {("activityPayload.options.1.text", "duplicate")}),
        ("multiple-choice", "answerSpecification.accepted", ["c", "d"],
         {("answerSpecification.accepted", "exactly_one")}),
        # PICTURE_SELECT
        ("picture-select", "activityPayload.options.1.assetId", "pic-cat",
         {("activityPayload.options.1.assetId", "duplicate"), ("visualAssetReferences.1", "asset_unused")}),
        ("picture-select", "activityPayload.options.1.alt", "A cat", {("activityPayload.options.1.alt", "duplicate")}),
        ("picture-select", "activityPayload.options.1.alt", "x" * 61, {("activityPayload.options.1.alt", "length")}),
        ("picture-select", "activityPayload.options.0.assetId", "pic-unicorn",
         {("activityPayload.options.0.assetId", "unknown_asset"),
          ("activityPayload.options.0.assetId", "asset_not_listed"),
          ("visualAssetReferences.0", "asset_unused")}),
        ("picture-select", "visualAssetReferences", ["pic-cat", "pic-dog", "pic-sun"],
         {("activityPayload.options.3.assetId", "asset_not_listed")}),
        ("picture-select", "activityPayload.layout", "ROW", {("activityPayload.layout", "enum")}),
        ("picture-select", "answerSpecification.accepted", ["g"],
         {("answerSpecification.accepted.0", "not_an_option")}),
        # NUMBER_SELECT
        ("number-select", "activityPayload.numberSet", {"kind": "LIST", "values": [2, 3, 4, 5]},
         {("activityPayload.numberSet", "count")}),
        ("number-select", "activityPayload.numberSet.step", 3, {("activityPayload.numberSet", "shape")}),
        ("number-select", "activityPayload.numberSet.max", 101, {("activityPayload.numberSet", "shape")}),
        ("number-select", "activityPayload.numberSet", {"kind": "RANGE", "min": 0, "max": 30, "step": 1},
         {("activityPayload.display", "track_max")}),
        ("number-select", "answerSpecification.accepted", ["05"],
         {("answerSpecification.accepted.0", "answer_format")}),
        ("number-select", "answerSpecification.accepted", ["11"], {("answerSpecification.accepted.0", "not_in_set")}),
        # OBJECT_MOVE DISTRIBUTE
        ("object-move-distribute", "answerSpecification.accepted", ["z2=3;z1=3"],
         {("answerSpecification.accepted.0", "zone_order")}),
        ("object-move-distribute", "answerSpecification.accepted", ["z1=2;z2=3"],
         {("answerSpecification.accepted.0", "all_placed")}),
        ("object-move-distribute", "answerSpecification.accepted", ["z1=4;z2=4"],
         {("answerSpecification.accepted.0", "too_many")}),
        ("object-move-distribute", "activityPayload.zones.0.id", "z;1",
         {("activityPayload.zones.0.id", "pattern"), ("answerSpecification.accepted.0", "zone_order")}),
        ("object-move-distribute", "activityPayload.sourceCount", 13, {("activityPayload.sourceCount", "range")}),
        # OBJECT_MOVE SORT
        ("object-move-sort", "answerSpecification.accepted", ["o1=ee;o2=ee;o3=ee;o4=ee"],
         {("answerSpecification.accepted.0", "bin_empty")}),
        ("object-move-sort", "answerSpecification.accepted", ["o1=ee;o2=ea;o3=ee"],
         {("answerSpecification.accepted.0", "object_order")}),
        ("object-move-sort", "answerSpecification.accepted", ["o1=ee;o2=ai;o3=ee;o4=ea"],
         {("answerSpecification.accepted.0", "not_a_bin")}),
        ("object-move-sort", "activityPayload.bins.1.id", "e|a",
         {("activityPayload.bins.1.id", "pattern"), ("answerSpecification.accepted.0", "not_a_bin")}),
        ("object-move-sort", "activityPayload.objects.0.assetId", "pic-cat",
         {("activityPayload.objects.0", "text_or_asset"), ("activityPayload.objects.0.assetId", "asset_not_listed")}),
        # ARRANGE LETTERS
        ("arrange-letters", "answerSpecification.accepted", ["cast"],
         {("answerSpecification.accepted.0", "not_buildable")}),
        ("arrange-letters", "answerSpecification.accepted", ["tac"],
         {("answerSpecification.accepted.0", "shuffle_spells_answer")}),
        ("arrange-letters", "answerSpecification.accepted", ["acs"],  # a run that does not start at the first tile
         {("answerSpecification.accepted.0", "shuffle_spells_answer")}),
        ("arrange-letters", "activityPayload.slots", 1, {("activityPayload.slots", "range")}),
        ("arrange-letters", "activityPayload.tiles.0.value", "T", {("activityPayload.tiles.0.value", "pattern")}),
        ("arrange-letters", "activityPayload.tiles.0.value", "t,", {("activityPayload.tiles.0.value", "pattern")}),
        ("arrange-letters", "activityPayload.cue", DELETE,
         {("activityPayload.cue", "cue_required"), ("visualAssetReferences.0", "asset_unused")}),
        # ARRANGE SEQUENCE
        ("arrange-sequence", "answerSpecification.accepted", ["30,38,80"],
         {("answerSpecification.accepted.0", "not_a_permutation")}),
        ("arrange-sequence", "answerSpecification.accepted", ["38,83,30,80"],
         {("answerSpecification.accepted.0", "shuffle_spells_answer")}),
        ("arrange-sequence", "activityPayload.slots", 3, {("activityPayload.slots", "all_placed")}),
        ("arrange-sequence", "activityPayload.tiles.1.value", "38",
         {("activityPayload.tiles", "values_distinct"), ("answerSpecification.accepted.0", "not_a_permutation")}),
        ("arrange-sequence", "answerSpecification.accepted", ["30,38,80,83", "30,38,83,80"],
         {("reviewNote", "review_note_required")}),
        # TYPED NUMERIC
        ("typed-numeric", "answerSpecification.accepted", ["08"],
         {("answerSpecification.accepted.0", "answer_format")}),
        ("typed-numeric", "answerSpecification.accepted", ["100"], {("answerSpecification.accepted.0", "max_length")}),
        ("typed-numeric", "activityPayload.maxLength", 4, {("activityPayload.maxLength", "range")}),
        # TYPED WORD
        ("typed-word", "answerSpecification.accepted", ["Hopping"],
         {("answerSpecification.accepted.0", "answer_shape")}),
        ("typed-word", "answerSpecification.accepted", ["hop  ping"],
         {("answerSpecification.accepted.0", "answer_format")}),
        ("typed-word", "answerSpecification.accepted", ["hoppingly"],
         {("answerSpecification.accepted.0", "max_length")}),
        ("typed-word", "answerSpecification.accepted", ["hopping", "hopping"],
         {("answerSpecification.accepted.1", "duplicate")}),
        ("typed-word", "answerSpecification.accepted", ["hopping", "hoping"],
         {("reviewNote", "review_note_required")}),
        ("typed-word", "answerSpecification.caseSensitive", True, {("answerSpecification.caseSensitive", "const")}),
        ("typed-word", "activityPayload.cue", DELETE, {("activityPayload.cue", "cue_required")}),
        ("typed-word", "activityPayload.cue", {"alt": "a frog"},
         {("activityPayload.cue", "empty")}),
        # Two-step (C20.3)
        ("two-step", "answerSpecification.accepted", ["c"], {("answerSpecification.accepted.0", "answer_shape")}),
        ("two-step", "answerSpecification.accepted", ["c|40"], {("answerSpecification.accepted.0", "not_in_step")}),
        ("two-step", "answerSpecification.accepted", ["e|30"], {("answerSpecification.accepted.0", "not_an_option")}),
        ("two-step", "additionalSteps.0.answerSpecification.accepted", ["30", "40"],
         {("additionalSteps.0.answerSpecification.accepted", "exactly_one")}),
        ("two-step", "additionalSteps.0.interactionType", "DRAG", {("additionalSteps.0.interactionType", "enum")}),
        ("two-step", "additionalSteps.0.hint", "x", {("additionalSteps.0.hint", "additionalProperties")}),
        ("two-step", "additionalSteps.1", None, {("additionalSteps", "count")}),
    ],
)  # fmt: skip
def test_type_rules(name: str, path: str, value: Any, expected: set[tuple[str, str]]) -> None:
    if path == "additionalSteps.1":
        doc = copy.deepcopy(EXAMPLES[name])
        doc["additionalSteps"].append(copy.deepcopy(doc["additionalSteps"][0]))
    else:
        doc = changed(name, path, value)
    assert check(doc) == expected


def test_a_review_note_allows_more_than_one_accepted_entry() -> None:
    doc = changed("typed-word", "answerSpecification.accepted", ["colour", "color"])
    doc["reviewNote"] = "Both spellings are taught; British first."
    assert check(doc) == set()


@pytest.mark.parametrize("separator", [";", "=", ",", "|"])
def test_reserved_separators_are_refused_in_every_value(separator: str) -> None:
    """C22.2 rule 7: never inside option IDs, tile values, zone/bin/object IDs or answer values."""
    assert ("activityPayload.options.0.id", "unique_a_to_f") in check(
        changed("multiple-choice", "activityPayload.options.0.id", f"a{separator}")
    )
    assert ("activityPayload.tiles.0.value", "pattern") in check(
        changed("arrange-letters", "activityPayload.tiles.0.value", f"t{separator}")
    )
    assert ("activityPayload.tiles.0.value", "pattern") in check(
        changed("arrange-sequence", "activityPayload.tiles.0.value", f"3{separator}8")
    )
    for path in ("activityPayload.objects.0.id", "activityPayload.bins.0.id"):
        assert (path, "pattern") in check(changed("object-move-sort", path, f"o{separator}1"))
    assert ("activityPayload.zones.0.id", "pattern") in check(
        changed("object-move-distribute", "activityPayload.zones.0.id", f"z{separator}1")
    )
    word = check(changed("typed-word", "answerSpecification.accepted", [f"hop{separator}ping"]))
    assert word == {("answerSpecification.accepted.0", "answer_format")}


def test_one_answer_string_is_at_most_64_characters() -> None:
    long_word = changed("typed-word", "answerSpecification.accepted", ["a" * 65])
    assert check(long_word) == {("answerSpecification.accepted.0", "answer_shape")}
    doc = copy.deepcopy(EXAMPLES["two-step"])  # the joined answer counts as one string too
    doc["activityPayload"]["options"][2] = {"id": "c", "text": "3"}
    assert len("c|30") <= 64 and check(doc) == set()


def test_speech_variants_follow_the_payload() -> None:
    doc = copy.deepcopy(EXAMPLES["object-move-sort"])
    doc["speechDefinitionReferences"] = {"bin-ee": {"speechId": "word-ee"}, "bin-oo": {"speechId": "word-oo"}}
    assert check(doc) == {("speechDefinitionReferences.bin-oo", "not_a_bin")}
    doc = copy.deepcopy(EXAMPLES["picture-select"])
    doc["speechDefinitionReferences"] = {"option-a": {"speechId": "word-cat"}, "intro-1": {"speechId": "x"}}
    assert check(doc) == {("speechDefinitionReferences.intro-1", "not_supported_yet")}


def test_a_prompt_clip_is_a_cue() -> None:
    doc = changed("typed-word", "activityPayload.cue", DELETE)
    doc["speechDefinitionReferences"] = {"prompt": {"speechId": "dictation-hopping"}}
    assert check(doc) == set()


def test_templates_and_demonstrations_are_still_refused() -> None:
    doc = {**copy.deepcopy(EXAMPLES["multiple-choice"]), "introductionContent": {"cards": []}}
    assert check(doc) == {("introductionContent", "not_supported_yet")}
    doc = {**copy.deepcopy(EXAMPLES["multiple-choice"]), "authoringMode": "TEMPLATE"}
    assert ("authoringMode", "not_supported_yet") in check(doc)


def test_buildable_uses_tile_values_not_identities() -> None:
    assert buildable("moon", ["m", "o", "o", "n"], 4)
    assert buildable("ship", ["sh", "i", "p", "s"], 3)
    assert not buildable("ship", ["sh", "i", "p", "s"], 4)
    assert not buildable("moon", ["m", "o", "n", "x"], 4)


def test_number_sets() -> None:
    assert number_set_values({"kind": "RANGE", "min": 10, "max": 50, "step": 10}) == [10, 20, 30, 40, 50]
    assert number_set_values({"kind": "LIST", "values": [3, 1, 2]}) == [3, 1, 2]
    assert number_set_values({"kind": "LIST", "values": [1, 1]}) is None
    assert number_set_values({"kind": "LIST", "values": [True]}) is None
    assert number_set_values({"kind": "RANGE", "min": 0, "max": 10, "step": 0}) is None


def test_the_asset_manifest_matches_the_catalogue() -> None:
    """shared/activity_assets.json lists exactly the shipped 'activity' family of docs/art/asset-catalogue.json."""
    catalogue = json.loads((REPO / "docs" / "art" / "asset-catalogue.json").read_text())
    expected = sorted(a["id"] for a in catalogue["assets"] if a["family"] == "activity" and a.get("appPath"))
    manifest = json.loads(ASSET_MANIFEST.read_text())
    assert [a["id"] for a in manifest["assets"]] == expected
    assert all(a["textFree"] is True for a in manifest["assets"])
    for asset in catalogue["assets"]:
        if asset["id"] in expected:
            assert (REPO / asset["appPath"]).is_file(), asset["appPath"]


def test_typed_words_are_refused_at_age_5() -> None:
    """D-7: no typed word answers at age 5 (letter tiles instead); typed numbers are fine."""
    doc = copy.deepcopy(EXAMPLES["typed-word"])
    doc["minAge"], doc["maxAge"] = 5, 6
    assert check(doc) == {("activityPayload.mode", "typed_word_age5")}
    two = copy.deepcopy(EXAMPLES["two-step"])
    two["additionalSteps"][0] = {
        "interactionType": "TYPED",
        "prompt": {"text": "Write the word."},
        "activityPayload": {"mode": "WORD", "maxLength": 8, "cue": {"text": "hop + ing"}},
        "answerSpecification": {"accepted": ["hopping"]},
    }
    assert ("additionalSteps.0.activityPayload.mode", "typed_word_age5") in check(two)
    assert check(EXAMPLES["typed-numeric"]) == set()
