"""admin-api: content administration, operator only (plan G §12 R17-R30, E.6.3; Phase 20, M1-19).

Every route needs the operator authoriser at the gateway and, here, `token_use = access` and the exact group `admin`
(shared/auth.py), checked from the route key before anything is read. A player token never reaches this function: the
operator authoriser refuses another pool's issuer with 401. Audit fields (`createdBy`, `updatedBy`, `listenedBy`,
`publishedBy`) always come from the token's `sub`, never the body.

Phase 20 answers the minimal admin path (D §D8.6): speech definitions R17-R21 and activities R22-R27. Retire, withdraw
and bank status (R28-R30) still answer 501 NOT_IMPLEMENTED until Phases 35-40. Item shapes and checks are in
shared/content.py.

Speech approval (R21, F §12.6 C7, D §D9.3) never synthesises. It recomputes the clip key from the SAVED draft (its kind
picks the engine, with the same TTS_* configuration as `tts`) and requires that object in the audio bucket: the object
exists only if `POST /api/admin/speech/preview` rendered exactly this draft's input, so "a preview of the same draft
revision exists" is a fact the server can check, not a claim from the browser. A PHONEME definition also needs a
publishable verdict in content/listening-verdicts.json (G-14, shared/verdicts.py). The version records `clipKey`, the
`sha256` of the MP3 bytes, the render date (the object's LastModified), `engine`, `voiceId` and the review record.

Activity publication (R27, C4) checks the draft revision, the seven-line checklist, the preview-solve revision, the
definition (C22.2 subset) and that every referenced speech definition is approved, then writes the immutable version,
the header, and an audit item in one transaction that also re-checks the draft revision and each speech definition's
approved version. R21 and R27 are safe to retry: a repeat whose `draftRevision` equals the header's
`fromDraftRevision` returns the version already written.
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
from shared.clipkey import KINDS, PROVIDER, ClipInputError, SpeechConfig, canonical_text, clip_key, object_key
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
    approval_problems,
    as_int,
    audit_key,
    check_create_fields,
    checklist_problems,
    definition_problems,
    display_numbers,
    header_fields,
    initial_definition,
    iso_z,
    locked_problems,
    new_activity_items,
    new_speech_items,
    plain,
    problem,
    published_version,
    speech_body,
    speech_pk,
    speech_refs,
    valid_title,
    version_id,
)
from shared.data import CONTENT_TABLE_ENV, DynamoTable, cancellation_reasons, is_transient, table_from_env
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
}

DRAFT_MAX_BYTES: int = LIMITS["bodyMaxBytes"]["adminActivityDraft"]  # 64 KB for PUT .../draft (G §12)
LIST_LIMIT: dict[str, int] = LIMITS["adminListLimit"]
REVIEW_NOTE_MAX = 500  # [ASSUMPTION]


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
        "updatedAt": draft.get("updatedAt"),
        "clipKey": None,
    }
    if text is not None:
        view["text"] = text
    if ssml is not None:
        view["ssml"] = ssml
    if text is not None or ssml is not None:
        with contextlib.suppress(ClipInputError):  # a draft saved before a configuration change may no longer check
            view["clipKey"] = clip_key(clip_input(kind, config, text=text, ssml=ssml))
    return view


SPEECH_VERSION_FIELDS = ("clipKey", "sha256", "renderedAt", "approvedAt", "engine", "voiceId", "review")


def speech_version_view(item: Mapping[str, Any]) -> dict[str, Any]:
    view = {"versionId": str(item["sk"]).removeprefix(VERSION_PREFIX)}
    view.update({name: plain(item.get(name)) for name in SPEECH_VERSION_FIELDS})
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
        only_fields(body, {"draftRevision", "title", "text", "ssml"}, {"draftRevision"})
        revision = draft_revision_of(body)
        if ("text" in body) == ("ssml" in body):
            raise invalid([problem("body", "oneOf")])
        if "title" in body and not valid_title(body["title"]):
            raise invalid([problem("title", "pattern")])
        _, draft = speech_items(speech_id)
        field, other = ("text", "ssml") if "text" in body else ("ssml", "text")
        try:  # the same checks as a preview (G R20): length, characters, tags for the kind's engine
            clip_input(str(draft.get("kind")), deps.config(), **{field: body[field]})
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
                update="SET #body = :body, #rev = #rev + :one, #by = :by, #at = :now REMOVE #other",
                names={
                    "#body": field,
                    "#other": other,
                    "#rev": "draftRevision",
                    "#by": "updatedBy",
                    "#at": "updatedAt",
                },
                values={":body": canonical_text(body[field]), ":one": 1, ":by": by, ":now": now, ":r": revision},
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
        config = deps.config()
        if text is None and ssml is None:
            raise invalid([problem("draft", "empty")])
        try:
            doc = clip_input(kind, config, text=text, ssml=ssml)
        except ClipInputError as error:
            raise invalid([problem(error.field, error.rule)]) from None
        if kind == "PHONEME":
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

    def publish_checks(
        header: Mapping[str, Any], draft: Mapping[str, Any], activity_id: str
    ) -> tuple[list[dict[str, str]], dict[str, dict[str, str]]]:
        """C22.2 subset: (problems, resolved speech refs {variant: {speechId, speechVersion, clipKey}})."""
        definition = draft.get("definition")
        problems = definition_problems(definition, activity_id)
        if not isinstance(definition, Mapping):
            return problems, {}
        problems += locked_problems(header, definition)
        refs = speech_refs(definition)
        content = table()
        found = content.batch_get([(SPEECH_PK, speech_id) for speech_id in set(refs.values())])
        headers = {speech_id: found.get((SPEECH_PK, speech_id)) for speech_id in set(refs.values())}
        problems += approval_problems(refs, headers)
        resolved: dict[str, dict[str, str]] = {}
        approved = {
            speech_id: str(h["approvedVersion"])
            for speech_id, h in headers.items()
            if h is not None and h.get("state") == "APPROVED" and h.get("approvedVersion")
        }
        versions = content.batch_get([(speech_pk(s), f"{VERSION_PREFIX}{v}") for s, v in approved.items()])
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

    def validate_activity(request: Request) -> dict[str, Any]:
        activity_id = path_id(request)
        request.log["activityId"] = activity_id
        body = json_object(request.event)
        only_fields(body, {"draftRevision"}, {"draftRevision"})
        revision = draft_revision_of(body)
        header, draft = activity_items(activity_id)
        if as_int(draft.get("draftRevision")) != revision:
            raise ApiError("DRAFT_CONFLICT")
        problems, _ = publish_checks(header, draft, activity_id)
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
        checks, resolved = publish_checks(header, draft, activity_id)
        problems += checks
        if problems:
            raise invalid(problems)

        definition: Mapping[str, Any] = draft["definition"]
        moment = deps.now()
        vid = version_id(moment)
        request.log["versionId"] = vid
        version = published_version(
            definition=definition,
            resolved=resolved,
            version=vid,
            review=body["review"],
            by=request.caller.sub,
            at=moment,
            from_draft_revision=revision,
        )
        header_set = {
            **header_fields(definition),
            "state": "PUBLISHED",
            "publishedVersion": vid,
            "fromDraftRevision": revision,
            "updatedAt": iso_z(moment),
        }
        names = {f"#h{i}": name for i, name in enumerate(header_set)}
        values = {f":h{i}": value for i, value in enumerate(header_set.values())}
        audit_pk, audit_sk = audit_key(moment, activity_id)
        actions = [
            content.put_action(version, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
            content.update_action(
                ACT_PK,
                activity_id,
                update="SET " + ", ".join(f"{n} = {v}" for n, v in zip(names, values, strict=True)),
                names={**names, "#pk": "pk"},
                values=values,
                condition="attribute_exists(#pk)",
            ),
            content.condition_check_action(
                activity_pk(activity_id),
                DRAFT_SK,
                condition="#rev = :r",
                names={"#rev": "draftRevision"},
                values={":r": revision},
            ),
        ]
        for speech_id, speech_version in sorted({(r["speechId"], r["speechVersion"]) for r in resolved.values()}):
            actions.append(
                content.condition_check_action(
                    SPEECH_PK,
                    speech_id,
                    condition="#v = :v",
                    names={"#v": "approvedVersion"},
                    values={":v": speech_version},
                )
            )
        actions.append(
            content.put_action(
                audit_item(
                    audit_pk, audit_sk, "publish", request.caller.sub, moment, activityId=activity_id, versionId=vid
                ),
                condition="attribute_not_exists(#pk)",
                names={"#pk": "pk"},
            )
        )
        if transact(content, actions) is not None:
            raise ApiError("DRAFT_CONFLICT")  # the draft, or an approved clip it uses, changed while publishing
        return json_response(201, publish_result(content, activity_id, vid))

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
    }
    return Router(routes=ROUTES, handlers=handlers, logger=logger)


def create_actions(table: DynamoTable, header: Mapping[str, Any], draft: Mapping[str, Any]) -> list[dict[str, Any]]:
    """Create-only: both items or neither, never over an existing one (spine S8.3 C8)."""
    return [
        table.put_action(header, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
        table.put_action(draft, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
    ]


def audit_item(pk: str, sk: str, action: str, by: str, moment: datetime, **ids: str) -> dict[str, Any]:
    return {"pk": pk, "sk": sk, "action": action, "by": by, "at": iso_z(moment), **ids}


def approve_result(version: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "versionId": str(version["sk"]).removeprefix(VERSION_PREFIX),
        "clipKey": version.get("clipKey"),
        "sha256": version.get("sha256"),
        "renderedAt": version.get("renderedAt"),
    }


def publish_result(content: DynamoTable, activity_id: str, vid: str) -> dict[str, Any]:
    versions = content.query_prefix(activity_pk(activity_id), VERSION_PREFIX, attributes=("sk",))
    numbers = display_numbers(str(v["sk"]).removeprefix(VERSION_PREFIX) for v in versions)
    return {"versionId": vid, "displayNumber": numbers.get(vid)}


DEFAULT_DEPS = Deps()
ROUTER = make_router(DEFAULT_DEPS)


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    return ROUTER.handle(event)
