"""cognito-presignup: auto-confirm within the daily cap, fail closed, never autoConfirmUser=false (spine S1.2)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import pytest
from botocore.exceptions import ClientError
from conftest import TABLE, CapturedLogger, RecordingClient, load_handler

from shared.data import DynamoTable

presignup = load_handler("cognito_presignup")
NOW = datetime(2026, 11, 15, 23, 59, tzinfo=UTC)
USERNAME = "testchild-q7"  # must never appear in a log line


def _event(trigger: str = "PreSignUp_SignUp") -> dict[str, Any]:
    # The shape Cognito sends: `response` arrives with every flag false.
    return {
        "version": "1",
        "region": "eu-west-2",
        "userPoolId": "eu-west-2_TESTPOOL",
        "userName": USERNAME,
        "callerContext": {"awsSdkVersion": "test", "clientId": "testclient"},
        "triggerSource": trigger,
        "request": {"userAttributes": {}},
        "response": {"autoConfirmUser": False, "autoVerifyEmail": False, "autoVerifyPhone": False},
    }


def _run(event: dict, table: DynamoTable, cap: str | None, logger: CapturedLogger) -> dict:
    return presignup.handle(event, table_factory=lambda: table, cap_setting=cap, now=NOW, logger=logger)


def test_below_cap_confirms(ddb: Any, captured_logger: CapturedLogger) -> None:
    result = _run(_event(), DynamoTable(ddb, TABLE), "20", captured_logger)

    assert result["response"] == {"autoConfirmUser": True, "autoVerifyEmail": False, "autoVerifyPhone": False}
    assert DynamoTable(ddb, TABLE).get_item("SYS#SIGNUPS", "2026-11-15")["count"] == 1
    assert captured_logger.lines() == [{"level": "INFO", "result": "CONFIRMED"}]


def test_at_cap_raises_and_never_returns_unconfirmed(ddb: Any, captured_logger: CapturedLogger) -> None:
    table = DynamoTable(ddb, TABLE)
    _run(_event(), table, "1", captured_logger)
    event = _event()

    with pytest.raises(presignup.SignUpRefused) as raised:
        _run(event, table, "1", captured_logger)

    assert str(raised.value) == presignup.REFUSAL_MESSAGE
    assert raised.value.__cause__ is None and raised.value.__suppress_context__  # no chained DynamoDB detail
    assert table.get_item("SYS#SIGNUPS", "2026-11-15")["count"] == 1
    assert captured_logger.lines()[-1] == {"level": "ERROR", "result": "REFUSED", "code": "SIGNUP_CAP_REACHED"}


class FailingClient:
    def update_item(self, **request: Any) -> dict:
        raise ClientError({"Error": {"Code": "ProvisionedThroughputExceededException", "Message": "x"}}, "UpdateItem")


@pytest.mark.parametrize(
    "table_factory",
    [
        lambda ddb: DynamoTable(FailingClient(), TABLE),  # throttled
        lambda ddb: DynamoTable(ddb, "no-such-table"),  # wrong table name: ResourceNotFoundException
        lambda ddb: (_ for _ in ()).throw(KeyError("GAME_TABLE_NAME")),  # environment variable missing
    ],
    ids=["throttled", "missing-table", "missing-env"],
)
def test_write_failure_fails_closed(ddb: Any, captured_logger: CapturedLogger, table_factory: Any) -> None:
    with pytest.raises(presignup.SignUpRefused):
        presignup.handle(
            _event(), table_factory=lambda: table_factory(ddb), cap_setting="20", now=NOW, logger=captured_logger
        )
    [line] = captured_logger.lines()
    assert line["code"] == "SIGNUP_WRITE_FAILED" and line["result"] == "REFUSED"


@pytest.mark.parametrize("cap", [None, "", "abc", "-1", "2.5", " ", "\u00b2", "\u0661"])
def test_bad_cap_setting_fails_closed_without_writing(
    cap: str | None, recording_client: RecordingClient, captured_logger: CapturedLogger
) -> None:
    with pytest.raises(presignup.SignUpRefused):
        _run(_event(), DynamoTable(recording_client, TABLE), cap, captured_logger)
    assert recording_client.calls == []
    [line] = captured_logger.lines()
    assert line["code"] == "CAP_SETTING_INVALID"


def test_cap_zero_closes_sign_up(ddb: Any, captured_logger: CapturedLogger) -> None:
    with pytest.raises(presignup.SignUpRefused):
        _run(_event(), DynamoTable(ddb, TABLE), "0", captured_logger)


def test_admin_create_user_passes_uncounted(recording_client: RecordingClient, captured_logger: CapturedLogger) -> None:
    event = _event("PreSignUp_AdminCreateUser")
    result = _run(event, DynamoTable(recording_client, TABLE), "0", captured_logger)

    assert result["response"]["autoConfirmUser"] is False  # left exactly as Cognito sent it
    assert recording_client.calls == []


@pytest.mark.parametrize("trigger", ["PreSignUp_ExternalProvider", "", None])
def test_other_triggers_are_refused(
    trigger: str | None, recording_client: RecordingClient, captured_logger: CapturedLogger
) -> None:
    with pytest.raises(presignup.SignUpRefused):
        _run(_event(trigger), DynamoTable(recording_client, TABLE), "20", captured_logger)  # type: ignore[arg-type]
    assert recording_client.calls == []


def test_no_path_returns_auto_confirm_false_for_a_sign_up(ddb: Any, captured_logger: CapturedLogger) -> None:
    # Every PreSignUp_SignUp either raises or returns autoConfirmUser true; run past the cap to cover both.
    table = DynamoTable(ddb, TABLE)
    outcomes = []
    for _ in range(4):
        try:
            outcomes.append(_run(_event(), table, "2", captured_logger)["response"]["autoConfirmUser"])
        except presignup.SignUpRefused:
            outcomes.append("raised")
    assert outcomes == [True, True, "raised", "raised"]
    assert USERNAME not in captured_logger.stream.getvalue()


def test_counts_on_the_utc_day(ddb: Any, captured_logger: CapturedLogger) -> None:
    table = DynamoTable(ddb, TABLE)
    late_bst = datetime(2026, 7, 1, 0, 30, tzinfo=UTC).astimezone()  # any zone: the key is the UTC date
    presignup.handle(_event(), table_factory=lambda: table, cap_setting="5", now=late_bst, logger=captured_logger)
    assert table.get_item("SYS#SIGNUPS", "2026-07-01")["count"] == 1
