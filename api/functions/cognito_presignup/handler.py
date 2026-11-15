"""cognito-presignup: the player pool's pre sign-up trigger (spine S1.2, E.7.1, J M1-15 part 1).

- `PreSignUp_SignUp` (a child signing up on managed login): take one place in today's allowance, then set
  `autoConfirmUser = true`.
- At the cap, on any write failure, or with a missing or bad cap setting: raise. Cognito then refuses the sign-up and
  shows the message. This fails closed. The handler never returns `autoConfirmUser = false`, which would create an
  UNCONFIRMED user nobody can confirm (no e-mail or phone in this pool).
- `PreSignUp_AdminCreateUser` (the owner creating an account): passed through, not counted.
- Any other trigger source: raise.

Nothing from the event (username, attributes) is logged.
"""

from __future__ import annotations

import os
import re
from collections.abc import Callable, Mapping
from datetime import UTC, datetime
from typing import Any

from shared.data import GAME_TABLE_ENV, DynamoTable, table_from_env
from shared.log import ApiLogger
from shared.signups import SignUpCapReached, count_signup

CAP_ENV = "SIGNUP_DAILY_CAP"
# Shown by managed login after Cognito's own prefix. Plain words for a grown-up reading with the child.
REFUSAL_MESSAGE = "Sign-up is closed for today. Please ask a grown-up to try again tomorrow."

LOGGER = ApiLogger("cognito-presignup")


class SignUpRefused(Exception):
    """Raised to make Cognito refuse the sign-up. Its text is the only thing the person signing up sees."""

    def __init__(self) -> None:
        super().__init__(REFUSAL_MESSAGE)


def _cap(value: str | None) -> int | None:
    # ASCII digits only: str.isdigit() also accepts characters such as "²" that int() rejects.
    if value is None or re.fullmatch(r"[0-9]+", value.strip()) is None:
        return None
    return int(value.strip())


def handle(
    event: dict[str, Any],
    *,
    table_factory: Callable[[], DynamoTable],
    cap_setting: str | None,
    now: datetime,
    logger: ApiLogger = LOGGER,
) -> dict[str, Any]:
    trigger = event.get("triggerSource")
    if trigger == "PreSignUp_AdminCreateUser":
        logger.line(result="PASSED")  # only PreSignUp_AdminCreateUser passes
        return event
    if trigger != "PreSignUp_SignUp":
        logger.line("ERROR", result="REFUSED", code="TRIGGER_UNSUPPORTED")
        raise SignUpRefused

    cap = _cap(cap_setting)
    if cap is None:
        logger.line("ERROR", result="REFUSED", code="CAP_SETTING_INVALID")
        raise SignUpRefused
    try:
        count_signup(table_factory(), now.astimezone(UTC).date(), cap)
    except SignUpCapReached:
        logger.line("ERROR", result="REFUSED", code="SIGNUP_CAP_REACHED")
        raise SignUpRefused from None
    except Exception as error:  # noqa: BLE001 - fail closed on anything else (throttling, permissions, network)
        logger.line("ERROR", result="REFUSED", code="SIGNUP_WRITE_FAILED", errorType=type(error).__name__)
        raise SignUpRefused from None

    response = event.get("response")
    if not isinstance(response, Mapping):
        response = {}
    event["response"] = {**response, "autoConfirmUser": True}
    logger.line(result="CONFIRMED")  # only PreSignUp_SignUp confirms
    return event


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    return handle(
        event,
        table_factory=lambda: table_from_env(GAME_TABLE_ENV),
        cap_setting=os.environ.get(CAP_ENV),
        now=datetime.now(UTC),
    )
