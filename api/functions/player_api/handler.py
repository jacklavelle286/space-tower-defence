"""player-api: every player route except speech (plan G §2 R1-R14, E.6.3).

Phase 7 skeleton: the router authorises by route key and every catalogued route answers 501 NOT_IMPLEMENTED until its
phase adds a handler (profile routes in Phase 15, runs and session in Phase 16, ops in Phase 17).
"""

from __future__ import annotations

from typing import Any

from shared.auth import PLAYER
from shared.log import ApiLogger
from shared.router import Router

# This function's allow-list. tests/unit/test_routes_contract.py checks it equals contracts/routes.json.
ROUTES: dict[str, str] = {
    "GET /api/me": PLAYER,
    "GET /api/me/progress": PLAYER,
    "PUT /api/me/profile": PLAYER,
    "PATCH /api/me/profile": PLAYER,
    "POST /api/me/resets": PLAYER,
    "GET /api/planets": PLAYER,
    "GET /api/runs": PLAYER,
    "POST /api/runs": PLAYER,
    "GET /api/runs/{runId}": PLAYER,
    "GET /api/runs/{runId}/pack": PLAYER,
    "POST /api/runs/{runId}/ops": PLAYER,
    "POST /api/runs/{runId}/endless": PLAYER,
    "PUT /api/session": PLAYER,
    "DELETE /api/session": PLAYER,
}

ROUTER = Router(routes=ROUTES, handlers={}, logger=ApiLogger("player-api"))


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    return ROUTER.handle(event)
