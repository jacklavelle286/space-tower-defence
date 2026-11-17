"""Tests for scripts/check_route_keys.py (gate G-12): plans built from the real contracts/routes.json, then broken."""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
REPO = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

import check_route_keys as crk  # noqa: E402

CATALOGUE = json.loads((REPO / "contracts" / "routes.json").read_text())


def route_resource(name: str, key: str, auth: str = "JWT", scopes: list[str] | None = None) -> dict:
    return {
        "address": f'module.http_api.aws_apigatewayv2_route.this["{name}"]',
        "mode": "managed",
        "type": "aws_apigatewayv2_route",
        "name": "this",
        "index": name,
        "values": {"route_key": key, "authorization_type": auth, "authorization_scopes": scopes,
                   "api_key_required": False},
    }


def matching_plan() -> dict:
    """A plan shaped like `terraform show -json`: routes inside a child module, other resources beside them."""
    routes = [route_resource(r["id"], f"{r['method']} {r['path']}", "JWT", [r["scope"]]) for r in CATALOGUE["routes"]]
    return {
        "format_version": "1.2",
        "planned_values": {"root_module": {
            "resources": [{"address": "aws_s3_bucket.x", "mode": "managed", "type": "aws_s3_bucket", "values": {}}],
            "child_modules": [
                {"address": "module.http_api", "resources": [
                    {"address": "module.http_api.aws_apigatewayv2_api.this", "mode": "managed",
                     "type": "aws_apigatewayv2_api", "values": {"protocol_type": "HTTP"}},
                    *routes,
                ]},
                {"address": "module.player_api", "resources": [], "child_modules": [
                    {"address": "module.player_api.module.inner", "resources": []}]},
            ],
        }},
    }


def run(tmp_path: Path, plan: dict, catalogue: dict | None = None) -> int:
    plan_file = tmp_path / "tfplan.json"
    plan_file.write_text(json.dumps(plan))
    args = [str(plan_file)]
    if catalogue is not None:
        routes_file = tmp_path / "routes.json"
        routes_file.write_text(json.dumps(catalogue))
        args += ["--routes", str(routes_file)]
    return crk.main(args)


def routes_of(plan: dict) -> list[dict]:
    return plan["planned_values"]["root_module"]["child_modules"][0]["resources"]


def problems(plan: dict) -> list[str]:
    return crk.compare(crk.load_catalogue(crk.ROUTES_FILE), crk.planned_routes(plan))


def test_matching_plan_passes(tmp_path: Path, capsys) -> None:
    assert run(tmp_path, matching_plan()) == crk.EXIT_OK
    assert "OK: the plan's 44 routes equal" in capsys.readouterr().out


def test_catalogue_has_thirty_nine_routes_with_api_prefix() -> None:
    expected = crk.load_catalogue(crk.ROUTES_FILE)
    assert len(expected) == 44  # R1-R32, R33-R39 (Gate P pictures) and R40-R44 (Gate M levels)
    assert all(key.split(" ", 1)[1].startswith("/api/") for key in expected)


def test_missing_route_fails(tmp_path: Path, capsys) -> None:
    plan = matching_plan()
    routes_of(plan)[:] = [r for r in routes_of(plan) if r["values"].get("route_key") != "GET /api/me"]
    assert run(tmp_path, plan) == crk.EXIT_MISMATCH
    assert "missing from the plan: R1 `GET /api/me`" in capsys.readouterr().out


def test_extra_route_fails(tmp_path: Path) -> None:
    plan = matching_plan()
    routes_of(plan).append(route_resource("extra", "GET /api/debug", "JWT", ["game/play"]))
    assert run(tmp_path, plan) == crk.EXIT_MISMATCH
    assert any("not in routes.json: `GET /api/debug`" in p for p in problems(plan))


def test_default_route_is_not_allowed() -> None:
    plan = matching_plan()
    routes_of(plan).append(route_resource("default", "$default", "NONE", None))
    assert any("not in routes.json: `$default`" in p for p in problems(plan))


def test_route_key_without_api_prefix_fails() -> None:
    # P3 / ADR-0001: the route keys keep /api; a gateway that strips it would plan "GET /me".
    plan = matching_plan()
    routes_of(plan)[1]["values"]["route_key"] = "GET /me"
    found = problems(plan)
    assert any("missing from the plan: R1 `GET /api/me`" in p for p in found)
    assert any("not in routes.json: `GET /me`" in p for p in found)


def test_duplicate_route_fails() -> None:
    plan = matching_plan()
    routes_of(plan).append(copy.deepcopy(routes_of(plan)[1]))
    assert any("planned 2 times" in p for p in problems(plan))


def test_route_without_authoriser_fails() -> None:
    plan = matching_plan()
    routes_of(plan)[1]["values"].update(authorization_type="NONE", authorization_scopes=None)
    found = problems(plan)
    assert any("authorization_type is 'NONE', expected 'JWT'" in p for p in found)
    assert any("authorization_scopes is unknown at plan time" in p for p in found)


@pytest.mark.parametrize("scopes", [[], ["ops/content"], ["game/play", "ops/content"]])
def test_wrong_scope_fails(scopes: list[str]) -> None:
    plan = matching_plan()
    routes_of(plan)[1]["values"]["authorization_scopes"] = scopes  # R1, a game/play route
    assert any("R1 `GET /api/me`: authorization_scopes is" in p for p in problems(plan))


def test_unknown_route_key_fails() -> None:
    plan = matching_plan()
    routes_of(plan)[1]["values"]["route_key"] = None
    assert any("route_key is unknown at plan time" in p for p in problems(plan))


def test_no_routes_in_plan_fails(tmp_path: Path) -> None:
    plan = matching_plan()
    routes_of(plan)[:] = routes_of(plan)[:1]
    assert run(tmp_path, plan) == crk.EXIT_MISMATCH


def test_route_without_authoriser_in_catalogue_expects_none(tmp_path: Path) -> None:
    catalogue = {"routes": [{"id": "R0", "method": "GET", "path": "/api/health", "authoriser": "none"}]}
    plan = {"planned_values": {"root_module": {"resources": [
        route_resource("health", "GET /api/health", "NONE", None)]}}}
    assert run(tmp_path, plan, catalogue) == crk.EXIT_OK


def test_data_sources_are_ignored() -> None:
    plan = matching_plan()
    stray = route_resource("data", "GET /api/stray")
    stray["mode"] = "data"
    routes_of(plan).append(stray)
    assert problems(plan) == []


@pytest.mark.parametrize("plan", [{}, {"planned_values": {}}, {"resource_changes": []}])
def test_not_a_plan_exits_2(tmp_path: Path, plan: dict) -> None:
    assert run(tmp_path, plan) == crk.EXIT_BAD_INPUT


def test_unreadable_files_exit_2(tmp_path: Path) -> None:
    assert crk.main([str(tmp_path / "absent.json")]) == crk.EXIT_BAD_INPUT
    bad = tmp_path / "bad.json"
    bad.write_text("{not json")
    assert crk.main([str(bad)]) == crk.EXIT_BAD_INPUT


def test_catalogue_duplicate_or_missing_scope_exits_2(tmp_path: Path) -> None:
    r = {"id": "R1", "method": "GET", "path": "/api/me", "authoriser": "player", "scope": "game/play"}
    assert run(tmp_path, matching_plan(), {"routes": [r, dict(r, id="R1b")]}) == crk.EXIT_BAD_INPUT
    assert run(tmp_path, matching_plan(), {"routes": [dict(r, scope="")]}) == crk.EXIT_BAD_INPUT
