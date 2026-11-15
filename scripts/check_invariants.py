#!/usr/bin/env python3
"""Repository invariants (gate G-5, plan H.10; staged per docs/build-phases.md).

Rules in force from Phase 6:

  workflow-destroy               no file under .github/ contains "destroy" (any case): no workflow may destroy anything
  workflow-auto-approve          no file under .github/ contains "-auto-approve": every apply is of a reviewed, saved plan
  workflow-update-function-code  no file under .github/ contains "update-function-code" (or the SDK spelling
                                 update_function_code): Terraform alone owns Lambda code (H.9.1)
  custom-error-response          no Terraform file under infrastructure/ declares a custom_error_response block: it applies
                                 to the whole distribution and would rewrite /api/* errors into index.html (H.4.2, M1-07)

Later G-5 rules arrive with their subjects: "every lambda_function call has alarms" in Phase 9, "both tables in the
backup selection" in Phase 33. Adding either earlier would fail every release in between.

The workflow rules match comments too, on purpose: they mirror the plan's check
`grep -rn -- 'destroy\\|-auto-approve\\|update-function-code' .github/`, and a comment explaining a destroy is still a
sign that one is nearby. The Terraform rule matches code only, so a comment explaining why there is no
custom_error_response (infrastructure/modules/static_site/main.tf) passes.

Exit codes:
  0  every rule holds
  1  at least one violation (each printed as `path:line: rule: message`)
  2  the repository root is wrong (no .github/workflows/ or no infrastructure/)

Standard library only; runs on Python 3.12 and 3.14.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

EXIT_OK = 0
EXIT_VIOLATION = 1
EXIT_BAD_INPUT = 2

REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class Rule:
    name: str
    pattern: re.Pattern[str]
    message: str


# Text rules over every file under .github/ (comments included).
WORKFLOW_RULES: tuple[Rule, ...] = (
    Rule(
        "workflow-destroy",
        re.compile(r"destroy", re.IGNORECASE),
        "no workflow may contain 'destroy' (H.7 W-1: there is no destroy path once real resources exist)",
    ),
    Rule(
        "workflow-auto-approve",
        re.compile(r"-auto-approve"),
        "no '-auto-approve': apply only a saved, reviewed plan (H.8)",
    ),
    Rule(
        "workflow-update-function-code",
        re.compile(r"update[-_]function[-_]code", re.IGNORECASE),
        "no 'update-function-code': Terraform owns Lambda code via s3_key and source_code_hash (H.9.1)",
    ),
)

# Code rules over Terraform under infrastructure/. Each pattern is anchored at the start of a line (after
# indentation), so a line that is a comment never matches.
TERRAFORM_RULES: tuple[Rule, ...] = (
    Rule(
        "custom-error-response",
        re.compile(
            r'^\s*(?:custom_error_response\s*[{=]'  # block (or attribute) form in .tf
            r'|dynamic\s+"custom_error_response"'  # dynamic block in .tf
            r'|"custom_error_response"\s*:)'  # key in .tf.json
        ),
        "no custom_error_response: it rewrites /api/* errors into index.html; the SPA fallback is a CloudFront "
        "Function on the default behaviour only (H.4.2)",
    ),
)

TERRAFORM_SUFFIXES = (".tf", ".tf.json")
SKIPPED_DIRS = {".terraform", "node_modules", "__pycache__"}


@dataclass(frozen=True)
class Violation:
    path: Path
    line: int
    rule: str
    message: str
    text: str


def _files(root: Path) -> list[Path]:
    return sorted(
        p for p in root.rglob("*") if p.is_file() and not SKIPPED_DIRS.intersection(p.relative_to(root).parts)
    )


def _scan(path: Path, rules: tuple[Rule, ...], repo: Path) -> list[Violation]:
    text = path.read_text(encoding="utf-8", errors="replace")
    found: list[Violation] = []
    for number, line in enumerate(text.splitlines(), start=1):
        for rule in rules:
            if rule.pattern.search(line):
                found.append(Violation(path.relative_to(repo), number, rule.name, rule.message, line.strip()))
    return found


def check_github(repo: Path) -> list[Violation]:
    found: list[Violation] = []
    for path in _files(repo / ".github"):
        found.extend(_scan(path, WORKFLOW_RULES, repo))
    return found


def check_terraform(repo: Path) -> list[Violation]:
    found: list[Violation] = []
    for path in _files(repo / "infrastructure"):
        if path.name.endswith(TERRAFORM_SUFFIXES):
            found.extend(_scan(path, TERRAFORM_RULES, repo))
    return found


def check(repo: Path) -> list[Violation]:
    return check_github(repo) + check_terraform(repo)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Gate G-5: repository invariants (workflow strings, custom_error_response).")
    parser.add_argument("--root", type=Path, default=REPO_ROOT, help="repository root (default: this script's repository)")
    args = parser.parse_args(argv)
    repo: Path = args.root.resolve()

    for required in (".github/workflows", "infrastructure"):
        if not (repo / required).is_dir():
            print(f"check_invariants: error: {repo / required} is not a directory (wrong --root?)", file=sys.stderr)
            return EXIT_BAD_INPUT

    violations = check(repo)
    for v in violations:
        print(f"{v.path}:{v.line}: {v.rule}: {v.message}\n    {v.text}")
    if violations:
        print(f"check_invariants: FAILED: {len(violations)} violation(s) of G-5", file=sys.stderr)
        return EXIT_VIOLATION
    rules = len(WORKFLOW_RULES) + len(TERRAFORM_RULES)
    print(f"check_invariants: OK: {rules} G-5 rules hold")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
