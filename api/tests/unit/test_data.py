"""The data-access helper: consistent reads and ExpressionAttributeNames everywhere (F §12.4)."""

from __future__ import annotations

from typing import Any

import pytest
from botocore.exceptions import ClientError
from conftest import TABLE, RecordingClient

from shared.data import (
    BatchGetIncomplete,
    DynamoTable,
    ExpressionError,
    Reason,
    cancellation_reasons,
    check_expressions,
    is_transient,
)


@pytest.mark.parametrize(
    ("expression", "names", "values"),
    [
        ("count < :cap", {}, {":cap": 1}),  # `count` is a reserved word, and bare names are refused anyway
        ("#count < :cap OR status = :s", {"#count": "count"}, {":cap": 1, ":s": "x"}),
        ("SET nickname = :n", {}, {":n": "x"}),
        ("#count < :cap", {}, {":cap": 1}),  # placeholder not defined
        ("#count < :cap", {"#count": "count"}, {}),  # value not defined
        ("#count < :cap", {"#count": "count", "#spare": "spare"}, {":cap": 1}),  # unused name
    ],
)
def test_bad_expressions_are_refused(expression: str, names: dict, values: dict) -> None:
    with pytest.raises(ExpressionError):
        check_expressions([expression], names, values)


@pytest.mark.parametrize(
    "expression",
    [
        "attribute_not_exists(#count) OR #count < :cap",
        "ADD #count :one SET #ttl = :ttl",
        "SET #planets = if_not_exists(#planets, :empty)",
        "#pk = :pk AND begins_with(#sk, :sk)",
        "NOT attribute_exists(#pk) and size(#sk) BETWEEN :a AND :b",
    ],
)
def test_good_expressions_pass(expression: str) -> None:
    names = {f"#{n}": n for n in ("count", "ttl", "planets", "pk", "sk") if f"#{n}" in expression}
    values = {f":{v}": 1 for v in ("cap", "one", "ttl", "empty", "pk", "sk", "a", "b") if f":{v}" in expression}
    check_expressions([expression], names, values)


def test_get_item_is_always_consistent(recording_client: RecordingClient) -> None:
    DynamoTable(recording_client, "game").get_item("U#x", "PROFILE", attributes=["nickname", "status"])

    [(name, request)] = recording_client.calls
    assert name == "get_item"
    assert request["ConsistentRead"] is True
    assert request["ProjectionExpression"] == "#a0, #a1"
    assert request["ExpressionAttributeNames"] == {"#a0": "nickname", "#a1": "status"}


def test_update_with_a_bare_name_never_reaches_dynamodb(recording_client: RecordingClient) -> None:
    table = DynamoTable(recording_client, "game")
    with pytest.raises(ExpressionError):
        table.update_item("U#x", "PROFILE", update="SET nickname = :n", names={}, values={":n": "Zed"})
    assert recording_client.calls == []


class PagingClient:
    """Answers a query in two pages, recording each request."""

    def __init__(self) -> None:
        self.requests: list[dict[str, Any]] = []

    def query(self, **request: Any) -> dict[str, Any]:
        self.requests.append(dict(request))
        if "ExclusiveStartKey" not in request:
            return {"Items": [{"sk": {"S": "RUN#1"}}], "LastEvaluatedKey": {"pk": {"S": "U#x"}, "sk": {"S": "RUN#1"}}}
        return {"Items": [{"sk": {"S": "RUN#2"}}]}


def test_query_follows_every_page_consistently() -> None:
    client = PagingClient()
    items = DynamoTable(client, "game").query_prefix("U#x", "RUN#")

    assert [item["sk"] for item in items] == ["RUN#1", "RUN#2"]
    assert len(client.requests) == 2
    assert all(request["ConsistentRead"] is True for request in client.requests)
    assert client.requests[0]["ExpressionAttributeNames"] == {"#pk": "pk", "#sk": "sk"}


def test_round_trip_on_moto(ddb: Any) -> None:
    table = DynamoTable(ddb, TABLE)
    table.update_item(
        "U#x",
        "PROFILE",
        update="SET #nickname = :n, #planets = if_not_exists(#planets, :empty)",
        names={"#nickname": "nickname", "#planets": "planets"},
        values={":n": "Nova", ":empty": {}},
    )
    table.update_item("U#x", "RUN#1", update="SET #state = :s", names={"#state": "state"}, values={":s": "IN_PROGRESS"})

    assert table.get_item("U#x", "PROFILE") == {"pk": "U#x", "sk": "PROFILE", "nickname": "Nova", "planets": {}}
    assert table.get_item("U#x", "MISSING") is None
    assert [item["sk"] for item in table.query_prefix("U#x", "RUN#")] == ["RUN#1"]


# --- Phase 16: whole-partition query, transactions, BatchGetItem -----------------------------------------------------


def test_query_with_an_empty_prefix_reads_the_whole_partition(recording_client: RecordingClient) -> None:
    DynamoTable(recording_client, "content").query_prefix("ACT", "")
    [(operation, request)] = recording_client.calls
    assert operation == "query"
    assert request["KeyConditionExpression"] == "#pk = :pk"
    assert request["ExpressionAttributeNames"] == {"#pk": "pk"}
    assert request["ConsistentRead"] is True


def test_transaction_actions_are_checked_before_anything_is_sent(recording_client: RecordingClient) -> None:
    table = DynamoTable(recording_client, "game")
    with pytest.raises(ExpressionError):
        table.put_action({"pk": "U#x", "sk": "RUN#1"}, condition="attribute_not_exists(pk)", names={})
    with pytest.raises(ValueError, match="1 to 100"):
        table.transact_write([table.condition_check_action("U#x", "PROFILE", condition="attribute_exists(#pk)",
                                                            names={"#pk": "pk"})] * 101)  # fmt: skip
    assert recording_client.calls == []


class PagedBatchClient:
    """Answers BatchGetItem with one item per call and the rest as UnprocessedKeys, `stuck` times with nothing."""

    def __init__(self, stuck: int = 0) -> None:
        self.calls = 0
        self.stuck = stuck

    def batch_get_item(self, RequestItems: dict) -> dict:  # boto3's argument name
        self.calls += 1
        [(table, request)] = RequestItems.items()
        assert request["ConsistentRead"] is True
        keys = request["Keys"]
        if self.stuck:
            self.stuck -= 1
            return {"Responses": {table: []}, "UnprocessedKeys": {table: {"Keys": keys}}}
        first, rest = keys[0], keys[1:]
        unprocessed = {table: {"Keys": rest}} if rest else {}
        return {"Responses": {table: [{**first, "v": {"N": "1"}}]}, "UnprocessedKeys": unprocessed}


def test_batch_get_drains_unprocessed_keys_and_matches_items_to_keys() -> None:
    client = PagedBatchClient()
    pauses: list[float] = []
    keys = [("A", "1"), ("B", "2"), ("A", "1"), ("C", "3")]
    found = DynamoTable(client, "content").batch_get(keys, sleep=pauses.append)
    assert set(found) == {("A", "1"), ("B", "2"), ("C", "3")}  # the duplicate key is read once
    assert found[("B", "2")]["v"] == 1
    assert client.calls == 3 and len(pauses) == 2


def test_batch_get_never_reports_unprocessed_keys_as_missing() -> None:
    with pytest.raises(BatchGetIncomplete):
        DynamoTable(PagedBatchClient(stuck=10), "content").batch_get([("A", "1")], max_rounds=3)


def test_cancellation_reasons_in_action_order_with_old_items() -> None:
    error = ClientError(
        {
            "Error": {"Code": "TransactionCanceledException", "Message": "x"},
            "CancellationReasons": [
                {"Code": "ConditionalCheckFailed", "Item": {"sessionId": {"S": "s"}, "generation": {"N": "3"}}},
                {"Code": "None"},
            ],
        },
        "TransactWriteItems",
    )
    assert cancellation_reasons(error) == [
        Reason("ConditionalCheckFailed", {"sessionId": "s", "generation": 3}),
        Reason("None", None),
    ]
    assert cancellation_reasons(ClientError({"Error": {"Code": "ValidationException"}}, "TransactWriteItems")) is None
    conflict = ClientError(
        {"Error": {"Code": "TransactionCanceledException"}, "CancellationReasons": [{"Code": "TransactionConflict"}]},
        "TransactWriteItems",
    )
    assert is_transient(conflict) and not is_transient(error)
