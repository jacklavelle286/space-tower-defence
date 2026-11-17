"""admin-api's game-data routes (Gate M, LD7; scope-level-designer.md §3.1 steps 11-13, §3.1a; ADR-0037): the portal's
side of the game-data publisher. admin-api never writes game data itself: it reads what is published and asks the
publisher (game-data-publish) to act.

    R46 GET  /api/admin/game-data                 current.json, the live planet document (what levels are merged
                                                  into and checked against), the testers, the published versions
                                                  with their wave sets' states, and the publish history
    R47 GET  /api/admin/game-data/versions/{id}   one published planet document (the Versions panel compares two)
    R48 POST /api/admin/levels/{id}/validate      {draftRevision}: the publisher's checks without bots (synchronous)
    R49 POST /api/admin/levels/{id}/publish       {draftRevision, sourceVersion, live, ticks}: queue a publish (202);
                                                  the portal polls R42, whose `publish` is the PUB# item
    R50 POST /api/admin/game-data/live            {campaignVersion}: Make live, which is also the rollback
    R51 POST /api/admin/game-data/states          {campaignVersion, waveSetId, state}: published | retired | invalid
    R52 PUT  /api/admin/game-data/testers         {testers}: the accounts that may play preview wave sets

Publish needs the checklist (scope step 12): the editor's checks ran on this draft revision against this live version
with no blocking result (R45 records them), and the four hand ticks. The publisher runs the blocking checks again
itself; the ticks are what only a person can judge. Publish is asynchronous (the checks take about a minute, over API
Gateway's 30 s): R49 writes the PUB# item as QUEUED and invokes the publisher with InvocationType Event (no retries,
publisher.tf). A QUEUED or RUNNING item older than STALE_SECONDS (the publisher's timeout and the event age, with
margin) may be queued again; a REFUSED one may always be (a replay finishes a version already allocated).

A publisher refusal is 409 PUBLISH_REFUSED with the publisher's {code, message, details} as `details`.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Mapping
from datetime import datetime, timedelta
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from shared.body import json_object, query_param
from shared.bounds import VERSION
from shared.content import as_int, iso_z, plain, problem
from shared.data import DynamoTable
from shared.errors import ApiError, json_response
from shared.game_data import GameDataReader, GameDataUnavailable
from shared.levels import DRAFT_SK, LEVEL_ID, LEVEL_PK, level_pk
from shared.planets import PLANET_ID, PLANET_PK, empty_planet, new_version_token, with_registry_look
from shared.router import Request
from shared.versions import SUB, WAVE_SET_ID

Handler = Callable[[Request], dict[str, Any]]
Transact = Callable[[DynamoTable, list[dict[str, Any]]], list[str] | None]

PUBLISH_PK = "GDPUBLISH"
CLAIM_PREFIX = "PUB#"
VERSION_PREFIX = "V#"
STALE_SECONDS = 900  # publisher timeout 600 s, event age 300 s (publisher.tf)
HISTORY_LIMIT = 50
VERSIONS_LIMIT = 30  # the newest published planet documents the Versions panel lists [ASSUMPTION]
SET_STATES = ("published", "retired", "invalid")  # preview is only ever set by a publish
# Scope step 12: what only a person can judge, ticked by hand before Publish.
HAND_TICKS = ("routeReadsClearly", "backdropHasNoPath", "nothingLooksLikeGamePieces", "warningsRead")
SYNC_READ_TIMEOUT = 22  # seconds: inside admin-api's 25 s timeout


class PublisherClient:
    """Invokes game-data-publish: `call` waits for the answer, `start` queues it (InvocationType Event)."""

    def __init__(self, function_name: str, client: Any = None) -> None:
        self.function_name = function_name
        self._client = client

    def _lambda(self) -> Any:
        if self._client is None:
            config = Config(read_timeout=SYNC_READ_TIMEOUT, connect_timeout=3, retries={"max_attempts": 0})
            self._client = boto3.client("lambda", config=config)
        return self._client

    def _invoke(self, payload: Mapping[str, Any], kind: str) -> Any:
        try:
            return self._lambda().invoke(
                FunctionName=self.function_name, InvocationType=kind, Payload=json.dumps(payload).encode()
            )
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == "TooManyRequestsException":
                raise ApiError("THROTTLED") from None  # the publisher's reserved concurrency (2) is in use
            raise

    def call(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        response = self._invoke(payload, "RequestResponse")
        body = json.loads(response["Payload"].read() or b"null")
        if response.get("FunctionError") or not isinstance(body, dict):
            raise RuntimeError("game-data-publish failed")
        return body

    def start(self, payload: Mapping[str, Any]) -> None:
        response = self._invoke(payload, "Event")
        if int(response.get("StatusCode", 0)) != 202:
            raise RuntimeError("game-data-publish was not queued")


def answer(result: Mapping[str, Any]) -> dict[str, Any]:
    """The publisher's answer, or its refusal as 409 PUBLISH_REFUSED."""
    if result.get("ok") is not True:
        error = result.get("error")
        raise ApiError("PUBLISH_REFUSED", details=error if isinstance(error, Mapping) else {"code": "UNKNOWN"})
    return {k: v for k, v in result.items() if k != "ok"}


def claim_view(item: Mapping[str, Any] | None) -> dict[str, Any] | None:
    """A PUB# item as the portal shows it."""
    if item is None:
        return None
    out: dict[str, Any] = {
        "draftRevision": int(str(item["sk"]).removeprefix(CLAIM_PREFIX)),
        "state": item.get("state"),
        "updatedAt": item.get("updatedAt"),
    }
    for key in ("campaignVersion", "sourceVersion", "live", "liveRefused"):
        if item.get(key) is not None:
            out[key] = plain(item[key])
    if item.get("state") == "REFUSED" and isinstance(item.get("details"), Mapping):
        out["refusal"] = plain(item["details"])  # {code, message, details?}
    return out


def level_publishing(content: DynamoTable, level_id: str) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """The level's latest publish (PUB# item) and its published versions (V# items, newest first), for R42."""
    claims = content.query_prefix(level_pk(level_id), CLAIM_PREFIX)
    versions = [
        {
            "campaignVersion": item.get("campaignVersion"),
            "publishedAt": str(item["sk"]).removeprefix(VERSION_PREFIX),
            "draftRevision": as_int(item.get("draftRevision")),
            "sourceVersion": item.get("sourceVersion"),
            "by": item.get("by"),
        }
        for item in content.query_prefix(level_pk(level_id), VERSION_PREFIX)
    ]
    versions.sort(key=lambda v: str(v["publishedAt"]), reverse=True)
    return claim_view(claims[-1] if claims else None), versions


def _body_fields(body: Mapping[str, Any], fields: set[str]) -> None:
    problems = [problem(name, "additionalProperties") for name in body if name not in fields]
    problems += [problem(name, "required") for name in sorted(fields) if name not in body]
    if problems:
        raise ApiError("VALIDATION_FAILED", details=problems)


def _path_value(request: Request) -> str:
    params = request.event.get("pathParameters")
    value = params.get("id") if isinstance(params, Mapping) else None
    return value if isinstance(value, str) else ""


def _stale(updated_at: Any, moment: datetime) -> bool:
    """Whether a QUEUED or RUNNING publish has outlived the publisher (so it never ran, or died)."""
    try:
        updated = datetime.strptime(str(updated_at), "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=moment.tzinfo)
    except ValueError:
        return True
    return moment - updated >= timedelta(seconds=STALE_SECONDS)


def _version_field(body: Mapping[str, Any], name: str = "campaignVersion") -> str:
    value = body.get(name)
    if not isinstance(value, str) or not VERSION.fullmatch(value):
        raise ApiError("VALIDATION_FAILED", details=[problem(name, "pattern")])
    return value


def make_gamedata_handlers(
    *,
    table: Callable[[], DynamoTable],
    now: Callable[[], datetime],
    transact: Transact,
    game_data: Callable[[], GameDataReader],
    publisher: Callable[[], PublisherClient],
) -> dict[str, Handler]:
    """The seven game-data handlers, by route key."""

    def reader() -> GameDataReader:
        return game_data()

    def level_draft(level_id: str) -> dict[str, Any]:
        found = table().batch_get([(LEVEL_PK, level_id), (level_pk(level_id), DRAFT_SK)])
        draft = found.get((level_pk(level_id), DRAFT_SK))
        if found.get((LEVEL_PK, level_id)) is None or draft is None:
            raise ApiError("NOT_FOUND")
        return draft

    def level_id_of(request: Request) -> str:
        level_id = _path_value(request)
        if not LEVEL_ID.fullmatch(level_id):
            raise ApiError("NOT_FOUND")
        request.log["levelId"] = level_id
        return level_id

    def draft_revision(body: Mapping[str, Any]) -> int:
        revision = body.get("draftRevision")
        if isinstance(revision, bool) or not isinstance(revision, int) or revision < 0:
            raise ApiError("VALIDATION_FAILED", details=[problem("draftRevision", "type")])
        return revision

    # --- R46, R47 ------------------------------------------------------------------------------------------------

    def base_for(r: GameDataReader, planet_id: str | None) -> tuple[str, str, dict[str, Any]]:
        """(planetId, sourceVersion, document) a level of `planet_id` is merged into (LD10; shared/planets.py): a
        released planet's live document, else an unreleased one's newest with the registry's look, else its empty
        starting document. No planet: the first released planet (luna-1)."""
        released = r.released_planets()
        if planet_id is None:
            first = released[0]
            return first.planet_id, first.campaign_version, r.document(first.campaign_version)
        for planet in released:
            if planet.planet_id == planet_id:
                return planet_id, planet.campaign_version, r.document(planet.campaign_version)
        found = table().get_item(PLANET_PK, planet_id) if PLANET_ID.match(planet_id) else None
        if found is None:
            raise ApiError("NOT_FOUND")
        item = plain(found)
        latest = item.get("latestVersion")
        if not latest:
            return planet_id, new_version_token(planet_id), empty_planet(item)
        return planet_id, str(latest), with_registry_look(r.document(str(latest)), item)

    def get_game_data(request: Request) -> dict[str, Any]:
        try:
            r = reader()
            current = r.current()
            base_planet, base_version, live = base_for(r, query_param(request.event, "planet"))
            versions = r.versions()
            listed = r.campaign_versions()[:VERSIONS_LIMIT]
        except GameDataUnavailable:
            raise ApiError("CONTENT_UNAVAILABLE", details={"reason": "GAME_DATA_UNREADABLE"}) from None
        live_versions = {p["campaignVersion"] for p in current["planets"]}
        history = sorted(table().query_prefix(PUBLISH_PK, ""), key=lambda i: str(i["sk"]), reverse=True)
        published_by = {}
        for item in reversed(history):  # oldest first, so the publish (not a later make-live) names the version
            if item.get("action") == "publish":
                published_by.setdefault(item.get("campaignVersion"), item)
        rows = []
        for version, written in listed:
            try:
                planet = r.planet(version)
            except GameDataUnavailable:
                continue  # an unreadable document is never offered (make-live would refuse it too)
            made = published_by.get(version)
            rows.append(
                {
                    "campaignVersion": version,
                    "planetId": planet.planet_id,
                    "writtenAt": iso_z(written),
                    "live": version in live_versions,  # LD9: each released planet has its own live version
                    "source": "portal" if made is not None else "release",
                    **({"levelId": made.get("levelId"), "by": made.get("by")} if made is not None else {}),
                    "waveSets": [
                        {
                            "waveSetId": ws.wave_set_id,
                            "name": ws.name,
                            "mode": ws.mode,
                            "state": versions.state(version, ws.wave_set_id),
                        }
                        for ws in planet.wave_sets
                    ],
                }
            )
        return json_response(
            200,
            {
                "current": current,
                "live": live,  # the document levels of `base.planetId` are merged into (LD10: ?planet=)
                "base": {"planetId": base_planet, "sourceVersion": base_version},
                "testers": sorted(versions.testers),
                "versions": rows,
                "history": [
                    {
                        "at": str(item["sk"]).split("#", 1)[0],
                        **{
                            k: plain(item[k])
                            for k in ("action", "campaignVersion", "prev", "live", "levelId", "by")
                            if item.get(k) is not None
                        },
                    }
                    for item in history[:HISTORY_LIMIT]
                ],
            },
        )

    def get_version(request: Request) -> dict[str, Any]:
        version = _path_value(request)
        if not VERSION.fullmatch(version):
            raise ApiError("NOT_FOUND")
        try:
            document = reader().document(version)
        except GameDataUnavailable:
            raise ApiError("NOT_FOUND") from None
        return json_response(200, {"campaignVersion": version, "document": document})

    # --- R48, R49 ------------------------------------------------------------------------------------------------

    def validate_level(request: Request) -> dict[str, Any]:
        level_id = level_id_of(request)
        body = json_object(request.event)
        _body_fields(body, {"draftRevision"})
        revision = draft_revision(body)
        level_draft(level_id)
        result = publisher().call({"action": "validate", "levelId": level_id, "draftRevision": revision})
        return json_response(200, answer(result))

    def publish_level(request: Request) -> dict[str, Any]:
        level_id = level_id_of(request)
        body = json_object(request.event)
        _body_fields(body, {"draftRevision", "sourceVersion", "live", "ticks"})
        revision = draft_revision(body)
        source = _version_field(body, "sourceVersion")
        live, ticks = body["live"], body["ticks"]
        problems = [] if isinstance(live, bool) else [problem("live", "type")]
        if not isinstance(ticks, Mapping) or set(ticks) != set(HAND_TICKS):
            problems.append(problem("ticks", "keys"))
        else:
            problems += [problem(f"ticks.{k}", "must_be_ticked") for k in HAND_TICKS if ticks[k] is not True]
        if problems:
            raise ApiError("VALIDATION_FAILED", details=problems)
        draft = level_draft(level_id)
        if as_int(draft.get("draftRevision")) != revision:
            raise ApiError("DRAFT_CONFLICT")
        review = plain(draft.get("review") or {})
        if (
            review.get("testPlayedDraftRevision") != revision
            or review.get("sourceVersion") != source
            or review.get("blocking") != 0
        ):
            raise ApiError(
                "PUBLISH_REFUSED",
                details={
                    "code": "NOT_TEST_PLAYED",
                    "message": "run the checks on this draft against the live game data first, with no red results",
                },
            )
        request.log.update(action="publish", live=live)
        by, moment = request.caller.sub, now()
        content = table()
        pk, sk = level_pk(level_id), f"{CLAIM_PREFIX}{revision:010d}"
        claim = content.get_item(pk, sk)
        if claim is not None:
            state = claim.get("state")
            if state == "DONE":
                return json_response(200, {"publish": claim_view(claim)})
            if state in ("QUEUED", "RUNNING") and not _stale(claim.get("updatedAt"), moment):
                return json_response(202, {"publish": claim_view(claim)})  # already on its way: not queued twice
        stamp = iso_z(moment)
        fields = {"state": "QUEUED", "by": by, "updatedAt": stamp, "ticks": dict(ticks), "requestedLive": live}
        names = {f"#{k}": k for k in fields}
        values = {f":{k}": v for k, v in fields.items()}
        update = "SET " + ", ".join(f"#{k} = :{k}" for k in fields)
        if claim is None:
            update += ", #created = :now"
            names.update({"#created": "createdAt", "#pk": "pk"})
            values[":now"] = stamp
            condition = "attribute_not_exists(#pk)"
        else:
            update += " REMOVE #code, #details"
            names.update({"#code": "code", "#details": "details", "#was": "updatedAt"})
            values[":was"] = claim.get("updatedAt")
            condition = "#was = :was"  # nobody queued it meanwhile
        action = content.update_action(pk, sk, update=update, names=names, values=values, condition=condition)
        if transact(content, [action]) is not None:
            return json_response(202, {"publish": claim_view(content.get_item(pk, sk))})
        publisher().start(
            {
                "action": "publish",
                "levelId": level_id,
                "draftRevision": revision,
                "sourceVersion": source,
                "live": live,
                "by": by,
            }
        )
        return json_response(202, {"publish": claim_view(content.get_item(pk, sk))})

    # --- R50, R51, R52 -------------------------------------------------------------------------------------------

    def make_live(request: Request) -> dict[str, Any]:
        body = json_object(request.event)
        _body_fields(body, {"campaignVersion"})
        version = _version_field(body)
        request.log.update(action="make-live", campaignVersion=version)
        result = publisher().call({"action": "makeLive", "campaignVersion": version, "by": request.caller.sub})
        return json_response(200, answer(result))

    def set_state(request: Request) -> dict[str, Any]:
        body = json_object(request.event)
        _body_fields(body, {"campaignVersion", "waveSetId", "state"})
        version = _version_field(body)
        wave_set, state = body["waveSetId"], body["state"]
        problems = []
        if not isinstance(wave_set, str) or not WAVE_SET_ID.fullmatch(wave_set):
            problems.append(problem("waveSetId", "pattern"))
        if state not in SET_STATES:
            problems.append(problem("state", "enum"))
        if problems:
            raise ApiError("VALIDATION_FAILED", details=problems)
        request.log.update(action="state", campaignVersion=version, waveSetId=wave_set, state=state)
        result = publisher().call(
            {
                "action": "setState",
                "campaignVersion": version,
                "waveSetId": wave_set,
                "state": state,
                "by": request.caller.sub,
            }
        )
        return json_response(200, answer(result))

    def set_testers(request: Request) -> dict[str, Any]:
        body = json_object(request.event)
        _body_fields(body, {"testers"})
        testers = body["testers"]
        if not isinstance(testers, list) or not all(isinstance(t, str) and SUB.fullmatch(t) for t in testers):
            raise ApiError("VALIDATION_FAILED", details=[problem("testers", "pattern")])
        request.log["action"] = "testers"
        result = publisher().call({"action": "setTesters", "testers": testers, "by": request.caller.sub})
        return json_response(200, answer(result))

    return {
        "GET /api/admin/game-data": get_game_data,
        "GET /api/admin/game-data/versions/{id}": get_version,
        "POST /api/admin/levels/{id}/validate": validate_level,
        "POST /api/admin/levels/{id}/publish": publish_level,
        "POST /api/admin/game-data/live": make_live,
        "POST /api/admin/game-data/states": set_state,
        "PUT /api/admin/game-data/testers": set_testers,
    }
