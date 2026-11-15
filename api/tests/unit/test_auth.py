"""Route-key authorisation and the `cognito:groups` parser (E.7.3, ADR-0012 check 7)."""

from __future__ import annotations

import pytest
from conftest import event_for

from shared.auth import OPERATOR, PLAYER, authorise, parse_groups
from shared.errors import ApiError

ROUTES = {"GET /api/me": PLAYER, "GET /api/admin/bank-status": OPERATOR}


@pytest.mark.parametrize(
    ("claim", "expected"),
    [
        (None, set()),
        (["admin"], {"admin"}),
        (["admin", "admin-extra"], {"admin", "admin-extra"}),
        ("[admin]", {"admin"}),  # the flattened shape the spike saw for `amr` ("[pwd]")
        ("[admin admin-extra]", {"admin", "admin-extra"}),
        ("[admin-extra admin]", {"admin", "admin-extra"}),
        ("[admin, admin-extra]", {"admin", "admin-extra"}),
        ('["admin","admin-extra"]', {"admin", "admin-extra"}),
        ("admin", {"admin"}),
        ("[]", set()),
        ("", set()),
        ("[admin-extra]", {"admin-extra"}),
        ("[administrators]", {"administrators"}),
        (42, set()),
        ({"admin": True}, set()),
    ],
)
def test_parse_groups_shapes(claim: object, expected: set[str]) -> None:
    assert parse_groups(claim) == expected


def test_fixture_list_claim_is_flattened_and_parses(player_event: dict) -> None:
    # The real event: `amr` is a list claim and arrived as the string "[pwd]".
    amr = player_event["requestContext"]["authorizer"]["jwt"]["claims"]["amr"]
    assert amr == "[pwd]"
    assert parse_groups(amr) == {"pwd"}


def test_player_fixture_is_authorised(player_event: dict) -> None:
    caller = authorise(event_for(player_event, "GET /api/me"), ROUTES)
    assert caller.sub == "a6c2b2b4-7051-70ef-b1e8-739ac38dd0cb"
    assert caller.route_key == "GET /api/me"
    assert caller.groups == frozenset()


@pytest.mark.parametrize("route_key", ["GET /spike/player", "GET /api/me/", "get /api/me", "", None, 7])
def test_unknown_route_key_is_not_found(player_event: dict, route_key: object) -> None:
    event = event_for(player_event, "GET /api/me")
    event["routeKey"] = route_key
    with pytest.raises(ApiError) as raised:
        authorise(event, ROUTES)
    assert raised.value.code == "NOT_FOUND"


def test_unknown_route_key_is_refused_before_claims_are_read(player_event: dict) -> None:
    # No claims at all: the route-key check still answers first, with NOT_FOUND rather than FORBIDDEN.
    event = event_for(player_event, "DELETE /api/me")
    del event["requestContext"]["authorizer"]
    with pytest.raises(ApiError) as raised:
        authorise(event, ROUTES)
    assert raised.value.code == "NOT_FOUND"


@pytest.mark.parametrize(
    "claims",
    [
        {"token_use": "id"},  # an ID token (it has the same issuer and audience)
        {"token_use": None},
        {"sub": None},
        {"sub": "U#someone-else"},  # never let a crafted sub reach a key
        {"sub": "A6C2B2B4-7051-70EF-B1E8-739AC38DD0CB"},
    ],
)
def test_bad_player_claims_are_forbidden(player_event: dict, claims: dict) -> None:
    with pytest.raises(ApiError) as raised:
        authorise(event_for(player_event, "GET /api/me", **claims), ROUTES)
    assert raised.value.code == "FORBIDDEN"


def test_missing_authoriser_context_is_forbidden(player_event: dict) -> None:
    event = event_for(player_event, "GET /api/me")
    del event["requestContext"]["authorizer"]
    with pytest.raises(ApiError) as raised:
        authorise(event, ROUTES)
    assert raised.value.code == "FORBIDDEN"


@pytest.mark.parametrize("groups", [None, "[]", "[admin-extra]", "[administrators]", "[Admin]", "[admins]"])
def test_operator_route_needs_exact_admin_group(player_event: dict, groups: object) -> None:
    event = event_for(player_event, "GET /api/admin/bank-status", cognito__groups=groups)
    with pytest.raises(ApiError) as raised:
        authorise(event, ROUTES)
    assert raised.value.code == "FORBIDDEN"


@pytest.mark.parametrize("groups", ["[admin]", "[admin admin-extra]", ["admin"], '["admin-extra","admin"]'])
def test_operator_route_with_admin_group(player_event: dict, groups: object) -> None:
    event = event_for(player_event, "GET /api/admin/bank-status", cognito__groups=groups)
    assert "admin" in authorise(event, ROUTES).groups


def test_route_without_a_known_authoriser_fails_closed(player_event: dict) -> None:
    with pytest.raises(ApiError) as raised:
        authorise(event_for(player_event, "GET /api/me"), {"GET /api/me": "none"})
    assert raised.value.code == "FORBIDDEN"
