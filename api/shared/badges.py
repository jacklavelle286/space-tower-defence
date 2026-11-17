"""C12 badges (Phase 52, M4-03; spine S2, S3.2, S8.1; F §10.2).

The server derives every badge from data in an accepted COMPLETE_WAVE: the client never sends a badge ID (spine S2).
Each badge is a threshold re-evaluated on every COMPLETE_WAVE, not a one-off event, so after a campaign-progress reset
(`badges = {}`) a still-running run re-earns what it has reached (F §10.2). The award is a map set-add with
`if_not_exists`, so applying it twice changes nothing (spine S7.1).

Campaign-progress badges only on CAMPAIGN runs; "any" badges on any run; challenge badges (the final wave of a named
challenge wave set) arrive with the challenges (Phase 53). A CHALLENGE run's COMPLETE_WAVE may write PROFILE `badges`
only, never planets or eligibility (spine S3.2). No learning-outcome badges in v1 (C12 notes).

Why code and not the ruleset (C15 lists "badge definitions" in the ruleset): each badge is a rule over the run and its
snapshots, ruleset r3 is published without them, and the conditions are C12's table exactly. The names live in the
player's copy. [PROPOSAL]
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

ALL_CLASSES = frozenset({"nova", "pip", "juno", "orion", "mira", "sol"})
BOSS_WAVES = frozenset({10, 20, 30, 40, 50})
# (badge, the highestCompletedWave that earns it) for CAMPAIGN runs, C12.
THRESHOLDS: tuple[tuple[str, int], ...] = (
    ("first-steps", 1),
    ("boss-1", 10),
    ("boss-2", 20),
    ("boss-3", 30),
    ("boss-4", 40),
    ("endless-60", 60),
)
# The campaign badge is per planet: campaign-<planetId>, committed in the COMPLETE_WAVE that completes the campaign.


def earned(run: Mapping[str, Any], stored: Mapping[str, Any] | None, new_state: Mapping[str, Any]) -> list[str]:
    """Every badge whose C12 condition holds after this COMPLETE_WAVE, in a fixed order. `run` is the stored RUN item
    (mode, planetId, stage), `stored` the wave-start snapshot (in IN_WAVE the stored snapshot is the wave-start one,
    spine S4), `new_state` the reducer's state after the op (highestCompletedWave, snapshot, campaignCompleted)."""
    badges: list[str] = []
    wave = int(new_state["highestCompletedWave"])
    after = new_state.get("snapshot") or {}
    if run.get("mode") == "CAMPAIGN":
        badges += [badge for badge, threshold in THRESHOLDS if wave >= threshold]
        if new_state.get("campaignCompleted"):
            badges.append(f"campaign-{run.get('planetId')}")
        start_health = (stored or {}).get("colony", {}).get("health")
        end_health = (after.get("colony") or {}).get("health")
        if (
            run.get("stage") == "AUTHORED"
            and wave in BOSS_WAVES
            and isinstance(start_health, int)
            and isinstance(end_health, int)
            and end_health >= start_health
        ):
            badges.append("safe-and-sound")
    placements = after.get("placements") or []
    if {p.get("classId") for p in placements} >= ALL_CLASSES:
        badges.append("full-crew")
    if any(p.get("level") == 3 for p in placements):
        badges.append("top-team")
    return badges
