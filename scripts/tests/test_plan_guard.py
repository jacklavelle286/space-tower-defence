"""Tests for scripts/plan_guard.py (G-7, plan I.2.8): three saved `terraform show -json` samples."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
REPO = SCRIPTS.parent
PLANS = Path(__file__).resolve().parent / "fixtures" / "plans"
sys.path.insert(0, str(SCRIPTS))

import plan_guard  # noqa: E402

UPDATE = PLANS / "plan_update_in_place.json"
TABLE_REPLACE = PLANS / "plan_dynamodb_table_replace.json"
CLIENT_DELETE = PLANS / "plan_cognito_client_delete.json"
REPO_CONFIG = REPO / "infrastructure" / "plan-guard.json"


def write_config(tmp_path: Path, enforce: bool) -> Path:
    """The repository's protected types with `enforce` set as the test needs."""
    data = json.loads(REPO_CONFIG.read_text())
    data["enforce"] = enforce
    path = tmp_path / "plan-guard.json"
    path.write_text(json.dumps(data))
    return path


def run(plan: Path, config: Path, capsys: pytest.CaptureFixture[str]) -> tuple[int, str, str]:
    rc = plan_guard.main([str(plan), "--config", str(config)])
    out, err = capsys.readouterr()
    return rc, out, err


# --- the three samples ------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("enforce", [False, True])
def test_update_in_place_passes(tmp_path: Path, capsys: pytest.CaptureFixture[str], enforce: bool) -> None:
    rc, out, err = run(UPDATE, write_config(tmp_path, enforce), capsys)
    assert rc == 0
    assert "No protected resource is deleted or replaced." in out
    assert err == ""


def test_table_replace_is_listed_in_report_mode(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    rc, out, err = run(TABLE_REPLACE, write_config(tmp_path, enforce=False), capsys)
    assert rc == 0  # report mode never fails the job
    assert "| `module.game_table.aws_dynamodb_table.this` | `aws_dynamodb_table` | replace | replace_because_cannot_update |" in out
    assert "::warning::" in err
    # The alarm delete is a real delete, but its type is not protected.
    assert "old_throttles" not in out


def test_table_replace_fails_when_enforcing(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    rc, out, err = run(TABLE_REPLACE, write_config(tmp_path, enforce=True), capsys)
    assert rc == 1
    assert "This plan is refused." in out
    assert "::error::" in err


def test_client_delete_is_listed_in_report_mode(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    rc, out, _ = run(CLIENT_DELETE, write_config(tmp_path, enforce=False), capsys)
    assert rc == 0
    assert "`module.player_pool.aws_cognito_user_pool_client.web`" in out
    assert "| delete |" in out
    # The pool itself is only updated in place.
    assert "aws_cognito_user_pool.this" not in out


def test_client_delete_fails_when_enforcing(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    rc, _, _ = run(CLIENT_DELETE, write_config(tmp_path, enforce=True), capsys)
    assert rc == 1


# --- the committed config ----------------------------------------------------------------------------------------------


def test_repository_config_is_report_mode_and_protects_h11_types() -> None:
    config = plan_guard.parse_config(json.loads(REPO_CONFIG.read_text()))
    assert config.enforce is False  # flips to true only at the data freeze (H.11.3 F-1)
    assert {
        "aws_dynamodb_table",
        "aws_cognito_user_pool",
        "aws_cognito_user_pool_client",
        "aws_cognito_user_group",
        "aws_cognito_user_pool_domain",
        "aws_s3_bucket",
        "aws_backup_vault",
        "aws_cloudfront_distribution",
        "aws_acm_certificate",
    } <= config.protected_types


def test_cli_as_the_workflow_runs_it() -> None:
    """Same invocation as release.yml and plan.yml, in a fresh interpreter."""
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "plan_guard.py"), str(TABLE_REPLACE), "--config", str(REPO_CONFIG)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0
    assert result.stdout.startswith("### Plan guard (G-7)")
    assert "aws_dynamodb_table" in result.stdout


@pytest.mark.parametrize("actions", [["delete", "create"], ["create", "delete"]], ids=["destroy-first", "create-first"])
@pytest.mark.parametrize("enforce", [False, True])
def test_table_replace_listed_in_either_order(
    tmp_path: Path, capsys: pytest.CaptureFixture[str], actions: list[str], enforce: bool
) -> None:
    """A replace is ["delete","create"] by default and ["create","delete"] under create_before_destroy."""
    plan = tmp_path / "replace.json"
    plan.write_text(
        json.dumps(
            {
                "format_version": "1.2",
                "resource_changes": [
                    {
                        "address": "module.game_table.aws_dynamodb_table.this",
                        "type": "aws_dynamodb_table",
                        "change": {"actions": actions},
                    }
                ],
            }
        )
    )
    rc, out, _ = run(plan, write_config(tmp_path, enforce=enforce), capsys)
    assert "| replace |" in out
    assert rc == (1 if enforce else 0)


# --- edge cases --------------------------------------------------------------------------------------------------------


def test_plan_without_resource_changes_passes(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    plan = tmp_path / "empty.json"
    plan.write_text(json.dumps({"format_version": "1.2", "terraform_version": "1.17.2", "planned_values": {}}))
    rc, out, _ = run(plan, write_config(tmp_path, enforce=True), capsys)
    assert rc == 0
    assert "No protected resource" in out


def test_deposed_object_delete_is_listed(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    plan = tmp_path / "deposed.json"
    plan.write_text(
        json.dumps(
            {
                "format_version": "1.2",
                "resource_changes": [
                    {
                        "address": "module.audio.aws_s3_bucket.this",
                        "type": "aws_s3_bucket",
                        "deposed": "a1b2c3d4",
                        "change": {"actions": ["delete"]},
                    }
                ],
            }
        )
    )
    rc, out, _ = run(plan, write_config(tmp_path, enforce=False), capsys)
    assert rc == 0
    assert "(deposed `a1b2c3d4`)" in out


@pytest.mark.parametrize(
    "config",
    [
        {"protected_types": ["aws_s3_bucket"]},
        {"enforce": "false", "protected_types": ["aws_s3_bucket"]},
        {"enforce": False, "protected_types": []},
        {"enforce": False, "protected_types": "aws_s3_bucket"},
        [],
    ],
)
def test_bad_config_exits_2(tmp_path: Path, capsys: pytest.CaptureFixture[str], config: object) -> None:
    path = tmp_path / "plan-guard.json"
    path.write_text(json.dumps(config))
    rc, out, err = run(UPDATE, path, capsys)
    assert rc == 2
    assert out == ""
    assert "plan-guard config" in err


def test_not_a_plan_exits_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    plan = tmp_path / "plan.txt"
    plan.write_text("Plan: 1 to add, 0 to change, 0 to destroy.\n")
    rc, _, err = run(plan, write_config(tmp_path, enforce=False), capsys)
    assert rc == 2
    assert "not valid JSON" in err


def test_missing_plan_exits_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    rc, _, err = run(tmp_path / "nope.json", write_config(tmp_path, enforce=False), capsys)
    assert rc == 2
    assert "cannot read the plan" in err
