"""R29 withdraw reads a version with a projection (Phase 36). The existence check needs `pk` in the projection: when
none of the projected attributes exist (a version never withdrawn has no `withdrawn`), the response may carry no
`Item`, which `data.get_item` reads as "not found". Moto returns an empty item instead, so this runs against
DynamoDB Local. Runs in CI only; see conftest.py."""

from __future__ import annotations

from typing import Any

import pytest

VERSION = {"pk": {"S": "ACTIVITY#sp-0001"}, "sk": {"S": "VERSION#20261120T120000Z"}, "status": {"S": "PUBLISHED"}}
KEY = {"pk": VERSION["pk"], "sk": VERSION["sk"]}


@pytest.mark.ddblocal
def test_projection_with_pk_finds_a_version_that_was_never_withdrawn(ddb_local: Any, table: str) -> None:
    ddb_local.put_item(TableName=table, Item=VERSION)
    found = ddb_local.get_item(TableName=table, Key=KEY, ProjectionExpression="pk, withdrawn", ConsistentRead=True)
    assert found["Item"] == {"pk": VERSION["pk"]}  # present, and not withdrawn
    missing = {"pk": VERSION["pk"], "sk": {"S": "VERSION#20261120T120001Z"}}
    assert "Item" not in ddb_local.get_item(TableName=table, Key=missing, ProjectionExpression="pk, withdrawn")
