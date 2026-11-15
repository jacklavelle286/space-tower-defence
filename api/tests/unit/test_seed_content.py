"""scripts/seed_content.py on moto (Phase 20, M1-19; D §D8.6, F §12.6 C8): dry run by default, create-only, and a
second run reports "skipped, exists" without changing anything."""

from __future__ import annotations

import importlib.util
import json
import shutil
import sys
from pathlib import Path
from typing import Any

import pytest
from conftest import REPO

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
    seeds = seed_content.load_seeds(REPO / "content" / "seed", seed_content.datetime.now(seed_content.UTC))
    table = DynamoTable(content, CONTENT)
    assert seed_content.apply_seed(table, seeds[0]) == "created"
    assert seed_content.apply_seed(table, seeds[0]) == "skipped, exists"


def test_a_bad_seed_stops_before_any_call(tmp_path: Path, content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    seed_dir = tmp_path / "seed"
    shutil.copytree(REPO / "content" / "seed", seed_dir)
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


def test_a_phoneme_without_a_publishable_verdict_is_refused(tmp_path: Path) -> None:
    verdicts = json.loads((REPO / "content" / "listening-verdicts.json").read_text())["sounds"]
    refused = sorted(s for s, v in verdicts.items() if v["verdict"] not in ("publishable", "publishable-small-schwa"))
    path = tmp_path / f"phoneme-{refused[0]}.json"
    path.write_text(json.dumps({"speechId": path.stem, "title": "t", "kind": "PHONEME", "text": refused[0]}))
    with pytest.raises(seed_content.SeedError, match="G-14"):
        seed_content.speech_seed(path, seed_content.datetime.now(seed_content.UTC))


def test_output_names_ids_only(content: Any, capsys: pytest.CaptureFixture[str]) -> None:
    run(content, "--apply")
    out = capsys.readouterr().out
    assert "prosody" not in out and "Listen." not in out
