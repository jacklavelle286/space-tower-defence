"""admin-api's planet routes (Gate M, LD10; scope-level-designer.md §3.2 "Admin UX"): Levels → Planets.

    R53 GET  /api/admin/planets                 every planet: released ones (in unlock order, from current.json, with
                                                their live version) and the registry's unreleased ones (with their
                                                newest version and whether it has the full campaign)
    R54 POST /api/admin/planets                 add a planet: {planetId, name, icon, artSet, backdrop} (create-only)
    R55 PUT  /api/admin/planets/{id}            change an unreleased planet: {name, icon, artSet, backdrop}
    R56 POST /api/admin/planets/{id}/release    release it through the game-data publisher (appends to current.json)

`icon` is an approved Planet picture or null; `backdrop` an approved Background picture or null (the default backdrop
new levels of the planet start with); `artSet` names an art set of the asset manifest (only "moon" exists until more
route-tile sets are drawn). A released planet is never changed, reordered or removed here: unlock order is the order of
release.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any

from shared.body import json_object
from shared.content import iso_z, plain, problem
from shared.data import DynamoTable
from shared.errors import ApiError, json_response
from shared.game_data import GameDataReader, GameDataUnavailable
from shared.gamedata_admin import PublisherClient, answer
from shared.pictures import PIC_PK, kind_of
from shared.planets import ART_SET, CAMPAIGN_WAVES, NAME_MAX, PLANET_ID, PLANET_PK, planet_summary
from shared.router import Request

Handler = Callable[[Request], dict[str, Any]]
Transact = Callable[[DynamoTable, list[dict[str, Any]]], list[str] | None]
FIELDS = {"name", "icon", "artSet", "backdrop"}
ART_SETS = ("moon",)  # the art sets m1 has (web/shared/src/manifest); a later manifest adds more [ASSUMPTION]


def _name_ok(value: Any) -> bool:
    return isinstance(value, str) and 1 <= len(value) <= NAME_MAX and value == value.strip() and value.isprintable()


def make_planet_handlers(
    *,
    table: Callable[[], DynamoTable],
    now: Callable[[], datetime],
    transact: Transact,
    game_data: Callable[[], GameDataReader],
    publisher: Callable[[], PublisherClient],
) -> dict[str, Handler]:
    """The four planet handlers, by route key."""

    def checked(body: Mapping[str, Any]) -> list[dict[str, str]]:
        problems = []
        if not _name_ok(body.get("name")):
            problems.append(problem("name", "length"))
        if body.get("artSet") not in ART_SETS or not ART_SET.match(str(body.get("artSet"))):
            problems.append(problem("artSet", "enum"))
        wanted = [(f, body.get(f), kind) for f, kind in (("icon", "planet"), ("backdrop", "background"))]
        found = table().batch_get([(PIC_PK, v) for _, v, _ in wanted if isinstance(v, str)])
        for field, value, kind in wanted:
            if value is None:
                continue
            header = found.get((PIC_PK, value)) if isinstance(value, str) else None
            if header is None or header.get("state") != "APPROVED" or kind_of(header) != kind:
                problems.append(problem(field, f"approved_{kind}_picture"))
        return problems

    def planet_id_of(request: Request) -> str:
        params = request.event.get("pathParameters")
        value = params.get("id") if isinstance(params, Mapping) else None
        if not isinstance(value, str) or not PLANET_ID.match(value):
            raise ApiError("NOT_FOUND")
        return value

    # --- R53 -------------------------------------------------------------------------------------------------------

    def list_planets(request: Request) -> dict[str, Any]:
        reader = game_data()
        try:
            released = reader.released_planets()
        except GameDataUnavailable:
            raise ApiError("CONTENT_UNAVAILABLE", details={"reason": "GAME_DATA_UNREADABLE"}) from None
        registry = {str(i["sk"]): plain(i) for i in table().query_prefix(PLANET_PK, "")}
        out = []
        for order, planet in enumerate(released):
            item = registry.pop(planet.planet_id, None)
            out.append(
                {
                    **(planet_summary(item) if item else {"planetId": planet.planet_id, "icon": planet.icon}),
                    "name": planet.name,
                    "status": "RELEASED",
                    "order": order,
                    "liveVersion": planet.campaign_version,
                }
            )
        for item in sorted(registry.values(), key=lambda i: str(i.get("createdAt"))):
            summary = planet_summary(item)
            summary["campaignWaves"] = 0
            latest = item.get("latestVersion")
            if latest:
                try:
                    doc = reader.document(str(latest))
                    campaign = doc.get("waveSets", {}).get("campaign")
                    summary["campaignWaves"] = len(campaign.get("waves", [])) if isinstance(campaign, dict) else 0
                except GameDataUnavailable:
                    pass
            summary["readyToRelease"] = summary["campaignWaves"] == CAMPAIGN_WAVES
            out.append(summary)
        return json_response(200, {"planets": out, "artSets": list(ART_SETS)})

    # --- R54, R55 --------------------------------------------------------------------------------------------------

    def create_planet(request: Request) -> dict[str, Any]:
        body = json_object(request.event)
        extra = [problem(k, "additionalProperties") for k in body if k not in FIELDS | {"planetId"}]
        missing = [problem(k, "required") for k in sorted(FIELDS | {"planetId"}) if k not in body]
        planet_id = body.get("planetId")
        problems = extra + missing
        if not isinstance(planet_id, str) or not PLANET_ID.match(planet_id):
            problems.append(problem("planetId", "pattern"))
        if not missing:
            problems += checked(body)
        if problems:
            raise ApiError("VALIDATION_FAILED", details=problems)
        try:
            released = {p.planet_id for p in game_data().released_planets()}
        except GameDataUnavailable:
            raise ApiError("CONTENT_UNAVAILABLE", details={"reason": "GAME_DATA_UNREADABLE"}) from None
        if planet_id in released:
            raise ApiError("VALIDATION_FAILED", details=[problem("planetId", "exists")])
        request.log["action"] = "planet-create"
        stamp = iso_z(now())
        item = {
            "pk": PLANET_PK,
            "sk": planet_id,
            "planetId": planet_id,
            **{k: body[k] for k in sorted(FIELDS)},
            "status": "DRAFT",
            "createdAt": stamp,
            "createdBy": request.caller.sub,
            "updatedAt": stamp,
        }
        content = table()
        put = content.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})
        if transact(content, [put]) is not None:
            raise ApiError("VALIDATION_FAILED", details=[problem("planetId", "exists")])
        return json_response(201, {"planet": planet_summary(item)})

    def update_planet(request: Request) -> dict[str, Any]:
        planet_id = planet_id_of(request)
        body = json_object(request.event)
        problems = [problem(k, "additionalProperties") for k in body if k not in FIELDS]
        problems += [problem(k, "required") for k in sorted(FIELDS) if k not in body]
        if not problems:
            problems = checked(body)
        if problems:
            raise ApiError("VALIDATION_FAILED", details=problems)
        content = table()
        values = {f":{k}": body[k] for k in sorted(FIELDS)}
        names = {f"#{k}": k for k in sorted(FIELDS)} | {"#at": "updatedAt", "#status": "status"}
        action = content.update_action(
            PLANET_PK,
            planet_id,
            update="SET " + ", ".join(f"#{k} = :{k}" for k in sorted(FIELDS)) + ", #at = :at",
            names=names,
            values={**values, ":at": iso_z(now()), ":draft": "DRAFT"},
            condition="#status = :draft",
        )
        if transact(content, [action]) is not None:
            found = content.get_item(PLANET_PK, planet_id)
            if found is None:
                raise ApiError("NOT_FOUND")
            raise ApiError(
                "PUBLISH_REFUSED", details={"code": "PLANET_RELEASED", "message": "a released planet is fixed"}
            )
        return json_response(200, {"planet": planet_summary(plain(content.get_item(PLANET_PK, planet_id) or {}))})

    # --- R56 -------------------------------------------------------------------------------------------------------

    def release_planet(request: Request) -> dict[str, Any]:
        planet_id = planet_id_of(request)
        request.log["action"] = "planet-release"
        result = publisher().call({"action": "releasePlanet", "planetId": planet_id, "by": request.caller.sub})
        return json_response(200, answer(result))

    return {
        "GET /api/admin/planets": list_planets,
        "POST /api/admin/planets": create_planet,
        "PUT /api/admin/planets/{id}": update_planet,
        "POST /api/admin/planets/{id}/release": release_planet,
    }
