"""Tests for scripts/lambda_artifacts.py: manifest -> release.tfvars.json, and the checks around it (H.8.2, H.9.1)."""

from __future__ import annotations

import base64
import hashlib
import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import lambda_artifacts  # noqa: E402

KEYS = ("player-api", "admin-api", "tts", "cognito-presignup")


def zip_bytes(key: str) -> bytes:
    return f"zip of {key}".encode()


def hex_of(key: str) -> str:
    return hashlib.sha256(zip_bytes(key)).hexdigest()


@pytest.fixture
def zips(tmp_path: Path) -> Path:
    folder = tmp_path / "lambda"
    folder.mkdir()
    for key in KEYS:
        (folder / f"{key}.zip").write_bytes(zip_bytes(key))
    return folder


@pytest.fixture
def manifest(tmp_path: Path) -> Path:
    path = tmp_path / "manifest.json"
    lambdas = {key: lambda_artifacts.entry(key, hex_of(key)) for key in KEYS}
    path.write_text(json.dumps({"schemaVersion": 2, "releaseId": "20261115T1200Z-6b9e326", "lambdas": lambdas}))
    return path


def expected_json() -> str:
    return json.dumps({key: hex_of(key) for key in KEYS})


def test_entry_is_content_addressed() -> None:
    hex_ = hex_of("tts")
    assert lambda_artifacts.entry("tts", hex_) == {
        "s3Key": f"lambda/tts/{hex_}.zip",
        "sha256": hex_,
        "sha256B64": base64.b64encode(hashlib.sha256(zip_bytes("tts")).digest()).decode(),
    }


@pytest.mark.parametrize(("key", "hex_"), [("other", "a" * 64), ("tts", "A" * 64), ("tts", "a" * 63)])
def test_entry_refuses_unknown_keys_and_bad_hashes(key: str, hex_: str) -> None:
    with pytest.raises(lambda_artifacts.ArtifactError):
        lambda_artifacts.entry(key, hex_)


def test_tfvars_from_manifest_is_deterministic(tmp_path: Path, manifest: Path) -> None:
    outs = []
    for i in range(2):
        out = tmp_path / f"r{i}.json"
        assert lambda_artifacts.main(["tfvars", "--manifest", str(manifest), "--out", str(out)]) == 0
        outs.append(out.read_bytes())
    assert outs[0] == outs[1]
    variable = json.loads(outs[0])["lambda_artifacts"]
    assert list(variable) == sorted(KEYS)
    assert variable["player-api"] == {
        "s3_key": f"lambda/player-api/{hex_of('player-api')}.zip",
        "sha256_b64": lambda_artifacts.hex_to_b64(hex_of("player-api")),
    }


def test_tfvars_refuses_a_manifest_without_lambdas(tmp_path: Path) -> None:
    """A release from before Phase 8: plan.yml and a rollback must stop with a clear message, not plan nulls."""
    old = tmp_path / "old.json"
    old.write_text(json.dumps({"schemaVersion": 1, "releaseId": "20261101T0900Z-abcdef1", "static": {}}))
    with pytest.raises(lambda_artifacts.ArtifactError, match="before Phase 8"):
        lambda_artifacts.manifest_lambdas(old)
    assert lambda_artifacts.main(["tfvars", "--manifest", str(old), "--out", str(tmp_path / "r.json")]) == 1
    assert not (tmp_path / "r.json").exists()


def test_tfvars_refuses_a_missing_or_extra_function(tmp_path: Path, manifest: Path) -> None:
    data = json.loads(manifest.read_text())
    del data["lambdas"]["tts"]
    manifest.write_text(json.dumps(data))
    with pytest.raises(lambda_artifacts.ArtifactError, match="exactly"):
        lambda_artifacts.manifest_lambdas(manifest)


def test_tfvars_refuses_a_key_not_addressed_by_its_hash(manifest: Path) -> None:
    data = json.loads(manifest.read_text())
    data["lambdas"]["tts"]["s3Key"] = "lambda/tts/latest.zip"
    manifest.write_text(json.dumps(data))
    with pytest.raises(lambda_artifacts.ArtifactError, match="content-addressed"):
        lambda_artifacts.manifest_lambdas(manifest)


def test_record_json_works_like_the_manifest(tmp_path: Path, manifest: Path) -> None:
    """apply.yml's record.json is the manifest plus plan, apply and smoke, so it gives the same variable."""
    record = tmp_path / "record.json"
    record.write_text(json.dumps({**json.loads(manifest.read_text()), "plan": {"planRunId": "1"}, "smoke": {}}))
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    assert lambda_artifacts.main(["tfvars", "--manifest", str(manifest), "--out", str(a)]) == 0
    assert lambda_artifacts.main(["tfvars", "--manifest", str(record), "--out", str(b)]) == 0
    assert a.read_bytes() == b.read_bytes()


def test_check_accepts_the_generated_file_only(tmp_path: Path, manifest: Path) -> None:
    out = tmp_path / "release.tfvars.json"
    assert lambda_artifacts.main(["tfvars", "--manifest", str(manifest), "--out", str(out)]) == 0
    assert lambda_artifacts.main(["check", "--manifest", str(manifest), "--tfvars", str(out)]) == 0

    edited = json.loads(out.read_text())
    edited["lambda_artifacts"]["tts"]["s3_key"] = "lambda/tts/other.zip"
    out.write_text(json.dumps(edited, indent=2, sort_keys=True) + "\n")
    assert lambda_artifacts.main(["check", "--manifest", str(manifest), "--tfvars", str(out)]) == 1
    assert lambda_artifacts.main(["check", "--manifest", str(manifest), "--tfvars", str(tmp_path / "none.json")]) == 1


def test_verify_build_passes_when_all_three_agree(manifest: Path, zips: Path) -> None:
    args = ["verify-build", "--manifest", str(manifest), "--zips", str(zips), "--expected", expected_json()]
    assert lambda_artifacts.main(args) == 0


def test_verify_build_catches_a_zip_changed_after_hashing(manifest: Path, zips: Path) -> None:
    (zips / "tts.zip").write_bytes(b"tampered")
    with pytest.raises(lambda_artifacts.ArtifactError, match="tts"):
        lambda_artifacts.verify_build(manifest, zips, expected_json())


def test_verify_build_catches_a_manifest_that_differs_from_the_build_step(manifest: Path, zips: Path) -> None:
    expected = json.loads(expected_json())
    expected["admin-api"] = "0" * 64
    with pytest.raises(lambda_artifacts.ArtifactError, match="admin-api"):
        lambda_artifacts.verify_build(manifest, zips, json.dumps(expected))


def test_verify_build_refuses_an_extra_zip(manifest: Path, zips: Path) -> None:
    (zips / "extra.zip").write_bytes(b"x")
    with pytest.raises(lambda_artifacts.ArtifactError, match="four zips"):
        lambda_artifacts.verify_build(manifest, zips, expected_json())


def test_objects_lists_key_and_hash(manifest: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert lambda_artifacts.main(["objects", "--manifest", str(manifest)]) == 0
    lines = capsys.readouterr().out.splitlines()
    assert f"lambda/tts/{hex_of('tts')}.zip {hex_of('tts')}" in lines
    assert len(lines) == 4
