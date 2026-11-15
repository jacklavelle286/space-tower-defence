"""Clip keys: the content address of a speech clip (spine S5.2, E §E.4.1, G R16; ADR-0014, ADR-0009).

A clip's key is the lower-case hex SHA-256 of the canonical JSON of exactly what is sent to Polly:

    {keySchema 1, provider "polly", engine, voiceId, languageCode "en-GB", textType "ssml", text, outputFormat "mp3",
     sampleRate "24000", lexicons [], generation 1}

sorted keys, no whitespace, UTF-8. The recipe and its vectors were frozen in Phase 18
(spikes/polly-listening/canonical.py, contracts/fixtures/clipkey/vectors.json); this module reproduces every clip key
byte for byte and its test reads the same vectors. Two hashes are in play and must not be confused: `clipKey` hashes the
synthesis *input*; `sha256` hashes the MP3 *bytes* (the client checks a download against it, E.9).

One function, `speech_input(kind, text=... | ssml=..., config)`, turns a speech draft into that document. `tts` calls
it for a preview (R16) and `admin-api` will call it at approval (R21, Phase 20) on the *saved* draft, so a preview made
under the wrong kind is refused as `not_previewed` there.

What the server decides, never the request (E §E.4.1a, [CONFIRMED by owner, 2026-11-14]):
- the voice (`TTS_VOICE_ID`), and the engine by kind: `TTS_ENGINE` for WORD, INSTRUCTION, DICTATION;
  `TTS_PHONEME_ENGINE` for PHONEME, LETTER_NAME;
- the voice/engine allow-list, which is here in code because IAM cannot restrict Polly's voice or engine;
- the SSML wrapper (ADR-0014): every clip is `<speak><break time="150ms"/>BODY<break time="250ms"/></speak>`.
  A draft holds either plain `text` (escaped, then wrapped) or an `ssml` *body* (checked against the tag allow-list for
  the engine its kind selects, then wrapped). A `<speak>` element inside the body is refused.

Object keys are flat, `tts/v1/<clipKey>.mp3` (H §H.4.6). The player route knows only the pinned `clipKey` (the slot's
clips map holds `{speechId, speechVersion, clipKey}`, and `tts` cannot read `content`), so the object key must be
derivable from the clip key alone; ADR-0014 and the vectors' `objectKey` record the same flat key.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import unicodedata
import xml.etree.ElementTree as ET
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any
from xml.sax.saxutils import escape

from shared.rules.contracts import LIMITS

KEY_SCHEMA = 1
PROVIDER = "polly"
LANGUAGE_CODE = "en-GB"
TEXT_TYPE = "ssml"
OUTPUT_FORMAT = "mp3"
SAMPLE_RATE = "24000"  # a string, as SynthesizeSpeech takes it; always sent, never Polly's default
GENERATION = 1
CONTENT_TYPE = "audio/mpeg"
CLIP_KEY = re.compile(r"[0-9a-f]{64}")  # use with fullmatch

KINDS = ("WORD", "PHONEME", "LETTER_NAME", "INSTRUCTION", "DICTATION")
PHONEME_KINDS = frozenset({"PHONEME", "LETTER_NAME"})
TEXT_MAX: int = LIMITS["previewTextMaxLength"]

# The voice/engine allow-list (E §E.4.1a: in code, because IAM cannot restrict them). en-GB voices and the engines
# describe-voices lists for them in eu-west-2 [VERIFIED 2026-11-15, ADR-0014 evidence]: Amy is the confirmed voice;
# Emma, Brian and Arthur are the D9.1 fallbacks. `standard` and `long-form` are not used for clips.
ALLOWED_VOICE_ENGINES: frozenset[tuple[str, str]] = frozenset(
    {
        ("Amy", "generative"),
        ("Amy", "neural"),
        ("Brian", "generative"),
        ("Brian", "neural"),
        ("Emma", "neural"),
        ("Arthur", "neural"),
    }
)

# --- The SSML wrapper and tag allow-list (ADR-0014; G R16) ----------------------------------------------------------

WRAPPER = '<speak><break time="150ms"/>{body}<break time="250ms"/></speak>'

_BREAK_TIME = re.compile(r"(?:[0-9]{1,5}ms|[0-9]{1,2}(?:\.[0-9]{1,3})?s)")
_PERCENT = re.compile(r"[0-9]{1,3}%")
_DB = re.compile(r"[+-][0-9]{1,2}(?:\.[0-9])?dB")


def _rate(value: str) -> bool:
    if value in ("x-slow", "slow", "medium", "fast", "x-fast"):
        return True
    return bool(_PERCENT.fullmatch(value)) and 20 <= int(value[:-1]) <= 200  # Polly's documented range


def _volume(value: str) -> bool:
    return value in ("silent", "x-soft", "soft", "medium", "loud", "x-loud") or bool(_DB.fullmatch(value))


# tag -> {attribute: value check}; an attribute not listed is refused, as is a tag not listed for the engine.
_ATTRIBUTES: Mapping[str, Mapping[str, Any]] = {
    "break": {
        "time": lambda v: bool(_BREAK_TIME.fullmatch(v)),
        "strength": lambda v: v in ("none", "x-weak", "weak", "medium", "strong", "x-strong"),
    },
    "phoneme": {"alphabet": lambda v: v in ("x-sampa", "ipa"), "ph": lambda v: 0 < len(v) <= 64},
    "prosody": {"rate": _rate, "volume": _volume},  # never pitch (G R16)
    "s": {},
    "p": {},
    "sub": {"alias": lambda v: 0 < len(v) <= TEXT_MAX},
    "w": {"role": lambda v: v in ("amazon:VB", "amazon:VBD", "amazon:DT", "amazon:IN", "amazon:JJ", "amazon:NN")},
}
_REQUIRED_ATTRIBUTES: Mapping[str, frozenset[str]] = {
    "phoneme": frozenset({"alphabet", "ph"}),
    "sub": frozenset({"alias"}),
}
# G R16. `speak` is the wrapper's, so it never appears in a body. Generative accepts `phoneme` since the Phase 18
# bake-off (ADR-0014: the owner judged generative phoneme renders publishable, so `tts_phoneme_engine` is generative).
# "prosody only around whole sentences" for generative is not enforced structurally [ASSUMPTION]: the bake-off's
# chosen forms wrap a single phoneme in prosody, and the operator hears the result in preview.
SSML_TAGS: Mapping[str, frozenset[str]] = {
    "neural": frozenset({"break", "phoneme", "prosody", "s", "p", "sub", "w"}),
    "generative": frozenset({"break", "phoneme", "prosody", "s", "p", "sub", "w"}),
}

_SPACE_RUN = re.compile(r"\s+")


class ClipInputError(ValueError):
    """A draft that cannot become a synthesis input. `field` and `rule` name the problem, never the value."""

    def __init__(self, field: str, rule: str) -> None:
        super().__init__(f"{field}: {rule}")
        self.field = field
        self.rule = rule


class SpeechConfigError(RuntimeError):
    """The function's TTS_* configuration is outside the allow-list: a deployment fault, answered as INTERNAL."""


@dataclass(frozen=True)
class SpeechConfig:
    """Server-side speech settings (the TTS_* Lambda environment, from the tts_* Terraform variables)."""

    voice_id: str
    engine: str  # WORD, INSTRUCTION, DICTATION
    phoneme_engine: str  # PHONEME, LETTER_NAME
    output_format: str = OUTPUT_FORMAT

    def __post_init__(self) -> None:
        for engine in (self.engine, self.phoneme_engine):
            if (self.voice_id, engine) not in ALLOWED_VOICE_ENGINES:
                raise SpeechConfigError("voice/engine pair is not on the allow-list")
        if self.output_format != OUTPUT_FORMAT:
            raise SpeechConfigError("output format must be mp3")

    @classmethod
    def from_env(cls, environ: Mapping[str, str] | None = None) -> SpeechConfig:
        env = os.environ if environ is None else environ
        try:
            return cls(
                voice_id=env["TTS_VOICE_ID"],
                engine=env["TTS_ENGINE"],
                phoneme_engine=env["TTS_PHONEME_ENGINE"],
                output_format=env.get("TTS_OUTPUT_FORMAT", OUTPUT_FORMAT),
            )
        except KeyError as missing:
            raise SpeechConfigError("a TTS_* environment variable is missing") from missing

    def engine_for(self, kind: str) -> str:
        if kind not in KINDS:
            raise ClipInputError("kind", "enum")
        return self.phoneme_engine if kind in PHONEME_KINDS else self.engine


# --- Canonical text and SSML ----------------------------------------------------------------------------------------


def canonical_text(value: str) -> str:
    """NFC, each whitespace run (line breaks too) to one space, trimmed. Applied when a draft is saved or previewed."""
    return _SPACE_RUN.sub(" ", unicodedata.normalize("NFC", value)).strip()


def _esc(value: str) -> str:
    return escape(value, {'"': "&quot;", "'": "&apos;"})


def _has_control(value: str) -> bool:
    return any(unicodedata.category(ch) == "Cc" for ch in value)


def check_ssml_body(body: str, engine: str) -> None:
    """Raise ClipInputError(field "ssml") unless every element of `body` is on `engine`'s allow-list with allowed
    attributes. No declarations, comments, CDATA or processing instructions (so no DTD or entity tricks)."""
    if engine not in SSML_TAGS:
        raise SpeechConfigError("no SSML allow-list for this engine")
    if "<!" in body or "<?" in body:
        raise ClipInputError("ssml", "declaration")
    try:
        root = ET.fromstring(f"<speak>{body}</speak>")  # noqa: S314 - no DTD can reach the parser (checked above)
    except ET.ParseError:
        raise ClipInputError("ssml", "xml") from None
    allowed = SSML_TAGS[engine]
    for element in root.iter():
        if element is root:
            continue
        if element.tag not in allowed:
            raise ClipInputError("ssml", "tag")
        checks = _ATTRIBUTES[element.tag]
        for name, value in element.attrib.items():
            if name not in checks or not checks[name](value):
                raise ClipInputError("ssml", "attribute")
        if not _REQUIRED_ATTRIBUTES.get(element.tag, frozenset()) <= element.attrib.keys():
            raise ClipInputError("ssml", "attribute")


def wrap(body: str) -> str:
    """The ADR-0014 wrapper around a body, canonicalised."""
    return canonical_text(WRAPPER.format(body=body))


def speech_ssml(engine: str, *, text: str | None = None, ssml: str | None = None) -> str:
    """The full SSML document for a draft's `text` (escaped) or `ssml` body (checked). Exactly one must be given."""
    if (text is None) == (ssml is None):
        raise ClipInputError("body", "oneOf")
    field, value = ("text", text) if text is not None else ("ssml", ssml)
    if not isinstance(value, str):
        raise ClipInputError(field, "type")
    if len(value) > TEXT_MAX:
        raise ClipInputError(field, "maxLength")
    value = canonical_text(value)
    if not value:
        raise ClipInputError(field, "minLength")
    if _has_control(value):
        raise ClipInputError(field, "pattern")
    if field == "text":
        return wrap(_esc(value))
    check_ssml_body(value, engine)
    return wrap(value)


# --- The synthesis input and its keys -------------------------------------------------------------------------------


def synthesis_input(ssml: str, *, engine: str, voice_id: str, generation: int = GENERATION) -> dict[str, Any]:
    """The document whose canonical JSON is hashed. Every field changes the bytes Polly returns, or salts the key."""
    if (voice_id, engine) not in ALLOWED_VOICE_ENGINES:
        raise SpeechConfigError("voice/engine pair is not on the allow-list")
    if ssml != canonical_text(ssml):
        raise ValueError("ssml is not canonical: canonicalise before hashing, never between hash and send")
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


def speech_input(
    kind: str, config: SpeechConfig, *, text: str | None = None, ssml: str | None = None
) -> dict[str, Any]:
    """A speech draft (kind + text or ssml body) as the synthesis input, with voice and engine from `config`."""
    engine = config.engine_for(kind)
    return synthesis_input(speech_ssml(engine, text=text, ssml=ssml), engine=engine, voice_id=config.voice_id)


def canonical_json(doc: Mapping[str, Any]) -> bytes:
    """Sorted keys, no insignificant whitespace, UTF-8."""
    return json.dumps(doc, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def clip_key(doc: Mapping[str, Any]) -> str:
    """Lower-case hex SHA-256 of the canonical JSON: the clip's identity."""
    return hashlib.sha256(canonical_json(doc)).hexdigest()


def object_key(key: str, clip_prefix: str) -> str:
    """`<clip prefix><clipKey>.mp3` (H §H.4.6). Refuses anything that is not a clip key, so a stored value can never
    point outside the prefix."""
    if not CLIP_KEY.fullmatch(key):
        raise ValueError("not a clip key")
    if not clip_prefix.endswith("/"):
        raise ValueError("clip prefix must end with /")
    return f"{clip_prefix}{key}.mp3"


def polly_request(doc: Mapping[str, Any]) -> dict[str, Any]:
    """SynthesizeSpeech parameters taken from the document itself, so what is sent is what was hashed."""
    if doc["lexicons"]:
        raise ValueError("lexicons are not used")
    return {
        "Engine": doc["engine"],
        "VoiceId": doc["voiceId"],
        "LanguageCode": doc["languageCode"],
        "TextType": doc["textType"],
        "Text": doc["text"],
        "OutputFormat": doc["outputFormat"],
        "SampleRate": doc["sampleRate"],
    }
