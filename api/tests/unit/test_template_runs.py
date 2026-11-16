"""Phase 41 (M3-06): a published TEMPLATE becomes a concrete instance pinned in its slot at run creation (C24.4 rule 6,
C25.1). Selection's units for templates (C24.4 rules 1, 2, 4), the deterministic draw, and on player-api (moto): the
slot stores the instance, the pack shows it exactly where a FIXED activity's fields go, reloads replay it, and the ops
route judges against it.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

import pytest
from runs_harness import PK, RUN_A, RunsApi
from test_ops import TO_ACTIVITY, attempt, results, send

from shared.content import ACT_PK, CHECKLIST, header_fields, published_version, template_report
from shared.runs import RESOLVED_FIELDS
from shared.selection.bank import Unit, template_units, units_for_band
from shared.selection.plan import (
    STARTER_CONFIG,
    BankNotReady,
    SlotSpec,
    choose_units,
    instance_key,
    plan_slots,
)

VERSION = "20261120T120000Z"
TRACK_10 = {"numberSet": {"kind": "RANGE", "min": 0, "max": 10, "step": 1}, "display": "TRACK"}
BONDS_TO_10 = {
    "schemaVersion": 1, "activityId": "ma-0102", "title": "Bonds to 10", "authoringMode": "TEMPLATE",
    "subject": "maths", "topicId": "maths-bonds-to10", "minAge": 5, "maxAge": 6, "rewardCategory": "NORMAL",
    "interactionType": "NUMBER_SELECT", "audioRequirement": "NONE", "speechDefinitionReferences": {},
    "template": {"generatorKind": "BOND_TO", "generatorVersion": 1,
                 "domain": {"totals": [10], "part": {"min": 1, "max": 9}, "forms": ["a + ? = T", "? + a = T"]},
                 "presentation": TRACK_10},
}  # fmt: skip


def template_items(definition: dict[str, Any] = BONDS_TO_10) -> list[dict[str, Any]]:
    """The header and version admin-api publish (R27) would write for `definition`."""
    size = template_report(definition).domain_size
    version = published_version(
        definition=definition,
        resolved={},
        version=VERSION,
        review={"checklist": dict.fromkeys(CHECKLIST, True)},
        by="test",
        at=datetime(2026, 11, 20, 12, tzinfo=UTC),
        from_draft_revision=1,
    )
    header = {
        "pk": ACT_PK,
        "sk": definition["activityId"],
        **header_fields(definition, size),
        "state": "PUBLISHED",
        "publishedVersion": VERSION,
    }
    return [header, version]


def spec(slot_id: str, interval: int, kind: str = "NORMAL") -> SlotSpec:
    return SlotSpec(slot_id, kind, interval, "maths", {"credits": 30})


# --- Units and the draw (pure) --------------------------------------------------------------------------------------


def test_a_template_counts_two_units_from_20_instances() -> None:
    assert [template_units(n) for n in (0, 1, 19, 20, 5000)] == [0, 1, 1, 2, 2]
    header, _ = template_items()
    assert header["domainSize"] == 18  # 9 parts x 2 forms
    units = units_for_band([header], 5)
    assert [(u.activity_id, u.instance, u.template, u.key) for u in units] == [("ma-0102", 0, True, "ma-0102#0")]
    units = units_for_band([{**header, "domainSize": 20}], 5)
    assert [u.key for u in units] == ["ma-0102#0", "ma-0102#1"]


def test_a_templates_second_unit_goes_to_the_back_of_its_topics_queue() -> None:
    def unit(activity_id: str, instance: int = 0, template: bool = False) -> Unit:
        return Unit(activity_id, VERSION, "maths", "maths-bonds-to10", "NORMAL", "NUMBER_SELECT", instance, template)

    units = [unit("ma-0001"), unit("ma-0002"), unit("ma-0100", 0, True), unit("ma-0100", 1, True)]
    specs = [spec(f"N-00{i}", i) for i in range(1, 5)]
    chosen = choose_units(specs, units, "00000000000000a1", STARTER_CONFIG)
    assert chosen[-1].key == "ma-0100#1"  # every first unit before any second one
    assert sorted(u.key for u in chosen) == ["ma-0001", "ma-0002", "ma-0100#0", "ma-0100#1"]


def materialised(seed: str, slot_ids: tuple[str, ...] = ("N-001", "N-004")) -> list[dict[str, Any]]:
    header, version = template_items()
    units = units_for_band([{**header, "domainSize": 20}], 5)
    specs = [spec(slot_id, int(slot_id[2:])) for slot_id in slot_ids]
    plans = plan_slots(specs, units, {("ma-0102", VERSION): version}, seed)
    return [p.resolved for p in plans if p.resolved is not None]


def test_materialising_is_deterministic_and_never_repeats_an_instance_in_a_run() -> None:
    first = materialised("00000000000000a1")
    assert first == materialised("00000000000000a1")  # same seed and bank: the same instances (C24.9 property 1)
    assert len(first) == 2 and first[0]["params"] != first[1]["params"]  # rule 4: activityId + parameters once
    seeds = {json.dumps(materialised(f"{n:016x}")[0]["params"]) for n in range(20)}
    assert len(seeds) > 5  # different seeds draw different instances
    for resolved in first:
        assert resolved["generatorKind"] == "BOND_TO" and resolved["generatorVersion"] == 1
        assert set(RESOLVED_FIELDS) <= set(resolved)


def test_an_instance_the_run_already_holds_is_redrawn_and_a_used_up_domain_is_bank_not_ready() -> None:
    header, version = template_items()
    [unit] = units_for_band([header], 5)
    seed = "00000000000000a1"
    [plan] = plan_slots([spec("N-001", 1)], [unit], {("ma-0102", VERSION): version}, seed)
    assert plan.resolved is not None
    taken = {instance_key("ma-0102", plan.resolved["params"])}
    [again] = plan_slots([spec("N-001", 1)], [unit], {("ma-0102", VERSION): version}, seed, taken)
    assert again.resolved is not None and again.resolved["params"] != plan.resolved["params"]
    every = {
        instance_key("ma-0102", {"total": 10, "part": part, "form": form})
        for part in range(1, 10)
        for form in ("a + ? = T", "? + a = T")
    }
    with pytest.raises(BankNotReady):
        plan_slots([spec("N-001", 1)], [unit], {("ma-0102", VERSION): version}, seed, every)


def test_a_template_version_whose_generator_is_unknown_is_bank_not_ready() -> None:
    header, version = template_items()
    [unit] = units_for_band([header], 5)
    broken = {**version, "template": {**version["template"], "generatorVersion": 99}}
    with pytest.raises(BankNotReady):
        plan_slots([spec("N-001", 1)], [unit], {("ma-0102", VERSION): broken}, "00000000000000a1")


def test_a_choice_templates_option_order_is_pinned_from_the_instance() -> None:
    definition = {
        **BONDS_TO_10,
        "interactionType": "MULTIPLE_CHOICE",
        "template": {**BONDS_TO_10["template"], "presentation": {}},
    }
    header, version = template_items(definition)
    [unit] = units_for_band([header], 5)
    [plan] = plan_slots([spec("N-001", 1)], [unit], {("ma-0102", VERSION): version}, "00000000000000a1")
    assert plan.resolved is not None
    ids = [o["id"] for o in plan.resolved["activityPayload"]["options"]]
    assert sorted(plan.presentation["optionOrder"]) == ids


# --- On player-api ----------------------------------------------------------------------------------------------------


@pytest.fixture
def api(ddb: Any, player_event: dict) -> RunsApi:
    api = RunsApi(ddb, bank=template_items())
    api.profile(player_event)
    return api


def test_a_run_pins_the_instance_in_its_slot_and_the_pack_shows_it_like_a_fixed_activity(
    api: RunsApi, player_event: dict
) -> None:
    status, _ = api.create(player_event)
    assert status == 201
    slot = api.item(f"SLOT#{RUN_A}#N-001")
    assert slot is not None and slot["activityId"] == "ma-0102"
    resolved = slot["resolved"]
    assert resolved["generatorKind"] == "BOND_TO" and set(resolved["params"]) == {"total", "part", "form"}

    status, pack = api.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)
    assert status == 200 and pack["packStatus"] == {"state": "COMPLETE", "missing": []}
    [entry] = pack["slots"]
    for name in RESOLVED_FIELDS:
        assert entry[name] == entry["resolved"][name] == json.loads(json.dumps(resolved[name], default=int))
    assert entry["interactionType"] == "NUMBER_SELECT"
    assert set(entry["resolved"]) == set(RESOLVED_FIELDS)  # no generator kind, version or parameters (G R10)
    text = json.dumps(pack)
    for never in ("params", "generatorKind", "domain", "template"):
        assert never not in text

    again = api.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)[1]
    assert again == pack  # a reload replays the same instance; nothing is generated again


def test_the_ops_route_judges_a_template_slot_against_its_instance(api: RunsApi, player_event: dict) -> None:
    from runs_harness import MY_SESSION

    assert api.create(player_event, session_id=MY_SESSION)[0] == 201
    slot = api.item(f"SLOT#{RUN_A}#N-001")
    assert slot is not None
    [right] = slot["resolved"]["answerSpecification"]["accepted"]
    wrong = "0" if right != "0" else "1"
    status, body = send(api, player_event, [*TO_ACTIVITY, attempt(4, 3, wrong), attempt(5, 4, right)])
    assert status == 200
    assert results(body)[-2:] == [("APPLIED", "INCORRECT"), ("APPLIED", "RESOLVED_SUCCEEDED")]
    assert api.item(f"SLOT#{RUN_A}#N-001", PK)["status"] == "SUCCEEDED"


def test_a_withdrawn_template_version_omits_the_instance_from_the_pack(api: RunsApi, player_event: dict) -> None:
    from shared.data import DynamoTable

    assert api.create(player_event)[0] == 201
    DynamoTable(api.raw, "test-content").update_item(
        "ACT#ma-0102", f"V#{VERSION}", update="SET #w = :w", names={"#w": "withdrawn"},
        values={":w": {"at": "2026-11-21T09:00:00Z", "reason": "wrong"}},
    )  # fmt: skip
    [entry] = api.call(player_event, "GET /api/runs/{runId}/pack", run_id=RUN_A)[1]["slots"]
    assert entry["withdrawn"] is True and entry["resolved"] is None
    assert not set(RESOLVED_FIELDS) & set(entry)
