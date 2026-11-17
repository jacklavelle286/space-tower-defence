"""Level drafts (Gate M, LD3): R40-R44 on moto. A level file body is checked for shape only (the design rules are
game-core's, run in the editor and by the publisher); saves are conditioned on the draft revision; a picture a level
draft uses cannot be deleted from the library."""

from __future__ import annotations

import copy
import json
from typing import Any

import pytest
from conftest import REPO
from test_admin_api import Admin

from shared.levels import level_problems
from shared.pictures import level_picture_users

LIB = "lib-0123456789abcdef0123456789abcdef"


def level(level_id: str = "zigzag", **changes: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "kind": "level",
        "schema": 1,
        "levelId": level_id,
        "name": "Zigzag",
        "map": {
            "name": "Zigzag",
            "grid": {"cols": 20, "rows": 11},
            "route": [[0, 5], [3, 5], [3, 1], [7, 1], [7, 9], [19, 9]],
            "pads": [{"id": f"{level_id}-p01", "x": 1, "y": 3, "opensAfterWave": 0}],
            "art": {"backdrop": LIB, "decorations": [{"art": "deco-rock-1", "x": 1, "y": 9}]},
        },
        "challengeWaves": {},
        "waveSets": {},
    }
    body.update(changes)
    return body


@pytest.fixture
def api(ddb: Any, player_event: dict[str, Any]) -> Admin:
    return Admin(ddb, player_event)


def test_create_get_save_list_delete(api: Admin) -> None:
    status, view = api.call("POST /api/admin/levels", {"level": level()})
    assert status == 201, view
    assert view["header"] == {
        "levelId": "zigzag",
        "name": "Zigzag",
        "status": "DRAFT",
        "planetId": "luna-1",  # LD10: a level with no planet is the repository planet's
        "updatedAt": view["header"]["updatedAt"],
    }
    assert view["draft"]["draftRevision"] == 0 and view["draft"]["level"] == level()

    renamed = level(name="Zigzag two")
    status, view = api.call("PUT /api/admin/levels/{id}/draft", {"draftRevision": 0, "level": renamed}, id="zigzag")
    assert status == 200, view
    assert view["draft"]["draftRevision"] == 1 and view["header"]["name"] == "Zigzag two"

    status, listed = api.call("GET /api/admin/levels")
    assert status == 200 and [i["levelId"] for i in listed["items"]] == ["zigzag"]

    status, gone = api.call("DELETE /api/admin/levels/{id}", id="zigzag")
    assert status == 200 and gone == {"levelId": "zigzag", "deleted": True}
    assert api.call("GET /api/admin/levels/{id}", id="zigzag")[0] == 404
    audits = [i for i in api.raw.scan(TableName="test-content")["Items"] if i["pk"]["S"].startswith("AUDIT#")]
    assert sorted(i["action"]["S"] for i in audits) == ["level.create", "level.delete"]


def test_a_stale_revision_is_a_draft_conflict(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    assert api.call("PUT /api/admin/levels/{id}/draft", {"draftRevision": 0, "level": level()}, id="zigzag")[0] == 200
    status, body = api.call("PUT /api/admin/levels/{id}/draft", {"draftRevision": 0, "level": level()}, id="zigzag")
    assert status == 409 and body["error"]["code"] == "DRAFT_CONFLICT"
    status, body = api.call("PUT /api/admin/levels/{id}/draft", {"draftRevision": 1, "level": level()}, id="other")
    assert status == 400  # the body's levelId must match the path
    assert {"field": "level.levelId", "rule": "matches_path"} in body["error"]["details"]


def test_saving_a_level_that_does_not_exist_is_not_found(api: Admin) -> None:
    status, _ = api.call("PUT /api/admin/levels/{id}/draft", {"draftRevision": 0, "level": level("ghost")}, id="ghost")
    assert status == 404


def test_an_id_already_used_is_refused(api: Admin) -> None:
    assert api.call("POST /api/admin/levels", {"level": level()})[0] == 201
    status, body = api.call("POST /api/admin/levels", {"level": level()})
    assert status == 400 and body["error"]["details"] == [{"field": "level.levelId", "rule": "exists"}]


@pytest.mark.parametrize(
    ("change", "rule"),
    [
        (lambda b: b.update(kind="planet"), ("level.kind", "const")),
        (lambda b: b.update(extra=1), ("level.extra", "additionalProperties")),
        (lambda b: b["map"].update(grid={"cols": 21, "rows": 11}), ("level.map.grid", "grid")),
        (lambda b: b["map"].update(route=[[0, 5]]), ("level.map.route", "route")),
        (lambda b: b["map"].update(route=[[0, 5], [25, 5]]), ("level.map.route", "route")),
        (lambda b: b["map"]["pads"][0].update(id="p01"), ("level.map.pads[0].id", "pad_id")),
        (lambda b: b["map"]["pads"].append(dict(b["map"]["pads"][0])), ("level.map.pads[1].id", "unique")),
        (lambda b: b["map"]["art"].update(backdrop="luna-backdrop"), ("level.map.art.backdrop", "picture")),
        (
            lambda b: b["map"]["art"]["decorations"].append({"art": "rock", "x": 1, "y": 1}),
            ("level.map.art.decorations[1]", "decoration"),
        ),
        (lambda b: b.update(name=""), ("level.name", "name")),
        (lambda b: b.update(waveSets=[]), ("level.waveSets", "type")),
    ],
)
def test_shape_problems(change: Any, rule: tuple[str, str]) -> None:
    body = copy.deepcopy(level())
    change(body)
    assert {"field": rule[0], "rule": rule[1]} in level_problems(body, "zigzag")


def test_the_good_body_has_no_problems_and_an_oversized_one_is_refused(api: Admin) -> None:
    assert level_problems(level(), "zigzag") == []
    big = level(name="Big")
    big["challengeWaves"] = {f"w{i}": {"pad": "x" * 1000} for i in range(80)}
    status, body = api.call("POST /api/admin/levels", {"level": big})
    assert status == 413 or body["error"]["code"] in ("VALIDATION_FAILED", "PAYLOAD_TOO_LARGE")
    assert len(json.dumps(big)) > 64 * 1024


def test_a_picture_a_level_draft_uses_is_reported(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    assert level_picture_users(api.table, LIB) == ["zigzag"]
    assert level_picture_users(api.table, "lib-ffffffffffffffffffffffffffffffff") == []


SHAPES = json.loads((REPO / "contracts" / "fixtures" / "levels" / "shapes.json").read_text())


@pytest.mark.parametrize("name", sorted(SHAPES["valid"]))
def test_shared_valid_level_files_have_no_shape_problems(name: str) -> None:
    body = SHAPES["valid"][name]
    assert level_problems(body, body["levelId"]) == []


@pytest.mark.parametrize("name", sorted(SHAPES["invalid"]))
def test_shared_invalid_level_files_name_their_problem(name: str) -> None:
    case = SHAPES["invalid"][name]
    problems = level_problems(case["level"], case["level"]["levelId"])
    assert {"field": case["field"], "rule": case["rule"]} in problems


def test_a_test_play_is_recorded_on_its_revision_only(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    played = {"draftRevision": 0, "sourceVersion": "luna-1-c2", "blocking": 0, "warnings": 2}
    status, view = api.call("POST /api/admin/levels/{id}/testplay", played, id="zigzag")
    assert status == 200, view
    review = view["draft"]["review"]
    assert (review["testPlayedDraftRevision"], review["sourceVersion"], review["blocking"], review["warnings"]) == (
        0,
        "luna-1-c2",
        0,
        2,
    )
    api.call("PUT /api/admin/levels/{id}/draft", {"draftRevision": 0, "level": level()}, id="zigzag")
    status, body = api.call("POST /api/admin/levels/{id}/testplay", played, id="zigzag")
    assert status == 409 and body["error"]["code"] == "DRAFT_CONFLICT"
    status, body = api.call(
        "POST /api/admin/levels/{id}/testplay", {**played, "draftRevision": 1, "blocking": -1}, id="zigzag"
    )
    assert status == 400
    status, body = api.call(
        "POST /api/admin/levels/{id}/testplay", {**played, "draftRevision": 1, "sourceVersion": "Luna"}, id="zigzag"
    )
    assert status == 400 and body["error"]["details"] == [{"field": "sourceVersion", "rule": "pattern"}]


def test_the_level_list_shows_this_months_drawings_for_each_level(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    api.call("POST /api/admin/levels", {"level": level("other")})
    counter = api.table.update_action(
        "PICCAP", "L#2026-11#zigzag", update="ADD #n :w", names={"#n": "n"}, values={":w": 4}, condition=None
    )
    api.table.transact_write([counter])
    _, listed = api.call("GET /api/admin/levels")
    assert {i["levelId"]: i["drawingsThisMonth"] for i in listed["items"]} == {"other": 0, "zigzag": 4}
