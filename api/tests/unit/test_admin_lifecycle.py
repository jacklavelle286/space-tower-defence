"""Phase 36 (M3-02): the activity lifecycle on moto (G §12.2 R25-R29, F §12.6 C3-C6, C §C22.4).

Exit criteria first: a stale `draftRevision` gets 409; a replayed publish is refused (or, for the same revision,
answered with the version already written); a locked identity field cannot change after publication; published
versions are never modified; withdraw writes its audit item in the same transaction. Then retire, withdraw, two tabs
publishing at once, and one publish of every interaction type and of a two-step activity.
"""

from __future__ import annotations

import copy
from typing import Any

import pytest
from botocore.exceptions import ClientError
from test_activity_types import EXAMPLES
from test_admin_api import ALL_TICKED, PH_0102, SUB, Admin, approve_sh, rules

from shared.content import CREATE_FIELDS, IDENTITY_FIELDS, definition_hash
from shared.data import DynamoTable
from shared.selection.bank import read_units

ACT = "ph-0102"
DRAFT = "PUT /api/admin/activities/{id}/draft"
VALIDATE = "POST /api/admin/activities/{id}/validate"
PUBLISH = "POST /api/admin/activities/{id}/publish"
RETIRE = "POST /api/admin/activities/{id}/retire"
WITHDRAW = "POST /api/admin/activities/{id}/withdraw"


@pytest.fixture
def api(ddb: Any, player_event: dict[str, Any]) -> Admin:
    return Admin(ddb, player_event)


def create(api: Admin, definition: dict[str, Any]) -> int:
    """Create the activity and save `definition` as its draft; returns the draft revision (1)."""
    status, view = api.call("POST /api/admin/activities", {k: definition[k] for k in CREATE_FIELDS})
    assert status == 201, view
    return save(api, definition, 0, activity_id=definition["activityId"])


def save(api: Admin, definition: dict[str, Any], revision: int, *, activity_id: str = ACT) -> int:
    status, view = api.call(DRAFT, {"draftRevision": revision, "definition": definition}, id=activity_id)
    assert status == 200, view
    return int(view["draft"]["draftRevision"])


def publish(api: Admin, revision: int, *, activity_id: str = ACT) -> tuple[int, dict[str, Any]]:
    review = {"checklist": ALL_TICKED, "previewSolvedDraftRevision": revision}
    return api.call(PUBLISH, {"draftRevision": revision, "review": review}, id=activity_id)


def published_sh(api: Admin) -> str:
    """ph-0102 approved and published from draft revision 1; returns the version ID."""
    approve_sh(api)
    create(api, PH_0102)
    status, body = publish(api, 1)
    assert status == 201, body
    return str(body["versionId"])


def versions(api: Admin, activity_id: str = ACT) -> list[dict[str, Any]]:
    return sorted(api.table.query_prefix(f"ACT#{activity_id}", "V#"), key=lambda v: str(v["sk"]))


def audits(api: Admin) -> list[dict[str, Any]]:
    return api.table.query_prefix("AUDIT#2026-11", "")


# --- Exit criteria ---------------------------------------------------------------------------------------------------


def test_a_stale_draft_revision_is_409_on_save_validate_and_publish(api: Admin) -> None:
    approve_sh(api)
    create(api, PH_0102)
    save(api, {**PH_0102, "title": "Second tab"}, 1)  # another tab saved: the draft is now revision 2
    stale_save = api.call(DRAFT, {"draftRevision": 1, "definition": PH_0102}, id=ACT)
    stale_validate = api.call(VALIDATE, {"draftRevision": 1}, id=ACT)
    stale_publish = publish(api, 1)
    for status, body in (stale_save, stale_validate, stale_publish):
        assert (status, body["error"]["code"]) == (409, "DRAFT_CONFLICT")
    _, view = api.call("GET /api/admin/activities/{id}", id=ACT)
    assert (view["draft"]["draftRevision"], view["draft"]["definition"]["title"]) == (2, "Second tab")
    assert versions(api) == []


def test_a_replayed_publish_is_refused_or_answered_with_the_same_version(api: Admin) -> None:
    first = published_sh(api)
    assert publish(api, 1) == (200, {"versionId": first, "displayNumber": 1})  # a double-click: same version
    revision = save(api, {**PH_0102, "maxAge": 5}, 1)
    status, second = publish(api, revision)
    assert status == 201 and second["displayNumber"] == 2
    # Replaying the first publish (old fromDraftRevision) now: the draft has moved on, so it is refused.
    status, body = publish(api, 1)
    assert (status, body["error"]["code"]) == (409, "DRAFT_CONFLICT")
    assert [v["fromDraftRevision"] for v in versions(api)] == [1, 2]
    assert [a["action"] for a in audits(api)].count("publish") == 2


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("subject", "spelling"),
        ("topicId", "phonics-gpc-vowel-digraphs"),
        ("rewardCategory", "METEOR"),
        ("authoringMode", "TEMPLATE"),
        ("interactionType", "PICTURE_SELECT"),
    ],
)
def test_a_locked_identity_field_cannot_change_after_publication(api: Admin, name: str, value: str) -> None:
    published_sh(api)
    status, body = api.call(DRAFT, {"draftRevision": 1, "definition": {**PH_0102, name: value}}, id=ACT)
    assert (status, rules(body)) == (400, {(f"definition.{name}", "locked_after_publish")})
    assert set(IDENTITY_FIELDS) == {"subject", "topicId", "rewardCategory", "authoringMode", "interactionType"}  # P9


def test_identity_fields_are_free_before_the_first_publish(api: Admin) -> None:
    approve_sh(api)
    create(api, PH_0102)
    revision = save(api, {**PH_0102, "rewardCategory": "METEOR"}, 1)
    header = api.table.get_item("ACT", ACT)
    assert revision == 2 and header is not None and header["rewardCategory"] == "METEOR"


def test_published_versions_are_never_modified(api: Admin) -> None:
    first = published_sh(api)
    before = api.table.get_item(f"ACT#{ACT}", f"V#{first}")
    assert before is not None
    body = {k: v for k, v in before.items() if k not in ("pk", "sk", "review", "publishedBy", "publishedAt")}
    body = {k: v for k, v in body.items() if k not in ("fromDraftRevision", "definitionHash")}
    assert definition_hash(body) == before["definitionHash"]

    # Edit, publish again, retire, withdraw the newer version: the first version's item never changes.
    revision = save(api, {**PH_0102, "prompt": {"text": "Which letters say this sound?"}}, 1)
    _, second = publish(api, revision)
    api.call(RETIRE, {}, id=ACT)
    api.call(WITHDRAW, {"version": second["versionId"], "reason": "Wrong wording."}, id=ACT)
    assert api.table.get_item(f"ACT#{ACT}", f"V#{first}") == before

    # The database refuses a second write to a version: the publish Put is conditioned on attribute_not_exists.
    action = api.table.put_action({**before, "prompt": {"text": "changed"}}, condition="attribute_not_exists(#pk)",
                                  names={"#pk": "pk"})  # fmt: skip
    with pytest.raises(ClientError):
        api.table.transact_write([action])
    assert api.table.get_item(f"ACT#{ACT}", f"V#{first}") == before


def test_withdraw_writes_the_audit_item_in_the_same_transaction(api: Admin) -> None:
    vid = published_sh(api)
    status, body = api.call(WITHDRAW, {"version": vid, "reason": "  The answer key is wrong. "}, id=ACT)
    assert status == 200, body
    assert body == {
        "versionId": vid,
        "withdrawn": {"at": body["withdrawn"]["at"], "reason": "The answer key is wrong."},
    }
    version = api.table.get_item(f"ACT#{ACT}", f"V#{vid}")
    assert version is not None and version["withdrawn"] == body["withdrawn"]
    withdraws = [a for a in audits(api) if a["action"] == "withdraw"]
    assert [(a["activityId"], a["versionId"], a["by"], a["reason"], a["retired"]) for a in withdraws] == [
        (ACT, vid, SUB, "The answer key is wrong.", True)
    ]
    assert withdraws[0]["at"] == body["withdrawn"]["at"]  # written by the same transaction, at the same moment


def test_a_refused_withdraw_writes_no_audit_item(api: Admin) -> None:
    """All or nothing: when the version's condition fails, the audit Put in the same transaction is not written."""
    vid = published_sh(api)
    original = api.table.get_item

    def stale_get(pk: str, sk: str, attributes: Any = None) -> dict[str, Any] | None:
        if sk == f"V#{vid}":
            return {"pk": pk, "sk": sk}  # another tab's withdrawal is not seen yet
        return original(pk, sk, attributes)

    api.call(WITHDRAW, {"version": vid, "reason": "First tab."}, id=ACT)
    before = len(audits(api))
    api.table.get_item = stale_get  # type: ignore[method-assign]
    status, body = api.call(WITHDRAW, {"version": vid, "reason": "Second tab."}, id=ACT)
    assert (status, body["error"]["code"]) == (503, "THROTTLED")  # refused three times, nothing written
    api.table.get_item = original  # type: ignore[method-assign]
    assert len(audits(api)) == before
    version = original(f"ACT#{ACT}", f"V#{vid}")
    assert version is not None and version["withdrawn"]["reason"] == "First tab."


# --- Retire (R28, C5) ------------------------------------------------------------------------------------------------


def test_retire_stops_selection_keeps_versions_and_is_idempotent(api: Admin) -> None:
    vid = published_sh(api)
    assert [u.activity_id for u in read_units(api.table, 5)] == [ACT]
    status, header = api.call(RETIRE, {}, id=ACT)
    assert status == 200 and (header["state"], header["publishedVersion"]) == ("RETIRED", vid)
    assert read_units(api.table, 5) == []  # not selectable for new games
    assert api.table.get_item(f"ACT#{ACT}", f"V#{vid}") is not None  # pinned runs still read it
    again = api.call(RETIRE, {}, id=ACT)
    assert again == (200, header)
    assert [(a["action"], a["versionId"]) for a in audits(api) if a["action"] == "retire"] == [("retire", vid)]
    _, listing = api.call("GET /api/admin/activities", query={"state": "RETIRED"})
    assert [i["activityId"] for i in listing["items"]] == [ACT]


def test_a_retired_activity_comes_back_only_with_a_new_version(api: Admin) -> None:
    first = published_sh(api)
    api.call(RETIRE, {}, id=ACT)
    assert publish(api, 1) == (200, {"versionId": first, "displayNumber": 1})  # a replay, not a resurrection
    assert api.table.get_item("ACT", ACT)["state"] == "RETIRED"  # type: ignore[index]
    revision = save(api, {**PH_0102, "maxAge": 5}, 1)
    status, second = publish(api, revision)
    header = api.table.get_item("ACT", ACT)
    assert status == 201 and header is not None
    assert (header["state"], header["publishedVersion"]) == ("PUBLISHED", second["versionId"])


def test_retire_refuses_a_draft_and_unknown_ids_and_a_body(api: Admin) -> None:
    approve_sh(api)
    create(api, PH_0102)
    status, body = api.call(RETIRE, {}, id=ACT)
    assert (status, rules(body)) == (400, {("state", "not_published")})
    assert api.call(RETIRE, {}, id="ph-9999")[0] == 404
    status, body = api.call(RETIRE, {"reason": "x"}, id=ACT)
    assert (status, rules(body)) == (400, {("reason", "additionalProperties")})


# --- Withdraw (R29, C6) ----------------------------------------------------------------------------------------------


def test_withdrawing_an_older_version_leaves_the_activity_published(api: Admin) -> None:
    first = published_sh(api)
    revision = save(api, {**PH_0102, "maxAge": 5}, 1)
    _, second = publish(api, revision)
    status, body = api.call(WITHDRAW, {"version": first, "reason": "Old wording."}, id=ACT)
    assert status == 200
    header = api.table.get_item("ACT", ACT)
    assert header is not None and (header["state"], header["publishedVersion"]) == ("PUBLISHED", second["versionId"])
    _, view = api.call("GET /api/admin/activities/{id}", id=ACT)
    assert [v.get("withdrawn") for v in view["versions"]] == [body["withdrawn"], None]
    assert [a["retired"] for a in audits(api) if a["action"] == "withdraw"] == [False]


def test_withdraw_is_idempotent_and_keeps_the_first_record(api: Admin) -> None:
    vid = published_sh(api)
    first = api.call(WITHDRAW, {"version": vid, "reason": "Wrong."}, id=ACT)
    second = api.call(WITHDRAW, {"version": vid, "reason": "Another reason."}, id=ACT)
    assert first == second and first[0] == 200
    assert [a["action"] for a in audits(api)].count("withdraw") == 1
    assert api.table.get_item("ACT", ACT)["state"] == "RETIRED"  # type: ignore[index]


@pytest.mark.parametrize(
    ("body", "status", "expected"),
    [
        ({"version": "20261120T101500Z", "reason": "Wrong."}, 404, None),
        ({"version": "v1", "reason": "Wrong."}, 400, {("version", "pattern")}),
        ({"version": "20261120T101500Z", "reason": "   "}, 400, {("reason", "length")}),
        ({"version": "20261120T101500Z", "reason": "x" * 201}, 400, {("reason", "length")}),
        ({"version": "20261120T101500Z", "reason": "line\nbreak"}, 400, {("reason", "length")}),
        ({"version": "20261120T101500Z"}, 400, {("reason", "required")}),
    ],
)
def test_withdraw_checks_its_body(api: Admin, body: dict[str, Any], status: int, expected: Any) -> None:
    published_sh(api)
    got_status, got = api.call(WITHDRAW, body, id=ACT)
    assert got_status == status
    if expected is not None:
        assert rules(got) == expected
    assert [a for a in audits(api) if a["action"] == "withdraw"] == []


# --- Two tabs publishing at once (the phase's risk) ----------------------------------------------------------------


class StaleHeader(DynamoTable):
    """The content table, except that the first read of the activity header and draft returns what they were
    before the other tab published: this tab read them, then the other tab's publish landed."""

    def __init__(self, inner: DynamoTable, snapshot: dict[tuple[str, str], dict[str, Any] | None]) -> None:
        super().__init__(inner._client, inner.table_name)
        self.snapshot = dict(snapshot)

    def get_item(self, pk: str, sk: str, attributes: Any = None) -> dict[str, Any] | None:
        if (pk, sk) in self.snapshot:
            return self.snapshot.pop((pk, sk))
        return super().get_item(pk, sk, attributes)


def test_two_tabs_publishing_the_same_revision_make_one_version(api: Admin) -> None:
    approve_sh(api)
    create(api, PH_0102)
    snapshot = {("ACT", ACT): api.table.get_item("ACT", ACT), (f"ACT#{ACT}", "DRAFT"): None}
    snapshot[(f"ACT#{ACT}", "DRAFT")] = api.table.get_item(f"ACT#{ACT}", "DRAFT")
    status_a, body_a = publish(api, 1)  # tab A wins
    real = api.table
    api.table = StaleHeader(real, snapshot)  # tab B read the header before A's write landed
    status_b, body_b = publish(api, 1)
    api.table = real
    assert (status_a, status_b) == (201, 200)
    assert body_b == body_a  # B is told about A's version, not a second one
    assert len(versions(api)) == 1
    assert [a["action"] for a in audits(api)].count("publish") == 1


def test_two_tabs_publishing_different_revisions_refuse_the_stale_one(api: Admin) -> None:
    approve_sh(api)
    create(api, PH_0102)
    snapshot = {("ACT", ACT): api.table.get_item("ACT", ACT), (f"ACT#{ACT}", "DRAFT"): None}
    snapshot[(f"ACT#{ACT}", "DRAFT")] = api.table.get_item(f"ACT#{ACT}", "DRAFT")
    revision = save(api, {**PH_0102, "maxAge": 5}, 1)
    assert publish(api, revision)[0] == 201  # tab A saved and published revision 2
    real = api.table
    api.table = StaleHeader(real, snapshot)  # tab B still holds revision 1
    status, body = publish(api, 1)
    api.table = real
    assert (status, body["error"]["code"]) == (409, "DRAFT_CONFLICT")
    assert len(versions(api)) == 1


# --- Every interaction type publishes (C20.1) ------------------------------------------------------------------------


@pytest.mark.parametrize("name", sorted(EXAMPLES))
def test_every_interaction_type_validates_and_publishes(api: Admin, name: str) -> None:
    definition = copy.deepcopy(EXAMPLES[name])
    activity_id = definition["activityId"]
    revision = create(api, definition)
    status, body = api.call(VALIDATE, {"draftRevision": revision}, id=activity_id)
    assert (status, body["valid"], body["problems"]) == (200, True, [])
    status, body = publish(api, revision, activity_id=activity_id)
    assert status == 201, body
    version = api.table.get_item(f"ACT#{activity_id}", f"V#{body['versionId']}")
    assert version is not None
    assert version["answerSpecification"] == definition["answerSpecification"]
    assert version["activityPayload"] == definition["activityPayload"]
    assert version.get("additionalSteps") == definition.get("additionalSteps")
    for band in (definition["minAge"], definition["maxAge"]):
        assert activity_id in [u.activity_id for u in read_units(api.table, band)]


def test_validate_names_the_field_and_rule_for_a_new_type(api: Admin) -> None:
    definition = copy.deepcopy(EXAMPLES["arrange-letters"])
    revision = create(api, {**definition, "answerSpecification": {"accepted": ["tac"]}})
    status, body = api.call(VALIDATE, {"draftRevision": revision}, id="sp-9003")
    assert (status, body["valid"]) == (200, False)
    assert body["problems"] == [{"field": "answerSpecification.accepted.0", "rule": "shuffle_spells_answer"}]
    status, body = publish(api, revision, activity_id="sp-9003")
    assert (status, rules(body)) == (400, {("answerSpecification.accepted.0", "shuffle_spells_answer")})
