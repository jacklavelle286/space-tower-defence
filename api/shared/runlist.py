"""R7 `GET /api/runs`: the open or finished runs, newest first, in pages (G §4 R7, G §8; Phase 32, M2-12).

The whole set is small (at most 5 open and 50 retained finished runs, F §12.8), so the handler reads it whole, sorts
it by `lastPlayedAt` descending (ties by runId) and slices. The cursor is a base64url JSON position in that sorted
list, `{"v": 1, "state": ..., "offset": n}`: opaque to the client, not a secret, granting nothing (the partition is
always the caller's). A cursor that does not decode, has another `v`, or names the other state is VALIDATION_FAILED.
"""

from __future__ import annotations

import base64
import binascii
import json
from collections.abc import Mapping, Sequence
from typing import Any

from shared.body import invalid
from shared.rules.contracts import LIMITS
from shared.runs import RUN_PREFIX, TERMINAL

CURSOR_VERSION = 1
STATES = ("open", "done")
_LIMIT = LIMITS["runsListLimit"]


def parse_query(state: str | None, limit: str | None, cursor: str | None) -> tuple[str, int, int]:
    """(state, limit, offset) from the query string, or ApiError VALIDATION_FAILED naming the field."""
    if state not in STATES:
        raise invalid("state", "enum")
    size = _LIMIT["default"]
    if limit is not None:
        if not limit.isdigit() or not _LIMIT["min"] <= int(limit) <= _LIMIT["max"]:
            raise invalid("limit", "range")
        size = int(limit)
    return state, size, 0 if cursor is None else decode_cursor(cursor, state)


def encode_cursor(state: str, offset: int) -> str:
    raw = json.dumps({"v": CURSOR_VERSION, "state": state, "offset": offset}, separators=(",", ":")).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str, state: str) -> int:
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4))
        data = json.loads(raw)
    except (binascii.Error, ValueError):
        raise invalid("cursor", "format") from None
    offset = data.get("offset") if isinstance(data, dict) else None
    if (
        not isinstance(data, dict)
        or data.get("v") != CURSOR_VERSION
        or data.get("state") != state
        or isinstance(offset, bool)
        or not isinstance(offset, int)
        or offset < 0
    ):
        raise invalid("cursor", "format")
    return offset


def page(
    items: Sequence[Mapping[str, Any]], state: str, limit: int, offset: int
) -> tuple[list[Mapping[str, Any]], str | None]:
    """The RUN items of `state` from `offset`, newest first, and the next cursor (None on the last page)."""
    wanted = [i for i in items if (i.get("status") in TERMINAL) == (state == "done")]
    wanted.sort(key=lambda i: str(i["sk"]).removeprefix(RUN_PREFIX))  # ties by runId, then newest first (stable)
    wanted.sort(key=lambda i: str(i.get("lastPlayedAt") or ""), reverse=True)
    chunk = wanted[offset : offset + limit]
    more = offset + limit < len(wanted)
    return chunk, encode_cursor(state, offset + limit) if more else None
