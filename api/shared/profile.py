"""Profile rules: body validation for PUT/PATCH /api/me/profile, and the question band a profile plays (plan G §3
R3/R4, spine S2 and S9.5, F §10.1 `ageBand`, I §I.3.1 AC-06; YG1).

The band (YG1, owner 2026-11-28). A profile's `schoolYear` (0 Reception ... 5 Year 5) picks its questions: band =
school year + `schoolYears.firstBand` (5) in contracts/limits.json, so Reception, Year 1 and Year 2 are bands 5, 6 and
7, the bands that were ages 5, 6 and 7 before. A game on Hard plays the band above. A profile made before YG1 has a
date of birth and no school year: its age, when 5, 6 or 7, is its band as before, until the school year is set.

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
from decimal import Decimal
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
SCHOOL_YEAR_NAMES: tuple[str, ...] = tuple(LIMITS["schoolYears"]["names"])
FIRST_BAND: int = LIMITS["schoolYears"]["firstBand"]
LEGACY_AGE_BANDS = frozenset({5, 6, 7})  # the age bands before YG1: a profile with only a date of birth
EASY = "EASY"
HARD = "HARD"
DIFFICULTIES = (EASY, HARD)

FIELDS = ("nickname", "avatarId", "dob", "schoolYear")
REQUIRED = ("nickname", "avatarId")  # PUT; and a school year or (from a player made before YG1) a date of birth


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


def school_year(profile: Mapping[str, Any]) -> int | None:
    """The profile's school year (0 Reception ... 5 Year 5), or None when it has none set."""
    value = profile.get("schoolYear")
    if isinstance(value, bool) or not isinstance(value, int | Decimal):
        return None
    year = int(value)
    return year if 0 <= year < len(SCHOOL_YEAR_NAMES) else None


def band_for(profile: Mapping[str, Any], today: date, difficulty: str = EASY) -> int | None:
    """The question band a game on `difficulty` plays, or None when the profile has no band (no school year, and no
    date of birth giving age 5, 6 or 7). Hard is the band above: the next school year's curriculum."""
    year = school_year(profile)
    if year is not None:
        base: int | None = FIRST_BAND + year
    elif profile.get("dob") is not None:
        age = stored_age(profile, today)
        base = age if age in LEGACY_AGE_BANDS else None
    else:
        base = None
    if base is None:
        return None
    band = base + (1 if difficulty == HARD else 0)
    return band if band in AGE_BANDS else None


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


def _school_year_rule(value: Any) -> str | None:
    if isinstance(value, bool) or not isinstance(value, int):
        return "type"
    return None if 0 <= value < len(SCHOOL_YEAR_NAMES) else "enum"


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


def validate_profile(body: Mapping[str, Any], *, partial: bool, today: date) -> dict[str, Any]:
    """The fields to write, from a PUT (`partial=False`: nickname and avatarId, and schoolYear or dob) or PATCH
    (`partial=True`: any non-empty subset) body. Raises ApiError VALIDATION_FAILED listing every problem as
    {field, rule}.

    An unknown key is reported as field `body`, rule `additionalProperties`: the key itself was typed by the caller, so
    it is not echoed either.
    """
    problems: list[dict[str, str]] = []
    if any(key not in FIELDS for key in body):
        problems.append({"field": "body", "rule": "additionalProperties"})
    if partial and not any(key in body for key in FIELDS):
        problems.append({"field": "body", "rule": "minProperties"})

    clean: dict[str, Any] = {}
    for field in FIELDS:
        if field not in body:
            if not partial and field in REQUIRED:
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
        elif field == "schoolYear":
            rule = _school_year_rule(value)
            if rule is None:
                clean[field] = value
        else:
            rule = _dob_rule(value, today)
            if rule is None:
                clean[field] = value
        if rule is not None:
            problems.append({"field": field, "rule": rule})

    if not partial and "schoolYear" not in body and "dob" not in body:
        problems.append({"field": "schoolYear", "rule": "required"})
    if problems:
        raise ApiError("VALIDATION_FAILED", details=problems)
    return clean
