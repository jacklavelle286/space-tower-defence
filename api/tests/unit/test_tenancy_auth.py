"""The tenancy checks (DAT-8; 04 §5.3) and the audit rule (DAT-13), through a router with test routes.

Each check is tested on its own: what it refuses, with which code, and that the checks before the first read read
nothing. The routes here are test routes; school-api's real ones are in test_school_api.py, and the cross-school cases
in test_isolation.py.
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

import pytest
from schools import (
    CURRENT_SECRET,
    NOW,
    PREVIOUS_SECRET,
    SECRETS,
    add_class,
    body_of,
    code_of,
    create_tenancy_table,
    email_of,
    enrol,
    join,
    set_status,
    staff_event,
)

from shared import memberships
from shared.data import DynamoTable
from shared.errors import json_response
from shared.tenancy_auth import AUDIT_KEPT_FOR, OriginSecrets, SchoolContext, SchoolRoute, SchoolRouter

A, B = "sA0001", "sB0002"
ADMIN = "aaaaaaaa-0000-4000-8000-000000000001"
TEACHER = "aaaaaaaa-0000-4000-8000-000000000002"
OTHER_TEACHER = "aaaaaaaa-0000-4000-8000-000000000003"
READONLY = "aaaaaaaa-0000-4000-8000-000000000004"
NOBODY = "aaaaaaaa-0000-4000-8000-000000000005"
B_ADMIN = "bbbbbbbb-0000-4000-8000-000000000001"

ME = "GET /api/school/test/me"
CLASS = "GET /api/school/test/classes/{classId}"
RENAME = "PATCH /api/school/test/classes/{classId}"
BILLING = "GET /api/school/test/billing"
EXPORT = "GET /api/school/test/export"
UNAUDITED = "POST /api/school/test/unaudited"
FORGETFUL = "POST /api/school/test/forgetful"
TWICE = "POST /api/school/test/twice"
OUTSIDE = "POST /api/school/test/outside"
AUDIT = "GET /api/school/test/audit"


def me(ctx: SchoolContext) -> dict[str, Any]:
    return json_response(200, {"schoolId": ctx.school_id, "sub": ctx.sub})


def rename(ctx: SchoolContext, class_id: str) -> dict[str, Any]:
    item = ctx.require_item(f"CLASS#{class_id}")
    ctx.require_own_class(item, "class.edit")
    ctx.transact(
        [
            ctx.update_action(
                f"CLASS#{class_id}",
                update="SET #n = :n",
                names={"#n": "name", "#pk": "pk"},
                values={":n": "Renamed"},
                condition="attribute_exists(#pk)",
            ),
            ctx.audit_action("class.rename", "class", class_id, "renamed"),
        ]
    )
    return json_response(200, {"classId": class_id})


def unaudited(ctx: SchoolContext) -> dict[str, Any]:
    ctx.transact(
        [ctx.put_action("CLASS#c-new", {"name": "New"}, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})]
    )
    return json_response(201, {})


def forgetful(ctx: SchoolContext) -> dict[str, Any]:
    return json_response(201, {})  # a write route that writes nothing and records nothing


def twice(ctx: SchoolContext) -> dict[str, Any]:
    for n in (1, 2):
        ctx.transact(
            [
                ctx.put_action(
                    f"CLASS#c-{n}", {"name": "New"}, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}
                ),
                ctx.audit_action("class.create", "class", f"c-{n}"),
            ]
        )
    return json_response(201, {})


def outside(ctx: SchoolContext) -> dict[str, Any]:
    """A handler bug: an action built straight on the table, keyed into school B."""
    stray = ctx._table.put_action(
        {"pk": f"SCH#{B}", "sk": "CLASS#planted", "name": "Planted"},
        condition="attribute_not_exists(#pk)",
        names={"#pk": "pk"},
    )
    ctx.transact([stray, ctx.audit_action("class.create", "class", "planted")])
    return json_response(201, {})


def audit(ctx: SchoolContext, month: str) -> dict[str, Any]:
    return json_response(200, {"records": ctx.audit_month(month)})


ROUTES = {
    ME: SchoolRoute("school.view"),
    CLASS: SchoolRoute("class.view"),
    RENAME: SchoolRoute("class.edit"),
    BILLING: SchoolRoute("billing.view", suspended_ok=True),
    EXPORT: SchoolRoute("progress.export", suspended_ok=True, ended_ok=True),
    UNAUDITED: SchoolRoute("class.create"),
    FORGETFUL: SchoolRoute("class.create"),
    TWICE: SchoolRoute("class.create"),
    OUTSIDE: SchoolRoute("class.create"),
    AUDIT: SchoolRoute("audit.view"),
}


class Fixture:
    def __init__(self, table: DynamoTable, logger: Any) -> None:
        self.table = table
        self.logger = logger
        self.reads = 0

    def factory(self) -> DynamoTable:
        self.reads += 1
        return self.table

    def router(self, secrets: OriginSecrets = SECRETS, now: datetime = NOW) -> SchoolRouter:
        handlers = {
            ME: me,
            CLASS: lambda ctx: json_response(200, ctx.require_item(f"CLASS#{self.path['classId']}")),
            RENAME: lambda ctx: rename(ctx, self.path["classId"]),
            BILLING: me,
            EXPORT: me,
            UNAUDITED: unaudited,
            FORGETFUL: forgetful,
            TWICE: twice,
            OUTSIDE: outside,
            AUDIT: lambda ctx: audit(ctx, self.query.get("month", "")),
        }
        return SchoolRouter(
            routes=ROUTES, handlers=handlers, logger=self.logger, table=self.factory, secrets=secrets, clock=lambda: now
        )

    def call(self, route: str, host: str | None, sub: str, router: SchoolRouter | None = None, **kwargs: Any):
        self.path = kwargs.get("path_parameters") or {}
        self.query = kwargs.get("query") or {}
        return (router or self.router()).handle(staff_event(route, host, sub, **kwargs))


@pytest.fixture
def world(ddb: Any, captured_logger: Any) -> Fixture:
    table = create_tenancy_table(ddb)
    enrol(table, A, "school-a", "School A")
    enrol(table, B, "school-b", "School B")
    join(table, A, ADMIN, "admin")
    join(table, A, TEACHER, "teacher")
    join(table, A, OTHER_TEACHER, "teacher")
    join(table, A, READONLY, "readonly")
    join(table, B, B_ADMIN, "admin")
    add_class(table, A, "c1", TEACHER, "Owls")
    add_class(table, A, "c2", OTHER_TEACHER, "Foxes")
    add_class(table, B, "c9", B_ADMIN, "B's class")
    return Fixture(table, captured_logger)


# --- Check (a): the allow-list, before anything is read ---------------------------------------------------------------


def test_a_route_outside_the_allow_list_is_404_and_reads_nothing(world: Fixture) -> None:
    response = world.call("GET /api/school/test/secret", "school-a", ADMIN)
    assert response["statusCode"] == 404 and code_of(response) == "NOT_FOUND"
    assert world.reads == 0


def test_handlers_must_be_in_the_allow_list_and_routes_name_known_permissions(captured_logger: Any) -> None:
    with pytest.raises(ValueError, match="not in the allow-list"):
        SchoolRouter(routes={}, handlers={ME: me}, logger=captured_logger)
    with pytest.raises(ValueError, match="unknown permission"):
        SchoolRoute("school.teleport")


# --- Check 2: origin verify -------------------------------------------------------------------------------------------


@pytest.mark.parametrize("origin", [CURRENT_SECRET, PREVIOUS_SECRET])
def test_the_current_and_the_previous_origin_secret_both_pass(world: Fixture, origin: str) -> None:
    assert world.call(ME, "school-a", ADMIN, origin=origin)["statusCode"] == 200  # rotation: both work for a while


@pytest.mark.parametrize("origin", [None, "", "guess", CURRENT_SECRET + "x", CURRENT_SECRET[:-1]])
def test_a_request_without_the_origin_secret_is_refused_before_any_read(world: Fixture, origin: str | None) -> None:
    response = world.call(ME, "school-a", ADMIN, origin=origin)
    assert response["statusCode"] == 403 and code_of(response) == "FORBIDDEN"
    assert world.reads == 0


def test_with_no_secret_configured_everything_is_refused(world: Fixture) -> None:
    router = world.router(secrets=OriginSecrets(None, None))
    for origin in (None, "", CURRENT_SECRET):
        assert code_of(world.call(ME, "school-a", ADMIN, router=router, origin=origin)) == "FORBIDDEN"


def test_secrets_come_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SCD_ORIGIN_VERIFY_CURRENT", "now-secret")
    monkeypatch.setenv("SCD_ORIGIN_VERIFY_PREVIOUS", "old-secret")
    secrets = OriginSecrets.from_env()
    assert secrets.matches("now-secret") and secrets.matches("old-secret") and not secrets.matches("other")
    monkeypatch.delenv("SCD_ORIGIN_VERIFY_PREVIOUS")
    assert not OriginSecrets.from_env().matches("old-secret")


# --- Check 4: an access token with a UUID sub -------------------------------------------------------------------------


@pytest.mark.parametrize(("sub", "token_use"), [(ADMIN, "id"), ("not-a-uuid", "access"), (ADMIN.upper(), "access")])
def test_only_an_access_token_with_a_uuid_sub_gets_through(world: Fixture, sub: str, token_use: str) -> None:
    response = world.call(ME, "school-a", sub, token_use=token_use)
    assert response["statusCode"] == 403 and code_of(response) == "FORBIDDEN"
    assert world.reads == 0


def test_an_event_without_claims_is_refused(world: Fixture) -> None:
    event = staff_event(ME, "school-a", ADMIN)
    del event["requestContext"]["authorizer"]
    assert code_of(world.router().handle(event)) == "FORBIDDEN"


# --- Check 3: the host names a school whose status allows the route ---------------------------------------------------


@pytest.mark.parametrize("host", [None, "admin", "hooks", "www", "nobody-here", "Bad--Slug", "school-a.evil"])
def test_a_school_route_needs_the_host_of_a_school(world: Fixture, host: str | None) -> None:
    response = world.call(ME, host, ADMIN)
    assert response["statusCode"] == 404 and code_of(response) == "NOT_FOUND"


def test_suspended_and_ended_schools_answer_only_the_routes_open_to_them(world: Fixture) -> None:
    set_status(world.table, A, "suspended")
    assert code_of(world.call(ME, "school-a", ADMIN)) == "SCHOOL_SUSPENDED"
    assert world.call(BILLING, "school-a", ADMIN)["statusCode"] == 200  # they can still pay (PQ-14)
    assert world.call(EXPORT, "school-a", ADMIN)["statusCode"] == 200
    set_status(world.table, A, "ended")
    assert code_of(world.call(ME, "school-a", ADMIN)) == "SCHOOL_ENDED"
    assert code_of(world.call(BILLING, "school-a", ADMIN)) == "SCHOOL_ENDED"
    assert world.call(EXPORT, "school-a", ADMIN)["statusCode"] == 200  # the export window (PS0-12)
    assert world.call(ME, "school-a", ADMIN)["statusCode"] == 403
    set_status(world.table, A, "suspended")
    assert world.call(ME, "school-a", ADMIN)["statusCode"] == 403


# --- Check 5: an active membership, read on every request -------------------------------------------------------------


def test_people_without_an_active_membership_are_not_members(world: Fixture) -> None:
    # NOBODY has an invitation to A but has not accepted it: an invitation alone grants nothing. B_ADMIN is B's.
    memberships.invite(world.table, A, "new@example.org", "teacher", False, ADMIN, NOW)
    for sub in (NOBODY, B_ADMIN):
        response = world.call(ME, "school-a", sub)
        assert response["statusCode"] == 403 and code_of(response) == "NOT_A_MEMBER"


def test_membership_is_read_on_every_request_never_cached(world: Fixture) -> None:
    router = world.router()
    assert world.call(ME, "school-a", TEACHER, router=router)["statusCode"] == 200
    memberships.remove_member(world.table, A, TEACHER, ADMIN, NOW + timedelta(minutes=1))
    assert code_of(world.call(ME, "school-a", TEACHER, router=router)) == "NOT_A_MEMBER"  # the next request


# --- Check 6: the route's permission ----------------------------------------------------------------------------------


def test_the_route_permission_decides(world: Fixture) -> None:
    assert world.call(CLASS, "school-a", READONLY, path_parameters={"classId": "c1"})["statusCode"] == 200
    response = world.call(RENAME, "school-a", READONLY, path_parameters={"classId": "c1"})
    assert response["statusCode"] == 403 and code_of(response) == "FORBIDDEN"  # read-only changes nothing
    assert code_of(world.call(AUDIT, "school-a", TEACHER, query={"month": "2026-11"})) == "FORBIDDEN"


# --- Check 7: this school's items only, and a Teacher's own classes -------------------------------------------------


def test_another_schools_id_is_simply_not_found(world: Fixture) -> None:
    response = world.call(CLASS, "school-a", ADMIN, path_parameters={"classId": "c9"})  # c9 is B's
    assert response["statusCode"] == 404 and code_of(response) == "NOT_FOUND"
    assert body_of(world.call(CLASS, "school-a", ADMIN, path_parameters={"classId": "c1"}))["name"] == "Owls"


def test_a_teacher_changes_only_their_own_classes(world: Fixture) -> None:
    assert world.call(RENAME, "school-a", TEACHER, path_parameters={"classId": "c1"})["statusCode"] == 200
    response = world.call(RENAME, "school-a", TEACHER, path_parameters={"classId": "c2"})
    assert response["statusCode"] == 403 and code_of(response) == "FORBIDDEN"
    assert world.table.get_item(f"SCH#{A}", "CLASS#c2")["name"] == "Foxes"
    assert world.call(RENAME, "school-a", ADMIN, path_parameters={"classId": "c2"})["statusCode"] == 200  # all


def test_items_lists_only_this_school(world: Fixture) -> None:
    router = world.router()
    router.handlers[ME] = lambda ctx: json_response(200, {"classes": [i["sk"] for i in ctx.items("CLASS#")]})
    assert body_of(world.call(ME, "school-a", ADMIN, router=router))["classes"] == ["CLASS#c1", "CLASS#c2"]
    assert body_of(world.call(ME, "school-b", B_ADMIN, router=router))["classes"] == ["CLASS#c9"]


# --- Check 8: every write carries exactly one audit record (DAT-13) --------------------------------------------------


def test_a_write_and_its_audit_record_go_in_one_transaction(world: Fixture) -> None:
    response = world.call(RENAME, "school-a", TEACHER, path_parameters={"classId": "c1"})
    assert response["statusCode"] == 200
    records = world.table.query_prefix(f"AUDIT#{A}#2026-11", "")
    assert len(records) == 1
    record = records[0]
    assert record["sk"].startswith("2026-11-23T09:00:00Z#")
    assert {k: record[k] for k in ("actorSub", "actorEmail", "action", "targetType", "targetId", "routeKey")} == {
        "actorSub": TEACHER,
        "actorEmail": email_of(TEACHER),
        "action": "class.rename",
        "targetType": "class",
        "targetId": "c1",
        "routeKey": RENAME,
    }
    assert "actorName" not in record  # the membership holds no name yet
    assert record["ttl"] == int((NOW + AUDIT_KEPT_FOR).timestamp())  # 2 years (PQ-15)
    assert record["requestId"].startswith("req-")


def test_a_transaction_without_its_audit_record_is_refused_and_nothing_is_written(world: Fixture) -> None:
    response = world.call(UNAUDITED, "school-a", ADMIN)
    assert response["statusCode"] == 500 and code_of(response) == "INTERNAL"
    assert world.table.get_item(f"SCH#{A}", "CLASS#c-new") is None
    assert world.logger.lines()[-1]["level"] == "ERROR" and world.logger.lines()[-1]["errorType"] == "ValueError"


def test_a_write_route_that_records_nothing_is_internal(world: Fixture) -> None:
    response = world.call(FORGETFUL, "school-a", ADMIN)
    assert response["statusCode"] == 500 and code_of(response) == "INTERNAL"
    assert world.logger.lines()[-1]["errorType"] == "RuntimeError"


def test_one_transaction_per_request(world: Fixture) -> None:
    assert code_of(world.call(TWICE, "school-a", ADMIN)) == "INTERNAL"
    assert world.table.get_item(f"SCH#{A}", "CLASS#c-1") is not None  # the first, with its record
    assert world.table.get_item(f"SCH#{A}", "CLASS#c-2") is None  # the second never sent
    assert len(world.table.query_prefix(f"AUDIT#{A}#2026-11", "")) == 1


def test_a_write_into_another_school_is_refused_before_it_is_sent(world: Fixture) -> None:
    assert code_of(world.call(OUTSIDE, "school-a", ADMIN)) == "INTERNAL"
    assert world.table.get_item(f"SCH#{B}", "CLASS#planted") is None
    assert world.table.query_prefix(f"AUDIT#{A}#2026-11", "") == []


def test_transact_checks_the_table_the_audit_and_the_kind(world: Fixture) -> None:
    router = world.router()
    problems: list[str] = []

    def probe(ctx: SchoolContext) -> dict[str, Any]:
        audit_put = ctx.audit_action("x", "class", "c1")
        foreign = {"Put": {**audit_put["Put"], "TableName": "test-game"}}
        delete_audit = {"Delete": {"TableName": ctx._table.table_name, "Key": audit_put["Put"]["Item"]}}
        for actions in ([foreign], [audit_put, ctx.audit_action("y", "class", "c1")], [delete_audit], []):
            try:
                ctx.transact(actions)
            except ValueError as error:
                problems.append(str(error))
        try:
            ctx.put_action("CLASS#x", {"pk": f"SCH#{B}"}, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})
        except ValueError as error:
            problems.append(str(error))
        return json_response(200, {})

    router.handlers[ME] = probe
    assert world.call(ME, "school-a", ADMIN, router=router)["statusCode"] == 200
    assert len(problems) == 5
    assert "another table" in problems[0]
    assert "2 audit records" in problems[1]
    assert "only ever added" in problems[2]
    assert "0 audit records" in problems[3]
    assert "attributes hold neither" in problems[4]
    assert world.table.query_prefix(f"AUDIT#{A}#2026-11", "") == []  # nothing was sent


def test_audit_months_read_newest_first_and_only_this_school(world: Fixture) -> None:
    world.call(RENAME, "school-a", TEACHER, path_parameters={"classId": "c1"})
    later = world.router(now=NOW + timedelta(hours=2))
    world.call(RENAME, "school-a", ADMIN, router=later, path_parameters={"classId": "c2"})
    world.call(
        RENAME, "school-a", ADMIN, router=world.router(now=NOW + timedelta(days=8)), path_parameters={"classId": "c1"}
    )
    records = body_of(world.call(AUDIT, "school-a", ADMIN, query={"month": "2026-11"}))["records"]
    assert [r["targetId"] for r in records] == ["c2", "c1"]  # December's record is in December's month
    assert len(body_of(world.call(AUDIT, "school-a", ADMIN, query={"month": "2026-12"}))["records"]) == 1
    assert all(r["at"].startswith("2026-11-23T") and len(r["eventId"]) == 32 for r in records)
    assert set(records[0]) == {
        "at",
        "eventId",
        "actorSub",
        "actorEmail",
        "action",
        "targetType",
        "targetId",
        "summary",
        "routeKey",
        "requestId",
    }
    assert body_of(world.call(AUDIT, "school-b", B_ADMIN, query={"month": "2026-11"}))["records"] == []
    for bad in ("2026-13", "26-11", "2026-11-01", ""):
        response = world.call(AUDIT, "school-a", ADMIN, query={"month": bad})
        assert response["statusCode"] == 400 and code_of(response) == "VALIDATION_FAILED"


# --- The log line ---------------------------------------------------------------------------------------------------


def test_one_log_line_per_request_with_the_school_and_no_names(world: Fixture) -> None:
    world.call(ME, "school-a", ADMIN)
    world.call(ME, "school-b", ADMIN)
    ok, refused = world.logger.lines()[-2:]
    assert ok["schoolId"] == A and ok["sub"] == ADMIN and ok["routeKey"] == ME and ok["result"] == "OK"
    assert refused["schoolId"] == B and refused["code"] == "NOT_A_MEMBER" and refused["status"] == 403
    for line in (ok, refused):
        assert "example.org" not in str(line) and "School A" not in str(line)
