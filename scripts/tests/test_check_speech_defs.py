"""Tests for scripts/check_speech_defs.py (G-14): each rule fed a small bad file."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
REPO = SCRIPTS.parent
sys.path.insert(0, str(SCRIPTS))

import check_speech_defs  # noqa: E402

VERDICTS = {
    "schemaVersion": 1,
    "verdictValues": {"PHONEME": ["publishable", "publishable-small-schwa", "word-only"]},
    "sounds": {
        "s": {"verdict": "publishable"},
        "b": {"verdict": "publishable-small-schwa"},
        "th": {"verdict": "word-only"},
        "ng": {"verdict": "pending"},
    },
}


def repo(tmp_path: Path, *seed: object, verdicts: object = VERDICTS) -> Path:
    (tmp_path / "content").mkdir()
    (tmp_path / "content" / "listening-verdicts.json").write_text(json.dumps(verdicts))
    if seed:
        (tmp_path / "content" / "seed").mkdir()
        for i, doc in enumerate(seed):
            (tmp_path / "content" / "seed" / f"{i}.json").write_text(json.dumps(doc))
    return tmp_path


def phoneme(sound: str) -> dict:
    return {"speechId": f"phoneme-{sound}", "kind": "PHONEME", "ssml": "..."}


def test_the_repository_passes() -> None:
    result = subprocess.run(  # noqa: S603 - our own script
        [sys.executable, str(SCRIPTS / "check_speech_defs.py")], capture_output=True, text=True, check=False
    )
    assert result.returncode == 0, result.stderr


def test_no_seed_folder_is_nothing_to_check(tmp_path: Path) -> None:
    assert check_speech_defs.check(repo(tmp_path)) == (0, [])


def test_publishable_sounds_and_other_kinds_pass(tmp_path: Path) -> None:
    root = repo(
        tmp_path,
        {"items": [phoneme("s"), phoneme("b")]},
        [{"speechId": "word-thin", "kind": "WORD", "text": "thin."}],  # word-only sounds are fine inside words
    )
    assert check_speech_defs.check(root) == (0, [])


# pending, missing: the operator's listen-and-approve decides (ADR-0028)
@pytest.mark.parametrize("sound", ["ng", "zz"])
def test_a_phoneme_with_a_pending_or_missing_verdict_passes(tmp_path: Path, sound: str) -> None:
    assert check_speech_defs.check(repo(tmp_path, {"speech": phoneme(sound)})) == (0, [])


def test_a_word_only_phoneme_fails(tmp_path: Path) -> None:
    code, messages = check_speech_defs.check(repo(tmp_path, {"speech": phoneme("th")}))
    assert code == 1
    assert messages == [
        "content/seed/0.json: phoneme-verdict: phoneme-th has verdict word-only (taught only inside words)"
    ]


def test_a_phoneme_off_the_naming_convention_fails(tmp_path: Path) -> None:
    code, messages = check_speech_defs.check(repo(tmp_path, {"speechId": "sound-s", "kind": "PHONEME"}))
    assert code == 1 and "phoneme-verdict" in messages[0]


def test_an_unknown_kind_fails(tmp_path: Path) -> None:
    code, messages = check_speech_defs.check(repo(tmp_path, {"speechId": "x", "kind": "SONG"}))
    assert code == 1 and messages[0].endswith("kind: x has an unknown kind")


def test_a_bad_verdict_value_fails(tmp_path: Path) -> None:
    bad = {**VERDICTS, "sounds": {"s": {"verdict": "great"}}}
    code, messages = check_speech_defs.check(repo(tmp_path, verdicts=bad))
    assert code == 1 and "unknown verdict" in messages[0]


def test_a_missing_verdicts_file_is_bad_input(tmp_path: Path) -> None:
    assert check_speech_defs.check(tmp_path)[0] == 2


def test_drafts_saved_from_the_admin_api_are_checked_too(tmp_path: Path) -> None:
    """Phase 40: G-14 over drafts. An R17 list body and an R19 body are both found by the object search."""
    root = repo(tmp_path)
    listing = tmp_path / "speech-list.json"
    listing.write_text(json.dumps({"items": [{"speechId": "phoneme-th", "kind": "PHONEME", "state": "DRAFT"}]}))
    one = tmp_path / "phoneme-s.json"
    one.write_text(json.dumps({"header": {"speechId": "phoneme-s", "kind": "PHONEME"}, "draft": {"kind": "PHONEME"}}))
    code, messages = check_speech_defs.check(root, [listing, one])
    assert code == 1
    assert len(messages) == 1 and "phoneme-th has verdict word-only" in messages[0]
    assert check_speech_defs.check(root, [one]) == (0, [])
    code, messages = check_speech_defs.check(root, [tmp_path / "missing.json"])
    assert code == 1 and "missing or not valid JSON" in messages[0]


def test_the_drafts_option_on_the_command_line(tmp_path: Path) -> None:
    root = repo(tmp_path)
    export = tmp_path / "export.json"
    export.write_text(json.dumps({"items": [{"speechId": "word-thin", "kind": "WORD"}]}))
    result = subprocess.run(  # noqa: S603 - our own script
        [sys.executable, str(SCRIPTS / "check_speech_defs.py"), "--root", str(root), "--drafts", str(export)],
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "1 drafts file(s)" in result.stdout
