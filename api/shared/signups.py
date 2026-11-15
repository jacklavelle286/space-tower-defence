"""The daily sign-up counter (spine S1.2, F §12.2 G10).

One item per UTC day in the `game` table: pk `SYS#SIGNUPS`, sk `<yyyy-mm-dd>`, attributes `count` and `ttl`. A sign-up
adds 1 to `count` only if the item has no count yet or the count is below the cap; DynamoDB checks the condition and the
add in one step, so two sign-ups at once can never both take the last place.

`ttl` only tidies old items away (the table's one TTL attribute, F §12.1); correctness comes from the date in the key.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta

from botocore.exceptions import ClientError

from shared.data import DynamoTable

SIGNUPS_PK = "SYS#SIGNUPS"
# How long a day's counter item is kept after its day starts [ASSUMPTION]: long enough to read back the next day.
TTL_AFTER_DAYS = 3


class SignUpCapReached(Exception):
    """Today's cap is used up (or the cap is 0, which closes sign-up)."""


def expiry_epoch(day: date) -> int:
    return int(datetime.combine(day + timedelta(days=TTL_AFTER_DAYS), time(0), tzinfo=UTC).timestamp())


def count_signup(table: DynamoTable, day: date, cap: int) -> int:
    """Take one place in `day`'s allowance and return the new count. Raise SignUpCapReached when there is none left.
    Any other DynamoDB error propagates; the caller must fail closed on it."""
    if cap <= 0:
        # The condition below lets the first sign-up of a day through whatever the cap (attribute_not_exists), so a
        # cap of 0 must be refused before writing.
        raise SignUpCapReached
    try:
        attributes = table.update_item(
            SIGNUPS_PK,
            day.isoformat(),
            update="ADD #count :one SET #ttl = :ttl",
            condition="attribute_not_exists(#count) OR #count < :cap",
            names={"#count": "count", "#ttl": "ttl"},
            values={":one": 1, ":cap": cap, ":ttl": expiry_epoch(day)},
            return_values="UPDATED_NEW",
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
            raise SignUpCapReached from None
        raise
    return int(attributes["count"])
