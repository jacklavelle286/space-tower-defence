"""Endless slot blocks (Phase 54, M4-05; C24.6, F §3.6, spine S5.3).

A finite buffer, planned on the server only: blocks of K = 10 intervals, inside CHOOSE_ENDLESS and each endless
COMPLETE_WAVE while `plannedThrough < (wave - 1) + K`, so 10-19 intervals are always in hand. Each block is chosen from
the bank as published at that moment, for the run's pinned age band, excluding everything the run has already used:
a FIXED activity used anywhere in the run is never chosen again, and a template may give up to two new instances per
block (instances already in the run are never drawn again, plan.py `taken_instances`).

Per interval: one normal slot (N-<i>, reward the ruleset's endless learning reward, C11.2) and, for an interval ending
in 9, a meteor slot (M-<i>, the next power of the award rotation: it precedes the endless boss). A subject's unused
content running out falls back to the next subject with unused content, in the order maths, phonics, spelling; when
everything is used up the interval gets **no slot** and the child sees "You have done every activity we have for
now" (owner decision D-6), never a repeat. No slot is ever planned above interval 998: wave 999 ends the run (S5.3).
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from typing import Any

from shared.rules.next_phase import slot_id_for
from shared.selection.bank import Unit, fills, group_units
from shared.selection.plan import (
    SUBJECTS,
    BankNotReady,
    SlotPlan,
    SlotSpec,
    _clips,
    _Group,
    _presentation,
    _shown,
    _Templates,
)

K = 10
LAST_INTERVAL = 998
FALLBACK_ORDER = ("maths", "phonics", "spelling", "grammar")  # YG2: a band holds only its own subjects


def blocks_to_plan(planned_through: int, wave: int) -> list[tuple[int, int]]:
    """The (first, last) intervals of each block to plan now, given the run's plannedThrough and its wave after the op:
    while plannedThrough < (wave - 1) + K, one more block of K, never past interval 998."""
    blocks: list[tuple[int, int]] = []
    while planned_through < (wave - 1) + K and planned_through < LAST_INTERVAL:
        first = planned_through + 1
        last = min(planned_through + K, LAST_INTERVAL)
        blocks.append((first, last))
        planned_through = last
    return blocks


def endless_specs(
    first: int, last: int, *, reward: int, meteors_before: int, final_wave: int, rotation: Sequence[str]
) -> list[SlotSpec]:
    """Slot specs for intervals first..last in play order. `meteors_before` is how many meteor challenges the authored
    set had (the rotation continues after them); an interval ending in 9 past the authored set adds a meteor."""
    specs: list[SlotSpec] = []
    for interval in range(first, last + 1):
        specs.append(
            SlotSpec(
                slot_id=slot_id_for("NORMAL", interval),
                kind="NORMAL",
                interval=interval,
                subject=SUBJECTS[(interval - 1) % 3],
                reward={"credits": reward},
            )
        )
        if interval % 10 == 9 and interval > final_wave and rotation:
            # The rotation continues after the authored meteors: the n-th endless meteor (59, 69, ... after 50 waves).
            j = meteors_before + sum(1 for x in range(final_wave + 1, interval + 1) if x % 10 == 9)
            specs.append(
                SlotSpec(
                    slot_id=slot_id_for("METEOR", interval),
                    kind="METEOR",
                    interval=interval,
                    subject=SUBJECTS[(j - 1) % 3],
                    reward={"credits": 0, "powerId": rotation[(j - 1) % len(rotation)]},
                )
            )
    return specs


def choose_block(
    specs: Sequence[SlotSpec],
    units: Sequence[Unit],
    *,
    seed: str,
    label: str,
    used_activities: Iterable[str],
) -> list[tuple[SlotSpec, Unit]]:
    """One unit per spec that something unused can fill, slot by slot (a spec left unfilled gets no slot, never a
    repeat). `units` are the band's units (bank.read_units); `used_activities` the activity IDs of every slot the run
    already has. A FIXED activity used in the run is excluded; a template offers its two instance units again (new
    instances: build_block never draws one the run holds). Fallback: the slot's subject, then maths, phonics,
    spelling."""
    used = set(used_activities)
    available = [u for u in units if u.template or u.activity_id not in used]
    groups = {key: _Group(members, f"{seed}|{label}", *key) for key, members in group_units(available).items()}
    chosen_keys: set[str] = set()  # unit keys taken in this block (a BOTH unit sits in two groups)
    picks: list[tuple[SlotSpec, Unit]] = []
    for spec in specs:
        for subject in [spec.subject, *(s for s in FALLBACK_ORDER if s != spec.subject)]:
            group = groups.get((subject, spec.kind))
            unit = group.take(chosen_keys) if group is not None else None
            if unit is not None and fills(unit.category, spec.kind):
                picks.append((spec, unit))
                break
    return picks


def build_block(
    picks: Sequence[tuple[SlotSpec, Unit]],
    versions: Mapping[tuple[str, str], Mapping[str, Any]],
    *,
    seed: str,
    label: str,
    taken_instances: Iterable[str],
) -> list[SlotPlan]:
    """The plans for the picked units, once their published versions are read. A version gone since the bank was
    read, or a template whose instances the run has all used, leaves that interval without a slot."""
    block_seed = f"{seed}|{label}"
    templates = _Templates(taken_instances)
    plans: list[SlotPlan] = []
    for spec, unit in picks:
        version = versions.get((unit.activity_id, unit.version))
        if version is None or version.get("withdrawn"):
            continue
        try:
            resolved = templates.materialise(unit, version, spec.slot_id, block_seed) if unit.template else None
        except BankNotReady:
            continue
        plans.append(
            SlotPlan(
                slot_id=spec.slot_id,
                kind=spec.kind,
                interval=spec.interval,
                unit=unit,
                reward=dict(spec.reward),
                presentation=_presentation(spec.slot_id, _shown(version, resolved), block_seed),
                # The child met the demonstrations during the campaign, so an endless slot offers them on request.
                intro="ON_REQUEST" if isinstance(version.get("introductionContent"), Mapping) else None,
                clips=_clips(version),
                resolved=resolved,
            )
        )
    return plans
