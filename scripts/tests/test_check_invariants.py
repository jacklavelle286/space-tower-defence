"""Tests for scripts/check_invariants.py (G-5, plan I.2: each rule fed a small bad file)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
REPO = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

import check_invariants  # noqa: E402

CLEAN_WORKFLOW = """\
name: release
on:
  workflow_dispatch:
jobs:
  apply:
    runs-on: ubuntu-24.04
    steps:
      - run: terraform apply -input=false tfplan
"""

CLEAN_MODULE = """\
# No custom_error_response here: it would rewrite /api/* errors into index.html.
resource "aws_cloudfront_distribution" "site" {
  enabled = true
}
"""


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A minimal clean repository: one workflow, one module."""
    (tmp_path / ".github" / "workflows").mkdir(parents=True)
    (tmp_path / ".github" / "workflows" / "release.yml").write_text(CLEAN_WORKFLOW)
    (tmp_path / "infrastructure" / "modules" / "static_site").mkdir(parents=True)
    (tmp_path / "infrastructure" / "modules" / "static_site" / "main.tf").write_text(CLEAN_MODULE)
    return tmp_path


def rules_hit(repo: Path) -> set[str]:
    return {v.rule for v in check_invariants.check(repo)}


def test_clean_repo_passes(repo: Path) -> None:
    assert check_invariants.check(repo) == []
    assert check_invariants.main(["--root", str(repo)]) == check_invariants.EXIT_OK


@pytest.mark.parametrize(
    ("line", "rule"),
    [
        ("      - run: terraform destroy -input=false", "workflow-destroy"),
        ("        options: [plan, apply, Destroy]", "workflow-destroy"),
        ("      - run: terraform plan -destroy -out=tfplan", "workflow-destroy"),
        ("      - run: terraform apply -auto-approve", "workflow-auto-approve"),
        ("      - run: terraform apply --auto-approve", "workflow-auto-approve"),
        ("      - run: aws lambda update-function-code --function-name x", "workflow-update-function-code"),
        ("      - run: python -c 'boto3.client(\"lambda\").update_function_code()'", "workflow-update-function-code"),
        ("# a comment that mentions destroy still fails, like the plan's grep", "workflow-destroy"),
    ],
)
def test_each_workflow_rule_catches_a_bad_line(repo: Path, line: str, rule: str) -> None:
    (repo / ".github" / "workflows" / "bad.yml").write_text(CLEAN_WORKFLOW + line + "\n")
    violations = check_invariants.check(repo)
    assert {v.rule for v in violations} == {rule}
    assert violations[0].path == Path(".github/workflows/bad.yml")
    assert violations[0].line == CLEAN_WORKFLOW.count("\n") + 1


def test_any_file_under_github_is_scanned(repo: Path) -> None:
    (repo / ".github" / "actions" / "tf").mkdir(parents=True)
    (repo / ".github" / "actions" / "tf" / "action.yml").write_text("runs:\n  steps:\n    - run: terraform destroy\n")
    assert rules_hit(repo) == {"workflow-destroy"}


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("block.tf", 'resource "aws_cloudfront_distribution" "d" {\n  custom_error_response {\n    error_code = 403\n  }\n}\n'),
        ("tight.tf", 'resource "aws_cloudfront_distribution" "d" {\n  custom_error_response{\n  }\n}\n'),
        ("dynamic.tf", 'resource "aws_cloudfront_distribution" "d" {\n  dynamic "custom_error_response" {\n  }\n}\n'),
        ("json.tf.json", '{"resource": {"aws_cloudfront_distribution": {"d": {\n  "custom_error_response": [{}]\n}}}}\n'),
    ],
)
def test_custom_error_response_is_caught(repo: Path, name: str, content: str) -> None:
    (repo / "infrastructure" / "modules" / "static_site" / name).write_text(content)
    violations = check_invariants.check(repo)
    assert {v.rule for v in violations} == {"custom-error-response"}
    assert violations[0].line == 2


def test_custom_error_response_in_the_main_root_is_caught(repo: Path) -> None:
    (repo / "infrastructure" / "main").mkdir()
    (repo / "infrastructure" / "main" / "sites.tf").write_text("  custom_error_response {\n  }\n")
    assert rules_hit(repo) == {"custom-error-response"}


@pytest.mark.parametrize(
    "line",
    [
        "# custom_error_response {",
        "  // custom_error_response {",
        "  /* custom_error_response { */",
        '  description = "no custom_error_response here"',
    ],
)
def test_custom_error_response_in_comments_or_strings_passes(repo: Path, line: str) -> None:
    (repo / "infrastructure" / "modules" / "static_site" / "notes.tf").write_text(line + "\n")
    assert check_invariants.check(repo) == []


def test_downloaded_modules_and_non_terraform_files_are_ignored(repo: Path) -> None:
    vendored = repo / "infrastructure" / "main" / ".terraform" / "modules" / "cdn"
    vendored.mkdir(parents=True)
    (vendored / "main.tf").write_text("  custom_error_response {\n  }\n")
    (repo / "infrastructure" / "README.md").write_text("custom_error_response {\n")
    assert check_invariants.check(repo) == []


def test_cli_reports_violations_and_exits_1(repo: Path) -> None:
    (repo / ".github" / "workflows" / "spike.yml").write_text("    - destroy\n")
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "check_invariants.py"), "--root", str(repo)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == check_invariants.EXIT_VIOLATION
    assert ".github/workflows/spike.yml:1: workflow-destroy:" in result.stdout
    assert "FAILED: 1 violation(s) of G-5" in result.stderr


def test_wrong_root_exits_2(tmp_path: Path) -> None:
    assert check_invariants.main(["--root", str(tmp_path)]) == check_invariants.EXIT_BAD_INPUT


def test_real_repository_passes() -> None:
    """The real workflows and Terraform satisfy G-5 (spike.yml was deleted in Phase 6; no exemption)."""
    assert check_invariants.check(REPO) == []
