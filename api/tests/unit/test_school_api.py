"""school-api (DAT-8): R63, the route x access-level matrix for every school route in contracts/routes.json, and the
rule that its handler reaches school data only through the SchoolContext it is given."""

from __future__ import annotations

import ast
import json
from pathlib import Path
from typing import Any

import pytest
from conftest import API, REPO, load_handler
from schools import (
    CURRENT_SECRET,
    NOW,
    SECRETS,
    TENANCY,
    body_of,
    code_of,
    create_tenancy_table,
    email_of,
    enrol,
    join,
    set_status,
    staff_event,
)

from shared import permissions
from shared.data import DynamoTable
from shared.errors import json_response
from shared.tenancy_auth import SchoolContext, SchoolRouter

SCHOOL = "sA0001"
HOST = "example-primary"
ME = "GET /api/school/me"
SUBS = {
    ("admin", False): "aaaaaaaa-0000-4000-8000-000000000001",
    ("teacher", False): "aaaaaaaa-0000-4000-8000-000000000002",
    ("readonly", False): "aaaaaaaa-0000-4000-8000-000000000003",
    ("none", True): "aaaaaaaa-0000-4000-8000-000000000004",  # billing only
    ("none", False): "aaaaaaaa-0000-4000-8000-000000000005",  # a member who holds nothing
    ("teacher", True): "aaaaaaaa-0000-4000-8000-000000000006",
}
CATALOGUE = [
    r for r in json.loads((REPO / "contracts" / "routes.json").read_text())["routes"] if r["function"] == "school-api"
]
HANDLER_FILES = sorted((API / "functions" / "school_api").glob("*.py"))


@pytest.fixture
def school_api() -> Any:
    return load_handler("school_api")


@pytest.fixture
def table(ddb: Any) -> DynamoTable:
    table = create_tenancy_table(ddb)
    enrol(table, SCHOOL, HOST, "Example Primary")
    for (level, billing), sub in SUBS.items():
        join(table, SCHOOL, sub, level, billing)
    return table


def router(module: Any, table: DynamoTable, logger: Any, **options: Any) -> SchoolRouter:
    return module.make_router(logger, table=lambda: table, secrets=SECRETS, clock=lambda: NOW, **options)


def test_me_answers_the_school_the_membership_and_the_permissions(
    school_api: Any, table: DynamoTable, captured_logger: Any
) -> None:
    sub = SUBS[("teacher", False)]
    response = router(school_api, table, captured_logger).handle(staff_event(ME, HOST, sub))
    assert response["statusCode"] == 200
    body = body_of(response)
    assert body["school"] == {"schoolId": SCHOOL, "slug": HOST, "name": "Example Primary", "status": "active"}
    assert body["membership"] == {
        "email": email_of(sub),
        "accessLevel": "teacher",
        "billing": False,
        "status": "active",
        "joinedAt": "2026-11-23T09:00:00Z",
    }
    assert body["permissions"] == permissions.grants("teacher", billing=False)
    assert body["permissions"]["class.edit"] == "own"


@pytest.mark.parametrize("status", ["suspended", "ended"])
def test_me_stays_open_while_the_school_is_suspended_or_ended(
    school_api: Any, table: DynamoTable, captured_logger: Any, status: str
) -> None:
    set_status(table, SCHOOL, status)
    response = router(school_api, table, captured_logger).handle(staff_event(ME, HOST, SUBS[("admin", False)]))
    assert response["statusCode"] == 200 and body_of(response)["school"]["status"] == status  # staff can see why


@pytest.mark.parametrize(("level", "billing"), list(SUBS))
@pytest.mark.parametrize("route", CATALOGUE, ids=lambda r: r["id"])
def test_every_school_route_lets_in_exactly_the_access_levels_with_its_permission(
    school_api: Any, table: DynamoTable, captured_logger: Any, route: dict[str, Any], level: str, billing: bool
) -> None:
    """The route x access-level matrix (04 §5.2-5.3), generated from routes.json, so each new route joins it. The
    handlers are stand-ins: this tests the gate, not the handlers (each route's own tests do that)."""
    key = f"{route['method']} {route['path']}"

    def stand_in(ctx: SchoolContext) -> dict[str, Any]:
        if ctx.is_write:
            ctx.transact([ctx.audit_action("test", "school", ctx.school_id)])
        return json_response(200, {})

    gate = SchoolRouter(
        routes=school_api.ROUTES,
        handlers={k: stand_in for k in school_api.ROUTES},
        logger=captured_logger,
        table=lambda: table,
        secrets=SECRETS,
        clock=lambda: NOW,
    )
    params = {name.strip("{}"): "x1" for name in route["path"].split("/") if name.startswith("{")}
    response = gate.handle(staff_event(key, HOST, SUBS[(level, billing)], path_parameters=params or None))
    allowed = route["permission"] in permissions.grants(level, billing)
    assert (response["statusCode"], code_of(response)) == ((200, None) if allowed else (403, "FORBIDDEN"))


def test_the_function_reads_its_table_and_secrets_from_the_environment(
    ddb: Any,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The deployed path: ROUTER built at import, the table named by TENANCY_TABLE_NAME, opened on the first request
    that needs it."""
    table = create_tenancy_table(ddb)
    enrol(table, SCHOOL, HOST)
    join(table, SCHOOL, SUBS[("admin", False)], "admin")
    monkeypatch.setenv("TENANCY_TABLE_NAME", TENANCY)
    monkeypatch.setenv("SCD_ORIGIN_VERIFY_CURRENT", CURRENT_SECRET)
    module = load_handler("school_api")
    assert module.handler(staff_event(ME, HOST, SUBS[("admin", False)]), None)["statusCode"] == 200
    direct = staff_event(ME, HOST, SUBS[("admin", False)], origin=None)  # straight to execute-api
    assert code_of(module.handler(direct, None)) == "FORBIDDEN"


# --- The module is the only path to data (DAT-8) ---------------------------------------------------------------------

FORBIDDEN_MODULES = ("boto3", "botocore", "shared.data", "shared.slugs")
FORBIDDEN_NAMES = (
    "_table",
    "_client",
    "DynamoTable",
    "get_item",
    "query_prefix",
    "transact_write",
    "update_item",
    "delete_item",
    "batch_get",
    "batch_delete",
)


def data_access_outside_the_context(source: str) -> list[str]:
    """Each way `source` could reach DynamoDB other than through its SchoolContext's public methods."""
    found = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            found += [f"import {a.name}" for a in node.names if a.name.startswith(FORBIDDEN_MODULES)]
        elif isinstance(node, ast.ImportFrom) and (node.module or "").startswith(FORBIDDEN_MODULES):
            found.append(f"from {node.module} import ...")
        elif isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_NAMES:
            found.append(f".{node.attr}")
        elif isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            found.append(node.id)
        elif isinstance(node, ast.Constant) and node.value in ("dynamodb", "TableName"):
            found.append(repr(node.value))
    return found


@pytest.mark.parametrize("path", HANDLER_FILES, ids=lambda p: p.name)
def test_handlers_reach_data_only_through_their_context(path: Path) -> None:
    assert data_access_outside_the_context(path.read_text(encoding="utf-8")) == []


def test_the_data_rule_catches_each_way_round_it() -> None:
    attempts = {
        "import boto3": "import boto3",
        "from shared.data import DynamoTable": "from shared.data import ...",
        "ctx._table.get_item('SCH#x', 'PROFILE')": "._table",
        "ctx.item('x') or table.query_prefix('SCH#x', '')": ".query_prefix",
        "client = make('dynamodb')": "'dynamodb'",
        "action = {'Put': {'TableName': 't'}}": "'TableName'",
    }
    for source, expected in attempts.items():
        assert expected in data_access_outside_the_context(source), source
    assert data_access_outside_the_context("ctx.require_item('CLASS#1'); ctx.transact([])") == []
