"""Request bodies and query strings (plan G §1.4, spine S9.5).

The raw body is checked for size before it is parsed, then it must be a JSON object. Every failure is
`400 VALIDATION_FAILED` with `{field, rule}` details and never the value, so nothing a caller typed is echoed back or
reaches a log line.

    body = json_object(request.event)                     # 8 KB limit (limits bodyMaxBytes.default)
    session_id = query_param(request.event, "sessionId")  # None when absent
"""

from __future__ import annotations

import base64
import binascii
import json
from collections.abc import Mapping
from typing import Any

from shared.errors import ApiError
from shared.rules.contracts import LIMITS

DEFAULT_MAX_BYTES: int = LIMITS["bodyMaxBytes"]["default"]


def invalid(field: str, rule: str) -> ApiError:
    """A VALIDATION_FAILED error for one problem."""
    return ApiError("VALIDATION_FAILED", details=[{"field": field, "rule": rule}])


def raw_body(event: Mapping[str, Any]) -> bytes:
    """The body bytes of a payload 2.0 event (base64-decoded when the gateway says so); empty when there is none."""
    body = event.get("body")
    if body is None:
        return b""
    if not isinstance(body, str):
        raise invalid("body", "json")
    if event.get("isBase64Encoded") is True:
        try:
            return base64.b64decode(body, validate=True)
        except (binascii.Error, ValueError):
            raise invalid("body", "json") from None
    return body.encode("utf-8")


def json_object(event: Mapping[str, Any], max_bytes: int = DEFAULT_MAX_BYTES) -> dict[str, Any]:
    """The body as a JSON object, or ApiError VALIDATION_FAILED (`max_bytes`, then `json`)."""
    raw = raw_body(event)
    if len(raw) > max_bytes:
        raise invalid("body", "max_bytes")
    try:
        value = json.loads(raw)
    except ValueError:  # JSONDecodeError and UnicodeDecodeError are both ValueErrors; an empty body lands here too
        raise invalid("body", "json") from None
    if not isinstance(value, dict):
        raise invalid("body", "json")
    return value


def query_param(event: Mapping[str, Any], name: str) -> str | None:
    """One query-string parameter, or None when absent. The gateway joins a repeated parameter with commas."""
    params = event.get("queryStringParameters")
    if not isinstance(params, Mapping):
        return None
    value = params.get(name)
    return value if isinstance(value, str) else None
