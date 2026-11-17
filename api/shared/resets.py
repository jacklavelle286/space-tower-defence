"""R5 `POST /api/me/resets {type, confirm}` (Phase 55, M4-06; F §12.5, G §3 R5, spine S8.2).

`confirm` must be the identical string to `type`, so a reset cannot come from a mistaken click or a replayed generic
request. Each reset is idempotent and answers 200 only when every step has finished; the client repeats on an error.

    CAMPAIGN_PROGRESS  PROFILE: SET planets = {}, badges = {} (attribute_exists). Runs carry on and re-earn badges by
                       threshold; summaries, SESSION, name, picture and birthday stay.
    LEARNING_HISTORY   every SUM# item deleted (BatchWriteItem). Everything else stays, slot attempt records included.
    WHOLE_PROFILE      (1) fence: SESSION ADD generation 1, sessionId = RESET#<requestId>, a 60 s lease, released =
                       false, so a device mid-flush fails the fence and diverges instead of writing under a half-deleted
                       profile; (2) every RUN#, SLOT# and SUM# item deleted; (3) PROFILE deleted last, so an
                       interrupted reset still shows a profile and the client repeats; (4) the lease released if the
                       reset still holds it. SESSION (generation only ever rises) and the Cognito user are kept. A
                       repeat after success finds nothing and still answers 200. A RESET# holder left by a reset that
                       died before (4) counts as released at the next claim (shared/session.py).
"Reset current run" is not a type here: it is ABANDON or FINISH_RUN through R11.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from datetime import datetime, timedelta
from typing import Any

from botocore.exceptions import ClientError

from shared.body import invalid
from shared.data import DynamoTable
from shared.errors import ApiError
from shared.session import RESET_HOLDER_PREFIX, SESSION_SK, iso_z

TYPES = ("CAMPAIGN_PROGRESS", "LEARNING_HISTORY", "WHOLE_PROFILE")
PROFILE_SK = "PROFILE"
RESET_LEASE_SECONDS = 60  # longer than the 25 s function timeout, so the fence always outlives the handler (F §12.5)
WIPED_PREFIXES = ("RUN#", "SLOT#", "SUM#")


def checked_type(body: Mapping[str, Any]) -> str:
    """The reset type, or VALIDATION_FAILED: an unknown type, a confirm that is not the identical string, other keys."""
    if set(body) - {"type", "confirm"}:
        raise invalid("body", "additionalProperties")
    reset = body.get("type")
    if reset not in TYPES:
        raise invalid("type", "enum")
    if body.get("confirm") != reset:
        raise invalid("confirm", "const")
    return str(reset)


def _is_ccf(error: ClientError) -> bool:
    return error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException"


def reset_campaign_progress(table: DynamoTable, pk: str) -> None:
    try:
        table.update_item(
            pk,
            PROFILE_SK,
            update="SET #planets = :empty, #badges = :empty",
            names={"#planets": "planets", "#badges": "badges", "#pk": "pk"},
            values={":empty": {}},
            condition="attribute_exists(#pk)",
        )
    except ClientError as error:
        if _is_ccf(error):
            raise ApiError("PROFILE_NOT_FOUND") from None
        raise


def reset_learning_history(table: DynamoTable, pk: str, sleep: Callable[[float], None] | None = None) -> None:
    if table.get_item(pk, PROFILE_SK, attributes=("pk",)) is None:
        raise ApiError("PROFILE_NOT_FOUND")
    keys = [(pk, str(item["sk"])) for item in table.query_prefix(pk, "SUM#", attributes=("pk", "sk"))]
    table.batch_delete(keys, sleep=sleep)


def reset_whole_profile(
    table: DynamoTable, pk: str, request_id: str, now: datetime, sleep: Callable[[float], None] | None = None
) -> None:
    holder = f"{RESET_HOLDER_PREFIX}{request_id}"
    # (1) The fence first: +1 generation and a RESET# holder, so every queued op from any device now fails step (b).
    table.update_item(
        pk,
        SESSION_SK,
        update="ADD #generation :one SET #sessionId = :holder, #leaseExpiresAt = :until, #released = :false",
        names={
            "#generation": "generation",
            "#sessionId": "sessionId",
            "#leaseExpiresAt": "leaseExpiresAt",
            "#released": "released",
        },
        values={
            ":one": 1,
            ":holder": holder,
            ":until": iso_z(now + timedelta(seconds=RESET_LEASE_SECONDS)),
            ":false": False,
        },
    )
    # (2) Runs, slots and summaries.
    keys: list[tuple[str, str]] = []
    for prefix in WIPED_PREFIXES:
        keys += [(pk, str(item["sk"])) for item in table.query_prefix(pk, prefix, attributes=("pk", "sk"))]
    table.batch_delete(keys, sleep=sleep)
    # (3) PROFILE last: until this, an interrupted reset still shows a profile, and the client repeats.
    table.delete_item(pk, PROFILE_SK)
    # (4) Release the lease if the reset still holds it.
    try:
        table.update_item(
            pk,
            SESSION_SK,
            update="SET #released = :true, #leaseExpiresAt = :now",
            names={"#released": "released", "#leaseExpiresAt": "leaseExpiresAt", "#sessionId": "sessionId"},
            values={":true": True, ":now": iso_z(now), ":holder": holder},
            condition="#sessionId = :holder",
        )
    except ClientError as error:
        if not _is_ccf(error):
            raise


def apply_reset(
    table: DynamoTable,
    pk: str,
    reset: str,
    *,
    request_id: str,
    now: datetime,
    sleep: Callable[[float], None] | None = None,
) -> dict[str, Any]:
    if reset == "CAMPAIGN_PROGRESS":
        reset_campaign_progress(table, pk)
    elif reset == "LEARNING_HISTORY":
        reset_learning_history(table, pk, sleep)
    else:
        reset_whole_profile(table, pk, request_id, now, sleep)
    return {"type": reset, "completedAt": iso_z(now)}
