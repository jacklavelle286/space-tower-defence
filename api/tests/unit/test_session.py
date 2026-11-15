"""Phase 16 session lease (G §7 R13/R14, spine S3.4, F §5; M1-16) on moto, and the claim rule itself.

Exit criterion here: a claim on a terminal run gets 409 RUN_TERMINAL.
"""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import pytest
from runs_harness import (
    DDB_FIXTURES,
    MY_SESSION,
    OTHER_SESSION,
    OTHER_SUB,
    PK,
    RUN_A,
    RUN_B,
    RunsApi,
    at,
    errors,
)

from shared.session import conflict

NOW = at("2026-11-20T10:00:00Z")


@pytest.fixture
def api(ddb: Any, player_event: dict) -> RunsApi:
    api = RunsApi(ddb)
    api.profile(player_event)
    assert api.create(player_event)[0] == 201  # RUN_A, held by MY_SESSION, generation 1
    return api


def claim(session_id: str = MY_SESSION, run_id: str = RUN_A, **changes: Any) -> dict[str, Any]:
    return {"mode": "claim", "runId": run_id, "sessionId": session_id, "deviceLabel": "Kitchen laptop", **changes}


def renew(generation: Any, session_id: str = MY_SESSION, **changes: Any) -> dict[str, Any]:
    body = {"mode": "renew", "runId": RUN_A, "sessionId": session_id, "generation": generation,
            "deviceLabel": "Kitchen laptop", **changes}  # fmt: skip
    return {k: v for k, v in body.items() if v is not None}


def put(api: RunsApi, base: dict, body: dict, **kwargs: Any) -> tuple[int, Any]:
    return api.call(base, "PUT /api/session", body, **kwargs)


def later(api: RunsApi, seconds: int) -> None:
    api.clock.now = api.clock.now + timedelta(seconds=seconds)


# --- Exit criterion -------------------------------------------------------------------------------------------------


@pytest.mark.parametrize("status", ["DEFEATED", "ABANDONED", "COMPLETED"])
def test_a_claim_on_a_terminal_run_is_run_terminal(api: RunsApi, player_event: dict, status: str) -> None:
    api.set_run_fields(RUN_A, status=status)
    before = api.item("SESSION")

    code, body = put(api, player_event, claim())

    assert (code, body["error"]["code"]) == (409, "RUN_TERMINAL")
    assert api.item("SESSION") == before


# --- claim ----------------------------------------------------------------------------------------------------------


def test_claim_by_the_same_holder_extends_and_keeps_the_generation(api: RunsApi, player_event: dict) -> None:
    later(api, 100)
    code, body = put(api, player_event, claim())
    assert code == 200
    assert body == {
        "sessionId": MY_SESSION,
        "generation": 1,
        "leaseExpiresAt": "2026-11-20T10:04:40Z",
        "leaseSeconds": 180,
        "renewAfterSeconds": 60,
        "runId": RUN_A,
    }
    assert put(api, player_event, claim())[1] == body  # a lost claim response is harmless


def test_claim_while_another_device_holds_a_live_lease(api: RunsApi, player_event: dict) -> None:
    later(api, 30)
    code, body = put(api, player_event, claim(OTHER_SESSION, deviceLabel="Bedroom tablet"))
    assert code == 409
    assert body["error"]["code"] == "ACTIVE_SESSION_ELSEWHERE"
    assert body["error"]["details"] == {"retryAfterSeconds": 150, "deviceLabel": "Kitchen laptop"}
    assert api.item("SESSION")["sessionId"] == MY_SESSION


def test_a_lapsed_unreleased_lease_needs_the_takeover_question(api: RunsApi, player_event: dict) -> None:
    later(api, 600)
    code, body = put(api, player_event, claim(OTHER_SESSION, deviceLabel="Bedroom tablet"))
    assert (code, body["error"]["code"]) == (409, "TAKEOVER_CONFIRM_REQUIRED")
    assert body["error"]["details"] == {"deviceLabel": "Kitchen laptop", "lastSeenSecondsAgo": 600}

    code, body = put(api, player_event, claim(OTHER_SESSION, deviceLabel="Bedroom tablet", takeover=True))
    assert code == 200 and body["generation"] == 2  # a new tenure
    session = api.item("SESSION")
    assert session["sessionId"] == OTHER_SESSION
    assert (session["deviceLabel"], session["released"]) == ("Bedroom tablet", False)


def test_a_released_lease_is_taken_without_a_question(api: RunsApi, player_event: dict) -> None:
    assert api.call(player_event, "DELETE /api/session", {"sessionId": MY_SESSION, "generation": 1})[0] == 204
    code, body = put(api, player_event, claim(OTHER_SESSION))
    assert code == 200 and body["generation"] == 2


def test_the_old_holder_reclaims_with_a_new_generation_after_a_takeover(api: RunsApi, player_event: dict) -> None:
    api.call(player_event, "DELETE /api/session", {"sessionId": MY_SESSION, "generation": 1})
    put(api, player_event, claim(OTHER_SESSION))
    api.call(player_event, "DELETE /api/session", {"sessionId": OTHER_SESSION, "generation": 2})
    code, body = put(api, player_event, claim())
    assert code == 200 and body["generation"] == 3  # never back to 1: the fence would let old ops through


def test_a_reset_holder_counts_as_released(api: RunsApi, player_event: dict) -> None:
    api.set_session(generation=7, sessionId="RESET#req-1", leaseExpiresAt="2026-11-20T10:01:00Z", released=False)
    code, body = put(api, player_event, claim(OTHER_SESSION))
    assert code == 200 and body["generation"] == 8


def test_a_first_claim_creates_the_session_item(ddb: Any, player_event: dict) -> None:
    api = RunsApi(ddb)
    api.profile(player_event)
    api.create(player_event)
    api.raw.delete_item(TableName="test-game", Key={"pk": {"S": PK}, "sk": {"S": "SESSION"}})
    code, body = put(api, player_event, claim())
    assert code == 200 and body["generation"] == 1


def test_claim_on_a_missing_or_other_players_run_is_not_found(api: RunsApi, player_event: dict) -> None:
    missing = put(api, player_event, claim(run_id=RUN_B))
    api.profile(player_event, sub=OTHER_SUB)
    theirs = put(api, player_event, claim(), sub=OTHER_SUB)
    assert missing == theirs
    assert missing[0] == 404 and missing[1]["error"]["code"] == "NOT_FOUND"


def test_claim_uses_the_recorded_refusal_shape(api: RunsApi, player_event: dict) -> None:
    """The R13 claim refusal recorded from DynamoDB (session-claim-refused.json) decides the 409 by itself."""
    recorded = json.loads((DDB_FIXTURES / "session-claim-refused.json").read_text())
    refusal = {"Error": {"Code": "ConditionalCheckFailedException", "Message": "x"}, "Item": recorded["Item"]}
    api.ddb.update_failures = [refusal, refusal]  # step (1) and step (2) both refused
    gets_before = api.ddb.names().count("get_item")

    code, body = put(api, player_event, claim())

    assert (code, body["error"]["code"]) == (409, "ACTIVE_SESSION_ELSEWHERE")
    assert body["error"]["details"]["deviceLabel"] == "Bedroom tablet"
    assert api.ddb.names().count("get_item") == gets_before + 1  # the RUN read only: the old item came with the error


# --- renew ----------------------------------------------------------------------------------------------------------


def test_renew_extends_this_tenure_only(api: RunsApi, player_event: dict) -> None:
    later(api, 60)
    code, body = put(api, player_event, renew(1))
    assert code == 200
    assert (body["generation"], body["leaseExpiresAt"]) == (1, "2026-11-20T10:04:00Z")
    assert api.item("SESSION")["lastRenewedAt"] == "2026-11-20T10:01:00Z"


def test_renew_after_a_lapse_still_works_when_nobody_took_over(api: RunsApi, player_event: dict) -> None:
    later(api, 3600)  # correctness never depends on the clock (F §5.4)
    assert put(api, player_event, renew(1))[0] == 200


@pytest.mark.parametrize("body", [renew(2), renew(1, session_id=OTHER_SESSION)])
def test_a_failed_renew_is_stale_session_and_never_a_claim(api: RunsApi, player_event: dict, body: dict) -> None:
    api.call(player_event, "DELETE /api/session", {"sessionId": MY_SESSION, "generation": 1})  # free to claim
    before = api.item("SESSION")
    code, answer = put(api, player_event, body)
    assert (code, answer["error"]["code"]) == (409, "STALE_SESSION")
    assert api.item("SESSION") == before


def test_renew_needs_a_generation(api: RunsApi, player_event: dict) -> None:
    code, body = put(api, player_event, renew(None))
    assert (code, errors(body)) == (400, [{"field": "generation", "rule": "required"}])


def test_a_throttled_heartbeat_is_503_never_stale_session(api: RunsApi, player_event: dict) -> None:
    busy = {"Error": {"Code": "TransactionConflictException", "Message": "x"}}
    api.ddb.update_failures = [busy, busy, busy]
    code, body = put(api, player_event, renew(1))
    assert (code, body["error"]["code"]) == (503, "THROTTLED")
    assert len(api.sleeps) == 3

    api.ddb.update_failures = [busy]
    assert put(api, player_event, renew(1))[0] == 200  # retried after one conflict


def test_session_body_validation(api: RunsApi, player_event: dict) -> None:
    body = {"mode": "steal", "runId": RUN_A, "sessionId": "x", "deviceLabel": "", "generation": -1, "who": "me"}
    code, answer = put(api, player_event, body)
    assert code == 400
    assert errors(answer) == [
        {"field": "body", "rule": "additionalProperties"},
        {"field": "mode", "rule": "enum"},
        {"field": "sessionId", "rule": "pattern"},
        {"field": "generation", "rule": "minimum"},
        {"field": "deviceLabel", "rule": "minLength"},
    ]


# --- release (R14) --------------------------------------------------------------------------------------------------


def test_release_marks_the_lease_released_and_expired_now(api: RunsApi, player_event: dict) -> None:
    later(api, 20)
    assert api.call(player_event, "DELETE /api/session", {"sessionId": MY_SESSION, "generation": 1}) == (204, None)
    session = api.item("SESSION")
    assert (session["released"], session["leaseExpiresAt"], session["generation"]) == (True, "2026-11-20T10:00:20Z", 1)


def test_release_by_someone_else_is_204_and_changes_nothing(api: RunsApi, player_event: dict) -> None:
    before = api.item("SESSION")
    assert api.call(player_event, "DELETE /api/session", {"sessionId": OTHER_SESSION, "generation": 1})[0] == 204
    assert api.call(player_event, "DELETE /api/session", {"sessionId": MY_SESSION, "generation": 9})[0] == 204
    assert api.item("SESSION") == before


def test_release_falls_back_to_query_parameters(api: RunsApi, player_event: dict) -> None:
    query = {"sessionId": MY_SESSION, "generation": "1"}
    assert api.call(player_event, "DELETE /api/session", query=query)[0] == 204
    assert api.item("SESSION")["released"] is True
    code, body = api.call(player_event, "DELETE /api/session", query={"sessionId": MY_SESSION, "generation": "one"})
    assert (code, errors(body)) == (400, [{"field": "generation", "rule": "type"}])


def test_release_with_no_session_item_is_204(ddb: Any, player_event: dict) -> None:
    api = RunsApi(ddb)
    assert api.call(player_event, "DELETE /api/session", {"sessionId": MY_SESSION, "generation": 1})[0] == 204


# --- The rule itself --------------------------------------------------------------------------------------------------


HELD = {
    "sessionId": OTHER_SESSION,
    "generation": 3,
    "leaseExpiresAt": "2026-11-20T10:01:00Z",
    "released": False,
    "deviceLabel": "Bedroom tablet",
    "lastRenewedAt": "2026-11-20T09:58:00Z",
}


@pytest.mark.parametrize(
    ("old", "takeover", "expected"),
    [
        (None, False, None),
        ({}, False, None),
        ({**HELD, "sessionId": MY_SESSION}, False, None),
        ({**HELD, "released": True}, False, None),
        ({**HELD, "sessionId": "RESET#abc"}, False, None),
        (HELD, False, ("ACTIVE_SESSION_ELSEWHERE", {"retryAfterSeconds": 60, "deviceLabel": "Bedroom tablet"})),
        (HELD, True, ("ACTIVE_SESSION_ELSEWHERE", {"retryAfterSeconds": 60, "deviceLabel": "Bedroom tablet"})),
        (
            {**HELD, "leaseExpiresAt": "2026-11-20T10:00:00Z"},  # expiry == now counts as lapsed (<= :now)
            False,
            ("TAKEOVER_CONFIRM_REQUIRED", {"deviceLabel": "Bedroom tablet", "lastSeenSecondsAgo": 120}),
        ),
        ({**HELD, "leaseExpiresAt": "2026-11-20T09:59:59Z"}, True, None),
    ],
)
def test_conflict_rule(old: dict | None, takeover: bool, expected: tuple | None) -> None:
    refusal = conflict(old, MY_SESSION, NOW, takeover)
    if expected is None:
        assert refusal is None
    else:
        assert refusal is not None
        assert (refusal.code, refusal.details) == expected
