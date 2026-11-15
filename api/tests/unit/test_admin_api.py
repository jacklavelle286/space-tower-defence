"""Phase 20 admin path (G §12 R17-R27, D §D8.6, D §D9.3; M1-19) on moto, with the real `tts` preview route.

The exit criteria come first: the approved version records the same `clipKey` as the preview; approval refuses a draft
whose exact input was never previewed; a PHONEME definition needs a publishable listening verdict (G-14); an operator
without `admin`, or a player token, is refused with 403 on every admin route before anything is read (I §I.2.7); the
published activity is what selection and packs read.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime, timedelta
from typing import Any

import boto3
import pytest
from conftest import REPO, CapturedLogger, RecordingClient, event_for, load_handler
from test_tts import BUCKET, PREFIX, FakePolly

from shared.clipkey import SpeechConfig
from shared.content import CHECKLIST, CREATE_FIELDS
from shared.data import DynamoTable
from shared.selection.bank import read_units, read_versions
from shared.selection.plan import _clips
from shared.verdicts import phoneme_refusal

admin = load_handler("admin_api")
tts = load_handler("tts")

CONTENT = "test-content"
SUB = "a6c2b2b4-7051-70ef-b1e8-739ac38dd0cb"  # the sub in the Phase 5 fixture event
CONFIG = SpeechConfig(voice_id="Amy", engine="generative", phoneme_engine="generative")  # prod (ADR-0014)
ROUTES = json.loads((REPO / "contracts" / "routes.json").read_text())["routes"]
ADMIN_ROUTES = [f"{r['method']} {r['path']}" for r in ROUTES if r["path"].startswith("/api/admin/")]
SEED = REPO / "content" / "seed"
SH_BODY = json.loads((SEED / "speech" / "phoneme-sh.json").read_text())["ssml"]
PH_0102 = {k: v for k, v in json.loads((SEED / "activities" / "ph-0102.json").read_text()).items() if k != "$comment"}
ALL_TICKED = {name: True for name in CHECKLIST}


class Clock:
    def __init__(self) -> None:
        self.moment = datetime(2026, 11, 20, 10, 14, 0, tzinfo=UTC)

    def __call__(self) -> datetime:
        self.moment += timedelta(seconds=1)  # every write gets its own version ID
        return self.moment


class Admin:
    """admin-api and tts sharing one moto content table and audio bucket, with a fake Polly."""

    def __init__(self, ddb: Any, base: dict[str, Any]) -> None:
        ddb.create_table(
            TableName=CONTENT,
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[
                {"AttributeName": "pk", "AttributeType": "S"},
                {"AttributeName": "sk", "AttributeType": "S"},
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        self.raw = ddb
        self.table = DynamoTable(ddb, CONTENT)
        s3 = boto3.client("s3", region_name="eu-west-2")
        s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "eu-west-2"})
        self.s3 = s3
        self.polly = FakePolly()
        self.base = base
        self.logger = CapturedLogger()
        store = tts.AudioStore(bucket=BUCKET, clip_prefix=PREFIX)
        self.router = admin.make_router(
            admin.Deps(
                content=lambda: self.table,
                s3=admin.s3_client,
                store=lambda: store,
                config=lambda: CONFIG,
                now=Clock(),
            ),
            self.logger,
        )
        self.tts = tts.make_router(
            tts.Deps(s3=tts.s3_client, polly=lambda: self.polly, store=lambda: store, config=lambda: CONFIG),
            CapturedLogger(),
        )

    def call(self, route: str, body: Any = None, *, id: str | None = None, query: dict | None = None) -> tuple:
        event = event_for(self.base, route, cognito__groups="[admin]")
        if id is not None:
            event["pathParameters"] = {"id": id}
        if query is not None:
            event["queryStringParameters"] = query
        if body is not None:
            event["body"] = json.dumps(body)
        response = self.router.handle(event)
        return response["statusCode"], json.loads(response["body"])

    def preview(self, kind: str, **body: str) -> dict[str, Any]:
        event = event_for(self.base, "POST /api/admin/speech/preview", cognito__groups="[admin]")
        event["body"] = json.dumps({"kind": kind, **body})
        response = self.tts.handle(event)
        assert response["statusCode"] == 200, response["body"]
        return json.loads(response["body"])

    # helpers for the M1 path
    def speech(self, speech_id: str = "phoneme-sh", kind: str = "PHONEME", **body: str) -> dict[str, Any]:
        status, view = self.call(
            "POST /api/admin/speech-definitions", {"speechId": speech_id, "title": "Sound sh", "kind": kind}
        )
        assert status == 201, view
        status, view = self.call(
            "PUT /api/admin/speech-definitions/{id}", {"draftRevision": 0, **(body or {"ssml": SH_BODY})}, id=speech_id
        )
        assert status == 200, view
        return view

    def approve(self, speech_id: str, revision: int, **extra: Any) -> tuple:
        return self.call(
            "POST /api/admin/speech-definitions/{id}/approve", {"draftRevision": revision, **extra}, id=speech_id
        )

    def activity(self, definition: dict[str, Any] | None = None) -> dict[str, Any]:
        definition = definition or PH_0102
        identity = {k: definition[k] for k in CREATE_FIELDS}
        status, view = self.call("POST /api/admin/activities", identity)
        assert status == 201, view
        status, view = self.call(
            "PUT /api/admin/activities/{id}/draft", {"draftRevision": 0, "definition": definition}, id="ph-0102"
        )
        assert status == 200, view
        return view

    def publish(self, revision: int, checklist: dict | None = None, solved: int | None = None) -> tuple:
        review = {
            "checklist": checklist or ALL_TICKED,
            "previewSolvedDraftRevision": revision if solved is None else solved,
        }
        return self.call(
            "POST /api/admin/activities/{id}/publish", {"draftRevision": revision, "review": review}, id="ph-0102"
        )


@pytest.fixture
def api(ddb: Any, player_event: dict[str, Any]) -> Admin:
    return Admin(ddb, player_event)


def rules(body: dict[str, Any]) -> set[tuple[str, str]]:
    return {(d["field"], d["rule"]) for d in body["error"]["details"]}


# --- Exit criteria: approve records the previewed clip, and only a previewed one ------------------------------------


def test_approved_version_records_the_preview_clip_key_sha256_and_render_date(api: Admin) -> None:
    view = api.speech()
    draft = view["draft"]
    assert (draft["kind"], draft["provider"], draft["engine"], draft["voiceId"], draft["draftRevision"]) == (
        "PHONEME",
        "polly",
        "generative",
        "Amy",
        1,
    )
    preview = api.preview("PHONEME", speechId="phoneme-sh", ssml=SH_BODY)
    assert preview["clipKey"] == view["draft"]["clipKey"]  # R19 shows the key a preview of the saved draft gives

    status, body = api.approve("phoneme-sh", 1, reviewNote="clear, no added vowel")
    assert status == 200, body
    assert body["clipKey"] == preview["clipKey"]
    stored = api.s3.get_object(Bucket=BUCKET, Key=f"{PREFIX}{preview['clipKey']}.mp3")["Body"].read()
    assert body["sha256"] == hashlib.sha256(stored).hexdigest()

    version = api.table.get_item("SPEECH#phoneme-sh", f"V#{body['versionId']}")
    assert version is not None
    assert {k: version[k] for k in ("kind", "provider", "engine", "voiceId", "clipKey", "sha256")} == {
        "kind": "PHONEME",
        "provider": "polly",
        "engine": "generative",
        "voiceId": "Amy",
        "clipKey": preview["clipKey"],
        "sha256": body["sha256"],
    }
    assert version["renderedAt"].endswith("Z") and version["approvedAt"].endswith("Z")
    assert version["review"]["listenedBy"] == SUB  # from the token, never the body
    header = api.table.get_item("SPEECH", "phoneme-sh")
    assert header is not None and header["state"] == "APPROVED" and header["approvedVersion"] == body["versionId"]
    audits = api.table.query_prefix("AUDIT#2026-11", "")
    assert [(a["action"], a["speechId"], a["versionId"]) for a in audits] == [
        ("approve", "phoneme-sh", body["versionId"])
    ]
    assert len(api.polly.calls) == 1  # approval never synthesises


def test_the_seed_ssml_gives_the_clip_the_owner_chose(api: Admin) -> None:
    verdicts = json.loads((REPO / "content" / "listening-verdicts.json").read_text())
    assert api.speech()["draft"]["clipKey"] == verdicts["sounds"]["sh"]["clip"]["clipKey"]


def test_approve_refuses_a_draft_that_was_never_previewed(api: Admin) -> None:
    api.speech()
    status, body = api.approve("phoneme-sh", 1)
    assert (status, rules(body)) == (400, {("draft", "not_previewed")})
    assert api.table.query_prefix("SPEECH#phoneme-sh", "V#") == []


def test_approve_refuses_when_only_an_earlier_revision_was_previewed(api: Admin) -> None:
    api.speech("word-ship", "WORD", text="ship.")
    api.preview("WORD", text="ship.")
    status, _ = api.call(
        "PUT /api/admin/speech-definitions/{id}", {"draftRevision": 1, "text": "shop."}, id="word-ship"
    )
    assert status == 200
    status, body = api.approve("word-ship", 2)
    assert (status, rules(body)) == (400, {("draft", "not_previewed")})


def test_a_preview_under_the_wrong_kind_does_not_count(api: Admin) -> None:
    config = SpeechConfig(voice_id="Amy", engine="generative", phoneme_engine="neural")  # engines differ by kind
    api.tts = tts.make_router(
        tts.Deps(
            s3=tts.s3_client,
            polly=lambda: api.polly,
            store=lambda: tts.AudioStore(BUCKET, PREFIX),
            config=lambda: config,
        ),
        CapturedLogger(),
    )
    api.router = admin.make_router(
        admin.Deps(
            content=lambda: api.table,
            s3=admin.s3_client,
            store=lambda: tts.AudioStore(BUCKET, PREFIX),
            config=lambda: config,
            now=Clock(),
        )
    )
    api.speech()
    api.preview("WORD", ssml=SH_BODY)  # rendered on the WORD engine: a different clip key
    status, body = api.approve("phoneme-sh", 1)
    assert (status, rules(body)) == (400, {("draft", "not_previewed")})


def test_approve_is_safe_to_retry_and_refuses_a_stale_revision(api: Admin) -> None:
    api.speech()
    api.preview("PHONEME", ssml=SH_BODY)
    first = api.approve("phoneme-sh", 1)
    again = api.approve("phoneme-sh", 1)
    assert first == again and first[0] == 200
    assert len(api.table.query_prefix("SPEECH#phoneme-sh", "V#")) == 1
    status, body = api.approve("phoneme-sh", 0)
    assert (status, body["error"]["code"]) == (409, "DRAFT_CONFLICT")


def test_g14_refuses_a_phoneme_without_a_publishable_verdict(api: Admin) -> None:
    verdicts = json.loads((REPO / "content" / "listening-verdicts.json").read_text())["sounds"]
    refused = sorted(s for s, v in verdicts.items() if v["verdict"] not in ("publishable", "publishable-small-schwa"))
    assert refused, "the verdicts file has no refused sound to test with"
    sound = refused[0]
    speech_id = f"phoneme-{sound}"
    api.speech(speech_id, "PHONEME", text=sound)
    api.preview("PHONEME", text=sound)
    status, body = api.approve(speech_id, 1)
    expected = "phoneme_word_only" if verdicts[sound]["verdict"] == "word-only" else "phoneme_no_verdict"
    assert (status, rules(body)) == (400, {("speechId", expected)})


def test_phoneme_refusal_rules() -> None:
    sounds = {
        "sh": {"verdict": "publishable"},
        "b": {"verdict": "publishable-small-schwa"},
        "ng": {"verdict": "word-only"},
        "th": {"verdict": "pending"},
    }
    assert phoneme_refusal("phoneme-sh", sounds) is None
    assert phoneme_refusal("phoneme-b", sounds) is None
    assert phoneme_refusal("phoneme-ng", sounds) == "phoneme_word_only"
    assert phoneme_refusal("phoneme-th", sounds) == "phoneme_no_verdict"
    assert phoneme_refusal("phoneme-zz", sounds) == "phoneme_no_verdict"
    assert phoneme_refusal("sh-sound", sounds) == "phoneme_no_verdict"


def test_speech_draft_save_checks_like_a_preview_and_uses_draft_revision(api: Admin) -> None:
    api.speech()
    status, body = api.call(
        "PUT /api/admin/speech-definitions/{id}", {"draftRevision": 1, "ssml": '<prosody pitch="high">sh</prosody>'},
        id="phoneme-sh",
    )  # fmt: skip
    assert (status, rules(body)) == (400, {("ssml", "attribute")})
    status, body = api.call(
        "PUT /api/admin/speech-definitions/{id}", {"draftRevision": 0, "text": "sh"}, id="phoneme-sh"
    )
    assert (status, body["error"]["code"]) == (409, "DRAFT_CONFLICT")
    status, body = api.call("PUT /api/admin/speech-definitions/{id}", {"draftRevision": 1}, id="phoneme-sh")
    assert (status, rules(body)) == (400, {("body", "oneOf")})
    status, body = api.call(
        "PUT /api/admin/speech-definitions/{id}", {"draftRevision": 1, "text": "  sh\n "}, id="phoneme-sh"
    )
    assert status == 200 and body["draft"]["text"] == "sh" and "ssml" not in body["draft"]


def test_create_is_idempotent_and_lists(api: Admin) -> None:
    body = {"speechId": "word-ship", "title": "ship", "kind": "WORD"}
    first = api.call("POST /api/admin/speech-definitions", body)
    second = api.call("POST /api/admin/speech-definitions", body)
    assert first[0] == 201 and second[0] == 200 and first[1] == second[1]
    assert first[1]["draft"]["draftRevision"] == 0 and first[1]["draft"]["provider"] == "polly"
    status, listing = api.call("GET /api/admin/speech-definitions", query={"kind": "WORD"})
    assert status == 200 and [i["speechId"] for i in listing["items"]] == ["word-ship"]
    assert listing["nextCursor"] is None
    status, body = api.call("POST /api/admin/speech-definitions", {"speechId": "Bad#Id", "title": "x", "kind": "SONG"})
    assert (status, rules(body)) == (400, {("speechId", "pattern"), ("kind", "enum")})


def test_unknown_ids_are_not_found(api: Admin) -> None:
    assert api.call("GET /api/admin/speech-definitions/{id}", id="nothing-here")[0] == 404
    assert api.call("GET /api/admin/activities/{id}", id="SPEECH#x")[0] == 404
    assert api.call("POST /api/admin/activities/{id}/retire", {}, id="ph-0102")[0] == 501  # Phases 35-40


# --- Activities: draft, validate, publish --------------------------------------------------------------------------


def approve_sh(api: Admin) -> str:
    api.speech()
    api.preview("PHONEME", ssml=SH_BODY)
    status, body = api.approve("phoneme-sh", 1)
    assert status == 200
    return body["versionId"]


def test_validate_needs_the_speech_approved(api: Admin) -> None:
    api.activity()
    status, body = api.call("POST /api/admin/activities/{id}/validate", {"draftRevision": 1}, id="ph-0102")
    assert status == 200 and body["valid"] is False
    assert body["problems"] == [{"field": "speechDefinitionReferences.prompt", "rule": "speech_not_approved"}]
    approve_sh(api)
    status, body = api.call("POST /api/admin/activities/{id}/validate", {"draftRevision": 1}, id="ph-0102")
    assert (status, body["valid"], body["problems"]) == (200, True, [])


def test_publish_records_the_review_and_is_what_selection_reads(api: Admin) -> None:
    speech_version = approve_sh(api)
    api.activity()
    status, body = api.publish(1)
    assert (status, body["displayNumber"]) == (201, 1), body

    header = api.table.get_item("ACT", "ph-0102")
    assert header is not None
    assert (header["state"], header["publishedVersion"], header["fromDraftRevision"]) == (
        "PUBLISHED",
        body["versionId"],
        1,
    )
    units = read_units(api.table, 5)
    assert [(u.activity_id, u.version, u.subject) for u in units] == [("ph-0102", body["versionId"], "phonics")]
    versions = read_versions(api.table, [("ph-0102", body["versionId"])])
    version = versions[("ph-0102", body["versionId"])]
    clip = api.table.get_item("SPEECH#phoneme-sh", f"V#{speech_version}")
    assert clip is not None
    assert _clips(version) == {
        "prompt": {"speechId": "phoneme-sh", "speechVersion": speech_version, "clipKey": clip["clipKey"]}
    }
    assert version["answerSpecification"] == {"accepted": ["b"]}
    assert version["publishedBy"] == SUB and version["review"]["previewSolvedDraftRevision"] == 1
    assert len(version["definitionHash"]) == 64
    assert [a["action"] for a in api.table.query_prefix("AUDIT#2026-11", "")] == ["approve", "publish"]

    # Safe to retry: the same draftRevision returns the same version, and no second one is written.
    assert api.publish(1) == (200, body)
    assert len(api.table.query_prefix("ACT#ph-0102", "V#")) == 1


def test_publish_refuses_an_incomplete_review_or_a_stale_preview_solve(api: Admin) -> None:
    approve_sh(api)
    api.activity()
    status, body = api.publish(1, checklist={**ALL_TICKED, "noTraps": False}, solved=0)
    assert status == 400
    assert rules(body) == {
        ("review.checklist", "checklist_incomplete"),
        ("review.previewSolvedDraftRevision", "preview_solve_stale"),
    }
    assert api.publish(0)[1]["error"]["code"] == "DRAFT_CONFLICT"
    assert api.table.query_prefix("ACT#ph-0102", "V#") == []


def test_publish_refuses_unapproved_speech(api: Admin) -> None:
    api.activity()
    status, body = api.publish(1)
    assert (status, rules(body)) == (400, {("speechDefinitionReferences.prompt", "speech_not_approved")})


def test_identity_fields_lock_after_publish(api: Admin) -> None:
    approve_sh(api)
    api.activity()
    assert api.publish(1)[0] == 201
    changed = {**PH_0102, "rewardCategory": "METEOR"}
    status, body = api.call(
        "PUT /api/admin/activities/{id}/draft", {"draftRevision": 1, "definition": changed}, id="ph-0102"
    )
    assert (status, rules(body)) == (400, {("definition.rewardCategory", "locked_after_publish")})
    older = {**PH_0102, "maxAge": 5}  # ages may change between versions
    status, body = api.call(
        "PUT /api/admin/activities/{id}/draft", {"draftRevision": 1, "definition": older}, id="ph-0102"
    )
    assert status == 200 and body["draft"]["draftRevision"] == 2
    assert body["header"]["maxAge"] == 6  # the header still describes the published version until the next publish


def test_definition_checks(api: Admin) -> None:
    approve_sh(api)
    bad = {
        **PH_0102,
        "minAge": 5,
        "maxAge": 7,
        "topicId": "maths-count-objects-to10",
        "activityPayload": {"optionStyle": "GRAPHEME", "options": [{"id": "a", "text": "s"}, {"id": "a", "text": "S"}]},
        "answerSpecification": {"accepted": ["z"]},
        "additionalSteps": [],
    }
    api.activity()
    status, _ = api.call("PUT /api/admin/activities/{id}/draft", {"draftRevision": 1, "definition": bad}, id="ph-0102")
    assert status == 200  # drafts save freely
    status, body = api.call("POST /api/admin/activities/{id}/validate", {"draftRevision": 2}, id="ph-0102")
    assert status == 200 and body["valid"] is False
    assert {(p["field"], p["rule"]) for p in body["problems"]} == {("additionalSteps", "not_supported_yet")}
    del bad["additionalSteps"]
    api.call("PUT /api/admin/activities/{id}/draft", {"draftRevision": 2, "definition": bad}, id="ph-0102")
    status, body = api.call("POST /api/admin/activities/{id}/validate", {"draftRevision": 3}, id="ph-0102")
    assert {(p["field"], p["rule"]) for p in body["problems"]} == {
        ("maxAge", "age_span"),
        ("topicId", "topic_subject"),
        ("activityPayload.options", "count"),
        ("activityPayload.options.1.id", "unique_a_to_f"),
        ("activityPayload.options.1.text", "duplicate"),
        ("answerSpecification.accepted", "not_an_option"),
    }


def test_activity_list_and_versions(api: Admin) -> None:
    approve_sh(api)
    api.activity()
    status, listing = api.call("GET /api/admin/activities", query={"subject": "phonics", "ageBand": "5"})
    assert status == 200 and [(i["activityId"], i["state"]) for i in listing["items"]] == [("ph-0102", "DRAFT")]
    _, published = api.publish(1)
    status, view = api.call("GET /api/admin/activities/{id}", id="ph-0102")
    assert [v["versionId"] for v in view["versions"]] == [published["versionId"]]
    status, full = api.call("GET /api/admin/activities/{id}", id="ph-0102", query={"version": published["versionId"]})
    assert status == 200 and full["definition"]["activityId"] == "ph-0102"
    assert api.call("GET /api/admin/activities", query={"ageBand": "7"})[1]["items"] == []


def test_log_lines_carry_no_speech_text(api: Admin) -> None:
    approve_sh(api)
    text = json.dumps(api.logger.lines())
    assert "prosody" not in text and "phoneme alphabet" not in text
    assert {"approve"} <= {line.get("action") for line in api.logger.lines()}


# --- I §I.2.7: who may call (group check in the function, before any read) -----------------------------------------


CLAIMS = [
    pytest.param({"cognito__groups": None}, id="player-token-no-groups"),
    pytest.param({"cognito__groups": "[administrators]"}, id="administrators"),
    pytest.param({"cognito__groups": "[admin2]"}, id="admin2"),
    pytest.param({"cognito__groups": '["admin-x"]'}, id="admin-x"),
    pytest.param({"cognito__groups": "[admin]", "token_use": "id"}, id="id-token"),
]


@pytest.mark.parametrize("claims", CLAIMS)
@pytest.mark.parametrize("route", ADMIN_ROUTES)
def test_every_admin_route_refuses_a_non_operator_before_any_read(
    route: str, claims: dict[str, Any], player_event: dict[str, Any], recording_client: RecordingClient
) -> None:
    router = admin.make_router(
        admin.Deps(
            content=lambda: DynamoTable(recording_client, CONTENT),
            s3=lambda: recording_client,
            store=lambda: tts.AudioStore(BUCKET, PREFIX),
            config=lambda: CONFIG,
        ),
        CapturedLogger(),
    )
    event = event_for(player_event, route, **claims)
    event["pathParameters"] = {"id": "ph-0102"}
    event["body"] = json.dumps({"draftRevision": 0})
    response = (
        router.handle(event) if route in admin.ROUTES else tts.make_router(tts.Deps(), CapturedLogger()).handle(event)
    )
    assert response["statusCode"] == 403
    assert json.loads(response["body"])["error"]["code"] == "FORBIDDEN"
    assert recording_client.calls == []


def test_every_admin_route_is_behind_the_operator_authoriser() -> None:
    """A player token is refused at the gateway (401): the operator authoriser trusts only the operator pool's issuer
    and its admin client (infrastructure/main/main.tf), and routes.json puts every /api/admin route behind it."""
    assert len(ADMIN_ROUTES) == 15
    assert all(
        r["authoriser"] == "operator" and r["scope"] == "ops/content"
        for r in ROUTES
        if r["path"].startswith("/api/admin/")
    )
    main_tf = (REPO / "infrastructure" / "main" / "main.tf").read_text()
    block = main_tf[main_tf.index("operator = {", main_tf.index("authorisers = {")) :]
    block = block[: block.index("}")]
    assert "module.operator_pool.issuer" in block and "module.operator_pool.client_id" in block
    assert "player_pool" not in block
