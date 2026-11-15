#!/usr/bin/env python3
"""Load the seed drafts in content/seed/ into the `content` table, create-only (Phase 20, M1-19; D §D8.6, F §12.6 C8).

    content/seed/speech/<speechId>.json        a speech definition: speechId, title, kind, text | ssml
    content/seed/activities/<activityId>.json  an activity definition (C22.1 subset, see api/shared/content.py)

Each seed becomes a header and a DRAFT, built by the same functions `admin-api` uses for R18/R23, so a seeded draft is
exactly what the admin app would have created. Nothing is approved or published here: each draft then goes through
preview -> listen -> approve (speech) or validate -> preview-solve -> checklist -> publish (activities) in the admin
app.

Safety:
  - dry run by default: only reads (GetItem) and reports what it would create; `--apply` writes;
  - create-only: header and draft are put in one transaction, each with attribute_not_exists(pk), so an existing item is
    never overwritten; an ID that already exists is reported "skipped, exists";
  - every seed is checked first (the activity definition checks, the SSML allow-list, and G-14 for PHONEME), and any
    problem stops the run before anything is read or written.

Usage (the owner runs it; it writes data, not infrastructure):
  api/.venv/bin/python scripts/seed_content.py --profile space-tower-defence             # dry run
  api/.venv/bin/python scripts/seed_content.py --profile space-tower-defence --dry-run   # the same, explicit
  api/.venv/bin/python scripts/seed_content.py --profile space-tower-defence --apply     # create

Exit codes: 0 done; 1 a seed file has a problem (nothing written); 2 an AWS call failed, or a usage error (argparse
prints "usage:" first in that case; nothing is read or written).
Output names IDs only, never speech text.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "api"))

from botocore.exceptions import BotoCoreError, ClientError  # noqa: E402

from shared.clipkey import KINDS, SSML_TAGS, ClipInputError, speech_ssml  # noqa: E402
from shared.content import (  # noqa: E402
    ACT_PK,
    KEY_ID,
    SPEECH_PK,
    definition_problems,
    new_activity_items,
    new_speech_items,
    valid_title,
)
from shared.data import DynamoTable, cancellation_reasons  # noqa: E402
from shared.verdicts import phoneme_refusal  # noqa: E402

EXIT_OK, EXIT_BAD_SEED, EXIT_AWS = 0, 1, 2
SEED_DIR = REPO / "content" / "seed"
DEFAULT_TABLE = "space-tower-defence-prod-content"
DEFAULT_REGION = "eu-west-2"
SEEDED_BY = "seed-script"  # audit field: no operator token here
SPEECH_FIELDS = {"$comment", "speechId", "title", "kind", "text", "ssml"}


class SeedError(Exception):
    """A seed file that must not be loaded."""


@dataclass(frozen=True)
class Seed:
    kind: str  # "speech" or "activity"
    item_id: str
    header: dict[str, Any]
    draft: dict[str, Any]


def _read(path: Path) -> dict[str, Any]:
    try:
        doc = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SeedError(f"{path.name}: not readable JSON") from error
    if not isinstance(doc, dict):
        raise SeedError(f"{path.name}: not a JSON object")
    return doc


def speech_seed(path: Path, at: datetime) -> Seed:
    doc = _read(path)
    problems = [f"unknown field {name}" for name in doc if name not in SPEECH_FIELDS]
    speech_id, kind, title = doc.get("speechId"), doc.get("kind"), doc.get("title")
    if not (isinstance(speech_id, str) and KEY_ID.fullmatch(speech_id)):
        problems.append("speechId pattern")
    if speech_id != path.stem:
        problems.append("file name must be <speechId>.json")
    if kind not in KINDS:
        problems.append("kind enum")
    if not valid_title(title):
        problems.append("title")
    if ("text" in doc) == ("ssml" in doc):
        problems.append("exactly one of text or ssml")
    if problems:
        raise SeedError(f"{path.name}: {'; '.join(problems)}")
    text, ssml = doc.get("text"), doc.get("ssml")
    for engine in sorted(SSML_TAGS):  # it must check on either engine a kind can be configured to use
        try:
            speech_ssml(engine, text=text, ssml=ssml)
        except ClipInputError as error:
            raise SeedError(f"{path.name}: {error.field} {error.rule} ({engine})") from None
    if kind == "PHONEME":
        refusal = phoneme_refusal(str(speech_id))
        if refusal is not None:
            raise SeedError(f"{path.name}: {refusal} (G-14, content/listening-verdicts.json)")
    header, draft = new_speech_items(
        speech_id=str(speech_id), title=str(title), kind=str(kind), by=SEEDED_BY, at=at, text=text, ssml=ssml
    )
    return Seed("speech", str(speech_id), header, draft)


def activity_seed(path: Path, at: datetime) -> Seed:
    doc = _read(path)
    doc.pop("$comment", None)
    problems = definition_problems(doc, path.stem)
    if problems:
        shown = ", ".join(f"{p['field']} {p['rule']}" for p in problems)
        raise SeedError(f"{path.name}: {shown}")
    header, draft = new_activity_items(definition=doc, by=SEEDED_BY, at=at)
    return Seed("activity", path.stem, header, draft)


def load_seeds(seed_dir: Path, at: datetime) -> list[Seed]:
    """Speech first, so an activity's references exist before it does. Sorted, so the report is stable."""
    seeds = [speech_seed(p, at) for p in sorted((seed_dir / "speech").glob("*.json"))]
    seeds += [activity_seed(p, at) for p in sorted((seed_dir / "activities").glob("*.json"))]
    return seeds


def _header_key(seed: Seed) -> tuple[str, str]:
    return (SPEECH_PK if seed.kind == "speech" else ACT_PK), seed.item_id


def apply_seed(table: DynamoTable, seed: Seed) -> str:
    """Create header + draft in one create-only transaction: "created" or "skipped, exists"."""
    actions = [
        table.put_action(seed.header, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
        table.put_action(seed.draft, condition="attribute_not_exists(#pk)", names={"#pk": "pk"}),
    ]
    try:
        table.transact_write(actions)
    except ClientError as error:
        reasons = cancellation_reasons(error)
        if reasons and any(r.code == "ConditionalCheckFailed" for r in reasons):
            return "skipped, exists"
        raise
    return "created"


def run(table: DynamoTable, seeds: Sequence[Seed], *, apply: bool) -> list[str]:
    lines = []
    for seed in seeds:
        exists = table.get_item(*_header_key(seed), attributes=("pk",)) is not None
        if exists:
            outcome = "skipped, exists"
        elif not apply:
            outcome = "would create (dry run)"
        else:
            outcome = apply_seed(table, seed)
        lines.append(f"{seed.kind} {seed.item_id}: {outcome}")
    return lines


def _client(profile: str | None, region: str) -> Any:
    import boto3

    return boto3.Session(profile_name=profile, region_name=region).client("dynamodb")


def main(argv: list[str] | None = None, client_factory: Callable[[str | None, str], Any] = _client) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="write (default: dry run, reads only)")
    mode.add_argument("--dry-run", action="store_true", help="read only and report (the default; explicit form)")
    parser.add_argument("--table", default=DEFAULT_TABLE, help=f"content table (default {DEFAULT_TABLE})")
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--profile", default=None, help="AWS profile (default: the environment's credentials)")
    parser.add_argument("--seed-dir", type=Path, default=SEED_DIR, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    try:
        seeds = load_seeds(args.seed_dir, datetime.now(UTC))
    except SeedError as error:
        print(f"seed problem, nothing written: {error}", file=sys.stderr)
        return EXIT_BAD_SEED
    mode = "APPLY" if args.apply else "DRY RUN (add --apply to write)"
    print(f"{mode}: {len(seeds)} seed(s) -> table {args.table} ({args.region})")
    try:
        lines = run(DynamoTable(client_factory(args.profile, args.region), args.table), seeds, apply=args.apply)
    except (ClientError, BotoCoreError) as error:
        code = error.response.get("Error", {}).get("Code") if isinstance(error, ClientError) else None
        print(f"AWS call failed: {code or type(error).__name__}", file=sys.stderr)
        return EXIT_AWS
    for line in lines:
        print(line)
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
