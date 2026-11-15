"""Spike API function (M0-10): echoes the HTTP API JWT-authoriser context it received, and checks the runtime.

The response and the log line carry the event with the Authorization header, cookies and the caller's IP (sourceIp and
the x-forwarded-for, forwarded and x-real-ip headers) removed, so no token or IP is ever returned or logged. check.py saves the returned event as the authoriser
fixture.
"""

import copy
import importlib.util
import json
import sys
import time
import zoneinfo
from datetime import datetime

DROP_HEADERS = {"authorization", "cookie"}
# Headers that carry the caller's IP (payload 2.0 passes x-forwarded-for; the others in case a proxy adds them).
IP_HEADERS = {"x-forwarded-for", "forwarded", "x-real-ip"}
REDACTED = "<redacted>"
# Unique per token; meaningless in a fixture.
REDACT_CLAIMS = {"jti", "origin_jti", "event_id"}
DOC_IP = "203.0.113.10"  # documentation range (RFC 5737)


def redact_event(event):
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
    claims = ((ctx.get("authorizer") or {}).get("jwt") or {}).get("claims") or {}
    for name in REDACT_CLAIMS & claims.keys():
        claims[name] = REDACTED
    return out


def runtime_check():
    try:
        now = datetime.now(zoneinfo.ZoneInfo("Europe/London"))
        london = {"ok": True, "now": now.isoformat(), "utcoffset": str(now.utcoffset()), "tzname": now.tzname()}
    except Exception as err:  # the check is whether this fails
        london = {"ok": False, "error": repr(err)}
    return {
        "python": sys.version,
        "europe_london": london,
        "tzpath": list(zoneinfo.TZPATH),  # system tz database locations
        "tzdata_package": importlib.util.find_spec("tzdata") is not None,
    }


def handler(event, context):
    redacted = redact_event(event)
    print(json.dumps(redacted))
    # check.py --gateway-probes (U-028): what the gateway returns when the function crashes or times out.
    fail = (event.get("queryStringParameters") or {}).get("fail")
    if fail == "crash":
        raise RuntimeError("spike: deliberate crash")
    if fail == "timeout":
        time.sleep(context.get_remaining_time_in_millis() / 1000 + 2)  # past the function timeout
    authorizer = (redacted.get("requestContext") or {}).get("authorizer") or {}
    body = {
        "routeKey": redacted.get("routeKey"),
        "authorizer": authorizer,
        "runtime": runtime_check(),
        "event": redacted,
    }
    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body),
    }
