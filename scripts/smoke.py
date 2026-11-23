#!/usr/bin/env python3
"""Release smoke checks (plan H.8.6, gate G-11). Read-only HTTPS GETs; no AWS credentials needed.

    python scripts/smoke.py --release-id <id> \
        --site player d111.cloudfront.net aliens.jackgl.com \
        --site admin  d222.cloudfront.net admin.aliens.jackgl.com \
        [--routes contracts/routes.json [--function NAME ...]] \
        [--hostname-mode auto|require|skip] [--json-out results.json] [--record responses.json]

For every site the same checks run against its *.cloudfront.net name and its hostname:

  root          GET /             200, text/html
  headers       (on /)            HSTS, X-Content-Type-Options nosniff, X-Frame-Options, Referrer-Policy and
                                  Content-Security-Policy-Report-Only present (the response headers policy)
  entry-cache   GET /index.html   200, Cache-Control contains no-cache
  config        GET /config.json  200, JSON, releaseId = this release, apiBase = /api, and the sign-in values
                                  (region, userPoolId, clientId, authDomain, scope) present; across sites, the player
                                  and admin sites must name different user pools
  deep-link     GET /smoke/deep/link-check   200 and the same bytes as /index.html (the CloudFront Function works)
  missing-file  GET /missing.js   404 and not HTML: a distribution-wide error page that rewrote missing files into
                                  index.html would fail here (plan E.2.2). 403 is also refused: the bucket policy
                                  grants ListBucket so that S3 answers 404 (infrastructure/modules/static_site).
  hashed-asset  the first /assets/<name>-<hash>.js named in index.html: 200, Cache-Control immutable + 1 year
  missing-picture GET /pictures/v1/lib-<32 zeros>.png   403 or 404 and not HTML (Phase 42a): the /pictures/* behaviour
                reaches the pictures bucket, whose policy lets CloudFront read approved pictures only and grants no
                ListBucket (so 403 is expected), and the SPA fallback never turns a missing picture into index.html.

With --routes (Phase 9, M1-10 part 5), the same-origin API through the /api/* behaviour, never with a token:

  api R<n>      every route in routes.json, its own method, path parameters replaced by a dummy value, NO
                Authorization header: 401 and not HTML (the gateway's JWT authoriser refuses it before any function
                runs, ADR-0012), on every host. Admin routes are checked on the player site too: one API serves both.
  api-unknown   GET /api/does-not-exist: 404 with a JSON body, not HTML: the gateway's own 404 (no $default route),
                not S3's XML 404 and not index.html. Its body is recorded for register row U-027.

--function (repeatable) keeps only those functions' routes. The family edition deploys player-api, admin-api and tts,
so apply.yml names those three; the school platform's routes (R63 onwards, DAT-7) are not on its API.

No request ever carries a token or a cookie: the request headers are fixed in https_fetch.

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
from collections.abc import Collection
from dataclasses import asdict, dataclass, field
from typing import Callable, Protocol

DEEP_LINK = "/smoke/deep/link-check"
MISSING = "/missing.js"
MISSING_PICTURE = "/pictures/v1/lib-" + "0" * 32 + ".png"
UNKNOWN_API = "/api/does-not-exist"
PATH_PARAM = re.compile(r"\{[^{}/]+\}")
PATH_PARAM_VALUE = "smoke-0000"  # a dummy that cannot be anyone's run or content ID; no lookup runs anyway (401)
CONFIG_KEYS = ("region", "userPoolId", "clientId", "authDomain", "scope")
REQUEST_HEADERS = {"Accept-Encoding": "identity", "User-Agent": "release-smoke/1"}  # never Authorization or Cookie
BODY_IN_DETAIL = 160
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
    def __call__(self, host: str, path: str, method: str = "GET") -> Response: ...


@dataclass(frozen=True)
class Route:
    id: str
    method: str
    path: str

    @property
    def request_path(self) -> str:
        return PATH_PARAM.sub(PATH_PARAM_VALUE, self.path)


def load_routes(path: str, functions: Collection[str] | None = None) -> list[Route]:
    """The catalogue's routes; with `functions`, only those functions' routes (a named function with none is an error)."""
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    entries = data["routes"]
    if functions is not None:
        missing = sorted(set(functions) - {r.get("function") for r in entries})
        if missing:
            raise ValueError(f"{path}: no route for function(s) {', '.join(missing)}")
        entries = [r for r in entries if r.get("function") in functions]
    routes = [Route(r["id"], r["method"], r["path"]) for r in entries]
    if not routes or any(not r.path.startswith("/api/") for r in routes):
        raise ValueError(f"{path}: expected routes whose paths start with /api/")
    return routes


def body_text(resp: Response, limit: int = BODY_IN_DETAIL) -> str:
    text = resp.body.decode("utf-8", "replace").strip()
    return text if len(text) <= limit else text[:limit] + "…"


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
    routes_checked: int = 0
    # Gateway answers seen (register rows U-026/U-027): the first body per (status, path kind), for the record.
    gateway: dict[str, dict[str, object]] = field(default_factory=dict)

    @property
    def failed(self) -> list[Result]:
        return [r for r in self.results if r.outcome == "fail"]

    def to_json(self) -> dict[str, object]:
        return {
            "releaseId": self.release_id,
            "passed": not self.failed,
            "hostnamesLive": self.hostnames_live,
            "api": {"routesChecked": self.routes_checked,
                    "hostsChecked": sorted({r.host for r in self.results if r.check.startswith("api")}),
                    "gateway": self.gateway},
            "results": [asdict(r) for r in self.results],
        }

    def markdown(self) -> str:
        lines = ["| Site | Host | Check | Result | Detail |", "|---|---|---|---|---|"]
        for r in self.results:
            mark = {"pass": "pass", "fail": "**FAIL**", "skip": "skipped"}[r.outcome]
            lines.append(f"| {r.site} | `{r.host}` | {r.check} | {mark} | {r.detail.replace('|', '/')} |")
        return "\n".join(lines) + "\n"


def https_fetch(timeout: float = 15.0, retries: int = 3, delay: float = 5.0) -> Fetcher:
    """One request over HTTPS with certificate verification, no redirects followed, no compression, no body and no
    credentials; retries 5xx, 429 (a gateway throttle) and network errors."""
    context = ssl.create_default_context()

    def fetch(host: str, path: str, method: str = "GET") -> Response:
        last: Exception | None = None
        for attempt in range(retries + 1):
            if attempt:
                time.sleep(delay)
            try:
                conn = http.client.HTTPSConnection(host, 443, timeout=timeout, context=context)
                try:
                    # No body: http.client sends Content-Length: 0 for POST, PUT and PATCH.
                    conn.request(method, path, headers=dict(REQUEST_HEADERS))
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
            if (result.status >= 500 or result.status == 429) and attempt < retries:
                last = http.client.HTTPException(f"HTTP {result.status}: {body_text(result)}")
                continue
            return result
        raise ConnectionError(f"{method} https://{host}{path}: {last}")

    return fetch


def resolves(host: str) -> bool:
    try:
        socket.getaddrinfo(host, 443, proto=socket.IPPROTO_TCP)
    except socket.gaierror:
        return False
    return True


def check_host(
    site: str,
    host: str,
    release_id: str,
    fetch: Fetcher,
    routes: list[Route] | None = None,
    configs: dict[str, dict[str, object]] | None = None,
    gateway: dict[str, dict[str, object]] | None = None,
) -> list[Result]:
    out: list[Result] = []

    def add(check: str, ok: bool, detail: str) -> None:
        out.append(Result(site, host, check, "pass" if ok else "fail", detail))

    def get(path: str, method: str = "GET") -> Response | None:
        try:
            return fetch(host, path, method)
        except ConnectionError as exc:
            add(f"{method} {path}", False, str(exc))
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
                missing_keys = [k for k in CONFIG_KEYS if not isinstance(data.get(k), str) or not data.get(k)]
                ok = data.get("releaseId") == release_id and data.get("apiBase") == "/api" and not missing_keys
                detail = (f"releaseId={data.get('releaseId')!r} apiBase={data.get('apiBase')!r} "
                          f"userPoolId={data.get('userPoolId')!r} scope={data.get('scope')!r}")
                if missing_keys:
                    detail += f"; missing sign-in values: {', '.join(missing_keys)}"
                if configs is not None and ok:
                    configs.setdefault(site, data)
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

    picture = get(MISSING_PICTURE)
    if picture is not None:
        add("missing-picture", picture.status in (403, 404) and not picture.is_html(),
            f"{picture.status} {picture.header('content-type')}"
            f"{' (HTML: the SPA fallback or an error page answered)' if picture.is_html() else ''}")

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

    if routes:
        out.extend(check_api(site, host, routes, get, gateway if gateway is not None else {}))
    return out


def _is_json(resp: Response) -> bool:
    return "application/json" in resp.header("content-type").lower()


def check_api(
    site: str,
    host: str,
    routes: list[Route],
    get: Callable[[str, str], Response | None],
    gateway: dict[str, dict[str, object]],
) -> list[Result]:
    """Every catalogued route without a token: 401 from the gateway. Then an unknown path: the gateway's own 404."""
    out: list[Result] = []

    def keep(kind: str, path: str, method: str, resp: Response) -> None:
        gateway.setdefault(kind, {"method": method, "path": path, "status": resp.status,
                                  "contentType": resp.header("content-type"), "body": body_text(resp, 1000),
                                  "wwwAuthenticate": resp.header("www-authenticate") or None})

    for route in routes:
        path = route.request_path
        resp = get(path, route.method)
        if resp is None:
            continue
        ok = resp.status == 401 and not resp.is_html() and _is_json(resp)
        if resp.status == 401:
            keep("noToken401", path, route.method, resp)
        out.append(Result(site, host, f"api {route.id} {route.method} {route.path}", "pass" if ok else "fail",
                          f"{resp.status} {resp.header('content-type')} {body_text(resp)}"
                          + (" (HTML: /api/* is not reaching the gateway)" if resp.is_html() else "")))

    resp = get(UNKNOWN_API, "GET")
    if resp is not None:
        ok = resp.status == 404 and not resp.is_html() and _is_json(resp)
        if ok:
            keep("unknownRoute404", UNKNOWN_API, "GET", resp)
        out.append(Result(site, host, "api-unknown", "pass" if ok else "fail",
                          f"{resp.status} {resp.header('content-type')} {body_text(resp)}"
                          + ("" if ok else " (expected the gateway's JSON 404, not S3's or index.html)")))
    return out


def run(
    release_id: str,
    sites: list[tuple[str, str, str | None]],
    hostname_mode: str,
    fetch: Fetcher,
    resolve: Callable[[str], bool] = resolves,
    routes: list[Route] | None = None,
) -> Report:
    report = Report(release_id)
    report.routes_checked = len(routes or [])
    configs: dict[str, dict[str, object]] = {}
    live = []

    def host_checks(site: str, host: str) -> list[Result]:
        return check_host(site, host, release_id, fetch, routes, configs, report.gateway)

    for site, cloudfront, hostname in sites:
        report.results += host_checks(site, cloudfront)
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
        results = host_checks(site, hostname)
        report.results += results
        live.append(all(r.outcome == "pass" for r in results))
    report.hostnames_live = bool(live) and all(live)

    # Each site signs in against its own pool (player: players, admin: operators); one pool on both would be a
    # publish that swapped or reused the site config.
    pools: dict[object, list[str]] = {}
    for site, data in configs.items():
        pools.setdefault(data.get("userPoolId"), []).append(site)
    for pool, names in pools.items():
        if len(names) > 1:
            report.results.append(Result(", ".join(names), "-", "config-pools", "fail",
                                         f"sites {', '.join(names)} name the same user pool {pool!r}"))
    if len(configs) > 1 and all(len(n) == 1 for n in pools.values()):
        report.results.append(Result(", ".join(sorted(configs)), "-", "config-pools", "pass",
                                     "each site names its own user pool"))
    return report


def recording(fetch: Fetcher, store: dict[str, dict[str, object]]) -> Fetcher:
    """Wrap a fetcher so every response is kept (for refreshing the test fixtures from a live release)."""

    def wrapped(host: str, path: str, method: str = "GET") -> Response:
        resp = fetch(host, path, method)
        body = resp.body.decode("utf-8", "replace")
        store[path if method == "GET" else f"{method} {path}"] = {
            "status": resp.status, "headers": resp.headers, "body": body if len(body) < 4000 else body[:4000]}
        return resp

    return wrapped


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Release smoke checks (plan H.8.6).")
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--site", nargs=3, action="append", required=True, metavar=("NAME", "CLOUDFRONT_DOMAIN", "HOSTNAME"),
                        help="HOSTNAME may be - for none")
    parser.add_argument("--hostname-mode", choices=("auto", "require", "skip"), default="auto")
    parser.add_argument("--routes", help="contracts/routes.json: check every route refuses a request without a token")
    parser.add_argument("--function", action="append", dest="functions", metavar="NAME",
                        help="with --routes: only this function's routes (repeatable; default: every route)")
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

    routes = None
    if args.routes:
        try:
            routes = load_routes(args.routes, args.functions)
        except (OSError, ValueError, KeyError, TypeError) as exc:
            print(f"smoke: error: --routes: {exc}", file=sys.stderr)
            return 2

    store: dict[str, dict[str, object]] = {}
    fetch = https_fetch(retries=args.retries)
    if args.record:
        fetch = recording(fetch, store)
    report = run(args.release_id, sites, args.hostname_mode, fetch, routes=routes)

    table = report.markdown()
    print(table)
    gateway = "".join(f"- {kind}: `{g['method']} {g['path']}` {g['status']} `{g['contentType']}` `{g['body']}`\n"
                      for kind, g in sorted(report.gateway.items()))
    if gateway:
        print(gateway)
    if args.markdown_out:
        with open(args.markdown_out, "a", encoding="utf-8") as fh:
            fh.write("### Smoke checks\n\n" + table + "\n")
            if gateway:
                fh.write("Gateway answers (register U-026, U-027):\n\n" + gateway + "\n")
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
