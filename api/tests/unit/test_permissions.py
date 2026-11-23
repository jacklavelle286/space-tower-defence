"""School permissions (DAT-7): the bundles, the billing flag, the scopes, and the contract against 04 §5.2."""

from __future__ import annotations

import re

import pytest
from conftest import REPO

from shared import permissions as p


def test_admin_holds_every_permission_school_wide() -> None:
    assert p.grants("admin", billing=False) == dict.fromkeys(p.PERMISSIONS, p.ALL)


def test_teacher_works_in_their_own_classes() -> None:
    g = p.grants("teacher", billing=False)
    assert g["class.edit"] == p.OWN and g["pupil.enrol"] == p.OWN and g["progress.export"] == p.OWN
    assert g["class.create"] == p.ALL and g["school.view"] == p.ALL  # a new class becomes theirs
    for missing in ("staff.manage", "staff.view", "pupil.move", "billing.view", "counts.view", "audit.view"):
        assert missing not in g


def test_read_only_sees_everything_and_changes_nothing() -> None:
    g = p.grants("readonly", billing=False)
    assert set(g) == {"school.view", "staff.view", "class.view", "pupil.view", "progress.view", "progress.export",
                      "counts.view"}  # fmt: skip
    assert set(g.values()) == {p.ALL}


def test_billing_only_sees_billing_and_counts() -> None:
    g = p.grants("none", billing=True)
    assert set(g) == {"school.view", "counts.view", "billing.view", "billing.pay", "billing.manage"}
    assert "pupil.view" not in g


def test_the_billing_flag_adds_to_a_teacher() -> None:
    g = p.grants("teacher", billing=True)
    assert g["billing.pay"] == p.ALL and g["class.edit"] == p.OWN and g["counts.view"] == p.ALL


def test_no_access_level_and_no_billing_grants_nothing() -> None:
    assert p.grants("none", billing=False) == {}


def test_scope_reads_a_membership_item() -> None:
    member = {"accessLevel": "teacher", "billing": False, "status": "active"}
    assert p.scope(member, "pupil.edit") == p.OWN
    assert p.scope(member, "staff.manage") is None


def test_unknown_names_are_refused() -> None:
    with pytest.raises(ValueError):
        p.scope({"accessLevel": "teacher"}, "pupil.teleport")
    with pytest.raises(ValueError):
        p.grants("superuser", billing=False)


_CELL = {"✔": p.ALL, "all": p.ALL, "any class": p.ALL, "own": p.OWN, "own classes": p.OWN, "": None}


def _doc_cell(text: str) -> str | None:
    text = text.strip()
    if text.startswith("own classes"):  # "own classes, within the enrolment limit"
        return p.OWN
    return _CELL[text]


def test_the_contract_matches_the_table_in_04() -> None:
    """contracts/permissions.json and docs/platform/04 §5.2 say the same thing, so neither drifts."""
    doc = (REPO / "docs" / "platform" / "04-identity-and-access.md").read_text(encoding="utf-8")
    section = doc[doc.index("### 5.2 Permissions") : doc.index("### 5.3")]
    rows = [line for line in section.splitlines() if line.startswith("| `")]
    from_doc: dict[str, dict[str, str]] = {"admin": {}, "teacher": {}, "readonly": {}, "billing": {}}
    for row in rows:
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        names = re.findall(r"`([a-z_.]+)`", cells[0])
        for name in names:
            for bundle, cell in zip(("admin", "teacher", "readonly", "billing"), cells[2:6], strict=True):
                scope = _doc_cell(cell)
                if scope:
                    from_doc[bundle][name] = scope
    assert set(p.PERMISSIONS) == {n for row in rows for n in re.findall(r"`([a-z_.]+)`", row.split("|")[1])}
    for bundle, grants in from_doc.items():
        assert p.BUNDLES[bundle] == grants, bundle
