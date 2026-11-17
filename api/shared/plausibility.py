"""Plausibility bounds: step (h) of the per-op order (spine S6, F §6.1; Phase 30, M2-07).

Python mirror of web/game-core/src/rules/plausibility.ts: same rules, same problems, same order.
contracts/fixtures/plausibility/vectors.json checks that both languages agree (test_plausibility.py and
plausibility.test.ts read the same file). Anti-nonsense, not anti-cheat (E.10): the bounds limit what a checkpoint can
gain; they do not try to prove the wave was played.

  value(s) = s.credits + invested(s.placements)        invested: each placement's cumulative cost for its level
  SAVE_PREP, START_WAVE    value(payload) <= value(stored)
  COMPLETE_WAVE(w)         value(payload) <= value(stored) + maxBounty[w]; 0 < colony.health <= maxHealth;
                           0 <= colony.shield <= shieldCap; every power count <= the stored count
  placements (all three)   pads unique and open; class unlocked; per-class deploy cap; targeting open at the level

Pads: a CHALLENGE fixes its open pads (padsOpenAsForWave); a CAMPAIGN pad is open once its opensAfterWave is at most the
highest completed wave (C3.3), or when the wave set opens it from the start. Classes: a CAMPAIGN class is unlocked once
its unlockAfterWave is at most the highest completed wave (C5.9). Unknown pads, classes, levels and modes were refused
by step (g). An endless COMPLETE_WAVE has no maxBounty yet and is refused until Phase 54 [ASSUMPTION: fail closed].

A problem is {"field", "rule"}; values are never copied (G §1.2).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

CHECKPOINT_OPS = frozenset({"SAVE_PREP", "START_WAVE", "COMPLETE_WAVE"})


def _utf16_sorted(keys: Any) -> list[str]:
    """Sorted by UTF-16 code unit, as JavaScript's Array.prototype.sort (shared.rules.schema does the same)."""
    return sorted(keys, key=lambda k: k.encode("utf-16-be"))


def snapshot_value(bounds: Mapping[str, Any], credits: int, placements: Sequence[Mapping[str, Any]]) -> int:
    """credits + everything paid for the placements' levels (spine S6)."""
    value = credits
    for p in placements:
        cls = bounds["classes"].get(p["classId"])
        costs = cls["cumulativeCosts"] if cls is not None else []
        level = p["level"]
        value += costs[level - 1] if 1 <= level <= len(costs) else 0
    return value


def _placement_problems(
    bounds: Mapping[str, Any], run: Mapping[str, Any], placements: Sequence[Mapping[str, Any]]
) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    wave_set = bounds["waveSets"].get(run["waveSetId"])
    if wave_set is None:
        return out
    campaign = wave_set["mode"] == "CAMPAIGN"
    hcw = run["highestCompletedWave"]
    open_through = max(wave_set["padsOpenAsForWave"] - 1, hcw) if campaign else wave_set["padsOpenAsForWave"] - 1
    seen: set[str] = set()
    counts: dict[str, int] = {}
    for i, p in enumerate(placements):
        at = f"op.payload.placements[{i}]"
        if p["padId"] in seen:
            out.append({"field": f"{at}.padId", "rule": "unique"})
        seen.add(p["padId"])
        pad = bounds["pads"].get(p["padId"])
        if pad is not None and pad["opensAfterWave"] > open_through:
            out.append({"field": f"{at}.padId", "rule": "padClosed"})
        cls = bounds["classes"].get(p["classId"])
        if cls is None:
            continue
        counts[p["classId"]] = counts.get(p["classId"], 0) + 1
        if campaign and cls["unlockAfterWave"] > hcw:
            out.append({"field": f"{at}.classId", "rule": "classLocked"})
        if p["level"] < cls.get("targetingFromLevel", {}).get(p["targeting"], 1):
            out.append({"field": f"{at}.targeting", "rule": "targetingLevel"})
    for class_id in _utf16_sorted(counts):
        cap = bounds["classes"][class_id]["deployCap"]
        if cap is not None and counts[class_id] > cap:
            out.append({"field": "op.payload.placements", "rule": "deployCap"})
    return out


def plausibility_problems(
    bounds: Mapping[str, Any], run: Mapping[str, Any], op: Mapping[str, Any]
) -> list[dict[str, str]]:
    """Every bounds problem with `op` against the stored run ({waveSetId, highestCompletedWave, snapshot}); empty
    when it is plausible or not a checkpoint op. `op` has already passed the schema and pinned-value steps."""
    if op["type"] not in CHECKPOINT_OPS:
        return []
    payload = op["payload"]
    out = _placement_problems(bounds, run, payload["placements"])
    stored = run["snapshot"]
    before = snapshot_value(bounds, stored["credits"], stored["placements"])
    after = snapshot_value(bounds, payload["credits"], payload["placements"])
    if op["type"] != "COMPLETE_WAVE":
        if after > before:
            out.append({"field": "op.payload.credits", "rule": "value"})
        return out
    max_bounty = bounds["waveSets"].get(run["waveSetId"], {}).get("maxBounty", [])
    wave = payload["wave"]
    if not 1 <= wave <= len(max_bounty):
        out.append({"field": "op.payload.wave", "rule": "maxBounty"})
    elif after > before + max_bounty[wave - 1]:
        out.append({"field": "op.payload.credits", "rule": "value"})
    colony = payload["colony"]
    if colony["health"] <= 0 or colony["health"] > bounds["colony"]["maxHealth"]:
        out.append({"field": "op.payload.colony.health", "rule": "health"})
    if colony["shield"] < 0 or colony["shield"] > bounds["colony"]["shieldCap"]:
        out.append({"field": "op.payload.colony.shield", "rule": "shield"})
    held = stored.get("powers") or {}
    for power_id in _utf16_sorted(payload["powers"]):
        if payload["powers"][power_id] > held.get(power_id, 0):
            out.append({"field": f"op.payload.powers.{power_id}", "rule": "power"})
    return out
