"""player-api: every player route except speech (plan G §2 R1-R14, E.6.3).

Phase 15 added the profile routes (G §3): `GET /api/me`, `PUT` and `PATCH /api/me/profile`, `GET /api/planets`.
Phase 16 adds runs and the session lease (G §4, §7): `POST /api/runs`, `GET /api/runs/{runId}`,
`GET /api/runs/{runId}/pack`, `PUT` and `DELETE /api/session`. Phase 17 adds the ops batch (G §5):
`POST /api/runs/{runId}/ops`, applied by shared/ops.py. Phase 29 adds `POST /api/runs/{runId}/endless` (G §6): the
same pipeline for exactly one CHOOSE_ENDLESS (endless slot planning arrives with endless content, Phase 54). Phase 32
adds `GET /api/runs` (G §4 R7, shared/runlist.py) and the G9 prune after an op ends a run (shared/prune.py). Phase 43
adds `GET /api/me/progress` (G §3 R2): the learning summaries the resolving transactions keep. Phase 55 adds
`POST /api/me/resets` (G §3 R5, shared/resets.py). The other
catalogued routes still answer 501 NOT_IMPLEMENTED until their phase adds a handler.

The date of birth is write-only (spine S2): it enters in PUT/PATCH, is stored as PROFILE.dob, and is read back only to
compute `age` and `ageBand`. No response is built from a stored item directly: every view names the fields it
returns, so `dob` cannot slip into a body. The router's log line is an allow-list (shared/log.py), so it cannot reach
a log line either.

Ownership (AC-03): every key is built from the token's `sub`, so another player's `runId` is simply a missing key and
answers the same 404 NOT_FOUND as a run that does not exist.

Everything a test needs to control comes in through `Deps`: the clock ("now"), both tables, the game-data reader, the
bounds loader, the seed, and the retry pause. `make_router(deps)` builds the router; the Lambda entry point uses
`DEFAULT_DEPS`, whose factories create their AWS clients only when first called, after the router has authorised the
request.
"""

from __future__ import annotations

import re
import secrets
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime
from functools import cache
from typing import Any

from botocore.exceptions import ClientError

from shared.auth import PLAYER
from shared.body import invalid, json_object, query_param, raw_body
from shared.bounds import KEY_ID, VERSION, BoundsUnavailable, load_bounds
from shared.data import (
    CONTENT_TABLE_ENV,
    GAME_TABLE_ENV,
    DynamoTable,
    cancellation_reasons,
    error_code,
    failed_item,
    is_transient,
    table_from_env,
)
from shared.errors import ApiError, json_response
from shared.game_data import DEFAULT_MANIFEST_VERSION, GameDataReader, GameDataUnavailable, Planet, reader_from_env
from shared.log import ApiLogger
from shared.ops import ENDLESS_ENVELOPE, OPS_ENVELOPE, OPS_MAX_BYTES, OpsBatch, check_envelope
from shared.profile import (
    DIFFICULTIES,
    EASY,
    HARD,
    band_for,
    school_year,
    stored_age,
    today_in_london,
    validate_profile,
)
from shared.prune import prune_terminal_runs
from shared.resets import apply_reset, checked_type
from shared.router import Request, Router
from shared.rules.contracts import LIMITS
from shared.runlist import page, parse_query
from shared.runs import (
    RUN_PREFIX,
    TERMINAL,
    current_slot_of,
    current_slot_view,
    new_run_item,
    new_slot_item,
    pack_body,
    plain,
    run_sk,
    run_summary,
    run_view,
    slot_entry,
    slot_prefix,
    slot_sk,
    sorted_slots,
)
from shared.selection.bank import read_units, read_versions, version_key
from shared.selection.eligibility import select_units
from shared.selection.plan import LIVE_CONFIG, BankNotReady, SelectionConfig, plan_slots, slot_specs
from shared.session import (
    RESET_HOLDER_PREFIX,
    SESSION_SK,
    conflict,
    generation_of,
    iso_z,
    jittered_pause,
    lease_view,
    parse_time,
    release_update,
    renew_update,
    same_holder_update,
    takeover_update,
)
from shared.versions import Versions

# This function's allow-list. tests/unit/test_routes_contract.py checks it equals contracts/routes.json.
ROUTES: dict[str, str] = {
    "GET /api/me": PLAYER,
    "GET /api/me/progress": PLAYER,
    "PUT /api/me/profile": PLAYER,
    "PATCH /api/me/profile": PLAYER,
    "POST /api/me/resets": PLAYER,
    "GET /api/planets": PLAYER,
    "GET /api/runs": PLAYER,
    "POST /api/runs": PLAYER,
    "GET /api/runs/{runId}": PLAYER,
    "GET /api/runs/{runId}/pack": PLAYER,
    "POST /api/runs/{runId}/ops": PLAYER,
    "POST /api/runs/{runId}/endless": PLAYER,
    "PUT /api/session": PLAYER,
    "DELETE /api/session": PLAYER,
}

PROFILE_SK = "PROFILE"
PREVIEW_VERSIONS = 3  # [ASSUMPTION] the newest versions with preview wave sets a tester sees on Home (Gate M, LD7)
UUID = re.compile(LIMITS["ids"]["uuid"].removesuffix("$") + r"\Z")  # Python's $ also matches before a final newline
DEVICE_LABEL_MAX: int = LIMITS["deviceLabelMaxLength"]
INTEGER_MAX: int = LIMITS["integerMax"]
IN_PROGRESS_CAP: int = LIMITS["inProgressRunsSoftCap"]
SUMMARY_PREFIX = "SUM#"  # SUM#<subject>#<topicId> (spine S8.1, F §10.2)
ATTEMPTS = 3  # tries for a write that meets a transaction conflict, throttling or a raced lease, then 503 THROTTLED
CCF = "ConditionalCheckFailed"  # a cancellation reason's code (the single-item error adds "Exception")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")

# RunSummary (G §4.1) is built from these RUN attributes (shared/runs.py names the item's fields).
RUN_SUMMARY_ATTRIBUTES = (
    "sk",
    "planetId",
    "waveSetId",
    "mode",
    "status",
    "stage",
    "phase",
    "wave",
    "finalWave",
    "highestCompletedWave",
    "campaignCompletedAt",
    "lastPlayedAt",
    "createdAt",
    "revision",
    "pins",
)


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _new_seed() -> str:
    """64 random bits from the server (spine S5.1), as 16 hex digits: a JSON number would lose bits in JavaScript."""
    return f"{secrets.randbits(64):016x}"


_container_reader = cache(reader_from_env)  # one game-data reader, and so one cache, per Lambda container
_jitter = secrets.SystemRandom().random


@dataclass(frozen=True)
class Deps:
    now: Callable[[], datetime] = _utc_now
    game: Callable[[], DynamoTable] = lambda: table_from_env(GAME_TABLE_ENV)
    game_data: Callable[[], GameDataReader] = _container_reader
    bounds: Callable[[str, str], Any] = load_bounds
    content: Callable[[], DynamoTable] = lambda: table_from_env(CONTENT_TABLE_ENV)
    seed: Callable[[], str] = _new_seed
    sleep: Callable[[float], None] = time.sleep
    random: Callable[[], float] = _jitter
    selection: SelectionConfig = field(default=LIVE_CONFIG)  # thresholds and rules (shared/selection/plan.py)


def _pk(request: Request) -> str:
    return f"U#{request.caller.sub}"


# --- Request checks (G §1.4: unknown fields refused; problems named by field and rule, never by value) --------------


def _uuid_rule(value: Any) -> str | None:
    return "type" if not isinstance(value, str) else None if UUID.match(value) else "pattern"


def _pattern_rule(pattern: re.Pattern[str]) -> Callable[[Any], str | None]:
    return lambda value: "type" if not isinstance(value, str) else None if pattern.match(value) else "pattern"


def _bool_rule(value: Any) -> str | None:
    return None if isinstance(value, bool) else "type"


def _generation_rule(value: Any) -> str | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return "type"
    return "minimum" if value < 0 else "maximum" if value > INTEGER_MAX else None


def _device_label_rule(value: Any) -> str | None:
    if not isinstance(value, str):
        return "type"
    if not value.strip():
        return "minLength"
    if len(value) > DEVICE_LABEL_MAX:
        return "maxLength"
    return "pattern" if _CONTROL.search(value) else None


def _mode_rule(value: Any) -> str | None:
    return None if value in ("claim", "renew") else "enum"


def _difficulty_rule(value: Any) -> str | None:
    return None if value in DIFFICULTIES else "enum"


Rule = Callable[[Any], str | None]


def _checked(body: Mapping[str, Any], fields: Mapping[str, tuple[bool, Rule]]) -> dict[str, Any]:
    """The body's fields if every rule passes; else VALIDATION_FAILED listing every problem."""
    problems: list[dict[str, str]] = []
    if any(key not in fields for key in body):
        problems.append({"field": "body", "rule": "additionalProperties"})
    for name, (required, rule) in fields.items():
        if name not in body:
            if required:
                problems.append({"field": name, "rule": "required"})
            continue
        problem = rule(body[name])
        if problem is not None:
            problems.append({"field": name, "rule": problem})
    if problems:
        raise ApiError("VALIDATION_FAILED", details=problems)
    return {name: body[name] for name in fields if name in body}


CREATE_RUN_FIELDS: dict[str, tuple[bool, Rule]] = {
    "runId": (True, _uuid_rule),
    "planetId": (True, _pattern_rule(KEY_ID)),
    "waveSetId": (True, _pattern_rule(KEY_ID)),
    "rulesetVersion": (True, _pattern_rule(VERSION)),
    "campaignVersion": (True, _pattern_rule(VERSION)),
    "sessionId": (True, _uuid_rule),
    "deviceLabel": (True, _device_label_rule),
    "takeover": (False, _bool_rule),
    "difficulty": (False, _difficulty_rule),  # YG1: EASY (the default) plays the school year, HARD the year above
}
SESSION_FIELDS: dict[str, tuple[bool, Rule]] = {
    "mode": (True, _mode_rule),
    "runId": (True, _uuid_rule),
    "sessionId": (True, _uuid_rule),
    "generation": (False, _generation_rule),  # required for renew (checked after the mode is known)
    "takeover": (False, _bool_rule),  # only meaningful for claim
    "deviceLabel": (True, _device_label_rule),
}
RELEASE_FIELDS: dict[str, tuple[bool, Rule]] = {
    "sessionId": (True, _uuid_rule),
    "generation": (True, _generation_rule),
}


def _path_run_id(request: Request) -> str:
    params = request.event.get("pathParameters")
    value = params.get("runId") if isinstance(params, Mapping) else None
    if _uuid_rule(value) is not None:
        raise invalid("runId", "pattern")
    return str(value)


# --- Shared reads ---------------------------------------------------------------------------------------------------


def _session_id(request: Request) -> str | None:
    """The optional `?sessionId=` (G §3 R1): a UUID, or absent. Never logged, never returned."""
    value = query_param(request.event, "sessionId")
    if value is None:
        return None
    if not UUID.match(value):
        raise invalid("sessionId", "pattern")
    return value


def _session_view(session: Mapping[str, Any] | None, session_id: str | None, now: datetime) -> dict[str, Any]:
    """The four session fields R1 returns; never `sessionId` or `generation`."""
    if session is None:
        return {"activeElsewhere": False, "runId": None, "deviceLabel": None, "leaseExpiresAt": None}
    holder = session.get("sessionId")
    expires = parse_time(session.get("leaseExpiresAt"))
    live = (
        isinstance(holder, str)
        and not holder.startswith(RESET_HOLDER_PREFIX)
        and session.get("released") is not True
        and expires is not None
        and expires > now
    )
    # Without ?sessionId= any live lease counts as elsewhere (G §3 R1 [ASSUMPTION]).
    elsewhere = bool(live) and (session_id is None or holder != session_id)
    run_id, device_label = session.get("runId"), session.get("deviceLabel")
    return {
        "activeElsewhere": elsewhere,
        "runId": run_id if isinstance(run_id, str) else None,
        "deviceLabel": device_label if isinstance(device_label, str) else None,
        "leaseExpiresAt": iso_z(expires) if expires is not None else None,
    }


class _Playability:
    """Whether a pinned (ruleset, campaign) pair can be played: its bounds file loads (spine S5.1), and (Gate M, LD6)
    the run's wave set is not marked invalid in versions.json. Asked once per pair per request; versions.json is read
    at most once per request, and only for a run that names its wave set."""

    def __init__(self, bounds: Callable[[str, str], Any], versions: Callable[[], Versions]) -> None:
        self._bounds = bounds
        self._versions = versions
        self._loaded: Versions | None = None
        self._seen: dict[tuple[str, str], bool] = {}

    def __call__(self, ruleset: Any, campaign: Any, wave_set: Any = None) -> bool:
        if not isinstance(ruleset, str) or not isinstance(campaign, str):
            return False
        key = (ruleset, campaign)
        if key not in self._seen:
            try:
                self._bounds(ruleset, campaign)
            except (BoundsUnavailable, ValueError):
                self._seen[key] = False
            else:
                self._seen[key] = True
        if not self._seen[key] or wave_set is None:
            return self._seen[key]
        if self._loaded is None:
            self._loaded = self._versions()
        return self._loaded.can_resume(campaign, wave_set)


def _me_view(deps: Deps, table: DynamoTable, pk: str, profile: Mapping[str, Any], session_id: str | None) -> dict:
    """The R1 body. Every field is named here; nothing is copied from the item wholesale."""
    now = deps.now()
    today = today_in_london(now)
    age = stored_age(profile, today) if profile.get("dob") is not None else None
    session = table.get_item(pk, SESSION_SK)
    runs = [
        item
        for item in table.query_prefix(pk, RUN_PREFIX, attributes=RUN_SUMMARY_ATTRIBUTES)
        if item.get("status") == "IN_PROGRESS"
    ]
    runs.sort(key=lambda item: str(item["sk"]))  # ties by runId, then newest first (stable sort)
    runs.sort(key=lambda item: str(item.get("lastPlayedAt") or ""), reverse=True)
    playable = _Playability(deps.bounds, lambda: deps.game_data().versions())
    planets, badges = profile.get("planets"), profile.get("badges")
    return {
        "nickname": profile.get("nickname"),
        "avatarId": profile.get("avatarId"),
        "age": age,
        "schoolYear": school_year(profile),
        "ageBand": band_for(profile, today),
        "hardAgeBand": band_for(profile, today, HARD),
        "planets": plain(planets) if isinstance(planets, Mapping) else {},
        "badges": plain(badges) if isinstance(badges, Mapping) else {},
        "session": _session_view(session, session_id, now),
        "runs": [run_summary(item, playable) for item in runs],
    }


def _profile_or_404(table: DynamoTable, pk: str) -> dict[str, Any]:
    profile = table.get_item(pk, PROFILE_SK)
    if profile is None:
        raise ApiError("PROFILE_NOT_FOUND")
    return profile


def _with_unlocks(planets: list[Planet], profile: Mapping[str, Any]) -> list[tuple[Planet, bool]]:
    """Each released planet and whether it is unlocked: every one, from the start (ADR-0043, owner 2026-11-20: maps
    instead of planets, "all open from the start"; it was the next planet once the one before reached wave 20,
    spine S8.1). `profile` stays a parameter so a future rule can use the child's progress again."""
    del profile
    return [(planet, True) for planet in planets]


def _is_ccf(error: ClientError) -> bool:
    return error_code(error) == "ConditionalCheckFailedException"


def make_router(deps: Deps, logger: ApiLogger | None = None) -> Router:
    """The router with this phase's handlers bound to `deps`."""
    logger = logger or ApiLogger("player-api")

    def pause(attempt: int) -> None:
        deps.sleep(jittered_pause(attempt, deps.random))

    def _playability() -> _Playability:
        return _Playability(deps.bounds, lambda: deps.game_data().versions())

    # --- Views that read slots and pinned versions ----------------------------------------------------------------

    def current_slot(run: Mapping[str, Any], slots: list[dict[str, Any]] | None, table: DynamoTable, pk: str):
        """`currentSlot` for a run: the slot the phase names, and whether its pinned version is withdrawn or missing
        (one consistent read of that version; reads never act on it, spine S3.3)."""
        slot_id = current_slot_of(run)
        if slot_id is None:
            return None
        run_id = str(run["sk"]).removeprefix(RUN_PREFIX)
        if slots is not None:
            slot = next((s for s in slots if s.get("slotId") == slot_id), None)
        else:
            slot = table.get_item(pk, slot_sk(run_id, slot_id))
        if slot is None:
            return None
        version = deps.content().get_item(
            *version_key(str(slot.get("activityId")), str(slot.get("activityVersion"))), attributes=("pk", "withdrawn")
        )
        return current_slot_view(slot, withdrawn=version is None or bool(version.get("withdrawn")))

    def view_of(run: Mapping[str, Any], table: DynamoTable, pk: str, slots: list[dict[str, Any]] | None = None):
        return run_view(run, _playability(), current_slot(run, slots, table, pk))

    # --- The session claim (R13 steps 2-4; also R8's replay) -------------------------------------------------------

    def claim(table: DynamoTable, pk: str, *, run_id: str, session_id: str, device_label: str, takeover: bool):
        """Two conditional updates in order (spine S3.4): (1) same holder -> extend, generation unchanged; (2) free,
        released, a RESET# holder, or lapsed with `takeover` -> generation + 1. If (2) is refused, the item DynamoDB
        hands back decides between the two 409s. Returns (generation, now)."""
        for attempt in range(ATTEMPTS):
            now = deps.now()
            try:
                form = same_holder_update(session_id=session_id, run_id=run_id, device_label=device_label, now=now)
                attributes = table.update_item(pk, SESSION_SK, **form, return_values="ALL_NEW")
                return generation_of(attributes), now
            except ClientError as error:
                if not _is_ccf(error):
                    if is_transient(error):
                        pause(attempt + 1)
                        continue
                    raise
            try:
                form = takeover_update(
                    session_id=session_id, run_id=run_id, device_label=device_label, now=now, takeover=takeover
                )
                attributes = table.update_item(
                    pk, SESSION_SK, **form, return_values="ALL_NEW", return_old_on_failure=True
                )
                return generation_of(attributes), now
            except ClientError as error:
                if _is_ccf(error):
                    old = failed_item(error) or table.get_item(pk, SESSION_SK)
                    refusal = conflict(old, session_id, now, takeover)
                    if refusal is not None:
                        raise refusal from None
                elif not is_transient(error):
                    raise
                pause(attempt + 1)  # the lease changed between the two updates, or DynamoDB was busy: try again
        raise ApiError("THROTTLED")

    def replay(table: DynamoTable, pk: str, run: Mapping[str, Any], body: Mapping[str, Any]) -> dict[str, Any]:
        """R8 for a runId that already exists: the run as stored (never re-selected, never compared with the body),
        and the lease claimed for this session exactly as R13's claim would (same holder: same generation). An ended
        run is 409 RUN_TERMINAL, as for the R13 claim, and claims no lease ([PROPOSAL] in G R8, Phase 16 review)."""
        if run.get("status") in TERMINAL:
            raise ApiError("RUN_TERMINAL")
        generation, now = claim(
            table,
            pk,
            run_id=body["runId"],
            session_id=body["sessionId"],
            device_label=body["deviceLabel"],
            takeover=body.get("takeover") is True,
        )
        return json_response(
            200, {"run": view_of(run, table, pk), "session": lease_view(body["sessionId"], generation, now)}
        )

    # --- R8 POST /api/runs (G7) ------------------------------------------------------------------------------------

    def post_runs(request: Request) -> dict[str, Any]:
        body = _checked(json_object(request.event), CREATE_RUN_FIELDS)
        run_id, session_id, takeover = body["runId"], body["sessionId"], body.get("takeover") is True
        table = deps.game()
        pk = _pk(request)

        # Lookup first (G7): a repeat of a create returns the stored run without a second transaction.
        existing = table.get_item(pk, run_sk(run_id))
        if existing is not None:
            return replay(table, pk, existing, body)

        profile = _profile_or_404(table, pk)
        try:
            bounds = deps.bounds(body["rulesetVersion"], body["campaignVersion"])
            planet = deps.game_data().planet(body["campaignVersion"])
        except (BoundsUnavailable, GameDataUnavailable, ValueError):
            raise ApiError("CONTENT_VERSION_UNSUPPORTED", "Unknown or unreleased game data version") from None
        if planet.planet_id != body["planetId"]:
            raise invalid("planetId", "campaignVersion")  # the campaign version is another planet's document
        wave_set = next((ws for ws in planet.wave_sets if ws.wave_set_id == body["waveSetId"]), None)
        ws_bounds = bounds["waveSets"].get(body["waveSetId"])
        if wave_set is None or ws_bounds is None:
            raise invalid("waveSetId", "enum")
        # Gate M, LD6: a preview wave set is for tester accounts only; a retired or invalid one takes no new runs. The
        # player re-reads current.json on this code and tries once more (newGame.ts, D7.3).
        if not deps.game_data().versions().can_start(body["campaignVersion"], body["waveSetId"], request.caller.sub):
            raise ApiError("CONTENT_VERSION_UNSUPPORTED", "This wave set is not open for new games")

        now = deps.now()
        difficulty = body.get("difficulty", EASY)
        band = band_for(profile, today_in_london(now), difficulty)
        if band is None:
            raise ApiError(
                "CONTENT_UNAVAILABLE", "No activities for this school year", details={"reason": "AGE_OUT_OF_RANGE"}
            )
        released = deps.game_data().released_planets()
        unlocks = {planet.planet_id: unlocked for planet, unlocked in _with_unlocks(released, profile)}
        if body["planetId"] not in unlocks:
            # LD10: an unreleased planet only as a tester's preview (can_start above checked the tester list).
            preview = deps.game_data().versions().state(body["campaignVersion"], body["waveSetId"]) == "preview"
            if not preview:
                raise ApiError("CONTENT_VERSION_UNSUPPORTED", "Planet is not in the released game data")
        statuses = [item.get("status") for item in table.query_prefix(pk, RUN_PREFIX, attributes=("status",))]
        if statuses.count("IN_PROGRESS") >= IN_PROGRESS_CAP:  # the soft cap, from the G1 Query
            raise ApiError("RUN_LIMIT_REACHED", "Too many games in progress")

        # A wave set with meteor challenges is playable only with the ruleset's power rotation (C10; Phase 51).
        if ws_bounds["meteorAfter"] and not bounds.get("powerAwardRotation"):
            raise ApiError("CONTENT_VERSION_UNSUPPORTED")
        # Selection (C24): pinned once, here; a replay never re-selects.
        seed = deps.seed()
        specs = slot_specs(
            int(ws_bounds["finalWave"]),
            list(ws_bounds["meteorAfter"]),
            list(ws_bounds["normalRewardByInterval"]),
            list(bounds.get("powerAwardRotation", [])),
        )
        content = deps.content()
        try:
            chosen = select_units(specs, read_units(content, band), seed, deps.selection)
            versions = read_versions(content, {(unit.activity_id, unit.version) for unit in chosen})
            plans = plan_slots(specs, chosen, versions, seed)
        except BankNotReady as refusal:
            # Why, for the operator (never the child): SLOT_UNFILLED, NOT_ELIGIBLE, ... (shared/selection/plan.py)
            logger.line("WARNING", routeKey="POST /api/runs", code="BANK_NOT_READY", result=refusal.cause)
            raise ApiError(
                "CONTENT_UNAVAILABLE", "Activities for this age are not ready", details={"reason": "BANK_NOT_READY"}
            ) from None
        if 3 + len(plans) != int(ws_bounds["createRunActions"]):  # G-15 counted these actions at build time
            raise RuntimeError("slot plan does not match the bounds file's createRunActions")

        for attempt in range(ATTEMPTS):
            now = deps.now()
            stamp = iso_z(now)
            session = table.get_item(pk, SESSION_SK)
            refusal = conflict(session, session_id, now, takeover)
            if refusal is not None:
                raise refusal
            common = {"session_id": session_id, "run_id": run_id, "device_label": body["deviceLabel"], "now": now}
            if session is not None and session.get("sessionId") == session_id:
                generation = generation_of(session)
                form = same_holder_update(**common, generation=generation)
            else:
                generation = generation_of(session) + 1
                form = takeover_update(**common, takeover=takeover, expected=session)
            run_item = new_run_item(
                pk=pk,
                run_id=run_id,
                planet_id=body["planetId"],
                wave_set_id=body["waveSetId"],
                wave_set_bounds=ws_bounds,
                preset_placements=wave_set.preset_placements,
                age_band=band,
                difficulty=difficulty,
                seed=seed,
                ruleset_version=body["rulesetVersion"],
                campaign_version=body["campaignVersion"],
                generation=generation,
                plans=plans,
                now=stamp,
                asset_manifest_version=deps.game_data().current().get("assetManifestVersion", DEFAULT_MANIFEST_VERSION),
            )
            new_only = {"condition": "attribute_not_exists(#pk)", "names": {"#pk": "pk"}}
            # Action order is fixed: CancellationReasons come back in this order (F §12.3).
            actions = [
                table.update_action(pk, SESSION_SK, **form, return_old_on_failure=True),  # 0 SESSION: the claim
                table.put_action(run_item, **new_only),  # 1 RUN
                table.condition_check_action(  # 2 PROFILE: a reset racing the create
                    pk, PROFILE_SK, condition="attribute_exists(#pk)", names={"#pk": "pk"}
                ),
                *(table.put_action(new_slot_item(pk=pk, run_id=run_id, plan=plan), **new_only) for plan in plans),
            ]
            try:
                table.transact_write(actions)
            except ClientError as error:
                reasons = cancellation_reasons(error)
                if reasons is None:
                    if is_transient(error):
                        pause(attempt + 1)
                        continue
                    raise
                codes = [reason.code for reason in reasons] + ["None"] * (len(actions) - len(reasons))
                if codes[1] == CCF:  # the same runId was created meanwhile: the replay path
                    stored = table.get_item(pk, run_sk(run_id))
                    if stored is None:
                        raise RuntimeError("RUN condition failed but no RUN item exists") from None
                    return replay(table, pk, stored, body)
                if codes[2] == CCF:
                    raise ApiError("PROFILE_NOT_FOUND") from None
                if codes[0] == CCF:
                    old = reasons[0].item or table.get_item(pk, SESSION_SK)
                    refusal = conflict(old, session_id, now, takeover)
                    if refusal is not None:
                        raise refusal from None
                    pause(attempt + 1)  # the lease moved between the read and the write but is ours to take: again
                    continue
                if CCF in codes[3:]:
                    raise RuntimeError("a slot of a new run already exists") from None
                if is_transient(error):
                    pause(attempt + 1)
                    continue
                raise
            return json_response(
                201, {"run": view_of(run_item, table, pk, slots=[]), "session": lease_view(session_id, generation, now)}
            )
        raise ApiError("THROTTLED")

    # --- R9 and R10 --------------------------------------------------------------------------------------------------

    # --- R7 GET /api/runs (G §4, §8; Phase 32) ------------------------------------------------------------------------

    def get_runs(request: Request) -> dict[str, Any]:
        """The caller's open or finished runs as RunSummary, newest first, `limit` per page with an opaque cursor."""
        state, limit, offset = parse_query(
            query_param(request.event, "state"),
            query_param(request.event, "limit"),
            query_param(request.event, "cursor"),
        )
        table = deps.game()
        pk = _pk(request)
        _profile_or_404(table, pk)
        items = table.query_prefix(pk, RUN_PREFIX, attributes=RUN_SUMMARY_ATTRIBUTES)
        chunk, next_cursor = page(items, state, limit, offset)
        playable = _playability()
        return json_response(200, {"items": [run_summary(item, playable) for item in chunk], "nextCursor": next_cursor})

    def get_run(request: Request) -> dict[str, Any]:
        run_id = _path_run_id(request)
        table = deps.game()
        pk = _pk(request)
        run = table.get_item(pk, run_sk(run_id))
        if run is None:
            raise ApiError("NOT_FOUND")
        slots = table.query_prefix(pk, slot_prefix(run_id))
        detail = view_of(run, table, pk, slots=slots)
        detail["slots"] = [slot_entry(slot) for slot in sorted_slots(slots)]
        return json_response(200, detail)

    def get_pack(request: Request) -> dict[str, Any]:
        run_id = _path_run_id(request)
        table = deps.game()
        pk = _pk(request)
        run = table.get_item(pk, run_sk(run_id))
        if run is None:
            raise ApiError("NOT_FOUND")
        slots = table.query_prefix(pk, slot_prefix(run_id))
        planned = int(run.get("plannedThrough") or 0)
        pins = {
            (str(s.get("activityId")), str(s.get("activityVersion")))
            for s in slots
            if s.get("status") == "UNRESOLVED" and int(str(s.get("slotId"))[2:]) <= planned
        }
        versions = read_versions(deps.content(), pins) if pins else {}
        pins_map = run.get("pins") if isinstance(run.get("pins"), Mapping) else {}
        playable = _playability()(pins_map.get("rulesetVersion"), pins_map.get("campaignVersion"), run.get("waveSetId"))
        return json_response(200, pack_body(run, slots, versions, playable))

    # --- R13 PUT /api/session, R14 DELETE /api/session ---------------------------------------------------------------

    def put_session(request: Request) -> dict[str, Any]:
        body = _checked(json_object(request.event), SESSION_FIELDS)
        if body["mode"] == "renew" and "generation" not in body:
            raise invalid("generation", "required")
        table = deps.game()
        pk = _pk(request)
        run_id, session_id = body["runId"], body["sessionId"]

        if body["mode"] == "renew":
            # Only this exact tenure may extend; a failed renew never falls back to a claim (G §7 R13).
            for attempt in range(ATTEMPTS):
                now = deps.now()
                form = renew_update(
                    session_id=session_id,
                    generation=body["generation"],
                    run_id=run_id,
                    device_label=body["deviceLabel"],
                    now=now,
                )
                try:
                    table.update_item(pk, SESSION_SK, **form)
                except ClientError as error:
                    if _is_ccf(error):
                        raise ApiError("STALE_SESSION", "The session is held by another tenure") from None
                    if not is_transient(error):
                        raise
                    pause(attempt + 1)
                    continue
                return json_response(200, {**lease_view(session_id, body["generation"], now), "runId": run_id})
            raise ApiError("THROTTLED")  # never STALE_SESSION for a DynamoDB hiccup

        run = table.get_item(pk, run_sk(run_id), attributes=("status",))
        if run is None:
            raise ApiError("NOT_FOUND")
        if run.get("status") in TERMINAL:
            raise ApiError("RUN_TERMINAL", "The run has ended")
        generation, now = claim(
            table,
            pk,
            run_id=run_id,
            session_id=session_id,
            device_label=body["deviceLabel"],
            takeover=body.get("takeover") is True,
        )
        return json_response(200, {**lease_view(session_id, generation, now), "runId": run_id})

    def delete_session(request: Request) -> dict[str, Any]:
        # The body is the contract; the same two values as query parameters are the fallback while it is unverified
        # that a DELETE body survives CloudFront and the HTTP API (G §7 R14, U-043).
        if raw_body(request.event):
            body = _checked(json_object(request.event), RELEASE_FIELDS)
        else:
            generation_text = query_param(request.event, "generation")
            query: dict[str, Any] = {}
            if query_param(request.event, "sessionId") is not None:
                query["sessionId"] = query_param(request.event, "sessionId")
            if generation_text is not None:
                query["generation"] = int(generation_text) if generation_text.isdigit() else generation_text
            body = _checked(query, RELEASE_FIELDS)
        table = deps.game()
        pk = _pk(request)
        for attempt in range(ATTEMPTS):
            form = release_update(session_id=body["sessionId"], generation=body["generation"], now=deps.now())
            try:
                table.update_item(pk, SESSION_SK, **form)
            except ClientError as error:
                if not _is_ccf(error):  # a mismatch means nothing of ours to release: still 204
                    if not is_transient(error):
                        raise
                    pause(attempt + 1)
                    continue
            return {"statusCode": 204, "headers": {"cache-control": "no-store"}, "body": ""}
        raise ApiError("THROTTLED")

    # --- R11 POST /api/runs/{runId}/ops (G5; Phase 17) ---------------------------------------------------------------

    def post_ops(request: Request) -> dict[str, Any]:
        """Batch checks (400, 409 PROTOCOL_UNSUPPORTED) before any op; then the ops in order (shared/ops.py); then the
        run as it now stands. 200 whenever ops were processed, even with a REJECTED; 409 STALE_SESSION only when the
        first op failed the fence; 503 THROTTLED when an op's transaction was refused three times. 409 and 503 also
        carry `results` and `run` (G §5.5)."""
        return _apply(request, check_envelope(json_object(request.event, max_bytes=OPS_MAX_BYTES), OPS_ENVELOPE))

    # --- R12 POST /api/runs/{runId}/endless (G §6; Phase 29) ---------------------------------------------------------

    def post_endless(request: Request) -> dict[str, Any]:
        """CHOOSE_ENDLESS, online only: the R11 envelope with exactly one CHOOSE_ENDLESS op (anything else is 400),
        then exactly R11's pipeline and answers, including ALREADY_APPLIED on a retried opId. Endless slot planning
        (F §3.6) arrives with endless content (Phase 54); until then the run moves to BUILD for finalWave + 1."""
        return _apply(request, check_envelope(json_object(request.event), ENDLESS_ENVELOPE))

    def _apply(request: Request, envelope: dict[str, Any]) -> dict[str, Any]:
        run_id = _path_run_id(request)
        table = deps.game()
        pk = _pk(request)
        route = {"requestId": request.request_id, "routeKey": request.caller.route_key, "sub": request.caller.sub}

        def log(level: str, **fields: Any) -> None:
            logger.line(level, **route, runId=run_id, **fields)  # one line per op (G §15)

        batch = OpsBatch(
            table=table,
            content=deps.content,
            bounds=deps.bounds,
            resumable=lambda campaign, wave_set: deps.game_data().versions().can_resume(campaign, wave_set),
            now=deps.now,
            sleep=deps.sleep,
            random=deps.random,
            log=log,
        )
        outcome = batch.apply(pk, run_id, envelope)
        run = table.get_item(pk, run_sk(run_id))
        if run is None:  # deleted after its ops were looked at (a whole-profile reset): nothing left to show
            raise ApiError("NOT_FOUND")
        # G9: an op of this batch ended the run, so the account may now hold more than 50 ended runs. Best effort,
        # after the op's write; prune_terminal_runs never raises, so it cannot change the answer below.
        if run.get("status") in TERMINAL and any(r["result"] == "APPLIED" for r in outcome.results):
            prune_terminal_runs(table, pk, log, sleep=deps.sleep)
        body = {"results": outcome.results, "run": view_of(run, table, pk)}
        if outcome.stop == "STALE_SESSION_FIRST":
            raise ApiError("STALE_SESSION", "Session generation is no longer current", extra=body)
        if outcome.stop == "THROTTLED":
            raise ApiError("THROTTLED", extra=body)
        return json_response(200, body)

    # --- Profile routes (Phase 15) ---------------------------------------------------------------------------------

    def get_me(request: Request) -> dict[str, Any]:
        session_id = _session_id(request)
        table = deps.game()
        pk = _pk(request)
        return json_response(200, _me_view(deps, table, pk, _profile_or_404(table, pk), session_id))

    # --- R5 POST /api/me/resets (G §3; Phase 55) ---------------------------------------------------------------------

    def post_reset(request: Request) -> dict[str, Any]:
        """The three account resets of F §12.5; 200 only when every step has finished (the client repeats on error)."""
        reset = checked_type(json_object(request.event))
        body = apply_reset(
            deps.game(), _pk(request), reset, request_id=request.request_id, now=deps.now(), sleep=deps.sleep
        )
        return json_response(200, body)

    def get_progress(request: Request) -> dict[str, Any]:
        """R2: one summary per topic the child has resolved an activity in (counts only: no answers, attempt numbers or
        age band), plus planets and badges as in R1. The counters are written in the resolving op's transaction
        (shared/ops.py summary_update), so a replay or a VOID/DECLINED slot never moves them."""
        table = deps.game()
        pk = _pk(request)
        profile = _profile_or_404(table, pk)
        summaries = []
        for item in table.query_prefix(pk, SUMMARY_PREFIX):
            parts = str(item.get("sk")).split("#")
            if len(parts) != 3:
                continue
            summaries.append(
                {
                    "subject": parts[1],
                    "topicId": parts[2],
                    "completed": int(plain(item.get("completed")) or 0),
                    "succeeded": int(plain(item.get("succeeded")) or 0),
                    "failed": int(plain(item.get("failed")) or 0),
                    "lastResolvedAt": item.get("lastResolvedAt"),
                }
            )
        summaries.sort(key=lambda s: (s["subject"], s["topicId"]))
        planets, badges = profile.get("planets"), profile.get("badges")
        return json_response(
            200,
            {
                "summaries": summaries,
                "planets": plain(planets) if isinstance(planets, Mapping) else {},
                "badges": plain(badges) if isinstance(badges, Mapping) else {},
            },
        )

    def put_profile(request: Request) -> dict[str, Any]:
        session_id = _session_id(request)
        now = deps.now()
        fields = validate_profile(json_object(request.event), partial=False, today=today_in_london(now))
        table = deps.game()
        pk = _pk(request)
        # The only write that creates PROFILE (spine S8.1): the fields, then createdAt and the two maps only if
        # missing. Repeating the same body leaves the same item. YG1: a PUT without a date of birth removes any stored
        # one; the school year decides the questions now.
        # A PUT sets what it carries of schoolYear and dob and removes the other (a player made before YG1 sends dob).
        values: dict[str, Any] = {
            ":nickname": fields["nickname"],
            ":avatarId": fields["avatarId"],
            ":now": iso_z(now),
            ":empty": {},
        }
        sets, removes = [], []
        for name in ("schoolYear", "dob"):
            if name in fields:
                sets.append(f"#{name} = :{name}, ")
                values[f":{name}"] = fields[name]
            else:
                removes.append(f"#{name}")
        profile = table.update_item(
            pk,
            PROFILE_SK,
            update=(
                f"SET #nickname = :nickname, #avatarId = :avatarId, {''.join(sets)}"
                "#createdAt = if_not_exists(#createdAt, :now), "
                "#planets = if_not_exists(#planets, :empty), #badges = if_not_exists(#badges, :empty)"
                + (f" REMOVE {', '.join(removes)}" if removes else "")
            ),
            names={
                "#nickname": "nickname",
                "#avatarId": "avatarId",
                "#schoolYear": "schoolYear",
                "#dob": "dob",
                "#createdAt": "createdAt",
                "#planets": "planets",
                "#badges": "badges",
            },
            values=values,
            return_values="ALL_NEW",
        )
        return json_response(200, _me_view(deps, table, pk, profile, session_id))

    def patch_profile(request: Request) -> dict[str, Any]:
        session_id = _session_id(request)
        now = deps.now()
        fields = validate_profile(json_object(request.event), partial=True, today=today_in_london(now))
        table = deps.game()
        pk = _pk(request)
        names = {"#pk": "pk", **{f"#{name}": name for name in fields}}
        values = {f":{name}": value for name, value in fields.items()}
        try:
            profile = table.update_item(
                pk,
                PROFILE_SK,
                update="SET " + ", ".join(f"#{name} = :{name}" for name in fields),
                names=names,
                values=values,
                condition="attribute_exists(#pk)",
                return_values="ALL_NEW",
            )
        except ClientError as exc:
            if _is_ccf(exc):
                raise ApiError("PROFILE_NOT_FOUND") from None
            raise
        return json_response(200, _me_view(deps, table, pk, profile, session_id))

    def get_planets(request: Request) -> dict[str, Any]:
        now = deps.now()
        table = deps.game()
        profile = table.get_item(_pk(request), PROFILE_SK, attributes=("dob", "schoolYear", "planets"))
        if profile is None:
            raise ApiError("PROFILE_NOT_FOUND")
        band = band_for(profile, today_in_london(now))
        hard_band = band_for(profile, today_in_london(now), HARD)
        planets: list[dict[str, Any]] = []
        versions = deps.game_data().versions()
        sub = request.caller.sub

        def entry_for(ws: Any, version: str, live: bool) -> dict[str, Any]:
            entry: dict[str, Any] = {
                "waveSetId": ws.wave_set_id,
                "mode": ws.mode,
                "name": ws.name,
                "finalWave": ws.final_wave,
                "available": band is not None,
            }
            # BANK_NOT_READY is decided by selection inside POST /api/runs (Phase 16); this list does not run it
            # yet, so only the age band decides here.
            if band is None:
                entry["reason"] = "AGE_OUT_OF_RANGE"
            if versions.state(version, ws.wave_set_id) == "preview":
                entry["preview"] = True  # LD7: shown to a tester only, marked so Home can say so
            if not live:
                entry["campaignVersion"] = version  # LD7: a preview version that current.json does not name
            return entry

        for planet, unlocked in _with_unlocks(deps.game_data().released_planets(), profile):
            wave_sets = [
                entry_for(ws, planet.campaign_version, True)
                for ws in planet.wave_sets
                # LD6: retired, invalid, or a preview this account does not test
                if versions.can_start(planet.campaign_version, ws.wave_set_id, sub)
            ]
            if sub in versions.testers:
                wave_sets += [
                    entry_for(ws, other.campaign_version, False)
                    for other in _preview_planets(deps.game_data(), versions, planet)
                    for ws in other.wave_sets
                    if versions.state(other.campaign_version, ws.wave_set_id) == "preview"
                ]
            planets.append(
                {
                    "planetId": planet.planet_id,
                    "name": planet.name,
                    "campaignVersion": planet.campaign_version,  # LD9: each released planet has its own
                    **({"icon": planet.icon} if planet.icon is not None else {}),  # LD10: a library Planet picture
                    "unlocked": unlocked,
                    "waveSets": wave_sets,
                }
            )
        if sub in versions.testers:
            # LD10: a planet not yet released, for its testers: its newest preview version, open to them.
            released_ids = {p["planetId"] for p in planets}
            for other in _unreleased_previews(deps.game_data(), versions, released_ids):
                planets.append(
                    {
                        "planetId": other.planet_id,
                        "name": other.name,
                        "campaignVersion": other.campaign_version,
                        **({"icon": other.icon} if other.icon is not None else {}),
                        "unlocked": True,
                        "preview": True,
                        "waveSets": [
                            entry_for(ws, other.campaign_version, False)
                            for ws in other.wave_sets
                            if versions.state(other.campaign_version, ws.wave_set_id) == "preview"
                        ],
                    }
                )
        return json_response(
            200,
            {"ageBand": band, "hardAgeBand": hard_band, "schoolYear": school_year(profile), "planets": planets},
        )

    handlers = {
        "GET /api/me": get_me,
        "GET /api/me/progress": get_progress,
        "POST /api/me/resets": post_reset,
        "PUT /api/me/profile": put_profile,
        "PATCH /api/me/profile": patch_profile,
        "GET /api/planets": get_planets,
        "GET /api/runs": get_runs,
        "POST /api/runs": post_runs,
        "GET /api/runs/{runId}": get_run,
        "GET /api/runs/{runId}/pack": get_pack,
        "POST /api/runs/{runId}/ops": post_ops,
        "POST /api/runs/{runId}/endless": post_endless,
        "PUT /api/session": put_session,
        "DELETE /api/session": delete_session,
    }
    return Router(routes=ROUTES, handlers=handlers, logger=logger)


def _preview_planets(reader: GameDataReader, versions: Versions, live: Planet) -> list[Planet]:
    """The newest PREVIEW_VERSIONS versions of `live`'s planet that hold a preview wave set (Gate M, LD7): what a
    tester's Home offers beside the live version. An unreadable document is left out."""
    found: list[Planet] = []
    for version in sorted(versions.states, key=_allocation, reverse=True):
        if version == live.campaign_version or "preview" not in versions.states[version].values():
            continue
        try:
            planet = reader.planet(version)
        except GameDataUnavailable:
            continue
        if planet.planet_id == live.planet_id:
            found.append(planet)
        if len(found) == PREVIEW_VERSIONS:
            break
    return found


def _unreleased_previews(reader: GameDataReader, versions: Versions, released: set[str]) -> list[Planet]:
    """Planets current.json does not list that have a preview version: the newest per planet (LD10)."""
    newest: dict[str, Planet] = {}
    for version in sorted(versions.states, key=_allocation, reverse=True):
        if "preview" not in versions.states[version].values():
            continue
        try:
            planet = reader.planet(version)
        except GameDataUnavailable:
            continue
        if planet.planet_id not in released and planet.planet_id not in newest:
            newest[planet.planet_id] = planet
    return list(newest.values())[:PREVIEW_VERSIONS]


def _allocation(version: str) -> tuple[int, str]:
    """luna-1-a12 sorts after luna-1-a9: the publisher's counter, then the text."""
    head, _, number = version.rpartition("-a")
    return (int(number), head) if head and number.isdigit() else (-1, version)


DEFAULT_DEPS = Deps()
ROUTER = make_router(DEFAULT_DEPS)


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    return ROUTER.handle(event)
