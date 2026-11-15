"""Tests for scripts/scan_dist.py (G-6, plan I.2.8): a fixture dist/ with each forbidden string."""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "scan_dist"
sys.path.insert(0, str(SCRIPTS))

import scan_dist  # noqa: E402

# Key-shaped strings are built at run time, so no file in the repository looks like an AWS key to a secret scanner.
FAKE_ACCESS_KEY = "AKIA" + "Z" * 16
FAKE_TEMP_KEY = "ASIA" + "Q" * 16

EXPECTED_RULES = {
    "polly-client-Aa111111.js": "polly-client",
    "polly-endpoint-Bb222222.js": "polly-endpoint",
    "synth-Cc333333.js": "synthesize-speech",
    "speech-Dd444444.js": "speech-synthesis",
    "sdk3-Ee555555.js": "aws-sdk-v3",
    "sdk2-Ff666666.js": "aws-sdk",
}


@pytest.fixture
def forbidden_dist(tmp_path: Path) -> Path:
    """The committed forbidden/ tree plus two files with key-shaped strings."""
    dist = tmp_path / "dist"
    shutil.copytree(FIXTURES / "forbidden", dist)
    (dist / "assets" / "key-Gg777777.js").write_text(f'var k="{FAKE_ACCESS_KEY}";\n')
    (dist / "assets" / "tmpkey-Hh888888.js").write_text(f'var k="{FAKE_TEMP_KEY}";\n')
    return dist


def test_clean_dist_passes_including_the_bare_word_polly(capsys: pytest.CaptureFixture[str]) -> None:
    assert "Polly" in (FIXTURES / "clean" / "assets" / "index-AbCd12_-.js").read_text()
    assert scan_dist.main([str(FIXTURES / "clean")]) == 0
    assert "0 finding(s)" in capsys.readouterr().out


def test_each_forbidden_string_is_caught(forbidden_dist: Path) -> None:
    findings = scan_dist.scan_dir(forbidden_dist)
    by_file: dict[str, set[str]] = {}
    for f in findings:
        by_file.setdefault(f.path.name, set()).add(f.rule)

    expected = dict(EXPECTED_RULES)
    expected["key-Gg777777.js"] = "aws-access-key-id"
    expected["tmpkey-Hh888888.js"] = "aws-temporary-key-id"
    for name, rule in expected.items():
        assert rule in by_file.get(name, set()), f"{name} should trip {rule}"
    # Every rule is exercised by the fixture.
    assert {r for rules in by_file.values() for r in rules} == {name for name, _ in scan_dist.RULES}


def test_sdk_v3_is_not_reported_twice(forbidden_dist: Path) -> None:
    rules = [f.rule for f in scan_dist.scan_dir(forbidden_dist) if f.path.name == "sdk3-Ee555555.js"]
    assert rules == ["aws-sdk-v3"]


def test_forbidden_dist_fails_and_never_prints_a_whole_key(forbidden_dist: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert scan_dist.main([str(forbidden_dist)]) == 1
    out, err = capsys.readouterr()
    assert "FAILED" in err
    assert "aws-access-key-id: AKIA…" in out
    assert FAKE_ACCESS_KEY not in out + err
    assert FAKE_TEMP_KEY not in out + err


def test_one_bad_directory_fails_the_whole_scan(forbidden_dist: Path) -> None:
    assert scan_dist.main([str(FIXTURES / "clean"), str(forbidden_dist)]) == 1


@pytest.mark.parametrize("text", ["Polly", "polly", "Amazon Polly voice", "pollywog.example.com"])
def test_bare_polly_is_not_matched(tmp_path: Path, text: str) -> None:
    (tmp_path / "a.js").write_text(f'const s = "{text}";\n')
    assert scan_dist.scan_dir(tmp_path) == []


def test_binary_files_are_scanned(tmp_path: Path) -> None:
    (tmp_path / "sprite.png").write_bytes(b"\x89PNG\r\n\x1a\n\x00" + FAKE_ACCESS_KEY.encode() + b"\xff\x00")
    assert [f.rule for f in scan_dist.scan_dir(tmp_path)] == ["aws-access-key-id"]


def test_missing_or_empty_dir_exits_2(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert scan_dist.main([str(tmp_path / "missing")]) == 2
    assert "not a directory" in capsys.readouterr().err
    (tmp_path / "empty").mkdir()
    assert scan_dist.main([str(tmp_path / "empty")]) == 2
    assert "is empty" in capsys.readouterr().err


def test_cli_as_the_workflow_runs_it() -> None:
    result = subprocess.run(
        [sys.executable, str(SCRIPTS / "scan_dist.py"), str(FIXTURES / "clean")],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
