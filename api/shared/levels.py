"""Level drafts for the level designer (Gate M, LD3; scope-level-designer.md §3.1).

A level is one map and, from LD4, the challenge waves and wave sets it owns. The admin keeps one draft per level in
the content table; the same JSON is the **level file** the operator downloads and uploads:

    {"kind": "level", "schema": 1, "levelId": "zigzag", "name": "Zigzag",
     "map": {"name", "grid", "route", "pads", "art": {"backdrop", "decorations"}},
     "challengeWaves": {}, "waveSets": {}}

From LD4 a level may also carry `waves` (the campaign's 50 waves: a level that owns the campaign has them and a
"campaign" wave set); its own challenge waves and wave sets are named "<levelId>" or "<levelId>-...", and every wave
set is played on the level's map (`mapId` = levelId). `design` holds the editor's keyframes and hand-set waves (wave
numbers); it never reaches the planet document.

Items (content table):

    pk LEVEL            sk <levelId>    header {levelId, name, status DRAFT, createdBy, createdAt, updatedAt}
    pk LEVEL#<levelId>  sk DRAFT        {levelId, level, draftRevision, updatedBy, updatedAt}
    AUDIT#<yyyy-mm>     <ts>#<levelId>  create and delete

admin-api checks the file's **shape** only (keys, types, sizes, IDs). The design rules (route art, pads, coverage) are
game-core's planetProblems, run live in the editor and again by the publisher (LD6), so the JavaScript rules exist
once. Pad IDs start with "<levelId>-", so two levels' pads can never clash on the planet (the bounds file's pad map is
flat). Level IDs are at most LEVEL_ID_MAX characters, leaving room for that prefix within keyId's 40.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import datetime
from typing import Any

from shared.content import iso_z, problem

LEVEL_PK = "LEVEL"
DRAFT_SK = "DRAFT"
LEVEL_ID_MAX = 36
LEVEL_ID = re.compile(r"^[a-z0-9-]{1,36}$")
KEY_ID = re.compile(r"^[a-z0-9-]{1,40}$")
LIBRARY_PICTURE = re.compile(r"^lib-[0-9a-f]{32}$")
DECORATION = re.compile(r"^deco-[a-z0-9-]{1,35}$")
NAME_MAX = 60
GRID = (20, 11)  # the battlefield is drawn at 20 x 11 tiles (game-core GRID_COLS, GRID_ROWS)
MAX_WAYPOINTS = 64  # shape only; the design rule (16) is game-core's
MAX_PADS = 32
MAX_DECORATIONS = 24
MAX_CAMPAIGN_WAVES = 50
WAVE_SET_KEYS = frozenset(
    {"mode", "name", "mapId", "waves", "meteorAfter", "startCredits", "colonyHealth", "classes", "padsOpenAsForWave",
     "presetPlacements"}
)  # fmt: skip

Problem = dict[str, str]


def level_pk(level_id: str) -> str:
    return f"{LEVEL_PK}#{level_id}"


def _name_ok(value: Any) -> bool:
    return isinstance(value, str) and 1 <= len(value) <= NAME_MAX and value == value.strip() and value.isprintable()


def _int_in(value: Any, low: int, high: int) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and low <= value <= high


def _cell_ok(value: Any) -> bool:
    return (
        isinstance(value, list)
        and len(value) == 2
        and _int_in(value[0], 0, GRID[0] - 1)
        and _int_in(value[1], 0, GRID[1] - 1)
    )


def _map_problems(level_id: str, m: Any) -> list[Problem]:
    at = "level.map"
    if not isinstance(m, Mapping):
        return [problem(at, "type")]
    out: list[Problem] = []
    keys = {"name", "grid", "route", "pads", "art"}
    out += [problem(f"{at}.{k}", "additionalProperties") for k in sorted(set(m) - keys)]
    out += [problem(f"{at}.{k}", "required") for k in sorted(keys - set(m))]
    if out:
        return out
    if not _name_ok(m["name"]):
        out.append(problem(f"{at}.name", "name"))
    if m["grid"] != {"cols": GRID[0], "rows": GRID[1]}:
        out.append(problem(f"{at}.grid", "grid"))
    route = m["route"]
    if not isinstance(route, list) or not 2 <= len(route) <= MAX_WAYPOINTS or not all(_cell_ok(p) for p in route):
        out.append(problem(f"{at}.route", "route"))
    pads = m["pads"]
    if not isinstance(pads, list) or not 1 <= len(pads) <= MAX_PADS:
        out.append(problem(f"{at}.pads", "pads"))
    else:
        seen: set[str] = set()
        for i, pad in enumerate(pads):
            where = f"{at}.pads[{i}]"
            if not isinstance(pad, Mapping) or set(pad) != {"id", "x", "y", "opensAfterWave"}:
                out.append(problem(where, "pad"))
                continue
            pad_id = pad["id"]
            if not isinstance(pad_id, str) or not KEY_ID.fullmatch(pad_id) or not pad_id.startswith(f"{level_id}-"):
                out.append(problem(f"{where}.id", "pad_id"))
            elif pad_id in seen:
                out.append(problem(f"{where}.id", "unique"))
            else:
                seen.add(pad_id)
            if not _cell_ok([pad["x"], pad["y"]]) or not _int_in(pad["opensAfterWave"], 0, 50):
                out.append(problem(where, "pad"))
    art = m["art"]
    if not isinstance(art, Mapping) or set(art) != {"backdrop", "decorations"}:
        out.append(problem(f"{at}.art", "art"))
        return out
    backdrop = art["backdrop"]
    if backdrop is not None and not (isinstance(backdrop, str) and LIBRARY_PICTURE.fullmatch(backdrop)):
        out.append(problem(f"{at}.art.backdrop", "picture"))
    decorations = art["decorations"]
    if not isinstance(decorations, list) or len(decorations) > MAX_DECORATIONS:
        out.append(problem(f"{at}.art.decorations", "decorations"))
        return out
    for i, d in enumerate(decorations):
        where = f"{at}.art.decorations[{i}]"
        ok = isinstance(d, Mapping) and set(d) == {"art", "x", "y"} and _cell_ok([d["x"], d["y"]])
        art_id = d.get("art") if isinstance(d, Mapping) else None
        if (
            not ok
            or not isinstance(art_id, str)
            or not (DECORATION.fullmatch(art_id) or LIBRARY_PICTURE.fullmatch(art_id))
        ):
            out.append(problem(where, "decoration"))
    return out


def level_problems(level: Any, level_id: str) -> list[Problem]:
    """Shape problems with a level file body for `level_id` (empty when it is well formed)."""
    if not isinstance(level, Mapping):
        return [problem("level", "type")]
    keys = {"kind", "schema", "levelId", "name", "map", "challengeWaves", "waveSets"}
    out = [problem(f"level.{k}", "additionalProperties") for k in sorted(set(level) - keys - {"waves", "design"})]
    out += [problem(f"level.{k}", "required") for k in sorted(keys - set(level))]
    if out:
        return out
    if level["kind"] != "level":
        out.append(problem("level.kind", "const"))
    if level["schema"] != 1:
        out.append(problem("level.schema", "const"))
    if level["levelId"] != level_id:
        out.append(problem("level.levelId", "matches_path"))
    if not _name_ok(level["name"]):
        out.append(problem("level.name", "name"))
    design = level.get("design", {})
    lists_ok = isinstance(design, Mapping) and set(design) <= {"keyframes", "overrides"}
    if not lists_ok or not all(
        isinstance(v, list) and all(_int_in(n, 1, MAX_CAMPAIGN_WAVES) for n in v) for v in design.values()
    ):
        out.append(problem("level.design", "design"))
    out += _wave_problems(level, level_id)
    out += _map_problems(level_id, level["map"])
    return out


def _owned_id(key: Any, level_id: str) -> bool:
    """A challenge wave or wave set the level owns is named after it ("<levelId>" or "<levelId>-..."), so two
    levels can never claim the same section of the planet."""
    return isinstance(key, str) and bool(KEY_ID.fullmatch(key)) and (key == level_id or key.startswith(f"{level_id}-"))


def _wave_body_ok(body: Any) -> bool:
    if not isinstance(body, Mapping) or not {"groups", "hpMult", "speedMult"} <= set(body) <= {
        "groups",
        "hpMult",
        "speedMult",
        "wave",
    }:
        return False
    groups = body["groups"]
    return isinstance(groups, list) and 1 <= len(groups) <= 20 and all(isinstance(g, Mapping) for g in groups)


def _wave_problems(level: Mapping[str, Any], level_id: str) -> list[Problem]:
    """Shape of the waves, challenge waves and wave sets (LD4). Their numbers are game-core's parser's to check."""
    out: list[Problem] = []
    waves = level.get("waves", [])
    if not isinstance(waves, list) or len(waves) > MAX_CAMPAIGN_WAVES or not all(_wave_body_ok(w) for w in waves):
        out.append(problem("level.waves", "waves"))
    challenge = level["challengeWaves"]
    if not isinstance(challenge, Mapping):
        out.append(problem("level.challengeWaves", "type"))
    else:
        for key, body in challenge.items():
            if not _owned_id(key, level_id):
                out.append(problem(f"level.challengeWaves.{key}", "owned_id"))
            elif not _wave_body_ok(body):
                out.append(problem(f"level.challengeWaves.{key}", "wave"))
    sets = level["waveSets"]
    if not isinstance(sets, Mapping):
        out.append(problem("level.waveSets", "type"))
        return out
    for key, ws in sets.items():
        where = f"level.waveSets.{key}"
        if key == "campaign":
            if not waves:  # a campaign level carries the campaign's waves
                out.append(problem(where, "campaign_without_waves"))
        elif not _owned_id(key, level_id):
            out.append(problem(where, "owned_id"))
        if not isinstance(ws, Mapping) or set(ws) != WAVE_SET_KEYS:
            out.append(problem(where, "wave_set"))
        elif ws["mapId"] != level_id:
            out.append(problem(f"{where}.mapId", "matches_level"))
    return out


def new_level_items(*, level: Mapping[str, Any], by: str, at: datetime) -> tuple[dict[str, Any], dict[str, Any]]:
    """A new level: header (status DRAFT) + draft (draftRevision 0) holding the level file body."""
    level_id = str(level["levelId"])
    now = iso_z(at)
    header = {
        "pk": LEVEL_PK,
        "sk": level_id,
        "levelId": level_id,
        "name": level["name"],
        "status": "DRAFT",
        "createdBy": by,
        "createdAt": now,
        "updatedAt": now,
    }
    draft = {
        "pk": level_pk(level_id),
        "sk": DRAFT_SK,
        "levelId": level_id,
        "level": dict(level),
        "draftRevision": 0,
        "updatedBy": by,
        "updatedAt": now,
    }
    return header, draft


def level_summary(header: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "levelId": header.get("sk"),
        "name": header.get("name"),
        "status": header.get("status"),
        "updatedAt": header.get("updatedAt"),
    }
