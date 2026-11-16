"""The listening verdicts, read at speech approval (gate G-14 at R21; spine S5.2, D §D9.5 Q5, F §12.6; ADR-0028).

The operator's in-app Approve (preview the exact clip, listen, tick) IS the listening verdict (owner decision
2026-11-16, ADR-0028). This module keeps only the one refusal the owner's bake-off still owes: a sound judged
`word-only` is taught inside words, never on its own. `scripts/check_speech_defs.py` applies the same rule to
`content/seed/`, and `admin-api` applies it when the operator approves a PHONEME definition, whichever way it was made:

    speechId  phoneme-<sound id>                       (the convention G-14 uses)
    verdict   sounds[<sound id>].verdict
              word-only                                -> refused, rule phoneme_word_only (G R21)
              missing, pending, publishable, any other -> allowed (the operator's listen-and-approve decides)
    a speechId without the phoneme- prefix             -> allowed (it names no sound in the file)

Where the file is:
  in a Lambda zip   <zip root>/content/listening-verdicts.json   (scripts/build_lambdas.py adds it to admin-api only)
  in the repository <repo>/content/listening-verdicts.json
The first that exists wins. A missing file means no sound is word-only: every PHONEME approval is left to the
operator, and the import never fails, so the other admin routes keep working.
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent  # .../shared
RELATIVE = Path("content") / "listening-verdicts.json"
WORD_ONLY = "word-only"
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
    """None when a PHONEME definition `speech_id` may be approved; otherwise the VALIDATION_FAILED rule.

    Only a sound whose verdict is `word-only` is refused; everything else is the operator's call at Approve.
    """
    if not speech_id.startswith(PHONEME_PREFIX):
        return None
    sounds = _sounds() if sounds is None else sounds
    sound = sounds.get(speech_id.removeprefix(PHONEME_PREFIX))
    verdict = sound.get("verdict") if isinstance(sound, dict) else None
    return "phoneme_word_only" if verdict == WORD_ONLY else None
