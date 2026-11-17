#!/usr/bin/env python3
"""G-8: the game-data and golden lock (plan H.10, spine S11.4; Phase 71).

Published game data is immutable: a run pins its ruleset, planet document, bounds and asset manifest by version, so a
version once released must never change or disappear. Against the last release tag `release-<id>`:

  1. `ref` descends from it (`git merge-base --is-ancestor`), so nothing released is rewritten;
  2. since it, files under game-data/ and contracts/golden/ were only added: no modification, deletion or rename
     (`git diff --diff-filter=MDR`). Locked: every game-data/**/*.json except the pointer game-data/current.json (the
     publisher owns it after LD6; the release writes it only when absent or on reseed), and everything in
     contracts/golden/. game-data's notes (README.md) are documentation, not data.
  3. With --archived <sha> (a rollback, `artefacts_from`, H.12): the same rule from the archived release's commit to
     `ref`, so every game-data file the rollback re-publishes is byte-identical to the same path at `ref`.

Before the data freeze (Phase 74) it runs --advisory: it reports, and the release goes on. From the freeze
(infrastructure/plan-guard.json "enforce": true) a finding stops the release.

Standard library only; needs the repository's history and tags (actions/checkout fetch-depth: 0).
"""

from __future__ import annotations

import argparse
import re
import shutil
import subprocess
import sys
from pathlib import Path

TAG = re.compile(r"^release-[0-9]{8}T[0-9]{4}Z-[0-9a-f]{7}$")
LOCKED_DIRS = ("game-data/", "contracts/golden/")
UNLOCKED = {"game-data/current.json"}
GIT = shutil.which("git") or "git"


def git(*args: str, cwd: Path) -> str:
    return subprocess.run([GIT, *args], cwd=cwd, check=True, capture_output=True, text=True).stdout  # noqa: S603 - fixed arguments, no shell


def locked(path: str) -> bool:
    if path in UNLOCKED:
        return False
    if path.startswith("contracts/golden/"):
        return True
    return path.startswith("game-data/") and path.endswith(".json")


def last_release_tag(cwd: Path) -> str | None:
    """The newest release tag (release IDs sort by time)."""
    tags = sorted(t for t in git("tag", "--list", "release-*", cwd=cwd).split() if TAG.match(t))
    return tags[-1] if tags else None


def changed_locked(base: str, ref: str, cwd: Path) -> list[str]:
    """Locked files modified, deleted or renamed from `base` to `ref` ("M path", "D path", "R100 old -> new")."""
    out = git("diff", "--name-status", "--diff-filter=MDR", f"{base}..{ref}", "--", *LOCKED_DIRS, cwd=cwd)
    found = []
    for line in out.splitlines():
        status, *paths = line.split("\t")
        if any(locked(p) for p in paths):
            found.append(f"{status} {' -> '.join(paths)}")
    return found


def check(ref: str, cwd: Path, archived: str | None = None, tag: str | None = None) -> list[str]:
    """Every finding (empty: the lock holds)."""
    problems: list[str] = []
    tag = tag or last_release_tag(cwd)
    if tag is None:
        return ["no release-* tag: nothing has been released to lock against"] if archived else []
    try:
        git("merge-base", "--is-ancestor", tag, ref, cwd=cwd)
    except subprocess.CalledProcessError:
        problems.append(f"{ref} does not descend from {tag}: released history was rewritten")
    else:
        problems += [f"since {tag}: {c}" for c in changed_locked(tag, ref, cwd)]
    if archived is not None:
        problems += [f"since the archived release {archived}: {c}" for c in changed_locked(archived, ref, cwd)]
    return problems


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--ref", default="HEAD")
    ap.add_argument("--tag", help="the release tag to lock against (default: the newest release-* tag)")
    ap.add_argument("--archived", help="a rollback: the archived release's commit (its release ID's SHA)")
    ap.add_argument("--advisory", action="store_true", help="report only (before the data freeze)")
    ap.add_argument("--repo", type=Path, default=Path.cwd())
    args = ap.parse_args(argv)
    problems = check(args.ref, args.repo, args.archived, args.tag)
    if not problems:
        print("G-8: the game-data lock holds (only added files since the last release)")
        return 0
    for p in problems:
        print(f"{'::warning::' if args.advisory else '::error::'}G-8 {p}")
    return 0 if args.advisory else 1


if __name__ == "__main__":
    sys.exit(main())
