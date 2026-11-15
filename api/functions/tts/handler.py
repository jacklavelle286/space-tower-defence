"""tts: the dedicated speech service (plan G §11 R15-R16, E §E.4, E.6.3; Phase 19, M1-18).

R15 `POST /api/speech` (player) resolves a clip and signs a URL. It never calls Polly and never writes anything
(D-12, N-1): one consistent GetItem of the caller's own slot (`U#<sub>` / `SLOT#<runId>#<slotId>`), the clip key from
the slot's pinned clips map, one HeadObject (existence, size and `sha256`), and a 300-second presigned GET. A missing
object is `503 SPEECH_UNAVAILABLE`, written at ERROR on the request's one log line, which the `speech-unavailable`
metric filter counts. Ownership, slot and variant failures are one identical `404 NOT_FOUND`.

R16 `POST /api/admin/speech/preview` (operator, exact group `admin`) is the only Polly path in the system. It builds the
synthesis input (shared/clipkey.py: voice and engine from configuration, never the request), and calls Polly only if the
object is absent. The object is stored with `If-None-Match: *` (never overwritten) and a SHA-256 checksum; a 412 means
another request stored the same clip first, and that object is used.

Where `sha256` comes from (U-036, ADR-0021): preview sends the MP3's SHA-256 as the S3 checksum (S3 verifies it on
receipt) and also stores the same value, as hex, in the object metadata `sha256`. R15 asks HeadObject for the checksum
(`ChecksumMode=ENABLED`) and uses it when S3 returns a full-object SHA-256; otherwise it uses the metadata. Both are
written so R15 works whichever way the real bucket answers; Phase 19 could not check the real bucket (that needs a
write). An object with neither is unusable and answers 503 like a missing one.

Everything a test controls comes in through `Deps`; the clients are created on first use, after authorisation.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import os
import re
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from functools import cache
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from shared.auth import OPERATOR, PLAYER
from shared.body import json_object
from shared.clipkey import (
    CLIP_KEY,
    CONTENT_TYPE,
    KINDS,
    ClipInputError,
    SpeechConfig,
    clip_key,
    object_key,
    polly_request,
    speech_input,
)
from shared.data import GAME_TABLE_ENV, DynamoTable, table_from_env
from shared.errors import ApiError, json_response
from shared.log import ApiLogger
from shared.router import Request, Router
from shared.rules.contracts import LIMITS
from shared.runs import slot_sk

# This function's allow-list. tests/unit/test_routes_contract.py checks it equals contracts/routes.json.
ROUTES: dict[str, str] = {
    "POST /api/speech": PLAYER,
    "POST /api/admin/speech/preview": OPERATOR,
}

URL_SECONDS: int = LIMITS["speechUrlSeconds"]
UUID = re.compile(LIMITS["ids"]["uuid"].removeprefix("^").removesuffix("$"))
SLOT_ID = re.compile(LIMITS["ids"]["slotId"].removeprefix("^").removesuffix("$"))
SPEECH_ID = re.compile(LIMITS["ids"]["keyId"].removeprefix("^").removesuffix("$"))
VARIANT = re.compile(r"prompt|instruction|answer|option-[a-f]|bin-[a-z0-9]{1,8}|intro-[1-3]")  # G R15
SHA256_HEX = re.compile(r"[0-9a-f]{64}")
METADATA_SHA256 = "sha256"  # x-amz-meta-sha256
MISSING = frozenset({"404", "NoSuchKey", "NotFound"})
LOST_RACE = frozenset({"PreconditionFailed", "ConditionalRequestConflict"})  # 412; 409 while another put is in flight


@dataclass(frozen=True)
class AudioStore:
    """Where clips live: the audio bucket and its clip prefix (AUDIO_BUCKET, CLIP_PREFIX)."""

    bucket: str
    clip_prefix: str

    @classmethod
    def from_env(cls) -> AudioStore:
        return cls(bucket=os.environ["AUDIO_BUCKET"], clip_prefix=os.environ["CLIP_PREFIX"])


def s3_client() -> Any:
    """SigV4 on the regional virtual-hosted endpoint, so a presigned URL names the bucket's own region and the
    browser's GET is never redirected (a redirect would break the CORS fetch)."""
    region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION") or "eu-west-2"
    return boto3.client(
        "s3",
        region_name=region,
        endpoint_url=f"https://s3.{region}.amazonaws.com",
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )


_container_s3 = cache(s3_client)  # one client per Lambda container, made on first use
_container_polly = cache(lambda: boto3.client("polly"))


@dataclass(frozen=True)
class Deps:
    game: Callable[[], DynamoTable] = lambda: table_from_env(GAME_TABLE_ENV)
    s3: Callable[[], Any] = _container_s3
    polly: Callable[[], Any] = _container_polly
    store: Callable[[], AudioStore] = AudioStore.from_env
    config: Callable[[], SpeechConfig] = SpeechConfig.from_env


# --- Request checks (G §1.4: unknown fields refused; problems named by field and rule, never by value) --------------

Rule = Callable[[Any], str | None]


def _pattern(pattern: re.Pattern[str]) -> Rule:
    return lambda value: "type" if not isinstance(value, str) else None if pattern.fullmatch(value) else "pattern"


def _string(value: Any) -> str | None:
    return None if isinstance(value, str) else "type"


def _kind(value: Any) -> str | None:
    return None if value in KINDS else "enum"


SPEECH_FIELDS: dict[str, tuple[bool, Rule]] = {
    "runId": (True, _pattern(UUID)),
    "slotId": (True, _pattern(SLOT_ID)),
    "variant": (True, _pattern(VARIANT)),
}
PREVIEW_FIELDS: dict[str, tuple[bool, Rule]] = {
    "kind": (True, _kind),
    "speechId": (False, _pattern(SPEECH_ID)),
    "text": (False, _string),  # exactly one of text/ssml: checked after the field rules
    "ssml": (False, _string),
}


def _checked(body: Mapping[str, Any], fields: Mapping[str, tuple[bool, Rule]]) -> dict[str, Any]:
    """The body's fields if every rule passes; else VALIDATION_FAILED listing every problem."""
    problems: list[dict[str, str]] = []
    if any(key not in fields for key in body):
        problems.append({"field": "body", "rule": "additionalProperties"})
    for name, (required, rule) in fields.items():
        if name not in body:
            if required:
                problems.append({"field": name, "rule": "required"})
            continue
        problem = rule(body[name])
        if problem is not None:
            problems.append({"field": name, "rule": problem})
    if problems:
        raise ApiError("VALIDATION_FAILED", details=problems)
    return {name: body[name] for name in fields if name in body}


# --- S3 helpers -----------------------------------------------------------------------------------------------------


def _code(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", ""))


def _head(s3: Any, store: AudioStore, key: str) -> dict[str, Any] | None:
    """HeadObject with checksum mode, or None when the object is missing (404: the role has the prefix-scoped
    ListBucket, so S3 says 404 rather than 403; a 403 is a real permission fault and is raised, E §E.4.2)."""
    try:
        return s3.head_object(Bucket=store.bucket, Key=key, ChecksumMode="ENABLED")
    except ClientError as error:
        if _code(error) in MISSING:
            return None
        raise


def stored_sha256(head: Mapping[str, Any]) -> str | None:
    """Hex SHA-256 of the object's bytes: S3's full-object checksum if it returned one, else the metadata value."""
    checksum = head.get("ChecksumSHA256")
    composite = head.get("ChecksumType") == "COMPOSITE" or (isinstance(checksum, str) and "-" in checksum)
    if isinstance(checksum, str) and not composite:
        try:
            digest = base64.b64decode(checksum, validate=True)
        except (binascii.Error, ValueError):
            digest = b""
        if len(digest) == 32:
            return digest.hex()
    metadata = head.get("Metadata")
    value = metadata.get(METADATA_SHA256) if isinstance(metadata, Mapping) else None
    return value if isinstance(value, str) and SHA256_HEX.fullmatch(value) else None


def _url(s3: Any, store: AudioStore, key: str) -> str:
    """A presigned GET (signing is local: no AWS call). Never logged."""
    return s3.generate_presigned_url("get_object", Params={"Bucket": store.bucket, "Key": key}, ExpiresIn=URL_SECONDS)


def _synthesise(polly: Any, doc: Mapping[str, Any]) -> bytes:
    """Polly's MP3 for `doc`, or ApiError. Polly reports throttling as HTTP 400 ThrottlingException (G R16)."""
    try:
        response = polly.synthesize_speech(**polly_request(doc))
    except ClientError as error:
        code = "THROTTLED" if _code(error) == "ThrottlingException" else "SPEECH_SYNTHESIS_FAILED"
        raise ApiError(code) from None
    except BotoCoreError:
        raise ApiError("SPEECH_SYNTHESIS_FAILED") from None
    stream = response.get("AudioStream")
    try:
        audio = stream.read() if stream is not None else b""
    except BotoCoreError:
        raise ApiError("SPEECH_SYNTHESIS_FAILED") from None
    finally:
        if stream is not None:
            stream.close()
    if not audio or response.get("ContentType") != CONTENT_TYPE:
        raise ApiError("SPEECH_SYNTHESIS_FAILED")
    return audio


def _store(s3: Any, store: AudioStore, key: str, audio: bytes) -> None:
    """Create-only put with the SHA-256 checksum (S3 checks it on receipt) and the same value as metadata."""
    digest = hashlib.sha256(audio).digest()
    try:
        s3.put_object(
            Bucket=store.bucket,
            Key=key,
            Body=audio,
            ContentType=CONTENT_TYPE,
            ChecksumAlgorithm="SHA256",
            ChecksumSHA256=base64.b64encode(digest).decode("ascii"),
            Metadata={METADATA_SHA256: digest.hex()},
            IfNoneMatch="*",
        )
    except ClientError as error:
        if _code(error) not in LOST_RACE:
            raise
        # Another request stored this clip first. Its bytes are the clip from now on; ours are dropped.


# --- Handlers -------------------------------------------------------------------------------------------------------


def make_router(deps: Deps, logger: ApiLogger | None = None) -> Router:
    """The router with both speech routes bound to `deps`."""
    logger = logger or ApiLogger("tts")

    def post_speech(request: Request) -> dict[str, Any]:
        body = _checked(json_object(request.event), SPEECH_FIELDS)
        run_id, slot_id, variant = body["runId"], body["slotId"], body["variant"]
        request.log.update(runId=run_id, slotId=slot_id)
        # The caller's own key: another child's runId is simply a missing item (spine S8.1 G11).
        slot = deps.game().get_item(f"U#{request.caller.sub}", slot_sk(run_id, slot_id), attributes=("clips",))
        clips = slot.get("clips") if slot is not None else None
        entry = clips.get(variant) if isinstance(clips, Mapping) else None
        key = entry.get("clipKey") if isinstance(entry, Mapping) else None
        if key is None:
            raise ApiError("NOT_FOUND")  # not yours, no such slot, or no such variant: one identical answer
        if not isinstance(key, str) or not CLIP_KEY.fullmatch(key):
            raise ValueError("pinned clipKey is malformed")  # stored data fault: INTERNAL at ERROR
        store, s3 = deps.store(), deps.s3()
        location = object_key(key, store.clip_prefix)
        head = _head(s3, store, location)
        sha256 = stored_sha256(head) if head is not None else None
        if head is None or sha256 is None:
            if head is not None:
                request.log["errorType"] = "ClipChecksumMissing"
            raise ApiError("SPEECH_UNAVAILABLE")
        return json_response(
            200,
            {
                "clipKey": key,
                "sha256": sha256,
                "url": _url(s3, store, location),
                "expiresInSeconds": URL_SECONDS,
                "contentType": CONTENT_TYPE,
                "bytes": int(head["ContentLength"]),
            },
        )

    def post_preview(request: Request) -> dict[str, Any]:
        body = _checked(json_object(request.event), PREVIEW_FIELDS)
        if "speechId" in body:
            request.log["speechId"] = body["speechId"]  # for logging only (G R16)
        try:
            doc = speech_input(body["kind"], deps.config(), text=body.get("text"), ssml=body.get("ssml"))
        except ClipInputError as error:
            raise ApiError("VALIDATION_FAILED", details=[{"field": error.field, "rule": error.rule}]) from None
        key = clip_key(doc)
        store, s3 = deps.store(), deps.s3()
        location = object_key(key, store.clip_prefix)
        if _head(s3, store, location) is None:  # synthesise once ever (content-addressed)
            _store(s3, store, location, _synthesise(deps.polly(), doc))
        return json_response(200, {"clipKey": key, "url": _url(s3, store, location), "expiresInSeconds": URL_SECONDS})

    handlers = {
        "POST /api/speech": post_speech,
        "POST /api/admin/speech/preview": post_preview,
    }
    return Router(routes=ROUTES, handlers=handlers, logger=logger)


DEFAULT_DEPS = Deps()
ROUTER = make_router(DEFAULT_DEPS)


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    return ROUTER.handle(event)
