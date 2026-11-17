"""player-api wired for the Phase 16 tests: moto `game` and `content` tables, the repository's game data, the
r1 + luna-1-c1 bounds fixture, a fixed clock and seed, and a DynamoDB client that can be made to misbehave.

Not a test module (pytest collects test_*.py only); test_runs.py and test_session.py import it.
"""

from __future__ import annotations

import copy
import json
from collections.abc import Callable
from datetime import datetime
from typing import Any

import boto3
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError
from conftest import FIXTURES, REPO, TABLE, CapturedLogger, event_for, load_handler

from shared.bounds import BoundsUnavailable, parse_bounds
from shared.data import DynamoTable
from shared.game_data import GameDataReader

player_api = load_handler("player_api")

CONTENT_TABLE = "test-content"
BUCKET = "test-player-site"
SUB = "a6c2b2b4-7051-70ef-b1e8-739ac38dd0cb"  # the sub in the Phase 5 fixture event
PK = f"U#{SUB}"
OTHER_SUB = "0f0f0f0f-1111-4222-8333-444444444444"  # made up: a second child on the same family laptop
DOB_AGE_5 = "2021-06-01"  # made up; age 5 on the test dates below
RUN_A = "4b1e0c7a-1d2e-4f30-8a4b-5c6d7e8f9a0b"
RUN_B = "7c2d1e0f-3a4b-4c5d-8e6f-7a8b9c0d1e2f"
MY_SESSION = "11111111-2222-4333-8444-555555555555"
OTHER_SESSION = "99999999-8888-4777-8666-555555555555"
SEED = "00000000000000a1"
BOUNDS_FILE = REPO / "contracts" / "fixtures" / "bounds" / "r1__luna-1-c1.json"
BANK_FILE = FIXTURES / "content" / "m1-bank.json"
DDB_FIXTURES = FIXTURES / "ddb"


def at(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


class Clock:
    def __init__(self, text: str) -> None:
        self.now = at(text)

    def __call__(self) -> datetime:
        return self.now


def bank_items() -> list[dict[str, Any]]:
    return json.loads(BANK_FILE.read_text())["items"]


def load_bounds_fixture(ruleset: str, campaign: str) -> dict[str, Any]:
    if (ruleset, campaign) != ("r1", "luna-1-c1"):
        raise BoundsUnavailable("no such pair")
    return parse_bounds(json.loads(BOUNDS_FILE.read_text()), ruleset, campaign)


def client_error(response: dict[str, Any], operation: str = "TransactWriteItems") -> ClientError:
    return ClientError(copy.deepcopy(response), operation)


class Ddb:
    """The moto client, recording each call. `before_transact` runs just before a TransactWriteItems is sent (to
    make a race happen); `transact_failures` holds error responses to raise instead of sending, one per call;
    `update_failures` the same for UpdateItem."""

    def __init__(self, client: Any) -> None:
        self.client = client
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.before_transact: Callable[[], None] | None = None
        self.transact_failures: list[dict[str, Any]] = []
        self.update_failures: list[dict[str, Any]] = []

    def __getattr__(self, name: str) -> Any:
        method = getattr(self.client, name)

        def call(**kwargs: Any) -> Any:
            self.calls.append((name, kwargs))
            if name == "transact_write_items":
                if self.before_transact is not None:
                    hook, self.before_transact = self.before_transact, None
                    hook()
                if self.transact_failures:
                    raise client_error(self.transact_failures.pop(0))
            if name == "update_item" and self.update_failures:
                raise client_error(self.update_failures.pop(0), "UpdateItem")
            return method(**kwargs)

        return call

    def names(self) -> list[str]:
        return [name for name, _ in self.calls]


def make_table(client: Any, name: str) -> None:
    client.create_table(
        TableName=name,
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )


class RunsApi:
    """player-api on moto. `ddb` is the conftest moto client (inside mock_aws)."""

    def __init__(
        self,
        ddb: Any,
        clock: Clock | None = None,
        *,
        bank: list[dict[str, Any]] | None = None,
        game_data: Any = None,
    ) -> None:
        make_table(ddb, CONTENT_TABLE)
        self.raw = ddb
        self.ddb = Ddb(ddb)
        self.table = DynamoTable(self.ddb, TABLE)
        self.content = DynamoTable(self.ddb, CONTENT_TABLE)
        for item in bank_items() if bank is None else bank:
            ddb.put_item(TableName=CONTENT_TABLE, Item={k: _ddb(v) for k, v in item.items()})
        s3 = boto3.client("s3", region_name="eu-west-2")
        s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "eu-west-2"})
        # The harness's own pointer, not the repository's current.json: these tests describe the Milestone 1 pair
        # (r1 + luna-1-c1, its bounds fixture and bank) whatever the live game points at.
        current = json.dumps({"rulesetVersion": "r1", "campaignVersion": "luna-1-c1"}).encode()
        s3.put_object(Bucket=BUCKET, Key="game-data/current.json", Body=current)
        s3.put_object(
            Bucket=BUCKET,
            Key="game-data/campaign/luna-1-c1.json",
            Body=(REPO / "game-data" / "campaign" / "luna-1-c1.json").read_bytes(),
        )
        self.reader = game_data or GameDataReader(bucket=BUCKET, s3=s3)
        self.clock = clock or Clock("2026-11-20T10:00:00Z")
        self.logger = CapturedLogger()
        self.sleeps: list[float] = []
        self.seeds = 0
        self.bounds: Callable[[str, str], dict[str, Any]] = load_bounds_fixture

        def seed() -> str:
            self.seeds += 1
            return SEED

        deps = player_api.Deps(
            now=self.clock,
            game=lambda: self.table,
            game_data=lambda: self.reader,
            bounds=lambda ruleset, campaign: self.bounds(ruleset, campaign),
            content=lambda: self.content,
            seed=seed,
            sleep=self.sleeps.append,
            random=lambda: 0.5,
        )
        self.router = player_api.make_router(deps, logger=self.logger)
        self.bodies: list[str] = []

    def call(
        self,
        base: dict,
        route_key: str,
        body: Any = None,
        *,
        run_id: str | None = None,
        query: dict | None = None,
        raw: str | None = None,
        sub: str | None = None,
    ) -> tuple[int, Any]:
        event = event_for(base, route_key, **({"sub": sub} if sub else {}))
        if raw is not None:
            event["body"] = raw
        elif body is not None:
            event["body"] = json.dumps(body)
        if run_id is not None:
            event["pathParameters"] = {"runId": run_id}
        if query is not None:
            event["queryStringParameters"] = query
        response = self.router.handle(event)
        self.bodies.append(response["body"])
        assert response["headers"]["cache-control"] == "no-store"
        if response["statusCode"] == 204:
            assert response["body"] == ""
            return 204, None
        return response["statusCode"], json.loads(response["body"])

    # --- Shortcuts ---

    def profile(self, base: dict, dob: str = DOB_AGE_5, sub: str | None = None) -> None:
        status, _ = self.call(
            base, "PUT /api/me/profile", {"nickname": "Star Kid", "avatarId": "avatar-03", "dob": dob}, sub=sub
        )
        assert status == 200

    def create(self, base: dict, run_id: str = RUN_A, session_id: str = MY_SESSION, **changes: Any) -> tuple[int, Any]:
        return self.call(base, "POST /api/runs", create_body(run_id, session_id, **changes))

    def item(self, sk: str, pk: str = PK) -> dict | None:
        return DynamoTable(self.raw, TABLE).get_item(pk, sk)

    def items(self, prefix: str, pk: str = PK) -> list[dict]:
        return DynamoTable(self.raw, TABLE).query_prefix(pk, prefix)

    def set_session(self, **fields: Any) -> None:
        item = {"pk": PK, "sk": "SESSION", **fields}
        self.raw.put_item(TableName=TABLE, Item={k: _ddb(v) for k, v in item.items()})

    def set_run_fields(self, run_id: str, **fields: Any) -> None:
        names = {f"#{name}": name for name in fields}
        DynamoTable(self.raw, TABLE).update_item(
            PK,
            f"RUN#{run_id}",
            update="SET " + ", ".join(f"#{name} = :{name}" for name in fields),
            names=names,
            values={f":{name}": value for name, value in fields.items()},
        )


def create_body(run_id: str = RUN_A, session_id: str = MY_SESSION, **changes: Any) -> dict[str, Any]:
    body = {
        "runId": run_id,
        "planetId": "luna-1",
        "waveSetId": "first-contact",
        "rulesetVersion": "r1",
        "campaignVersion": "luna-1-c1",
        "sessionId": session_id,
        "deviceLabel": "Kitchen laptop",
    }
    body.update(changes)
    return {k: v for k, v in body.items() if v is not None}


def _ddb(value: Any) -> dict[str, Any]:
    return TypeSerializer().serialize(value)


def errors(body: dict) -> list[dict]:
    assert set(body) == {"error"}
    return body["error"]["details"]
