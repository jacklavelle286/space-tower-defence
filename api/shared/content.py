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

Activity definitions (C22.1): FIXED activities of all six interaction types, with pictures from the asset manifest and
at most one additional step (Phase 36; the per-type payload and answer checks are in shared/activity_types.py).
Demonstrations are refused with rule `not_supported_yet` until their phase. A draft saves freely (only its size, its
ID and the locked identity fields are checked); validate and publish run every check.

TEMPLATE activities (Phase 41, C25): `template {generatorKind, generatorVersion, domain, presentation?}` in place of
prompt, activityPayload, answerSpecification, additionalSteps and visualAssetReferences (each refused on a template,
rule `not_for_template`; `template` on a FIXED activity is rule `not_for_fixed`). Validate and publish run
`template_report`: the generator's domain checks, then EVERY instance of the domain (at most 5,000 instances, and at
most generators.ENUMERATION_MAX raw combinations enumerated; more is rule `domain_too_large`) through the same
prompt, payload, answer and picture checks as a FIXED activity, reported as `template.instances.<n>.<field>` (C25.3
rule 2). The header's `domainSize` is the number of instances, written at
publish. A template may reference only an `instruction` clip: a clip cannot say a generated question. For the same
reason `audioRequirement: REQUIRED` is refused on a template (rule `not_for_template`; NONE or OPTIONAL).

Lifecycle items written by admin-api (Phase 36): retire sets the header `state` RETIRED; withdraw adds
`withdrawn {at, reason}` to one version (the only attribute ever added to a version, under `attribute_not_exists`)
and, when it is the published version, also retires the activity (F §12.6 C5, C6).

Topics and curriculum (Gate G follow-up, 2026-11-16): the topic registry (contracts/topics.json, plan C19,
shared/topics.py) carries the curriculum references, so `curriculumReference` is optional in a definition. At validate
and publish the topic must be registered under the activity's subject (`unknown_topic`) and the activity's ages must
be ages the topic is taught at (`topic_ages`); both are skipped once the activity has a published version, because the
topic is then locked and activities published under a hand-typed topic must stay editable. At publish, a definition
with no `curriculumReference` gets the registry's list on the version (`definition_for_publish`), so the published
record still carries it. Those entries are C19's references as written (free text), not CURRICULUM_CODE codes; only
an operator-written list is held to the code pattern.

`rewardCategory` BOTH (same date): the activity may fill a normal slot or a meteor slot (selection puts it in both
groups of its subject, and still uses it at most once per run). The reward stays a property of the slot.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from functools import lru_cache
from typing import TYPE_CHECKING, Any

from shared import generators
from shared.activity_types import (
    INTERACTION_TYPES,
    STEP_JOINER,
    Step,
    accepted_list,
    answer_shape_ok,
    asset_manifest,
    check_answers,
    check_payload,
)
from shared.clipkey import KINDS, PROVIDER
from shared.pictures import ACTIVITY_KINDS, PIC_PK, kind_of, library_asset_ids
from shared.pictures import PUBLISH_REFS as PICTURE_PUBLISH_REFS
from shared.png_canon import PICTURE_ID
from shared.rules.contracts import LIMITS
from shared.topics import get_topic

if TYPE_CHECKING:
    from shared.data import DynamoTable

SPEECH_PK = "SPEECH"
ACT_PK = "ACT"
DRAFT_SK = "DRAFT"
VERSION_PREFIX = "V#"
# On a speech header: how many activity publishes (R27) have resolved this definition. It only grows; R32 conditions
# its header delete on the value it read before its in-use check (publish_actions).
PUBLISH_REFS = "publishRefs"

KEY_ID = re.compile(LIMITS["ids"]["keyId"].removeprefix("^").removesuffix("$"))
VARIANT = re.compile(r"prompt|instruction|answer|option-[a-f]|bin-[a-z0-9]{1,8}|intro-[1-3]")  # G R15
VERSION_ID = re.compile(r"[0-9]{8}T[0-9]{6}Z")
TITLE_MAX = 80
AGE_BANDS: tuple[int, ...] = tuple(LIMITS["ageBands"])
SUBJECTS = ("maths", "phonics", "spelling")
REWARD_CATEGORIES = ("NORMAL", "METEOR", "BOTH")  # BOTH: either slot kind (shared/selection)
AUTHORING_MODES = ("FIXED", "TEMPLATE")
AUDIO_REQUIREMENTS = ("NONE", "OPTIONAL", "REQUIRED")
SOURCES = ("HANDWRITTEN", "TEMPLATE", "IMPORT", "AI_ASSISTED")
IDENTITY_FIELDS = ("subject", "topicId", "rewardCategory", "authoringMode", "interactionType")  # spine S5.2
DEFINITION_MAX_BYTES = 8192  # C22.1: a published definition is capped at 8 KB of JSON
CURRICULUM_CODE = re.compile(r"[A-Za-z0-9.-]{1,40}")

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


def stored(value: Any) -> Any:
    """JSON values as DynamoDB keeps them, the reverse of `plain`: float -> Decimal (its shortest decimal form, so 1.05
    stays 1.05), maps and lists recursively. boto3's serialiser refuses floats with a TypeError, which was a 500 on a
    level save holding generated waves (gaps of 0.25 s, health x1.05). JSON bodies cannot carry NaN or Infinity
    (shared/body.py refuses them), so every float here is finite."""
    if isinstance(value, float):
        return Decimal(repr(value))
    if isinstance(value, Mapping):
        return {str(k): stored(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [stored(v) for v in value]
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
    """A new speech definition: header + draft (draftRevision 0).

    Text or SSML comes from a seed, or from R18: the body sent, or `shared.verdicts.starting_body` for the speechId.
    """
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


def header_fields(definition: Mapping[str, Any], domain_size: int | None = None) -> dict[str, Any]:
    """The header attributes a definition sets (spine S8.3: what selection and bank status read). `domainSize` is 1
    for a FIXED activity; for a template it is the number of instances (`template_report`), given at publish only, so
    a draft save never enumerates a domain."""
    fields = {name: definition.get(name) for name in ("title", *IDENTITY_FIELDS, "minAge", "maxAge")}
    fields["domainSize"] = domain_size if definition.get("authoringMode") == "TEMPLATE" else 1
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
        # Topic IDs start with their subject (C16.2); also checked on create (R23). The registry checks (C22.2 rule 2)
        # run at validate and publish only (topic_problems).
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


# --- Definition checks (validate and publish, C22.2) ----------------------------------------------------------------

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
        "additionalSteps",
        "speechDefinitionReferences",
        "source",
        "reviewNote",
        "template",
    }
)
# Demonstrations (C22.6) have no player yet.
NOT_YET = frozenset({"introductionContent"})
REQUIRED_DEFINITION_FIELDS = (
    "schemaVersion",
    *CREATE_FIELDS,
    "audioRequirement",
    "prompt",
    "activityPayload",
    "answerSpecification",
    "speechDefinitionReferences",
)
# A template's generator makes these per instance (C22.1: "absent on template activities").
FIXED_ONLY_FIELDS = frozenset(
    {"prompt", "activityPayload", "answerSpecification", "additionalSteps", "visualAssetReferences"}
)
TEMPLATE_REQUIRED_FIELDS = (
    "schemaVersion",
    *CREATE_FIELDS,
    "audioRequirement",
    "speechDefinitionReferences",
    "template",
)
TEMPLATE_VARIANTS = ("instruction",)  # [ASSUMPTION] a clip is fixed audio; a template's question is generated
TEMPLATE_PROBLEMS_MAX = 10  # problems reported from the instance check; every instance is still checked
TEMPLATE_SAMPLE_POINTS = (0, 1, 2, 3, 4)  # quarters: smallest, three middle, largest (C25.3 rule 3)
STEP_FIELDS = frozenset({"interactionType", "prompt", "activityPayload", "answerSpecification"})
MAX_ADDITIONAL_STEPS = 1  # C20.3: one primary step and at most one more in version one
REVIEW_NOTE_MAX = 200  # [ASSUMPTION], as a withdrawal reason


def _text(value: Any, low: int, high: int) -> bool:
    return isinstance(value, str) and low <= len(value) <= high and value == value.strip() and not _has_control(value)


def _prompt_problems(prompt: Any, name: str) -> list[Problem]:
    if not (isinstance(prompt, Mapping) and set(prompt) == {"text"} and _text(prompt["text"], 3, 120)):
        return [problem(f"{name}.text", "length")]
    if "<" in prompt["text"] or ">" in prompt["text"]:
        return [problem(f"{name}.text", "markup")]
    return []


def _additional_step(value: Any) -> tuple[list[Problem], Step | None, list[str] | None]:
    """additionalSteps (C20.3): (problems, the checked step or None, its accepted answers or None)."""
    if not isinstance(value, list):
        return [problem("additionalSteps", "type")], None, None
    if len(value) > MAX_ADDITIONAL_STEPS:
        return [problem("additionalSteps", "count")], None, None
    if not value:
        return [], None, None
    raw, name = value[0], "additionalSteps.0"
    if not isinstance(raw, Mapping):
        return [problem(name, "type")], None, None
    problems = [problem(f"{name}.{k}", "additionalProperties") for k in raw if k not in STEP_FIELDS]
    problems += [
        problem(f"{name}.{k}", "required")
        for k in ("interactionType", "activityPayload", "answerSpecification")
        if k not in raw
    ]
    if problems:
        return problems, None, None
    if raw["interactionType"] not in INTERACTION_TYPES:
        return [problem(f"{name}.interactionType", "enum")], None, None
    if "prompt" in raw:
        problems += _prompt_problems(raw["prompt"], f"{name}.prompt")
    step = check_payload(raw["interactionType"], raw["activityPayload"], f"{name}.activityPayload")
    problems += step.problems
    spec_problems, accepted = accepted_list(raw["answerSpecification"], f"{name}.answerSpecification", step)
    problems += spec_problems
    if accepted is not None:
        answer_problems = check_answers(step, accepted, f"{name}.answerSpecification.accepted")
        problems += answer_problems
        if answer_problems:
            accepted = None  # the joined answers are not compared with a list that is itself wrong
    return problems, step, accepted


def _joined_answers(joined: list[str], primary: Step, second: Step, second_accepted: list[str] | None) -> list[Problem]:
    """A two-step activity's own `answerSpecification.accepted` is every pair of step answers, joined by `|` (C20.1,
    C20.3): the primary step's answers (checked against the primary payload) times the additional step's."""
    name = "answerSpecification.accepted"
    problems: list[Problem] = []
    firsts: list[str] = []
    pairs: set[tuple[str, str]] = set()
    for index, answer in enumerate(joined):
        parts = answer.split(STEP_JOINER)
        if len(parts) != 2 or not answer_shape_ok(answer):
            problems.append(problem(f"{name}.{index}", "answer_shape"))  # "<primary>|<second>", <= 64 characters
            continue
        first, rest = parts
        if first not in firsts:
            firsts.append(first)
        pairs.add((first, rest))
        if second_accepted is not None and rest not in second_accepted:
            problems.append(problem(f"{name}.{index}", "not_in_step"))
    if problems:
        return problems
    problems += check_answers(primary, firsts, name)
    if second_accepted is not None and not problems:
        expected = {(a, b) for a in firsts for b in second_accepted}
        if pairs != expected or len(joined) != len(expected):
            problems.append(problem(name, "steps_product"))  # every combination of right step answers, once
    return problems


def _asset_problems(
    definition: Mapping[str, Any],
    steps: list[Step],
    listed_name: str = "visualAssetReferences",
    library: Mapping[str, Mapping[str, Any]] | None = None,
) -> list[Problem]:
    """C22.2 rule 4: every picture is in the asset manifest, flagged text-free, and listed in visualAssetReferences;
    nothing is listed that is not used. `listed_name` is the list's field in the problems (a template instance's
    list is `template.instances.<n>.visualAssetReferences`).

    Library pictures (Gate P): an ID `lib-` + 32 hex characters is not in the repository manifest; it names a picture
    header in the content table (shared/pictures.py). With `library` (validate and publish read the headers, see
    `publish_checks`) each one must exist (`unknown_asset`), be APPROVED (`picture_not_approved`), be flagged
    text-free (`not_text_free`) and be of a kind made for activities (`picture_not_for_activities`: an avatar, an
    alien or another "later" kind is refused; Gate P2). Without it (a seed, a fixture, no table) only the ID's form
    is checked."""
    manifest = asset_manifest()
    problems: list[Problem] = []
    used: dict[str, str] = {}
    for step in steps:
        for name, asset_id in step.assets:
            if PICTURE_ID.fullmatch(asset_id):
                rule = _library_rule(library, asset_id)
                if rule is not None:
                    problems.append(problem(name, rule))
                used.setdefault(asset_id, name)
                continue
            entry = manifest.get(asset_id)
            if entry is None:
                problems.append(problem(name, "unknown_asset"))
            elif entry.get("textFree") is not True:
                problems.append(problem(name, "not_text_free"))
            used.setdefault(asset_id, name)
    listed = definition.get("visualAssetReferences", [])
    if not (isinstance(listed, list) and all(isinstance(a, str) for a in listed)):
        return [*problems, problem(listed_name, "type")]
    if len(set(listed)) != len(listed):
        problems.append(problem(listed_name, "duplicate"))
    for asset_id, name in used.items():
        if asset_id not in listed:
            problems.append(problem(name, "asset_not_listed"))
    for index, asset_id in enumerate(listed):
        if asset_id not in used:
            problems.append(problem(f"{listed_name}.{index}", "asset_unused"))
    return problems


def _library_rule(library: Mapping[str, Mapping[str, Any]] | None, picture_id: str) -> str | None:
    """The problem rule for one library picture, or None (always None without `library`: form only)."""
    if library is None:
        return None
    header = library.get(picture_id)
    if header is None:
        return "unknown_asset"
    if header.get("state") != "APPROVED":
        return "picture_not_approved"
    if header.get("textFree") is not True:
        return "not_text_free"
    if kind_of(header) not in ACTIVITY_KINDS:
        return "picture_not_for_activities"
    return None


def definition_problems(
    definition: Any,
    activity_id: str,
    header: Mapping[str, Any] | None = None,
    library: Mapping[str, Mapping[str, Any]] | None = None,
) -> list[Problem]:
    """Every C22.2 check that needs only the definition itself (speech approval is checked against the table).

    `header` is the activity's header item when there is one (validate, publish): the topic registry checks are
    skipped once it has a published version (`topic_problems`). None (a seed, a fixture) means nothing is published.
    `library` is {pictureId: picture header} for the library pictures the definition names, read by `publish_checks`;
    None checks only their form (`_asset_problems`)."""
    if not isinstance(definition, Mapping):
        return [problem("definition", "type")]
    problems: list[Problem] = []
    template_mode = definition.get("authoringMode") == "TEMPLATE"
    for name in definition:
        if name in NOT_YET:
            problems.append(problem(name, "not_supported_yet"))
        elif name not in DEFINITION_FIELDS:
            problems.append(problem(name, "additionalProperties"))
        elif template_mode and name in FIXED_ONLY_FIELDS:
            problems.append(problem(name, "not_for_template"))
        elif not template_mode and name == "template":
            problems.append(problem(name, "not_for_fixed"))
    for name in TEMPLATE_REQUIRED_FIELDS if template_mode else REQUIRED_DEFINITION_FIELDS:
        if name not in definition:
            problems.append(problem(name, "required"))
    if len(canonical_json(definition)) > DEFINITION_MAX_BYTES:
        problems.append(problem("definition", "max_bytes"))
    if problems:
        return problems

    if as_int(definition["schemaVersion"]) != 1:
        problems.append(problem("schemaVersion", "const"))
    identity = _identity_problems(definition, "")
    problems.extend(identity)
    if not any(p["field"] in ("subject", "topicId", "minAge", "maxAge") for p in identity):
        problems.extend(topic_problems(definition, header))  # only once the fields it reads are well formed
    if definition["activityId"] != activity_id:
        problems.append(problem("activityId", "matches_path"))
    if definition["audioRequirement"] not in AUDIO_REQUIREMENTS:
        problems.append(problem("audioRequirement", "enum"))
    refs = definition.get("curriculumReference")  # optional: the topic registry carries the references (C19)
    if refs is not None and not (isinstance(refs, list) and 1 <= len(refs) <= 4 and all(_curriculum(r) for r in refs)):
        problems.append(problem("curriculumReference", "pattern"))
    if "curriculumNote" in definition and not _text(definition["curriculumNote"], 1, 200):
        problems.append(problem("curriculumNote", "length"))
    if "source" in definition and definition["source"] not in SOURCES:
        problems.append(problem("source", "enum"))
    if "reviewNote" in definition and not _text(definition["reviewNote"], 1, REVIEW_NOTE_MAX):
        problems.append(problem("reviewNote", "length"))
    if template_mode:
        problems.extend(template_report(definition).problems)
        problems.extend(_speech_problems(definition, [], template=True))
        return problems
    problems.extend(_prompt_problems(definition["prompt"], "prompt"))

    # The primary step, and the additional one (C20.3).
    two_step = isinstance(definition.get("additionalSteps"), list) and bool(definition["additionalSteps"])
    payload, part_problems = _part_prompt(definition["activityPayload"], two_step)
    problems.extend(part_problems)
    primary = check_payload(definition["interactionType"], payload, "activityPayload")
    problems.extend(primary.problems)
    second_problems, second, second_accepted = (
        _additional_step(definition["additionalSteps"]) if "additionalSteps" in definition else ([], None, None)
    )
    problems.extend(second_problems)
    spec_problems, accepted = accepted_list(definition["answerSpecification"], "answerSpecification", primary)
    problems.extend(spec_problems)
    if accepted is not None:
        if not two_step:
            problems.extend(check_answers(primary, accepted, "answerSpecification.accepted"))
        elif second is not None and not second_problems:
            problems.extend(_joined_answers(accepted, primary, second, second_accepted))
    steps = [primary] if second is None else [primary, second]
    firsts = {a.split(STEP_JOINER)[0] for a in accepted or []}
    counts = ((primary, len(firsts)), (second, len(set(second_accepted or []))))
    many = [s for s, n in counts if s is not None and n > 1]
    if any(s.note_when_many for s in many) and "reviewNote" not in definition:
        problems.append(problem("reviewNote", "review_note_required"))  # more than one accepted entry (C20.1)
    problems.extend(_asset_problems(definition, steps, library=library))
    problems.extend(_typed_word_age_problems(definition))
    problems.extend(_speech_problems(definition, steps, template=False))
    return problems


def _speech_problems(definition: Mapping[str, Any], steps: list[Step], *, template: bool) -> list[Problem]:
    """The speech references (C21, C22.2 rules 5 and 6): variants that exist on this activity, well-formed refs, a
    cue where one is needed, a clip when audio is REQUIRED and on every phonics activity."""
    problems: list[Problem] = []
    speech = definition["speechDefinitionReferences"]
    if not isinstance(speech, Mapping):
        problems.append(problem("speechDefinitionReferences", "type"))
        return problems
    option_ids = {o for s in steps for o in s.option_ids}
    bin_ids = {b for s in steps for b in s.bin_ids}
    for variant, ref in speech.items():
        field = f"speechDefinitionReferences.{variant}"
        if not (isinstance(variant, str) and VARIANT.fullmatch(variant)):
            problems.append(problem(field, "variant"))
        elif template and variant not in TEMPLATE_VARIANTS:
            problems.append(problem(field, "not_for_template"))
        elif variant.startswith("option-") and variant.removeprefix("option-") not in option_ids:
            problems.append(problem(field, "not_an_option"))
        elif variant.startswith("bin-") and variant.removeprefix("bin-") not in bin_ids:
            problems.append(problem(field, "not_a_bin"))
        elif variant.startswith("intro-"):
            problems.append(problem(field, "not_supported_yet"))  # demonstrations (C22.6)
        if not (isinstance(ref, Mapping) and set(ref) == {"speechId"} and isinstance(ref["speechId"], str)):
            problems.append(problem(field, "shape"))
        elif not KEY_ID.fullmatch(ref["speechId"]):
            problems.append(problem(f"{field}.speechId", "pattern"))
    for index, step in enumerate(steps):
        if step.needs_cue and not step.has_cue and "prompt" not in speech:
            prefix = "activityPayload" if index == 0 else "additionalSteps.0.activityPayload"
            problems.append(problem(f"{prefix}.cue", "cue_required"))  # a picture, rule text or a prompt clip
    clip_variants = [v for v in speech if isinstance(v, str) and (v == "prompt" or v.startswith(("option-", "bin-")))]
    if template and definition["audioRequirement"] == "REQUIRED":
        # A REQUIRED activity needs a clip that says the question, and a fixed clip cannot say a generated one, so a
        # template can never meet the rule: refuse it plainly instead of pointing at a prompt clip it may not have.
        problems.append(problem("audioRequirement", "not_for_template"))
    elif definition["audioRequirement"] == "REQUIRED" and not clip_variants:
        problems.append(problem("speechDefinitionReferences", "audio_required"))  # C22.2 rule 5
    if definition["subject"] == "phonics" and not speech:
        problems.append(problem("speechDefinitionReferences", "phonics_needs_clip"))  # C22.2 rule 6, D9.5 Q6
    return problems


# --- Templates (C25, Phase 41) --------------------------------------------------------------------------------------


@dataclass(frozen=True)
class TemplateReport:
    """The exhaustive check of a template (C25.3): its problems, the number of instances, and a sample to review."""

    problems: list[Problem]
    domain_size: int
    sample: list[dict[str, Any]]


def template_report(definition: Mapping[str, Any]) -> TemplateReport:
    """Every instance of the template's domain, checked as a FIXED activity's step would be (C22.2 rule 9).

    Only the interaction type and `template` decide the result, so it is cached on those: validate, publish and the
    header's domainSize in one request enumerate the domain once."""
    key = canonical_json({"interactionType": definition.get("interactionType"), "template": definition.get("template")})
    return _template_report(key.decode("utf-8"))


@lru_cache(maxsize=32)
def _template_report(key: str) -> TemplateReport:
    doc = json.loads(key)
    interaction_type = doc["interactionType"]
    prepared, problems = generators.prepare(doc["template"], interaction_type)
    if prepared is None:
        return TemplateReport(problems, 0, [])
    raw = generators.domain_params(prepared)
    if raw is None:
        return TemplateReport([problem("template.domain", "domain_too_large")], 0, [])
    found: list[generators.Instance] = []
    for params in raw:
        instance = prepared.build(params)
        if instance is None:
            continue
        if len(found) == generators.DOMAIN_MAX:  # one instance over the cap (C25.3 rule 1): refused, never sampled
            return TemplateReport([problem("template.domain", "domain_too_large")], 0, [])
        if len(problems) < TEMPLATE_PROBLEMS_MAX:
            prefix = f"template.instances.{len(found)}"
            problems += instance_problems(interaction_type, instance, prefix)[: TEMPLATE_PROBLEMS_MAX - len(problems)]
        found.append(instance)
    if not found:
        problems.append(problem("template.domain", "domain_empty"))
    count = len(found)
    picks = sorted({(count - 1) * point // 4 for point in TEMPLATE_SAMPLE_POINTS}) if count else []
    sample = [
        {"index": i, "interactionType": interaction_type, **found[i].resolved(prepared.kind, prepared.version)}
        for i in picks
    ]
    return TemplateReport(problems, count, sample)


def instance_problems(interaction_type: str, instance: generators.Instance, prefix: str) -> list[Problem]:
    """One generated instance through the FIXED checks: prompt, payload, canonical answers inside the payload,
    pictures in the manifest and text-free (C25.3 rule 2)."""
    problems = _prompt_problems({"text": instance.prompt}, f"{prefix}.prompt")
    step = check_payload(interaction_type, instance.payload, f"{prefix}.activityPayload")
    problems += step.problems
    spec = f"{prefix}.answerSpecification"
    spec_problems, accepted = accepted_list({"accepted": list(instance.accepted)}, spec, step)
    problems += spec_problems
    if accepted is not None:
        problems += check_answers(step, accepted, f"{spec}.accepted")
    listed = {"visualAssetReferences": list(instance.assets)}
    problems += _asset_problems(listed, [step], f"{prefix}.visualAssetReferences")
    return problems


def validation_extras(definition: Any) -> dict[str, Any]:
    """What R26 adds to `{valid, problems}`: `domainSize` (1 for a FIXED activity), and for a template the
    rendered `sample` for human review (the smallest, three middle and the largest instance; C25.3 rule 3, D §D8.4)."""
    if not (isinstance(definition, Mapping) and definition.get("authoringMode") == "TEMPLATE"):
        return {"domainSize": 1}
    if not isinstance(definition.get("template"), Mapping):
        return {"domainSize": 0, "sample": []}
    report = template_report(definition)
    return {"domainSize": report.domain_size, "sample": report.sample}


def _typed_word_age_problems(definition: Mapping[str, Any]) -> list[Problem]:
    """Decision D-7 (B, C20): no typed word answers at age 5; letter tiles (ARRANGE LETTERS) instead. A TYPED
    WORD step, primary or second, is refused when the activity is for age 5."""
    if as_int(definition.get("minAge")) != 5:
        return []
    parts = [("activityPayload", definition.get("interactionType"), definition.get("activityPayload"))]
    extra = definition.get("additionalSteps")
    if isinstance(extra, list) and extra and isinstance(extra[0], Mapping):
        second = extra[0]
        kind, payload = second.get("interactionType"), second.get("activityPayload")
        parts.append(("additionalSteps.0.activityPayload", kind, payload))
    return [
        problem(f"{prefix}.mode", "typed_word_age5")
        for prefix, kind, payload in parts
        if kind == "TYPED" and isinstance(payload, Mapping) and payload.get("mode") == "WORD"
    ]


def _part_prompt(payload: Any, two_step: bool) -> tuple[Any, list[Problem]]:
    """A two-step activity's primary payload may carry `partPrompt`, the first part's own question (the C22 worked
    example `ma-0307`; the player panel shows it as that part's heading). It is checked as a prompt (3-120 characters,
    plain text) and taken out before the per-type payload check. On a one-step activity it stays in, so the payload
    check refuses it as an unknown field (Phase 39)."""
    if not (two_step and isinstance(payload, Mapping) and "partPrompt" in payload):
        return payload, []
    text = payload["partPrompt"]
    rest = {key: value for key, value in payload.items() if key != "partPrompt"}
    if not _text(text, 3, 120):
        return rest, [problem("activityPayload.partPrompt", "length")]
    if "<" in text or ">" in text:
        return rest, [problem("activityPayload.partPrompt", "markup")]
    return rest, []


def topic_problems(definition: Any, header: Mapping[str, Any] | None) -> list[Problem]:
    """Validate and publish (not draft save): the topic is in the registry under the activity's subject
    (`unknown_topic`), and every age minAge..maxAge is an age the topic is taught at (`topic_ages`).

    Once `header` has a published version the topic is locked, so an activity published under a hand-typed topic
    before the registry existed must stay editable: `unknown_topic` is skipped then, and so is `topic_ages` for a topic
    the registry does not know. A locked topic that *is* in the registry keeps the `topic_ages` check, because minAge
    and maxAge stay editable after publish and selection serves the activity by the header's ages.
    Malformed identity fields are left to `definition_problems`."""
    if not isinstance(definition, Mapping):
        return []
    published = header is not None and bool(header.get("publishedVersion"))
    topic = get_topic(definition.get("topicId"))
    if topic is None or topic.subject != definition.get("subject"):
        return [] if published else [problem("topicId", "unknown_topic")]
    low, high = as_int(definition.get("minAge")), as_int(definition.get("maxAge"))
    if low is None or high is None or low > high:
        return []  # reported as range / age_span by the identity checks
    if not topic.allows_ages(low, high):
        return [problem("minAge", "topic_ages")]
    return []


def definition_for_publish(definition: Mapping[str, Any]) -> dict[str, Any]:
    """The definition as it is published: when it has no `curriculumReference`, the topic registry's list is
    written in, so the version records the curriculum it was published against. An operator-written list is kept as
    it is. A topic that is not in the registry (an activity published before it existed) adds nothing."""
    out = dict(definition)
    topic = get_topic(definition.get("topicId"))
    if "curriculumReference" not in out and topic is not None and topic.curriculum:
        out["curriculumReference"] = list(topic.curriculum)
    return out


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
    seed_note: str | None = None,
) -> dict[str, Any]:
    """The immutable version item: the definition's fields at the top level (what packs, selection and ops read),
    speech refs resolved, and the review record (never sent to a player: runs.py copies an allow-list).

    `definition` is what `definition_for_publish` returns. `definitionHash` covers the whole published body: every
    definition field (the registry curriculum included when the server wrote it), the resolved speech refs and the
    version ID; not the review record, `publishedBy`, `publishedAt`, `fromDraftRevision` or the keys. So the hash
    proves the published record never changed, whichever fields the server filled in.

    `seed_note` is set only by scripts/seed_content.py --publish (ADR-0028): the review record then also says
    `seeded: true` with that note. R27's request body cannot set either (`checklist_problems` refuses other keys)."""
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
    if seed_note is not None:
        item["review"].update(seeded=True, reviewNote=seed_note)
    return item


# --- Publish (R27), shared by admin-api and scripts/seed_content.py --publish ----------------------------------------


def audit_item(pk: str, sk: str, action: str, by: str, moment: datetime, **ids: Any) -> dict[str, Any]:
    return {"pk": pk, "sk": sk, "action": action, "by": by, "at": iso_z(moment), **ids}


def publish_checks(
    table: DynamoTable, header: Mapping[str, Any], draft: Mapping[str, Any], activity_id: str
) -> tuple[list[Problem], dict[str, dict[str, str]]]:
    """C22.2 subset: (problems, resolved speech refs {variant: {speechId, speechVersion, clipKey}}).

    Reads the referenced speech headers and their approved versions, and the headers of the library pictures the
    definition names (Gate P), from `table` (reads only)."""
    definition = draft.get("definition")
    pictures = sorted(library_asset_ids(definition))
    found_pictures = table.batch_get([(PIC_PK, picture_id) for picture_id in pictures])
    library = {p: found_pictures[(PIC_PK, p)] for p in pictures if (PIC_PK, p) in found_pictures}
    # registry checks until the first publish
    problems = definition_problems(definition, activity_id, header, library=library)
    if not isinstance(definition, Mapping):
        return problems, {}
    problems += locked_problems(header, definition)
    refs = speech_refs(definition)
    found = table.batch_get([(SPEECH_PK, speech_id) for speech_id in set(refs.values())])
    headers = {speech_id: found.get((SPEECH_PK, speech_id)) for speech_id in set(refs.values())}
    problems += approval_problems(refs, headers)
    resolved: dict[str, dict[str, str]] = {}
    approved = {
        speech_id: str(h["approvedVersion"])
        for speech_id, h in headers.items()
        if h is not None and h.get("state") == "APPROVED" and h.get("approvedVersion")
    }
    versions = table.batch_get([(speech_pk(s), f"{VERSION_PREFIX}{v}") for s, v in approved.items()])
    for variant, speech_id in sorted(refs.items()):
        if speech_id not in approved:
            continue
        version = versions.get((speech_pk(speech_id), f"{VERSION_PREFIX}{approved[speech_id]}"))
        clip = version.get("clipKey") if version is not None else None
        if not isinstance(clip, str):
            problems.append(problem(f"speechDefinitionReferences.{variant}", "speech_not_approved"))
            continue
        resolved[variant] = {"speechId": speech_id, "speechVersion": approved[speech_id], "clipKey": clip}
    return problems, resolved


def leftover_version_sks(table: DynamoTable, pk: str) -> list[str]:
    """The `V#` sort keys under `pk`, oldest first. Under a speech ID with no header these are versions a R32 delete
    removed the header of and then stopped before deleting (R18 create and seed_content.py look before creating)."""
    return sorted(str(v["sk"]) for v in table.query_prefix(pk, VERSION_PREFIX, attributes=("sk",)))


def publish_actions(
    table: DynamoTable,
    *,
    activity_id: str,
    header: Mapping[str, Any],
    draft: Mapping[str, Any],
    revision: int,
    resolved: Mapping[str, Mapping[str, str]],
    review: Mapping[str, Any],
    by: str,
    moment: datetime,
    seed_note: str | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    """(versionId, the one transaction R27 writes) for a draft that passed `checklist_problems` and `publish_checks`.

    The transaction: the immutable version (attribute_not_exists), the header moved to PUBLISHED (conditioned on the
    `publishedVersion` that was read, so of two concurrent publishes only one wins), a check that the draft is still
    at `revision`, an update of each referenced speech definition's header, conditioned on it still having the
    approved version that was resolved, that adds 1 to its `PUBLISH_REFS` counter, and the audit item.

    The counter is what R32 (speech delete) conditions its header delete on: a publish that commits between R32's
    in-use check and its delete changes the counter, so the delete is refused and R32 checks again (a ConditionCheck
    alone writes nothing, so the delete could not see such a publish).

    Library pictures (Gate P) get the same guard: each picture header the definition names gains 1 on its own
    `publishRefs`, conditioned on it still being APPROVED and text-free, so R37 (picture delete) cannot remove a
    picture a publish is committing, and a picture deleted or never approved refuses the publish. A picture's kind
    never changes after it is created, so `publish_checks` alone refuses a kind not made for activities."""
    definition = definition_for_publish(draft["definition"])  # registry curriculum when the draft has none
    domain_size = template_report(definition).domain_size if definition.get("authoringMode") == "TEMPLATE" else None
    vid = version_id(moment)
    version = published_version(
        definition=definition,
        resolved=resolved,
        version=vid,
        review=review,
        by=by,
        at=moment,
        from_draft_revision=revision,
        seed_note=seed_note,
    )
    header_set = {
        **header_fields(definition, domain_size),
        "state": "PUBLISHED",
        "publishedVersion": vid,
        "fromDraftRevision": revision,
        "updatedAt": iso_z(moment),
    }
    names = {f"#h{i}": name for i, name in enumerate(header_set)}
    values: dict[str, Any] = {f":h{i}": value for i, value in enumerate(header_set.values())}
    update = "SET " + ", ".join(f"{n} = {v}" for n, v in zip(names, values, strict=True))
    pv = next(n for n, name in names.items() if name == "publishedVersion")
    published = header.get("publishedVersion")
    if published:
        header_condition = f"attribute_exists(#pk) AND {pv} = :prev"
        values[":prev"] = str(published)
    else:
        header_condition = f"attribute_exists(#pk) AND attribute_not_exists({pv})"
    audit_pk, audit_sk = audit_key(moment, f"{activity_id}#publish#{vid}")
    actions = [
        table.put_action(version, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
        table.update_action(
            ACT_PK,
            activity_id,
            update=update,
            names={**names, "#pk": "pk"},
            values=values,
            condition=header_condition,
        ),
        table.condition_check_action(
            activity_pk(activity_id),
            DRAFT_SK,
            condition="#rev = :r",
            names={"#rev": "draftRevision"},
            values={":r": revision},
        ),
    ]
    for speech_id, speech_version in sorted({(r["speechId"], r["speechVersion"]) for r in resolved.values()}):
        actions.append(
            table.update_action(
                SPEECH_PK,
                speech_id,
                update="ADD #refs :one",
                names={"#v": "approvedVersion", "#refs": PUBLISH_REFS},
                values={":v": speech_version, ":one": 1},
                condition="#v = :v",
            )
        )
    for picture_id in sorted(library_asset_ids(draft["definition"])):
        actions.append(
            table.update_action(
                PIC_PK,
                picture_id,
                update="ADD #refs :one",
                names={"#state": "state", "#tf": "textFree", "#refs": PICTURE_PUBLISH_REFS},
                values={":approved": "APPROVED", ":true": True, ":one": 1},
                condition="#state = :approved AND #tf = :true",
            )
        )
    actions.append(
        table.put_action(
            audit_item(audit_pk, audit_sk, "publish", by, moment, activityId=activity_id, versionId=vid),
            condition="attribute_not_exists(#pk)",
            names={"#pk": "pk"},
        )
    )
    return vid, actions


def display_numbers(version_ids: Iterable[str]) -> dict[str, int]:
    """versionId -> "v<n>" number, by counting in time order (spine S8.3)."""
    return {vid: index for index, vid in enumerate(sorted(version_ids), start=1)}
