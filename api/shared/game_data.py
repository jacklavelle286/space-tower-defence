"""Released game data as `player-api` needs it for `GET /api/planets` (plan G §3 R6, spine S5.1).

The release publishes the game-data files on the player site bucket under GAME_DATA_PREFIX (game-data/README.md):

    <prefix>current.json                  {"rulesetVersion", "campaignVersion", "assetManifestVersion"?}: the versions
                                          new runs use (the publisher moves it; an absent manifest version is m1)
    <prefix>campaign/<version>.json       one planet document (create-only, never changes)
    <prefix>versions.json                 states per (campaign version, wave set) from the game-data publisher
                                          (Gate M, LD6; shared/versions.py); absent until the first admin publish

"Released planets" are the planets `current.json` names; today that is one campaignVersion, so one planet. Python reads
only the planet's id, name and wave-set headings (mode, name, length) and, for run creation (Phase 16), each wave
set's `presetPlacements` (the starting snapshot's placements); it never interprets waves.

Planet documents are immutable, so they are cached for the life of the container. `current.json` changes on a release,
so it is cached for CURRENT_TTL_SECONDS only. Anything missing or malformed raises GameDataUnavailable, and nothing is
cached, so the next call retries; the router answers it as 500 INTERNAL with only the class name logged.
"""

from __future__ import annotations

import json
import os
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import boto3
from botocore.exceptions import ClientError

from shared.asset_manifest import ManifestInvalid, parse_manifest
from shared.bounds import KEY_ID, VERSION
from shared.versions import Versions, VersionsUnavailable, parse_versions

BUCKET_ENV = "GAME_DATA_BUCKET"
PREFIX_ENV = "GAME_DATA_PREFIX"
DEFAULT_PREFIX = "game-data/"
CURRENT_TTL_SECONDS = 60.0  # [ASSUMPTION] a release shows up within a minute; the files are tiny
MAX_FILE_BYTES = 1024 * 1024
MODES = frozenset({"CAMPAIGN", "CHALLENGE"})
LIBRARY_ICON = re.compile(r"^lib-[0-9a-f]{32}\Z")
MAX_PLANETS = 20  # current.json schema 2 (game-core parseCurrent's limit too)
DEFAULT_MANIFEST_VERSION = "m1"  # Gate M, LD8: the asset manifest of the repo art (web/shared/src/manifest)


class GameDataUnavailable(Exception):
    """current.json or a planet document cannot be loaded: missing, unreadable or malformed."""


class _Missing(Exception):
    """An optional file (versions.json) does not exist."""


@dataclass(frozen=True)
class WaveSet:
    wave_set_id: str
    mode: str
    name: str
    final_wave: int
    preset_placements: tuple[dict[str, Any], ...] = ()


_PLACEMENT_KEYS = frozenset({"padId", "classId", "level", "targeting"})


def _placements(value: Any, where: str) -> tuple[dict[str, Any], ...]:
    """`presetPlacements` as snapshot placements. The shape only: game-core's parser checks pads and classes."""
    if value is None:
        return ()
    if not isinstance(value, list):
        raise GameDataUnavailable(f"{where}.presetPlacements is not a list")
    placements = []
    for entry in value:
        if not isinstance(entry, dict) or set(entry) != _PLACEMENT_KEYS:
            raise GameDataUnavailable(f"{where}.presetPlacements has a malformed entry")
        level = entry["level"]
        if (
            not isinstance(entry["padId"], str)
            or not isinstance(entry["classId"], str)
            or not isinstance(entry["targeting"], str)
            or isinstance(level, bool)
            or not isinstance(level, int)
        ):
            raise GameDataUnavailable(f"{where}.presetPlacements has a malformed entry")
        placements.append({key: entry[key] for key in ("padId", "classId", "level", "targeting")})
    return tuple(placements)


@dataclass(frozen=True)
class Planet:
    planet_id: str
    name: str
    campaign_version: str
    wave_sets: tuple[WaveSet, ...]
    icon: str | None = None  # the planet's library Planet picture (look.icon, LD10); None: the repo icon


def _parse_planet(data: Any, version: str) -> Planet:
    if not isinstance(data, dict) or data.get("kind") != "campaign" or data.get("version") != version:
        raise GameDataUnavailable(f"campaign {version}: not a campaign document for this version")
    planet_id, name, wave_sets = data.get("planetId"), data.get("name"), data.get("waveSets")
    if not isinstance(planet_id, str) or not KEY_ID.match(planet_id):
        raise GameDataUnavailable(f"campaign {version}: bad planetId")
    if not isinstance(name, str) or not name:
        raise GameDataUnavailable(f"campaign {version}: bad name")
    if not isinstance(wave_sets, dict) or not wave_sets:
        raise GameDataUnavailable(f"campaign {version}: no waveSets")
    parsed: list[WaveSet] = []
    for wave_set_id, ws in wave_sets.items():
        where = f"campaign {version}: waveSets.{wave_set_id}"
        if not KEY_ID.match(wave_set_id) or not isinstance(ws, dict):
            raise GameDataUnavailable(f"{where}: bad id or entry")
        mode, ws_name, waves = ws.get("mode"), ws.get("name"), ws.get("waves")
        if mode not in MODES or not isinstance(ws_name, str) or not ws_name:
            raise GameDataUnavailable(f"{where}: bad mode or name")
        if not isinstance(waves, list) or not waves:
            raise GameDataUnavailable(f"{where}: no waves")
        parsed.append(
            WaveSet(
                wave_set_id=wave_set_id,
                mode=mode,
                name=ws_name,
                final_wave=len(waves),
                preset_placements=_placements(ws.get("presetPlacements"), where),
            )
        )
    look = data.get("look")
    icon = look.get("icon") if isinstance(look, dict) else None
    if icon is not None and (not isinstance(icon, str) or not LIBRARY_ICON.match(icon)):
        raise GameDataUnavailable(f"campaign {version}: bad look.icon")
    return Planet(planet_id=planet_id, name=name, campaign_version=version, wave_sets=tuple(parsed), icon=icon)


class CurrentInvalid(ValueError):
    """current.json does not have the shape; the message starts with where (current.json.planets...)."""


def parse_current(data: Any) -> dict[str, Any]:
    """current.json, schema 1 or 2 (Gate M, LD9; game-core parseCurrent reads the same shared fixtures,
    contracts/fixtures/current/cases.json). Schema 1 names one campaign (planetId None: its document says which);
    schema 2 lists `planets` in unlock order and keeps the top-level campaignVersion equal to planets[0]'s for readers
    from before LD9."""
    if not isinstance(data, dict):
        raise CurrentInvalid("current.json: must be an object")
    two = "schema" in data
    required = {"rulesetVersion", "campaignVersion"} | ({"schema", "planets"} if two else set())
    allowed = required | {"assetManifestVersion"}
    for key in sorted(required):
        if key not in data:
            raise CurrentInvalid(f'current.json: "{key}" is missing')
    for key in data:
        if key not in allowed:
            raise CurrentInvalid(f'current.json: unknown key "{key}"')
    out: dict[str, Any] = {}
    for name in ("rulesetVersion", "campaignVersion", "assetManifestVersion"):
        value = data.get(name)
        if value is None and name == "assetManifestVersion":
            continue  # optional (LD8): absent means m1
        if not isinstance(value, str) or not VERSION.match(value):
            raise CurrentInvalid(f"current.json.{name}: is malformed")
        out[name] = value
    out["planets"] = [{"planetId": None, "campaignVersion": out["campaignVersion"]}]
    if not two:
        return out
    if data["schema"] != 2 or isinstance(data["schema"], bool):
        raise CurrentInvalid("current.json.schema: must be 2 when present")
    listed = data["planets"]
    if not isinstance(listed, list) or not 1 <= len(listed) <= MAX_PLANETS:
        raise CurrentInvalid(f"current.json.planets: must list 1 to {MAX_PLANETS} planets")
    planets, seen = [], set()
    for i, entry in enumerate(listed):
        at = f"current.json.planets[{i}]"
        if not isinstance(entry, dict) or set(entry) != {"planetId", "campaignVersion"}:
            raise CurrentInvalid(f"{at}: must be exactly planetId and campaignVersion")
        planet_id, version = entry["planetId"], entry["campaignVersion"]
        if not isinstance(planet_id, str) or not KEY_ID.match(planet_id) or planet_id in seen:
            raise CurrentInvalid(f"{at}.planetId: malformed or listed twice")
        if not isinstance(version, str) or not VERSION.match(version):
            raise CurrentInvalid(f"{at}.campaignVersion: is malformed")
        seen.add(planet_id)
        planets.append({"planetId": planet_id, "campaignVersion": version})
    if planets[0]["campaignVersion"] != out["campaignVersion"]:
        raise CurrentInvalid("current.json.campaignVersion: must equal planets[0].campaignVersion")
    out["planets"] = planets
    return out


def current_body(pointers: dict[str, Any]) -> dict[str, Any]:
    """The current.json to write for normalised pointers: schema 1 while every planet is the one schema 1 can name
    (so readers from before LD9 keep working), schema 2 once a planet is named."""
    head = {"rulesetVersion": pointers["rulesetVersion"], "campaignVersion": pointers["planets"][0]["campaignVersion"]}
    if pointers.get("assetManifestVersion") is not None:
        head["assetManifestVersion"] = pointers["assetManifestVersion"]
    if len(pointers["planets"]) == 1 and pointers["planets"][0]["planetId"] is None:
        return head
    return {"schema": 2, **head, "planets": [dict(p) for p in pointers["planets"]]}


class GameDataReader:
    """Reads and caches the released game data from one bucket and prefix. Tests pass an s3 client and a clock."""

    def __init__(
        self,
        *,
        bucket: str,
        prefix: str = DEFAULT_PREFIX,
        s3: Any = None,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.bucket = bucket
        self.prefix = prefix
        self._s3 = s3
        self._clock = clock
        self._current: tuple[float, dict[str, Any]] | None = None
        self._versions: tuple[float, Versions] | None = None
        self._planets: dict[str, Planet] = {}
        self._documents: dict[str, dict[str, Any]] = {}
        self._manifests: dict[str, dict[str, Any]] = {}

    def _client(self) -> Any:
        if self._s3 is None:
            self._s3 = boto3.client("s3")
        return self._s3

    def _get_json(self, key: str, *, missing_ok: bool = False) -> Any:
        if not self.bucket:
            raise GameDataUnavailable(f"no bucket: set {BUCKET_ENV}")
        try:
            response = self._client().get_object(Bucket=self.bucket, Key=key)
            body = response["Body"].read(MAX_FILE_BYTES + 1)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if missing_ok and code == "NoSuchKey":  # 404 needs s3:ListBucket on the prefix (infrastructure/main)
                raise _Missing from exc
            raise GameDataUnavailable(f"s3://{self.bucket}/{key}: {code or exc}") from exc
        if len(body) > MAX_FILE_BYTES:
            raise GameDataUnavailable(f"s3://{self.bucket}/{key} is too large")
        try:
            return json.loads(body)
        except ValueError as exc:
            raise GameDataUnavailable(f"s3://{self.bucket}/{key} is not JSON") from exc

    def current(self) -> dict[str, Any]:
        """current.json, normalised by parse_current (cached for CURRENT_TTL_SECONDS): rulesetVersion,
        campaignVersion (the first planet's), assetManifestVersion when named, and planets in unlock order."""
        now = self._clock()
        if self._current is not None and now - self._current[0] < CURRENT_TTL_SECONDS:
            return self._current[1]
        try:
            pointers = parse_current(self._get_json(f"{self.prefix}current.json"))
        except CurrentInvalid as exc:
            raise GameDataUnavailable(str(exc)) from exc
        self._current = (now, pointers)
        return pointers

    def versions(self) -> Versions:
        """The publisher's states (cached for CURRENT_TTL_SECONDS, like current.json). No file: no states, so every
        version is published. A malformed file raises GameDataUnavailable (fail closed)."""
        now = self._clock()
        if self._versions is not None and now - self._versions[0] < CURRENT_TTL_SECONDS:
            return self._versions[1]
        key = f"{self.prefix}versions.json"
        try:
            versions = parse_versions(self._get_json(key, missing_ok=True))
        except _Missing:
            versions = Versions()
        except VersionsUnavailable as exc:
            raise GameDataUnavailable(str(exc)) from exc
        self._versions = (now, versions)
        return versions

    def planet(self, campaign_version: str) -> Planet:
        """One planet document's headings (cached: published versions never change)."""
        cached = self._planets.get(campaign_version)
        if cached is not None:
            return cached
        planet = _parse_planet(self.document(campaign_version), campaign_version)
        self._planets[campaign_version] = planet
        return planet

    def document(self, campaign_version: str) -> dict[str, Any]:
        """One planet document as published (cached: published versions never change). admin-api sends it to the
        level designer, which merges levels into it (Gate M, LD7). Callers must not change it."""
        cached = self._documents.get(campaign_version)
        if cached is not None:
            return cached
        if not isinstance(campaign_version, str) or not VERSION.match(campaign_version):
            raise GameDataUnavailable("bad campaignVersion")
        data = self._get_json(f"{self.prefix}campaign/{campaign_version}.json")
        if not isinstance(data, dict) or data.get("version") != campaign_version:
            raise GameDataUnavailable(f"campaign {campaign_version}: not the document for this version")
        self._documents[campaign_version] = data
        return data

    def asset_manifests(self) -> list[dict[str, Any]]:
        """Every published asset manifest (Gate M, LD8), parsed; cached by version, since a published one never
        changes. One that cannot be read or parsed raises GameDataUnavailable: the delete guard fails closed."""
        if not self.bucket:
            raise GameDataUnavailable(f"no bucket: set {BUCKET_ENV}")
        prefix = f"{self.prefix}asset-manifest/"
        try:
            pages = self._client().get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=prefix)
            names = [entry["Key"][len(prefix) :] for page in pages for entry in page.get("Contents", [])]
        except ClientError as exc:
            raise GameDataUnavailable(f"s3://{self.bucket}/{prefix}: list failed") from exc
        out = []
        for name in sorted(names):
            version = name.removesuffix(".json")
            if not name.endswith(".json") or not VERSION.match(version):
                continue
            if version not in self._manifests:
                try:
                    self._manifests[version] = parse_manifest(self._get_json(prefix + name), version)
                except ManifestInvalid as exc:
                    raise GameDataUnavailable(f"asset manifest {version}: {exc}") from exc
            out.append(self._manifests[version])
        return out

    def campaign_versions(self) -> list[tuple[str, datetime]]:
        """Every published planet document's version and when it was written, newest first (admin-api's Versions
        panel, LD7). Not cached: a publish adds one. Needs s3:ListBucket on the prefix."""
        if not self.bucket:
            raise GameDataUnavailable(f"no bucket: set {BUCKET_ENV}")
        out: list[tuple[str, datetime]] = []
        try:
            pages = (
                self._client()
                .get_paginator("list_objects_v2")
                .paginate(Bucket=self.bucket, Prefix=f"{self.prefix}campaign/")
            )
            for page in pages:
                for entry in page.get("Contents", []):
                    name = entry["Key"].rsplit("/", 1)[-1]
                    version = name.removesuffix(".json")
                    if name.endswith(".json") and VERSION.match(version):
                        out.append((version, entry["LastModified"]))
        except ClientError as exc:
            raise GameDataUnavailable(f"s3://{self.bucket}/{self.prefix}campaign/: list failed") from exc
        return sorted(out, key=lambda v: (v[1], v[0]), reverse=True)

    def released_planets(self) -> list[Planet]:
        """The planets new runs can use, in unlock order (Gate M, LD9: every planet current.json lists). A listed
        planet whose document is another planet's is unavailable, never shown under the wrong name."""
        planets = []
        for listed in self.current()["planets"]:
            planet = self.planet(listed["campaignVersion"])
            if listed["planetId"] is not None and listed["planetId"] != planet.planet_id:
                raise GameDataUnavailable(f"current.json lists {planet.campaign_version} as {listed['planetId']}")
            planets.append(planet)
        return planets


def reader_from_env() -> GameDataReader:
    """A reader for the bucket and prefix the Lambda's environment names (H §H.4.4)."""
    return GameDataReader(bucket=os.environ.get(BUCKET_ENV, ""), prefix=os.environ.get(PREFIX_ENV, DEFAULT_PREFIX))
