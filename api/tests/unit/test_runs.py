"""Phase 16 runs (G §4 R8-R10, spine S3.2 CREATE_RUN, S8.1 G3/G7; M1-16) on moto.

The exit criteria come first: a repeated create returns the same run unchanged; a second session gets
ACTIVE_SESSION_ELSEWHERE with deviceLabel; a create without a profile is refused by the PROFILE condition check;
another player's runId is NOT_FOUND. (The R13 RUN_TERMINAL claim is in test_session.py; the R8 replay of a
terminal run is below.)

Races are made real: `Ddb.before_transact` changes the table between the handler's reads and its transaction, so
moto's own cancellation answers the handler. The recorded DynamoDB Local shapes in api/tests/fixtures/ddb/ are fed
to the handler too, so the classification is checked against the shapes CI records (ADR-0021).
"""

from __future__ import annotations

import json
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
    SEED,
    SUB,
    Clock,
    RunsApi,
    _ddb,
    bank_items,
    create_body,
    errors,
    load_bounds_fixture,
    player_api,
)

from shared.data import DynamoTable
from shared.game_data import Planet, WaveSet

RUN_VIEW_KEYS = {
    "runId", "planetId", "waveSetId", "mode", "status", "stage", "phase", "wave", "finalWave", "highestCompletedWave",
    "lastPlayedAt", "createdAt", "revision", "playable", "plannedThrough", "snapshot", "seed", "pins", "currentSlot",
    "recentOpIds",
}  # fmt: skip


@pytest.fixture
def api(ddb: Any, player_event: dict) -> RunsApi:
    api = RunsApi(ddb)
    api.profile(player_event)
    return api


def transacts(api: RunsApi) -> list[dict]:
    return [kwargs for name, kwargs in api.ddb.calls if name == "transact_write_items"]


# --- Exit criteria --------------------------------------------------------------------------------------------------


def test_repeating_a_create_returns_the_same_run_unchanged(api: RunsApi, player_event: dict) -> None:
    first_status, first = api.create(player_event)
    stored = api.item(f"RUN#{RUN_A}")
    api.clock.now = Clock("2026-11-20T10:00:30Z").now

    second_status, second = api.create(player_event, deviceLabel="Another label", waveSetId="first-contact")

    assert (first_status, second_status) == (201, 200)
    assert second["run"] == first["run"]  # the stored run, not compared with the body, never re-selected
    assert api.item(f"RUN#{RUN_A}") == stored
    assert api.seeds == 1 and len(transacts(api)) == 1  # one selection, one transaction
    assert second["session"]["generation"] == first["session"]["generation"] == 1  # same holder: same generation
    assert second["session"]["leaseExpiresAt"] == "2026-11-20T10:03:30Z"  # the replay claims as R13 does


def test_a_second_session_gets_active_session_elsewhere_with_its_device_label(api: RunsApi, player_event: dict) -> None:
    assert api.create(player_event)[0] == 201

    status, body = api.create(player_event, run_id=RUN_B, session_id=OTHER_SESSION, deviceLabel="Bedroom tablet")

    assert status == 409
    assert body["error"]["code"] == "ACTIVE_SESSION_ELSEWHERE"
    assert body["error"]["details"] == {"retryAfterSeconds": 180, "deviceLabel": "Kitchen laptop"}
    assert api.item(f"RUN#{RUN_B}") is None
    assert len(transacts(api)) == 1  # refused from the read: no transaction sent


def test_a_create_without_a_profile_is_refused_by_the_profile_condition_check(api: RunsApi, player_event: dict) -> None:
    # The profile exists when the handler reads it and is deleted (a whole-profile reset) before the transaction.
    api.ddb.before_transact = lambda: api.raw.delete_item(
        TableName="test-game", Key={"pk": {"S": PK}, "sk": {"S": "PROFILE"}}
    )

    status, body = api.create(player_event)

    assert status == 404
    assert body["error"]["code"] == "PROFILE_NOT_FOUND"
    [transaction] = transacts(api)
    assert transaction["TransactItems"][2]["ConditionCheck"]["ConditionExpression"] == "attribute_exists(#pk)"
    assert api.items("RUN#") == [] and api.items("SLOT#") == [] and api.item("SESSION") is None  # all or nothing


def test_a_create_with_no_profile_at_all_is_profile_not_found(ddb: Any, player_event: dict) -> None:
    api = RunsApi(ddb)
    status, body = api.create(player_event)
    assert (status, body["error"]["code"]) == (404, "PROFILE_NOT_FOUND")
    assert transacts(api) == []


@pytest.mark.parametrize("route", ["GET /api/runs/{runId}", "GET /api/runs/{runId}/pack"])
def test_another_players_run_id_is_not_found(api: RunsApi, player_event: dict, route: str) -> None:
    assert api.create(player_event)[0] == 201
    api.profile(player_event, sub=OTHER_SUB)

    theirs = api.call(player_event, route, run_id=RUN_A, sub=OTHER_SUB)
    missing = api.call(player_event, route, run_id=RUN_B)

    assert theirs == missing  # the same answer as a run that does not exist (AC-03): no hint it exists
    assert theirs[0] == 404
    assert theirs[1]["error"]["code"] == "NOT_FOUND"


# --- POST /api/runs: the created run ---------------------------------------------------------------------------


def test_create_writes_session_run_profile_check_and_slots_in_one_transaction(api: RunsApi, player_event: dict) -> None:
    status, body = api.create(player_event)

    assert status == 201
    [transaction] = transacts(api)
    actions = transaction["TransactItems"]
    assert [next(iter(a)) for a in actions] == ["Update", "Put", "ConditionCheck", "Put"]  # F §12.3: 4 for M1
    session, run, profile, slot = (next(iter(a.values())) for a in actions)
    assert session["Key"]["sk"] == {"S": "SESSION"}
    assert session["ReturnValuesOnConditionCheckFailure"] == "ALL_OLD"
    assert run["Item"]["sk"] == {"S": f"RUN#{RUN_A}"}
    assert run["ConditionExpression"] == slot["ConditionExpression"] == "attribute_not_exists(#pk)"
    assert profile["Key"]["sk"] == {"S": "PROFILE"}
    assert slot["Item"]["sk"] == {"S": f"SLOT#{RUN_A}#N-001"}
    # Lookup first: the consistent RUN read happens before anything else is read or written.
    first_read = next(kwargs for name, kwargs in api.ddb.calls if name == "get_item" and "RUN#" in str(kwargs))
    assert first_read["ConsistentRead"] is True

    assert set(body) == {"run", "session"}
    assert body["session"] == {
        "sessionId": MY_SESSION,
        "generation": 1,
        "leaseExpiresAt": "2026-11-20T10:03:00Z",
        "leaseSeconds": 180,
        "renewAfterSeconds": 60,
    }
    run_view = body["run"]
    assert set(run_view) == RUN_VIEW_KEYS
    assert run_view | {"snapshot": None} == {
        "runId": RUN_A,
        "planetId": "luna-1",
        "waveSetId": "first-contact",
        "mode": "CHALLENGE",
        "status": "IN_PROGRESS",
        "stage": "AUTHORED",
        "phase": "BUILD",
        "wave": 1,
        "finalWave": 2,
        "highestCompletedWave": 0,
        "lastPlayedAt": "2026-11-20T10:00:00Z",
        "createdAt": "2026-11-20T10:00:00Z",
        "revision": 0,
        "playable": True,
        "plannedThrough": 1,
        "snapshot": None,
        "seed": SEED,
        "pins": {
            "ageBand": 5,
            "rulesetVersion": "r1",
            "campaignVersion": "luna-1-c1",
            "assetManifestVersion": None,
            "protocolVersion": 1,
        },
        "currentSlot": None,
        "recentOpIds": [],
    }
    # The starting snapshot equals game-core's createRunState for first-contact (web/game-core/src/sim/run.ts).
    start = {"credits": 150, "placements": [], "colony": {"health": 20, "shield": 0}, "powers": {}}
    assert run_view["snapshot"] == start


def test_the_stored_items(api: RunsApi, player_event: dict) -> None:
    api.create(player_event)

    run = api.item(f"RUN#{RUN_A}")
    assert run["writerGeneration"] == 1 and run["recentOps"] == []
    assert run["pins"]["selection"]["algorithmVersion"] == 1
    assert run["pins"]["selection"]["bankReadAt"] == "2026-11-20T10:00:00Z"
    assert len(run["pins"]["selection"]["packId"]) == 64

    [slot] = api.items(f"SLOT#{RUN_A}#")
    assert {k: v for k, v in slot.items() if k not in ("pk", "sk", "presentation")} == {
        "slotId": "N-001",
        "kind": "NORMAL",
        "interval": 1,
        "subject": "phonics",  # the rotation says maths; the M1 subject fallback takes phonics (plan.py, N-7)
        "topicId": "phonics-gpc-consonant-digraphs",
        "activityId": "ph-0102",
        "activityVersion": "20261120T120000Z",
        "interactionType": "MULTIPLE_CHOICE",
        "resolved": None,
        "intro": None,
        "clips": {
            "instruction": {
                "speechId": "instruction-listen-which-letters",
                "speechVersion": "20261120T101500Z",
                "clipKey": "a01d2c3b4a5968778695a4b3c2d1e0f0e1d2c3b4a5968778695a4b3c2d1e0f0",
            },
            "prompt": {
                "speechId": "phoneme-sh",
                "speechVersion": "20261120T101400Z",
                "clipKey": "5e88a7b0c3d14f2e9a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b",
            },
        },
        "reward": {"credits": 30},  # bounds normalRewardByInterval[0] (C9.2)
        "status": "UNRESOLVED",
        "attempts": [],
    }
    assert sorted(slot["presentation"]["optionOrder"]) == ["a", "b", "c", "d"]

    session = api.item("SESSION")
    assert {k: v for k, v in session.items() if k not in ("pk", "sk")} == {
        "generation": 1,
        "sessionId": MY_SESSION,
        "runId": RUN_A,
        "leaseExpiresAt": "2026-11-20T10:03:00Z",
        "released": False,
        "deviceLabel": "Kitchen laptop",
        "lastRenewedAt": "2026-11-20T10:00:00Z",
    }


def test_the_slot_and_reward_list_is_the_same_for_every_age(api: RunsApi, player_event: dict) -> None:
    api.profile(player_event, dob="2020-06-01", sub=OTHER_SUB)  # age 6 (made up); the fixture player is 5
    api.create(player_event)
    api.call(player_event, "POST /api/runs", create_body(), sub=OTHER_SUB)

    def rewards(pk: str) -> list[tuple]:
        return [(s["slotId"], s["kind"], s["reward"]) for s in api.items(f"SLOT#{RUN_A}#", pk=pk)]

    assert api.item(f"RUN#{RUN_A}", pk=f"U#{OTHER_SUB}")["pins"]["ageBand"] == 6
    assert rewards(PK) == rewards(f"U#{OTHER_SUB}") == [("N-001", "NORMAL", {"credits": 30})]  # C22.5, AC-13


def test_the_same_holder_keeps_its_generation_on_a_new_run(api: RunsApi, player_event: dict) -> None:
    api.create(player_event)
    status, body = api.create(player_event, run_id=RUN_B)
    assert status == 201
    assert body["session"]["generation"] == 1
    assert api.item("SESSION")["runId"] == RUN_B


@pytest.mark.parametrize(
    ("session", "takeover", "expected"),
    [
        ({"released": True}, False, 201),  # a clean release needs no question
        ({"sessionId": "RESET#req-1"}, False, 201),  # an interrupted reset counts as released
        ({"leaseExpiresAt": "2026-11-20T09:50:00Z"}, False, 409),  # lapsed without release: ask first
        ({"leaseExpiresAt": "2026-11-20T09:50:00Z"}, True, 201),  # ... and take over once asked
    ],
)
def test_create_applies_the_session_claim_rule(
    api: RunsApi, player_event: dict, session: dict, takeover: bool, expected: int
) -> None:
    held = {
        "generation": 4,
        "sessionId": OTHER_SESSION,
        "runId": RUN_B,
        "leaseExpiresAt": "2026-11-20T10:02:00Z",
        "released": False,
        "deviceLabel": "Bedroom tablet",
        "lastRenewedAt": "2026-11-20T09:47:00Z",
    }
    api.set_session(**{**held, **session})

    status, body = api.create(player_event, **({"takeover": True} if takeover else {}))

    assert status == expected
    if expected == 201:
        assert body["session"]["generation"] == 5  # a new tenure: generation + 1
        assert api.item("SESSION")["sessionId"] == MY_SESSION
    else:
        assert body["error"]["code"] == "TAKEOVER_CONFIRM_REQUIRED"
        assert body["error"]["details"] == {"deviceLabel": "Bedroom tablet", "lastSeenSecondsAgo": 780}
        assert api.item(f"RUN#{RUN_A}") is None


def test_takeover_confirm_then_repeat_with_the_same_run_id(api: RunsApi, player_event: dict) -> None:
    api.set_session(
        generation=2, sessionId=OTHER_SESSION, runId=RUN_B, leaseExpiresAt="2026-11-20T09:00:00Z", released=False,
        deviceLabel="Bedroom tablet", lastRenewedAt="2026-11-20T08:57:00Z",
    )  # fmt: skip
    assert api.create(player_event)[1]["error"]["code"] == "TAKEOVER_CONFIRM_REQUIRED"
    status, body = api.create(player_event, takeover=True)
    assert status == 201
    assert body["session"]["generation"] == 3


# --- POST /api/runs: refusals ---------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("changes", "code"),
    [
        ({"rulesetVersion": "r9"}, "CONTENT_VERSION_UNSUPPORTED"),
        ({"campaignVersion": "luna-1-c9"}, "CONTENT_VERSION_UNSUPPORTED"),
    ],
)
def test_unknown_or_unreleased_versions(api: RunsApi, player_event: dict, changes: dict, code: str) -> None:
    status, body = api.create(player_event, **changes)
    assert (status, body["error"]["code"]) == (409, code)
    assert transacts(api) == []


def test_unknown_wave_set_or_planet_mismatch_is_a_validation_error(api: RunsApi, player_event: dict) -> None:
    assert errors(api.create(player_event, waveSetId="no-such-set")[1]) == [{"field": "waveSetId", "rule": "enum"}]
    assert errors(api.create(player_event, planetId="mars-2")[1]) == [{"field": "planetId", "rule": "campaignVersion"}]


def test_age_out_of_range(ddb: Any, player_event: dict) -> None:
    api = RunsApi(ddb)
    api.profile(player_event, dob="2018-01-01")  # age 8 on 2026-11-20 (made up)
    status, body = api.create(player_event)
    assert status == 409
    assert body["error"]["code"] == "CONTENT_UNAVAILABLE"
    assert body["error"]["details"] == {"reason": "AGE_OUT_OF_RANGE"}


def test_bank_not_ready_with_an_empty_bank(ddb: Any, player_event: dict) -> None:
    api = RunsApi(ddb, bank=[])
    api.profile(player_event)
    status, body = api.create(player_event)
    assert (status, body["error"]["details"]) == (409, {"reason": "BANK_NOT_READY"})
    assert api.item("SESSION") is None


def test_bank_not_ready_when_nothing_suits_the_age_band(ddb: Any, player_event: dict) -> None:
    bank = bank_items()
    bank[0] = {**bank[0], "minAge": 7, "maxAge": 7}
    api = RunsApi(ddb, bank=bank)
    api.profile(player_event)
    assert api.create(player_event)[1]["error"]["details"] == {"reason": "BANK_NOT_READY"}


class TwoPlanets:
    """A game-data reader with a second released planet after luna-1 (not in the repository yet)."""

    def __init__(self, real: Any) -> None:
        self.real = real
        self.mars = Planet(
            planet_id="mars-2",
            name="Red Dust",
            campaign_version="mars-2-c1",
            wave_sets=(WaveSet(wave_set_id="first-contact", mode="CHALLENGE", name="x", final_wave=2),),
        )

    def planet(self, version: str) -> Planet:
        return self.mars if version == "mars-2-c1" else self.real.planet(version)

    def released_planets(self) -> list[Planet]:
        return [self.real.planet("luna-1-c1"), self.mars]

    def versions(self) -> Any:
        return self.real.versions()


def test_planet_locked_until_the_planet_before_reaches_wave_20(ddb: Any, player_event: dict) -> None:
    api = RunsApi(ddb)
    api.reader = TwoPlanets(api.reader)
    api.bounds = lambda ruleset, campaign: load_bounds_fixture(ruleset, "luna-1-c1")  # mars reuses luna's numbers
    api.profile(player_event)
    mars = {"planetId": "mars-2", "campaignVersion": "mars-2-c1"}

    status, body = api.create(player_event, **mars)
    assert (status, body["error"]["code"], body["error"]["details"]) == (
        409,
        "CONTENT_UNAVAILABLE",
        {"reason": "PLANET_LOCKED"},
    )

    DynamoTable(api.raw, "test-game").update_item(
        PK, "PROFILE", update="SET #p = :p", names={"#p": "planets"},
        values={":p": {"luna-1": {"bestCompletedWave": 20}}},
    )  # fmt: skip
    assert api.create(player_event, **mars)[0] == 201


def test_run_limit_reached_at_five_open_runs(api: RunsApi, player_event: dict) -> None:
    for n in range(5):
        api.raw.put_item(
            TableName="test-game",
            Item={k: _ddb(v) for k, v in {"pk": PK, "sk": f"RUN#run-{n}", "status": "IN_PROGRESS"}.items()},
        )
    api.raw.put_item(
        TableName="test-game", Item={k: _ddb(v) for k, v in {"pk": PK, "sk": "RUN#done", "status": "DEFEATED"}.items()}
    )
    status, body = api.create(player_event)
    assert (status, body["error"]["code"]) == (409, "RUN_LIMIT_REACHED")


def test_validation_names_fields_and_rules_never_values(api: RunsApi, player_event: dict) -> None:
    body = create_body(runId="NOT-A-UUID", deviceLabel="x" * 41, takeover="yes", planetId="Luna#1", extra="secret!")
    del body["sessionId"]
    status, answer = api.call(player_event, "POST /api/runs", body)
    assert status == 400
    assert errors(answer) == [
        {"field": "body", "rule": "additionalProperties"},
        {"field": "runId", "rule": "pattern"},
        {"field": "planetId", "rule": "pattern"},
        {"field": "sessionId", "rule": "required"},
        {"field": "deviceLabel", "rule": "maxLength"},
        {"field": "takeover", "rule": "type"},
    ]
    for value in ("NOT-A-UUID", "Luna#1", "secret!", "extra"):
        assert value not in api.bodies[-1] and value not in api.logger.stream.getvalue()


# --- Races: the transaction's own conditions, read back by position ------------------------------------------------


def test_run_created_meanwhile_takes_the_replay_path(api: RunsApi, player_event: dict) -> None:
    # A retry of the same create (same runId) wins the race between this request's reads and its transaction.
    winner: list[tuple[int, Any]] = []
    api.ddb.before_transact = lambda: winner.append(api.create(player_event))

    status, body = api.create(player_event)

    assert winner[0][0] == 201
    assert status == 200
    assert body["run"] == winner[0][1]["run"]
    assert body["session"]["generation"] == 1


def test_lease_taken_meanwhile_is_classified_from_the_returned_old_item(api: RunsApi, player_event: dict) -> None:
    def race() -> None:
        api.set_session(
            generation=1, sessionId=OTHER_SESSION, runId=RUN_B, leaseExpiresAt="2026-11-20T10:02:30Z", released=False,
            deviceLabel="Bedroom tablet", lastRenewedAt="2026-11-20T09:59:30Z",
        )  # fmt: skip

    api.ddb.before_transact = race
    api.ddb.calls.clear()
    status, body = api.create(player_event)

    assert status == 409
    assert body["error"]["details"] == {"retryAfterSeconds": 150, "deviceLabel": "Bedroom tablet"}
    assert api.item(f"RUN#{RUN_A}") is None
    session_reads = [k for n, k in api.ddb.calls if n == "get_item" and k["Key"]["sk"] == {"S": "SESSION"}]
    assert len(session_reads) == 1  # the read before the transaction; the refusal carried the old item itself


HELD_ELSEWHERE = {
    "sessionId": OTHER_SESSION, "runId": RUN_B, "leaseExpiresAt": "2026-11-20T09:59:00Z", "released": True,
    "deviceLabel": "Bedroom tablet", "lastRenewedAt": "2026-11-20T09:56:00Z",
}  # fmt: skip


@pytest.mark.parametrize("claims_meanwhile", [1, 2])
def test_a_takeover_pins_the_generation_it_read(api: RunsApi, player_event: dict, claims_meanwhile: int) -> None:
    # Spine S3.4: generation only goes up. R8 reads (another device, gen 5, released); before its transaction that
    # device claims and releases again. Without the pin R8 would write 5 + 1 = 6, a number another tenure already had.
    api.set_session(generation=5, **HELD_ELSEWHERE)
    api.ddb.before_transact = lambda: api.set_session(generation=5 + claims_meanwhile, **HELD_ELSEWHERE)

    status, body = api.create(player_event)

    expected = 5 + claims_meanwhile + 1
    assert status == 201
    assert body["session"]["generation"] == expected
    assert api.item("SESSION")["generation"] == expected
    assert api.item(f"RUN#{RUN_A}")["writerGeneration"] == expected
    assert len(transacts(api)) == 2  # refused once by the pin, then retried from a fresh read


def test_a_first_claim_pins_that_there_was_no_session_item(api: RunsApi, player_event: dict) -> None:
    # R8 reads no SESSION item; another device claims and releases before the transaction. R8 must not write gen 1.
    assert api.item("SESSION") is None
    api.ddb.before_transact = lambda: api.set_session(generation=1, **HELD_ELSEWHERE)

    status, body = api.create(player_event)

    assert status == 201
    assert body["session"]["generation"] == api.item("SESSION")["generation"] == 2
    assert len(transacts(api)) == 2


def test_the_same_holder_pins_the_generation_it_read(api: RunsApi, player_event: dict) -> None:
    # R8 reads (this session, gen 3). Before the transaction another device takes over (gen 4) and this session
    # takes it back (gen 5). The same-holder extend must not hand out the stale generation 3.
    mine = {**HELD_ELSEWHERE, "sessionId": MY_SESSION, "released": False, "leaseExpiresAt": "2026-11-20T10:02:00Z"}
    api.set_session(generation=3, **mine)
    api.ddb.before_transact = lambda: api.set_session(generation=5, **mine)

    status, body = api.create(player_event)

    assert status == 201
    assert body["session"]["generation"] == api.item("SESSION")["generation"] == 5
    assert api.item(f"RUN#{RUN_A}")["writerGeneration"] == 5
    assert len(transacts(api)) == 2


@pytest.mark.parametrize("status", ["DEFEATED", "ABANDONED", "COMPLETED"])
def test_a_create_replay_of_a_terminal_run_is_run_terminal(api: RunsApi, player_event: dict, status: str) -> None:
    # [PROPOSAL] G R8: an existing runId whose run has ended answers 409 RUN_TERMINAL (as the R13 claim does), so a
    # lease is never claimed for a run that cannot be played; the client shows the final screen (D7.3).
    api.create(player_event)
    api.set_run_fields(RUN_A, status=status)
    session_before, run_before = api.item("SESSION"), api.item(f"RUN#{RUN_A}")

    code, body = api.create(player_event, session_id=OTHER_SESSION)

    assert (code, body["error"]["code"]) == (409, "RUN_TERMINAL")
    assert api.item("SESSION") == session_before
    assert api.item(f"RUN#{RUN_A}") == run_before


def test_transaction_conflicts_are_retried_with_jitter_then_throttled(api: RunsApi, player_event: dict) -> None:
    conflict = {
        "Error": {"Code": "TransactionCanceledException", "Message": "x"},
        "CancellationReasons": [{"Code": "TransactionConflict"}, {"Code": "None"}, {"Code": "None"}, {"Code": "None"}],
    }
    api.ddb.transact_failures = [conflict, conflict]
    assert api.create(player_event)[0] == 201  # third try succeeds
    assert len(api.sleeps) == 2 and all(0 < pause < 1 for pause in api.sleeps)

    api.ddb.transact_failures = [conflict] * 3
    status, body = api.create(player_event, run_id=RUN_B)
    assert (status, body["error"]["code"]) == (503, "THROTTLED")


# --- The recorded DynamoDB Local shapes (api/tests/fixtures/ddb/), fed to the handler -----------------------------


def recorded(name: str) -> dict:
    data = json.loads((DDB_FIXTURES / f"{name}.json").read_text())
    return {"Error": data["Error"], "CancellationReasons": data["CancellationReasons"]}


def test_recorded_session_refusal_maps_to_active_session_elsewhere(api: RunsApi, player_event: dict) -> None:
    api.ddb.transact_failures = [recorded("g7-session-held-elsewhere")]
    status, body = api.create(player_event)
    assert status == 409
    assert body["error"]["code"] == "ACTIVE_SESSION_ELSEWHERE"
    assert body["error"]["details"]["deviceLabel"] == "Bedroom tablet"


def test_recorded_profile_refusal_maps_to_profile_not_found(api: RunsApi, player_event: dict) -> None:
    api.ddb.transact_failures = [recorded("g7-profile-missing")]
    assert api.create(player_event)[1]["error"]["code"] == "PROFILE_NOT_FOUND"


def test_recorded_run_refusal_takes_the_replay_path(api: RunsApi, player_event: dict) -> None:
    def run_exists() -> None:
        api.raw.put_item(
            TableName="test-game",
            Item={k: _ddb(v) for k, v in api_run_item.items()},
        )

    status, first = api.create(player_event)
    api_run_item = api.item(f"RUN#{RUN_A}")
    api.raw.delete_item(TableName="test-game", Key={"pk": {"S": PK}, "sk": {"S": f"RUN#{RUN_A}"}})
    api.ddb.before_transact = run_exists
    api.ddb.transact_failures = [recorded("g7-run-exists")]

    status, body = api.create(player_event)

    assert status == 200
    assert body["run"] == first["run"]


# --- GET /api/runs/{runId} (R9) -------------------------------------------------------------------------------------


def test_get_run_returns_the_run_detail(api: RunsApi, player_event: dict) -> None:
    created = api.create(player_event)[1]["run"]
    status, body = api.call(player_event, "GET /api/runs/{runId}", run_id=RUN_A)
    assert status == 200
    slots = [{"slotId": "N-001", "kind": "NORMAL", "status": "UNRESOLVED", "attemptsUsed": 0}]
    assert body == {**created, "slots": slots}


def test_get_run_in_activity_shows_the_current_slot_with_its_attempts(api: RunsApi, player_event: dict) -> None:
    api.create(player_event)
    api.set_run_fields(RUN_A, phase="ACTIVITY", wave=2, highestCompletedWave=1)
    attempt = {"n": 1, "attemptId": "00000000-0000-4000-8000-000000000001", "answer": "a", "correct": False,
               "recordedAt": "2026-11-20T10:05:00Z"}  # fmt: skip
    DynamoTable(api.raw, "test-game").update_item(
        PK, f"SLOT#{RUN_A}#N-001", update="SET #a = :a", names={"#a": "attempts"}, values={":a": [attempt]}
    )

    body = api.call(player_event, "GET /api/runs/{runId}", run_id=RUN_A)[1]

    assert body["currentSlot"] == {
        "slotId": "N-001",
        "kind": "NORMAL",
        "status": "UNRESOLVED",
        "attempts": [{"n": 1, "answer": "a", "correct": False}],  # no attemptId, no recordedAt
        "withdrawn": False,
    }
    assert body["slots"][0]["attemptsUsed"] == 1


def test_get_run_reports_a_withdrawn_version_without_acting_on_it(api: RunsApi, player_event: dict) -> None:
    api.create(player_event)
    api.set_run_fields(RUN_A, phase="ACTIVITY", wave=2, highestCompletedWave=1)
    DynamoTable(api.raw, "test-content").update_item(
        "ACT#ph-0102", "V#20261120T120000Z", update="SET #w = :w", names={"#w": "withdrawn"},
        values={":w": {"at": "2026-11-21T09:00:00Z", "reason": "typo"}},
    )  # fmt: skip
    before = api.item(f"RUN#{RUN_A}")

    body = api.call(player_event, "GET /api/runs/{runId}", run_id=RUN_A)[1]

    assert body["currentSlot"]["withdrawn"] is True
    assert api.item(f"RUN#{RUN_A}") == before  # reads never mutate


def test_get_run_rejects_a_malformed_id(api: RunsApi, player_event: dict) -> None:
    status, body = api.call(player_event, "GET /api/runs/{runId}", run_id="../PROFILE")
    assert (status, errors(body)) == (400, [{"field": "runId", "rule": "pattern"}])


# --- GET /api/runs/{runId}/pack (R10) -------------------------------------------------------------------------------


def test_pack_is_built_from_the_allow_list(api: RunsApi, player_event: dict) -> None:
    api.create(player_event)
    status, pack = api.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)

    assert status == 200
    [entry] = pack["slots"]
    assert set(pack) == {"protocolVersion", "runId", "revision", "plannedThrough", "gameData", "slots", "packStatus",
                         "packHash"}  # fmt: skip
    assert pack["gameData"] == {"rulesetVersion": "r1", "campaignVersion": "luna-1-c1", "assetManifestVersion": None}
    assert pack["packStatus"] == {"state": "COMPLETE", "missing": []}
    assert set(entry) == {
        "slotId", "kind", "subject", "topicId", "activityId", "activityVersion", "resolved", "presentation", "intro",
        "clips", "reward", "withdrawn", "interactionType", "prompt", "visualAssetReferences", "activityPayload",
        "answerSpecification",
    }  # fmt: skip
    assert entry["clips"] == {
        "instruction": "a01d2c3b4a5968778695a4b3c2d1e0f0e1d2c3b4a5968778695a4b3c2d1e0f0",
        "prompt": "5e88a7b0c3d14f2e9a6b7c8d9e0f1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b",
    }
    assert entry["answerSpecification"] == {"accepted": ["b"]}
    assert entry["reward"] == {"credits": 30}
    text = json.dumps(pack)
    for never in ("review", "publishedBy", "definitionHash", "minAge", "speechId", "speechVersion", "made-up-operator"):
        assert never not in text


def test_pack_hash_is_stable_and_changes_with_the_run(api: RunsApi, player_event: dict) -> None:
    api.create(player_event)
    first = api.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)[1]
    again = api.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)[1]
    api.set_run_fields(RUN_A, revision=1)
    changed = api.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)[1]
    assert first["packHash"] == again["packHash"] != changed["packHash"]


def test_pack_marks_a_missing_version_and_an_unplayable_run(api: RunsApi, player_event: dict) -> None:
    api.create(player_event)
    api.raw.delete_item(TableName="test-content", Key={"pk": {"S": "ACT#ph-0102"}, "sk": {"S": "V#20261120T120000Z"}})
    pack = api.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)[1]
    assert pack["slots"][0]["withdrawn"] is True and "prompt" not in pack["slots"][0]
    assert pack["packStatus"] == {"state": "INCOMPLETE", "missing": [{"slotId": "N-001", "reason": "VERSION_MISSING"}]}

    api.set_run_fields(RUN_A, pins={**api.item(f"RUN#{RUN_A}")["pins"], "rulesetVersion": "r0"})
    pack = api.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)[1]
    assert pack["packStatus"]["state"] == "INCOMPLETE"
    assert {"slotId": "N-001", "reason": "CONTENT_VERSION_UNSUPPORTED"} in pack["packStatus"]["missing"]


# --- Wiring and logs ------------------------------------------------------------------------------------------------


def test_the_lambda_router_has_exactly_this_phases_handlers() -> None:
    assert set(player_api.ROUTER.handlers) == {
        "GET /api/me",
        "GET /api/me/progress",  # Phase 43
        "POST /api/me/resets",  # Phase 55
        "PUT /api/me/profile",
        "PATCH /api/me/profile",
        "GET /api/planets",
        "GET /api/runs",  # Phase 32
        "POST /api/runs",
        "GET /api/runs/{runId}",
        "GET /api/runs/{runId}/pack",
        "POST /api/runs/{runId}/ops",  # Phase 17
        "POST /api/runs/{runId}/endless",  # Phase 29
        "PUT /api/session",
        "DELETE /api/session",
    }


def test_no_session_id_answer_or_device_label_reaches_a_log_line(api: RunsApi, player_event: dict) -> None:
    api.create(player_event)
    api.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)
    log = api.logger.stream.getvalue()
    for never in (MY_SESSION, "Kitchen laptop", '"b"', "5e88a7b0", SUB + "x"):
        assert never not in log
    assert all(line.get("droppedFields") is None for line in api.logger.lines())
