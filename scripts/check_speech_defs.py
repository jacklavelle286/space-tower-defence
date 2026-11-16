#!/usr/bin/env python3
"""Speech-definition check (gate G-14, plan H §H.10; spine S5.2, E §E.4.1a; Phase 19; rule changed by ADR-0028).

A PHONEME speech definition is refused only when its sound has the verdict `word-only` in
content/listening-verdicts.json. The operator's in-app Approve (preview the exact clip, listen, tick) is the listening
verdict (owner decision 2026-11-16, ADR-0028), so this is the same rule admin-api applies (api/shared/verdicts.py):

  verdicts-file      the verdicts file exists, has schemaVersion 1, and every sound's verdict is one of
                     verdictValues.PHONEME or "pending"
  phoneme-verdict    a definition with kind PHONEME names its sound by the speechId convention `phoneme-<sound id>`,
                     and sounds[<sound id>].verdict is not `word-only` (a word-only sound is taught only inside words).
                     Missing, `pending` and the publishable verdicts pass: the operator listens before approving
  kind               every speech definition's kind is WORD, PHONEME, LETTER_NAME, INSTRUCTION or DICTATION

What is a speech definition: any JSON object, at any depth, in a .json file under content/seed/, that has both
`speechId` and `kind` (the check does not assume a file layout). With no content/seed/ there is nothing to check.

Drafts (Phase 40, M3-05). admin-api runs the same rule on every draft as it is created (R18), saved (R20) and approved
(R21), so a word-only PHONEME draft cannot exist in the table. `--drafts FILE` also checks JSON files you saved from
the admin API, for example the body of `GET /api/admin/speech-definitions` (its items carry `speechId` and `kind`) or
of one definition (`GET .../speech-definitions/<id>`, whose header carries both); the same object search applies, so
any export shape works. Useful after the verdicts file changes, to list drafts that would now be refused.

Exit codes:
  0  every rule holds
  1  at least one violation (each printed as `path: rule: message`; identifiers only, never speech text)
  2  the verdicts file is missing or is not JSON

Standard library only; runs on Python 3.12 and 3.14.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Iterator, Sequence
from pathlib import Path
from typing import Any

EXIT_OK = 0
EXIT_VIOLATION = 1
EXIT_BAD_INPUT = 2

REPO_ROOT = Path(__file__).resolve().parents[1]
VERDICTS = Path("content/listening-verdicts.json")
SEED = Path("content/seed")
KINDS = frozenset({"WORD", "PHONEME", "LETTER_NAME", "INSTRUCTION", "DICTATION"})
WORD_ONLY = "word-only"
PHONEME_PREFIX = "phoneme-"


def definitions(value: Any) -> Iterator[dict[str, Any]]:
    """Every object holding both `speechId` and `kind`, depth first."""
    if isinstance(value, dict):
        if "speechId" in value and "kind" in value:
            yield value
        for child in value.values():
            yield from definitions(child)
    elif isinstance(value, list):
        for child in value:
            yield from definitions(child)


def check_verdicts(doc: Any) -> list[str]:
    if not isinstance(doc, dict) or doc.get("schemaVersion") != 1:
        return ["verdicts-file: schemaVersion must be 1"]
    allowed = doc.get("verdictValues", {}).get("PHONEME") if isinstance(doc.get("verdictValues"), dict) else None
    sounds = doc.get("sounds")
    if not isinstance(allowed, list) or not isinstance(sounds, dict):
        return ["verdicts-file: verdictValues.PHONEME and sounds are required"]
    problems = []
    for sound_id, sound in sorted(sounds.items()):
        verdict = sound.get("verdict") if isinstance(sound, dict) else None
        if verdict != "pending" and verdict not in allowed:
            problems.append(f"verdicts-file: sound {sound_id} has an unknown verdict")
    return problems


def check(root: Path, drafts: Sequence[Path] = ()) -> tuple[int, list[str]]:
    """(exit code, messages) for the repository at `root`, plus any admin-export `drafts` files."""
    try:
        verdicts = json.loads((root / VERDICTS).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return EXIT_BAD_INPUT, [f"{VERDICTS}: missing or not JSON"]
    problems = [f"{VERDICTS}: {p}" for p in check_verdicts(verdicts)]
    sounds = verdicts.get("sounds") if isinstance(verdicts, dict) else None
    sounds = sounds if isinstance(sounds, dict) else {}

    seed = root / SEED
    files = sorted(seed.rglob("*.json")) if seed.is_dir() else []
    problems += check_files([*files, *drafts], sounds, root)
    return (EXIT_VIOLATION if problems else EXIT_OK), problems


def check_files(files: list[Path], sounds: dict[str, Any], root: Path | None = None) -> list[str]:
    """The kind and phoneme-verdict rules over every definition found in `files` (seed files or admin exports)."""
    problems: list[str] = []
    for path in files:
        shown = path.relative_to(root) if root is not None and path.is_relative_to(root) else path
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            problems.append(f"{shown}: json: missing or not valid JSON")
            continue
        for definition in definitions(doc):
            speech_id, kind = definition["speechId"], definition["kind"]
            name = speech_id if isinstance(speech_id, str) else "<speechId not a string>"
            if kind not in KINDS:
                problems.append(f"{shown}: kind: {name} has an unknown kind")
                continue
            if kind != "PHONEME":
                continue
            if not isinstance(speech_id, str) or not speech_id.startswith(PHONEME_PREFIX):
                problems.append(f"{shown}: phoneme-verdict: {name} does not follow phoneme-<sound id>")
                continue
            sound = sounds.get(speech_id.removeprefix(PHONEME_PREFIX))
            verdict = sound.get("verdict") if isinstance(sound, dict) else None
            if verdict == WORD_ONLY:
                problems.append(f"{shown}: phoneme-verdict: {name} has verdict word-only (taught only inside words)")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="repository root (default: this repository)")
    parser.add_argument(
        "--drafts",
        type=Path,
        action="append",
        default=[],
        metavar="FILE",
        help="also check a JSON file saved from the admin API (speech list or one definition); repeatable",
    )
    args = parser.parse_args(argv)
    code, messages = check(args.root, args.drafts)
    for message in messages:
        print(message, file=sys.stderr)
    if code == EXIT_OK:
        print("G-14 speech definitions: OK" + (f" (and {len(args.drafts)} drafts file(s))" if args.drafts else ""))
    return code


if __name__ == "__main__":
    sys.exit(main())
