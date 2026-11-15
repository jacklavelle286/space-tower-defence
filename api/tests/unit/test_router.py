"""The router: unknown route keys are refused before any DynamoDB call; catalogued stubs answer 501 (E.6.3, G §1.2)."""

from __future__ import annotations

import json

import boto3
import pytest
from conftest import CapturedLogger, RecordingClient, event_for, load_handler

from shared.auth import OPERATOR, PLAYER
from shared.data import DynamoTable
from shared.router import Request, Router

REQUEST_ID = "G4SN2i3fLPEEPpQ="  # requestContext.requestId in the Phase 5 fixture


def _reading_router(client: RecordingClient, logger: CapturedLogger) -> Router:
    """A router whose one handler reads the table, so a lookup would show up in the client's calls."""

    def get_me(request: Request) -> dict:
        DynamoTable(client, "game").get_item(f"U#{request.caller.sub}", "PROFILE")
        return {"statusCode": 200, "body": "{}"}

    return Router(routes={"GET /api/me": PLAYER}, handlers={"GET /api/me": get_me}, logger=logger)


def test_unknown_route_key_makes_zero_dynamodb_calls(
    player_event: dict, recording_client: RecordingClient, captured_logger: CapturedLogger
) -> None:
    router = _reading_router(recording_client, captured_logger)

    response = router.handle(event_for(player_event, "GET /spike/player"))

    assert response["statusCode"] == 404
    assert json.loads(response["body"])["error"]["code"] == "NOT_FOUND"
    assert recording_client.calls == []


def test_known_route_does_reach_the_table(
    player_event: dict, recording_client: RecordingClient, captured_logger: CapturedLogger
) -> None:
    # The control for the test above: the same router does call DynamoDB once the route is allowed.
    router = _reading_router(recording_client, captured_logger)

    response = router.handle(event_for(player_event, "GET /api/me"))

    assert response["statusCode"] == 200
    assert [name for name, _ in recording_client.calls] == ["get_item"]
    assert recording_client.calls[0][1]["ConsistentRead"] is True


def test_player_token_on_operator_route_makes_zero_dynamodb_calls(
    player_event: dict, recording_client: RecordingClient, captured_logger: CapturedLogger
) -> None:
    def never(request: Request) -> dict:
        DynamoTable(recording_client, "content").get_item("ACT#x", "HEADER")
        return {"statusCode": 200, "body": "{}"}

    router = Router(
        routes={"GET /api/admin/bank-status": OPERATOR},
        handlers={"GET /api/admin/bank-status": never},
        logger=captured_logger,
    )
    response = router.handle(event_for(player_event, "GET /api/admin/bank-status"))

    assert response["statusCode"] == 403
    assert recording_client.calls == []


@pytest.mark.parametrize("function", ["player_api", "admin_api", "tts"])
def test_real_handler_unknown_route_creates_no_client(
    player_event: dict, monkeypatch: pytest.MonkeyPatch, function: str
) -> None:
    created: list[tuple] = []
    monkeypatch.setattr(boto3, "client", lambda *a, **k: created.append(a) or RecordingClient())
    module = load_handler(function)

    response = module.handler(event_for(player_event, "GET /api/unknown"), None)

    assert response["statusCode"] == 404
    assert created == []


@pytest.mark.parametrize("function", ["player_api", "admin_api", "tts"])
def test_every_catalogued_route_answers_501_envelope(player_event: dict, function: str) -> None:
    module = load_handler(function)
    for route_key, authoriser in module.ROUTES.items():
        groups = "[admin]" if authoriser == OPERATOR else None
        response = module.handler(event_for(player_event, route_key, cognito__groups=groups), None)
        assert response["statusCode"] == 501, route_key
        assert response["headers"] == {"content-type": "application/json", "cache-control": "no-store"}
        error = json.loads(response["body"])["error"]
        assert error["code"] == "NOT_IMPLEMENTED"
        assert error["requestId"] == REQUEST_ID


def test_handler_crash_is_internal_and_logs_only_the_class_name(
    player_event: dict, captured_logger: CapturedLogger
) -> None:
    def crash(request: Request) -> dict:
        raise KeyError("nickname=Zed")  # an exception whose text holds a value

    router = Router(routes={"GET /api/me": PLAYER}, handlers={"GET /api/me": crash}, logger=captured_logger)
    response = router.handle(event_for(player_event, "GET /api/me"))

    assert response["statusCode"] == 500
    assert json.loads(response["body"])["error"]["code"] == "INTERNAL"
    assert "Zed" not in captured_logger.stream.getvalue()
    [line] = captured_logger.lines()
    assert line["errorType"] == "KeyError"
    assert line["level"] == "ERROR"


def test_one_log_line_per_request_with_allowed_fields(player_event: dict, captured_logger: CapturedLogger) -> None:
    router = Router(routes={"GET /api/me": PLAYER}, handlers={}, logger=captured_logger)
    router.handle(event_for(player_event, "GET /api/me"))
    router.handle(event_for(player_event, "GET /nope"))

    first, second = captured_logger.lines()
    assert first == {
        "level": "INFO",
        "requestId": REQUEST_ID,
        "routeKey": "GET /api/me",
        "sub": "a6c2b2b4-7051-70ef-b1e8-739ac38dd0cb",
        "result": "ERROR",
        "code": "NOT_IMPLEMENTED",
        "status": 501,
        "durationMs": first["durationMs"],
    }
    assert "routeKey" not in second and "sub" not in second  # nothing from a refused request beyond the facts
    assert second["code"] == "NOT_FOUND"
    # Nothing from the event outside the allow-list, e.g. the client IP or user agent.
    output = captured_logger.stream.getvalue()
    assert "203.0.113.10" not in output and "Python-urllib" not in output


def test_router_refuses_a_route_without_a_token() -> None:
    with pytest.raises(ValueError, match="authoriser"):
        Router(routes={"GET /api/open": "none"}, handlers={}, logger=CapturedLogger())


def test_router_refuses_a_handler_outside_the_allow_list() -> None:
    with pytest.raises(ValueError, match="allow-list"):
        Router(routes={"GET /api/me": PLAYER}, handlers={"GET /api/other": lambda r: {}}, logger=CapturedLogger())
