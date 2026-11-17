"""The planet registry (Gate M, LD10; scope-level-designer.md §3.2 tier 2): planets made in the portal before and after
they are released. luna-1 came from the repository and has no registry item; every released planet is in
current.json (shared/game_data.py), in unlock order, and a release only ever appends.

    pk PLANET  sk <planetId>   {planetId, name, icon, artSet, backdrop, status DRAFT | RELEASED, latestVersion?,
                                order?, createdAt, createdBy, updatedAt, releasedAt?}

A level draft belongs to one planet (the LEVEL header's `planetId`; absent means luna-1, as every level before LD10).
A planet's **head** is the version a draft of it is merged into and checked against: its live version once released,
else its newest published (preview) version, else `<planetId>-new`, the empty starting document: no maps, no waves,
no wave sets, the registry's name and look. The first level published onto `-new` must own the campaign (a planet
document needs at least one wave), so a new planet starts from its 50-wave campaign.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

PLANET_PK = "PLANET"
DEFAULT_PLANET = "luna-1"  # the repository planet; a level header without planetId belongs to it
NEW_SUFFIX = "-new"
# Planet versions are "<planetId>-a<n>" within the version pattern's 40 characters, so a planet ID is at most 34.
PLANET_ID = re.compile(r"^[a-z][a-z0-9-]{0,32}[a-z0-9]\Z")
ART_SET = re.compile(r"^[a-z0-9-]{1,40}\Z")
NAME_MAX = 40
STATUSES = ("DRAFT", "RELEASED")
CAMPAIGN_WAVES = 50  # a planet is released only with its full campaign (prompt.md: fifty authored campaign waves)


def new_version_token(planet_id: str) -> str:
    """The head of a planet with no published version yet."""
    return f"{planet_id}{NEW_SUFFIX}"


def is_new_token(version: str, planet_id: str) -> bool:
    return version == new_version_token(planet_id)


def look_of(item: Mapping[str, Any]) -> dict[str, Any]:
    """The planet document's `look` from a registry item."""
    return {"icon": item.get("icon"), "artSet": str(item.get("artSet") or "moon")}


def empty_planet(item: Mapping[str, Any]) -> dict[str, Any]:
    """The starting document of a planet with no published version (schema 2, nothing in it yet)."""
    planet_id = str(item["planetId"])
    return {
        "kind": "campaign",
        "schema": 2,
        "version": new_version_token(planet_id),
        "planetId": planet_id,
        "name": str(item["name"]),
        "look": look_of(item),
        "maps": {},
        "waves": [],
        "challengeWaves": {},
        "waveSets": {},
    }


def with_registry_look(doc: Mapping[str, Any], item: Mapping[str, Any]) -> dict[str, Any]:
    """An unreleased planet's newest document with the registry's current name and look (edits made since it was
    published apply to the next version)."""
    return {**doc, "name": str(item["name"]), "look": look_of(item)}


def planet_summary(item: Mapping[str, Any]) -> dict[str, Any]:
    out = {
        "planetId": item.get("planetId"),
        "name": item.get("name"),
        "icon": item.get("icon"),
        "artSet": item.get("artSet") or "moon",
        "backdrop": item.get("backdrop"),
        "status": item.get("status"),
    }
    for key in ("latestVersion", "order", "releasedAt", "updatedAt"):
        if item.get(key) is not None:
            out[key] = item[key] if key != "order" else int(item[key])
    return out
