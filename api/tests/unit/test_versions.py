"""Gate M, LD6: per (campaign version, wave set) states from game-data/versions.json (shared/versions.py) in player-api.

preview: new runs for tester accounts only; retired: no new runs, started runs resume; invalid: no new runs, a started
run is not playable and only ABANDON or FINISH_RUN may close it (ABANDONED, never DEFEATED). A missing file means
every version is published (all repo-released versions are). On moto, with the Milestone 1 pair (luna-1-c1,
first-contact) the runs harness uses.
"""

from __future__ import annotations

import json
from typing import Any

import boto3
import pytest
from runs_harness import BUCKET, OTHER_SUB, RUN_A, SUB, RunsApi
from test_ops import op, results, save_prep, send

from shared.game_data import GameDataReader, GameDataUnavailable
from shared.versions import Versions, VersionsUnavailable, parse_versions, versions_body

C1 = "luna-1-c1"


def body(states: dict[str, dict[str, str]], testers: list[str] | None = None) -> dict[str, Any]:
    return {"kind": "versions", "schema": 1, "testers": testers or [], "versions": states}


def set_versions(api: RunsApi, states: dict[str, dict[str, str]], testers: list[str] | None = None) -> None:
    s3 = boto3.client("s3", region_name="eu-west-2")
    s3.put_object(Bucket=BUCKET, Key="game-data/versions.json", Body=json.dumps(body(states, testers)).encode())
    api.reader._versions = None  # the reader caches the file for a minute; these tests move it at once


# --- The file ---------------------------------------------------------------------------------------------------------


def test_a_version_or_wave_set_not_listed_is_published() -> None:
    v = parse_versions(body({"luna-1-a1": {"campaign": "preview"}}))
    assert v.state("luna-1-a1", "campaign") == "preview"
    assert v.state("luna-1-a1", "other") == "published"
    assert v.state(C1, "first-contact") == "published"
    assert Versions().can_start(C1, "first-contact", SUB)


@pytest.mark.parametrize(
    "bad",
    [
        [],
        {"kind": "versions", "schema": 2, "testers": [], "versions": {}},
        {"kind": "versions", "schema": 1, "testers": [], "versions": {}, "extra": 1},
        body({"luna-1-a1": {"campaign": "gone"}}),
        body({"Luna 1": {"campaign": "published"}}),
        body({"luna-1-a1": {"Campaign!": "published"}}),
        body({}, testers=["someone@example.invalid"]),
        body({}, testers=[SUB, SUB]),
        body({}, testers=[f"00000000-0000-4000-8000-{n:012d}" for n in range(21)]),
    ],
)
def test_a_malformed_file_is_refused(bad: Any) -> None:
    with pytest.raises(VersionsUnavailable):
        parse_versions(bad)


def test_the_body_round_trips_sorted() -> None:
    v = parse_versions(body({"luna-1-a2": {"b": "retired", "a": "invalid"}, "luna-1-a1": {}}, [OTHER_SUB, SUB]))
    out = versions_body(v)
    assert list(out["versions"]) == ["luna-1-a1", "luna-1-a2"] and list(out["versions"]["luna-1-a2"]) == ["a", "b"]
    assert out["testers"] == sorted([OTHER_SUB, SUB])
    assert parse_versions(out) == v


def test_the_reader_treats_a_missing_file_as_no_states_and_a_broken_one_as_unavailable(ddb: Any) -> None:
    api = RunsApi(ddb)  # creates the bucket
    reader = GameDataReader(bucket=BUCKET, s3=boto3.client("s3", region_name="eu-west-2"))
    assert reader.versions() == Versions()
    boto3.client("s3", region_name="eu-west-2").put_object(Bucket=BUCKET, Key="game-data/versions.json", Body=b"[]")
    reader._versions = None
    with pytest.raises(GameDataUnavailable):
        reader.versions()
    assert api is not None


# --- Starting a run (R8) and the planet list (R6) --------------------------------------------------------------------


@pytest.mark.parametrize(
    ("state", "testers", "allowed"),
    [
        ("published", [], True),
        ("preview", [SUB], True),
        ("preview", [OTHER_SUB], False),
        ("retired", [SUB], False),
        ("invalid", [SUB], False),
    ],
)
def test_who_may_start_a_run(ddb: Any, player_event: dict, state: str, testers: list[str], allowed: bool) -> None:
    api = RunsApi(ddb)
    api.profile(player_event)
    set_versions(api, {C1: {"first-contact": state}}, testers)
    status, created = api.create(player_event)
    if allowed:
        assert status == 201
    else:
        assert (status, created["error"]["code"]) == (409, "CONTENT_VERSION_UNSUPPORTED")
        assert api.items("RUN#") == []
    _, planets = api.call(player_event, "GET /api/planets")
    listed = [ws["waveSetId"] for p in planets["planets"] for ws in p["waveSets"]]
    assert ("first-contact" in listed) == allowed


# --- Runs already started ---------------------------------------------------------------------------------------------


@pytest.fixture
def started(ddb: Any, player_event: dict) -> RunsApi:
    api = RunsApi(ddb)
    api.profile(player_event)
    assert api.create(player_event)[0] == 201
    return api


def playable(api: RunsApi, event: dict) -> bool:
    _, me = api.call(event, "GET /api/me")
    (run,) = me["runs"]
    _, detail = api.call(event, "GET /api/runs/{runId}", run_id=RUN_A)
    _, listed = api.call(event, "GET /api/runs", query={"state": "open"})
    assert detail["playable"] == run["playable"] == listed["items"][0]["playable"]
    return bool(run["playable"])


def test_a_retired_wave_set_resumes_as_normal(started: RunsApi, player_event: dict) -> None:
    set_versions(started, {C1: {"first-contact": "retired"}})
    assert playable(started, player_event)
    status, out = send(started, player_event, [save_prep(1, 0)])
    assert status == 200 and results(out) == [("APPLIED", None)]


def test_an_invalid_wave_set_is_not_playable_and_only_ends_as_abandoned(started: RunsApi, player_event: dict) -> None:
    set_versions(started, {C1: {"first-contact": "invalid"}})
    assert not playable(started, player_event)
    _, me = started.call(player_event, "GET /api/me")
    assert me["runs"][0]["reason"] == "CONTENT_VERSION_UNSUPPORTED"
    _, pack = started.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)
    assert pack["packStatus"]["state"] == "INCOMPLETE"

    status, out = send(started, player_event, [save_prep(1, 0)])
    assert status == 200 and results(out) == [("REJECTED", "CONTENT_VERSION_UNSUPPORTED")]
    status, out = send(started, player_event, [op(2, 0, "ABANDON")])
    assert status == 200 and results(out) == [("APPLIED", None)]
    assert started.item(f"RUN#{RUN_A}")["status"] == "ABANDONED"  # never DEFEATED: not a loss


def test_another_wave_sets_state_leaves_this_run_alone(started: RunsApi, player_event: dict) -> None:
    set_versions(started, {C1: {"other-set": "invalid"}, "luna-1-a9": {"first-contact": "invalid"}})
    assert playable(started, player_event)
