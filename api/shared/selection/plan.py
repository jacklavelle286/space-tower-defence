"""Choosing a run's activities at creation (C24, spine S5.3; M1-16 with the Milestone 1 configuration).

`plan_slots` is pure: the seed, the age band's units, the chosen versions and the wave set in, the slot plan out.
The same inputs always give the same plan (C24.9 property 1), so a test can pin a seed and check the exact result.

The slot list (C24.2): `N-001` ... `N-(finalWave - 1)`, normal activity k with subject rotation[(k - 1) mod 3]; then
`M-<p>` for each p in the wave set's `meteorAfter`, meteor j (1-based, in that order) with subject
rotation[(j - 1) mod 3]. Rotation = maths, phonics, spelling.

For each slot, in play order (by interval, the normal slot before the meteor), the unit comes from its group
(subject x NORMAL/METEOR) by round-robin over the group's topics. Topic order and the units inside each topic are
shuffled with the seed (C24.4, C24.5). A unit is used at most once per run.

An activity whose rewardCategory is BOTH (2026-11-16) is a member of both groups of its subject, NORMAL and METEOR.
The groups share one used set: a group passes over a unit another group has already taken, so a BOTH unit still fills
at most one slot per run. A group's size (for its threshold) counts its BOTH units. The reward always comes from the
slot, never from the activity.

Taking the next unit slot by slot is greedy, and with BOTH units greed can strand a slot: a normal slot takes the
only BOTH unit while a NORMAL-only unit was free, and a later meteor slot then has nothing. So when a slot finds no
free unit, `choose_units` looks for a swap before giving up (an augmenting path, as in Kuhn's matching algorithm):
an earlier slot gives its unit to this slot and takes a free unit, or another earlier slot's unit, in its place. Slots
are tried in play order, and a replacement unit comes from the earlier slot's own groups in their shuffled order, so
the result stays a pure function of the inputs. The repair runs only when the greedy pass is stuck, so every plan the
greedy pass could already make is unchanged, and a bank with no BOTH unit never has a swap to make (each of its units
fits one slot kind, so any unit an earlier slot could hand over sits in a group that is already empty). With the
repair a run is refused only when no assignment of units to slots exists. The shuffle labels are the same as before;
ALGORITHM_VERSION stays 1 [ASSUMPTION].

Milestone 1 configuration (labelled as such, not the product rule; B N-7, C24.7, J): `M1_CONFIG` sets every group's
eligibility threshold to 1 and turns on the subject fallback: a slot whose rotation subject has nothing left takes
the next subject that has, in the order maths, phonics, spelling (the C24.6 endless rule). Without the fallback the
single Milestone 1 activity (`ph-0102`, phonics) could never fill `N-001`, which the rotation makes a maths slot.
M3-07 (Phase 42) sets the real thresholds and turns the fallback off for authored slots.

If a slot cannot be filled, or a group that supplies slots holds fewer units than its threshold, the run is not
created: `BankNotReady` (409 CONTENT_UNAVAILABLE {reason: BANK_NOT_READY}). Never a partial run.
"""

from __future__ import annotations

import hashlib
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from shared.rules.next_phase import slot_id_for
from shared.selection.bank import SLOT_KINDS, SUBJECTS, Unit, fills
from shared.selection.draws import shuffle

ALGORITHM_VERSION = 1
POWER_ROTATION = ("frost-pulse", "comet-burst", "colony-shield")  # C10 award mapping, by meteor number


class BankNotReady(Exception):
    """The age band's bank cannot fill this wave set under the configured thresholds."""


@dataclass(frozen=True)
class SelectionConfig:
    thresholds: Mapping[tuple[str, str], int]
    subject_fallback: bool


M1_CONFIG = SelectionConfig(
    thresholds={(subject, kind): 1 for subject in SUBJECTS for kind in SLOT_KINDS},
    subject_fallback=True,
)


@dataclass(frozen=True)
class SlotSpec:
    slot_id: str
    kind: str  # NORMAL | METEOR
    interval: int
    subject: str  # by rotation
    reward: dict[str, Any]


@dataclass(frozen=True)
class SlotPlan:
    slot_id: str
    kind: str
    interval: int
    unit: Unit
    reward: dict[str, Any]
    presentation: dict[str, Any] = field(default_factory=dict)
    intro: str | None = None
    clips: dict[str, dict[str, str]] = field(default_factory=dict)


def slot_specs(final_wave: int, meteor_after: Sequence[int], normal_rewards: Sequence[int]) -> list[SlotSpec]:
    """Every slot of an authored wave set, in play order, with its rotation subject and pinned reward.

    `normal_rewards[k - 1]` is the credits for `N-k` (the bounds file's `normalRewardByInterval`, which the build
    script takes from the ruleset by interval, C9.2). Meteor j pays one charge of POWER_ROTATION[(j - 1) mod 3].
    """
    specs = [
        SlotSpec(
            slot_id=slot_id_for("NORMAL", k),
            kind="NORMAL",
            interval=k,
            subject=SUBJECTS[(k - 1) % 3],
            reward={"credits": int(normal_rewards[k - 1])},
        )
        for k in range(1, final_wave)
    ]
    for j, interval in enumerate(meteor_after, start=1):
        specs.append(
            SlotSpec(
                slot_id=slot_id_for("METEOR", interval),
                kind="METEOR",
                interval=interval,
                subject=SUBJECTS[(j - 1) % 3],
                reward={"credits": 0, "powerId": POWER_ROTATION[(j - 1) % 3]},
            )
        )
    specs.sort(key=lambda spec: (spec.interval, spec.kind != "NORMAL"))
    return specs


class _Group:
    """One subject x slot-kind queue: topics shuffled, units shuffled inside each topic, round-robin over topics.

    A BOTH unit sits in two groups. `take` passes over (and drops) any unit in `used`, the run's shared set of
    activity IDs already chosen, so the unit fills at most one slot. With no BOTH unit nothing is ever skipped."""

    def __init__(self, units: Sequence[Unit], seed: str, subject: str, category: str) -> None:
        by_topic: dict[str, list[Unit]] = {}
        for unit in units:
            by_topic.setdefault(unit.topic_id, []).append(unit)
        topics = shuffle(sorted(by_topic), seed, f"topics:{category}:{subject}")
        self.size = len(units)
        self.queues = [shuffle(by_topic[topic], seed, f"units:{topic}") for topic in topics]
        self.next_topic = 0

    def take(self, used: set[str]) -> Unit | None:
        for step in range(len(self.queues)):
            index = (self.next_topic + step) % len(self.queues)
            queue = self.queues[index]
            while queue and queue[0].activity_id in used:
                queue.pop(0)  # taken by the other group of this subject (a BOTH unit)
            if queue:
                self.next_topic = index + 1
                unit = queue.pop(0)
                used.add(unit.activity_id)
                return unit
        return None


ORDERED_OPTION_TYPES = ("MULTIPLE_CHOICE", "PICTURE_SELECT")
TILE_DRAWS = 8  # re-draws of a tile shuffle that spells the answer before falling back to the stored order


def spells_answer(values: Sequence[str], mode: object, accepted: Sequence[str]) -> bool:
    """True when tiles shown in this order already give an accepted answer (C24.4 step 7, C20.1): for LETTERS, any
    run of neighbouring tiles that spells an accepted word; for SEQUENCE, the whole row in an accepted order. The
    publish rule (`shared.activity_types`) uses the same test on the stored order."""
    if mode == "SEQUENCE":
        return ",".join(values) in accepted
    words = set(accepted)
    return any("".join(values[i:j]) in words for i in range(len(values)) for j in range(i + 1, len(values) + 1))


def _tile_order(slot_id: str, payload: Mapping[str, Any], accepted: Sequence[str], seed: str) -> list[str]:
    """ARRANGE tile order for the slot: a seeded shuffle, re-drawn (with a new label) while it spells an accepted
    answer. After TILE_DRAWS tries the stored order is kept, which publish validation already checked."""
    tiles = [t for t in payload.get("tiles") or [] if isinstance(t, Mapping)]
    if not all(isinstance(t.get("id"), str) and isinstance(t.get("value"), str) for t in tiles):
        return []
    by_id = {str(t["id"]): str(t["value"]) for t in tiles}
    ids = list(by_id)
    if len(ids) != len(tiles):
        return []
    for attempt in range(TILE_DRAWS):
        order = shuffle(ids, seed, f"tiles:{slot_id}" if attempt == 0 else f"tiles:{slot_id}:{attempt}")
        if not spells_answer([by_id[i] for i in order], payload.get("mode"), accepted):
            return order
    return ids


def _presentation(slot_id: str, version: Mapping[str, Any], seed: str) -> dict[str, Any]:
    """Option and tile order fixed at creation (C24.4 step 7), so a reload shows the same layout but each run differs.
    MULTIPLE_CHOICE and PICTURE_SELECT get `optionOrder`; ARRANGE gets `tileOrder`, re-drawn while it spells the
    answer. NUMBER_SELECT has no order to fix (the numbers are shown in counting order). [ASSUMPTION] OBJECT_MOVE
    objects and the second part of a two-step activity keep their authored order: neither can give the answer away
    by its order alone."""
    payload = version.get("activityPayload")
    if not isinstance(payload, Mapping):
        return {}
    kind = version.get("interactionType")
    if kind == "ARRANGE":
        spec = version.get("answerSpecification")
        raw = spec.get("accepted") if isinstance(spec, Mapping) else None
        accepted = [a for a in raw or [] if isinstance(a, str)]
        order = _tile_order(slot_id, payload, accepted, seed)
        return {"tileOrder": order} if order else {}
    if kind not in ORDERED_OPTION_TYPES:
        return {}
    options = payload.get("options")
    ids = [o["id"] for o in options or [] if isinstance(o, Mapping) and isinstance(o.get("id"), str)]
    return {"optionOrder": shuffle(ids, seed, f"order:{slot_id}")} if ids else {}


def _clips(version: Mapping[str, Any]) -> dict[str, dict[str, str]]:
    """The slot's clips map, copied from the version's resolved speech refs (C21, F §4.2)."""
    refs = version.get("speechDefinitionReferences")
    clips: dict[str, dict[str, str]] = {}
    if isinstance(refs, Mapping):
        for variant, ref in sorted(refs.items()):
            if not isinstance(ref, Mapping):
                continue
            entry = {name: ref.get(name) for name in ("speechId", "speechVersion", "clipKey")}
            if all(isinstance(value, str) and value for value in entry.values()):
                clips[str(variant)] = {name: str(value) for name, value in entry.items()}
    return clips


def choose_units(specs: Sequence[SlotSpec], units: Sequence[Unit], seed: str, config: SelectionConfig) -> list[Unit]:
    """One unit per spec, or BankNotReady. Pure."""
    groups = {
        (subject, kind): _Group(
            [u for u in units if u.subject == subject and fills(u.category, kind)], seed, subject, kind
        )
        for subject in SUBJECTS
        for kind in SLOT_KINDS
    }
    used: set[str] = set()  # activity IDs chosen so far, shared by every group (a BOTH unit is in two)
    chosen: list[Unit] = []

    def subjects_for(spec: SlotSpec) -> list[str]:
        order = [spec.subject]
        if config.subject_fallback:
            order += [subject for subject in SUBJECTS if subject != spec.subject]
        return order

    def take_free(spec: SlotSpec) -> Unit | None:
        for subject in subjects_for(spec):
            unit = groups[(subject, spec.kind)].take(used)
            if unit is not None:
                return unit
        return None

    def fits(unit: Unit, spec: SlotSpec) -> bool:
        return fills(unit.category, spec.kind) and unit.subject in subjects_for(spec)

    def swap_for(spec: SlotSpec, visited: set[int]) -> Unit | None:
        """A unit for `spec` taken from an earlier slot, which is refilled with a free unit or, recursively, with
        another earlier slot's unit. `chosen` is updated in place; None when no such chain of swaps exists."""
        for index, held in enumerate(chosen):
            if index in visited or not fits(held, spec):
                continue
            visited.add(index)
            other = specs[index]
            replacement = take_free(other) or swap_for(other, visited)
            if replacement is not None:
                chosen[index] = replacement
                return held
        return None

    for spec in specs:
        unit = take_free(spec) or swap_for(spec, set())
        if unit is None:
            raise BankNotReady(f"no unit left for {spec.slot_id}")
        chosen.append(unit)
    # A group supplies a slot when the slot's unit came from it: the unit's subject and the slot's kind.
    supplied = {(unit.subject, spec.kind) for spec, unit in zip(specs, chosen, strict=True)}
    for key, group in groups.items():
        if key in supplied and group.size < config.thresholds.get(key, 1):
            raise BankNotReady(f"group {key} holds {group.size} units, below its threshold")
    return chosen


def plan_slots(
    specs: Sequence[SlotSpec],
    chosen: Sequence[Unit],
    versions: Mapping[tuple[str, str], Mapping[str, Any]],
    seed: str,
) -> list[SlotPlan]:
    """The full plan once the chosen versions are read: presentation, demonstration flags (C22.6: the first slot of
    each concept whose activity carries a demonstration gets AUTO, later ones ON_REQUEST, none without one) and
    clips. A chosen version that does not exist raises BankNotReady (the header named a version that is missing)."""
    plans: list[SlotPlan] = []
    introduced: set[str] = set()
    for spec, unit in zip(specs, chosen, strict=True):
        version = versions.get((unit.activity_id, unit.version))
        if version is None or version.get("withdrawn"):
            raise BankNotReady(f"published version of {unit.activity_id} is missing or withdrawn")
        intro: str | None = None
        demo = version.get("introductionContent")
        if isinstance(demo, Mapping):
            concept = demo.get("conceptId") if isinstance(demo.get("conceptId"), str) else unit.topic_id
            intro = "ON_REQUEST" if concept in introduced else "AUTO"
            introduced.add(str(concept))
        plans.append(
            SlotPlan(
                slot_id=spec.slot_id,
                kind=spec.kind,
                interval=spec.interval,
                unit=unit,
                reward=dict(spec.reward),
                presentation=_presentation(spec.slot_id, version, seed),
                intro=intro,
                clips=_clips(version),
            )
        )
    return plans


def pack_id(plans: Sequence[SlotPlan]) -> str:
    """The run's `selection.packId`: SHA-256 of the ordered slot references (C24.5)."""
    refs = ";".join(f"{p.slot_id}={p.unit.activity_id}@{p.unit.version}" for p in plans)
    return hashlib.sha256(refs.encode()).hexdigest()
