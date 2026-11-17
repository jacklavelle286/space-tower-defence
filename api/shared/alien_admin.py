"""admin-api's alien routes (Gate M, AM1; scope-asset-kinds-and-makers.md §3.2, ADR-0041): Levels → Aliens.

    R57 GET    /api/admin/aliens                 the live ruleset's aliens (read-only) and the made ones, each with its
                                                 publish state (the portal polls this while a publish runs)
    R58 POST   /api/admin/aliens                 make one: {alienId, name, hp, speed, leak, bounty} (create-only)
    R59 PUT    /api/admin/aliens/{id}            change a draft: {name, hp, speed, leak, bounty, art}
    R60 DELETE /api/admin/aliens/{id}            delete a draft
    R61 POST   /api/admin/aliens/{id}/publish    {ticks}: queue the publisher's publishAlien (202)

Stats stay inside limits.json `alienMaker`. `art` is [] (no walk yet) or six approved Alien pictures, the walk the
portal made from one drawing with the shared animator. A draft cannot change while its publish is queued or running,
and a published alien never changes (its ruleset is pinned by saved runs). Publish is asynchronous, as a level's (R49):
a new ruleset means bounds for every playable planet version, one check call each.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any

from shared.aliens import (
    ALIEN_ID,
    ALIEN_PK,
    FRAMES,
    STATS,
    alien_summary,
    art_problems,
    name_ok,
    stat_problems,
    stored_stats,
)
from shared.body import json_object
from shared.content import iso_z, plain, problem
from shared.data import DynamoTable
from shared.errors import ApiError, json_response
from shared.game_data import GameDataReader, GameDataUnavailable
from shared.gamedata_admin import PublisherClient, stale
from shared.pictures import PIC_PK, kind_of
from shared.router import Request

Handler = Callable[[Request], dict[str, Any]]
Transact = Callable[[DynamoTable, list[dict[str, Any]]], list[str] | None]
# Every write is conditioned on the item still being the draft that was read (nobody changed or queued it meanwhile).
SAME_DRAFT = "#at = :was AND #status = :draft"
SAME_DRAFT_NAMES = {"#at": "updatedAt", "#status": "status"}
FIELDS = {"name", *STATS}
# What only a person can judge before a made alien reaches children [PROPOSAL].
HAND_TICKS = ("friendly", "walkLooksRight", "statsFitTheName")


def make_alien_handlers(
    *,
    table: Callable[[], DynamoTable],
    now: Callable[[], datetime],
    transact: Transact,
    game_data: Callable[[], GameDataReader],
    publisher: Callable[[], PublisherClient],
) -> dict[str, Handler]:
    """The five alien handlers, by route key."""

    def live_ruleset() -> dict[str, Any]:
        try:
            reader = game_data()
            return reader.ruleset(str(reader.current()["rulesetVersion"]))
        except GameDataUnavailable:
            raise ApiError("CONTENT_UNAVAILABLE", details={"reason": "GAME_DATA_UNREADABLE"}) from None

    def alien_id_of(request: Request) -> str:
        params = request.event.get("pathParameters")
        value = params.get("id") if isinstance(params, Mapping) else None
        if not isinstance(value, str) or not ALIEN_ID.match(value):
            raise ApiError("NOT_FOUND")
        return value

    def checked(body: Mapping[str, Any], fields: set[str]) -> None:
        problems = [problem(k, "additionalProperties") for k in body if k not in fields]
        problems += [problem(k, "required") for k in sorted(fields) if k not in body]
        if not problems:
            problems = stat_problems(body)
            if not name_ok(body.get("name")):
                problems.append(problem("name", "length"))
            if "art" in fields:
                problems += art_problems(body.get("art"))
        if problems:
            raise ApiError("VALIDATION_FAILED", details=problems)

    def art_approved(art: list[str]) -> None:
        found = table().batch_get([(PIC_PK, p) for p in art]) if art else {}
        problems = [
            problem(f"art[{i}]", "approved_alien_picture")
            for i, p in enumerate(art)
            if (h := found.get((PIC_PK, p))) is None or h.get("state") != "APPROVED" or kind_of(h) != "alien"
        ]
        if problems:
            raise ApiError("VALIDATION_FAILED", details=problems)

    def draft(alien_id: str) -> dict[str, Any]:
        """The alien, refused unless it is a draft with no publish on its way."""
        found = table().get_item(ALIEN_PK, alien_id)
        if found is None:
            raise ApiError("NOT_FOUND")
        item = plain(found)
        if item.get("status") != "DRAFT":
            raise ApiError(
                "PUBLISH_REFUSED", details={"code": "ALIEN_PUBLISHED", "message": "a published alien is fixed"}
            )
        publish = item.get("publish") or {}
        if publish.get("state") in ("QUEUED", "RUNNING") and not stale(publish.get("updatedAt"), now()):
            raise ApiError(
                "PUBLISH_REFUSED", details={"code": "PUBLISHING", "message": "this alien is being published"}
            )
        return item

    # --- R57 -------------------------------------------------------------------------------------------------------

    def list_aliens(request: Request) -> dict[str, Any]:
        ruleset = live_ruleset()
        made = sorted((plain(i) for i in table().query_prefix(ALIEN_PK, "")), key=lambda i: str(i.get("createdAt")))
        made_ids = {i["alienId"] for i in made if i.get("status") == "PUBLISHED"}
        game = [
            {"alienId": alien_id, **{k: a.get(k) for k in ("name", *STATS)}, "made": alien_id in made_ids}
            for alien_id, a in sorted(ruleset["aliens"].items())
            if not a.get("descendantOnly")
        ]
        return json_response(
            200,
            {
                "rulesetVersion": ruleset["version"],
                "game": game,
                "aliens": [alien_summary(i) for i in made],
                "bosses": sorted(ruleset.get("bosses", {})),
            },
        )

    # --- R58, R59, R60 ---------------------------------------------------------------------------------------------

    def create_alien(request: Request) -> dict[str, Any]:
        body = json_object(request.event)
        checked(body, FIELDS | {"alienId"})
        alien_id = body["alienId"]
        if not isinstance(alien_id, str) or not ALIEN_ID.match(alien_id):
            raise ApiError("VALIDATION_FAILED", details=[problem("alienId", "pattern")])
        ruleset = live_ruleset()
        if alien_id in ruleset["aliens"] or alien_id in ruleset.get("bosses", {}):
            raise ApiError("VALIDATION_FAILED", details=[problem("alienId", "exists")])
        request.log["action"] = "alien-create"
        stamp = iso_z(now())
        item = {
            "pk": ALIEN_PK,
            "sk": alien_id,
            "alienId": alien_id,
            "name": body["name"],
            **stored_stats(body),
            "art": [],
            "status": "DRAFT",
            "createdAt": stamp,
            "createdBy": request.caller.sub,
            "updatedAt": stamp,
        }
        content = table()
        put = content.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})
        if transact(content, [put]) is not None:
            raise ApiError("VALIDATION_FAILED", details=[problem("alienId", "exists")])
        return json_response(201, {"alien": alien_summary(item)})

    def update_alien(request: Request) -> dict[str, Any]:
        alien_id = alien_id_of(request)
        body = json_object(request.event)
        checked(body, FIELDS | {"art"})
        art = list(body["art"])
        art_approved(art)
        item = draft(alien_id)
        content = table()
        stamp = iso_z(now())
        values = {"name": body["name"], **stored_stats(body), "art": art}
        names = {f"#{k}": k for k in values} | {"#pub": "publish"} | SAME_DRAFT_NAMES
        update = "SET " + ", ".join(f"#{k} = :{k}" for k in values) + ", #at = :now REMOVE #pub"
        action = content.update_action(
            ALIEN_PK,
            alien_id,
            update=update,
            names=names,
            values={
                **{f":{k}": v for k, v in values.items()},
                ":now": stamp,
                ":was": item["updatedAt"],
                ":draft": "DRAFT",
            },
            condition=SAME_DRAFT,
        )
        if transact(content, [action]) is not None:
            raise ApiError("DRAFT_CONFLICT")
        return json_response(200, {"alien": alien_summary(plain(content.get_item(ALIEN_PK, alien_id) or {}))})

    def delete_alien(request: Request) -> dict[str, Any]:
        alien_id = alien_id_of(request)
        item = draft(alien_id)
        content = table()
        action = content.delete_action(
            ALIEN_PK,
            alien_id,
            condition=SAME_DRAFT,
            names=SAME_DRAFT_NAMES,
            values={":was": item["updatedAt"], ":draft": "DRAFT"},
        )
        if transact(content, [action]) is not None:
            raise ApiError("DRAFT_CONFLICT")
        request.log["action"] = "alien-delete"
        return json_response(200, {"deleted": alien_id})

    # --- R61 -------------------------------------------------------------------------------------------------------

    def publish_alien(request: Request) -> dict[str, Any]:
        alien_id = alien_id_of(request)
        body = json_object(request.event)
        problems = [problem(k, "additionalProperties") for k in body if k != "ticks"]
        ticks = body.get("ticks")
        if not isinstance(ticks, Mapping) or set(ticks) != set(HAND_TICKS):
            problems.append(problem("ticks", "keys"))
        else:
            problems += [problem(f"ticks.{k}", "must_be_ticked") for k in HAND_TICKS if ticks[k] is not True]
        if problems:
            raise ApiError("VALIDATION_FAILED", details=problems)
        item = draft(alien_id)
        if len(item.get("art") or []) != FRAMES:
            raise ApiError("VALIDATION_FAILED", details=[problem("art", "frames")])
        request.log["action"] = "alien-publish"
        content = table()
        stamp = iso_z(now())
        action = content.update_action(
            ALIEN_PK,
            alien_id,
            update="SET #pub = :pub, #at = :now",
            names={"#pub": "publish"} | SAME_DRAFT_NAMES,
            values={
                ":pub": {"state": "QUEUED", "ticks": dict(ticks), "by": request.caller.sub, "updatedAt": stamp},
                ":now": stamp,
                ":was": item["updatedAt"],
                ":draft": "DRAFT",
            },
            condition=SAME_DRAFT,
        )
        if transact(content, [action]) is not None:
            raise ApiError("DRAFT_CONFLICT")
        publisher().start({"action": "publishAlien", "alienId": alien_id, "by": request.caller.sub})
        return json_response(202, {"alien": alien_summary(plain(content.get_item(ALIEN_PK, alien_id) or {}))})

    return {
        "GET /api/admin/aliens": list_aliens,
        "POST /api/admin/aliens": create_alien,
        "PUT /api/admin/aliens/{id}": update_alien,
        "DELETE /api/admin/aliens/{id}": delete_alien,
        "POST /api/admin/aliens/{id}/publish": publish_alien,
    }
