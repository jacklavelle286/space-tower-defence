# ruff: noqa: RUF001 - questions use the multiplication sign children see, not the letter x
"""R63-R64, AI drafting jobs in the admin (YG3): a start counts one place in the picture caps and queues an
activity-drafts message for picture-gen; a poll follows the job's objects to READY, where the drafts are checked again,
or FAILED. Nothing is saved as an activity here."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import datetime, timedelta
from typing import Any

import pytest
from test_admin_pictures import SUB, BrokenSqs, Pictures, audits, job_id, put_job_object

from shared import draft_admin, drafting, picture_admin
from shared.topics import TOPICS

START = "POST /api/admin/draft-jobs"
POLL = "GET /api/admin/draft-jobs/{jobId}"
TOPIC = "maths-times-tables-3-4-8"


@pytest.fixture
def api(ddb: Any, player_event: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> Pictures:
    pictures = Pictures(ddb, player_event)
    real = picture_admin._last_modified

    def last_modified(s3: Any, bucket: str, key: str) -> datetime | None:
        if real(s3, bucket, key) is None:
            return None
        return pictures.written.get(key, pictures.clock.moment)

    monkeypatch.setattr(draft_admin, "_last_modified", last_modified)
    return pictures


def start(api: Pictures, n: int = 1, **body: Any) -> tuple:
    doc = {"jobId": job_id(n), "topicId": TOPIC, "band": 8, "interactionType": "MULTIPLE_CHOICE", "count": 3, **body}
    return api.pcall(START, doc)


def poll(api: Pictures, n: int = 1) -> tuple:
    return api.pcall(POLL, job=job_id(n))


def good_draft() -> dict[str, Any]:
    reply = json.dumps(
        {
            "drafts": [
                {
                    "title": "8 × 7",
                    "question": "What is 8 × 7?",
                    "options": ["54", "56", "63", "48"],
                    "correctOption": 1,
                }
            ]
        }
    )
    good, _ = drafting.drafts_from_reply(
        reply, topic=TOPICS[TOPIC], band=8, interaction_type="MULTIPLE_CHOICE", count=1, seed="s"
    )
    return good[0]


def test_a_start_counts_one_place_and_queues_an_activity_drafts_message(api: Pictures) -> None:
    status, body = start(api, notes="space theme")
    assert status == 202, body
    assert (body["jobId"], body["state"], body["band"], body["count"]) == (job_id(1), "QUEUED", 8, 3)
    assert api.messages() == [
        {
            "jobType": "activity-drafts",
            "jobId": job_id(1),
            "topicId": TOPIC,
            "band": 8,
            "interactionType": "MULTIPLE_CHOICE",
            "count": 3,
            "notes": "space theme",
            "startedAt": "2026-11-20T10:14:01Z",
        }
    ]
    assert api.counters() == (1, 1)  # the same caps as drawings: the owner's spending limit covers both
    job = api.table.get_item("DRAFTJOB", job_id(1))
    assert job["sent"] is True and job["createdBy"] == SUB
    assert len(audits(api, "draft-job-start")) == 1


def test_the_same_start_again_is_never_counted_twice(api: Pictures) -> None:
    assert start(api)[0] == 202
    assert start(api)[0] == 202
    assert api.counters() == (1, 1) and len(api.messages()) == 1


@pytest.mark.parametrize(
    ("change", "field"),
    [
        ({"topicId": "maths-made-up"}, "topicId"),
        ({"band": 5}, "band"),
        ({"interactionType": "ARRANGE"}, "interactionType"),
        ({"count": 0}, "count"),
        ({"jobId": "x"}, "jobId"),
        ({"notes": "n" * 301}, "notes"),
    ],
)
def test_a_bad_start_is_refused_before_anything_is_counted(api: Pictures, change: dict, field: str) -> None:
    status, body = start(api, **change)
    assert status == 400 and field in {d["field"] for d in body["error"]["details"]}
    assert api.counters() == (0, 0) and api.messages() == []


def test_drafting_stops_at_the_cap_and_when_drawing_is_off(api: Pictures) -> None:
    api.config = replace(api.config, daily_cap=1)
    assert start(api, 1)[0] == 202
    status, body = start(api, 2)
    assert status == 429 and body["error"]["code"] == "PICTURE_CAP_REACHED"
    api.config = replace(api.config, queue_url="")
    status, body = start(api, 3)
    assert status == 429 and body["error"]["details"]["period"] == "off"


def test_a_message_that_cannot_be_sent_gives_the_place_back(api: Pictures) -> None:
    api.sqs_client = BrokenSqs()
    status, body = start(api)
    assert (status, body["error"]["code"]) == (503, "THROTTLED")
    assert api.counters() == (0, 0)
    assert api.table.get_item("DRAFTJOB", job_id(1))["error"] == "could_not_start"
    assert poll(api)[1]["state"] == "FAILED"


def test_poll_follows_the_job_from_queued_to_ready_and_checks_the_drafts_again(api: Pictures) -> None:
    assert start(api)[0] == 202
    assert poll(api)[1]["state"] == "QUEUED"
    put_job_object(api, 1, "claim", b"")
    assert poll(api)[1]["state"] == "DRAFTING"
    draft = good_draft()
    broken = {**draft, "activityId": "draft-2", "answerSpecification": {"accepted": []}}
    rejected = [{"index": 2, "title": "bad", "problems": ["prompt.text:length", "<script>:x"]}]
    put_job_object(api, 1, "result.json", {"drafts": [draft, broken], "rejected": rejected, "usage": {}})
    status, body = poll(api)
    assert status == 200 and body["state"] == "READY"
    assert body["drafts"] == [draft]  # the tampered one is dropped by the second check
    assert body["rejected"] == [{"index": 2, "title": "bad", "problems": ["prompt.text:length"]}]
    assert api.table.get_item("DRAFTJOB", job_id(1))["state"] == "READY"


def test_a_worker_error_fails_the_job_with_its_message(api: Pictures) -> None:
    assert start(api)[0] == 202
    put_job_object(api, 1, "claim", b"")
    put_job_object(api, 1, "error.json", {"code": "not_set_up"})
    body = poll(api)[1]
    assert (body["state"], body["error"]) == ("FAILED", "not_set_up") and body["message"]
    assert poll(api)[1]["state"] == "FAILED"  # stored: read again without the objects


def test_a_job_nobody_claims_times_out(api: Pictures) -> None:
    assert start(api)[0] == 202
    api.clock.moment += timedelta(minutes=30)
    assert poll(api)[1]["error"] == "timed_out"


def test_an_unknown_job_is_404(api: Pictures) -> None:
    assert poll(api, 9)[0] == 404
