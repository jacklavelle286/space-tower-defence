"""Level drafts racing (Gate M, LD3): two saves of the same draft revision sent at once, against DynamoDB Local, so
the revision condition is checked by a real conditional transaction. Exactly one lands; the other is 409
DRAFT_CONFLICT, and the draft holds the winner's body. Runs in CI only; see conftest.py."""

from __future__ import annotations

import json
import threading
from datetime import UTC, datetime
from typing import Any

import pytest

from shared.auth import Caller
from shared.data import DynamoTable
from shared.errors import ApiError
from shared.level_admin import make_level_handlers
from shared.router import Request

SUB = "a6c2b2b4-7051-70ef-b1e8-739ac38dd0cb"


def level(name: str) -> dict[str, Any]:
    return {
        "kind": "level",
        "schema": 1,
        "levelId": "race",
        "name": name,
        "map": {
            "name": name,
            "grid": {"cols": 20, "rows": 11},
            "route": [[0, 5], [19, 5]],
            "pads": [{"id": "race-p01", "x": 1, "y": 3, "opensAfterWave": 0}],
            "art": {"backdrop": None, "decorations": []},
        },
        "challengeWaves": {},
        "waveSets": {},
    }


def request(route: str, body: Any) -> Request:
    event = {"pathParameters": {"id": "race"}, "body": json.dumps(body)}
    return Request(event=event, caller=Caller(SUB, route, "operator", frozenset({"admin"})), request_id="r")


def handlers(content: DynamoTable) -> dict[str, Any]:
    def transact(table: DynamoTable, actions: list[dict[str, Any]]) -> list[str] | None:
        try:
            table.transact_write(actions)
            return None
        except Exception:  # noqa: BLE001 - a refused condition is all this test needs to see
            return ["ConditionalCheckFailed"]

    def page(items: list[dict[str, Any]], key: str, _request: Request) -> dict[str, Any]:
        return {"items": sorted(items, key=lambda i: i[key]), "nextCursor": None}

    return make_level_handlers(
        table=lambda: content, now=lambda: datetime(2026, 11, 20, tzinfo=UTC), transact=transact, page=page
    )


@pytest.mark.ddblocal
def test_two_saves_of_one_revision_one_wins(ddb_local: Any, table: str) -> None:
    routes = handlers(DynamoTable(ddb_local, table))
    created = routes["POST /api/admin/levels"](request("POST /api/admin/levels", {"level": level("Race")}))
    assert created["statusCode"] == 201

    outcomes: list[str] = []
    start = threading.Barrier(2)

    def save(name: str) -> None:
        start.wait()
        try:
            routes["PUT /api/admin/levels/{id}/draft"](request("PUT", {"draftRevision": 0, "level": level(name)}))
            outcomes.append(f"saved {name}")
        except ApiError as error:
            outcomes.append(error.code)

    threads = [threading.Thread(target=save, args=(n,)) for n in ("Left", "Right")]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(o.split()[0] for o in outcomes) == ["DRAFT_CONFLICT", "saved"]
    winner = next(o.split()[1] for o in outcomes if o.startswith("saved"))
    got = routes["GET /api/admin/levels/{id}"](request("GET", None))
    view = json.loads(got["body"])
    assert view["draft"]["draftRevision"] == 1 and view["draft"]["level"]["name"] == winner
