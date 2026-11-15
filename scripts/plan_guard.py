#!/usr/bin/env python3
"""Plan guard (gate G-7, plan H.11.2).

Reads the JSON form of a saved plan (`terraform show -json tfplan`) and lists every resource change that
deletes or replaces a resource whose type is protected in `infrastructure/plan-guard.json`:

    { "enforce": false, "protected_types": ["aws_dynamodb_table", ...] }

The report (Markdown) goes to stdout, so the workflow can append it to the run summary.

Exit codes:
  0  nothing protected is deleted or replaced, or `enforce` is false (report mode, before the data freeze)
  1  `enforce` is true and at least one protected resource would be deleted or replaced
  2  the plan or the config file could not be read

Standard library only; runs on Python 3.12 and 3.14.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

EXIT_OK = 0
EXIT_VIOLATION = 1
EXIT_BAD_INPUT = 2


class GuardInputError(Exception):
    """The plan or the guard config is missing or malformed."""


@dataclass(frozen=True)
class GuardConfig:
    enforce: bool
    protected_types: frozenset[str]


@dataclass(frozen=True)
class Finding:
    address: str
    type: str
    action: str  # "replace" or "delete"
    reason: str | None  # Terraform's action_reason, when it gives one
    deposed: str | None  # deposed object key, when the change removes a deposed object


def load_json(path: Path, what: str) -> Any:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise GuardInputError(f"cannot read the {what} {path}: {exc.strerror}") from exc
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise GuardInputError(f"the {what} {path} is not valid JSON: {exc}") from exc


def parse_config(data: Any) -> GuardConfig:
    if not isinstance(data, dict):
        raise GuardInputError("plan-guard config must be a JSON object")
    enforce = data.get("enforce")
    if not isinstance(enforce, bool):
        raise GuardInputError('plan-guard config: "enforce" must be true or false')
    types = data.get("protected_types")
    if not isinstance(types, list) or not types or not all(isinstance(t, str) and t for t in types):
        raise GuardInputError('plan-guard config: "protected_types" must be a non-empty list of resource type names')
    return GuardConfig(enforce=enforce, protected_types=frozenset(types))


def find_protected_changes(plan: Any, config: GuardConfig) -> list[Finding]:
    """Every resource change whose actions contain "delete" (a replace contains it too) on a protected type."""
    if not isinstance(plan, dict) or "format_version" not in plan:
        raise GuardInputError("the plan is not `terraform show -json` output (no format_version)")
    changes = plan.get("resource_changes", [])  # absent when the plan has no resource changes
    if not isinstance(changes, list):
        raise GuardInputError('the plan\'s "resource_changes" is not a list')

    findings: list[Finding] = []
    for rc in changes:
        try:
            rtype = rc["type"]
            actions = rc["change"]["actions"]
            address = rc["address"]
        except (KeyError, TypeError) as exc:
            raise GuardInputError(f"malformed resource_changes entry (missing {exc})") from exc
        if "delete" not in actions or rtype not in config.protected_types:
            continue
        findings.append(
            Finding(
                address=address,
                type=rtype,
                action="replace" if "create" in actions else "delete",
                reason=rc.get("action_reason"),
                deposed=rc.get("deposed"),
            )
        )
    return sorted(findings, key=lambda f: f.address)


def render_report(findings: list[Finding], config: GuardConfig) -> str:
    mode = "enforcing" if config.enforce else "report only (enforce: false, before the data freeze)"
    lines = ["### Plan guard (G-7)", "", f"Mode: {mode}.", ""]
    if not findings:
        lines.append("No protected resource is deleted or replaced.")
        return "\n".join(lines) + "\n"

    verdict = "**This plan is refused.**" if config.enforce else "**Warning:** read these before you apply."
    lines += [
        f"{verdict} {len(findings)} protected resource(s) would be deleted or replaced:",
        "",
        "| Address | Type | Action | Reason |",
        "|---|---|---|---|",
    ]
    for f in findings:
        address = f"`{f.address}`" + (f" (deposed `{f.deposed}`)" if f.deposed else "")
        lines.append(f"| {address} | `{f.type}` | {f.action} | {f.reason or '-'} |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="List deletes and replaces of protected resource types in a Terraform plan.")
    parser.add_argument("plan_json", type=Path, help="output of `terraform show -json tfplan`")
    parser.add_argument("--config", type=Path, required=True, help="infrastructure/plan-guard.json")
    args = parser.parse_args(argv)

    try:
        config = parse_config(load_json(args.config, "plan-guard config"))
        findings = find_protected_changes(load_json(args.plan_json, "plan"), config)
    except GuardInputError as exc:
        print(f"plan_guard: error: {exc}", file=sys.stderr)
        return EXIT_BAD_INPUT

    sys.stdout.write(render_report(findings, config))
    for f in findings:
        # Workflow command on stderr: shows as an annotation on the run without landing in the summary.
        level = "error" if config.enforce else "warning"
        print(f"::{level}::Plan guard: {f.address} ({f.type}) would be {f.action}d", file=sys.stderr)
    return EXIT_VIOLATION if findings and config.enforce else EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
