"""The per-function router: authorise by route key, call the route's handler, answer errors with the envelope, and
write one allow-listed log line per request (plan E.6.3, G §1.2, G §15).

Each function declares its own allow-list (route key -> authoriser). A unit test checks every allow-list against
contracts/routes.json, so a function can only answer the routes the catalogue gives it.

A route that is in the allow-list but has no handler yet answers 501 NOT_IMPLEMENTED (Phase 7 stubs).
"""

from __future__ import annotations

import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from shared.auth import AUTHORISERS, Caller, authorise
from shared.errors import ApiError, error_response
from shared.log import ApiLogger


@dataclass(frozen=True)
class Request:
    event: Mapping[str, Any]
    caller: Caller
    request_id: str


Handler = Callable[[Request], dict[str, Any]]


def request_id_of(event: Mapping[str, Any]) -> str:
    context = event.get("requestContext")
    value = context.get("requestId") if isinstance(context, Mapping) else None
    return value if isinstance(value, str) and 0 < len(value) <= 128 else "unknown"


class Router:
    def __init__(
        self,
        *,
        routes: Mapping[str, str],
        handlers: Mapping[str, Handler],
        logger: ApiLogger,
    ) -> None:
        bad = {key for key, authoriser in routes.items() if authoriser not in AUTHORISERS}
        if bad:
            raise ValueError(f"routes without a player or operator authoriser: {sorted(bad)}")
        extra = set(handlers) - set(routes)
        if extra:
            raise ValueError(f"handlers for routes not in the allow-list: {sorted(extra)}")
        self.routes = dict(routes)
        self.handlers = dict(handlers)
        self.logger = logger

    def handle(self, event: Mapping[str, Any]) -> dict[str, Any]:
        started = time.monotonic()
        request_id = request_id_of(event)
        fields: dict[str, Any] = {"requestId": request_id}
        level = "INFO"
        try:
            caller = authorise(event, self.routes)  # first: nothing is read before this passes
            fields.update(routeKey=caller.route_key, sub=caller.sub)
            handler = self.handlers.get(caller.route_key)
            if handler is None:
                raise ApiError("NOT_IMPLEMENTED")
            response = handler(Request(event=event, caller=caller, request_id=request_id))
            fields["result"] = "OK"
        except ApiError as error:
            response = error_response(error, request_id)
            fields.update(result="ERROR", code=error.code)
        except Exception as error:  # noqa: BLE001 - any other failure is answered as INTERNAL, never re-raised
            response = error_response(ApiError("INTERNAL"), request_id)
            fields.update(result="ERROR", code="INTERNAL", errorType=type(error).__name__)
            level = "ERROR"
        fields.update(status=response["statusCode"], durationMs=round((time.monotonic() - started) * 1000))
        self.logger.line(level, **fields)
        return response
