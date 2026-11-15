"""Profile rules: body validation for PUT/PATCH /api/me/profile and the age derived from the date of birth
(plan G §3 R3/R4, spine S2 and S9.5, F §10.1 `ageBand`, I §I.3.1 AC-06).

Age is completed years on today's date **in Europe/London**, not in UTC. Between late March and late October London is
an hour ahead of UTC, so 23:30 UTC on the eve of a summer birthday is already the birthday (00:30 BST). "Now" is always
passed in (`today_in_london(now)`), never read from the system clock here, so a test can stand on any date.

A child born on 29 February turns a year older on 1 March in a non-leap year: (2, 28) < (2, 29) in `age_on`.

The date of birth is write-only (spine S2). This module turns it into an age and nothing else; no function here returns
or formats it, and validation problems name the field and the rule, never the value (G §1.2).
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from shared.errors import ApiError
from shared.rules.contracts import LIMITS

# tzdata is bundled in the Lambda zip (api/requirements.txt), so this loads even if the runtime has no system zone files
# (AC-06 case 6). Loaded at import: a missing zone fails the cold start loudly instead of answering with a wrong age.
LONDON = ZoneInfo("Europe/London")

NICKNAME_MIN: int = LIMITS["nickname"]["minLength"]
NICKNAME_MAX: int = LIMITS["nickname"]["maxLength"]
NICKNAME = re.compile(LIMITS["nickname"]["pattern"].removesuffix("$") + r"\Z")
AVATAR_IDS: frozenset[str] = frozenset(LIMITS["avatarIds"])
DOB_PATTERN = re.compile(LIMITS["dob"]["pattern"].removesuffix("$") + r"\Z")
DOB_MAX_AGE_YEARS: int = LIMITS["dob"]["maxAgeYears"]
AGE_BANDS: frozenset[int] = frozenset(LIMITS["ageBands"])

FIELDS = ("nickname", "avatarId", "dob")


class CorruptProfile(Exception):
    """A stored PROFILE whose date of birth cannot be read. The message never carries the stored value."""


def today_in_london(now: datetime) -> date:
    """The calendar date in Europe/London at the instant `now` (which must carry a time zone)."""
    if now.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    return now.astimezone(LONDON).date()


def age_on(dob: date, today: date) -> int:
    """Completed years from `dob` to `today`."""
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def age_band(age: int) -> int | None:
    """5, 6 or 7, or None when the age is outside the bands (G §3 R1)."""
    return age if age in AGE_BANDS else None


def _years_before(today: date, years: int) -> date:
    try:
        return today.replace(year=today.year - years)
    except ValueError:  # 29 February in a year that has none
        return today.replace(year=today.year - years, day=28)


def stored_age(profile: Mapping[str, Any], today: date) -> int:
    """The age from a stored PROFILE item's `dob`."""
    value = profile.get("dob")
    if not isinstance(value, str) or not DOB_PATTERN.match(value):
        raise CorruptProfile("PROFILE.dob is missing or malformed")
    try:
        dob = date.fromisoformat(value)
    except ValueError:
        raise CorruptProfile("PROFILE.dob is not a calendar date") from None
    return age_on(dob, today)


def _dob_rule(value: Any, today: date) -> str | None:
    if not isinstance(value, str):
        return "type"
    if not DOB_PATTERN.match(value):
        return "pattern"
    try:
        dob = date.fromisoformat(value)
    except ValueError:
        return "date"  # 2020-02-30, 2020-13-01
    if dob > today:
        return "not_future"
    if dob < _years_before(today, DOB_MAX_AGE_YEARS):
        return "max_age"
    return None


def _nickname(value: Any) -> tuple[str | None, str | None]:
    if not isinstance(value, str):
        return None, "type"
    trimmed = value.strip()
    if len(trimmed) < NICKNAME_MIN:
        return None, "minLength"
    if len(trimmed) > NICKNAME_MAX:
        return None, "maxLength"
    if not NICKNAME.match(trimmed):
        return None, "pattern"
    return trimmed, None


def validate_profile(body: Mapping[str, Any], *, partial: bool, today: date) -> dict[str, str]:
    """The fields to write, from a PUT (`partial=False`: all three required) or PATCH (`partial=True`: any non-empty
    subset) body. Raises ApiError VALIDATION_FAILED listing every problem as {field, rule}.

    An unknown key is reported as field `body`, rule `additionalProperties`: the key itself was typed by the caller, so
    it is not echoed either.
    """
    problems: list[dict[str, str]] = []
    if any(key not in FIELDS for key in body):
        problems.append({"field": "body", "rule": "additionalProperties"})
    if partial and not any(key in body for key in FIELDS):
        problems.append({"field": "body", "rule": "minProperties"})

    clean: dict[str, str] = {}
    for field in FIELDS:
        if field not in body:
            if not partial:
                problems.append({"field": field, "rule": "required"})
            continue
        value = body[field]
        if field == "nickname":
            nickname, rule = _nickname(value)
            if nickname is not None:
                clean[field] = nickname
        elif field == "avatarId":
            rule = "type" if not isinstance(value, str) else None if value in AVATAR_IDS else "enum"
            if rule is None:
                clean[field] = value
        else:
            rule = _dob_rule(value, today)
            if rule is None:
                clean[field] = value
        if rule is not None:
            problems.append({"field": field, "rule": rule})

    if problems:
        raise ApiError("VALIDATION_FAILED", details=problems)
    return clean
