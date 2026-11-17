"""G-8 (Phase 71): the game-data lock, in a throwaway git repository (I.2.8)."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import gamedata_lock_check as lock

TAG = "release-20261120T1000Z-abcdef0"


def run(repo: Path, *args: str) -> str:
    return lock.git(*args, cwd=repo).strip()


def commit(repo: Path, files: dict[str, str | None], message: str) -> str:
    for rel, text in files.items():
        path = repo / rel
        if text is None:
            path.unlink()
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
    run(repo, "add", "-A")
    run(repo, "commit", "-q", "-m", message)
    return run(repo, "rev-parse", "HEAD")


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    run(tmp_path, "init", "-q", "-b", "main")
    run(tmp_path, "config", "user.email", "test@example.invalid")
    run(tmp_path, "config", "user.name", "test")
    commit(
        tmp_path,
        {"game-data/ruleset/r1.json": "{}", "game-data/current.json": '{"a":1}', "game-data/README.md": "notes"},
        "seed",
    )
    run(tmp_path, "tag", TAG)
    return tmp_path


def test_added_files_pass_and_so_do_the_pointer_and_notes(repo: Path) -> None:
    commit(
        repo,
        {"game-data/ruleset/r2.json": "{}", "game-data/current.json": '{"a":2}', "game-data/README.md": "more"},
        "add",
    )
    assert lock.check("HEAD", repo) == []
    assert lock.main(["--repo", str(repo)]) == 0


@pytest.mark.parametrize(
    "change",
    [
        {"game-data/ruleset/r1.json": '{"x":1}'},
        {"game-data/ruleset/r1.json": None},
        {"contracts/golden/m1.json": "{}"},  # golden: added is fine, so add then change below
    ],
)
def test_a_released_file_changed_or_removed_fails(repo: Path, change: dict[str, str | None]) -> None:
    if "contracts/golden/m1.json" in change:
        commit(repo, change, "golden")
        run(repo, "tag", "release-20261121T1000Z-abcdef1")
        commit(repo, {"contracts/golden/m1.json": "{changed}"}, "edit golden")
    else:
        commit(repo, change, "edit")
    problems = lock.check("HEAD", repo)
    assert len(problems) == 1 and problems[0].split(": ", 1)[1][0] in "MD"
    assert lock.main(["--repo", str(repo)]) == 1
    assert lock.main(["--repo", str(repo), "--advisory"]) == 0


def test_a_rename_fails(repo: Path) -> None:
    run(repo, "mv", "game-data/ruleset/r1.json", "game-data/ruleset/r9.json")
    run(repo, "commit", "-q", "-m", "rename")
    assert any(p.split(": ", 1)[1].startswith("R") for p in lock.check("HEAD", repo))


def test_released_history_rewritten_fails(repo: Path) -> None:
    run(repo, "checkout", "-q", "--orphan", "other")
    run(repo, "rm", "-rq", "--cached", ".")
    commit(repo, {"game-data/ruleset/r1.json": "{}"}, "unrelated")
    assert any("does not descend" in p for p in lock.check("HEAD", repo))


def test_a_rollback_republishes_only_identical_files(repo: Path) -> None:
    archived = run(repo, "rev-parse", "HEAD")
    commit(repo, {"game-data/ruleset/r2.json": "{}"}, "add")
    assert lock.check("HEAD", repo, archived=archived) == []
    commit(repo, {"game-data/ruleset/r1.json": '{"x":1}'}, "edit")
    assert any("archived release" in p for p in lock.check("HEAD", repo, archived=archived))
