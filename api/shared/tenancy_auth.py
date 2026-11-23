"""The checks every school route runs, and the only way its handler reaches school data (DAT-8, DAT-13; 04 §5.3;
10 §5; ADR-0046, ADR-0048).

`SchoolRouter` answers a function's school routes. Before a handler runs, a request passes, in this order:

  1. the gateway's JWT authoriser (staff pool, `school/staff` scope): 401 there, never reaching this code;
  a. the route key is in the function's allow-list, or 404 NOT_FOUND, before anything is read;
  2. the origin-verify header matches the current or the previous secret, so the public execute-api URL refuses
     direct calls (AUTH-Q10; two secrets while one rotates), or 403 FORBIDDEN;
  4. an access token with a Cognito UUID `sub`, or 403 FORBIDDEN (it reads nothing, so it runs before 3);
  3. `x-scd-host`, which CloudFront sets and the client cannot (DAT-6), names a school: not `admin`, `hooks` or `www`,
     and a slug that resolves to a school (60 s cache), or 404 NOT_FOUND; the school's status allows the route, or
     403 SCHOOL_SUSPENDED / SCHOOL_ENDED;
  5. an active membership of that school, read strongly consistent on every request and never cached, or
     403 NOT_A_MEMBER;
  6. the route's permission is in the member's grants, or 403 FORBIDDEN.

The handler then gets a `SchoolContext`, its only way to the table (check 7). It reads, and builds writes, by sort key
alone, always under this school's partition: another school's IDs are simply not found (404). `require_own_class`
applies a Teacher's `own` scope (403).

Check 8 (DAT-13): `transact` sends a request's one write only if every action is under this school and exactly one is
the request's audit record (`audit_action`). Otherwise it raises before anything is sent, and the router answers
INTERNAL. A write route that returns without that record is answered INTERNAL too. Lookup items (`EMAIL#`, `QR#`) get
their own builders with the routes that write them (PS5, PS6); until then `transact` refuses them.
"""

from __future__ import annotations

import hmac
import os
import re
import time
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from shared import permissions
from shared.data import TENANCY_TABLE_ENV, DynamoTable
from shared.errors import ApiError, error_response
from shared.log import ApiLogger
from shared.memberships import active_membership, school_pk
from shared.router import request_id_of
from shared.slugs import SlugResolver

STAFF = "staff"
HOST_HEADER = "x-scd-host"
ORIGIN_HEADER = "x-scd-origin-verify"
ORIGIN_SECRET_ENV = "SCD_ORIGIN_VERIFY_CURRENT"  # noqa: S105 - the variable's name, not a secret
ORIGIN_PREVIOUS_ENV = "SCD_ORIGIN_VERIFY_PREVIOUS"
NON_SCHOOL_HOSTS = frozenset({"admin", "hooks", "www"})  # the console, Stripe's hooks and the marketing site (DAT-6)
SUSPENDED = "suspended"
ENDED = "ended"
AUDIT_KEPT_FOR = timedelta(days=730)  # 2 years (PQ-15)

_SUB = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_MONTH = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")


@dataclass(frozen=True)
class SchoolRoute:
    """One school route: the permission it needs, and whether it stays open while the school is suspended or ended
    (staff can still see their school, pay and export: PQ-14, PS0-12)."""

    permission: str
    suspended_ok: bool = False
    ended_ok: bool = False

    def __post_init__(self) -> None:
        if self.permission not in permissions.PERMISSIONS:
            raise ValueError(f"unknown permission {self.permission!r}")


class OriginSecrets:
    """The origin-verify values, from the function's environment (Terraform rotates them: AUTH-Q10, 04 §10).
    With no current value set, nothing matches: the function refuses everything rather than run open."""

    def __init__(self, current: str | None, previous: str | None = None) -> None:
        self._values = tuple(v for v in (current, previous) if v)

    @classmethod
    def from_env(cls) -> OriginSecrets:
        return cls(os.environ.get(ORIGIN_SECRET_ENV), os.environ.get(ORIGIN_PREVIOUS_ENV))

    def matches(self, value: object) -> bool:
        if not isinstance(value, str) or not value or not self._values:
            return False
        return any(hmac.compare_digest(value.encode(), secret.encode()) for secret in self._values)


@dataclass
class SchoolContext:
    """What a school route's handler gets once every check has passed: the school, the caller and their grants, and
    the only way to the table. Every key it reads or writes is this school's (check 7)."""

    school_id: str
    slug: str
    school: dict[str, Any]
    sub: str
    member: dict[str, Any]
    grants: dict[str, str]
    route_key: str
    request_id: str
    now: datetime
    _table: DynamoTable
    log: dict[str, Any] = field(default_factory=dict)
    audits: int = 0  # audit records written for this request: 0 or 1

    @property
    def pk(self) -> str:
        return school_pk(self.school_id)

    @property
    def is_write(self) -> bool:
        return not self.route_key.startswith("GET ")

    # --- Permissions. The router has checked the route's own permission (check 6). ---

    def scope(self, permission: str) -> str | None:
        return self.grants.get(permission)

    def require(self, permission: str) -> str:
        """The scope the member holds `permission` with, or 403 FORBIDDEN."""
        held = self.scope(permission)
        if held is None:
            raise ApiError("FORBIDDEN")
        return held

    def require_own_class(self, class_item: Mapping[str, Any], permission: str) -> None:
        """For a permission held `own` (a Teacher's), the class must be the caller's, or 403 FORBIDDEN."""
        if self.require(permission) == permissions.OWN and class_item.get("teacherSub") != self.sub:
            raise ApiError("FORBIDDEN")

    # --- Reads: always this school's partition (check 7). ---

    def item(self, sk: str) -> dict[str, Any] | None:
        """This school's item at `sk`, or None. Another school's ID is simply not found."""
        return self._table.get_item(self.pk, sk)

    def require_item(self, sk: str) -> dict[str, Any]:
        found = self.item(sk)
        if found is None:
            raise ApiError("NOT_FOUND")
        return found

    def items(self, sk_prefix: str) -> list[dict[str, Any]]:
        """This school's items whose `sk` starts with `sk_prefix` (classes, staff, ...), in `sk` order."""
        if not sk_prefix:
            raise ValueError("name what to list: the whole school partition is not read here")
        return self._table.query_prefix(self.pk, sk_prefix)

    def audit_month(self, month: str) -> list[dict[str, Any]]:
        """This school's audit records for `month` ("2026-11"), newest first (DAT-13: month queries), as the API shows
        them: when, who, what. The key and the TTL stay internal."""
        if not isinstance(month, str) or not _MONTH.fullmatch(month):
            raise ApiError("VALIDATION_FAILED", details=[{"field": "month", "rule": "pattern"}])
        rows = self._table.query_prefix(f"{self._audit_prefix}{month}", "")
        return [_audit_view(row) for row in reversed(rows)]

    # --- Writes: build the actions, then send them, with the audit record, in one `transact`. ---

    def put_action(
        self,
        sk: str,
        attributes: Mapping[str, Any],
        *,
        condition: str,
        names: Mapping[str, str],
        values: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        """A Put of this school's item at `sk`; `attributes` holds everything but the key."""
        if {"pk", "sk"} & set(attributes):
            raise ValueError("the key is the school's partition and `sk`; attributes hold neither")
        item = {"pk": self.pk, "sk": sk, **attributes}
        return self._table.put_action(item, condition=condition, names=names, values=values)

    def update_action(
        self,
        sk: str,
        *,
        update: str,
        names: Mapping[str, str],
        values: Mapping[str, Any],
        condition: str | None,
    ) -> dict[str, Any]:
        """An Update of this school's item at `sk` (`condition` None only on purpose, as in DynamoTable)."""
        return self._table.update_action(self.pk, sk, update=update, names=names, values=values, condition=condition)

    def delete_action(
        self,
        sk: str,
        *,
        condition: str | None = None,
        names: Mapping[str, str] | None = None,
        values: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        """A Delete of this school's item at `sk`."""
        return self._table.delete_action(self.pk, sk, condition=condition, names=names, values=values)

    def condition_check_action(
        self,
        sk: str,
        *,
        condition: str,
        names: Mapping[str, str],
        values: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        """A ConditionCheck on this school's item at `sk`."""
        return self._table.condition_check_action(self.pk, sk, condition=condition, names=names, values=values)

    def audit_action(self, action: str, target_type: str, target_id: str, summary: str = "") -> dict[str, Any]:
        """The Put for this request's audit record (DAT-13), sent in the same `transact` as the write it records.
        Staff are recorded by ID, email and name, when the membership has one (SCH-Q9: removed staff stay readable for
        2 years); pupils only ever by ID (`target_id`). Kept 2 years by TTL (PQ-15)."""
        moment = self.now.astimezone(UTC)
        record: dict[str, Any] = {
            "pk": f"{self._audit_prefix}{moment.strftime('%Y-%m')}",
            "sk": f"{moment.strftime('%Y-%m-%dT%H:%M:%SZ')}#{uuid.uuid4().hex}",
            "actorSub": self.sub,
            "actorEmail": self.member.get("email", ""),
            "action": action,
            "targetType": target_type,
            "targetId": target_id,
            "summary": summary,
            "routeKey": self.route_key,
            "requestId": self.request_id,
            "ttl": int((moment + AUDIT_KEPT_FOR).timestamp()),
        }
        if self.member.get("name"):
            record["actorName"] = self.member["name"]
        return self._table.put_action(record, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})

    def transact(self, actions: Sequence[Mapping[str, Any]]) -> None:
        """Send `actions` as one transaction: this request's write (check 8). It raises ValueError, before anything is
        sent, unless every action is on this table and under this school, exactly one is this school's audit Put, and
        the request has not written already. The router answers INTERNAL for any of these."""
        if self.audits:
            raise ValueError(f"{self.route_key}: one transaction per request (DAT-13)")
        audit_puts = 0
        for action in actions:
            ((kind, body),) = action.items()
            if body.get("TableName") != self._table.table_name:
                raise ValueError(f"a write to another table: {body.get('TableName')!r}")
            key = body.get("Item") or body.get("Key") or {}
            pk = key.get("pk", {}).get("S", "")
            if pk.startswith(self._audit_prefix):
                if kind != "Put":
                    raise ValueError("audit records are only ever added")
                audit_puts += 1
            elif pk != self.pk:
                raise ValueError(f"a write outside school {self.school_id}: {pk!r}")
        if audit_puts != 1:
            raise ValueError(f"{self.route_key}: {audit_puts} audit records in the transaction, not 1 (DAT-13)")
        self._table.transact_write(actions)
        self.audits = 1

    @property
    def _audit_prefix(self) -> str:
        return f"AUDIT#{self.school_id}#"


_AUDIT_FIELDS = ("actorSub", "actorEmail", "actorName", "action", "targetType", "targetId", "summary", "routeKey",
                 "requestId")  # fmt: skip


def _audit_view(row: Mapping[str, Any]) -> dict[str, Any]:
    at, _, event_id = str(row["sk"]).partition("#")
    return {"at": at, "eventId": event_id, **{k: row[k] for k in _AUDIT_FIELDS if k in row}}


SchoolHandler = Callable[[SchoolContext], dict[str, Any]]


class SchoolRouter:
    """The router for a function's school routes: the checks above, then the handler, one log line per request."""

    def __init__(
        self,
        *,
        routes: Mapping[str, SchoolRoute],
        handlers: Mapping[str, SchoolHandler],
        logger: ApiLogger,
        table: Callable[[], DynamoTable] | None = None,
        secrets: OriginSecrets | None = None,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        extra = set(handlers) - set(routes)
        if extra:
            raise ValueError(f"handlers for routes not in the allow-list: {sorted(extra)}")
        self.routes = dict(routes)
        self.handlers = dict(handlers)
        self.logger = logger
        self._table_factory = table or _table_from_env
        self._table: DynamoTable | None = None
        self._resolver: SlugResolver | None = None
        self._secrets = secrets or OriginSecrets.from_env()
        self._clock = clock

    def handle(self, event: Mapping[str, Any]) -> dict[str, Any]:
        started = time.monotonic()
        request_id = request_id_of(event)
        fields: dict[str, Any] = {"requestId": request_id}
        level = "INFO"
        context: SchoolContext | None = None
        try:
            context = self._check(event, request_id, fields)
            handler = self.handlers.get(context.route_key)
            if handler is None:
                raise ApiError("NOT_IMPLEMENTED")
            response = handler(context)
            if context.is_write and context.audits != 1:
                raise RuntimeError(f"{context.route_key} returned without writing its audit record (DAT-13)")
            fields["result"] = "OK"
        except ApiError as error:
            response = error_response(error, request_id)
            fields.update(result="ERROR", code=error.code)
        except Exception as error:  # noqa: BLE001 - any other failure is answered as INTERNAL, never re-raised
            response = error_response(ApiError("INTERNAL"), request_id)
            fields.update(result="ERROR", code="INTERNAL", errorType=type(error).__name__)
            level = "ERROR"
        fields.update(status=response["statusCode"], durationMs=round((time.monotonic() - started) * 1000))
        if context is not None:
            fields = {**context.log, **fields}
        self.logger.line(level, **fields)
        return response

    def _check(self, event: Mapping[str, Any], request_id: str, fields: dict[str, Any]) -> SchoolContext:
        route_key = event.get("routeKey")
        if not isinstance(route_key, str) or route_key not in self.routes:
            raise ApiError("NOT_FOUND")  # (a) nothing is read before this
        route = self.routes[route_key]
        fields["routeKey"] = route_key
        headers = _headers(event)
        if not self._secrets.matches(headers.get(ORIGIN_HEADER)):
            raise ApiError("FORBIDDEN")  # (2) not through CloudFront
        sub = _access_token_sub(event)  # (4)
        fields["sub"] = sub
        slug = headers.get(HOST_HEADER)
        if not isinstance(slug, str) or slug in NON_SCHOOL_HOSTS:
            raise ApiError("NOT_FOUND")  # (3) a school route on the console, hooks or marketing host
        table = self._get_table()
        school_id = self._get_resolver(table).resolve(slug)
        if school_id is None:
            raise ApiError("NOT_FOUND")  # (3) no such school, or a retired slug
        fields["schoolId"] = school_id
        school = table.get_item(school_pk(school_id), "PROFILE")
        if school is None:
            raise ApiError("NOT_FOUND")
        status = school.get("status")
        if status == SUSPENDED and not route.suspended_ok:
            raise ApiError("SCHOOL_SUSPENDED")
        if status == ENDED and not route.ended_ok:
            raise ApiError("SCHOOL_ENDED")
        member = active_membership(table, school_id, sub)  # (5) strongly consistent, never cached
        if member is None:
            raise ApiError("NOT_A_MEMBER")
        grants = permissions.grants(str(member.get("accessLevel")), bool(member.get("billing")))
        if route.permission not in grants:
            raise ApiError("FORBIDDEN")  # (6)
        return SchoolContext(
            school_id=school_id,
            slug=slug,
            school=school,
            sub=sub,
            member=member,
            grants=grants,
            route_key=route_key,
            request_id=request_id,
            now=self._clock(),
            _table=table,
        )

    def _get_table(self) -> DynamoTable:
        if self._table is None:
            self._table = self._table_factory()
        return self._table

    def _get_resolver(self, table: DynamoTable) -> SlugResolver:
        if self._resolver is None:
            self._resolver = SlugResolver(table)  # lives as long as the function: 60 s per slug
        return self._resolver


def _table_from_env() -> DynamoTable:
    import boto3  # here, not at import: only after the checks that read nothing have passed

    return DynamoTable(boto3.client("dynamodb"), os.environ[TENANCY_TABLE_ENV])


def _headers(event: Mapping[str, Any]) -> dict[str, Any]:
    """Payload 2.0 headers, names lower-cased (the gateway already does; this makes sure)."""
    raw = event.get("headers")
    return {str(k).lower(): v for k, v in raw.items()} if isinstance(raw, Mapping) else {}


def _access_token_sub(event: Mapping[str, Any]) -> str:
    context = event.get("requestContext")
    authorizer = context.get("authorizer") if isinstance(context, Mapping) else None
    jwt = authorizer.get("jwt") if isinstance(authorizer, Mapping) else None
    claims = jwt.get("claims") if isinstance(jwt, Mapping) else None
    if not isinstance(claims, Mapping) or claims.get("token_use") != "access":
        raise ApiError("FORBIDDEN")
    sub = claims.get("sub")
    if not isinstance(sub, str) or not _SUB.fullmatch(sub):
        raise ApiError("FORBIDDEN")
    return sub
