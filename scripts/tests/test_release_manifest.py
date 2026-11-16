"""Tests for scripts/release_manifest.py: cache classes for publish (ADR-0013) and the rollback copy."""

from __future__ import annotations

import base64
import hashlib
import json
import re
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


@pytest.fixture
def zips(tmp_path: Path) -> list[str]:
    """The five Lambda zips, as --lambda arguments (contents need not be real zips: only their hashes matter)."""
    folder = tmp_path / "lambda"
    folder.mkdir()
    args: list[str] = []
    for key in ("player-api", "admin-api", "tts", "cognito-presignup", "picture-gen"):
        (folder / f"{key}.zip").write_bytes(f"zip of {key}".encode())
        args += ["--lambda", key, str(folder / f"{key}.zip")]
    return args


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


def test_build_writes_a_deterministic_manifest(tmp_path: Path, player: tuple[Path, Path], zips: list[str]) -> None:
    dist, public = player
    outs = []
    for i in range(2):
        out = tmp_path / f"m{i}.json"
        rc = release_manifest.main(["build", *common_args(out), *zips,
                                    "--app", "player", str(dist), str(public), f"static/{HASH_A}/player.tar.gz", HASH_A])
        assert rc == 0
        outs.append(out.read_bytes())
    assert outs[0] == outs[1]
    manifest = json.loads(outs[0])
    assert manifest["releaseId"] == RELEASE_ID
    assert manifest["artefactsFrom"] is None
    assert manifest["static"]["player"]["archiveKey"] == f"static/{HASH_A}/player.tar.gz"
    assert manifest["static"]["player"]["files"]["entry"] == ["index.html"]
    assert manifest["schemaVersion"] == 2
    tts_hex = hashlib.sha256(b"zip of tts").hexdigest()
    assert manifest["lambdas"]["tts"] == {
        "s3Key": f"lambda/tts/{tts_hex}.zip",
        "sha256": tts_hex,
        "sha256B64": base64.b64encode(bytes.fromhex(tts_hex)).decode(),
    }
    assert sorted(manifest["lambdas"]) == ["admin-api", "cognito-presignup", "picture-gen", "player-api", "tts"]


def test_build_needs_all_five_lambda_zips(tmp_path: Path, player: tuple[Path, Path], zips: list[str]) -> None:
    dist, public = player
    app = ["--app", "player", str(dist), str(public), f"static/{HASH_A}/player.tar.gz", HASH_A]
    assert release_manifest.main(["build", *common_args(tmp_path / "m.json"), *zips[:-3], *app]) == 1
    assert release_manifest.main(["build", *common_args(tmp_path / "m.json"), *app]) == 1
    unknown = [*zips[:-3], "--lambda", "other-fn", zips[-1]]
    assert release_manifest.main(["build", *common_args(tmp_path / "m.json"), *unknown, *app]) == 1


@pytest.mark.parametrize(
    ("key", "sha"),
    [(f"static/{'b' * 64}/player.tar.gz", HASH_A), (f"static/{HASH_A}/player.tar.gz", "not-a-hash")],
)
def test_build_refuses_a_key_not_addressed_by_its_hash(
    tmp_path: Path, player: tuple[Path, Path], zips: list[str], key: str, sha: str
) -> None:
    dist, public = player
    rc = release_manifest.main(["build", *common_args(tmp_path / "m.json"), *zips,
                                "--app", "player", str(dist), str(public), key, sha])
    assert rc == 1


def test_release_id_must_match_the_commit(tmp_path: Path, player: tuple[Path, Path], zips: list[str]) -> None:
    dist, public = player
    args = common_args(tmp_path / "m.json")
    args[1] = "20261115T1200Z-1234567"
    rc = release_manifest.main(["build", *args, *zips, "--app", "player", str(dist), str(public), f"static/{HASH_A}/p.tar.gz", HASH_A])
    assert rc == 1


def test_reuse_copies_the_archived_static_build(tmp_path: Path, player: tuple[Path, Path], zips: list[str]) -> None:
    dist, public = player
    old = tmp_path / "old.json"
    old_args = common_args(old)
    old_args[1], old_args[3] = "20261101T0900Z-abcdef1", "abcdef1" + "0" * 33
    assert release_manifest.main(["build", *old_args, *zips,
                                  "--app", "player", str(dist), str(public), f"static/{HASH_A}/player.tar.gz", HASH_A]) == 0

    new = tmp_path / "new.json"
    rc = release_manifest.main(["reuse", *common_args(new), "--artefacts-from", "20261101T0900Z-abcdef1", "--archived", str(old)])
    assert rc == 0
    reused, archived = json.loads(new.read_text()), json.loads(old.read_text())
    assert reused["releaseId"] == RELEASE_ID
    assert reused["artefactsFrom"] == "20261101T0900Z-abcdef1"
    assert reused["static"] == archived["static"]
    assert reused["lambdas"] == archived["lambdas"]


def test_reuse_refuses_a_release_from_before_lambda_zips(tmp_path: Path) -> None:
    """A schemaVersion 1 manifest (Phases 4-7) names no Lambda zips; current Terraform needs them."""
    old = tmp_path / "old.json"
    old.write_text(json.dumps({"schemaVersion": 1, "releaseId": "20261101T0900Z-abcdef1",
                               "static": {"player": {"archiveKey": f"static/{HASH_A}/player.tar.gz", "sha256": HASH_A,
                                                     "files": {"entry": ["index.html"]}}}}))
    rc = release_manifest.main(["reuse", *common_args(tmp_path / "n.json"),
                                "--artefacts-from", "20261101T0900Z-abcdef1", "--archived", str(old)])
    assert rc == 1
    assert not (tmp_path / "n.json").exists()


def test_reuse_refuses_a_manifest_for_another_release(tmp_path: Path) -> None:
    old = tmp_path / "old.json"
    old.write_text(json.dumps({"schemaVersion": 1, "releaseId": "20261101T0900Z-abcdef1", "static": {}}))
    rc = release_manifest.main(["reuse", *common_args(tmp_path / "n.json"),
                                "--artefacts-from", "20261102T0900Z-abcdef1", "--archived", str(old)])
    assert rc == 1


def test_classify_game_data_into_its_own_groups(player: tuple[Path, Path]) -> None:
    """Phase 13: build-bounds.ts writes game-data/ into the player's dist/; publish uploads it create-only (H.8.5)."""
    dist, public = player
    for rel in ("game-data/ruleset/r1.json", "game-data/campaign/luna-1-c1.json", "game-data/bounds/r1__luna-1-c1.json",
                "game-data/current.json"):
        touch(dist, rel)
    groups = release_manifest.classify_dist(dist, public)
    assert groups["gameData"] == ["game-data/bounds/r1__luna-1-c1.json", "game-data/campaign/luna-1-c1.json",
                                  "game-data/ruleset/r1.json"]
    assert groups["gameDataCurrent"] == ["game-data/current.json"]
    assert not any(p.startswith("game-data/") for p in groups["hashed"] + groups["unhashed"])


def test_build_without_game_data_has_empty_game_data_groups(player: tuple[Path, Path]) -> None:
    dist, public = player
    groups = release_manifest.classify_dist(dist, public)
    assert groups["gameData"] == [] and groups["gameDataCurrent"] == []


@pytest.mark.parametrize(
    "rel",
    ["game-data/ruleset/R1.json", "game-data/ruleset/r_1.json", "game-data/bounds/r1.json", "game-data/notes.txt",
     "game-data/sounds/r1.json", "game-data/ruleset/r1.json.bak"],
)
def test_game_data_path_that_is_not_a_version_stops_the_build(player: tuple[Path, Path], rel: str) -> None:
    dist, public = player
    touch(dist, "game-data/current.json")
    touch(dist, "game-data/ruleset/r1.json")
    touch(dist, rel)
    with pytest.raises(release_manifest.ManifestError, match=re.escape(rel)):
        release_manifest.classify_dist(dist, public)


def test_game_data_without_current_json_stops_the_build(player: tuple[Path, Path]) -> None:
    dist, public = player
    touch(dist, "game-data/ruleset/r1.json")
    with pytest.raises(release_manifest.ManifestError, match="current.json"):
        release_manifest.classify_dist(dist, public)


def test_game_data_version_pattern_matches_the_limits_file() -> None:
    # release_manifest.py is standard-library only and runs before anything is installed, so it keeps its own copy
    # of the game-data version pattern; this keeps the copy equal to the one source.
    limits = json.loads((SCRIPTS.parent / "contracts" / "limits.json").read_text(encoding="utf-8"))
    assert f"^{release_manifest._VERSION}$" == limits["gameData"]["versionPattern"]
