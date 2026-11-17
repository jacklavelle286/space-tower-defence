"""game-data-publish: the only writer of game-data/ besides the release (Gate M, LD6; ADR-0037). The work is in
shared/gd_publish.py; this file wires it to AWS and dispatches the event's action.

Invoked by admin-api only (LD7's routes): `publish` asynchronously (InvocationType Event, no retries: its outcome is
kept on the PUB# item), the other actions synchronously. The answer is {"ok": true, ...} or
{"ok": false, "error": {"code", "message", "details"?}}.

Environment: CONTENT_TABLE_NAME, GAME_DATA_BUCKET, GAME_DATA_PREFIX, CHECK_FUNCTION_NAME (game-data-check, Node 24),
FREEZE_PARAMETER (an SSM String parameter, "true" stops every write action; G-8 checks it at the freeze).
"""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from shared.data import table_from_env
from shared.gd_publish import Deps, Publisher, PublishRefused
from shared.log import ApiLogger

CONTENT_TABLE_ENV = "CONTENT_TABLE_NAME"
# The check runs the campaign's blocking bot checks: about 30 s on a laptop core, so allow its whole timeout.
CHECK_TIMEOUT_SECONDS = 300
logger = ApiLogger("game-data-publish")


class S3Store:
    """SiteStore on S3 with conditional writes (If-None-Match / If-Match)."""

    def __init__(self, bucket: str, client: Any = None) -> None:
        self.bucket = bucket
        self.s3 = client or boto3.client("s3")

    def get(self, key: str) -> tuple[bytes, str] | None:
        try:
            response = self.s3.get_object(Bucket=self.bucket, Key=key)
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") == "NoSuchKey":
                return None
            raise
        return response["Body"].read(), str(response["ETag"])

    def create(self, key: str, body: bytes, cache_control: str) -> bool:
        try:
            self.s3.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=body,
                IfNoneMatch="*",
                CacheControl=cache_control,
                ContentType="application/json",
            )
            return True
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") != "PreconditionFailed":
                raise
        found = self.get(key)
        if found is not None and found[0] == body:
            return False
        raise PublishRefused("FILE_EXISTS", f"{key} is already published with other bytes")

    def replace(self, key: str, body: bytes, etag: str | None, cache_control: str) -> bool:
        condition = {"IfMatch": etag} if etag is not None else {"IfNoneMatch": "*"}
        try:
            self.s3.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=body,
                CacheControl=cache_control,
                ContentType="application/json",
                **condition,
            )
            return True
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") in ("PreconditionFailed", "ConditionalRequestConflict"):
                return False
            raise


def lambda_check(function_name: str, client: Any = None) -> Any:
    """Invoke game-data-check synchronously; a function error is raised, never treated as an answer."""
    lam = client or boto3.client(
        "lambda", config=Config(read_timeout=CHECK_TIMEOUT_SECONDS + 10, connect_timeout=5, retries={"max_attempts": 0})
    )

    def call(payload: dict[str, Any]) -> dict[str, Any]:
        response = lam.invoke(FunctionName=function_name, InvocationType="RequestResponse", Payload=json.dumps(payload))
        body = response["Payload"].read()
        if response.get("FunctionError"):
            raise RuntimeError(f"game-data-check failed ({response['FunctionError']})")
        return json.loads(body)

    return call


def ssm_frozen(parameter: str, client: Any = None) -> Any:
    ssm = client or boto3.client("ssm")

    def frozen() -> bool:
        return ssm.get_parameter(Name=parameter)["Parameter"]["Value"].strip().lower() == "true"

    return frozen


def publisher_from_env() -> Publisher:
    return Publisher(
        Deps(
            table=table_from_env(CONTENT_TABLE_ENV),
            site=S3Store(os.environ["GAME_DATA_BUCKET"]),
            check=lambda_check(os.environ["CHECK_FUNCTION_NAME"]),
            frozen=ssm_frozen(os.environ["FREEZE_PARAMETER"]),
            now=lambda: datetime.now(UTC),
            prefix=os.environ.get("GAME_DATA_PREFIX", "game-data/"),
            log=lambda **fields: logger.line(**fields),
        )
    )


def dispatch(publisher: Publisher, event: Mapping[str, Any]) -> dict[str, Any]:
    action = event.get("action")
    by = str(event.get("by") or "")
    try:
        if action == "validate":
            return publisher.validate(event.get("levelId"), event.get("draftRevision"))
        if not by:
            raise PublishRefused("INVALID", "by (the operator) is required")
        if action == "publish":
            return publisher.publish(
                event.get("levelId"),
                event.get("draftRevision"),
                event.get("sourceVersion"),
                event.get("live") is True,
                by,
            )
        if action == "makeLive":
            return publisher.make_live(event.get("campaignVersion"), by)
        if action == "setState":
            return publisher.set_state(event.get("campaignVersion"), event.get("waveSetId"), event.get("state"), by)
        if action == "setTesters":
            return publisher.set_testers(event.get("testers"), by)
        raise PublishRefused("INVALID", "unknown action")
    except PublishRefused as refusal:
        if action == "publish":
            publisher.refuse(event.get("levelId"), event.get("draftRevision"), refusal)
        logger.line("WARNING", action=str(action), result="REFUSED", code=refusal.code)
        return {"ok": False, "error": refusal.body()}
    except Exception as error:
        if action == "publish":
            publisher.refuse(
                event.get("levelId"), event.get("draftRevision"), PublishRefused("INTERNAL", "the publish failed")
            )
        logger.line("ERROR", action=str(action), result="ERROR", errorType=type(error).__name__)
        raise


def handler(event: Mapping[str, Any], context: Any) -> dict[str, Any]:
    return dispatch(publisher_from_env(), event)
