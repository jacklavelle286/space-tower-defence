#!/usr/bin/env python3
"""Release smoke checks (plan H.8.6, gate G-11). Read-only HTTPS GETs; no AWS credentials needed.

    python scripts/smoke.py --release-id <id> \
        --site player d111.cloudfront.net aliens.jackgl.com \
        --site admin  d222.cloudfront.net admin.aliens.jackgl.com \
        [--hostname-mode auto|require|skip] [--json-out results.json] [--record responses.json]

For every site the same checks run against its *.cloudfront.net name and its hostname:

  root          GET /             200, text/html
  headers       (on /)            HSTS, X-Content-Type-Options nosniff, X-Frame-Options, Referrer-Policy and
                                  Content-Security-Policy-Report-Only present (the response headers policy)
  entry-cache   GET /index.html   200, Cache-Control contains no-cache
  config        GET /config.json  200, JSON, releaseId = this release, apiBase = /api
  deep-link     GET /smoke/deep/link-check   200 and the same bytes as /index.html (the CloudFront Function works)
  missing-file  GET /missing.js   404 and not HTML: a distribution-wide error page that rewrote missing files into
                                  index.html would fail here (plan E.2.2). 403 is also refused: the bucket policy
                                  grants ListBucket so that S3 answers 404 (infrastructure/modules/static_site).
  hashed-asset  the first /assets/<name>-<hash>.js named in index.html: 200, Cache-Control immutable + 1 year

Hostnames (H.8.6 last row): DNS for aliens.jackgl.com is created by hand after the first apply, so
  auto     a hostname that does not resolve is reported "skipped: DNS not live"; one that resolves must pass
  require  a hostname that does not resolve fails (the workflow uses this once a release has seen them live)
  skip     hostnames are not checked
The *.cloudfront.net names are always required.

Exit 0 when nothing failed. Standard library only; runs on Python 3.12 and 3.14.
"""

from __future__ import annotations

import argparse
import http.client
import json
import re
import socket
import ssl
import sys
import time
from dataclasses import asdict, dataclass, field
from typing import Callable, Protocol

DEEP_LINK = "/smoke/deep/link-check"
MISSING = "/missing.js"
MAX_BODY = 5 * 1024 * 1024
# Vite's hashed output, as named in index.html (same shape as release_manifest.VITE_HASHED).
HASHED_REF = re.compile(r'(?:src|href)="(/assets/[^"/]+-[A-Za-z0-9_-]{8}\.js)"')
SECURITY_HEADERS: dict[str, Callable[[str], bool]] = {
    "strict-transport-security": lambda v: "max-age=" in v.lower(),
    "x-content-type-options": lambda v: v.strip().lower() == "nosniff",
    "x-frame-options": lambda v: v.strip().upper() in ("DENY", "SAMEORIGIN"),
    "referrer-policy": lambda v: bool(v.strip()),
    "content-security-policy-report-only": lambda v: "default-src" in v,
}


@dataclass
class Response:
    status: int
    headers: dict[str, str]  # lower-case names
    body: bytes

    def header(self, name: str) -> str:
        return self.headers.get(name.lower(), "")

    def is_html(self) -> bool:
        return "text/html" in self.header("content-type").lower() or self.body.lstrip()[:15].lower().startswith(
            b"<!doctype html"
        )


class Fetcher(Protocol):
    def __call__(self, host: str, path: str) -> Response: ...


@dataclass
class Result:
    site: str
    host: str
    check: str
    outcome: str  # pass | fail | skip
    detail: str = ""


@dataclass
class Report:
    release_id: str
    results: list[Result] = field(default_factory=list)
    hostnames_live: bool = False

    @property
    def failed(self) -> list[Result]:
        return [r for r in self.results if r.outcome == "fail"]

    def to_json(self) -> dict[str, object]:
        return {
            "releaseId": self.release_id,
            "passed": not self.failed,
            "hostnamesLive": self.hostnames_live,
            "results": [asdict(r) for r in self.results],
        }

    def markdown(self) -> str:
        lines = ["| Site | Host | Check | Result | Detail |", "|---|---|---|---|---|"]
        for r in self.results:
            mark = {"pass": "pass", "fail": "**FAIL**", "skip": "skipped"}[r.outcome]
            lines.append(f"| {r.site} | `{r.host}` | {r.check} | {mark} | {r.detail.replace('|', '/')} |")
        return "\n".join(lines) + "\n"


def https_fetch(timeout: float = 15.0, retries: int = 3, delay: float = 5.0) -> Fetcher:
    """GET over HTTPS with certificate verification, no redirects followed, no compression; retries 5xx and network errors."""
    context = ssl.create_default_context()

    def fetch(host: str, path: str) -> Response:
        last: Exception | None = None
        for attempt in range(retries + 1):
            if attempt:
                time.sleep(delay)
            try:
                conn = http.client.HTTPSConnection(host, 443, timeout=timeout, context=context)
                try:
                    conn.request("GET", path, headers={"Accept-Encoding": "identity", "User-Agent": "release-smoke/1"})
                    resp = conn.getresponse()
                    body = resp.read(MAX_BODY)
                    headers: dict[str, str] = {}
                    for k, v in resp.getheaders():
                        key = k.lower()
                        headers[key] = f"{headers[key]}, {v}" if key in headers else v
                    result = Response(resp.status, headers, body)
                finally:
                    conn.close()
            except (OSError, http.client.HTTPException) as exc:
                last = exc
                continue
            if result.status >= 500 and attempt < retries:
                continue
            return result
        raise ConnectionError(f"https://{host}{path}: {last}")

    return fetch


def resolves(host: str) -> bool:
    try:
        socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return False
    return True


def check_host(site: str, host: str, release_id: str, fetch: Fetcher) -> list[Result]:
    out: list[Result] = []

    def add(check: str, ok: bool, detail: str) -> None:
        out.append(Result(site, host, check, "pass" if ok else "fail", detail))

    def get(path: str) -> Response | None:
        try:
            return fetch(host, path)
        except ConnectionError as exc:
            add(f"GET {path}", False, str(exc))
            return None

    root = get("/")
    if root is None:
        return out
    add("root", root.status == 200 and "text/html" in root.header("content-type"),
        f"{root.status} {root.header('content-type')}")
    missing_headers = [h for h, ok in SECURITY_HEADERS.items() if not ok(root.header(h))]
    add("headers", not missing_headers, "all present" if not missing_headers else f"missing or wrong: {', '.join(missing_headers)}")

    index = get("/index.html")
    if index is not None:
        cache = index.header("cache-control")
        add("entry-cache", index.status == 200 and "no-cache" in cache.lower(), f"{index.status} cache-control={cache!r}")

    config = get("/config.json")
    if config is not None:
        detail = f"{config.status} {config.header('content-type')}"
        ok = config.status == 200 and "application/json" in config.header("content-type")
        if ok:
            try:
                data = json.loads(config.body)
                ok = data.get("releaseId") == release_id and data.get("apiBase") == "/api"
                detail = f"releaseId={data.get('releaseId')!r} apiBase={data.get('apiBase')!r}"
            except (ValueError, AttributeError):
                ok, detail = False, "body is not a JSON object"
        add("config", ok, detail)

    deep = get(DEEP_LINK)
    if deep is not None:
        same = index is not None and index.status == 200 and deep.body == index.body
        add("deep-link", deep.status == 200 and deep.is_html() and same,
            f"{deep.status} {deep.header('content-type')}{'' if same else ', body differs from /index.html'}")

    missing = get(MISSING)
    if missing is not None:
        add("missing-file", missing.status == 404 and not missing.is_html(),
            f"{missing.status} {missing.header('content-type')}{' (HTML: an error page rewrites missing files)' if missing.is_html() else ''}")

    source = (index if index is not None and index.status == 200 else root).body.decode("utf-8", "replace")
    match = HASHED_REF.search(source)
    if match is None:
        add("hashed-asset", False, "index.html names no /assets/<name>-<hash>.js")
    else:
        asset = get(match.group(1))
        if asset is not None:
            cache = asset.header("cache-control").lower()
            ok = (asset.status == 200 and "immutable" in cache and "max-age=31536000" in cache
                  and "javascript" in asset.header("content-type"))
            add("hashed-asset", ok, f"{match.group(1)} {asset.status} cache-control={asset.header('cache-control')!r}")
    return out


def run(
    release_id: str,
    sites: list[tuple[str, str, str | None]],
    hostname_mode: str,
    fetch: Fetcher,
    resolve: Callable[[str], bool] = resolves,
) -> Report:
    report = Report(release_id)
    live = []
    for site, cloudfront, hostname in sites:
        report.results += check_host(site, cloudfront, release_id, fetch)
        if hostname is None or hostname_mode == "skip":
            continue
        if not resolve(hostname):
            if hostname_mode == "require":
                report.results.append(Result(site, hostname, "dns", "fail", "does not resolve; the alias records are required from now on"))
            else:
                report.results.append(Result(site, hostname, "dns", "skip",
                                             "DNS not live: create the alias records (docs/runbooks/dns-hand-off.md)"))
            live.append(False)
            continue
        results = check_host(site, hostname, release_id, fetch)
        report.results += results
        live.append(all(r.outcome == "pass" for r in results))
    report.hostnames_live = bool(live) and all(live)
    return report


def recording(fetch: Fetcher, store: dict[str, dict[str, object]]) -> Fetcher:
    """Wrap a fetcher so every response is kept (for refreshing the test fixtures from a live release)."""

    def wrapped(host: str, path: str) -> Response:
        resp = fetch(host, path)
        body = resp.body.decode("utf-8", "replace")
        store[path] = {"status": resp.status, "headers": resp.headers,
                       "body": body if len(body) < 4000 else body[:4000]}
        return resp

    return wrapped


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Release smoke checks (plan H.8.6).")
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--site", nargs=3, action="append", required=True, metavar=("NAME", "CLOUDFRONT_DOMAIN", "HOSTNAME"),
                        help="HOSTNAME may be - for none")
    parser.add_argument("--hostname-mode", choices=("auto", "require", "skip"), default="auto")
    parser.add_argument("--json-out", help="write the results as JSON here")
    parser.add_argument("--markdown-out", help="append the results table here (e.g. $GITHUB_STEP_SUMMARY)")
    parser.add_argument("--record", help="write every response here, keyed by path (fixture material)")
    parser.add_argument("--retries", type=int, default=3)
    args = parser.parse_args(argv)

    sites = []
    for name, cloudfront, hostname in args.site:
        if not cloudfront or not cloudfront.endswith(".cloudfront.net"):
            print(f"smoke: error: {name}: {cloudfront!r} is not a *.cloudfront.net name", file=sys.stderr)
            return 2
        sites.append((name, cloudfront, None if hostname in ("", "-") else hostname))

    store: dict[str, dict[str, object]] = {}
    fetch = https_fetch(retries=args.retries)
    if args.record:
        fetch = recording(fetch, store)
    report = run(args.release_id, sites, args.hostname_mode, fetch)

    table = report.markdown()
    print(table)
    if args.markdown_out:
        with open(args.markdown_out, "a", encoding="utf-8") as fh:
            fh.write("### Smoke checks\n\n" + table + "\n")
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as fh:
            json.dump(report.to_json(), fh, indent=2, sort_keys=True)
            fh.write("\n")
    if args.record:
        with open(args.record, "w", encoding="utf-8") as fh:
            json.dump({"_source": "recorded by scripts/smoke.py --record (last host wins per path)",
                       "releaseId": args.release_id, "responses": store}, fh, indent=2, sort_keys=True)
            fh.write("\n")
    if report.failed:
        print(f"smoke: {len(report.failed)} check(s) failed", file=sys.stderr)
        return 1
    skipped = [r for r in report.results if r.outcome == "skip"]
    print(f"smoke: all checks passed{f' ({len(skipped)} skipped)' if skipped else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
