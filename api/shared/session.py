"""The account-wide play lease with its fencing token (spine S3.4, F §5, G §7; M1-16).

One SESSION item per account (`U#<sub>` / `SESSION`), never deleted:

    generation      only goes up; +1 whenever a different tenure starts (another browser, a takeover, a reset)
    sessionId       the holder: a random UUID per browser profile (or `RESET#<requestId>` during a whole-profile reset)
    runId           information only (shown as "being played on <device>"); never part of the fence
    leaseExpiresAt  when another browser may claim; ISO 8601 UTC with `Z`, whole seconds, so string order is time order
    released        true after a clean release
    deviceLabel     the holder's label, e.g. "Kitchen laptop"
    lastRenewedAt   the holder's last claim or renew (gives `lastSeenSecondsAgo`)

Correctness never depends on the clock: every write is fenced by `sessionId` + `generation`. The lease time only
decides when someone else may take over.

`conflict` is the one place that turns a SESSION item into "you may claim" or one of the two 409s. It is used before
a write (R8 reads SESSION first) and after a refused write (the item DynamoDB hands back with
ReturnValuesOnConditionCheckFailure = ALL_OLD), so the rule exists once.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from shared.errors import ApiError
from shared.rules.contracts import LIMITS

SESSION_SK = "SESSION"
RESET_HOLDER_PREFIX = "RESET#"  # an interrupted WHOLE_PROFILE reset holds the lease; it counts as released (S3.4)
LEASE_SECONDS: int = LIMITS["lease"]["seconds"]
RENEW_AFTER_SECONDS: int = LIMITS["lease"]["renewSeconds"]

# Every SESSION attribute goes through ExpressionAttributeNames (F §12.4).
NAMES = {
    "#generation": "generation",
    "#sessionId": "sessionId",
    "#runId": "runId",
    "#leaseExpiresAt": "leaseExpiresAt",
    "#released": "released",
    "#deviceLabel": "deviceLabel",
    "#lastRenewedAt": "lastRenewedAt",
}
_HOLD = (
    "SET #leaseExpiresAt = :expires, #runId = :runId, #released = :false, "
    "#deviceLabel = :deviceLabel, #lastRenewedAt = :now"
)


def iso_z(moment: datetime) -> str:
    """Server time as G §1.1 writes it: UTC, ISO 8601, whole seconds, `Z`."""
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_time(value: Any) -> datetime | None:
    """A stored timestamp (ISO 8601 with Z, or epoch seconds) as an aware datetime; None when unreadable."""
    if isinstance(value, Decimal | int) and not isinstance(value, bool):
        return datetime.fromtimestamp(int(value), UTC)
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
        return parsed if parsed.tzinfo is not None else None
    return None


def generation_of(item: Mapping[str, Any] | None) -> int:
    value = item.get("generation") if item is not None else None
    return int(value) if isinstance(value, Decimal | int) and not isinstance(value, bool) else 0


def conflict(old: Mapping[str, Any] | None, session_id: str, now: datetime, takeover: bool) -> ApiError | None:
    """None when `session_id` may hold the lease given the SESSION item `old`; otherwise the 409 to answer.

    In order (G §7 R13): same holder -> fine; free, released or a RESET# holder -> fine; lease still live ->
    ACTIVE_SESSION_ELSEWHERE; lapsed without a release -> fine with `takeover`, else TAKEOVER_CONFIRM_REQUIRED.
    """
    if old is None:
        return None
    holder = old.get("sessionId")
    if not isinstance(holder, str) or holder == session_id:
        return None
    if holder.startswith(RESET_HOLDER_PREFIX) or old.get("released") is True:
        return None
    device = old.get("deviceLabel")
    device = device if isinstance(device, str) else None
    expires = parse_time(old.get("leaseExpiresAt"))
    if expires is not None and expires > now:
        retry_after = max(1, math.ceil((expires - now).total_seconds()))
        return ApiError(
            "ACTIVE_SESSION_ELSEWHERE",
            "The game is being played on another device",
            details={"retryAfterSeconds": retry_after, "deviceLabel": device},
        )
    if takeover:
        return None
    seen = parse_time(old.get("lastRenewedAt"))
    if seen is None and expires is not None:
        seen = expires - timedelta(seconds=LEASE_SECONDS)
    seen_ago = max(0, math.floor((now - seen).total_seconds())) if seen is not None else None
    return ApiError(
        "TAKEOVER_CONFIRM_REQUIRED",
        "Previous session lapsed without release",
        details={"deviceLabel": device, "lastSeenSecondsAgo": seen_ago},
    )


def hold_values(*, run_id: str, device_label: str, now: datetime) -> dict[str, Any]:
    """The values every claim and renew writes: a fresh lease for this holder."""
    return {
        ":expires": iso_z(now + timedelta(seconds=LEASE_SECONDS)),
        ":runId": run_id,
        ":false": False,
        ":deviceLabel": device_label,
        ":now": iso_z(now),
    }


def _names(*used: str) -> dict[str, str]:
    return {name: NAMES[name] for name in used}


_HOLD_NAMES = ("#leaseExpiresAt", "#runId", "#released", "#deviceLabel", "#lastRenewedAt")


def same_holder_update(
    *, session_id: str, run_id: str, device_label: str, now: datetime, generation: int | None = None
) -> dict[str, Any]:
    """Claim step (1): this browser already holds the lease. Extend it; the generation does not change.
    With `generation`, the condition also pins it (R8 knows it from its read and returns it)."""
    condition = "#sessionId = :sessionId"
    names = _names("#sessionId", *_HOLD_NAMES)
    values = {**hold_values(run_id=run_id, device_label=device_label, now=now), ":sessionId": session_id}
    if generation is not None:
        condition += " AND #generation = :generation"
        names["#generation"] = NAMES["#generation"]
        values[":generation"] = generation
    return {"update": _HOLD, "condition": condition, "names": names, "values": values}


def takeover_update(
    *,
    session_id: str,
    run_id: str,
    device_label: str,
    now: datetime,
    takeover: bool,
    expected: Mapping[str, Any] | bool | None = False,
) -> dict[str, Any]:
    """Claim step (2): take the lease over with generation + 1 if it is free, released, held by a RESET# holder or
    (only with `takeover`) lapsed.

    `expected=False` (R13): `ADD generation 1`, whatever it is now. `expected=<the SESSION item read before>` or
    None (no item) (R8): the condition also pins that generation and the update SETs generation + 1, so the handler
    knows the new generation without reading it back.
    """
    free = ["attribute_not_exists(#sessionId)", "#released = :true", "begins_with(#sessionId, :reset)"]
    if takeover:
        free.append("#leaseExpiresAt <= :now")
    condition = "(" + " OR ".join(free) + ")"
    names = _names("#sessionId", "#generation", *_HOLD_NAMES)
    values: dict[str, Any] = {
        **hold_values(run_id=run_id, device_label=device_label, now=now),
        ":sessionId": session_id,
        ":true": True,
        ":reset": RESET_HOLDER_PREFIX,
    }
    if expected is False:
        update = _HOLD + ", #sessionId = :sessionId ADD #generation :one"
        values[":one"] = 1
    else:
        current = generation_of(expected if isinstance(expected, Mapping) else None)
        update = _HOLD + ", #sessionId = :sessionId, #generation = :next"
        values[":next"] = current + 1
        if isinstance(expected, Mapping) and "generation" in expected:
            condition += " AND #generation = :generation"
            values[":generation"] = current
        else:
            condition += " AND attribute_not_exists(#generation)"
    return {"update": update, "condition": condition, "names": names, "values": values}


def release_update(*, session_id: str, generation: int, now: datetime) -> dict[str, Any]:
    """R14: `leaseExpiresAt = now, released = true`, only if this tenure still holds the lease."""
    return {
        "update": "SET #leaseExpiresAt = :now, #released = :true",
        "condition": "#sessionId = :sessionId AND #generation = :generation",
        "names": _names("#leaseExpiresAt", "#released", "#sessionId", "#generation"),
        "values": {":now": iso_z(now), ":true": True, ":sessionId": session_id, ":generation": generation},
    }


def renew_update(*, session_id: str, generation: int, run_id: str, device_label: str, now: datetime) -> dict:
    """R13 renew: extend the lease, clear `released`, set `runId`; only for this exact tenure (no clock check)."""
    return {
        "update": _HOLD,
        "condition": "#sessionId = :sessionId AND #generation = :generation",
        "names": _names("#sessionId", "#generation", *_HOLD_NAMES),
        "values": {
            **hold_values(run_id=run_id, device_label=device_label, now=now),
            ":sessionId": session_id,
            ":generation": generation,
        },
    }


def lease_view(session_id: str, generation: int, now: datetime) -> dict[str, Any]:
    """`{sessionId, generation, leaseExpiresAt, leaseSeconds, renewAfterSeconds}` for a lease just written."""
    return {
        "sessionId": session_id,
        "generation": generation,
        "leaseExpiresAt": iso_z(now + timedelta(seconds=LEASE_SECONDS)),
        "leaseSeconds": LEASE_SECONDS,
        "renewAfterSeconds": RENEW_AFTER_SECONDS,
    }


def jittered_pause(attempt: int, random: Callable[[], float]) -> float:
    """Seconds to wait before retry `attempt` (1, 2, ...): full jitter on a 50 ms doubling base, at most 0.8 s."""
    return min(0.8, 0.05 * 2**attempt) * random()
