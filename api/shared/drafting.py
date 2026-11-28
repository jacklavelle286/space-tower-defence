"""AI drafting of activities (YG3; owner 2026-11-28: "generate way more types of questions ... using AI from my admin
portal", on the family edition: "AI drafting in admin"). Shared by admin-api (R63, R64) and picture-gen (the worker).

A drafting job asks the model for up to MAX_DRAFTS questions on one topic of the registry (contracts/topics.json, C19)
for one band (a school year, ADR-0056), as one of the text-only types: MULTIPLE_CHOICE (four options) or TYPED
(a whole number or a word). The model answers in a small fixed JSON shape (`output_schema`, OpenAI structured
outputs), never in the activity format itself: `to_definition` builds each activity from it, with every field the
model does not choose fixed here (FIXED, audio NONE, reward BOTH, no pictures, the band as minAge and maxAge). Each
definition then goes through the same checks as the editor's (`content.definition_problems`); one that fails is
reported as rejected with its problem names, never saved. Nothing a draft says reaches a child until the owner has
read it in the editor, saved it, and published it with the review checklist (C22.3).

Options are put in an order drawn from the job ID, so the correct answer is not always where the model wrote it.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Mapping, Sequence
from typing import Any

from shared.activity_types import CUE_TEXT_MAX, OPTION_TEXT_MAX
from shared.content import definition_problems
from shared.rules.contracts import LIMITS
from shared.topics import TOPICS, Topic

JOB_TYPE = "activity-drafts"
DRAFT_TYPES = ("MULTIPLE_CHOICE", "TYPED")
MAX_DRAFTS = 5
NOTES_MAX = 300
PROMPT_MAX = 120  # content._prompt_problems: 3-120 characters
TITLE_MAX = 60
NUMERIC_MAX = 999  # TYPED NUMERIC answers have at most 3 digits (C20)
WORD = re.compile(r"[a-z][a-z'-]{1,11}")  # TYPED WORD: 2-12 lower-case letters (C20.1)
OPTION_IDS = ("a", "b", "c", "d")
PLACEHOLDER_PREFIX = "draft-"  # a draft's activityId until the owner saves it (the admin gives the next free ID)
_NUMBER_OPTION = re.compile(r"-?\d[\d,]*(\.\d+)?")


def year_name(band: int) -> str:
    """The school year of a band: 5 Reception, 6 Year 1, ... (ADR-0056)."""
    index = band - LIMITS["schoolYears"]["firstBand"]
    names = LIMITS["schoolYears"]["names"]
    return names[index] if 0 <= index < len(names) else f"Year {index}"


def request_problems(doc: Mapping[str, Any]) -> list[dict[str, str]]:
    """R63's drafting fields (topicId, band, interactionType, count, notes?): every problem as {field, rule}."""
    problems: list[dict[str, str]] = []
    topic = TOPICS.get(doc.get("topicId")) if isinstance(doc.get("topicId"), str) else None
    if topic is None:
        problems.append({"field": "topicId", "rule": "unknown_topic"})
    band = doc.get("band")
    if isinstance(band, bool) or not isinstance(band, int):
        problems.append({"field": "band", "rule": "type"})
    elif topic is not None and band not in topic.ages:
        problems.append({"field": "band", "rule": "not_a_topic_band"})
    if doc.get("interactionType") not in DRAFT_TYPES:
        problems.append({"field": "interactionType", "rule": "enum"})
    count = doc.get("count")
    if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= MAX_DRAFTS:
        problems.append({"field": "count", "rule": "range"})
    notes = doc.get("notes")
    if notes is not None and not (isinstance(notes, str) and len(notes) <= NOTES_MAX and notes.isprintable()):
        problems.append({"field": "notes", "rule": "length"})
    return problems


RULES = """You write practice questions for a space tower-defence game played by children in primary schools in England.
A question appears in a small panel between waves of aliens; the child answers by tapping an option or typing.

Rules for every question:
- British English spelling and words; pounds and pence for money; metric units.
- Match the school year and the topic given exactly, as the National Curriculum in England (2014) teaches them in
  that year. Never harder than that year, never a different topic.
- The question is one or two short sentences, at most 120 characters, in words a child in that year can read alone.
  A light space theme (rockets, aliens, astronauts, planets, moon bases) is welcome when it fits.
- Never violence, fear, unkindness, brands, real people, or questions about the child's own life.
- Exactly one answer is correct, and it must be correct: check every calculation, spelling and grammar point twice.
- No pictures, sounds, tables or diagrams: everything the child needs is in the words of the question.
- Every question is different from the others: different numbers, words and contexts.
- "title" is a short label for the owner's list of questions, at most 60 characters.
"""

TYPE_RULES = {
    "MULTIPLE_CHOICE": """This is multiple choice: exactly 4 options, each at most 24 characters, exactly one correct.
The wrong options are mistakes a child in that year really makes, never silly ones. No "all of the above" or "none
of these". "correctOption" is the position (0 to 3) of the correct option in your list.""",
    "TYPED": """The child types the answer. "mode" is NUMERIC for a whole number from 0 to 999, written with digits only
(no commas, units or words), or WORD for one word of 2 to 12 lower-case letters (apostrophes and hyphens allowed).
"hint" is a short clue shown above the answer boxes, at most 40 characters, that never contains the answer (for a
spelling, the word's meaning). Leave it empty for NUMERIC. If the right answer would not fit these rules, write a
different question that does.""",
}


def instructions(interaction_type: str) -> str:
    """The fixed instructions for one type (the same bytes for every job of that type, so a prompt cache can share
    them)."""
    return f"{RULES}\n{TYPE_RULES[interaction_type]}\n"


def user_text(topic: Topic, band: int, count: int, notes: str | None) -> str:
    """The job's own request: the year, the topic and its curriculum references, how many, and the owner's notes."""
    lines = [
        f"School year: {year_name(band)}.",
        f"Subject: {topic.subject}. Topic: {topic.title} ({topic.topic_id}).",
        f"What the child does: {topic.description}",
        f"Curriculum references: {'; '.join(topic.curriculum)}.",
        f"Write {count} different question{'s' if count != 1 else ''}.",
    ]
    if notes:
        lines.append(f"The owner's notes (follow them unless they break a rule above): {notes}")
    return "\n".join(lines)


def output_schema(interaction_type: str) -> dict[str, Any]:
    """The JSON shape the model must answer in (strict structured output: every property required, nothing else)."""
    if interaction_type == "MULTIPLE_CHOICE":
        item: dict[str, Any] = {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "question": {"type": "string"},
                "options": {"type": "array", "items": {"type": "string"}},
                "correctOption": {"type": "integer"},
            },
            "required": ["title", "question", "options", "correctOption"],
            "additionalProperties": False,
        }
    else:
        item = {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "question": {"type": "string"},
                "mode": {"type": "string", "enum": ["NUMERIC", "WORD"]},
                "answer": {"type": "string"},
                "hint": {"type": "string"},
            },
            "required": ["title", "question", "mode", "answer", "hint"],
            "additionalProperties": False,
        }
    return {
        "type": "object",
        "properties": {"drafts": {"type": "array", "items": item}},
        "required": ["drafts"],
        "additionalProperties": False,
    }


def _order(seed: str, index: int) -> list[int]:
    """A permutation of the four option positions, drawn from the job ID and the draft's index."""
    digest = hashlib.sha256(f"{seed}:{index}".encode()).digest()
    positions = [0, 1, 2, 3]
    for i in range(3, 0, -1):  # Fisher-Yates with the digest's bytes
        j = digest[i] % (i + 1)
        positions[i], positions[j] = positions[j], positions[i]
    return positions


def _base(draft: Mapping[str, Any], topic: Topic, band: int, interaction_type: str, index: int) -> dict[str, Any]:
    title = str(draft.get("title", "")).strip()[:TITLE_MAX].strip() or f"{topic.title} {index + 1}"
    return {
        "schemaVersion": 1,
        "activityId": f"{PLACEHOLDER_PREFIX}{index + 1}",
        "title": title,
        "subject": topic.subject,
        "topicId": topic.topic_id,
        "minAge": band,
        "maxAge": band,
        "rewardCategory": "BOTH",
        "interactionType": interaction_type,
        "authoringMode": "FIXED",
        "audioRequirement": "NONE",
        "prompt": {"text": str(draft.get("question", "")).strip()},
        "visualAssetReferences": [],
        "speechDefinitionReferences": {},
    }


def to_definition(
    draft: Mapping[str, Any], *, topic: Topic, band: int, interaction_type: str, index: int, seed: str
) -> dict[str, Any]:
    """The activity definition for one of the model's drafts (shape checked by `definition_problems` after)."""
    definition = _base(draft, topic, band, interaction_type, index)
    if interaction_type == "MULTIPLE_CHOICE":
        raw = draft.get("options")
        texts = [str(o).strip() for o in raw] if isinstance(raw, list) else []
        correct = draft.get("correctOption")
        if len(texts) != 4 or isinstance(correct, bool) or not isinstance(correct, int) or not 0 <= correct < 4:
            texts, correct = texts[:4], -1  # refused below: no option is marked correct
        order = _order(seed, index)
        options = [{"id": OPTION_IDS[n], "text": texts[order[n]]} for n in range(len(texts))] if len(texts) == 4 else []
        numeric = bool(texts) and all(_NUMBER_OPTION.fullmatch(t) for t in texts)
        definition["activityPayload"] = {"optionStyle": "NUMERAL" if numeric else "TEXT", "options": options}
        accepted = [OPTION_IDS[n] for n in range(len(options)) if order[n] == correct]
        definition["answerSpecification"] = {"accepted": accepted}
    else:
        mode = draft.get("mode")
        answer = str(draft.get("answer", "")).strip()
        if mode == "WORD":
            answer = answer.lower()
            payload = {"mode": "WORD", "maxLength": max(2, min(len(answer), 12))}
            hint = str(draft.get("hint", "")).strip()
            if hint:
                payload["cue"] = {"text": hint}  # a word answer needs a cue (C20.1): here, its rule or meaning
        else:
            payload = {"mode": "NUMERIC", "maxLength": max(1, min(len(answer), 3))}
        definition["activityPayload"] = payload
        definition["answerSpecification"] = {"accepted": [answer]}
    return definition


def own_problems(definition: Mapping[str, Any]) -> list[str]:
    """Checks the editor would not make, because a person picks these values: a correct option is marked, and a typed
    answer fits its mode."""
    problems: list[str] = []
    spec = definition.get("answerSpecification") or {}
    accepted = spec.get("accepted") if isinstance(spec, Mapping) else None
    if not accepted:
        problems.append("answerSpecification.accepted:no_correct_answer")
    if definition.get("interactionType") == "TYPED" and accepted:
        answer = accepted[0]
        mode = (definition.get("activityPayload") or {}).get("mode")
        if mode == "NUMERIC" and not (answer.isdigit() and int(answer) <= NUMERIC_MAX):
            problems.append("answerSpecification.accepted:not_a_small_whole_number")
        if mode == "WORD" and not WORD.fullmatch(answer):
            problems.append("answerSpecification.accepted:not_a_word")
        cue = (definition.get("activityPayload") or {}).get("cue") or {}
        if mode == "WORD" and answer and answer in str(cue.get("text", "")).lower():
            problems.append("activityPayload.cue:gives_the_answer")
        if mode == "WORD" and len(str(cue.get("text", ""))) > CUE_TEXT_MAX:
            problems.append("activityPayload.cue:too_long")
    prompt = definition.get("prompt") or {}
    if isinstance(prompt, Mapping) and len(str(prompt.get("text", ""))) > PROMPT_MAX:
        problems.append("prompt.text:too_long")
    for option in (definition.get("activityPayload") or {}).get("options") or []:
        if len(option.get("text", "")) > OPTION_TEXT_MAX:
            problems.append("activityPayload.options:too_long")
            break
    return problems


def drafts_from_reply(
    text: str, *, topic: Topic, band: int, interaction_type: str, count: int, seed: str
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """(definitions that pass every check, rejected drafts as {index, title, problems}) from the model's JSON text.
    ValueError when the text is not the JSON shape asked for at all."""
    doc = json.loads(text)
    drafts = doc.get("drafts") if isinstance(doc, dict) else None
    if not isinstance(drafts, list):
        raise ValueError("no drafts list")
    good: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for index, draft in enumerate(drafts[:count]):
        if not isinstance(draft, Mapping):
            rejected.append({"index": index, "title": "", "problems": ["draft:shape"]})
            continue
        definition = to_definition(
            draft, topic=topic, band=band, interaction_type=interaction_type, index=index, seed=seed
        )
        problems = [f"{p['field']}:{p['rule']}" for p in definition_problems(definition, definition["activityId"])]
        problems += own_problems(definition)
        if problems:
            rejected.append({"index": index, "title": definition["title"], "problems": sorted(set(problems))})
        else:
            good.append(definition)
    return good, rejected


def valid_definitions(items: Sequence[Any]) -> list[dict[str, Any]]:
    """The drafts in a stored result that still pass every check (admin-api re-checks what it reads from S3)."""
    out = []
    for item in items:
        if not isinstance(item, Mapping):
            continue
        activity_id = item.get("activityId")
        if not (isinstance(activity_id, str) and activity_id.startswith(PLACEHOLDER_PREFIX)):
            continue
        if definition_problems(item, activity_id) or own_problems(item):
            continue
        out.append(dict(item))
    return out
