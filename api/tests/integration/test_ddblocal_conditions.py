"""G-13's first DynamoDB Local test (Phase 9): a conditional put refused on a duplicate, alone and inside a
transaction, and the error shapes the API's error handling reads. Deliberately trivial: the transaction suites
(session fence, revision, slot status, ReturnValuesOnConditionCheckFailure) arrive in Phases 16-17 (ADR-0021).
Runs in CI only; see conftest.py."""

from __future__ import annotations

from typing import Any

import pytest
from botocore.exceptions import ClientError

ITEM = {"pk": {"S": "PLAYER#g13"}, "sk": {"S": "PROFILE"}, "revision": {"N": "1"}}
NEW_ONLY = "attribute_not_exists(pk)"


@pytest.mark.ddblocal
def test_conditional_put_refused_on_duplicate_alone_and_in_a_transaction(ddb_local: Any, table: str) -> None:
    ddb_local.put_item(TableName=table, Item=ITEM, ConditionExpression=NEW_ONLY)

    # Alone: ConditionalCheckFailedException, HTTP 400, nothing written.
    with pytest.raises(ClientError) as caught:
        ddb_local.put_item(TableName=table, Item={**ITEM, "revision": {"N": "2"}}, ConditionExpression=NEW_ONLY)
    error = caught.value.response
    assert error["Error"]["Code"] == "ConditionalCheckFailedException"
    assert error["ResponseMetadata"]["HTTPStatusCode"] == 400
    stored = ddb_local.get_item(TableName=table, Key={"pk": ITEM["pk"], "sk": ITEM["sk"]}, ConsistentRead=True)
    assert stored["Item"]["revision"] == {"N": "1"}

    # In a transaction: TransactionCanceledException with one reason per action, in action order; the first action
    # passed its condition ("None"), the second did not. All or nothing: the first put is not written either.
    fresh = {"pk": {"S": "PLAYER#g13"}, "sk": {"S": "RUN#1"}}
    with pytest.raises(ClientError) as caught:
        ddb_local.transact_write_items(
            TransactItems=[
                {"Put": {"TableName": table, "Item": fresh, "ConditionExpression": NEW_ONLY}},
                {"Put": {"TableName": table, "Item": ITEM, "ConditionExpression": NEW_ONLY}},
            ]
        )
    error = caught.value.response
    assert error["Error"]["Code"] == "TransactionCanceledException"
    assert [r["Code"] for r in error["CancellationReasons"]] == ["None", "ConditionalCheckFailed"]
    assert "Item" not in ddb_local.get_item(TableName=table, Key=fresh, ConsistentRead=True)
