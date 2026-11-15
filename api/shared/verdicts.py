"""The listening verdicts, read at speech approval (gate G-14 at R21; spine S5.2, D §D9.5 Q5, F §12.6; Phase 20).

`scripts/check_speech_defs.py` refuses a PHONEME definition in `content/seed/` unless its sound has a publishable
verdict; `admin-api` applies the same rule when the operator approves one, so a sound nobody judged publishable can
never become an approved clip, whichever way the definition was made:

    speechId  phoneme-<sound id>                       (the convention G-14 uses)
    verdict   sounds[<sound id>].verdict in {publishable, publishable-small-schwa}
              word-only                -> refused, rule phoneme_word_only (G R21)
              missing, pending, other  -> refused, rule phoneme_no_verdict (fail closed)

Where the file is:
  in a Lambda zip   <zip root>/content/listening-verdicts.json   (scripts/build_lambdas.py adds it to admin-api only)
  in the repository <repo>/content/listening-verdicts.json
The first that exists wins. A missing file refuses every PHONEME approval (fail closed) rather than failing the import,
so the other admin routes keep working.
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent  # .../shared
RELATIVE = Path("content") / "listening-verdicts.json"
PUBLISHABLE = frozenset({"publishable", "publishable-small-schwa"})
PHONEME_PREFIX = "phoneme-"


def verdicts_path() -> Path | None:
    for root in (_HERE.parent, _HERE.parents[1]):  # zip root, then repository root
        candidate = root / RELATIVE
        if candidate.is_file():
            return candidate
    return None


@cache
def _sounds() -> dict[str, Any]:
    path = verdicts_path()
    if path is None:
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    sounds = doc.get("sounds") if isinstance(doc, dict) and doc.get("schemaVersion") == 1 else None
    return sounds if isinstance(sounds, dict) else {}


def phoneme_refusal(speech_id: str, sounds: dict[str, Any] | None = None) -> str | None:
    """None when a PHONEME definition `speech_id` may be approved; otherwise the VALIDATION_FAILED rule."""
    sounds = _sounds() if sounds is None else sounds
    if not speech_id.startswith(PHONEME_PREFIX):
        return "phoneme_no_verdict"
    sound = sounds.get(speech_id.removeprefix(PHONEME_PREFIX))
    verdict = sound.get("verdict") if isinstance(sound, dict) else None
    if verdict in PUBLISHABLE:
        return None
    return "phoneme_word_only" if verdict == "word-only" else "phoneme_no_verdict"
