"""Tests for scripts/s3_put_create_only.sh: If-None-Match: *, the optional site headers (Phase 13), and the 412 rule.

A fake `aws` on PATH stands in for the CLI: it records its arguments and answers as S3 would. Nothing reaches AWS.
"""

from __future__ import annotations

import base64
import hashlib
import os
import stat
import subprocess
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "s3_put_create_only.sh"

# put-object: succeeds unless FAKE_PUT=412; head-object: prints FAKE_REMOTE_B64.
FAKE_AWS = """#!/usr/bin/env bash
printf '%s\\n' "$*" >> "$FAKE_LOG"
if [[ "$2" == "put-object" ]]; then
  if [[ "${FAKE_PUT:-ok}" == "412" ]]; then
    echo "An error occurred (PreconditionFailed) when calling the PutObject operation" >&2
    exit 254
  fi
  echo '{}'
  exit 0
fi
if [[ "$2" == "head-object" ]]; then
  echo "$FAKE_REMOTE_B64"
  exit 0
fi
exit 1
"""


@pytest.fixture
def env(tmp_path: Path) -> dict[str, str]:
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    aws = bin_dir / "aws"
    aws.write_text(FAKE_AWS)
    aws.chmod(aws.stat().st_mode | stat.S_IEXEC)
    return {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}", "FAKE_LOG": str(tmp_path / "log")}


@pytest.fixture
def body(tmp_path: Path) -> Path:
    path = tmp_path / "r1.json"
    path.write_text('{"kind": "ruleset"}\n')
    return path


def b64(path: Path) -> str:
    return base64.b64encode(hashlib.sha256(path.read_bytes()).digest()).decode()


def run(args: list[str], env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(["bash", str(SCRIPT), *args], env=env, capture_output=True, text=True, check=False)


def calls(env: dict[str, str]) -> list[str]:
    return Path(env["FAKE_LOG"]).read_text().splitlines()


def test_artefacts_form_sends_if_none_match_and_no_site_headers(env, body):
    result = run(["bucket", "releases/x/manifest.json", str(body)], env)
    assert result.returncode == 0, result.stderr
    (put,) = calls(env)
    assert "s3api put-object --bucket bucket --key releases/x/manifest.json" in put
    assert "--if-none-match *" in put and f"--checksum-sha256 {b64(body)}" in put
    assert "--cache-control" not in put and "--content-type" not in put


def test_site_form_adds_cache_control_and_content_type(env, body):
    result = run(["site", "game-data/ruleset/r1.json", str(body), "public, max-age=31536000, immutable",
                  "application/json"], env)
    assert result.returncode == 0, result.stderr
    (put,) = calls(env)
    assert "--key game-data/ruleset/r1.json" in put and "--if-none-match *" in put
    assert put.endswith("--cache-control public, max-age=31536000, immutable --content-type application/json")


def test_412_with_identical_bytes_is_accepted(env, body):
    result = run(["site", "game-data/ruleset/r1.json", str(body), "c", "t"], {**env, "FAKE_PUT": "412",
                                                                                "FAKE_REMOTE_B64": b64(body)})
    assert result.returncode == 0
    assert "already present with identical content" in result.stdout


def test_412_with_different_bytes_fails_and_never_overwrites(env, body):
    result = run(["site", "game-data/ruleset/r1.json", str(body), "c", "t"], {**env, "FAKE_PUT": "412",
                                                                                "FAKE_REMOTE_B64": "AAAA"})
    assert result.returncode == 1
    assert "already exists with different content" in result.stderr
    assert [c.split()[1] for c in calls(env)] == ["put-object", "head-object"]  # no second put


@pytest.mark.parametrize("count", [2, 4, 6])
def test_wrong_argument_count_is_a_usage_error(env, body, count):
    args = ["bucket", "key", str(body), "cache", "type", "extra"][:count]
    assert run(args, env).returncode == 2


def test_keep_existing_keeps_an_object_with_other_bytes(env, body):
    """LD6: the release keeps the publisher's game-data/current.json."""
    result = run(["--keep-existing", "site", "game-data/current.json", str(body), "no-cache", "application/json"],
                 {**env, "FAKE_PUT": "412", "FAKE_REMOTE_B64": "c29tZXRoaW5nIGVsc2U="})
    assert result.returncode == 0, result.stderr
    assert "kept the existing s3://site/game-data/current.json" in result.stdout
    put, head = calls(env)
    assert "--if-none-match *" in put and "head-object" in head


def test_keep_existing_still_uploads_when_absent(env, body):
    result = run(["--keep-existing", "site", "game-data/current.json", str(body), "no-cache", "application/json"], env)
    assert result.returncode == 0, result.stderr
    (put,) = calls(env)
    assert "--if-none-match *" in put and "--key game-data/current.json" in put


def test_without_keep_existing_other_bytes_still_fail(env, body):
    result = run(["site", "game-data/current.json", str(body), "no-cache", "application/json"],
                 {**env, "FAKE_PUT": "412", "FAKE_REMOTE_B64": "c29tZXRoaW5nIGVsc2U="})
    assert result.returncode == 1
