"""Choosing a run's activities at creation (C24, spine S5.3; M1-16, thresholds and eligibility M3-07).

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

Configuration (Phase 42, M3-07; C24.7). `SelectionConfig` holds the thresholds and rules; this module has three:
- `PLAN_CONFIG`: the plan's version-one thresholds (C24.7, [PROPOSAL]), the subject fallback off for authored slots
  (C24.4 rule 5: a dry queue stops the run), and the band-level conditions (five topics per subject with two units
  each; maths template instances, 500 NORMAL and 50 METEOR). A band that meets all of them is "eligible".
- `STARTER_CONFIG`: every threshold 1 and the subject fallback on (the old Milestone 1 configuration, B N-7): a slot
  whose rotation subject has nothing left takes the next subject that has, in the order maths, phonics, spelling.
- `LIVE_CONFIG`, what player-api runs: `PLAN_CONFIG` with `starter_until_eligible` on [PROPOSAL, 2026-11-16]. A band
  that is not yet eligible plays under `STARTER_CONFIG` instead of being refused, so the live game keeps working with
  the starter bank; each band moves to the plan's rules by itself once bank status shows it eligible. Turning
  `starter_until_eligible` off gives the plan's rule exactly (a band below a threshold is BANK_NOT_READY).
The policy (which configuration a run gets) is `shared.selection.eligibility.select_units`; `choose_units` here only
applies the configuration it is given.

If a slot cannot be filled, or a group that supplies slots holds fewer units than its threshold, the run is not
created: `BankNotReady` (409 CONTENT_UNAVAILABLE {reason: BANK_NOT_READY}). Never a partial run.

Templates (Phase 41, C24.4 rules 1, 4 and 6; C25.1): a published template gives one or two units
(`bank.template_units`). Inside its topic the first units are shuffled as before and each template's second unit goes
to the back of the topic's queue, in the same order. A bank with no template plans exactly as before. When the slot is
planned, `plan_slots` materialises the instance: it draws an index into the template's domain with
draw(seed, "params:<slotId>", attempt), builds that instance with the pinned generator version, and re-draws (next
attempt) when the instance is removed from the domain or the run already has it (`activityId` + parameters, rule 4);
after PARAM_DRAWS tries it walks the domain from the first draw. The instance is stored on the slot as `resolved`, so
reloads, judging and the pack replay it and never run the generator again.
"""

from __future__ import annotations

import hashlib
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from typing import Any

from shared import generators
from shared.rules.next_phase import slot_id_for
from shared.selection.bank import ALL_SUBJECTS, SLOT_KINDS, SUBJECTS, Unit, fills, group_units, subjects_for
from shared.selection.draws import draw, shuffle

ALGORITHM_VERSION = 1
PARAM_DRAWS = 16  # seeded tries for a template instance before walking the domain [ASSUMPTION]


class BankNotReady(Exception):
    """The age band's bank cannot fill this wave set under the configured thresholds.

    `cause` says why, for tests and the log line (never shown to the child; the API answers
    409 CONTENT_UNAVAILABLE {reason: BANK_NOT_READY}): SLOT_UNFILLED, BELOW_THRESHOLD, NOT_ELIGIBLE,
    TEMPLATE_UNAVAILABLE or VERSION_MISSING."""

    def __init__(self, message: str, cause: str = "SLOT_UNFILLED") -> None:
        super().__init__(message)
        self.cause = cause


@dataclass(frozen=True)
class SelectionConfig:
    """Thresholds and rules for one selection (C24.7). Server configuration, never from a request."""

    thresholds: Mapping[tuple[str, str], int]  # (subject, slot kind) -> units the group must hold
    subject_fallback: bool  # a slot may take the next subject when its rotation subject is used up
    topics_per_subject: int = 0  # band condition: at least this many topics per subject ...
    units_per_topic: int = 2  # ... holding at least this many units each
    template_instances: Mapping[tuple[str, str], int] = field(default_factory=dict)  # summed template domainSize
    starter_until_eligible: bool = False  # a band that is not eligible plays under STARTER_CONFIG (not refused)


# C24.7 hard minimums: what one campaign uses (49 normal + 5 meteor slots, rotation 17/16/16 and 2/2/1). A threshold
# must never be set below these (tests/unit/test_selection_eligibility.py checks PLAN_CONFIG).
HARD_MINIMUMS: Mapping[tuple[str, str], int] = {
    ("maths", "NORMAL"): 17,
    ("phonics", "NORMAL"): 16,
    ("spelling", "NORMAL"): 16,
    ("maths", "METEOR"): 2,
    ("phonics", "METEOR"): 2,
    ("spelling", "METEOR"): 1,
    # YG2: grammar takes phonics's place in the rotation from Year 3, so it has phonics's numbers.
    ("grammar", "NORMAL"): 16,
    ("grammar", "METEOR"): 2,
}

# C24.7 "Eligibility threshold, version one": twice what one campaign uses [PROPOSAL].
PLAN_CONFIG = SelectionConfig(
    thresholds={
        ("maths", "NORMAL"): 34,
        ("phonics", "NORMAL"): 32,
        ("spelling", "NORMAL"): 32,
        ("maths", "METEOR"): 4,
        ("phonics", "METEOR"): 4,
        ("spelling", "METEOR"): 2,
        ("grammar", "NORMAL"): 32,
        ("grammar", "METEOR"): 4,
    },
    subject_fallback=False,
    topics_per_subject=5,
    units_per_topic=2,
    template_instances={("maths", "NORMAL"): 500, ("maths", "METEOR"): 50},
)

# The Milestone 1 rules (B N-7), kept for a band that is not eligible yet: thresholds 1, subject fallback on.
STARTER_CONFIG = SelectionConfig(
    thresholds={(subject, kind): 1 for subject in ALL_SUBJECTS for kind in SLOT_KINDS},
    subject_fallback=True,
)

# What player-api runs [PROPOSAL, 2026-11-16]: the plan's rules for an eligible band, the starter rules otherwise.
LIVE_CONFIG = replace(PLAN_CONFIG, starter_until_eligible=True)


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
    resolved: dict[str, Any] | None = None  # a materialised template instance (C25.1); None for a FIXED activity


def slot_specs(
    final_wave: int,
    meteor_after: Sequence[int],
    normal_rewards: Sequence[int],
    award_rotation: Sequence[str] = (),
) -> list[SlotSpec]:
    """Every slot of an authored wave set, in play order, with its rotation subject and pinned reward.

    `normal_rewards[k - 1]` is the credits for `N-k` (the bounds file's `normalRewardByInterval`, which the build
    script takes from the ruleset by interval, C9.2). Meteor j pays one charge of `award_rotation[(j - 1) mod len]`
    (the bounds file's `powerAwardRotation`, the ruleset's C10 rotation; Phase 51). Without a rotation a meteor spec
    carries no powerId: fine for counting demand (eligibility, bank status), never for a run, so CREATE_RUN refuses
    a wave set with meteors and no rotation before it gets here."""
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
                reward=(
                    {"credits": 0, "powerId": award_rotation[(j - 1) % len(award_rotation)]}
                    if award_rotation
                    else {"credits": 0}
                ),
            )
        )
    specs.sort(key=lambda spec: (spec.interval, spec.kind != "NORMAL"))
    return specs


def for_band(specs: Sequence[SlotSpec], age_band: int | None) -> list[SlotSpec]:
    """`specs` (built in the SUBJECTS rotation by `slot_specs`) in the band's rotation: from Year 3 the phonics slots
    are grammar slots (YG2). Bands to Year 2, and None, are unchanged."""
    rotation = subjects_for(age_band)
    if rotation == SUBJECTS:
        return list(specs)
    return [replace(spec, subject=rotation[SUBJECTS.index(spec.subject)]) for spec in specs]


class _Group:
    """One subject x slot-kind queue: topics shuffled, units shuffled inside each topic, round-robin over topics.

    A BOTH unit sits in two groups. `take` passes over (and drops) any unit in `used`, the run's shared set of
    unit keys already chosen, so the unit fills at most one slot. With no BOTH unit nothing is ever skipped.
    A template's second unit goes to the back of its topic's queue (C24.4 rule 2)."""

    def __init__(self, units: Sequence[Unit], seed: str, subject: str, category: str) -> None:
        by_topic: dict[str, list[Unit]] = {}
        for unit in units:
            by_topic.setdefault(unit.topic_id, []).append(unit)
        topics = shuffle(sorted(by_topic), seed, f"topics:{category}:{subject}")
        self.size = len(units)
        self.queues = [self._queue(by_topic[topic], seed, topic) for topic in topics]
        self.next_topic = 0

    @staticmethod
    def _queue(units: list[Unit], seed: str, topic: str) -> list[Unit]:
        first = shuffle([u for u in units if u.instance == 0], seed, f"units:{topic}")
        order = {u.activity_id: i for i, u in enumerate(first)}
        later = sorted((u for u in units if u.instance > 0), key=lambda u: (u.instance, order.get(u.activity_id, 0)))
        return first + later

    def take(self, used: set[str]) -> Unit | None:
        for step in range(len(self.queues)):
            index = (self.next_topic + step) % len(self.queues)
            queue = self.queues[index]
            while queue and queue[0].key in used:
                queue.pop(0)  # taken by the other group of this subject (a BOTH unit)
            if queue:
                self.next_topic = index + 1
                unit = queue.pop(0)
                used.add(unit.key)
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
    groups = {key: _Group(members, seed, *key) for key, members in group_units(units).items()}
    used: set[str] = set()  # unit keys chosen so far, shared by every group (a BOTH unit is in two)
    chosen: list[Unit] = []

    def subjects_for(spec: SlotSpec) -> list[str]:
        order = [spec.subject]
        if config.subject_fallback:
            # A band's units hold only its own subjects (`units_for_band`), so the others' groups are empty.
            order += [subject for subject in ALL_SUBJECTS if subject != spec.subject]
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
            raise BankNotReady(f"group {key} holds {group.size} units, below its threshold", "BELOW_THRESHOLD")
    return chosen


class _Templates:
    """The run's template domains, prepared once per pinned version, and the instances it already holds."""

    def __init__(self, taken: Iterable[str]) -> None:
        self.domains: dict[tuple[str, str], tuple[generators.Prepared, list[dict[str, Any]]]] = {}
        self.taken = set(taken)

    def domain(self, unit: Unit, version: Mapping[str, Any]) -> tuple[generators.Prepared, list[dict[str, Any]]]:
        pin = (unit.activity_id, unit.version)
        if pin not in self.domains:
            prepared, _ = generators.prepare(version.get("template"), version.get("interactionType"))
            raw = generators.domain_params(prepared) if prepared is not None else None
            if prepared is None or not raw:
                raise BankNotReady(f"template {unit.activity_id} cannot be generated", "TEMPLATE_UNAVAILABLE")
            self.domains[pin] = (prepared, raw)
        return self.domains[pin]

    def materialise(self, unit: Unit, version: Mapping[str, Any], slot_id: str, seed: str) -> dict[str, Any]:
        """The slot's instance (C24.4 rule 6): seeded draws into the domain, then a walk from the first draw."""
        prepared, raw = self.domain(unit, version)
        label = f"params:{slot_id}"
        first = draw(seed, label, 0) % len(raw)
        indexes = [draw(seed, label, attempt) % len(raw) for attempt in range(PARAM_DRAWS)]
        indexes += [(first + step) % len(raw) for step in range(len(raw))]
        for index in indexes:
            instance = generators.instance_at(prepared, raw, index)
            if instance is None:
                continue
            key = instance_key(unit.activity_id, instance.params)
            if key not in self.taken:
                self.taken.add(key)
                return instance.resolved(prepared.kind, prepared.version)
        raise BankNotReady(f"template {unit.activity_id} has no instance left for {slot_id}", "TEMPLATE_UNAVAILABLE")


def instance_key(activity_id: str, params: Mapping[str, Any]) -> str:
    """A template instance's identity within a run (C24.4 rule 4): the activity and its parameters."""
    return f"{activity_id}|{generators.canonical_params(params)}"


def _shown(version: Mapping[str, Any], resolved: Mapping[str, Any] | None) -> Mapping[str, Any]:
    """What the slot shows: the version itself, or for a template the version with the instance's prompt, payload,
    answers and pictures in place (what the pack sends, shared/runs.py)."""
    if resolved is None:
        return version
    fields = ("prompt", "activityPayload", "answerSpecification", "visualAssetReferences")
    return {**version, **{name: resolved[name] for name in fields}}


def plan_slots(
    specs: Sequence[SlotSpec],
    chosen: Sequence[Unit],
    versions: Mapping[tuple[str, str], Mapping[str, Any]],
    seed: str,
    taken_instances: Iterable[str] = (),
) -> list[SlotPlan]:
    """The full plan once the chosen versions are read: template instances, presentation, demonstration flags
    (C22.6: the first slot of each concept whose activity carries a demonstration gets AUTO, later ones ON_REQUEST,
    none without one) and clips. A chosen version that does not exist raises BankNotReady (the header named a version
    that is missing). `taken_instances` are template instances the run already holds (`instance_key`; endless
    blocks, Phase 54)."""
    plans: list[SlotPlan] = []
    introduced: set[str] = set()
    templates = _Templates(taken_instances)
    for spec, unit in zip(specs, chosen, strict=True):
        version = versions.get((unit.activity_id, unit.version))
        if version is None or version.get("withdrawn"):
            raise BankNotReady(f"published version of {unit.activity_id} is missing or withdrawn", "VERSION_MISSING")
        resolved = templates.materialise(unit, version, spec.slot_id, seed) if unit.template else None
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
                presentation=_presentation(spec.slot_id, _shown(version, resolved), seed),
                intro=intro,
                clips=_clips(version),
                resolved=resolved,
            )
        )
    return plans


def pack_id(plans: Sequence[SlotPlan]) -> str:
    """The run's `selection.packId`: SHA-256 of the ordered slot references (C24.5)."""
    refs = ";".join(f"{p.slot_id}={p.unit.activity_id}@{p.unit.version}" for p in plans)
    return hashlib.sha256(refs.encode()).hexdigest()
