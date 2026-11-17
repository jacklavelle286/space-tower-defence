"""admin-api's level routes (Gate M, LD3): level drafts for the level designer. Item shapes are in shared/levels.py.

    R40 GET    /api/admin/levels                 levels (summaries), paged by levelId
    R41 POST   /api/admin/levels                 create a level from a level file body (a template or an upload)
    R42 GET    /api/admin/levels/{id}            the header and the draft (the level file body and its revision)
    R43 PUT    /api/admin/levels/{id}/draft      save: {draftRevision, level}; a stale revision is 409 DRAFT_CONFLICT
    R44 DELETE /api/admin/levels/{id}            delete a level (in LD3 every level is a draft never published)
    R45 POST   /api/admin/levels/{id}/testplay   record that the checks ran on a draft revision: {draftRevision,
                                                 blocking, warnings} (LD5); refused (409) when the draft moved on

Create is create-only: header, draft and audit item in one transaction; an ID already used is refused
(`{field: "level.levelId", rule: "exists"}`). Save conditions the draft on the revision the editor loaded, the same
optimistic check as activity drafts (R23), so two tabs cannot overwrite each other silently. Delete removes header,
draft and audit item in one transaction, conditioned on the header still being a draft. Publishing, versions and
retiring arrive with the publisher (LD6, LD7); delete then refuses a level that was ever published.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any

from shared.body import json_object
from shared.content import as_int, audit_item, audit_key, iso_z, plain, problem
from shared.data import DynamoTable
from shared.errors import ApiError, json_response
from shared.levels import DRAFT_SK, LEVEL_ID, LEVEL_PK, level_pk, level_problems, level_summary, new_level_items
from shared.router import Request
from shared.rules.contracts import LIMITS

Handler = Callable[[Request], dict[str, Any]]
Transact = Callable[[DynamoTable, list[dict[str, Any]]], list[str] | None]
Page = Callable[[list[dict[str, Any]], str, Request], dict[str, Any]]

# A level file is the same size class as an activity draft (contracts/limits.json bodyMaxBytes.adminActivityDraft, 64
# KB) [ASSUMPTION: 50 waves fit; measured when LD4 adds waves].
LEVEL_MAX_BYTES: int = LIMITS["bodyMaxBytes"]["adminActivityDraft"]


def _invalid(problems: list[dict[str, str]]) -> ApiError:
    return ApiError("VALIDATION_FAILED", details=problems)


def _level_id(request: Request) -> str:
    params = request.event.get("pathParameters")
    value = params.get("id") if isinstance(params, Mapping) else None
    if not isinstance(value, str) or not LEVEL_ID.fullmatch(value):
        raise ApiError("NOT_FOUND")
    return value


def _only(body: Mapping[str, Any], fields: set[str]) -> None:
    problems = [problem(name, "additionalProperties") for name in body if name not in fields]
    problems += [problem(name, "required") for name in sorted(fields) if name not in body]
    if problems:
        raise _invalid(problems)


def make_level_handlers(
    *, table: Callable[[], DynamoTable], now: Callable[[], datetime], transact: Transact, page: Page
) -> dict[str, Handler]:
    """The six level handlers, by route key."""

    def items(level_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        found = table().batch_get([(LEVEL_PK, level_id), (level_pk(level_id), DRAFT_SK)])
        header, draft = found.get((LEVEL_PK, level_id)), found.get((level_pk(level_id), DRAFT_SK))
        if header is None or draft is None:
            raise ApiError("NOT_FOUND")
        return header, draft

    def view(level_id: str) -> dict[str, Any]:
        header, draft = items(level_id)
        return {
            "header": level_summary(header),
            "draft": {
                "level": plain(draft.get("level")),
                "draftRevision": as_int(draft.get("draftRevision")),
                "updatedAt": draft.get("updatedAt"),
                "review": plain(draft.get("review") or {}),
            },
        }

    def list_levels(request: Request) -> dict[str, Any]:
        return json_response(
            200, page([level_summary(h) for h in table().query_prefix(LEVEL_PK, "")], "levelId", request)
        )

    def create_level(request: Request) -> dict[str, Any]:
        body = json_object(request.event, max_bytes=LEVEL_MAX_BYTES)
        _only(body, {"level"})
        level = body["level"]
        level_id = level.get("levelId") if isinstance(level, Mapping) else None
        if not isinstance(level_id, str) or not LEVEL_ID.fullmatch(level_id):
            raise _invalid([problem("level.levelId", "pattern")])
        problems = level_problems(level, level_id)
        if problems:
            raise _invalid(problems)
        request.log["levelId"] = level_id
        moment, by = now(), request.caller.sub
        header, draft = new_level_items(level=level, by=by, at=moment)
        content = table()
        pk, sk = audit_key(moment, level_id)
        actions = [
            content.put_action(header, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
            content.put_action(draft, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
            content.put_action(
                audit_item(pk, sk, "level.create", by, moment, levelId=level_id),
                condition="attribute_not_exists(#pk)",
                names={"#pk": "pk"},
            ),
        ]
        if transact(content, actions) is not None:
            raise _invalid([problem("level.levelId", "exists")])
        return json_response(201, view(level_id))

    def get_level(request: Request) -> dict[str, Any]:
        level_id = _level_id(request)
        request.log["levelId"] = level_id
        return json_response(200, view(level_id))

    def save_level(request: Request) -> dict[str, Any]:
        level_id = _level_id(request)
        request.log["levelId"] = level_id
        body = json_object(request.event, max_bytes=LEVEL_MAX_BYTES)
        _only(body, {"draftRevision", "level"})
        revision = as_int(body["draftRevision"])
        if revision is None or revision < 0:
            raise _invalid([problem("draftRevision", "type")])
        problems = level_problems(body["level"], level_id)
        if problems:
            raise _invalid(problems)
        level = dict(body["level"])
        stamp, by = iso_z(now()), request.caller.sub
        content = table()
        actions = [
            content.update_action(
                level_pk(level_id),
                DRAFT_SK,
                update="SET #lvl = :lvl, #rev = #rev + :one, #by = :by, #at = :now",
                names={"#lvl": "level", "#rev": "draftRevision", "#by": "updatedBy", "#at": "updatedAt"},
                values={":lvl": level, ":one": 1, ":by": by, ":now": stamp, ":r": revision},
                condition="#rev = :r",
            ),
            content.update_action(
                LEVEL_PK,
                level_id,
                update="SET #name = :name, #at = :now",
                names={"#name": "name", "#at": "updatedAt", "#pk": "pk"},
                values={":name": level["name"], ":now": stamp},
                condition="attribute_exists(#pk)",
            ),
        ]
        if transact(content, actions) is not None:
            items(level_id)  # NOT_FOUND when the level is gone; otherwise someone saved first
            raise ApiError("DRAFT_CONFLICT")
        return json_response(200, view(level_id))

    def delete_level(request: Request) -> dict[str, Any]:
        level_id = _level_id(request)
        request.log.update(levelId=level_id, action="delete")
        items(level_id)
        moment, by = now(), request.caller.sub
        content = table()
        pk, sk = audit_key(moment, level_id)
        actions = [
            content.delete_action(
                LEVEL_PK,
                level_id,
                condition="#status = :draft",
                names={"#status": "status"},
                values={":draft": "DRAFT"},
            ),
            content.delete_action(level_pk(level_id), DRAFT_SK),
            content.put_action(
                audit_item(pk, sk, "level.delete", by, moment, levelId=level_id),
                condition="attribute_not_exists(#pk)",
                names={"#pk": "pk"},
            ),
        ]
        if transact(content, actions) is not None:
            raise ApiError("NOT_FOUND")  # deleted meanwhile (a published level cannot exist before LD6)
        return json_response(200, {"levelId": level_id, "deleted": True})

    def record_testplay(request: Request) -> dict[str, Any]:
        """The editor ran the balance checks (LD5) on `draftRevision`: store the counts on the draft's review. The
        publisher (LD6) requires a test play of the revision it publishes, and re-runs the blocking checks itself."""
        level_id = _level_id(request)
        request.log.update(levelId=level_id, action="testplay")
        body = json_object(request.event)
        _only(body, {"draftRevision", "blocking", "warnings"})
        revision, blocking, warnings = (as_int(body[k]) for k in ("draftRevision", "blocking", "warnings"))
        problems = [
            problem(k, "type")
            for k, v in (("draftRevision", revision), ("blocking", blocking), ("warnings", warnings))
            if v is None or v < 0
        ]
        if problems:
            raise _invalid(problems)
        items(level_id)
        review = {
            "testPlayedDraftRevision": revision,
            "blocking": blocking,
            "warnings": warnings,
            "at": iso_z(now()),
            "by": request.caller.sub,
        }
        content = table()
        action = content.update_action(
            level_pk(level_id),
            DRAFT_SK,
            update="SET #review = :review",
            names={"#review": "review", "#rev": "draftRevision"},
            values={":review": review, ":r": revision},
            condition="#rev = :r",
        )
        if transact(content, [action]) is not None:
            raise ApiError("DRAFT_CONFLICT")
        return json_response(200, view(level_id))

    return {
        "POST /api/admin/levels/{id}/testplay": record_testplay,
        "GET /api/admin/levels": list_levels,
        "POST /api/admin/levels": create_level,
        "GET /api/admin/levels/{id}": get_level,
        "PUT /api/admin/levels/{id}/draft": save_level,
        "DELETE /api/admin/levels/{id}": delete_level,
    }
