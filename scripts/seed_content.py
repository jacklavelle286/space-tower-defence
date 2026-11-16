#!/usr/bin/env python3
"""Load the seed drafts in content/seed/ into the `content` table, create-only (Phase 20, M1-19; D §D8.6, F §12.6 C8).

    content/seed/speech/<speechId>.json        a speech definition: speechId, title, kind, text | ssml
    content/seed/activities/<activityId>.json  an activity definition (C22.1 subset, see api/shared/content.py)

Each seed becomes a header and a DRAFT, built by the same functions `admin-api` uses for R18/R23, so a seeded draft is
exactly what the admin app would have created. Without --publish nothing is approved or published here: each draft
then goes through preview -> listen -> approve (speech) or validate -> preview-solve -> checklist -> publish
(activities) in the admin app. Speech is never approved here (approval needs a rendered, listened-to clip).

--publish (ADR-0028, the auto-published starter pack): after creating an activity's draft as above, an activity with
no published version is published with the same checks and item builders as admin-api publish (R27,
shared/content.py `publish_checks` and `publish_actions`): every definition check (with the header, so the topic
registry rules apply), speech references resolved to their approved versions, definitionHash, the header moved to
PUBLISHED, the audit item, all in R27's one conditional transaction. The version's review record is every checklist
line ticked, `previewSolvedDraftRevision` = the draft revision, `seeded: true` and the note SEED_NOTE; `publishedBy` is
"seed_content.py". Per activity:
  - already published (or retired)               -> skipped, never re-published;
  - an existing draft whose definition differs from the file -> skipped and reported, never overwritten or published;
  - a referenced speech definition not approved  -> failed (speech_not_approved), the others carry on;
  - any other check problem or a refused write   -> failed with the rules, the others carry on.
A bad activity file is a failure of that activity only (without --publish it still stops the run, as before). The run
ends with a report (created / published / skipped / failed, with reasons) and exits 3 if anything failed.

Safety:
  - dry run by default: only reads (GetItem, plus a Query of the versions of a speech ID that has no header) and reports
    what it would create; `--apply` writes;
  - create-only: header and draft are put in one transaction, each with attribute_not_exists(pk), so an existing item is
    never overwritten; an ID that already exists is reported "skipped, exists"; a speech ID with no header but with
    approved versions left by an unfinished R32 delete is not created (reported, failed with --publish), and nothing
    is deleted here;
  - every seed is checked first (the activity definition checks, the SSML allow-list, and G-14 for PHONEME), and any
    problem stops the run before anything is read or written.

Usage (the owner runs it; it writes data, not infrastructure):
  api/.venv/bin/python scripts/seed_content.py --profile space-tower-defence             # dry run
  api/.venv/bin/python scripts/seed_content.py --profile space-tower-defence --dry-run   # the same, explicit
  api/.venv/bin/python scripts/seed_content.py --profile space-tower-defence --apply     # create
  api/.venv/bin/python scripts/seed_content.py --profile space-tower-defence --dry-run --publish  # what --publish does
  api/.venv/bin/python scripts/seed_content.py --profile space-tower-defence --apply --publish    # create + publish

Exit codes: 0 done; 1 a seed file has a problem (nothing written; with --publish only a bad speech file does this);
2 an AWS call failed, or a usage error (argparse prints "usage:" first in that case; nothing is read or written);
3 (--publish) at least one activity failed (or would fail, in a dry run); the others were still processed.
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
    CHECKLIST,
    DRAFT_SK,
    KEY_ID,
    SPEECH_PK,
    activity_pk,
    as_int,
    checklist_problems,
    definition_problems,
    leftover_version_sks,
    new_activity_items,
    new_speech_items,
    plain,
    publish_actions,
    publish_checks,
    speech_pk,
    valid_title,
)
from shared.data import BatchGetIncomplete, DynamoTable, cancellation_reasons, error_code  # noqa: E402
from shared.verdicts import phoneme_refusal  # noqa: E402

EXIT_OK, EXIT_BAD_SEED, EXIT_AWS, EXIT_FAILED = 0, 1, 2, 3
SEED_DIR = REPO / "content" / "seed"
DEFAULT_TABLE = "space-tower-defence-prod-content"
DEFAULT_REGION = "eu-west-2"
SEEDED_BY = "seed-script"  # audit field: no operator token here
PUBLISHED_BY = "seed_content.py"  # publishedBy and the publish audit item's `by` (ADR-0028)
SEED_NOTE = "Starter pack, auto-published by seed_content.py (ADR-0028)"
CATEGORIES = ("created", "published", "skipped", "failed")
FATAL_CODES = ("AccessDeniedException", "UnrecognizedClientException", "ResourceNotFoundException")  # stop: exit 2
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
    problems = definition_problems(doc, path.stem)  # with the topic registry checks: a seed is never published
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


def unfinished_delete(table: DynamoTable, seed: Seed) -> str | None:
    """For a speech seed whose header is missing: why it is not created when an R32 delete stopped part way and left
    approved versions under the ID (they would show as the new definition's history). None otherwise. Seeding stays
    create-only: it never deletes them; R18 (creating the ID in the admin app) does, as a retry of the delete would."""
    if seed.kind != "speech":
        return None
    leftovers = leftover_version_sks(table, speech_pk(seed.item_id))
    if not leftovers:
        return None
    return (
        f"not created: {len(leftovers)} approved version(s) left by an unfinished delete; "
        "create the ID in the admin app (it removes them) or retry the delete"
    )


def run(table: DynamoTable, seeds: Sequence[Seed], *, apply: bool) -> list[str]:
    lines = []
    for seed in seeds:
        exists = table.get_item(*_header_key(seed), attributes=("pk",)) is not None
        leftover = None if exists else unfinished_delete(table, seed)
        if exists:
            outcome = "skipped, exists"
        elif leftover is not None:
            outcome = f"skipped, {leftover}"
        elif not apply:
            outcome = "would create (dry run)"
        else:
            outcome = apply_seed(table, seed)
        lines.append(f"{seed.kind} {seed.item_id}: {outcome}")
    return lines


# --- --publish (ADR-0028) -------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Outcome:
    category: str  # one of CATEGORIES
    kind: str
    item_id: str
    detail: str


def load_publish_seeds(seed_dir: Path, at: datetime) -> tuple[list[Seed], list[Outcome]]:
    """As load_seeds, except that a bad activity file is a failure of that activity only (a bad speech file still
    raises SeedError: activities may depend on it)."""
    seeds = [speech_seed(p, at) for p in sorted((seed_dir / "speech").glob("*.json"))]
    failed: list[Outcome] = []
    for path in sorted((seed_dir / "activities").glob("*.json")):
        try:
            seeds.append(activity_seed(path, at))
        except SeedError as error:
            failed.append(Outcome("failed", "activity", path.stem, str(error).removeprefix(f"{path.name}: ")))
    return seeds, failed


def _shown(problems: Sequence[dict[str, str]]) -> str:
    return ", ".join(f"{p['field']} {p['rule']}" for p in problems)


def publish_seed(table: DynamoTable, seed: Seed, *, apply: bool, now: Callable[[], datetime]) -> list[Outcome]:
    """Create the activity's draft if it is missing, then publish it if it has no published version (R27's checks
    and transaction). A dry run reads only and reports what would happen."""
    activity_id = seed.item_id

    def outcome(category: str, detail: str) -> Outcome:
        return Outcome(category, "activity", activity_id, detail)

    out: list[Outcome] = []
    header = table.get_item(ACT_PK, activity_id)
    if header is None and not apply:
        out.append(outcome("created", "would create (dry run)"))
        header, draft = seed.header, seed.draft  # what the create would write
    else:
        if header is None:
            created = apply_seed(table, seed)
            out.append(outcome("created" if created == "created" else "skipped", created))
            header = table.get_item(ACT_PK, activity_id)
        draft = table.get_item(activity_pk(activity_id), DRAFT_SK)
    if header is None or draft is None:
        return [*out, outcome("failed", "header or draft missing")]
    if header.get("publishedVersion"):
        state = header.get("state")
        return [*out, outcome("skipped", f"already published ({header['publishedVersion']}, {state})")]
    if plain(draft.get("definition")) != plain(seed.draft["definition"]):
        return [*out, outcome("skipped", "existing draft differs from the seed file: not overwritten, not published")]
    revision = as_int(draft.get("draftRevision"))
    if revision is None:
        return [*out, outcome("failed", "draftRevision missing")]
    review = {"checklist": dict.fromkeys(CHECKLIST, True), "previewSolvedDraftRevision": revision}
    problems = checklist_problems(review, revision)  # R27's review shape; seeded + note are added by the builder
    checks, resolved = publish_checks(table, header, draft, activity_id)
    problems += checks
    if problems:
        return [*out, outcome("failed", _shown(problems) + (" (dry run)" if not apply else ""))]
    if not apply:
        return [*out, outcome("published", "would publish (dry run)")]
    vid, actions = publish_actions(
        table,
        activity_id=activity_id,
        header=header,
        draft=draft,
        revision=revision,
        resolved=resolved,
        review=review,
        by=PUBLISHED_BY,
        moment=now(),
        seed_note=SEED_NOTE,
    )
    try:
        table.transact_write(actions)
    except ClientError as error:
        reasons = cancellation_reasons(error)
        if reasons is None:
            raise
        codes = ",".join(r.code for r in reasons)
        return [*out, outcome("failed", f"publish transaction refused ({codes}); re-run to retry")]
    return [*out, outcome("published", f"published {vid}")]


def run_publish(
    table: DynamoTable,
    seeds: Sequence[Seed],
    *,
    apply: bool,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> list[Outcome]:
    """Speech seeds are created as drafts (never approved); each activity is created and published. A failing
    activity never stops the others; an AWS error other than a refused condition does (exit 2)."""
    outcomes: list[Outcome] = []
    for seed in seeds:
        if seed.kind == "speech":
            exists = table.get_item(*_header_key(seed), attributes=("pk",)) is not None
            leftover = None if exists else unfinished_delete(table, seed)
            if exists:
                outcomes.append(Outcome("skipped", "speech", seed.item_id, "exists"))
            elif leftover is not None:
                outcomes.append(Outcome("failed", "speech", seed.item_id, leftover))
            elif not apply:
                outcomes.append(Outcome("created", "speech", seed.item_id, "would create (dry run)"))
            else:
                result = apply_seed(table, seed)
                category = "created" if result == "created" else "skipped"
                outcomes.append(Outcome(category, "speech", seed.item_id, result))
            continue
        try:
            outcomes += publish_seed(table, seed, apply=apply, now=now)
        except ClientError as error:
            if error_code(error) in (
                "AccessDeniedException",
                "UnrecognizedClientException",
                "ResourceNotFoundException",
            ):
                raise  # the whole run cannot work: stop with exit 2
            outcomes.append(Outcome("failed", "activity", seed.item_id, f"AWS error {error_code(error)}"))
        except BatchGetIncomplete:
            outcomes.append(Outcome("failed", "activity", seed.item_id, "speech lookup incomplete; re-run"))
    return outcomes


def report(outcomes: Sequence[Outcome]) -> list[str]:
    """One line per item, then the report table: each category with its count and each entry's reason."""
    lines: list[str] = []
    by_item: dict[tuple[str, str], list[Outcome]] = {}
    for item in outcomes:
        by_item.setdefault((item.kind, item.item_id), []).append(item)
    for (kind, item_id), items in by_item.items():
        lines.append(f"{kind} {item_id}: " + "; ".join(i.detail for i in items))
    lines.append("")
    lines.append("REPORT")
    for category in CATEGORIES:
        chosen = [i for i in outcomes if i.category == category]
        lines.append(f"{category}: {len(chosen)}")
        lines += [f"  {i.kind} {i.item_id}: {i.detail}" for i in chosen]
    return lines


def _client(profile: str | None, region: str) -> Any:
    import boto3

    return boto3.Session(profile_name=profile, region_name=region).client("dynamodb")


def main(argv: list[str] | None = None, client_factory: Callable[[str | None, str], Any] = _client) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="write (default: dry run, reads only)")
    mode.add_argument("--dry-run", action="store_true", help="read only and report (the default; explicit form)")
    parser.add_argument(
        "--publish",
        action="store_true",
        help="also publish each activity that has no published version (ADR-0028); with --dry-run, report only",
    )
    parser.add_argument("--table", default=DEFAULT_TABLE, help=f"content table (default {DEFAULT_TABLE})")
    parser.add_argument("--region", default=DEFAULT_REGION)
    parser.add_argument("--profile", default=None, help="AWS profile (default: the environment's credentials)")
    parser.add_argument("--seed-dir", type=Path, default=SEED_DIR, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    bad_files: list[Outcome] = []
    try:
        if args.publish:
            seeds, bad_files = load_publish_seeds(args.seed_dir, datetime.now(UTC))
        else:
            seeds = load_seeds(args.seed_dir, datetime.now(UTC))
    except SeedError as error:
        print(f"seed problem, nothing written: {error}", file=sys.stderr)
        return EXIT_BAD_SEED
    mode = "APPLY" if args.apply else "DRY RUN (add --apply to write)"
    if args.publish:
        mode += " + PUBLISH"
    print(f"{mode}: {len(seeds) + len(bad_files)} seed(s) -> table {args.table} ({args.region})")
    try:
        table = DynamoTable(client_factory(args.profile, args.region), args.table)
        if args.publish:
            outcomes = run_publish(table, seeds, apply=args.apply) + bad_files
            lines = report(outcomes)
        else:
            lines = run(table, seeds, apply=args.apply)
    except (ClientError, BotoCoreError) as error:
        code = error.response.get("Error", {}).get("Code") if isinstance(error, ClientError) else None
        print(f"AWS call failed: {code or type(error).__name__}", file=sys.stderr)
        return EXIT_AWS
    for line in lines:
        print(line)
    if args.publish and any(o.category == "failed" for o in outcomes):
        return EXIT_FAILED
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
