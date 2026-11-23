"""Staff memberships and invitations (DAT-3): invited -> active -> removed, duplicates refused, the last Admin kept."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from schools import TENANCY, create_tenancy_table

from shared import memberships as m
from shared.data import DynamoTable

SCHOOL = "s01JTEST"
NOW = datetime(2026, 11, 23, 9, 0, tzinfo=UTC)
ADMIN_SUB = "11111111-1111-4111-8111-111111111111"
TEACHER_SUB = "22222222-2222-4222-8222-222222222222"


@pytest.fixture
def tenancy(ddb: Any) -> DynamoTable:
    table = create_tenancy_table(ddb)
    ddb.put_item(TableName=TENANCY, Item={"pk": {"S": f"SCH#{SCHOOL}"}, "sk": {"S": "PROFILE"}})
    return table


def admins(table: DynamoTable) -> int:
    return int(table.get_item(f"SCH#{SCHOOL}", "PROFILE").get("activeAdmins", 0))


def test_invite_writes_the_invitation_and_its_pointer(tenancy: DynamoTable) -> None:
    m.invite(tenancy, SCHOOL, " Head@Example.ORG ", "admin", True, "owner", NOW)
    invitation = tenancy.get_item(f"SCH#{SCHOOL}", "INVITE#head@example.org")
    assert invitation["accessLevel"] == "admin" and invitation["billing"] is True
    assert invitation["expiresAt"] == "2026-11-30T09:00:00Z"  # works for 7 days (SCH-Q10)
    assert invitation["ttl"] == int((NOW + timedelta(days=14)).timestamp())  # the item goes after 14
    pointer = tenancy.get_item("EMAIL#head@example.org", f"SCH#{SCHOOL}")
    assert pointer["status"] == "invited" and pointer["expiresAt"] == "2026-11-30T09:00:00Z"


def test_a_second_live_invitation_is_refused(tenancy: DynamoTable) -> None:
    m.invite(tenancy, SCHOOL, "head@example.org", "admin", False, "owner", NOW)
    with pytest.raises(m.MembershipError) as error:
        m.invite(tenancy, SCHOOL, "HEAD@example.org", "teacher", False, "owner", NOW + timedelta(days=1))
    assert error.value.code == "ALREADY_INVITED"


def test_an_expired_invitation_can_be_sent_again(tenancy: DynamoTable) -> None:
    m.invite(tenancy, SCHOOL, "head@example.org", "admin", False, "owner", NOW)
    later = NOW + timedelta(days=8)
    m.invite(tenancy, SCHOOL, "head@example.org", "teacher", False, "owner", later)
    assert tenancy.get_item(f"SCH#{SCHOOL}", "INVITE#head@example.org")["accessLevel"] == "teacher"


def test_accepting_makes_an_active_membership_and_uses_up_the_invitation(tenancy: DynamoTable) -> None:
    m.invite(tenancy, SCHOOL, "head@example.org", "admin", True, "owner", NOW)
    member = m.accept_invitation(tenancy, SCHOOL, "head@example.org", ADMIN_SUB, NOW + timedelta(days=2))
    assert member["status"] == "active" and member["accessLevel"] == "admin" and member["billing"] is True
    assert member["gsi1pk"] == f"SUB#{ADMIN_SUB}" and member["gsi1sk"] == f"SCH#{SCHOOL}"
    assert tenancy.get_item(f"SCH#{SCHOOL}", "INVITE#head@example.org") is None
    pointer = tenancy.get_item("EMAIL#head@example.org", f"SCH#{SCHOOL}")
    assert pointer["status"] == "active" and pointer["sub"] == ADMIN_SUB and "expiresAt" not in pointer
    assert m.active_membership(tenancy, SCHOOL, ADMIN_SUB) is not None
    assert admins(tenancy) == 1


def test_an_invitation_older_than_7_days_cannot_be_accepted(tenancy: DynamoTable) -> None:
    m.invite(tenancy, SCHOOL, "head@example.org", "admin", False, "owner", NOW)
    with pytest.raises(m.MembershipError) as error:
        m.accept_invitation(tenancy, SCHOOL, "head@example.org", ADMIN_SUB, NOW + timedelta(days=7))
    assert error.value.code == "INVITATION_EXPIRED"
    assert m.active_membership(tenancy, SCHOOL, ADMIN_SUB) is None


def test_no_invitation_no_membership(tenancy: DynamoTable) -> None:
    with pytest.raises(m.MembershipError) as error:
        m.accept_invitation(tenancy, SCHOOL, "stranger@example.org", TEACHER_SUB, NOW)
    assert error.value.code == "NOT_INVITED"


def test_a_removed_member_is_not_active_and_can_be_invited_again(tenancy: DynamoTable) -> None:
    m.invite(tenancy, SCHOOL, "head@example.org", "admin", False, "owner", NOW)
    m.accept_invitation(tenancy, SCHOOL, "head@example.org", ADMIN_SUB, NOW)
    m.invite(tenancy, SCHOOL, "teacher@example.org", "teacher", False, ADMIN_SUB, NOW)
    m.accept_invitation(tenancy, SCHOOL, "teacher@example.org", TEACHER_SUB, NOW)
    m.remove_member(tenancy, SCHOOL, TEACHER_SUB, ADMIN_SUB, NOW + timedelta(days=30))
    assert m.active_membership(tenancy, SCHOOL, TEACHER_SUB) is None
    kept = tenancy.get_item(f"SCH#{SCHOOL}", f"MEMBER#{TEACHER_SUB}")
    assert kept["status"] == "removed" and kept["removedBy"] == ADMIN_SUB  # kept for the audit view (SCH-Q9)
    assert tenancy.get_item("EMAIL#teacher@example.org", f"SCH#{SCHOOL}")["status"] == "removed"
    m.invite(tenancy, SCHOOL, "teacher@example.org", "teacher", False, ADMIN_SUB, NOW + timedelta(days=31))


def test_the_last_active_admin_cannot_be_removed(tenancy: DynamoTable) -> None:
    m.invite(tenancy, SCHOOL, "head@example.org", "admin", False, "owner", NOW)
    m.accept_invitation(tenancy, SCHOOL, "head@example.org", ADMIN_SUB, NOW)
    with pytest.raises(m.MembershipError) as error:
        m.remove_member(tenancy, SCHOOL, ADMIN_SUB, "owner", NOW)
    assert error.value.code == "LAST_ADMIN"
    assert m.active_membership(tenancy, SCHOOL, ADMIN_SUB) is not None and admins(tenancy) == 1


def test_one_of_two_admins_can_be_removed(tenancy: DynamoTable) -> None:
    second = "33333333-3333-4333-8333-333333333333"
    for email, sub in (("head@example.org", ADMIN_SUB), ("deputy@example.org", second)):
        m.invite(tenancy, SCHOOL, email, "admin", False, "owner", NOW)
        m.accept_invitation(tenancy, SCHOOL, email, sub, NOW)
    assert admins(tenancy) == 2
    m.remove_member(tenancy, SCHOOL, second, ADMIN_SUB, NOW)
    assert admins(tenancy) == 1


def test_removing_someone_not_active_is_refused(tenancy: DynamoTable) -> None:
    with pytest.raises(m.MembershipError) as error:
        m.remove_member(tenancy, SCHOOL, TEACHER_SUB, ADMIN_SUB, NOW)
    assert error.value.code == "NOT_A_MEMBER"


@pytest.mark.parametrize("bad", ["", "no-at-sign", "two@@example.org", "space in@example.org", "x@nodot"])
def test_bad_email_addresses(bad: str) -> None:
    with pytest.raises(ValueError):
        m.normalise_email(bad)


def test_unknown_access_level_is_refused(tenancy: DynamoTable) -> None:
    with pytest.raises(ValueError):
        m.invite(tenancy, SCHOOL, "head@example.org", "superuser", False, "owner", NOW)
