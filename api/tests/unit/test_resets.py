"""Phase 55: resets, POST /api/me/resets (M4-06; F §12.5, G §3 R5, spine S8.2). One test per type checks F §12.5's
matrix (what goes, what stays); every reset is repeat-safe; a leftover RESET# holder never asks "Play here instead?"."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from runs_harness import RUN_A, RunsApi
from test_ops import TO_ACTIVITY, attempt, send

RESETS = "POST /api/me/resets"


@pytest.fixture
def api(ddb: Any, player_event: dict) -> RunsApi:
    """A player with a profile, a run with a resolved activity (a SUM# item), a best wave and a badge."""
    api = RunsApi(ddb)
    api.profile(player_event)
    assert api.create(player_event)[0] == 201
    api.set_run_fields(RUN_A, mode="CAMPAIGN")
    send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, "b")])
    assert api.item("PROFILE")["badges"] and api.item("PROFILE")["planets"] and api.items("SUM#")
    return api


def reset(api: RunsApi, event: dict, kind: str, confirm: str | None = None) -> tuple[int, Any]:
    return api.call(event, RESETS, {"type": kind, "confirm": kind if confirm is None else confirm})


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"type": "EVERYTHING", "confirm": "EVERYTHING"}, "type"),
        ({"type": "WHOLE_PROFILE", "confirm": "whole_profile"}, "confirm"),
        ({"type": "WHOLE_PROFILE"}, "confirm"),
        ({"type": "LEARNING_HISTORY", "confirm": "LEARNING_HISTORY", "extra": 1}, "body"),
    ],
)
def test_confirm_must_be_the_identical_type(api: RunsApi, player_event: dict, body: dict, field: str) -> None:
    status, answer = api.call(player_event, RESETS, body)
    assert status == 400 and answer["error"]["code"] == "VALIDATION_FAILED"
    assert answer["error"]["details"][0]["field"] == field
    assert api.item("PROFILE") is not None  # nothing happened


def test_campaign_progress_clears_planets_and_badges_only(api: RunsApi, player_event: dict) -> None:
    for _ in range(2):  # repeat-safe
        status, body = reset(api, player_event, "CAMPAIGN_PROGRESS")
        assert status == 200 and body["type"] == "CAMPAIGN_PROGRESS" and "completedAt" in body
    profile = api.item("PROFILE")
    assert (profile["planets"], profile["badges"], profile["nickname"]) == ({}, {}, "Star Kid")
    assert api.item(f"RUN#{RUN_A}") is not None and api.items("SUM#") and api.items(f"SLOT#{RUN_A}#")


def test_learning_history_deletes_every_summary_only(api: RunsApi, player_event: dict) -> None:
    for _ in range(2):
        assert reset(api, player_event, "LEARNING_HISTORY")[0] == 200
    assert api.items("SUM#") == []
    profile = api.item("PROFILE")
    assert profile["badges"] and profile["planets"]
    slot = api.item(f"SLOT#{RUN_A}#N-001")
    assert slot is not None and slot["attempts"]  # attempt records stay


def test_whole_profile_fences_deletes_everything_and_keeps_session(api: RunsApi, player_event: dict) -> None:
    generation = int(api.item("SESSION")["generation"])
    status, _ = reset(api, player_event, "WHOLE_PROFILE")
    assert status == 200
    assert api.item("PROFILE") is None
    assert api.items("RUN#") == [] and api.items("SLOT#") == [] and api.items("SUM#") == []
    session = api.item("SESSION")
    assert int(session["generation"]) == generation + 1 and session["released"] is True
    assert str(session["sessionId"]).startswith("RESET#")
    assert api.call(player_event, "GET /api/me")[1]["error"]["code"] == "PROFILE_NOT_FOUND"
    # Repeating after success finds nothing and still answers 200 (and the generation only rises).
    assert reset(api, player_event, "WHOLE_PROFILE")[0] == 200
    assert int(api.item("SESSION")["generation"]) == generation + 2
    # The two partial resets need a profile.
    assert reset(api, player_event, "CAMPAIGN_PROGRESS")[1]["error"]["code"] == "PROFILE_NOT_FOUND"
    assert reset(api, player_event, "LEARNING_HISTORY")[1]["error"]["code"] == "PROFILE_NOT_FOUND"


def test_a_leftover_reset_holder_gives_no_takeover_prompt(ddb: Any, player_event: dict) -> None:
    api = RunsApi(ddb)
    api.profile(player_event)
    # A whole-profile reset that died before releasing: a RESET# holder with a live lease, released = false.
    future = datetime(2030, 1, 1, tzinfo=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    api.set_session(sessionId="RESET#dead-request", generation=7, leaseExpiresAt=future, released=False)
    status, body = api.create(player_event)
    assert status == 201, body  # claimed straight away: no TAKEOVER_CONFIRM_REQUIRED, no ACTIVE_SESSION_ELSEWHERE
    assert int(api.item("SESSION")["generation"]) == 8
