"""scripts/seed_content.py on moto (Phase 20, M1-19; D §D8.6, F §12.6 C8): dry run by default, create-only, and a
second run reports "skipped, exists" without changing anything."""

from __future__ import annotations

import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Any

import pytest
from conftest import REPO

from shared.content import CHECKLIST, definition_hash, definition_problems
from shared.data import DynamoTable

CONTENT = "test-content"


def _load_script() -> Any:
    spec = importlib.util.spec_from_file_location("seed_content", REPO / "scripts" / "seed_content.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


seed_content = _load_script()


@pytest.fixture
def content(ddb: Any) -> Any:
    ddb.create_table(
        TableName=CONTENT,
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        AttributeDefinitions=[
            {"AttributeName": "pk", "AttributeType": "S"},
            {"AttributeName": "sk", "AttributeType": "S"},
        ],
        BillingMode="PAY_PER_REQUEST",
    )
    return ddb


@pytest.fixture(autouse=True)
def minimal_seed(tmp_path_factory: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch) -> Path:
    """The seed-run tests use a fixed seed folder (phoneme-sh and ph-0102 only), so the starter pack growing in
    content/seed never changes what they expect. The pack itself is checked file by file at the end."""
    seed_dir = tmp_path_factory.mktemp("minimal") / "seed"
    (seed_dir / "speech").mkdir(parents=True)
    shutil.copy(REPO / "content" / "seed" / "speech" / "phoneme-sh.json", seed_dir / "speech")
    (seed_dir / "activities").mkdir()
    shutil.copy(REPO / "content" / "seed" / "activities" / "ph-0102.json", seed_dir / "activities")
    monkeypatch.setattr(seed_content, "SEED_DIR", seed_dir)
    return seed_dir


def run(content: Any, *args: str, seed_dir: Path | None = None) -> int:
    argv = ["--table", CONTENT, *args]
    if seed_dir is not None:
        argv += ["--seed-dir", str(seed_dir)]
    return seed_content.main(argv, client_factory=lambda profile, region: content)


def items(content: Any) -> list[dict[str, Any]]:
    return sorted(content.scan(TableName=CONTENT)["Items"], key=lambda i: (i["pk"]["S"], i["sk"]["S"]))


def test_dry_run_is_the_default_and_writes_nothing(content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    assert run(content) == 0
    out = capsys.readouterr().out
    assert "DRY RUN" in out
    assert "speech phoneme-sh: would create (dry run)" in out
    assert "activity ph-0102: would create (dry run)" in out
    assert items(content) == []


def test_explicit_dry_run_flag_matches_the_default(content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    assert run(content, "--dry-run") == 0
    assert "would create (dry run)" in capsys.readouterr().out
    assert items(content) == []


def test_dry_run_and_apply_together_is_a_usage_error(content: Any) -> None:
    with pytest.raises(SystemExit) as exit_info:
        run(content, "--dry-run", "--apply")
    assert exit_info.value.code == 2
    assert items(content) == []


def test_apply_creates_drafts_then_a_second_run_skips(content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    assert run(content, "--apply") == 0
    first = capsys.readouterr().out
    assert "speech phoneme-sh: created" in first and "activity ph-0102: created" in first
    created = items(content)
    assert [(i["pk"]["S"], i["sk"]["S"]) for i in created] == [
        ("ACT", "ph-0102"),
        ("ACT#ph-0102", "DRAFT"),
        ("SPEECH", "phoneme-sh"),
        ("SPEECH#phoneme-sh", "DRAFT"),
    ]
    table = DynamoTable(content, CONTENT)
    header = table.get_item("ACT", "ph-0102")
    assert header is not None and header["state"] == "DRAFT"  # selection reads PUBLISHED only
    draft = table.get_item("SPEECH#phoneme-sh", "DRAFT")
    assert draft is not None and (draft["kind"], draft["provider"], draft["draftRevision"]) == ("PHONEME", "polly", 0)

    assert run(content, "--apply") == 0
    second = capsys.readouterr().out
    assert "speech phoneme-sh: skipped, exists" in second and "activity ph-0102: skipped, exists" in second
    assert items(content) == created  # nothing overwritten


def test_an_operator_edit_is_never_overwritten(content: Any) -> None:
    run(content, "--apply")
    table = DynamoTable(content, CONTENT)
    table.update_item(
        "SPEECH#phoneme-sh",
        "DRAFT",
        update="SET #rev = :r",
        names={"#rev": "draftRevision"},
        values={":r": 7},
    )
    run(content, "--apply")
    draft = table.get_item("SPEECH#phoneme-sh", "DRAFT")
    assert draft is not None and draft["draftRevision"] == 7


def test_the_create_is_conditional_even_if_the_read_raced(content: Any) -> None:
    """The dry-run read is only for the report: the write itself is attribute_not_exists, so an item created between
    the read and the write is still never overwritten."""
    seeds = seed_content.load_seeds(seed_content.SEED_DIR, seed_content.datetime.now(seed_content.UTC))
    table = DynamoTable(content, CONTENT)
    assert seed_content.apply_seed(table, seeds[0]) == "created"
    assert seed_content.apply_seed(table, seeds[0]) == "skipped, exists"


def test_versions_left_by_an_unfinished_delete_block_the_create(
    content: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    """Finding (review of R32): a speech delete that stopped part way leaves approved versions with no header. The
    seed must not create a header over them (they would show as its history), and it deletes nothing."""
    table = DynamoTable(content, CONTENT)
    leftover = {"pk": "SPEECH#phoneme-sh", "sk": "V#20261116T100000000Z", "speechId": "phoneme-sh"}
    table.transact_write([table.put_action(leftover, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})])

    assert run(content) == 0
    assert "speech phoneme-sh: skipped, not created: 1 approved version(s) left by an unfinished delete" in (
        capsys.readouterr().out
    )
    assert run(content, "--apply") == 0
    assert "speech phoneme-sh: skipped, not created" in capsys.readouterr().out
    assert run(content, "--apply", "--publish") == 3
    assert "speech phoneme-sh: not created" in capsys.readouterr().out
    assert table.get_item("SPEECH", "phoneme-sh") is None
    assert table.get_item("SPEECH#phoneme-sh", "V#20261116T100000000Z") is not None


def test_a_bad_seed_stops_before_any_call(tmp_path: Path, content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    seed_dir = tmp_path / "seed"
    shutil.copytree(seed_content.SEED_DIR, seed_dir)
    path = seed_dir / "activities" / "ph-0102.json"
    doc = json.loads(path.read_text())
    doc["answerSpecification"] = {"accepted": ["z"]}
    path.write_text(json.dumps(doc))
    calls: list[str] = []
    code = seed_content.main(
        ["--apply", "--seed-dir", str(seed_dir)], client_factory=lambda p, r: calls.append("client") or content
    )
    assert code == 1 and calls == []
    assert "answerSpecification.accepted.0 not_an_option" in capsys.readouterr().err


def test_a_word_only_phoneme_is_refused(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """ADR-0028: only a sound judged `word-only` is refused (G-14); no sound in the file is word-only today, so the
    verdicts are replaced for this test."""
    from shared import verdicts

    monkeypatch.setattr(verdicts, "_sounds", lambda: {"zz": {"verdict": "word-only"}})
    path = tmp_path / "phoneme-zz.json"
    path.write_text(json.dumps({"speechId": path.stem, "title": "t", "kind": "PHONEME", "text": "zz"}))
    with pytest.raises(seed_content.SeedError, match="G-14"):
        seed_content.speech_seed(path, seed_content.datetime.now(seed_content.UTC))


def test_output_names_ids_only(content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    run(content, "--apply")
    out = capsys.readouterr().out
    assert "prosody" not in out and "Listen." not in out


# --- --publish (ADR-0028) -------------------------------------------------------------------------------------------

SPEECH_VERSION = "20261101T090000Z"
CLIP = "clips/phoneme-sh-test.mp3"


def approve_speech(content: Any, speech_id: str = "phoneme-sh") -> None:
    """The items R21 leaves behind for an approved speech definition (header APPROVED + the version's clipKey)."""
    table = DynamoTable(content, CONTENT)
    header = {
        "pk": "SPEECH",
        "sk": speech_id,
        "kind": "PHONEME",
        "state": "APPROVED",
        "approvedVersion": SPEECH_VERSION,
    }
    version = {"pk": f"SPEECH#{speech_id}", "sk": f"V#{SPEECH_VERSION}", "clipKey": CLIP}
    new = {"condition": "attribute_not_exists(#pk)", "names": {"#pk": "pk"}}
    table.transact_write([table.put_action(header, **new), table.put_action(version, **new)])


def seed_copy(tmp_path: Path) -> Path:
    seed_dir = tmp_path / "seed"
    shutil.copytree(seed_content.SEED_DIR, seed_dir)
    return seed_dir


def add_activity(seed_dir: Path, activity_id: str, **changes: Any) -> None:
    doc = json.loads((seed_dir / "activities" / "ph-0102.json").read_text())
    doc.update(activityId=activity_id, **changes)
    (seed_dir / "activities" / f"{activity_id}.json").write_text(json.dumps(doc))


def keys(content: Any) -> list[tuple[str, str]]:
    return [(i["pk"]["S"], i["sk"]["S"]) for i in items(content)]


def test_publish_dry_run_writes_nothing(content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    approve_speech(content)
    before = items(content)
    assert run(content, "--dry-run", "--publish") == 0
    out = capsys.readouterr().out
    assert "activity ph-0102: would create (dry run); would publish (dry run)" in out
    assert items(content) == before


def test_publish_creates_and_publishes_like_r27(content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    approve_speech(content)
    assert run(content, "--apply", "--publish") == 0
    out = capsys.readouterr().out
    assert "activity ph-0102: created; published " in out
    assert "published: 1" in out and "failed: 0" in out
    table = DynamoTable(content, CONTENT)
    header = table.get_item("ACT", "ph-0102")
    assert header is not None and header["state"] == "PUBLISHED" and header["fromDraftRevision"] == 0
    vid = header["publishedVersion"]
    version = table.get_item("ACT#ph-0102", f"V#{vid}")
    assert version is not None
    assert version["publishedBy"] == "seed_content.py" and version["fromDraftRevision"] == 0
    assert version["review"] == {
        "checklist": dict.fromkeys(CHECKLIST, True),
        "previewSolvedDraftRevision": 0,
        "seeded": True,
        "reviewNote": "Starter pack, auto-published by seed_content.py (ADR-0028)",
    }
    assert version["speechDefinitionReferences"] == {
        "prompt": {"speechId": "phoneme-sh", "speechVersion": SPEECH_VERSION, "clipKey": CLIP}
    }
    excluded = {"pk", "sk", "review", "publishedBy", "publishedAt", "fromDraftRevision", "definitionHash"}
    body = {k: v for k, v in version.items() if k not in excluded}
    assert version["definitionHash"] == definition_hash(body) and body["version"] == vid
    audits = [i for i in keys(content) if i[0].startswith("AUDIT#")]
    assert len(audits) == 1 and audits[0][1].endswith(f"#ph-0102#publish#{vid}")
    audit = table.get_item(*audits[0])
    assert audit is not None and (audit["action"], audit["by"], audit["versionId"]) == (
        "publish",
        "seed_content.py",
        vid,
    )


def test_publish_rerun_is_a_no_op(content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    approve_speech(content)
    assert run(content, "--apply", "--publish") == 0
    after_first = items(content)
    capsys.readouterr()
    assert run(content, "--apply", "--publish") == 0
    out = capsys.readouterr().out
    assert "activity ph-0102: already published (" in out and "published: 0" in out
    assert items(content) == after_first


def test_unapproved_speech_blocks_publish_and_the_others_carry_on(
    tmp_path: Path, content: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    approve_speech(content, "phoneme-s")  # ph-0103 uses this approved clip; ph-0102's phoneme-sh is only a draft
    seed_dir = seed_copy(tmp_path)
    add_activity(seed_dir, "ph-0103", speechDefinitionReferences={"prompt": {"speechId": "phoneme-s"}})
    assert run(content, "--apply", "--publish", seed_dir=seed_dir) == 3  # phoneme-sh is only a draft
    out = capsys.readouterr().out
    assert "speechDefinitionReferences.prompt speech_not_approved" in out
    assert "activity ph-0103: created; published " in out
    table = DynamoTable(content, CONTENT)
    header = table.get_item("ACT", "ph-0102")
    assert header is not None and header["state"] == "DRAFT" and "publishedVersion" not in header
    assert not [k for k in keys(content) if k[0] == "ACT#ph-0102" and k[1].startswith("V#")]
    assert len([k for k in keys(content) if k[0].startswith("AUDIT#")]) == 1  # ph-0103's only


def test_an_invalid_definition_is_reported_and_the_others_carry_on(
    tmp_path: Path, content: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    approve_speech(content)
    seed_dir = seed_copy(tmp_path)
    add_activity(seed_dir, "ph-0104", answerSpecification={"accepted": ["z"]})
    assert run(content, "--apply", "--publish", seed_dir=seed_dir) == 3
    out = capsys.readouterr().out
    assert "activity ph-0104: answerSpecification.accepted.0 not_an_option" in out
    assert "activity ph-0102: created; published " in out
    assert "failed: 1" in out
    assert not [k for k in keys(content) if "ph-0104" in k[0] or k[1] == "ph-0104"]


def test_a_topic_rule_blocks_publish(tmp_path: Path, content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    """The full definition checks run with the header, so the registry rules apply (topic_ages here)."""
    approve_speech(content)
    seed_dir = seed_copy(tmp_path)
    add_activity(seed_dir, "ph-0105", topicId="phonics-not-a-registered-topic")
    assert run(content, "--apply", "--publish", seed_dir=seed_dir) == 3
    assert "activity ph-0105: topicId unknown_topic" in capsys.readouterr().out


def test_an_existing_different_draft_is_not_overwritten_or_published(
    content: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    approve_speech(content)
    assert run(content, "--apply") == 0  # drafts only, as before --publish existed
    table = DynamoTable(content, CONTENT)
    draft = table.get_item("ACT#ph-0102", "DRAFT")
    assert draft is not None
    edited = {**draft["definition"], "title": "An operator's own title"}
    table.update_item(
        "ACT#ph-0102",
        "DRAFT",
        update="SET #def = :d, #rev = :r",
        names={"#def": "definition", "#rev": "draftRevision"},
        values={":d": edited, ":r": 1},
    )
    before = items(content)
    capsys.readouterr()
    assert run(content, "--apply", "--publish") == 0
    out = capsys.readouterr().out
    assert "activity ph-0102: existing draft differs from the seed file: not overwritten, not published" in out
    assert items(content) == before


def test_an_existing_identical_draft_is_published(content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    approve_speech(content)
    assert run(content, "--apply") == 0
    capsys.readouterr()
    assert run(content, "--apply", "--publish") == 0
    out = capsys.readouterr().out
    assert "activity ph-0102: published " in out and "created: 0" in out


@pytest.mark.parametrize(
    "path", sorted((REPO / "content" / "seed" / "activities").glob("*.json")), ids=lambda p: p.stem
)
def test_every_seed_activity_passes_the_definition_checks(path: Path) -> None:
    """Every file in content/seed/activities (the starter pack grows here): the full C22.2 definition checks with
    the topic registry rules (no header: nothing is published yet), and the file is named after its activityId."""
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc.pop("$comment", None)
    assert doc.get("activityId") == path.stem
    assert definition_problems(doc, path.stem) == []


def test_no_picture_alt_text_names_the_answer() -> None:
    """A picture's alt text is read by screen readers and shown when the picture fails to load, so it must never
    contain an accepted option's word (D9.4: no clue gives the answer away). Single letters are skipped: they sit
    inside ordinary words."""
    leaks = []
    for path in sorted((REPO / "content" / "seed" / "activities").glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        payload = doc.get("activityPayload") or {}
        alt = str((payload.get("stimulus") or {}).get("alt", "")).lower()
        words = set(re.findall(r"[a-z']+", alt))
        texts = {o["id"]: str(o.get("text", "")).lower() for o in payload.get("options", []) if isinstance(o, dict)}
        for accepted in (doc.get("answerSpecification") or {}).get("accepted", []):
            answer = texts.get(accepted, "")
            if len(answer) > 1 and answer in words:
                leaks.append((path.stem, answer))
    assert leaks == []


PACK = REPO / "content" / "seed"


def pack_speech_refs() -> dict[str, set[str]]:
    """activityId -> the speechIds its seed file references."""
    out: dict[str, set[str]] = {}
    for path in sorted((PACK / "activities").glob("*.json")):
        refs = json.loads(path.read_text(encoding="utf-8")).get("speechDefinitionReferences", {})
        out[path.stem] = {ref["speechId"] for ref in refs.values()}
    return out


def pack_speech_ids() -> set[str]:
    return {p.stem for p in (PACK / "speech").glob("*.json")}


def test_every_referenced_speech_is_seeded_and_every_seeded_speech_is_used() -> None:
    """The owner approves clips in the admin app, so each one an activity names must arrive as a seeded draft; and a
    seeded clip no activity uses would be an approval for nothing."""
    referenced = set().union(*pack_speech_refs().values())
    assert referenced == pack_speech_ids()


def test_a_seed_speech_heard_in_the_bake_off_keeps_that_body() -> None:
    """A seed speech whose ID has a bake-off clip in content/listening-verdicts.json (phoneme-sh, phoneme-ee) uses
    exactly that clip's body, so the server's wrapper gives the clip key the owner already heard (ADR-0014)."""
    from shared import verdicts

    checked = 0
    for path in sorted((PACK / "speech").glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        sound = verdicts._sounds().get(doc["speechId"].removeprefix("phoneme-")) if doc["kind"] == "PHONEME" else None
        entry = verdicts._items().get(doc["speechId"]) or sound
        body = verdicts._clip_body(entry)
        if body is None:
            continue
        checked += 1
        assert doc.get("ssml", doc.get("text")) == body, doc["speechId"]
    assert checked >= 2


def test_the_whole_pack_would_seed_and_publish(content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    """The real content/seed folder, on moto: a plain dry run loads every seed (any bad file would stop it with exit
    1), and a publish dry run with every seeded speech approved reports nothing failed."""
    activities = sorted(pack_speech_refs())
    assert run(content, "--dry-run", seed_dir=PACK) == 0
    for speech_id in sorted(pack_speech_ids()):
        approve_speech(content, speech_id)
    capsys.readouterr()
    assert run(content, "--dry-run", "--publish", seed_dir=PACK) == 0
    out = capsys.readouterr().out
    assert "failed: 0" in out and f"published: {len(activities)}" in out
    assert all(f"activity {a}: would create (dry run); would publish (dry run)" in out for a in activities)


def test_the_pack_waits_only_for_speech_approval(content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    """With only phoneme-sh approved (production before the owner approves the new clips), every activity that names
    another clip fails with speech_not_approved and nothing else, one problem per unapproved reference, and every
    other activity would still publish."""
    refs = pack_speech_refs()
    waiting = sorted(a for a, ids in refs.items() if ids - {"phoneme-sh"})
    # Every pack activity that names a clip other than phoneme-sh: the 21 held phonics items (ADR-0028) plus the Gate I
    # batches that use new or other clips. Counted from the pack, so a new batch does not need this number edited.
    assert len(waiting) >= 21
    approve_speech(content)
    capsys.readouterr()
    assert run(content, "--dry-run", "--publish", seed_dir=PACK) == 3
    out = capsys.readouterr().out
    assert f"failed: {len(waiting)}" in out and f"published: {len(refs) - len(waiting)}" in out
    seeds = {
        p.stem: json.loads(p.read_text(encoding="utf-8"))["speechDefinitionReferences"]
        for p in (PACK / "activities").glob("*.json")
    }
    for activity_id in waiting:
        unapproved = sorted(v for v, ref in seeds[activity_id].items() if ref["speechId"] != "phoneme-sh")
        shown = ", ".join(f"speechDefinitionReferences.{v} speech_not_approved" for v in unapproved)
        assert f"activity {activity_id}: would create (dry run); {shown} (dry run)" in out


def test_approving_the_speech_publishes_the_waiting_activities(
    content: Any, capsys: pytest.CaptureFixture[str]
) -> None:
    """The owner's flow: seed (the waiting activities fail), approve their clips in the app, run the seed again: the
    identical drafts are published and nothing else changes."""
    approve_speech(content)
    assert run(content, "--apply", "--publish", seed_dir=PACK) == 3
    for speech_id in sorted(pack_speech_ids() - {"phoneme-sh"}):
        table = DynamoTable(content, CONTENT)
        table.update_item(
            "SPEECH",
            speech_id,
            update="SET #s = :s, #v = :v",
            names={"#s": "state", "#v": "approvedVersion"},
            values={":s": "APPROVED", ":v": SPEECH_VERSION},
        )
        version = {"pk": f"SPEECH#{speech_id}", "sk": f"V#{SPEECH_VERSION}", "clipKey": f"clips/{speech_id}.mp3"}
        table.transact_write([table.put_action(version, condition="attribute_not_exists(#pk)", names={"#pk": "pk"})])
    capsys.readouterr()
    assert run(content, "--apply", "--publish", seed_dir=PACK) == 0
    out = capsys.readouterr().out
    waiting = [a for a, ids in pack_speech_refs().items() if ids - {"phoneme-sh"}]
    assert "failed: 0" in out and f"published: {len(waiting)}" in out
    table = DynamoTable(content, CONTENT)
    header = table.get_item("ACT", "ph-1019")
    assert header is not None and header["state"] == "PUBLISHED"
    version = table.get_item("ACT#ph-1019", f"V#{header['publishedVersion']}")
    assert version is not None
    assert version["speechDefinitionReferences"] == {
        "prompt": {"speechId": "word-zub", "speechVersion": SPEECH_VERSION, "clipKey": "clips/word-zub.mp3"}
    }
