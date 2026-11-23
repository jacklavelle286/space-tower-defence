"""contracts/routes.json against G §2, and each function's allow-list against routes.json."""

from __future__ import annotations

import json

import pytest
from conftest import REPO, load_handler

ROUTES = json.loads((REPO / "contracts" / "routes.json").read_text())["routes"]
FIELDS = {"id", "method", "path", "function", "authoriser", "scope"}
SCOPE = {"player": "game/play", "operator": "ops/content", "staff": "school/staff"}
MODULE = {"player-api": "player_api", "admin-api": "admin_api", "tts": "tts"}


def test_routes_in_catalogue_order() -> None:
    """R1-R30 (G §2), R31-R32 (deletes, 2026-11-16), R33-R39 (pictures; Gate P), R40-R45 (levels; Gate M, LD3-LD5),
    R46-R52 (game data through the publisher; Gate M, LD7), R53-R56 (planets; LD10), R57-R61 (aliens; AM1),
    R62 (move a level; LD19): the family edition. R63 onwards: the school platform, each with a permission (DAT-7)."""
    assert [route["id"] for route in ROUTES] == [f"R{n}" for n in range(1, len(ROUTES) + 1)]
    assert len(ROUTES) >= 63
    for route in ROUTES:
        expected = FIELDS | {"permission"} if int(route["id"][1:]) >= 63 else FIELDS
        assert set(route) == expected, route["id"]


def test_route_keys_are_unique_and_keep_the_api_prefix() -> None:
    keys = [f"{route['method']} {route['path']}" for route in ROUTES]
    assert len(set(keys)) == len(ROUTES)
    for route in ROUTES:
        assert route["method"] in {"GET", "POST", "PUT", "PATCH", "DELETE"}
        assert route["path"].startswith("/api/")


def test_every_route_has_a_token_and_the_right_scope() -> None:
    for route in ROUTES:
        assert route["authoriser"] in SCOPE, route["id"]  # no unauthenticated route (G §1.1)
        assert route["scope"] == SCOPE[route["authoriser"]], route["id"]
        is_admin_path = route["path"].startswith("/api/admin/")
        assert (route["authoriser"] == "operator") == is_admin_path, route["id"]


def test_functions_per_g2() -> None:
    by_function: dict[str, list[str]] = {}
    for route in ROUTES:
        by_function.setdefault(route["function"], []).append(route["id"])
    assert by_function == {
        "player-api": [f"R{n}" for n in range(1, 15)],
        "tts": ["R15", "R16"],
        "admin-api": [f"R{n}" for n in range(17, 63)],
        "school-api": ["R63"],
    }


@pytest.mark.parametrize("function", sorted(MODULE))
def test_function_allow_list_equals_catalogue(function: str) -> None:
    expected = {f"{r['method']} {r['path']}": r["authoriser"] for r in ROUTES if r["function"] == function}
    assert expected == load_handler(MODULE[function]).ROUTES


def test_picture_routes_are_admin_api_operator_routes() -> None:
    """Gate P: the seven picture routes, behind the operator authoriser with the content scope, on admin-api."""
    pictures = {r["id"]: f"{r['method']} {r['path']}" for r in ROUTES if r["id"] in {f"R{n}" for n in range(33, 40)}}
    assert pictures == {
        "R33": "GET /api/admin/pictures",
        "R34": "POST /api/admin/pictures",
        "R35": "GET /api/admin/pictures/{id}",
        "R36": "POST /api/admin/pictures/{id}/approve",
        "R37": "DELETE /api/admin/pictures/{id}",
        "R38": "POST /api/admin/picture-jobs",
        "R39": "GET /api/admin/picture-jobs/{jobId}",
    }
    assert all(r["function"] == "admin-api" and r["authoriser"] == "operator" for r in ROUTES if r["id"] in pictures)


def test_routes_from_r63_name_a_known_permission() -> None:
    """DAT-7: every school route, from R63, names one permission from contracts/permissions.json (the tenancy checks
    refuse a member without it, 04 §5.3 check 6). The family edition's R1-R62 keep their authorisers and name none."""
    permissions = json.loads((REPO / "contracts" / "permissions.json").read_text())["permissions"]
    for route in ROUTES:
        if int(route["id"][1:]) >= 63:
            assert route.get("permission") in permissions, route["id"]
        else:
            assert "permission" not in route, route["id"]


def test_school_api_allow_list_equals_catalogue() -> None:
    """school-api's routes and their permissions equal the catalogue's: the tenancy checks read them from the
    handler."""
    expected = {f"{r['method']} {r['path']}": r["permission"] for r in ROUTES if r["function"] == "school-api"}
    routes = load_handler("school_api").ROUTES
    assert {key: route.permission for key, route in routes.items()} == expected
