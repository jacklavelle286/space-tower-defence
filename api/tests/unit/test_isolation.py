"""The isolation suite (DAT-14; 10 §5), at module level: two schools, A and B, and school-api's checks between them.

  1. A staff member of school A, on A's address: allowed exactly as the permission matrix says.
  2. The same person on B's address: NOT_A_MEMBER on every route.
  3. A's token sent straight to execute-api, so without the origin-verify header, with a forged `x-scd-host: b` (or
     A's own): 403 FORBIDDEN, whatever the host.
  4. School B's object IDs used on A's address: 404, and nothing of B's changes.

Each case runs against the real checks and must pass. Then each check is broken in turn (origin verify, the host's
school, the membership, the permission, the school partition), and the suite must fail: a broken check fails CI.

Still to come, each with the phase that builds what it tests: case 3 against sca-dev once the edge (PS2) and the
platform's API (PS5) are deployed; case 5, pupils (PS7); case 6, support grants (PS16).

school-api has no route that takes an object ID yet, so cases 1 and 4 also use two probe routes on classes, which go
through the same module; PS6's class routes replace them.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest
from conftest import load_handler
from schools import CURRENT_SECRET, NOW, SECRETS, add_class, code_of, create_tenancy_table, enrol, join, staff_event

from shared import permissions, slugs, tenancy_auth
from shared.data import DynamoTable
from shared.errors import json_response
from shared.tenancy_auth import SchoolContext, SchoolRoute, SchoolRouter

A, B = "sA0001", "sB0002"
A_HOST, B_HOST = "school-a", "school-b"
A_STAFF = {
    ("admin", False): "aaaaaaaa-0000-4000-8000-000000000001",
    ("teacher", False): "aaaaaaaa-0000-4000-8000-000000000002",
    ("readonly", False): "aaaaaaaa-0000-4000-8000-000000000003",
    ("none", True): "aaaaaaaa-0000-4000-8000-000000000004",
    ("none", False): "aaaaaaaa-0000-4000-8000-000000000005",
}
# Case 1's expectations, taken from the contract once, before any test breaks a check (the permission break replaces
# permissions.grants, so the oracle must not call it).
EXPECTED_GRANTS = {key: permissions.grants(*key) for key in A_STAFF}
A_ADMIN = A_STAFF[("admin", False)]
A_TEACHER = A_STAFF[("teacher", False)]
B_ADMIN = "bbbbbbbb-0000-4000-8000-000000000001"
A_CLASS, B_CLASS = "cA1", "cB9"
PROBE_READ = "GET /api/school/isolation-probe/classes/{classId}"
PROBE_WRITE = "PATCH /api/school/isolation-probe/classes/{classId}"


def probe_read(ctx: SchoolContext, class_id: str) -> dict[str, Any]:
    return json_response(200, {"name": ctx.require_item(f"CLASS#{class_id}")["name"]})


def probe_write(ctx: SchoolContext, class_id: str) -> dict[str, Any]:
    item = ctx.require_item(f"CLASS#{class_id}")
    ctx.require_own_class(item, "class.edit")
    ctx.transact(
        [
            ctx.update_action(
                f"CLASS#{class_id}",
                update="SET #n = :n",
                names={"#n": "name", "#pk": "pk"},
                values={":n": "Changed"},
                condition="attribute_exists(#pk)",
            ),
            ctx.audit_action("class.rename", "class", class_id),
        ]
    )
    return json_response(200, {})


class Schools:
    """Schools A and B, A's staff at every access level, B's Admin, one class each."""

    def __init__(self, table: DynamoTable, logger: Any) -> None:
        self.table = table
        self.logger = logger
        self.school_api = load_handler("school_api")

    @property
    def routes(self) -> dict[str, SchoolRoute]:
        return {**self.school_api.ROUTES, PROBE_READ: SchoolRoute("class.view"), PROBE_WRITE: SchoolRoute("class.edit")}

    def router(self) -> SchoolRouter:
        handlers: dict[str, Callable[[SchoolContext], dict[str, Any]]] = {
            **self.school_api.HANDLERS,
            PROBE_READ: lambda ctx: probe_read(ctx, self.class_id),
            PROBE_WRITE: lambda ctx: probe_write(ctx, self.class_id),
        }
        return SchoolRouter(
            routes=self.routes,
            handlers=handlers,
            logger=self.logger,
            table=lambda: self.table,
            secrets=SECRETS,
            clock=lambda: NOW,
        )

    def call(
        self,
        router: SchoolRouter,
        route: str,
        host: str,
        sub: str,
        class_id: str = A_CLASS,
        origin: str | None = CURRENT_SECRET,
    ) -> dict[str, Any]:
        self.class_id = class_id
        params = {"classId": class_id} if "{classId}" in route else None
        return router.handle(staff_event(route, host, sub, origin=origin, path_parameters=params))


@pytest.fixture
def make_schools(ddb: Any, captured_logger: Any) -> Callable[[], Schools]:
    """A fresh pair of schools, each time in a new table, so no case sees another's writes."""
    made = 0

    def make() -> Schools:
        nonlocal made
        made += 1
        table = create_tenancy_table(ddb, f"test-tenancy-{made}")
        enrol(table, A, A_HOST, "School A")
        enrol(table, B, B_HOST, "School B")
        for (level, billing), sub in A_STAFF.items():
            join(table, A, sub, level, billing)
        join(table, B, B_ADMIN, "admin")
        add_class(table, A, A_CLASS, A_TEACHER, "A's class")
        add_class(table, B, B_CLASS, B_ADMIN, "B's class")
        return Schools(table, captured_logger)

    return make


# --- The cases --------------------------------------------------------------------------------------------------------


def case_1_staff_on_their_own_school(s: Schools) -> None:
    router = s.router()
    for (level, billing), sub in A_STAFF.items():
        grants = EXPECTED_GRANTS[(level, billing)]
        for route_key, route in s.routes.items():
            response = s.call(router, route_key, A_HOST, sub)
            expected = 200 if route.permission in grants else 403
            assert response["statusCode"] == expected, (level, billing, route_key, code_of(response))
            if expected == 403:
                assert code_of(response) == "FORBIDDEN", (level, route_key)


def case_2_the_same_staff_on_another_school(s: Schools) -> None:
    router = s.router()
    for sub in A_STAFF.values():
        for route_key in s.routes:
            response = s.call(router, route_key, B_HOST, sub, class_id=B_CLASS)
            assert code_of(response) == "NOT_A_MEMBER", (sub, route_key, response["statusCode"])


def case_3_direct_calls_with_a_forged_host(s: Schools) -> None:
    router = s.router()
    for host in (B_HOST, A_HOST):
        for origin in (None, "forged"):
            for route_key in s.routes:
                response = s.call(router, route_key, host, A_ADMIN, origin=origin)
                assert response["statusCode"] == 403 and code_of(response) == "FORBIDDEN", (host, origin, route_key)


def case_4_another_schools_ids(s: Schools) -> None:
    router = s.router()
    for route_key in (PROBE_READ, PROBE_WRITE):
        response = s.call(router, route_key, A_HOST, A_ADMIN, class_id=B_CLASS)
        assert response["statusCode"] == 404 and code_of(response) == "NOT_FOUND", route_key
    assert s.table.get_item(f"SCH#{B}", f"CLASS#{B_CLASS}")["name"] == "B's class"
    assert s.table.get_item(f"SCH#{A}", f"CLASS#{B_CLASS}") is None  # nothing of B's was written into A
    assert not [r for r in s.table.query_prefix(f"AUDIT#{A}#2026-11", "") if r["targetId"] == B_CLASS]


CASES = {
    "1-own-school": case_1_staff_on_their_own_school,
    "2-other-school": case_2_the_same_staff_on_another_school,
    "3-direct-call": case_3_direct_calls_with_a_forged_host,
    "4-other-ids": case_4_another_schools_ids,
}


@pytest.mark.parametrize("case", CASES)
def test_isolation_case(make_schools: Callable[[], Schools], case: str) -> None:
    CASES[case](make_schools())


# --- A broken check fails the suite ---------------------------------------------------------------------------------


def _any_membership(table: DynamoTable, school_id: str, sub: str) -> dict[str, Any]:
    return {"status": "active", "accessLevel": "admin", "billing": False, "email": "x@example.org"}


def _everything(access_level: str, billing: bool) -> dict[str, str]:
    return dict.fromkeys(permissions.PERMISSIONS, permissions.ALL)


def _any_school(self: SchoolContext, sk: str) -> dict[str, Any] | None:
    """An object looked up by its ID alone, whichever school holds it."""
    for school in (A, B):
        found = self._table.get_item(f"SCH#{school}", sk)
        if found is not None:
            return found
    return None


BREAKS: dict[str, Callable[[pytest.MonkeyPatch], None]] = {
    "origin-verify": lambda mp: mp.setattr(tenancy_auth.OriginSecrets, "matches", lambda self, value: True),
    "host-to-school": lambda mp: mp.setattr(slugs.SlugResolver, "resolve", lambda self, slug: A),
    "membership": lambda mp: mp.setattr(tenancy_auth, "active_membership", _any_membership),
    "permission": lambda mp: mp.setattr(permissions, "grants", _everything),
    "school-partition": lambda mp: mp.setattr(SchoolContext, "item", _any_school),
}


# The case each break must fail, at least: the check's own case. Others may fail too.
CAUGHT_BY = {
    "origin-verify": "3-direct-call",
    "host-to-school": "2-other-school",
    "membership": "2-other-school",
    "permission": "1-own-school",
    "school-partition": "4-other-ids",
}


@pytest.mark.parametrize("broken", BREAKS)
def test_a_broken_check_fails_the_suite(
    make_schools: Callable[[], Schools], monkeypatch: pytest.MonkeyPatch, broken: str
) -> None:
    worlds = {name: make_schools() for name in CASES}  # built before the break: enrolment uses the real code
    BREAKS[broken](monkeypatch)
    failed = []
    for name, case in CASES.items():
        try:
            case(worlds[name])
        except AssertionError:
            failed.append(name)
    assert CAUGHT_BY[broken] in failed, f"with the {broken} check broken, only {failed or 'no case'} failed"
