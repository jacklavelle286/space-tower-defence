"""contracts/routes.json against G §2, and each function's allow-list against routes.json."""

from __future__ import annotations

import json

import pytest
from conftest import REPO, load_handler

ROUTES = json.loads((REPO / "contracts" / "routes.json").read_text())["routes"]
FIELDS = {"id", "method", "path", "function", "authoriser", "scope"}
SCOPE = {"player": "game/play", "operator": "ops/content"}
MODULE = {"player-api": "player_api", "admin-api": "admin_api", "tts": "tts"}


def test_thirty_two_routes_in_catalogue_order() -> None:
    assert [route["id"] for route in ROUTES] == [f"R{n}" for n in range(1, 33)]
    assert all(set(route) == FIELDS for route in ROUTES)


def test_route_keys_are_unique_and_keep_the_api_prefix() -> None:
    keys = [f"{route['method']} {route['path']}" for route in ROUTES]
    assert len(set(keys)) == 32
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
        "admin-api": [f"R{n}" for n in range(17, 33)],
    }


@pytest.mark.parametrize("function", sorted(MODULE))
def test_function_allow_list_equals_catalogue(function: str) -> None:
    expected = {f"{r['method']} {r['path']}": r["authoriser"] for r in ROUTES if r["function"] == function}
    assert expected == load_handler(MODULE[function]).ROUTES
