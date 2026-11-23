"""School slugs (DAT-2): the format and reserved rules, the one-time claim, the tombstone and the 60 s resolver."""

from __future__ import annotations

import json
from typing import Any

import pytest
from botocore.exceptions import ClientError

from shared import slugs
from shared.data import DynamoTable, cancellation_reasons
from shared.rules.contracts import CONTRACTS_DIR

TABLE = "test-tenancy"


@pytest.fixture
def tenancy(ddb: Any) -> DynamoTable:
    ddb.create_table(
        TableName=TABLE,
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    return DynamoTable(ddb, TABLE)


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


@pytest.mark.parametrize("slug", ["abc", "example-primary", "st-marys2", "a1b", "a" * 30, "x-1"])
def test_good_slugs(slug: str) -> None:
    assert slugs.problem(slug) is None


@pytest.mark.parametrize(
    "slug",
    ["", "ab", "a" * 31, "1abc", "-abc", "abc-", "ab--c", "Abc", "ab_c", "ab c", "xn--abc", "école"],
)
def test_bad_format(slug: str) -> None:
    assert slugs.problem(slug) == slugs.FORMAT


@pytest.mark.parametrize("slug", ["admin", "www", "staff", "demo", "portal", "abuse", "postmaster"])
def test_reserved_names_from_both_lists(slug: str) -> None:
    # portal comes only from 03 §5, abuse and postmaster only from 05 §11.4: the file is their union (PS0-6).
    assert slugs.problem(slug) == slugs.RESERVED


def test_names_the_owner_adds_are_reserved_too() -> None:
    assert slugs.problem("springfield") is None
    assert slugs.problem("springfield", extra_reserved=["Springfield"]) == slugs.RESERVED


def test_the_contract_file_is_clean() -> None:
    names = json.loads((CONTRACTS_DIR / "reserved-slugs.json").read_text(encoding="utf-8"))["reserved"]
    assert names == sorted(set(names)), "sorted, no duplicates"
    assert all(name == name.lower() and "--" not in name for name in names)
    assert frozenset(names) == slugs.RESERVED_SLUGS


def claim(tenancy: DynamoTable, slug: str, school_id: str) -> None:
    tenancy.transact_write([slugs.claim_action(tenancy, slug, school_id)])


def test_a_slug_is_claimed_once(tenancy: DynamoTable) -> None:
    claim(tenancy, "example", "s1")
    assert tenancy.get_item("SLUG#example", "SLUG") == {"pk": "SLUG#example", "sk": "SLUG", "schoolId": "s1"}
    with pytest.raises(ClientError) as error:
        claim(tenancy, "example", "s2")
    reasons = cancellation_reasons(error.value)
    assert reasons is not None and reasons[0].code == "ConditionalCheckFailed"


def test_claim_refuses_a_malformed_slug(tenancy: DynamoTable) -> None:
    with pytest.raises(ValueError, match="not a valid slug"):
        slugs.claim_action(tenancy, "ab", "s1")


def test_a_retired_slug_is_a_tombstone_and_never_reused(tenancy: DynamoTable) -> None:
    claim(tenancy, "example", "s1")
    tenancy.transact_write([slugs.retire_action(tenancy, "example", "s1", "2026-11-23T10:00:00Z")])
    item = tenancy.get_item("SLUG#example", "SLUG")
    assert item == {"pk": "SLUG#example", "sk": "SLUG", "retired": True, "retiredAt": "2026-11-23T10:00:00Z"}
    with pytest.raises(ClientError):
        claim(tenancy, "example", "s2")  # DAT-Q8: never given again


def test_only_the_holding_school_can_retire_its_slug(tenancy: DynamoTable) -> None:
    claim(tenancy, "example", "s1")
    with pytest.raises(ClientError):
        tenancy.transact_write([slugs.retire_action(tenancy, "example", "s2", "2026-11-23T10:00:00Z")])
    assert tenancy.get_item("SLUG#example", "SLUG")["schoolId"] == "s1"


def test_resolver_maps_a_slug_to_its_school_and_keeps_the_answer_60_seconds(tenancy: DynamoTable) -> None:
    claim(tenancy, "example", "s1")
    clock = Clock()
    resolver = slugs.SlugResolver(tenancy, clock=clock)
    assert resolver.resolve("example") == "s1"
    tenancy.transact_write([slugs.retire_action(tenancy, "example", "s1", "2026-11-23T10:00:00Z")])
    clock.now += 59
    assert resolver.resolve("example") == "s1"  # still the cached answer
    clock.now += 2
    assert resolver.resolve("example") is None  # retired: the slug reaches no school


def test_resolver_answers_none_for_unknown_and_malformed_slugs(tenancy: DynamoTable) -> None:
    resolver = slugs.SlugResolver(tenancy, clock=Clock())
    assert resolver.resolve("nobody-here") is None
    assert resolver.resolve("Bad--Slug") is None
    claim(tenancy, "nobody-here", "s9")
    assert resolver.resolve("nobody-here") is None  # the miss is cached too, for at most 60 seconds
