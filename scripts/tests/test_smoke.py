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

FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "smoke" / "player-site.json").read_text())
RELEASE_ID = FIXTURE["releaseId"]
CF = "d111111abcdef8.cloudfront.net"
HOST = "aliens.jackgl.com"


class Recorded:
    """Serves the recorded responses; a path not in the set is a 404 like S3's (so typos in tests show up)."""

    def __init__(self, responses: dict, per_host: dict[str, dict] | None = None):
        self.responses = responses
        self.per_host = per_host or {}
        self.calls: list[tuple[str, str]] = []

    def __call__(self, host: str, path: str) -> smoke.Response:
        self.calls.append((host, path))
        r = self.per_host.get(host, {}).get(path) or self.responses.get(path)
        if r is None:
            return smoke.Response(404, {"content-type": "application/xml"}, b"<Error/>")
        return smoke.Response(r["status"], {k.lower(): v for k, v in r["headers"].items()}, r["body"].encode())


def responses() -> dict:
    return copy.deepcopy(FIXTURE["responses"])


def outcomes(report: smoke.Report, host: str | None = None) -> dict[str, str]:
    return {r.check: r.outcome for r in report.results if host is None or r.host == host}


def run(resp: dict, mode: str = "auto", resolve=lambda h: True, release_id: str = RELEASE_ID) -> smoke.Report:
    return smoke.run(release_id, [("player", CF, HOST)], mode, Recorded(resp), resolve)


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
    def down(host, path):
        raise ConnectionError(f"https://{host}{path}: timed out")

    report = smoke.run(RELEASE_ID, [("player", CF, None)], "auto", down, lambda h: True)
    assert report.failed and report.failed[0].check == "GET /"


def test_json_and_markdown_shapes():
    report = run(responses(), resolve=lambda h: False)
    data = report.to_json()
    assert data["passed"] is True and data["hostnamesLive"] is False and data["releaseId"] == RELEASE_ID
    assert "| player | `aliens.jackgl.com` | dns | skipped |" in report.markdown()


def test_cli_rejects_a_non_cloudfront_name():
    assert smoke.main(["--release-id", RELEASE_ID, "--site", "player", "aliens.jackgl.com", "-"]) == 2
