"""admin-api's planet routes (Gate M, LD10): R53-R56 on moto, a level's planet (R41) and the editor's base per planet
(R46 ?planet=). Released planets come from current.json; unreleased ones from the registry; a release goes through the
game-data publisher (faked here; the publisher's own tests cover release_planet)."""

from __future__ import annotations

import json
from typing import Any

import pytest
from test_admin_api import SUB, Admin
from test_gamedata_admin import FakePublisher
from test_levels import level

from shared.data import DynamoTable

ICON = "lib-" + "1" * 32
BACKGROUND = "lib-" + "2" * 32
MARS = {"planetId": "mars-1", "name": "Red Dust", "icon": ICON, "artSet": "moon", "backdrop": BACKGROUND}


def picture(table: DynamoTable, picture_id: str, kind: str, state: str = "APPROVED") -> None:
    item = {"pk": "PIC", "sk": picture_id, "pictureId": picture_id, "state": state, "kind": kind, "name": "x"}
    table.transact_write([table.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})])


@pytest.fixture
def api(ddb: Any, player_event: dict[str, Any]) -> Admin:
    admin = Admin(ddb, player_event)
    admin.publisher = FakePublisher()
    admin.release_game_data()  # luna-1-c1 released
    picture(admin.table, ICON, "planet")
    picture(admin.table, BACKGROUND, "background")
    return admin


def test_add_list_and_change_an_unreleased_planet(api: Admin) -> None:
    status, body = api.call("POST /api/admin/planets", MARS)
    assert status == 201 and body["planet"]["status"] == "DRAFT"
    status, listed = api.call("GET /api/admin/planets")
    assert status == 200
    assert [(p["planetId"], p["status"]) for p in listed["planets"]] == [("luna-1", "RELEASED"), ("mars-1", "DRAFT")]
    assert listed["planets"][0]["liveVersion"] == "luna-1-c1" and listed["planets"][0]["order"] == 0
    assert (listed["planets"][1]["campaignWaves"], listed["planets"][1]["readyToRelease"]) == (0, False)
    status, body = api.call("PUT /api/admin/planets/{id}", {**{k: MARS[k] for k in MARS if k != "planetId"},
                                                           "name": "Red Dust Two"}, id="mars-1")  # fmt: skip
    assert status == 200 and body["planet"]["name"] == "Red Dust Two"


def test_a_planet_needs_approved_pictures_of_the_right_kind_and_a_new_id(api: Admin) -> None:
    picture(api.table, "lib-" + "3" * 32, "planet", state="DRAFT")
    status, body = api.call("POST /api/admin/planets", {**MARS, "icon": "lib-" + "3" * 32, "backdrop": ICON})
    assert status == 400
    assert {p["field"] for p in body["error"]["details"]} == {"icon", "backdrop"}
    status, body = api.call("POST /api/admin/planets", {**MARS, "planetId": "luna-1"})
    assert status == 400 and body["error"]["details"] == [{"field": "planetId", "rule": "exists"}]
    status, body = api.call("POST /api/admin/planets", {**MARS, "artSet": "mars"})
    assert status == 400 and body["error"]["details"] == [{"field": "artSet", "rule": "enum"}]
    assert api.call("POST /api/admin/planets", {**MARS, "icon": None, "backdrop": None})[0] == 201
    assert api.call("POST /api/admin/planets", MARS)[0] == 400  # the same ID again


def test_a_released_planet_is_not_changed(api: Admin) -> None:
    api.call("POST /api/admin/planets", MARS)
    api.table.update_item("PLANET", "mars-1", update="SET #s = :r", names={"#s": "status"}, values={":r": "RELEASED"})
    status, body = api.call("PUT /api/admin/planets/{id}", {k: MARS[k] for k in MARS if k != "planetId"}, id="mars-1")
    assert (status, body["error"]["details"]["code"]) == (409, "PLANET_RELEASED")


def test_release_goes_to_the_publisher(api: Admin) -> None:
    api.publisher.answer = {"ok": True, "planetId": "mars-1", "released": True, "order": 1}
    status, body = api.call("POST /api/admin/planets/{id}/release", id="mars-1")
    assert status == 200 and body["order"] == 1
    assert api.publisher.calls == [{"action": "releasePlanet", "planetId": "mars-1", "by": SUB}]


def test_a_level_belongs_to_a_known_planet(api: Admin) -> None:
    status, body = api.call("POST /api/admin/levels", {"level": level(), "planetId": "mars-1"})
    assert status == 400 and body["error"]["details"] == [{"field": "planetId", "rule": "unknown_planet"}]
    api.call("POST /api/admin/planets", MARS)
    status, body = api.call("POST /api/admin/levels", {"level": level(), "planetId": "mars-1"})
    assert status == 201 and body["header"]["planetId"] == "mars-1"


def test_the_editor_base_for_a_planet_with_no_version_is_its_empty_document(api: Admin) -> None:
    api.call("POST /api/admin/planets", MARS)
    status, body = api.call("GET /api/admin/game-data", query={"planet": "mars-1"})
    assert status == 200
    assert body["base"] == {"planetId": "mars-1", "sourceVersion": "mars-1-new"}
    assert (body["live"]["name"], body["live"]["look"], body["live"]["waves"]) == (
        "Red Dust",
        {"icon": ICON, "artSet": "moon"},
        [],
    )
    status, luna = api.call("GET /api/admin/game-data")
    assert luna["base"] == {"planetId": "luna-1", "sourceVersion": "luna-1-c1"}
    assert api.call("GET /api/admin/game-data", query={"planet": "venus-1"})[0] == 404


def test_a_planets_pictures_cannot_be_deleted(api: Admin) -> None:
    from shared.pictures import picture_users

    api.call("POST /api/admin/planets", MARS)
    assert picture_users(api.table, ICON) == ["planet:mars-1"]
    assert json.dumps(picture_users(api.table, BACKGROUND)) == '["planet:mars-1"]'
