"""DynamoDB access helper (plan F §12.4, spine S8.1).

Two rules are enforced here so no handler has to remember them:

- Every read is strongly consistent. `get_item` and `query` always send `ConsistentRead=True`; there is no switch.
- Every attribute name goes through `ExpressionAttributeNames`. `check_expressions` rejects any bare word in an
  expression that is not a DynamoDB keyword or function, so `count < :cap` fails and `#count < :cap` passes. Several
  of our names (`status`, `state`, `type`, `count`, `ttl`, ...) are reserved words; using `#name` everywhere means
  nobody has to know which.

The helper talks to the low-level client and converts plain Python values with boto3's serialiser. Tests pass a moto
client, or a fake that records calls.
"""

from __future__ import annotations

import os
import re
from collections.abc import Mapping, Sequence
from typing import Any

import boto3
from boto3.dynamodb.types import TypeDeserializer, TypeSerializer

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

    def query_prefix(self, pk: str, sk_prefix: str) -> list[dict[str, Any]]:
        """Every item in partition `pk` whose `sk` starts with `sk_prefix`, following LastEvaluatedKey to the end."""
        request: dict[str, Any] = {
            "TableName": self.table_name,
            "KeyConditionExpression": "#pk = :pk AND begins_with(#sk, :sk)",
            "ExpressionAttributeNames": {"#pk": "pk", "#sk": "sk"},
            "ExpressionAttributeValues": _serialise({":pk": pk, ":sk": sk_prefix}),
            "ConsistentRead": True,
        }
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
    ) -> dict[str, Any]:
        """A checked UpdateItem. Returns the deserialised `Attributes` (empty unless `return_values` asks for them).
        A failed condition raises botocore's ClientError with code ConditionalCheckFailedException."""
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
        return _deserialise(self._client.update_item(**request).get("Attributes", {}))


# Environment variable names the Lambda module sets (H §H.4.4 lists the values; the names are [ASSUMPTION]).
GAME_TABLE_ENV = "GAME_TABLE_NAME"
CONTENT_TABLE_ENV = "CONTENT_TABLE_NAME"


def table_from_env(env_var: str) -> DynamoTable:
    """The table named by `env_var`, on a client made now. Call it only after authorisation has passed."""
    return DynamoTable(boto3.client("dynamodb"), os.environ[env_var])
