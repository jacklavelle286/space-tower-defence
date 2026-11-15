"""Route-key authorisation inside each function (plan E.6.3, E.7.3, G §1.1).

The gateway's JWT authoriser has already checked signature, issuer, client and route scope. The function then decides,
from the route key alone and before any data access:

1. the route key is in this function's allow-list, else 404 NOT_FOUND (G §1.1 "Unknown routes");
2. the token is an access token (`token_use == "access"`), else 403 FORBIDDEN;
3. on an operator route, `cognito:groups` contains exactly `admin`, else 403 FORBIDDEN;
4. `sub` is a Cognito UUID, so it is safe to put into a key such as `U#<sub>`.

The payload 2.0 event flattens list claims into strings: the auth spike saw `amr` arrive as "[pwd]" (ADR-0012, check 7).
`cognito:groups` is expected to arrive the same way, so `parse_groups` accepts a JSON list, a bracketed string with
space- or comma-separated names, a plain string, or nothing, and compares whole names only.
"""

from __future__ import annotations

import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from shared.errors import ApiError

PLAYER = "player"
OPERATOR = "operator"
AUTHORISERS = frozenset({PLAYER, OPERATOR})
ADMIN_GROUP = "admin"

_SUB = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
_SEPARATORS = re.compile(r"[\s,]+")


@dataclass(frozen=True)
class Caller:
    sub: str
    route_key: str
    authoriser: str
    groups: frozenset[str]


def parse_groups(value: object) -> frozenset[str]:
    """Group names from a `cognito:groups` claim in any shape it may arrive in; anything unrecognised gives none."""
    if value is None:
        return frozenset()
    if isinstance(value, list):
        return frozenset(v for v in value if isinstance(v, str) and v)
    if not isinstance(value, str):
        return frozenset()
    text = value.strip()
    if text.startswith("[") and text.endswith("]"):
        try:
            parsed = json.loads(text)
        except ValueError:
            text = text[1:-1]  # "[admin admin-extra]": Go-style flattening, not JSON
        else:
            return parse_groups(parsed) if isinstance(parsed, list) else frozenset()
    return frozenset(name for name in _SEPARATORS.split(text) if name)


def _claims(event: Mapping[str, Any]) -> Mapping[str, Any]:
    context = event.get("requestContext")
    authorizer = context.get("authorizer") if isinstance(context, Mapping) else None
    jwt = authorizer.get("jwt") if isinstance(authorizer, Mapping) else None
    claims = jwt.get("claims") if isinstance(jwt, Mapping) else None
    if not isinstance(claims, Mapping):
        raise ApiError("FORBIDDEN")
    return claims


def authorise(event: Mapping[str, Any], routes: Mapping[str, str]) -> Caller:
    """Check the event against `routes` (route key -> authoriser) and return the caller, or raise ApiError.

    The route-key check runs first and reads nothing but the event, so an unknown route never reaches a lookup.
    """
    route_key = event.get("routeKey")
    if not isinstance(route_key, str) or route_key not in routes:
        raise ApiError("NOT_FOUND")
    authoriser = routes[route_key]
    if authoriser not in AUTHORISERS:
        raise ApiError("FORBIDDEN")  # every route needs a token (G §1.1); fail closed on a bad table

    claims = _claims(event)
    if claims.get("token_use") != "access":
        raise ApiError("FORBIDDEN")
    groups = parse_groups(claims.get("cognito:groups"))
    if authoriser == OPERATOR and ADMIN_GROUP not in groups:
        raise ApiError("FORBIDDEN")
    sub = claims.get("sub")
    if not isinstance(sub, str) or not _SUB.fullmatch(sub):
        raise ApiError("FORBIDDEN")
    return Caller(sub=sub, route_key=route_key, authoriser=authoriser, groups=groups)
