# ruff: noqa: RUF001 - questions use the multiplication sign children see, not the letter x
"""AI drafting (YG3): the request rules, the instructions, the answer shape, and turning the model's drafts into
activities that pass the editor's checks (or are rejected with their problems, never saved)."""

from __future__ import annotations

import json

import pytest

from shared import drafting
from shared.topics import TOPICS

TABLES = TOPICS["maths-times-tables-3-4-8"]  # Year 3 (band 8): MC, TY
A_OR_AN = TOPICS["grammar-a-or-an"]  # Year 3 grammar: MC


def mc(question: str = "What is 8 × 7?", options=("54", "56", "63", "48"), correct: int = 1, title: str = "8 × 7"):
    return {"title": title, "question": question, "options": list(options), "correctOption": correct}


def reply(*drafts) -> str:
    return json.dumps({"drafts": list(drafts)})


def test_a_request_names_a_topic_one_of_its_bands_a_text_type_and_a_count() -> None:
    good = {"topicId": TABLES.topic_id, "band": 8, "interactionType": "TYPED", "count": 3}
    assert drafting.request_problems(good) == []
    assert drafting.request_problems({**good, "notes": "use the 8 times table"}) == []
    bad = {
        "topicId": "maths-made-up",
        "band": True,
        "interactionType": "PICTURE_SELECT",
        "count": 9,
        "notes": "x" * 301,
    }
    assert {p["field"] for p in drafting.request_problems(bad)} == {
        "topicId",
        "band",
        "interactionType",
        "count",
        "notes",
    }
    assert drafting.request_problems({**good, "band": 9}) == [{"field": "band", "rule": "not_a_topic_band"}]


def test_the_instructions_name_the_year_the_topic_and_the_owners_notes() -> None:
    text = drafting.user_text(TABLES, 8, 3, "space theme please")
    assert "School year: Year 3." in text and "Topic: Times tables 3, 4, 8" in text
    assert "NC14.Ma.Y3.MD-1" in text and "Write 3 different questions." in text and "space theme please" in text
    assert "British English" in drafting.instructions("TYPED") and "NUMERIC" in drafting.instructions("TYPED")
    assert drafting.instructions("MULTIPLE_CHOICE") == drafting.instructions("MULTIPLE_CHOICE")  # fixed bytes
    schema = drafting.output_schema("MULTIPLE_CHOICE")
    item = schema["properties"]["drafts"]["items"]
    assert item["additionalProperties"] is False and set(item["required"]) == set(item["properties"])


def test_a_multiple_choice_draft_becomes_an_activity_that_passes_the_editors_checks() -> None:
    good, rejected = drafting.drafts_from_reply(
        reply(mc()), topic=TABLES, band=8, interaction_type="MULTIPLE_CHOICE", count=1, seed="job-1"
    )
    assert rejected == []
    [definition] = good
    assert definition["activityId"] == "draft-1" and (definition["minAge"], definition["maxAge"]) == (8, 8)
    assert definition["subject"] == "maths" and definition["rewardCategory"] == "BOTH"
    options = {o["id"]: o["text"] for o in definition["activityPayload"]["options"]}
    assert sorted(options.values()) == ["48", "54", "56", "63"]
    assert definition["activityPayload"]["optionStyle"] == "NUMERAL"
    [accepted] = definition["answerSpecification"]["accepted"]
    assert options[accepted] == "56"  # the correct answer survives the reordering


def test_the_correct_option_is_not_always_in_the_same_place() -> None:
    places = set()
    for n in range(12):
        [definition], _ = drafting.drafts_from_reply(
            reply(mc()), topic=TABLES, band=8, interaction_type="MULTIPLE_CHOICE", count=1, seed=f"job-{n}"
        )
        places.add(definition["answerSpecification"]["accepted"][0])
    assert len(places) > 1


def test_typed_drafts_fit_their_mode() -> None:
    drafts = [
        {"title": "8 × 6", "question": "What is 8 × 6?", "mode": "NUMERIC", "answer": "48", "hint": ""},
        {"title": "Too big", "question": "What is 125 × 8?", "mode": "NUMERIC", "answer": "1000", "hint": ""},
        {
            "title": "A word",
            "question": "Spell the number 8 × 1.",
            "mode": "WORD",
            "answer": "Eight",
            "hint": "a number",
        },
        {"title": "Gives it away", "question": "Spell it.", "mode": "WORD", "answer": "eight", "hint": "eight"},
    ]
    good, rejected = drafting.drafts_from_reply(
        reply(*drafts), topic=TABLES, band=8, interaction_type="TYPED", count=4, seed="j"
    )
    assert [d["answerSpecification"]["accepted"] for d in good] == [["48"], ["eight"]]
    assert good[0]["activityPayload"] == {"mode": "NUMERIC", "maxLength": 2}
    assert good[1]["activityPayload"]["cue"] == {"text": "a number"}
    assert [r["title"] for r in rejected] == ["Too big", "Gives it away"]
    assert "activityPayload.cue:gives_the_answer" in rejected[1]["problems"]
    assert any("not_a_small_whole_number" in p for p in rejected[0]["problems"])


def test_drafts_that_break_a_rule_are_rejected_with_their_problems() -> None:
    drafts = [
        mc(options=("an", "a", "the")),  # three options
        mc(correct=7),  # no correct option
        mc(question="x" * 130),  # too long for the panel
        mc(options=("an", "an", "a", "the")),  # duplicate options
        mc(question="Which word fits: ___ alien?", options=("a", "an", "the", "one"), correct=1, title="an alien"),
    ]
    good, rejected = drafting.drafts_from_reply(
        reply(*drafts), topic=A_OR_AN, band=8, interaction_type="MULTIPLE_CHOICE", count=5, seed="j"
    )
    assert [d["title"] for d in good] == ["an alien"]
    assert [r["index"] for r in rejected] == [0, 1, 2, 3]
    assert all(r["problems"] for r in rejected)


def test_only_the_asked_number_of_drafts_is_kept_and_a_bad_reply_is_an_error() -> None:
    good, _ = drafting.drafts_from_reply(
        reply(mc(), mc(title="second")), topic=TABLES, band=8, interaction_type="MULTIPLE_CHOICE", count=1, seed="j"
    )
    assert len(good) == 1
    with pytest.raises(ValueError):
        drafting.drafts_from_reply(
            "not json", topic=TABLES, band=8, interaction_type="MULTIPLE_CHOICE", count=1, seed="j"
        )
    with pytest.raises(ValueError):
        drafting.drafts_from_reply("{}", topic=TABLES, band=8, interaction_type="MULTIPLE_CHOICE", count=1, seed="j")


def test_a_stored_result_is_checked_again() -> None:
    good, _ = drafting.drafts_from_reply(
        reply(mc()), topic=TABLES, band=8, interaction_type="MULTIPLE_CHOICE", count=1, seed="j"
    )
    tampered = {**good[0], "answerSpecification": {"accepted": []}}
    renamed = {**good[0], "activityId": "ma-0001"}
    assert drafting.valid_definitions([good[0], tampered, renamed, "junk"]) == [good[0]]
