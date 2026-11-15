"""Phase 19 speech service (G §11 R15-R16, E §E.4; M1-18) on moto, with a fake Polly client.

The exit criteria come first: preview of the same input twice calls Polly once; a changed `tts_engine` gives a
different clip key and leaves the approved clip's bytes untouched; the response `sha256` equals the stored bytes' hash;
another child's slot is NOT_FOUND; a missing clip is 503 SPEECH_UNAVAILABLE with exactly one ERROR line that the
`speech-unavailable` metric filter matches.
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import re
from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs, urlsplit

import boto3
import pytest
from boto3.dynamodb.types import TypeSerializer
from botocore.exceptions import ClientError
from conftest import REPO, TABLE, CapturedLogger, event_for, load_handler

from shared.clipkey import SpeechConfig, clip_key, object_key, speech_input
from shared.data import DynamoTable
from shared.runs import slot_sk

tts = load_handler("tts")

BUCKET = "test-audio"
PREFIX = "tts/v1/"
SUB = "a6c2b2b4-7051-70ef-b1e8-739ac38dd0cb"  # the sub in the Phase 5 fixture event
OTHER_SUB = "0f0f0f0f-1111-4222-8333-444444444444"  # made up: a second child on the same family laptop
RUN = "4b1e0c7a-1d2e-4f30-8a4b-5c6d7e8f9a0b"
SLOT = "N-001"
SPEECH = "POST /api/speech"
PREVIEW = "POST /api/admin/speech/preview"
CONFIG = SpeechConfig(voice_id="Amy", engine="generative", phoneme_engine="neural")
SERIALIZER = TypeSerializer()
# The code the `speech-unavailable` metric filter matches, read from the Terraform that defines it.
METRIC_FILTER_CODE = re.search(
    r'"speech-unavailable" = \{[^}]*?pattern\s*=\s*"\{ \$\.code = \\"([A-Z_]+)\\" \}"',
    (REPO / "infrastructure" / "modules" / "monitoring" / "main.tf").read_text(),
)[1]


class Recorder:
    """Wraps a boto3 client: records each call by name, and runs an optional hook before a named call."""

    def __init__(self, client: Any) -> None:
        self.client = client
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self.before: dict[str, Callable[[dict[str, Any]], None]] = {}

    def names(self) -> list[str]:
        return [name for name, _ in self.calls]

    def __getattr__(self, name: str) -> Any:
        target = getattr(self.client, name)

        def call(*args: Any, **kwargs: Any) -> Any:
            self.calls.append((name, kwargs))
            if name in self.before:
                self.before[name](kwargs)
            return target(*args, **kwargs)

        return call


class FakePolly:
    """SynthesizeSpeech answers with bytes derived from the request, so different inputs give different audio."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.error: str | None = None

    def synthesize_speech(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        if self.error is not None:
            raise ClientError({"Error": {"Code": self.error, "Message": "fake"}}, "SynthesizeSpeech")
        audio = b"ID3" + hashlib.sha256(json.dumps(kwargs, sort_keys=True).encode()).digest() * 4
        return {"AudioStream": io.BytesIO(audio), "ContentType": "audio/mpeg", "RequestCharacters": 10}


class Speech:
    """tts wired to moto (game table, audio bucket) and a fake Polly, with a captured log."""

    def __init__(self, ddb: Any, config: SpeechConfig = CONFIG) -> None:
        self.ddb = Recorder(ddb)
        s3 = boto3.client("s3", region_name="eu-west-2")
        s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "eu-west-2"})
        self.raw_s3 = s3
        self.s3 = Recorder(tts.s3_client())  # the handler's own client factory, on moto
        self.polly = FakePolly()
        self.logger = CapturedLogger()
        self.use(config)

    def use(self, config: SpeechConfig) -> None:
        deps = tts.Deps(
            game=lambda: DynamoTable(self.ddb, TABLE),
            s3=lambda: self.s3,
            polly=lambda: self.polly,
            store=lambda: tts.AudioStore(bucket=BUCKET, clip_prefix=PREFIX),
            config=lambda: config,
        )
        self.router = tts.make_router(deps, self.logger)

    def call(self, base: dict, route: str, body: Any, *, operator: bool = False) -> tuple[int, dict]:
        event = event_for(base, route, cognito__groups="[admin]" if operator else None)
        event["body"] = body if isinstance(body, str) else json.dumps(body)
        response = self.router.handle(event)
        return response["statusCode"], json.loads(response["body"])

    def preview(self, base: dict, body: dict) -> tuple[int, dict]:
        return self.call(base, PREVIEW, body, operator=True)

    def speech(self, base: dict, body: dict) -> tuple[int, dict]:
        return self.call(base, SPEECH, body)

    def pin(self, sub: str, clips: dict[str, str], run_id: str = RUN, slot_id: str = SLOT, **extra: Any) -> None:
        item = {
            "pk": f"U#{sub}",
            "sk": slot_sk(run_id, slot_id),
            "slotId": slot_id,
            "status": "RESOLVED",
            "clips": {v: {"speechId": f"sp-{v}", "speechVersion": "1", "clipKey": k} for v, k in clips.items()},
            **extra,
        }
        self.ddb.client.put_item(TableName=TABLE, Item={k: SERIALIZER.serialize(v) for k, v in item.items()})

    def stored(self, key: str) -> dict[str, Any]:
        obj = self.raw_s3.get_object(Bucket=BUCKET, Key=object_key(key, PREFIX))
        return {"body": obj["Body"].read(), "etag": obj["ETag"], "modified": obj["LastModified"]}


@pytest.fixture
def api(ddb: Any) -> Speech:
    return Speech(ddb)


def speech_body(variant: str = "prompt", run_id: str = RUN, slot_id: str = SLOT) -> dict[str, str]:
    return {"runId": run_id, "slotId": slot_id, "variant": variant}


WORD = {"kind": "WORD", "speechId": "word-ship", "text": "ship."}
PHONEME = {
    "kind": "PHONEME",
    "speechId": "phoneme-s",
    "ssml": '<prosody rate="70%"><phoneme alphabet="x-sampa" ph="s">s</phoneme></prosody>.',
}


# --- Exit criteria --------------------------------------------------------------------------------------------------


def test_preview_of_the_same_input_twice_calls_polly_once(api: Speech, player_event: dict) -> None:
    first = api.preview(player_event, WORD)
    second = api.preview(player_event, WORD)

    assert first[0] == second[0] == 200
    assert first[1]["clipKey"] == second[1]["clipKey"]
    assert len(api.polly.calls) == 1
    assert api.s3.names().count("put_object") == 1


def test_changed_tts_engine_gives_a_new_key_and_leaves_approved_bytes_untouched(ddb: Any, player_event: dict) -> None:
    api = Speech(ddb, SpeechConfig(voice_id="Amy", engine="generative", phoneme_engine="neural"))
    _, approved = api.preview(player_event, WORD)
    before = api.stored(approved["clipKey"])

    api.use(SpeechConfig(voice_id="Amy", engine="neural", phoneme_engine="neural"))  # a release changed tts_engine
    _, changed = api.preview(player_event, WORD)

    assert changed["clipKey"] != approved["clipKey"]
    assert api.stored(approved["clipKey"]) == before  # same bytes, same ETag, never rewritten
    assert api.stored(changed["clipKey"])["body"] != before["body"]
    assert [c["Engine"] for c in api.polly.calls] == ["generative", "neural"]


def test_response_sha256_equals_the_stored_bytes_hash(api: Speech, player_event: dict) -> None:
    _, preview = api.preview(player_event, WORD)
    api.pin(SUB, {"prompt": preview["clipKey"]})

    status, body = api.speech(player_event, speech_body())

    stored = api.stored(preview["clipKey"])["body"]
    assert status == 200
    assert body["sha256"] == hashlib.sha256(stored).hexdigest()
    assert body["bytes"] == len(stored)
    assert body["clipKey"] == preview["clipKey"]
    assert body["contentType"] == "audio/mpeg"
    assert body["expiresInSeconds"] == 300
    assert set(body) == {"clipKey", "sha256", "url", "expiresInSeconds", "contentType", "bytes"}


def test_another_childs_slot_is_not_found_like_a_missing_one(api: Speech, player_event: dict) -> None:
    _, preview = api.preview(player_event, WORD)
    api.pin(OTHER_SUB, {"prompt": preview["clipKey"]})  # the other child's slot, same runId and slotId
    api.pin(SUB, {"prompt": preview["clipKey"]}, run_id="7c2d1e0f-3a4b-4c5d-8e6f-7a8b9c0d1e2f")
    api.s3.calls.clear()

    answers = [
        api.speech(player_event, speech_body()),  # someone else's run
        api.speech(player_event, speech_body(slot_id="N-002")),  # no such slot
        api.speech(player_event, speech_body(variant="option-a", run_id="7c2d1e0f-3a4b-4c5d-8e6f-7a8b9c0d1e2f")),
    ]

    for status, body in answers:
        assert status == 404
        assert {k: v for k, v in body["error"].items() if k != "requestId"} == {
            "code": "NOT_FOUND",
            "message": "Not found",
        }
    gets = [kwargs for name, kwargs in api.ddb.calls if name == "get_item"]
    assert all(g["Key"]["pk"] == {"S": f"U#{SUB}"} and g["ConsistentRead"] is True for g in gets)
    assert "head_object" not in api.s3.names()  # nothing about the clip is revealed


def test_missing_clip_is_503_with_exactly_one_error_line(api: Speech, player_event: dict) -> None:
    key = clip_key(speech_input("WORD", CONFIG, text="never previewed."))
    api.pin(SUB, {"prompt": key})

    status, body = api.speech(player_event, speech_body())

    assert status == 503
    assert body["error"]["code"] == "SPEECH_UNAVAILABLE"
    lines = api.logger.lines()
    matching = [line for line in lines if line.get("code") == METRIC_FILTER_CODE]
    assert len(lines) == 1 and len(matching) == 1
    [line] = matching
    assert line["level"] == "ERROR"
    assert line["status"] == 503
    assert line["routeKey"] == SPEECH
    assert line["runId"] == RUN and line["slotId"] == SLOT
    assert "droppedFields" not in line


# --- Player route (R15) ---------------------------------------------------------------------------------------------


def test_player_route_never_calls_polly_or_writes(api: Speech, player_event: dict) -> None:
    api.pin(SUB, {"prompt": "ab" * 32})
    api.speech(player_event, speech_body())  # missing object
    api.speech(player_event, speech_body(variant="answer"))  # missing variant

    assert api.polly.calls == []
    assert set(api.s3.names()) <= {"head_object"}
    assert set(api.ddb.names()) == {"get_item"}


def test_player_route_is_one_consistent_get_and_one_head(api: Speech, player_event: dict) -> None:
    _, preview = api.preview(player_event, WORD)
    api.pin(SUB, {"prompt": preview["clipKey"]})
    api.ddb.calls.clear()
    api.s3.calls.clear()

    status, _ = api.speech(player_event, speech_body())

    assert status == 200
    [(name, get)] = api.ddb.calls
    assert name == "get_item"
    assert get["ConsistentRead"] is True
    assert get["Key"] == {"pk": {"S": f"U#{SUB}"}, "sk": {"S": f"SLOT#{RUN}#{SLOT}"}}
    assert api.s3.names() == ["head_object", "generate_presigned_url"]
    assert api.s3.calls[0][1]["ChecksumMode"] == "ENABLED"


def test_url_is_presigned_for_300_seconds_on_the_regional_endpoint_and_not_logged(
    api: Speech, player_event: dict
) -> None:
    _, preview = api.preview(player_event, WORD)
    api.pin(SUB, {"prompt": preview["clipKey"]})

    _, body = api.speech(player_event, speech_body())

    url = urlsplit(body["url"])
    query = parse_qs(url.query)
    assert url.scheme == "https"
    assert url.netloc == f"{BUCKET}.s3.eu-west-2.amazonaws.com"
    assert url.path == "/" + object_key(preview["clipKey"], PREFIX)
    assert query["X-Amz-Expires"] == ["300"]
    assert query["X-Amz-Algorithm"] == ["AWS4-HMAC-SHA256"]
    assert "/eu-west-2/s3/aws4_request" in query["X-Amz-Credential"][0]
    log = api.logger.stream.getvalue()
    assert "X-Amz" not in log and preview["clipKey"] not in log


def test_the_signed_key_is_the_pinned_one_whatever_the_request_says(api: Speech, player_event: dict) -> None:
    _, word = api.preview(player_event, WORD)
    _, sound = api.preview(player_event, PHONEME)
    api.pin(SUB, {"prompt": word["clipKey"], "answer": sound["clipKey"]})

    _, prompt = api.speech(player_event, speech_body("prompt"))
    _, answer = api.speech(player_event, speech_body("answer"))

    assert (prompt["clipKey"], answer["clipKey"]) == (word["clipKey"], sound["clipKey"])


def test_slot_status_is_not_checked(api: Speech, player_event: dict) -> None:
    _, preview = api.preview(player_event, WORD)
    api.pin(SUB, {"answer": preview["clipKey"]}, status="FAILED")  # resolved slots may replay their answer clip
    assert api.speech(player_event, speech_body("answer"))[0] == 200


@pytest.mark.parametrize(
    ("body", "problem"),
    [
        ({**speech_body(), "text": "ship"}, {"field": "body", "rule": "additionalProperties"}),
        ({**speech_body(), "voiceId": "Brian"}, {"field": "body", "rule": "additionalProperties"}),
        ({**speech_body(), "ssml": "<speak/>"}, {"field": "body", "rule": "additionalProperties"}),
        ({**speech_body(), "variant": "option-g"}, {"field": "variant", "rule": "pattern"}),
        ({**speech_body(), "variant": "prompt\n"}, {"field": "variant", "rule": "pattern"}),
        ({**speech_body(), "runId": RUN.upper()}, {"field": "runId", "rule": "pattern"}),
        ({**speech_body(), "slotId": "X-001"}, {"field": "slotId", "rule": "pattern"}),
        ({**speech_body(), "slotId": 1}, {"field": "slotId", "rule": "type"}),
        ({"runId": RUN, "slotId": SLOT}, {"field": "variant", "rule": "required"}),
    ],
)
def test_player_body_is_identifiers_only(api: Speech, player_event: dict, body: dict, problem: dict) -> None:
    status, answer = api.speech(player_event, body)
    assert status == 400
    assert problem in answer["error"]["details"]
    assert api.ddb.calls == []


@pytest.mark.parametrize(
    "variant", ["prompt", "instruction", "answer", "option-a", "option-f", "bin-short", "bin-a1", "intro-1", "intro-3"]
)
def test_every_catalogued_variant_shape_is_accepted(api: Speech, player_event: dict, variant: str) -> None:
    assert api.speech(player_event, speech_body(variant))[0] == 404  # valid shape, nothing pinned


def test_sha256_falls_back_to_metadata_when_s3_returns_no_checksum(api: Speech, player_event: dict) -> None:
    audio = b"ID3 metadata only"
    key = "cd" * 32
    api.raw_s3.put_object(
        Bucket=BUCKET,
        Key=object_key(key, PREFIX),
        Body=audio,
        ContentType="audio/mpeg",
        Metadata={"sha256": hashlib.sha256(audio).hexdigest()},
    )
    api.pin(SUB, {"prompt": key})

    status, body = api.speech(player_event, speech_body())

    assert status == 200
    assert body["sha256"] == hashlib.sha256(audio).hexdigest()


def test_object_with_no_sha256_at_all_is_unavailable(api: Speech, player_event: dict) -> None:
    key = "ef" * 32
    api.raw_s3.put_object(Bucket=BUCKET, Key=object_key(key, PREFIX), Body=b"ID3", ContentType="audio/mpeg")
    api.pin(SUB, {"prompt": key})

    status, body = api.speech(player_event, speech_body())

    assert (status, body["error"]["code"]) == (503, "SPEECH_UNAVAILABLE")
    [line] = api.logger.lines()
    assert (line["level"], line["errorType"]) == ("ERROR", "ClipChecksumMissing")


def test_stored_sha256_prefers_the_full_object_checksum() -> None:
    digest = hashlib.sha256(b"x").digest()
    b64 = base64.b64encode(digest).decode()
    assert tts.stored_sha256({"ChecksumSHA256": b64, "Metadata": {"sha256": "0" * 64}}) == digest.hex()
    assert tts.stored_sha256({"ChecksumSHA256": b64 + "-3", "Metadata": {"sha256": "1" * 64}}) == "1" * 64
    assert tts.stored_sha256({"ChecksumSHA256": b64, "ChecksumType": "COMPOSITE"}) is None
    assert tts.stored_sha256({"Metadata": {"sha256": "NOT-HEX"}}) is None


def test_a_malformed_pinned_key_is_internal_not_a_path(api: Speech, player_event: dict) -> None:
    api.pin(SUB, {"prompt": "../../other-bucket-key"})
    status, body = api.speech(player_event, speech_body())
    assert (status, body["error"]["code"]) == (500, "INTERNAL")
    assert "head_object" not in api.s3.names()


def test_a_permission_fault_on_head_is_internal_not_unavailable(api: Speech, player_event: dict) -> None:
    api.pin(SUB, {"prompt": "ab" * 32})

    def forbid(kwargs: dict[str, Any]) -> None:
        raise ClientError({"Error": {"Code": "403", "Message": "Forbidden"}}, "HeadObject")

    api.s3.before["head_object"] = forbid
    status, body = api.speech(player_event, speech_body())
    assert (status, body["error"]["code"]) == (500, "INTERNAL")


# --- Preview route (R16) --------------------------------------------------------------------------------------------


def test_preview_stores_create_only_with_checksum_and_metadata(api: Speech, player_event: dict) -> None:
    status, body = api.preview(player_event, WORD)

    assert status == 200
    assert set(body) == {"clipKey", "url", "expiresInSeconds"}
    [put] = [kwargs for name, kwargs in api.s3.calls if name == "put_object"]
    assert put["IfNoneMatch"] == "*"
    assert put["ChecksumAlgorithm"] == "SHA256"
    assert put["Key"] == object_key(body["clipKey"], PREFIX)
    head = api.raw_s3.head_object(Bucket=BUCKET, Key=put["Key"], ChecksumMode="ENABLED")
    stored = api.stored(body["clipKey"])["body"]
    assert base64.b64decode(head["ChecksumSHA256"]) == hashlib.sha256(stored).digest()
    assert head["Metadata"]["sha256"] == hashlib.sha256(stored).hexdigest()
    assert head["ContentType"] == "audio/mpeg"


def test_preview_sends_polly_exactly_the_hashed_input(api: Speech, player_event: dict) -> None:
    _, body = api.preview(player_event, PHONEME)

    [sent] = api.polly.calls
    doc = speech_input("PHONEME", CONFIG, ssml=PHONEME["ssml"])
    assert clip_key(doc) == body["clipKey"]
    assert sent == {
        "Engine": "neural",
        "VoiceId": "Amy",
        "LanguageCode": "en-GB",
        "TextType": "ssml",
        "Text": doc["text"],
        "OutputFormat": "mp3",
        "SampleRate": "24000",
    }


@pytest.mark.parametrize(
    ("kind", "engine"),
    [("WORD", "generative"), ("INSTRUCTION", "generative"), ("DICTATION", "generative"), ("LETTER_NAME", "neural")],
)
def test_engine_comes_from_the_kind(api: Speech, player_event: dict, kind: str, engine: str) -> None:
    api.preview(player_event, {"kind": kind, "text": "b"})
    assert api.polly.calls[-1]["Engine"] == engine


def test_a_lost_race_uses_the_object_already_stored(api: Speech, player_event: dict) -> None:
    def someone_else_first(kwargs: dict[str, Any]) -> None:
        api.raw_s3.put_object(Bucket=BUCKET, Key=kwargs["Key"], Body=b"ID3 first writer", ContentType="audio/mpeg")

    api.s3.before["put_object"] = someone_else_first
    status, body = api.preview(player_event, WORD)

    assert status == 200
    assert api.stored(body["clipKey"])["body"] == b"ID3 first writer"


def test_polly_throttling_is_503_throttled_and_other_errors_502(api: Speech, player_event: dict) -> None:
    api.polly.error = "ThrottlingException"
    assert api.preview(player_event, WORD)[1]["error"]["code"] == "THROTTLED"
    api.polly.error = "InvalidSsmlException"
    status, body = api.preview(player_event, WORD)
    assert (status, body["error"]["code"]) == (502, "SPEECH_SYNTHESIS_FAILED")
    assert "put_object" not in api.s3.names()
    assert api.logger.lines()[-1]["level"] == "ERROR"


def test_preview_logs_speech_id_and_never_the_text(api: Speech, player_event: dict) -> None:
    api.preview(player_event, {"kind": "WORD", "speechId": "word-ship", "text": "secret words."})
    [line] = api.logger.lines()
    assert line["speechId"] == "word-ship"
    assert "secret" not in api.logger.stream.getvalue()


def test_player_token_on_preview_is_forbidden_before_any_call(api: Speech, player_event: dict) -> None:
    status, body = api.call(player_event, PREVIEW, WORD)  # no admin group
    assert (status, body["error"]["code"]) == (403, "FORBIDDEN")
    assert api.polly.calls == [] and api.s3.calls == []


@pytest.mark.parametrize(
    ("body", "problem"),
    [
        ({"kind": "WORD"}, {"field": "body", "rule": "oneOf"}),
        ({"kind": "WORD", "text": "a", "ssml": "a"}, {"field": "body", "rule": "oneOf"}),
        ({"kind": "SONG", "text": "a"}, {"field": "kind", "rule": "enum"}),
        ({"kind": "WORD", "text": "a" * 301}, {"field": "text", "rule": "maxLength"}),
        ({"kind": "WORD", "text": "   "}, {"field": "text", "rule": "minLength"}),
        ({"kind": "WORD", "text": "a\x00b"}, {"field": "text", "rule": "pattern"}),
        ({"kind": "WORD", "text": "a", "voiceId": "Brian"}, {"field": "body", "rule": "additionalProperties"}),
        ({"kind": "WORD", "text": "a", "engine": "neural"}, {"field": "body", "rule": "additionalProperties"}),
        ({"kind": "WORD", "speechId": "Bad Id", "text": "a"}, {"field": "speechId", "rule": "pattern"}),
        ({"kind": "PHONEME", "ssml": '<prosody pitch="high">s</prosody>'}, {"field": "ssml", "rule": "attribute"}),
        ({"kind": "PHONEME", "ssml": "<emphasis>s</emphasis>"}, {"field": "ssml", "rule": "tag"}),
        ({"kind": "PHONEME", "ssml": '<mark name="x"/>s'}, {"field": "ssml", "rule": "tag"}),
        ({"kind": "PHONEME", "ssml": '<lang xml:lang="fr-FR">s</lang>'}, {"field": "ssml", "rule": "tag"}),
        ({"kind": "PHONEME", "ssml": "<amazon:effect>s</amazon:effect>"}, {"field": "ssml", "rule": "xml"}),
        ({"kind": "PHONEME", "ssml": "<speak>s</speak>"}, {"field": "ssml", "rule": "tag"}),
        ({"kind": "PHONEME", "ssml": "<prosody>s"}, {"field": "ssml", "rule": "xml"}),
        ({"kind": "PHONEME", "ssml": "<!DOCTYPE x>s"}, {"field": "ssml", "rule": "declaration"}),
        ({"kind": "PHONEME", "ssml": '<phoneme ph="s">s</phoneme>'}, {"field": "ssml", "rule": "attribute"}),
        ({"kind": "PHONEME", "ssml": '<prosody rate="500%">s</prosody>'}, {"field": "ssml", "rule": "attribute"}),
        # generative (WORD) refuses <phoneme> until the bake-off shows it works
        ({"kind": "WORD", "ssml": PHONEME["ssml"]}, {"field": "ssml", "rule": "tag"}),
    ],
)
def test_preview_validation(api: Speech, player_event: dict, body: dict, problem: dict) -> None:
    status, answer = api.preview(player_event, body)
    assert status == 400
    assert answer["error"]["details"] == [problem]
    assert api.polly.calls == [] and api.s3.calls == []


def test_ssml_allowed_on_each_engine(api: Speech, player_event: dict) -> None:
    neural = '<s><prosody rate="70%" volume="+3dB"><phoneme alphabet="x-sampa" ph="S">sh</phoneme></prosody></s>'
    generative = '<p><s><prosody rate="90%">Find the <sub alias="ship">shp</sub>.</prosody></s></p><break time="1s"/>'
    assert api.preview(player_event, {"kind": "PHONEME", "ssml": neural})[0] == 200
    assert api.preview(player_event, {"kind": "INSTRUCTION", "ssml": generative})[0] == 200


def test_a_misconfigured_voice_is_internal(ddb: Any, player_event: dict) -> None:
    api = Speech(ddb)
    api.router = tts.make_router(
        tts.Deps(
            s3=lambda: api.s3,
            polly=lambda: api.polly,
            store=lambda: tts.AudioStore(bucket=BUCKET, clip_prefix=PREFIX),
            config=lambda: SpeechConfig.from_env(
                {"TTS_VOICE_ID": "Joanna", "TTS_ENGINE": "generative", "TTS_PHONEME_ENGINE": "neural"}
            ),
        ),
        api.logger,
    )
    status, body = api.preview(player_event, WORD)
    assert (status, body["error"]["code"]) == (500, "INTERNAL")
    assert api.polly.calls == []


def test_routes_have_handlers_and_match_the_catalogue() -> None:
    routes = json.loads((REPO / "contracts" / "routes.json").read_text())
    catalogued = {f"{r['method']} {r['path']}" for r in routes["routes"] if r["function"] == "tts"}
    assert set(tts.ROUTER.handlers) == set(tts.ROUTES) == catalogued
