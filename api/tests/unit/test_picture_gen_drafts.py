# ruff: noqa: RUF001 - questions use the multiplication sign children see, not the letter x
"""picture-gen's activity-drafts jobs (YG3): the request, the stored result, and every way a job can fail, on moto S3
with a fake OpenAI client (OpenAI is never called). Drawings are unaffected: a drafts message never reaches
`_message`, and a drawing message never reaches `draft_job`."""

from __future__ import annotations

import json
from typing import Any

import pytest
from test_picture_gen_openai import CONFIG, JOB, KEY, FakeOpenAI, Harness, gen, message_item, response, text_part

from shared import drafting


class DraftOpenAI(FakeOpenAI):
    """The fake client with the non-streaming `responses.create` a drafting job uses."""

    def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.open_error is not None:
            raise self.open_error
        return self.final if self.final is not None else response(text=json.dumps({"drafts": []}))


def mc(title: str = "8 × 7", correct: int = 1) -> dict[str, Any]:
    return {"title": title, "question": "What is 8 × 7?", "options": ["54", "56", "63", "48"], "correctOption": correct}


def answer(*drafts: Any) -> Any:
    return response(output=[message_item(text_part(json.dumps({"drafts": list(drafts)})))])


@pytest.fixture
def h(aws_env: None) -> Any:
    from moto import mock_aws

    with mock_aws():
        harness = Harness()
        harness.openai = DraftOpenAI()
        yield harness


def run_drafts(h: Harness, **body: Any) -> None:
    doc = {
        "jobType": "activity-drafts",
        "jobId": JOB,
        "topicId": "maths-times-tables-3-4-8",
        "band": 8,
        "interactionType": "MULTIPLE_CHOICE",
        "count": 2,
        **body,
    }
    h.worker.handle({"Records": [{"body": json.dumps(doc)}]})


def test_the_request_asks_for_structured_drafts_on_the_topic_and_year(h: Harness) -> None:
    h.openai.final = answer(mc(), mc("second"))
    run_drafts(h, notes="use the space theme")
    [call] = h.openai.calls
    assert call["model"] == "gpt-6.1-sol" and call["store"] is False
    assert call["instructions"] == drafting.instructions("MULTIPLE_CHOICE")
    assert "School year: Year 3." in call["input"] and "use the space theme" in call["input"]
    fmt = call["text"]["format"]
    assert (fmt["type"], fmt["strict"], fmt["schema"]) == (
        "json_schema",
        True,
        drafting.output_schema("MULTIPLE_CHOICE"),
    )
    assert call["prompt_cache_key"] == "activity-drafts:MULTIPLE_CHOICE:v1"
    assert h.clients == [("activity-object", KEY)]


def test_good_drafts_are_stored_checked_and_counted(h: Harness) -> None:
    h.openai.final = answer(mc(), mc("no answer", correct=9))
    run_drafts(h)
    result = h.read("result.json")
    assert [d["title"] for d in result["drafts"]] == ["8 × 7"]
    assert result["drafts"][0]["activityId"] == "draft-1" and result["drafts"][0]["minAge"] == 8
    assert [r["title"] for r in result["rejected"]] == ["no answer"]
    assert result["model"] == "gpt-6.1-sol" and set(result["usage"]) >= {"input", "output"}
    line = h.logger.lines()[-1]
    assert (line["metric"], line["result"], line["draftCount"], line["rejectedCount"]) == ("draft_usage", "OK", 1, 1)
    assert "8 × 7" not in json.dumps(h.logger.lines())  # counts only: never the questions


@pytest.mark.parametrize(
    ("final", "code"),
    [
        (response(text="not json at all"), "unusable"),
        (response(status="incomplete", reason="max_output_tokens", text=""), "too_long"),
        (response(status="incomplete", reason="content_filter", text=""), "declined"),
    ],
)
def test_each_failed_reply_is_its_error_code(h: Harness, final: Any, code: str) -> None:
    h.openai.final = final
    run_drafts(h)
    assert h.read("error.json") == {"code": code} and h.read("result.json") is None


def test_a_claimed_job_is_never_drafted_twice(h: Harness) -> None:
    h.openai.final = answer(mc())
    run_drafts(h)
    run_drafts(h)
    assert len(h.openai.calls) == 1
    assert h.logger.lines()[-1]["result"] == "DUPLICATE"


def test_a_job_that_waited_too_long_is_timed_out_without_a_call(h: Harness) -> None:
    run_drafts(h, startedAt="2026-11-20T09:00:00Z")  # the harness's now is 10:00
    assert h.read("error.json") == {"code": "timed_out"} and h.openai.calls == []


def test_a_missing_key_is_not_set_up_and_bedrock_cannot_draft(aws_env: None) -> None:
    from dataclasses import replace

    from moto import mock_aws

    with mock_aws():
        h = Harness(secret="")
        h.openai = DraftOpenAI()
        run_drafts(h)
        assert h.read("error.json") == {"code": "not_set_up"} and h.openai.calls == []
    with mock_aws():
        h = Harness(config=replace(CONFIG, provider="bedrock"))
        h.openai = DraftOpenAI()
        run_drafts(h)
        assert h.read("error.json") == {"code": "not_set_up"} and h.bedrock_calls == 0


@pytest.mark.parametrize(
    "bad",
    [
        {"topicId": "maths-made-up"},
        {"band": 5},  # not one of the topic's bands
        {"interactionType": "PICTURE_SELECT"},
        {"count": 6},
        {"extra": "field"},
        {"jobId": "not-a-uuid"},
    ],
)
def test_a_drafts_message_admin_api_would_not_send_is_a_bad_message(h: Harness, bad: dict[str, Any]) -> None:
    run_drafts(h, **bad)
    assert h.openai.calls == [] and h.read("claim") is None
    assert h.logger.lines()[-1]["code"] == "bad_message"


def test_a_drawing_still_goes_to_the_drawing_path() -> None:
    assert gen._draft_message({"body": json.dumps({"jobId": JOB, "description": "a sun"})}) is None
