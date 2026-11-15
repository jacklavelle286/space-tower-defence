"""Tests for the auth spike's pure helpers: PKCE, URLs, claim decoding and redaction (no network)."""

from __future__ import annotations

import base64
import importlib.util
import json
import re
import sys
import urllib.parse
from pathlib import Path

import pytest

SPIKE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SPIKE))

import check  # noqa: E402


def load_handler(name: str):
    spec = importlib.util.spec_from_file_location(f"spike_{name}_handler", SPIKE / "functions" / name / "handler.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fake_jwt(claims: dict) -> str:
    def part(obj: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(obj).encode()).rstrip(b"=").decode()

    return f"{part({'alg': 'RS256', 'kid': 'k'})}.{part(claims)}.c2ln"


def test_pkce_matches_rfc7636_appendix_b():
    assert check.pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"


def test_make_pkce_is_fresh_and_consistent():
    v1, c1 = check.make_pkce()
    v2, _ = check.make_pkce()
    assert v1 != v2 and len(v1) == 43 and "=" not in v1
    assert c1 == check.pkce_challenge(v1)


def test_authorize_url_has_s256_and_prompt_login():
    url = check.authorize_url("https://d.example/", "cid", "http://localhost:8765/callback", "openid x/y", "st", "ch")
    parts = urllib.parse.urlsplit(url)
    q = dict(urllib.parse.parse_qsl(parts.query))
    assert parts.path == "/oauth2/authorize"
    assert q == {
        "response_type": "code", "client_id": "cid", "redirect_uri": "http://localhost:8765/callback",
        "scope": "openid x/y", "state": "st", "code_challenge": "ch", "code_challenge_method": "S256", "prompt": "login",
    }
    assert "%20" in parts.query  # scope space encoded as %20, not +


def test_authorize_url_signup_without_prompt():
    url = check.authorize_url("https://d.example", "cid", "r", "openid", "s", "c", prompt_login=False, signup=True)
    parts = urllib.parse.urlsplit(url)
    assert parts.path == "/signup" and "prompt" not in dict(urllib.parse.parse_qsl(parts.query))


def test_decode_and_redact_claims():
    token = fake_jwt({"sub": "s-1", "jti": "j", "origin_jti": "o", "event_id": "e", "scope": "openid a/b"})
    claims = check.decode_claims(token)
    assert claims["sub"] == "s-1"
    red = check.redact_claims(claims)
    assert red["jti"] == red["origin_jti"] == red["event_id"] == check.REDACTED and red["sub"] == "s-1"
    assert check.scopes_of(claims) == ["a/b", "openid"]


def test_decode_rejects_non_jwt():
    with pytest.raises(ValueError):
        check.decode_claims("a.b")


def sample_event(token: str) -> dict:
    return {
        "routeKey": "GET /spike/player",
        "headers": {
            "Authorization": f"Bearer {token}", "Cookie": "c=1", "host": "x",
            "X-Forwarded-For": "198.51.100.7, 192.0.2.44", "x-real-ip": "198.51.100.7",
        },
        "cookies": ["c=1"],
        "requestContext": {
            "http": {"sourceIp": "198.51.100.7", "method": "GET"},
            "authorizer": {"jwt": {"claims": {"sub": "s", "jti": "j"}, "scopes": ["openid"]}},
        },
    }


@pytest.mark.parametrize("redact", [check.redact_event, load_handler("api").redact_event])
def test_redact_event_removes_token_cookie_ip_and_ids(redact):
    token = fake_jwt({"sub": "s"})
    event = sample_event(token)
    out = redact(event)
    check.assert_no_tokens(out, [token])
    assert out["headers"]["Authorization"] == check.REDACTED and out["headers"]["host"] == "x"
    assert out["requestContext"]["http"]["sourceIp"] == check.DOC_IP
    assert out["requestContext"]["authorizer"]["jwt"]["claims"]["jti"] == check.REDACTED
    assert out["headers"]["X-Forwarded-For"] == out["headers"]["x-real-ip"] == check.DOC_IP
    assert set(re.findall(r"\b\d{1,3}(?:\.\d{1,3}){3}\b", json.dumps(out))) == {check.DOC_IP}  # no other IPv4
    assert event["headers"]["Authorization"].startswith("Bearer ")  # input untouched


def test_assert_no_tokens_catches_shape_and_value():
    with pytest.raises(ValueError):
        check.assert_no_tokens({"x": fake_jwt({"a": 1})})
    with pytest.raises(ValueError):
        check.assert_no_tokens({"x": "code-123"}, ["code-123"])
    check.assert_no_tokens({"x": "fine"}, ["", "other"])


def test_load_config_accepts_all_output_shapes(tmp_path):
    value = {"clients": {"player": {}}, "api_url": "u"}
    docs = (
        {"check_config": {"value": value, "type": [], "sensitive": False}},  # terraform output -json
        {"check_config": value, "player_pool_id": "p"},  # spike.yml run summary
        {"value": value},
        value,
    )
    for doc in docs:
        f = tmp_path / "o.json"
        f.write_text(json.dumps(doc))
        assert check.load_config(f) == value
    f.write_text("{}")
    with pytest.raises(ValueError):
        check.load_config(f)


def test_presignup_cap(monkeypatch):
    presignup = load_handler("presignup")
    event = {"triggerSource": "PreSignUp_SignUp", "response": {}}
    monkeypatch.setenv("CAP", "5")
    assert presignup.handler(dict(event, response={}), None)["response"]["autoConfirmUser"] is True
    monkeypatch.setenv("CAP", "0")
    with pytest.raises(Exception, match="closed for today"):
        presignup.handler(dict(event, response={}), None)
    admin = {"triggerSource": "PreSignUp_AdminCreateUser", "response": {}}
    assert presignup.handler(admin, None)["response"] == {}


def test_api_handler_echoes_redacted_event():
    api = load_handler("api")
    token = fake_jwt({"sub": "s"})
    resp = api.handler(sample_event(token), None)
    check.assert_no_tokens(resp, [token])
    body = json.loads(resp["body"])
    assert body["authorizer"]["jwt"]["scopes"] == ["openid"]
    assert set(body["runtime"]) == {"python", "europe_london", "tzpath", "tzdata_package"}


class FakeContext:
    def get_remaining_time_in_millis(self) -> int:
        return 1000


def test_api_handler_crash_and_timeout_modes(monkeypatch):
    api = load_handler("api")
    event = dict(sample_event(fake_jwt({"sub": "s"})), queryStringParameters={"fail": "crash"})
    with pytest.raises(RuntimeError, match="deliberate crash"):
        api.handler(event, FakeContext())
    slept = []
    monkeypatch.setattr(api.time, "sleep", slept.append)
    api.handler(dict(event, queryStringParameters={"fail": "timeout"}), FakeContext())
    assert slept == [3.0]  # remaining time plus 2 s: past the function timeout


def test_summarise_burst_counts_and_keeps_one_sample_per_status():
    ok = {"status": 200, "www_authenticate": None, "content_type": "application/json", "body": {"runtime": {}}}
    limited = {"status": 429, "www_authenticate": None, "content_type": "application/json", "body": {"message": "Too Many Requests"}}
    out = check.summarise_burst([ok, limited, ok, limited, limited])
    assert out["calls"] == 5 and out["status_counts"] == {"200": 2, "429": 3}
    assert out["samples"]["429"]["body"] == {"message": "Too Many Requests"}
    assert "body" not in out["samples"]["200"]
