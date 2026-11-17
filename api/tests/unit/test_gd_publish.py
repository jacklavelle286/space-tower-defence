"""Gate M, LD6: the game-data publisher (shared/gd_publish.py, functions/game_data_publish) on moto.

The JavaScript half (game-data-check) is tested in web/game-data-check, including the bounds parity with the release's
build-bounds.ts; here a fake check stands in for it and answers with the repository's luna-1-c2 document and bounds
fixture, stamped with the version it is asked for. These tests are about the order of the writes, the refusals, the
replay and the pointers.
"""

from __future__ import annotations

import io
import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import boto3
import pytest
from conftest import REPO, load_handler
from runs_harness import bank_items, make_table

from shared.data import DynamoTable
from shared.gd_publish import BACKDROP_MAX_BYTES, Deps, Publisher, PublishRefused
from shared.levels import new_level_items
from shared.pictures import level_picture_users
from shared.versions import parse_versions

publish_handler = load_handler("game_data_publish")

BUCKET = "test-player-site"
CONTENT = "test-content"
OPERATOR = "op-sub-1"
TESTER = "0f0f0f0f-1111-4222-8333-444444444444"  # made up
LIVE = "luna-1-c2"
LIVE_BYTES = (REPO / "game-data" / "campaign" / f"{LIVE}.json").read_bytes()
BOUNDS_BYTES = (REPO / "contracts" / "fixtures" / "bounds" / f"r4__{LIVE}.json").read_bytes()
# As admin-api stores a body: JSON numbers with a fraction as Decimal (DynamoDB has no float).
LEVEL = json.loads((REPO / "contracts" / "fixtures" / "levels" / "shapes.json").read_text(), parse_float=Decimal)[
    "valid"
]["challenge"]
OWNED = ["blob-parade"]  # the fake check's "owned" wave set: one that exists in luna-1-c2
LIB = "lib-" + "a" * 32


class FakeCheck:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.ok = True
        self.pictures: dict[str, list[str]] = {"backdrops": [], "decorations": []}

    def __call__(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(payload)
        version = payload["version"]
        doc = json.loads(LIVE_BYTES)
        doc["version"] = version
        bounds = json.loads(BOUNDS_BYTES)
        bounds["campaignVersion"] = version
        problems = (
            []
            if self.ok
            else [{"field": "planet.maps.zigzag", "rule": "routeLength", "severity": "block", "message": "x"}]
        )
        return {
            "ok": self.ok,
            "problems": problems,
            "findings": [],
            "planetJson": json.dumps(doc, indent=2) + "\n",
            "boundsJson": json.dumps(bounds, indent=2) + "\n",
            "boundsVersion": f"r4__{version}",
            "pictures": self.pictures,
            "waveSets": OWNED,
        }

    def bot_runs(self) -> int:
        return sum(1 for c in self.calls if c["runBots"])


class Env:
    def __init__(self, ddb: Any) -> None:
        make_table(ddb, CONTENT)
        self.raw = ddb
        self.table = DynamoTable(ddb, CONTENT)
        self.s3 = boto3.client("s3", region_name="eu-west-2")
        self.s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "eu-west-2"})
        self.put("ruleset/r4.json", (REPO / "game-data" / "ruleset" / "r4.json").read_bytes())
        self.put(f"campaign/{LIVE}.json", LIVE_BYTES)
        self.put(f"bounds/r4__{LIVE}.json", BOUNDS_BYTES)
        self.put("current.json", json.dumps({"rulesetVersion": "r4", "campaignVersion": LIVE}).encode())
        self.check = FakeCheck()
        self.is_frozen = False
        self.store = publish_handler.S3Store(BUCKET, self.s3)
        self.clock = datetime(2026, 11, 20, 10, 0, 0, tzinfo=UTC)
        self.publisher = Publisher(
            Deps(
                table=self.table,
                site=self.store,
                check=self.check,
                frozen=lambda: self.is_frozen,
                now=lambda: self.clock,
            )
        )
        self.level("zigzag")

    def put(self, key: str, body: bytes) -> None:
        self.s3.put_object(Bucket=BUCKET, Key=f"game-data/{key}", Body=body)

    def get(self, key: str) -> Any:
        try:
            return json.loads(self.s3.get_object(Bucket=BUCKET, Key=f"game-data/{key}")["Body"].read())
        except self.s3.exceptions.NoSuchKey:
            return None

    def level(self, level_id: str, revision: int = 0) -> None:
        # The same level under another ID: its pads, wave sets and challenge waves carry the ID (shared/levels.py).
        body = json.loads(json.dumps(LEVEL, default=float).replace('"zigzag', f'"{level_id}'), parse_float=Decimal)
        header, draft = new_level_items(level=body, by=OPERATOR, at=self.clock)
        draft["draftRevision"] = revision
        for item in (header, draft):
            self.table.transact_write(
                [self.table.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})]
            )

    def publish(
        self, level_id: str = "zigzag", revision: int = 0, source: str = LIVE, live: bool = False
    ) -> dict[str, Any]:
        return self.publisher.publish(level_id, revision, source, live, OPERATOR)

    def current(self) -> str:
        return str(self.get("current.json")["campaignVersion"])

    def states(self) -> Any:
        body = self.get("versions.json")
        return parse_versions(body) if body is not None else None


@pytest.fixture
def env(ddb: Any) -> Env:
    return Env(ddb)


# --- publish -------------------------------------------------------------------------------------------------------


def test_publish_writes_the_files_and_a_preview_without_moving_current(env: Env) -> None:
    out = env.publish()
    assert out == {"ok": True, "campaignVersion": "luna-1-a1", "live": False, "warnings": []}
    assert env.get("campaign/luna-1-a1.json")["version"] == "luna-1-a1"
    assert env.get("bounds/r4__luna-1-a1.json")["campaignVersion"] == "luna-1-a1"
    assert env.current() == LIVE
    states = env.states()
    assert states.state("luna-1-a1", "blob-parade") == "preview"  # the level's own set
    assert states.state("luna-1-a1", "campaign") == "published"  # carried from the source, as it was there
    assert env.check.bot_runs() == 1 and [c["version"] for c in env.check.calls] == ["luna-1-check", "luna-1-a1"]

    claim = env.table.get_item("LEVEL#zigzag", "PUB#0000000000")
    assert claim["state"] == "DONE" and claim["campaignVersion"] == "luna-1-a1" and claim["sourceVersion"] == LIVE
    (version,) = env.table.query_prefix("LEVEL#zigzag", "V#")
    assert (
        version["campaignVersion"] == "luna-1-a1"
        and version["bounds"] == "r4__luna-1-a1"
        and len(version["sha256"]) == 64
    )
    (row,) = env.table.query_prefix("GDPUBLISH", "")
    assert row["action"] == "publish" and row["prev"] == LIVE and row["live"] is False
    assert [a["action"] for a in env.table.query_prefix("AUDIT#2026-11", "")] == ["level.publish"]
    assert env.table.get_item("LEVEL", "zigzag")["status"] == "PUBLISHED"
    cached = env.s3.head_object(Bucket=BUCKET, Key="game-data/campaign/luna-1-a1.json")
    assert cached["CacheControl"] == "public, max-age=31536000, immutable"


def test_publish_live_publishes_the_sets_then_moves_current(env: Env) -> None:
    out = env.publish(live=True)
    assert out["live"] is True and env.current() == "luna-1-a1"
    assert env.states().state("luna-1-a1", "blob-parade") == "published"
    assert env.s3.head_object(Bucket=BUCKET, Key="game-data/current.json")["CacheControl"] == "no-cache"


def test_versions_count_up_per_planet(env: Env) -> None:
    env.publish()
    env.level("zigzag-two")
    assert env.publish("zigzag-two")["campaignVersion"] == "luna-1-a2"


def test_a_retry_of_the_same_revision_is_a_replay(env: Env) -> None:
    first = env.publish()
    again = env.publish()
    assert again["campaignVersion"] == first["campaignVersion"]
    assert env.check.bot_runs() == 1
    assert len(env.table.query_prefix("GDPUBLISH", "")) == 1


def test_a_run_that_stopped_half_way_is_finished_by_the_retry_without_new_checks(env: Env) -> None:
    real_create = env.store.create
    calls = {"n": 0}

    def flaky(key: str, body: bytes, cache: str) -> bool:
        calls["n"] += 1
        if calls["n"] == 2:
            raise RuntimeError("the Lambda stopped here")
        return real_create(key, body, cache)

    env.store.create = flaky  # type: ignore[method-assign]
    with pytest.raises(RuntimeError):
        env.publish(live=True)
    assert env.get("campaign/luna-1-a1.json") is not None and env.get("bounds/r4__luna-1-a1.json") is None
    assert env.states().state("luna-1-a1", "blob-parade") == "preview"  # never playable by default while half written
    assert env.current() == LIVE

    env.store.create = real_create  # type: ignore[method-assign]
    out = env.publish(live=True)
    assert out["campaignVersion"] == "luna-1-a1" and out["live"] is True
    assert env.check.bot_runs() == 1  # the replay does not repeat the balance checks
    assert env.current() == "luna-1-a1"


def test_refusals_before_any_write(env: Env) -> None:
    with pytest.raises(PublishRefused) as stale:
        env.publish(source="luna-1-c1")
    assert stale.value.code == "STALE_SOURCE" and stale.value.details == {"live": LIVE, "source": "luna-1-c1"}
    with pytest.raises(PublishRefused) as conflict:
        env.publish(revision=3)
    assert conflict.value.code == "DRAFT_CONFLICT" and conflict.value.details == {"draftRevision": 0}
    env.is_frozen = True
    with pytest.raises(PublishRefused) as frozen:
        env.publish()
    assert frozen.value.code == "FROZEN"
    with pytest.raises(PublishRefused) as missing:
        env.publisher.publish("no-such-level", 0, LIVE, False, OPERATOR)
    assert missing.value.code == "FROZEN"  # the freeze is checked first
    assert env.get("versions.json") is None and env.check.calls == []


def test_failed_checks_refuse_and_the_refusal_is_kept_for_the_portal(env: Env) -> None:
    env.check.ok = False
    out = publish_handler.dispatch(
        env.publisher,
        {"action": "publish", "levelId": "zigzag", "draftRevision": 0, "sourceVersion": LIVE, "by": OPERATOR},
    )
    assert out["ok"] is False and out["error"]["code"] == "CHECKS_FAILED"
    assert out["error"]["details"]["problems"][0]["rule"] == "routeLength"
    claim = env.table.get_item("LEVEL#zigzag", "PUB#0000000000")
    assert claim["state"] == "REFUSED" and claim["code"] == "CHECKS_FAILED" and "campaignVersion" not in claim
    assert env.table.get_item("GDCOUNTER", "campaign#luna-1") is None  # no version number burned
    assert env.get("versions.json") is None


@pytest.mark.parametrize(
    ("header", "rule"),
    [
        (None, "missing"),
        ({"state": "DRAFT", "kind": "background", "bytes": 10}, "notApproved"),
        ({"state": "APPROVED", "kind": "decoration", "bytes": 10}, "wrongKind"),
        ({"state": "APPROVED", "kind": "background", "bytes": BACKDROP_MAX_BYTES + 1}, "tooLarge"),
    ],
)
def test_the_backdrop_must_be_an_approved_background_under_the_cap(env: Env, header: dict | None, rule: str) -> None:
    env.check.pictures = {"backdrops": [LIB], "decorations": []}
    if header is not None:
        item = {"pk": "PIC", "sk": LIB, **header}
        env.table.transact_write(
            [env.table.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})]
        )
    with pytest.raises(PublishRefused) as refused:
        env.publish()
    assert refused.value.code == "PICTURES" and refused.value.details["pictures"][0]["rule"] == rule


def test_an_approved_background_and_decoration_pass_and_are_held_by_the_version(env: Env) -> None:
    deco = "lib-" + "b" * 32
    for pid, kind in ((LIB, "background"), (deco, "decoration")):
        item = {"pk": "PIC", "sk": pid, "state": "APPROVED", "kind": kind, "bytes": 1000}
        env.table.transact_write(
            [env.table.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})]
        )
    env.check.pictures = {"backdrops": [LIB], "decorations": [deco]}
    env.publish()
    assert "zigzag@luna-1-a1" in level_picture_users(env.table, deco)


def test_bank_readiness_judges_only_ages_that_can_start_the_campaign(env: Env, monkeypatch: pytest.MonkeyPatch) -> None:
    for item in bank_items():  # the small Milestone 1 bank cannot fill a 50-wave campaign for any age
        env.table.transact_write(
            [env.table.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})]
        )
    bounds = json.loads(BOUNDS_BYTES)
    assert env.publisher.bank_problems(bounds, ["campaign", "blob-parade"]) == []

    # An age whose bank fills the campaign but not the new set: the selector's answer, made up here.
    import shared.gd_publish as gd

    monkeypatch.setattr(gd, "can_fill", lambda specs, units, rules: len(specs) == len(gd.campaign_specs()))
    problems = env.publisher.bank_problems(bounds, ["blob-parade"])
    assert {(p["ageBand"], p["waveSetId"]) for p in problems} == {
        (5, "blob-parade"),
        (6, "blob-parade"),
        (7, "blob-parade"),
    }
    with pytest.raises(PublishRefused) as refused:
        env.publish()
    assert refused.value.code == "BANK_NOT_READY"


def test_two_live_publishes_from_one_source_one_wins(env: Env) -> None:
    env.level("zigzag-two")
    real_replace = env.store.replace

    def other_publish_first(key: str, body: bytes, etag: str | None, cache: str) -> bool:
        if key.endswith("current.json"):  # zigzag-two's publish moved current.json between our read and our write
            env.put("current.json", json.dumps({"rulesetVersion": "r4", "campaignVersion": "luna-1-c1"}).encode())
        return real_replace(key, body, etag, cache)

    env.store.replace = other_publish_first  # type: ignore[method-assign]
    out = env.publish(live=True)
    assert out["live"] is False and out["liveRefused"] == "LIVE_MOVED"
    assert env.current() == "luna-1-c1"


def test_a_file_already_published_with_other_bytes_stops_the_publish(env: Env) -> None:
    env.put("campaign/luna-1-a1.json", b"{}")
    with pytest.raises(PublishRefused) as refused:
        env.publish(live=True)
    assert refused.value.code == "FILE_EXISTS" and env.current() == LIVE
    assert env.states().state("luna-1-a1", "blob-parade") == "preview"


# --- make live, states, testers, validate -----------------------------------------------------------------------------


def test_make_live_is_also_the_rollback(env: Env) -> None:
    env.publish(live=True)
    out = env.publisher.make_live(LIVE, OPERATOR)
    assert out == {"ok": True, "campaignVersion": LIVE, "live": True, "prev": "luna-1-a1"}
    assert env.current() == LIVE
    assert env.publisher.make_live(LIVE, OPERATOR)["live"] is True  # already live: nothing to do
    assert [r["action"] for r in env.table.query_prefix("GDPUBLISH", "")].count("make-live") == 1


def test_make_live_refuses_a_version_without_bounds_or_with_a_withdrawn_campaign(env: Env) -> None:
    env.put("campaign/luna-1-c1.json", (REPO / "game-data" / "campaign" / "luna-1-c1.json").read_bytes())
    with pytest.raises(PublishRefused) as unbuilt:
        env.publisher.make_live("luna-1-c1", OPERATOR)
    assert unbuilt.value.code == "NOT_BUILT"
    env.publish()
    env.publisher.set_state("luna-1-a1", "campaign", "invalid", OPERATOR)
    with pytest.raises(PublishRefused) as withdrawn:
        env.publisher.make_live("luna-1-a1", OPERATOR)
    assert withdrawn.value.code == "VERSION_WITHDRAWN"


def test_set_state_and_testers(env: Env) -> None:
    env.publisher.set_state(LIVE, "blob-parade", "retired", OPERATOR)
    env.publisher.set_testers([TESTER], OPERATOR)
    states = env.states()
    assert states.state(LIVE, "blob-parade") == "retired" and states.testers == frozenset({TESTER})
    for bad in [
        ("luna-1-c2", "blob-parade", "gone"),
        ("luna-1-c2", "no-such-set", "retired"),
        ("luna-1-z9", "x", "retired"),
    ]:
        with pytest.raises(PublishRefused):
            env.publisher.set_state(*bad, OPERATOR)
    with pytest.raises(PublishRefused):
        env.publisher.set_testers(["someone@example.invalid"], OPERATOR)
    actions = [a["action"] for a in env.table.query_prefix("AUDIT#2026-11", "")]
    assert sorted(actions) == ["gamedata.state", "gamedata.testers"]


def test_validate_checks_without_bots_or_writes(env: Env) -> None:
    out = env.publisher.validate("zigzag")
    assert out["ok"] is True and out["sourceVersion"] == LIVE and out["draftRevision"] == 0
    assert env.check.calls[0]["runBots"] is False
    assert env.get("versions.json") is None and env.table.query_prefix("GDPUBLISH", "") == []


# --- the handler's AWS pieces ----------------------------------------------------------------------------------------


def test_the_store_is_create_only_and_compare_and_set(env: Env) -> None:
    store = env.store
    assert store.create("game-data/x.json", b"1", "c") is True
    assert store.create("game-data/x.json", b"1", "c") is False  # the same bytes again: accepted
    with pytest.raises(PublishRefused):
        store.create("game-data/x.json", b"2", "c")
    _body, etag = store.get("game-data/x.json") or (b"", "")
    assert store.replace("game-data/x.json", b"3", etag, "c") is True
    assert store.replace("game-data/x.json", b"4", etag, "c") is False  # stale ETag
    assert store.replace("game-data/new.json", b"5", None, "c") is True
    assert store.replace("game-data/new.json", b"6", None, "c") is False  # must not exist
    assert store.get("game-data/none.json") is None


def test_the_freeze_switch_and_the_check_invocation() -> None:
    class Ssm:
        def get_parameter(self, Name: str) -> dict:  # boto3's argument name
            return {"Parameter": {"Value": "true" if Name == "on" else "false"}}

    assert publish_handler.ssm_frozen("on", Ssm())() is True
    assert publish_handler.ssm_frozen("off", Ssm())() is False

    class Lam:
        def __init__(self, error: str | None) -> None:
            self.error = error

        def invoke(self, **kwargs: Any) -> dict:
            assert kwargs["InvocationType"] == "RequestResponse"
            out = {"Payload": io.BytesIO(json.dumps({"ok": True, "echo": json.loads(kwargs["Payload"])}).encode())}
            return {**out, "FunctionError": self.error} if self.error else out

    assert publish_handler.lambda_check("fn", Lam(None))({"a": 1})["echo"] == {"a": 1}
    with pytest.raises(RuntimeError):
        publish_handler.lambda_check("fn", Lam("Unhandled"))({"a": 1})


def test_an_unknown_action_or_missing_operator_is_refused(env: Env) -> None:
    assert publish_handler.dispatch(env.publisher, {"action": "drop"})["error"]["code"] == "INVALID"
    assert (
        publish_handler.dispatch(env.publisher, {"action": "makeLive", "campaignVersion": LIVE})["error"]["code"]
        == "INVALID"
    )
