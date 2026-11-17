"""Library pictures (R33-R37, Phase 42a) and drawing jobs (R38-R39, Phase 42b) on moto (Gate P).

admin-api with a moto content table, a moto pictures bucket and a moto SQS queue; CloudFront is a recording fake.
The exit checks proved here: a draft never reaches the served prefix; approve needs the text-free tick; an approved
picture in use cannot be deleted (draft, published, retired or withdrawn use) and a publish racing the delete refuses
it; the daily cap (100, owner decision 2026-11-16) and the monthly cap (150) refuse the next drawing with 429 and a log
line, a retry never counts twice and a failed start is refunded; a planted `result.json` is sanitised on read.
"""

from __future__ import annotations

import base64
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3
import pytest
from botocore.exceptions import ClientError
from conftest import REPO, event_for
from runs_harness import load_bounds_fixture
from test_admin_api import ALL_TICKED, CONFIG, Admin, admin
from test_admin_lifecycle import create, publish, save
from test_png_canon import picture_rgba, png
from test_tts import BUCKET, PREFIX

from shared import picture_admin
from shared.content import definition_problems, publish_actions
from shared.data import DynamoTable
from shared.pictures import PictureConfig, cap_keys, resets_at
from shared.png_canon import canonicalise

PICTURES = "test-pictures-bucket"
SUB = "a6c2b2b4-7051-70ef-b1e8-739ac38dd0cb"
LIST = "GET /api/admin/pictures"
ADD = "POST /api/admin/pictures"
GET = "GET /api/admin/pictures/{id}"
APPROVE = "POST /api/admin/pictures/{id}/approve"
DELETE = "DELETE /api/admin/pictures/{id}"
START = "POST /api/admin/picture-jobs"
POLL = "GET /api/admin/picture-jobs/{jobId}"
SEED = REPO / "content" / "seed" / "activities"
MA_1001 = {k: v for k, v in json.loads((SEED / "ma-1001.json").read_text()).items() if k != "$comment"}
GOOD_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">'
    '<circle cx="128" cy="128" fill="#FFD23F" r="60" stroke="#2A1E3D" stroke-width="7"/></svg>'
)  # already in the sanitiser's canonical form (attributes sorted)


def job_id(n: int) -> str:
    return f"00000000-0000-4000-8000-{n:012d}"


class Clock:
    """A settable clock that moves one second per read (every write gets its own audit key)."""

    def __init__(self, moment: datetime | None = None) -> None:
        self.moment = moment or datetime(2026, 11, 20, 10, 14, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        self.moment += timedelta(seconds=1)
        return self.moment


class FakeCloudFront:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.fail = False

    def create_invalidation(self, **kwargs: Any) -> dict[str, Any]:
        if self.fail:
            raise ClientError({"Error": {"Code": "AccessDenied", "Message": "no"}}, "CreateInvalidation")
        self.calls.append(kwargs)
        return {"Invalidation": {"Id": "I1"}}


class BrokenSqs:
    def send_message(self, **kwargs: Any) -> dict[str, Any]:
        raise ClientError({"Error": {"Code": "ServiceUnavailable", "Message": "down"}}, "SendMessage")


class Pictures(Admin):
    """The Admin harness (content table, audio bucket, speech) plus the pictures bucket, queue and CloudFront fake."""

    def __init__(self, ddb: Any, base: dict[str, Any]) -> None:
        super().__init__(ddb, base)
        self.s3.create_bucket(Bucket=PICTURES, CreateBucketConfiguration={"LocationConstraint": "eu-west-2"})
        self.sqs = boto3.client("sqs", region_name="eu-west-2")
        self.queue_url = self.sqs.create_queue(QueueName="picture-jobs")["QueueUrl"]
        self.cloudfront = FakeCloudFront()
        self.config = PictureConfig(
            bucket=PICTURES,
            distribution_ids=("EPLAYER", "EADMIN"),
            queue_url=self.queue_url,
            daily_cap=100,
            monthly_cap=150,
        )
        self.clock = Clock()
        self.written: dict[str, datetime] = {}  # job object key -> the test clock's time when it was put
        self.sqs_client: Any = self.sqs
        store = admin.AudioStore(bucket=BUCKET, clip_prefix=PREFIX)
        self.router = admin.make_router(
            admin.Deps(
                content=lambda: self.table,
                s3=admin.s3_client,
                store=lambda: store,
                config=lambda: CONFIG,
                now=self.clock,
                bounds=load_bounds_fixture,
                pictures=lambda: self.config,
                sqs=lambda: self.sqs_client,
                cloudfront=lambda: self.cloudfront,
            ),
            self.logger,
        )

    def pcall(self, route: str, body: Any = None, *, id: str | None = None, job: str | None = None) -> tuple:
        event = event_for(self.base, route, cognito__groups="[admin]")
        params = {}
        if id is not None:
            params["id"] = id
        if job is not None:
            params["jobId"] = job
        if params:
            event["pathParameters"] = params
        if body is not None:
            event["body"] = body if isinstance(body, str) else json.dumps(body)
        response = self.router.handle(event)
        return response["statusCode"], json.loads(response["body"])

    def upload(self, data: bytes | None = None, **body: Any) -> tuple:
        payload = {
            "name": "Sun",
            "source": "UPLOAD",
            "pngBase64": base64.b64encode(data if data is not None else png()).decode(),
            "approve": False,
            "textFree": True,
            **body,
        }
        return self.pcall(ADD, payload)

    def key_exists(self, key: str) -> bool:
        try:
            self.s3.head_object(Bucket=PICTURES, Key=key)
        except ClientError:
            return False
        return True

    def messages(self) -> list[dict[str, Any]]:
        out = self.sqs.receive_message(QueueUrl=self.queue_url, MaxNumberOfMessages=10).get("Messages", [])
        return [json.loads(m["Body"]) for m in out]

    def counters(self) -> tuple[int, int]:
        day, month = cap_keys(self.clock.moment)
        d = self.table.get_item("PICCAP", day)
        m = self.table.get_item("PICCAP", month)
        return int(d["n"]) if d else 0, int(m["n"]) if m else 0


@pytest.fixture
def api(ddb: Any, player_event: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> Pictures:
    pictures = Pictures(ddb, player_event)
    # moto stamps LastModified with the wall clock, but these tests run on a settable clock: a claim's time is the
    # test clock's time when put_job_object wrote it.
    real = picture_admin._last_modified

    def last_modified(s3: Any, bucket: str, key: str) -> datetime | None:
        if real(s3, bucket, key) is None:
            return None
        return pictures.written.get(key, pictures.clock.moment)

    monkeypatch.setattr(picture_admin, "_last_modified", last_modified)
    return pictures


def rules(body: dict[str, Any]) -> set[tuple[str, str]]:
    return {(d["field"], d["rule"]) for d in body["error"]["details"]}


def audits(api: Pictures, action: str) -> list[dict[str, Any]]:
    return [a for a in api.table.query_prefix("AUDIT#2026-11", "") if a.get("action") == action]


def approved_picture(api: Pictures, data: bytes | None = None) -> str:
    status, body = api.upload(data, approve=True)
    assert status == 201, body
    return str(body["picture"]["id"])


def with_picture(picture_id: str, activity_id: str = "ma-1001") -> dict[str, Any]:
    """ma-1001 with option d's dice replaced by the library picture."""
    definition = json.loads(json.dumps(MA_1001))
    definition["activityId"] = activity_id
    definition["activityPayload"]["options"][3]["assetId"] = picture_id
    definition["visualAssetReferences"] = ["dice-2", "dice-4", "dice-5", picture_id]
    return definition


def other_png() -> bytes:
    pixels = bytearray(picture_rgba())
    pixels[0:4] = b"\x01\x02\x03\xff"
    return png(bytes(pixels))


# --- R34 upload ---------------------------------------------------------------------------------------------------


def test_an_upload_is_canonicalised_stored_as_a_draft_and_never_served(api: Pictures) -> None:
    status, body = api.upload()
    canonical = canonicalise(png())
    assert status == 201, body
    assert body["duplicate"] is False
    picture = body["picture"]
    assert picture == {
        "id": canonical.picture_id,
        "name": "Sun",
        "state": "DRAFT",
        "source": "UPLOAD",
        "kind": "activity-object",
        "textFree": True,
        "createdAt": picture["createdAt"],
    }
    stored = api.s3.get_object(Bucket=PICTURES, Key=f"store/{canonical.picture_id}.png")
    assert stored["Body"].read() == canonical.png
    assert stored["ContentType"] == "image/png"
    assert not api.key_exists(f"pictures/v1/{canonical.picture_id}.png")  # a draft is never served
    header = api.table.get_item("PIC", canonical.picture_id)
    assert header is not None
    assert header["sha256"] == canonical.sha256 and header["publishRefs"] == 0 and header["createdBy"] == SUB
    assert [a["pictureId"] for a in audits(api, "picture-create")] == [canonical.picture_id]


def test_the_same_picture_twice_is_a_duplicate_with_one_audit_item(api: Pictures) -> None:
    first = api.upload()[1]["picture"]["id"]
    status, body = api.upload(name="Sun again")
    assert (status, body["duplicate"], body["picture"]["id"]) == (200, True, first)
    assert body["picture"]["name"] == "Sun"  # the first header stands
    assert len(audits(api, "picture-create")) == 1


def test_approve_on_create_serves_the_picture_with_the_right_headers(api: Pictures) -> None:
    picture_id = approved_picture(api)
    served = api.s3.get_object(Bucket=PICTURES, Key=f"pictures/v1/{picture_id}.png")
    assert served["ContentType"] == "image/png"
    assert served["CacheControl"] == "public, max-age=31536000, immutable"
    assert served["Body"].read() == canonicalise(png()).png
    header = api.table.get_item("PIC", picture_id)
    assert header is not None and header["state"] == "APPROVED" and header["approvedBy"] == SUB
    assert api.pcall(GET, id=picture_id)[1]["picture"]["url"] == f"/pictures/v1/{picture_id}.png"


@pytest.mark.parametrize(
    ("data", "rule"),
    [
        pytest.param(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00" + bytes(100), "not_png", id="jpeg"),
        pytest.param(b'<svg xmlns="http://www.w3.org/2000/svg"/>', "not_png", id="svg"),
        pytest.param(png() + b"PK\x03\x04", "not_png", id="polyglot"),
        pytest.param(bytes(256 * 256 * 4), "blank", id="blank-pixels"),
    ],
)
def test_an_upload_that_is_not_an_accepted_png_is_refused(api: Pictures, data: bytes, rule: str) -> None:
    if rule == "blank":
        data = png(data)
    status, body = api.upload(data)
    assert (status, rules(body)) == (400, {("pngBase64", rule)})
    assert api.table.query_prefix("PIC", "") == []


def test_the_wrong_size_is_png_shape(api: Pictures) -> None:
    from test_png_canon import ihdr

    status, body = api.upload(png(header=ihdr(width=255)))
    assert (status, rules(body)) == (400, {("pngBase64", "png_shape")})


def test_a_picture_over_512_kib_is_413(api: Pictures) -> None:
    status, body = api.upload(b"\x89PNG" + bytes(524_285))
    assert (status, body["error"]["code"]) == (413, "PAYLOAD_TOO_LARGE")
    # The route's first guard is the largest kind's body (a background's, 5,600,000 bytes), before parsing.
    status, body = api.pcall(ADD, json.dumps({"pngBase64": "A" * 5_600_000}))
    assert (status, body["error"]["code"]) == (413, "PAYLOAD_TOO_LARGE")
    # A 256 kind's body is still at most 768 KiB once the kind is known (the base64 itself is not even read).
    status, body = api.pcall(ADD, json.dumps({"name": "Sun", "source": "UPLOAD", "kind": "avatar", "approve": False,
                                              "textFree": True, "pngBase64": "A" * 800_000}))  # fmt: skip
    assert (status, body["error"]["code"]) == (413, "PAYLOAD_TOO_LARGE")


def test_upload_body_checks(api: Pictures) -> None:
    assert rules(api.upload(approve=True, textFree=False)[1]) == {("textFree", "not_text_free")}
    assert rules(api.upload(name=" ")[1]) == {("name", "length")}
    assert rules(api.upload(name="<b>x</b>")[1]) == {("name", "length")}
    assert rules(api.upload(source="CAMERA")[1]) == {("source", "enum")}
    assert rules(api.upload(source="GENERATED")[1]) == {("jobId", "required")}
    assert rules(api.upload(source="GENERATED", jobId=job_id(1))[1]) == {("jobId", "unknown_job")}
    assert rules(api.upload(jobId=job_id(1))[1]) == {("jobId", "not_for_upload")}
    assert rules(api.pcall(ADD, {"name": "x", "source": "UPLOAD", "pngBase64": "!!", "approve": False,
                                 "textFree": True})[1]) == {("pngBase64", "base64")}  # fmt: skip
    assert rules(api.upload(extra=1)[1]) == {("extra", "additionalProperties")}
    assert api.table.query_prefix("PIC", "") == []


# --- R35, R36 -----------------------------------------------------------------------------------------------------


def test_get_shows_a_drafts_png_and_who_uses_a_picture(api: Pictures) -> None:
    draft = api.upload()[1]["picture"]["id"]
    status, body = api.pcall(GET, id=draft)
    assert status == 200 and body["usedBy"] == []
    assert base64.b64decode(body["pngBase64"]) == canonicalise(png()).png
    approved = approved_picture(api, other_png())
    create(api, with_picture(approved))
    body = api.pcall(GET, id=approved)[1]
    assert body["usedBy"] == ["ma-1001"] and "pngBase64" not in body
    for bad in ("lib-" + "0" * 32, "lib-" + "A" * 32, "ma-1001", "lib-../x"):
        assert api.pcall(GET, id=bad)[0] == 404


def test_approve_needs_the_text_free_tick_and_is_idempotent(api: Pictures) -> None:
    picture_id = api.upload(textFree=False)[1]["picture"]["id"]
    assert rules(api.pcall(APPROVE, {"textFree": False}, id=picture_id)[1]) == {("textFree", "not_text_free")}
    assert rules(api.pcall(APPROVE, {}, id=picture_id)[1]) == {("textFree", "required")}
    assert not api.key_exists(f"pictures/v1/{picture_id}.png")
    status, body = api.pcall(APPROVE, {"textFree": True, "name": "Big sun"}, id=picture_id)
    assert status == 200
    assert body["picture"]["state"] == "APPROVED" and body["picture"]["name"] == "Big sun"
    assert body["picture"]["textFree"] is True
    assert api.key_exists(f"pictures/v1/{picture_id}.png")
    assert api.pcall(APPROVE, {"textFree": True}, id=picture_id)[0] == 200
    assert len(audits(api, "picture-approve")) == 1
    assert api.pcall(APPROVE, {"textFree": True}, id="lib-" + "0" * 32)[0] == 404


def test_a_retry_after_the_copy_but_before_the_update_approves(api: Pictures, monkeypatch: pytest.MonkeyPatch) -> None:
    picture_id = api.upload()[1]["picture"]["id"]
    real = DynamoTable.transact_write

    def dies(self: DynamoTable, actions: Any) -> None:
        raise RuntimeError("the Lambda stopped here")

    monkeypatch.setattr(DynamoTable, "transact_write", dies)
    assert api.pcall(APPROVE, {"textFree": True}, id=picture_id)[0] == 500
    assert api.table.get_item("PIC", picture_id)["state"] == "DRAFT"  # type: ignore[index]
    assert not api.key_exists(f"pictures/v1/{picture_id}.png")  # the copy was taken back: the header is DRAFT
    monkeypatch.setattr(DynamoTable, "transact_write", real)
    assert api.pcall(APPROVE, {"textFree": True}, id=picture_id)[1]["picture"]["state"] == "APPROVED"
    assert api.key_exists(f"pictures/v1/{picture_id}.png")


def test_an_approve_that_runs_out_of_tries_leaves_nothing_served(
    api: Pictures, monkeypatch: pytest.MonkeyPatch
) -> None:
    picture_id = api.upload()[1]["picture"]["id"]
    monkeypatch.setattr(picture_admin, "WRITE_TRIES", 2)
    real = DynamoTable.transact_write

    def refused(self: DynamoTable, actions: Any) -> None:
        if any("Update" in a for a in actions):
            # The audit put collides every time (as if its key were taken): the header stays DRAFT.
            raise ClientError(
                {
                    "Error": {"Code": "TransactionCanceledException", "Message": "x"},
                    "CancellationReasons": [{"Code": "None"}, {"Code": "ConditionalCheckFailed"}],
                },
                "TransactWriteItems",
            )
        real(self, actions)

    monkeypatch.setattr(DynamoTable, "transact_write", refused)
    status, body = api.pcall(APPROVE, {"textFree": True}, id=picture_id)
    assert status == 503 and body["error"]["code"] == "THROTTLED"
    assert api.table.get_item("PIC", picture_id)["state"] == "DRAFT"  # type: ignore[index]
    assert not api.key_exists(f"pictures/v1/{picture_id}.png")


def test_deleting_a_draft_removes_a_served_copy_an_unfinished_approve_left(api: Pictures) -> None:
    """A Lambda that stopped between the copy and the update (no code runs to take the copy back)."""
    picture_id = api.upload()[1]["picture"]["id"]
    api.s3.copy_object(
        Bucket=PICTURES,
        Key=f"pictures/v1/{picture_id}.png",
        CopySource={"Bucket": PICTURES, "Key": f"store/{picture_id}.png"},
    )
    status, body = api.pcall(DELETE, id=picture_id)
    assert (status, body) == (200, {"pictureId": picture_id, "deleted": True, "invalidated": True})
    assert not api.key_exists(f"pictures/v1/{picture_id}.png")
    assert [c["DistributionId"] for c in api.cloudfront.calls] == ["EPLAYER", "EADMIN"]


def test_a_draft_deleted_during_approve_leaves_nothing_served(api: Pictures, monkeypatch: pytest.MonkeyPatch) -> None:
    picture_id = api.upload()[1]["picture"]["id"]
    real = DynamoTable.transact_write

    def delete_first(self: DynamoTable, actions: Any) -> None:
        if any("Update" in a for a in actions):
            self.delete_item("PIC", picture_id)
        real(self, actions)

    monkeypatch.setattr(DynamoTable, "transact_write", delete_first)
    assert api.pcall(APPROVE, {"textFree": True}, id=picture_id)[0] == 404
    assert not api.key_exists(f"pictures/v1/{picture_id}.png")


# --- R33 list -----------------------------------------------------------------------------------------------------


def test_list_filters_by_state_and_shows_the_drawing_counts(api: Pictures) -> None:
    draft = api.upload()[1]["picture"]["id"]
    approved = approved_picture(api, other_png())
    status, body = api.pcall(LIST)
    assert status == 200
    assert {p["id"] for p in body["pictures"]} == {draft, approved}
    assert body["generation"] == {
        "usedToday": 0,
        "dailyCap": 100,
        "usedMonth": 0,
        "monthlyCap": 150,
        "drawingOn": True,
    }
    assert body["openJobs"] == []
    approved_only = api.pcall(LIST, None)  # no query: both
    assert len(approved_only[1]["pictures"]) == 2
    event_body = api.router.handle(
        {**event_for(api.base, LIST, cognito__groups="[admin]"), "queryStringParameters": {"state": "APPROVED"}}
    )
    assert [p["id"] for p in json.loads(event_body["body"])["pictures"]] == [approved]
    bad = api.router.handle(
        {**event_for(api.base, LIST, cognito__groups="[admin]"), "queryStringParameters": {"state": "GONE"}}
    )
    assert bad["statusCode"] == 400


# --- R37 delete ---------------------------------------------------------------------------------------------------


def test_a_draft_is_deleted_with_its_stored_object(api: Pictures) -> None:
    picture_id = api.upload()[1]["picture"]["id"]
    assert api.pcall(DELETE, id=picture_id) == (200, {"pictureId": picture_id, "deleted": True})
    assert api.table.get_item("PIC", picture_id) is None
    assert not api.key_exists(f"store/{picture_id}.png")
    assert [a["state"] for a in audits(api, "picture-delete")] == ["DRAFT"]
    assert api.cloudfront.calls == []
    assert api.pcall(DELETE, id=picture_id)[0] == 404


def test_an_unused_approved_picture_is_deleted_and_invalidated_on_both_sites(api: Pictures) -> None:
    picture_id = approved_picture(api)
    status, body = api.pcall(DELETE, id=picture_id)
    assert (status, body) == (200, {"pictureId": picture_id, "deleted": True, "invalidated": True})
    assert not api.key_exists(f"store/{picture_id}.png")
    assert not api.key_exists(f"pictures/v1/{picture_id}.png")
    assert [c["DistributionId"] for c in api.cloudfront.calls] == ["EPLAYER", "EADMIN"]
    assert all(
        c["InvalidationBatch"]["Paths"] == {"Quantity": 1, "Items": [f"/pictures/v1/{picture_id}.png"]}
        for c in api.cloudfront.calls
    )


def test_a_failed_invalidation_is_reported_but_the_picture_is_gone(api: Pictures) -> None:
    picture_id = approved_picture(api)
    api.cloudfront.fail = True
    status, body = api.pcall(DELETE, id=picture_id)
    assert (status, body["invalidated"]) == (200, False)
    assert api.table.get_item("PIC", picture_id) is None
    assert any(line.get("invalidated") is False for line in api.logger.lines())


def test_an_approved_picture_a_draft_uses_cannot_be_deleted(api: Pictures) -> None:
    picture_id = approved_picture(api)
    create(api, with_picture(picture_id))
    create(api, with_picture(picture_id, "ma-1099"))
    status, body = api.pcall(DELETE, id=picture_id)
    assert (status, rules(body)) == (400, {("usedBy.ma-1001", "picture_in_use"), ("usedBy.ma-1099", "picture_in_use")})
    assert api.key_exists(f"pictures/v1/{picture_id}.png")
    assert audits(api, "picture-delete") == []


def published_with_picture(api: Pictures, picture_id: str) -> int:
    """ma-1001 published with the picture, then its draft moved back to the dice; returns the draft revision."""
    revision = create(api, with_picture(picture_id))
    status, body = publish(api, revision, activity_id="ma-1001")
    assert status == 201, body
    return save(api, MA_1001, revision, activity_id="ma-1001")


def test_a_published_version_keeps_the_picture_in_use(api: Pictures) -> None:
    picture_id = approved_picture(api)
    published_with_picture(api, picture_id)
    assert rules(api.pcall(DELETE, id=picture_id)[1]) == {("usedBy.ma-1001", "picture_in_use")}


def test_a_retired_or_withdrawn_version_keeps_the_picture_in_use(api: Pictures) -> None:
    picture_id = approved_picture(api)
    published_with_picture(api, picture_id)
    assert api.call("POST /api/admin/activities/{id}/retire", {}, id="ma-1001")[0] == 200
    assert rules(api.pcall(DELETE, id=picture_id)[1]) == {("usedBy.ma-1001", "picture_in_use")}
    vid = api.table.get_item("ACT", "ma-1001")["publishedVersion"]  # type: ignore[index]
    withdrawn = api.call(
        "POST /api/admin/activities/{id}/withdraw", {"version": vid, "reason": "wrong picture"}, id="ma-1001"
    )
    assert withdrawn[0] == 200
    assert rules(api.pcall(DELETE, id=picture_id)[1]) == {("usedBy.ma-1001", "picture_in_use")}
    assert api.call("DELETE /api/admin/activities/{id}", id="ma-1001")[0] == 200
    assert api.pcall(DELETE, id=picture_id)[0] == 200


def test_a_publish_landing_during_the_use_check_refuses_the_delete(
    api: Pictures, monkeypatch: pytest.MonkeyPatch
) -> None:
    """As R32: the check passed (nothing used the picture), then another tab publishes an activity with it before the
    delete commits. The publish moved `publishRefs`, so the delete is refused, the loop checks again and finds it."""
    picture_id = approved_picture(api)
    real = picture_admin.picture_users
    calls: list[list[str]] = []

    def publish_meanwhile(content: DynamoTable, pid: str) -> list[str]:
        users = real(content, pid)
        calls.append(users)
        if len(calls) == 1:
            assert users == []
            assert publish(api, create(api, with_picture(picture_id)), activity_id="ma-1001")[0] == 201
        return users

    monkeypatch.setattr(picture_admin, "picture_users", publish_meanwhile)
    status, body = api.pcall(DELETE, id=picture_id)
    assert (status, rules(body)) == (400, {("usedBy.ma-1001", "picture_in_use")})
    assert calls == [[], ["ma-1001"]]
    assert api.table.get_item("PIC", picture_id) is not None


# --- Publish and validate with library pictures (shared/content.py) -----------------------------------------------


def validate(api: Pictures, revision: int, activity_id: str = "ma-1001") -> set[tuple[str, str]]:
    status, body = api.call("POST /api/admin/activities/{id}/validate", {"draftRevision": revision}, id=activity_id)
    assert status == 200, body
    return {(p["field"], p["rule"]) for p in body["problems"]}


def test_validate_checks_library_pictures_against_the_table(api: Pictures) -> None:
    field = "activityPayload.options.3.assetId"
    missing = "lib-" + "0" * 32
    revision = create(api, with_picture(missing))
    assert validate(api, revision) == {(field, "unknown_asset")}
    draft = api.upload()[1]["picture"]["id"]
    revision = save(api, with_picture(draft), revision, activity_id="ma-1001")
    assert validate(api, revision) == {(field, "picture_not_approved")}
    assert publish(api, revision, activity_id="ma-1001")[0] == 400
    api.pcall(APPROVE, {"textFree": True}, id=draft)
    api.table.update_item("PIC", draft, update="SET #tf = :false", names={"#tf": "textFree"}, values={":false": False})
    assert validate(api, revision) == {(field, "not_text_free")}


def test_an_approved_picture_publishes_and_counts_on_the_picture(api: Pictures) -> None:
    picture_id = approved_picture(api)
    revision = create(api, with_picture(picture_id))
    assert validate(api, revision) == set()
    status, body = publish(api, revision, activity_id="ma-1001")
    assert status == 201, body
    assert api.table.get_item("PIC", picture_id)["publishRefs"] == 1  # type: ignore[index]
    version = api.table.get_item("ACT#ma-1001", f"V#{body['versionId']}")
    assert version is not None and picture_id in version["visualAssetReferences"]
    # The player pack copies the version's fields verbatim: the lib- ID reaches the player, which loads
    # /pictures/v1/<id>.png (web/player activityAssetUrl); no pack or CSP change.
    from shared.runs import pack_slot

    entry = pack_slot({"slotId": "N-001", "activityId": "ma-1001"}, version)
    assert entry["activityPayload"]["options"][3]["assetId"] == picture_id


def test_publish_actions_hold_the_picture_counter_with_its_condition(api: Pictures) -> None:
    picture_id = approved_picture(api)
    draft = {"definition": with_picture(picture_id)}
    header = {"pk": "ACT", "sk": "ma-1001"}
    _, actions = publish_actions(
        api.table,
        activity_id="ma-1001",
        header=header,
        draft=draft,
        revision=1,
        resolved={},
        review={"checklist": ALL_TICKED},
        by=SUB,
        moment=datetime(2026, 11, 20, tzinfo=UTC),
    )
    [update] = [a["Update"] for a in actions if "Update" in a and a["Update"]["Key"]["pk"] == {"S": "PIC"}]
    assert update["Key"]["sk"] == {"S": picture_id}
    assert update["UpdateExpression"] == "ADD #refs :one"
    assert update["ConditionExpression"] == "#state = :approved AND #tf = :true"


def test_a_picture_deleted_before_the_publish_commits_refuses_it(
    api: Pictures, monkeypatch: pytest.MonkeyPatch
) -> None:
    picture_id = approved_picture(api)
    revision = create(api, with_picture(picture_id))
    real = DynamoTable.transact_write

    def delete_first(self: DynamoTable, actions: Any) -> None:
        if any("Update" in a and a["Update"]["Key"]["pk"] == {"S": "PIC"} for a in actions):
            self.delete_item("PIC", picture_id)
        real(self, actions)

    monkeypatch.setattr(DynamoTable, "transact_write", delete_first)
    assert publish(api, revision, activity_id="ma-1001")[0] == 409
    assert api.table.get_item("ACT", "ma-1001")["state"] == "DRAFT"  # type: ignore[index]


def test_library_ids_without_a_table_check_only_their_form() -> None:
    assert definition_problems(with_picture("lib-" + "a" * 32), "ma-1001") == []
    over = definition_problems(with_picture("lib-" + "a" * 33), "ma-1001")
    assert ("activityPayload.options.3.assetId", "unknown_asset") in {(p["field"], p["rule"]) for p in over}
    for bad in ("lib-" + "A" * 32, "lib-../x"):
        found = {(p["field"], p["rule"]) for p in definition_problems(with_picture(bad), "ma-1001")}
        assert ("activityPayload.options.3.assetId", "pattern") in found


def test_no_repository_asset_id_looks_like_a_library_picture() -> None:
    manifest = json.loads((REPO / "api" / "shared" / "activity_assets.json").read_text())
    assert not [a["id"] for a in manifest["assets"] if a["id"].startswith("lib-")]


# --- R38 start a drawing --------------------------------------------------------------------------------------------


def start(api: Pictures, n: int, **body: Any) -> tuple:
    body = {"jobId": job_id(n), "description": "a friendly yellow sun", "kind": "activity-object", **body}
    return api.pcall(START, body)


def test_a_start_counts_queues_the_message_and_reports_the_counts(api: Pictures) -> None:
    status, body = start(api, 1)
    assert status == 202, body
    assert body == {
        "jobId": job_id(1),
        "state": "QUEUED",
        "kind": "activity-object",
        "usedToday": 1,
        "dailyCap": 100,
        "usedMonth": 1,
        "monthlyCap": 150,
        "drawingOn": True,
    }
    assert api.messages() == [
        {
            "jobId": job_id(1),
            "description": "a friendly yellow sun",
            "startedAt": "2026-11-20T10:14:01Z",
        }
    ]
    job = api.table.get_item("PICJOB", job_id(1))
    assert job is not None and job["sent"] is True and job["state"] == "QUEUED" and job["createdBy"] == SUB
    assert len(audits(api, "picture-job-start")) == 1


def test_the_hundredth_drawing_of_the_day_starts_and_the_next_is_429(api: Pictures) -> None:
    """Owner decision 2026-11-16: 100 a day. The 101st is refused with the period and when it resets, and the
    refusal's log line says which cap (`capPeriod`), so the exit check is this test plus that line."""
    for n in range(1, 101):
        assert start(api, n)[0] == 202, n
    status, body = start(api, 101)
    assert (status, body["error"]["code"]) == (429, "PICTURE_CAP_REACHED")
    assert body["error"]["details"]["period"] == "day"
    assert body["error"]["details"]["resetsAt"] == "2026-11-21T00:00:00Z"  # London midnight (GMT in November)
    assert api.counters() == (100, 100)
    assert api.table.get_item("PICJOB", job_id(101)) is None
    line = api.logger.lines()[-1]
    assert (line["code"], line["capPeriod"], line["status"]) == ("PICTURE_CAP_REACHED", "day", 429)


def test_the_monthly_cap_refuses_on_another_day(api: Pictures) -> None:
    api.config = PictureConfig(bucket=PICTURES, queue_url=api.queue_url, daily_cap=100, monthly_cap=3)
    for n in range(1, 4):
        assert start(api, n)[0] == 202
    api.clock.moment += timedelta(days=1)
    status, body = start(api, 4)
    assert (status, body["error"]["details"]["period"]) == (429, "month")
    assert body["error"]["details"]["resetsAt"] == "2026-12-01T00:00:00Z"


def test_the_same_job_id_twice_is_counted_once(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    status, body = start(api, 1)
    assert (status, body["jobId"], body["usedToday"]) == (202, job_id(1), 1)
    assert api.counters() == (1, 1)
    assert len(api.messages()) == 1


def test_at_one_below_the_cap_only_one_of_two_starts_wins(api: Pictures) -> None:
    """DynamoDB's condition on the counter serialises starts: at cap - 1 the first start takes the last place and the
    second is refused, whichever arrives first."""
    day, _ = cap_keys(api.clock.moment)
    api.table.update_item("PICCAP", day, update="SET #n = :n", names={"#n": "n"}, values={":n": 99})
    results = [start(api, 1)[0], start(api, 2)[0]]
    assert results == [202, 429]
    assert api.counters()[0] == 100


def test_a_failed_send_is_refunded_and_the_job_fails(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    api.sqs_client = BrokenSqs()
    status, body = start(api, 2)
    assert (status, body["error"]["code"]) == (503, "THROTTLED")
    assert api.counters() == (1, 1)
    job = api.table.get_item("PICJOB", job_id(2))
    assert job is not None and (job["state"], job["error"]) == ("FAILED", "could_not_start")
    # A retry of the same job ID reports the failure without counting.
    api.sqs_client = api.sqs
    status, body = start(api, 2)
    assert (status, body["state"], body["error"]) == (202, "FAILED", "could_not_start")
    assert api.counters() == (1, 1)


def test_a_job_whose_message_never_went_is_sent_on_retry(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    api.messages()
    api.table.update_item("PICJOB", job_id(1), update="SET #s = :f", names={"#s": "sent"}, values={":f": False})
    status, body = start(api, 1)
    assert (status, body["state"]) == (202, "QUEUED")
    started = api.table.get_item("PICJOB", job_id(1))["startedAt"]  # type: ignore[index]
    assert api.messages() == [{"jobId": job_id(1), "description": "a friendly yellow sun", "startedAt": started}]
    assert api.counters() == (1, 1)
    assert api.table.get_item("PICJOB", job_id(1))["sent"] is True  # type: ignore[index]


def test_zero_caps_or_no_queue_switch_drawing_off(api: Pictures) -> None:
    for config in (
        PictureConfig(bucket=PICTURES, queue_url=api.queue_url, daily_cap=0, monthly_cap=150),
        PictureConfig(bucket=PICTURES, queue_url=api.queue_url, daily_cap=100, monthly_cap=0),
        PictureConfig(bucket=PICTURES, queue_url="", daily_cap=100, monthly_cap=150),
    ):
        api.config = config
        status, body = start(api, 1)
        assert (status, body["error"]["code"], body["error"]["message"]) == (
            429,
            "PICTURE_CAP_REACHED",
            "Drawing is switched off",
        )
        assert body["error"]["details"]["period"] == "off"
    assert api.table.query_prefix("PICJOB", "") == []


def test_start_body_checks(api: Pictures) -> None:
    bad_id = {"jobId": "x", "description": "a sun", "kind": "avatar"}
    assert rules(api.pcall(START, bad_id)[1]) == {("jobId", "pattern")}
    assert rules(start(api, 1, description="ab")[1]) == {("description", "length")}
    assert rules(start(api, 1, description="draw <script>")[1]) == {("description", "length")}
    assert rules(start(api, 1, change="bigger")[1]) == {("change", "needs_previous_job")}
    assert rules(start(api, 1, previousJobId=job_id(9))[1]) == {("previousJobId", "unknown_job")}
    assert start(api, 1)[0] == 202
    assert rules(start(api, 2, previousJobId=job_id(1), change="bigger")[1]) == {("previousJobId", "job_not_ready")}


def test_try_again_carries_the_previous_job_and_the_change(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    api.messages()
    api.s3.put_object(Bucket=PICTURES, Key=f"jobs/{job_id(1)}/result.json", Body=json.dumps({"svg": GOOD_SVG}))
    assert api.pcall(POLL, job=job_id(1))[1]["state"] == "READY"
    status, _ = start(api, 2, previousJobId=job_id(1), change="make it bigger")
    assert status == 202
    assert api.messages() == [
        {
            "jobId": job_id(2),
            "description": "a friendly yellow sun",
            "previousJobId": job_id(1),
            "change": "make it bigger",
            "startedAt": api.table.get_item("PICJOB", job_id(2))["startedAt"],  # type: ignore[index]
        }
    ]


def test_cap_days_and_months_follow_london_time() -> None:
    summer = datetime(2026, 6, 30, 23, 30, tzinfo=UTC)  # BST: already 1 July in London
    assert cap_keys(summer) == ("D#2026-07-01", "M#2026-07")
    assert resets_at(summer, "day") == datetime(2026, 7, 1, 23, 0, tzinfo=UTC)
    winter = datetime(2026, 12, 31, 23, 30, tzinfo=UTC)  # GMT: still 31 December
    assert cap_keys(winter) == ("D#2026-12-31", "M#2026-12")
    assert resets_at(winter, "day") == datetime(2027, 1, 1, 0, 0, tzinfo=UTC)
    assert resets_at(winter, "month") == datetime(2027, 1, 1, 0, 0, tzinfo=UTC)
    spring = datetime(2026, 3, 29, 0, 30, tzinfo=UTC)  # the night the clocks go forward
    assert cap_keys(spring) == ("D#2026-03-29", "M#2026-03")
    assert resets_at(spring, "day") == datetime(2026, 3, 29, 23, 0, tzinfo=UTC)
    autumn = datetime(2026, 10, 24, 23, 30, tzinfo=UTC)  # BST: already 25 October, the night they go back
    assert cap_keys(autumn) == ("D#2026-10-25", "M#2026-10")
    assert resets_at(autumn, "day") == datetime(2026, 10, 26, 0, 0, tzinfo=UTC)
    assert resets_at(autumn, "month") == datetime(2026, 11, 1, 0, 0, tzinfo=UTC)


def test_the_counter_rolls_over_at_london_midnight(api: Pictures) -> None:
    api.config = PictureConfig(bucket=PICTURES, queue_url=api.queue_url, daily_cap=1, monthly_cap=150)
    api.clock.moment = datetime(2026, 7, 1, 22, 58, tzinfo=UTC)  # 23:58 in London
    assert start(api, 1)[0] == 202
    assert start(api, 2)[0] == 429
    api.clock.moment = datetime(2026, 7, 1, 23, 0, 5, tzinfo=UTC)  # 00:00 on 2 July in London
    assert start(api, 3)[0] == 202


# --- R39 poll -------------------------------------------------------------------------------------------------------


def put_job_object(api: Pictures, n: int, name: str, body: Any) -> None:
    raw = body if isinstance(body, bytes) else json.dumps(body).encode()
    key = f"jobs/{job_id(n)}/{name}"
    api.s3.put_object(Bucket=PICTURES, Key=key, Body=raw)
    api.written[key] = api.clock.moment


def test_poll_follows_the_job_from_queued_to_ready(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    status, body = api.pcall(POLL, job=job_id(1))
    assert (status, body["state"]) == (200, "QUEUED")
    put_job_object(api, 1, "claim", b"")
    body = api.pcall(POLL, job=job_id(1))[1]
    assert (body["state"], body["phase"], body["outputTokens"]) == ("DRAWING", "thinking", 0)
    put_job_object(api, 1, "progress.json", {"phase": "drawing", "outputTokens": 812, "at": "x"})
    body = api.pcall(POLL, job=job_id(1))[1]
    assert (body["state"], body["phase"], body["outputTokens"]) == ("DRAWING", "drawing", 812)
    assert body["elapsedSeconds"] > 0
    usage = {"input": 900, "output": 2400, "cacheRead": 9000, "cacheWrite": 0}
    put_job_object(api, 1, "result.json", {"svg": GOOD_SVG, "usage": usage, "warnings": ["planted"]})
    body = api.pcall(POLL, job=job_id(1))[1]
    assert body["state"] == "READY"
    assert body["svg"] == GOOD_SVG and body["warnings"] == []  # a name the sanitiser never gives is dropped
    job = api.table.get_item("PICJOB", job_id(1))
    assert job is not None and job["state"] == "READY" and job["usage"]["cacheRead"] == 9000
    assert api.pcall(POLL, job=job_id(1))[1]["state"] == "READY"  # still READY (the result is read again)


def test_a_planted_malicious_result_is_refused_on_read(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    planted = GOOD_SVG.replace("</svg>", "<script>alert(1)</script></svg>")
    put_job_object(api, 1, "result.json", {"svg": planted})
    body = api.pcall(POLL, job=job_id(1))[1]
    assert (body["state"], body["error"]) == ("FAILED", "unusable")
    assert "svg" not in body
    assert api.table.get_item("PICJOB", job_id(1))["state"] == "FAILED"  # type: ignore[index]
    put_job_object(api, 2, "result.json", b"not json")
    assert start(api, 2)[0] == 202
    assert api.pcall(POLL, job=job_id(2))[1]["error"] == "unusable"


def test_an_error_object_fails_the_job_with_its_code(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    put_job_object(api, 1, "error.json", {"code": "declined"})
    body = api.pcall(POLL, job=job_id(1))[1]
    assert (body["state"], body["error"]) == ("FAILED", "declined")
    assert body["message"] == "That couldn't be drawn. Try different words."
    assert start(api, 2)[0] == 202
    put_job_object(api, 2, "error.json", {"code": "<b>made up</b>"})
    assert api.pcall(POLL, job=job_id(2))[1]["error"] == "bedrock_error"


def test_a_missing_openai_key_reaches_the_operator_as_not_set_up(api: Pictures) -> None:
    """picture-gen's not_set_up (the OpenAI key secret has no value, or OpenAI refused the key; 2026-11-16) is passed
    on with its own words, not folded into bedrock_error."""
    assert start(api, 1)[0] == 202
    put_job_object(api, 1, "error.json", {"code": "not_set_up"})
    body = api.pcall(POLL, job=job_id(1))[1]
    assert (body["state"], body["error"]) == ("FAILED", "not_set_up")
    assert body["message"] == "Drawing isn't set up yet: the API key is missing or was refused."


def test_the_palette_warning_from_picture_gen_reaches_the_operator(api: Pictures) -> None:
    """admin-api has no palette (STYLE.md is bundled into picture-gen only): the worker's palette warning is passed
    on, but only names the sanitiser can give, never free text."""
    assert start(api, 1)[0] == 202
    warnings = ["colours_outside_palette", "<b>call 0800</b>", 7]
    put_job_object(api, 1, "result.json", {"svg": GOOD_SVG, "warnings": warnings})
    body = api.pcall(POLL, job=job_id(1))[1]
    assert (body["state"], body["warnings"]) == ("READY", ["colours_outside_palette"])


def test_the_month_is_reported_when_both_caps_are_full(api: Pictures) -> None:
    day, month = cap_keys(api.clock.moment)
    api.table.update_item("PICCAP", day, update="SET #n = :n", names={"#n": "n"}, values={":n": 100})
    api.table.update_item("PICCAP", month, update="SET #n = :n", names={"#n": "n"}, values={":n": 150})
    status, body = start(api, 1)
    assert (status, body["error"]["details"]["period"]) == (429, "month")
    assert body["error"]["details"]["resetsAt"] == "2026-12-01T00:00:00Z"  # not tomorrow: the month is the blocker
    assert api.logger.lines()[-1]["capPeriod"] == "month"


def test_a_job_that_waited_in_the_queue_and_is_drawing_past_fifteen_minutes_is_not_failed(api: Pictures) -> None:
    """Two drawings at a time: a third can wait ten minutes, then draw for several. It must still finish."""
    assert start(api, 1)[0] == 202
    api.clock.moment += timedelta(minutes=12)
    put_job_object(api, 1, "claim", b"")
    put_job_object(api, 1, "progress.json", {"phase": "thinking", "outputTokens": 1, "at": "x"})
    assert api.pcall(POLL, job=job_id(1))[1]["state"] == "DRAWING"
    api.clock.moment += timedelta(minutes=4)  # 16 minutes after the start, 4 after the claim
    body = api.pcall(POLL, job=job_id(1))[1]
    assert (body["state"], body["phase"]) == ("DRAWING", "thinking")
    put_job_object(api, 1, "result.json", {"svg": GOOD_SVG})
    assert api.pcall(POLL, job=job_id(1))[1]["state"] == "READY"


def test_a_claimed_job_with_no_outcome_long_after_its_claim_is_timed_out(api: Pictures) -> None:
    """The run died (a Lambda timeout writes no error.json): fifteen minutes after the claim it is failed."""
    assert start(api, 1)[0] == 202
    put_job_object(api, 1, "claim", b"")
    api.clock.moment += timedelta(minutes=14)
    assert api.pcall(POLL, job=job_id(1))[1]["state"] == "DRAWING"
    api.clock.moment += timedelta(minutes=2)
    body = api.pcall(POLL, job=job_id(1))[1]
    assert (body["state"], body["error"]) == ("FAILED", "timed_out")


def test_a_stale_job_picture_gen_refused_fails_with_timed_out(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    api.clock.moment += timedelta(minutes=13, seconds=30)
    put_job_object(api, 1, "claim", b"")  # picture-gen claims it only to answer timed_out without drawing
    put_job_object(api, 1, "error.json", {"code": "timed_out"})
    body = api.pcall(POLL, job=job_id(1))[1]
    assert (body["state"], body["error"]) == ("FAILED", "timed_out")


def test_nothing_after_seventeen_minutes_is_timed_out(api: Pictures) -> None:
    """Gate P2: JOB_TIMEOUT is 17 minutes (QUEUE_MAX_AGE 15): a job queued behind a whole 840 s run is still drawn."""
    assert start(api, 1)[0] == 202
    api.clock.moment += timedelta(minutes=16)
    assert api.pcall(POLL, job=job_id(1))[1]["state"] == "QUEUED"
    api.clock.moment += timedelta(minutes=2)
    body = api.pcall(POLL, job=job_id(1))[1]
    assert (body["state"], body["error"]) == ("FAILED", "timed_out")
    put_job_object(api, 1, "result.json", {"svg": GOOD_SVG})  # too late: the job stays FAILED
    assert api.pcall(POLL, job=job_id(1))[1]["state"] == "FAILED"


def test_poll_of_an_unknown_job_is_404(api: Pictures) -> None:
    assert api.pcall(POLL, job=job_id(5))[0] == 404
    assert api.pcall(POLL, job="not-a-uuid")[0] == 404


def test_open_jobs_restore_the_cards_after_a_reload(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    assert start(api, 2)[0] == 202
    put_job_object(api, 2, "error.json", {"code": "declined"})
    api.pcall(POLL, job=job_id(2))
    body = api.pcall(LIST)[1]
    assert [j["jobId"] for j in body["openJobs"]] == [job_id(1)]
    assert body["generation"]["usedToday"] == 2
    api.clock.moment += timedelta(hours=25)
    assert api.pcall(LIST)[1]["openJobs"] == []


def test_a_generated_picture_is_added_from_a_ready_job(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    status, body = api.upload(source="GENERATED", jobId=job_id(1))
    assert rules(body) == {("jobId", "job_not_ready")}
    put_job_object(api, 1, "result.json", {"svg": GOOD_SVG})
    api.pcall(POLL, job=job_id(1))
    status, body = api.upload(source="GENERATED", jobId=job_id(1), approve=True)
    assert status == 201
    assert body["picture"]["source"] == "GENERATED" and body["picture"]["state"] == "APPROVED"
    assert body["picture"]["description"] == "a friendly yellow sun" and body["picture"]["jobId"] == job_id(1)


def test_a_saved_drawing_is_no_longer_an_open_job_and_gives_only_one_picture(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    put_job_object(api, 1, "result.json", {"svg": GOOD_SVG})
    api.pcall(POLL, job=job_id(1))
    assert [j["jobId"] for j in api.pcall(LIST)[1]["openJobs"]] == [job_id(1)]
    status, body = api.upload(source="GENERATED", jobId=job_id(1))
    assert status == 201
    picture_id = body["picture"]["id"]
    job = api.table.get_item("PICJOB", job_id(1))
    assert job is not None and job["pictureId"] == picture_id and job["state"] == "READY"
    assert api.pcall(LIST)[1]["openJobs"] == []  # a reload does not bring the card back
    # The same pixels again (a retry) are the same picture; different pixels from the same drawing are refused.
    assert api.upload(source="GENERATED", jobId=job_id(1))[0] == 200
    status, body = api.upload(other_png(), source="GENERATED", jobId=job_id(1))
    assert (status, rules(body)) == (400, {("jobId", "job_used")})
    assert len(api.table.query_prefix("PIC", "")) == 1


def test_log_lines_carry_no_description_or_picture_bytes(api: Pictures) -> None:
    api.upload()
    start(api, 1, description="a secret purple dragon")
    text = json.dumps(api.logger.lines())
    assert "secret purple dragon" not in text and "iVBOR" not in text


def test_picture_routes_refuse_a_non_operator(api: Pictures, player_event: dict[str, Any]) -> None:
    for route in (LIST, ADD, GET, APPROVE, DELETE, START, POLL):
        event = event_for(player_event, route, cognito__groups=None)
        response = api.router.handle(event)
        assert response["statusCode"] == 403, route


def test_config_reads_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PICTURES_BUCKET", "b")
    monkeypatch.setenv("PICTURE_DISTRIBUTION_IDS", "E1, E2")
    monkeypatch.setenv("PICTURE_JOBS_QUEUE_URL", "https://sqs/q")
    monkeypatch.setenv("PICTURE_DAILY_CAP", "100")
    monkeypatch.setenv("PICTURE_MONTHLY_CAP", "nonsense")
    config = PictureConfig.from_env()
    assert (config.distribution_ids, config.daily_cap, config.monthly_cap) == (("E1", "E2"), 100, 0)
    assert config.drawing_on is False  # a cap that does not read is 0: drawing off (fail closed)


# --- Picture kinds (Gate P2) ------------------------------------------------------------------------------------------


def list_query(api: Pictures, **query: str) -> tuple[int, dict[str, Any]]:
    response = api.router.handle(
        {**event_for(api.base, LIST, cognito__groups="[admin]"), "queryStringParameters": query}
    )
    return response["statusCode"], json.loads(response["body"])


def forget_kind(api: Pictures, pk: str, sk: str) -> None:
    """Make the item look as it did before kinds existed (Gate P2): no `kind` attribute."""
    api.raw.update_item(
        TableName=api.table.table_name,
        Key={"pk": {"S": pk}, "sk": {"S": sk}},
        UpdateExpression="REMOVE #k",
        ExpressionAttributeNames={"#k": "kind"},
    )


def ready_job(api: Pictures, n: int, kind: str) -> None:
    assert start(api, n, kind=kind)[0] == 202
    put_job_object(api, n, "result.json", {"svg": GOOD_SVG})
    assert api.pcall(POLL, job=job_id(n))[1]["state"] == "READY"


def test_a_start_without_a_known_kind_is_refused_before_the_cap_is_counted(api: Pictures) -> None:
    day, month = cap_keys(api.clock.moment)
    for sk in (day, month):  # both caps full: a kind problem must still be the answer, and nothing is counted
        api.table.update_item("PICCAP", sk, update="SET #n = :n", names={"#n": "n"}, values={":n": 100})
    api.config = PictureConfig(bucket=PICTURES, queue_url=api.queue_url, daily_cap=100, monthly_cap=100)
    missing = api.pcall(START, {"jobId": job_id(1), "description": "a friendly yellow sun"})
    assert (missing[0], rules(missing[1])) == (400, {("kind", "required")})
    for kind in ("boss", "backdrop", "Avatar", "", 3, None):
        status, body = start(api, 1, kind=kind)
        assert (status, rules(body)) == (400, {("kind", "unknown_kind")}), kind
    assert api.counters() == (100, 100)
    assert api.table.query_prefix("PICJOB", "") == []
    assert api.messages() == []
    assert audits(api, "picture-job-start") == []


def test_a_start_stores_the_kind_on_the_job_and_the_message(api: Pictures) -> None:
    status, body = start(api, 1, kind="avatar")
    assert (status, body["kind"]) == (202, "avatar")
    assert api.table.get_item("PICJOB", job_id(1))["kind"] == "avatar"  # type: ignore[index]
    [message] = api.messages()
    assert message["kind"] == "avatar"
    assert api.pcall(POLL, job=job_id(1))[1]["kind"] == "avatar"
    assert [j["kind"] for j in api.pcall(LIST)[1]["openJobs"]] == ["avatar"]


def test_a_redraw_keeps_the_kind_of_the_earlier_job(api: Pictures) -> None:
    ready_job(api, 1, "avatar")
    api.messages()
    status, body = start(api, 2, kind="badge", previousJobId=job_id(1), change="bigger")
    assert (status, rules(body)) == (400, {("kind", "kind_mismatch")})
    assert api.counters() == (1, 1)
    status, body = start(api, 2, kind="avatar", previousJobId=job_id(1), change="bigger")
    assert (status, body["kind"]) == (202, "avatar")
    assert api.messages()[0]["kind"] == "avatar"


def test_jobs_saved_before_kinds_read_as_activity_objects(api: Pictures) -> None:
    """No migration: a PICJOB item without `kind` is an activity object in R33, R39, a redraw and a resend."""
    ready_job(api, 1, "activity-object")
    api.messages()
    forget_kind(api, "PICJOB", job_id(1))
    assert [j["kind"] for j in api.pcall(LIST)[1]["openJobs"]] == ["activity-object"]
    assert api.pcall(POLL, job=job_id(1))[1]["kind"] == "activity-object"
    assert rules(start(api, 2, kind="avatar", previousJobId=job_id(1))[1]) == {("kind", "kind_mismatch")}
    assert start(api, 2, previousJobId=job_id(1))[0] == 202
    # An old job whose message never went is sent as an activity object: with no kind, which picture-gen defaults.
    api.messages()
    assert start(api, 3)[0] == 202
    api.messages()
    forget_kind(api, "PICJOB", job_id(3))
    api.table.update_item("PICJOB", job_id(3), update="SET #s = :f", names={"#s": "sent"}, values={":f": False})
    assert start(api, 3)[0] == 202
    assert "kind" not in api.messages()[0]


def test_an_upload_takes_an_optional_kind(api: Pictures) -> None:
    status, body = api.upload()
    assert (status, body["picture"]["kind"]) == (201, "activity-object")
    assert api.table.get_item("PIC", body["picture"]["id"])["kind"] == "activity-object"  # type: ignore[index]
    status, body = api.upload(other_png(), kind="planet")
    assert (status, body["picture"]["kind"]) == (201, "planet")
    assert api.table.get_item("PIC", body["picture"]["id"])["kind"] == "planet"  # type: ignore[index]
    for kind in ("boss", 1, None):
        status, body = api.upload(other_png(), kind=kind)
        assert (status, rules(body)) == (400, {("kind", "unknown_kind")}), kind


def test_a_generated_picture_takes_its_jobs_kind_and_refuses_another(api: Pictures) -> None:
    ready_job(api, 1, "avatar")
    status, body = api.upload(source="GENERATED", jobId=job_id(1), kind="activity-object")
    assert (status, rules(body)) == (400, {("kind", "kind_mismatch")})
    assert "pictureId" not in api.table.get_item("PICJOB", job_id(1))  # type: ignore[operator]  # not used up
    status, body = api.upload(source="GENERATED", jobId=job_id(1))
    assert (status, body["picture"]["kind"]) == (201, "avatar")
    assert api.upload(source="GENERATED", jobId=job_id(1), kind="avatar")[0] == 200  # the same kind is fine


def test_the_same_pixels_as_another_kind_are_refused_not_silently_kept(api: Pictures) -> None:
    planet = api.upload(kind="planet")[1]["picture"]["id"]
    for body in ({"kind": "activity-object", "approve": True}, {}):  # a missing kind is activity-object
        status, answer = api.upload(**body)
        assert (status, rules(answer)) == (400, {("kind", "already_another_kind")}), body
    assert api.table.get_item("PIC", planet)["state"] == "DRAFT"  # type: ignore[index]  # not approved by the refusal
    assert api.upload(kind="planet")[0] == 200  # the same kind is still a duplicate, as before
    # A drawing whose pixels are already a picture of another kind is refused before the drawing is used up.
    ready_job(api, 1, "avatar")
    status, answer = api.upload(source="GENERATED", jobId=job_id(1))
    assert (status, rules(answer)) == (400, {("kind", "already_another_kind")})
    assert "pictureId" not in api.table.get_item("PICJOB", job_id(1))  # type: ignore[operator]


def test_pictures_saved_before_kinds_read_as_activity_objects_and_r33_filters_by_kind(api: Pictures) -> None:
    old = api.upload()[1]["picture"]["id"]
    forget_kind(api, "PIC", old)
    avatar = api.upload(other_png(), kind="avatar")[1]["picture"]["id"]
    pictures = {p["id"]: p["kind"] for p in api.pcall(LIST)[1]["pictures"]}
    assert pictures == {old: "activity-object", avatar: "avatar"}
    assert api.pcall(GET, id=old)[1]["picture"]["kind"] == "activity-object"
    assert [p["id"] for p in list_query(api, kind="activity-object")[1]["pictures"]] == [old]
    assert [p["id"] for p in list_query(api, kind="avatar")[1]["pictures"]] == [avatar]
    assert list_query(api, kind="badge")[1]["pictures"] == []
    assert [p["id"] for p in list_query(api, kind="avatar", state="DRAFT")[1]["pictures"]] == [avatar]
    status, body = list_query(api, kind="boss")
    assert (status, rules(body)) == (400, {("kind", "unknown_kind")})


def test_a_picture_not_made_for_activities_is_refused_in_an_activity(api: Pictures) -> None:
    field = "activityPayload.options.3.assetId"
    avatar = api.upload(kind="avatar", approve=True)[1]["picture"]["id"]
    revision = create(api, with_picture(avatar))
    assert validate(api, revision) == {(field, "picture_not_for_activities")}
    status, body = publish(api, revision, activity_id="ma-1001")
    assert status == 400, body
    assert api.table.get_item("PIC", avatar)["publishRefs"] == 0  # type: ignore[index]


@pytest.mark.parametrize("kind", ["activity-object", "activity-scene", None])
def test_activity_kinds_and_old_pictures_are_allowed_in_an_activity(api: Pictures, kind: str | None) -> None:
    picture_id = approved_picture(api) if kind is None else api.upload(kind=kind, approve=True)[1]["picture"]["id"]
    if kind is None:
        forget_kind(api, "PIC", picture_id)
    revision = create(api, with_picture(picture_id))
    assert validate(api, revision) == set()
    assert publish(api, revision, activity_id="ma-1001")[0] == 201


def test_repository_pictures_are_unaffected_by_kinds() -> None:
    assert definition_problems(MA_1001, "ma-1001", library={}) == []  # dice-2, dice-4 ...: the manifest, not kinds


# --- Gate P2: the background kind (1920 x 1056, 4 MiB) ---------------------------------------------------------------

BACKDROP = (REPO / "art" / "svg" / "map" / "luna-backdrop.svg").read_text(encoding="utf-8")


def background_png() -> bytes:
    from test_png_canon import sized_png

    return sized_png(1920, 1056, (0, 2))


def test_the_kind_sizes_come_from_the_contract() -> None:
    from shared.pictures import KIND_IDS, kind_spec

    entries = {k["id"]: k for k in json.loads((REPO / "contracts" / "limits.json").read_text())["picture"]["kinds"]}
    for kind in KIND_IDS:
        spec = kind_spec(kind)
        entry = entries[kind]
        assert (spec.width, spec.height, spec.svg_max_bytes, spec.max_bytes, spec.body_max_bytes, spec.max_tokens) == (
            entry["width"], entry["height"], entry["svgMaxBytes"], entry["maxBytes"], entry["bodyMaxBytes"],
            entry.get("maxTokens"),
        )  # fmt: skip
        if kind not in ("background", "route-tile"):  # every 256 kind exactly as before Gate P2
            assert (spec.width, spec.height, spec.svg_max_bytes, spec.max_bytes, spec.body_max_bytes) == (
                256, 256, 65_536, 524_288, 786_432
            )  # fmt: skip
            assert spec.max_tokens is None
    tile = kind_spec("route-tile")  # Gate M, LD8: one 96 px map tile at 2x
    assert (tile.width, tile.height, tile.max_tokens) == (192, 192, None)
    background = kind_spec("background")
    assert (background.width, background.height, background.max_tokens) == (1920, 1056, 32_000)
    # A 4 MiB stored PNG in base64 (R35's draft) and a 4 MiB upload's body both fit Lambda's 6 MB (6,291,456) payload.
    assert background.max_bytes == 4_194_304
    assert len(base64.b64encode(bytes(background.max_bytes))) + 4_096 < background.body_max_bytes < 6_291_456 - 65_536
    assert max(kind_spec(k).body_max_bytes for k in KIND_IDS) == picture_admin.BODY_MAX_BYTES


def test_a_background_is_stored_at_1920_by_1056_and_read_back(api: Pictures) -> None:
    status, body = api.upload(background_png(), kind="background")
    assert status == 201, body
    picture = body["picture"]
    assert picture["kind"] == "background"
    header = api.table.get_item("PIC", picture["id"])
    assert header is not None and (header["width"], header["height"]) == (1920, 1056)
    stored = api.s3.get_object(Bucket=PICTURES, Key=f"store/{picture['id']}.png")["Body"].read()
    assert stored[16:24] == bytes.fromhex("0000078000000420")  # IHDR 1920 x 1056
    status, got = api.pcall(GET, id=picture["id"])
    assert status == 200 and base64.b64decode(got["pngBase64"]) == stored


def test_a_background_sized_png_is_refused_for_another_kind_and_a_square_one_for_a_background(api: Pictures) -> None:
    status, body = api.upload(background_png(), kind="avatar")
    assert (status, rules(body)) == (400, {("pngBase64", "png_shape")})
    status, body = api.upload(png(), kind="background")
    assert (status, rules(body)) == (400, {("pngBase64", "png_shape")})
    assert api.table.query_prefix("PIC", "") == []


def test_a_background_over_4_mib_is_413(api: Pictures) -> None:
    status, body = api.upload(b"\x89PNG" + bytes(4_194_301), kind="background")
    assert (status, body["error"]["code"]) == (413, "PAYLOAD_TOO_LARGE")


def test_a_rewritten_background_over_4_mib_is_too_detailed(api: Pictures, monkeypatch: pytest.MonkeyPatch) -> None:
    """A very busy photo: filter 0 can make the rewritten PNG bigger than the browser's. R35 could not send it back."""
    real = picture_admin.canonicalise

    def bigger(data: bytes, **kwargs: Any) -> Any:
        result = real(data, **kwargs)
        return type(result)(png=result.png + bytes(4_194_304), sha256=result.sha256, picture_id=result.picture_id)

    monkeypatch.setattr(picture_admin, "canonicalise", bigger)
    status, body = api.upload(background_png(), kind="background")
    assert (status, rules(body)) == (400, {("pngBase64", "too_detailed")})
    assert api.table.query_prefix("PIC", "") == []


def test_a_background_drawing_is_polled_saved_and_checked_on_its_canvas(api: Pictures) -> None:
    status, body = start(api, 1, kind="background")
    assert (status, body["kind"]) == (202, "background")
    assert api.messages()[0]["kind"] == "background"
    assert len(BACKDROP.encode()) > 65_536  # a 256 kind's cap: the background's own caps must be used
    put_job_object(api, 1, "result.json", {"svg": BACKDROP, "warnings": []})
    body = api.pcall(POLL, job=job_id(1))[1]
    assert body["state"] == "READY", body
    assert body["svg"].startswith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3840 2112" width="1920"')
    status, saved = api.upload(background_png(), source="GENERATED", jobId=job_id(1))
    assert status == 201, saved
    assert saved["picture"]["kind"] == "background"


def test_a_square_result_for_a_background_job_is_unusable(api: Pictures) -> None:
    assert start(api, 1, kind="background")[0] == 202
    put_job_object(api, 1, "result.json", {"svg": GOOD_SVG})  # viewBox 0 0 256 256
    body = api.pcall(POLL, job=job_id(1))[1]
    assert (body["state"], body["error"]) == ("FAILED", "unusable")


def test_a_background_cannot_go_in_an_activity() -> None:
    from shared.pictures import ACTIVITY_KINDS

    assert "background" not in ACTIVITY_KINDS


def test_a_background_takes_three_places_in_each_cap_and_says_so_on_the_job(api: Pictures) -> None:
    """Gate P2: a background's worst case costs about 2.4 times a 256 kind's, so it counts 3 (limits.json capWeight):
    the caps still bound the month's cost. Other kinds still count 1 and are stored as before (no capWeight)."""
    status, body = start(api, 1, kind="background")
    assert status == 202, body
    assert (body["usedToday"], body["usedMonth"]) == (3, 3)
    assert api.table.get_item("PICJOB", job_id(1))["capWeight"] == 3  # type: ignore[index]
    assert start(api, 2)[0] == 202
    assert api.counters() == (4, 4)
    assert "capWeight" not in api.table.get_item("PICJOB", job_id(2))  # type: ignore[operator]


def test_a_background_that_no_longer_fits_is_429_while_a_lighter_kind_still_starts(api: Pictures) -> None:
    day, _ = cap_keys(api.clock.moment)
    api.table.update_item("PICCAP", day, update="SET #n = :n", names={"#n": "n"}, values={":n": 98})
    status, body = start(api, 1, kind="background")
    assert (status, body["error"]["code"], body["error"]["details"]["period"]) == (429, "PICTURE_CAP_REACHED", "day")
    assert api.counters()[0] == 98 and api.table.get_item("PICJOB", job_id(1)) is None
    assert start(api, 2)[0] == 202
    assert api.counters()[0] == 99
    api.table.update_item("PICCAP", day, update="SET #n = :n", names={"#n": "n"}, values={":n": 97})
    assert start(api, 3, kind="background")[0] == 202  # exactly fills the day: 97 + 3 = 100
    assert api.counters()[0] == 100


def test_a_cap_below_a_backgrounds_weight_refuses_it_without_counting(api: Pictures) -> None:
    api.config = PictureConfig(bucket=PICTURES, queue_url=api.queue_url, daily_cap=100, monthly_cap=2)
    status, body = start(api, 1, kind="background")
    assert (status, body["error"]["details"]["period"]) == (429, "month")
    assert api.counters() == (0, 0)
    assert start(api, 2)[0] == 202


def test_a_background_that_could_not_start_gets_all_three_places_back(api: Pictures) -> None:
    assert start(api, 1)[0] == 202
    api.sqs_client = BrokenSqs()
    status, _ = start(api, 2, kind="background")
    assert status == 503
    assert api.counters() == (1, 1)
    job = api.table.get_item("PICJOB", job_id(2))
    assert job is not None and (job["state"], job["error"], job["capWeight"]) == ("FAILED", "could_not_start", 3)


# --- Drawing spend per level (Gate M, LD7) ----------------------------------------------------------------------------


def test_a_drawing_for_a_level_counts_its_places_for_that_level_this_month(api: Pictures) -> None:
    assert start(api, 1, levelId="zigzag")[0] == 202
    assert start(api, 2, kind="background", levelId="zigzag")[0] == 202
    assert start(api, 3)[0] == 202  # for no level
    counter = api.table.get_item("PICCAP", "L#2026-11#zigzag")
    assert counter is not None and counter["n"] == 4  # a background takes three places
    job = api.table.get_item("PICJOB", job_id(1))
    assert job is not None and (job["levelId"], job["capLevel"]) == ("zigzag", "L#2026-11#zigzag")
    status, body = start(api, 4, levelId="Zig Zag")
    assert status == 400 and {"field": "levelId", "rule": "pattern"} in body["error"]["details"]


def test_a_drawing_that_could_not_start_gives_its_level_places_back(api: Pictures) -> None:
    assert start(api, 1, levelId="zigzag")[0] == 202
    api.sqs_client = BrokenSqs()
    assert start(api, 2, kind="background", levelId="zigzag")[0] == 503
    counter = api.table.get_item("PICCAP", "L#2026-11#zigzag")
    assert counter is not None and counter["n"] == 1
