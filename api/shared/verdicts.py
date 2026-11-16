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

Starting drafts (Phase 40, M3-05). "New speech" in the admin needs only the kind and the word or sound; R18 then fills
the draft from what the owner already heard in the bake-off, so the operator starts from a form that worked:

    items[<speechId>].clip.ssml           the exact body the owner listened to (word-chom, letter-a, ...)
    PHONEME sounds[<sound>].clip.ssml      the sound's chosen clip form (variant schwa or main)
    PHONEME sounds[<sound>].xsampa         no clip yet: the frozen PH form `<phoneme ph="X">sound</phoneme>.`
                                           (no schwa; the operator listens and edits) [ASSUMPTION]
    WORD word-<word>                       the TEXT form with a closing full stop, `<word>.` (word-ship is "ship.")
    LETTER_NAME letter-<letter>            `<LETTER>.` (a capital letter on its own is read as its name) [ASSUMPTION]
    anything else                          no starting body: the operator types it

The bodies are the frozen ADR-0014 forms (spikes/polly-listening/canonical.py) without the wrapper, which
shared/clipkey.py adds back, so a starting body taken from a clip gives that clip's key again (for the same engine).
"""

from __future__ import annotations

import json
import re
from functools import cache
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent  # .../shared
RELATIVE = Path("content") / "listening-verdicts.json"
WORD_ONLY = "word-only"
PHONEME_PREFIX = "phoneme-"
WORD_PREFIX = "word-"
LETTER_PREFIX = "letter-"
_WRAP_HEAD = '<speak><break time="150ms"/>'
_WRAP_TAIL = '<break time="250ms"/></speak>'
_XSAMPA = re.compile(r"[!-~]{1,16}")  # X-SAMPA is printable ASCII
_PLAIN = re.compile(r"[^<>&]+")


def verdicts_path() -> Path | None:
    for root in (_HERE.parent, _HERE.parents[1]):  # zip root, then repository root
        candidate = root / RELATIVE
        if candidate.is_file():
            return candidate
    return None


@cache
def _doc() -> dict[str, Any]:
    path = verdicts_path()
    if path is None:
        return {}
    doc = json.loads(path.read_text(encoding="utf-8"))
    return doc if isinstance(doc, dict) and doc.get("schemaVersion") == 1 else {}


def _part(name: str) -> dict[str, Any]:
    value = _doc().get(name)
    return value if isinstance(value, dict) else {}


def _sounds() -> dict[str, Any]:
    return _part("sounds")


def _items() -> dict[str, Any]:
    return _part("items")


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


def _clip_body(entry: Any) -> str | None:
    """The body inside the ADR-0014 wrapper of an entry's chosen clip, or None."""
    clip = entry.get("clip") if isinstance(entry, dict) else None
    ssml = clip.get("ssml") if isinstance(clip, dict) else None
    if not (isinstance(ssml, str) and ssml.startswith(_WRAP_HEAD) and ssml.endswith(_WRAP_TAIL)):
        return None
    body = ssml[len(_WRAP_HEAD) : -len(_WRAP_TAIL)]
    return body or None


def _as_draft(body: str) -> tuple[str, str]:
    """("text", body) when the body has no markup, else ("ssml", body): a plain word stays editable as plain text."""
    return ("text", body) if _PLAIN.fullmatch(body) else ("ssml", body)


def starting_body(
    speech_id: str, kind: str, sounds: dict[str, Any] | None = None, items: dict[str, Any] | None = None
) -> tuple[str, str] | None:
    """(field, value) for a new definition's first draft, `field` "text" or "ssml"; None when there is nothing to
    suggest. The caller still checks it like any draft (it never bypasses the SSML allow-list)."""
    sounds = _sounds() if sounds is None else sounds
    items = _items() if items is None else items
    item = items.get(speech_id)
    if isinstance(item, dict) and item.get("kind") == kind and (body := _clip_body(item)) is not None:
        return _as_draft(body)
    if kind == "PHONEME" and speech_id.startswith(PHONEME_PREFIX):
        name = speech_id.removeprefix(PHONEME_PREFIX)
        sound = sounds.get(name)
        if (body := _clip_body(sound)) is not None:
            return _as_draft(body)
        xsampa = sound.get("xsampa") if isinstance(sound, dict) else None
        if isinstance(xsampa, str) and _XSAMPA.fullmatch(xsampa) and '"' not in xsampa:
            return "ssml", f'<phoneme alphabet="x-sampa" ph="{_esc(xsampa)}">{_esc(name)}</phoneme>.'
        return None
    if kind == "WORD" and speech_id.startswith(WORD_PREFIX):
        word = speech_id.removeprefix(WORD_PREFIX).replace("-", " ")
        return ("text", f"{word}.") if word.strip() else None
    if kind == "LETTER_NAME" and speech_id.startswith(LETTER_PREFIX):
        letter = speech_id.removeprefix(LETTER_PREFIX)
        return ("text", f"{letter.upper()}.") if len(letter) == 1 and letter.isalpha() else None
    return None


def _esc(value: str) -> str:
    return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
