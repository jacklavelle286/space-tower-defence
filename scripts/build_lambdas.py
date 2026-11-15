#!/usr/bin/env python3
"""Build one reproducible Lambda zip per function (plan H.9.2, J M1-09).

Each zip holds, at its root:
  handler.py (and anything else in api/functions/<function>/)   the entry point, `handler.handler`
  shared/                                                       api/shared, the helpers every function imports
  the runtime dependencies from api/requirements.txt            installed for Lambda's python3.14 on arm64

Dependencies are installed once per build into a staging directory with
  pip install --platform manylinux2014_aarch64 --platform manylinux_2_28_aarch64 --implementation cp
              --python-version 3.14 --only-binary=:all: --target <staging> -r api/requirements.txt
which downloads arm64 wheels for 3.14 whatever the local interpreter or machine is, and fails loudly if a wheel is
missing. After installing, the set of installed distributions must equal the pins in requirements.txt exactly, so an
unpinned transitive dependency cannot slip into a zip.

The same inputs always give the same bytes, so an unchanged function keeps the same SHA-256 and the plan shows no
change for it:
  - entries are sorted by path, and there are no directory entries;
  - every entry has the timestamp 1980-01-01 00:00:00 (the earliest a zip can hold);
  - permissions are 0644, or 0755 for a file with any execute bit; the "made on" system is always Unix;
  - __pycache__ directories and *.pyc / *.pyo files are left out (pip runs with --no-compile as well);
  - pip's console scripts (bin/) and dist-info RECORD files are removed: they carry the building machine's
    interpreter path;
  - compression is deflate at a fixed level.

Output: build/<lambda key>.zip (player-api, admin-api, tts, cognito-presignup), and one "<sha256>  <path>" line each.

Usage:
  python3 scripts/build_lambdas.py                  # full build (needs PyPI)
  python3 scripts/build_lambdas.py --skip-deps      # code only, for offline checks
  python3 scripts/build_lambdas.py --out other/dir

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
FUNCTIONS = ("player_api", "admin_api", "tts", "cognito_presignup")
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
_PIN = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?==\S+")


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


def pinned_names(requirements: Path) -> set[str]:
    names = set()
    for raw in requirements.read_text().splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        match = _PIN.match(line)
        if not match:
            raise BuildError(f"{requirements}: not an exact pin: {line!r}")
        names.add(_normalise(match.group(1)))
    return names


def install_dependencies(requirements: Path, target: Path) -> None:
    command = [
        # --isolated: ignore PIP_* environment variables and pip.conf, so a machine's index override cannot change
        # what goes into the zip. Wheel hashes (--require-hashes) are a separate, owner-decided change.
        sys.executable, "-m", "pip", "install", "--isolated",
        "--disable-pip-version-check", "--no-input", "--no-compile", "--quiet",
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
    expected = pinned_names(requirements)
    if installed != expected:
        raise BuildError(
            f"installed distributions differ from {requirements.name}: "
            f"unpinned {sorted(installed - expected)}, missing {sorted(expected - installed)}"
        )


def zip_entries(api: Path, function: str, deps: Path | None) -> dict[str, Path]:
    layers: Iterable[dict[str, Path]] = (
        collect(deps) if deps else {},
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


def build(api: Path, out: Path, deps: Path | None, functions: Iterable[str] = FUNCTIONS) -> dict[str, str]:
    """Build every function's zip into `out`; return zip path -> SHA-256."""
    hashes = {}
    for function in functions:
        destination = out / f"{lambda_key(function)}.zip"
        hashes[str(destination)] = write_zip(zip_entries(api, function, deps), destination)
    return hashes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--out", type=Path, default=REPO / "build", help="output directory (default: build/)")
    parser.add_argument("--skip-deps", action="store_true", help="leave out runtime dependencies (offline check)")
    args = parser.parse_args(argv)

    api = REPO / "api"
    try:
        with tempfile.TemporaryDirectory(prefix="build-lambdas-") as staging:
            deps = None
            if not args.skip_deps:
                deps = Path(staging) / "deps"
                install_dependencies(api / "requirements.txt", deps)
            hashes = build(api, args.out, deps)
    except (BuildError, subprocess.CalledProcessError) as error:
        print(f"build_lambdas: {error}", file=sys.stderr)
        return 1
    for path, digest in hashes.items():
        print(f"{digest}  {Path(path).relative_to(REPO) if Path(path).is_relative_to(REPO) else path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
