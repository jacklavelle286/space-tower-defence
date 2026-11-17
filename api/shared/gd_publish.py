"""The game-data publisher (Gate M, LD6; scope-level-designer.md §3.1, ADR-0037): turns a checked level draft into
immutable game-data files and moves the pointers. Only the publisher's role may write game-data/ (the site bucket
denies everyone else but the release), so this module is the one place admin game data reaches children.

Actions (api/functions/game_data_publish/handler.py dispatches them):

    publish    {levelId, draftRevision, sourceVersion, live, by}    runs asynchronously from LD7's route (a campaign's
                                                                     balance checks take about a minute); the outcome is
                                                                     kept on the PUB# item, which the portal reads
    validate   {levelId, draftRevision?}                              rules and pictures, no balance checks, no writes
    makeLive   {campaignVersion, by}                                  move current.json (also the rollback)
    setState   {campaignVersion, waveSetId, state, by}                preview | published | retired | invalid
    setTesters {testers, by}                                          the accounts that may play preview wave sets

Publish, in order; each step can refuse, and nothing is written before step 8:

     1. freeze switch (SSM)                       FROZEN
     2. draft at the given revision               NOT_FOUND, DRAFT_CONFLICT, INVALID_LEVEL (shared/levels.py shape)
     3. live current.json; the draft's source     STALE_SOURCE (the draft was checked against another live version)
     4. ruleset and source planet document        NOT_FOUND
     5. game-data-check (Node, runBots)           CHECKS_FAILED (merge, parse, planetProblems, blocking bot checks)
     6. pictures approved, right kind, size       PICTURES (background for a backdrop, decoration for a decoration;
                                                  a backdrop at most limits.json levelDesigner.backdropMaxBytes)
     7. question bank can fill the new sets       BANK_NOT_READY (R30's selector, for every age band that can start
                                                  games today)
     8. allocate <planetId>-a<n>                  the GDCOUNTER item and the PUB# claim in one transaction
     9. game-data-check again for that version    (no bots: it only stamps the version into the bytes)
    10. versions.json: the new sets as preview    (If-Match; before the files, so a version is never playable by
                                                  default while half written)
    11. campaign/<v>.json, bounds/<r>__<v>.json   create-only (If-None-Match: *; the same bytes again are accepted)
    12. live only: sets published, then current.json with If-Match on the ETag read in step 3   (LIVE_MOVED if it
                                                  changed: the version stays a preview)
    13. V#, GDPUBLISH and AUDIT rows, PUB# done   one transaction, each put conditioned on not existing

A retry of the same (levelId, draftRevision) is a replay: once step 8 has run, the claim holds the version and the
source, so the checks are not repeated and steps 9-13 finish what is missing (every write is create-only or
compare-and-set). Items:

    pk LEVEL#<levelId>  sk PUB#<draftRevision:010d>   state RUNNING | DONE | REFUSED, code?, details?, campaignVersion?,
                                                       sourceVersion?, live?, startedAt, updatedAt, by
    pk LEVEL#<levelId>  sk V#<startedAt>               campaignVersion, sha256, bounds, sourceVersion, draftRevision,
                                                       pictures, by (immutable)
    pk GDCOUNTER        sk campaign#<planetId>         next
    pk GDPUBLISH        sk <at>#<campaignVersion>      action (publish | make-live), campaignVersion, prev, live,
                                                       levelId?, diffSummary?, by (immutable)
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

from botocore.exceptions import ClientError

from shared.bounds import VERSION
from shared.content import LIMITS, audit_item, audit_key, iso_z, plain
from shared.data import DynamoTable
from shared.game_data import CurrentInvalid, current_body, parse_current
from shared.levels import DRAFT_SK, LEVEL_ID, LEVEL_PK, level_pk, level_problems
from shared.pictures import PIC_PK, kind_of
from shared.planets import (
    CAMPAIGN_WAVES,
    DEFAULT_PLANET,
    PLANET_ID,
    PLANET_PK,
    empty_planet,
    is_new_token,
    new_version_token,
    with_registry_look,
)
from shared.selection.bank import HEADER_PK, units_for_band
from shared.selection.eligibility import AGE_BANDS, band_status, campaign_specs, can_fill, rules_in_force
from shared.selection.plan import LIVE_CONFIG, slot_specs
from shared.versions import STATES, SUB, Versions, VersionsUnavailable, parse_versions, versions_body

COUNTER_PK = "GDCOUNTER"
PUBLISH_PK = "GDPUBLISH"
CACHE_IMMUTABLE = "public, max-age=31536000, immutable"
CACHE_NO_CACHE = "no-cache"
BACKDROP_MAX_BYTES: int = LIMITS["levelDesigner"]["backdropMaxBytes"]
PICTURE_KINDS = {"backdrops": "background", "decorations": "decoration"}
CAS_ATTEMPTS = 3  # compare-and-set retries on versions.json before giving up (BUSY)
PLACEHOLDER = "check"  # <planetId>-check: the version the first check stamps; never allocated (a<n> starts at a1)
WAVE_SET_ID = re.compile(r"^[a-z0-9-]{1,40}$")


class PublishRefused(Exception):
    """A refusal with a code the portal shows; nothing it would have written is half done in a harmful way."""

    def __init__(self, code: str, message: str, details: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details

    def body(self) -> dict[str, Any]:
        out: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.details is not None:
            out["details"] = self.details
        return out


class SiteStore(Protocol):
    """The player site bucket's game-data objects, with S3's conditional writes."""

    def get(self, key: str) -> tuple[bytes, str] | None:
        """(body, ETag), or None when the object does not exist."""

    def create(self, key: str, body: bytes, cache_control: str) -> bool:
        """Create-only (If-None-Match: *). True when written, False when it already held exactly these bytes; other
        bytes raise PublishRefused FILE_EXISTS."""

    def replace(self, key: str, body: bytes, etag: str | None, cache_control: str) -> bool:
        """Write only if the object is still `etag` (If-Match), or still absent when `etag` is None. False on 412."""


@dataclass
class Deps:
    table: DynamoTable  # content
    site: SiteStore
    check: Callable[[dict[str, Any]], dict[str, Any]]  # invokes game-data-check
    frozen: Callable[[], bool]
    now: Callable[[], datetime]
    prefix: str = "game-data/"
    log: Callable[..., None] = field(default=lambda **_: None)


def _sha256(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def _claim_sk(revision: int) -> str:
    return f"PUB#{revision:010d}"


def _parse_time(text: str) -> datetime:
    return datetime.strptime(text, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)


class Publisher:
    def __init__(self, deps: Deps) -> None:
        self.d = deps

    # --- reading ---------------------------------------------------------------------------------------------------

    def _json(self, key: str, what: str) -> tuple[Any, str]:
        found = self.d.site.get(self.d.prefix + key)
        if found is None:
            raise PublishRefused("NOT_FOUND", f"{what} is not published ({key})")
        try:
            return json.loads(found[0]), found[1]
        except ValueError:
            raise PublishRefused("NOT_FOUND", f"{what} is not JSON ({key})") from None

    def _current(self) -> tuple[dict[str, Any], str]:
        """current.json's pointers (game_data.parse_current: schema 1 or 2, Gate M LD9). Whatever the publisher writes
        back keeps every other planet, the ruleset and the asset manifest (LD8) as they are."""
        data, etag = self._json("current.json", "current.json")
        try:
            return parse_current(data), etag
        except CurrentInvalid:
            raise PublishRefused("NOT_FOUND", "current.json is malformed") from None

    def _head(self, pointers: Mapping[str, Any], planet_id: str) -> tuple[str, bool, dict[str, Any] | None]:
        """The planet's head (shared/planets.py): (version, released, registry item). NOT_FOUND for a planet that is
        neither released nor in the registry."""
        live = self._live_of(pointers, planet_id)
        item = self.d.table.get_item(PLANET_PK, planet_id) if planet_id != DEFAULT_PLANET else None
        if live is not None:
            return live, True, plain(item) if item is not None else None
        if item is None:
            raise PublishRefused("NOT_FOUND", f"no planet {planet_id}")
        item = plain(item)
        return str(item.get("latestVersion") or new_version_token(planet_id)), False, item

    def _base(self, head: str, planet_id: str, item: Mapping[str, Any] | None) -> dict[str, Any]:
        """The document a level is merged into: the head's, an unreleased planet's with the registry's name and look,
        or the empty starting document of a planet with no version yet."""
        if item is not None and is_new_token(head, planet_id):
            return empty_planet(item)
        doc, _ = self._json(f"campaign/{head}.json", "the source planet document")
        if item is not None and item.get("status") != "RELEASED":
            return with_registry_look(doc, item)
        return doc

    def _live_of(self, pointers: Mapping[str, Any], planet_id: str) -> str | None:
        """The campaign version new games on `planet_id` use, or None when the planet is not released. Schema 1 names
        no planet: its one campaign document says which it is."""
        for listed in pointers["planets"]:
            if listed["planetId"] == planet_id:
                return str(listed["campaignVersion"])
            if listed["planetId"] is None:
                doc, _ = self._json(f"campaign/{listed['campaignVersion']}.json", "the live planet document")
                if doc.get("planetId") == planet_id:
                    return str(listed["campaignVersion"])
        return None

    def _versions(self) -> tuple[Versions, str | None]:
        found = self.d.site.get(self.d.prefix + "versions.json")
        if found is None:
            return Versions(), None
        try:
            return parse_versions(json.loads(found[0])), found[1]
        except (ValueError, VersionsUnavailable) as exc:
            raise PublishRefused("VERSIONS_UNREADABLE", f"versions.json cannot be read: {exc}") from None

    def _update_versions(self, change: Callable[[Versions], Versions]) -> Versions:
        """Read, change, write with If-Match; again on a 412 (another action wrote meanwhile)."""
        for _ in range(CAS_ATTEMPTS):
            versions, etag = self._versions()
            changed = change(versions)
            if changed == versions:
                return versions
            body = (json.dumps(versions_body(changed), indent=2) + "\n").encode()
            if self.d.site.replace(self.d.prefix + "versions.json", body, etag, CACHE_NO_CACHE):
                return changed
        raise PublishRefused("BUSY", "versions.json kept changing; try again")

    def _draft(self, level_id: str, revision: int | None) -> tuple[dict[str, Any], dict[str, Any]]:
        if not isinstance(level_id, str) or not LEVEL_ID.fullmatch(level_id):
            raise PublishRefused("INVALID", "levelId is malformed")
        found = self.d.table.batch_get([(LEVEL_PK, level_id), (level_pk(level_id), DRAFT_SK)])
        header, draft = found.get((LEVEL_PK, level_id)), found.get((level_pk(level_id), DRAFT_SK))
        if header is None or draft is None:
            raise PublishRefused("NOT_FOUND", f"no level {level_id}")
        stored = plain(draft.get("draftRevision"))
        if revision is not None and stored != revision:
            raise PublishRefused("DRAFT_CONFLICT", "the draft has changed since", {"draftRevision": stored})
        level = plain(draft.get("level"))
        problems = level_problems(level, level_id)
        if problems:
            raise PublishRefused("INVALID_LEVEL", "the level file is malformed", {"problems": problems})
        return plain(header), {"level": level, "draftRevision": stored}

    # --- checks ----------------------------------------------------------------------------------------------------

    def _run_check(self, ruleset: Any, planet: Any, level: Any, version: str, run_bots: bool) -> dict[str, Any]:
        out = self.d.check(
            {"ruleset": ruleset, "planet": planet, "level": level, "version": version, "runBots": run_bots}
        )
        if not isinstance(out, dict) or "ok" not in out:
            raise RuntimeError("game-data-check gave no answer")
        return out

    def picture_problems(self, pictures: Mapping[str, Sequence[str]]) -> list[dict[str, Any]]:
        wanted = [(group, pid) for group in PICTURE_KINDS for pid in pictures.get(group, [])]
        found = self.d.table.batch_get([(PIC_PK, pid) for _, pid in wanted]) if wanted else {}
        problems: list[dict[str, Any]] = []
        for group, pid in wanted:
            header = found.get((PIC_PK, pid))
            if header is None:
                problems.append({"pictureId": pid, "rule": "missing"})
            elif header.get("state") != "APPROVED":
                problems.append({"pictureId": pid, "rule": "notApproved"})
            elif kind_of(header) != PICTURE_KINDS[group]:
                problems.append({"pictureId": pid, "rule": "wrongKind", "expected": PICTURE_KINDS[group]})
            elif group == "backdrops" and int(header.get("bytes") or 0) > BACKDROP_MAX_BYTES:
                problems.append({"pictureId": pid, "rule": "tooLarge", "maxBytes": BACKDROP_MAX_BYTES})
        return problems

    def bank_problems(self, bounds: Mapping[str, Any], wave_set_ids: Sequence[str]) -> list[dict[str, Any]]:
        """R30's question: can the selector fill each new wave set for every age band whose bank fills the campaign
        today? A new wave set must not be the one place a child of that age cannot start a game."""
        headers = self.d.table.query_prefix(HEADER_PK, "")
        rotation = list(bounds.get("powerAwardRotation", []))
        problems: list[dict[str, Any]] = []
        for band in AGE_BANDS:
            units = units_for_band(headers, band)
            rules = rules_in_force(band_status(units, LIVE_CONFIG), LIVE_CONFIG)
            if rules is None or not can_fill(campaign_specs(), units, rules):
                continue  # this age cannot start the campaign today; a new wave set changes nothing for it
            for ws_id in wave_set_ids:
                ws = bounds["waveSets"][ws_id]
                specs = slot_specs(
                    int(ws["finalWave"]), list(ws["meteorAfter"]), list(ws["normalRewardByInterval"]), rotation
                )
                if not can_fill(specs, units, rules):
                    problems.append({"ageBand": band, "waveSetId": ws_id})
        return problems

    # --- actions ---------------------------------------------------------------------------------------------------

    def validate(self, level_id: str, revision: int | None = None) -> dict[str, Any]:
        """The publish checks that need no bot run and write nothing (the editor's Validate, LD7)."""
        header, draft = self._draft(level_id, revision)
        current, _ = self._current()
        planet_id = str(header.get("planetId") or DEFAULT_PLANET)
        head, _, item = self._head(current, planet_id)
        ruleset, _ = self._json(f"ruleset/{current['rulesetVersion']}.json", "the ruleset")
        planet = self._base(head, planet_id, item)
        out = self._run_check(ruleset, planet, draft["level"], f"{planet_id}-{PLACEHOLDER}", False)
        return {
            "ok": bool(out["ok"]) and not (pictures := self.picture_problems(out["pictures"])),
            "sourceVersion": head,
            "draftRevision": draft["draftRevision"],
            "problems": out["problems"],
            "pictures": pictures,
        }

    def publish(self, level_id: str, revision: int, source_version: str, live: bool, by: str) -> dict[str, Any]:
        if self.d.frozen():
            raise PublishRefused("FROZEN", "publishing is switched off (game-data freeze)")
        if not isinstance(revision, int) or isinstance(revision, bool) or revision < 0:
            raise PublishRefused("INVALID", "draftRevision must be a whole number")
        if not isinstance(source_version, str) or not VERSION.match(source_version):
            raise PublishRefused("INVALID", "sourceVersion is malformed")
        header, draft = self._draft(level_id, revision)
        level = draft["level"]
        planet_id = str(header.get("planetId") or DEFAULT_PLANET)  # LD10: the planet the level belongs to
        pk, claim_sk = level_pk(level_id), _claim_sk(revision)
        claim = self.d.table.get_item(pk, claim_sk)
        current, current_etag = self._current()
        if claim is not None and claim.get("state") == "DONE":
            return self._result(claim)
        head, released, item = self._head(current, planet_id)
        if claim is not None and claim.get("campaignVersion"):
            source_version = str(claim["sourceVersion"])  # a replay: finish what the first run started
        elif source_version != head:
            # The source must be the planet's head: its live version, or an unreleased planet's newest (LD9, LD10).
            raise PublishRefused(
                "STALE_SOURCE",
                "the live game data changed after this draft was checked; update from live and check again",
                {"live": head, "source": source_version},
            )
        if is_new_token(source_version, planet_id) and "campaign" not in level.get("waveSets", {}):
            raise PublishRefused("NEEDS_CAMPAIGN", "a new planet's first published level must own its 50-wave campaign")
        ruleset_version = current["rulesetVersion"]
        ruleset, _ = self._json(f"ruleset/{ruleset_version}.json", "the ruleset")
        planet = self._base(source_version, planet_id, item)
        if not released:
            live = False  # an unreleased planet's versions are previews until its release (R56)

        if claim is None or not claim.get("campaignVersion"):
            self._mark(pk, claim_sk, "RUNNING", by, claim is None)
            first = self._run_check(ruleset, planet, level, f"{planet_id}-{PLACEHOLDER}", True)
            if not first["ok"]:
                raise PublishRefused(
                    "CHECKS_FAILED",
                    "the level does not pass its checks",
                    {"problems": first["problems"], "findings": first["findings"]},
                )
            if pictures := self.picture_problems(first["pictures"]):
                raise PublishRefused("PICTURES", "a picture cannot be published", {"pictures": pictures})
            if bank := self.bank_problems(json.loads(first["boundsJson"]), first["waveSets"]):
                raise PublishRefused("BANK_NOT_READY", "the question bank cannot fill a new wave set", {"bank": bank})
            claim = self._allocate(pk, claim_sk, planet_id, source_version, live, by)
        version, started = str(claim["campaignVersion"]), str(claim["startedAt"])

        out = self._run_check(ruleset, planet, level, version, False)
        if not out["ok"] or out["planetJson"] is None:
            raise PublishRefused(
                "CHECKS_FAILED", "the level no longer passes its checks", {"problems": out["problems"]}
            )
        planet_bytes, bounds_bytes = out["planetJson"].encode(), out["boundsJson"].encode()
        doc = json.loads(planet_bytes)
        owned = set(out["waveSets"])
        all_sets = sorted(doc["waveSets"])

        source_states, _ = self._versions()

        def as_preview(v: Versions) -> Versions:
            states = {k: dict(s) for k, s in v.states.items()}
            mine = states.setdefault(version, {})
            for ws in all_sets:
                if ws not in mine:  # a replay never moves a state back
                    mine[ws] = "preview" if ws in owned else source_states.state(source_version, ws)
            return Versions(testers=v.testers, states=states)

        self._update_versions(as_preview)
        self.d.site.create(f"{self.d.prefix}campaign/{version}.json", planet_bytes, CACHE_IMMUTABLE)
        self.d.site.create(f"{self.d.prefix}bounds/{out['boundsVersion']}.json", bounds_bytes, CACHE_IMMUTABLE)

        went_live = version in {p["campaignVersion"] for p in current["planets"]}
        refusal: str | None = None if released else "NOT_RELEASED"
        if live and not went_live:
            went_live = self._go_live(version, current_etag, planet_id)
            refusal = None if went_live else "LIVE_MOVED"

        moment = _parse_time(started)
        audit_pk, audit_sk = audit_key(moment, level_id)
        cond = {"condition": "attribute_not_exists(#pk)", "names": {"#pk": "pk"}}
        actions = [
            self.d.table.put_action(
                {
                    "pk": pk,
                    "sk": f"V#{started}",
                    "campaignVersion": version,
                    "sha256": _sha256(planet_bytes),
                    "bounds": out["boundsVersion"],
                    "sourceVersion": source_version,
                    "draftRevision": revision,
                    "pictures": sorted({*out["pictures"]["backdrops"], *out["pictures"]["decorations"]}),
                    "by": by,
                },
                **cond,
            ),
            self.d.table.put_action(
                {
                    "pk": PUBLISH_PK,
                    "sk": f"{started}#{version}",
                    "action": "publish",
                    "campaignVersion": version,
                    "prev": source_version,  # the planet's live version when the publish began
                    "live": went_live,
                    "levelId": level_id,
                    "diffSummary": {"waveSets": sorted(owned), "maps": [level_id]},
                    "by": by,
                },
                **cond,
            ),
            self.d.table.put_action(
                audit_item(audit_pk, audit_sk, "level.publish", by, moment, levelId=level_id, campaignVersion=version),
                **cond,
            ),
        ]
        try:
            self.d.table.transact_write(actions)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") != "TransactionCanceledException":
                raise
            # A replay after the rows were written: they exist with the same keys; only the claim is left to finish.
        if item is not None and not released:
            # The unreleased planet's newest version: the head its next level is checked against. Last writer wins
            # [ASSUMPTION: two publishes onto one unreleased planet at once are rare; each still gets its own version].
            self.d.table.update_item(
                PLANET_PK,
                planet_id,
                update="SET #latest = :v, #at = :at",
                names={"#latest": "latestVersion", "#at": "updatedAt"},
                values={":v": version, ":at": started},
            )
        done = {"state": "DONE", "live": went_live, **({"liveRefused": refusal} if refusal else {})}
        self._update_claim(pk, claim_sk, done)
        header_update = "SET #status = :s, #last = :v"
        self.d.table.update_item(
            LEVEL_PK,
            level_id,
            update=header_update,
            names={"#status": "status", "#last": "lastVersion"},
            values={":s": "PUBLISHED", ":v": version},
        )
        self.d.log(event="publish", levelId=level_id, campaignVersion=version, live=went_live)
        return {
            "ok": True,
            "campaignVersion": version,
            "live": went_live,
            **({"liveRefused": refusal} if refusal else {}),
            "warnings": [p for p in out["problems"] if p["severity"] == "warn"],
        }

    def make_live(self, campaign_version: str, by: str) -> dict[str, Any]:
        if self.d.frozen():
            raise PublishRefused("FROZEN", "publishing is switched off (game-data freeze)")
        if not isinstance(campaign_version, str) or not VERSION.match(campaign_version):
            raise PublishRefused("INVALID", "campaignVersion is malformed")
        current, etag = self._current()
        doc, _ = self._json(f"campaign/{campaign_version}.json", f"campaign {campaign_version}")
        planet_id = str(doc.get("planetId"))
        live_now = self._live_of(current, planet_id)
        if live_now is None:
            raise PublishRefused("NOT_RELEASED", f"planet {planet_id} is not released (Levels → Planets)")
        if live_now == campaign_version:
            return {"ok": True, "campaignVersion": campaign_version, "live": True}
        bounds_key = f"bounds/{current['rulesetVersion']}__{campaign_version}.json"
        if self.d.site.get(self.d.prefix + bounds_key) is None:
            raise PublishRefused(
                "NOT_BUILT", f"{campaign_version} has no bounds for ruleset {current['rulesetVersion']}"
            )
        versions, _ = self._versions()
        if versions.state(campaign_version, "campaign") in ("retired", "invalid") and "campaign" in doc.get(
            "waveSets", {}
        ):
            raise PublishRefused("VERSION_WITHDRAWN", f"{campaign_version}'s campaign is retired or invalid")
        if not self._go_live(campaign_version, etag, planet_id):
            raise PublishRefused("LIVE_MOVED", "current.json changed meanwhile; look again and retry")
        moment = self.d.now()
        audit_pk, audit_sk = audit_key(moment, campaign_version)
        cond = {"condition": "attribute_not_exists(#pk)", "names": {"#pk": "pk"}}
        self.d.table.transact_write(
            [
                self.d.table.put_action(
                    {
                        "pk": PUBLISH_PK,
                        "sk": f"{iso_z(moment)}#{campaign_version}",
                        "action": "make-live",
                        "campaignVersion": campaign_version,
                        "prev": live_now,
                        "live": True,
                        "by": by,
                    },
                    **cond,
                ),
                self.d.table.put_action(
                    audit_item(
                        audit_pk,
                        audit_sk,
                        "gamedata.make-live",
                        by,
                        moment,
                        campaignVersion=campaign_version,
                        prev=live_now,
                    ),
                    **cond,
                ),
            ]
        )
        return {"ok": True, "campaignVersion": campaign_version, "live": True, "prev": live_now}

    def release_planet(self, planet_id: str, by: str) -> dict[str, Any]:
        """Release an unreleased planet (LD10, R56): append it to current.json's planets (order is unlock order, so a
        release only ever appends and nothing is removed), its newest version's preview sets become published. Refused
        unless that version has the full 50-wave campaign, bounds for the current ruleset and a question bank that can
        fill its wave sets."""
        if self.d.frozen():
            raise PublishRefused("FROZEN", "publishing is switched off (game-data freeze)")
        if not isinstance(planet_id, str) or not PLANET_ID.match(planet_id):
            raise PublishRefused("INVALID", "planetId is malformed")
        current, etag = self._current()
        if self._live_of(current, planet_id) is not None:
            return {"ok": True, "planetId": planet_id, "released": True}  # already released: a repeat
        found = self.d.table.get_item(PLANET_PK, planet_id)
        if found is None:
            raise PublishRefused("NOT_FOUND", f"no planet {planet_id}")
        item = plain(found)
        version = item.get("latestVersion")
        if not version:
            raise PublishRefused("NOT_READY", "nothing is published for this planet yet")
        doc, _ = self._json(f"campaign/{version}.json", f"campaign {version}")
        campaign = doc.get("waveSets", {}).get("campaign")
        if (
            not isinstance(campaign, dict)
            or len(doc.get("waves", [])) != CAMPAIGN_WAVES
            or len(campaign.get("waves", [])) != CAMPAIGN_WAVES
        ):
            raise PublishRefused("NOT_READY", f"{version} needs its full {CAMPAIGN_WAVES}-wave campaign")
        versions, _ = self._versions()
        if versions.state(version, "campaign") in ("retired", "invalid"):
            raise PublishRefused("VERSION_WITHDRAWN", f"{version}'s campaign is retired or invalid")
        bounds_found = self.d.site.get(f"{self.d.prefix}bounds/{current['rulesetVersion']}__{version}.json")
        if bounds_found is None:
            raise PublishRefused("NOT_BUILT", f"{version} has no bounds for ruleset {current['rulesetVersion']}")
        bounds = json.loads(bounds_found[0])
        if bank := self.bank_problems(bounds, sorted(bounds.get("waveSets", {}))):
            raise PublishRefused(
                "BANK_NOT_READY", "the question bank cannot fill this planet's wave sets", {"bank": bank}
            )

        self._publish_previews(str(version))
        current, _ = self._current()
        planets = [dict(p) for p in current["planets"]]
        for entry in planets:  # schema 1's one entry is named now: the file becomes schema 2 (ADR-0039)
            if entry["planetId"] is None:
                first, _ = self._json(f"campaign/{entry['campaignVersion']}.json", "the live planet document")
                entry["planetId"] = str(first.get("planetId"))
        planets.append({"planetId": planet_id, "campaignVersion": str(version)})
        body = (json.dumps(current_body({**current, "planets": planets}), indent=2) + "\n").encode()
        if not self.d.site.replace(self.d.prefix + "current.json", body, etag, CACHE_NO_CACHE):
            raise PublishRefused("LIVE_MOVED", "current.json changed meanwhile; look again and retry")
        moment = self.d.now()
        stamp = iso_z(moment)
        self.d.table.update_item(
            PLANET_PK,
            planet_id,
            update="SET #status = :r, #order = :o, #rel = :at, #at = :at",
            names={"#status": "status", "#order": "order", "#rel": "releasedAt", "#at": "updatedAt"},
            values={":r": "RELEASED", ":o": len(planets) - 1, ":at": stamp},
        )
        audit_pk, audit_sk = audit_key(moment, planet_id)
        cond = {"condition": "attribute_not_exists(#pk)", "names": {"#pk": "pk"}}
        self.d.table.transact_write(
            [
                self.d.table.put_action(
                    {
                        "pk": PUBLISH_PK,
                        "sk": f"{stamp}#{version}#release",  # never the same key as a publish in the same second
                        "action": "release-planet",
                        "campaignVersion": str(version),
                        "planetId": planet_id,
                        "live": True,
                        "by": by,
                    },
                    **cond,
                ),
                self.d.table.put_action(
                    audit_item(audit_pk, audit_sk, "gamedata.release-planet", by, moment, campaignVersion=str(version)),
                    **cond,
                ),
            ]
        )
        self.d.log(event="release-planet", campaignVersion=str(version))
        return {
            "ok": True,
            "planetId": planet_id,
            "released": True,
            "campaignVersion": str(version),
            "order": len(planets) - 1,
        }

    def set_state(self, campaign_version: str, wave_set_id: str, state: str, by: str) -> dict[str, Any]:
        if self.d.frozen():
            raise PublishRefused("FROZEN", "publishing is switched off (game-data freeze)")
        if state not in STATES or not isinstance(wave_set_id, str) or not WAVE_SET_ID.match(wave_set_id):
            raise PublishRefused("INVALID", "state or waveSetId is malformed")
        if not isinstance(campaign_version, str) or not VERSION.match(campaign_version):
            raise PublishRefused("INVALID", "campaignVersion is malformed")
        doc, _ = self._json(f"campaign/{campaign_version}.json", f"campaign {campaign_version}")
        if wave_set_id not in doc.get("waveSets", {}):
            raise PublishRefused("NOT_FOUND", f"{campaign_version} has no wave set {wave_set_id}")

        def change(v: Versions) -> Versions:
            states = {k: dict(s) for k, s in v.states.items()}
            states.setdefault(campaign_version, {})[wave_set_id] = state
            return Versions(testers=v.testers, states=states)

        self._update_versions(change)
        self._audit("gamedata.state", by, campaign_version, waveSetId=wave_set_id, state=state)
        return {"ok": True, "campaignVersion": campaign_version, "waveSetId": wave_set_id, "state": state}

    def set_testers(self, testers: Any, by: str) -> dict[str, Any]:
        if not isinstance(testers, list) or not all(isinstance(t, str) and SUB.match(t) for t in testers):
            raise PublishRefused("INVALID", "testers must be account IDs")
        wanted = frozenset(testers)
        try:
            parse_versions({"kind": "versions", "schema": 1, "testers": sorted(wanted), "versions": {}})
        except VersionsUnavailable as exc:
            raise PublishRefused("INVALID", str(exc)) from None
        self._update_versions(lambda v: Versions(testers=wanted, states=v.states))
        self._audit("gamedata.testers", by, "testers", count=len(wanted))
        return {"ok": True, "testers": len(wanted)}

    # --- helpers ---------------------------------------------------------------------------------------------------

    def _go_live(self, version: str, etag: str, planet_id: str) -> bool:
        """The version's preview sets become published, then current.json moves (If-Match): only `planet_id`'s entry
        changes (LD9). Published first, so current.json never names a version children cannot start."""

        self._publish_previews(version)
        current, _ = self._current()
        live = self._live_of(current, planet_id)
        if live is None:
            raise PublishRefused("NOT_RELEASED", f"planet {planet_id} is not released (Levels → Planets)")
        planets = [
            {**p, "campaignVersion": version} if p["campaignVersion"] == live else dict(p) for p in current["planets"]
        ]
        body = (json.dumps(current_body({**current, "planets": planets}), indent=2) + "\n").encode()
        return self.d.site.replace(self.d.prefix + "current.json", body, etag, CACHE_NO_CACHE)

    def _publish_previews(self, version: str) -> None:
        """Every preview wave set of `version` becomes published (before current.json names it)."""

        def change(v: Versions) -> Versions:
            states = {k: dict(s) for k, s in v.states.items()}
            mine = states.get(version, {})
            for ws, state in mine.items():
                if state == "preview":
                    mine[ws] = "published"
            return Versions(testers=v.testers, states=states)

        self._update_versions(change)

    def _mark(self, pk: str, sk: str, state: str, by: str, new: bool) -> None:
        at = iso_z(self.d.now())
        if new:
            try:
                self._put_new({"pk": pk, "sk": sk, "state": state, "by": by, "createdAt": at, "updatedAt": at})
                return
            except ClientError as error:
                if error.response.get("Error", {}).get("Code") != "TransactionCanceledException":
                    raise
        self._update_claim(pk, sk, {"state": state})

    def _update_claim(self, pk: str, sk: str, fields: Mapping[str, Any]) -> None:
        values = {**fields, "updatedAt": iso_z(self.d.now())}
        names = {f"#{k}": k for k in values}
        self.d.table.update_item(
            pk,
            sk,
            update="SET " + ", ".join(f"#{k} = :{k}" for k in values),
            names=names,
            values={f":{k}": v for k, v in values.items()},
        )

    def _allocate(self, pk: str, sk: str, planet_id: str, source: str, live: bool, by: str) -> dict[str, Any]:
        """<planetId>-a<n> from the counter and the claim in one transaction. A claim that got its version meanwhile
        (another run of the same revision) wins, and that version is used; a counter another level moved meanwhile is
        read again (CAS_ATTEMPTS times)."""
        for _ in range(CAS_ATTEMPTS):
            counter = self.d.table.get_item(COUNTER_PK, f"campaign#{planet_id}")
            n = int(counter["next"]) if counter is not None else 1
            version = f"{planet_id}-a{n}"
            started = iso_z(self.d.now())
            counter_cond = "#next = :n" if counter is not None else "attribute_not_exists(#pk)"
            counter_values: dict[str, Any] = {":one": n + 1}
            if counter is not None:
                counter_values[":n"] = n
            try:
                self.d.table.transact_write(
                    [
                        self.d.table.update_action(
                            COUNTER_PK,
                            f"campaign#{planet_id}",
                            update="SET #next = :one",
                            condition=counter_cond,
                            names={"#next": "next", **({"#pk": "pk"} if counter is None else {})},
                            values=counter_values,
                        ),
                        self.d.table.update_action(
                            pk,
                            sk,
                            update="SET #v = :v, #src = :src, #live = :live, #started = :started, #by = :by",
                            condition="attribute_not_exists(#v)",
                            names={
                                "#v": "campaignVersion",
                                "#src": "sourceVersion",
                                "#live": "live",
                                "#started": "startedAt",
                                "#by": "by",
                            },
                            values={":v": version, ":src": source, ":live": live, ":started": started, ":by": by},
                        ),
                    ]
                )
            except ClientError as error:
                if error.response.get("Error", {}).get("Code") != "TransactionCanceledException":
                    raise
                claim = self.d.table.get_item(pk, sk)
                if claim is not None and claim.get("campaignVersion"):
                    return claim
                continue  # the counter moved: read it again
            return {"campaignVersion": version, "startedAt": started, "sourceVersion": source}
        raise PublishRefused("BUSY", "the version counter kept changing; try again")

    def _result(self, claim: Mapping[str, Any]) -> dict[str, Any]:
        out = {"ok": True, "campaignVersion": claim.get("campaignVersion"), "live": bool(claim.get("live"))}
        if claim.get("liveRefused"):
            out["liveRefused"] = claim["liveRefused"]
        return out

    def _audit(self, action: str, by: str, item_id: str, **ids: Any) -> None:
        moment = self.d.now()
        audit_pk, audit_sk = audit_key(moment, item_id)
        self._put_new(audit_item(audit_pk, audit_sk, action, by, moment, **ids))

    def _put_new(self, item: Mapping[str, Any]) -> None:
        """One create-only put (a transaction of one: DynamoTable's only conditional put)."""
        self.d.table.transact_write(
            [self.d.table.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})]
        )

    def refuse(self, level_id: str, revision: int, refusal: PublishRefused) -> None:
        """Keep a publish refusal on its PUB# item, for the portal (a refusal before the item exists keeps nothing)."""
        if not isinstance(level_id, str) or not LEVEL_ID.fullmatch(level_id) or not isinstance(revision, int):
            return
        pk, sk = level_pk(level_id), _claim_sk(revision)
        if self.d.table.get_item(pk, sk) is None:
            return
        self._update_claim(pk, sk, {"state": "REFUSED", "code": refusal.code, "details": refusal.body()})
