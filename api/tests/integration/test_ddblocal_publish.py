"""The game-data publisher's DynamoDB transactions against DynamoDB Local (Gate M, LD6; ADR-0037): the version counter
and the PUB# claim in one transaction, and the V#, GDPUBLISH and AUDIT rows conditioned on not existing, under two
publishes at once. S3's conditional writes are covered on moto (tests/unit/test_gd_publish.py); here an in-memory store
with the same If-None-Match / If-Match rules stands in, and a fake check stamps the repository's luna-1-c2 document.
Runs in CI only; see conftest.py."""

from __future__ import annotations

import hashlib
import json
import threading
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import pytest

from shared.data import DynamoTable
from shared.gd_publish import Deps, Publisher, PublishRefused
from shared.levels import new_level_items

REPO = Path(__file__).resolve().parents[3]
LIVE = "luna-1-c2"
LIVE_BYTES = (REPO / "game-data" / "campaign" / f"{LIVE}.json").read_bytes()
BOUNDS_BYTES = (REPO / "contracts" / "fixtures" / "bounds" / f"r4__{LIVE}.json").read_bytes()
LEVEL = json.loads((REPO / "contracts" / "fixtures" / "levels" / "shapes.json").read_text(), parse_float=Decimal)[
    "valid"
]["challenge"]
AT = datetime(2026, 11, 20, 10, 0, 0, tzinfo=UTC)


class MemoryStore:
    """S3's conditional writes, in memory and thread-safe."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.lock = threading.Lock()

    def get(self, key: str) -> tuple[bytes, str] | None:
        with self.lock:
            body = self.objects.get(key)
            return None if body is None else (body, hashlib.md5(body).hexdigest())  # noqa: S324 - an ETag, as S3's

    def create(self, key: str, body: bytes, cache_control: str) -> bool:
        with self.lock:
            if key not in self.objects:
                self.objects[key] = body
                return True
            if self.objects[key] == body:
                return False
        raise PublishRefused("FILE_EXISTS", key)

    def replace(self, key: str, body: bytes, etag: str | None, cache_control: str) -> bool:
        with self.lock:
            now = self.objects.get(key)
            current = None if now is None else hashlib.md5(now).hexdigest()  # noqa: S324
            if current != etag:
                return False
            self.objects[key] = body
            return True


def check(payload: dict[str, Any]) -> dict[str, Any]:
    version = payload["version"]
    doc, bounds = json.loads(LIVE_BYTES), json.loads(BOUNDS_BYTES)
    doc["version"] = bounds["campaignVersion"] = version
    return {
        "ok": True,
        "problems": [],
        "findings": [],
        "planetJson": json.dumps(doc, indent=2) + "\n",
        "boundsJson": json.dumps(bounds, indent=2) + "\n",
        "boundsVersion": f"r4__{version}",
        "pictures": {"backdrops": [], "decorations": []},
        "waveSets": ["blob-parade"],
    }


def setup(ddb_local: Any, table: str) -> tuple[Publisher, DynamoTable, MemoryStore]:
    content = DynamoTable(ddb_local, table)
    store = MemoryStore()
    store.objects["game-data/ruleset/r4.json"] = (REPO / "game-data" / "ruleset" / "r4.json").read_bytes()
    store.objects[f"game-data/campaign/{LIVE}.json"] = LIVE_BYTES
    store.objects["game-data/current.json"] = json.dumps({"rulesetVersion": "r4", "campaignVersion": LIVE}).encode()
    for level_id in ("zigzag", "zigzag-two"):
        body = json.loads(json.dumps(LEVEL, default=float).replace('"zigzag', f'"{level_id}'), parse_float=Decimal)
        for item in new_level_items(level=body, by="op", at=AT):
            content.transact_write(
                [content.put_action(item, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})]
            )
    publisher = Publisher(Deps(table=content, site=store, check=check, frozen=lambda: False, now=lambda: AT))
    return publisher, content, store


def at_once(*calls: Any) -> list[Any]:
    start = threading.Barrier(len(calls))
    out: list[Any] = [None] * len(calls)

    def run(i: int) -> None:
        start.wait()
        try:
            out[i] = calls[i]()
        except PublishRefused as refusal:
            out[i] = refusal.code

    threads = [threading.Thread(target=run, args=(i,)) for i in range(len(calls))]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return out


@pytest.mark.ddblocal
def test_two_levels_published_at_once_get_different_versions(ddb_local: Any, table: str) -> None:
    publisher, content, store = setup(ddb_local, table)
    results = at_once(
        lambda: publisher.publish("zigzag", 0, LIVE, False, "op"),
        lambda: publisher.publish("zigzag-two", 0, LIVE, False, "op"),
    )
    versions = sorted(r["campaignVersion"] for r in results if isinstance(r, dict))  # the slower one read again
    assert versions == ["luna-1-a1", "luna-1-a2"]
    assert int(content.get_item("GDCOUNTER", "campaign#luna-1")["next"]) == 3
    assert {r["campaignVersion"] for r in content.query_prefix("GDPUBLISH", "")} == {"luna-1-a1", "luna-1-a2"}
    assert "game-data/campaign/luna-1-a2.json" in store.objects


@pytest.mark.ddblocal
def test_one_revision_published_twice_at_once_is_one_version(ddb_local: Any, table: str) -> None:
    publisher, content, _ = setup(ddb_local, table)
    results = at_once(
        lambda: publisher.publish("zigzag", 0, LIVE, True, "op"),
        lambda: publisher.publish("zigzag", 0, LIVE, True, "op"),
    )
    assert {r["campaignVersion"] for r in results if isinstance(r, dict)} == {"luna-1-a1"}
    assert len(content.query_prefix("GDPUBLISH", "")) == 1
    assert len(content.query_prefix("LEVEL#zigzag", "V#")) == 1
    assert int(content.get_item("GDCOUNTER", "campaign#luna-1")["next"]) == 2
