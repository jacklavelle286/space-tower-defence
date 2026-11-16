"""Eligibility thresholds, the selection policy and bank status (C24.7, C24.8, C24.9; Phase 42, M3-07). Pure: no
tables, no clock. The R30 route itself is tested in test_selection_bank_status.py.

The exit criterion of the phase: over many seeds every slot is filled and no activity repeats within a run, and bank
status matches the counts. The risk it guards: an age band reported eligible that cannot fill a run."""

from __future__ import annotations

import glob
import json
import random
from collections import Counter
from dataclasses import replace
from decimal import Decimal
from pathlib import Path

import pytest

from shared.selection.bank import SLOT_KINDS, SUBJECTS, Unit, fills, group_units, units_for_band
from shared.selection.eligibility import (
    AGE_BANDS,
    band_status,
    band_view,
    bank_status,
    campaign_specs,
    can_fill,
    select_units,
)
from shared.selection.plan import (
    HARD_MINIMUMS,
    LIVE_CONFIG,
    PLAN_CONFIG,
    STARTER_CONFIG,
    BankNotReady,
    SelectionConfig,
    choose_units,
    slot_specs,
)

REPO = Path(__file__).resolve().parents[3]
VERSION = "20261120T120000Z"
SEEDS = [f"{n:016x}" for n in range(1, 201)]  # many seeds, fixed so a failure can be replayed


def unit(
    activity_id: str, subject: str, topic: str, category: str = "NORMAL", *, instance: int = 0, size: int = 0
) -> Unit:
    template = size > 0
    return Unit(activity_id, VERSION, subject, topic, category, "NUMBER_SELECT", instance, template, size or 1)


def eligible_bank() -> list[Unit]:
    """Exactly at the plan's thresholds (C24.7): 34/32/32 normal and 4/4/2 meteor, five topics with two units in each
    subject, and maths templates offering 600 instances to both slot kinds."""
    units: list[Unit] = []
    for n in range(30):  # maths fixed, NORMAL only, over six topics
        units.append(unit(f"ma-{n:04d}", "maths", f"maths-t{n % 6}"))
    for n in range(2):  # two BOTH templates of 300 instances: two units each, so 34 NORMAL and 4 METEOR maths units
        for instance in range(2):
            units.append(unit(f"ma-t{n:03d}", "maths", "maths-tpl", "BOTH", instance=instance, size=300))
    for subject, meteors in (("phonics", 4), ("spelling", 2)):
        short = subject[:2]
        units += [unit(f"{short}-{n:04d}", subject, f"{subject}-t{n % 8}") for n in range(32)]
        units += [unit(f"{short}-m{n:03d}", subject, f"{subject}-m", "METEOR") for n in range(meteors)]
    return units


def random_bank(rng: random.Random) -> list[Unit]:
    """A bank around the campaign's needs, with NORMAL, METEOR and BOTH units over a few topics."""
    units: list[Unit] = []
    for subject in SUBJECTS:
        for category, most in (("NORMAL", 24), ("METEOR", 4), ("BOTH", 24)):
            for n in range(rng.randint(0, most)):
                topic = f"{subject}-t{rng.randint(0, 6)}"
                units.append(unit(f"{subject[:2]}-{category[0]}{n:03d}", subject, topic, category))
    return units


def check_run(units: list[Unit], seed: str, config: SelectionConfig = LIVE_CONFIG) -> list[Unit]:
    """A campaign under the policy: every slot filled, no unit twice, every unit from the bank and fit for its slot
    kind."""
    specs = campaign_specs()
    chosen = select_units(specs, units, seed, config)
    assert len(chosen) == len(specs)
    assert len({u.key for u in chosen}) == len(chosen)  # no repeat within the run (C24.4 rule 4)
    assert all(u in units and fills(u.category, s.kind) for u, s in zip(chosen, specs, strict=True))
    return chosen


# --- Configuration (C24.7) ------------------------------------------------------------------------------------------


def test_the_plan_thresholds_are_the_c24_7_table_and_never_below_the_hard_minimums() -> None:
    assert dict(PLAN_CONFIG.thresholds) == {
        ("maths", "NORMAL"): 34,
        ("phonics", "NORMAL"): 32,
        ("spelling", "NORMAL"): 32,
        ("maths", "METEOR"): 4,
        ("phonics", "METEOR"): 4,
        ("spelling", "METEOR"): 2,
    }
    for key, minimum in HARD_MINIMUMS.items():
        assert PLAN_CONFIG.thresholds[key] >= minimum
    assert (PLAN_CONFIG.subject_fallback, PLAN_CONFIG.topics_per_subject, PLAN_CONFIG.units_per_topic) == (False, 5, 2)
    assert dict(PLAN_CONFIG.template_instances) == {("maths", "NORMAL"): 500, ("maths", "METEOR"): 50}
    assert not PLAN_CONFIG.starter_until_eligible
    # The live configuration is the plan's, plus the starter rules for a band that is not eligible yet.
    assert LIVE_CONFIG.thresholds == PLAN_CONFIG.thresholds and LIVE_CONFIG.starter_until_eligible
    assert set(STARTER_CONFIG.thresholds.values()) == {1} and STARTER_CONFIG.subject_fallback


def test_the_hard_minimums_are_what_one_campaign_uses() -> None:
    used = Counter((spec.subject, spec.kind) for spec in campaign_specs())
    assert dict(used) == dict(HARD_MINIMUMS)  # 17/16/16 normal and 2/2/1 meteor


# --- The one counting function -------------------------------------------------------------------------------------


def test_a_both_unit_counts_in_both_groups_and_a_template_by_its_units() -> None:
    units = [
        unit("ma-0001", "maths", "t", "BOTH"),
        unit("ma-0002", "maths", "t", "METEOR"),
        unit("ma-0003", "maths", "u", "BOTH", instance=0, size=20),
        unit("ma-0003", "maths", "u", "BOTH", instance=1, size=20),
    ]
    groups = group_units(units)
    assert [u.key for u in groups[("maths", "NORMAL")]] == ["ma-0001", "ma-0003#0", "ma-0003#1"]
    assert len(groups[("maths", "METEOR")]) == 4 and groups[("phonics", "NORMAL")] == []
    status = band_status(units, PLAN_CONFIG)
    assert {(g.subject, g.kind): g.count for g in status.groups}[("maths", "METEOR")] == 4
    assert [(t.kind, t.instances) for t in status.templates] == [("NORMAL", 20), ("METEOR", 20)]  # each template once
    assert status.activities == 3


# --- Eligibility and the policy -------------------------------------------------------------------------------------


def test_a_bank_at_the_thresholds_is_eligible_and_every_seed_fills_a_campaign_by_the_plan_rules() -> None:
    units = eligible_bank()
    status = band_status(units, PLAN_CONFIG)
    assert status.eligible and all(g.count == g.threshold for g in status.groups)
    for seed in SEEDS:
        chosen = check_run(units, seed)
        specs = campaign_specs()
        assert all(u.subject == s.subject for u, s in zip(chosen, specs, strict=True))  # no fallback: the rotation
        assert chosen == select_units(specs, units, seed, PLAN_CONFIG)  # eligible: the plan's rules exactly
    assert check_run(units, SEEDS[0]) == check_run(units, SEEDS[0])  # same seed and bank: the same draw (C24.9 1)
    assert len({tuple(u.key for u in check_run(units, seed)) for seed in SEEDS[:20]}) == 20  # seeds differ (C24.9 2)


@pytest.mark.parametrize(
    "drop",
    ["ph-0000", "sp-m000", "ma-0000"],
    ids=["phonics-normal", "spelling-meteor", "maths-normal"],
)
def test_one_unit_below_a_threshold_is_not_eligible_and_the_plan_rule_refuses(drop: str) -> None:
    units = [u for u in eligible_bank() if u.activity_id != drop]
    status = band_status(units, PLAN_CONFIG)
    assert not status.eligible
    with pytest.raises(BankNotReady) as refused:
        select_units(campaign_specs(), units, SEEDS[0], PLAN_CONFIG)
    assert refused.value.cause == "NOT_ELIGIBLE"
    assert len(check_run(units, SEEDS[0])) == 54  # the live policy plays it under the starter rules instead


def test_too_few_topics_or_template_instances_is_not_eligible() -> None:
    narrow = [replace(u, topic_id="phonics-one") if u.subject == "phonics" else u for u in eligible_bank()]
    status = band_status(narrow, PLAN_CONFIG)
    assert all(g.ok for g in status.groups) and not status.eligible
    assert [(s.subject, s.topics_with_enough) for s in status.subjects if not s.ok] == [("phonics", 1)]
    small = [replace(u, domain_size=100) if u.template else u for u in eligible_bank()]
    status = band_status(small, PLAN_CONFIG)
    assert [(t.kind, t.instances, t.ok) for t in status.templates] == [("NORMAL", 200, False), ("METEOR", 200, True)]
    assert not status.eligible


def test_a_band_that_is_not_eligible_plays_by_the_starter_rules_under_the_live_configuration() -> None:
    only = [unit("ph-0001", "phonics", "t")]
    [n001] = slot_specs(2, [], [30])  # the live wave set (first-contact): one maths slot by rotation
    assert select_units([n001], only, "s", LIVE_CONFIG) == only  # starter rules: the fallback takes phonics
    with pytest.raises(BankNotReady) as refused:
        select_units([n001], only, "s", PLAN_CONFIG)
    assert refused.value.cause == "NOT_ELIGIBLE"
    with pytest.raises(BankNotReady) as empty:
        select_units([n001], [], "s", LIVE_CONFIG)
    assert empty.value.cause == "SLOT_UNFILLED"  # nothing at all: still CONTENT_UNAVAILABLE, never a partial run


def test_property_over_random_banks_eligible_means_fillable_and_counts_match() -> None:
    """Many banks x many seeds: whatever the policy picks fills every slot without a repeat, a band reported eligible
    always fills, whether slots can be filled never depends on the seed, and the status counts are the bank's."""
    # Thresholds at the hard minimums and no topic or template condition, so random banks are often eligible.
    relaxed = replace(PLAN_CONFIG, thresholds=HARD_MINIMUMS, topics_per_subject=0, template_instances={})
    rng = random.Random(42)  # noqa: S311 - test data, fixed so a failure can be replayed
    verdicts: Counter[bool] = Counter()
    for _ in range(60):
        units = random_bank(rng)
        status = band_status(units, relaxed)
        verdicts[status.eligible] += 1
        for g in status.groups:  # bank status matches a recount done here, independently of group_units
            assert g.count == sum(1 for u in units if u.subject == g.subject and u.category in (g.kind, "BOTH"))
            assert sum(g.topics.values()) == g.count
        for config in (relaxed, STARTER_CONFIG):
            fillable = can_fill(campaign_specs(), units, config)
            for seed in SEEDS[:8]:
                try:
                    chosen = choose_units(campaign_specs(), units, seed, config)
                except BankNotReady:
                    assert not fillable, seed
                    continue
                assert fillable and len({u.key for u in chosen}) == len(chosen) == 54
        if status.eligible:
            for seed in SEEDS[:20]:
                check_run(units, seed, relaxed)
        else:
            with pytest.raises(BankNotReady):
                select_units(campaign_specs(), units, SEEDS[0], relaxed)
    assert verdicts[True] and verdicts[False]  # both outcomes were exercised


def test_property_near_the_thresholds_every_eligible_band_fills_every_seed() -> None:
    """The eligible bank with random BOTH swaps and removals: eligible always means every seed fills a campaign."""
    rng = random.Random(7)  # noqa: S311 - test data, fixed so a failure can be replayed
    verdicts: Counter[bool] = Counter()
    for _ in range(40):
        units = []
        for u in eligible_bank():
            roll = rng.random()
            if roll < 0.04:
                continue  # removed
            if roll < 0.20 and not u.template:
                u = replace(u, category="BOTH")
            units.append(u)
        status = band_status(units, PLAN_CONFIG)
        verdicts[status.eligible] += 1
        for seed in SEEDS[:25]:
            chosen = check_run(units, seed)
            if status.eligible:
                assert all(u.subject == s.subject for u, s in zip(chosen, campaign_specs(), strict=True))
    assert verdicts[True] and verdicts[False]  # both outcomes were exercised


# --- R30 body --------------------------------------------------------------------------------------------------------


def header(activity_id: str, subject: str, topic: str, category: str, ages: tuple[int, int]) -> dict:
    return {
        "pk": "ACT",
        "sk": activity_id,
        "state": "PUBLISHED",
        "publishedVersion": VERSION,
        "subject": subject,
        "topicId": topic,
        "rewardCategory": category,
        "minAge": Decimal(ages[0]),
        "maxAge": Decimal(ages[1]),
        "authoringMode": "FIXED",
        "domainSize": Decimal(1),
        "interactionType": "MULTIPLE_CHOICE",
    }


def test_bank_status_reports_every_band_and_what_to_add() -> None:
    headers = [
        header("ma-0001", "maths", "maths-bonds-to10", "BOTH", (5, 6)),
        header("ph-0001", "phonics", "phonics-initial-sounds", "NORMAL", (5, 5)),
        {**header("sp-0001", "spelling", "spelling-cvc-build", "BOTH", (5, 7)), "state": "DRAFT"},
    ]
    body = bank_status(headers, LIVE_CONFIG)
    assert body["rules"]["starterUntilEligible"] is True
    assert body["rules"]["campaignSlots"] == {"NORMAL": 49, "METEOR": 5}
    assert [b["ageBand"] for b in body["ageBands"]] == list(AGE_BANDS)
    five, six, seven = body["ageBands"]
    assert (five["mode"], five["eligible"], five["activities"]) == ("STARTER", False, 2)
    rows = {(g["subject"], g["rewardCategory"]): g for g in five["groups"]}
    assert rows[("maths", "METEOR")] == {
        "subject": "maths",
        "rewardCategory": "METEOR",
        "count": 1,
        "threshold": 4,
        "hardMinimum": 2,
        "ok": False,
        "topics": [{"topicId": "maths-bonds-to10", "count": 1}],
    }
    assert rows[("phonics", "METEOR")]["count"] == 0  # a NORMAL unit never counts for meteor slots
    needs = {(n["what"], n.get("subject"), n.get("rewardCategory")): n for n in five["needs"]}
    assert needs[("UNITS", "maths", "NORMAL")]["more"] == 33
    assert needs[("TOPICS", "spelling", None)] == {
        "what": "TOPICS",
        "subject": "spelling",
        "have": 0,
        "need": 5,
        "more": 5,
    }
    assert needs[("TEMPLATE_INSTANCES", "maths", "NORMAL")]["more"] == 500
    assert six["mode"] == "STARTER" and six["activities"] == 1
    assert (seven["mode"], seven["activities"]) == ("BLOCKED", 0)  # nothing for age 7: new games are refused
    assert bank_status(headers, PLAN_CONFIG)["ageBands"][0]["mode"] == "BLOCKED"  # the plan rule refuses age 5


def test_starter_mode_needs_every_released_wave_set_to_fill() -> None:
    """A band with only NORMAL activities plays a wave set without meteors, but not one with a meteor slot: the mode
    says BLOCKED rather than 'new games still start' when POST /api/runs would refuse (SLOT_UNFILLED)."""
    headers = [header("ma-0001", "maths", "maths-bonds-to10", "NORMAL", (6, 6))]
    units = units_for_band(headers, 6)
    no_meteor = [("first-contact", slot_specs(2, [], [30]))]
    with_meteor = [("first-contact", slot_specs(2, [], [30])), ("long-night", slot_specs(2, [1], [30]))]
    assert band_view(6, units, LIVE_CONFIG, no_meteor)["mode"] == "STARTER"
    view = band_view(6, units, LIVE_CONFIG, with_meteor)
    assert view["mode"] == "BLOCKED"
    assert view["waveSets"] == [
        {"waveSetId": "first-contact", "fillable": True},
        {"waveSetId": "long-night", "fillable": False},
    ]
    with pytest.raises(BankNotReady):  # what run creation does on the meteor wave set
        select_units(with_meteor[1][1], units, SEEDS[0], LIVE_CONFIG)
    assert band_view(6, units, LIVE_CONFIG, [])["mode"] == "BLOCKED"  # no released wave set: nothing to start
    assert band_view(6, units, LIVE_CONFIG)["mode"] == "BLOCKED"  # unknown wave sets: a meteor unit is needed too
    both = units_for_band(
        [
            header("ma-0001", "maths", "maths-bonds-to10", "BOTH", (6, 6)),
            header("ma-0002", "maths", "maths-bonds-to10", "BOTH", (6, 6)),
        ],
        6,
    )
    assert band_view(6, both, LIVE_CONFIG, with_meteor)["mode"] == "STARTER"


def test_bank_status_counts_are_the_selectors_counts() -> None:
    units = eligible_bank()
    view = band_view(6, units, LIVE_CONFIG)
    groups = group_units(units)
    assert {(g["subject"], g["rewardCategory"]): g["count"] for g in view["groups"]} == {
        key: len(members) for key, members in groups.items()
    }
    assert (view["mode"], view["eligible"], view["needs"]) == ("READY", True, [])
    assert {(s, k) for s in SUBJECTS for k in SLOT_KINDS} == set(groups)


def starter_pack_headers() -> list[dict]:
    headers = []
    for path in sorted(glob.glob(str(REPO / "content" / "seed" / "activities" / "*.json"))):
        d = json.loads(Path(path).read_text())
        headers.append(
            header(d["activityId"], d["subject"], d["topicId"], d["rewardCategory"], (d["minAge"], d["maxAge"]))
        )
    return headers


def test_the_starter_pack_keeps_the_live_game_playable_at_every_age() -> None:
    """The owner's bank on 2026-11-16 is the starter pack (content/seed/activities, ADR-0028), far below the plan's
    thresholds. Under the live configuration every age still gets a game on the live wave set (first-contact, one
    slot); under the plan's rule alone every age would be BANK_NOT_READY."""
    headers = starter_pack_headers()
    assert headers, "content/seed/activities is empty"
    specs = slot_specs(2, [], [30])
    for band in AGE_BANDS:
        units = units_for_band(headers, band)
        assert units, band
        view = band_view(band, units, LIVE_CONFIG)
        assert view["mode"] in ("STARTER", "READY")
        assert len(select_units(specs, units, SEEDS[0], LIVE_CONFIG)) == 1
        if not view["eligible"]:
            with pytest.raises(BankNotReady):
                select_units(specs, units, SEEDS[0], PLAN_CONFIG)
