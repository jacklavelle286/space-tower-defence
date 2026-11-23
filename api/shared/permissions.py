"""School permissions (DAT-7; 04 §5.1-5.2; 01 §3.1; PQ-8: roles are bundles of permissions, and code checks
permissions, never role names).

contracts/permissions.json holds every permission and five bundles: one per access level (`admin`, `teacher`,
`readonly`, `none`) and `billing`, for the billing flag. A membership's grants are its access level's bundle plus, with
the billing flag, the billing bundle. Each grant has a scope:

- `all`: the whole school;
- `own`: the teacher's own classes (the class's `teacherSub` is the caller), and for pupils, pupils in those classes.

Where both bundles grant a permission, `all` wins. Every route from R63 names one permission in contracts/routes.json;
the tenancy checks (04 §5.3, check 6) refuse a member without it, and check 7 applies `own`.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any

from shared.rules.contracts import CONTRACTS_DIR

ALL = "all"
OWN = "own"
SCOPES = (ALL, OWN)
ACCESS_LEVELS = ("admin", "teacher", "readonly", "none")
BILLING = "billing"


def _load() -> tuple[dict[str, str], dict[str, dict[str, str]]]:
    data = json.loads((CONTRACTS_DIR / "permissions.json").read_text(encoding="utf-8"))
    permissions: dict[str, str] = data["permissions"]
    bundles: dict[str, dict[str, str]] = data["bundles"]
    if set(bundles) != {*ACCESS_LEVELS, BILLING}:
        expected = [*ACCESS_LEVELS, BILLING]
        raise ValueError(f"contracts/permissions.json: bundles must be {expected}, not {sorted(bundles)}")
    for name, grants in bundles.items():
        unknown = set(grants) - set(permissions)
        if unknown:
            raise ValueError(f"contracts/permissions.json: bundle {name} grants unknown {sorted(unknown)}")
        if any(scope not in SCOPES for scope in grants.values()):
            raise ValueError(f"contracts/permissions.json: bundle {name} has a scope that is not all or own")
    return permissions, bundles


PERMISSIONS, BUNDLES = _load()
"""Every permission (name -> what it covers) and the five bundles. Treat as read-only."""


def grants(access_level: str, billing: bool) -> dict[str, str]:
    """Permission -> scope for a membership with this access level and billing flag."""
    if access_level not in ACCESS_LEVELS:
        raise ValueError(f"unknown access level {access_level!r}")
    result = dict(BUNDLES[access_level])
    if billing:
        for name, scope in BUNDLES[BILLING].items():
            if result.get(name) != ALL:
                result[name] = scope
    return result


def scope(member: Mapping[str, Any], permission: str) -> str | None:
    """The scope `member` (a membership item) holds `permission` with: `all`, `own`, or None for not at all."""
    if permission not in PERMISSIONS:
        raise ValueError(f"unknown permission {permission!r}")
    return grants(str(member.get("accessLevel")), bool(member.get("billing"))).get(permission)
