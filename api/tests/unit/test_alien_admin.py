"""admin-api's alien routes (Gate M, AM1; ADR-0041): R57-R61 on moto. The live ruleset's aliens come from the
released game data (r1 here); made aliens are ALIEN items; publish queues the game-data publisher (faked here; its own
tests are test_publish_alien.py)."""

from __future__ import annotations

from typing import Any

import pytest
from test_admin_api import SUB, Admin
from test_gamedata_admin import FakePublisher
from test_planet_admin import picture

from shared.pictures import picture_users

FRAMES = ["lib-" + str(n) * 32 for n in range(1, 7)]
ZORP = {"alienId": "zorp", "name": "Zorp", "hp": 30, "speed": 1.1, "leak": 1, "bounty": 4}
STATS = {k: ZORP[k] for k in ("name", "hp", "speed", "leak", "bounty")}
TICKS = {"friendly": True, "walkLooksRight": True, "statsFitTheName": True}


@pytest.fixture
def api(ddb: Any, player_event: dict[str, Any]) -> Admin:
    admin = Admin(ddb, player_event)
    admin.publisher = FakePublisher()
    admin.release_game_data()  # r1, luna-1-c1
    for frame in FRAMES:
        picture(admin.table, frame, "alien")
    return admin


def test_make_list_and_change_a_draft_alien(api: Admin) -> None:
    status, body = api.call("POST /api/admin/aliens", ZORP)
    assert status == 201
    assert body["alien"] == {**ZORP, "art": [], "status": "DRAFT", "updatedAt": body["alien"]["updatedAt"]}
    status, listed = api.call("GET /api/admin/aliens")
    assert status == 200 and listed["rulesetVersion"] == "r1"
    assert [a["alienId"] for a in listed["game"]] == ["blob"]  # r1's one alien, read-only
    assert [a["alienId"] for a in listed["aliens"]] == ["zorp"]
    status, body = api.call("PUT /api/admin/aliens/{id}", {**STATS, "name": "Zorp Two", "art": FRAMES}, id="zorp")
    assert status == 200 and (body["alien"]["name"], body["alien"]["art"]) == ("Zorp Two", FRAMES)
    assert picture_users(api.table, FRAMES[0]) == ["alien:zorp"]
    assert api.call("DELETE /api/admin/aliens/{id}", id="zorp") == (200, {"deleted": "zorp"})
    assert api.call("GET /api/admin/aliens")[1]["aliens"] == []


def test_stats_stay_inside_the_alien_maker_limits(api: Admin) -> None:
    bad = {**ZORP, "hp": 61, "speed": 1.15, "leak": 1.5, "bounty": True, "name": " Zorp"}
    status, body = api.call("POST /api/admin/aliens", bad)
    assert status == 400
    assert {(p["field"], p["rule"]) for p in body["error"]["details"]} == {
        ("hp", "range"),
        ("speed", "step"),
        ("leak", "whole"),
        ("bounty", "type"),
        ("name", "length"),
    }
    assert api.call("POST /api/admin/aliens", {**ZORP, "alienId": "Zorp"})[1]["error"]["details"] == [
        {"field": "alienId", "rule": "pattern"}
    ]
    assert api.call("POST /api/admin/aliens", {**ZORP, "alienId": "blob"})[1]["error"]["details"] == [
        {"field": "alienId", "rule": "exists"}
    ]
    assert api.call("POST /api/admin/aliens", ZORP)[0] == 201
    assert api.call("POST /api/admin/aliens", ZORP)[0] == 400  # the same ID again


def test_the_walk_is_six_approved_alien_pictures(api: Admin) -> None:
    api.call("POST /api/admin/aliens", ZORP)
    status, body = api.call("PUT /api/admin/aliens/{id}", {**STATS, "art": FRAMES[:5]}, id="zorp")
    assert (status, body["error"]["details"]) == (400, [{"field": "art", "rule": "frames"}])
    picture(api.table, "lib-" + "8" * 32, "planet")
    picture(api.table, "lib-" + "9" * 32, "alien", state="DRAFT")
    art = [*FRAMES[:4], "lib-" + "8" * 32, "lib-" + "9" * 32]
    status, body = api.call("PUT /api/admin/aliens/{id}", {**STATS, "art": art}, id="zorp")
    assert status == 400
    assert [p["field"] for p in body["error"]["details"]] == ["art[4]", "art[5]"]


def test_publish_needs_the_walk_and_the_ticks_and_then_the_draft_is_held(api: Admin) -> None:
    api.call("POST /api/admin/aliens", ZORP)
    status, body = api.call("POST /api/admin/aliens/{id}/publish", {"ticks": TICKS}, id="zorp")
    assert (status, body["error"]["details"]) == (400, [{"field": "art", "rule": "frames"}])
    api.call("PUT /api/admin/aliens/{id}", {**STATS, "art": FRAMES}, id="zorp")
    status, body = api.call("POST /api/admin/aliens/{id}/publish", {"ticks": {**TICKS, "friendly": False}}, id="zorp")
    assert (status, body["error"]["details"]) == (400, [{"field": "ticks.friendly", "rule": "must_be_ticked"}])
    status, body = api.call("POST /api/admin/aliens/{id}/publish", {"ticks": TICKS}, id="zorp")
    assert status == 202 and body["alien"]["publish"]["state"] == "QUEUED"
    assert api.publisher.started == [{"action": "publishAlien", "alienId": "zorp", "by": SUB}]
    # While it is on its way the draft is held: no change, no delete, no second queue.
    for route, extra in (
        ("PUT /api/admin/aliens/{id}", {**STATS, "art": FRAMES}),
        ("POST /api/admin/aliens/{id}/publish", {"ticks": TICKS}),
    ):
        status, body = api.call(route, extra, id="zorp")
        assert (status, body["error"]["details"]["code"]) == (409, "PUBLISHING")
    assert api.call("DELETE /api/admin/aliens/{id}", id="zorp")[0] == 409


def test_a_published_alien_is_fixed(api: Admin) -> None:
    api.call("POST /api/admin/aliens", ZORP)
    api.table.update_item("ALIEN", "zorp", update="SET #s = :p", names={"#s": "status"}, values={":p": "PUBLISHED"})
    status, body = api.call("PUT /api/admin/aliens/{id}", {**STATS, "art": FRAMES}, id="zorp")
    assert (status, body["error"]["details"]["code"]) == (409, "ALIEN_PUBLISHED")
    assert api.call("DELETE /api/admin/aliens/{id}", id="zorp")[0] == 409


def test_the_editor_gets_the_live_ruleset(api: Admin) -> None:
    status, body = api.call("GET /api/admin/game-data")
    assert status == 200 and body["ruleset"]["version"] == "r1" and "blob" in body["ruleset"]["aliens"]
