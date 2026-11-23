"""school-api: the school portal's API (DAT-8; 04 §5.3; 10 §3.1).

PS3 brings its first route, so the tenancy checks run end to end: R63 `GET /api/school/me` answers who the caller is in
the school whose address they are on, with their permissions. It stays open while the school is suspended or ended, so
staff can always see why. Each later phase adds the routes it builds (each naming a permission in routes.json).

Every route goes through shared/tenancy_auth.SchoolRouter: origin verify, the host's school, an active membership read
strongly consistent, the route's permission. Handlers reach school data only through the SchoolContext they are given:
tests/unit/test_school_api.py fails if this file uses DynamoDB any other way.
"""

from __future__ import annotations

from typing import Any

from shared.errors import json_response
from shared.log import ApiLogger
from shared.memberships import summary
from shared.tenancy_auth import SchoolContext, SchoolHandler, SchoolRoute, SchoolRouter

# This function's allow-list. tests/unit/test_routes_contract.py checks it equals contracts/routes.json.
ROUTES: dict[str, SchoolRoute] = {
    "GET /api/school/me": SchoolRoute("school.view", suspended_ok=True, ended_ok=True),
}


def me(ctx: SchoolContext) -> dict[str, Any]:
    """R63: the school (ID, slug, name, status), the caller's membership and their permissions with scopes."""
    return json_response(
        200,
        {
            "school": {
                "schoolId": ctx.school_id,
                "slug": ctx.slug,
                "name": ctx.school.get("displayName", ""),
                "status": ctx.school.get("status", ""),
            },
            "membership": summary(ctx.member),
            "permissions": dict(sorted(ctx.grants.items())),
        },
    )


HANDLERS: dict[str, SchoolHandler] = {"GET /api/school/me": me}


def make_router(logger: ApiLogger | None = None, **options: Any) -> SchoolRouter:
    return SchoolRouter(routes=ROUTES, handlers=HANDLERS, logger=logger or ApiLogger("school-api"), **options)


ROUTER = make_router()


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    return ROUTER.handle(event)
