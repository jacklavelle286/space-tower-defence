"""The `content` table: item shapes, draft checks and publish checks for speech and activities (Phase 20, M1-19).

Spine S8.3, F §12.6 and G §12 name the items; `admin-api` writes them and `scripts/seed_content.py` creates the first
drafts with the same builders, so a seeded draft is exactly what R18/R23 would have made:

    speech header     pk SPEECH            sk <speechId>      title, kind, state (DRAFT | APPROVED), approvedVersion,
                                                              fromDraftRevision, createdBy, createdAt, updatedAt
    speech draft      pk SPEECH#<speechId> sk DRAFT           kind, provider "polly", text | ssml, draftRevision,
                                                              updatedBy, updatedAt
    speech version    pk SPEECH#<speechId> sk V#<versionId>   kind, provider, engine, voiceId, text | ssml, clipKey,
                                                              sha256, renderedAt, approvedAt, review, fromDraftRevision
    activity header   pk ACT               sk <activityId>    what selection reads (shared/selection/bank.py)
    activity draft    pk ACT#<activityId>  sk DRAFT           definition, draftRevision, updatedBy, updatedAt
    activity version  pk ACT#<activityId>  sk V#<versionId>   the definition's fields at the top level, speech
                                                              refs resolved to {speechId, speechVersion, clipKey},
                                                              review, publishedBy, publishedAt, fromDraftRevision,
                                                              definitionHash
    audit             pk AUDIT#<yyyy-mm>   sk <timestamp>#<id> action, speechId | activityId, versionId, by

A speech draft does not store `engine` or `voiceId`: they come from server configuration by kind (E §E.4.1a) and are
shown on read (R19) and recorded on the approved version. The version ID is the UTC time of approval or publication,
`20261120T120000Z`; "v3" is derived by counting (spine S8.3).

Activity definitions: the subset of C22.1 that Milestone 1 needs, FIXED MULTIPLE_CHOICE only. Other types, templates,
pictures, extra steps and demonstrations are refused with rule `not_supported_yet` until their phases (35-41). A draft
saves freely (only its size, its ID and the locked identity fields are checked); validate and publish run every check.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable, Mapping
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from shared.clipkey import KINDS, PROVIDER
from shared.rules.contracts import LIMITS

SPEECH_PK = "SPEECH"
ACT_PK = "ACT"
DRAFT_SK = "DRAFT"
VERSION_PREFIX = "V#"

KEY_ID = re.compile(LIMITS["ids"]["keyId"].removeprefix("^").removesuffix("$"))
VARIANT = re.compile(r"prompt|instruction|answer|option-[a-f]|bin-[a-z0-9]{1,8}|intro-[1-3]")  # G R15
VERSION_ID = re.compile(r"[0-9]{8}T[0-9]{6}Z")
TITLE_MAX = 80
AGE_BANDS: tuple[int, ...] = tuple(LIMITS["ageBands"])
SUBJECTS = ("maths", "phonics", "spelling")
REWARD_CATEGORIES = ("NORMAL", "METEOR")
INTERACTION_TYPES = ("MULTIPLE_CHOICE", "PICTURE_SELECT", "NUMBER_SELECT", "TYPED", "ARRANGE", "OBJECT_MOVE")
AUTHORING_MODES = ("FIXED", "TEMPLATE")
AUDIO_REQUIREMENTS = ("NONE", "OPTIONAL", "REQUIRED")
OPTION_STYLES = ("TEXT", "GRAPHEME", "WORD", "NUMERAL")
SOURCES = ("HANDWRITTEN", "TEMPLATE", "IMPORT", "AI_ASSISTED")
IDENTITY_FIELDS = ("subject", "topicId", "rewardCategory", "authoringMode", "interactionType")  # spine S5.2
DEFINITION_MAX_BYTES = 8192  # C22.1: a published definition is capped at 8 KB of JSON
CURRICULUM_CODE = re.compile(r"[A-Za-z0-9.-]{1,40}")
OPTION_IDS = ("a", "b", "c", "d", "e", "f")

# D §D8.4 / C22.3: the seven publish checklist lines, all required (rule checklist_incomplete). Names [ASSUMPTION].
CHECKLIST = (
    "workedAnswer",  # I worked the answer out myself and it matches the specification
    "oneRightAnswer",  # exactly one right answer
    "wordingSuitsAge",  # wording suits the youngest age, British spelling
    "picturesClear",  # pictures unambiguous, alt text neutral
    "listenedToClips",  # I listened to every clip
    "noTraps",  # no homophone, heteronym or accent trap
    "nothingPersonal",  # nothing personal, branded or frightening
)


Problem = dict[str, str]


def problem(field: str, rule: str) -> Problem:
    return {"field": field, "rule": rule}


# --- Time, keys and numbers -----------------------------------------------------------------------------------------


def iso_z(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def version_id(moment: datetime) -> str:
    """The non-reusable version ID: the UTC moment of approval or publication (spine S8.3)."""
    return moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def audit_key(moment: datetime, item_id: str) -> tuple[str, str]:
    return f"AUDIT#{moment.astimezone(UTC).strftime('%Y-%m')}", f"{iso_z(moment)}#{item_id}"


def speech_pk(speech_id: str) -> str:
    return f"{SPEECH_PK}#{speech_id}"


def activity_pk(activity_id: str) -> str:
    return f"{ACT_PK}#{activity_id}"


def as_int(value: Any) -> int | None:
    """An integer from JSON or DynamoDB (Decimal); None for anything else, booleans included."""
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, Decimal) and value == value.to_integral_value():
        return int(value)
    return None


def plain(value: Any) -> Any:
    """DynamoDB values as JSON values: Decimal -> int (or float), maps and lists recursively."""
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, Mapping):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [plain(v) for v in value]
    return value


def canonical_json(value: Any) -> bytes:
    return json.dumps(plain(value), sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def definition_hash(definition: Mapping[str, Any]) -> str:
    """SHA-256 over the canonical published definition (C22.1 `definitionHash`): proves the version never changed."""
    return hashlib.sha256(canonical_json(definition)).hexdigest()


def valid_title(value: Any) -> bool:
    return isinstance(value, str) and 0 < len(value.strip()) <= TITLE_MAX and not _has_control(value)


def _has_control(value: str) -> bool:
    return any(ord(ch) < 32 or ord(ch) == 127 for ch in value)


# --- Speech items ---------------------------------------------------------------------------------------------------


def new_speech_items(
    *,
    speech_id: str,
    title: str,
    kind: str,
    by: str,
    at: datetime,
    text: str | None = None,
    ssml: str | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """A new speech definition: header + draft (draftRevision 0). Text or SSML only from a seed; R18 makes it empty."""
    if not KEY_ID.fullmatch(speech_id) or kind not in KINDS or not valid_title(title):
        raise ValueError("speech definition identity is invalid")
    if text is not None and ssml is not None:
        raise ValueError("a draft holds text or ssml, not both")
    now = iso_z(at)
    header = {
        "pk": SPEECH_PK,
        "sk": speech_id,
        "speechId": speech_id,
        "title": title.strip(),
        "kind": kind,
        "state": "DRAFT",
        "createdBy": by,
        "createdAt": now,
        "updatedAt": now,
    }
    draft: dict[str, Any] = {
        "pk": speech_pk(speech_id),
        "sk": DRAFT_SK,
        "speechId": speech_id,
        "kind": kind,
        "provider": PROVIDER,
        "draftRevision": 0,
        "updatedBy": by,
        "updatedAt": now,
    }
    if text is not None:
        draft["text"] = text
    if ssml is not None:
        draft["ssml"] = ssml
    return header, draft


def speech_body(draft: Mapping[str, Any]) -> tuple[str | None, str | None]:
    """(text, ssml) of a stored draft or version; at most one is set."""
    text, ssml = draft.get("text"), draft.get("ssml")
    return (text if isinstance(text, str) else None), (ssml if isinstance(ssml, str) else None)


# --- Activity items -------------------------------------------------------------------------------------------------

CREATE_FIELDS = (
    "activityId",
    "title",
    "subject",
    "topicId",
    "rewardCategory",
    "interactionType",
    "authoringMode",
    "minAge",
    "maxAge",
)


def header_fields(definition: Mapping[str, Any]) -> dict[str, Any]:
    """The header attributes a definition sets (spine S8.3: what selection and bank status read)."""
    fields = {name: definition.get(name) for name in ("title", *IDENTITY_FIELDS, "minAge", "maxAge")}
    fields["domainSize"] = 1  # FIXED activities; templates count their domain (C25, later phases)
    return {name: plain(value) for name, value in fields.items() if value is not None}


def new_activity_items(
    *, definition: Mapping[str, Any], by: str, at: datetime
) -> tuple[dict[str, Any], dict[str, Any]]:
    """A new activity: header (state DRAFT) + draft (draftRevision 0) holding `definition`."""
    activity_id = definition.get("activityId")
    if not isinstance(activity_id, str) or not KEY_ID.fullmatch(activity_id):
        raise ValueError("activityId is invalid")
    now = iso_z(at)
    header = {
        "pk": ACT_PK,
        "sk": activity_id,
        "activityId": activity_id,
        **header_fields(definition),
        "state": "DRAFT",
        "createdBy": by,
        "createdAt": now,
        "updatedAt": now,
    }
    draft = {
        "pk": activity_pk(activity_id),
        "sk": DRAFT_SK,
        "activityId": activity_id,
        "definition": dict(definition),
        "draftRevision": 0,
        "updatedBy": by,
        "updatedAt": now,
    }
    return header, draft


def initial_definition(fields: Mapping[str, Any]) -> dict[str, Any]:
    """The draft R23 creates from its identity fields: everything else is filled in by the editor."""
    definition: dict[str, Any] = {"schemaVersion": 1}
    definition.update({name: fields[name] for name in CREATE_FIELDS if name in fields})
    return definition


def check_create_fields(body: Mapping[str, Any]) -> list[Problem]:
    """R23's body: the identity fields, every one required, nothing else."""
    problems = [problem(name, "additionalProperties") for name in body if name not in CREATE_FIELDS]
    for name in CREATE_FIELDS:
        if name not in body:
            problems.append(problem(name, "required"))
    if problems:
        return problems
    return _identity_problems(body, "")


def _identity_problems(doc: Mapping[str, Any], prefix: str) -> list[Problem]:
    problems: list[Problem] = []
    if not (isinstance(doc.get("activityId"), str) and KEY_ID.fullmatch(doc["activityId"])):
        problems.append(problem(f"{prefix}activityId", "pattern"))
    if not valid_title(doc.get("title")):
        problems.append(problem(f"{prefix}title", "pattern"))
    subject = doc.get("subject")
    if subject not in SUBJECTS:
        problems.append(problem(f"{prefix}subject", "enum"))
    topic = doc.get("topicId")
    if not (isinstance(topic, str) and KEY_ID.fullmatch(topic)):
        problems.append(problem(f"{prefix}topicId", "pattern"))
    elif subject in SUBJECTS and not topic.startswith(f"{subject}-"):
        # No topic registry yet (C22.2 rule 2); topic IDs start with their subject (C16.2) [ASSUMPTION].
        problems.append(problem(f"{prefix}topicId", "topic_subject"))
    if doc.get("rewardCategory") not in REWARD_CATEGORIES:
        problems.append(problem(f"{prefix}rewardCategory", "enum"))
    if doc.get("interactionType") not in INTERACTION_TYPES:
        problems.append(problem(f"{prefix}interactionType", "enum"))
    if doc.get("authoringMode") not in AUTHORING_MODES:
        problems.append(problem(f"{prefix}authoringMode", "enum"))
    low, high = as_int(doc.get("minAge")), as_int(doc.get("maxAge"))
    if low not in AGE_BANDS:
        problems.append(problem(f"{prefix}minAge", "range"))
    if high not in AGE_BANDS:
        problems.append(problem(f"{prefix}maxAge", "range"))
    if low is not None and high is not None and low in AGE_BANDS and high in AGE_BANDS and not low <= high <= low + 1:
        problems.append(problem(f"{prefix}maxAge", "age_span"))
    return problems


def locked_problems(header: Mapping[str, Any], definition: Mapping[str, Any]) -> list[Problem]:
    """Identity fields may not change once a version has been published (spine S5.2, G R25)."""
    if not header.get("publishedVersion"):
        return []
    return [
        problem(name, "locked_after_publish")
        for name in IDENTITY_FIELDS
        if name in header and definition.get(name) != header.get(name)
    ]


# --- Definition checks (validate and publish, C22.2 subset) ----------------------------------------------------------

DEFINITION_FIELDS = frozenset(
    {
        *CREATE_FIELDS,
        "schemaVersion",
        "audioRequirement",
        "curriculumReference",
        "curriculumNote",
        "prompt",
        "visualAssetReferences",
        "activityPayload",
        "answerSpecification",
        "speechDefinitionReferences",
        "source",
    }
)
NOT_YET = frozenset({"additionalSteps", "introductionContent", "template"})  # their phases add them
REQUIRED_DEFINITION_FIELDS = (
    "schemaVersion",
    *CREATE_FIELDS,
    "audioRequirement",
    "curriculumReference",
    "prompt",
    "activityPayload",
    "answerSpecification",
    "speechDefinitionReferences",
)


def _text(value: Any, low: int, high: int) -> bool:
    return isinstance(value, str) and low <= len(value) <= high and value == value.strip() and not _has_control(value)


def _options_problems(payload: Any) -> tuple[list[Problem], list[str]]:
    if not isinstance(payload, Mapping):
        return [problem("activityPayload", "type")], []
    allowed = {"optionStyle", "options"}
    problems = [problem(f"activityPayload.{k}", "additionalProperties") for k in payload if k not in allowed]
    if payload.get("optionStyle") not in OPTION_STYLES:
        problems.append(problem("activityPayload.optionStyle", "enum"))
    options = payload.get("options")
    if not isinstance(options, list):
        return [*problems, problem("activityPayload.options", "type")], []
    if not 4 <= len(options) <= 6:
        problems.append(problem("activityPayload.options", "count"))  # at least four (C20.2)
    ids: list[str] = []
    seen_texts: set[str] = set()
    for index, option in enumerate(options):
        field = f"activityPayload.options.{index}"
        if not isinstance(option, Mapping) or set(option) != {"id", "text"}:
            problems.append(problem(field, "shape"))
            continue
        option_id, text = option["id"], option["text"]
        if option_id not in OPTION_IDS or option_id in ids:
            problems.append(problem(f"{field}.id", "unique_a_to_f"))
        else:
            ids.append(option_id)
        if not _text(text, 1, 24):
            problems.append(problem(f"{field}.text", "length"))
        elif text.casefold() in seen_texts:
            problems.append(problem(f"{field}.text", "duplicate"))
        else:
            seen_texts.add(text.casefold())
    return problems, ids


def definition_problems(definition: Any, activity_id: str) -> list[Problem]:
    """Every C22.2 check that needs only the definition itself (speech approval is checked against the table)."""
    if not isinstance(definition, Mapping):
        return [problem("definition", "type")]
    problems: list[Problem] = []
    for name in definition:
        if name in NOT_YET:
            problems.append(problem(name, "not_supported_yet"))
        elif name not in DEFINITION_FIELDS:
            problems.append(problem(name, "additionalProperties"))
    for name in REQUIRED_DEFINITION_FIELDS:
        if name not in definition:
            problems.append(problem(name, "required"))
    if len(canonical_json(definition)) > DEFINITION_MAX_BYTES:
        problems.append(problem("definition", "max_bytes"))
    if problems:
        return problems

    if as_int(definition["schemaVersion"]) != 1:
        problems.append(problem("schemaVersion", "const"))
    problems.extend(_identity_problems(definition, ""))
    if definition["activityId"] != activity_id:
        problems.append(problem("activityId", "matches_path"))
    if definition["interactionType"] in INTERACTION_TYPES and definition["interactionType"] != "MULTIPLE_CHOICE":
        problems.append(problem("interactionType", "not_supported_yet"))  # other panels arrive in M3 (Phase 37-38)
    if definition["authoringMode"] == "TEMPLATE":
        problems.append(problem("authoringMode", "not_supported_yet"))  # generators arrive in Phase 41
    if definition["audioRequirement"] not in AUDIO_REQUIREMENTS:
        problems.append(problem("audioRequirement", "enum"))
    refs = definition["curriculumReference"]
    if not (isinstance(refs, list) and 1 <= len(refs) <= 4 and all(_curriculum(r) for r in refs)):
        problems.append(problem("curriculumReference", "pattern"))
    if "curriculumNote" in definition and not _text(definition["curriculumNote"], 1, 200):
        problems.append(problem("curriculumNote", "length"))
    if "source" in definition and definition["source"] not in SOURCES:
        problems.append(problem("source", "enum"))
    if "visualAssetReferences" in definition and definition["visualAssetReferences"] != []:
        problems.append(problem("visualAssetReferences", "not_supported_yet"))  # asset manifest check: Phase 36
    prompt = definition["prompt"]
    if not (isinstance(prompt, Mapping) and set(prompt) == {"text"} and _text(prompt["text"], 3, 120)):
        problems.append(problem("prompt.text", "length"))
    elif "<" in prompt["text"] or ">" in prompt["text"]:
        problems.append(problem("prompt.text", "markup"))

    option_problems, option_ids = _options_problems(definition["activityPayload"])
    problems.extend(option_problems)
    answer = definition["answerSpecification"]
    accepted = answer.get("accepted") if isinstance(answer, Mapping) and set(answer) == {"accepted"} else None
    if not (isinstance(accepted, list) and len(accepted) == 1 and isinstance(accepted[0], str)):
        problems.append(problem("answerSpecification.accepted", "exactly_one"))
    elif accepted[0] not in option_ids:
        problems.append(problem("answerSpecification.accepted", "not_an_option"))

    speech = definition["speechDefinitionReferences"]
    if not isinstance(speech, Mapping):
        problems.append(problem("speechDefinitionReferences", "type"))
        return problems
    for variant, ref in speech.items():
        field = f"speechDefinitionReferences.{variant}"
        if not (isinstance(variant, str) and VARIANT.fullmatch(variant)):
            problems.append(problem(field, "variant"))
        elif variant.startswith("option-") and variant.removeprefix("option-") not in option_ids:
            problems.append(problem(field, "not_an_option"))
        elif variant.startswith(("bin-", "intro-")):
            problems.append(problem(field, "not_supported_yet"))
        if not (isinstance(ref, Mapping) and set(ref) == {"speechId"} and isinstance(ref["speechId"], str)):
            problems.append(problem(field, "shape"))
        elif not KEY_ID.fullmatch(ref["speechId"]):
            problems.append(problem(f"{field}.speechId", "pattern"))
    clip_variants = [v for v in speech if isinstance(v, str) and (v == "prompt" or v.startswith(("option-", "bin-")))]
    if definition["audioRequirement"] == "REQUIRED" and not clip_variants:
        problems.append(problem("speechDefinitionReferences", "audio_required"))  # C22.2 rule 5
    if definition["subject"] == "phonics" and not speech:
        problems.append(problem("speechDefinitionReferences", "phonics_needs_clip"))  # C22.2 rule 6, D9.5 Q6
    return problems


def _curriculum(value: Any) -> bool:
    return isinstance(value, str) and bool(CURRICULUM_CODE.fullmatch(value))


def speech_refs(definition: Mapping[str, Any]) -> dict[str, str]:
    """variant -> speechId of a draft definition (only well-formed entries)."""
    refs = definition.get("speechDefinitionReferences")
    out: dict[str, str] = {}
    if isinstance(refs, Mapping):
        for variant, ref in refs.items():
            speech_id = ref.get("speechId") if isinstance(ref, Mapping) else None
            if isinstance(variant, str) and isinstance(speech_id, str):
                out[variant] = speech_id
    return out


def approval_problems(refs: Mapping[str, str], headers: Mapping[str, Mapping[str, Any] | None]) -> list[Problem]:
    """C22.2 rule 5: every referenced speech definition has an approved version (header state APPROVED)."""
    problems = []
    for variant, speech_id in sorted(refs.items()):
        header = headers.get(speech_id)
        if header is None or header.get("state") != "APPROVED" or not header.get("approvedVersion"):
            problems.append(problem(f"speechDefinitionReferences.{variant}", "speech_not_approved"))
    return problems


def checklist_problems(review: Any, draft_revision: int) -> list[Problem]:
    """R27's `review`: all seven lines ticked, and the preview was solved on this exact revision (D §D8.4)."""
    if not isinstance(review, Mapping) or set(review) - {"checklist", "previewSolvedDraftRevision"}:
        return [problem("review", "shape")]
    problems: list[Problem] = []
    checklist = review.get("checklist")
    if not (isinstance(checklist, Mapping) and set(checklist) <= set(CHECKLIST)):
        problems.append(problem("review.checklist", "shape"))
    elif not all(checklist.get(name) is True for name in CHECKLIST):
        problems.append(problem("review.checklist", "checklist_incomplete"))
    solved = as_int(review.get("previewSolvedDraftRevision"))
    if solved is None or solved != draft_revision:
        problems.append(problem("review.previewSolvedDraftRevision", "preview_solve_stale"))
    return problems


def published_version(
    *,
    definition: Mapping[str, Any],
    resolved: Mapping[str, Mapping[str, str]],
    version: str,
    review: Mapping[str, Any],
    by: str,
    at: datetime,
    from_draft_revision: int,
) -> dict[str, Any]:
    """The immutable version item: the definition's fields at the top level (what packs, selection and ops read),
    speech refs resolved, and the review record (never sent to a player: runs.py copies an allow-list)."""
    body = {name: plain(value) for name, value in definition.items() if name != "speechDefinitionReferences"}
    body["speechDefinitionReferences"] = {variant: dict(ref) for variant, ref in sorted(resolved.items())}
    body["version"] = version
    item = {
        "pk": activity_pk(str(definition["activityId"])),
        "sk": f"{VERSION_PREFIX}{version}",
        **body,
        # The operator's own declaration (D §D8.4): it records what was ticked, and proves nothing more.
        "review": {
            "checklist": {name: review["checklist"][name] is True for name in CHECKLIST},
            "previewSolvedDraftRevision": from_draft_revision,
        },
        "publishedBy": by,
        "publishedAt": iso_z(at),
        "fromDraftRevision": from_draft_revision,
        "definitionHash": definition_hash(body),
    }
    return item


def display_numbers(version_ids: Iterable[str]) -> dict[str, int]:
    """versionId -> "v<n>" number, by counting in time order (spine S8.3)."""
    return {vid: index for index, vid in enumerate(sorted(version_ids), start=1)}
