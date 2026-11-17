"""Phase 54: endless slot blocks (M4-05; C24.6, F §3.6, spine S5.3). Pure tests of shared/selection/endless.py."""

from __future__ import annotations

import pytest

from shared.selection.bank import Unit
from shared.selection.endless import LAST_INTERVAL, blocks_to_plan, choose_block, endless_specs

ROTATION = ["frost-pulse", "comet-burst", "colony-shield"]


def unit(activity: str, subject: str, category: str = "NORMAL", *, template: bool = False, instance: int = 0) -> Unit:
    return Unit(
        activity, "v1", subject, f"{subject}-topic", category, "MULTIPLE_CHOICE", instance=instance, template=template
    )


@pytest.mark.parametrize(
    ("planned_through", "wave", "blocks"),
    [
        (49, 51, [(50, 59), (60, 69)]),  # CHOOSE_ENDLESS: wave 51, plannedThrough 49 -> two blocks
        (69, 60, []),  # 69 >= (60 - 1) + 10: nothing due
        (69, 61, [(70, 79)]),  # one block whenever the wave reaches 61, 71, ...
        (979, 989, [(980, 989), (990, 998)]),
        (989, 997, [(990, 998)]),  # the last block stops at 998
        (998, 998, []),  # never above interval 998
        (998, 999, []),  # wave 999 needs no slot: the run completes there
    ],
)
def test_blocks_keep_k_ahead_and_never_pass_998(planned_through: int, wave: int, blocks: list) -> None:
    assert blocks_to_plan(planned_through, wave) == blocks
    assert all(last <= LAST_INTERVAL for _, last in blocks)


def test_specs_pay_the_endless_reward_and_continue_the_power_rotation() -> None:
    specs = endless_specs(50, 69, reward=75, meteors_before=5, final_wave=50, rotation=ROTATION)
    assert [s.slot_id for s in specs if s.kind == "NORMAL"] == [f"N-0{i}" for i in range(50, 70)]
    assert all(s.reward == {"credits": 75} for s in specs if s.kind == "NORMAL")
    meteors = [(s.slot_id, s.reward["powerId"]) for s in specs if s.kind == "METEOR"]
    assert meteors == [("M-059", "colony-shield"), ("M-069", "frost-pulse")]  # the 6th and 7th meteors of the run
    assert [s.slot_id for s in specs][9:11] == ["N-059", "M-059"]  # the normal activity before the meteor


def test_never_a_repeat_and_the_fallback_order_then_no_slot() -> None:
    units = [unit("ma-1", "maths"), unit("ph-1", "phonics"), unit("sp-1", "spelling")]
    specs = endless_specs(50, 54, reward=75, meteors_before=5, final_wave=50, rotation=ROTATION)
    picks = choose_block(specs, units, seed="s", label="endless:50", used_activities=["ph-1"])
    chosen = [(spec.slot_id, u.activity_id) for spec, u in picks]
    # N-050 is spelling by rotation (interval 50 -> SUBJECTS[49 % 3]); the rest fall back maths, phonics, spelling.
    assert len(chosen) == 2 and {a for _, a in chosen} == {"ma-1", "sp-1"}
    assert "ph-1" not in {a for _, a in chosen}  # used earlier in the run: never again
    assert len({a for _, a in chosen}) == len(chosen)  # nothing twice in a block


def test_an_empty_bank_plans_nothing() -> None:
    specs = endless_specs(50, 59, reward=75, meteors_before=5, final_wave=50, rotation=ROTATION)
    assert choose_block(specs, [], seed="s", label="endless:50", used_activities=[]) == []


def test_a_template_offers_two_instance_units_per_block_even_when_used_before() -> None:
    units = [unit("ma-t", "maths", template=True, instance=0), unit("ma-t", "maths", template=True, instance=1)]
    specs = endless_specs(50, 59, reward=75, meteors_before=5, final_wave=50, rotation=ROTATION)
    picks = choose_block(specs, units, seed="s", label="endless:50", used_activities=["ma-t"])
    assert len(picks) == 2  # new instances are drawn later (build_block never repeats one the run holds)
