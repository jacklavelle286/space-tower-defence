"""Tests for scripts/release_manifest.py: cache classes for publish (ADR-0013) and the rollback copy."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import release_manifest  # noqa: E402

SHA = "6b9e326" + "0" * 33
RELEASE_ID = "20261115T1200Z-6b9e326"
HASH_A = "a" * 64


def touch(root: Path, rel: str) -> None:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(rel)


@pytest.fixture
def player(tmp_path: Path) -> tuple[Path, Path]:
    """A dist/ shaped like the real player build: Vite output and art copied from public/ both under assets/."""
    public = tmp_path / "public"
    dist = tmp_path / "dist"
    for rel in ("assets/common/tower-1.png", "assets/ui/button.png"):
        touch(public, rel)
        touch(dist, rel)
    for rel in ("index.html", "assets/index-DR5M5KOV.js", "assets/phaser-DxDHb1dC.js", "assets/index-7Y7RtU1d.css",
                "assets/unkempt-latin-400-normal-xLPECJTk.woff2"):
        touch(dist, rel)
    return dist, public


def common_args(out: Path) -> list[str]:
    return ["--release-id", RELEASE_ID, "--git-sha", SHA, "--ref", "main", "--run-id", "42",
            "--actor", "owner", "--started-at", "2026-11-15T12:00:00Z", "--out", str(out)]


def test_classify_separates_vite_hashes_from_public_art(player: tuple[Path, Path]) -> None:
    dist, public = player
    groups = release_manifest.classify_dist(dist, public)
    assert groups["entry"] == ["index.html"]
    assert groups["unhashed"] == ["assets/common/tower-1.png", "assets/ui/button.png"]
    assert groups["hashed"] == [
        "assets/index-7Y7RtU1d.css",
        "assets/index-DR5M5KOV.js",
        "assets/phaser-DxDHb1dC.js",
        "assets/unkempt-latin-400-normal-xLPECJTk.woff2",
    ]


def test_public_file_with_a_hash_like_name_stays_unhashed(tmp_path: Path) -> None:
    public, dist = tmp_path / "public", tmp_path / "dist"
    touch(public, "assets/luna-1/crater-abcdefgh.png")  # looks hashed, but is a public copy
    touch(dist, "assets/luna-1/crater-abcdefgh.png")
    touch(dist, "index.html")
    assert release_manifest.classify_dist(dist, public)["unhashed"] == ["assets/luna-1/crater-abcdefgh.png"]


def test_unclassified_file_stops_the_build(player: tuple[Path, Path]) -> None:
    dist, public = player
    touch(dist, "robots.txt")  # not hashed, not in public/: publish could not pick a cache header
    with pytest.raises(release_manifest.ManifestError, match="robots.txt"):
        release_manifest.classify_dist(dist, public)


def test_build_writes_a_deterministic_manifest(tmp_path: Path, player: tuple[Path, Path]) -> None:
    dist, public = player
    outs = []
    for i in range(2):
        out = tmp_path / f"m{i}.json"
        rc = release_manifest.main(["build", *common_args(out),
                                    "--app", "player", str(dist), str(public), f"static/{HASH_A}/player.tar.gz", HASH_A])
        assert rc == 0
        outs.append(out.read_bytes())
    assert outs[0] == outs[1]
    manifest = json.loads(outs[0])
    assert manifest["releaseId"] == RELEASE_ID
    assert manifest["artefactsFrom"] is None
    assert manifest["static"]["player"]["archiveKey"] == f"static/{HASH_A}/player.tar.gz"
    assert manifest["static"]["player"]["files"]["entry"] == ["index.html"]


@pytest.mark.parametrize(
    ("key", "sha"),
    [(f"static/{'b' * 64}/player.tar.gz", HASH_A), (f"static/{HASH_A}/player.tar.gz", "not-a-hash")],
)
def test_build_refuses_a_key_not_addressed_by_its_hash(tmp_path: Path, player: tuple[Path, Path], key: str, sha: str) -> None:
    dist, public = player
    rc = release_manifest.main(["build", *common_args(tmp_path / "m.json"), "--app", "player", str(dist), str(public), key, sha])
    assert rc == 1


def test_release_id_must_match_the_commit(tmp_path: Path, player: tuple[Path, Path]) -> None:
    dist, public = player
    args = common_args(tmp_path / "m.json")
    args[1] = "20261115T1200Z-1234567"
    rc = release_manifest.main(["build", *args, "--app", "player", str(dist), str(public), f"static/{HASH_A}/p.tar.gz", HASH_A])
    assert rc == 1


def test_reuse_copies_the_archived_static_build(tmp_path: Path, player: tuple[Path, Path]) -> None:
    dist, public = player
    old = tmp_path / "old.json"
    old_args = common_args(old)
    old_args[1], old_args[3] = "20261101T0900Z-abcdef1", "abcdef1" + "0" * 33
    assert release_manifest.main(["build", *old_args,
                                  "--app", "player", str(dist), str(public), f"static/{HASH_A}/player.tar.gz", HASH_A]) == 0

    new = tmp_path / "new.json"
    rc = release_manifest.main(["reuse", *common_args(new), "--artefacts-from", "20261101T0900Z-abcdef1", "--archived", str(old)])
    assert rc == 0
    reused, archived = json.loads(new.read_text()), json.loads(old.read_text())
    assert reused["releaseId"] == RELEASE_ID
    assert reused["artefactsFrom"] == "20261101T0900Z-abcdef1"
    assert reused["static"] == archived["static"]


def test_reuse_refuses_a_manifest_for_another_release(tmp_path: Path) -> None:
    old = tmp_path / "old.json"
    old.write_text(json.dumps({"schemaVersion": 1, "releaseId": "20261101T0900Z-abcdef1", "static": {}}))
    rc = release_manifest.main(["reuse", *common_args(tmp_path / "n.json"),
                                "--artefacts-from", "20261102T0900Z-abcdef1", "--archived", str(old)])
    assert rc == 1
