"""School slugs (DAT-2; ADR-0046; CON-Q2, DAT-Q8, PS0-6, CON-26).

A school's address is <slug>.spacecolonydefence.com. A slug:
- is 3 to 30 characters of lower-case letters, digits and single hyphens, starts with a letter and does not end with a
  hyphen (CON-Q2); so it is always a valid DNS label, and "xn--" (punycode) can never start one;
- is not reserved: the names in contracts/reserved-slugs.json, which the console reads too (PS0-6), plus any the owner
  adds in the console, which are kept as data and passed in as `extra_reserved` (CON-26).

Each slug has one lookup item in the tenancy table, pk `SLUG#<slug>`, sk `SLUG`, holding the school's ID. Enrolling a
school claims it with a conditional put in the same transaction as the school's profile, so two schools can never share
an address. Deleting a school retires its slug: the item stays as a tombstone with no school data, so the slug is never
reused and an old QR card or bookmark cannot reach another school (DAT-Q8).

`SlugResolver` maps a request's slug to a school ID for the tenancy checks (04 §5.3, check 3), keeping each answer for
60 seconds. A retired or unknown slug resolves to None.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Callable, Iterable
from typing import Any

from shared.data import DynamoTable
from shared.rules.contracts import CONTRACTS_DIR

SLUG_SK = "SLUG"
MIN_LENGTH = 3
MAX_LENGTH = 30
CACHE_SECONDS = 60.0

# A letter, then letters or digits, with single hyphens between runs: no leading, trailing or double hyphen.
_FORMAT = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$")

FORMAT = "FORMAT"
RESERVED = "RESERVED"


def _load_reserved() -> frozenset[str]:
    names = json.loads((CONTRACTS_DIR / "reserved-slugs.json").read_text(encoding="utf-8"))["reserved"]
    bad = [n for n in names if not isinstance(n, str) or n != n.strip().lower()]
    if bad:
        raise ValueError(f"contracts/reserved-slugs.json: names must be lower-case strings, not {bad}")
    return frozenset(names)


RESERVED_SLUGS: frozenset[str] = _load_reserved()
"""contracts/reserved-slugs.json: the baseline list (PS0-6). Treat as read-only."""


def problem(slug: str, extra_reserved: Iterable[str] = ()) -> str | None:
    """Why `slug` cannot be a school's address: FORMAT or RESERVED; None when it can (subject to the claim)."""
    if not MIN_LENGTH <= len(slug) <= MAX_LENGTH or not _FORMAT.match(slug):
        return FORMAT
    if slug in RESERVED_SLUGS or slug in {name.lower() for name in extra_reserved}:
        return RESERVED
    return None


def slug_pk(slug: str) -> str:
    return f"SLUG#{slug}"


def claim_action(table: DynamoTable, slug: str, school_id: str) -> dict[str, Any]:
    """The Put that claims `slug` for `school_id` inside the enrolment transaction (10 §2.4). It fails if the slug item
    exists at all, live or retired, so a slug is never given twice (DAT-Q8). Check `problem()` first."""
    if problem(slug) is not None:
        raise ValueError(f"not a valid slug: {slug!r}")
    return table.put_action(
        {"pk": slug_pk(slug), "sk": SLUG_SK, "schoolId": school_id},
        condition="attribute_not_exists(#pk)",
        names={"#pk": "pk"},
    )


def retire_action(table: DynamoTable, slug: str, school_id: str, retired_at: str) -> dict[str, Any]:
    """The Update that turns `slug` into a tombstone when its school is deleted: `retired` is set and the school ID is
    removed, so the item holds no school data (DAT-Q8). Only the school that holds the slug can retire it."""
    return table.update_action(
        slug_pk(slug),
        SLUG_SK,
        update="SET #retired = :true, #retiredAt = :at REMOVE #schoolId",
        names={"#retired": "retired", "#retiredAt": "retiredAt", "#schoolId": "schoolId"},
        values={":true": True, ":at": retired_at, ":school": school_id},
        condition="#schoolId = :school",
    )


class SlugResolver:
    """Slug -> school ID, each answer kept for `ttl` seconds (04 §5.3 check 3: "cached 60 s").

    One resolver lives as long as the Lambda environment, so a warm function reads each slug at most once a minute.
    A slug that is unknown, retired or malformed resolves to None (the chain answers 404 NOT_FOUND); None is cached
    too, so a stream of requests for a missing slug cannot hammer the table."""

    def __init__(self, table: DynamoTable, ttl: float = CACHE_SECONDS, clock: Callable[[], float] = time.monotonic):
        self._table = table
        self._ttl = ttl
        self._clock = clock
        self._cache: dict[str, tuple[str | None, float]] = {}

    def resolve(self, slug: str) -> str | None:
        now = self._clock()
        cached = self._cache.get(slug)
        if cached is not None and cached[1] > now:
            return cached[0]
        school_id = self._read(slug)
        self._cache[slug] = (school_id, now + self._ttl)
        return school_id

    def _read(self, slug: str) -> str | None:
        if problem(slug) == FORMAT:
            return None  # never a key we would have written; no read needed
        item = self._table.get_item(slug_pk(slug), SLUG_SK, attributes=["schoolId", "retired"])
        if item is None or item.get("retired"):
            return None
        school_id = item.get("schoolId")
        return school_id if isinstance(school_id, str) and school_id else None
