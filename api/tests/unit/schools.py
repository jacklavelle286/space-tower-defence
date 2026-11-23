"""School test helpers (PS3): the tenancy table, enrolled schools, their staff, and the staff requests the gateway
passes on. Used by the slug, membership, tenancy-auth, school-api and isolation tests."""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from shared import memberships, slugs
from shared.data import DynamoTable
from shared.memberships import school_pk
from shared.tenancy_auth import HOST_HEADER, ORIGIN_HEADER, OriginSecrets

TENANCY = "test-tenancy"
NOW = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)
CURRENT_SECRET = "origin-verify-current-0123456789abcdef"  # noqa: S105 - made up for tests
PREVIOUS_SECRET = "origin-verify-previous-fedcba9876543210"  # noqa: S105 - made up for tests
SECRETS = OriginSecrets(CURRENT_SECRET, PREVIOUS_SECRET)


def create_tenancy_table(ddb: Any, name: str = TENANCY) -> DynamoTable:
    """The tenancy table as infrastructure/platform/tenancy.tf makes it: string pk and sk, and gsi1 (ALL) for lists."""
    ddb.create_table(
        TableName=name,
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        AttributeDefinitions=[{"AttributeName": a, "AttributeType": "S"} for a in ("pk", "sk", "gsi1pk", "gsi1sk")],
        GlobalSecondaryIndexes=[
            {
                "IndexName": "gsi1",
                "KeySchema": [
                    {"AttributeName": "gsi1pk", "KeyType": "HASH"},
                    {"AttributeName": "gsi1sk", "KeyType": "RANGE"},
                ],
                "Projection": {"ProjectionType": "ALL"},
            }
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    return DynamoTable(ddb, name)


def enrol(table: DynamoTable, school_id: str, slug: str, name: str = "Test School", status: str = "active") -> None:
    """A school's own items, as the console's enrolment writes them (PS4): the slug claim and the profile."""
    profile = {"pk": school_pk(school_id), "sk": "PROFILE", "displayName": name, "status": status, "activeAdmins": 0}
    table.transact_write(
        [
            slugs.claim_action(table, slug, school_id),
            table.put_action(profile, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
        ]
    )


def set_status(table: DynamoTable, school_id: str, status: str) -> None:
    table.update_item(
        school_pk(school_id), "PROFILE", update="SET #s = :s", names={"#s": "status"}, values={":s": status}
    )


def email_of(sub: str) -> str:
    """The made-up address `join` gives a member (example.org: never a real one)."""
    return f"staff-{sub}@example.org"


def join(table: DynamoTable, school_id: str, sub: str, access_level: str, billing: bool = False) -> dict[str, Any]:
    """An active member of the school, through the real invitation and first sign-in (DAT-3)."""
    email = email_of(sub)
    memberships.invite(table, school_id, email, access_level, billing, "owner", NOW)
    return memberships.accept_invitation(table, school_id, email, sub, NOW)


def add_class(table: DynamoTable, school_id: str, class_id: str, teacher_sub: str, name: str = "Class") -> None:
    item = {"pk": school_pk(school_id), "sk": f"CLASS#{class_id}", "name": name, "teacherSub": teacher_sub}
    table.transact_write([table.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})])


def staff_event(
    route_key: str,
    host: str | None,
    sub: str,
    *,
    origin: str | None = CURRENT_SECRET,
    token_use: str = "access",  # noqa: S107 - a claim's value, not a secret
    path_parameters: dict[str, str] | None = None,
    query: dict[str, str] | None = None,
    body: Any = None,
) -> dict[str, Any]:
    """A payload 2.0 event as the gateway passes on a staff request once its JWT authoriser has accepted the token.
    `host` is the `x-scd-host` CloudFront sets (None: absent); `origin` the origin-verify header (None: a direct
    call)."""
    method, path = route_key.split(" ", 1)
    for name, value in (path_parameters or {}).items():
        path = path.replace("{" + name + "}", value)
    headers = {"content-type": "application/json"}
    if host is not None:
        headers[HOST_HEADER] = host
    if origin is not None:
        headers[ORIGIN_HEADER] = origin
    event: dict[str, Any] = {
        "version": "2.0",
        "routeKey": route_key,
        "rawPath": path,
        "headers": headers,
        "isBase64Encoded": False,
        "requestContext": {
            "requestId": f"req-{uuid.uuid4().hex[:12]}",
            "routeKey": route_key,
            "http": {"method": method, "path": path},
            "authorizer": {
                "jwt": {
                    "claims": {"sub": sub, "token_use": token_use, "scope": "school/staff", "client_id": "staff-web"},
                    "scopes": ["school/staff"],
                }
            },
        },
    }
    if path_parameters:
        event["pathParameters"] = dict(path_parameters)
    if query:
        event["queryStringParameters"] = dict(query)
    if body is not None:
        event["body"] = json.dumps(body)
    return event


def body_of(response: dict[str, Any]) -> dict[str, Any]:
    return json.loads(response["body"])


def code_of(response: dict[str, Any]) -> str | None:
    """The error envelope's code, or None for a success."""
    if response["statusCode"] < 400:
        return None
    return body_of(response)["error"]["code"]
