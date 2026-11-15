"""What moto enforces of DynamoDB's size limits (register U-034, recorded at the first PY-U tests in Phase 7).

moto 5.2.5 refuses an item over 400 KB and a transaction over 100 actions, as DynamoDB does. It does NOT refuse a
transaction over 4 MB in total, so the 4 MB rule must be checked by our own code (or DynamoDB Local in CI), never
assumed from a green moto test. If a moto upgrade changes any of this, the matching test fails and the register row
is revisited.
"""

from __future__ import annotations

from typing import Any

import pytest
from botocore.exceptions import ClientError
from conftest import TABLE

KB = 1024


def _put(pk: str, size: int = 0) -> dict[str, Any]:
    item: dict[str, Any] = {"pk": {"S": pk}, "sk": {"S": "X"}}
    if size:
        item["v"] = {"S": "x" * size}
    return {"Put": {"TableName": TABLE, "Item": item}}


def test_moto_allows_100_actions(ddb: Any) -> None:
    ddb.transact_write_items(TransactItems=[_put(f"a{i}") for i in range(100)])


def test_moto_refuses_101_actions(ddb: Any) -> None:
    with pytest.raises(ClientError) as caught:
        ddb.transact_write_items(TransactItems=[_put(f"b{i}") for i in range(101)])
    assert caught.value.response["Error"]["Code"] == "ValidationException"


def test_moto_refuses_an_item_over_400_kb(ddb: Any) -> None:
    with pytest.raises(ClientError) as caught:
        ddb.transact_write_items(TransactItems=[_put("big", 400 * KB + 1)])
    assert caught.value.response["Error"]["Code"] == "ValidationException"


def test_moto_does_not_enforce_the_4_mb_transaction_limit(ddb: Any) -> None:
    # 12 items of 380 KB is about 4.5 MB: DynamoDB would refuse this; moto accepts it.
    ddb.transact_write_items(TransactItems=[_put(f"m{i}", 380 * KB) for i in range(12)])
