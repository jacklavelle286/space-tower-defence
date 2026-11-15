"""Render the Phase 18 listening test set with Polly and build the listening page (M0-11, D9.1).

Each variant in test_set.json becomes one canonical synthesis input (canonical.py) per engine, and is sent to
`aws polly synthesize-speech` exactly as hashed. SynthesizeSpeech creates nothing in the account. Clips are named by
clip key, so a clip already on disk is never synthesised again (the same rule as the preview route).

    python3 spikes/polly-listening/render.py --profile space-tower-defence --region eu-west-2
    python3 spikes/polly-listening/render.py --page-only                  # rebuild index.html from results.json
    python3 spikes/polly-listening/render.py --voice Brian --only t,b ... # a fallback voice for sounds Amy fails

Output (git-ignored): out/clips/<clipKey>.mp3, out/results.json, out/index.html. Open out/index.html in a browser.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import UTC, datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import canonical  # noqa: E402

REPO = HERE.parent.parent
TEST_SET = HERE / "test_set.json"
VERDICTS = REPO / "content" / "listening-verdicts.json"
OUT = HERE / "out"
CLIPS = OUT / "clips"
RESULTS = OUT / "results.json"
PAGE = OUT / "index.html"
PAGE_TEMPLATE = HERE / "page_template.html"

ENGINES = ("generative", "neural")
# Engines each en-GB voice offers in eu-west-2 [VERIFIED 2026-11-15, `aws polly describe-voices --language-code en-GB`].
VOICE_ENGINES = {
    "Amy": {"generative", "neural", "standard"},
    "Brian": {"generative", "neural", "standard"},
    "Emma": {"neural", "standard"},
    "Arthur": {"neural"},
}


def load_test_set() -> dict:
    return json.loads(TEST_SET.read_text(encoding="utf-8"))


def planned_renders(test_set: dict, voice: str, engines: tuple[str, ...], only: set[str] | None) -> list[dict]:
    """One entry per (item, variant, engine): the canonical document and where its clip lives."""
    plan = []
    for item in test_set["items"]:
        if only and item["id"] not in only:
            continue
        for variant in item["variants"]:
            ssml = canonical.build_ssml(variant["form"], ph=variant.get("ph"), text=variant["text"])
            for engine in engines:
                if engine not in VOICE_ENGINES.get(voice, set()):
                    continue
                doc = canonical.synthesis_input(ssml, engine=engine, voice_id=voice)
                plan.append({
                    "itemId": item["id"], "kind": item["kind"], "variant": variant["id"], "form": variant["form"],
                    "voiceId": voice, "engine": engine, "ssml": ssml, "clipKey": canonical.clip_key(doc),
                    "objectKey": canonical.object_key(doc), "doc": doc,
                })  # fmt: skip
    return plan


def synthesise(entry: dict, profile: str | None, region: str) -> dict:
    """Call the AWS CLI once. Returns the result row (ok, or the error Polly or the CLI gave)."""
    target = CLIPS / f"{entry['clipKey']}.mp3"
    fields = ("itemId", "kind", "variant", "form", "voiceId", "engine", "ssml", "clipKey", "objectKey")
    row = {k: entry[k] for k in fields}
    if target.exists():
        data = target.read_bytes()
        return row | {"status": "ok", "cached": True, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
    aws = shutil.which("aws")
    if not aws:
        return row | {"status": "error", "error": "aws CLI not found on PATH"}
    with tempfile.TemporaryDirectory(dir=OUT) as tmp:
        tmp_file = Path(tmp) / "clip.mp3"
        cmd = [aws, *canonical.polly_cli_args(entry["doc"]), str(tmp_file), "--region", region, "--output", "json"]
        if profile:
            cmd += ["--profile", profile]
        proc = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=60)  # noqa: S603 (fixed argv)
        if proc.returncode != 0:
            return row | {"status": "error", "error": (proc.stderr or proc.stdout).strip()[:600]}
        meta = json.loads(proc.stdout or "{}")
        data = tmp_file.read_bytes()
        if not data:
            return row | {"status": "error", "error": "Polly returned an empty audio stream"}
        tmp_file.replace(target)
    return row | {
        "status": "ok", "cached": False, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
        "contentType": meta.get("ContentType"), "requestCharacters": meta.get("RequestCharacters"),
    }  # fmt: skip


def load_results() -> dict:
    if RESULTS.exists():
        return json.loads(RESULTS.read_text(encoding="utf-8"))
    return {"renders": {}}


def write_results(results: dict) -> None:
    RESULTS.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def build_page(test_set: dict, results: dict) -> str:
    """The listening page: one block per item, a row per variant and voice, a column per engine, verdict controls."""
    data = {
        "items": test_set["items"],
        "renders": list(results["renders"].values()),
        "template": json.loads(VERDICTS.read_text(encoding="utf-8")),
        "generatedAt": results.get("updatedAt"),
    }
    blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    return PAGE_TEMPLATE.read_text(encoding="utf-8").replace("__DATA__", blob)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--profile", help="AWS CLI profile (space-tower-defence)")
    parser.add_argument("--region", default="eu-west-2")
    parser.add_argument("--voice", default="Amy", choices=sorted(VOICE_ENGINES))
    parser.add_argument("--engines", default=",".join(ENGINES), help="comma list; unsupported voice/engine pairs skip")
    parser.add_argument("--only", help="comma list of item ids")
    parser.add_argument("--retry-errors", action="store_true", help="re-send renders that failed last time")
    parser.add_argument("--dry-run", action="store_true", help="print the canonical inputs; call nothing")
    parser.add_argument("--page-only", action="store_true", help="rebuild index.html from results.json")
    args = parser.parse_args(argv)

    test_set = load_test_set()
    OUT.mkdir(exist_ok=True)
    CLIPS.mkdir(exist_ok=True)
    results = load_results()

    if not args.page_only:
        engines = tuple(e for e in args.engines.split(",") if e)
        only = set(args.only.split(",")) if args.only else None
        plan = planned_renders(test_set, args.voice, engines, only)
        if args.dry_run:
            for entry in plan:
                print(entry["clipKey"], canonical.canonical_json(entry["doc"]).decode("utf-8"))
            return 0
        for entry in plan:
            previous = results["renders"].get(entry["clipKey"])
            if previous and previous["status"] == "error" and not args.retry_errors:
                row = previous
            else:
                row = synthesise(entry, args.profile, args.region)
                results["renders"][entry["clipKey"]] = row
            mark = "ok " if row["status"] == "ok" else "ERR"
            print(f"{mark} {row['voiceId']:<6} {row['engine']:<10} {row['itemId']:<20} {row['variant']:<6} "
                  f"{row.get('bytes', '') or row.get('error', '')}")  # fmt: skip
        results["updatedAt"] = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        write_results(results)
        rows = [results["renders"][e["clipKey"]] for e in plan]
        failed = [r for r in rows if r["status"] != "ok"]
        print(f"\n{len(rows)} renders: {len(rows) - len(failed)} ok, {len(failed)} failed")

    PAGE.write_text(build_page(test_set, results), encoding="utf-8")
    print(f"listening page: {PAGE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
