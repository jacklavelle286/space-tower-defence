"""The allow-list logger (G §15) and the error envelope (G §1.2)."""

from __future__ import annotations

import io
import json
import logging

import pytest
from conftest import CapturedLogger

from shared.errors import ApiError, error_response
from shared.log import ALLOWED_FIELDS, ApiLogger


def test_unknown_fields_are_dropped_and_counted(captured_logger: CapturedLogger) -> None:
    captured_logger.line(requestId="r-1", status=200, nickname="Zed", dob="2020-01-02", answer="7")

    [line] = captured_logger.lines()
    assert line == {"level": "INFO", "requestId": "r-1", "status": 200, "droppedFields": 3}
    output = captured_logger.stream.getvalue()
    for value in ("Zed", "2020-01-02", "nickname", "dob"):
        assert value not in output


@pytest.mark.parametrize(
    "value",
    [{"nested": "Zed"}, ["Zed"], "Z" * 129, float("nan"), b"Zed", object()],
)
def test_allowed_field_with_unsafe_value_is_dropped(captured_logger: CapturedLogger, value: object) -> None:
    captured_logger.line(code=value)

    [line] = captured_logger.lines()
    assert line == {"level": "INFO", "droppedFields": 1}


def test_none_is_omitted_without_counting(captured_logger: CapturedLogger) -> None:
    captured_logger.line(runId=None, result="OK")
    assert captured_logger.lines() == [{"level": "INFO", "result": "OK"}]


def test_free_text_message_is_never_written(captured_logger: CapturedLogger) -> None:
    captured_logger._logger.info("hello Zed")  # bypassing line(): the formatter still refuses the text

    assert captured_logger.lines() == [{"level": "INFO", "droppedFields": 1}]


def test_powertools_default_keys_are_not_written(captured_logger: CapturedLogger) -> None:
    captured_logger._logger.append_keys(service_note="x", requestId="r-2")
    captured_logger.line(status=204)

    [line] = captured_logger.lines()
    assert "service" not in line and "sampling_rate" not in line and "service_note" not in line
    assert line == {"level": "INFO", "requestId": "r-2", "status": 204}


def test_records_never_reach_the_root_logger(monkeypatch: pytest.MonkeyPatch) -> None:
    """The Lambda runtime's root handler would write the raw field dict; the allow-list formatter is the only exit."""
    monkeypatch.setenv("POWERTOOLS_LOG_DEDUPLICATION_DISABLED", "true")
    root_stream = io.StringIO()
    root_handler = logging.StreamHandler(root_stream)
    logging.getLogger().addHandler(root_handler)
    try:
        own_stream = io.StringIO()
        ApiLogger("root-leak-test", stream=own_stream).line(code="X", nickname="Zed")
    finally:
        logging.getLogger().removeHandler(root_handler)

    assert root_stream.getvalue() == ""
    assert json.loads(own_stream.getvalue()) == {"level": "INFO", "code": "X", "droppedFields": 1}


PICTURE_FIELDS = {
    "pictureId",
    "jobId",
    "capPeriod",
    "usedToday",
    "usedMonth",
    "metric",
    "inputTokens",
    "outputTokens",
    "cacheReadTokens",
    "cacheWriteTokens",
    "stopReason",
    "model",
    "invalidated",
    "queuedSeconds",
}


def test_allow_list_is_g15_plus_error_type_and_the_picture_fields() -> None:
    """Gate P adds identifiers, counts and token numbers only: no field can carry a description or an SVG."""
    assert ALLOWED_FIELDS - {"errorType"} - PICTURE_FIELDS == {
        "requestId",
        "routeKey",
        "status",
        "durationMs",
        "sub",
        "runId",
        "slotId",
        "opId",
        "type",
        "result",
        "code",
        "revision",
        "generation",
        "action",
        "activityId",
        "speechId",
        "versionId",
    }


def test_error_envelope_shape() -> None:
    error = ApiError("VALIDATION_FAILED", details=[{"field": "nickname", "rule": "max_length"}])
    response = error_response(error, "req-1")

    assert response["statusCode"] == 400
    assert response["headers"]["cache-control"] == "no-store"
    assert json.loads(response["body"]) == {
        "error": {
            "code": "VALIDATION_FAILED",
            "message": "Request failed validation",
            "details": [{"field": "nickname", "rule": "max_length"}],
            "requestId": "req-1",
        }
    }


def test_details_omitted_when_absent() -> None:
    body = json.loads(error_response(ApiError("NOT_FOUND"), "req-2")["body"])
    assert body == {"error": {"code": "NOT_FOUND", "message": "Not found", "requestId": "req-2"}}


@pytest.mark.parametrize(
    ("code", "status"),
    [("FORBIDDEN", 403), ("THROTTLED", 503), ("SPEECH_SYNTHESIS_FAILED", 502), ("CLIENT_UPGRADE_REQUIRED", 426)],
)
def test_status_per_code(code: str, status: int) -> None:
    assert ApiError(code).status == status


def test_unknown_code_is_a_programming_error() -> None:
    with pytest.raises(ValueError, match="unknown error code"):
        ApiError("TEAPOT")
