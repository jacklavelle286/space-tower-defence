#!/usr/bin/env python3
"""Repository invariants (gate G-5, plan H.10; staged per docs/build-phases.md).

Rules in force from Phase 6:

  workflow-destroy               no file under .github/ contains "destroy" (any case): no workflow may destroy anything
  workflow-auto-approve          no file under .github/ contains "-auto-approve": every apply is of a reviewed, saved plan
  workflow-update-function-code  no file under .github/ contains "update-function-code" (or the SDK spelling
                                 update_function_code): Terraform alone owns Lambda code (H.9.1)
  custom-error-response          no Terraform file under infrastructure/ declares a custom_error_response block: it applies
                                 to the whole distribution and would rewrite /api/* errors into index.html (H.4.2, M1-07)

Rule in force from Phase 9:

  lambda-alarms                  every `module` block in a .tf file under infrastructure/ whose source is the
                                 lambda_function module (source ending in modules/lambda_function) sets the input
                                 alarm_topic_arn to something other than null: the module creates the function's Errors
                                 and Throttles alarms on that topic (H.14), so a fifth function cannot arrive without them

The last G-5 rule, "both tables in the backup selection", arrives with its subject in Phase 33. Adding it earlier would
fail every release in between.

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


# lambda-alarms: a module call is found by brace-matching after `module "<name>" {`, with strings, comments and
# heredocs blanked first so a brace inside them does not count. .tf.json module calls are not parsed (there are none).
LAMBDA_MODULE_SOURCE = re.compile(r'^[ \t]*source\s*=\s*"(?:[^"]*/)?modules/lambda_function/?"\s*$', re.MULTILINE)
ALARM_INPUT = "alarm_topic_arn"
ALARM_INPUT_SET = re.compile(rf"^[ \t]*{ALARM_INPUT}\s*=\s*(?!null\s*$)\S", re.MULTILINE)
MODULE_START = re.compile(r'^[ \t]*module\s+"([^"]+)"\s*\{', re.MULTILINE)
HEREDOC = re.compile(r"<<-?\s*([A-Za-z_][A-Za-z0-9_]*)\n.*?^\s*\1\s*$", re.MULTILINE | re.DOTALL)
LAMBDA_ALARMS_MESSAGE = (f"a lambda_function module call must set {ALARM_INPUT} (the alarm topic): every function gets "
                         "Errors and Throttles alarms (H.14)")


def _blank(text: str, keep_strings: bool) -> str:
    """Replace comments and heredoc bodies (and, unless keep_strings, string contents) with spaces, keeping every
    newline and offset, so offsets in the result are offsets in the original."""
    text = HEREDOC.sub(lambda m: re.sub(r"[^\n]", " ", m.group(0)), text)
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        if c == '"':
            j = i + 1
            while j < n and text[j] not in '"\n':
                j += 2 if text[j] == "\\" else 1
            j = min(j, n - 1)
            out.append(text[i:j + 1] if keep_strings else '"' + " " * (j - i - 1) + (text[j] if text[j] == '"' else " "))
            i = j + 1
        elif c == "#" or text.startswith("//", i):
            j = text.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
        elif text.startswith("/*", i):
            j = text.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append(re.sub(r"[^\n]", " ", text[i:j]))
            i = j
        else:
            out.append(c)
            i += 1
    return "".join(out)


def _module_blocks(text: str) -> list[tuple[str, int, str]]:
    """(name, line, block text without comments) for every module block."""
    braces = _blank(text, keep_strings=False)  # a brace inside a string or comment does not count
    code = _blank(text, keep_strings=True)
    blocks: list[tuple[str, int, str]] = []
    for m in MODULE_START.finditer(braces):
        depth, end = 0, len(braces)
        for k in range(m.end() - 1, len(braces)):
            if braces[k] == "{":
                depth += 1
            elif braces[k] == "}":
                depth -= 1
                if depth == 0:
                    end = k + 1
                    break
        name = MODULE_START.match(code, m.start())
        blocks.append((name.group(1) if name else "?", braces.count("\n", 0, m.start()) + 1, code[m.start():end]))
    return blocks


def check_lambda_alarms(repo: Path) -> list[Violation]:
    found: list[Violation] = []
    for path in _files(repo / "infrastructure"):
        if not path.name.endswith(".tf"):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        for name, line, block in _module_blocks(text):
            if LAMBDA_MODULE_SOURCE.search(block) and not ALARM_INPUT_SET.search(block):
                found.append(Violation(path.relative_to(repo), line, "lambda-alarms", LAMBDA_ALARMS_MESSAGE,
                                       f'module "{name}"'))
    return found


def check(repo: Path) -> list[Violation]:
    return check_github(repo) + check_terraform(repo) + check_lambda_alarms(repo)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Gate G-5: repository invariants (workflow strings, custom_error_response, Lambda alarms).")
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
    rules = len(WORKFLOW_RULES) + len(TERRAFORM_RULES) + 1  # + lambda-alarms
    print(f"check_invariants: OK: {rules} G-5 rules hold")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
