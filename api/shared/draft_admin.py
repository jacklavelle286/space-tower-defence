"""AI drafting jobs in the admin (YG3; owner 2026-11-28, ADR-0056):

    R63 POST /api/admin/draft-jobs           start one: up to five questions on a topic for a school year
    R64 GET  /api/admin/draft-jobs/{jobId}   its state, and its drafts when they are ready

A drafting job rides on the picture machinery (Gate P): the same queue, the same worker (picture-gen, which holds the
OpenAI key and runs for up to 14 minutes), the same job objects under the pictures bucket's jobs/ prefix, and the same
daily and monthly caps (one place per job), so the owner's spending limits bound drafting too. The job item is
`DRAFTJOB` / jobId in the content table. Nothing is saved as an activity here: R64 hands back the drafts (checked again
with the editor's checks, shared/drafting.valid_definitions), and the admin saves the ones the owner keeps through the
ordinary routes (R23 create, then R25 save the draft), to review and publish as any other activity.

States: QUEUED (sent, not claimed), DRAFTING (claimed), READY (result.json), FAILED (error.json, a timeout, or a
message that could not be sent: could_not_start, which gives the cap places back).
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable, Mapping
from datetime import datetime
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from shared import drafting
from shared.audio import client_error_code
from shared.body import json_object
from shared.content import audit_item, audit_key, iso_z, problem
from shared.data import DynamoTable
from shared.errors import ApiError, json_response
from shared.picture_admin import (
    PictureServices,
    Transact,
    _cap_action,
    _get_json,
    _job_path_id,
    _last_modified,
    _only_fields,
    _parse_time,
    invalid,
)
from shared.pictures import (
    DRAW_TIMEOUT,
    JOB_ERROR_MESSAGES,
    JOB_TIMEOUT,
    PICCAP_PK,
    UUID,
    WORKER_ERRORS,
    PictureConfig,
    cap_keys,
    job_key,
    resets_at,
)
from shared.router import Request

DRAFTJOB_PK = "DRAFTJOB"
RESULT_MAX_BYTES = 262_144  # five drafts and their problems are a few kilobytes; anything near this is refused
SMALL_MAX_BYTES = 4_096
_PROBLEM = re.compile(r"[A-Za-z0-9_.]{1,80}:[a-z_]{1,40}")  # "field.path:rule", the only problem text passed on
FIELDS = {"jobId", "topicId", "band", "interactionType", "count", "notes"}


def make_draft_handlers(
    *,
    table: Callable[[], DynamoTable],
    services: PictureServices,
    now: Callable[[], datetime],
    transact: Transact,
) -> dict[str, Callable[[Request], dict[str, Any]]]:
    """R63 and R64, by route key."""

    def start(request: Request) -> dict[str, Any]:
        body = json_object(request.event)
        _only_fields(body, FIELDS, FIELDS - {"notes"})
        problems = [problem(p["field"], p["rule"]) for p in drafting.request_problems(body)]
        job_id = body["jobId"]
        if not (isinstance(job_id, str) and UUID.fullmatch(job_id)):
            problems.append(problem("jobId", "pattern"))
        if problems:
            raise invalid(problems)
        request.log["jobId"] = job_id
        config = services.config()
        moment = now()
        if not config.drawing_on:
            request.log["capPeriod"] = "off"
            raise ApiError(
                "PICTURE_CAP_REACHED",
                message="AI drafting is switched off",
                details={"period": "off", "dailyCap": config.daily_cap, "monthlyCap": config.monthly_cap},
            )
        content = table()
        existing = content.get_item(DRAFTJOB_PK, job_id)
        if existing is not None:
            return again(request, config, existing, moment)  # a retry of the same start: never counted twice
        day, month = cap_keys(moment)
        job: dict[str, Any] = {
            "pk": DRAFTJOB_PK,
            "sk": job_id,
            "jobId": job_id,
            "topicId": body["topicId"],
            "band": body["band"],
            "interactionType": body["interactionType"],
            "count": body["count"],
            "state": "QUEUED",
            "sent": False,
            "startedAt": iso_z(moment),
            "createdBy": request.caller.sub,
            "capDay": day,
            "capMonth": month,
        }
        if body.get("notes"):
            job["notes"] = body["notes"]
        audit_pk, audit_sk = audit_key(moment, f"{job_id}#draft-start")
        failed = transact(
            content,
            [
                _cap_action(content, day, config.daily_cap),
                _cap_action(content, month, config.monthly_cap),
                content.put_action(job, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
                content.put_action(
                    audit_item(audit_pk, audit_sk, "draft-job-start", request.caller.sub, moment, jobId=job_id),
                    condition="attribute_not_exists(#pk)",
                    names={"#pk": "pk"},
                ),
            ],
        )
        if failed is not None:
            if failed[2] == "ConditionalCheckFailed":
                retry = content.get_item(DRAFTJOB_PK, job_id)
                if retry is not None:
                    return again(request, config, retry, moment)
            if failed[0] != "ConditionalCheckFailed" and failed[1] != "ConditionalCheckFailed":
                raise ApiError("THROTTLED")
            period = "month" if failed[1] == "ConditionalCheckFailed" else "day"
            request.log["capPeriod"] = period
            raise ApiError(
                "PICTURE_CAP_REACHED",
                details={
                    "period": period,
                    "resetsAt": iso_z(resets_at(moment, period)),
                    "dailyCap": config.daily_cap,
                    "monthlyCap": config.monthly_cap,
                },
            )
        return send(config, job, moment)

    def send(config: PictureConfig, job: Mapping[str, Any], moment: datetime) -> dict[str, Any]:
        message: dict[str, Any] = {
            "jobType": drafting.JOB_TYPE,
            **{name: job[name] for name in ("jobId", "topicId", "band", "interactionType", "count", "startedAt")},
        }
        if job.get("notes"):
            message["notes"] = job["notes"]
        message = {k: int(v) if k in ("band", "count") else v for k, v in message.items()}
        try:
            services.sqs().send_message(
                QueueUrl=config.queue_url, MessageBody=json.dumps(message, sort_keys=True, separators=(",", ":"))
            )
        except (ClientError, BotoCoreError):
            refund(job, moment)
            raise ApiError("THROTTLED") from None
        table().update_item(
            DRAFTJOB_PK,
            str(job["jobId"]),
            update="SET #sent = :true",
            names={"#sent": "sent", "#pk": "pk"},
            values={":true": True},
            condition="attribute_exists(#pk)",
        )
        return json_response(202, {**summary(job), "state": "QUEUED"})

    def again(request: Request, config: PictureConfig, job: Mapping[str, Any], moment: datetime) -> dict[str, Any]:
        if job.get("state") == "QUEUED" and job.get("sent") is False:
            return send(config, job, moment)
        return json_response(202, summary(job))

    def refund(job: Mapping[str, Any], moment: datetime) -> None:
        """FAILED could_not_start, and both counters get their place back, once (conditioned on QUEUED and unsent)."""
        content = table()
        transact(
            content,
            [
                content.update_action(
                    DRAFTJOB_PK,
                    str(job["jobId"]),
                    update="SET #state = :failed, #error = :error, #finished = :now",
                    names={"#state": "state", "#error": "error", "#finished": "finishedAt", "#sent": "sent"},
                    values={
                        ":failed": "FAILED",
                        ":error": "could_not_start",
                        ":now": iso_z(moment),
                        ":queued": "QUEUED",
                        ":false": False,
                    },
                    condition="#state = :queued AND #sent = :false",
                ),
                *(
                    content.update_action(
                        PICCAP_PK,
                        str(job[counter]),
                        update="ADD #n :minus",
                        names={"#n": "n"},
                        values={":minus": -1, ":one": 1},
                        condition="#n >= :one",
                    )
                    for counter in ("capDay", "capMonth")
                ),
            ],
        )

    def poll(request: Request) -> dict[str, Any]:
        job_id = _job_path_id(request)
        request.log["jobId"] = job_id
        job = table().get_item(DRAFTJOB_PK, job_id)
        if job is None:
            raise ApiError("NOT_FOUND")
        base = summary(job)
        if job.get("state") == "FAILED":
            return json_response(200, failed_view(base, str(job.get("error") or "bedrock_error")))
        config = services.config()
        s3 = services.s3()
        moment = now()
        try:
            result = _get_json(s3, config.bucket, job_key(config.job_prefix, job_id, "result.json"), RESULT_MAX_BYTES)
        except ValueError:
            result = {}
        if result is not None:
            drafts = drafting.valid_definitions(result.get("drafts") if isinstance(result.get("drafts"), list) else [])
            rejected = [_rejected_view(r) for r in result.get("rejected") or [] if isinstance(r, Mapping)]
            store(job_id, "READY", moment)
            return json_response(200, {**base, "state": "READY", "drafts": drafts, "rejected": rejected})
        if job.get("state") == "READY":
            return json_response(200, failed_view(base, "expired"))  # the job objects expire after 14 days
        try:
            error = _get_json(s3, config.bucket, job_key(config.job_prefix, job_id, "error.json"), SMALL_MAX_BYTES)
        except ValueError:
            error = {}
        if error is not None:
            code = error.get("code") if error.get("code") in WORKER_ERRORS else "bedrock_error"
            store(job_id, "FAILED", moment, error=str(code))
            return json_response(200, failed_view(base, str(code)))
        started = _parse_time(job.get("startedAt"))
        elapsed = max(int((moment - started).total_seconds()), 0) if started is not None else 0
        claimed_at = _last_modified(s3, config.bucket, job_key(config.job_prefix, job_id, "claim"))
        if claimed_at is not None:
            if moment - claimed_at > DRAW_TIMEOUT:
                store(job_id, "FAILED", moment, error="timed_out")
                return json_response(200, failed_view(base, "timed_out"))
            return json_response(200, {**base, "state": "DRAFTING", "elapsedSeconds": elapsed})
        if started is not None and moment - started > JOB_TIMEOUT:
            store(job_id, "FAILED", moment, error="timed_out")
            return json_response(200, failed_view(base, "timed_out"))
        return json_response(200, {**base, "state": "QUEUED", "elapsedSeconds": elapsed})

    def store(job_id: str, state: str, moment: datetime, *, error: str | None = None) -> None:
        """QUEUED -> READY or FAILED, once."""
        update = "SET #state = :state, #finished = :now"
        names = {"#state": "state", "#finished": "finishedAt"}
        values: dict[str, Any] = {":state": state, ":now": iso_z(moment), ":queued": "QUEUED"}
        if error is not None:
            update += ", #error = :error"
            names["#error"] = "error"
            values[":error"] = error
        try:
            table().update_item(
                DRAFTJOB_PK, job_id, update=update, names=names, values=values, condition="#state = :queued"
            )
        except ClientError as failure:
            if client_error_code(failure) != "ConditionalCheckFailedException":
                raise

    return {"POST /api/admin/draft-jobs": start, "GET /api/admin/draft-jobs/{jobId}": poll}


def summary(job: Mapping[str, Any]) -> dict[str, Any]:
    view: dict[str, Any] = {
        "jobId": job.get("sk") or job.get("jobId"),
        "state": job.get("state"),
        "topicId": job.get("topicId"),
        "band": int(job["band"]) if job.get("band") is not None else None,
        "interactionType": job.get("interactionType"),
        "count": int(job["count"]) if job.get("count") is not None else None,
        "startedAt": job.get("startedAt"),
    }
    if job.get("notes"):
        view["notes"] = job["notes"]
    return view


def failed_view(base: Mapping[str, Any], code: str) -> dict[str, Any]:
    message = JOB_ERROR_MESSAGES.get(code, "That didn't finish. Press Try again.")
    return {**base, "state": "FAILED", "error": code, "message": message}


def _rejected_view(item: Mapping[str, Any]) -> dict[str, Any]:
    """A rejected draft as the page shows it: its index, a short title, and only problem names of the known form."""
    index = item.get("index")
    title = item.get("title") if isinstance(item.get("title"), str) else ""
    problems = [p for p in item.get("problems") or [] if isinstance(p, str) and _PROBLEM.fullmatch(p)]
    return {"index": index if isinstance(index, int) else None, "title": title[:60], "problems": problems}
