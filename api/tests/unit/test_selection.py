"""Selection at run creation (C24; spine S5.3; M1-16, and the Milestone 1 rules kept as STARTER_CONFIG). Pure functions:
no tables, no clock. Properties from C24.9 where Milestone 1 already has the parts."""

from __future__ import annotations

import hashlib
import itertools
from collections import Counter

import pytest

from shared.selection.bank import CATEGORIES, Unit, fills, units_for_band
from shared.selection.draws import draw, shuffle
from shared.selection.plan import (
    STARTER_CONFIG,
    BankNotReady,
    SelectionConfig,
    SlotSpec,
    choose_units,
    pack_id,
    plan_slots,
    slot_specs,
    spells_answer,
)

CAMPAIGN_REWARDS = [30] * 9 + [40] * 10 + [50] * 10 + [60] * 10 + [75] * 10  # C9.2, intervals 1-49
STRICT = SelectionConfig(thresholds=STARTER_CONFIG.thresholds, subject_fallback=False)


def unit(activity_id: str, subject: str, topic: str, category: str = "NORMAL") -> Unit:
    return Unit(activity_id, "20261120T120000Z", subject, topic, category, "MULTIPLE_CHOICE")


def bank(per_subject: int, topics: int = 4, meteors: int = 2) -> list[Unit]:
    units = []
    for subject in ("maths", "phonics", "spelling"):
        units += [unit(f"{subject[:2]}-{n:04d}", subject, f"{subject}-t{n % topics}") for n in range(per_subject)]
        units += [unit(f"{subject[:2]}-m{n:03d}", subject, f"{subject}-m", "METEOR") for n in range(meteors)]
    return units


def mc_version(options: str = "abcd", demo: dict | None = None) -> dict:
    version = {
        "interactionType": "MULTIPLE_CHOICE",
        "activityPayload": {"options": [{"id": o, "text": o} for o in options]},
        "speechDefinitionReferences": {"prompt": {"speechId": "s", "speechVersion": "v", "clipKey": "k" * 64}},
    }
    if demo is not None:
        version["introductionContent"] = demo
    return version


# --- Draws (C24.5) --------------------------------------------------------------------------------------------------


def test_draw_is_the_first_8_bytes_of_the_labelled_sha256() -> None:
    expected = int.from_bytes(hashlib.sha256(b"00000000000000a1|order:N-001|3").digest()[:8], "big")
    assert draw("00000000000000a1", "order:N-001", 3) == expected


def test_shuffle_is_a_seeded_permutation() -> None:
    items = list(range(20))
    once = shuffle(items, "seed-1", "topics:NORMAL:maths")
    assert sorted(once) == items and once != items
    assert shuffle(items, "seed-1", "topics:NORMAL:maths") == once
    assert shuffle(items, "seed-2", "topics:NORMAL:maths") != once
    assert shuffle(items, "seed-1", "topics:NORMAL:phonics") != once  # each decision its own stream
    assert items == list(range(20))  # the input is untouched


# --- The slot plan (C24.2) ------------------------------------------------------------------------------------------


def test_campaign_slots_follow_the_two_rotation_formulas() -> None:
    specs = slot_specs(50, [9, 19, 29, 39, 49], CAMPAIGN_REWARDS)
    normal = [s for s in specs if s.kind == "NORMAL"]
    meteors = [s for s in specs if s.kind == "METEOR"]
    assert [s.slot_id for s in normal[:3]] == ["N-001", "N-002", "N-003"] and normal[-1].slot_id == "N-049"
    assert Counter(s.subject for s in normal) == {"maths": 17, "phonics": 16, "spelling": 16}
    assert [s.subject for s in normal[:6]] == ["maths", "phonics", "spelling"] * 2
    assert [(s.slot_id, s.subject) for s in meteors] == [
        ("M-009", "maths"), ("M-019", "phonics"), ("M-029", "spelling"), ("M-039", "maths"), ("M-049", "phonics"),
    ]  # fmt: skip
    for meteor in meteors:  # never the same subject as the normal slot of the same interval
        assert meteor.subject != next(s.subject for s in normal if s.interval == meteor.interval)
    assert 3 + len(specs) == 57  # G7's action count for the campaign


def test_play_order_puts_the_normal_slot_before_the_meteor() -> None:
    specs = slot_specs(11, [9], [30] * 10)
    assert [s.slot_id for s in specs][8:10] == ["N-009", "M-009"]


def test_rewards_come_from_the_interval_and_the_meteor_number_never_from_content() -> None:
    specs = slot_specs(50, [9, 19, 29, 39, 49], CAMPAIGN_REWARDS)
    by_id = {s.slot_id: s.reward for s in specs}
    assert by_id["N-001"] == {"credits": 30} and by_id["N-010"] == {"credits": 40} and by_id["N-049"] == {"credits": 75}
    assert [by_id[f"M-0{n}9"]["powerId"] for n in range(5)] == [
        "frost-pulse", "comet-burst", "colony-shield", "frost-pulse", "comet-burst",
    ]  # fmt: skip


def test_the_m1_wave_set_has_one_slot() -> None:
    [spec] = slot_specs(2, [], [30])
    assert (spec.slot_id, spec.kind, spec.subject, spec.reward) == ("N-001", "NORMAL", "maths", {"credits": 30})


# --- Choosing units (C24.4) -----------------------------------------------------------------------------------------


def test_the_m1_phonics_activity_fills_the_maths_slot_through_the_m1_fallback() -> None:
    specs = slot_specs(2, [], [30])
    only = [unit("ph-0102", "phonics", "phonics-gpc-consonant-digraphs")]
    assert choose_units(specs, only, "s", STARTER_CONFIG) == only
    with pytest.raises(BankNotReady):
        choose_units(specs, only, "s", STRICT)  # the product rule (fallback off) cannot fill N-001


def test_a_full_campaign_never_repeats_and_spreads_topics() -> None:
    specs = slot_specs(50, [9, 19, 29, 39, 49], CAMPAIGN_REWARDS)
    chosen = choose_units(specs, bank(per_subject=20), "seed", STRICT)
    assert len({u.activity_id for u in chosen}) == len(chosen) == 54
    for spec, picked in zip(specs, chosen, strict=True):
        assert (picked.subject, picked.category) == (spec.subject, spec.kind)
    pairs = zip(specs, chosen, strict=True)
    maths_topics = [u.topic_id for s, u in pairs if s.kind == "NORMAL" and s.subject == "maths"]
    counts = Counter(maths_topics[:8])
    assert max(counts.values()) == 2 and min(counts.values()) == 2  # round-robin: every topic before any repeats


def test_same_seed_same_plan_and_different_seeds_differ() -> None:
    specs = slot_specs(50, [9, 19, 29, 39, 49], CAMPAIGN_REWARDS)
    units = bank(per_subject=30)
    first = choose_units(specs, units, "seed-a", STRICT)
    assert choose_units(specs, units, "seed-a", STRICT) == first
    assert choose_units(specs, units, "seed-b", STRICT) != first


def test_one_unit_short_is_bank_not_ready_never_a_partial_run() -> None:
    specs = slot_specs(50, [9, 19, 29, 39, 49], CAMPAIGN_REWARDS)
    units = [u for u in bank(per_subject=17) if not (u.subject != "maths" and u.activity_id.endswith("16"))]
    choose_units(specs, units, "s", STRICT)  # exactly enough: 17 maths, 16 phonics, 16 spelling
    short = [u for u in units if u.activity_id != "ma-0000"]
    with pytest.raises(BankNotReady):
        choose_units(specs, short, "s", STRICT)


def test_a_group_below_its_threshold_is_bank_not_ready() -> None:
    specs = slot_specs(2, [], [30])
    config = SelectionConfig(thresholds={("maths", "NORMAL"): 2}, subject_fallback=False)
    with pytest.raises(BankNotReady):
        choose_units(specs, [unit("ma-0001", "maths", "t")], "s", config)
    assert choose_units(specs, [unit("ma-0001", "maths", "t"), unit("ma-0002", "maths", "t")], "s", config)


# --- rewardCategory BOTH (2026-11-16): a member of both groups of its subject, still used once per run ------------


def spec(kind: str, subject: str = "maths", interval: int = 1) -> SlotSpec:
    prefix = "N" if kind == "NORMAL" else "M"
    reward = {"credits": 30} if kind == "NORMAL" else {"credits": 0, "powerId": "frost-pulse"}
    return SlotSpec(f"{prefix}-{interval:03d}", kind, interval, subject, reward)


SEEDS = [f"seed-{n}" for n in range(40)]


@pytest.mark.parametrize("kind", ["NORMAL", "METEOR"])
def test_a_both_unit_fills_either_slot_kind(kind: str) -> None:
    only = [unit("ma-0001", "maths", "maths-bonds-to10", "BOTH")]
    for seed in SEEDS:
        assert choose_units([spec(kind)], only, seed, STRICT) == only


def test_a_both_unit_fills_at_most_one_slot_per_run() -> None:
    both = unit("ma-0001", "maths", "maths-bonds-to10", "BOTH")
    specs = [spec("NORMAL"), spec("METEOR")]
    with pytest.raises(BankNotReady):
        choose_units(specs, [both], "s", STRICT)  # the meteor group passes over the unit the normal slot took
    meteor = unit("ma-0002", "maths", "maths-bonds-to10", "METEOR")
    for seed in SEEDS:  # N-001 can only take the BOTH unit; M-001 then skips it and takes the METEOR unit
        assert choose_units(specs, [both, meteor], seed, STRICT) == [both, meteor]


def test_a_campaign_with_both_units_never_repeats_and_fills_each_slot_kind() -> None:
    specs = slot_specs(50, [9, 19, 29, 39, 49], CAMPAIGN_REWARDS)
    units = bank(per_subject=20) + [
        unit(f"{subject[:2]}-b{n:03d}", subject, f"{subject}-t{n}", "BOTH")
        for subject in ("maths", "phonics", "spelling")
        for n in range(3)
    ]
    for seed in SEEDS:
        chosen = choose_units(specs, units, seed, STRICT)
        assert len({u.activity_id for u in chosen}) == len(chosen) == 54
        for slot, picked in zip(specs, chosen, strict=True):
            assert picked.subject == slot.subject and fills(picked.category, slot.kind)
    both_used = {u.category for seed in SEEDS for u in choose_units(specs, units, seed, STRICT)}
    assert "BOTH" in both_used


@pytest.mark.parametrize("config", [STRICT, STARTER_CONFIG], ids=["strict", "m1"])
def test_a_normal_slot_never_strands_a_meteor_slot_that_only_a_both_unit_can_fill(config: SelectionConfig) -> None:
    """Greedy alone took the BOTH unit for N-001 on about half the seeds and then refused the run; the swap gives
    N-001 the NORMAL-only unit instead, on every seed."""
    both = unit("ma-0001", "maths", "maths-t1", "BOTH")
    normal = unit("ma-0002", "maths", "maths-t2", "NORMAL")
    specs = [spec("NORMAL"), spec("METEOR")]
    for seed in [f"seed{n}" for n in range(200)]:
        assert choose_units(specs, [both, normal], seed, config) == [normal, both]


def test_the_swap_crosses_subjects_under_the_fallback() -> None:
    both = unit("ma-0001", "maths", "maths-t1", "BOTH")
    phonics = unit("ph-0001", "phonics", "phonics-t1", "NORMAL")
    specs = [spec("NORMAL"), spec("METEOR")]
    for seed in SEEDS:
        assert choose_units(specs, [both, phonics], seed, STARTER_CONFIG) == [phonics, both]
    with pytest.raises(BankNotReady):
        choose_units(specs, [both, phonics], "s", STRICT)  # without the fallback N-001 cannot take phonics


def _fillable(specs: list[SlotSpec], units: list[Unit], config: SelectionConfig) -> bool:
    """Brute force: does any one-to-one assignment of units to slots exist?"""

    def fits(u: Unit, slot: SlotSpec) -> bool:
        return fills(u.category, slot.kind) and (config.subject_fallback or u.subject == slot.subject)

    return any(
        all(fits(u, slot) for u, slot in zip(pick, specs, strict=True))
        for pick in itertools.permutations(units, len(specs))
    )


@pytest.mark.parametrize("config", [STRICT, STARTER_CONFIG], ids=["strict", "m1"])
def test_a_run_is_refused_only_when_no_assignment_exists(config: SelectionConfig) -> None:
    """Against brute force, over small random banks mixing NORMAL, METEOR and BOTH units in two subjects."""
    kinds = [("NORMAL", 1, "maths"), ("NORMAL", 2, "phonics"), ("METEOR", 2, "maths"), ("NORMAL", 3, "maths")]
    for case in range(300):
        pick = iter(draw("brute-force", f"case-{case}", i) for i in itertools.count())  # deterministic test data
        units = [
            unit(
                f"u-{n:04d}",
                ("maths", "phonics")[next(pick) % 2],
                f"t{next(pick) % 2}",
                CATEGORIES[next(pick) % len(CATEGORIES)],
            )
            for n in range(1 + next(pick) % 5)
        ]
        specs = [spec(kind, subject, interval) for kind, interval, subject in kinds[: 1 + next(pick) % 4]]
        specs.sort(key=lambda slot: (slot.interval, slot.kind != "NORMAL"))
        expected = _fillable(specs, units, config)
        seed = f"case-{case}"
        try:
            chosen = choose_units(specs, units, seed, config)
        except BankNotReady:
            assert not expected, (units, specs, seed)
            continue
        assert expected
        assert len({u.activity_id for u in chosen}) == len(chosen) == len(specs)
        for slot, picked in zip(specs, chosen, strict=True):
            assert fills(picked.category, slot.kind)
            assert config.subject_fallback or picked.subject == slot.subject


@pytest.mark.parametrize("kind", ["NORMAL", "METEOR"])
def test_group_thresholds_count_both_units(kind: str) -> None:
    config = SelectionConfig(thresholds={("maths", kind): 2}, subject_fallback=False)
    own = unit("ma-0001", "maths", "t", kind)
    with pytest.raises(BankNotReady):
        choose_units([spec(kind)], [own], "s", config)
    assert choose_units([spec(kind)], [own, unit("ma-0002", "maths", "t", "BOTH")], "s", config)


def test_fills() -> None:
    assert [fills(c, k) for c in ("NORMAL", "METEOR", "BOTH") for k in ("NORMAL", "METEOR")] == [
        True, False, False, True, True, True,
    ]  # fmt: skip


# --- The bank filter --------------------------------------------------------------------------------------------------


def header(**changes: object) -> dict:
    base = {
        "sk": "ph-0102", "subject": "phonics", "topicId": "t", "rewardCategory": "NORMAL", "minAge": 5, "maxAge": 6,
        "interactionType": "MULTIPLE_CHOICE", "authoringMode": "FIXED", "state": "PUBLISHED",
        "publishedVersion": "20261120T120000Z",
    }  # fmt: skip
    return {**base, **changes}


@pytest.mark.parametrize(
    ("changes", "band", "selected"),
    [
        ({}, 5, True),
        ({}, 6, True),
        ({}, 7, False),
        ({"state": "RETIRED"}, 5, False),
        ({"state": "DRAFT", "publishedVersion": None}, 5, False),
        ({"authoringMode": "TEMPLATE"}, 5, False),  # no domainSize: never published by the Phase 41 code
        ({"authoringMode": "TEMPLATE", "domainSize": 38}, 5, True),
        ({"authoringMode": "TEMPLATE", "domainSize": 0}, 5, False),
        ({"authoringMode": "SOMETHING", "domainSize": 1}, 5, False),
        ({"subject": "science"}, 5, False),
        ({"rewardCategory": "BOTH"}, 5, True),
        ({"rewardCategory": "SOMETIMES"}, 5, False),
    ],
)
def test_units_for_band(changes: dict, band: int, selected: bool) -> None:
    assert bool(units_for_band([header(**changes)], band)) is selected


# --- Pinned details ---------------------------------------------------------------------------------------------------


def test_presentation_intro_and_clips_are_pinned_from_the_version() -> None:
    specs = slot_specs(4, [], [30, 30, 30])
    chosen = [unit("ph-0001", "phonics", "digraphs"), unit("ph-0002", "phonics", "digraphs"),
              unit("ph-0003", "phonics", "other")]  # fmt: skip
    versions = {
        ("ph-0001", "20261120T120000Z"): mc_version(demo={"cards": [{"text": "x"}]}),
        ("ph-0002", "20261120T120000Z"): mc_version(demo={"cards": [{"text": "y"}]}),
        ("ph-0003", "20261120T120000Z"): mc_version(),
    }
    plans = plan_slots(specs, chosen, versions, "seed")
    assert [p.intro for p in plans] == ["AUTO", "ON_REQUEST", None]  # first of the concept, later, no demonstration
    assert all(sorted(p.presentation["optionOrder"]) == list("abcd") for p in plans)
    assert plan_slots(specs, chosen, versions, "seed") == plans  # same seed: same layout after any reload
    assert plans[0].clips == {"prompt": {"speechId": "s", "speechVersion": "v", "clipKey": "k" * 64}}
    assert len(pack_id(plans)) == 64


def test_a_missing_or_withdrawn_chosen_version_is_bank_not_ready() -> None:
    specs = slot_specs(2, [], [30])
    chosen = [unit("ph-0001", "phonics", "t")]
    with pytest.raises(BankNotReady):
        plan_slots(specs, chosen, {}, "s")
    withdrawn = {("ph-0001", "20261120T120000Z"): {**mc_version(), "withdrawn": {"at": "x", "reason": "y"}}}
    with pytest.raises(BankNotReady):
        plan_slots(specs, chosen, withdrawn, "s")


@pytest.mark.parametrize(("interaction_type", "ordered"), [("PICTURE_SELECT", True), ("NUMBER_SELECT", False)])
def test_picture_cards_are_shuffled_numbers_are_not(interaction_type: str, ordered: bool) -> None:
    """Phase 37: picture cards get a fixed shuffled order like multiple choice; a number track keeps counting order."""
    specs = slot_specs(2, [], [30])
    version = {
        "interactionType": interaction_type,
        "activityPayload": {
            "options": [{"id": o, "assetId": f"pic-{o}", "alt": o} for o in "abcd"],
            "numberSet": {"kind": "RANGE", "min": 0, "max": 10, "step": 1},
        },
    }
    plans = plan_slots(specs, [unit("ma-0001", "maths", "t")], {("ma-0001", "20261120T120000Z"): version}, "seed")
    if ordered:
        assert sorted(plans[0].presentation["optionOrder"]) == list("abcd")
    else:
        assert plans[0].presentation == {}


def _arrange(mode: str, values: list[str], accepted: list[str], slots: int) -> dict:
    return {
        "interactionType": "ARRANGE",
        "activityPayload": {"mode": mode, "tiles": [{"id": f"t{i}", "value": v} for i, v in enumerate(values)],
                            "slots": slots},
        "answerSpecification": {"accepted": accepted},
    }  # fmt: skip


def test_arrange_tiles_get_a_seeded_order_that_never_spells_the_answer() -> None:
    """C24.4 step 7: ARRANGE tiles are shuffled with the seed and stored on the slot; a shuffle that spells an
    accepted answer (any run of neighbouring tiles for LETTERS, the whole row for SEQUENCE) is re-drawn."""
    specs = slot_specs(2, [], [30])
    chosen = [unit("sp-0001", "spelling", "t")]
    letters = _arrange("LETTERS", ["o", "c", "a", "t"], ["cat"], 3)
    seen = set()
    for n in range(60):
        plans = plan_slots(specs, chosen, {("sp-0001", "20261120T120000Z"): letters}, f"seed-{n}")
        order = plans[0].presentation["tileOrder"]
        assert sorted(order) == ["t0", "t1", "t2", "t3"]
        shown = "".join({"t0": "o", "t1": "c", "t2": "a", "t3": "t"}[i] for i in order)
        assert "cat" not in shown
        assert plan_slots(specs, chosen, {("sp-0001", "20261120T120000Z"): letters}, f"seed-{n}") == plans
        seen.add(tuple(order))
    assert len(seen) > 1  # the layout changes between runs

    two = _arrange("SEQUENCE", ["2", "1"], ["1,2"], 2)
    for n in range(20):
        plans = plan_slots(specs, chosen, {("sp-0001", "20261120T120000Z"): two}, f"seed-{n}")
        assert plans[0].presentation["tileOrder"] == ["t0", "t1"]  # the only order that does not give the answer


def test_spells_answer_finds_a_run_anywhere_in_the_row() -> None:
    assert spells_answer(["o", "c", "a", "t"], "LETTERS", ["cat"])
    assert spells_answer(["r", "ai", "n", "a"], "LETTERS", ["rain"])
    assert not spells_answer(["t", "a", "c", "o"], "LETTERS", ["cat"])
    assert spells_answer(["1", "2"], "SEQUENCE", ["1,2"])
    assert not spells_answer(["2", "1"], "SEQUENCE", ["1,2"])
