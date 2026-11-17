"""admin-api's game-data routes (Gate M, LD7): R46-R52 on moto, with a fake game-data publisher. admin-api never
writes game data: it reads what is published, queues a publish behind the checklist, and passes the quick actions to
the publisher, whose refusals come back as 409 PUBLISH_REFUSED."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

import pytest
from conftest import REPO
from test_admin_api import BUCKET, SUB, Admin
from test_levels import level

from shared.gamedata_admin import HAND_TICKS

TICKS = dict.fromkeys(HAND_TICKS, True)
TESTER = "0f0e0d0c-0b0a-4908-8706-050403020100"


class FakePublisher:
    """Records what admin-api asks of game-data-publish and answers as the publisher would."""

    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []
        self.started: list[dict[str, Any]] = []
        self.answer: dict[str, Any] = {"ok": True}

    def call(self, payload: dict[str, Any]) -> dict[str, Any]:
        self.calls.append(payload)
        return self.answer

    def start(self, payload: dict[str, Any]) -> None:
        self.started.append(payload)


@pytest.fixture
def api(ddb: Any, player_event: dict[str, Any]) -> Admin:
    admin = Admin(ddb, player_event)
    admin.publisher = FakePublisher()
    return admin


def put(api: Admin, key: str, body: Any) -> None:
    api.s3.put_object(Bucket=BUCKET, Key=f"game-data/{key}", Body=json.dumps(body).encode())


def a_published_version(api: Admin) -> None:
    """luna-1-a1, made in the portal from the zigzag level: its campaign a preview for one tester."""
    api.release_game_data()
    doc = json.loads((REPO / "game-data" / "campaign" / "luna-1-c1.json").read_text())
    doc["version"] = "luna-1-a1"
    put(api, "campaign/luna-1-a1.json", doc)
    put(
        api,
        "versions.json",
        {
            "kind": "versions",
            "schema": 1,
            "testers": [TESTER],
            "versions": {"luna-1-a1": {"first-contact": "preview"}},
        },
    )
    api.table.transact_write(
        [
            api.table.put_action(
                {
                    "pk": "GDPUBLISH",
                    "sk": "2026-11-20T10:00:00Z#luna-1-a1",
                    "action": "publish",
                    "campaignVersion": "luna-1-a1",
                    "prev": "luna-1-c1",
                    "live": False,
                    "levelId": "zigzag",
                    "by": SUB,
                },
                condition="attribute_not_exists(#pk)",
                names={"#pk": "pk"},
            )
        ]
    )


def checks_ran(api: Admin, revision: int = 0, source: str = "luna-1-c1", blocking: int = 0) -> None:
    played = {"draftRevision": revision, "sourceVersion": source, "blocking": blocking, "warnings": 0}
    status, body = api.call("POST /api/admin/levels/{id}/testplay", played, id="zigzag")
    assert status == 200, body


def publish(api: Admin, **changes: Any) -> tuple:
    body = {"draftRevision": 0, "sourceVersion": "luna-1-c1", "live": True, "ticks": TICKS, **changes}
    return api.call("POST /api/admin/levels/{id}/publish", body, id="zigzag")


# --- R46, R47 ---------------------------------------------------------------------------------------------------------


def test_the_versions_panel_lists_versions_states_testers_and_history(api: Admin) -> None:
    a_published_version(api)
    status, body = api.call("GET /api/admin/game-data")
    assert status == 200, body
    assert body["current"] == {"rulesetVersion": "r1", "campaignVersion": "luna-1-c1"}
    assert body["live"]["version"] == "luna-1-c1"  # what the designer merges levels into
    assert body["testers"] == [TESTER]
    rows = {row["campaignVersion"]: row for row in body["versions"]}
    assert set(rows) == {"luna-1-c1", "luna-1-a1"}
    assert rows["luna-1-c1"]["live"] is True and rows["luna-1-c1"]["source"] == "release"
    assert rows["luna-1-a1"]["source"] == "portal" and rows["luna-1-a1"]["levelId"] == "zigzag"
    assert [(w["waveSetId"], w["state"]) for w in rows["luna-1-a1"]["waveSets"]] == [("first-contact", "preview")]
    assert rows["luna-1-c1"]["waveSets"][0]["state"] == "published"  # not listed: published
    assert body["history"] == [
        {
            "at": "2026-11-20T10:00:00Z",
            "action": "publish",
            "campaignVersion": "luna-1-a1",
            "prev": "luna-1-c1",
            "live": False,
            "levelId": "zigzag",
            "by": SUB,
        }
    ]


def test_unreadable_game_data_is_content_unavailable(api: Admin) -> None:
    status, body = api.call("GET /api/admin/game-data")
    assert (status, body["error"]["code"]) == (409, "CONTENT_UNAVAILABLE")


def test_one_version_document(api: Admin) -> None:
    a_published_version(api)
    status, body = api.call("GET /api/admin/game-data/versions/{id}", id="luna-1-a1")
    assert status == 200 and body["campaignVersion"] == "luna-1-a1" and body["document"]["version"] == "luna-1-a1"
    assert api.call("GET /api/admin/game-data/versions/{id}", id="luna-1-a9")[0] == 404
    assert api.call("GET /api/admin/game-data/versions/{id}", id="../current")[0] == 404


# --- R48 --------------------------------------------------------------------------------------------------------------


def test_validate_asks_the_publisher_and_passes_its_refusal_on(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    api.publisher.answer = {"ok": True, "sourceVersion": "luna-1-c1", "draftRevision": 0, "problems": [],
                            "pictures": []}  # fmt: skip
    status, body = api.call("POST /api/admin/levels/{id}/validate", {"draftRevision": 0}, id="zigzag")
    assert status == 200 and body["sourceVersion"] == "luna-1-c1"
    assert api.publisher.calls == [{"action": "validate", "levelId": "zigzag", "draftRevision": 0}]

    api.publisher.answer = {"ok": False, "error": {"code": "DRAFT_CONFLICT", "message": "the draft has changed"}}
    status, body = api.call("POST /api/admin/levels/{id}/validate", {"draftRevision": 0}, id="zigzag")
    assert (status, body["error"]["code"]) == (409, "PUBLISH_REFUSED")
    assert body["error"]["details"]["code"] == "DRAFT_CONFLICT"
    assert api.call("POST /api/admin/levels/{id}/validate", {"draftRevision": 0}, id="nope")[0] == 404
    assert api.call("POST /api/admin/levels/{id}/validate", {"draftRevision": "0"}, id="zigzag")[0] == 400


# --- R49 --------------------------------------------------------------------------------------------------------------


def test_publish_needs_a_test_play_of_this_revision_against_this_live_version(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    status, body = publish(api)
    assert (status, body["error"]["details"]["code"]) == (409, "NOT_TEST_PLAYED")
    checks_ran(api, source="luna-1-c0")  # checked against another live version
    assert publish(api)[1]["error"]["details"]["code"] == "NOT_TEST_PLAYED"
    checks_ran(api, blocking=1)  # a red result
    assert publish(api)[1]["error"]["details"]["code"] == "NOT_TEST_PLAYED"
    assert api.publisher.started == []


def test_publish_needs_every_hand_tick(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    checks_ran(api)
    status, body = publish(api, ticks={**TICKS, "backdropHasNoPath": False})
    assert status == 400
    assert body["error"]["details"] == [{"field": "ticks.backdropHasNoPath", "rule": "must_be_ticked"}]
    status, body = publish(api, ticks={"routeReadsClearly": True})
    assert status == 400 and body["error"]["details"] == [{"field": "ticks", "rule": "keys"}]
    status, body = publish(api, live="yes")
    assert status == 400 and {"field": "live", "rule": "type"} in body["error"]["details"]


def test_publish_is_refused_for_an_old_revision(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    checks_ran(api)
    api.call("PUT /api/admin/levels/{id}/draft", {"draftRevision": 0, "level": level()}, id="zigzag")
    status, body = publish(api)
    assert (status, body["error"]["code"]) == (409, "DRAFT_CONFLICT")


def test_publish_is_queued_once_and_the_level_view_shows_it(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    checks_ran(api)
    status, body = publish(api)
    assert status == 202, body
    assert body["publish"]["state"] == "QUEUED" and body["publish"]["draftRevision"] == 0
    assert api.publisher.started == [
        {
            "action": "publish",
            "levelId": "zigzag",
            "draftRevision": 0,
            "sourceVersion": "luna-1-c1",
            "live": True,
            "by": SUB,
        }
    ]
    status, again = publish(api)  # a second press while it runs: the same publish, not queued twice
    assert status == 202 and again["publish"]["state"] == "QUEUED" and len(api.publisher.started) == 1

    claim = api.table.get_item("LEVEL#zigzag", "PUB#0000000000")
    assert claim is not None and claim["ticks"] == TICKS and claim["requestedLive"] is True
    _, view = api.call("GET /api/admin/levels/{id}", id="zigzag")
    assert view["publish"]["state"] == "QUEUED" and view["versions"] == []


def test_a_publish_that_never_ran_may_be_queued_again(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    checks_ran(api)
    publish(api)
    api.clock.moment += timedelta(minutes=16)  # past the publisher's timeout and the event age
    assert publish(api)[0] == 202 and len(api.publisher.started) == 2


def test_a_refused_publish_is_queued_again_without_its_old_refusal(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    checks_ran(api)
    publish(api)
    api.table.update_item(
        "LEVEL#zigzag",
        "PUB#0000000000",
        update="SET #s = :s, #code = :c, #d = :d",
        names={"#s": "state", "#code": "code", "#d": "details"},
        values={":s": "REFUSED", ":c": "STALE_SOURCE", ":d": {"code": "STALE_SOURCE", "message": "m"}},
    )
    _, view = api.call("GET /api/admin/levels/{id}", id="zigzag")
    assert view["publish"]["refusal"] == {"code": "STALE_SOURCE", "message": "m"}
    status, body = publish(api)
    assert status == 202 and body["publish"]["state"] == "QUEUED" and "refusal" not in body["publish"]
    claim = api.table.get_item("LEVEL#zigzag", "PUB#0000000000")
    assert claim is not None and "code" not in claim and "details" not in claim
    assert len(api.publisher.started) == 2


def test_a_done_publish_answers_its_version_and_a_published_level_cannot_be_deleted(api: Admin) -> None:
    api.call("POST /api/admin/levels", {"level": level()})
    checks_ran(api)
    publish(api)
    api.table.update_item(
        "LEVEL#zigzag",
        "PUB#0000000000",
        update="SET #s = :s, #v = :v, #live = :live",
        names={"#s": "state", "#v": "campaignVersion", "#live": "live"},
        values={":s": "DONE", ":v": "luna-1-a1", ":live": True},
    )
    api.table.update_item("LEVEL", "zigzag", update="SET #s = :s", names={"#s": "status"}, values={":s": "PUBLISHED"})
    status, body = publish(api)
    assert status == 200 and body["publish"]["campaignVersion"] == "luna-1-a1" and body["publish"]["live"] is True
    assert len(api.publisher.started) == 1
    status, body = api.call("DELETE /api/admin/levels/{id}", id="zigzag")
    assert (status, body["error"]["code"]) == (409, "LEVEL_PUBLISHED")


# --- R50, R51, R52 ----------------------------------------------------------------------------------------------------


def test_make_live_state_and_testers_go_to_the_publisher(api: Admin) -> None:
    api.publisher.answer = {"ok": True, "campaignVersion": "luna-1-a1", "live": True, "prev": "luna-1-c2"}
    status, body = api.call("POST /api/admin/game-data/live", {"campaignVersion": "luna-1-a1"})
    assert status == 200 and body == {"campaignVersion": "luna-1-a1", "live": True, "prev": "luna-1-c2"}
    api.publisher.answer = {"ok": True}
    state = {"campaignVersion": "luna-1-a1", "waveSetId": "campaign", "state": "invalid"}
    assert api.call("POST /api/admin/game-data/states", state)[0] == 200
    assert api.call("PUT /api/admin/game-data/testers", {"testers": [TESTER]})[0] == 200
    assert api.publisher.calls == [
        {"action": "makeLive", "campaignVersion": "luna-1-a1", "by": SUB},
        {"action": "setState", **state, "by": SUB},
        {"action": "setTesters", "testers": [TESTER], "by": SUB},
    ]


@pytest.mark.parametrize(
    ("route", "body", "field"),
    [
        ("POST /api/admin/game-data/live", {"campaignVersion": "Luna 1"}, "campaignVersion"),
        ("POST /api/admin/game-data/states", {"campaignVersion": "luna-1-a1", "waveSetId": "x", "state": "preview"},
         "state"),
        ("POST /api/admin/game-data/states", {"campaignVersion": "luna-1-a1", "waveSetId": "X!", "state": "retired"},
         "waveSetId"),
        ("PUT /api/admin/game-data/testers", {"testers": ["someone@example.com"]}, "testers"),
    ],
)  # fmt: skip
def test_quick_actions_check_their_bodies(api: Admin, route: str, body: dict[str, Any], field: str) -> None:
    status, answer = api.call(route, body)
    assert status == 400 and answer["error"]["details"][0]["field"] == field
    assert api.publisher.calls == []


def test_a_make_live_refusal_is_publish_refused(api: Admin) -> None:
    api.publisher.answer = {"ok": False, "error": {"code": "LIVE_MOVED", "message": "look again"}}
    status, body = api.call("POST /api/admin/game-data/live", {"campaignVersion": "luna-1-a1"})
    assert (status, body["error"]["code"], body["error"]["details"]["code"]) == (409, "PUBLISH_REFUSED", "LIVE_MOVED")


# --- the Lambda client ------------------------------------------------------------------------------------------------


class StubLambda:
    def __init__(self, response: dict[str, Any] | None = None, error: str | None = None) -> None:
        self.response, self.error = response, error
        self.invoked: list[dict[str, Any]] = []

    def invoke(self, **request: Any) -> dict[str, Any]:
        self.invoked.append(request)
        if self.error is not None:
            from botocore.exceptions import ClientError

            raise ClientError({"Error": {"Code": self.error, "Message": "m"}}, "Invoke")
        assert self.response is not None
        return self.response


def test_the_publisher_client_waits_queues_and_reports_failures() -> None:
    import io

    from shared.errors import ApiError
    from shared.gamedata_admin import PublisherClient

    stub = StubLambda({"StatusCode": 200, "Payload": io.BytesIO(b'{"ok": true}')})
    assert PublisherClient("fn", stub).call({"action": "validate"}) == {"ok": True}
    assert stub.invoked[0]["InvocationType"] == "RequestResponse" and stub.invoked[0]["FunctionName"] == "fn"

    queued = StubLambda({"StatusCode": 202, "Payload": io.BytesIO(b"")})
    PublisherClient("fn", queued).start({"action": "publish"})
    assert queued.invoked[0]["InvocationType"] == "Event"

    crashed = StubLambda({"StatusCode": 200, "FunctionError": "Unhandled", "Payload": io.BytesIO(b'{"x": 1}')})
    with pytest.raises(RuntimeError):
        PublisherClient("fn", crashed).call({"action": "validate"})
    with pytest.raises(ApiError) as busy:
        PublisherClient("fn", StubLambda(error="TooManyRequestsException")).call({"action": "makeLive"})
    assert busy.value.code == "THROTTLED"
