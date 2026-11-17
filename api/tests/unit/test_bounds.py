"""shared.bounds.load_bounds (M1-23 "Done when": player-api loads the bounds file via load_bounds).

The file under test is contracts/fixtures/bounds/r1__luna-1-c1.json: the bounds file that
web/game-core/scripts/build-bounds.ts generates for the pair game-data/current.json names (a Vitest test fails if the
fixture is stale), so Python is tested against the TypeScript build's real output, not a hand-written copy. S3 is
moto; nothing reaches AWS.
"""

from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

import boto3
import pytest
from conftest import REPO, load_handler
from moto import mock_aws

from shared import bounds
from shared.bounds import (
    KEY_ID,
    MAX_TRANSACTION_ACTIONS,
    VERSION,
    BoundsUnavailable,
    bounds_key,
    clear_cache,
    load_bounds,
    parse_bounds,
)
from shared.rules import LIMITS

BUCKET = "test-player-site"
CURRENT = json.loads((REPO / "game-data" / "current.json").read_text())
# The parser's cases are written against the Milestone 1 pair's fixture (Nova only, first-contact); the live pair's
# fixture is checked separately (test_the_current_pairs_fixture_parses).
RULESET, CAMPAIGN = "r1", "luna-1-c1"
FIXTURE: Path = REPO / "contracts" / "fixtures" / "bounds" / f"{RULESET}__{CAMPAIGN}.json"


@pytest.fixture(autouse=True)
def _fresh_cache() -> Any:
    clear_cache()
    yield
    clear_cache()


@pytest.fixture
def site(aws_env: None, monkeypatch: pytest.MonkeyPatch) -> Any:
    """A moto player-site bucket holding the generated bounds file where the release publishes it."""
    with mock_aws():
        s3 = boto3.client("s3", region_name="eu-west-2")
        s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "eu-west-2"})
        s3.put_object(Bucket=BUCKET, Key=bounds_key(RULESET, CAMPAIGN), Body=FIXTURE.read_bytes())
        monkeypatch.setenv(bounds.BUCKET_ENV, BUCKET)
        yield s3


def test_the_key_is_where_the_release_publishes_bounds() -> None:
    assert bounds_key("r1", "luna-1-c1") == "game-data/bounds/r1__luna-1-c1.json"


def test_player_api_loads_the_generated_bounds_file(site: Any) -> None:
    # Imported the way the player-api zip imports it (shared/ next to handler.py), with the default S3 client and
    # the bucket from the environment, as in the Lambda.
    load_handler("player_api")
    loaded = load_bounds(RULESET, CAMPAIGN)
    assert loaded["rulesetVersion"] == RULESET and loaded["campaignVersion"] == CAMPAIGN
    m1 = loaded["waveSets"]["first-contact"]
    assert m1["mode"] == "CHALLENGE"
    assert m1["finalWave"] == 2
    assert m1["maxBounty"] == [24, 32]  # C8.2 "Total bounty available", waves 1 and 2
    assert m1["normalRewardByInterval"] == [30]  # C9.2 first block
    assert m1["createRunActions"] == 4  # F 3.7
    assert loaded["classes"]["nova"]["cumulativeCosts"] == [50, 110, 260]  # C5.2
    assert loaded["classes"]["nova"]["targeting"] == ["FRONT", "FAST"]  # C5.2, spine S6 rule 4
    assert loaded["colony"] == {"maxHealth": 20, "shieldCap": 10}


def test_bounds_are_cached_per_container(site: Any) -> None:
    first = load_bounds(RULESET, CAMPAIGN)
    site.delete_object(Bucket=BUCKET, Key=bounds_key(RULESET, CAMPAIGN))
    assert load_bounds(RULESET, CAMPAIGN) is first  # files are immutable, so the cached copy is never stale


def test_a_missing_bounds_file_is_unavailable_and_not_cached(site: Any) -> None:
    with pytest.raises(BoundsUnavailable, match="NoSuchKey"):
        load_bounds(RULESET, "luna-1-c9")
    site.put_object(
        Bucket=BUCKET,
        Key=bounds_key(RULESET, "luna-1-c9"),
        Body=FIXTURE.read_text().replace(f'"{CAMPAIGN}"', '"luna-1-c9"'),
    )
    assert load_bounds(RULESET, "luna-1-c9")["campaignVersion"] == "luna-1-c9"


def test_a_file_for_another_pair_is_refused(site: Any) -> None:
    site.put_object(Bucket=BUCKET, Key=bounds_key("r2", CAMPAIGN), Body=FIXTURE.read_bytes())
    with pytest.raises(BoundsUnavailable, match="the file is for"):
        load_bounds("r2", CAMPAIGN)


def test_a_file_that_is_not_json_is_unavailable(site: Any) -> None:
    site.put_object(Bucket=BUCKET, Key=bounds_key("r2", CAMPAIGN), Body=b"<html>")
    with pytest.raises(BoundsUnavailable, match="not JSON"):
        load_bounds("r2", CAMPAIGN)


@pytest.mark.parametrize("version", ["", "R1", "r_1", "r1__x", "../r1", "r1\n", "a" * 41])
def test_version_strings_must_be_path_safe(version: str) -> None:
    with pytest.raises(ValueError, match=r"\^\[a-z0-9.-\]"):
        bounds_key(version, CAMPAIGN)
    with pytest.raises(ValueError):
        load_bounds(RULESET, version, bucket=BUCKET, s3=object())  # refused before any S3 call


def test_no_bucket_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(bounds.BUCKET_ENV, raising=False)
    with pytest.raises(BoundsUnavailable, match="GAME_DATA_BUCKET"):
        load_bounds(RULESET, CAMPAIGN, s3=object())


def _fixture() -> dict[str, Any]:
    return json.loads(FIXTURE.read_text())


def _set(data: dict[str, Any]) -> dict[str, Any]:
    return data["waveSets"]["first-contact"]


@pytest.mark.parametrize(
    ("change", "match"),
    [
        (lambda d: d.update(extra=1), "keys"),
        (lambda d: d.update(kind="ruleset"), "kind"),
        (lambda d: d["colony"].update(maxHealth=True), "maxHealth must be an integer"),
        (lambda d: d["classes"]["nova"].update(cumulativeCosts=[50, 110, 261]), "running sum"),
        (lambda d: d["classes"]["nova"].update(targeting=[]), "targeting must be"),
        (lambda d: d["classes"]["nova"].update(targeting=["FRONT", "NEAREST"]), "targeting must be"),
        (lambda d: d["classes"]["nova"].update(targeting=["FRONT", "FRONT"]), "targeting must be"),
        (lambda d: d["classes"]["nova"].pop("targeting"), "keys"),
        (lambda d: _set(d).update(maxBounty=[24]), "maxBounty must have finalWave"),
        (lambda d: _set(d).update(createRunActions=5), "createRunActions must be 4"),
        (
            lambda d: _set(d).update(
                finalWave=99, maxBounty=[1] * 99, normalRewardByInterval=[1] * 98, meteorAfter=[1], createRunActions=101
            ),
            "at most 100",
        ),
        (lambda d: _set(d).update(classes=["pip"]), "classes must name classes"),
        (lambda d: _set(d).update(mode="ENDLESS"), "mode"),
    ],
)
def test_malformed_bounds_are_refused(change: Any, match: str) -> None:
    data = _fixture()
    change(data)
    with pytest.raises(BoundsUnavailable, match=match):
        parse_bounds(data, RULESET, CAMPAIGN)


def test_the_fixture_itself_parses() -> None:
    data = _fixture()
    assert parse_bounds(copy.deepcopy(data), RULESET, CAMPAIGN) == data


def test_patterns_and_limits_come_from_the_limits_file() -> None:
    # One source for the version pattern and the G-15 limit: contracts/limits.json (also checked in TypeScript by
    # web/game-core/src/data/game-data.test.ts and for the release manifest by scripts/tests/test_release_manifest.py).
    assert MAX_TRANSACTION_ACTIONS == LIMITS["gameData"]["createRunMaxActions"] == 100
    assert VERSION.match("r1") and VERSION.match("luna-1-c1") and not VERSION.match("r1\n")
    assert not VERSION.match("a_b") and not VERSION.match("x" * 41)
    assert KEY_ID.match("nova") and not KEY_ID.match("v1.2")


def test_a_power_award_rotation_is_accepted_and_checked() -> None:
    """Phase 51: bounds files of rulesets with powers carry the C10 rotation; CREATE_RUN prices meteor slots from it."""
    data = json.loads(FIXTURE.read_text())
    assert "powerAwardRotation" not in data  # r1 has no powers: its published bytes are unchanged
    with_rotation = {**data, "powerAwardRotation": ["frost-pulse", "comet-burst", "colony-shield"]}
    assert parse_bounds(with_rotation, RULESET, CAMPAIGN)["powerAwardRotation"][1] == "comet-burst"
    for bad in (["Frost Pulse"], "frost-pulse", [1]):
        with pytest.raises(BoundsUnavailable, match="powerAwardRotation"):
            parse_bounds({**data, "powerAwardRotation": bad}, RULESET, CAMPAIGN)


def test_the_current_pairs_fixture_parses() -> None:
    """The bounds fixture of the pair current.json names (since Phase 56: r4 + luna-1-c2, the campaign with endless)."""
    ruleset, campaign = CURRENT["rulesetVersion"], CURRENT["campaignVersion"]
    path = REPO / "contracts" / "fixtures" / "bounds" / f"{ruleset}__{campaign}.json"
    bounds = parse_bounds(json.loads(path.read_text()), ruleset, campaign)
    assert set(bounds["waveSets"]) >= {"first-contact"}
