"""DynamoDB Local fixtures (gate G-13, plan H.10). Tests here are marked `ddblocal`.

DDB_LOCAL_ENDPOINT (e.g. http://localhost:8000) says where DynamoDB Local runs:
  unset      every ddblocal test is skipped (your machine has no Docker or Java; plan I.2)
  set        DynamoDB Local is required: if it does not answer, the tests ERROR rather than skip, so a CI job whose
             service container failed cannot pass G-13 by skipping it
CI sets it in release.yml's checks job and ci.yml's api job, next to an amazon/dynamodb-local service container.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import Iterator
from typing import Any

import boto3
import pytest
from botocore.config import Config

ENDPOINT_ENV = "DDB_LOCAL_ENDPOINT"


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if os.environ.get(ENDPOINT_ENV):
        return
    skip = pytest.mark.skip(reason=f"{ENDPOINT_ENV} is not set: DynamoDB Local runs in CI only (G-13)")
    for item in items:
        if "ddblocal" in item.keywords:
            item.add_marker(skip)


@pytest.fixture(scope="session")
def ddb_local() -> Any:
    """A low-level DynamoDB client for DynamoDB Local. Dummy credentials: DynamoDB Local accepts any."""
    endpoint = os.environ[ENDPOINT_ENV]
    client = boto3.client(
        "dynamodb",
        endpoint_url=endpoint,
        region_name="eu-west-2",
        aws_access_key_id="local",
        aws_secret_access_key="local",  # noqa: S106 - not a secret: DynamoDB Local ignores it
        config=Config(retries={"max_attempts": 2}, connect_timeout=5, read_timeout=10),
    )
    try:
        client.list_tables(Limit=1)
    except Exception as exc:  # noqa: BLE001 - any failure here means "not reachable"
        pytest.fail(f"{ENDPOINT_ENV}={endpoint} is set but DynamoDB Local does not answer: {exc}")
    return client


@pytest.fixture
def table(ddb_local: Any) -> Iterator[str]:
    """A fresh pk/sk table, shaped like the game table's keys (spine S5), deleted afterwards."""
    name = f"g13-{uuid.uuid4().hex[:12]}"
    ddb_local.create_table(
        TableName=name,
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        BillingMode="PAY_PER_REQUEST",
    )
    ddb_local.get_waiter("table_exists").wait(TableName=name, WaiterConfig={"Delay": 1, "MaxAttempts": 10})
    yield name
    ddb_local.delete_table(TableName=name)
