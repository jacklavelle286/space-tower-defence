"""Tests for the SPA deep-link CloudFront Function (plan E.2.2, H.4.2), run under node.

It differs from the H.4.2 sample on purpose: only the LAST path segment is checked for a dot (so /v1.2/route is a
route), and /api/ is never rewritten (the /api/* behaviour has no function, E.2.1, but this keeps it safe if attached).
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

TESTS = Path(__file__).resolve().parent
REPO = TESTS.parents[1]
FUNCTION = REPO / "infrastructure" / "main" / "functions" / "spa-fallback.js"
RUNNER = TESTS / "cf_function_runner.mjs"
CLOUDFRONT_FUNCTION_MAX_BYTES = 10 * 1024  # CloudFront Functions code size limit

CASES = [
    ("/", {}, "/index.html"),
    ("/index.html", {}, "/index.html"),
    ("/assets/x-abc.js", {}, "/assets/x-abc.js"),
    ("/some/route", {}, "/index.html"),
    ("/api/me", {}, "/api/me"),
    ("/profile", {"x": {"value": "1"}}, "/index.html"),
    ("/missing.js", {}, "/missing.js"),
    ("/v1.2/route", {}, "/index.html"),
    ("/assets/ui/logo.svg", {}, "/assets/ui/logo.svg"),
    ("/game-data/current.json", {}, "/game-data/current.json"),
]


def node() -> str:
    found = shutil.which("node")
    if found is None:
        if os.environ.get("CI"):
            pytest.fail("node is required in CI to test the CloudFront Function")
        pytest.skip("node not on PATH")
    return found


def run_handler(events: list[dict]) -> list[dict]:
    result = subprocess.run(
        [node(), str(RUNNER), str(FUNCTION)],
        input=json.dumps(events),
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def test_rewrites() -> None:
    events = [
        {"request": {"method": "GET", "uri": uri, "querystring": qs, "headers": {}}} for uri, qs, _ in CASES
    ]
    results = run_handler(events)
    for (uri, qs, want), got in zip(CASES, results, strict=True):
        assert got["uri"] == want, uri
        assert got["querystring"] == qs, uri  # the query string is never touched


def test_function_fits_cloudfront_size_limit() -> None:
    assert len(FUNCTION.read_bytes()) <= CLOUDFRONT_FUNCTION_MAX_BYTES
