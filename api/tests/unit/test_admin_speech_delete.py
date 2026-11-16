"""R32 `DELETE /api/admin/speech-definitions/{id}` on moto (owner ask 2026-11-16, "I can't delete sounds").

Delete removes the header, the draft and every approved version and writes one audit item, like R31 for activities.
It is refused, naming the activities, while any activity draft or any activity version references the definition.
Clips in S3 are never deleted (content-addressed, possibly shared). Nothing left is 404.
"""

from __future__ import annotations

from typing import Any

import pytest
from test_admin_api import BUCKET, PH_0102, PREFIX, SUB, Admin, admin, approve_sh, rules
from test_admin_lifecycle import ACT, audits, create, publish, save

from shared.data import DynamoTable

DELETE = "DELETE /api/admin/speech-definitions/{id}"
SH = "phoneme-sh"


@pytest.fixture
def api(ddb: Any, player_event: dict[str, Any]) -> Admin:
    return Admin(ddb, player_event)


def gone(api: Admin, speech_id: str) -> bool:
    return (
        api.table.get_item("SPEECH", speech_id) is None
        and api.table.get_item(f"SPEECH#{speech_id}", "DRAFT") is None
        and api.table.query_prefix(f"SPEECH#{speech_id}", "V#") == []
    )


def deletes(api: Admin) -> list[dict[str, Any]]:
    return [a for a in audits(api) if a["action"] == "delete"]


def test_an_unused_draft_only_definition_is_deleted_with_an_audit_item(api: Admin) -> None:
    api.speech("word-cat", "WORD", text="cat")
    status, body = api.call(DELETE, id="word-cat")
    assert (status, body) == (200, {"speechId": "word-cat", "deletedVersions": []})
    assert gone(api, "word-cat")
    [audit] = deletes(api)
    assert {k: audit[k] for k in ("action", "by", "speechId", "versionIds")} == {
        "action": "delete",
        "by": SUB,
        "speechId": "word-cat",
        "versionIds": [],
    }
    assert str(audit["sk"]).endswith("#word-cat#delete")
    assert api.call("GET /api/admin/speech-definitions")[1]["items"] == []
    assert api.call("GET /api/admin/speech-definitions/{id}", id="word-cat")[0] == 404


def test_an_approved_definition_loses_every_version_but_its_clip_stays(api: Admin) -> None:
    vid = approve_sh(api)
    clip = api.table.get_item(f"SPEECH#{SH}", f"V#{vid}")["clipKey"]  # type: ignore[index]

    status, body = api.call(DELETE, id=SH)

    assert (status, body) == (200, {"speechId": SH, "deletedVersions": [vid]})
    assert gone(api, SH)
    assert deletes(api)[0]["versionIds"] == [vid]
    # Content-addressed and possibly shared by another definition: never deleted.
    assert api.s3.head_object(Bucket=BUCKET, Key=f"{PREFIX}{clip}.mp3")["ResponseMetadata"]["HTTPStatusCode"] == 200


def test_a_definition_an_activity_draft_uses_is_refused_with_the_activity_ids(api: Admin) -> None:
    approve_sh(api)
    create(api, PH_0102)
    create(api, {**PH_0102, "activityId": "ph-0199"})
    api.speech("word-cat", "WORD", text="cat")
    create(
        api, {**PH_0102, "activityId": "ph-0198", "speechDefinitionReferences": {"prompt": {"speechId": "word-cat"}}}
    )

    status, body = api.call(DELETE, id=SH)

    assert (status, body["error"]["code"]) == (400, "VALIDATION_FAILED")
    assert body["error"]["details"] == [
        {"field": "usedBy.ph-0102", "rule": "speech_in_use"},
        {"field": "usedBy.ph-0199", "rule": "speech_in_use"},
    ]
    assert api.call("GET /api/admin/speech-definitions/{id}", id=SH)[0] == 200
    assert deletes(api) == []


def test_a_definition_only_a_published_version_uses_is_refused(api: Admin) -> None:
    """The draft moved to another sound; the published version (and so games in progress) still names this one."""
    approve_sh(api)
    revision = create(api, PH_0102)
    assert publish(api, revision)[0] == 201
    api.speech("word-cat", "WORD", text="cat")
    save(api, {**PH_0102, "speechDefinitionReferences": {"prompt": {"speechId": "word-cat"}}}, revision)

    status, body = api.call(DELETE, id=SH)
    assert (status, rules(body)) == (400, {("usedBy.ph-0102", "speech_in_use")})
    assert not gone(api, SH)
    # The draft's new sound is used by the draft: refused too.
    assert rules(api.call(DELETE, id="word-cat")[1]) == {("usedBy.ph-0102", "speech_in_use")}


def test_once_the_activity_is_deleted_the_definition_can_go(api: Admin) -> None:
    approve_sh(api)
    assert publish(api, create(api, PH_0102))[0] == 201
    assert api.call(DELETE, id=SH)[0] == 400
    assert api.call("DELETE /api/admin/activities/{id}", id=ACT)[0] == 200
    assert api.call(DELETE, id=SH)[0] == 200
    assert gone(api, SH)


def test_a_second_delete_and_unknown_ids_are_not_found(api: Admin) -> None:
    api.speech("word-cat", "WORD", text="cat")
    assert api.call(DELETE, id="word-cat")[0] == 200
    for speech_id in ("word-cat", "word-none", "../SPEECH"):
        status, body = api.call(DELETE, id=speech_id)
        assert (status, body["error"]["code"]) == (404, "NOT_FOUND")
    assert len(deletes(api)) == 1


def test_one_transaction_holds_version_draft_header_and_audit(api: Admin, monkeypatch: pytest.MonkeyPatch) -> None:
    vid = approve_sh(api)
    sent: list[list[dict[str, Any]]] = []
    real = DynamoTable.transact_write

    def recording(self: DynamoTable, actions: list[dict[str, Any]]) -> None:
        sent.append(list(actions))
        real(self, actions)

    monkeypatch.setattr(DynamoTable, "transact_write", recording)
    assert api.call(DELETE, id=SH)[0] == 200
    [actions] = sent
    assert [next(iter(a)) for a in actions] == ["Delete", "Delete", "Delete", "Put"]
    header = actions[2]["Delete"]
    assert header["Key"] == {"pk": {"S": "SPEECH"}, "sk": {"S": SH}}
    assert header["ConditionExpression"] == "attribute_exists(#pk) AND #v = :v AND attribute_not_exists(#refs)"
    assert header["ExpressionAttributeValues"] == {":v": {"S": vid}}
    assert header["ExpressionAttributeNames"]["#refs"] == "publishRefs"


def test_a_publish_counts_on_the_speech_header(api: Admin) -> None:
    """R27 adds 1 to `publishRefs` on each definition it resolves (the marker R32 conditions its delete on)."""
    approve_sh(api)
    revision = create(api, PH_0102)
    assert publish(api, revision)[0] == 201
    assert api.table.get_item("SPEECH", SH)["publishRefs"] == 1  # type: ignore[index]
    revision = save(api, {**PH_0102, "title": "Second"}, revision)
    assert publish(api, revision)[0] == 201
    assert api.table.get_item("SPEECH", SH)["publishRefs"] == 2  # type: ignore[index]


def test_a_publish_landing_during_the_use_check_refuses_the_delete(api: Admin, monkeypatch: pytest.MonkeyPatch) -> None:
    """Finding (review of R32): the use check has passed (nothing references phoneme-sh yet), then another tab
    creates ph-0102 naming it and publishes it before the delete commits. The publish's counter change refuses the
    header delete, the loop checks again and the delete is refused with the activity; the published version keeps
    its definition."""
    approve_sh(api)
    real = admin.speech_users
    calls: list[list[str]] = []

    def publish_meanwhile(content: DynamoTable, speech_id: str) -> list[str]:
        users = real(content, speech_id)
        calls.append(users)
        if len(calls) == 1:
            assert users == []
            assert publish(api, create(api, PH_0102))[0] == 201
        return users

    monkeypatch.setattr(admin, "speech_users", publish_meanwhile)
    status, body = api.call(DELETE, id=SH)

    assert (status, rules(body)) == (400, {("usedBy.ph-0102", "speech_in_use")})
    assert calls == [[], ["ph-0102"]]
    assert not gone(api, SH)
    assert deletes(api) == []


def test_a_delete_with_no_publish_meanwhile_checks_once(api: Admin, monkeypatch: pytest.MonkeyPatch) -> None:
    """The use check (about a hundred reads on the real bank) runs once when no publish moved the counter."""
    approve_sh(api)
    real = admin.speech_users
    calls: list[str] = []

    def counting(content: DynamoTable, speech_id: str) -> list[str]:
        calls.append(speech_id)
        return real(content, speech_id)

    monkeypatch.setattr(admin, "speech_users", counting)
    assert api.call(DELETE, id=SH)[0] == 200
    assert calls == [SH]


def test_a_retry_after_a_partial_delete_finishes_the_job(api: Admin, monkeypatch: pytest.MonkeyPatch) -> None:
    vid = approve_sh(api)
    monkeypatch.setattr(admin, "DELETE_VERSIONS_IN_TRANSACTION", 0)  # the version goes after the header

    def dies(self: DynamoTable, pk: str, sk: str) -> None:
        raise RuntimeError("the Lambda stopped here")

    real_delete = DynamoTable.delete_item
    monkeypatch.setattr(DynamoTable, "delete_item", dies)
    assert api.call(DELETE, id=SH)[0] == 500
    assert api.table.get_item("SPEECH", SH) is None  # the header went first, with the audit item listing the version
    assert [d["versionIds"] for d in deletes(api)] == [[vid]]

    monkeypatch.setattr(DynamoTable, "delete_item", real_delete)
    assert api.call(DELETE, id=SH) == (200, {"speechId": SH, "deletedVersions": [vid]})
    assert gone(api, SH) and len(deletes(api)) == 1


def test_the_speech_id_can_be_used_again_after_a_delete(api: Admin) -> None:
    api.speech("word-cat", "WORD", text="cat")
    assert api.call(DELETE, id="word-cat")[0] == 200
    status, view = api.call(
        "POST /api/admin/speech-definitions", {"speechId": "word-cat", "title": "Cat", "kind": "WORD"}
    )
    assert status == 201 and view["versions"] == [] and view["draft"]["draftRevision"] == 0


def test_creating_the_id_after_a_partial_delete_removes_the_old_versions(
    api: Admin, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Finding (review of R32): a delete with more versions than fit in its transaction stops after the header went;
    creating the same ID again must not show the old definition's approved versions as its own history."""
    vid = approve_sh(api)
    monkeypatch.setattr(admin, "DELETE_VERSIONS_IN_TRANSACTION", 0)  # the version goes after the header

    def dies(self: DynamoTable, pk: str, sk: str) -> None:
        raise RuntimeError("the Lambda stopped here")

    real_delete = DynamoTable.delete_item
    monkeypatch.setattr(DynamoTable, "delete_item", dies)
    assert api.call(DELETE, id=SH)[0] == 500
    assert api.table.query_prefix(f"SPEECH#{SH}", "V#") != []  # left behind, with no header
    monkeypatch.setattr(DynamoTable, "delete_item", real_delete)

    view = api.speech()  # R18 answers 201 (asserted by the helper)
    assert view["versions"] == [] and view["header"]["state"] == "DRAFT"
    assert api.table.get_item(f"SPEECH#{SH}", f"V#{vid}") is None
    assert len(deletes(api)) == 1  # the first delete's audit item already listed the version
