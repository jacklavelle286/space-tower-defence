"""Eligibility and bank status (C24.7, C24.8, D §D8.5; Phase 42, M3-07).

An age band is **eligible** when its bank meets every condition of the configuration (`plan.PLAN_CONFIG` holds the
plan's version-one values, [PROPOSAL]):

1. each group (subject x NORMAL/METEOR) holds at least its threshold, counted by `bank.group_units` (a BOTH unit counts
   in both groups of its subject; a template counts 1, or 2 from 20 instances);
2. each subject has at least `topics_per_subject` topics holding `units_per_topic` units or more;
3. the maths templates offer the configured instance totals (summed `domainSize`, by slot kind);
4. the selector itself can fill a whole campaign (49 normal + 5 meteor slots) under the configuration's rules.

Point 4 runs `plan.choose_units`, and points 1-3 count `bank.group_units`, the same function the selector builds its
queues from, so bank status (R30) and selection cannot disagree. Whether the slots can be filled does not depend on
the seed (the selector repairs a stuck greedy pass with swaps, so it finds an assignment whenever one exists), so
point 4 uses one fixed seed.

`select_units` is the policy run creation uses: an eligible band gets the configuration's own rules; a band that is
not eligible gets `STARTER_CONFIG` when `starter_until_eligible` is on (LIVE_CONFIG, [PROPOSAL] 2026-11-16, so the live
game keeps working with the starter bank), and is refused (BankNotReady, cause NOT_ELIGIBLE) when it is off.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import Any

from shared.rules.contracts import LIMITS
from shared.selection.bank import SLOT_KINDS, Unit, group_units, subjects_for, units_for_band
from shared.selection.plan import (
    HARD_MINIMUMS,
    LIVE_CONFIG,
    STARTER_CONFIG,
    BankNotReady,
    SelectionConfig,
    SlotSpec,
    choose_units,
    for_band,
    slot_specs,
)

AGE_BANDS = tuple(LIMITS["ageBands"])  # YG1: Reception (5) to Year 6 (11)
CAMPAIGN_FINAL_WAVE = 50  # C24.2: N-001 ... N-049
CAMPAIGN_METEOR_AFTER = (9, 19, 29, 39, 49)  # C24.2: M-009 ... M-049
FEASIBILITY_SEED = "0000000000000000"  # any seed gives the same yes/no (see the module docstring)


def campaign_specs(age_band: int | None = None) -> list[SlotSpec]:
    """The 54 slots of a campaign (C24.2), in the band's rotation (YG2). Rewards do not matter for counting, so 0."""
    return for_band(slot_specs(CAMPAIGN_FINAL_WAVE, CAMPAIGN_METEOR_AFTER, [0] * (CAMPAIGN_FINAL_WAVE - 1)), age_band)


def can_fill(specs: Sequence[SlotSpec], units: Sequence[Unit], config: SelectionConfig) -> bool:
    """True when the selector fills every slot under the config's rules (its thresholds are not applied here)."""
    try:
        choose_units(specs, units, FEASIBILITY_SEED, replace(config, thresholds={}))
    except BankNotReady:
        return False
    return True


@dataclass(frozen=True)
class GroupStatus:
    subject: str
    kind: str  # NORMAL | METEOR
    count: int
    threshold: int
    hard_minimum: int
    topics: Mapping[str, int]  # topicId -> units of this group

    @property
    def ok(self) -> bool:
        return self.count >= self.threshold


@dataclass(frozen=True)
class SubjectStatus:
    subject: str
    topics: Mapping[str, int]  # topicId -> units of this subject (either slot kind, each unit once)
    needed: int  # topics that must hold `units_per_topic` or more
    units_per_topic: int

    @property
    def topics_with_enough(self) -> int:
        return sum(1 for count in self.topics.values() if count >= self.units_per_topic)

    @property
    def ok(self) -> bool:
        return self.topics_with_enough >= self.needed


@dataclass(frozen=True)
class TemplateStatus:
    subject: str
    kind: str
    instances: int
    needed: int

    @property
    def ok(self) -> bool:
        return self.instances >= self.needed


@dataclass(frozen=True)
class BandStatus:
    groups: tuple[GroupStatus, ...]
    subjects: tuple[SubjectStatus, ...]
    templates: tuple[TemplateStatus, ...]
    campaign_fillable: bool  # under the configuration's own rules (no subject fallback in PLAN_CONFIG)
    activities: int  # distinct activities in the band

    @property
    def eligible(self) -> bool:
        return (
            self.campaign_fillable
            and all(g.ok for g in self.groups)
            and all(s.ok for s in self.subjects)
            and all(t.ok for t in self.templates)
        )


def band_status(units: Sequence[Unit], config: SelectionConfig, age_band: int | None = None) -> BandStatus:
    """Counts against the configuration for one band's units (what `select_units` decides on and R30 shows), for the
    band's subjects (YG2: grammar instead of phonics from Year 3)."""
    subjects = subjects_for(age_band)
    groups = group_units(units)
    group_rows = tuple(
        GroupStatus(
            subject=subject,
            kind=kind,
            count=len(groups[(subject, kind)]),
            threshold=config.thresholds.get((subject, kind), 1),
            hard_minimum=HARD_MINIMUMS[(subject, kind)],
            topics=dict(sorted(Counter(u.topic_id for u in groups[(subject, kind)]).items())),
        )
        for subject in subjects
        for kind in SLOT_KINDS
    )
    subject_rows = tuple(
        SubjectStatus(
            subject=subject,
            topics=dict(sorted(Counter(u.topic_id for u in units if u.subject == subject).items())),
            needed=config.topics_per_subject,
            units_per_topic=config.units_per_topic,
        )
        for subject in subjects
    )
    template_rows = tuple(
        TemplateStatus(
            subject=subject,
            kind=kind,
            instances=sum(u.domain_size for u in groups.get((subject, kind), []) if u.template and u.instance == 0),
            needed=needed,
        )
        for (subject, kind), needed in config.template_instances.items()
    )
    return BandStatus(
        groups=group_rows,
        subjects=subject_rows,
        templates=template_rows,
        campaign_fillable=can_fill(campaign_specs(age_band), units, config),
        activities=len({u.activity_id for u in units}),
    )


def select_units(
    specs: Sequence[SlotSpec],
    units: Sequence[Unit],
    seed: str,
    config: SelectionConfig = LIVE_CONFIG,
    age_band: int | None = None,
) -> list[Unit]:
    """One unit per slot for a new run, or BankNotReady: the configuration's rules when the band is eligible,
    otherwise the starter rules (`starter_until_eligible`) or a refusal. `specs` are already in the band's rotation
    (`for_band`)."""
    if band_status(units, config, age_band).eligible:
        return choose_units(specs, units, seed, config)
    if config.starter_until_eligible:
        return choose_units(specs, units, seed, STARTER_CONFIG)
    raise BankNotReady("the age band is not eligible under the configured thresholds", "NOT_ELIGIBLE")


# --- R30 GET /api/admin/bank-status --------------------------------------------------------------------------------

# A released wave set as R30 judges it: its id and its slots (from the released bounds file, as POST /api/runs builds
# them). None in place of the list means the released game data could not be read.
ReleasedWaveSets = Sequence[tuple[str, Sequence[SlotSpec]]]

# When the released wave sets cannot be read, a band counts as playable on the starter rules only if it can fill a
# normal slot AND a meteor slot: a campaign wave set has both kinds [ASSUMPTION, Phase 42 review].
_FALLBACK_SPECS: tuple[SlotSpec, ...] = tuple(
    spec for spec in slot_specs(10, [9], [0] * 9) if spec.slot_id in ("N-001", "M-009")
)


def rules_in_force(status: BandStatus, config: SelectionConfig) -> SelectionConfig | None:
    """The rules `select_units` applies to this band: the configuration's own when eligible, the starter rules while
    `starter_until_eligible` is on, else None (refused)."""
    if status.eligible:
        return config
    return STARTER_CONFIG if config.starter_until_eligible else None


def _fill_by_kind(units: Sequence[Unit], rules: SelectionConfig, age_band: int | None = None) -> bool:
    """A unit can fill one slot of each kind (any of the band's subjects: the fallback specs are checked one by one)."""
    return all(
        any(can_fill([replace(spec, subject=subject)], units, rules) for subject in subjects_for(age_band))
        for spec in _FALLBACK_SPECS
    )


def _needs(status: BandStatus) -> list[dict[str, Any]]:
    """What to add, in the order the page lists it. `more` is how many are missing."""
    needs: list[dict[str, Any]] = []
    for g in status.groups:
        if not g.ok:
            needs.append(
                {"what": "UNITS", "subject": g.subject, "rewardCategory": g.kind, "have": g.count, "need": g.threshold}
            )
    for s in status.subjects:
        if not s.ok:
            needs.append({"what": "TOPICS", "subject": s.subject, "have": s.topics_with_enough, "need": s.needed})
    for t in status.templates:
        if not t.ok:
            needs.append(
                {
                    "what": "TEMPLATE_INSTANCES",
                    "subject": t.subject,
                    "rewardCategory": t.kind,
                    "have": t.instances,
                    "need": t.needed,
                }
            )
    if not needs and not status.campaign_fillable:
        needs.append({"what": "CAMPAIGN"})  # every count is met, yet the slots cannot all be filled
    for need in needs:
        if "need" in need:
            need["more"] = need["need"] - need["have"]
    return needs


def band_view(
    age_band: int, units: Sequence[Unit], config: SelectionConfig, released: ReleasedWaveSets | None = None
) -> dict[str, Any]:
    """One age band of R30's body. The mode says what a new game does now: it runs the released wave sets through
    the selector under the rules in force for this band, so the page cannot say games start when they are refused."""
    status = band_status(units, config, age_band)
    starter_fillable = can_fill(campaign_specs(age_band), units, STARTER_CONFIG)
    rules = rules_in_force(status, config)
    wave_sets = [
        {"waveSetId": wave_set_id, "fillable": rules is not None and can_fill(for_band(specs, age_band), units, rules)}
        for wave_set_id, specs in (released or ())
    ]
    if rules is None:
        playable = False
    elif released is None:
        playable = _fill_by_kind(units, rules, age_band)  # the released wave sets could not be read
    else:
        playable = bool(wave_sets) and all(ws["fillable"] for ws in wave_sets)
    if not playable:
        mode = "BLOCKED"  # new games for this age are refused: CONTENT_UNAVAILABLE {reason: BANK_NOT_READY}
    elif status.eligible:
        mode = "READY"  # new games use the plan's rules
    else:
        mode = "STARTER"  # new games run on the starter rules (thresholds 1, subject fallback) while units last
    return {
        "ageBand": age_band,
        "eligible": status.eligible,
        "mode": mode,
        "activities": status.activities,
        "campaignFillable": status.campaign_fillable,
        "starterCampaignFillable": starter_fillable,
        "waveSets": wave_sets,
        "groups": [
            {
                "subject": g.subject,
                "rewardCategory": g.kind,
                "count": g.count,
                "threshold": g.threshold,
                "hardMinimum": g.hard_minimum,
                "ok": g.ok,
                "topics": [{"topicId": topic, "count": count} for topic, count in g.topics.items()],
            }
            for g in status.groups
        ],
        "subjects": [
            {
                "subject": s.subject,
                "topics": len(s.topics),
                "topicsWithEnough": s.topics_with_enough,
                "topicsNeeded": s.needed,
                "ok": s.ok,
            }
            for s in status.subjects
        ],
        "templates": [
            {"subject": t.subject, "rewardCategory": t.kind, "instances": t.instances, "needed": t.needed, "ok": t.ok}
            for t in status.templates
        ],
        "needs": _needs(status),
    }


def bank_status(
    headers: Iterable[Mapping[str, Any]],
    config: SelectionConfig = LIVE_CONFIG,
    released: ReleasedWaveSets | None = None,
) -> dict[str, Any]:
    """R30's body: every age band, from one read of the header partition, with the rules in force. `released` is
    the released wave sets' slots, or None when the released game data could not be read (`releasedWaveSets` null:
    the mode then only checks that a normal and a meteor slot can be filled)."""
    items = list(headers)
    return {
        "releasedWaveSets": None if released is None else [wave_set_id for wave_set_id, _ in released],
        "rules": {
            "starterUntilEligible": config.starter_until_eligible,
            "subjectFallback": config.subject_fallback,
            "topicsPerSubject": config.topics_per_subject,
            "unitsPerTopic": config.units_per_topic,
            "campaignSlots": {"NORMAL": CAMPAIGN_FINAL_WAVE - 1, "METEOR": len(CAMPAIGN_METEOR_AFTER)},
        },
        "ageBands": [band_view(band, units_for_band(items, band), config, released) for band in AGE_BANDS],
    }
