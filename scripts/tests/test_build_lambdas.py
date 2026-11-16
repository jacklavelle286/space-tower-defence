"""Tests for scripts/build_lambdas.py: the zip writer is deterministic (plan H.9.2).

These run offline: they build without the pip-installed dependencies. The CI `api` job runs the full build (with
dependencies from PyPI) twice and compares the hashes.
"""

from __future__ import annotations

import importlib.util
import json
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
    (tmp_path / "content").mkdir()
    shutil.copy2(REPO / "content" / "listening-verdicts.json", tmp_path / "content" / "listening-verdicts.json")
    for relative in build_lambdas.FUNCTION_FILES["picture_gen"]:  # picture-gen's prompt files (Phase 42b)
        (tmp_path / relative).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(REPO / relative, tmp_path / relative)
    for path in [
        *copy.rglob("*"),
        *(tmp_path / "contracts").rglob("*"),
        *(tmp_path / "content").rglob("*"),
        *(tmp_path / "art").rglob("*"),
    ]:
        os.utime(path, (1_234_567_890, 1_234_567_890))

    first = build_lambdas.build(REPO / "api", tmp_path / "out1", deps=None)
    second = build_lambdas.build(copy, tmp_path / "out2", deps=None)

    assert sorted(Path(p).name for p in first) == [
        "admin-api.zip", "cognito-presignup.zip", "picture-gen.zip", "player-api.zip", "tts.zip",
    ]  # fmt: skip
    assert {Path(p).name: h for p, h in first.items()} == {Path(p).name: h for p, h in second.items()}
    with zipfile.ZipFile(tmp_path / "out1" / "player-api.zip") as archive:
        names = archive.namelist()
    assert "handler.py" in names and "shared/__init__.py" in names and "shared/router.py" in names
    assert not any("__pycache__" in name or name.endswith(".pyc") for name in names)
    schemas = sorted(f"contracts/schemas/{p.name}" for p in (REPO / "contracts" / "schemas").glob("*.schema.json"))
    assert sorted(n for n in names if n.startswith("contracts/")) == [
        "contracts/limits.json", *schemas, "contracts/topics.json",
    ]  # fmt: skip
    assert not any(n.startswith("content/") for n in names)
    with zipfile.ZipFile(tmp_path / "out1" / "admin-api.zip") as archive:
        assert "content/listening-verdicts.json" in archive.namelist()  # G-14 at approval (Phase 20)
        assert not any(n.startswith("art/") for n in archive.namelist())
    with zipfile.ZipFile(tmp_path / "out1" / "picture-gen.zip") as archive:
        names = archive.namelist()
    assert sorted(n for n in names if n.startswith("art/")) == sorted(build_lambdas.FUNCTION_FILES["picture_gen"])
    assert "handler.py" in names and not any(n.startswith("content/") for n in names)
    # Gate P2: one prompt file per picture kind in contracts/limits.json, at kinds/<kind>.md beside handler.py.
    kinds = [k["id"] for k in json.loads((REPO / "contracts" / "limits.json").read_text())["picture"]["kinds"]]
    assert sorted(n for n in names if n.startswith("kinds/")) == sorted(f"kinds/{kind}.md" for kind in kinds)
    # Gate P2 background: its kind file and its one example, the house battle backdrop.
    assert "kinds/background.md" in names and "art/svg/map/luna-backdrop.svg" in names


def test_every_picture_gen_prompt_file_exists() -> None:
    """Every bundled example drawing and every kind file is in the repository, so the build cannot miss one."""
    for relative in build_lambdas.FUNCTION_FILES["picture_gen"]:
        assert (REPO / relative).is_file(), relative
    kinds = [k["id"] for k in json.loads((REPO / "contracts" / "limits.json").read_text())["picture"]["kinds"]]
    for kind in kinds:
        assert (REPO / "api" / "functions" / "picture_gen" / "kinds" / f"{kind}.md").is_file(), kind


def test_function_files_are_required(tmp_path: Path) -> None:
    with pytest.raises(build_lambdas.BuildError, match=r"listening-verdicts\.json is missing"):
        build_lambdas.function_file_entries(tmp_path, "admin_api")
    assert build_lambdas.function_file_entries(tmp_path, "player_api") == {}


def test_contracts_are_required(tmp_path: Path) -> None:
    with pytest.raises(build_lambdas.BuildError, match=r"no limits\.json"):
        build_lambdas.contract_entries(tmp_path / "contracts")


def test_each_zip_imports_with_the_lambda_layout(tmp_path: Path) -> None:
    """Extract each code-only zip and import `handler.handler` from its root, as the Lambda runtime does.

    The runtime dependencies come from the running interpreter's site-packages (the CI `api` job installs them); where
    they are missing (the `scripts` job, the repo-root .venv) the test is skipped.
    """
    pytest.importorskip("aws_lambda_powertools")
    functions = [f for f in build_lambdas.FUNCTIONS if f != "picture_gen" or importlib.util.find_spec("anthropic")]
    built = build_lambdas.build(REPO / "api", tmp_path / "out", deps=None, functions=functions)
    for zip_path in built:
        root = tmp_path / "extracted" / Path(zip_path).stem
        with zipfile.ZipFile(zip_path) as archive:
            archive.extractall(root)
        # shared.rules reads contracts/ at import: it must find the copy inside the zip, not the repository's.
        probe = (
            f"import sys; sys.path.insert(0, {str(root)!r}); import handler; assert callable(handler.handler); "
            f"import shared.rules.contracts as c; assert c.CONTRACTS_DIR == __import__('pathlib').Path({str(root)!r})"
            " / 'contracts', c.CONTRACTS_DIR; assert c.LIMITS['attemptsPerSlot'] == 3; "
            "from shared.rules import reduce; import shared.verdicts as v; import shared.topics as t; "
            "assert t.TOPICS_FILE == c.CONTRACTS_DIR / 'topics.json' and t.TOPICS; "
            f"assert v.verdicts_path() in (None, __import__('pathlib').Path({str(root)!r}) / 'content' / "
            "'listening-verdicts.json'), v.verdicts_path()"
        )
        if Path(zip_path).stem == "picture-gen":
            # Gate P2: every kind's system blocks build from the zip root alone (kinds/*.md and the examples).
            probe += (
                "; kinds = [k['id'] for k in c.LIMITS['picture']['kinds']]; "
                "blocks = [handler.system_blocks(k) for k in kinds]; "
                "assert all(b[2]['text'].startswith('<picture-kind id=') for b in blocks); "
                f"assert all(handler._prompt_file(handler.kind_file(k)).is_relative_to({str(root)!r}) for k in kinds)"
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


# ---------------------------------------------------------------------------
# picture-gen (Phase 42b): its own staging directory and a hash-pinned lock (backlog B-4).
# ---------------------------------------------------------------------------

HASH = "--hash=sha256:" + "a" * 64


def test_adding_picture_gen_leaves_the_other_zips_byte_identical(tmp_path: Path) -> None:
    others = [f for f in build_lambdas.FUNCTIONS if f != "picture_gen"]
    assert len(others) == 4
    alone = build_lambdas.build(REPO / "api", tmp_path / "alone", deps=None, functions=others)
    together = build_lambdas.build(REPO / "api", tmp_path / "all", deps=None)
    alone_by_name = {Path(p).name: h for p, h in alone.items()}
    together_by_name = {Path(p).name: h for p, h in together.items()}
    assert {n: together_by_name[n] for n in alone_by_name} == alone_by_name


def test_each_function_gets_its_own_staging_directory(tmp_path: Path) -> None:
    shared = tmp_path / "deps"
    (shared / "powertools_stub").mkdir(parents=True)
    (shared / "powertools_stub" / "__init__.py").write_text("")
    locked = tmp_path / "deps-picture-gen"
    (locked / "anthropic").mkdir(parents=True)
    (locked / "anthropic" / "__init__.py").write_text("")
    deps = {f: shared for f in build_lambdas.FUNCTIONS} | {"picture_gen": locked}

    build_lambdas.build(REPO / "api", tmp_path / "out", deps=deps)

    with zipfile.ZipFile(tmp_path / "out" / "picture-gen.zip") as archive:
        names = archive.namelist()
    assert "anthropic/__init__.py" in names and "powertools_stub/__init__.py" not in names
    with zipfile.ZipFile(tmp_path / "out" / "tts.zip") as archive:
        names = archive.namelist()
    assert "powertools_stub/__init__.py" in names and "anthropic/__init__.py" not in names


def test_lock_lines_need_hashes_and_plain_files_refuse_them(tmp_path: Path) -> None:
    lock = tmp_path / "lock.txt"
    lock.write_text(f"# header\nanthropic==2.8.0 \\\n    {HASH}\nidna==3.20 {HASH} --hash=sha256:{'b' * 64}\n")
    assert build_lambdas.pinned_versions(lock, require_hashes=True) == {"anthropic": "2.8.0", "idna": "3.20"}
    with pytest.raises(build_lambdas.BuildError, match="not a lock"):
        build_lambdas.pinned_versions(lock)

    unhashed = tmp_path / "unhashed.txt"
    unhashed.write_text(f"anthropic==2.8.0 \\\n    {HASH}\nidna==3.20\n")
    with pytest.raises(build_lambdas.BuildError, match="idna has no --hash"):
        build_lambdas.pinned_versions(unhashed, require_hashes=True)

    for bad, rule in [
        (f"idna==3.20 --hash=md5:{'a' * 32}", "unexpected"),
        (f"idna>=3 {HASH}", "exact pin"),
        (f"idna==3.20 {HASH}\nIDNA==3.21 {HASH}", "pinned twice"),
    ]:
        path = tmp_path / "bad.txt"
        path.write_text(bad + "\n")
        with pytest.raises(build_lambdas.BuildError, match=rule):
            build_lambdas.pinned_versions(path, require_hashes=True)


def test_a_lock_must_keep_the_shared_pins(tmp_path: Path) -> None:
    base = tmp_path / "requirements.txt"
    base.write_text("pydantic==2.14.3\ntzdata==2025.2\n")
    lock = tmp_path / "lock.txt"
    lock.write_text(f"pydantic==2.14.3 {HASH}\ntzdata==2025.2 {HASH}\nanthropic==2.8.0 {HASH}\n")
    assert build_lambdas.check_lock(lock, base)["anthropic"] == "2.8.0"

    lock.write_text(f"pydantic==2.15.0 {HASH}\nanthropic==2.8.0 {HASH}\n")
    expected = r"pydantic 2\.14\.3 \(lock: 2\.15\.0\).*tzdata 2025\.2 \(lock: missing\)"
    with pytest.raises(build_lambdas.BuildError, match=expected):
        build_lambdas.check_lock(lock, base)


def test_the_picture_gen_lock_is_complete_and_consistent() -> None:
    api = REPO / "api"
    lock = api / build_lambdas.LOCKED_REQUIREMENTS["picture_gen"]
    locked = build_lambdas.check_lock(lock, api / build_lambdas.BASE_REQUIREMENTS)
    inputs = build_lambdas.pinned_versions(api / build_lambdas.LOCK_INPUTS["picture_gen"])
    assert inputs, "the lock input pins nothing"
    assert "anthropic" in inputs
    assert {name: locked.get(name) for name in inputs} == inputs  # every top-level pin is locked at that version
    # The bedrock extra's AWS libraries are locked too, at the versions the tests run with (requirements-dev.txt).
    dev = {}
    for raw in (api / "requirements-dev.txt").read_text().splitlines():
        line = raw.split("#", 1)[0].strip()
        if "==" in line:
            name, version = line.split("==", 1)
            dev[build_lambdas._normalise(name.split("[", 1)[0])] = version
    for name in ("boto3", "botocore", "anthropic"):
        assert locked[name] == dev[name], name
    assert "GENERATED by `python3 scripts/build_lambdas.py --lock picture_gen`" in lock.read_text()


def test_locked_functions_install_with_require_hashes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[list[str]] = []

    def fake_run(command: list[str], check: bool) -> None:
        calls.append(command)
        target = Path(command[command.index("--target") + 1])
        requirements = Path(command[command.index("-r") + 1])
        hashed = "--require-hashes" in command
        for name, version in build_lambdas.pinned_versions(requirements, require_hashes=hashed).items():
            (target / f"{name.replace('-', '_')}-{version}.dist-info").mkdir(parents=True)

    monkeypatch.setattr(build_lambdas.subprocess, "run", fake_run)
    deps = build_lambdas.install_all(REPO / "api", tmp_path)

    by_file = {Path(c[c.index("-r") + 1]).name: c for c in calls}
    assert sorted(by_file) == ["requirements-picture-gen.txt", "requirements.txt"]
    assert "--require-hashes" in by_file["requirements-picture-gen.txt"]
    assert "--require-hashes" not in by_file["requirements.txt"]
    for command in calls:
        assert "--isolated" in command and "--only-binary=:all:" in command and "3.14" in command
    assert deps["picture_gen"] == tmp_path / "deps-picture-gen"
    assert {deps[f] for f in build_lambdas.FUNCTIONS if f != "picture_gen"} == {tmp_path / "deps"}


def test_lock_rendering_round_trips(tmp_path: Path) -> None:
    wheels = tmp_path / "wheels"
    wheels.mkdir()
    (wheels / "anthropic-2.8.0-py3-none-any.whl").write_bytes(b"one")
    (wheels / "jiter-0.19.0-cp314-cp314-manylinux2014_aarch64.manylinux_2_17_aarch64.whl").write_bytes(b"two")
    (wheels / "python_dateutil-2.9.0.post0-py2.py3-none-any.whl").write_bytes(b"three")
    pins = build_lambdas.wheel_pins(wheels)
    assert pins["python-dateutil"][0] == "2.9.0.post0" and pins["jiter"][0] == "0.19.0"
    lock = tmp_path / "lock.txt"
    lock.write_text(build_lambdas.render_lock("picture_gen", pins))
    assert build_lambdas.pinned_versions(lock, require_hashes=True) == {n: v for n, (v, _) in pins.items()}
    (wheels / "anthropic-2.8.0.tar.gz").write_bytes(b"sdist")
    with pytest.raises(build_lambdas.BuildError, match="not a wheel"):
        build_lambdas.wheel_pins(wheels)
