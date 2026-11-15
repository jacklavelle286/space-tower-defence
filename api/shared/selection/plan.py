"""Choosing a run's activities at creation (C24, spine S5.3; M1-16 with the Milestone 1 configuration).

`plan_slots` is pure: the seed, the age band's units, the chosen versions and the wave set in, the slot plan out.
The same inputs always give the same plan (C24.9 property 1), so a test can pin a seed and check the exact result.

The slot list (C24.2): `N-001` ... `N-(finalWave - 1)`, normal activity k with subject rotation[(k - 1) mod 3]; then
`M-<p>` for each p in the wave set's `meteorAfter`, meteor j (1-based, in that order) with subject
rotation[(j - 1) mod 3]. Rotation = maths, phonics, spelling.

For each slot, in play order (by interval, the normal slot before the meteor), the unit comes from its group
(subject x NORMAL/METEOR) by round-robin over the group's topics. Topic order and the units inside each topic are
shuffled with the seed (C24.4, C24.5). A unit is used at most once per run.

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
from shared.selection.bank import SUBJECTS, Unit
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
    thresholds={(subject, category): 1 for subject in SUBJECTS for category in ("NORMAL", "METEOR")},
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
    """One subject x category queue: topics shuffled, units shuffled inside each topic, round-robin over topics."""

    def __init__(self, units: Sequence[Unit], seed: str, subject: str, category: str) -> None:
        by_topic: dict[str, list[Unit]] = {}
        for unit in units:
            by_topic.setdefault(unit.topic_id, []).append(unit)
        topics = shuffle(sorted(by_topic), seed, f"topics:{category}:{subject}")
        self.size = len(units)
        self.queues = [shuffle(by_topic[topic], seed, f"units:{topic}") for topic in topics]
        self.next_topic = 0
        self.used = 0

    def take(self) -> Unit | None:
        for step in range(len(self.queues)):
            index = (self.next_topic + step) % len(self.queues)
            if self.queues[index]:
                self.next_topic = index + 1
                self.used += 1
                return self.queues[index].pop(0)
        return None


def _presentation(slot_id: str, version: Mapping[str, Any], seed: str) -> dict[str, Any]:
    """Option order fixed at creation (C24.4 step 7), so a reload shows the same layout. Only MULTIPLE_CHOICE in
    Milestone 1; the other five types arrive with their panels (M3-03)."""
    if version.get("interactionType") != "MULTIPLE_CHOICE":
        return {}
    payload = version.get("activityPayload")
    options = payload.get("options") if isinstance(payload, Mapping) else None
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
        (subject, category): _Group(
            [u for u in units if u.subject == subject and u.category == category], seed, subject, category
        )
        for subject in SUBJECTS
        for category in ("NORMAL", "METEOR")
    }
    chosen: list[Unit] = []
    for spec in specs:
        order = [spec.subject]
        if config.subject_fallback:
            order += [subject for subject in SUBJECTS if subject != spec.subject]
        unit = None
        for subject in order:
            unit = groups[(subject, spec.kind)].take()
            if unit is not None:
                break
        if unit is None:
            raise BankNotReady(f"no unit left for {spec.slot_id}")
        chosen.append(unit)
    for key, group in groups.items():
        if group.used and group.size < config.thresholds.get(key, 1):
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
