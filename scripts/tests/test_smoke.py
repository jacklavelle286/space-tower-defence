"""Tests for scripts/smoke.py against a recorded response set (fixtures/smoke/player-site.json), plan H.8.6."""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import smoke  # noqa: E402

REPO = SCRIPTS.parent
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "smoke" / "player-site.json").read_text())
ROUTES = smoke.load_routes(str(REPO / "contracts" / "routes.json"))
ADMIN_CF = "d222222abcdef8.cloudfront.net"
ADMIN_HOST = "admin.aliens.jackgl.com"
RELEASE_ID = FIXTURE["releaseId"]
CF = "d111111abcdef8.cloudfront.net"
HOST = "aliens.jackgl.com"


GATEWAY_401 = smoke.Response(401, {"content-type": "application/json", "www-authenticate": "Bearer"},
                             b'{"message":"Unauthorized"}')
GATEWAY_404 = smoke.Response(404, {"content-type": "application/json"}, b'{"message":"Not Found"}')
CATALOGUED = {(r.method, r.request_path) for r in ROUTES}


def gateway(method: str, path: str) -> smoke.Response:
    """A stand-in for the HTTP API behind /api/*: a catalogued route without a token is 401, anything else 404."""
    return GATEWAY_401 if (method, path) in CATALOGUED else GATEWAY_404


class Recorded:
    """Serves the recorded responses; a path not in the set is a 404 like S3's (so typos in tests show up).
    /api/* goes to the gateway stand-in unless a test overrides "METHOD path" (or a GET path)."""

    def __init__(self, responses: dict, per_host: dict[str, dict] | None = None, api=gateway):
        self.responses = responses
        self.per_host = per_host or {}
        self.api = api
        self.calls: list[tuple[str, str]] = []
        self.methods: list[tuple[str, str, str]] = []

    def __call__(self, host: str, path: str, method: str = "GET") -> smoke.Response:
        self.calls.append((host, path))
        self.methods.append((host, method, path))
        key = path if method == "GET" else f"{method} {path}"
        r = self.per_host.get(host, {}).get(key) or self.responses.get(key)
        if r is None and path.startswith("/api/") and self.api is not None:
            return self.api(method, path)
        if r is None:
            return smoke.Response(404, {"content-type": "application/xml"}, b"<Error/>")
        return smoke.Response(r["status"], {k.lower(): v for k, v in r["headers"].items()}, r["body"].encode())


def responses() -> dict:
    return copy.deepcopy(FIXTURE["responses"])


def outcomes(report: smoke.Report, host: str | None = None) -> dict[str, str]:
    return {r.check: r.outcome for r in report.results if host is None or r.host == host}


def run(resp: dict, mode: str = "auto", resolve=lambda h: True, release_id: str = RELEASE_ID) -> smoke.Report:
    return smoke.run(release_id, [("player", CF, HOST)], mode, Recorded(resp), resolve)


def admin_responses(pool: str = "eu-west-2_ZyXwVu987") -> dict:
    resp = responses()
    config = json.loads(resp["/config.json"]["body"])
    config.update(userPoolId=pool, scope="ops/content", clientId="9z8y7x6w5v4u3t2s1r0q9p8o7n",
                  authDomain="example-admin.auth.eu-west-2.amazoncognito.com")
    resp["/config.json"]["body"] = json.dumps(config)
    return resp


def run_both(admin: dict | None = None, api=gateway, mode: str = "auto") -> tuple[smoke.Report, Recorded]:
    """Both sites, both names, with the route sweep (the Phase 9 release smoke)."""
    fetch = Recorded(responses(), per_host={h: admin or admin_responses() for h in (ADMIN_CF, ADMIN_HOST)}, api=api)
    sites = [("player", CF, HOST), ("admin", ADMIN_CF, ADMIN_HOST)]
    return smoke.run(RELEASE_ID, sites, mode, fetch, lambda h: True, routes=ROUTES), fetch


def api_results(report: smoke.Report, host: str | None = None) -> list[smoke.Result]:
    return [r for r in report.results if r.check.startswith("api") and (host is None or r.host == host)]


def test_recorded_set_passes_on_cloudfront_and_hostname():
    report = run(responses())
    assert not report.failed, report.markdown()
    assert report.hostnames_live
    for host in (CF, HOST):
        assert outcomes(report, host) == {
            "root": "pass", "headers": "pass", "entry-cache": "pass", "config": "pass",
            "deep-link": "pass", "missing-file": "pass", "hashed-asset": "pass",
        }


def test_distribution_wide_error_page_is_caught():
    # What a custom_error_response 404 -> 200 /index.html would do (plan E.2.2).
    resp = responses()
    resp["/missing.js"] = copy.deepcopy(resp["/index.html"])
    report = run(resp)
    assert outcomes(report, CF)["missing-file"] == "fail"


def test_403_for_missing_file_is_refused():
    resp = responses()
    resp["/missing.js"]["status"] = 403
    assert outcomes(run(resp), CF)["missing-file"] == "fail"


def test_deep_link_must_return_the_app():
    resp = responses()
    resp["/smoke/deep/link-check"] = copy.deepcopy(resp["/missing.js"])  # no CloudFront Function: real 404
    assert outcomes(run(resp), CF)["deep-link"] == "fail"


def test_index_html_must_be_no_cache():
    resp = responses()
    resp["/index.html"]["headers"]["cache-control"] = "public, max-age=31536000, immutable"
    assert outcomes(run(resp), CF)["entry-cache"] == "fail"


def test_hashed_asset_must_be_immutable():
    resp = responses()
    resp["/assets/index-DR5M5KOV.js"]["headers"]["cache-control"] = "no-cache"
    report = run(resp)
    assert outcomes(report, CF)["hashed-asset"] == "fail"


def test_hashed_asset_named_in_index_html_is_the_one_fetched():
    fetch = Recorded(responses())
    smoke.run(RELEASE_ID, [("player", CF, None)], "auto", fetch, lambda h: True)
    assert (CF, "/assets/index-DR5M5KOV.js") in fetch.calls


@pytest.mark.parametrize("header", sorted(smoke.SECURITY_HEADERS))
def test_each_security_header_is_required(header):
    resp = responses()
    del resp["/"]["headers"][header]
    report = run(resp)
    assert outcomes(report, CF)["headers"] == "fail"
    assert header in next(r.detail for r in report.results if r.check == "headers" and r.host == CF)


def test_config_must_name_this_release():
    assert outcomes(run(responses(), release_id="20261116T0000Z-aaaaaaa"), CF)["config"] == "fail"


def test_root_must_be_html():
    resp = responses()
    resp["/"]["headers"]["content-type"] = "application/xml"
    assert outcomes(run(resp), CF)["root"] == "fail"


def test_hostname_without_dns_is_skipped_in_auto_mode():
    report = run(responses(), mode="auto", resolve=lambda h: h != HOST)
    assert not report.failed
    assert not report.hostnames_live
    assert outcomes(report, HOST) == {"dns": "skip"}
    assert outcomes(report, CF)["root"] == "pass"  # the cloudfront.net name is still fully checked


def test_hostname_without_dns_fails_in_require_mode():
    report = run(responses(), mode="require", resolve=lambda h: h != HOST)
    assert [r.check for r in report.failed] == ["dns"]


def test_hostname_that_resolves_must_pass_even_in_auto_mode():
    # DNS live but pointing somewhere wrong (e.g. at another distribution) is a failure, never a skip.
    fetch = Recorded(responses(), per_host={HOST: {"/": {"status": 403, "headers": {"content-type": "text/html"},
                                                         "body": "<html>forbidden</html>"}}})
    report = smoke.run(RELEASE_ID, [("player", CF, HOST)], "auto", fetch, lambda h: True)
    assert outcomes(report, HOST)["root"] == "fail"
    assert not report.hostnames_live


def test_skip_mode_checks_no_hostname():
    fetch = Recorded(responses())
    report = smoke.run(RELEASE_ID, [("player", CF, HOST)], "skip", fetch, lambda h: True)
    assert {h for h, _ in fetch.calls} == {CF}
    assert not report.failed and not report.hostnames_live


def test_unreachable_host_fails_not_skips():
    def down(host, path, method="GET"):
        raise ConnectionError(f"https://{host}{path}: timed out")

    report = smoke.run(RELEASE_ID, [("player", CF, None)], "auto", down, lambda h: True)
    assert report.failed and report.failed[0].check == "GET /"


def test_json_and_markdown_shapes():
    report = run(responses(), resolve=lambda h: False)
    data = report.to_json()
    assert data["passed"] is True and data["hostnamesLive"] is False and data["releaseId"] == RELEASE_ID
    assert "| player | `aliens.jackgl.com` | dns | skipped |" in report.markdown()


def test_config_must_carry_the_sign_in_values():
    resp = responses()
    config = json.loads(resp["/config.json"]["body"])
    del config["clientId"]
    resp["/config.json"]["body"] = json.dumps(config)
    report = run(resp)
    assert outcomes(report, CF)["config"] == "fail"
    assert "missing sign-in values: clientId" in next(r.detail for r in report.results if r.check == "config")


def test_route_sweep_passes_on_all_four_names():
    report, fetch = run_both()
    assert not report.failed, report.markdown()
    assert report.hostnames_live
    for host in (CF, HOST, ADMIN_CF, ADMIN_HOST):
        checks = [r.check for r in api_results(report, host)]
        assert len(checks) == len(ROUTES) + 1 == 31
        assert checks[-1] == "api-unknown"
    assert report.to_json()["api"]["routesChecked"] == 30
    assert report.to_json()["api"]["hostsChecked"] == sorted([CF, HOST, ADMIN_CF, ADMIN_HOST])
    # Each route with its own method; path parameters replaced; admin routes on the player site too.
    assert (CF, "POST", "/api/runs/smoke-0000/ops") in fetch.methods
    assert (CF, "GET", "/api/admin/bank-status") in fetch.methods
    assert (ADMIN_HOST, "DELETE", "/api/session") in fetch.methods
    assert not any("{" in path for _, _, path in fetch.methods)


def test_gateway_bodies_are_recorded():
    report, _ = run_both()
    gw = report.to_json()["api"]["gateway"]
    assert gw["unknownRoute404"] == {"method": "GET", "path": "/api/does-not-exist", "status": 404,
                                     "contentType": "application/json", "body": '{"message":"Not Found"}',
                                     "wwwAuthenticate": None}
    assert gw["noToken401"]["status"] == 401 and gw["noToken401"]["body"] == '{"message":"Unauthorized"}'


def test_a_route_that_answers_without_a_token_fails():
    # A route planned without an authoriser would reach the function: the stub answers 501.
    def open_route(method, path):
        if (method, path) == ("PUT", "/api/session"):
            return smoke.Response(501, {"content-type": "application/json"}, b'{"error":{"code":"NOT_IMPLEMENTED"}}')
        return gateway(method, path)

    report, _ = run_both(api=open_route)
    failed = {(r.host, r.check) for r in report.failed}
    assert failed == {(h, "api R13 PUT /api/session") for h in (CF, HOST, ADMIN_CF, ADMIN_HOST)}


def test_api_served_by_the_spa_fallback_fails():
    # No /api/* behaviour: the default behaviour's SPA function would answer index.html with 200.
    index = responses()["/index.html"]
    html = smoke.Response(200, {"content-type": "text/html"}, index["body"].encode())
    report, _ = run_both(api=lambda method, path: html)
    assert {r.outcome for r in api_results(report)} == {"fail"}
    assert "HTML" in api_results(report, CF)[0].detail


def test_unknown_api_path_must_be_the_gateways_json_404():
    s3_404 = smoke.Response(404, {"content-type": "application/xml"}, b"<Error><Code>NoSuchKey</Code></Error>")
    report, _ = run_both(api=lambda m, p: s3_404 if p == smoke.UNKNOWN_API else gateway(m, p))
    assert {r.host for r in report.failed if r.check == "api-unknown"} == {CF, HOST, ADMIN_CF, ADMIN_HOST}
    assert "unknownRoute404" not in report.gateway


def test_403_is_not_401():
    # ADR-0012: 403 insufficient_scope is for a token without the scope; with no token at all the gateway says 401.
    forbidden = smoke.Response(403, {"content-type": "application/json"}, b'{"message":"Forbidden"}')
    report, _ = run_both(api=lambda m, p: forbidden if p == "/api/me" else gateway(m, p))
    assert {r.check for r in report.failed} == {"api R1 GET /api/me"}


def test_same_user_pool_on_both_sites_fails():
    report, _ = run_both(admin=admin_responses(pool="eu-west-2_AbCdEf123"))
    assert [r.check for r in report.failed] == ["config-pools"]
    assert "player, admin" in report.failed[0].site


def test_without_routes_no_api_request_is_made():
    fetch = Recorded(responses())
    smoke.run(RELEASE_ID, [("player", CF, HOST)], "auto", fetch, lambda h: True)
    assert not any(path.startswith("/api/") for _, path in fetch.calls)


def test_requests_never_carry_credentials():
    assert {k.lower() for k in smoke.REQUEST_HEADERS} == {"accept-encoding", "user-agent"}


def test_cli_rejects_a_non_cloudfront_name():
    assert smoke.main(["--release-id", RELEASE_ID, "--site", "player", "aliens.jackgl.com", "-"]) == 2


def test_cli_rejects_a_bad_route_catalogue(tmp_path):
    bad = tmp_path / "routes.json"
    bad.write_text(json.dumps({"routes": [{"id": "R1", "method": "GET", "path": "/me"}]}))  # no /api prefix
    assert smoke.main(["--release-id", RELEASE_ID, "--site", "player", CF, "-", "--routes", str(bad)]) == 2
    assert smoke.main(["--release-id", RELEASE_ID, "--site", "player", CF, "-",
                       "--routes", str(tmp_path / "absent.json")]) == 2
