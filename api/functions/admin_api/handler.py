"""admin-api: content administration, operator only (plan G §2 R17-R30, E.6.3).

Phase 7 skeleton: the router authorises by route key (operator routes also need the exact group `admin`) and every
catalogued route answers 501 NOT_IMPLEMENTED until its phase adds a handler.
"""

from __future__ import annotations

from typing import Any

from shared.auth import OPERATOR
from shared.log import ApiLogger
from shared.router import Router

# This function's allow-list. tests/unit/test_routes_contract.py checks it equals contracts/routes.json.
ROUTES: dict[str, str] = {
    "GET /api/admin/speech-definitions": OPERATOR,
    "POST /api/admin/speech-definitions": OPERATOR,
    "GET /api/admin/speech-definitions/{id}": OPERATOR,
    "PUT /api/admin/speech-definitions/{id}": OPERATOR,
    "POST /api/admin/speech-definitions/{id}/approve": OPERATOR,
    "GET /api/admin/activities": OPERATOR,
    "POST /api/admin/activities": OPERATOR,
    "GET /api/admin/activities/{id}": OPERATOR,
    "PUT /api/admin/activities/{id}/draft": OPERATOR,
    "POST /api/admin/activities/{id}/validate": OPERATOR,
    "POST /api/admin/activities/{id}/publish": OPERATOR,
    "POST /api/admin/activities/{id}/retire": OPERATOR,
    "POST /api/admin/activities/{id}/withdraw": OPERATOR,
    "GET /api/admin/bank-status": OPERATOR,
}

ROUTER = Router(routes=ROUTES, handlers={}, logger=ApiLogger("admin-api"))


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    return ROUTER.handle(event)
