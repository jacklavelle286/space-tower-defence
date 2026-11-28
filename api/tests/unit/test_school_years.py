"""YG1 (owner 2026-11-28): a profile's school year picks its questions, and a game on Hard plays the year above.

The band is the school year + 5 (contracts/limits.json `schoolYears`): Reception 5, Year 1 6, Year 2 7 (the bands that
were ages 5-7), Year 3 8 ... A profile made before YG1 has only a date of birth; its age, 5 to 7, stays its band until a
school year is set. The test bank (fixtures/content/m1-bank.json) has questions for bands 5 and 6 only.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest
from runs_harness import RunsApi

from shared.profile import band_for, school_year

ME = {"nickname": "Star Kid", "avatarId": "avatar-03"}


@pytest.fixture
def api(ddb: Any) -> RunsApi:
    return RunsApi(ddb)


def put(api: RunsApi, base: dict, **fields: Any) -> tuple[int, Any]:
    return api.call(base, "PUT /api/me/profile", {**ME, **fields})


@pytest.mark.parametrize(("year", "easy", "hard"), [(0, 5, 6), (2, 7, 8), (4, 9, 10), (5, 10, 11)])
def test_the_school_year_gives_the_band_and_hard_the_year_above(
    api: RunsApi, player_event: dict, year: int, easy: int, hard: int
) -> None:
    status, body = put(api, player_event, schoolYear=year)
    assert status == 200
    assert (body["schoolYear"], body["ageBand"], body["hardAgeBand"], body["age"]) == (year, easy, hard, None)
    planets = api.call(player_event, "GET /api/planets")[1]
    assert (planets["schoolYear"], planets["ageBand"], planets["hardAgeBand"]) == (year, easy, hard)
    assert "dob" not in api.item("PROFILE")  # no date of birth is asked for or kept


def test_setting_the_school_year_on_an_older_profile_replaces_its_age(api: RunsApi, player_event: dict) -> None:
    api.profile(player_event)  # date of birth: age 5, band 5
    assert api.call(player_event, "GET /api/me")[1]["ageBand"] == 5
    status, body = api.call(player_event, "PATCH /api/me/profile", {"schoolYear": 4})
    assert status == 200 and (body["ageBand"], body["hardAgeBand"]) == (9, 10)
    status, body = put(api, player_event, schoolYear=2)  # a PUT with a school year drops the stored date of birth
    assert status == 200 and body["age"] is None and "dob" not in api.item("PROFILE")


@pytest.mark.parametrize(("value", "rule"), [("2", "type"), (True, "type"), (2.0, "type"), (6, "enum"), (-1, "enum")])
def test_a_bad_school_year_is_refused(api: RunsApi, player_event: dict, value: Any, rule: str) -> None:
    status, body = put(api, player_event, schoolYear=value)
    assert status == 400
    assert body["error"]["details"] == [{"field": "schoolYear", "rule": rule}]


def test_easy_plays_the_school_year_and_hard_the_year_above(api: RunsApi, player_event: dict) -> None:
    put(api, player_event, schoolYear=0)
    status, body = api.create(player_event)
    assert status == 201, body
    assert (body["run"]["pins"]["ageBand"], body["run"]["pins"]["difficulty"]) == (5, "EASY")
    status, body = api.create(player_event, run_id="22222222-2222-4222-8222-222222222222", difficulty="HARD",
                              takeover=True)  # fmt: skip
    assert status == 201, body
    assert (body["run"]["pins"]["ageBand"], body["run"]["pins"]["difficulty"]) == (6, "HARD")
    runs = api.call(player_event, "GET /api/me")[1]["runs"]
    assert sorted(r["difficulty"] for r in runs) == ["EASY", "HARD"]  # Continue can say which


def test_hard_with_no_questions_for_the_year_above_is_not_ready(api: RunsApi, player_event: dict) -> None:
    put(api, player_event, schoolYear=1)  # Year 1: band 6 has questions, band 7 has none in this bank
    status, body = api.create(player_event, difficulty="HARD")
    assert status == 409
    assert body["error"]["code"] == "CONTENT_UNAVAILABLE"
    assert body["error"]["details"] == {"reason": "BANK_NOT_READY"}
    assert api.create(player_event)[0] == 201  # Easy still works


def test_a_bad_difficulty_is_refused(api: RunsApi, player_event: dict) -> None:
    put(api, player_event, schoolYear=0)
    status, body = api.create(player_event, difficulty="MEDIUM")
    assert status == 400 and body["error"]["details"] == [{"field": "difficulty", "rule": "enum"}]


def test_band_rules_directly() -> None:
    today = date(2026, 11, 28)
    assert band_for({"schoolYear": 3}, today) == 8
    assert band_for({"schoolYear": 3}, today, "HARD") == 9
    assert band_for({}, today) is None and band_for({}, today, "HARD") is None
    assert band_for({"dob": "2018-01-01"}, today) is None  # age 8 without a school year: no band, as before YG1
    assert band_for({"dob": "2020-06-01"}, today) == 6  # age 6
    assert school_year({"schoolYear": True}) is None and school_year({"schoolYear": 9}) is None
