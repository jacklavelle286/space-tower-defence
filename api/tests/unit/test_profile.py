"""Phase 15 profile routes (G §3 R1, R3, R4, R6; I §I.3.1 AC-06): DOB write-only, age band in Europe/London.

Every date of birth here is made up. The clock is injected through `Deps.now`, so each test stands on the date it needs.
"""

from __future__ import annotations

import base64
import json
import zoneinfo
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import boto3
import pytest
from conftest import REPO, TABLE, CapturedLogger, event_for, load_handler

from shared.bounds import BoundsUnavailable
from shared.data import DynamoTable
from shared.game_data import GameDataReader
from shared.profile import age_on, today_in_london

player_api = load_handler("player_api")

SUB = "a6c2b2b4-7051-70ef-b1e8-739ac38dd0cb"  # the sub in the Phase 5 fixture event
PK = f"U#{SUB}"
BUCKET = "test-player-site"
DOB = "2020-07-16"  # made up: a summer birthday, so London is on BST on the eve
MY_SESSION = "11111111-2222-4333-8444-555555555555"
OTHER_SESSION = "99999999-8888-4777-8666-555555555555"
R1_KEYS = {"nickname", "avatarId", "age", "ageBand", "planets", "badges", "session", "runs"}


def at(text: str) -> datetime:
    return datetime.fromisoformat(text.replace("Z", "+00:00"))


class Clock:
    def __init__(self, text: str) -> None:
        self.now = at(text)

    def __call__(self) -> datetime:
        return self.now


class RecordingDdb:
    """The moto client, recording each call's name and arguments."""

    def __init__(self, client: Any) -> None:
        self._client = client
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def __getattr__(self, name: str) -> Any:
        method = getattr(self._client, name)

        def call(**kwargs: Any) -> Any:
            self.calls.append((name, kwargs))
            return method(**kwargs)

        return call


class Api:
    """player-api wired to moto, a fixed clock, the repository's game data and a captured logger."""

    def __init__(self, ddb: Any, clock: Clock, bounds_pairs: set[tuple[str, str]]) -> None:
        s3 = boto3.client("s3", region_name="eu-west-2")
        s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "eu-west-2"})
        for path in ("current.json", "campaign/luna-1-c1.json"):
            s3.put_object(Bucket=BUCKET, Key=f"game-data/{path}", Body=(REPO / "game-data" / path).read_bytes())
        self.s3 = s3
        self.ddb = RecordingDdb(ddb)
        self.table = DynamoTable(self.ddb, TABLE)
        self.clock = clock
        self.logger = CapturedLogger()
        self.reader = GameDataReader(bucket=BUCKET, s3=s3)

        def bounds(ruleset: str, campaign: str) -> dict:
            if (ruleset, campaign) not in bounds_pairs:
                raise BoundsUnavailable("no such pair")
            return {}

        deps = player_api.Deps(now=clock, game=lambda: self.table, game_data=lambda: self.reader, bounds=bounds)
        self.router = player_api.make_router(deps, logger=self.logger)
        self.bodies: list[str] = []

    def call(
        self, base: dict, route_key: str, body: Any = None, query: dict | None = None, raw: str | None = None
    ) -> tuple[int, dict]:
        event = event_for(base, route_key)
        if raw is not None:
            event["body"] = raw
        elif body is not None:
            event["body"] = json.dumps(body)
        if query is not None:
            event["queryStringParameters"] = query
        response = self.router.handle(event)
        self.bodies.append(response["body"])
        assert response["headers"]["cache-control"] == "no-store"
        return response["statusCode"], json.loads(response["body"])

    def item(self, sk: str) -> dict | None:
        return DynamoTable(self.ddb._client, TABLE).get_item(PK, sk)


@pytest.fixture
def api(ddb: Any) -> Api:
    return Api(ddb, Clock("2026-03-01T12:00:00Z"), {("r1", "luna-1-c1")})


def profile(**changes: Any) -> dict[str, Any]:
    return {"nickname": "Star Kid", "avatarId": "avatar-03", "dob": DOB, **changes}


def put(api: Api, base: dict, **changes: Any) -> tuple[int, dict]:
    return api.call(base, "PUT /api/me/profile", profile(**changes))


def errors(body: dict) -> list[dict]:
    assert set(body) == {"error"}
    return body["error"]["details"]


# --- The exit criterion: a known DOB appears in no response body and no log line ---------------------------------


def test_known_dob_never_appears_in_any_response_or_log_line(api: Api, player_event: dict) -> None:
    assert put(api, player_event)[0] == 200
    assert put(api, player_event)[0] == 200  # the replay
    assert api.call(player_event, "GET /api/me")[0] == 200
    assert api.call(player_event, "GET /api/me", query={"sessionId": MY_SESSION})[0] == 200
    assert api.call(player_event, "PATCH /api/me/profile", {"nickname": "Moon Kid"})[0] == 200
    assert api.call(player_event, "PATCH /api/me/profile", {"dob": DOB})[0] == 200
    assert api.call(player_event, "GET /api/planets")[0] == 200
    # Failures that hold the DOB: a bad nickname next to it, the DOB under an unknown key, and the DOB as a key.
    assert put(api, player_event, nickname="!!")[0] == 400
    assert api.call(player_event, "PATCH /api/me/profile", {"birthday": DOB})[0] == 400
    assert api.call(player_event, "PATCH /api/me/profile", {DOB: "x"})[0] == 400
    assert api.call(player_event, "PATCH /api/me/profile", raw=f'{{"dob": "{DOB}"')[0] == 400  # not JSON

    assert api.item("PROFILE")["dob"] == DOB  # it was stored (write-only, not write-never)
    log = api.logger.stream.getvalue()
    for text in [*api.bodies, log]:
        for form in (DOB, DOB.replace("-", ""), "16/07/2020", "dob"):
            assert form not in text
    assert len(api.logger.lines()) == 11  # one line per request
    assert all(line.get("droppedFields") is None for line in api.logger.lines())


# --- PUT /api/me/profile (R3) ---------------------------------------------------------------------------------------


def test_put_creates_the_profile_and_answers_with_the_r1_shape(api: Api, player_event: dict) -> None:
    status, body = put(api, player_event, nickname="  Star Kid  ")

    assert status == 200
    assert set(body) == R1_KEYS
    assert body["nickname"] == "Star Kid"  # trimmed
    assert body["avatarId"] == "avatar-03"
    assert (body["age"], body["ageBand"]) == (5, 5)
    assert (body["planets"], body["badges"], body["runs"]) == ({}, {}, [])
    assert body["session"] == {"activeElsewhere": False, "runId": None, "deviceLabel": None, "leaseExpiresAt": None}
    item = api.item("PROFILE")
    assert set(item) == {"pk", "sk", "nickname", "avatarId", "dob", "createdAt", "planets", "badges"}
    assert item["createdAt"] == "2026-03-01T12:00:00Z"


def test_put_repeated_is_idempotent_and_keeps_created_at_and_progress(api: Api, player_event: dict) -> None:
    first = put(api, player_event)
    api.ddb._client.update_item(
        TableName=TABLE,
        Key={"pk": {"S": PK}, "sk": {"S": "PROFILE"}},
        UpdateExpression="SET #p = :p",
        ExpressionAttributeNames={"#p": "planets"},
        ExpressionAttributeValues={":p": {"M": {"luna-1": {"M": {"bestCompletedWave": {"N": "2"}}}}}},
    )
    api.clock.now = at("2026-03-02T09:00:00Z")

    status, body = put(api, player_event)

    assert status == 200
    assert body["planets"] == {"luna-1": {"bestCompletedWave": 2}}  # if_not_exists keeps the map
    assert api.item("PROFILE")["createdAt"] == "2026-03-01T12:00:00Z"
    assert {k: v for k, v in body.items() if k != "planets"} == {k: v for k, v in first[1].items() if k != "planets"}


def test_put_needs_all_three_fields(api: Api, player_event: dict) -> None:
    status, body = api.call(player_event, "PUT /api/me/profile", {})

    assert status == 400
    assert body["error"]["code"] == "VALIDATION_FAILED"
    assert errors(body) == [
        {"field": "nickname", "rule": "required"},
        {"field": "avatarId", "rule": "required"},
        {"field": "dob", "rule": "required"},
    ]
    assert api.item("PROFILE") is None


@pytest.mark.parametrize(
    ("changes", "problem"),
    [
        ({"nickname": ""}, {"field": "nickname", "rule": "minLength"}),
        ({"nickname": "   "}, {"field": "nickname", "rule": "minLength"}),
        ({"nickname": "A" * 21}, {"field": "nickname", "rule": "maxLength"}),
        ({"nickname": "Zed_1"}, {"field": "nickname", "rule": "pattern"}),
        ({"nickname": "Zoë"}, {"field": "nickname", "rule": "pattern"}),
        ({"nickname": 7}, {"field": "nickname", "rule": "type"}),
        ({"avatarId": "avatar-13"}, {"field": "avatarId", "rule": "enum"}),
        ({"avatarId": None}, {"field": "avatarId", "rule": "type"}),
        ({"dob": "16/07/2020"}, {"field": "dob", "rule": "pattern"}),
        ({"dob": "2020-7-16"}, {"field": "dob", "rule": "pattern"}),
        ({"dob": "2020-07-16\n"}, {"field": "dob", "rule": "pattern"}),
        ({"dob": "\uff12\uff10\uff12\uff10-07-16"}, {"field": "dob", "rule": "pattern"}),  # full-width digits
        ({"dob": "2019-02-29"}, {"field": "dob", "rule": "date"}),
        ({"dob": "2020-13-01"}, {"field": "dob", "rule": "date"}),
        ({"dob": "2026-03-02"}, {"field": "dob", "rule": "not_future"}),
        ({"dob": "1926-02-28"}, {"field": "dob", "rule": "max_age"}),
        ({"dob": 20200716}, {"field": "dob", "rule": "type"}),
        ({"extra": 1}, {"field": "body", "rule": "additionalProperties"}),
    ],
)
def test_put_validation_names_field_and_rule_never_the_value(
    api: Api, player_event: dict, changes: dict, problem: dict
) -> None:
    status, body = put(api, player_event, **changes)

    assert status == 400
    assert errors(body) == [problem]
    for value in changes.values():
        if isinstance(value, str) and value.strip():
            assert value.strip() not in api.bodies[-1]
    assert api.item("PROFILE") is None


def test_dob_today_and_exactly_100_years_ago_are_accepted(api: Api, player_event: dict) -> None:
    assert put(api, player_event, dob="2026-03-01")[1]["age"] == 0
    assert put(api, player_event, dob="1926-03-01")[1]["age"] == 100


@pytest.mark.parametrize(
    ("raw", "rule"),
    [("not json", "json"), ("[1, 2]", "json"), ('"text"', "json"), ("", "json"), (" " * 8193, "max_bytes")],
)
def test_body_must_be_a_small_json_object(api: Api, player_event: dict, raw: str, rule: str) -> None:
    status, body = api.call(player_event, "PUT /api/me/profile", raw=raw)

    assert status == 400
    assert errors(body) == [{"field": "body", "rule": rule}]


def test_missing_body_is_refused(api: Api, player_event: dict) -> None:
    assert api.call(player_event, "PUT /api/me/profile")[0] == 400


def test_base64_body_is_decoded(api: Api, player_event: dict) -> None:
    event = event_for(player_event, "PUT /api/me/profile")
    event["body"] = base64.b64encode(json.dumps(profile()).encode()).decode()
    event["isBase64Encoded"] = True

    assert api.router.handle(event)["statusCode"] == 200


# --- PATCH /api/me/profile (R4) -------------------------------------------------------------------------------------


def test_patch_without_a_profile_is_profile_not_found_and_creates_nothing(api: Api, player_event: dict) -> None:
    status, body = api.call(player_event, "PATCH /api/me/profile", {"nickname": "Moon Kid"})

    assert status == 404
    assert body["error"]["code"] == "PROFILE_NOT_FOUND"
    assert api.item("PROFILE") is None


def test_patch_sets_only_the_named_fields(api: Api, player_event: dict) -> None:
    put(api, player_event)

    status, body = api.call(player_event, "PATCH /api/me/profile", {"avatarId": "avatar-12"})

    assert status == 200
    assert (body["nickname"], body["avatarId"], body["age"]) == ("Star Kid", "avatar-12", 5)
    assert api.item("PROFILE")["dob"] == DOB


@pytest.mark.parametrize(
    ("patch", "problems"),
    [
        ({}, [{"field": "body", "rule": "minProperties"}]),
        ({"other": 1}, [{"field": "body", "rule": "additionalProperties"}, {"field": "body", "rule": "minProperties"}]),
        ({"dob": "2030-01-01", "nickname": ""}, [
            {"field": "nickname", "rule": "minLength"},
            {"field": "dob", "rule": "not_future"},
        ]),
    ],
)  # fmt: skip
def test_patch_validation(api: Api, player_event: dict, patch: dict, problems: list) -> None:
    put(api, player_event)

    status, body = api.call(player_event, "PATCH /api/me/profile", patch)

    assert status == 400
    assert errors(body) == problems
    assert api.item("PROFILE")["nickname"] == "Star Kid"


# --- GET /api/me (R1) -----------------------------------------------------------------------------------------------


def test_get_me_before_setup_is_profile_not_found(api: Api, player_event: dict) -> None:
    status, body = api.call(player_event, "GET /api/me")

    assert status == 404
    assert body["error"]["code"] == "PROFILE_NOT_FOUND"
    assert body["error"]["requestId"] == "G4SN2i3fLPEEPpQ="


def test_every_read_is_consistent_and_uses_the_callers_key(api: Api, player_event: dict) -> None:
    put(api, player_event)
    api.ddb.calls.clear()

    api.call(player_event, "GET /api/me")
    api.call(player_event, "GET /api/planets")

    reads = [(name, kwargs) for name, kwargs in api.ddb.calls if name in ("get_item", "query")]
    assert [name for name, _ in reads] == ["get_item", "get_item", "query", "get_item"]
    assert all(kwargs["ConsistentRead"] is True for _, kwargs in reads)
    assert all(json.dumps(kwargs).count(PK) == 1 for _, kwargs in reads)
    assert "ProjectionExpression" in reads[2][1]  # the run summaries read only the summary fields


def session_item(**fields: Any) -> dict:
    values = {
        "generation": 3,
        "sessionId": OTHER_SESSION,
        "runId": "run-1",
        "deviceLabel": "Kitchen laptop",
        "leaseExpiresAt": "2026-03-01T12:02:00Z",
        "released": False,
        "lastRenewedAt": "2026-03-01T11:59:00Z",
    }
    values.update(fields)
    return values  # fmt: skip


def write_item(api: Api, sk: str, fields: dict) -> None:
    from boto3.dynamodb.types import TypeSerializer

    item = {"pk": PK, "sk": sk, **fields}
    api.ddb._client.put_item(TableName=TABLE, Item={k: TypeSerializer().serialize(v) for k, v in item.items()})


@pytest.mark.parametrize(
    ("fields", "query", "elsewhere"),
    [
        ({}, None, True),  # no ?sessionId=: any live lease counts as elsewhere
        ({}, {"sessionId": OTHER_SESSION}, False),  # this browser holds it
        ({}, {"sessionId": MY_SESSION}, True),
        ({"released": True}, {"sessionId": MY_SESSION}, False),
        ({"leaseExpiresAt": "2026-03-01T12:00:00Z"}, {"sessionId": MY_SESSION}, False),  # expires now: lapsed
        ({"leaseExpiresAt": 1772366520}, {"sessionId": MY_SESSION}, True),  # epoch seconds for 12:02:00Z
        ({"sessionId": "RESET#req-1"}, {"sessionId": MY_SESSION}, False),  # interrupted reset counts as released
        ({"leaseExpiresAt": "garbage"}, None, False),
    ],
)
def test_session_view(api: Api, player_event: dict, fields: dict, query: dict | None, elsewhere: bool) -> None:
    put(api, player_event)
    write_item(api, "SESSION", session_item(**fields))

    status, body = api.call(player_event, "GET /api/me", query=query)

    assert status == 200
    assert set(body["session"]) == {"activeElsewhere", "runId", "deviceLabel", "leaseExpiresAt"}
    assert body["session"]["activeElsewhere"] is elsewhere
    assert body["session"]["deviceLabel"] == "Kitchen laptop"
    text = api.bodies[-1]
    assert OTHER_SESSION not in text and MY_SESSION not in text and "generation" not in text
    assert MY_SESSION not in api.logger.stream.getvalue()


def test_session_id_must_be_a_uuid(api: Api, player_event: dict) -> None:
    put(api, player_event)

    status, body = api.call(player_event, "GET /api/me", query={"sessionId": "not-a-uuid"})

    assert status == 400
    assert errors(body) == [{"field": "sessionId", "rule": "pattern"}]
    assert "not-a-uuid" not in api.bodies[-1]


def run_item(run_id: str, status: str, last_played: str, ruleset: str = "r1") -> dict:
    return {
        "runId": run_id, "planetId": "luna-1", "waveSetId": "first-contact", "mode": "CHALLENGE", "status": status,
        "stage": "AUTHORED", "phase": "BUILD", "wave": 1, "finalWave": 2, "highestCompletedWave": 0,
        "lastPlayedAt": last_played, "createdAt": "2026-02-01T10:00:00Z", "revision": 4, "seed": 12345,
        "snapshot": {"credits": 150}, "recentOps": [],
        "pins": {"ageBand": 5, "rulesetVersion": ruleset, "campaignVersion": "luna-1-c1"},
    }  # fmt: skip


def test_runs_lists_in_progress_summaries_newest_first(api: Api, player_event: dict) -> None:
    put(api, player_event)
    write_item(api, "RUN#run-a", run_item("run-a", "IN_PROGRESS", "2026-02-10T10:00:00Z"))
    write_item(api, "RUN#run-b", run_item("run-b", "IN_PROGRESS", "2026-02-20T10:00:00Z", ruleset="r9"))
    write_item(api, "RUN#run-c", run_item("run-c", "DEFEATED", "2026-02-25T10:00:00Z"))

    body = api.call(player_event, "GET /api/me")[1]

    assert [run["runId"] for run in body["runs"]] == ["run-b", "run-a"]
    newest, older = body["runs"]
    assert (newest["playable"], newest["reason"]) == (False, "CONTENT_VERSION_UNSUPPORTED")
    assert older["playable"] is True and "reason" not in older
    assert set(older) == {
        "runId", "planetId", "waveSetId", "mode", "status", "stage", "phase", "wave", "finalWave",
        "highestCompletedWave", "lastPlayedAt", "createdAt", "revision", "playable",
    }  # fmt: skip
    assert older["revision"] == 4 and isinstance(older["revision"], int)


# --- AC-06: the age band from the DOB, with an injected clock ------------------------------------------------------


def test_ac06_1_and_2_age_band_follows_the_clock_and_existing_run_pins_stay(api: Api, player_event: dict) -> None:
    api.clock.now = at("2026-07-15T12:00:00Z")  # the day before the sixth birthday
    assert put(api, player_event)[1]["ageBand"] == 5
    write_item(api, "RUN#run-a", run_item("run-a", "IN_PROGRESS", "2026-07-15T12:00:00Z"))
    run_before = api.item("RUN#run-a")

    api.clock.now = at("2026-07-16T12:00:00Z")
    body = api.call(player_event, "GET /api/me")[1]

    assert (body["age"], body["ageBand"]) == (6, 6)  # a new run would pin 6 (Phase 16)
    assert api.item("RUN#run-a") == run_before  # the existing run still pins 5
    assert run_before["pins"]["ageBand"] == 5


def test_ac06_3_patch_dob_changes_the_band_and_leaves_run_pins(api: Api, player_event: dict) -> None:
    put(api, player_event)
    write_item(api, "RUN#run-a", run_item("run-a", "IN_PROGRESS", "2026-02-10T10:00:00Z"))
    run_before = api.item("RUN#run-a")

    status, body = api.call(player_event, "PATCH /api/me/profile", {"dob": "2019-01-10"})

    assert status == 200
    assert (body["age"], body["ageBand"]) == (7, 7)
    assert api.item("RUN#run-a") == run_before


@pytest.mark.parametrize(
    ("now", "age"),
    [
        ("2026-07-15T22:59:59Z", 5),  # 23:59:59 BST on the eve
        ("2026-07-15T23:00:00Z", 6),  # 00:00 BST: the birthday in London, still the eve in UTC
        ("2026-07-15T23:30:00Z", 6),  # the I §I.3.1 case: 23:30 UTC on the eve of a summer birthday
    ],
)
def test_ac06_4_europe_london_summer_birthday_edge(api: Api, player_event: dict, now: str, age: int) -> None:
    api.clock.now = at(now)

    body = put(api, player_event)[1]

    assert (body["age"], body["ageBand"]) == (age, age)


def test_ac06_4_winter_birthday_has_no_offset(api: Api, player_event: dict) -> None:
    api.clock.now = at("2026-01-15T23:30:00Z")  # GMT: still the 15th in London
    assert put(api, player_event, dob="2020-01-16")[1]["age"] == 5
    api.clock.now = at("2026-01-16T00:00:00Z")
    assert api.call(player_event, "GET /api/me")[1]["age"] == 6


def test_leap_day_birthday_counts_from_1_march() -> None:
    dob = datetime(2020, 2, 29).date()
    assert age_on(dob, datetime(2026, 2, 28).date()) == 5
    assert age_on(dob, datetime(2026, 3, 1).date()) == 6
    assert age_on(dob, datetime(2028, 2, 29).date()) == 8


def test_today_in_london_needs_an_aware_clock() -> None:
    with pytest.raises(ValueError, match="timezone"):
        today_in_london(datetime(2026, 7, 15, 23, 30))  # naive on purpose


@pytest.mark.parametrize(("dob", "age"), [("2021-07-16", 4), ("2018-03-01", 8)])
def test_ac06_5_age_4_or_8_has_no_band_and_no_available_wave_set(
    api: Api, player_event: dict, dob: str, age: int
) -> None:
    api.clock.now = at("2026-03-01T12:00:00Z")
    status, body = put(api, player_event, dob=dob)
    assert status == 200  # the profile is still created; only new games are refused (D P3)
    assert (body["age"], body["ageBand"]) == (age, None)

    status, planets = api.call(player_event, "GET /api/planets")

    assert status == 200
    assert planets["ageBand"] is None
    [wave_set] = planets["planets"][0]["waveSets"]
    assert (wave_set["available"], wave_set["reason"]) == (False, "AGE_OUT_OF_RANGE")


def test_ac06_6_europe_london_loads_from_the_bundled_tzdata_package() -> None:
    # With no system zone directories at all, zoneinfo falls back to the tzdata package that the zip bundles.
    zoneinfo.reset_tzpath(to=[])
    try:
        london = zoneinfo.ZoneInfo.no_cache("Europe/London")
        assert datetime(2026, 7, 15, 23, 30, tzinfo=UTC).astimezone(london).day == 16
    finally:
        zoneinfo.reset_tzpath()
    pins = (REPO / "api" / "requirements.txt").read_text()
    assert "\ntzdata==" in pins


# --- GET /api/planets (R6) ------------------------------------------------------------------------------------------


def test_planets_lists_the_released_planet_for_the_age_band(api: Api, player_event: dict) -> None:
    put(api, player_event)

    status, body = api.call(player_event, "GET /api/planets")

    assert status == 200
    assert body == {
        "ageBand": 5,
        "planets": [
            {
                "planetId": "luna-1",
                "name": "Moonbeam Colony",
                "unlocked": True,
                "waveSets": [
                    {"waveSetId": "first-contact", "mode": "CHALLENGE", "name": "First Contact", "finalWave": 2,
                     "available": True},
                ],
            }
        ],
    }  # fmt: skip


def test_planets_without_a_profile_is_profile_not_found(api: Api, player_event: dict) -> None:
    status, body = api.call(player_event, "GET /api/planets")

    assert status == 404
    assert body["error"]["code"] == "PROFILE_NOT_FOUND"


def test_planets_when_game_data_is_missing_is_internal_with_the_class_name_only(api: Api, player_event: dict) -> None:
    put(api, player_event)
    api.s3.delete_object(Bucket=BUCKET, Key="game-data/current.json")

    status, body = api.call(player_event, "GET /api/planets")

    assert status == 500
    assert body["error"]["code"] == "INTERNAL"
    assert api.logger.lines()[-1]["errorType"] == "GameDataUnavailable"


def test_game_data_reader_caches_planets_and_refreshes_current(api: Api) -> None:
    ticks = [0.0]
    reader = GameDataReader(bucket=BUCKET, s3=api.s3, clock=lambda: ticks[0])
    assert reader.current()["campaignVersion"] == "luna-1-c1"
    reader.planet("luna-1-c1")
    newer = b'{"rulesetVersion":"r2","campaignVersion":"x"}'
    api.s3.put_object(Bucket=BUCKET, Key="game-data/current.json", Body=newer)
    api.s3.delete_object(Bucket=BUCKET, Key="game-data/campaign/luna-1-c1.json")

    assert reader.current()["rulesetVersion"] == "r1"  # still inside the TTL
    assert reader.planet("luna-1-c1").planet_id == "luna-1"  # immutable, so cached for good
    ticks[0] = 61.0
    assert reader.current()["rulesetVersion"] == "r2"


# --- Wiring ---------------------------------------------------------------------------------------------------------


def test_the_lambda_router_has_this_phases_handlers() -> None:
    # The exact set of player-api handlers is checked by the newest phase's tests (test_runs.py from Phase 16).
    assert set(player_api.ROUTER.handlers) >= {
        "GET /api/me",
        "PUT /api/me/profile",
        "PATCH /api/me/profile",
        "GET /api/planets",
    }


def test_handler_source_never_returns_the_stored_item_wholesale() -> None:
    # Review aid (build-phases Phase 15, step 1): every response field is named in _me_view or get_planets; no
    # **item spread or dict(item) copies a stored PROFILE into a body.
    source = Path(player_api.__file__).read_text()
    assert "**profile" not in source and "dict(profile)" not in source
