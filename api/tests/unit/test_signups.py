"""The SYS#SIGNUPS conditional counter on moto (spine S1.2).

Each test below fails if the condition expression is wrong:
- `#count <= :cap` instead of `<`: test_cap_is_exact lets a third sign-up through at cap 2;
- the condition left out: test_cap_is_exact and test_cap_one;
- `attribute_exists(#count) AND ...` (or a missing first-day clause): test_first_sign_up_of_the_day fails;
- the wrong key (one item for all days): test_each_day_has_its_own_allowance fails.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest
from conftest import TABLE

from shared.data import DynamoTable
from shared.signups import SIGNUPS_PK, SignUpCapReached, count_signup, expiry_epoch

DAY = date(2026, 11, 15)


def _item(ddb: Any, day: date) -> dict | None:
    return DynamoTable(ddb, TABLE).get_item(SIGNUPS_PK, day.isoformat())


def test_first_sign_up_of_the_day(ddb: Any) -> None:
    assert count_signup(DynamoTable(ddb, TABLE), DAY, cap=20) == 1
    assert _item(ddb, DAY) == {"pk": "SYS#SIGNUPS", "sk": "2026-11-15", "count": 1, "ttl": expiry_epoch(DAY)}


def test_cap_is_exact(ddb: Any) -> None:
    table = DynamoTable(ddb, TABLE)
    assert [count_signup(table, DAY, cap=2) for _ in range(2)] == [1, 2]

    with pytest.raises(SignUpCapReached):
        count_signup(table, DAY, cap=2)
    assert _item(ddb, DAY)["count"] == 2  # the refused sign-up wrote nothing


def test_cap_one(ddb: Any) -> None:
    table = DynamoTable(ddb, TABLE)
    count_signup(table, DAY, cap=1)
    with pytest.raises(SignUpCapReached):
        count_signup(table, DAY, cap=1)


def test_cap_zero_closes_sign_up_without_writing(ddb: Any) -> None:
    with pytest.raises(SignUpCapReached):
        count_signup(DynamoTable(ddb, TABLE), DAY, cap=0)
    assert _item(ddb, DAY) is None


def test_each_day_has_its_own_allowance(ddb: Any) -> None:
    table = DynamoTable(ddb, TABLE)
    count_signup(table, DAY, cap=1)
    assert count_signup(table, date(2026, 11, 16), cap=1) == 1


def test_lowering_the_cap_mid_day_refuses_at_once(ddb: Any) -> None:
    table = DynamoTable(ddb, TABLE)
    for _ in range(3):
        count_signup(table, DAY, cap=5)
    with pytest.raises(SignUpCapReached):
        count_signup(table, DAY, cap=3)


def test_ttl_is_three_days_after_the_day_starts() -> None:
    assert expiry_epoch(DAY) == 1794960000  # 2026-11-18T00:00:00Z
