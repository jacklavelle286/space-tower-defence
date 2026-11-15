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


# A lambda_function call shaped like infrastructure/main/main.tf's, with braces in a map, a string and a comment.
LAMBDA_CALL = """\
module "player_api" {
  source = "../modules/lambda_function"

  function_name = local.lambda_names["player-api"] # a comment with a brace }
  environment = {
    POWERTOOLS_SERVICE_NAME = "player-api"
    TEMPLATE                = "{not a block}"
  }
ALARM
  log_retention_days = var.log_retention_days
}

module "player_pool" {
  source = "../modules/cognito_pool"
}
"""
WITH_ALARMS = "  alarm_topic_arn = module.monitoring.alarm_topic_arn"


def lambda_call(alarm_line: str = WITH_ALARMS, name: str = "player_api") -> str:
    return LAMBDA_CALL.replace("ALARM", alarm_line).replace('"player_api"', f'"{name}"')


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A minimal clean repository: one workflow, one module, one root calling lambda_function with its alarm topic."""
    (tmp_path / ".github" / "workflows").mkdir(parents=True)
    (tmp_path / ".github" / "workflows" / "release.yml").write_text(CLEAN_WORKFLOW)
    (tmp_path / "infrastructure" / "modules" / "static_site").mkdir(parents=True)
    (tmp_path / "infrastructure" / "modules" / "static_site" / "main.tf").write_text(CLEAN_MODULE)
    (tmp_path / "infrastructure" / "main").mkdir(parents=True)
    (tmp_path / "infrastructure" / "main" / "main.tf").write_text(lambda_call())
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


@pytest.mark.parametrize(
    "alarm_line",
    [
        "",  # input missing
        "  # alarm_topic_arn = module.monitoring.alarm_topic_arn",  # commented out
        "  alarm_topic_arn = null",
        "  alarm_topic_arn = null # set later",
        '  description = "alarm_topic_arn = module.monitoring.alarm_topic_arn"',  # only inside a string
        "  /* alarm_topic_arn = module.monitoring.alarm_topic_arn */",
    ],
)
def test_lambda_call_without_alarm_topic_is_caught(repo: Path, alarm_line: str) -> None:
    (repo / "infrastructure" / "main" / "main.tf").write_text(lambda_call(alarm_line))
    violations = check_invariants.check(repo)
    assert [(v.rule, v.line, v.text) for v in violations] == [("lambda-alarms", 1, 'module "player_api"')]


def test_a_fifth_function_without_alarms_is_caught_among_good_ones(repo: Path) -> None:
    (repo / "infrastructure" / "main" / "functions.tf").write_text(
        lambda_call(name="tts") + "\n" + lambda_call("", name="reports") + lambda_call(name="admin_api"))
    violations = check_invariants.check(repo)
    assert [(v.path, v.text) for v in violations] == [(Path("infrastructure/main/functions.tf"), 'module "reports"')]
    assert violations[0].line == LAMBDA_CALL.count("\n") + 2  # second file block, after the blank line


@pytest.mark.parametrize("source", ['"../../modules/lambda_function"', '"./modules/lambda_function/"'])
def test_any_relative_path_to_lambda_function_counts(repo: Path, source: str) -> None:
    text = lambda_call("").replace('"../modules/lambda_function"', source)
    (repo / "infrastructure" / "main" / "main.tf").write_text(text)
    assert rules_hit(repo) == {"lambda-alarms"}


def test_other_modules_and_heredocs_are_not_lambda_calls(repo: Path) -> None:
    (repo / "infrastructure" / "main" / "other.tf").write_text(
        'module "site" {\n  source = "../modules/static_site"\n}\n'
        'locals {\n  doc = <<-EOT\n    module "x" {\n      source = "../modules/lambda_function"\n    }\n  EOT\n}\n')
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
    """The real workflows and Terraform satisfy G-5 (spike.yml was deleted in Phase 6; no exemption), and every one of
    the four lambda_function calls passes its alarm topic (Phase 9)."""
    assert check_invariants.check(REPO) == []
