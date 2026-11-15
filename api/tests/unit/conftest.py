"""Shared test fixtures (pytest injects them by name into any test that lists them as a parameter)."""

from __future__ import annotations

import copy
import importlib.util
import io
import json
import uuid
from pathlib import Path
from types import ModuleType
from typing import Any

import boto3
import pytest
from moto import mock_aws

from shared.log import ApiLogger

API = Path(__file__).resolve().parents[2]
REPO = API.parent
FIXTURES = API / "tests" / "fixtures"
FUNCTIONS = ("player_api", "admin_api", "tts", "cognito_presignup")
TABLE = "test-game"


def load_handler(function: str) -> ModuleType:
    """Import api/functions/<function>/handler.py under a unique module name (all four files are called handler.py)."""
    path = API / "functions" / function / "handler.py"
    spec = importlib.util.spec_from_file_location(f"handler_{function}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def player_event() -> dict[str, Any]:
    """The payload 2.0 event the Phase 5 spike's echo Lambda received for a player access token (ADR-0012)."""
    return json.loads((FIXTURES / "authorizer" / "player-event.json").read_text())


def event_for(base: dict[str, Any], route_key: str, **claims: Any) -> dict[str, Any]:
    """`base` with its route key replaced and claims added, changed or (value None) removed."""
    event = copy.deepcopy(base)
    event["routeKey"] = route_key
    event["requestContext"]["routeKey"] = route_key
    jwt_claims = event["requestContext"]["authorizer"]["jwt"]["claims"]
    for name, value in claims.items():
        name = name.replace("__", ":")  # cognito__groups -> cognito:groups
        if value is None:
            jwt_claims.pop(name, None)
        else:
            jwt_claims[name] = value
    return event


class CapturedLogger(ApiLogger):
    def __init__(self) -> None:
        self.stream = io.StringIO()
        super().__init__(f"test-{uuid.uuid4().hex}", stream=self.stream)  # a fresh Powertools logger per test

    def lines(self) -> list[dict[str, Any]]:
        return [json.loads(line) for line in self.stream.getvalue().splitlines()]


@pytest.fixture
def captured_logger() -> CapturedLogger:
    return CapturedLogger()


class RecordingClient:
    """A stand-in DynamoDB client that records every method called on it and answers with empty results."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def __getattr__(self, name: str) -> Any:
        def call(**kwargs: Any) -> dict[str, Any]:
            self.calls.append((name, kwargs))
            return {}

        return call


@pytest.fixture
def recording_client() -> RecordingClient:
    return RecordingClient()


@pytest.fixture
def aws_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fake credentials and region, so nothing can ever reach a real account."""
    for name in ("AWS_PROFILE", "AWS_SESSION_TOKEN"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "eu-west-2")


@pytest.fixture
def ddb(aws_env: None) -> Any:
    """A moto DynamoDB client with an empty `game`-shaped table (pk/sk strings, on-demand)."""
    with mock_aws():
        client = boto3.client("dynamodb", region_name="eu-west-2")
        client.create_table(
            TableName=TABLE,
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        yield client
