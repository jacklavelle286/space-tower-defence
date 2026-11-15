#!/usr/bin/env python3
"""Release manifest, build part (plan H.8.2 step 2, H.8.7).

`build`  writes the manifest for a fresh build. For each app it records the static archive (key and SHA-256) and
         sorts every file in the app's dist/ into one of three groups, so the publish step (Phase 4, H.8.5) can set
         cache headers without guessing:
           entry     index.html                                   -> no-cache, uploaded last
           hashed    Vite's content-hashed output (assets/*-<hash>.<ext>)  -> immutable
           unhashed  files copied unchanged from the app's public/ dir     -> no-cache (ADR-0013, until Phase 64)
         Any other file stops the build: an unclassified file cannot be given a safe cache header.
`reuse`  writes the manifest for a rollback (`artefacts_from`, H.12): it copies the static entries of an archived
         release's manifest, so nothing is rebuilt.

The output is deterministic (sorted keys and lists, no timestamps of its own), so re-running the build job of the
same release writes the same bytes and the create-only upload accepts it.

Standard library only; runs on Python 3.12 and 3.14.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

SCHEMA_VERSION = 1
RELEASE_ID = re.compile(r"^[0-9]{8}T[0-9]{4}Z-[0-9a-f]{7}$")
SHA256_HEX = re.compile(r"^[0-9a-f]{64}$")
# Vite's default asset name is assets/[name]-[hash].[ext]; Vite 8 (Rolldown) hashes are 8 URL-safe characters.
VITE_HASHED = re.compile(r"^assets/.+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$")
ENTRY_FILES = frozenset({"index.html"})


class ManifestError(Exception):
    """Input that would make a wrong or unusable manifest."""


def classify_dist(dist: Path, public: Path | None) -> dict[str, list[str]]:
    """Sort every file under dist/ into entry, hashed and unhashed (paths relative to dist, with '/')."""
    if not dist.is_dir():
        raise ManifestError(f"{dist} is not a directory (was the app built?)")
    public_files: set[str] = set()
    if public is not None and public.is_dir():
        public_files = {p.relative_to(public).as_posix() for p in public.rglob("*") if p.is_file()}

    groups: dict[str, list[str]] = {"entry": [], "hashed": [], "unhashed": []}
    unknown: list[str] = []
    for path in sorted(p for p in dist.rglob("*") if p.is_file()):
        rel = path.relative_to(dist).as_posix()
        if rel in ENTRY_FILES:
            groups["entry"].append(rel)
        elif rel in public_files:  # checked first: a public file is never treated as hashed, whatever its name
            groups["unhashed"].append(rel)
        elif VITE_HASHED.match(rel):
            groups["hashed"].append(rel)
        else:
            unknown.append(rel)
    if unknown:
        listed = ", ".join(unknown[:10]) + (" …" if len(unknown) > 10 else "")
        raise ManifestError(
            f"{dist}: {len(unknown)} file(s) are neither index.html, a Vite content-hashed asset nor a copy from "
            f"public/, so no safe cache header can be chosen: {listed}"
        )
    if not groups["entry"]:
        raise ManifestError(f"{dist}: no index.html")
    return groups


def check_sha256(value: str, what: str) -> str:
    if not SHA256_HEX.match(value):
        raise ManifestError(f"{what} is not a lowercase hex SHA-256: {value!r}")
    return value


def check_release_id(value: str, what: str) -> str:
    if not RELEASE_ID.match(value):
        raise ManifestError(f"{what} is not a release ID (<yyyymmddThhmmZ>-<sha7>): {value!r}")
    return value


def base_manifest(args: argparse.Namespace, artefacts_from: str | None) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9a-f]{40}", args.git_sha):
        raise ManifestError(f"--git-sha must be a full 40-character commit SHA: {args.git_sha!r}")
    release_id = check_release_id(args.release_id, "--release-id")
    if not release_id.endswith("-" + args.git_sha[:7]):
        raise ManifestError(f"--release-id {release_id} does not end with the commit's short SHA {args.git_sha[:7]}")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "releaseId": release_id,
        "gitSha": args.git_sha,
        "ref": args.ref,
        "artefactsFrom": artefacts_from,
        "releaseRunId": args.run_id,
        "actor": args.actor,
        "startedAt": args.started_at,
    }


def build(args: argparse.Namespace) -> dict[str, Any]:
    manifest = base_manifest(args, artefacts_from=None)
    static: dict[str, Any] = {}
    for name, dist, public, archive_key, sha256 in args.app:
        if name in static:
            raise ManifestError(f"app {name!r} given twice")
        check_sha256(sha256, f"{name} archive SHA-256")
        if f"/{sha256}/" not in archive_key:
            raise ManifestError(f"{name}: archive key {archive_key!r} is not addressed by its SHA-256")
        static[name] = {
            "archiveKey": archive_key,
            "sha256": sha256,
            "files": classify_dist(Path(dist), Path(public) if public != "-" else None),
        }
    if not static:
        raise ManifestError("no --app given")
    manifest["static"] = static
    return manifest


def reuse(args: argparse.Namespace) -> dict[str, Any]:
    try:
        archived = json.loads(Path(args.archived).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestError(f"cannot read the archived manifest {args.archived}: {exc}") from exc
    source_id = check_release_id(args.artefacts_from, "--artefacts-from")
    if not isinstance(archived, dict) or archived.get("releaseId") != source_id:
        raise ManifestError(f"the archived manifest is not for release {source_id}")
    if archived.get("schemaVersion") != SCHEMA_VERSION:
        raise ManifestError(f"the archived manifest has schemaVersion {archived.get('schemaVersion')!r}, expected {SCHEMA_VERSION}")
    static = archived.get("static")
    if not isinstance(static, dict) or not static:
        raise ManifestError("the archived manifest has no static archives")
    for name, entry in static.items():
        check_sha256(str(entry.get("sha256")), f"archived {name} SHA-256")
        if not isinstance(entry.get("archiveKey"), str) or not isinstance(entry.get("files"), dict):
            raise ManifestError(f"archived {name} entry is incomplete")
    manifest = base_manifest(args, artefacts_from=source_id)
    manifest["static"] = static
    return manifest


def main(argv: list[str] | None = None) -> int:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--release-id", required=True)
    common.add_argument("--git-sha", required=True)
    common.add_argument("--ref", required=True)
    common.add_argument("--run-id", required=True)
    common.add_argument("--actor", required=True)
    common.add_argument("--started-at", required=True)
    common.add_argument("--out", type=Path, required=True)

    parser = argparse.ArgumentParser(description="Write the build part of a release manifest (plan H.8.7).")
    sub = parser.add_subparsers(dest="command", required=True)
    p_build = sub.add_parser("build", parents=[common], help="manifest for a fresh build")
    p_build.add_argument(
        "--app",
        nargs=5,
        action="append",
        default=[],
        metavar=("NAME", "DIST", "PUBLIC", "ARCHIVE_KEY", "SHA256"),
        help="one app; PUBLIC is its public/ dir, or - if it has none",
    )
    p_reuse = sub.add_parser("reuse", parents=[common], help="manifest for a rollback (artefacts_from)")
    p_reuse.add_argument("--artefacts-from", required=True)
    p_reuse.add_argument("--archived", required=True, help="the archived release's manifest.json")
    args = parser.parse_args(argv)

    try:
        manifest = build(args) if args.command == "build" else reuse(args)
    except ManifestError as exc:
        print(f"release_manifest: error: {exc}", file=sys.stderr)
        return 1
    args.out.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    for name, entry in manifest["static"].items():
        counts = ", ".join(f"{len(v)} {k}" for k, v in entry["files"].items())
        print(f"release_manifest: {name}: {entry['archiveKey']} ({counts})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
