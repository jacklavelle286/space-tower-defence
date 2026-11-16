"""R31 `DELETE /api/admin/activities/{id}` on moto (owner decision 2026-11-16, "just do delete").

Delete removes the header, the draft and every version and writes one audit item; nothing left is 404; a request that
stopped part way is finished by a retry; a publish racing the delete is caught by the header condition. The run that
pinned a deleted version is tested in test_ops.py (it degrades exactly like a withdrawn version).
"""

from __future__ import annotations

from typing import Any

import pytest
from test_admin_api import PH_0102, SUB, Admin, admin, approve_sh
from test_admin_lifecycle import ACT, DRAFT, WITHDRAW, audits, create, publish, save, versions

from shared.data import DynamoTable
from shared.selection.bank import read_units

DELETE = "DELETE /api/admin/activities/{id}"


@pytest.fixture
def api(ddb: Any, player_event: dict[str, Any]) -> Admin:
    return Admin(ddb, player_event)


def gone(api: Admin, activity_id: str = ACT) -> bool:
    return (
        api.table.get_item("ACT", activity_id) is None
        and api.table.get_item(f"ACT#{activity_id}", "DRAFT") is None
        and versions(api, activity_id) == []
    )


def deletes(api: Admin) -> list[dict[str, Any]]:
    return [a for a in audits(api) if a["action"] == "delete"]


def published_twice(api: Admin) -> list[str]:
    """ph-0102 published from draft revisions 1 and 2; returns both version IDs."""
    approve_sh(api)
    create(api, PH_0102)
    first = publish(api, 1)[1]["versionId"]
    second = publish(api, save(api, {**PH_0102, "maxAge": 5}, 1))[1]["versionId"]
    return [first, second]


def test_a_draft_only_activity_is_deleted_with_an_audit_item(api: Admin) -> None:
    create(api, PH_0102)
    status, body = api.call(DELETE, id=ACT)
    assert (status, body) == (200, {"activityId": ACT, "deletedVersions": []})
    assert gone(api)
    [audit] = deletes(api)
    assert {k: audit[k] for k in ("action", "by", "activityId", "versionIds")} == {
        "action": "delete",
        "by": SUB,
        "activityId": ACT,
        "versionIds": [],
    }
    assert str(audit["sk"]).endswith(f"#{ACT}#delete")
    assert api.call("GET /api/admin/activities")[1]["items"] == []
    assert api.call("GET /api/admin/activities/{id}", id=ACT)[0] == 404


def test_a_published_activity_loses_every_version_and_leaves_the_bank(api: Admin) -> None:
    vids = published_twice(api)
    api.call(WITHDRAW, {"version": vids[0], "reason": "Old wording."}, id=ACT)  # a withdrawn version goes too
    assert [u.activity_id for u in read_units(api.table, 5)] == [ACT]

    status, body = api.call(DELETE, id=ACT)

    assert (status, body) == (200, {"activityId": ACT, "deletedVersions": sorted(vids)})
    assert gone(api) and read_units(api.table, 5) == []
    assert deletes(api)[0]["versionIds"] == sorted(vids)
    for vid in vids:
        assert api.call("GET /api/admin/activities/{id}", query={"version": vid}, id=ACT)[0] == 404
    # Speech definitions are shared and stay.
    assert api.call("GET /api/admin/speech-definitions/{id}", id="phoneme-sh")[0] == 200


def test_a_second_delete_and_unknown_ids_are_not_found(api: Admin) -> None:
    create(api, PH_0102)
    assert api.call(DELETE, id=ACT)[0] == 200
    for activity_id in (ACT, "ph-9999", "../ACT"):
        status, body = api.call(DELETE, id=activity_id)
        assert (status, body["error"]["code"]) == (404, "NOT_FOUND")
    assert len(deletes(api)) == 1


def test_one_transaction_holds_versions_draft_header_and_audit(api: Admin, monkeypatch: pytest.MonkeyPatch) -> None:
    vids = published_twice(api)
    sent: list[list[dict[str, Any]]] = []
    real = DynamoTable.transact_write

    def recording(self: DynamoTable, actions: list[dict[str, Any]]) -> None:
        sent.append(list(actions))
        real(self, actions)

    monkeypatch.setattr(DynamoTable, "transact_write", recording)
    assert api.call(DELETE, id=ACT)[0] == 200
    [actions] = sent
    assert [next(iter(a)) for a in actions] == ["Delete", "Delete", "Delete", "Delete", "Put"]
    header = actions[3]["Delete"]
    assert header["Key"] == {"pk": {"S": "ACT"}, "sk": {"S": ACT}}
    assert header["ConditionExpression"] == "attribute_exists(#pk) AND #pv = :pv"
    assert header["ExpressionAttributeValues"] == {":pv": {"S": vids[1]}}


def test_many_versions_are_deleted_one_by_one_after_the_header(api: Admin, monkeypatch: pytest.MonkeyPatch) -> None:
    vids = published_twice(api)
    monkeypatch.setattr(admin, "DELETE_VERSIONS_IN_TRANSACTION", 1)  # two versions do not fit: the large path
    order: list[str] = []
    real_transact, real_delete = DynamoTable.transact_write, DynamoTable.delete_item

    def transact(self: DynamoTable, actions: list[dict[str, Any]]) -> None:
        order.append(
            "transaction:" + ",".join(a["Delete"]["Key"]["sk"]["S"] if "Delete" in a else "audit" for a in actions)
        )
        real_transact(self, actions)

    def delete(self: DynamoTable, pk: str, sk: str) -> None:
        order.append(sk)
        real_delete(self, pk, sk)

    monkeypatch.setattr(DynamoTable, "transact_write", transact)
    monkeypatch.setattr(DynamoTable, "delete_item", delete)
    assert api.call(DELETE, id=ACT) == (200, {"activityId": ACT, "deletedVersions": sorted(vids)})
    assert order[0] == f"transaction:DRAFT,{ACT},audit"  # draft, header and audit item first, no versions
    assert order[1:] == [f"V#{vid}" for vid in sorted(vids)]
    assert gone(api) and deletes(api)[0]["versionIds"] == sorted(vids)


def test_a_retry_after_a_partial_delete_finishes_the_job(api: Admin, monkeypatch: pytest.MonkeyPatch) -> None:
    vids = sorted(published_twice(api))
    monkeypatch.setattr(admin, "DELETE_VERSIONS_IN_TRANSACTION", 1)
    real_delete = DynamoTable.delete_item
    calls: list[str] = []

    def dies_on_the_second(self: DynamoTable, pk: str, sk: str) -> None:
        calls.append(sk)
        if len(calls) == 2:
            raise RuntimeError("the Lambda stopped here")
        real_delete(self, pk, sk)

    monkeypatch.setattr(DynamoTable, "delete_item", dies_on_the_second)
    assert api.call(DELETE, id=ACT)[0] == 500  # request 1 stops after deleting one version
    # The header went first: the activity is already out of the bank, and the audit item lists every version.
    assert api.table.get_item("ACT", ACT) is None and read_units(api.table, 5) == []
    assert versions(api, ACT) != [] and [d["versionIds"] for d in deletes(api)] == [vids]

    monkeypatch.setattr(DynamoTable, "delete_item", real_delete)
    status, body = api.call(DELETE, id=ACT)
    assert (status, body["deletedVersions"]) == (200, vids[1:])  # what was left
    assert gone(api) and len(deletes(api)) == 1  # no second audit item: the first one already lists both


class StaleRead(DynamoTable):
    """The content table, except that the delete's first read sees the activity as it was before a publish landed."""

    def __init__(self, inner: DynamoTable, header: dict[str, Any] | None) -> None:
        super().__init__(inner._client, inner.table_name)
        self.header: dict[str, Any] | None = header
        self.stale = True

    def get_item(self, pk: str, sk: str, attributes: Any = None) -> dict[str, Any] | None:
        if self.stale and (pk, sk) == ("ACT", ACT):
            return self.header
        return super().get_item(pk, sk, attributes)

    def query_prefix(self, pk: str, sk_prefix: str, attributes: Any = None) -> list[dict[str, Any]]:
        if self.stale and sk_prefix == "V#":
            self.stale = False  # the next loop reads the table as it is
            return []
        return super().query_prefix(pk, sk_prefix, attributes)


def test_a_publish_racing_the_delete_is_caught_and_its_version_deleted(api: Admin) -> None:
    approve_sh(api)
    create(api, PH_0102)
    before = api.table.get_item("ACT", ACT)  # the delete read this: no published version yet
    vid = publish(api, 1)[1]["versionId"]  # then a publish landed
    real = api.table
    api.table = StaleRead(real, before)
    status, body = api.call(DELETE, id=ACT)
    api.table = real
    assert (status, body["deletedVersions"]) == (200, [vid])  # the refused first try re-read and found it
    assert gone(api)


def test_a_save_after_the_delete_is_refused_and_writes_nothing(api: Admin) -> None:
    create(api, PH_0102)
    assert api.call(DELETE, id=ACT)[0] == 200
    status, body = api.call(DRAFT, {"draftRevision": 1, "definition": PH_0102}, id=ACT)
    assert (status, body["error"]["code"]) == (404, "NOT_FOUND")
    assert gone(api)


def test_the_activity_id_can_be_used_again_after_a_delete(api: Admin) -> None:
    create(api, PH_0102)
    assert api.call(DELETE, id=ACT)[0] == 200
    status, view = api.call("POST /api/admin/activities", {k: PH_0102[k] for k in ("activityId", "title", "subject",
        "topicId", "rewardCategory", "interactionType", "authoringMode", "minAge", "maxAge")})  # fmt: skip
    assert status == 201 and view["versions"] == [] and view["draft"]["draftRevision"] == 0
