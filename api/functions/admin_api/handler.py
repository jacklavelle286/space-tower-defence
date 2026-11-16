"""admin-api: content administration, operator only (plan G §12 R17-R31, E.6.3; Phase 20, M1-19).

Every route needs the operator authoriser at the gateway and, here, `token_use = access` and the exact group `admin`
(shared/auth.py), checked from the route key before anything is read. A player token never reaches this function: the
operator authoriser refuses another pool's issuer with 401. Audit fields (`createdBy`, `updatedBy`, `listenedBy`,
`publishedBy`) always come from the token's `sub`, never the body.

Phase 20 answered the minimal admin path (D §D8.6): speech definitions R17-R21 and activities R22-R27. Phase 36 (M3-02)
adds the activity lifecycle: validation of all six interaction types and two-step activities, retire (R28) and
withdraw (R29). Bank status (R30) still answers 501 NOT_IMPLEMENTED until Phase 42 (M3-07), which owns the counting
function it shares with selection. The owner's decision of 2026-11-16 adds delete (R31,
`DELETE /api/admin/activities/{id}`): the header, the draft and every version go, with an audit item. Item shapes
and checks are in shared/content.py and shared/activity_types.py.

Speech approval (R21, F §12.6 C7, D §D9.3) never synthesises. It recomputes the clip key from the SAVED draft (its kind
picks the engine, with the same TTS_* configuration as `tts`) and requires that object in the audio bucket: the object
exists only if `POST /api/admin/speech/preview` rendered exactly this draft's input, so "a preview of the same draft
revision exists" is a fact the server can check, not a claim from the browser. That listen-and-approve is the
listening verdict (ADR-0028); a PHONEME definition is refused only when its sound is `word-only` in
content/listening-verdicts.json (G-14, shared/verdicts.py). The version records `clipKey`, the
`sha256` of the MP3 bytes, the render date (the object's LastModified), `engine`, `voiceId`, `take` and the review
record.

Takes ([PROPOSAL], 2026-11-15; ADR-0025): the draft holds a `take` (absent = 1) that is part of the clip key
(shared/clipkey.py). Generative renders are not repeatable, so when a preview sounds wrong the operator saves the same
text with the next take ("Try another take", a new draft revision) and previews again; approval checks the clip of the
saved take.

Activity publication (R27, C4) checks the draft revision, the seven-line checklist, the preview-solve revision, the
definition (C22.2 subset, plus the topic registry checks while nothing is published yet) and that every referenced
speech definition is approved, then writes the immutable version,
the header, and an audit item in one transaction that also re-checks the draft revision and each speech definition's
approved version. R21 and R27 are safe to retry: a repeat whose `draftRevision` equals the header's
`fromDraftRevision` returns the version already written.

Immutability by condition (Phase 36): a version is written only with `attribute_not_exists(pk)`, so the database
refuses a second write to it; the only later change to a version is withdraw adding `withdrawn`, under
`attribute_not_exists(withdrawn)`. Two tabs publishing the same draft revision at once: the header update is
conditioned on the `publishedVersion` that was read, so only one transaction can win; the loser re-reads the header,
finds its own `draftRevision` already published, and answers like a replay (200, the winner's version). Retire (C5)
and withdraw (C6) write their audit item in the same transaction as the change.
"""

from __future__ import annotations

import contextlib
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import cache
from typing import Any

from botocore.exceptions import ClientError

from shared.audio import AudioStore, head_clip, s3_client, stored_sha256
from shared.auth import OPERATOR
from shared.body import json_object, query_param
from shared.clipkey import (
    GENERATION,
    KINDS,
    PROVIDER,
    ClipInputError,
    SpeechConfig,
    canonical_text,
    clip_key,
    object_key,
    take_problem,
)
from shared.clipkey import speech_input as clip_input
from shared.content import (
    ACT_PK,
    AGE_BANDS,
    DRAFT_SK,
    KEY_ID,
    SPEECH_PK,
    SUBJECTS,
    VERSION_ID,
    VERSION_PREFIX,
    activity_pk,
    as_int,
    audit_item,
    audit_key,
    check_create_fields,
    checklist_problems,
    display_numbers,
    header_fields,
    initial_definition,
    iso_z,
    locked_problems,
    new_activity_items,
    new_speech_items,
    plain,
    problem,
    publish_actions,
    publish_checks,
    speech_body,
    speech_pk,
    valid_title,
    version_id,
)
from shared.data import (
    CONTENT_TABLE_ENV,
    MAX_TRANSACTION_ACTIONS,
    DynamoTable,
    cancellation_reasons,
    is_transient,
    table_from_env,
)
from shared.errors import ApiError, json_response
from shared.log import ApiLogger
from shared.router import Request, Router
from shared.rules.contracts import LIMITS
from shared.verdicts import phoneme_refusal

# This function's allow-list. tests/unit/test_routes_contract.py checks it equals contracts/routes.json.
ROUTES: dict[str, str] = {
    "GET /api/admin/speech-definitions": OPERATOR,
    "POST /api/admin/speech-definitions": OPERATOR,
    "GET /api/admin/speech-definitions/{id}": OPERATOR,
    "PUT /api/admin/speech-definitions/{id}": OPERATOR,
    "POST /api/admin/speech-definitions/{id}/approve": OPERATOR,
    "GET /api/admin/activities": OPERATOR,
    "POST /api/admin/activities": OPERATOR,
    "GET /api/admin/activities/{id}": OPERATOR,
    "PUT /api/admin/activities/{id}/draft": OPERATOR,
    "POST /api/admin/activities/{id}/validate": OPERATOR,
    "POST /api/admin/activities/{id}/publish": OPERATOR,
    "POST /api/admin/activities/{id}/retire": OPERATOR,
    "POST /api/admin/activities/{id}/withdraw": OPERATOR,
    "GET /api/admin/bank-status": OPERATOR,
    "DELETE /api/admin/activities/{id}": OPERATOR,
}

DRAFT_MAX_BYTES: int = LIMITS["bodyMaxBytes"]["adminActivityDraft"]  # 64 KB for PUT .../draft (G §12)
LIST_LIMIT: dict[str, int] = LIMITS["adminListLimit"]
REVIEW_NOTE_MAX = 500  # [ASSUMPTION]
WITHDRAW_REASON_MAX = 200  # G R29 [ASSUMPTION]
WRITE_TRIES = 3  # retire, withdraw and delete re-read and retry when a concurrent change refused their transaction
# Delete (R31) removes the versions in its one transaction while they fit beside the draft, header and audit item.
DELETE_VERSIONS_IN_TRANSACTION = MAX_TRANSACTION_ACTIONS - 3


def _utc_now() -> datetime:
    return datetime.now(UTC)


_container_s3 = cache(s3_client)


@dataclass(frozen=True)
class Deps:
    content: Callable[[], DynamoTable] = lambda: table_from_env(CONTENT_TABLE_ENV)
    s3: Callable[[], Any] = _container_s3
    store: Callable[[], AudioStore] = AudioStore.from_env
    config: Callable[[], SpeechConfig] = SpeechConfig.from_env
    now: Callable[[], datetime] = _utc_now


# --- Request helpers ------------------------------------------------------------------------------------------------


def invalid(problems: list[dict[str, str]]) -> ApiError:
    return ApiError("VALIDATION_FAILED", details=problems)


def path_id(request: Request) -> str:
    """The `{id}` path parameter. One that cannot be a key ID cannot name anything, so it is NOT_FOUND."""
    params = request.event.get("pathParameters")
    value = params.get("id") if isinstance(params, Mapping) else None
    if not isinstance(value, str) or not KEY_ID.fullmatch(value):
        raise ApiError("NOT_FOUND")
    return value


def only_fields(body: Mapping[str, Any], allowed: set[str], required: set[str]) -> None:
    problems = [problem(name, "additionalProperties") for name in body if name not in allowed]
    problems += [problem(name, "required") for name in sorted(required) if name not in body]
    if problems:
        raise invalid(problems)


def draft_revision_of(body: Mapping[str, Any]) -> int:
    value = as_int(body.get("draftRevision"))
    if value is None or value < 0:
        raise invalid([problem("draftRevision", "type")])
    return value


def list_limit(request: Request) -> int:
    raw = query_param(request.event, "limit")
    if raw is None:
        return LIST_LIMIT["default"]
    if not raw.isdigit() or not LIST_LIMIT["min"] <= int(raw) <= LIST_LIMIT["max"]:
        raise invalid([problem("limit", "range")])
    return int(raw)


def page(items: list[dict[str, Any]], key: str, request: Request) -> dict[str, Any]:
    """Items sorted by `key`, after the cursor (the last key of the previous page), up to `limit`."""
    limit = list_limit(request)
    cursor = query_param(request.event, "cursor")
    if cursor is not None and not KEY_ID.fullmatch(cursor):
        raise invalid([problem("cursor", "pattern")])
    ordered = sorted(items, key=lambda item: item[key])
    if cursor is not None:
        ordered = [item for item in ordered if item[key] > cursor]
    chunk = ordered[:limit]
    more = len(ordered) > limit
    return {"items": chunk, "nextCursor": chunk[-1][key] if more and chunk else None}


def _failed_codes(error: ClientError) -> list[str]:
    reasons = cancellation_reasons(error)
    if reasons is None:
        raise error
    return [reason.code for reason in reasons]


def transact(table: DynamoTable, actions: list[dict[str, Any]]) -> list[str] | None:
    """Send `actions`. None on success; the per-action reason codes when a condition refused it. Throttling and
    transaction conflicts are tried three times, then 503 THROTTLED."""
    for _ in range(3):
        try:
            table.transact_write(actions)
            return None
        except ClientError as error:
            if is_transient(error):
                continue
            return _failed_codes(error)
    raise ApiError("THROTTLED")


# --- Views ----------------------------------------------------------------------------------------------------------


def speech_summary(header: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "speechId": header.get("sk"),
        "title": header.get("title"),
        "kind": header.get("kind"),
        "state": header.get("state"),
        "approvedVersion": header.get("approvedVersion"),
        "updatedAt": header.get("updatedAt"),
    }


def draft_take(draft: Mapping[str, Any]) -> int:
    """The draft's take; a draft saved before takes existed is take 1 (its key is unchanged)."""
    take = as_int(draft.get("take"))
    return GENERATION if take is None else take


def speech_draft_view(draft: Mapping[str, Any], config: SpeechConfig) -> dict[str, Any]:
    """The draft as R19 shows it: engine and voiceId are what the server would use for its kind now (read-only), and
    `clipKey` is what a preview of the saved draft gives (None while the draft is empty or does not check)."""
    kind = str(draft.get("kind"))
    text, ssml = speech_body(draft)
    view: dict[str, Any] = {
        "kind": kind,
        "provider": draft.get("provider", PROVIDER),
        "engine": config.engine_for(kind),
        "voiceId": config.voice_id,
        "draftRevision": as_int(draft.get("draftRevision")),
        "take": draft_take(draft),
        "updatedAt": draft.get("updatedAt"),
        "clipKey": None,
    }
    if text is not None:
        view["text"] = text
    if ssml is not None:
        view["ssml"] = ssml
    if text is not None or ssml is not None:
        with contextlib.suppress(ClipInputError):  # a draft saved before a configuration change may no longer check
            view["clipKey"] = clip_key(clip_input(kind, config, text=text, ssml=ssml, take=view["take"]))
    return view


SPEECH_VERSION_FIELDS = ("clipKey", "sha256", "renderedAt", "approvedAt", "engine", "voiceId", "review")


def speech_version_view(item: Mapping[str, Any]) -> dict[str, Any]:
    view = {"versionId": str(item["sk"]).removeprefix(VERSION_PREFIX)}
    view.update({name: plain(item.get(name)) for name in SPEECH_VERSION_FIELDS})
    view["take"] = draft_take(item)  # a version approved before takes existed was take 1
    return view


def activity_summary(header: Mapping[str, Any]) -> dict[str, Any]:
    names = ("title", "subject", "topicId", "rewardCategory", "minAge", "maxAge", "interactionType", "authoringMode")
    summary = {"activityId": header.get("sk")}
    summary.update({name: plain(header.get(name)) for name in names})
    summary.update(state=header.get("state"), publishedVersion=header.get("publishedVersion"))
    summary["updatedAt"] = header.get("updatedAt")
    return summary


# --- Handlers -------------------------------------------------------------------------------------------------------


def make_router(deps: Deps, logger: ApiLogger | None = None) -> Router:
    logger = logger or ApiLogger("admin-api")

    def table() -> DynamoTable:
        return deps.content()

    # --- Speech definitions (G §12.1) -------------------------------------------------------------------------------

    def speech_items(speech_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        content = table()
        header = content.get_item(SPEECH_PK, speech_id)
        draft = content.get_item(speech_pk(speech_id), DRAFT_SK)
        if header is None or draft is None:
            raise ApiError("NOT_FOUND")
        return header, draft

    def speech_view(speech_id: str) -> dict[str, Any]:
        header, draft = speech_items(speech_id)
        versions = table().query_prefix(speech_pk(speech_id), VERSION_PREFIX)
        return {
            "header": speech_summary(header),
            "draft": speech_draft_view(draft, deps.config()),
            "versions": [speech_version_view(v) for v in sorted(versions, key=lambda v: str(v["sk"]))],
        }

    def list_speech(request: Request) -> dict[str, Any]:
        kind, state = query_param(request.event, "kind"), query_param(request.event, "state")
        if kind is not None and kind not in KINDS:
            raise invalid([problem("kind", "enum")])
        if state is not None and state not in ("DRAFT", "APPROVED"):
            raise invalid([problem("state", "enum")])
        items = [
            speech_summary(h)
            for h in table().query_prefix(SPEECH_PK, "")
            if (kind is None or h.get("kind") == kind) and (state is None or h.get("state") == state)
        ]
        return json_response(200, page(items, "speechId", request))

    def create_speech(request: Request) -> dict[str, Any]:
        body = json_object(request.event)
        only_fields(body, {"speechId", "title", "kind"}, {"speechId", "title", "kind"})
        problems = []
        if not (isinstance(body["speechId"], str) and KEY_ID.fullmatch(body["speechId"])):
            problems.append(problem("speechId", "pattern"))
        if not valid_title(body["title"]):
            problems.append(problem("title", "pattern"))
        if body["kind"] not in KINDS:
            problems.append(problem("kind", "enum"))
        if problems:
            raise invalid(problems)
        speech_id = body["speechId"]
        request.log["speechId"] = speech_id
        header, draft = new_speech_items(
            speech_id=speech_id, title=body["title"], kind=body["kind"], by=request.caller.sub, at=deps.now()
        )
        content = table()
        failed = transact(content, create_actions(content, header, draft))
        status = 201 if failed is None else 200  # an existing speechId is answered with the item (G R18)
        return json_response(status, speech_view(speech_id))

    def get_speech(request: Request) -> dict[str, Any]:
        speech_id = path_id(request)
        request.log["speechId"] = speech_id
        return json_response(200, speech_view(speech_id))

    def save_speech(request: Request) -> dict[str, Any]:
        speech_id = path_id(request)
        request.log["speechId"] = speech_id
        body = json_object(request.event)
        only_fields(body, {"draftRevision", "title", "text", "ssml", "take"}, {"draftRevision"})
        revision = draft_revision_of(body)
        if ("text" in body) == ("ssml" in body):
            raise invalid([problem("body", "oneOf")])
        if "title" in body and not valid_title(body["title"]):
            raise invalid([problem("title", "pattern")])
        if "take" in body and (rule := take_problem(body["take"])) is not None:
            raise invalid([problem("take", rule)])
        _, draft = speech_items(speech_id)
        field, other = ("text", "ssml") if "text" in body else ("ssml", "text")
        take = body["take"] if "take" in body else draft_take(draft)  # absent: the draft keeps its take
        try:  # the same checks as a preview (G R20): length, characters, tags for the kind's engine
            clip_input(str(draft.get("kind")), deps.config(), take=take, **{field: body[field]})
        except ClipInputError as error:
            raise invalid([problem(error.field, error.rule)]) from None
        now, by = iso_z(deps.now()), request.caller.sub
        content = table()
        header_set = "SET #updatedAt = :now" + (", #title = :title" if "title" in body else "")
        header_names = {"#updatedAt": "updatedAt", **({"#title": "title"} if "title" in body else {})}
        header_values: dict[str, Any] = {":now": now, **({":title": body["title"].strip()} if "title" in body else {})}
        actions = [
            content.update_action(
                speech_pk(speech_id),
                DRAFT_SK,
                update="SET #body = :body, #take = :take, #rev = #rev + :one, #by = :by, #at = :now REMOVE #other",
                names={
                    "#body": field,
                    "#other": other,
                    "#take": "take",
                    "#rev": "draftRevision",
                    "#by": "updatedBy",
                    "#at": "updatedAt",
                },
                values={
                    ":body": canonical_text(body[field]),
                    ":take": take,
                    ":one": 1,
                    ":by": by,
                    ":now": now,
                    ":r": revision,
                },
                condition="#rev = :r",
            ),
            content.update_action(
                SPEECH_PK,
                speech_id,
                update=header_set,
                names={**header_names, "#pk": "pk"},
                values=header_values,
                condition="attribute_exists(#pk)",
            ),
        ]
        if transact(content, actions) is not None:
            raise ApiError("DRAFT_CONFLICT")
        return json_response(200, speech_view(speech_id))

    def approve_speech(request: Request) -> dict[str, Any]:
        speech_id = path_id(request)
        request.log.update(speechId=speech_id, action="approve")
        body = json_object(request.event)
        only_fields(body, {"draftRevision", "reviewNote"}, {"draftRevision"})
        revision = draft_revision_of(body)
        note = body.get("reviewNote")
        if note is not None and not (isinstance(note, str) and len(note) <= REVIEW_NOTE_MAX):
            raise invalid([problem("reviewNote", "maxLength")])
        header, draft = speech_items(speech_id)
        content = table()
        if as_int(header.get("fromDraftRevision")) == revision and header.get("approvedVersion"):
            existing = content.get_item(speech_pk(speech_id), f"{VERSION_PREFIX}{header['approvedVersion']}")
            if existing is not None:  # a retry of an approval that already happened (G R21)
                request.log["versionId"] = str(header["approvedVersion"])
                return json_response(200, approve_result(existing))
        if as_int(draft.get("draftRevision")) != revision:
            raise ApiError("DRAFT_CONFLICT")

        kind = str(draft.get("kind"))
        text, ssml = speech_body(draft)
        take = draft_take(draft)
        config = deps.config()
        if text is None and ssml is None:
            raise invalid([problem("draft", "empty")])
        try:
            doc = clip_input(kind, config, text=text, ssml=ssml, take=take)
        except ClipInputError as error:
            raise invalid([problem(error.field, error.rule)]) from None
        if kind == "PHONEME":  # the operator's approve is the verdict; only a word-only sound is refused (ADR-0028)
            refusal = phoneme_refusal(speech_id)
            if refusal is not None:
                raise invalid([problem("speechId", refusal)])
        key = clip_key(doc)
        store = deps.store()
        head = head_clip(deps.s3(), store, object_key(key, store.clip_prefix))
        sha256 = stored_sha256(head) if head is not None else None
        if head is None or sha256 is None:
            raise invalid([problem("draft", "not_previewed")])  # nobody rendered this exact input (D §D9.3)
        rendered = head.get("LastModified")

        moment = deps.now()
        vid = version_id(moment)
        request.log["versionId"] = vid
        review: dict[str, Any] = {"listenedBy": request.caller.sub, "listenedAt": iso_z(moment)}
        if note:
            review["reviewNote"] = note
        version = {
            "pk": speech_pk(speech_id),
            "sk": f"{VERSION_PREFIX}{vid}",
            "speechId": speech_id,
            "kind": kind,
            "provider": PROVIDER,
            "engine": doc["engine"],
            "voiceId": doc["voiceId"],
            **({"text": text} if text is not None else {"ssml": ssml}),
            "take": take,
            "clipKey": key,
            "sha256": sha256,
            "renderedAt": iso_z(rendered) if isinstance(rendered, datetime) else None,
            "approvedAt": iso_z(moment),
            "review": review,
            "fromDraftRevision": revision,
        }
        version = {name: value for name, value in version.items() if value is not None}
        audit_pk, audit_sk = audit_key(moment, speech_id)
        actions = [
            content.put_action(version, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
            content.update_action(
                SPEECH_PK,
                speech_id,
                update="SET #state = :approved, #v = :v, #from = :r, #at = :now",
                names={
                    "#state": "state",
                    "#v": "approvedVersion",
                    "#from": "fromDraftRevision",
                    "#at": "updatedAt",
                    "#pk": "pk",
                },
                values={":approved": "APPROVED", ":v": vid, ":r": revision, ":now": iso_z(moment)},
                condition="attribute_exists(#pk)",
            ),
            content.condition_check_action(
                speech_pk(speech_id),
                DRAFT_SK,
                condition="#rev = :r",
                names={"#rev": "draftRevision"},
                values={":r": revision},
            ),
            content.put_action(
                audit_item(
                    audit_pk, audit_sk, "approve", request.caller.sub, moment, speechId=speech_id, versionId=vid
                ),
                condition="attribute_not_exists(#pk)",
                names={"#pk": "pk"},
            ),
        ]
        if transact(content, actions) is not None:
            raise ApiError("DRAFT_CONFLICT")
        return json_response(200, approve_result(version))

    # --- Activities (G §12.2) ---------------------------------------------------------------------------------------

    def activity_items(activity_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        content = table()
        header = content.get_item(ACT_PK, activity_id)
        draft = content.get_item(activity_pk(activity_id), DRAFT_SK)
        if header is None or draft is None:
            raise ApiError("NOT_FOUND")
        return header, draft

    def activity_view(activity_id: str) -> dict[str, Any]:
        header, draft = activity_items(activity_id)
        versions = table().query_prefix(
            activity_pk(activity_id), VERSION_PREFIX, attributes=("sk", "publishedAt", "publishedBy", "withdrawn")
        )
        numbers = display_numbers(str(v["sk"]).removeprefix(VERSION_PREFIX) for v in versions)
        listed = []
        for item in sorted(versions, key=lambda v: str(v["sk"])):
            vid = str(item["sk"]).removeprefix(VERSION_PREFIX)
            entry = {
                "versionId": vid,
                "displayNumber": numbers[vid],
                "publishedAt": item.get("publishedAt"),
                "publishedBy": item.get("publishedBy"),
            }
            if item.get("withdrawn"):
                entry["withdrawn"] = plain(item["withdrawn"])
            listed.append(entry)
        return {
            "header": {**activity_summary(header), "fromDraftRevision": as_int(header.get("fromDraftRevision"))},
            "draft": {
                "definition": plain(draft.get("definition")),
                "draftRevision": as_int(draft.get("draftRevision")),
                "updatedAt": draft.get("updatedAt"),
            },
            "versions": listed,
        }

    def list_activities(request: Request) -> dict[str, Any]:
        subject, state = query_param(request.event, "subject"), query_param(request.event, "state")
        band_raw = query_param(request.event, "ageBand")
        if subject is not None and subject not in SUBJECTS:
            raise invalid([problem("subject", "enum")])
        if state is not None and state not in ("DRAFT", "PUBLISHED", "RETIRED"):
            raise invalid([problem("state", "enum")])
        band = int(band_raw) if band_raw is not None and band_raw.isdigit() else None
        if band_raw is not None and band not in AGE_BANDS:
            raise invalid([problem("ageBand", "enum")])
        items = []
        for header in table().query_prefix(ACT_PK, ""):
            summary = activity_summary(header)
            low, high = as_int(header.get("minAge")), as_int(header.get("maxAge"))
            if subject is not None and summary["subject"] != subject:
                continue
            if state is not None and summary["state"] != state:
                continue
            if band is not None and not (low is not None and high is not None and low <= band <= high):
                continue
            items.append(summary)
        return json_response(200, page(items, "activityId", request))

    def create_activity(request: Request) -> dict[str, Any]:
        body = json_object(request.event)
        problems = check_create_fields(body)
        if problems:
            raise invalid(problems)
        activity_id = body["activityId"]
        request.log["activityId"] = activity_id
        header, draft = new_activity_items(definition=initial_definition(body), by=request.caller.sub, at=deps.now())
        content = table()
        failed = transact(content, create_actions(content, header, draft))
        return json_response(201 if failed is None else 200, activity_view(activity_id))

    def get_activity(request: Request) -> dict[str, Any]:
        activity_id = path_id(request)
        request.log["activityId"] = activity_id
        wanted = query_param(request.event, "version")
        if wanted is None:
            return json_response(200, activity_view(activity_id))
        if not VERSION_ID.fullmatch(wanted):
            raise ApiError("NOT_FOUND")
        item = table().get_item(activity_pk(activity_id), f"{VERSION_PREFIX}{wanted}")
        if item is None:
            raise ApiError("NOT_FOUND")
        request.log["versionId"] = wanted
        definition = {k: plain(v) for k, v in item.items() if k not in ("pk", "sk")}
        return json_response(200, {"versionId": wanted, "definition": definition})

    def save_activity(request: Request) -> dict[str, Any]:
        activity_id = path_id(request)
        request.log["activityId"] = activity_id
        body = json_object(request.event, max_bytes=DRAFT_MAX_BYTES)
        only_fields(body, {"draftRevision", "definition"}, {"draftRevision", "definition"})
        revision = draft_revision_of(body)
        definition = body["definition"]
        if not isinstance(definition, Mapping):
            raise invalid([problem("definition", "type")])
        if definition.get("activityId") != activity_id:
            raise invalid([problem("definition.activityId", "matches_path")])
        header, _ = activity_items(activity_id)
        locked = locked_problems(header, definition)
        if locked:
            raise invalid([problem(f"definition.{p['field']}", p["rule"]) for p in locked])
        now, by = iso_z(deps.now()), request.caller.sub
        # Before the first publish the header follows the draft (when its identity fields check), so the list shows
        # what is being written; after it, the header describes the published version and only `updatedAt` moves.
        header_set = {"updatedAt": now}
        if not header.get("publishedVersion") and not check_create_fields(
            {
                name: definition.get(name)
                for name in (
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
            }
        ):
            header_set.update(header_fields(definition))
        names = {f"#h{i}": name for i, name in enumerate(header_set)}
        values = {f":h{i}": value for i, value in enumerate(header_set.values())}
        content = table()
        actions = [
            content.update_action(
                activity_pk(activity_id),
                DRAFT_SK,
                update="SET #def = :def, #rev = #rev + :one, #by = :by, #at = :now",
                names={"#def": "definition", "#rev": "draftRevision", "#by": "updatedBy", "#at": "updatedAt"},
                values={":def": dict(definition), ":one": 1, ":by": by, ":now": now, ":r": revision},
                condition="#rev = :r",
            ),
            content.update_action(
                ACT_PK,
                activity_id,
                update="SET " + ", ".join(f"{n} = {v}" for n, v in zip(names, values, strict=True)),
                names={**names, "#pk": "pk"},
                values=values,
                condition="attribute_exists(#pk)",
            ),
        ]
        if transact(content, actions) is not None:
            raise ApiError("DRAFT_CONFLICT")
        return json_response(200, activity_view(activity_id))

    def validate_activity(request: Request) -> dict[str, Any]:
        activity_id = path_id(request)
        request.log["activityId"] = activity_id
        body = json_object(request.event)
        only_fields(body, {"draftRevision"}, {"draftRevision"})
        revision = draft_revision_of(body)
        header, draft = activity_items(activity_id)
        if as_int(draft.get("draftRevision")) != revision:
            raise ApiError("DRAFT_CONFLICT")
        problems, _ = publish_checks(table(), header, draft, activity_id)
        return json_response(
            200, {"valid": not problems, "problems": problems, "draftRevision": revision, "domainSize": 1}
        )

    def publish_activity(request: Request) -> dict[str, Any]:
        activity_id = path_id(request)
        request.log.update(activityId=activity_id, action="publish")
        body = json_object(request.event)
        only_fields(body, {"draftRevision", "review"}, {"draftRevision", "review"})
        revision = draft_revision_of(body)
        header, draft = activity_items(activity_id)
        content = table()
        published = header.get("publishedVersion")
        if as_int(header.get("fromDraftRevision")) == revision and published:
            request.log["versionId"] = str(published)  # a retry of a publish that already happened (G R27)
            return json_response(200, publish_result(content, activity_id, str(published)))
        if as_int(draft.get("draftRevision")) != revision:
            raise ApiError("DRAFT_CONFLICT")
        problems = checklist_problems(body["review"], revision)
        checks, resolved = publish_checks(content, header, draft, activity_id)
        problems += checks
        if problems:
            raise invalid(problems)

        vid, actions = publish_actions(
            content,
            activity_id=activity_id,
            header=header,
            draft=draft,
            revision=revision,
            resolved=resolved,
            review=body["review"],
            by=request.caller.sub,
            moment=deps.now(),
        )
        request.log["versionId"] = vid
        if transact(content, actions) is not None:
            now_header = content.get_item(ACT_PK, activity_id)
            if now_header is not None and as_int(now_header.get("fromDraftRevision")) == revision:
                won = str(now_header.get("publishedVersion"))  # another tab published this revision first
                request.log["versionId"] = won
                return json_response(200, publish_result(content, activity_id, won))
            raise ApiError("DRAFT_CONFLICT")  # the draft, or an approved clip it uses, changed while publishing
        return json_response(201, publish_result(content, activity_id, vid))

    def retire_activity(request: Request) -> dict[str, Any]:
        """R28 (F §12.6 C5): header state RETIRED + audit; versions untouched, so pinned runs play on unchanged."""
        activity_id = path_id(request)
        request.log.update(activityId=activity_id, action="retire")
        only_fields(json_object(request.event), set(), set())
        content = table()
        for _ in range(WRITE_TRIES):
            header = content.get_item(ACT_PK, activity_id)
            if header is None:
                raise ApiError("NOT_FOUND")
            if header.get("state") == "RETIRED":
                return json_response(200, retire_view(header))  # idempotent: already retired, unchanged
            published = header.get("publishedVersion")
            if header.get("state") != "PUBLISHED" or not published:
                raise invalid([problem("state", "not_published")])  # a draft that was never published
            moment = deps.now()
            audit_pk, audit_sk = audit_key(moment, f"{activity_id}#retire#{published}")
            actions = [
                content.update_action(
                    ACT_PK,
                    activity_id,
                    update="SET #state = :retired, #at = :now",
                    names={"#state": "state", "#at": "updatedAt", "#pv": "publishedVersion"},
                    values={":retired": "RETIRED", ":now": iso_z(moment), ":published": "PUBLISHED", ":pv": published},
                    condition="#state = :published AND #pv = :pv",
                ),
                content.put_action(
                    audit_item(
                        audit_pk,
                        audit_sk,
                        "retire",
                        request.caller.sub,
                        moment,
                        activityId=activity_id,
                        versionId=str(published),
                    ),
                    condition="attribute_not_exists(#pk)",
                    names={"#pk": "pk"},
                ),
            ]
            if transact(content, actions) is None:
                request.log["versionId"] = str(published)
                return json_response(200, retire_view(content.get_item(ACT_PK, activity_id) or header))
        raise ApiError("THROTTLED")  # the header kept changing under us; the client retries the same request

    def withdraw_activity(request: Request) -> dict[str, Any]:
        """R29 (F §12.6 C6): `withdrawn {at, reason}` on one version + audit; the published version also retires."""
        activity_id = path_id(request)
        request.log.update(activityId=activity_id, action="withdraw")
        body = json_object(request.event)
        only_fields(body, {"version", "reason"}, {"version", "reason"})
        wanted, reason = body["version"], body["reason"]
        problems = []
        if not (isinstance(wanted, str) and VERSION_ID.fullmatch(wanted)):
            problems.append(problem("version", "pattern"))
        if not (isinstance(reason, str) and valid_reason(reason)):
            problems.append(problem("reason", "length"))
        if problems:
            raise invalid(problems)
        request.log["versionId"] = wanted
        content = table()
        for _ in range(WRITE_TRIES):
            header = content.get_item(ACT_PK, activity_id)
            # `pk` in the projection: with only `withdrawn`, a version never withdrawn may come back with no Item.
            version_sk = f"{VERSION_PREFIX}{wanted}"
            version = content.get_item(activity_pk(activity_id), version_sk, attributes=("pk", "withdrawn"))
            if header is None or version is None:
                raise ApiError("NOT_FOUND")
            if version.get("withdrawn"):  # idempotent: the first record stands
                return json_response(200, {"versionId": wanted, "withdrawn": plain(version["withdrawn"])})
            moment = deps.now()
            record = {"at": iso_z(moment), "reason": reason.strip()}
            retire = header.get("publishedVersion") == wanted and header.get("state") == "PUBLISHED"
            audit_pk, audit_sk = audit_key(moment, f"{activity_id}#withdraw#{wanted}")
            audit = audit_item(
                audit_pk, audit_sk, "withdraw", request.caller.sub, moment, activityId=activity_id, versionId=wanted
            )
            audit.update(reason=record["reason"], retired=retire)
            actions = [
                content.update_action(
                    activity_pk(activity_id),
                    f"{VERSION_PREFIX}{wanted}",
                    update="SET #w = :w",
                    names={"#w": "withdrawn", "#pk": "pk"},
                    values={":w": record},
                    condition="attribute_exists(#pk) AND attribute_not_exists(#w)",
                ),
                content.put_action(audit, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
            ]
            if retire:
                actions.append(
                    content.update_action(
                        ACT_PK,
                        activity_id,
                        update="SET #state = :retired, #at = :now",
                        names={"#state": "state", "#at": "updatedAt", "#pv": "publishedVersion"},
                        values={
                            ":retired": "RETIRED",
                            ":now": iso_z(moment),
                            ":published": "PUBLISHED",
                            ":pv": wanted,
                        },
                        condition="#state = :published AND #pv = :pv",
                    )
                )
            if transact(content, actions) is None:
                return json_response(200, {"versionId": wanted, "withdrawn": record})
        raise ApiError("THROTTLED")

    def delete_activity(request: Request) -> dict[str, Any]:
        """R31 (owner decision 2026-11-16, "just do delete"): remove the activity for good: the header, the draft and
        every version, plus one audit item (`delete`, the version IDs removed, by the caller's `sub`).

        The header goes first, in one transaction with the draft and the audit item (which lists every version the
        request read). Up to DELETE_VERSIONS_IN_TRANSACTION versions go in that same transaction; beyond that they are
        deleted one by one afterwards. So the activity leaves the bank the moment the header goes (new runs never meet
        a PUBLISHED header whose version is gone), and the audit item records every version ID before any is deleted.
        A request that stops part way leaves only versions behind; a retry finds no header and finishes the job
        without a second audit item, answering with the versions it removed. Nothing left at all: 404.

        Races: the header delete is conditioned on the header existing with the `publishedVersion` that was read, so a
        publish landing between the read and the delete (a version this request did not see) refuses the transaction
        and the loop re-reads and deletes that version too. A draft save racing the delete either lands first (and
        is deleted with the draft) or is refused afterwards: its transaction needs the header and the draft revision.
        Once the header is gone no publish or save can add anything, so the audit item's list is complete.

        Runs that pinned a deleted version keep working: a missing pin reads exactly like a withdrawn version
        (shared/selection/bank.py `read_versions`), so the slot is voided with its reward when the child reaches it."""
        activity_id = path_id(request)
        request.log.update(activityId=activity_id, action="delete")
        content = table()
        pk = activity_pk(activity_id)
        for _ in range(WRITE_TRIES):
            header = content.get_item(ACT_PK, activity_id)
            draft = content.get_item(pk, DRAFT_SK, attributes=("pk",))
            version_sks = sorted(str(v["sk"]) for v in content.query_prefix(pk, VERSION_PREFIX, attributes=("sk",)))
            listed = sorted(sk.removeprefix(VERSION_PREFIX) for sk in version_sks)
            if header is None:
                if draft is None and not version_sks:
                    raise ApiError("NOT_FOUND")
                # An earlier delete removed the header (its audit item lists every version) and stopped: finish it.
                for sk in version_sks:
                    content.delete_item(pk, sk)
                content.delete_item(pk, DRAFT_SK)
                request.log.update(resumed=True)
                return json_response(200, {"activityId": activity_id, "deletedVersions": listed})
            in_transaction = len(version_sks) <= DELETE_VERSIONS_IN_TRANSACTION
            moment = deps.now()
            audit_pk, audit_sk = audit_key(moment, f"{activity_id}#delete")
            audit = audit_item(
                audit_pk, audit_sk, "delete", request.caller.sub, moment, activityId=activity_id, versionIds=listed
            )
            published = header.get("publishedVersion")
            actions = [content.delete_action(pk, sk) for sk in version_sks] if in_transaction else []
            actions.append(content.delete_action(pk, DRAFT_SK))
            actions.append(
                content.delete_action(
                    ACT_PK,
                    activity_id,
                    condition="attribute_exists(#pk) AND "
                    + ("#pv = :pv" if published else "attribute_not_exists(#pv)"),
                    names={"#pk": "pk", "#pv": "publishedVersion"},
                    values={":pv": published} if published else None,
                )
            )
            actions.append(content.put_action(audit, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}))
            if transact(content, actions) is None:
                if not in_transaction:
                    for sk in version_sks:
                        content.delete_item(pk, sk)
                return json_response(200, {"activityId": activity_id, "deletedVersions": listed})
        raise ApiError("THROTTLED")  # the activity kept changing under us; the client retries the same request

    handlers = {
        "GET /api/admin/speech-definitions": list_speech,
        "POST /api/admin/speech-definitions": create_speech,
        "GET /api/admin/speech-definitions/{id}": get_speech,
        "PUT /api/admin/speech-definitions/{id}": save_speech,
        "POST /api/admin/speech-definitions/{id}/approve": approve_speech,
        "GET /api/admin/activities": list_activities,
        "POST /api/admin/activities": create_activity,
        "GET /api/admin/activities/{id}": get_activity,
        "PUT /api/admin/activities/{id}/draft": save_activity,
        "POST /api/admin/activities/{id}/validate": validate_activity,
        "POST /api/admin/activities/{id}/publish": publish_activity,
        "POST /api/admin/activities/{id}/retire": retire_activity,
        "POST /api/admin/activities/{id}/withdraw": withdraw_activity,
        "DELETE /api/admin/activities/{id}": delete_activity,
    }
    return Router(routes=ROUTES, handlers=handlers, logger=logger)


def create_actions(table: DynamoTable, header: Mapping[str, Any], draft: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Create-only: both items or neither, never over an existing one (spine S8.3 C8)."""
    return [
        table.put_action(header, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
        table.put_action(draft, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
    ]


def valid_reason(value: str) -> bool:
    """A withdrawal reason: 1-200 characters once trimmed, no control characters (it is shown to the operator)."""
    trimmed = value.strip()
    return 0 < len(trimmed) <= WITHDRAW_REASON_MAX and not any(ord(ch) < 32 or ord(ch) == 127 for ch in trimmed)


def retire_view(header: Mapping[str, Any]) -> dict[str, Any]:
    """R28's body: the header, as R24 shows it."""
    return {**activity_summary(header), "fromDraftRevision": as_int(header.get("fromDraftRevision"))}


def approve_result(version: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "versionId": str(version["sk"]).removeprefix(VERSION_PREFIX),
        "clipKey": version.get("clipKey"),
        "sha256": version.get("sha256"),
        "renderedAt": version.get("renderedAt"),
        "take": draft_take(version),
    }


def publish_result(content: DynamoTable, activity_id: str, vid: str) -> dict[str, Any]:
    versions = content.query_prefix(activity_pk(activity_id), VERSION_PREFIX, attributes=("sk",))
    numbers = display_numbers(str(v["sk"]).removeprefix(VERSION_PREFIX) for v in versions)
    return {"versionId": vid, "displayNumber": numbers.get(vid)}


DEFAULT_DEPS = Deps()
ROUTER = make_router(DEFAULT_DEPS)


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    return ROUTER.handle(event)
