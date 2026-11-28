"""R30 `GET /api/admin/bank-status` (G §12, C24.7, D §D8.5; Phase 42, M3-07) on the moto content table: the route
reads the header partition and counts it with the function selection uses, so a publish or a retire shows at once."""

from __future__ import annotations

from typing import Any

import pytest
from conftest import event_for
from test_admin_api import Admin
from test_admin_lifecycle import ACT, RETIRE, published_sh
from test_selection_eligibility import header

from shared.selection.bank import read_units
from shared.selection.eligibility import band_view
from shared.selection.plan import LIVE_CONFIG, slot_specs

FIRST_CONTACT = [("first-contact", slot_specs(2, [], [30]))]  # the released wave set: one normal slot, no meteor

ROUTE = "GET /api/admin/bank-status"


@pytest.fixture
def api(ddb: Any, player_event: dict[str, Any]) -> Admin:
    return Admin(ddb, player_event)


def counts(band: dict[str, Any]) -> dict[tuple[str, str], int]:
    return {(g["subject"], g["rewardCategory"]): g["count"] for g in band["groups"]}


def test_an_empty_bank_is_blocked_at_every_age(api: Admin) -> None:
    status, body = api.call(ROUTE)
    assert status == 200
    # YG1: one band per school year, Reception (5) to Year 6 (11).
    assert [(b["ageBand"], b["mode"], b["activities"]) for b in body["ageBands"]] == [
        (band, "BLOCKED", 0) for band in range(5, 12)
    ]


def test_publish_and_retire_show_at_once_with_the_selectors_counts(api: Admin) -> None:
    api.release_game_data()
    published_sh(api)  # ph-0102: phonics, NORMAL, ages 5-6
    maths = header("ma-0001", "maths", "maths-bonds-to10", "BOTH", (6, 7))
    new_only = {"condition": "attribute_not_exists(#pk)", "names": {"#pk": "pk"}}
    api.table.transact_write([api.table.put_action(maths, **new_only)])
    status, body = api.call(ROUTE)
    assert status == 200
    assert body["releasedWaveSets"] == ["first-contact"]
    five, six, *_ = body["ageBands"]
    assert counts(five)[("phonics", "NORMAL")] == 1 and counts(five)[("phonics", "METEOR")] == 0
    assert counts(six)[("maths", "NORMAL")] == counts(six)[("maths", "METEOR")] == 1  # BOTH counts in both
    assert [b["mode"] for b in body["ageBands"]] == ["STARTER"] * 3 + ["BLOCKED"] * 4  # nothing for Year 3 on yet
    for band in body["ageBands"]:  # exactly what selection would see for that band
        assert band == band_view(band["ageBand"], read_units(api.table, band["ageBand"]), LIVE_CONFIG, FIRST_CONTACT)
    assert all(b["waveSets"] == [{"waveSetId": "first-contact", "fillable": True}] for b in body["ageBands"][:3])

    assert api.call(RETIRE, {}, id=ACT)[0] == 200
    five = api.call(ROUTE)[1]["ageBands"][0]
    assert (five["mode"], counts(five)[("phonics", "NORMAL")]) == ("BLOCKED", 0)


def test_the_mode_runs_the_released_wave_sets_and_says_when_it_cannot(api: Admin) -> None:
    """Age 5 holds only a NORMAL phonics activity. On the released first-contact (no meteor slot) a new game starts;
    without the released game data the page cannot know the wave sets, so it asks for a meteor-capable unit too and
    says it judged without them (releasedWaveSets null)."""
    published_sh(api)
    body = api.call(ROUTE)[1]
    assert body["releasedWaveSets"] is None
    five = body["ageBands"][0]
    assert (five["mode"], five["waveSets"]) == ("BLOCKED", [])
    api.release_game_data()
    five = api.call(ROUTE)[1]["ageBands"][0]
    assert (five["mode"], five["waveSets"]) == ("STARTER", [{"waveSetId": "first-contact", "fillable": True}])


def test_bank_status_is_operator_only(api: Admin, player_event: dict[str, Any]) -> None:
    event = event_for(player_event, ROUTE, cognito__groups="[players]")
    assert api.router.handle(event)["statusCode"] == 403
