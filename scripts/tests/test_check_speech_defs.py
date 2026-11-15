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


@pytest.mark.parametrize(("sound", "verdict"), [("th", "word-only"), ("ng", "pending"), ("zz", "missing")])
def test_a_phoneme_without_a_publishable_verdict_fails(tmp_path: Path, sound: str, verdict: str) -> None:
    code, messages = check_speech_defs.check(repo(tmp_path, {"speech": phoneme(sound)}))
    assert code == 1
    assert messages == [
        f"content/seed/0.json: phoneme-verdict: phoneme-{sound} has verdict {verdict}, "
        "not publishable or publishable-small-schwa"
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
