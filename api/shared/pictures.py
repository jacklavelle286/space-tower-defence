"""Library pictures: item shapes, keys, configuration and the in-use check (Gate P, Phases 42a and 42b).

Pictures the operator uploads or has Claude draw live in the `content` table beside speech and activities. Only
admin-api reads or writes these items (picture-gen writes S3 only):

    picture header  pk PIC     sk <pictureId>         name, state (DRAFT | APPROVED), source (UPLOAD | GENERATED),
                                                      kind?, sha256, bytes, width, height, textFree, jobId?,
                                                      description?,
                                                      createdBy, createdAt, approvedBy?, approvedAt?, publishRefs
    drawing job     pk PICJOB  sk <jobId>             description, kind?, previousJobId?, change?, state (QUEUED |
                                                      READY | FAILED), error?, sent, startedAt, finishedAt?, usage?,
                                                      capDay, capMonth, createdBy, pictureId? (set by R34 when a
                                                      picture is saved from the drawing; R33 then stops listing it)
    cap counter     pk PICCAP  sk D#<yyyy-mm-dd>      n: drawings started that London day
                               sk M#<yyyy-mm>         n: drawings started that London month
    audit           the existing AUDIT#<yyyy-mm> items, actions picture-create, picture-approve, picture-delete and
                    picture-job-start

`kind` (Gate P2) is one of `picture.kinds` in contracts/limits.json: what the picture is for (an activity object or
scene, a profile avatar, an alien, a background, ...). Each kind also fixes its sizes (KindSpec): the stored PNG's width
and height (256 x 256, or 1920 x 1056 for a background), the largest SVG, PNG and R34 body, and optionally its own
max_tokens and cap weight (a background takes 3 places in the daily and monthly caps). Kinds are set once, when the job
or picture is created, and never change. Items written before kinds existed have no `kind` and read as `activity-object`
(DEFAULT_KIND): no migration. Only kinds whose `consumer` is `activity` may appear in a learning activity
(shared/content.py, rule `picture_not_for_activities`).

`pictureId` is "lib-" + the first 32 hex characters of the SHA-256 of the canonical PNG (shared/png_canon.py), so it
fits a keyId and the same pixels always give the same ID. A picture's bytes never change: an edit is a new picture,
so there are no versions. `publishRefs` counts the activity publishes (R27) that used the picture; R37 conditions its
delete on the value it read, as R32 does for speech.

Objects in the pictures bucket (PICTURES_BUCKET):

    store/<pictureId>.png           every picture, draft or approved (the master copy; admin-api only)
    pictures/v1/<pictureId>.png     approved pictures only, copied there by approve; CloudFront serves /pictures/*
    jobs/<jobId>/claim | progress.json | result.json | error.json    the drawing exchange with picture-gen
"""

from __future__ import annotations

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any
from zoneinfo import ZoneInfo

from shared.png_canon import PICTURE_ID
from shared.rules.contracts import LIMITS

if TYPE_CHECKING:
    from shared.data import DynamoTable

PIC_PK = "PIC"
PICJOB_PK = "PICJOB"
PICCAP_PK = "PICCAP"
STATES = ("DRAFT", "APPROVED")
SOURCES = ("UPLOAD", "GENERATED")
JOB_STATES = ("QUEUED", "READY", "FAILED")
# picture-gen's error.json codes (timed_out: a message that waited in the queue past QUEUE_MAX_AGE, never drawn;
# bad_request: a message picture-gen cannot draw, such as a kind it does not know, never drawn; bedrock_error: any
# provider error, OpenAI's too, its name kept for compatibility; not_set_up: the OpenAI key secret has no value or
# OpenAI refused the key, owner decision 2026-11-16), plus the ones admin-api sets itself (could_not_start, timed_out,
# expired).
WORKER_ERRORS = (
    "declined",
    "too_long",
    "unusable",
    "throttled",
    "bedrock_error",
    "timed_out",
    "bad_request",
    "not_set_up",
)
JOB_ERRORS = (*WORKER_ERRORS, "could_not_start", "expired")
JOB_ERROR_MESSAGES = {
    "declined": "That couldn't be drawn. Try different words.",
    "too_long": "The drawing got too complicated. Try a simpler description.",
    "unusable": "That drawing couldn't be used safely. Press Try again.",
    "throttled": "That didn't finish. Press Try again.",
    "bedrock_error": "That didn't finish. Press Try again.",
    "timed_out": "That didn't finish. Press Try again.",
    "could_not_start": "That didn't finish. Press Try again.",
    "bad_request": "That kind of picture can't be drawn yet. Reload the page and try again.",
    "not_set_up": "Drawing isn't set up yet: the API key is missing or was refused.",
    "expired": "This drawing is too old to use now. Press Try again.",  # R39: a READY job whose result.json expired
}
PICTURE_LIMITS: Mapping[str, Any] = LIMITS["picture"]
NAME_MAX: int = PICTURE_LIMITS["nameMaxLength"]
DESCRIPTION_MIN: int = PICTURE_LIMITS["descriptionMinLength"]
DESCRIPTION_MAX: int = PICTURE_LIMITS["descriptionMaxLength"]
CHANGE_MAX: int = PICTURE_LIMITS["changeMaxLength"]
STORE_PREFIX = "store/"
SERVED_PREFIX = "pictures/v1/"
DEFAULT_JOB_PREFIX = "jobs/"
PNG_CONTENT_TYPE = "image/png"
SERVED_CACHE_CONTROL = "public, max-age=31536000, immutable"  # served bytes never change; delete invalidates
# Timeouts. A job is QUEUED until picture-gen claims it, then DRAWING until result.json or error.json arrives.
# - JOB_TIMEOUT (R39): a job not claimed this long after its start is FAILED timed_out.
# - QUEUE_MAX_AGE (picture-gen): a message older than this (from the job's start) is never drawn: picture-gen claims it
#   and writes error.json timed_out without calling Bedrock. It is below JOB_TIMEOUT, so a job R39 has given up on can
#   never be drawn and paid for afterwards.
# - DRAW_TIMEOUT (R39): a claimed job with no outcome this long after its claim is FAILED timed_out. The claim is
#   written inside the run, and one run takes at most WORKER_TIMEOUT (picture-gen's Lambda timeout,
#   infrastructure/main/pictures.tf), so a claim this old with no outcome means the run died (no error.json).
# Gate P2: a background drawing may take 7-12 minutes, so the function timeout rose from 600 s to 840 s, and picture-gen
# stops its own call 780 s after the run starts (handler CALL_SECONDS). DRAW_TIMEOUT (900 s) stays 60 s past the
# function timeout, so a background that is legitimately running is never declared timed_out. The wait before the
# claim depends on how long the drawings ahead of it take: picture-gen runs two at once, so a job started behind two
# others waits up to one whole run (840 s) plus the queue's polling. QUEUE_MAX_AGE rose from 13 to 15 minutes (60 s past
# a run) and JOB_TIMEOUT from 15 to 17 minutes, keeping the 2 minutes between them. A job behind four or more running
# or queued drawings can still wait longer and is then answered timed_out without being drawn, as before Gate P2.
JOB_TIMEOUT = timedelta(minutes=17)
QUEUE_MAX_AGE = timedelta(minutes=15)
DRAW_TIMEOUT = timedelta(minutes=15)
WORKER_TIMEOUT = timedelta(seconds=840)  # must equal module.picture_gen's timeout (a test reads pictures.tf)
OPEN_JOB_WINDOW = timedelta(hours=24)  # R33 openJobs: jobs started in the last day that are QUEUED or READY
LONDON = ZoneInfo("Europe/London")
PUBLISH_REFS = "publishRefs"
UUID = re.compile(LIMITS["ids"]["uuid"].removeprefix("^").removesuffix("$"))
# Picture kinds (Gate P2): {id, label, consumer} in menu order, from contracts/limits.json.
KINDS: tuple[Mapping[str, str], ...] = tuple(LIMITS["picture"]["kinds"])
KIND_IDS: tuple[str, ...] = tuple(kind["id"] for kind in KINDS)
DEFAULT_KIND: str = LIMITS["picture"]["defaultKind"]
ACTIVITY_KINDS: frozenset[str] = frozenset(kind["id"] for kind in KINDS if kind["consumer"] == "activity")


@dataclass(frozen=True)
class KindSpec:
    """A kind's sizes, from its `picture.kinds` entry in contracts/limits.json (the one source; the admin app reads
    the same entry). `max_tokens` is None for a kind that uses picture-gen's BEDROCK_MAX_TOKENS."""

    width: int
    height: int
    svg_max_bytes: int  # the largest SVG picture-gen accepts and admin-api re-sanitises (R39)
    max_bytes: int  # the largest decoded upload and stored PNG (R34), and the draft read cap (R35)
    body_max_bytes: int  # the largest R34 JSON body (the PNG in base64 plus the other fields)
    max_tokens: int | None
    cap_weight: int = 1  # places one drawing takes in the daily and monthly caps (R38), so the caps still bound cost


def _spec(entry: Mapping[str, Any]) -> KindSpec:
    tokens = entry.get("maxTokens")
    return KindSpec(
        width=int(entry["width"]),
        height=int(entry["height"]),
        svg_max_bytes=int(entry["svgMaxBytes"]),
        max_bytes=int(entry["maxBytes"]),
        body_max_bytes=int(entry["bodyMaxBytes"]),
        max_tokens=int(tokens) if tokens is not None else None,
        cap_weight=int(entry.get("capWeight", 1)),
    )


KIND_SPECS: Mapping[str, KindSpec] = {str(entry["id"]): _spec(entry) for entry in KINDS}


def kind_spec(kind: str) -> KindSpec:
    """The sizes of `kind`; an unknown kind (or none) has the default kind's."""
    return KIND_SPECS.get(kind, KIND_SPECS[DEFAULT_KIND])


RESULT_MIN_BYTES = 262_144  # result.json for a 64 KiB SVG and its usage numbers, with room to spare (Gate P)


def result_max_bytes(kind: str) -> int:
    """The largest `jobs/<id>/result.json` read for a job of `kind`: the SVG can at most double when written as a
    JSON string (every `"` becomes `\\"`), plus room for the usage numbers. 256 KiB for every 64 KiB kind, as before
    Gate P2; 388 KiB for a background (192 KiB SVG)."""
    return max(RESULT_MIN_BYTES, 2 * kind_spec(kind).svg_max_bytes + 4_096)


def is_kind(value: Any) -> bool:
    return isinstance(value, str) and value in KIND_IDS


def kind_of(item: Mapping[str, Any]) -> str:
    """A picture header's or job's kind: an item saved before kinds existed (no `kind`) is an activity object."""
    value = item.get("kind")
    return value if is_kind(value) else DEFAULT_KIND


def store_key(picture_id: str) -> str:
    return f"{STORE_PREFIX}{picture_id}.png"


def served_key(picture_id: str) -> str:
    return f"{SERVED_PREFIX}{picture_id}.png"


def served_url(picture_id: str) -> str:
    """The path both sites serve an approved picture at (CloudFront's /pictures/* origin)."""
    return f"/{served_key(picture_id)}"


def job_key(prefix: str, job_id: str, name: str) -> str:
    return f"{prefix}{job_id}/{name}"


def is_picture_id(value: Any) -> bool:
    return isinstance(value, str) and PICTURE_ID.fullmatch(value) is not None


# --- Configuration --------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class PictureConfig:
    """admin-api's picture settings (Terraform sets the environment).

    PICTURES_BUCKET            the pictures bucket
    PICTURE_DISTRIBUTION_IDS   comma-separated CloudFront distribution IDs to invalidate on delete (player, admin)
    PICTURE_JOBS_QUEUE_URL     the picture-jobs SQS queue (42b; empty = drawing not deployed, R38 answers 429 off)
    PICTURE_DAILY_CAP          drawings a London day (owner decision 2026-11-16: 100); 0 switches drawing off
    PICTURE_MONTHLY_CAP        drawings a London month (owner decision 2026-11-16: 150); 0 switches drawing off
    PICTURE_JOB_PREFIX         the jobs/ prefix picture-gen writes under (default "jobs/")
    """

    bucket: str
    distribution_ids: tuple[str, ...] = ()
    queue_url: str = ""
    daily_cap: int = 0
    monthly_cap: int = 0
    job_prefix: str = DEFAULT_JOB_PREFIX

    @classmethod
    def from_env(cls) -> PictureConfig:
        ids = tuple(part.strip() for part in os.environ.get("PICTURE_DISTRIBUTION_IDS", "").split(",") if part.strip())
        return cls(
            bucket=os.environ["PICTURES_BUCKET"],
            distribution_ids=ids,
            queue_url=os.environ.get("PICTURE_JOBS_QUEUE_URL", ""),
            daily_cap=_cap(os.environ.get("PICTURE_DAILY_CAP", "0")),
            monthly_cap=_cap(os.environ.get("PICTURE_MONTHLY_CAP", "0")),
            job_prefix=os.environ.get("PICTURE_JOB_PREFIX", DEFAULT_JOB_PREFIX),
        )

    @property
    def drawing_on(self) -> bool:
        return bool(self.queue_url) and self.daily_cap > 0 and self.monthly_cap > 0


def _cap(raw: str) -> int:
    """A cap from the environment; anything that is not a non-negative integer is 0 (drawing off: fail closed)."""
    return int(raw) if raw.isdigit() else 0


# --- Caps (Europe/London days and months) ---------------------------------------------------------------------------


def cap_keys(moment: datetime) -> tuple[str, str]:
    """The day and month counter sort keys for `moment`, in London time (so the cap resets at local midnight)."""
    local = moment.astimezone(LONDON)
    return f"D#{local:%Y-%m-%d}", f"M#{local:%Y-%m}"


def resets_at(moment: datetime, period: str) -> datetime:
    """The UTC moment the day or month counter for `moment` stops applying: the next London midnight, or the first
    London midnight of the next month."""
    local = moment.astimezone(LONDON)
    if period == "day":
        next_day = (local + timedelta(days=1)).date()
        boundary = datetime(next_day.year, next_day.month, next_day.day, tzinfo=LONDON)
    else:
        year, month = (local.year + 1, 1) if local.month == 12 else (local.year, local.month + 1)
        boundary = datetime(year, month, 1, tzinfo=LONDON)
    return boundary.astimezone(UTC)


# --- Items and views ------------------------------------------------------------------------------------------------


def new_picture_header(
    *,
    picture_id: str,
    name: str,
    source: str,
    kind: str,
    sha256: str,
    size: int,
    text_free: bool,
    by: str,
    at: str,
    job_id: str | None = None,
    description: str | None = None,
) -> dict[str, Any]:
    header: dict[str, Any] = {
        "pk": PIC_PK,
        "sk": picture_id,
        "pictureId": picture_id,
        "name": name,
        "state": "DRAFT",
        "source": source,
        "kind": kind,
        "sha256": sha256,
        "bytes": size,
        "width": kind_spec(kind).width,
        "height": kind_spec(kind).height,
        "textFree": text_free,
        "createdBy": by,
        "createdAt": at,
        PUBLISH_REFS: 0,
    }
    if job_id is not None:
        header["jobId"] = job_id
    if description is not None:
        header["description"] = description
    return header


def picture_view(header: Mapping[str, Any]) -> dict[str, Any]:
    """A picture as the admin page sees it (R33, R34, R35, R36)."""
    picture_id = str(header.get("sk"))
    view: dict[str, Any] = {
        "id": picture_id,
        "name": header.get("name"),
        "state": header.get("state"),
        "source": header.get("source"),
        "kind": kind_of(header),
        "textFree": header.get("textFree") is True,
        "createdAt": header.get("createdAt"),
    }
    for name in ("approvedAt", "jobId", "description"):
        if header.get(name) is not None:
            view[name] = header.get(name)
    if header.get("state") == "APPROVED":
        view["url"] = served_url(picture_id)
    return view


def text_ok(value: Any, low: int, high: int) -> bool:
    """Plain text as activity_types.text_ok: `low`..`high` characters, trimmed, no control characters, no markup."""
    return (
        isinstance(value, str)
        and low <= len(value) <= high
        and value == value.strip()
        and not any(ord(ch) < 32 or ord(ch) == 127 for ch in value)
        and "<" not in value
        and ">" not in value
    )


# --- Library pictures in activity definitions -----------------------------------------------------------------------


def library_asset_ids(value: Any) -> set[str]:
    """Every string anywhere in `value` (a definition, a version) that is a library picture ID. Walking the whole
    document, not only `visualAssetReferences`, means a draft that uses a picture it has not listed yet still counts
    as using it (a draft saves freely; validate reports the missing listing)."""
    found: set[str] = set()
    stack: list[Any] = [value]
    while stack:
        item = stack.pop()
        if isinstance(item, str):
            if PICTURE_ID.fullmatch(item):
                found.add(item)
        elif isinstance(item, Mapping):
            stack.extend(item.values())
        elif isinstance(item, list | tuple):
            stack.extend(item)
    return found


def picture_users(content: DynamoTable, picture_id: str) -> list[str]:
    """The IDs of the activities whose draft or any version (withdrawn and retired ones included) uses `picture_id`
    (R37), read as `speech_users` reads speech references: the activity header partition (one Query), every draft by
    BatchGetItem, and the versions of activities that were ever published. A version passed publish, so every picture
    it uses is in its `visualAssetReferences`; a draft is walked whole (see `library_asset_ids`)."""
    from shared.content import ACT_PK, DRAFT_SK, VERSION_PREFIX, activity_pk  # import here: content imports this

    headers = content.query_prefix(ACT_PK, "", attributes=("sk", "publishedVersion"))
    ids = sorted(str(h["sk"]) for h in headers)
    users: set[str] = set()
    drafts = content.batch_get([(activity_pk(activity_id), DRAFT_SK) for activity_id in ids])
    for activity_id in ids:
        draft = drafts.get((activity_pk(activity_id), DRAFT_SK))
        if draft is not None and picture_id in library_asset_ids(draft.get("definition")):
            users.add(activity_id)
    for header in headers:
        activity_id = str(header["sk"])
        if activity_id in users or not header.get("publishedVersion"):
            continue
        versions = content.query_prefix(
            activity_pk(activity_id), VERSION_PREFIX, attributes=("sk", "visualAssetReferences")
        )
        if any(picture_id in library_asset_ids(v.get("visualAssetReferences")) for v in versions):
            users.add(activity_id)
    return sorted(users)
