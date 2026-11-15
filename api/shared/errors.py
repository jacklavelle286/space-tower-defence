"""The error envelope and JSON responses (plan G §1.2, §10).

Every error our Lambdas return has one shape:

    {"error": {"code": "...", "message": "...", "details": ..., "requestId": "..."}}

`code` is the only thing the client branches on. `message` is fixed developer text per code, so a submitted value can
never be echoed back. `details` is optional: for VALIDATION_FAILED a list of {field, rule}, never values.
Gateway-made responses (401, 429, unmatched 404) do not come from here and have no envelope (G §1.3).
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any

# HTTP status per code, from G §10. Per-op codes (STALE_REVISION, PHASE_MISMATCH, CHECKPOINT_OUT_OF_BOUNDS) live
# inside a 200 batch result, not here. NOT_IMPLEMENTED is the Phase 7 stub answer and is not in G §10 [ASSUMPTION].
STATUS_BY_CODE: Mapping[str, int] = {
    "VALIDATION_FAILED": 400,
    "FORBIDDEN": 403,
    "NOT_FOUND": 404,
    "PROFILE_NOT_FOUND": 404,
    "ACTIVE_SESSION_ELSEWHERE": 409,
    "CONTENT_UNAVAILABLE": 409,
    "CONTENT_VERSION_UNSUPPORTED": 409,
    "DRAFT_CONFLICT": 409,
    "PROTOCOL_UNSUPPORTED": 409,
    "RUN_LIMIT_REACHED": 409,
    "RUN_TERMINAL": 409,
    "STALE_SESSION": 409,
    "TAKEOVER_CONFIRM_REQUIRED": 409,
    "CLIENT_UPGRADE_REQUIRED": 426,
    "INTERNAL": 500,
    "NOT_IMPLEMENTED": 501,
    "SPEECH_SYNTHESIS_FAILED": 502,
    "SPEECH_UNAVAILABLE": 503,
    "THROTTLED": 503,
}

_DEFAULT_MESSAGES: Mapping[str, str] = {
    "VALIDATION_FAILED": "Request failed validation",
    "FORBIDDEN": "Not allowed",
    "NOT_FOUND": "Not found",
    "PROFILE_NOT_FOUND": "Profile not found",
    "INTERNAL": "Internal error",
    "NOT_IMPLEMENTED": "Route not implemented yet",
    "THROTTLED": "Busy, retry",
}

# Every API response carries these (G §1.1: no-store so the browser keeps no copy of profile or run data).
RESPONSE_HEADERS: Mapping[str, str] = {
    "content-type": "application/json",
    "cache-control": "no-store",
}


class ApiError(Exception):
    """An error answered with the envelope. Raise it anywhere below a router; the router turns it into a response."""

    def __init__(
        self,
        code: str,
        message: str | None = None,
        details: Sequence[Mapping[str, Any]] | Mapping[str, Any] | None = None,
    ) -> None:
        if code not in STATUS_BY_CODE:
            raise ValueError(f"unknown error code {code!r}")
        self.code = code
        self.status = STATUS_BY_CODE[code]
        self.message = message or _DEFAULT_MESSAGES.get(code, code.replace("_", " ").capitalize())
        self.details = details
        super().__init__(code)


def json_response(status: int, body: Mapping[str, Any]) -> dict[str, Any]:
    """A payload 2.0 Lambda response with a JSON body."""
    return {
        "statusCode": status,
        "headers": dict(RESPONSE_HEADERS),
        "body": json.dumps(body, separators=(",", ":"), sort_keys=True),
    }


def error_response(error: ApiError, request_id: str) -> dict[str, Any]:
    """The G §1.2 envelope for `error`, carrying the gateway request ID."""
    envelope: dict[str, Any] = {"code": error.code, "message": error.message, "requestId": request_id}
    if error.details is not None:
        envelope["details"] = error.details
    return json_response(error.status, {"error": envelope})
