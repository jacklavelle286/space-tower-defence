"""The modules that run `terraform test` carry a committed lock that pins the root's hashicorp/aws build.

CI and the release checks job init infrastructure/modules/{monitoring,static_site} with `-lockfile=readonly`, so the
provider those mock-provider tests run against is the same build, with the same hashes, as the root plans with. If the
root's provider is upgraded, copy its aws block into each module lock (this test names the files that differ).
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOT_LOCK = REPO / "infrastructure" / "main" / ".terraform.lock.hcl"
TESTED_MODULES = ("monitoring", "static_site")
_AWS_BLOCK = re.compile(r'provider "registry\.terraform\.io/hashicorp/aws" \{.*?\n\}\n', re.S)
_PROVIDER = re.compile(r'^provider "([^"]+)"', re.M)


def aws_block(path: Path) -> str:
    match = _AWS_BLOCK.search(path.read_text(encoding="utf-8"))
    assert match is not None, f"{path}: no hashicorp/aws entry"
    return match.group(0)


def test_every_tested_module_has_a_lock_with_only_the_roots_aws_entry() -> None:
    expected = aws_block(ROOT_LOCK)
    for module in TESTED_MODULES:
        lock = REPO / "infrastructure" / "modules" / module / ".terraform.lock.hcl"
        assert lock.is_file(), f"{lock} is missing: CI inits this module with -lockfile=readonly"
        assert _PROVIDER.findall(lock.read_text(encoding="utf-8")) == ["registry.terraform.io/hashicorp/aws"], lock
        assert aws_block(lock) == expected, f"{lock}: copy the aws block from {ROOT_LOCK}"


def test_every_module_with_terraform_tests_is_covered() -> None:
    with_tests = sorted(p.parent.name for p in (REPO / "infrastructure" / "modules").glob("*/tests"))
    assert with_tests == sorted(TESTED_MODULES)


def test_the_workflows_init_every_terraform_test_folder_read_only() -> None:
    for workflow in ("ci.yml", "release.yml"):
        text = (REPO / ".github" / "workflows" / workflow).read_text(encoding="utf-8")
        inits = [line for line in text.splitlines() if "terraform -chdir=" in line and " init " in line]
        assert inits, workflow
        assert all("-lockfile=readonly" in line for line in inits), workflow
