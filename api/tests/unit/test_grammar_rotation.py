"""YG2 (ADR-0056): from Year 3 (band 8) the subject rotation is maths, grammar, spelling; to Year 2 it stays maths,
phonics, spelling. A band's units hold only its own subjects, and bank status names the band's subjects."""

from __future__ import annotations

from test_selection_eligibility import header, unit

from shared.selection.bank import subjects_for, units_for_band
from shared.selection.eligibility import band_status, band_view, campaign_specs
from shared.selection.plan import LIVE_CONFIG, STARTER_CONFIG, choose_units, for_band, slot_specs


def test_the_rotation_moves_from_phonics_to_grammar_at_year_3() -> None:
    assert subjects_for(7) == ("maths", "phonics", "spelling")  # Year 2
    assert subjects_for(8) == ("maths", "grammar", "spelling")  # Year 3
    assert subjects_for(None) == ("maths", "phonics", "spelling")
    specs = slot_specs(5, [], [10, 10, 10, 10])
    assert [s.subject for s in for_band(specs, 7)] == ["maths", "phonics", "spelling", "maths"]
    assert [s.subject for s in for_band(specs, 9)] == ["maths", "grammar", "spelling", "maths"]
    assert [s.slot_id for s in for_band(specs, 9)] == [s.slot_id for s in specs]  # only the subject changes


def test_a_band_takes_only_its_own_subjects() -> None:
    headers = [
        header("gr-0001", "grammar", "grammar-a-or-an", "NORMAL", (7, 9)),
        header("ph-0001", "phonics", "phonics-initial-sounds", "NORMAL", (7, 9)),
    ]
    assert [u.activity_id for u in units_for_band(headers, 7)] == ["ph-0001"]  # Year 2: phonics, never grammar
    assert [u.activity_id for u in units_for_band(headers, 8)] == ["gr-0001"]  # Year 3: grammar, never phonics


def test_a_year_3_game_rotates_maths_grammar_spelling() -> None:
    units = [
        unit("ma-0001", "maths", "maths-times-tables-3-4-8"),
        unit("gr-0001", "grammar", "grammar-a-or-an"),
        unit("sp-0001", "spelling", "spelling-suffix-ous"),
    ]
    specs = for_band(slot_specs(4, [], [10, 10, 10]), 8)
    chosen = choose_units(specs, units, "seed-0001", STARTER_CONFIG)
    assert [u.subject for u in chosen] == ["maths", "grammar", "spelling"]


def test_bank_status_names_grammar_for_year_3_on() -> None:
    status = band_status([], LIVE_CONFIG, 8)
    assert {g.subject for g in status.groups} == {"maths", "grammar", "spelling"}
    assert {s.subject for s in band_status([], LIVE_CONFIG, 7).groups} == {"maths", "phonics", "spelling"}
    view = band_view(8, [], LIVE_CONFIG)
    assert view["mode"] == "BLOCKED" and {n["subject"] for n in view["needs"] if "subject" in n} >= {"grammar"}
    assert {s.subject for s in campaign_specs(10)} == {"maths", "grammar", "spelling"}
