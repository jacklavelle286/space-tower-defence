"""Tests for scripts/publish_static.py: upload order, cache headers, content types, no --delete (plan H.8.5)."""

from __future__ import annotations

import hashlib
import io
import json
import sys
import tarfile
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import publish_static as ps  # noqa: E402

RELEASE_ID = "20261115T0905Z-101f353"
HASHED = ["assets/index-DR5M5KOV.js", "assets/index-7Y7RtU1d.css", "assets/phaser-DxDHb1dC.js",
          "assets/unkempt-latin-400-normal-xLPECJTk.woff2"]
UNHASHED = ["assets/ui/logo.svg", "assets/common/tower-1.png", "assets/common/tower-2.png"]
FILES = {"entry": ["index.html"], "hashed": HASHED, "unhashed": UNHASHED}


def make_archive(tmp_path: Path, names: list[str], extra: list[tarfile.TarInfo] | None = None) -> Path:
    """An archive shaped like the build job's: members named ./<path>, made with tar -C dist -cf - ."""
    archive = tmp_path / "player.tar.gz"
    with tarfile.open(archive, "w:gz") as tar:
        dirs = sorted({str(Path(n).parent) for n in names} - {"."})
        info = tarfile.TarInfo("."); info.type = tarfile.DIRTYPE; tar.addfile(info)
        for d in dirs:
            info = tarfile.TarInfo(f"./{d}"); info.type = tarfile.DIRTYPE; tar.addfile(info)
        for name in names:
            data = f"content of {name}".encode()
            info = tarfile.TarInfo(f"./{name}"); info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
        for info in extra or []:
            tar.addfile(info, io.BytesIO(b"x" * info.size) if info.isfile() else None)
    return archive


def manifest_for(archive: Path, files: dict[str, list[str]] = FILES) -> dict:
    sha = hashlib.sha256(archive.read_bytes()).hexdigest()
    return {"releaseId": RELEASE_ID, "static": {"player": {
        "archiveKey": f"static/{sha}/player.tar.gz", "sha256": sha, "files": files}}}


@pytest.fixture
def published(tmp_path: Path):
    archive = make_archive(tmp_path, ["index.html", *HASHED, *UNHASHED])
    commands: list[list[str]] = []
    plan = ps.publish("player", manifest_for(archive), archive, "site-bucket", RELEASE_ID, tmp_path / "work",
                      commands.append)
    return plan, commands, tmp_path / "work"


def test_order_hashed_then_unhashed_then_config_then_index_last(published):
    plan, commands, _ = published
    labels = [b.label for b in plan]
    assert labels == sorted(labels, key=["hashed", "unhashed", "config", "entry"].index)
    assert labels[-2:] == ["config", "entry"]
    assert commands[-1][3].endswith("/index.html") and commands[-1][4] == "s3://site-bucket/index.html"
    assert commands[-2][4] == "s3://site-bucket/config.json"
    assert len(commands) == len(plan)


def test_cache_headers_per_class(published):
    plan, _, _ = published
    for batch in plan:
        expected = ps.CACHE_IMMUTABLE if batch.label == "hashed" else ps.CACHE_NO_CACHE
        assert batch.cache_control == expected, batch
    assert ps.CACHE_IMMUTABLE == "public, max-age=31536000, immutable"
    hashed = {f for b in plan if b.label == "hashed" for f in b.files}
    assert hashed == set(HASHED)  # only Vite's content-hashed output is immutable; public art is not (ADR-0013)


def test_content_types_are_explicit_and_batched_by_type(published):
    plan, commands, _ = published
    for batch, cmd in zip(plan, commands):
        assert cmd[cmd.index("--content-type") + 1] == batch.content_type
        assert cmd[cmd.index("--cache-control") + 1] == batch.cache_control
        for f in batch.files:
            assert ps.content_type(f) == batch.content_type
    types = {b.files[0]: b.content_type for b in plan if len(b.files) == 1}
    assert types["index.html"] == "text/html; charset=utf-8"
    assert types["config.json"] == "application/json"
    assert ps.content_type("assets/index-DR5M5KOV.js") == "text/javascript; charset=utf-8"
    assert ps.content_type("assets/x-AAAAAAAA.woff2") == "font/woff2"
    assert ps.content_type("assets/ui/logo.svg") == "image/svg+xml"


def test_never_delete_and_never_sync(published):
    _, commands, _ = published
    for cmd in commands:
        assert cmd[:3] == ["aws", "s3", "cp"]
        assert "--delete" not in cmd and "sync" not in cmd


def test_recursive_batches_hold_exactly_their_files(published):
    plan, commands, _ = published
    for batch, cmd in zip(plan, commands):
        if "--recursive" in cmd:
            staged = Path(cmd[3])
            assert {p.relative_to(staged).as_posix() for p in staged.rglob("*") if p.is_file()} == set(batch.files)
            assert cmd[4] == "s3://site-bucket/"


def test_config_json_content(published):
    _, _, work = published
    assert json.loads((work / "site" / "config.json").read_text()) == {"apiBase": "/api", "releaseId": RELEASE_ID}


def test_unknown_extension_stops_before_any_upload(tmp_path):
    names = ["index.html", *HASHED, "assets/data.bin"]
    archive = make_archive(tmp_path, names)
    files = {"entry": ["index.html"], "hashed": HASHED, "unhashed": ["assets/data.bin"]}
    commands: list[list[str]] = []
    with pytest.raises(ps.PublishError, match="no Content-Type"):
        ps.publish("player", manifest_for(archive, files), archive, "b", RELEASE_ID, tmp_path / "w", commands.append)
    assert commands == []


def test_sha256_mismatch_refused(tmp_path):
    archive = make_archive(tmp_path, ["index.html", *HASHED, *UNHASHED])
    manifest = manifest_for(archive)
    manifest["static"]["player"]["sha256"] = "0" * 64
    with pytest.raises(ps.PublishError, match="SHA-256"):
        ps.publish("player", manifest, archive, "b", RELEASE_ID, tmp_path / "w", lambda c: None)


def test_file_not_in_manifest_refused(tmp_path):
    archive = make_archive(tmp_path, ["index.html", *HASHED, *UNHASHED, "assets/surprise.png"])
    with pytest.raises(ps.PublishError, match="not listed"):
        ps.publish("player", manifest_for(archive), archive, "b", RELEASE_ID, tmp_path / "w", lambda c: None)


def test_build_with_own_config_json_refused(tmp_path):
    archive = make_archive(tmp_path, ["index.html", "config.json", *HASHED])
    files = {"entry": ["index.html"], "hashed": HASHED, "unhashed": ["config.json"]}
    with pytest.raises(ps.PublishError, match="config.json"):
        ps.publish("player", manifest_for(archive, files), archive, "b", RELEASE_ID, tmp_path / "w", lambda c: None)


def test_wrong_release_refused(tmp_path):
    archive = make_archive(tmp_path, ["index.html", *HASHED, *UNHASHED])
    with pytest.raises(ps.PublishError, match="not"):
        ps.publish("player", manifest_for(archive), archive, "b", "20261116T0000Z-aaaaaaa", tmp_path / "w",
                   lambda c: None)


@pytest.mark.parametrize("bad", ["../escape.txt", "/etc/passwd-like.txt"])
def test_path_escape_refused(tmp_path, bad):
    info = tarfile.TarInfo(bad); info.size = 1
    archive = make_archive(tmp_path, ["index.html"], extra=[info])
    with pytest.raises(ps.PublishError, match="outside"):
        ps.safe_extract(archive, tmp_path / "out")


def test_symlink_refused(tmp_path):
    info = tarfile.TarInfo("./assets/link.js"); info.type = tarfile.SYMTYPE; info.linkname = "/etc/hosts"
    archive = make_archive(tmp_path, ["index.html"], extra=[info])
    with pytest.raises(ps.PublishError, match="not a regular file"):
        ps.safe_extract(archive, tmp_path / "out")


def test_cli_dry_run(tmp_path, capsys):
    archive = make_archive(tmp_path, ["index.html", *HASHED, *UNHASHED])
    manifest = tmp_path / "manifest.json"
    manifest.write_text(json.dumps(manifest_for(archive)))
    summary = tmp_path / "summary.json"
    rc = ps.main(["--app", "player", "--manifest", str(manifest), "--archive", str(archive), "--bucket", "b",
                  "--release-id", RELEASE_ID, "--work", str(tmp_path / "w"), "--dry-run", "--summary", str(summary)])
    assert rc == 0
    lines = [ln for ln in capsys.readouterr().out.splitlines() if ln.startswith("aws s3 cp")]
    assert lines[-1].split()[4] == "s3://b/index.html"
    assert json.loads(summary.read_text())["batches"][-1]["label"] == "entry"


def test_cli_empty_bucket_fails(tmp_path):
    assert ps.main(["--app", "player", "--manifest", "m", "--archive", "a", "--bucket", "", "--release-id", RELEASE_ID,
                    "--work", str(tmp_path)]) == 1
