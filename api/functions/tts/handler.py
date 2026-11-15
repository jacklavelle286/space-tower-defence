"""tts: the dedicated speech service (plan G §2 R15-R16, E.4, E.6.3).

R15 is a player route; R16 (preview, the only Polly path) is an operator route and needs the exact group `admin`.
Phase 7 skeleton: both answer 501 NOT_IMPLEMENTED until Phase 19.
"""

from __future__ import annotations

from typing import Any

from shared.auth import OPERATOR, PLAYER
from shared.log import ApiLogger
from shared.router import Router

# This function's allow-list. tests/unit/test_routes_contract.py checks it equals contracts/routes.json.
ROUTES: dict[str, str] = {
    "POST /api/speech": PLAYER,
    "POST /api/admin/speech/preview": OPERATOR,
}

ROUTER = Router(routes=ROUTES, handlers={}, logger=ApiLogger("tts"))


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    return ROUTER.handle(event)
