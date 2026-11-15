"""The audio bucket, as `tts` and `admin-api` both see it (plan E §E.4.2, H §H.4.6; Phase 19, shared from Phase 20).

`tts` writes clips (preview, R16) and reads them for players (R15); `admin-api` only reads one at approval (R21) to
prove the saved draft was previewed and to record the clip's `sha256` and render date (D §D9.3, F §12.6 C7). Both
must find an object and its hash the same way, so the helpers live here.

Where `sha256` comes from (U-036, ADR-0021): preview sends the MP3's SHA-256 as the S3 checksum (S3 verifies it on
receipt) and also stores the same value, as hex, in the object metadata `sha256`. A reader asks HeadObject for the
checksum (`ChecksumMode=ENABLED`) and uses it when S3 returns a full-object SHA-256; otherwise it uses the metadata.
"""

from __future__ import annotations

import base64
import binascii
import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

SHA256_HEX = re.compile(r"[0-9a-f]{64}")
METADATA_SHA256 = "sha256"  # x-amz-meta-sha256
MISSING = frozenset({"404", "NoSuchKey", "NotFound"})


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


def client_error_code(error: ClientError) -> str:
    return str(error.response.get("Error", {}).get("Code", ""))


def head_clip(s3: Any, store: AudioStore, key: str) -> dict[str, Any] | None:
    """HeadObject with checksum mode, or None when the object is missing (404: the role has the prefix-scoped
    ListBucket, so S3 says 404 rather than 403; a 403 is a real permission fault and is raised, E §E.4.2)."""
    try:
        return s3.head_object(Bucket=store.bucket, Key=key, ChecksumMode="ENABLED")
    except ClientError as error:
        if client_error_code(error) in MISSING:
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
