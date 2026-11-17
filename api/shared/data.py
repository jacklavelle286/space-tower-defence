"""DynamoDB access helper (plan F §12.4, spine S8.1).

Two rules are enforced here so no handler has to remember them:

- Every read is strongly consistent. `get_item` and `query` always send `ConsistentRead=True`; there is no switch.
- Every attribute name goes through `ExpressionAttributeNames`. `check_expressions` rejects any bare word in an
  expression that is not a DynamoDB keyword or function, so `count < :cap` fails and `#count < :cap` passes. Several
  of our names (`status`, `state`, `type`, `count`, `ttl`, ...) are reserved words; using `#name` everywhere means
  nobody has to know which.

The helper talks to the low-level client and converts plain Python values with boto3's serialiser. Tests pass a moto
client, or a fake that records calls.

Transactions (Phase 16): `put_action`, `update_action`, `condition_check_action` and `delete_action` build checked
TransactWriteItems actions, `transact_write` sends them, and `cancellation_reasons` reads a TransactionCanceledException
back as one `Reason` per action, in the order the actions were sent (F §12.3: the reasons are ordered like the request).
`batch_get` is the consistent BatchGetItem of G3 / C2: chunks of 100 keys, UnprocessedKeys drained, results matched
back to the requested keys.
"""

from __future__ import annotations

import os
import re
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import boto3
from boto3.dynamodb.types import TypeDeserializer, TypeSerializer
from botocore.exceptions import ClientError

_SERIALIZER = TypeSerializer()
_DESERIALIZER = TypeDeserializer()

# Keywords and functions allowed bare in condition, key-condition, update and projection expressions.
_KEYWORDS = frozenset(
    {
        "and",
        "or",
        "not",
        "between",
        "in",
        "set",
        "add",
        "remove",
        "delete",
        "attribute_exists",
        "attribute_not_exists",
        "attribute_type",
        "begins_with",
        "contains",
        "size",
        "if_not_exists",
        "list_append",
    }
)
_TOKEN = re.compile(r"[#:]?[A-Za-z_][A-Za-z0-9_]*")


class ExpressionError(ValueError):
    """An expression that names an attribute without ExpressionAttributeNames, or uses an undefined placeholder."""


def check_expressions(
    expressions: Sequence[str | None],
    names: Mapping[str, str],
    values: Mapping[str, Any] | None = None,
) -> None:
    """Raise ExpressionError unless every attribute in `expressions` is a `#placeholder` defined in `names`, every
    `:value` is defined in `values`, and every name placeholder is used."""
    values = values or {}
    used_names: set[str] = set()
    for expression in expressions:
        if expression is None:
            continue
        for token in _TOKEN.findall(expression):
            if token.startswith("#"):
                if token not in names:
                    raise ExpressionError(f"name placeholder {token} is not defined")
                used_names.add(token)
            elif token.startswith(":"):
                if token not in values:
                    raise ExpressionError(f"value placeholder {token} is not defined")
            elif token.lower() not in _KEYWORDS:
                raise ExpressionError(f"bare attribute name {token!r}: use ExpressionAttributeNames")
    unused = set(names) - used_names
    if unused:
        raise ExpressionError(f"unused name placeholders {sorted(unused)}")


def _serialise(item: Mapping[str, Any]) -> dict[str, Any]:
    return {key: _SERIALIZER.serialize(value) for key, value in item.items()}


def _deserialise(item: Mapping[str, Any]) -> dict[str, Any]:
    return {key: _DESERIALIZER.deserialize(value) for key, value in item.items()}


class DynamoTable:
    """One table, keyed by string `pk` and `sk` (spine S8)."""

    def __init__(self, client: Any, table_name: str) -> None:
        self._client = client
        self.table_name = table_name

    def get_item(self, pk: str, sk: str, attributes: Sequence[str] | None = None) -> dict[str, Any] | None:
        request: dict[str, Any] = {
            "TableName": self.table_name,
            "Key": _serialise({"pk": pk, "sk": sk}),
            "ConsistentRead": True,
        }
        if attributes:
            names = {f"#a{i}": name for i, name in enumerate(attributes)}
            request["ProjectionExpression"] = ", ".join(names)
            request["ExpressionAttributeNames"] = names
        item = self._client.get_item(**request).get("Item")
        return _deserialise(item) if item is not None else None

    def query_prefix(self, pk: str, sk_prefix: str, attributes: Sequence[str] | None = None) -> list[dict[str, Any]]:
        """Every item in partition `pk` whose `sk` starts with `sk_prefix`, following LastEvaluatedKey to the end.
        `attributes` limits each item to those top-level attributes (a projection), as in `get_item`."""
        names = {"#pk": "pk", "#sk": "sk"}
        request: dict[str, Any] = {
            "TableName": self.table_name,
            "KeyConditionExpression": "#pk = :pk AND begins_with(#sk, :sk)",
            "ExpressionAttributeNames": names,
            "ExpressionAttributeValues": _serialise({":pk": pk, ":sk": sk_prefix}),
            "ConsistentRead": True,
        }
        if not sk_prefix:  # the whole partition (content C1: pk = ACT); DynamoDB refuses an empty key value
            del names["#sk"]
            request["KeyConditionExpression"] = "#pk = :pk"
            request["ExpressionAttributeValues"] = _serialise({":pk": pk})
        if attributes:
            projected = {f"#a{i}": name for i, name in enumerate(attributes)}
            names.update(projected)
            request["ProjectionExpression"] = ", ".join(projected)
        items: list[dict[str, Any]] = []
        while True:
            page = self._client.query(**request)
            items.extend(_deserialise(item) for item in page.get("Items", []))
            last = page.get("LastEvaluatedKey")
            if not last:
                return items
            request["ExclusiveStartKey"] = last

    def update_item(
        self,
        pk: str,
        sk: str,
        *,
        update: str,
        names: Mapping[str, str],
        values: Mapping[str, Any],
        condition: str | None = None,
        return_values: str = "NONE",
        return_old_on_failure: bool = False,
    ) -> dict[str, Any]:
        """A checked UpdateItem. Returns the deserialised `Attributes` (empty unless `return_values` asks for them).
        A failed condition raises botocore's ClientError with code ConditionalCheckFailedException; with
        `return_old_on_failure` the error also carries the item as it was (`failed_item(error)` reads it)."""
        check_expressions([update, condition], names, values)
        request: dict[str, Any] = {
            "TableName": self.table_name,
            "Key": _serialise({"pk": pk, "sk": sk}),
            "UpdateExpression": update,
            "ExpressionAttributeNames": dict(names),
            "ExpressionAttributeValues": _serialise(values),
            "ReturnValues": return_values,
        }
        if condition is not None:
            request["ConditionExpression"] = condition
        if return_old_on_failure:
            request["ReturnValuesOnConditionCheckFailure"] = "ALL_OLD"
        return _deserialise(self._client.update_item(**request).get("Attributes", {}))

    # --- Transactions (TransactWriteItems; F §12.3) ------------------------------------------------------------------

    def put_action(
        self,
        item: Mapping[str, Any],
        *,
        condition: str,
        names: Mapping[str, str],
        values: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        """One conditional Put for `transact_write`. `item` holds `pk`, `sk` and the named attributes, nothing else."""
        check_expressions([condition], names, values)
        put: dict[str, Any] = {
            "TableName": self.table_name,
            "Item": _serialise(item),
            "ConditionExpression": condition,
            "ExpressionAttributeNames": dict(names),
        }
        if values:
            put["ExpressionAttributeValues"] = _serialise(values)
        return {"Put": put}

    def update_action(
        self,
        pk: str,
        sk: str,
        *,
        update: str,
        names: Mapping[str, str],
        values: Mapping[str, Any],
        condition: str | None,
        return_old_on_failure: bool = False,
    ) -> dict[str, Any]:
        """One Update for `transact_write`. `condition` is required by name: pass None only on purpose (Phase 17: the
        SUM# counters, which `if_not_exists` makes safe to create or add to)."""
        check_expressions([update, condition], names, values)
        action: dict[str, Any] = {
            "TableName": self.table_name,
            "Key": _serialise({"pk": pk, "sk": sk}),
            "UpdateExpression": update,
            "ExpressionAttributeNames": dict(names),
            "ExpressionAttributeValues": _serialise(values),
        }
        if condition is not None:
            action["ConditionExpression"] = condition
        if return_old_on_failure:
            action["ReturnValuesOnConditionCheckFailure"] = "ALL_OLD"
        return {"Update": action}

    def condition_check_action(
        self,
        pk: str,
        sk: str,
        *,
        condition: str,
        names: Mapping[str, str],
        values: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        """One ConditionCheck for `transact_write` (checks an item, writes nothing)."""
        check_expressions([condition], names, values)
        check: dict[str, Any] = {
            "TableName": self.table_name,
            "Key": _serialise({"pk": pk, "sk": sk}),
            "ConditionExpression": condition,
            "ExpressionAttributeNames": dict(names),
        }
        if values:
            check["ExpressionAttributeValues"] = _serialise(values)
        return {"ConditionCheck": check}

    def delete_action(
        self,
        pk: str,
        sk: str,
        *,
        condition: str | None = None,
        names: Mapping[str, str] | None = None,
        values: Mapping[str, Any] | None = None,
    ) -> dict[str, Any]:
        """One Delete for `transact_write`. Without a condition it is idempotent: deleting a missing item succeeds."""
        delete: dict[str, Any] = {"TableName": self.table_name, "Key": _serialise({"pk": pk, "sk": sk})}
        if condition is not None:
            check_expressions([condition], names or {}, values)
            delete["ConditionExpression"] = condition
            delete["ExpressionAttributeNames"] = dict(names or {})
            if values:
                delete["ExpressionAttributeValues"] = _serialise(values)
        return {"Delete": delete}

    def delete_item(self, pk: str, sk: str) -> None:
        """An unconditional DeleteItem (idempotent: a missing item is not an error)."""
        self._client.delete_item(TableName=self.table_name, Key=_serialise({"pk": pk, "sk": sk}))

    def transact_write(self, actions: Sequence[Mapping[str, Any]]) -> None:
        """All of `actions` or none. A failure raises ClientError; for TransactionCanceledException,
        `cancellation_reasons(error)` gives one Reason per action, in this order."""
        if not 1 <= len(actions) <= MAX_TRANSACTION_ACTIONS:
            raise ValueError(f"a transaction holds 1 to {MAX_TRANSACTION_ACTIONS} actions, not {len(actions)}")
        self._client.transact_write_items(TransactItems=list(actions))

    # --- BatchGetItem (G3, C2) -------------------------------------------------------------------------------------

    def batch_get(
        self,
        keys: Sequence[tuple[str, str]],
        *,
        max_rounds: int = 10,
        sleep: Callable[[float], None] | None = None,
    ) -> dict[tuple[str, str], dict[str, Any]]:
        """The items at `keys` (duplicates read once), consistently, as {(pk, sk): item}. A key with no item is
        absent from the result. UnprocessedKeys are retried with a short back-off; if some are still unprocessed
        after `max_rounds`, BatchGetIncomplete is raised rather than answering as if they were missing."""
        wanted = list(dict.fromkeys(keys))
        wanted_set = set(wanted)
        found: dict[tuple[str, str], dict[str, Any]] = {}
        for start in range(0, len(wanted), BATCH_GET_MAX_KEYS):
            pending: list[dict[str, Any]] = [
                _serialise({"pk": pk, "sk": sk}) for pk, sk in wanted[start : start + BATCH_GET_MAX_KEYS]
            ]
            for round_number in range(max_rounds):
                if not pending:
                    break
                if round_number and sleep is not None:
                    sleep(min(0.05 * 2**round_number, 1.0))
                response = self._client.batch_get_item(
                    RequestItems={self.table_name: {"Keys": pending, "ConsistentRead": True}}
                )
                for raw in response.get("Responses", {}).get(self.table_name, []):
                    item = _deserialise(raw)
                    key = (str(item.get("pk")), str(item.get("sk")))
                    if key in found or key not in wanted_set:
                        raise BatchGetIncomplete("BatchGetItem returned an item that was not asked for")
                    found[key] = item
                pending = list(response.get("UnprocessedKeys", {}).get(self.table_name, {}).get("Keys", []))
            if pending:
                raise BatchGetIncomplete(f"{len(pending)} keys still unprocessed after {max_rounds} rounds")
        return found

    # --- BatchWriteItem deletes (G9 prune) ------------------------------------------------------------------------

    def batch_delete(
        self,
        keys: Sequence[tuple[str, str]],
        *,
        max_rounds: int = 10,
        sleep: Callable[[float], None] | None = None,
    ) -> None:
        """Delete every item at `keys` (missing ones are fine), 25 per request, retrying UnprocessedItems with a short
        back-off. Raises BatchWriteIncomplete when some are still unprocessed after `max_rounds` (G9: the caller
        logs it; deletes are idempotent, so a later prune finishes the job)."""
        wanted = list(dict.fromkeys(keys))
        for start in range(0, len(wanted), BATCH_WRITE_MAX_ITEMS):
            pending: list[dict[str, Any]] = [
                {"DeleteRequest": {"Key": _serialise({"pk": pk, "sk": sk})}}
                for pk, sk in wanted[start : start + BATCH_WRITE_MAX_ITEMS]
            ]
            for round_number in range(max_rounds):
                if not pending:
                    break
                if round_number and sleep is not None:
                    sleep(min(0.05 * 2**round_number, 1.0))
                response = self._client.batch_write_item(RequestItems={self.table_name: pending})
                pending = list(response.get("UnprocessedItems", {}).get(self.table_name, []))
            if pending:
                raise BatchWriteIncomplete(f"{len(pending)} deletes still unprocessed after {max_rounds} rounds")


MAX_TRANSACTION_ACTIONS = 100  # TransactWriteItems limit (F §12.3, [VERIFIED] sources/08-aws-data-ops.md §a.1)
BATCH_GET_MAX_KEYS = 100  # BatchGetItem limit per request
BATCH_WRITE_MAX_ITEMS = 25  # BatchWriteItem limit per request

# Transient answers: the same request may succeed if repeated after a short, jittered pause (G §7 R13, F §5.3).
TRANSIENT_CODES = frozenset(
    {
        "TransactionConflictException",
        "TransactionInProgressException",
        "ProvisionedThroughputExceededException",
        "ThrottlingException",
        "RequestLimitExceeded",
    }
)
TRANSIENT_REASONS = frozenset({"TransactionConflict", "ProvisionedThroughputExceeded", "ThrottlingError"})


class BatchGetIncomplete(Exception):
    """BatchGetItem could not read every requested key (still unprocessed, or an unexpected item came back)."""


class BatchWriteIncomplete(Exception):
    """BatchWriteItem left some deletes unprocessed after every retry."""


@dataclass(frozen=True)
class Reason:
    """One action's entry in a TransactionCanceledException: `code` is "None" for an action that was fine,
    "ConditionalCheckFailed", "TransactionConflict", ...; `item` is the old item when the action asked for it with
    ReturnValuesOnConditionCheckFailure and its condition failed."""

    code: str
    item: dict[str, Any] | None = None


def error_code(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", ""))


def cancellation_reasons(error: ClientError) -> list[Reason] | None:
    """The reasons of a TransactionCanceledException, in action order; None for any other error."""
    if error_code(error) != "TransactionCanceledException":
        return None
    reasons: list[Reason] = []
    for raw in error.response.get("CancellationReasons") or []:
        item = raw.get("Item") if isinstance(raw, Mapping) else None
        code = raw.get("Code") if isinstance(raw, Mapping) else None
        reasons.append(Reason(code=str(code or "None"), item=_deserialise(item) if item else None))
    return reasons


def failed_item(error: ClientError) -> dict[str, Any] | None:
    """The old item a single-item write's ConditionalCheckFailedException carries (ReturnValuesOnConditionCheckFailure
    = ALL_OLD), or None."""
    item = error.response.get("Item")
    return _deserialise(item) if item else None


def is_transient(error: ClientError) -> bool:
    """Throttling or a transaction conflict: worth repeating, never a business answer."""
    if error_code(error) in TRANSIENT_CODES:
        return True
    reasons = cancellation_reasons(error)
    return bool(reasons) and any(r.code in TRANSIENT_REASONS for r in reasons)


# Environment variable names the Lambda module sets (H §H.4.4 lists the values; the names are [ASSUMPTION]).
GAME_TABLE_ENV = "GAME_TABLE_NAME"
CONTENT_TABLE_ENV = "CONTENT_TABLE_NAME"


def table_from_env(env_var: str) -> DynamoTable:
    """The table named by `env_var`, on a client made now. Call it only after authorisation has passed."""
    return DynamoTable(boto3.client("dynamodb"), os.environ[env_var])
