"""The data-access helper: consistent reads and ExpressionAttributeNames everywhere (F §12.4)."""

from __future__ import annotations

from typing import Any

import pytest
from conftest import TABLE, RecordingClient

from shared.data import DynamoTable, ExpressionError, check_expressions


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
