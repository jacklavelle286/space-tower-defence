#!/usr/bin/env python3
"""Auth spike token checks (M0-10). The owner runs this locally; standard library only, Python 3.12+.

One run = one sign-in through Cognito managed login with authorisation code + PKCE, then the checks:

  1. exchange the code at /oauth2/token (public client: client_id, no secret, plus the PKCE code_verifier);
  2. print the access-token and ID-token CLAIMS (never a token; jti/origin_jti/event_id redacted);
  3. call the spike API: own route with the access token, the ID token and no token; the other pool's route;
  4. refresh twice (token endpoint, and the GetTokensFromRefreshToken API) and compare scopes;
  5. save the API's echoed authoriser event, redacted, as api/tests/fixtures/authorizer/<client>-event.json;
  6. write a redacted results file to spikes/auth-cognito/results/ and sign out through /logout.

Optional, once each (README P9-P11): --gateway-probes (unmatched-route 404, a burst past the stage throttle for the 429,
a function crash and a function timeout); --global-sign-out (the user's own GlobalSignOut, then the old access token
and refresh token again); --wait-expiry (wait until the access token has expired, then call with it).

Nothing is created in AWS: the only calls are to Cognito's public OAuth endpoints, the public
GetTokensFromRefreshToken and GlobalSignOut APIs (both take the user's own token, no AWS credentials) and the spike API.
See README.md for the order of runs.
"""

from __future__ import annotations

import argparse
import base64
import collections
import concurrent.futures
import copy
import hashlib
import json
import re
import secrets
import socket
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[1]
FIXTURES = REPO / "api" / "tests" / "fixtures" / "authorizer"
RESULTS = HERE / "results"
PORT = 8765

REDACTED = "<redacted>"
REDACT_CLAIMS = frozenset({"jti", "origin_jti", "event_id"})
DROP_HEADERS = frozenset({"authorization", "cookie"})
# Headers that carry the caller's IP (payload 2.0 passes x-forwarded-for; the others in case a proxy adds them).
IP_HEADERS = frozenset({"x-forwarded-for", "forwarded", "x-real-ip"})
DOC_IP = "203.0.113.10"  # documentation range (RFC 5737)
# A JWT or JWE: base64url JSON header ("eyJ") followed by at least two more dot-separated parts.
TOKEN_RE = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\.[A-Za-z0-9_.-]*")


# ---------------------------------------------------------------------------
# Pure helpers (tested in tests/test_check.py)
# ---------------------------------------------------------------------------


def b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def pkce_challenge(verifier: str) -> str:
    """S256 code challenge (RFC 7636 §4.2): BASE64URL(SHA256(ASCII(code_verifier)))."""
    return b64url(hashlib.sha256(verifier.encode("ascii")).digest())


def make_pkce() -> tuple[str, str]:
    """A fresh 43-character verifier (32 random bytes) and its S256 challenge."""
    verifier = b64url(secrets.token_bytes(32))
    return verifier, pkce_challenge(verifier)


def authorize_url(
    domain: str,
    client_id: str,
    redirect_uri: str,
    scopes: str,
    state: str,
    challenge: str,
    *,
    prompt_login: bool = True,
    signup: bool = False,
) -> str:
    """The managed-login URL. /signup takes the same parameters as /oauth2/authorize (sources/05 §2.2)."""
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scopes,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    if prompt_login:
        params["prompt"] = "login"
    path = "signup" if signup else "oauth2/authorize"
    return f"{domain.rstrip('/')}/{path}?{urllib.parse.urlencode(params, quote_via=urllib.parse.quote)}"


def logout_url(domain: str, client_id: str, logout_uri: str) -> str:
    query = urllib.parse.urlencode({"client_id": client_id, "logout_uri": logout_uri}, quote_via=urllib.parse.quote)
    return f"{domain.rstrip('/')}/logout?{query}"


def decode_claims(token: str) -> dict[str, Any]:
    """The payload of a JWT, without verifying it (the API gateway verifies; this only reads)."""
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("not a JWT")
    payload = parts[1] + "=" * (-len(parts[1]) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))


def redact_claims(claims: dict[str, Any]) -> dict[str, Any]:
    return {k: (REDACTED if k in REDACT_CLAIMS else v) for k, v in claims.items()}


def redact_event(event: dict[str, Any]) -> dict[str, Any]:
    """Second line of defence over the API function's own redaction: no auth header, cookie, IP (sourceIp or
    forwarding headers) or token IDs."""
    out = copy.deepcopy(event)
    headers = out.get("headers") or {}
    out["headers"] = {
        k: (REDACTED if k.lower() in DROP_HEADERS else DOC_IP if k.lower() in IP_HEADERS else v)
        for k, v in headers.items()
    }
    if "cookies" in out:
        out["cookies"] = [REDACTED]
    ctx = out.get("requestContext") or {}
    http = ctx.get("http") or {}
    if "sourceIp" in http:
        http["sourceIp"] = DOC_IP
    jwt = (ctx.get("authorizer") or {}).get("jwt") or {}
    if isinstance(jwt.get("claims"), dict):
        jwt["claims"] = redact_claims(jwt["claims"])
    return out


def assert_no_tokens(obj: Any, known: list[str] | tuple[str, ...] = ()) -> None:
    """Refuse to write anything that contains a token, by shape or by value."""
    text = json.dumps(obj)
    if TOKEN_RE.search(text):
        raise ValueError("refusing to write: output contains something shaped like a token")
    for value in known:
        if value and value in text:
            raise ValueError("refusing to write: output contains a token or code from this run")


def load_config(path: Path) -> dict[str, Any]:
    """Accepts `terraform output -json` (whole document), `terraform output -json check_config`, or the value itself."""
    data = json.loads(path.read_text())
    if "check_config" in data:
        data = data["check_config"]
    if isinstance(data, dict) and "value" in data and "clients" not in data:
        data = data["value"]
    if not isinstance(data, dict) or "clients" not in data:
        raise ValueError(f"{path}: no check_config found (expected the spike's terraform output)")
    return data


def shape(value: Any) -> dict[str, Any]:
    """How a claim is serialised: its JSON type and value (for cognito:groups and scopes)."""
    return {"type": type(value).__name__, "value": value}


# ---------------------------------------------------------------------------
# Localhost callback server (127.0.0.1 and, if available, ::1; never other interfaces)
# ---------------------------------------------------------------------------


class CallbackServer:
    def __init__(self, port: int = PORT) -> None:
        self.hits: dict[str, dict[str, str]] = {}
        self._event = threading.Condition()
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802 (http.server API)
                url = urllib.parse.urlsplit(self.path)
                if url.path not in ("/callback", "/logged-out"):
                    self.send_error(404)
                    return
                params = dict(urllib.parse.parse_qsl(url.query))
                text = "Signed in." if url.path == "/callback" else "Signed out."
                body = f"<!doctype html><p>{text} You can close this tab and go back to the terminal.</p>".encode()
                self.send_response(200)
                self.send_header("content-type", "text/html; charset=utf-8")
                self.send_header("content-length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                with owner._event:
                    owner.hits[url.path] = params
                    owner._event.notify_all()

            def log_message(self, *args: Any) -> None:  # the query holds the code: do not print it
                pass

        self._servers: list[HTTPServer] = []
        for family, host in ((socket.AF_INET, "127.0.0.1"), (socket.AF_INET6, "::1")):
            cls = type("S", (HTTPServer,), {"address_family": family})
            try:
                self._servers.append(cls((host, port), Handler))
            except OSError:
                if family == socket.AF_INET:
                    raise
        for server in self._servers:
            threading.Thread(target=server.serve_forever, daemon=True).start()

    def wait(self, path: str, timeout: float) -> dict[str, str] | None:
        deadline = time.monotonic() + timeout
        with self._event:
            while path not in self.hits:
                left = deadline - time.monotonic()
                if left <= 0:
                    return None
                self._event.wait(left)
            return self.hits.pop(path)

    def close(self) -> None:
        for server in self._servers:
            server.shutdown()
            server.server_close()


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------


def http_call(url: str, *, headers: dict[str, str] | None = None, data: bytes | None = None) -> tuple[int, dict, str]:
    req = urllib.request.Request(url, data=data, headers=headers or {}, method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read().decode()
    except urllib.error.HTTPError as err:
        return err.code, {k.lower(): v for k, v in err.headers.items()}, err.read().decode(errors="replace")


def token_request(domain: str, form: dict[str, str]) -> dict[str, Any]:
    status, _, body = http_call(
        f"{domain.rstrip('/')}/oauth2/token",
        headers={"content-type": "application/x-www-form-urlencoded"},
        data=urllib.parse.urlencode(form).encode(),
    )
    if status != 200:
        raise RuntimeError(f"token endpoint returned {status}: {body[:300]}")
    return json.loads(body)


def refresh_via_api(region: str, client_id: str, refresh_token: str) -> dict[str, Any]:
    """GetTokensFromRefreshToken: an unauthenticated public Cognito API (the call aws-amplify v6 uses to refresh)."""
    status, _, body = http_call(
        f"https://cognito-idp.{region}.amazonaws.com/",
        headers={
            "content-type": "application/x-amz-json-1.1",
            "x-amz-target": "AWSCognitoIdentityProviderService.GetTokensFromRefreshToken",
        },
        data=json.dumps({"ClientId": client_id, "RefreshToken": refresh_token}).encode(),
    )
    if status != 200:
        raise RuntimeError(f"GetTokensFromRefreshToken returned {status}: {body[:300]}")
    result = json.loads(body)["AuthenticationResult"]
    return {"access_token": result["AccessToken"], "id_token": result.get("IdToken")}


def call_api(url: str, token: str | None) -> dict[str, Any]:
    headers = {"authorization": f"Bearer {token}"} if token else {}
    status, resp_headers, body = http_call(url, headers=headers)
    try:
        parsed: Any = json.loads(body)
    except ValueError:
        parsed = body[:300]
    if isinstance(parsed, dict) and "event" in parsed:
        parsed = {k: v for k, v in parsed.items() if k != "event"}  # the event goes to the fixture file
    return {
        "status": status,
        "www_authenticate": resp_headers.get("www-authenticate"),
        "content_type": resp_headers.get("content-type"),
        "body": parsed,
    }


def summarise_burst(results: list[dict[str, Any]]) -> dict[str, Any]:
    """Count statuses and keep one sample response (status, headers, body) per status."""
    counts = collections.Counter(r["status"] for r in results)
    samples: dict[str, Any] = {}
    for r in results:
        key = str(r["status"])
        if key not in samples:
            samples[key] = {k: v for k, v in r.items() if k != "body" or r["status"] != 200}
    return {"calls": len(results), "status_counts": {str(k): v for k, v in sorted(counts.items())}, "samples": samples}


def gateway_probes(api_url: str, own: str, access: str, burst: int = 40) -> dict[str, Any]:
    """U-027 and U-028: unmatched route, throttle, function crash and function timeout (the stage allows burst 10,
    rate 5 per second; the account allows 10 concurrent Lambda executions)."""
    probes: dict[str, Any] = {
        "unmatched_route_no_token": call_api(api_url + "/spike/nope", None),
        "unmatched_route_access_token": call_api(api_url + "/spike/nope", access),
        "function_crash": call_api(own + "?fail=crash", access),
        "function_timeout": call_api(own + "?fail=timeout", access),
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=burst) as pool:
        results = list(pool.map(lambda _: call_api(own, access), range(burst)))
    probes["burst"] = summarise_burst(results)
    return probes


def global_sign_out(region: str, access_token: str) -> dict[str, Any]:
    """GlobalSignOut with the user's own access token: a public Cognito API, no AWS credentials (U-031)."""
    status, _, body = http_call(
        f"https://cognito-idp.{region}.amazonaws.com/",
        headers={
            "content-type": "application/x-amz-json-1.1",
            "x-amz-target": "AWSCognitoIdentityProviderService.GlobalSignOut",
        },
        data=json.dumps({"AccessToken": access_token}).encode(),
    )
    return {"status": status, "body": body[:300]}


def scopes_of(claims: dict[str, Any]) -> list[str]:
    return sorted(str(claims.get("scope", "")).split())


# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------


def show(title: str, obj: Any) -> None:
    print(f"\n== {title}")
    print(json.dumps(obj, indent=2, sort_keys=True))


def run(args: argparse.Namespace) -> int:
    cfg = load_config(Path(args.outputs))
    client = cfg["clients"][args.client]
    scopes = args.scopes or client["scopes"]
    domain, client_id = client["domain"], client["client_id"]
    api_url = cfg["api_url"].rstrip("/")
    secrets_seen: list[str] = []

    server = CallbackServer(PORT)
    try:
        verifier, challenge = make_pkce()
        state = secrets.token_urlsafe(16)
        url = authorize_url(
            domain, client_id, cfg["redirect_uri"], scopes, state, challenge,
            prompt_login=not args.no_prompt_login, signup=args.signup,
        )
        print(f"Client: {args.client}  scopes: {scopes}  prompt=login: {not args.no_prompt_login}  page: "
              f"{'signup' if args.signup else 'authorize'}")
        print(f"Opening managed login (if no browser opens, paste this):\n  {url}")
        if not args.no_browser:
            webbrowser.open(url)

        params = server.wait("/callback", args.timeout)
        if params is None:
            print("No redirect reached http://localhost:8765/callback in time.")
            return 2
        if "error" in params:
            show("Managed login returned an error", params)
            return 2
        if params.get("state") != state:
            print("State mismatch: refusing this callback.")
            return 2
        secrets_seen.append(params.get("code", ""))

        tokens = token_request(domain, {
            "grant_type": "authorization_code",
            "client_id": client_id,
            "code": params["code"],
            "redirect_uri": cfg["redirect_uri"],
            "code_verifier": verifier,
        })
        access, id_token, refresh = tokens["access_token"], tokens.get("id_token"), tokens.get("refresh_token")
        secrets_seen += [access, id_token or "", refresh or ""]
        access_claims = decode_claims(access)
        id_claims = decode_claims(id_token) if id_token else {}

        report: dict[str, Any] = {
            "client": args.client,
            "label": args.label,
            "time_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "page": "signup" if args.signup else "authorize",
            "prompt_login": not args.no_prompt_login,
            "scopes_requested": scopes,
            "token_response_keys": sorted(tokens),
            "access_token_claims": redact_claims(access_claims),
            "id_token_claims": redact_claims(id_claims),
            "access_token_has_aud": "aud" in access_claims,
        }
        show("Access-token claims", report["access_token_claims"])
        show("ID-token claims", report["id_token_claims"])

        own, other = api_url + client["own_route"], api_url + client["other_route"]
        calls = {
            "own_route_access_token": call_api(own, access),
            "own_route_id_token": call_api(own, id_token),
            "own_route_no_token": call_api(own, None),
            "other_pool_route_access_token": call_api(other, access),
        }
        report["api_calls"] = calls
        show("API calls (status, www-authenticate, body)", calls)

        # The echoed event, from a second call so the body kept above stays short.
        status, _, body = http_call(own, headers={"authorization": f"Bearer {access}"})
        if status == 200:
            event = redact_event(json.loads(body)["event"])
            auth = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {})
            report["event_shapes"] = {
                "jwt.claims.cognito:groups": shape(auth.get("claims", {}).get("cognito:groups")),
                "jwt.claims.scope": shape(auth.get("claims", {}).get("scope")),
                "jwt.scopes": shape(auth.get("scopes")),
            }
            show("Authoriser event shapes", report["event_shapes"])
            if not args.scopes:  # only the default scope set makes the reference fixture
                assert_no_tokens(event, secrets_seen)
                FIXTURES.mkdir(parents=True, exist_ok=True)
                fixture = FIXTURES / f"{args.client}-event.json"
                fixture.write_text(json.dumps(event, indent=2, sort_keys=True) + "\n")
                print(f"\nSaved the redacted authoriser event to {fixture.relative_to(REPO)}")

        report["refresh"] = {}
        if refresh:
            before = scopes_of(access_claims)
            for name, fn in (
                ("token_endpoint", lambda: token_request(domain, {
                    "grant_type": "refresh_token", "client_id": client_id, "refresh_token": refresh})),
                ("GetTokensFromRefreshToken", lambda: refresh_via_api(cfg["region"], client_id, refresh)),
            ):
                try:
                    new = fn()
                    secrets_seen += [new["access_token"], new.get("id_token") or "", new.get("refresh_token") or ""]
                    after = scopes_of(decode_claims(new["access_token"]))
                    report["refresh"][name] = {
                        "scopes_before": before,
                        "scopes_after": after,
                        "scopes_kept": before == after,
                        "new_refresh_token_issued": "refresh_token" in new,
                        "own_route_with_refreshed_token": call_api(own, new["access_token"]),
                    }
                except Exception as err:  # record and carry on: the result is the finding
                    report["refresh"][name] = {"error": str(err)}
        else:
            report["refresh"]["error"] = "no refresh token in the token response"
        show("Refresh", report["refresh"])

        if args.gateway_probes:
            report["gateway_probes"] = gateway_probes(api_url, own, access)
            show("Gateway probes (404, 429, crash, timeout)", report["gateway_probes"])

        if args.global_sign_out:
            gso: dict[str, Any] = {"global_sign_out": global_sign_out(cfg["region"], access)}
            gso["own_route_old_access_token"] = call_api(own, access)
            if refresh:
                try:
                    token_request(domain, {"grant_type": "refresh_token", "client_id": client_id, "refresh_token": refresh})
                    gso["refresh_with_old_refresh_token"] = "accepted"
                except Exception as err:
                    gso["refresh_with_old_refresh_token"] = {"error": str(err)}
            report["after_global_sign_out"] = gso
            show("After GlobalSignOut", gso)

        if args.wait_expiry:
            wait = max(0, int(access_claims["exp"]) - time.time()) + 30
            print(f"\nWaiting {wait / 60:.1f} min until the access token has expired (leave this running)...")
            time.sleep(wait)
            report["expired_access_token"] = {
                "seconds_after_exp": round(time.time() - int(access_claims["exp"])),
                "own_route": call_api(own, access),
            }
            show("Expired access token", report["expired_access_token"])
        runtime = calls["own_route_access_token"]["body"]
        if isinstance(runtime, dict) and "runtime" in runtime:
            show("Lambda runtime (python, Europe/London)", runtime["runtime"])

        if not args.skip_logout:
            out = logout_url(domain, client_id, cfg["logout_uri"])
            print(f"\nSigning out through /logout (if no browser opens, paste this):\n  {out}")
            if not args.no_browser:
                webbrowser.open(out)
            report["logout_redirect_reached"] = server.wait("/logged-out", 120) is not None
        else:
            report["logout_redirect_reached"] = None  # skipped on purpose (switching test)

        assert_no_tokens(report, secrets_seen)
        RESULTS.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        result = RESULTS / f"{args.client}-{args.label or 'run'}-{stamp}.json"
        result.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
        print(f"\nResults (redacted) written to {result.relative_to(REPO)}")
        print(f"Signed in as username: {access_claims.get('username')!r}")
        return 0
    finally:
        server.close()


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--outputs", default=str(HERE / "outputs.json"), help="terraform output JSON (default: %(default)s)")
    p.add_argument("--client", choices=["player", "operator", "operator-noscope"], default="player")
    p.add_argument("--signup", action="store_true", help="open the managed-login /signup page instead of sign-in")
    p.add_argument("--scopes", help="override the requested scopes, e.g. 'openid' for a token without the route scope")
    p.add_argument("--no-prompt-login", action="store_true", help="leave out prompt=login (switching test)")
    p.add_argument("--skip-logout", action="store_true", help="do not visit /logout at the end (switching test)")
    p.add_argument("--no-browser", action="store_true", help="print URLs instead of opening the browser")
    p.add_argument("--gateway-probes", action="store_true",
                   help="also call an unmatched route, burst past the throttle, and make the function crash and time out")
    p.add_argument("--global-sign-out", action="store_true",
                   help="also sign the user out everywhere (GlobalSignOut), then try the old access and refresh tokens")
    p.add_argument("--wait-expiry", action="store_true",
                   help="also wait until the access token expires (about an hour), then call the API with it")
    p.add_argument("--label", help="short tag for the results file name, e.g. child1")
    p.add_argument("--timeout", type=float, default=300, help="seconds to wait for the sign-in redirect")
    args = p.parse_args(argv)
    if args.global_sign_out and args.wait_expiry:
        p.error("--global-sign-out and --wait-expiry answer different questions; run them separately")
    return run(args)


if __name__ == "__main__":
    sys.exit(main())
