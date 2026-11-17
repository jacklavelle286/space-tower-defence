"""current.json schema 1 and 2 in Python (Gate M, LD9): the shared fixtures (game-core's parseCurrent reads the same),
what the publisher writes back, and the planets list on the reader and on GET /api/planets with two released
planets: unlocked in order, never one that current.json does not list."""

from __future__ import annotations

import json
from typing import Any

import pytest
from conftest import REPO
from runs_harness import BUCKET, RunsApi

from shared.game_data import CurrentInvalid, current_body, parse_current

CASES = json.loads((REPO / "contracts" / "fixtures" / "current" / "cases.json").read_text())


@pytest.mark.parametrize("case", CASES["valid"], ids=lambda c: c["name"])
def test_reads(case: dict[str, Any]) -> None:
    assert parse_current(case["current"]) == case["expected"]


@pytest.mark.parametrize("case", CASES["invalid"], ids=lambda c: c["name"])
def test_refuses(case: dict[str, Any]) -> None:
    with pytest.raises(CurrentInvalid) as error:
        parse_current(case["current"])
    assert str(error.value).startswith(case["field"])


@pytest.mark.parametrize("case", CASES["valid"], ids=lambda c: c["name"])
def test_what_is_written_back_reads_the_same(case: dict[str, Any]) -> None:
    pointers = parse_current(case["current"])
    assert parse_current(current_body(pointers)) == pointers
    assert ("schema" in current_body(pointers)) == ("schema" in case["current"])  # schema 1 stays schema 1


def release_mars(api: RunsApi) -> None:
    """mars-1 (luna-1-c1's document under another planet) released after luna-1."""
    import boto3

    s3 = boto3.client("s3", region_name="eu-west-2")
    mars = json.loads((REPO / "game-data" / "campaign" / "luna-1-c1.json").read_text())
    mars.update(version="mars-1-c1", planetId="mars-1", name="Red Dust")
    s3.put_object(Bucket=BUCKET, Key="game-data/campaign/mars-1-c1.json", Body=json.dumps(mars).encode())
    current = {
        "schema": 2,
        "rulesetVersion": "r1",
        "campaignVersion": "luna-1-c1",
        "planets": [
            {"planetId": "luna-1", "campaignVersion": "luna-1-c1"},
            {"planetId": "mars-1", "campaignVersion": "mars-1-c1"},
        ],
    }
    s3.put_object(Bucket=BUCKET, Key="game-data/current.json", Body=json.dumps(current).encode())


def test_two_released_planets_are_listed_in_order_the_second_locked(ddb: Any, player_event: dict) -> None:
    api = RunsApi(ddb)
    release_mars(api)
    api.profile(player_event)
    status, body = api.call(player_event, "GET /api/planets")
    assert status == 200
    assert [(p["planetId"], p["campaignVersion"], p["unlocked"]) for p in body["planets"]] == [
        ("luna-1", "luna-1-c1", True),
        ("mars-1", "mars-1-c1", False),  # until luna-1's best completed wave reaches 20
    ]


def test_a_planet_current_json_does_not_list_is_never_playable(ddb: Any, player_event: dict) -> None:
    import boto3

    api = RunsApi(ddb)
    s3 = boto3.client("s3", region_name="eu-west-2")
    venus = json.loads((REPO / "game-data" / "campaign" / "luna-1-c1.json").read_text())
    venus.update(version="venus-1-c1", planetId="venus-1")
    s3.put_object(Bucket=BUCKET, Key="game-data/campaign/venus-1-c1.json", Body=json.dumps(venus).encode())
    api.profile(player_event)
    _, body = api.call(player_event, "GET /api/planets")
    assert [p["planetId"] for p in body["planets"]] == ["luna-1"]
    api.bounds = lambda ruleset, campaign: api_bounds(ruleset)
    status, refused = api.create(player_event, planetId="venus-1", campaignVersion="venus-1-c1")
    assert status == 409 and refused["error"]["code"] == "CONTENT_VERSION_UNSUPPORTED"


def api_bounds(ruleset: str) -> Any:
    from runs_harness import load_bounds_fixture

    return load_bounds_fixture(ruleset, "luna-1-c1")


def test_an_unreleased_planet_is_a_testers_preview_and_nobody_elses(ddb: Any, player_event: dict) -> None:
    import boto3
    from runs_harness import SUB

    api = RunsApi(ddb)
    s3 = boto3.client("s3", region_name="eu-west-2")
    mars = json.loads((REPO / "game-data" / "campaign" / "luna-1-c1.json").read_text())
    mars.update(version="mars-1-a1", planetId="mars-1", name="Red Dust")
    s3.put_object(Bucket=BUCKET, Key="game-data/campaign/mars-1-a1.json", Body=json.dumps(mars).encode())

    def versions(testers: list[str]) -> None:
        body = {
            "kind": "versions",
            "schema": 1,
            "testers": testers,
            "versions": {"mars-1-a1": {"first-contact": "preview"}},
        }
        s3.put_object(Bucket=BUCKET, Key="game-data/versions.json", Body=json.dumps(body).encode())
        api.reader._versions = None  # past the reader's cache

    api.profile(player_event)
    api.bounds = lambda ruleset, campaign: api_bounds(ruleset)
    versions(["0f0e0d0c-0b0a-4908-8706-050403020100"])
    _, body = api.call(player_event, "GET /api/planets")
    assert [p["planetId"] for p in body["planets"]] == ["luna-1"]
    status, _ = api.create(player_event, planetId="mars-1", campaignVersion="mars-1-a1")
    assert status == 409

    versions([SUB])
    _, body = api.call(player_event, "GET /api/planets")
    mars_entry = body["planets"][1]
    assert (mars_entry["planetId"], mars_entry["preview"], mars_entry["unlocked"]) == ("mars-1", True, True)
    assert [(w["waveSetId"], w["campaignVersion"]) for w in mars_entry["waveSets"]] == [("first-contact", "mars-1-a1")]
    status, created = api.create(player_event, planetId="mars-1", campaignVersion="mars-1-a1")
    assert status == 201, created
