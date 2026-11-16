"""admin-api's picture routes (Gate P): R33-R37 (Phase 42a, the library) and R38-R39 (Phase 42b, drawing with Claude).

The handlers are built here and registered by api/functions/admin_api/handler.py, so the function's allow-list and
router stay in one place. Item shapes and keys are in shared/pictures.py.

    R33 GET    /api/admin/pictures[?state=&kind=]           pictures, today's and this month's drawing counts, open jobs
    R34 POST   /api/admin/pictures                          add a picture (JSON with base64 PNG), optionally approve it
    R35 GET    /api/admin/pictures/{id}                     one picture, the activities using it, a draft's PNG
    R36 POST   /api/admin/pictures/{id}/approve             approve a draft (the text-free tick is required)
    R37 DELETE /api/admin/pictures/{id}                     delete a draft, or an approved picture no activity uses
    R38 POST   /api/admin/picture-jobs                      start a drawing (counts toward the daily and monthly caps)
    R39 GET    /api/admin/picture-jobs/{jobId}              a drawing's state, read from picture-gen's S3 objects

Upload (R34). The browser has already decoded the file (PNG or JPEG only, at most 5 MB, at most 4096 px a side),
drawn it onto a canvas the size of the picture's kind (256 x 256; 1920 x 1056 for a background) and exported a PNG.
admin-api trusts none of that: the body and the decoded PNG are at most the kind's `bodyMaxBytes` and `maxBytes` (768
KiB and 512 KiB; 5,600,000 bytes and 4 MiB for a background) (413 PAYLOAD_TOO_LARGE), and shared/png_canon.py
rewrites it from its pixels at exactly the kind's size. A rewritten PNG over the kind's `maxBytes` (a very busy photo:
filter 0 can grow it past the browser's file) is refused, rule `too_detailed`: a draft must fit Lambda's 6 MB response
as base64 (R35; 4 MiB is 5.59 MB of base64). The canonical file goes to
`store/<id>.png` with If-None-Match (a 412 means the same bytes are already there); the header and its audit item are
one create-only transaction, so the same picture added twice answers 200 `duplicate: true`.

Approve (R36, and R34 with `approve`). `textFree` must be true. CopyObject puts the stored bytes at
`pictures/v1/<id>.png` (the only prefix CloudFront can read) with `Content-Type: image/png` and a one-year immutable
Cache-Control; then the header moves DRAFT -> APPROVED with its audit item. A retry after the copy is harmless (same
bytes). A draft deleted between the copy and the update leaves no served object: the copy is removed again, and so
does a transaction that raises (throttled, a fault) or runs out of tries while the header is still DRAFT.

Delete (R37). A draft: header and audit item in one transaction, then the stored object, and a served copy if one was
left behind by an approve that never finished (a Lambda timeout, say), which is then invalidated. An approved picture:
refused (400 VALIDATION_FAILED, `{field: "usedBy.<activityId>", rule: "picture_in_use"}` per activity) while any
activity draft or version uses it (shared/pictures.py `picture_users`); otherwise the header delete is conditioned on
the `publishRefs` value read before the check (R27 adds 1 to it in its own transaction, so a publish racing the delete
refuses it and the loop checks again), then both objects are deleted and both distributions are invalidated for the
served path. An invalidation that fails is logged (`invalidated: false`) and reported; the picture is still gone from
the table and the bucket, and the one-year cache copy is what remains until it expires or is invalidated again.

Drawing (R38). One transaction adds the kind's cap weight (1; 3 for a background, Gate P2) to the London day and month
counters (each conditioned on staying within its cap), creates the job (create-only: the client's jobId is the
idempotency key) and writes the audit item. Then the job goes to SQS; if that fails, the job is FAILED
`could_not_start` and both counters get the same weight back (the job stores a weight other than 1 as `capWeight`).
A retry of a job whose message was never sent sends it then. Either cap at 0, or no queue configured, switches
drawing off (429).

Poll (R39). The job's S3 objects say where it is: `result.json` (re-sanitised here, so a planted file is still
checked; picture-gen's palette warning is passed on only by name) is READY; `error.json` is FAILED with picture-gen's
code; `progress.json` or `claim` is DRAWING, and FAILED `timed_out` only 15 minutes after the claim (the run died with
no outcome); nothing is QUEUED, and nothing 17 minutes after the start is FAILED `timed_out` (picture-gen refuses to
draw a job older than 15 minutes, so this never throws away a paid result). The outcome is stored on the job lazily.

Kinds (Gate P2). R38 requires `kind` (one of `picture.kinds` in contracts/limits.json); an unknown or missing kind is
refused before the caps are counted. The job stores it and the SQS message carries it (left out for `activity-object`,
which picture-gen assumes), so picture-gen draws with that kind's prompt; a redraw (`previousJobId`) must keep the
earlier job's kind (`kind_mismatch`). R34 takes an optional `kind` (default `activity-object`); a picture saved from a
drawing takes the job's kind, and a different `kind` in the body is refused (`kind_mismatch`). The same pixels already
saved as another kind are refused (`already_another_kind`), not answered as a duplicate of the other kind. Every picture
view and R33 row carries `kind`; items saved before kinds existed read as `activity-object`. R33 filters on `?kind=`.

Saving a drawing (R34 GENERATED) marks its job with the picture's ID first, so R33 stops listing it as an open job and
the same drawing cannot become a second, different picture (`job_used`).
"""

from __future__ import annotations

import base64
import binascii
import json
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from shared.audio import MISSING, client_error_code
from shared.body import json_object, query_param, raw_body
from shared.content import audit_item, audit_key, iso_z, problem
from shared.data import DynamoTable
from shared.errors import ApiError, json_response
from shared.pictures import (
    CHANGE_MAX,
    DEFAULT_KIND,
    DESCRIPTION_MAX,
    DESCRIPTION_MIN,
    DRAW_TIMEOUT,
    JOB_ERROR_MESSAGES,
    JOB_TIMEOUT,
    NAME_MAX,
    OPEN_JOB_WINDOW,
    PIC_PK,
    PICCAP_PK,
    PICJOB_PK,
    PNG_CONTENT_TYPE,
    PUBLISH_REFS,
    SERVED_CACHE_CONTROL,
    SOURCES,
    UUID,
    WORKER_ERRORS,
    PictureConfig,
    cap_keys,
    is_kind,
    is_picture_id,
    job_key,
    kind_of,
    kind_spec,
    new_picture_header,
    picture_users,
    picture_view,
    resets_at,
    result_max_bytes,
    served_key,
    served_url,
    store_key,
    text_ok,
)
from shared.png_canon import PngRefused, canonicalise
from shared.router import Request
from shared.rules.contracts import LIMITS
from shared.svg_sanitise import WARNINGS as SANITISER_WARNINGS
from shared.svg_sanitise import SvgRefused, sanitise

# The route's first guard: the largest kind's body (a background's 4 MiB PNG in base64 plus the other fields, under
# Lambda's 6 MB request limit). Each kind's own `bodyMaxBytes` is checked once the kind is known.
BODY_MAX_BYTES: int = LIMITS["bodyMaxBytes"]["adminPicture"]
WRITE_TRIES = 3
LOST_RACE = frozenset({"PreconditionFailed", "ConditionalRequestConflict"})  # 412; 409 while another put is in flight
SMALL_MAX_BYTES = 4_096  # error.json, progress.json

Handler = Callable[[Request], dict[str, Any]]
Transact = Callable[[DynamoTable, list[dict[str, Any]]], list[str] | None]


@dataclass(frozen=True)
class PictureServices:
    """What the picture routes need beyond the content table (all created lazily, after authorisation)."""

    config: Callable[[], PictureConfig]
    s3: Callable[[], Any]
    sqs: Callable[[], Any]
    cloudfront: Callable[[], Any]


def invalid(problems: list[dict[str, str]]) -> ApiError:
    return ApiError("VALIDATION_FAILED", details=problems)


def _only_fields(body: Mapping[str, Any], allowed: set[str], required: set[str]) -> None:
    problems = [problem(name, "additionalProperties") for name in body if name not in allowed]
    problems += [problem(name, "required") for name in sorted(required) if name not in body]
    if problems:
        raise invalid(problems)


def _path_param(request: Request, name: str) -> str | None:
    params = request.event.get("pathParameters")
    value = params.get(name) if isinstance(params, Mapping) else None
    return value if isinstance(value, str) else None


def _picture_path_id(request: Request) -> str:
    value = _path_param(request, "id")
    if not is_picture_id(value):
        raise ApiError("NOT_FOUND")
    assert value is not None
    return value


def _job_path_id(request: Request) -> str:
    value = _path_param(request, "jobId")
    if value is None or not UUID.fullmatch(value):
        raise ApiError("NOT_FOUND")
    return value


def _get_object(s3: Any, bucket: str, key: str, max_bytes: int) -> bytes | None:
    """The object's bytes (at most `max_bytes`, else ValueError), or None when it does not exist. admin-api has the
    prefix-scoped ListBucket, so a missing key is 404, not 403; a 403 is a real fault and is raised."""
    try:
        response = s3.get_object(Bucket=bucket, Key=key)
    except ClientError as error:
        if client_error_code(error) in MISSING:
            return None
        raise
    body = response["Body"].read(max_bytes + 1)
    if len(body) > max_bytes:
        raise ValueError("object too large")
    return body


def _get_json(s3: Any, bucket: str, key: str, max_bytes: int) -> dict[str, Any] | None:
    raw = _get_object(s3, bucket, key, max_bytes)
    if raw is None:
        return None
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("not a JSON object")
    return value


def _last_modified(s3: Any, bucket: str, key: str) -> datetime | None:
    """When the object was written, or None when it does not exist."""
    try:
        response = s3.head_object(Bucket=bucket, Key=key)
    except ClientError as error:
        if client_error_code(error) in MISSING:
            return None
        raise
    value = response.get("LastModified")
    return value if isinstance(value, datetime) else None


def _non_negative_int(value: Any) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value >= 0 else 0


def make_picture_handlers(
    *,
    table: Callable[[], DynamoTable],
    services: PictureServices,
    now: Callable[[], datetime],
    transact: Transact,
) -> dict[str, Handler]:
    """The seven picture handlers, by route key."""

    # --- Library (42a) ----------------------------------------------------------------------------------------------

    def generation_summary(config: PictureConfig, moment: datetime) -> dict[str, Any]:
        day, month = cap_keys(moment)
        found = table().batch_get([(PICCAP_PK, day), (PICCAP_PK, month)])
        used_day = found.get((PICCAP_PK, day), {}).get("n", 0)
        used_month = found.get((PICCAP_PK, month), {}).get("n", 0)
        return {
            "usedToday": int(used_day),
            "dailyCap": config.daily_cap,
            "usedMonth": int(used_month),
            "monthlyCap": config.monthly_cap,
            "drawingOn": config.drawing_on,
        }

    def list_pictures(request: Request) -> dict[str, Any]:
        state = query_param(request.event, "state")
        kind = query_param(request.event, "kind")
        problems = []
        if state is not None and state not in ("DRAFT", "APPROVED"):
            problems.append(problem("state", "enum"))
        if kind is not None and not is_kind(kind):
            problems.append(problem("kind", "unknown_kind"))
        if problems:
            raise invalid(problems)
        content = table()
        headers = content.query_prefix(PIC_PK, "")
        pictures = [
            picture_view(h)
            for h in headers
            if (state is None or h.get("state") == state) and (kind is None or kind_of(h) == kind)
        ]
        pictures.sort(key=lambda p: (str(p.get("createdAt")), p["id"]), reverse=True)
        moment = now()
        config = services.config()
        jobs = content.query_prefix(
            PICJOB_PK,
            "",
            attributes=("sk", "state", "description", "kind", "startedAt", "previousJobId", "change", "pictureId"),
        )
        since = iso_z(moment - OPEN_JOB_WINDOW)
        open_jobs = [
            _job_summary(job)
            for job in sorted(jobs, key=lambda j: str(j.get("startedAt")), reverse=True)
            if job.get("state") in ("QUEUED", "READY")
            and str(job.get("startedAt", "")) >= since
            and job.get("pictureId") is None  # a picture was saved from it: done, not open
        ]
        return json_response(
            200, {"pictures": pictures, "generation": generation_summary(config, moment), "openJobs": open_jobs}
        )

    def add_picture(request: Request) -> dict[str, Any]:
        if len(raw_body(request.event)) > BODY_MAX_BYTES:
            raise ApiError("PAYLOAD_TOO_LARGE")
        body = json_object(request.event, max_bytes=BODY_MAX_BYTES)
        _only_fields(
            body,
            {"name", "source", "kind", "jobId", "pngBase64", "approve", "textFree"},
            {"name", "source", "pngBase64", "approve", "textFree"},
        )
        problems = []
        name = body["name"].strip() if isinstance(body["name"], str) else None
        if not text_ok(name, 1, NAME_MAX):
            problems.append(problem("name", "length"))
        if body["source"] not in SOURCES:
            problems.append(problem("source", "enum"))
        if "kind" in body and not is_kind(body["kind"]):
            problems.append(problem("kind", "unknown_kind"))
        if not isinstance(body["approve"], bool):
            problems.append(problem("approve", "type"))
        if not isinstance(body["textFree"], bool):
            problems.append(problem("textFree", "type"))
        job_id = body.get("jobId")
        if body["source"] == "GENERATED" and job_id is None:
            problems.append(problem("jobId", "required"))
        if job_id is not None and not (isinstance(job_id, str) and UUID.fullmatch(job_id)):
            problems.append(problem("jobId", "pattern"))
        if body["source"] == "UPLOAD" and job_id is not None:
            problems.append(problem("jobId", "not_for_upload"))
        if not isinstance(body["pngBase64"], str):
            problems.append(problem("pngBase64", "type"))
        if problems:
            raise invalid(problems)
        if body["approve"] and body["textFree"] is not True:
            raise invalid([problem("textFree", "not_text_free")])
        content = table()
        description = None
        kind = body.get("kind", DEFAULT_KIND)
        job: Mapping[str, Any] | None = None
        if job_id is not None:
            # The kind first (a drawing is saved as the kind it was drawn as): it decides the size the PNG must be.
            job = content.get_item(PICJOB_PK, job_id)
            if job is None:
                raise invalid([problem("jobId", "unknown_job")])
            if job.get("state") != "READY":
                raise invalid([problem("jobId", "job_not_ready")])
            if "kind" in body and body["kind"] != kind_of(job):
                raise invalid([problem("kind", "kind_mismatch")])
            kind = kind_of(job)
            description = job.get("description") if isinstance(job.get("description"), str) else None
        spec = kind_spec(kind)
        if len(raw_body(request.event)) > spec.body_max_bytes:
            raise ApiError("PAYLOAD_TOO_LARGE")
        try:
            data = base64.b64decode(body["pngBase64"], validate=True)
        except (binascii.Error, ValueError):
            raise invalid([problem("pngBase64", "base64")]) from None
        if len(data) > spec.max_bytes:
            raise ApiError("PAYLOAD_TOO_LARGE")
        try:
            canonical = canonicalise(data, width=spec.width, height=spec.height, max_input_bytes=spec.max_bytes)
        except PngRefused as refused:
            raise invalid([problem("pngBase64", refused.rule)]) from None
        if len(canonical.png) > spec.max_bytes:
            raise invalid([problem("pngBase64", "too_detailed")])  # R35 could not send it back (6 MB response)
        picture_id = canonical.picture_id
        request.log["pictureId"] = picture_id
        if job is not None and job.get("pictureId") not in (None, picture_id):
            raise invalid([problem("jobId", "job_used")])  # one drawing, one picture
        # The id is the pixels, so the same pixels saved as another kind would come back as the old picture, still that
        # kind, and the kind asked for would be lost without a word. Refuse it before the drawing is marked as used.
        existing = content.get_item(PIC_PK, picture_id, attributes=("pk", "kind"))
        if existing is not None and kind_of(existing) != kind:
            raise invalid([problem("kind", "already_another_kind")])
        if job_id is not None:
            # Mark the drawing as used before the picture is created, so it stops coming back as an open job and
            # cannot become a second, different picture. The same pixels again (a retry) pass the condition.
            try:
                content.update_item(
                    PICJOB_PK,
                    job_id,
                    update="SET #pic = :pic",
                    names={"#pic": "pictureId", "#state": "state"},
                    values={":pic": picture_id, ":ready": "READY"},
                    condition="#state = :ready AND (attribute_not_exists(#pic) OR #pic = :pic)",
                )
            except ClientError as failure:
                if client_error_code(failure) != "ConditionalCheckFailedException":
                    raise
                raise invalid([problem("jobId", "job_used")]) from None

        config = services.config()
        s3 = services.s3()
        try:
            s3.put_object(
                Bucket=config.bucket,
                Key=store_key(picture_id),
                Body=canonical.png,
                ContentType=PNG_CONTENT_TYPE,
                IfNoneMatch="*",
            )
        except ClientError as error:
            if client_error_code(error) not in LOST_RACE:
                raise  # 412: the same bytes are already stored (the same picture), which is what we wanted

        moment = now()
        header = new_picture_header(
            picture_id=picture_id,
            name=str(name),
            source=body["source"],
            kind=kind,
            sha256=canonical.sha256,
            size=len(canonical.png),
            text_free=body["textFree"],
            by=request.caller.sub,
            at=iso_z(moment),
            job_id=job_id,
            description=description,
        )
        audit_pk, audit_sk = audit_key(moment, f"{picture_id}#create")
        audit = audit_item(audit_pk, audit_sk, "picture-create", request.caller.sub, moment, pictureId=picture_id)
        if job_id is not None:
            audit["jobId"] = job_id
        failed = transact(
            content,
            [
                content.put_action(header, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
                content.put_action(audit, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
            ],
        )
        duplicate = failed is not None
        if body["approve"]:
            stored = approve(picture_id, request.caller.sub, None)
        else:
            stored = content.get_item(PIC_PK, picture_id) or header
        return json_response(200 if duplicate else 201, {"picture": picture_view(stored), "duplicate": duplicate})

    def get_picture(request: Request) -> dict[str, Any]:
        picture_id = _picture_path_id(request)
        request.log["pictureId"] = picture_id
        content = table()
        header = content.get_item(PIC_PK, picture_id)
        if header is None:
            raise ApiError("NOT_FOUND")
        result: dict[str, Any] = {"picture": picture_view(header), "usedBy": picture_users(content, picture_id)}
        if header.get("state") == "DRAFT":
            config = services.config()
            png = _get_object(services.s3(), config.bucket, store_key(picture_id), kind_spec(kind_of(header)).max_bytes)
            if png is not None:
                result["pngBase64"] = base64.b64encode(png).decode("ascii")
        return json_response(200, result)

    def approve(picture_id: str, by: str, name: str | None) -> dict[str, Any]:
        """Copy to the served prefix, then DRAFT -> APPROVED with its audit item. Returns the header as stored."""
        content = table()
        config = services.config()
        s3 = services.s3()
        for _ in range(WRITE_TRIES):
            header = content.get_item(PIC_PK, picture_id)
            if header is None:
                raise ApiError("NOT_FOUND")
            if header.get("state") == "APPROVED":
                return header  # idempotent
            try:
                s3.copy_object(
                    Bucket=config.bucket,
                    Key=served_key(picture_id),
                    CopySource={"Bucket": config.bucket, "Key": store_key(picture_id)},
                    MetadataDirective="REPLACE",
                    ContentType=PNG_CONTENT_TYPE,
                    CacheControl=SERVED_CACHE_CONTROL,
                )
            except ClientError as error:
                if client_error_code(error) in MISSING:
                    raise ApiError("NOT_FOUND") from None  # the stored bytes are gone: nothing to serve
                raise
            moment = now()
            audit_pk, audit_sk = audit_key(moment, f"{picture_id}#approve")
            update = "SET #state = :approved, #tf = :true, #by = :by, #at = :now"
            names = {"#state": "state", "#tf": "textFree", "#by": "approvedBy", "#at": "approvedAt"}
            values: dict[str, Any] = {
                ":approved": "APPROVED",
                ":true": True,
                ":by": by,
                ":now": iso_z(moment),
                ":draft": "DRAFT",
            }
            if name is not None:
                update += ", #name = :name"
                names["#name"] = "name"
                values[":name"] = name
            actions = [
                content.update_action(
                    PIC_PK, picture_id, update=update, names=names, values=values, condition="#state = :draft"
                ),
                content.put_action(
                    audit_item(audit_pk, audit_sk, "picture-approve", by, moment, pictureId=picture_id),
                    condition="attribute_not_exists(#pk)",
                    names={"#pk": "pk"},
                ),
            ]
            try:
                failed = transact(content, actions)
            except Exception:
                # Throttled, a DynamoDB or network fault: the header may still be DRAFT, so the copy must not stay.
                take_back_copy(picture_id)
                raise
            if failed is None:
                return content.get_item(PIC_PK, picture_id) or header
            if content.get_item(PIC_PK, picture_id, attributes=("pk",)) is None:
                # Deleted between the read and the update: take back the copy so nothing unlisted is served.
                s3.delete_object(Bucket=config.bucket, Key=served_key(picture_id))
                raise ApiError("NOT_FOUND")
        take_back_copy(picture_id)
        raise ApiError("THROTTLED")

    def take_back_copy(picture_id: str) -> None:
        """Delete the served copy unless the header is APPROVED: only approved pictures exist under pictures/v1/.
        Best effort (this runs on a path that is already failing); R37 on the draft removes a copy left behind."""
        config = services.config()
        try:
            current = table().get_item(PIC_PK, picture_id, attributes=("pk", "state"))
            if current is None or current.get("state") != "APPROVED":
                services.s3().delete_object(Bucket=config.bucket, Key=served_key(picture_id))
        except (ClientError, BotoCoreError):
            pass

    def served_copy_exists(config: PictureConfig, picture_id: str) -> bool:
        """Whether pictures/v1/<id>.png is there. A list, not a HEAD: admin-api may list the prefix but has no
        GetObject on it (only CloudFront reads served pictures)."""
        listed = services.s3().list_objects_v2(Bucket=config.bucket, Prefix=served_key(picture_id), MaxKeys=1)
        return any(item.get("Key") == served_key(picture_id) for item in listed.get("Contents", []))

    def approve_picture(request: Request) -> dict[str, Any]:
        picture_id = _picture_path_id(request)
        request.log.update(pictureId=picture_id, action="picture-approve")
        body = json_object(request.event)
        _only_fields(body, {"textFree", "name"}, {"textFree"})
        name = None
        if "name" in body:
            name = body["name"].strip() if isinstance(body["name"], str) else None
            if not text_ok(name, 1, NAME_MAX):
                raise invalid([problem("name", "length")])
        if body["textFree"] is not True:
            raise invalid([problem("textFree", "not_text_free")])
        return json_response(200, {"picture": picture_view(approve(picture_id, request.caller.sub, name))})

    def delete_picture(request: Request) -> dict[str, Any]:
        picture_id = _picture_path_id(request)
        request.log.update(pictureId=picture_id, action="picture-delete")
        content = table()
        config = services.config()
        checked: tuple[Any] | None = None
        for _ in range(WRITE_TRIES):
            header = content.get_item(PIC_PK, picture_id)
            if header is None:
                raise ApiError("NOT_FOUND")
            state = header.get("state")
            refs = header.get(PUBLISH_REFS)
            if state == "APPROVED" and checked != (refs,):
                users = picture_users(content, picture_id)
                if users:
                    raise invalid([problem(f"usedBy.{activity_id}", "picture_in_use") for activity_id in users])
                checked = (refs,)
            moment = now()
            audit_pk, audit_sk = audit_key(moment, f"{picture_id}#delete")
            audit = audit_item(audit_pk, audit_sk, "picture-delete", request.caller.sub, moment, pictureId=picture_id)
            audit["state"] = state
            values: dict[str, Any] = {":state": state}
            condition = "#state = :state"
            if refs is not None:
                condition += " AND #refs = :refs"
                values[":refs"] = refs
            else:
                condition += " AND attribute_not_exists(#refs)"
            actions = [
                content.delete_action(
                    PIC_PK,
                    picture_id,
                    condition=condition,
                    names={"#state": "state", "#refs": PUBLISH_REFS},
                    values=values,
                ),
                content.put_action(audit, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
            ]
            if transact(content, actions) is not None:
                continue  # approved, published or deleted meanwhile: read again
            s3 = services.s3()
            s3.delete_object(Bucket=config.bucket, Key=store_key(picture_id))
            invalidated: bool | None = None
            # An approved picture always has a served copy. A draft normally has none, but an approve that failed
            # after its copy (a timeout, say) can leave one: remove it and invalidate it too.
            if state == "APPROVED" or served_copy_exists(config, picture_id):
                s3.delete_object(Bucket=config.bucket, Key=served_key(picture_id))
                invalidated = invalidate(config, picture_id, moment)
                request.log["invalidated"] = invalidated
            result: dict[str, Any] = {"pictureId": picture_id, "deleted": True}
            if invalidated is not None:
                result["invalidated"] = invalidated
            return json_response(200, result)
        raise ApiError("THROTTLED")

    def invalidate(config: PictureConfig, picture_id: str, moment: datetime) -> bool:
        cloudfront = services.cloudfront()
        ok = True
        for distribution_id in config.distribution_ids:
            try:
                cloudfront.create_invalidation(
                    DistributionId=distribution_id,
                    InvalidationBatch={
                        "Paths": {"Quantity": 1, "Items": [served_url(picture_id)]},
                        "CallerReference": f"{picture_id}-{moment.timestamp():.0f}",
                    },
                )
            except (ClientError, BotoCoreError):
                ok = False
        return ok

    # --- Drawing (42b) ----------------------------------------------------------------------------------------------

    def start_job(request: Request) -> dict[str, Any]:
        body = json_object(request.event)
        _only_fields(
            body, {"jobId", "description", "kind", "previousJobId", "change"}, {"jobId", "description", "kind"}
        )
        problems = []
        job_id = body["jobId"]
        kind = body["kind"]
        if not is_kind(kind):
            problems.append(problem("kind", "unknown_kind"))  # before anything is counted against the caps
        if not (isinstance(job_id, str) and UUID.fullmatch(job_id)):
            problems.append(problem("jobId", "pattern"))
        description = body["description"]
        if not text_ok(description, DESCRIPTION_MIN, DESCRIPTION_MAX):
            problems.append(problem("description", "length"))
        previous = body.get("previousJobId")
        if previous is not None and not (isinstance(previous, str) and UUID.fullmatch(previous)):
            problems.append(problem("previousJobId", "pattern"))
        change = body.get("change")
        if change == "":
            change = None
        if change is not None and not text_ok(change, 1, CHANGE_MAX):
            problems.append(problem("change", "length"))
        if change is not None and previous is None:
            problems.append(problem("change", "needs_previous_job"))
        if problems:
            raise invalid(problems)
        request.log["jobId"] = job_id
        config = services.config()
        moment = now()
        if not config.drawing_on:
            request.log["capPeriod"] = "off"
            raise ApiError(
                "PICTURE_CAP_REACHED",
                message="Drawing is switched off",
                details={"period": "off", "dailyCap": config.daily_cap, "monthlyCap": config.monthly_cap},
            )
        content = table()
        existing = content.get_item(PICJOB_PK, job_id)
        if existing is not None:
            return retry_job(request, config, existing, moment)
        if previous is not None:
            earlier = content.get_item(PICJOB_PK, previous, attributes=("pk", "state", "kind"))
            if earlier is None:
                raise invalid([problem("previousJobId", "unknown_job")])
            if earlier.get("state") != "READY":
                raise invalid([problem("previousJobId", "job_not_ready")])
            if kind_of(earlier) != kind:
                raise invalid([problem("kind", "kind_mismatch")])  # a redraw keeps the kind it was drawn as

        day, month = cap_keys(moment)
        weight = kind_spec(kind).cap_weight  # a background takes more places: its worst case costs more (Gate P2)
        if weight > config.monthly_cap or weight > config.daily_cap:
            # Never fits, however empty the counters are (an operator set a cap below the weight).
            period = "month" if weight > config.monthly_cap else "day"
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
        job: dict[str, Any] = {
            "pk": PICJOB_PK,
            "sk": job_id,
            "jobId": job_id,
            "description": description,
            "kind": kind,
            "state": "QUEUED",
            "sent": False,
            "startedAt": iso_z(moment),
            "createdBy": request.caller.sub,
            "capDay": day,
            "capMonth": month,
        }
        if previous is not None:
            job["previousJobId"] = previous
        if change is not None:
            job["change"] = change
        if weight != 1:
            job["capWeight"] = weight  # what a refund gives back; left out at 1, so other jobs are stored as before
        audit_pk, audit_sk = audit_key(moment, f"{job_id}#job-start")
        actions = [
            _cap_action(content, day, config.daily_cap, weight),
            _cap_action(content, month, config.monthly_cap, weight),
            content.put_action(job, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
            content.put_action(
                audit_item(audit_pk, audit_sk, "picture-job-start", request.caller.sub, moment, jobId=job_id),
                condition="attribute_not_exists(#pk)",
                names={"#pk": "pk"},
            ),
        ]
        failed = transact(content, actions)
        if failed is not None:
            if failed[2] == "ConditionalCheckFailed":  # the same jobId started a moment ago: a retry
                again = content.get_item(PICJOB_PK, job_id)
                if again is not None:
                    return retry_job(request, config, again, moment)
            if failed[0] != "ConditionalCheckFailed" and failed[1] != "ConditionalCheckFailed":
                raise ApiError("THROTTLED")
            # Both full: the month is the later reset, so it is the true answer to "when can I draw again".
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
        return send_job(request, config, job, moment)

    def send_job(request: Request, config: PictureConfig, job: Mapping[str, Any], moment: datetime) -> dict[str, Any]:
        message = {"jobId": job["jobId"], "description": job["description"]}
        # `kind` goes only when it is not the default: picture-gen reads a missing kind as activity-object, and a
        # picture-gen from before kinds refuses any key it does not know. Leaving it out keeps activity-object jobs
        # working while a release updates admin-api a few seconds before picture-gen. A job saved before kinds
        # existed (retried unsent) is an activity object, so it also goes without one.
        if kind_of(job) != DEFAULT_KIND:
            message["kind"] = kind_of(job)
        for name in ("previousJobId", "change", "startedAt"):  # startedAt: picture-gen refuses a stale job
            if job.get(name) is not None:
                message[name] = job[name]
        content = table()
        try:
            services.sqs().send_message(
                QueueUrl=config.queue_url, MessageBody=json.dumps(message, sort_keys=True, separators=(",", ":"))
            )
        except (ClientError, BotoCoreError):
            refund(job, moment)
            raise ApiError("THROTTLED") from None
        content.update_item(
            PICJOB_PK,
            str(job["jobId"]),
            update="SET #sent = :true",
            names={"#sent": "sent", "#pk": "pk"},
            values={":true": True},
            condition="attribute_exists(#pk)",
        )
        summary = generation_summary(config, moment)
        request.log.update(usedToday=summary["usedToday"], usedMonth=summary["usedMonth"])
        return json_response(202, {"jobId": job["jobId"], "state": "QUEUED", "kind": kind_of(job), **summary})

    def retry_job(request: Request, config: PictureConfig, job: Mapping[str, Any], moment: datetime) -> dict[str, Any]:
        """The same jobId again: never counted twice. A job whose message never went is sent now."""
        if job.get("state") == "QUEUED" and job.get("sent") is False:
            return send_job(request, config, job, moment)
        summary = generation_summary(config, moment)
        return json_response(202, {**_job_summary(job), **summary})

    def refund(job: Mapping[str, Any], moment: datetime) -> None:
        """FAILED could_not_start and both counters get the job's cap weight back, once: conditioned on the job still
        being QUEUED and unsent, so a second failure (or a racing retry) cannot refund twice."""
        content = table()
        weight = int(job.get("capWeight", 1))
        job_values = {
            ":failed": "FAILED",
            ":error": "could_not_start",
            ":now": iso_z(moment),
            ":queued": "QUEUED",
            ":false": False,
        }
        actions = [
            content.update_action(
                PICJOB_PK,
                str(job["jobId"]),
                update="SET #state = :failed, #error = :error, #finished = :now",
                names={"#state": "state", "#error": "error", "#finished": "finishedAt", "#sent": "sent"},
                values=job_values,
                condition="#state = :queued AND #sent = :false",
            ),
            *(
                content.update_action(
                    PICCAP_PK,
                    str(job[counter]),
                    update="ADD #n :minus",
                    names={"#n": "n"},
                    values={":minus": -weight, ":weight": weight},
                    condition="#n >= :weight",
                )
                for counter in ("capDay", "capMonth")
            ),
        ]
        transact(content, actions)

    def poll_job(request: Request) -> dict[str, Any]:
        job_id = _job_path_id(request)
        request.log["jobId"] = job_id
        content = table()
        job = content.get_item(PICJOB_PK, job_id)
        if job is None:
            raise ApiError("NOT_FOUND")
        config = services.config()
        moment = now()
        base = _job_summary(job)
        if job.get("state") == "FAILED":
            return json_response(200, _failed(base, str(job.get("error") or "bedrock_error")))
        s3 = services.s3()
        prefix = config.job_prefix
        kind = kind_of(job)
        spec = kind_spec(kind)
        try:
            result = _get_json(s3, config.bucket, job_key(prefix, job_id, "result.json"), result_max_bytes(kind))
        except ValueError:
            result = {}  # unreadable: refused below as unusable
        if result is not None:
            try:
                svg = result.get("svg")
                if not isinstance(svg, str):
                    raise SvgRefused("missing")
                clean = sanitise(svg, canvas=(spec.width, spec.height), max_bytes=spec.svg_max_bytes)
            except SvgRefused:
                store_outcome(job_id, "FAILED", moment, error="unusable")
                return json_response(200, _failed(base, "unusable"))
            usage = result.get("usage") if isinstance(result.get("usage"), Mapping) else {}
            stored_usage = {k: _non_negative_int(usage.get(k)) for k in ("input", "output", "cacheRead", "cacheWrite")}
            store_outcome(job_id, "READY", moment, usage=stored_usage)
            # admin-api has no palette (art/STYLE.md is bundled into picture-gen only), so the palette warning comes
            # from the worker; only names the sanitiser can produce are passed on, never free text from the file.
            worker_warnings = result.get("warnings") if isinstance(result.get("warnings"), list) else []
            known = [w for w in worker_warnings if isinstance(w, str) and w in SANITISER_WARNINGS]
            warnings = sorted({*clean.warnings, *known})
            return json_response(200, {**base, "state": "READY", "svg": clean.svg, "warnings": warnings})
        if job.get("state") == "READY":
            return json_response(200, _failed(base, "expired"))  # result.json expired (14 days); nothing stored
        try:
            error = _get_json(s3, config.bucket, job_key(prefix, job_id, "error.json"), SMALL_MAX_BYTES)
        except ValueError:
            error = {}
        if error is not None:
            code = error.get("code") if error.get("code") in WORKER_ERRORS else "bedrock_error"
            store_outcome(job_id, "FAILED", moment, error=str(code))
            return json_response(200, _failed(base, str(code)))
        started = _parse_time(job.get("startedAt"))
        elapsed = int((moment - started).total_seconds()) if started is not None else 0
        try:
            progress = _get_json(s3, config.bucket, job_key(prefix, job_id, "progress.json"), SMALL_MAX_BYTES)
        except ValueError:
            progress = {}
        claimed_at = _last_modified(s3, config.bucket, job_key(prefix, job_id, "claim"))
        if progress is not None or claimed_at is not None:
            # Claimed: picture-gen is drawing (and paying for) it. Only a run that died with no outcome times out,
            # measured from the claim, never from the start: a job that waited in the queue may still finish.
            drawing_since = claimed_at or started
            if drawing_since is not None and moment - drawing_since > DRAW_TIMEOUT:
                store_outcome(job_id, "FAILED", moment, error="timed_out")
                return json_response(200, _failed(base, "timed_out"))
            progress = progress or {}
            phase = progress.get("phase") if progress.get("phase") in ("thinking", "drawing") else "thinking"
            return json_response(
                200,
                {
                    **base,
                    "state": "DRAWING",
                    "phase": phase,
                    "elapsedSeconds": max(elapsed, 0),
                    "outputTokens": _non_negative_int(progress.get("outputTokens")),
                },
            )
        if started is not None and moment - started > JOB_TIMEOUT:
            # Never claimed. picture-gen refuses a message older than QUEUE_MAX_AGE (< JOB_TIMEOUT), so this job can
            # no longer be drawn: failing it here cannot throw away a paid result.
            store_outcome(job_id, "FAILED", moment, error="timed_out")
            return json_response(200, _failed(base, "timed_out"))
        return json_response(200, {**base, "state": "QUEUED", "elapsedSeconds": max(elapsed, 0)})

    def store_outcome(
        job_id: str, state: str, moment: datetime, *, error: str | None = None, usage: Mapping[str, int] | None = None
    ) -> None:
        """QUEUED -> READY or FAILED, once (a later poll that sees the same objects writes nothing)."""
        update = "SET #state = :state, #finished = :now"
        names = {"#state": "state", "#finished": "finishedAt"}
        values: dict[str, Any] = {":state": state, ":now": iso_z(moment), ":queued": "QUEUED"}
        if error is not None:
            update += ", #error = :error"
            names["#error"] = "error"
            values[":error"] = error
        if usage is not None:
            update += ", #usage = :usage"
            names["#usage"] = "usage"
            values[":usage"] = dict(usage)
        try:
            table().update_item(
                PICJOB_PK, job_id, update=update, names=names, values=values, condition="#state = :queued"
            )
        except ClientError as failure:
            if client_error_code(failure) != "ConditionalCheckFailedException":
                raise

    return {
        "GET /api/admin/pictures": list_pictures,
        "POST /api/admin/pictures": add_picture,
        "GET /api/admin/pictures/{id}": get_picture,
        "POST /api/admin/pictures/{id}/approve": approve_picture,
        "DELETE /api/admin/pictures/{id}": delete_picture,
        "POST /api/admin/picture-jobs": start_job,
        "GET /api/admin/picture-jobs/{jobId}": poll_job,
    }


def _cap_action(content: DynamoTable, sk: str, cap: int, weight: int = 1) -> dict[str, Any]:
    """Add `weight` to the counter if it still fits under `cap` (the caller has checked weight <= cap). At weight 1
    the condition is the same as before Gate P2 (#n < cap)."""
    return content.update_action(
        PICCAP_PK,
        sk,
        update="ADD #n :weight",
        names={"#n": "n"},
        values={":weight": weight, ":room": cap - weight},
        condition="attribute_not_exists(#n) OR #n <= :room",
    )


def _job_summary(job: Mapping[str, Any]) -> dict[str, Any]:
    summary: dict[str, Any] = {
        "jobId": job.get("sk"),
        "state": job.get("state"),
        "description": job.get("description"),
        "kind": kind_of(job),
        "startedAt": job.get("startedAt"),
    }
    for name in ("previousJobId", "change"):
        if job.get(name) is not None:
            summary[name] = job.get(name)
    if job.get("state") == "FAILED" and job.get("error"):
        summary["error"] = job.get("error")
    return summary


def _failed(base: Mapping[str, Any], code: str) -> dict[str, Any]:
    message = JOB_ERROR_MESSAGES.get(code, "That didn't finish. Press Try again.")
    return {**base, "state": "FAILED", "error": code, "message": message}


def _parse_time(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
