#!/usr/bin/env python3
"""Refuse a stale or already-used saved plan before apply.yml applies it (Phase 4 exit criterion).

    python scripts/apply_guard.py --plan-run-id N --plan-created <plan-info.json LastModified> \
        --markers <aws s3api list-objects-v2 --prefix applied/ output, JSON>

Terraform already refuses a saved plan whose state changed since the plan ("Saved plan is stale", H.8.2 step 5).
This is a second, explicit check that does not depend on that, and that also covers a plan whose apply changed
nothing in state:

  * apply.yml writes `applied/<plan_run_id>.json` (create-only) in the artefacts bucket immediately BEFORE it runs
    `terraform apply`. The marker means "an apply of this plan was started"; even a failed apply may have changed state.
  * A plan is refused when
      1. its own marker exists (it was applied, or an apply of it was started: dispatch a new release), or
      2. any marker is newer than the plan itself (the plan was made before the last apply started, so it describes
         a state that no longer exists). "The plan itself" is the LastModified time of `plans/<id>/plan-info.json`,
         the completion marker the plan job uploads last.
    Both times come from S3, so no runner clock is involved. release.yml and apply.yml share one concurrency group,
    so no apply can start between a plan and its plan-info.json upload.

Exit 0 (fresh) or 1 (refused, reason on stderr). Standard library only; runs on Python 3.12 and 3.14.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Any

MARKER = re.compile(r"^applied/([0-9]+)\.json$")


@dataclass(frozen=True)
class Marker:
    plan_run_id: str
    last_modified: datetime


def parse_time(value: str) -> datetime:
    """S3 timestamps as the CLI prints them: 2026-11-15T09:08:41+00:00 or ...Z."""
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError(f"timestamp without a time zone: {value!r}")
    return dt


def parse_markers(listing: Any) -> list[Marker]:
    """list-objects-v2 JSON (an empty prefix gives no Contents, or the CLI prints nothing at all)."""
    if listing in (None, "", {}):
        return []
    markers = []
    for obj in listing.get("Contents", []) or []:
        match = MARKER.match(obj.get("Key", ""))
        if match is None:
            raise ValueError(f"unexpected object under applied/: {obj.get('Key')!r}")
        markers.append(Marker(match.group(1), parse_time(obj["LastModified"])))
    return markers


def decide(plan_run_id: str, plan_created: datetime, markers: list[Marker]) -> str | None:
    """None when the plan may be applied, otherwise the reason it is refused."""
    for m in markers:
        if m.plan_run_id == plan_run_id:
            return (f"plan {plan_run_id} has already been applied (or an apply of it was started at "
                    f"{m.last_modified:%Y-%m-%d %H:%M:%SZ}). A saved plan is applied once: dispatch release.yml again.")
    newer = [m for m in markers if m.last_modified >= plan_created]
    if newer:
        latest = max(newer, key=lambda m: m.last_modified)
        return (f"plan {plan_run_id} is stale: it was made at {plan_created:%Y-%m-%d %H:%M:%SZ}, before the apply of "
                f"plan {latest.plan_run_id} started at {latest.last_modified:%Y-%m-%d %H:%M:%SZ}. "
                "Dispatch release.yml again for a fresh plan.")
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Refuse a stale or already-applied saved plan.")
    parser.add_argument("--plan-run-id", required=True)
    parser.add_argument("--plan-created", required=True, help="LastModified of plans/<id>/plan-info.json")
    parser.add_argument("--markers", required=True, help="file with the list-objects-v2 JSON for prefix applied/")
    args = parser.parse_args(argv)

    if not re.fullmatch(r"[0-9]{1,20}", args.plan_run_id):
        print(f"apply_guard: error: plan run ID {args.plan_run_id!r} is not a number", file=sys.stderr)
        return 1
    try:
        with open(args.markers, encoding="utf-8") as fh:
            text = fh.read().strip()
        markers = parse_markers(json.loads(text) if text else None)
        created = parse_time(args.plan_created)
    except (OSError, ValueError, KeyError) as exc:
        print(f"apply_guard: error: {exc}", file=sys.stderr)
        return 1

    reason = decide(args.plan_run_id, created, markers)
    if reason:
        print(f"apply_guard: refused: {reason}", file=sys.stderr)
        return 1
    print(f"apply_guard: plan {args.plan_run_id} is fresh ({len(markers)} earlier apply marker(s), none newer than the plan)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
