"""Asset manifests in Python (Gate M, LD8; web/shared/src/manifest/manifest.ts is the player's copy): the same strict
shape, checked against the shared fixtures (contracts/fixtures/asset-manifest/cases.json), and the library pictures a
manifest uses. admin-api reads every published manifest so R37 never deletes a picture a manifest draws with: a
published manifest is immutable and pinned by runs, so its pictures are held for good.

    {"kind": "asset-manifest", "schema": 1, "version": "m1",
     "assets": {"<asset id>": {"frames": ["/assets/...png" | "/pictures/v1/lib-<32 hex>.png", ...],
                               "anchor": [x, y], "size": [w, h]}},
     "artSets": {"moon": {"<map role>": "<asset id>", ...}}}
"""

from __future__ import annotations

import math
import re
from collections.abc import Mapping
from typing import Any

from shared.bounds import VERSION

SCHEMA = 1
DEFAULT_VERSION = "m1"
DEFAULT_ART_SET = "moon"
# The map roles an art set fills: the keys of MAP_ART in web/shared/src/map/art.ts (a test compares the two).
ART_SET_ROLES = (
    "backdrop",
    "routeH",
    "routeDown",
    "routeUp",
    "cornerRightDown",
    "cornerDownRight",
    "cornerRightUp",
    "cornerUpRight",
    "portalEnd",
    "colonyEnd",
    "portal",
    "padEmpty",
    "padHover",
    "padSelected",
    "padClosed",
    "colonyHealthy",
    "colonyWorried",
    "colonyVeryWorried",
)
ASSET_ID = re.compile(r"^[a-z0-9-]{1,40}\Z")
URL = re.compile(r"^(?:/assets/[a-z0-9][a-z0-9/_.-]{0,150}\.(?:png|webp)|/pictures/v1/(lib-[0-9a-f]{32})\.png)\Z")
MAX_ASSETS = 400
MAX_FRAMES = 16
MAX_ART_SETS = 20


class ManifestInvalid(ValueError):
    """A manifest that does not have the shape; the message starts with where (manifest.assets.<id>...)."""


def _fail(path: str, why: str) -> ManifestInvalid:
    return ManifestInvalid(f"{path}: {why}")


def _exact(o: Mapping[str, Any], path: str, keys: tuple[str, ...]) -> None:
    for key in keys:
        if key not in o:
            raise _fail(path, f'"{key}" is missing')
    for key in o:
        if key not in keys:
            raise _fail(path, f'unknown key "{key}"')


def _pair(value: Any, path: str, *, whole: bool, low: float, high: float) -> None:
    ok = isinstance(value, list) and len(value) == 2
    for n in value if ok else []:
        number = isinstance(n, int | float) and not isinstance(n, bool) and math.isfinite(n)
        ok = ok and number and low <= n <= high and (not whole or float(n).is_integer())
    if not ok:
        raise _fail(path, "must be two numbers in range")


def parse_manifest(raw: Any, version: str | None = None) -> dict[str, Any]:
    """The manifest, unchanged, once its shape is right; ManifestInvalid otherwise."""
    if not isinstance(raw, dict):
        raise _fail("manifest", "must be an object")
    _exact(raw, "manifest", ("kind", "schema", "version", "assets", "artSets"))
    if raw["kind"] != "asset-manifest":
        raise _fail("manifest.kind", 'must be "asset-manifest"')
    if raw["schema"] != SCHEMA or isinstance(raw["schema"], bool):
        raise _fail("manifest.schema", f"must be {SCHEMA}")
    own = raw["version"]
    if not isinstance(own, str) or not VERSION.match(own):
        raise _fail("manifest.version", "is malformed")
    if version is not None and own != version:
        raise _fail("manifest.version", f"is {own}, expected {version}")
    assets = raw["assets"]
    if not isinstance(assets, dict) or len(assets) > MAX_ASSETS:
        raise _fail("manifest.assets", f"must be an object of at most {MAX_ASSETS}")
    for asset_id, entry in assets.items():
        at = f"manifest.assets.{asset_id}"
        if not ASSET_ID.match(asset_id):
            raise _fail(at, "bad asset ID")
        if not isinstance(entry, dict):
            raise _fail(at, "must be an object")
        _exact(entry, at, ("frames", "anchor", "size"))
        frames = entry["frames"]
        if not isinstance(frames, list) or not 1 <= len(frames) <= MAX_FRAMES:
            raise _fail(f"{at}.frames", f"must list 1 to {MAX_FRAMES} URLs")
        for url in frames:
            if not isinstance(url, str) or not URL.match(url) or ".." in url:
                raise _fail(f"{at}.frames", f"bad URL {url!r}")
        _pair(entry["anchor"], f"{at}.anchor", whole=False, low=0, high=1)
        _pair(entry["size"], f"{at}.size", whole=True, low=1, high=4096)
    sets = raw["artSets"]
    if not isinstance(sets, dict) or len(sets) > MAX_ART_SETS:
        raise _fail("manifest.artSets", f"must be an object of at most {MAX_ART_SETS}")
    if DEFAULT_ART_SET not in sets:
        raise _fail("manifest.artSets", f'must have the "{DEFAULT_ART_SET}" set')
    for set_id, art_set in sets.items():
        at = f"manifest.artSets.{set_id}"
        if not ASSET_ID.match(set_id) or not isinstance(art_set, dict):
            raise _fail(at, "bad set")
        _exact(art_set, at, ART_SET_ROLES)
        for role in ART_SET_ROLES:
            if not isinstance(art_set[role], str) or art_set[role] not in assets:
                raise _fail(f"{at}.{role}", "must name an asset in this manifest")
    return raw


def manifest_pictures(manifest: Mapping[str, Any]) -> set[str]:
    """Every library picture ID a (parsed) manifest draws with."""
    found: set[str] = set()
    for entry in manifest.get("assets", {}).values():
        for url in entry.get("frames", []):
            match = URL.match(url) if isinstance(url, str) else None
            if match is not None and match.group(1) is not None:
                found.add(match.group(1))
    return found
