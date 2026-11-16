#!/usr/bin/env python3
"""Lambda zips in a release: manifest entries, `release.tfvars.json` and its checks (plan H.8.2, H.8.7, H.9.1).

Terraform owns Lambda code (H.9.1): each function's `s3_key` and hash come from the variable `lambda_artifacts`, and
the release manifest is the only thing that feeds it. This module turns the manifest's `lambdas` section into that
variable, so every job that needs it (release plan, apply check, drift check) derives the same bytes from the same
manifest.

Manifest entry, per function key (written by scripts/release_manifest.py):
    "lambdas": {"player-api": {"s3Key": "lambda/player-api/<hex>.zip", "sha256": "<hex>", "sha256B64": "<base64>"}, ...}

`release.tfvars.json` (the shape of `variable "lambda_artifacts"` in infrastructure/main/variables.tf):
    {"lambda_artifacts": {"player-api": {"s3_key": "lambda/player-api/<hex>.zip", "sha256_b64": "<base64>"}, ...}}
`sha256_b64` is the form Lambda reports as CodeSha256 and the form `source_code_hash` expects.

Commands:
  tfvars       --manifest M --out F          write release.tfvars.json from a manifest (or a record.json)
  check        --manifest M --tfvars F       exit 1 unless F is exactly what `tfvars` would write for M
  verify-build --manifest M --zips DIR --expected JSON
                                             the zips in DIR, the manifest and the build step's hashes all agree
  objects      --manifest M                  print "<s3Key> <sha256 hex>" per function (for S3 checks)

Standard library only; runs on Python 3.12 and 3.14.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import sys
from pathlib import Path
from typing import Any

# The five functions (plan H.4.4; picture-gen from Phase 42b, ADR-0031); scripts/build_lambdas.py writes
# build/<key>.zip for each. A release from before Phase 42b has four and cannot be reused (artefacts_from) by current
# Terraform, which needs all five.
LAMBDA_KEYS = ("admin-api", "cognito-presignup", "picture-gen", "player-api", "tts")
SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")


class ArtifactError(Exception):
    """Input that would give Terraform wrong or unusable Lambda keys."""


def s3_key(key: str, sha256_hex: str) -> str:
    return f"lambda/{key}/{sha256_hex}.zip"


def hex_to_b64(sha256_hex: str) -> str:
    return base64.b64encode(bytes.fromhex(sha256_hex)).decode("ascii")


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def entry(key: str, sha256_hex: str) -> dict[str, str]:
    """The manifest entry for one function."""
    if key not in LAMBDA_KEYS:
        raise ArtifactError(f"unknown Lambda key {key!r} (expected one of {', '.join(LAMBDA_KEYS)})")
    if not SHA256_HEX.match(sha256_hex):
        raise ArtifactError(f"{key}: not a lowercase hex SHA-256: {sha256_hex!r}")
    return {"s3Key": s3_key(key, sha256_hex), "sha256": sha256_hex, "sha256B64": hex_to_b64(sha256_hex)}


def check_lambdas(lambdas: Any, where: str = "manifest") -> dict[str, dict[str, str]]:
    """A complete, self-consistent `lambdas` section: exactly LAMBDA_KEYS, each content-addressed."""
    if lambdas is None:
        raise ArtifactError(
            f"the {where} has no Lambda zips (a release from before Phase 8); "
            "release or roll back to a release that has them"
        )
    if not isinstance(lambdas, dict):
        raise ArtifactError(f"the {where}'s lambdas section is not an object")
    if sorted(lambdas) != sorted(LAMBDA_KEYS):
        raise ArtifactError(f"the {where} lists Lambda keys {sorted(lambdas)}, expected exactly {list(LAMBDA_KEYS)}")
    for key, value in lambdas.items():
        if not isinstance(value, dict):
            raise ArtifactError(f"the {where}'s {key} entry is not an object")
        want = entry(key, str(value.get("sha256")))
        if value != want:
            raise ArtifactError(f"the {where}'s {key} entry is not content-addressed: {value} (expected {want})")
    return {key: lambdas[key] for key in sorted(lambdas)}


def load_json(path: Path, what: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ArtifactError(f"cannot read the {what} {path}: {exc}") from exc


def manifest_lambdas(manifest_path: Path) -> dict[str, dict[str, str]]:
    manifest = load_json(manifest_path, "manifest")
    if not isinstance(manifest, dict):
        raise ArtifactError(f"{manifest_path} is not a JSON object")
    where = f"manifest of release {manifest.get('releaseId', '?')}"
    return check_lambdas(manifest.get("lambdas"), where)


def tfvars(lambdas: dict[str, dict[str, str]]) -> dict[str, Any]:
    return {
        "lambda_artifacts": {
            key: {"s3_key": value["s3Key"], "sha256_b64": value["sha256B64"]} for key, value in sorted(lambdas.items())
        }
    }


def render(document: Any) -> str:
    """Deterministic JSON: the same manifest always gives the same bytes (and so the same SHA-256)."""
    return json.dumps(document, indent=2, sort_keys=True) + "\n"


def verify_build(manifest_path: Path, zips: Path, expected_json: str) -> dict[str, dict[str, str]]:
    """Fresh build: every zip on disk, the manifest and the build step's own hashes agree, key for key."""
    lambdas = manifest_lambdas(manifest_path)
    try:
        expected = json.loads(expected_json)
    except json.JSONDecodeError as exc:
        raise ArtifactError(f"--expected is not JSON: {exc}") from exc
    if not isinstance(expected, dict) or sorted(expected) != sorted(LAMBDA_KEYS):
        named = sorted(expected) if isinstance(expected, dict) else expected
        raise ArtifactError(f"the build step's hashes name {named!r}, expected {list(LAMBDA_KEYS)}")
    on_disk = sorted(p.name for p in zips.glob("*.zip")) if zips.is_dir() else []
    if on_disk != sorted(f"{key}.zip" for key in LAMBDA_KEYS):
        want = sorted(f"{key}.zip" for key in LAMBDA_KEYS)
        raise ArtifactError(f"{zips} holds {on_disk}, expected exactly the {len(LAMBDA_KEYS)} zips {want}")
    for key, value in lambdas.items():
        actual = file_sha256(zips / f"{key}.zip")
        if not (actual == value["sha256"] == expected[key]):
            raise ArtifactError(
                f"{key}: zip {actual}, manifest {value['sha256']}, build step {expected[key]} (all three must match)"
            )
    return lambdas


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Lambda zips in a release (plan H.8.2, H.8.7).")
    sub = parser.add_subparsers(dest="command", required=True)
    p_tfvars = sub.add_parser("tfvars", help="write release.tfvars.json from a manifest")
    p_tfvars.add_argument("--manifest", type=Path, required=True)
    p_tfvars.add_argument("--out", type=Path, required=True)
    p_check = sub.add_parser("check", help="a release.tfvars.json matches its manifest exactly")
    p_check.add_argument("--manifest", type=Path, required=True)
    p_check.add_argument("--tfvars", type=Path, required=True)
    p_verify = sub.add_parser("verify-build", help="zips, manifest and build-step hashes agree")
    p_verify.add_argument("--manifest", type=Path, required=True)
    p_verify.add_argument("--zips", type=Path, required=True)
    p_verify.add_argument("--expected", required=True, help='JSON object {"<key>": "<sha256 hex>", ...}')
    p_objects = sub.add_parser("objects", help='print "<s3Key> <sha256 hex>" per function')
    p_objects.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args(argv)

    try:
        if args.command == "tfvars":
            lambdas = manifest_lambdas(args.manifest)
            args.out.write_text(render(tfvars(lambdas)), encoding="utf-8")
            for key, value in lambdas.items():
                print(f"lambda_artifacts: {key}: {value['s3Key']}")
        elif args.command == "check":
            want = render(tfvars(manifest_lambdas(args.manifest)))
            try:
                got = args.tfvars.read_text(encoding="utf-8")
            except OSError as exc:
                raise ArtifactError(f"cannot read {args.tfvars}: {exc}") from exc
            if got != want:
                raise ArtifactError(f"{args.tfvars} is not the lambda_artifacts that {args.manifest} gives")
            print(f"lambda_artifacts: {args.tfvars} matches {args.manifest}")
        elif args.command == "verify-build":
            for key, value in verify_build(args.manifest, args.zips, args.expected).items():
                print(f"lambda_artifacts: {key}.zip verified, SHA-256 {value['sha256']}")
        else:
            for value in manifest_lambdas(args.manifest).values():
                print(f"{value['s3Key']} {value['sha256']}")
    except ArtifactError as exc:
        print(f"lambda_artifacts: error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
