"""Released game data as `player-api` needs it for `GET /api/planets` (plan G §3 R6, spine S5.1).

The release publishes the game-data files on the player site bucket under GAME_DATA_PREFIX (game-data/README.md):

    <prefix>current.json                  {"rulesetVersion", "campaignVersion"}: the versions new runs use (overwritten)
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
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import boto3
from botocore.exceptions import ClientError

from shared.bounds import KEY_ID, VERSION
from shared.versions import Versions, VersionsUnavailable, parse_versions

BUCKET_ENV = "GAME_DATA_BUCKET"
PREFIX_ENV = "GAME_DATA_PREFIX"
DEFAULT_PREFIX = "game-data/"
CURRENT_TTL_SECONDS = 60.0  # [ASSUMPTION] a release shows up within a minute; the files are tiny
MAX_FILE_BYTES = 1024 * 1024
MODES = frozenset({"CAMPAIGN", "CHALLENGE"})


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
    return Planet(planet_id=planet_id, name=name, campaign_version=version, wave_sets=tuple(parsed))


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
        self._current: tuple[float, dict[str, str]] | None = None
        self._versions: tuple[float, Versions] | None = None
        self._planets: dict[str, Planet] = {}
        self._documents: dict[str, dict[str, Any]] = {}

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

    def current(self) -> dict[str, str]:
        """{"rulesetVersion", "campaignVersion"} from current.json (cached for CURRENT_TTL_SECONDS)."""
        now = self._clock()
        if self._current is not None and now - self._current[0] < CURRENT_TTL_SECONDS:
            return self._current[1]
        data = self._get_json(f"{self.prefix}current.json")
        if not isinstance(data, dict):
            raise GameDataUnavailable("current.json is not an object")
        versions: dict[str, str] = {}
        for name in ("rulesetVersion", "campaignVersion"):
            value = data.get(name)
            if not isinstance(value, str) or not VERSION.match(value):
                raise GameDataUnavailable(f"current.json: bad {name}")
            versions[name] = value
        self._current = (now, versions)
        return versions

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
        """The planets new runs can use, in order (one today: the campaignVersion in current.json)."""
        return [self.planet(self.current()["campaignVersion"])]


def reader_from_env() -> GameDataReader:
    """A reader for the bucket and prefix the Lambda's environment names (H §H.4.4)."""
    return GameDataReader(bucket=os.environ.get(BUCKET_ENV, ""), prefix=os.environ.get(PREFIX_ENV, DEFAULT_PREFIX))
