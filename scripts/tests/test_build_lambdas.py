"""Tests for scripts/build_lambdas.py: the zip writer is deterministic (plan H.9.2).

These run offline: they build without the pip-installed dependencies. The CI `api` job runs the full build (with
dependencies from PyPI) twice and compares the hashes.
"""

from __future__ import annotations

import os
import shutil
import stat
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import build_lambdas

REPO = Path(__file__).resolve().parents[2]


def _tree(root: Path, mtime: int) -> Path:
    files = {
        "handler.py": "def handler(event, context):\n    return event\n",
        "pkg/__init__.py": "",
        "pkg/b.py": "B = 2\n",
        "pkg/a.py": "A = 1\n",
        "bin/tool": "#!/bin/sh\n",
        "pkg/__pycache__/a.cpython-312.pyc": "junk",
        "stray.pyc": "junk",
    }
    for name, text in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        os.utime(path, (mtime, mtime))
    (root / "bin" / "tool").chmod(0o775)
    (root / "pkg" / "a.py").chmod(0o600)  # odd source permissions still give 0644 in the zip
    return root


def test_same_files_different_mtimes_give_identical_zips(tmp_path: Path) -> None:
    first = build_lambdas.write_zip(build_lambdas.collect(_tree(tmp_path / "one", 1_700_000_000)), tmp_path / "1.zip")
    second = build_lambdas.write_zip(build_lambdas.collect(_tree(tmp_path / "two", 1_800_000_000)), tmp_path / "2.zip")

    assert first == second
    assert (tmp_path / "1.zip").read_bytes() == (tmp_path / "2.zip").read_bytes()


def test_zip_entries_are_sorted_fixed_and_clean(tmp_path: Path) -> None:
    build_lambdas.write_zip(build_lambdas.collect(_tree(tmp_path / "src", 1_750_000_000)), tmp_path / "out.zip")

    with zipfile.ZipFile(tmp_path / "out.zip") as archive:
        infos = archive.infolist()
    names = [info.filename for info in infos]
    assert names == sorted(names) == ["bin/tool", "handler.py", "pkg/__init__.py", "pkg/a.py", "pkg/b.py"]
    for info in infos:
        assert info.date_time == (1980, 1, 1, 0, 0, 0)
        assert info.create_system == 3
        mode = info.external_attr >> 16
        assert stat.S_ISREG(mode)
        assert stat.S_IMODE(mode) == (0o755 if info.filename == "bin/tool" else 0o644)


def test_content_change_changes_the_hash(tmp_path: Path) -> None:
    source = _tree(tmp_path / "src", 1_750_000_000)
    before = build_lambdas.write_zip(build_lambdas.collect(source), tmp_path / "a.zip")
    (source / "pkg" / "b.py").write_text("B = 3\n")
    assert build_lambdas.write_zip(build_lambdas.collect(source), tmp_path / "b.zip") != before


def test_real_functions_build_twice_to_the_same_hashes(tmp_path: Path) -> None:
    # Build from the repository, then from a copy whose files all have other timestamps, into separate directories.
    copy = tmp_path / "api-copy"
    shutil.copytree(REPO / "api" / "functions", copy / "functions", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(REPO / "api" / "shared", copy / "shared", ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(REPO / "contracts", tmp_path / "contracts")  # zip_entries reads the contracts next to api/
    for path in [*copy.rglob("*"), *(tmp_path / "contracts").rglob("*")]:
        os.utime(path, (1_234_567_890, 1_234_567_890))

    first = build_lambdas.build(REPO / "api", tmp_path / "out1", deps=None)
    second = build_lambdas.build(copy, tmp_path / "out2", deps=None)

    assert sorted(Path(p).name for p in first) == [
        "admin-api.zip", "cognito-presignup.zip", "player-api.zip", "tts.zip",
    ]  # fmt: skip
    assert {Path(p).name: h for p, h in first.items()} == {Path(p).name: h for p, h in second.items()}
    with zipfile.ZipFile(tmp_path / "out1" / "player-api.zip") as archive:
        names = archive.namelist()
    assert "handler.py" in names and "shared/__init__.py" in names and "shared/router.py" in names
    assert not any("__pycache__" in name or name.endswith(".pyc") for name in names)
    schemas = sorted(f"contracts/schemas/{p.name}" for p in (REPO / "contracts" / "schemas").glob("*.schema.json"))
    assert sorted(n for n in names if n.startswith("contracts/")) == ["contracts/limits.json", *schemas]


def test_contracts_are_required(tmp_path: Path) -> None:
    with pytest.raises(build_lambdas.BuildError, match=r"no limits\.json"):
        build_lambdas.contract_entries(tmp_path / "contracts")


def test_each_zip_imports_with_the_lambda_layout(tmp_path: Path) -> None:
    """Extract each code-only zip and import `handler.handler` from its root, as the Lambda runtime does.

    The runtime dependencies come from the running interpreter's site-packages (the CI `api` job installs them); where
    they are missing (the `scripts` job, the repo-root .venv) the test is skipped.
    """
    pytest.importorskip("aws_lambda_powertools")
    built = build_lambdas.build(REPO / "api", tmp_path / "out", deps=None)
    for zip_path in built:
        root = tmp_path / "extracted" / Path(zip_path).stem
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(root)
        # shared.rules reads contracts/ at import: it must find the copy inside the zip, not the repository's.
        probe = (
            f"import sys; sys.path.insert(0, {str(root)!r}); import handler; assert callable(handler.handler); "
            f"import shared.rules.contracts as c; assert c.CONTRACTS_DIR == __import__('pathlib').Path({str(root)!r})"
            " / 'contracts', c.CONTRACTS_DIR; assert c.LIMITS['attemptsPerSlot'] == 3; "
            "from shared.rules import reduce"
        )
        result = subprocess.run(  # noqa: S603 - fixed arguments, no shell
            [sys.executable, "-I", "-c", probe], cwd=tmp_path, capture_output=True, text=True, check=False
        )
        assert result.returncode == 0, f"{Path(zip_path).name}: {result.stderr}"


def test_dependency_clash_is_refused(tmp_path: Path) -> None:
    deps = tmp_path / "deps"
    (deps / "shared").mkdir(parents=True)
    (deps / "shared" / "__init__.py").write_text("")  # a dependency that would shadow api/shared
    with pytest.raises(build_lambdas.BuildError, match="two sources"):
        build_lambdas.zip_entries(REPO / "api", "tts", deps)


def test_requirements_must_be_exact_pins(tmp_path: Path) -> None:
    good = tmp_path / "good.txt"
    good.write_text("# comment\nAws_Lambda.Powertools==3.40.0  # pinned\npydantic[email]==2.14.3\n\n")
    assert build_lambdas.pinned_names(good) == {"aws-lambda-powertools", "pydantic"}

    loose = tmp_path / "loose.txt"
    loose.write_text("pydantic>=2\n")
    with pytest.raises(build_lambdas.BuildError, match="exact pin"):
        build_lambdas.pinned_names(loose)


def test_runtime_requirements_are_all_exact_pins() -> None:
    assert "aws-lambda-powertools" in build_lambdas.pinned_names(REPO / "api" / "requirements.txt")
