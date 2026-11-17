#!/usr/bin/env python3
"""Publish one app's static build to its site bucket (plan H.8.5, step 6 of the release).

    python scripts/publish_static.py --app player --manifest manifest.json --archive player.tar.gz \
        --bucket <site bucket> --release-id <release_id> --site-config player_config.json --work <empty dir> \
        [--dry-run] [--summary out.json]

--site-config is the site's Terraform output object (`terraform output -json player_config`, or admin_config for the
admin site): region, userPoolId, clientId, authDomain, scope and apiBase. The player site gets the player pool, the
admin site the operator pool; the workflow passes the matching object.

What it does, in this order:
  1. Checks the archive's SHA-256 against the release manifest (the build job recorded it; H.8.7).
  2. Extracts the archive safely (regular files and directories only, nothing outside the target directory).
  3. Checks that the extracted files are exactly the files the manifest lists, so no file is published without a
     cache class chosen for it at build time (scripts/release_manifest.py).
  4. Uploads, never deleting anything (no --delete, no sync: old hashed assets must survive for open tabs and
     rollback, H.7.2), in the order of H.8.5 (b) to (g):
       a. game data, player only ("gameData")         Cache-Control: public, max-age=31536000, immutable
          /game-data/<kind>/<version>.json, CREATE-ONLY: one PutObject with If-None-Match: * per file through
          scripts/s3_put_create_only.sh. A 412 for a file already published with the same bytes is accepted (a
          re-run or a rollback); a published file with different bytes stops the publish (H.8.5 b, spine S5.1).
       b. content-hashed Vite output ("hashed")      Cache-Control: public, max-age=31536000, immutable
       c. unhashed files copied from public/          Cache-Control: no-cache   (ADR-0013, until Phase 64 hashes them)
       d. game-data/current.json ("gameDataCurrent")  Cache-Control: no-cache   (after the files it names, H.8.5 e)
          From Gate M (LD6) the game-data publisher owns current.json: it is written CREATE-ONLY too, and an existing
          one is kept whatever it says (s3_put_create_only.sh --keep-existing), so a release never reverts an admin
          publish. Only a manifest with gameDataReseed true (release.yml's reseed_current input) overwrites it, and a
          rollback (artefactsFrom) never does.
       e. config.json, generated here                 Cache-Control: no-cache   (the site config + releaseId, H.8.5 f)
       f. index.html, LAST                            Cache-Control: no-cache
     so a browser that loads the new index.html finds every file it names. Every upload sets an explicit
     Content-Type from the table below; an extension that is not in the table stops the publish before any upload.
     A manifest from before Phase 13 has no game-data lists; they count as empty.

Waiting for the distribution and the invalidation (which includes /game-data/current.json) stay in apply.yml.

Uploads go through the AWS CLI (`aws s3 cp`), one call per (cache class, content type) batch, so several hundred
art files take a handful of calls. Standard library only; runs on Python 3.12 and 3.14.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tarfile
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Any, Callable, Sequence

from release_manifest import GAME_DATA_CURRENT, GAME_DATA_VERSIONED  # one definition of the game-data paths

CACHE_IMMUTABLE = "public, max-age=31536000, immutable"
CACHE_NO_CACHE = "no-cache"
CONFIG_FILE = "config.json"
ENTRY_FILE = "index.html"
CREATE_ONLY_SCRIPT = Path(__file__).resolve().parent / "s3_put_create_only.sh"
# The manifest's file groups (scripts/release_manifest.py). The game-data groups exist from Phase 13 on.
REQUIRED_GROUPS = ("entry", "hashed", "unhashed")
GAME_DATA_GROUPS = ("gameData", "gameDataCurrent")
GAME_DATA_APP = "player"  # H.8.5 b and e: game data lives on the player site only

# Explicit types: the CLI's own guess depends on the runner's mime database. Text types carry the charset.
CONTENT_TYPES: dict[str, str] = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".map": "application/json",
    ".webmanifest": "application/manifest+json",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webp": "image/webp",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".avif": "image/avif",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".wasm": "application/wasm",
}


class PublishError(Exception):
    """Anything that must stop the publish before (or instead of) a wrong upload."""


@dataclass
class Batch:
    """One `aws s3 cp` call: files that share a cache class and a content type."""

    label: str
    cache_control: str
    content_type: str
    files: list[str] = field(default_factory=list)  # paths relative to the site root, with '/'
    create_only: bool = False  # one s3_put_create_only.sh call per file instead of one `aws s3 cp`
    keep_existing: bool = False  # create-only, and an existing object with other bytes is kept, not an error (LD6)


def content_type(path: str) -> str:
    suffix = PurePosixPath(path).suffix.lower()
    try:
        return CONTENT_TYPES[suffix]
    except KeyError:
        raise PublishError(f"no Content-Type is defined for {path!r} (extension {suffix or 'none'}); add it to "
                           f"CONTENT_TYPES in scripts/publish_static.py") from None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def app_entry(manifest: dict[str, Any], app: str) -> dict[str, Any]:
    static = manifest.get("static")
    if not isinstance(static, dict) or app not in static:
        raise PublishError(f"the release manifest has no static entry for {app!r}")
    entry = static[app]
    files = entry.get("files")
    if not isinstance(files, dict) or not all(isinstance(files.get(k), list) for k in REQUIRED_GROUPS):
        raise PublishError(f"the manifest's {app} entry has no entry/hashed/unhashed file lists")
    if not all(isinstance(files.get(k, []), list) for k in GAME_DATA_GROUPS):
        raise PublishError(f"the manifest's {app} game-data file lists are not lists")
    if files["entry"] != [ENTRY_FILE]:
        raise PublishError(f"the manifest's {app} entry files are {files['entry']!r}, expected [{ENTRY_FILE!r}]")
    check_game_data(app, files.get("gameData", []), files.get("gameDataCurrent", []))
    return entry


def check_game_data(app: str, versioned: list[str], current: list[str]) -> None:
    """Game data only on the player site, only at /game-data/<kind>/<version>.json, and with its current.json."""
    if not versioned and not current:
        return
    if app != GAME_DATA_APP:
        raise PublishError(f"the manifest gives the {app} site game data; it belongs on the {GAME_DATA_APP} site only")
    bad = [p for p in versioned if not GAME_DATA_VERSIONED.match(p)]
    if bad:
        raise PublishError(f"game-data paths not of the form game-data/<kind>/<version>.json: {bad[:5]}")
    if current != [GAME_DATA_CURRENT] or not versioned:
        raise PublishError(f"game data needs its versioned files and exactly [{GAME_DATA_CURRENT!r}], got {current!r}")


def group(files: dict[str, list[str]], name: str) -> list[str]:
    """One of the manifest's file lists; the game-data lists are missing (empty) in manifests before Phase 13."""
    return list(files.get(name, []))


def safe_extract(archive: Path, dest: Path) -> None:
    """Extract regular files and directories only, all inside dest."""
    dest.mkdir(parents=True, exist_ok=True)
    root = dest.resolve()
    with tarfile.open(archive, "r:gz") as tar:
        members = tar.getmembers()
        for member in members:
            name = member.name
            if not (member.isfile() or member.isdir()):
                raise PublishError(f"{archive.name}: {name!r} is not a regular file or directory")
            target = (root / name).resolve()
            if target != root and root not in target.parents:
                raise PublishError(f"{archive.name}: {name!r} would extract outside the target directory")
        tar.extractall(root, members=members, filter="data")


def list_files(root: Path) -> set[str]:
    return {p.relative_to(root).as_posix() for p in root.rglob("*") if p.is_file()}


def check_file_set(extracted: set[str], files: dict[str, list[str]]) -> None:
    listed = {path for name in (*REQUIRED_GROUPS, *GAME_DATA_GROUPS) for path in group(files, name)}
    if CONFIG_FILE in extracted:
        raise PublishError(f"the build contains its own {CONFIG_FILE}; it must come from the release (H.9.2)")
    missing = sorted(listed - extracted)
    extra = sorted(extracted - listed)
    if missing or extra:
        raise PublishError(
            "the archive does not match the manifest's file lists: "
            f"missing {missing[:10]}{' …' if len(missing) > 10 else ''}, "
            f"not listed {extra[:10]}{' …' if len(extra) > 10 else ''}"
        )


# config.json (H.8.5 f, E.2): identifiers only. A public Cognito client has no secret, so nothing here is one; any
# other key is refused so a secret can never ride along from a Terraform output.
API_BASE = "/api"
SITE_CONFIG_SHAPES: dict[str, re.Pattern[str]] = {
    "region": re.compile(r"^[a-z]{2}(?:-[a-z]+)+-\d$"),
    "userPoolId": re.compile(r"^[a-z]{2}(?:-[a-z]+)+-\d_[A-Za-z0-9]+$"),
    "clientId": re.compile(r"^[a-z0-9]{20,128}$"),
    "authDomain": re.compile(r"^[a-z0-9-]+\.auth\.[a-z]{2}(?:-[a-z]+)+-\d\.amazoncognito\.com$"),
    "scope": re.compile(r"^[a-z][a-z0-9-]*/[a-z][a-z0-9-]*$"),
}


def site_config(raw: Any) -> dict[str, str]:
    """Check a site's Terraform output object and return the auth values (apiBase is added by config_json)."""
    if not isinstance(raw, dict):
        raise PublishError("the site config is not a JSON object (expected `terraform output -json player_config`)")
    extra = sorted(set(raw) - set(SITE_CONFIG_SHAPES) - {"apiBase"})
    if extra:
        raise PublishError(f"the site config has unexpected key(s) {extra}; config.json carries identifiers only")
    if raw.get("apiBase", API_BASE) != API_BASE:
        raise PublishError(f"the site config's apiBase is {raw.get('apiBase')!r}, expected {API_BASE!r} (same origin)")
    out: dict[str, str] = {}
    for key, shape in SITE_CONFIG_SHAPES.items():
        value = raw.get(key)
        if not isinstance(value, str) or not shape.match(value):
            raise PublishError(f"the site config's {key} is missing or malformed: {value!r}")
        out[key] = value
    if not out["userPoolId"].startswith(out["region"] + "_"):
        raise PublishError(f"userPoolId {out['userPoolId']!r} is not in region {out['region']!r}")
    if f".auth.{out['region']}." not in out["authDomain"]:
        raise PublishError(f"authDomain {out['authDomain']!r} is not in region {out['region']!r}")
    return out


def config_json(release_id: str, auth: dict[str, str]) -> str:
    """config.json: apiBase, releaseId and the site's sign-in settings (H.8.5 f, E.2)."""
    body = {**auth, "apiBase": API_BASE, "releaseId": release_id}
    return json.dumps(body, sort_keys=True, separators=(",", ":")) + "\n"


def _grouped(label: str, cache_control: str, paths: Sequence[str]) -> list[Batch]:
    by_type: dict[str, Batch] = {}
    for path in sorted(paths):
        ctype = content_type(path)
        batch = by_type.setdefault(ctype, Batch(label, cache_control, ctype))
        batch.files.append(path)
    return [by_type[k] for k in sorted(by_type)]


def build_plan(files: dict[str, list[str]], *, reseed: bool = False) -> list[Batch]:
    """The ordered upload batches. The order is the whole point (H.8.5): versioned game data (create-only), hashed,
    unhashed, game-data/current.json (only if absent, unless `reseed`), config.json, index.html."""
    plan: list[Batch] = []
    for batch in _grouped("game-data", CACHE_IMMUTABLE, group(files, "gameData")):
        batch.create_only = True
        plan.append(batch)
    plan += _grouped("hashed", CACHE_IMMUTABLE, files["hashed"])
    plan += _grouped("unhashed", CACHE_NO_CACHE, files["unhashed"])
    for batch in _grouped("game-data-current", CACHE_NO_CACHE, group(files, "gameDataCurrent")):
        batch.create_only = batch.keep_existing = not reseed
        plan.append(batch)
    plan.append(Batch("config", CACHE_NO_CACHE, content_type(CONFIG_FILE), [CONFIG_FILE]))
    plan.append(Batch("entry", CACHE_NO_CACHE, content_type(ENTRY_FILE), [ENTRY_FILE]))
    return plan


def stage(batch: Batch, site_root: Path, stage_dir: Path) -> Path:
    """Copy one batch's files into their own directory tree, so one recursive cp uploads exactly that batch."""
    if stage_dir.exists():
        shutil.rmtree(stage_dir)
    for rel in batch.files:
        target = stage_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(site_root / rel, target)
    return stage_dir


def cp_command(batch: Batch, source: Path, bucket: str) -> list[str]:
    """The `aws s3 cp` argv for one batch. Never --delete; never `sync`."""
    common = ["--cache-control", batch.cache_control, "--content-type", batch.content_type, "--only-show-errors",
              "--no-progress"]
    if len(batch.files) == 1:
        return ["aws", "s3", "cp", str(source / batch.files[0]), f"s3://{bucket}/{batch.files[0]}", *common]
    return ["aws", "s3", "cp", str(source), f"s3://{bucket}/", "--recursive", *common]


def create_only_command(batch: Batch, rel: str, site_root: Path, bucket: str) -> list[str]:
    """One create-only PutObject (If-None-Match: *) for a game-data file, with its cache and content headers."""
    keep = ["--keep-existing"] if batch.keep_existing else []
    return [str(CREATE_ONLY_SCRIPT), *keep, bucket, rel, str(site_root / rel), batch.cache_control, batch.content_type]


def reseed_flag(manifest: dict[str, Any]) -> bool:
    """Whether this release overwrites game-data/current.json (LD6). Missing (a manifest before LD6) is false; a
    rollback never reseeds, whatever its manifest says."""
    reseed = manifest.get("gameDataReseed", False)
    if not isinstance(reseed, bool):
        raise PublishError(f"the manifest's gameDataReseed is {reseed!r}, not true or false")
    if reseed and manifest.get("artefactsFrom"):
        raise PublishError("a rollback (artefactsFrom) never overwrites game-data/current.json; gameDataReseed must be false")
    return reseed


def publish(
    app: str,
    manifest: dict[str, Any],
    archive: Path,
    bucket: str,
    release_id: str,
    work: Path,
    run: Callable[[list[str]], None],
    *,
    auth: Any,
) -> list[Batch]:
    entry = app_entry(manifest, app)
    auth = site_config(auth)
    reseed = reseed_flag(manifest)
    if manifest.get("releaseId") != release_id:
        raise PublishError(f"the manifest is for release {manifest.get('releaseId')!r}, not {release_id!r}")
    got = sha256_file(archive)
    if got != entry.get("sha256"):
        raise PublishError(f"{archive.name}: SHA-256 {got} does not match the manifest's {entry.get('sha256')}")

    site_root = work / "site"
    if site_root.exists():
        raise PublishError(f"{site_root} already exists; give an empty --work directory")
    safe_extract(archive, site_root)
    check_file_set(list_files(site_root), entry["files"])
    (site_root / CONFIG_FILE).write_text(config_json(release_id, auth), encoding="utf-8")

    plan = build_plan(entry["files"], reseed=reseed)
    for i, batch in enumerate(plan):
        if batch.create_only:
            for rel in batch.files:
                run(create_only_command(batch, rel, site_root, bucket))
            continue
        source = site_root if len(batch.files) == 1 else stage(batch, site_root, work / f"batch-{i:02d}")
        run(cp_command(batch, source, bucket))
    return plan


def run_cli(argv: list[str]) -> None:
    result = subprocess.run(argv, check=False)
    if result.returncode != 0:
        raise PublishError(f"upload failed (exit {result.returncode}): {' '.join(argv[:5])} …")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Publish one app's static build in the safe order (plan H.8.5).")
    parser.add_argument("--app", required=True)
    parser.add_argument("--manifest", type=Path, required=True, help="releases/<release_id>/manifest.json")
    parser.add_argument("--archive", type=Path, required=True, help="the app's static archive (tar.gz)")
    parser.add_argument("--bucket", required=True)
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--site-config", type=Path, required=True,
                        help="the site's Terraform output object as JSON (player_config or admin_config)")
    parser.add_argument("--work", type=Path, required=True, help="an empty working directory")
    parser.add_argument("--dry-run", action="store_true", help="print the upload commands instead of running them")
    parser.add_argument("--summary", type=Path, help="write the batches as JSON here")
    args = parser.parse_args(argv)

    if not args.bucket:
        print("publish_static: error: --bucket is empty (missing terraform output?)", file=sys.stderr)
        return 1

    def dry(cmd: list[str]) -> None:
        print(" ".join(cmd))

    try:
        manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
        auth = json.loads(args.site_config.read_text(encoding="utf-8"))
        plan = publish(args.app, manifest, args.archive, args.bucket, args.release_id, args.work,
                       dry if args.dry_run else run_cli, auth=auth)
    except (OSError, json.JSONDecodeError, tarfile.TarError, PublishError) as exc:
        print(f"publish_static: error: {exc}", file=sys.stderr)
        return 1

    rows = [{"order": i + 1, "label": b.label, "cacheControl": b.cache_control, "contentType": b.content_type,
             "files": len(b.files), "createOnly": b.create_only, "keepExisting": b.keep_existing}
            for i, b in enumerate(plan)]
    for row in rows:
        print(f"publish_static: {args.app}: {row['order']:>2}. {row['label']:<17} {row['files']:>4} file(s)  "
              f"{row['contentType']:<28} {row['cacheControl']}")
    if args.summary:
        args.summary.write_text(json.dumps({"app": args.app, "bucket": args.bucket, "batches": rows}, indent=2) + "\n",
                                encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
