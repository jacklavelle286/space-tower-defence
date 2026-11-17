"""Aliens made in the portal (Gate M, AM1; scope-asset-kinds-and-makers.md §3.2, ADR-0041): the draft items, their
checks, and what a published alien adds to the ruleset and the asset manifest.

    pk ALIEN  sk <alienId>   {alienId, name, hp, speed, leak, bounty, art: [6 approved Alien picture IDs] | [],
                              status DRAFT | PUBLISHED, publish?: {state QUEUED | RUNNING | DONE | REFUSED, code?,
                              message?, ticks?, updatedAt}, rulesetVersion?, assetManifestVersion?, createdAt,
                              createdBy, updatedAt, publishedAt?}

A made alien is a plain alien (no traits: the stats mechanics 1 has) inside limits.json `alienMaker`. Its walk is six
approved Alien pictures, made in the portal from one drawing by the shared animator. Publishing it (the publisher's
`publishAlien`) writes a ruleset `<release ruleset>-a<n>` with `aliens.<alienId>` added, and an asset manifest `m<n>`
with `alien-<alienId>-walk` added; a published alien is fixed.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from shared.content import LIMITS, plain, problem
from shared.pictures import is_picture_id

ALIEN_PK = "ALIEN"
_RULES: Mapping[str, Any] = LIMITS["alienMaker"]
ALIEN_ID = re.compile(str(_RULES["idPattern"]).removesuffix("$") + r"\Z")
NAME_MAX: int = int(_RULES["nameMaxLength"])
FRAMES: int = int(_RULES["frames"])
SPEED_STEP = Decimal(str(_RULES["speedStep"]))
STATS = ("hp", "speed", "leak", "bounty")
WHOLE = ("hp", "leak", "bounty")
STATUSES = ("DRAFT", "PUBLISHED")
# The manifest entry a made alien's walk copies its anchor and display size from (every alien is drawn the same way,
# web/player/src/game/assets.ts), and the size it falls back to.
TEMPLATE_ASSET = "alien-blob-walk"
DEFAULT_ANCHOR = [0.5, 1.0]
DEFAULT_SIZE = [128, 128]
# A ruleset the publisher wrote ("r4-a2") and the repository ruleset it grew from ("r4").
_MADE_RULESET = re.compile(r"^(?P<family>.+)-a\d+\Z")


def asset_id(alien_id: str) -> str:
    """The manifest asset a made alien walks with (web/player/src/game/assets.ts madeAlienArt)."""
    return f"alien-{alien_id}-walk"


def ruleset_family(version: str) -> str:
    """The release ruleset a version grew from: "r4" for "r4" and for "r4-a3"."""
    match = _MADE_RULESET.match(version)
    return match.group("family") if match else version


def name_ok(value: Any) -> bool:
    """A name children read: 1 to NAME_MAX characters, trimmed, printable, no markup."""
    return (
        isinstance(value, str)
        and 1 <= len(value) <= NAME_MAX
        and value == value.strip()
        and value.isprintable()
        and not any(ch in value for ch in "<>{}")
    )


def _number(value: Any) -> Decimal | None:
    if isinstance(value, bool) or not isinstance(value, int | float | Decimal):
        return None
    try:
        return Decimal(str(value))
    except ArithmeticError:
        return None


def stat_problems(body: Mapping[str, Any]) -> list[dict[str, str]]:
    """Each stat inside its range; hp, leak and bounty whole; speed in steps of speedStep."""
    problems = []
    for stat in STATS:
        value = _number(body.get(stat))
        low, high = Decimal(str(_RULES[stat]["min"])), Decimal(str(_RULES[stat]["max"]))
        if value is None or not value.is_finite():
            problems.append(problem(stat, "type"))
        elif stat in WHOLE and value != value.to_integral_value():
            problems.append(problem(stat, "whole"))
        elif stat == "speed" and value % SPEED_STEP != 0:
            problems.append(problem(stat, "step"))
        elif not low <= value <= high:
            problems.append(problem(stat, "range"))
    return problems


def art_problems(art: Any) -> list[dict[str, str]]:
    """No walk yet, or exactly FRAMES distinct library picture IDs (approval and kind are checked against the table)."""
    if not isinstance(art, list) or (art and len(art) != FRAMES):
        return [problem("art", "frames")]
    if not all(is_picture_id(p) for p in art) or len(set(art)) != len(art):
        return [problem("art", "pattern")]
    return []


def stored_stats(body: Mapping[str, Any]) -> dict[str, Any]:
    """The stats as DynamoDB keeps them (Decimal; whole numbers as such)."""
    out: dict[str, Any] = {}
    for stat in STATS:
        value = Decimal(str(body[stat]))
        out[stat] = value.to_integral_value() if stat in WHOLE else value.quantize(SPEED_STEP)
    return out


def ruleset_entry(item: Mapping[str, Any], mechanics: int) -> dict[str, Any]:
    """The alien as a ruleset entry: mechanics 3 and later require `traits` (a made alien has none)."""
    entry: dict[str, Any] = {"name": str(item["name"]), **{s: plain(item[s]) for s in STATS}}
    entry["speed"] = float(entry["speed"])
    if mechanics >= 3:
        entry["traits"] = {}
    return entry


def manifest_entry(item: Mapping[str, Any], template: Mapping[str, Any] | None) -> dict[str, Any]:
    """The walk as a manifest asset: the six approved pictures, drawn like every other alien."""
    return {
        "frames": [f"/pictures/v1/{p}.png" for p in item["art"]],
        "anchor": list(template["anchor"]) if template else DEFAULT_ANCHOR,
        "size": list(template["size"]) if template else DEFAULT_SIZE,
    }


def alien_summary(item: Mapping[str, Any]) -> dict[str, Any]:
    out = {
        "alienId": item.get("alienId"),
        "name": item.get("name"),
        **{s: plain(item.get(s)) for s in STATS},
        "art": list(item.get("art") or []),
        "status": item.get("status"),
    }
    for key in ("rulesetVersion", "assetManifestVersion", "publishedAt", "updatedAt"):
        if item.get(key) is not None:
            out[key] = item[key]
    publish = item.get("publish")
    if isinstance(publish, Mapping):
        out["publish"] = {k: plain(v) for k, v in publish.items() if k != "ticks"}
    return out
