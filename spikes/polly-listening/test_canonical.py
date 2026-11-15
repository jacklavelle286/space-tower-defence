"""The bake-off renders exactly the canonical input the clip key hashes (Phase 18 test; build-phases.md Phase 18).

Run: api/.venv/bin/python -m pytest spikes/polly-listening -q -o addopts=""
"""

from __future__ import annotations

import hashlib
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import canonical  # noqa: E402
import render  # noqa: E402

VECTORS = json.loads((HERE.parent.parent / "contracts/fixtures/clipkey/vectors.json").read_text(encoding="utf-8"))
ALLOWED_TAGS = {"speak", "break", "phoneme", "prosody"}  # a subset of the G R16 neural allow-list


@pytest.mark.parametrize("vector", VECTORS["vectors"], ids=lambda v: v["name"])
def test_vectors(vector):
    build = vector["build"]
    ssml = canonical.build_ssml(build["form"], ph=build["ph"], text=build["text"])
    doc = canonical.synthesis_input(
        ssml, engine=vector["input"]["engine"], voice_id=vector["input"]["voiceId"],
        generation=vector["input"]["generation"],
    )  # fmt: skip
    assert doc == vector["input"]
    # Independent of canonical.py: sorted-key compact UTF-8 JSON, SHA-256, lower-case hex.
    raw = json.dumps(vector["input"], sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    assert raw.decode("utf-8") == vector["canonicalJson"]
    assert hashlib.sha256(raw).hexdigest() == vector["clipKey"] == canonical.clip_key(doc)
    assert canonical.object_key(doc) == vector["objectKey"]


def test_every_listed_input_changes_the_key():
    keys = [v["clipKey"] for v in VECTORS["vectors"][:4]]  # base, engine, generation, voice
    assert len(set(keys)) == 4


def test_cli_sends_exactly_the_hashed_fields():
    doc = canonical.synthesis_input(canonical.build_ssml("PH", ph="s", text="s"), engine="neural", voice_id="Amy")
    args = canonical.polly_cli_args(doc)
    flags = dict(zip(args[2::2], args[3::2], strict=True))
    assert flags == {
        "--engine": doc["engine"], "--voice-id": doc["voiceId"], "--language-code": doc["languageCode"],
        "--text-type": doc["textType"], "--text": doc["text"], "--output-format": doc["outputFormat"],
        "--sample-rate": doc["sampleRate"],
    }  # fmt: skip


def test_non_canonical_text_is_refused_not_normalised():
    with pytest.raises(ValueError, match="not canonical"):
        canonical.synthesis_input("<speak>ship.</speak> ", engine="neural", voice_id="Amy")
    with pytest.raises(ValueError, match="not canonical"):
        canonical.synthesis_input("<speak>á</speak>", engine="neural", voice_id="Amy")  # NFD


def test_test_set_renders_are_canonical_wellformed_and_allowed():
    plan = render.planned_renders(render.load_test_set(), "Amy", render.ENGINES, None)
    items = {e["itemId"] for e in plan}
    assert 20 <= len(items) <= 30  # D9.1: about 24 items
    for entry in plan:
        assert entry["ssml"] == canonical.canonical_text(entry["ssml"])
        root = ET.fromstring(entry["ssml"])  # noqa: S314
        assert {el.tag for el in root.iter()} <= ALLOWED_TAGS
        assert entry["clipKey"] == canonical.clip_key(entry["doc"])
        args = canonical.polly_cli_args(entry["doc"])
        assert args[args.index("--text") + 1] == entry["ssml"]
    for engine in render.ENGINES:
        assert {e["itemId"] for e in plan if e["engine"] == engine} == items


def test_test_set_matches_the_verdicts_file():
    verdicts = json.loads(render.VERDICTS.read_text(encoding="utf-8"))
    items = render.load_test_set()["items"]
    assert {i["id"] for i in items if i["kind"] == "PHONEME"} == set(verdicts["sounds"])
    assert {i["id"] for i in items if i["kind"] != "PHONEME"} == set(verdicts["items"])
    for item in items:
        if item["kind"] == "PHONEME":
            assert verdicts["sounds"][item["id"]]["xsampa"] == item["variants"][0]["ph"].removesuffix("@")


VOWELS = {"{", "I", "E", "Q", "V", "U", "@", "i", "u", "3", "A", "O", "aI", "eI", "@U", "aU", "OI", "I@", "e@", "U@"}


def test_medium_and_high_risk_sounds_try_every_d91_step2_form():
    """D9.1 step 2: bare <phoneme>, slower and faster prosody rate, and (for a consonant) the small-schwa form."""
    for item in render.load_test_set()["items"]:
        if item["kind"] != "PHONEME" or item["risk"] not in ("medium", "high"):
            continue
        forms = {v["form"] for v in item["variants"] if not v["ph"].endswith("@")}
        assert {"PH", "SLOW70", "FAST130"} <= forms, item["id"]
        if item["variants"][0]["ph"].removesuffix("@") not in VOWELS:
            assert any(v["ph"].endswith("@") for v in item["variants"]), item["id"]


@pytest.mark.parametrize("bad", [{"form": "NOPE", "ph": None}, {"form": "PH", "ph": None}, {"form": "TEXT", "ph": "s"}])
def test_build_ssml_refuses_bad_forms(bad):
    with pytest.raises(ValueError):
        canonical.build_ssml(bad["form"], ph=bad["ph"], text="s")
