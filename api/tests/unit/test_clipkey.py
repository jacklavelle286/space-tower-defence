"""shared/clipkey.py against the Phase 18 vectors (contracts/fixtures/clipkey/vectors.json, ADR-0014), and the
voice/engine allow-list in code (E §E.4.1a)."""

from __future__ import annotations

import hashlib
import json
from typing import Any

import pytest
from conftest import REPO

from shared.clipkey import (
    ALLOWED_VOICE_ENGINES,
    SSML_TAGS,
    ClipInputError,
    SpeechConfig,
    SpeechConfigError,
    canonical_json,
    clip_key,
    object_key,
    polly_request,
    speech_input,
    speech_ssml,
    synthesis_input,
    wrap,
)

VECTORS = json.loads((REPO / "contracts" / "fixtures" / "clipkey" / "vectors.json").read_text(encoding="utf-8"))
HEAD = '<speak><break time="150ms"/>'
TAIL = '<break time="250ms"/></speak>'
ENV = {"TTS_VOICE_ID": "Amy", "TTS_ENGINE": "generative", "TTS_PHONEME_ENGINE": "neural", "TTS_OUTPUT_FORMAT": "mp3"}


@pytest.mark.parametrize("vector", VECTORS["vectors"], ids=lambda v: v["name"])
def test_clip_key_vectors(vector: dict[str, Any]) -> None:
    given = vector["input"]
    doc = synthesis_input(
        given["text"], engine=given["engine"], voice_id=given["voiceId"], generation=given["generation"]
    )
    assert doc == given
    assert canonical_json(doc).decode("utf-8") == vector["canonicalJson"]
    assert clip_key(doc) == vector["clipKey"]
    # Independent of the module: sorted-key compact UTF-8 JSON, SHA-256, lower-case hex.
    assert hashlib.sha256(vector["canonicalJson"].encode("utf-8")).hexdigest() == vector["clipKey"]


@pytest.mark.parametrize("vector", VECTORS["vectors"], ids=lambda v: v["name"])
def test_drafts_build_the_vector_text(vector: dict[str, Any]) -> None:
    """A draft's `text` (TEXT form) or `ssml` body (every other form) wraps to exactly the vector's SSML."""
    given, build = vector["input"], vector["build"]
    if build["form"] == "TEXT":
        assert speech_ssml(given["engine"], text=build["text"]) == given["text"]
        return
    body = given["text"].removeprefix(HEAD).removesuffix(TAIL)
    assert wrap(body) == given["text"]
    if "<phoneme" in body and given["engine"] == "generative":
        with pytest.raises(ClipInputError):  # G R16: phoneme refused on generative until the bake-off passes it
            speech_ssml("generative", ssml=body)
    else:
        assert speech_ssml(given["engine"], ssml=body) == given["text"]


def test_object_key_is_flat_under_the_prefix() -> None:
    for vector in VECTORS["vectors"]:  # the vectors' objectKey (H §H.4.6, ADR-0014)
        assert object_key(vector["clipKey"], "tts/v1/") == vector["objectKey"]
    key = VECTORS["vectors"][0]["clipKey"]
    for bad in ("../x", key.upper(), key + "0", ""):
        with pytest.raises(ValueError, match="clip key"):
            object_key(bad, "tts/v1/")


def test_voice_and_engine_change_the_key() -> None:
    keys = {
        clip_key(speech_input("WORD", SpeechConfig(voice, engine, "neural"), text="ship."))
        for voice, engine in (("Amy", "generative"), ("Amy", "neural"), ("Brian", "generative"))
    }
    assert len(keys) == 3


def test_engine_by_kind() -> None:
    config = SpeechConfig.from_env(ENV)
    assert {kind: config.engine_for(kind) for kind in ("WORD", "INSTRUCTION", "DICTATION")} == dict.fromkeys(
        ("WORD", "INSTRUCTION", "DICTATION"), "generative"
    )
    assert config.engine_for("PHONEME") == config.engine_for("LETTER_NAME") == "neural"
    with pytest.raises(ClipInputError):
        config.engine_for("SONG")


def test_allow_list_is_in_code() -> None:
    assert ("Amy", "generative") in ALLOWED_VOICE_ENGINES
    assert ("Amy", "neural") in ALLOWED_VOICE_ENGINES
    assert all(engine in ("neural", "generative") for _, engine in ALLOWED_VOICE_ENGINES)
    assert set(SSML_TAGS) == {"neural", "generative"}
    assert "phoneme" not in SSML_TAGS["generative"]


@pytest.mark.parametrize(
    "override",
    [
        {"TTS_VOICE_ID": "Joanna"},  # not an en-GB voice on the list
        {"TTS_ENGINE": "standard"},  # allowed by the Terraform variable, not for clips
        {"TTS_ENGINE": "long-form"},
        {"TTS_VOICE_ID": "Emma"},  # Emma has no generative voice
        {"TTS_OUTPUT_FORMAT": "ogg_vorbis"},
    ],
)
def test_config_outside_the_allow_list_is_refused(override: dict[str, str]) -> None:
    with pytest.raises(SpeechConfigError):
        SpeechConfig.from_env({**ENV, **override})


def test_a_fallback_voice_on_its_own_engine_is_allowed() -> None:
    assert SpeechConfig.from_env({**ENV, "TTS_VOICE_ID": "Arthur", "TTS_ENGINE": "neural"}).voice_id == "Arthur"


def test_missing_environment_is_a_config_error() -> None:
    with pytest.raises(SpeechConfigError):
        SpeechConfig.from_env({"TTS_VOICE_ID": "Amy"})


def test_text_is_canonicalised_before_hashing() -> None:
    config = SpeechConfig.from_env(ENV)
    plain = speech_input("WORD", config, text="ship.")
    assert speech_input("WORD", config, text="  ship.\n") == plain
    assert speech_input("WORD", config, text="café.") == speech_input("WORD", config, text="café.")


def test_non_canonical_ssml_is_refused_not_normalised() -> None:
    with pytest.raises(ValueError, match="not canonical"):
        synthesis_input("<speak>ship.</speak> ", engine="neural", voice_id="Amy")


def test_polly_request_is_the_hashed_document() -> None:
    doc = speech_input("PHONEME", SpeechConfig.from_env(ENV), ssml='<phoneme alphabet="x-sampa" ph="s">s</phoneme>.')
    request = polly_request(doc)
    assert request == {
        "Engine": doc["engine"],
        "VoiceId": doc["voiceId"],
        "LanguageCode": doc["languageCode"],
        "TextType": doc["textType"],
        "Text": doc["text"],
        "OutputFormat": doc["outputFormat"],
        "SampleRate": doc["sampleRate"],
    }
