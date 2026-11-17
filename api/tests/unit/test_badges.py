"""Phase 52: C12 badges (M4-03; spine S2, S3.2, S8.1; F §10.2).

Each badge's condition (shared/badges.py), then through the handler: a badge is written once with if_not_exists, is
earned again after a campaign-progress reset empties the map, and a CHALLENGE run writes badges only, never planets.
"""

from __future__ import annotations

from typing import Any

import pytest
from runs_harness import PK, RUN_A, RunsApi, _ddb
from test_ops import NOVA_P04, TO_ACTIVITY, attempt, complete_wave, op, results, send, start_wave, transacts

from shared.badges import earned

ALL_SIX = [
    {"padId": f"p{n:02d}", "classId": c, "level": 1, "targeting": "FRONT"}
    for n, c in enumerate(["nova", "pip", "juno", "orion", "mira", "sol"], 2)
]


def state(wave: int, *, health: int = 20, placements: list | None = None, completed: bool = False) -> dict:
    return {
        "highestCompletedWave": wave,
        "campaignCompleted": completed,
        "snapshot": {
            "credits": 0,
            "placements": placements or [],
            "colony": {"health": health, "shield": 0},
            "powers": {},
        },
    }


CAMPAIGN = {"mode": "CAMPAIGN", "stage": "AUTHORED", "planetId": "luna-1"}
START = {"credits": 0, "placements": [], "colony": {"health": 15, "shield": 0}, "powers": {}}


@pytest.mark.parametrize(
    ("wave", "expected"),
    [
        (1, ["first-steps"]),
        (9, ["first-steps"]),
        (10, ["first-steps", "boss-1"]),
        (20, ["first-steps", "boss-1", "boss-2"]),
        (40, ["first-steps", "boss-1", "boss-2", "boss-3", "boss-4"]),
    ],
)
def test_campaign_thresholds(wave: int, expected: list[str]) -> None:
    assert earned(CAMPAIGN, START, state(wave, health=10)) == expected


def test_colony_hero_when_the_campaign_completes_and_star_voyager_at_60() -> None:
    assert "campaign-luna-1" in earned(CAMPAIGN, START, state(50, health=10, completed=True))
    assert "endless-60" in earned({**CAMPAIGN, "stage": "ENDLESS"}, START, state(60, health=10, completed=True))
    assert "endless-60" not in earned(CAMPAIGN, START, state(59, health=10))


def test_safe_and_sound_only_on_a_boss_wave_ending_no_lower_than_it_started() -> None:
    assert "safe-and-sound" in earned(CAMPAIGN, START, state(10, health=15))
    assert "safe-and-sound" in earned(CAMPAIGN, START, state(20, health=18))  # the boss-clear repair counts
    assert "safe-and-sound" not in earned(CAMPAIGN, START, state(10, health=14))
    assert "safe-and-sound" not in earned(CAMPAIGN, START, state(11, health=20))  # not a boss wave
    assert "safe-and-sound" not in earned({**CAMPAIGN, "stage": "ENDLESS"}, START, state(60, health=20))


def test_full_crew_and_top_team_on_any_run() -> None:
    challenge = {"mode": "CHALLENGE", "stage": "AUTHORED", "planetId": "luna-1"}
    assert earned(challenge, START, state(1, placements=ALL_SIX)) == ["full-crew"]
    level_3 = [{**ALL_SIX[0], "level": 3}]
    assert earned(challenge, START, state(1, placements=level_3)) == ["top-team"]
    assert earned(challenge, START, state(1, placements=ALL_SIX[:5])) == []  # five classes are not a full crew


def test_a_challenge_badge_for_its_final_wave_only() -> None:
    run = {"mode": "CHALLENGE", "stage": "AUTHORED", "planetId": "luna-1", "waveSetId": "blob-parade"}
    done = {**state(5), "status": "COMPLETED"}
    assert earned(run, START, done) == ["challenge-blob-parade"]
    assert earned(run, START, {**state(4), "status": "IN_PROGRESS"}) == []
    assert earned({**run, "waveSetId": "first-contact"}, START, done) == []  # the Milestone 1 set has no badge
    assert "first-steps" not in earned(run, START, done)  # never a campaign badge from a challenge


# --- Through the handler ------------------------------------------------------------------------------------------


@pytest.fixture
def api(ddb: Any, player_event: dict) -> RunsApi:
    api = RunsApi(ddb)
    api.profile(player_event)
    assert api.create(player_event)[0] == 201
    return api


def badges(api: RunsApi) -> dict:
    return api.item("PROFILE")["badges"]


def test_a_badge_is_written_once_and_earned_again_after_a_reset(api: RunsApi, player_event: dict) -> None:
    api.set_run_fields(RUN_A, mode="CAMPAIGN")
    send(api, player_event, TO_ACTIVITY)  # wave 1 cleared
    assert set(badges(api)) == {"first-steps"}
    first_date = badges(api)["first-steps"]
    # Wave 2 clears the (two-wave) campaign: Colony Hero; First Steps is not written again.
    send(api, player_event, [attempt(4, 3, "b"), start_wave(5, 4, wave=2), complete_wave(6, 5, wave=2)])
    assert set(badges(api)) == {"first-steps", "campaign-luna-1"} and badges(api)["first-steps"] == first_date
    names = transacts(api)[-1][2]["Update"]["ExpressionAttributeNames"]
    assert "first-steps" not in names.values()  # only the new one is in the update
    # A campaign-progress reset empties the map; a still-running run re-earns what it reaches on its next wave.
    api.raw.update_item(
        TableName="test-game",
        Key={"pk": {"S": PK}, "sk": {"S": "PROFILE"}},
        UpdateExpression="SET #b = :e",
        ExpressionAttributeNames={"#b": "badges"},
        ExpressionAttributeValues={":e": _ddb({})},
    )
    assert api.create(player_event, run_id="00000000-0000-4000-a000-000000000099")[0] == 201
    api.set_run_fields("00000000-0000-4000-a000-000000000099", mode="CAMPAIGN")
    batch = [
        op(11, 0, "SAVE_PREP", {"credits": 100, "placements": [NOVA_P04]}),
        start_wave(12, 1),
        complete_wave(13, 2),
    ]
    _, body = send(api, player_event, batch, run_id="00000000-0000-4000-a000-000000000099")
    assert results(body)[-1] == ("APPLIED", None)
    assert set(badges(api)) == {"first-steps"}


def test_a_challenge_run_writes_badges_only(api: RunsApi, player_event: dict) -> None:
    # The Milestone 1 run is a CHALLENGE; a level-3 Nova at the end of wave 1 earns Top Team, and planets stay empty.
    api.set_run_fields(
        RUN_A, snapshot={"credits": 500, "placements": [], "colony": {"health": 20, "shield": 0}, "powers": {}}
    )
    level3 = {**NOVA_P04, "level": 3}
    batch = [
        op(1, 0, "SAVE_PREP", {"credits": 240, "placements": [level3]}),
        op(2, 1, "START_WAVE", {"wave": 1, "credits": 240, "placements": [level3]}),
        op(
            3,
            2,
            "COMPLETE_WAVE",
            {"wave": 1, "credits": 260, "placements": [level3], "colony": {"health": 20, "shield": 0}, "powers": {}},
        ),
    ]
    _, body = send(api, player_event, batch)
    assert results(body) == [("APPLIED", None)] * 3
    assert set(badges(api)) == {"top-team"}
    assert api.item("PROFILE")["planets"] == {}
    assert "#planets" not in transacts(api)[-1][2]["Update"]["UpdateExpression"]
