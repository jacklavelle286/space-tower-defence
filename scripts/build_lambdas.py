#!/usr/bin/env python3
"""Build one reproducible Lambda zip per function (plan H.9.2, J M1-09).

Each zip holds, at its root:
  handler.py (and anything else in api/functions/<function>/)   the entry point, `handler.handler`
  shared/                                                       api/shared, the helpers every function imports
  contracts/limits.json, contracts/schemas/*.schema.json        the shared contracts shared/rules reads (Phase 12);
  contracts/topics.json                                         the topic registry shared/topics reads (plan C19);
                                                                fixtures and routes.json stay out
  content/listening-verdicts.json (admin-api only)              the G-14 verdicts shared/verdicts.py reads when a
                                                                PHONEME speech definition is approved (Phase 20)
  art/STYLE.md, art/svg/<family>/<examples> (picture-gen only)  the fixed system prompt's style guide and each picture
                                                                kind's examples (Phase 42b; kinds Gate P2); the kind
                                                                files are in the function folder (kinds/*.md)
  the runtime dependencies                                      installed for Lambda's python3.14 on arm64: from
                                                                api/requirements.txt, or from the function's own
                                                                hash-pinned lock (picture-gen, below)

Dependencies are installed once per build into a staging directory with
  pip install --platform manylinux2014_aarch64 --platform manylinux_2_28_aarch64 --implementation cp
              --python-version 3.14 --only-binary=:all: --target <staging> -r api/requirements.txt
which downloads arm64 wheels for 3.14 whatever the local interpreter or machine is, and fails loudly if a wheel is
missing. After installing, the set of installed distributions must equal the pins in requirements.txt exactly, so an
unpinned transitive dependency cannot slip into a zip.

picture-gen (Phase 42b) has its own staging directory, installed from api/requirements-picture-gen.txt, a lock with a
sha256 for every wheel, with pip --require-hashes (backlog B-4, scoped to this function): pip refuses any wheel whose
bytes differ from the lock and any dependency the lock does not list. The lock holds the whole set for that function:
every pin of api/requirements.txt at the same version (checked), plus anthropic[bedrock] and its dependency tree,
boto3 and botocore included, so the SDK runs against the botocore it was locked with rather than the runtime's.
Regenerate it (after changing api/requirements-picture-gen.in or api/requirements.txt) with
  python3 scripts/build_lambdas.py --lock picture_gen
which resolves for the same target (cp314, manylinux aarch64, wheels only) with pip download and writes each wheel's
sha256. The other four functions keep api/requirements.txt and give the same bytes as before.

The same inputs always give the same bytes, so an unchanged function keeps the same SHA-256 and the plan shows no
change for it:
  - entries are sorted by path, and there are no directory entries;
  - every entry has the timestamp 1980-01-01 00:00:00 (the earliest a zip can hold);
  - permissions are 0644, or 0755 for a file with any execute bit; the "made on" system is always Unix;
  - __pycache__ directories and *.pyc / *.pyo files are left out (pip runs with --no-compile as well);
  - pip's console scripts (bin/) and dist-info RECORD files are removed: they carry the building machine's
    interpreter path;
  - compression is deflate at a fixed level.

Output: build/<lambda key>.zip (player-api, admin-api, tts, cognito-presignup, picture-gen), and one
"<sha256>  <path>" line each.

Usage:
  python3 scripts/build_lambdas.py                  # full build (needs PyPI)
  python3 scripts/build_lambdas.py --skip-deps      # code only, for offline checks
  python3 scripts/build_lambdas.py --out other/dir
  python3 scripts/build_lambdas.py --lock picture_gen   # regenerate api/requirements-picture-gen.txt (needs PyPI)

Standard library only; runs on Python 3.12 and 3.14 (needs pip for the dependency step).
"""

from __future__ import annotations

import argparse
import hashlib
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from collections.abc import Iterable, Mapping
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FUNCTIONS = ("player_api", "admin_api", "tts", "cognito_presignup", "picture_gen")
FIXED_TIME = (1980, 1, 1, 0, 0, 0)
UNIX = 3
COMPRESS_LEVEL = 9
PIP_TARGET = [
    "--platform", "manylinux2014_aarch64",
    "--platform", "manylinux_2_28_aarch64",
    "--implementation", "cp",
    "--python-version", "3.14",
    "--only-binary=:all:",
]  # fmt: skip
_SKIPPED_DIRS = frozenset({"__pycache__"})
_SKIPPED_SUFFIXES = frozenset({".pyc", ".pyo"})
# Globs under contracts/, the files the code reads: limits, schemas (shared/rules), topic registry (shared/topics).
CONTRACT_FILES = ("limits.json", "topics.json", "schemas/*.schema.json")
# Repository files one function reads at run time, at the same relative path in its zip (Phase 20).
# picture-gen: the house style and every picture kind's example drawings, sent as fixed system-prompt blocks (Phase
# 42b; kinds Gate P2). This list must hold every path in KIND_EXAMPLES in api/functions/picture_gen/handler.py (an api
# test checks); the kind files themselves (api/functions/picture_gen/kinds/*.md) travel with the function folder.
FUNCTION_FILES: Mapping[str, tuple[str, ...]] = {
    "admin_api": ("content/listening-verdicts.json",),
    "picture_gen": (
        "art/STYLE.md",
        "art/svg/activity/obj-planet.svg",
        "art/svg/activity/obj-rocket.svg",
        "art/svg/activity/pic-boat.svg",
        "art/svg/activity/pic-cat.svg",
        "art/svg/activity/pic-night-sky.svg",
        "art/svg/aliens/alien-blob-walk-01.svg",
        "art/svg/aliens/alien-slime-walk-01.svg",
        "art/svg/astronauts/nova-l1-idle-01.svg",
        "art/svg/avatars/avatar-02.svg",
        "art/svg/avatars/avatar-07.svg",
        "art/svg/badges/badge-first-steps.svg",
        "art/svg/badges/badge-keep-trying.svg",
        "art/svg/map/deco-antenna.svg",
        "art/svg/map/deco-crater-1.svg",
        "art/svg/map/deco-rock-1.svg",
        "art/svg/planets/planet-luna-1.svg",
    ),
}
# Functions installed from their own hash-pinned lock (pip --require-hashes, backlog B-4) instead of
# api/requirements.txt, and the hand-written top-level pins each lock is generated from (--lock). Paths under api/.
LOCKED_REQUIREMENTS: Mapping[str, str] = {"picture_gen": "requirements-picture-gen.txt"}
LOCK_INPUTS: Mapping[str, str] = {"picture_gen": "requirements-picture-gen.in"}
BASE_REQUIREMENTS = "requirements.txt"
_PIN = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?==(\S+)$")
_HASH = re.compile(r"^--hash=sha256:[0-9a-f]{64}$")
# A wheel file name: {distribution}-{version}(-{build})?-{python}-{abi}-{platform}.whl (distribution uses _ for -).
_WHEEL = re.compile(r"^(?P<name>[A-Za-z0-9_.]+)-(?P<version>[A-Za-z0-9_.!+]+)(-\d[^-]*)?-[^-]+-[^-]+-[^-]+\.whl$")


class BuildError(Exception):
    """A build that would give a wrong or unreproducible zip."""


def lambda_key(function: str) -> str:
    return function.replace("_", "-")


def _normalise(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).lower()


def collect(root: Path, prefix: str = "") -> dict[str, Path]:
    """Every file under `root`, as zip path -> source path, without bytecode caches."""
    files: dict[str, Path] = {}
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        if any(part in _SKIPPED_DIRS for part in relative.parts) or path.suffix in _SKIPPED_SUFFIXES:
            continue
        if path.is_file():
            files[prefix + relative.as_posix()] = path
    return files


def write_zip(entries: Mapping[str, Path], destination: Path) -> str:
    """Write `entries` (zip path -> source file) deterministically and return the zip's SHA-256 hex digest."""
    destination.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(destination, "w") as archive:
        for name in sorted(entries):
            source = entries[name]
            mode = 0o755 if source.stat().st_mode & 0o111 else 0o644
            info = zipfile.ZipInfo(name, date_time=FIXED_TIME)
            info.create_system = UNIX
            info.external_attr = (0o100000 | mode) << 16  # regular file + permission bits
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, source.read_bytes(), compresslevel=COMPRESS_LEVEL)
    return hashlib.sha256(destination.read_bytes()).hexdigest()


def _requirement_lines(requirements: Path) -> list[list[str]]:
    """Each requirement as its tokens: comments dropped, backslash continuations joined."""
    logical: list[str] = []
    pending = ""
    for raw in requirements.read_text().splitlines():
        line = raw.split("#", 1)[0].rstrip()  # "#" never appears in a pin or a --hash option
        if line.endswith("\\"):
            pending += line[:-1] + " "
            continue
        line = (pending + line).strip()
        pending = ""
        if line:
            logical.append(line)
    if pending.strip():
        logical.append(pending.strip())
    return [line.split() for line in logical]


def pinned_versions(requirements: Path, *, require_hashes: bool = False) -> dict[str, str]:
    """Normalised name -> exact version. With `require_hashes`, every pin must carry at least one sha256 and nothing
    else (a lock file); otherwise hash options are refused, so a plain file never half-enables pip's hash mode."""
    versions: dict[str, str] = {}
    for tokens in _requirement_lines(requirements):
        requirement, options = tokens[0], tokens[1:]
        match = _PIN.match(requirement)
        if not match:
            raise BuildError(f"{requirements}: not an exact pin: {requirement!r}")
        name = _normalise(match.group(1))
        if name in versions:
            raise BuildError(f"{requirements}: {name} pinned twice")
        bad = [o for o in options if not _HASH.match(o)]
        if bad:
            raise BuildError(f"{requirements}: {name}: unexpected {bad[0]!r} (only --hash=sha256:<64 hex>)")
        if require_hashes and not options:
            raise BuildError(f"{requirements}: {name} has no --hash (every line of a lock needs one)")
        if not require_hashes and options:
            raise BuildError(f"{requirements}: {name} has a --hash, but this file is not a lock")
        versions[name] = match.group(3)
    return versions


def pinned_names(requirements: Path) -> set[str]:
    return set(pinned_versions(requirements))


def check_lock(lock: Path, base: Path) -> dict[str, str]:
    """A function lock: hashes on every line, and every pin of the shared requirements at the same version, so the
    shared/ helpers run on the same libraries in every zip."""
    locked = pinned_versions(lock, require_hashes=True)
    shared = pinned_versions(base)
    differ = {n: (v, locked.get(n)) for n, v in shared.items() if locked.get(n) != v}
    if differ:
        raise BuildError(
            f"{lock.name} must pin every package of {base.name} at the same version: "
            + ", ".join(f"{n} {want} (lock: {got or 'missing'})" for n, (want, got) in sorted(differ.items()))
        )
    return locked


def install_dependencies(requirements: Path, target: Path, *, require_hashes: bool = False) -> None:
    command = [
        # --isolated: ignore PIP_* environment variables and pip.conf, so a machine's index override cannot change
        # what goes into the zip. --require-hashes (locks only, backlog B-4): every wheel must match a listed sha256
        # and every dependency must be listed.
        sys.executable, "-m", "pip", "install", "--isolated",
        "--disable-pip-version-check", "--no-input", "--no-compile", "--quiet",
        *(["--require-hashes"] if require_hashes else []),
        *PIP_TARGET,
        "--target", str(target),
        "-r", str(requirements),
    ]  # fmt: skip
    subprocess.run(command, check=True)  # noqa: S603 - fixed arguments, no shell
    # Console scripts are useless in Lambda, and pip writes the local interpreter's path into their first line; each
    # RECORD file lists those scripts' hashes. Both would make the zip depend on the machine that built it.
    shutil.rmtree(target / "bin", ignore_errors=True)
    for record in target.glob("*.dist-info/RECORD"):
        record.unlink()
    installed = {_normalise(p.name.split("-")[0]) for p in target.glob("*.dist-info")}
    expected = set(pinned_versions(requirements, require_hashes=require_hashes))
    if installed != expected:
        raise BuildError(
            f"installed distributions differ from {requirements.name}: "
            f"unpinned {sorted(installed - expected)}, missing {sorted(expected - installed)}"
        )


def contract_entries(contracts: Path) -> dict[str, Path]:
    """The contract files shared/rules reads at import time, as contracts/<path> (it looks next to shared/ first)."""
    if not (contracts / "limits.json").is_file():
        raise BuildError(f"{contracts}: no limits.json")
    files: dict[str, Path] = {}
    for pattern in CONTRACT_FILES:
        for path in sorted(contracts.glob(pattern)):
            if path.is_file():
                files["contracts/" + path.relative_to(contracts).as_posix()] = path
    return files


def function_file_entries(repo: Path, function: str) -> dict[str, Path]:
    """The repository files `function` reads at run time (FUNCTION_FILES), each required."""
    files: dict[str, Path] = {}
    for relative in FUNCTION_FILES.get(function, ()):
        path = repo / relative
        if not path.is_file():
            raise BuildError(f"{function}: {relative} is missing")
        files[relative] = path
    return files


def deps_for(deps: Path | Mapping[str, Path] | None, function: str) -> Path | None:
    """One staging directory for every function, or a directory per function (picture-gen has its own)."""
    if deps is None or isinstance(deps, Path):
        return deps
    return deps.get(function)


def zip_entries(api: Path, function: str, deps: Path | None) -> dict[str, Path]:
    """Every file of one function's zip; the contracts (and FUNCTION_FILES) are read from the folder next to `api`
    (the repository's)."""
    layers: Iterable[dict[str, Path]] = (
        collect(deps) if deps else {},
        contract_entries(api.parent / "contracts"),
        function_file_entries(api.parent, function),
        collect(api / "shared", "shared/"),
        collect(api / "functions" / function),
    )
    entries: dict[str, Path] = {}
    for layer in layers:
        clash = entries.keys() & layer.keys()
        if clash:
            raise BuildError(f"{function}: the same path from two sources: {sorted(clash)[:5]}")
        entries.update(layer)
    if "handler.py" not in entries:
        raise BuildError(f"{function}: no handler.py")
    return entries


def build(
    api: Path, out: Path, deps: Path | Mapping[str, Path] | None, functions: Iterable[str] = FUNCTIONS
) -> dict[str, str]:
    """Build every function's zip into `out`; return zip path -> SHA-256. `deps` is one staging directory for all
    functions, or function -> staging directory."""
    hashes = {}
    for function in functions:
        destination = out / f"{lambda_key(function)}.zip"
        hashes[str(destination)] = write_zip(zip_entries(api, function, deps_for(deps, function)), destination)
    return hashes


def install_all(api: Path, staging: Path) -> dict[str, Path]:
    """Install the shared requirements once and each lock into its own directory; return function -> directory."""
    shared = staging / "deps"
    install_dependencies(api / BASE_REQUIREMENTS, shared)
    deps = {function: shared for function in FUNCTIONS}
    for function, lock_name in LOCKED_REQUIREMENTS.items():
        lock = api / lock_name
        check_lock(lock, api / BASE_REQUIREMENTS)
        target = staging / f"deps-{lambda_key(function)}"
        install_dependencies(lock, target, require_hashes=True)
        deps[function] = target
    return deps


def wheel_pins(wheels: Path) -> dict[str, tuple[str, str]]:
    """Normalised name -> (version, sha256 hex) for every wheel in a pip download directory."""
    pins: dict[str, tuple[str, str]] = {}
    for wheel in sorted(wheels.iterdir()):
        match = _WHEEL.match(wheel.name)
        if not match:
            raise BuildError(f"not a wheel file name: {wheel.name} (pip download must fetch wheels only)")
        name = _normalise(match.group("name"))
        if name in pins:
            raise BuildError(f"two wheels for {name}: the resolution is ambiguous")
        pins[name] = (match.group("version"), hashlib.sha256(wheel.read_bytes()).hexdigest())
    return pins


def render_lock(function: str, pins: Mapping[str, tuple[str, str]]) -> str:
    header = [
        f"# GENERATED by `python3 scripts/build_lambdas.py --lock {function}`: do not edit by hand (backlog B-4).",
        f"# Inputs: api/{BASE_REQUIREMENTS} and api/{LOCK_INPUTS[function]}, resolved for the Lambda target in",
        "# scripts/build_lambdas.py (cp314, manylinux aarch64, wheels only). The build installs this file with",
        "# pip --require-hashes, so a wheel with other bytes, or a dependency not listed here, fails the build.",
    ]
    body = [f"{name}=={version} \\\n    --hash=sha256:{digest}" for name, (version, digest) in sorted(pins.items())]
    return "\n".join(header + body) + "\n"


def write_lock(api: Path, function: str, staging: Path) -> Path:
    """Resolve `function`'s inputs for the Lambda target with pip download and write its hash-pinned lock."""
    if function not in LOCKED_REQUIREMENTS:
        raise BuildError(f"{function} has no lock (functions with one: {', '.join(LOCKED_REQUIREMENTS)})")
    wheels = staging / "wheels"
    command = [
        sys.executable, "-m", "pip", "download", "--isolated",
        "--disable-pip-version-check", "--no-input", "--quiet",
        *PIP_TARGET,
        "--dest", str(wheels),
        "-r", str(api / BASE_REQUIREMENTS),
        "-r", str(api / LOCK_INPUTS[function]),
    ]  # fmt: skip
    subprocess.run(command, check=True)  # noqa: S603 - fixed arguments, no shell
    lock = api / LOCKED_REQUIREMENTS[function]
    lock.write_text(render_lock(function, wheel_pins(wheels)))
    check_lock(lock, api / BASE_REQUIREMENTS)
    return lock


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--out", type=Path, default=REPO / "build", help="output directory (default: build/)")
    parser.add_argument("--skip-deps", action="store_true", help="leave out runtime dependencies (offline check)")
    parser.add_argument("--lock", metavar="FUNCTION", help="regenerate FUNCTION's hash-pinned lock, then stop")
    args = parser.parse_args(argv)

    api = REPO / "api"
    try:
        with tempfile.TemporaryDirectory(prefix="build-lambdas-") as staging:
            if args.lock:
                lock = write_lock(api, args.lock, Path(staging))
                print(f"wrote {lock.relative_to(REPO)}")
                return 0
            deps = None if args.skip_deps else install_all(api, Path(staging))
            hashes = build(api, args.out, deps)
    except (BuildError, subprocess.CalledProcessError) as error:
        print(f"build_lambdas: {error}", file=sys.stderr)
        return 1
    for path, digest in hashes.items():
        print(f"{digest}  {Path(path).relative_to(REPO) if Path(path).is_relative_to(REPO) else path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
