"""Staff memberships and invitations in the tenancy table (DAT-3; ADR-0046, ADR-0048; 04 §5.1; 10 §2.4).

The items, all strongly consistent to read (anything that decides access is a GetItem on the base table, 10 §2.4):

- `SCH#<schoolId>` / `INVITE#<email>`: an invitation, with access level, billing flag, who invited and when. It works
  for 7 days (`expiresAt`, SCH-Q10); TTL removes the item after 14 (`ttl`).
- `EMAIL#<email>` / `SCH#<schoolId>`: the email pointer, `invited` (with the invitation's `expiresAt`), `active` or
  `removed`. A second invitation of an email that is active, or holds a live invitation, in the school is refused; a
  removed one, or one whose invitation expired, can be invited again.
- `SCH#<schoolId>` / `MEMBER#<sub>`: the membership, made when the invitation is accepted, with access level (`admin`,
  `teacher`, `readonly` or `none`), billing flag and status `active` or `removed`. Listed by person through gsi1
  (`SUB#<sub>` / `SCH#<schoolId>`).
- `SCH#<schoolId>` / `PROFILE`: the school. `activeAdmins` counts its active Admins, so the last one can never be
  removed (LAST_ADMIN, 04 §5.2), even by two removals at once.

The transitions are invited -> active -> removed, each one TransactWriteItems. This module holds the data rules; the
Cognito half of an invitation (the user and the email) is built with staff sign-in in PS5.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from typing import Any

from botocore.exceptions import ClientError

from shared.data import DynamoTable, cancellation_reasons

ACCESS_LEVELS = ("admin", "teacher", "readonly", "none")
ADMIN = "admin"

INVITED = "invited"
ACTIVE = "active"
REMOVED = "removed"

INVITATION_WORKS_FOR = timedelta(days=7)  # SCH-Q10
INVITATION_KEPT_FOR = timedelta(days=14)  # 10 §2.4: the item's TTL

PROFILE_SK = "PROFILE"

# A plain check, not RFC 5322: one @, no spaces, a dot in the domain. Cognito checks the address when it sends.
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class MembershipError(Exception):
    """A refused transition. `code` is one of ALREADY_INVITED, NOT_INVITED, INVITATION_EXPIRED, NOT_A_MEMBER,
    LAST_ADMIN; the routes built on this module answer with it (10 §3.3)."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def school_pk(school_id: str) -> str:
    return f"SCH#{school_id}"


def normalise_email(email: str) -> str:
    """The address as stored and compared: trimmed and lower-case. Raises ValueError for something that is not one."""
    address = email.strip().lower()
    if len(address) > 254 or not _EMAIL.match(address):
        raise ValueError("not an email address")
    return address


def invite(
    table: DynamoTable,
    school_id: str,
    email: str,
    access_level: str,
    billing: bool,
    invited_by: str,
    now: datetime,
) -> dict[str, Any]:
    """Write the invitation and its email pointer together. Returns the invitation item.
    Raises MembershipError("ALREADY_INVITED") if the email is already invited to or active in this school."""
    if access_level not in ACCESS_LEVELS:
        raise ValueError(f"unknown access level {access_level!r}")
    address = normalise_email(email)
    invitation = {
        "pk": school_pk(school_id),
        "sk": f"INVITE#{address}",
        "email": address,
        "accessLevel": access_level,
        "billing": billing,
        "invitedBy": invited_by,
        "invitedAt": _iso(now),
        "expiresAt": _iso(now + INVITATION_WORKS_FOR),
        "ttl": int((now + INVITATION_KEPT_FOR).timestamp()),
    }
    pointer = {
        "pk": f"EMAIL#{address}",
        "sk": school_pk(school_id),
        "status": INVITED,
        "expiresAt": invitation["expiresAt"],
    }
    try:
        table.transact_write(
            [
                # An expired invitation item may linger until its TTL; a new one replaces it. A live one refuses.
                table.put_action(
                    invitation,
                    condition="attribute_not_exists(#pk) OR #expiresAt <= :now",
                    names={"#pk": "pk", "#expiresAt": "expiresAt"},
                    values={":now": _iso(now)},
                ),
                # The pointer refuses an email that is active here or holds a live invitation; a removed one, or one
                # whose invitation expired unused, can be invited again.
                table.put_action(
                    pointer,
                    condition=(
                        "attribute_not_exists(#pk) OR #status = :removed OR (#status = :invited AND #expiresAt <= :now)"
                    ),
                    names={"#pk": "pk", "#status": "status", "#expiresAt": "expiresAt"},
                    values={":removed": REMOVED, ":invited": INVITED, ":now": _iso(now)},
                ),
            ]
        )
    except ClientError as error:
        if _failed(error, index=0) or _failed(error, index=1):
            raise MembershipError("ALREADY_INVITED") from error
        raise
    return invitation


def accept_invitation(table: DynamoTable, school_id: str, email: str, sub: str, now: datetime) -> dict[str, Any]:
    """Turn the invitation for `email` into an active membership for `sub` (first sign-in, 04 §4.1). Returns it.
    Raises MembershipError: NOT_INVITED (no invitation), INVITATION_EXPIRED (older than 7 days)."""
    address = normalise_email(email)
    invitation = table.get_item(school_pk(school_id), f"INVITE#{address}")
    if invitation is None:
        raise MembershipError("NOT_INVITED")
    if invitation["expiresAt"] <= _iso(now):
        raise MembershipError("INVITATION_EXPIRED")
    member = {
        "pk": school_pk(school_id),
        "sk": f"MEMBER#{sub}",
        "email": address,
        "accessLevel": invitation["accessLevel"],
        "billing": invitation["billing"],
        "status": ACTIVE,
        "joinedAt": _iso(now),
        "invitedBy": invitation["invitedBy"],
        "gsi1pk": f"SUB#{sub}",
        "gsi1sk": school_pk(school_id),
    }
    actions = [
        # The invitation is used up, and only if it is the one just read and still in date.
        table.delete_action(
            school_pk(school_id),
            f"INVITE#{address}",
            condition="attribute_exists(#pk) AND #expiresAt > :now AND #invitedAt = :invitedAt",
            names={"#pk": "pk", "#expiresAt": "expiresAt", "#invitedAt": "invitedAt"},
            values={":now": _iso(now), ":invitedAt": invitation["invitedAt"]},
        ),
        table.put_action(member, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
        table.update_action(
            f"EMAIL#{address}",
            school_pk(school_id),
            update="SET #status = :active, #sub = :sub REMOVE #expiresAt",
            names={"#status": "status", "#sub": "sub", "#expiresAt": "expiresAt"},
            values={":active": ACTIVE, ":sub": sub, ":invited": INVITED},
            condition="#status = :invited",
        ),
    ]
    if member["accessLevel"] == ADMIN:
        actions.append(_count_admins(table, school_id, +1))
    try:
        table.transact_write(actions)
    except ClientError as error:
        if _failed(error, index=0):
            raise MembershipError("INVITATION_EXPIRED") from error
        raise
    return member


def active_membership(table: DynamoTable, school_id: str, sub: str) -> dict[str, Any] | None:
    """The caller's membership of the school if it is active, else None: one strongly consistent GetItem, never cached
    (04 §5.3 check 5). The tenancy checks answer NOT_A_MEMBER for None."""
    item = table.get_item(school_pk(school_id), f"MEMBER#{sub}")
    return item if item is not None and item.get("status") == ACTIVE else None


def remove_member(table: DynamoTable, school_id: str, sub: str, removed_by: str, now: datetime) -> None:
    """Remove an active member: the membership stays, marked removed, and the email pointer frees the address for a
    later invitation. Raises MembershipError: NOT_A_MEMBER, or LAST_ADMIN for the school's last active Admin."""
    member = active_membership(table, school_id, sub)
    if member is None:
        raise MembershipError("NOT_A_MEMBER")
    actions = [
        table.update_action(
            school_pk(school_id),
            f"MEMBER#{sub}",
            update="SET #status = :removed, #removedAt = :at, #removedBy = :by",
            names={"#status": "status", "#removedAt": "removedAt", "#removedBy": "removedBy"},
            values={":removed": REMOVED, ":at": _iso(now), ":by": removed_by, ":active": ACTIVE},
            condition="#status = :active",
        ),
        table.update_action(
            f"EMAIL#{member['email']}",
            school_pk(school_id),
            update="SET #status = :removed",
            names={"#status": "status", "#sub": "sub"},
            values={":removed": REMOVED, ":sub": sub},
            condition="#sub = :sub",
        ),
    ]
    if member["accessLevel"] == ADMIN:
        actions.append(_count_admins(table, school_id, -1))
    try:
        table.transact_write(actions)
    except ClientError as error:
        if member["accessLevel"] == ADMIN and _failed(error, index=2):
            raise MembershipError("LAST_ADMIN") from error
        if _failed(error, index=0):
            raise MembershipError("NOT_A_MEMBER") from error  # removed by someone else in the meantime
        raise


def _count_admins(table: DynamoTable, school_id: str, change: int) -> dict[str, Any]:
    """Add `change` to the school's active Admin count. Taking one away needs at least two, so the last Admin stays."""
    if change > 0:
        return table.update_action(
            school_pk(school_id),
            PROFILE_SK,
            update="ADD #admins :change",
            names={"#pk": "pk", "#admins": "activeAdmins"},
            values={":change": change},
            condition="attribute_exists(#pk)",
        )
    return table.update_action(
        school_pk(school_id),
        PROFILE_SK,
        update="ADD #admins :change",
        names={"#admins": "activeAdmins"},
        values={":change": change, ":two": 2},
        condition="#admins >= :two",
    )


def _failed(error: ClientError, index: int) -> bool:
    """Whether action `index` of a cancelled transaction failed its condition."""
    reasons = cancellation_reasons(error)
    return bool(reasons) and len(reasons) > index and reasons[index].code == "ConditionalCheckFailed"


def summary(item: Mapping[str, Any]) -> dict[str, Any]:
    """The membership fields a route may return about the caller (no keys, no gsi attributes)."""
    return {k: item[k] for k in ("email", "accessLevel", "billing", "status", "joinedAt") if k in item}
