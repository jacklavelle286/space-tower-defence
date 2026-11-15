"""Canonical synthesis input and clip key for Polly clips (Phase 18, M0-11).

This is the recipe Phase 19's ``api/shared/clipkey.py`` must reproduce byte for byte. Its vectors are in
``contracts/fixtures/clipkey/vectors.json``; Phase 19's clip-key test reads the same file.

Sources: spine S5.2 and ADR-0009 (the key hashes text/SSML, locale, voice, engine, output format, generation number);
docs/plan/sources/06-polly-tts.md section 9 (field list and canonicalisation) and section 12 (24000 Hz, SSML always,
no lexicons). Stdlib only, so the spike needs no install.

The rule that keeps the key honest: **hash exactly what is sent to Polly**. ``synthesis_input`` refuses text that is not
already canonical instead of normalising it, so no transformation can sit between the hash and the request.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from xml.sax.saxutils import escape

KEY_SCHEMA = 1
PROVIDER = "polly"
LANGUAGE_CODE = "en-GB"
TEXT_TYPE = "ssml"
OUTPUT_FORMAT = "mp3"
SAMPLE_RATE = "24000"  # a string, as SynthesizeSpeech takes it; sent explicitly, never the default
GENERATION = 1
CLIP_PREFIX = "tts/v1/"

_SPACE_RUN = re.compile(r"\s+")

# --- SSML templates (frozen by ADR-0014 once the owner has listened) -------------------------------------------------
# Every clip is one <speak> with a short lead-in and tail break to protect clip edges (06 section 5.3 option 4).
WRAPPER = '<speak><break time="150ms"/>{body}<break time="250ms"/></speak>'
PHONEME = '<phoneme alphabet="x-sampa" ph="{ph}">{text}</phoneme>'
# Body forms. {PH} is PHONEME filled in; {TEXT} is escaped plain text. A closing full stop gives a falling contour.
BODY_FORMS = {
    "PH": "{PH}.",
    "SLOW70": '<prosody rate="70%">{PH}</prosody>.',
    "FAST130": '<prosody rate="130%">{PH}</prosody>.',
    "TEXT": "{TEXT}",
    "TEXT90": '<prosody rate="90%">{TEXT}</prosody>',
}


def canonical_text(value: str) -> str:
    """NFC, each whitespace run (line breaks too) to one space, trimmed. Done once, when a definition is saved."""
    return _SPACE_RUN.sub(" ", unicodedata.normalize("NFC", value)).strip()


def _esc(value: str) -> str:
    return escape(value, {'"': "&quot;", "'": "&apos;"})


def build_ssml(form: str, *, ph: str | None = None, text: str) -> str:
    """Fill one body form into the wrapper. X-SAMPA is ASCII, so no code-point ambiguity (06 section 9.2)."""
    if form not in BODY_FORMS:
        raise ValueError(f"unknown body form {form!r}")
    uses_ph = "{PH}" in BODY_FORMS[form]
    if uses_ph != (ph is not None):
        raise ValueError(f"form {form} {'needs' if uses_ph else 'takes no'} ph")
    if ph is not None and not ph.isascii():
        raise ValueError("ph must be X-SAMPA (ASCII)")
    fragment = PHONEME.format(ph=_esc(ph), text=_esc(text)) if ph is not None else ""
    body = BODY_FORMS[form].replace("{PH}", fragment).replace("{TEXT}", _esc(text))
    return canonical_text(WRAPPER.format(body=body))


def synthesis_input(ssml: str, *, engine: str, voice_id: str, generation: int = GENERATION) -> dict:
    """The document whose canonical JSON is hashed. Every field changes the bytes Polly returns, or salts the key."""
    if ssml != canonical_text(ssml):
        raise ValueError("ssml is not canonical: canonicalise when the definition is saved, not between hash and send")
    if not (ssml.startswith("<speak>") and ssml.endswith("</speak>")):
        raise ValueError("ssml must be one <speak> element")
    return {
        "keySchema": KEY_SCHEMA,
        "provider": PROVIDER,
        "engine": engine,
        "voiceId": voice_id,
        "languageCode": LANGUAGE_CODE,
        "textType": TEXT_TYPE,
        "text": ssml,
        "outputFormat": OUTPUT_FORMAT,
        "sampleRate": SAMPLE_RATE,
        "lexicons": [],
        "generation": generation,
    }


def canonical_json(doc: dict) -> bytes:
    """Sorted keys, no insignificant whitespace, UTF-8 (06 section 9.2 step 5)."""
    return json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def clip_key(doc: dict) -> str:
    """Lower-case hex SHA-256 of the canonical JSON: the clip's identity."""
    return hashlib.sha256(canonical_json(doc)).hexdigest()


def object_key(doc: dict) -> str:
    """S3 key under the audio bucket's clip prefix: flat, `tts/v1/<clipKey>.mp3` (H section H.4.6). The player route
    knows only the pinned clipKey and `tts` cannot read content, so the object key must follow from the key alone."""
    return f"{CLIP_PREFIX}{clip_key(doc)}.mp3"


def polly_cli_args(doc: dict) -> list[str]:
    """`aws polly synthesize-speech` arguments taken from the document itself, so what is sent is what was hashed."""
    if doc["lexicons"]:
        raise ValueError("lexicons are not used")
    return [
        "polly", "synthesize-speech",
        "--engine", doc["engine"],
        "--voice-id", doc["voiceId"],
        "--language-code", doc["languageCode"],
        "--text-type", doc["textType"],
        "--text", doc["text"],
        "--output-format", doc["outputFormat"],
        "--sample-rate", doc["sampleRate"],
    ]  # fmt: skip
