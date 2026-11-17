"""Gate M, AM1 (ADR-0041): the publisher's publishAlien on moto. A made alien becomes a new ruleset and asset manifest,
bounds for every playable planet version, then both pointers move together. The fake check (test_gd_publish) stands
in for game-data-check's `rebuild`."""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

import pytest
from conftest import REPO
from test_gd_publish import LIVE, OPERATOR, Env, publish_handler

from shared.aliens import ALIEN_PK
from shared.gd_publish import PublishRefused

FRAMES = ["lib-" + str(n) * 32 for n in range(1, 7)]


def picture(env: Env, picture_id: str, kind: str = "alien", state: str = "APPROVED") -> None:
    item = {"pk": "PIC", "sk": picture_id, "pictureId": picture_id, "state": state, "kind": kind, "name": "x"}
    env.table.transact_write([env.table.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})])


def alien(env: Env, alien_id: str = "zorp", art: list[str] | None = None, **stats: Any) -> None:
    item = {
        "pk": ALIEN_PK,
        "sk": alien_id,
        "alienId": alien_id,
        "name": alien_id.title(),
        "hp": Decimal(30),
        "speed": Decimal("1.1"),
        "leak": Decimal(1),
        "bounty": Decimal(4),
        "art": FRAMES if art is None else art,
        "status": "DRAFT",
        "createdAt": "2026-11-20T09:00:00Z",
        "updatedAt": "2026-11-20T09:00:00Z",
        **stats,
    }
    env.table.transact_write([env.table.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})])


@pytest.fixture
def made(ddb: Any) -> Env:
    env = Env(ddb)
    env.put("asset-manifest/m1.json", (REPO / "game-data" / "asset-manifest" / "m1.json").read_bytes())
    for frame in FRAMES:
        picture(env, frame)
    alien(env)
    return env


def test_a_made_alien_is_a_new_ruleset_and_manifest_with_bounds_for_every_playable_version(made: Env) -> None:
    made.publish()  # luna-1-a1: a preview version testers can start
    out = made.publisher.publish_alien("zorp", OPERATOR)
    assert out == {"ok": True, "alienId": "zorp", "rulesetVersion": "r4-a1", "assetManifestVersion": "m2"}

    ruleset = made.get("ruleset/r4-a1.json")
    base = json.loads((REPO / "game-data" / "ruleset" / "r4.json").read_text())
    assert ruleset["version"] == "r4-a1"
    assert ruleset["aliens"]["zorp"] == {"name": "Zorp", "hp": 30, "speed": 1.1, "leak": 1, "bounty": 4, "traits": {}}
    assert {k: v for k, v in ruleset["aliens"].items() if k != "zorp"} == base["aliens"]
    assert {k: v for k, v in ruleset.items() if k not in ("version", "aliens")} == {
        k: v for k, v in base.items() if k not in ("version", "aliens")
    }

    manifest = made.get("asset-manifest/m2.json")
    m1 = made.get("asset-manifest/m1.json")
    walk = manifest["assets"]["alien-zorp-walk"]
    assert walk["frames"] == [f"/pictures/v1/{f}.png" for f in FRAMES]
    assert (walk["anchor"], walk["size"]) == (
        m1["assets"]["alien-blob-walk"]["anchor"],
        m1["assets"]["alien-blob-walk"]["size"],
    )
    assert manifest["artSets"] == m1["artSets"]

    for version in (LIVE, "luna-1-a1"):  # the live version and the tester preview both get bounds
        assert made.get(f"bounds/r4-a1__{version}.json")["rulesetVersion"] == "r4-a1"
    current = made.get("current.json")
    assert (current["rulesetVersion"], current["assetManifestVersion"], current["campaignVersion"]) == (
        "r4-a1",
        "m2",
        LIVE,
    )
    item = made.table.get_item(ALIEN_PK, "zorp")
    assert (item["status"], item["rulesetVersion"], item["publish"]["state"]) == ("PUBLISHED", "r4-a1", "DONE")
    rows = made.table.query_prefix("GDPUBLISH", "")
    assert [r["action"] for r in rows if r["action"] == "publish-alien"] == ["publish-alien"]

    # A repeat answers as done and writes nothing new; a second alien builds on the first.
    assert made.publisher.publish_alien("zorp", OPERATOR)["rulesetVersion"] == "r4-a1"
    alien(made, "gloop")
    assert made.publisher.publish_alien("gloop", OPERATOR)["rulesetVersion"] == "r4-a2"
    second = made.get("ruleset/r4-a2.json")
    assert {"zorp", "gloop"} <= set(second["aliens"])
    assert {"alien-zorp-walk", "alien-gloop-walk"} <= set(made.get("asset-manifest/m3.json")["assets"])


def test_an_unfinished_alien_or_unapproved_frames_are_refused_and_nothing_is_written(made: Env) -> None:
    alien(made, "bare", art=[])
    with pytest.raises(PublishRefused) as bare:
        made.publisher.publish_alien("bare", OPERATOR)
    assert bare.value.code == "INVALID_ALIEN"
    picture(made, "lib-" + "9" * 32, state="DRAFT")
    alien(made, "draft", art=[*FRAMES[:5], "lib-" + "9" * 32])
    with pytest.raises(PublishRefused) as unapproved:
        made.publisher.publish_alien("draft", OPERATOR)
    assert unapproved.value.code == "PICTURES"
    assert unapproved.value.details == {"pictures": [{"pictureId": "lib-" + "9" * 32, "rule": "notApproved"}]}
    alien(made, "blob")
    with pytest.raises(PublishRefused) as clash:
        made.publisher.publish_alien("blob", OPERATOR)
    assert clash.value.code == "ALIEN_EXISTS"
    alien(made, "slow", speed=Decimal("0.35"))
    with pytest.raises(PublishRefused) as bad_stats:
        made.publisher.publish_alien("slow", OPERATOR)
    assert bad_stats.value.code == "INVALID_ALIEN"
    assert made.get("current.json")["rulesetVersion"] == "r4"
    assert made.get("ruleset/r4-a1.json") is None


def test_a_live_version_that_does_not_work_with_the_new_ruleset_stops_the_publish(made: Env) -> None:
    made.check.unbuildable.add(LIVE)
    with pytest.raises(PublishRefused) as refused:
        made.publisher.publish_alien("zorp", OPERATOR)
    assert refused.value.code == "CHECKS_FAILED"
    assert made.get("current.json")["rulesetVersion"] == "r4"
    assert made.get("ruleset/r4-a1.json") is None


def test_current_json_moved_meanwhile_leaves_the_alien_a_draft_with_the_refusal(
    made: Env, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(made.store, "replace", lambda *_args, **_kw: False)
    answer = publish_handler.dispatch(made.publisher, {"action": "publishAlien", "alienId": "zorp", "by": OPERATOR})
    assert answer["ok"] is False and answer["error"]["code"] == "LIVE_MOVED"
    item = made.table.get_item(ALIEN_PK, "zorp")
    assert (item["status"], item["publish"]["state"], item["publish"]["code"]) == ("DRAFT", "REFUSED", "LIVE_MOVED")
    made.is_frozen = True
    with pytest.raises(PublishRefused) as frozen:
        made.publisher.publish_alien("zorp", OPERATOR)
    assert frozen.value.code == "FROZEN"
