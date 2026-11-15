#!/usr/bin/env python3
"""Built-asset scan (gate G-6, plan H.10 and E.10.3).

Scans every file under one or more built `dist/` directories for strings that must never ship to a browser:
AWS key IDs, the AWS SDK, a Polly endpoint or client, and browser speech synthesis. The bare word "Polly" is
deliberately not matched: the admin app may show it as a voice label.

Exit codes:
  0  every directory is clean
  1  at least one forbidden string was found (each finding is printed as `path: rule: match`)
  2  a directory is missing or empty (nothing was built, so nothing was proved)

Standard library only; runs on Python 3.12 and 3.14.
"""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path

EXIT_OK = 0
EXIT_FOUND = 1
EXIT_BAD_INPUT = 2

# (rule name, pattern). Patterns run on raw bytes, so binary files (images, fonts) are scanned too.
RULES: tuple[tuple[str, re.Pattern[bytes]], ...] = (
    ("aws-access-key-id", re.compile(rb"AKIA[0-9A-Z]{16}")),
    ("aws-temporary-key-id", re.compile(rb"ASIA[0-9A-Z]{16}")),
    ("aws-sdk-v3", re.compile(rb"@aws-sdk/")),
    ("aws-sdk", re.compile(rb"(?<!@)aws-sdk")),  # v2 package; the lookbehind avoids reporting v3 twice
    ("polly-endpoint", re.compile(rb"polly\.[a-z0-9.-]*amazonaws\.com", re.IGNORECASE)),
    ("polly-client", re.compile(rb"PollyClient")),
    ("synthesize-speech", re.compile(rb"SynthesizeSpeech", re.IGNORECASE)),
    # Case-insensitive, so `SpeechSynthesisUtterance` is caught as well as `window.speechSynthesis`.
    ("speech-synthesis", re.compile(rb"speechSynthesis", re.IGNORECASE)),
)


@dataclass(frozen=True)
class Finding:
    path: Path
    rule: str
    match: str


def scan_file(path: Path) -> list[Finding]:
    data = path.read_bytes()
    findings: list[Finding] = []
    for rule, pattern in RULES:
        for m in pattern.finditer(data):
            findings.append(Finding(path, rule, m.group().decode("ascii", errors="replace")))
    return findings


def scan_dir(root: Path) -> list[Finding]:
    findings: list[Finding] = []
    for path in sorted(p for p in root.rglob("*") if p.is_file()):
        findings.extend(scan_file(path))
    return findings


def redact(rule: str, match: str) -> str:
    """Never print a whole key ID into a public CI log."""
    if rule.startswith("aws-") and "key-id" in rule:
        return match[:4] + "…"
    return match


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Refuse built assets that contain AWS keys, the AWS SDK, Polly or speechSynthesis.")
    parser.add_argument("dist_dirs", nargs="+", type=Path, help="built output directories, e.g. web/player/dist")
    args = parser.parse_args(argv)

    total: list[Finding] = []
    for root in args.dist_dirs:
        if not root.is_dir():
            print(f"scan_dist: error: {root} is not a directory (was the app built?)", file=sys.stderr)
            return EXIT_BAD_INPUT
        files = [p for p in root.rglob("*") if p.is_file()]
        if not files:
            print(f"scan_dist: error: {root} is empty (was the app built?)", file=sys.stderr)
            return EXIT_BAD_INPUT
        findings = scan_dir(root)
        print(f"scan_dist: {root}: {len(files)} files, {len(findings)} finding(s)")
        total.extend(findings)

    for f in total:
        print(f"{f.path}: {f.rule}: {redact(f.rule, f.match)}")
    if total:
        print(f"scan_dist: FAILED: {len(total)} forbidden string(s) in built assets (G-6)", file=sys.stderr)
        return EXIT_FOUND
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
