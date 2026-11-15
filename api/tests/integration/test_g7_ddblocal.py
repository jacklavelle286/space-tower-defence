"""G7 (create run) and the session claim against DynamoDB Local (Phase 16, gate G-13; ADR-0021). CI only.

Each refusal is made real by changing the table between the handler's reads and its write, so DynamoDB Local itself
cancels the transaction (or refuses the UpdateItem). The test then checks two things:

1. the handler's answer (409 / 404 / replay) is right for what DynamoDB Local really returned, and
2. the shape it returned, reduced to what the handler reads (error code; each reason's `Code` and `Item`, in action
   order; `Message` dropped), equals the recorded file in api/tests/fixtures/ddb/. The unit tests feed those files to
   the handler on moto, so the classification is checked against the recorded shapes on every machine.

Recording: with DDB_FIXTURES_RECORD=1 the observed shape is written to the file instead of compared. Without it, a
difference fails the test and prints the observed JSON to copy into the file (after reading why it changed). The files
were first written from moto 5.2.5's answers (same normalisation); CI's DynamoDB Local run is what confirms them, so
a CI failure here is the evidence U-060 asks for, not noise.
"""

from __future__ import annotations

import copy
import importlib.util
import io
import json
import os
import sys
from collections.abc import Callable, Iterator
from datetime import UTC, datetime
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError

from shared.bounds import BoundsUnavailable, parse_bounds
from shared.data import DynamoTable
from shared.game_data import GameDataReader

API = Path(__file__).resolve().parents[2]
REPO = API.parent
FIXTURES = API / "tests" / "fixtures"
DDB_FIXTURES = FIXTURES / "ddb"
RECORD_ENV = "DDB_FIXTURES_RECORD"
NOW = datetime(2026, 11, 20, 10, 0, 0, tzinfo=UTC)
RUN_A = "4b1e0c7a-1d2e-4f30-8a4b-5c6d7e8f9a0b"
RUN_B = "7c2d1e0f-3a4b-4c5d-8e6f-7a8b9c0d1e2f"
MY_SESSION = "11111111-2222-4333-8444-555555555555"
OTHER_SESSION = "99999999-8888-4777-8666-555555555555"
_SERIALISE = TypeSerializer().serialize


def _load_player_api() -> ModuleType:
    path = API / "functions" / "player_api" / "handler.py"
    spec = importlib.util.spec_from_file_location("handler_player_api_g7", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


player_api = _load_player_api()


def normalise(response: dict[str, Any]) -> dict[str, Any]:
    """What the handler reads from a refused write: the error code, and per action its Code and Item (transactions),
    or the Item (a single UpdateItem with ReturnValuesOnConditionCheckFailure)."""
    shape: dict[str, Any] = {"Error": {"Code": response.get("Error", {}).get("Code")}}
    if "CancellationReasons" in response:
        shape["CancellationReasons"] = [
            {"Code": r.get("Code"), **({"Item": r["Item"]} if r.get("Item") else {})}
            for r in response["CancellationReasons"]
        ]
    if response.get("Item"):
        shape["Item"] = response["Item"]
    return shape


def check_recorded(name: str, observed: dict[str, Any], source: str) -> None:
    path = DDB_FIXTURES / f"{name}.json"
    if os.environ.get(RECORD_ENV) == "1":
        comment = f"Recorded by api/tests/integration/test_g7_ddblocal.py, scenario {name}; see README.md here."
        document = {"$comment": comment, "source": source, **observed}
        path.write_text(json.dumps(document, indent=2, sort_keys=False) + "\n")
        return
    recorded = json.loads(path.read_text())
    expected = {key: recorded[key] for key in ("Error", "CancellationReasons", "Item") if key in recorded}
    if expected != observed:
        pytest.fail(
            f"{path.name} differs from what DynamoDB returned. Observed (set {RECORD_ENV}=1 to record):\n"
            + json.dumps(observed, indent=2)
        )


class Recorder:
    """The DynamoDB client, with a hook that runs just before the next TransactWriteItems or SESSION UpdateItem, and
    the normalised response of every refused write."""

    def __init__(self, client: Any) -> None:
        self.client = client
        self.before: Callable[[], None] | None = None
        self.before_on: str = "transact_write_items"
        self.refusals: list[dict[str, Any]] = []
        self.transactions = 0

    def __getattr__(self, name: str) -> Any:
        method = getattr(self.client, name)

        def call(**kwargs: Any) -> Any:
            if name == self.before_on and self.before is not None:
                hook, self.before = self.before, None
                hook()
            if name == "transact_write_items":
                self.transactions += 1
            try:
                return method(**kwargs)
            except ClientError as error:
                if name in ("transact_write_items", "update_item"):
                    self.refusals.append(normalise(error.response))
                raise

        return call


class _Body:
    def __init__(self, data: bytes) -> None:
        self._stream = io.BytesIO(data)

    def read(self, size: int = -1) -> bytes:
        return self._stream.read(size)


class RepoS3:
    """Serves the repository's game-data files as the site bucket would."""

    def get_object(self, Bucket: str, Key: str) -> dict[str, Any]:  # boto3's argument names
        return {"Body": _Body((REPO / Key).read_bytes())}


def _bounds(ruleset: str, campaign: str) -> dict[str, Any]:
    if (ruleset, campaign) != ("r1", "luna-1-c1"):
        raise BoundsUnavailable("no such pair")
    path = REPO / "contracts" / "fixtures" / "bounds" / "r1__luna-1-c1.json"
    return parse_bounds(json.loads(path.read_text()), ruleset, campaign)


class Harness:
    def __init__(self, client: Any, game: str, content: str, event: dict[str, Any]) -> None:
        self.client = client
        self.game = game
        self.recorder = Recorder(client)
        self.event = event
        self.sub = event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]
        self.pk = f"U#{self.sub}"
        bank = json.loads((FIXTURES / "content" / "m1-bank.json").read_text())["items"]
        for item in bank:
            client.put_item(TableName=content, Item={k: _SERIALISE(v) for k, v in item.items()})
        deps = player_api.Deps(
            now=lambda: NOW,
            game=lambda: DynamoTable(self.recorder, game),
            game_data=lambda: GameDataReader(bucket="site", prefix="game-data/", s3=RepoS3()),
            bounds=_bounds,
            content=lambda: DynamoTable(client, content),
            seed=lambda: "00000000000000a1",
            sleep=lambda seconds: None,
            random=lambda: 0.5,
        )
        self.router = player_api.make_router(deps)

    def call(self, route_key: str, body: dict[str, Any]) -> tuple[int, Any]:
        event = copy.deepcopy(self.event)
        event["routeKey"] = route_key
        event["requestContext"]["routeKey"] = route_key
        event["body"] = json.dumps(body)
        response = self.router.handle(event)
        return response["statusCode"], json.loads(response["body"]) if response["body"] else None

    def put(self, sk: str, **fields: Any) -> None:
        item = {"pk": self.pk, "sk": sk, **fields}
        self.client.put_item(TableName=self.game, Item={k: _SERIALISE(v) for k, v in item.items()})

    def delete(self, sk: str) -> None:
        self.client.delete_item(TableName=self.game, Key={"pk": {"S": self.pk}, "sk": {"S": sk}})

    def get(self, sk: str) -> dict[str, Any] | None:
        return DynamoTable(self.client, self.game).get_item(self.pk, sk)

    def profile(self) -> None:
        body = {"nickname": "Star Kid", "avatarId": "avatar-03", "dob": "2021-06-01"}  # made up
        assert self.call("PUT /api/me/profile", body)[0] == 200


def create_body(run_id: str = RUN_A, session_id: str = MY_SESSION, **changes: Any) -> dict[str, Any]:
    return {
        "runId": run_id,
        "planetId": "luna-1",
        "waveSetId": "first-contact",
        "rulesetVersion": "r1",
        "campaignVersion": "luna-1-c1",
        "sessionId": session_id,
        "deviceLabel": "Kitchen laptop",
        **changes,
    }


OTHER_HOLDER = {
    "generation": 1,
    "sessionId": OTHER_SESSION,
    "runId": RUN_B,
    "leaseExpiresAt": "2026-11-20T10:02:30Z",
    "released": False,
    "deviceLabel": "Bedroom tablet",
    "lastRenewedAt": "2026-11-20T09:59:30Z",
}


# --- Scenarios: plain functions of a Harness, so the same steps record the files from any DynamoDB --------------------


def scenario_created_and_replayed(h: Harness) -> None:
    h.profile()
    status, created = h.call("POST /api/runs", create_body())
    assert status == 201
    assert h.get(f"RUN#{RUN_A}") is not None and h.get(f"SLOT#{RUN_A}#N-001") is not None
    assert h.get("SESSION")["generation"] == 1
    status, replayed = h.call("POST /api/runs", create_body())
    assert status == 200 and replayed["run"] == created["run"]
    assert h.recorder.transactions == 1


def scenario_session_held_elsewhere(h: Harness) -> dict[str, Any]:
    h.profile()
    h.recorder.before = lambda: h.put("SESSION", **OTHER_HOLDER)
    status, body = h.call("POST /api/runs", create_body())
    assert status == 409 and body["error"]["code"] == "ACTIVE_SESSION_ELSEWHERE"
    assert body["error"]["details"] == {"retryAfterSeconds": 150, "deviceLabel": "Bedroom tablet"}
    assert h.get(f"RUN#{RUN_A}") is None and h.get(f"SLOT#{RUN_A}#N-001") is None
    return h.recorder.refusals[0]


def scenario_run_exists(h: Harness) -> dict[str, Any]:
    h.profile()
    winner: list[tuple[int, Any]] = []
    h.recorder.before = lambda: winner.append(h.call("POST /api/runs", create_body()))
    status, body = h.call("POST /api/runs", create_body())
    assert winner[0][0] == 201 and status == 200 and body["run"] == winner[0][1]["run"]
    return h.recorder.refusals[0]


def scenario_profile_missing(h: Harness) -> dict[str, Any]:
    h.profile()
    h.recorder.before = lambda: h.delete("PROFILE")
    status, body = h.call("POST /api/runs", create_body())
    assert status == 404 and body["error"]["code"] == "PROFILE_NOT_FOUND"
    assert h.get(f"RUN#{RUN_A}") is None and h.get("SESSION") is None
    return h.recorder.refusals[0]


def scenario_claim_refused(h: Harness) -> dict[str, Any]:
    """R13 claim: (1) same holder fails, (2) takeover fails; the old item comes back on the UpdateItem error."""
    h.profile()
    assert h.call("POST /api/runs", create_body())[0] == 201
    h.put("SESSION", **OTHER_HOLDER)
    claim = {"mode": "claim", "runId": RUN_A, "sessionId": MY_SESSION, "deviceLabel": "Kitchen laptop"}
    status, body = h.call("PUT /api/session", claim)
    assert status == 409 and body["error"]["code"] == "ACTIVE_SESSION_ELSEWHERE"
    return h.recorder.refusals[-1]


SCENARIOS: dict[str, Callable[[Harness], dict[str, Any]]] = {
    "g7-session-held-elsewhere": scenario_session_held_elsewhere,
    "g7-run-exists": scenario_run_exists,
    "g7-profile-missing": scenario_profile_missing,
    "session-claim-refused": scenario_claim_refused,
}


# --- The ddblocal tests ---------------------------------------------------------------------------------------------


@pytest.fixture
def content_table(ddb_local: Any) -> Iterator[str]:
    name = f"g13c-{os.urandom(6).hex()}"
    ddb_local.create_table(
        TableName=name,
        AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"},
                              {"AttributeName": "sk", "AttributeType": "S"}],
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        BillingMode="PAY_PER_REQUEST",
    )  # fmt: skip
    ddb_local.get_waiter("table_exists").wait(TableName=name, WaiterConfig={"Delay": 1, "MaxAttempts": 10})
    yield name
    ddb_local.delete_table(TableName=name)


@pytest.fixture
def harness(ddb_local: Any, table: str, content_table: str) -> Harness:
    event = json.loads((FIXTURES / "authorizer" / "player-event.json").read_text())
    return Harness(ddb_local, table, content_table, event)


@pytest.mark.ddblocal
def test_g7_creates_the_run_in_one_transaction_and_a_repeat_returns_it(harness: Harness) -> None:
    scenario_created_and_replayed(harness)


@pytest.mark.ddblocal
@pytest.mark.parametrize("name", sorted(SCENARIOS))
def test_refusal_is_classified_and_matches_the_recorded_shape(harness: Harness, name: str) -> None:
    observed = SCENARIOS[name](harness)
    check_recorded(name, observed, source="DynamoDB Local (CI service container, see .github/workflows/ci.yml)")
