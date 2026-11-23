#!/usr/bin/env python3
"""Gate G-12: the planned HTTP API routes equal contracts/routes.json (plan H.10, spine S11.6).

    terraform show -json tfplan > tfplan.json
    python scripts/check_route_keys.py tfplan.json [--routes contracts/routes.json] [--function NAME ...]

--function (repeatable) keeps only the catalogue's routes for those functions; without it, every route counts. The family
edition's root (infrastructure/main) deploys player-api, admin-api and tts, so its workflows name those three: the
school platform's routes (R63 onwards, DAT-7) are not in its plan. A named function with no route is an input error.

What it reads from the plan JSON: `planned_values`, the state Terraform will leave behind once the plan is applied,
walked through `root_module` and every `child_modules` entry. Each `aws_apigatewayv2_route` resource there gives:

  route_key             must be one of routes.json's "METHOD path" keys (paths keep /api, ADR-0001); together the
                        planned keys must equal the catalogue exactly: none missing, none extra, none twice
  authorization_type    "JWT" for a route whose catalogue authoriser is player or operator, "NONE" for none
  authorization_scopes  exactly [the route's scope] (a token without the scope gets 403, ADR-0012)

A route being deleted is absent from planned_values, so a plan that drops a route fails here. A value that is unknown
until apply (null in planned_values) fails too: route keys and scopes are literals and must be known at plan time.
There is no $default route (H.3: unknown paths get the gateway's own 404); one is reported as "not in routes.json".

Exit codes: 0 match, 1 mismatch (each difference listed), 2 unreadable input.
Prints a Markdown section for the run summary. Standard library only; runs on Python 3.12 and 3.14.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from collections.abc import Collection, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any

EXIT_OK = 0
EXIT_MISMATCH = 1
EXIT_BAD_INPUT = 2

REPO_ROOT = Path(__file__).resolve().parents[1]
ROUTES_FILE = REPO_ROOT / "contracts" / "routes.json"
ROUTE_TYPE = "aws_apigatewayv2_route"


class InputError(Exception):
    pass


@dataclass(frozen=True)
class Expected:
    id: str
    key: str
    authorization_type: str
    scopes: tuple[str, ...]


@dataclass(frozen=True)
class Planned:
    address: str
    key: str | None
    authorization_type: str | None
    scopes: tuple[str, ...] | None


def load_catalogue(path: Path, functions: Collection[str] | None = None) -> dict[str, Expected]:
    """The catalogue's routes by key; with `functions`, only the routes of those functions."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        routes = data["routes"]
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise InputError(f"{path}: not a route catalogue ({exc})") from exc
    if functions is not None:
        named = {r.get("function") for r in routes if isinstance(r, dict)}
        missing = sorted(set(functions) - named)
        if missing:
            raise InputError(f"{path}: no route for function(s) {', '.join(missing)}")
        routes = [r for r in routes if r.get("function") in functions]
    expected: dict[str, Expected] = {}
    for r in routes:
        try:
            key = f"{r['method']} {r['path']}"
            authoriser = r["authoriser"]
        except (KeyError, TypeError) as exc:
            raise InputError(f"{path}: route {r!r} lacks method, path or authoriser") from exc
        if key in expected:
            raise InputError(f"{path}: route key {key!r} is listed twice ({expected[key].id}, {r.get('id')})")
        if authoriser == "none":
            expected[key] = Expected(r.get("id", "?"), key, "NONE", ())
        else:
            if not r.get("scope"):
                raise InputError(f"{path}: {r.get('id')} {key} has authoriser {authoriser!r} but no scope")
            expected[key] = Expected(r.get("id", "?"), key, "JWT", (r["scope"],))
    if not expected:
        raise InputError(f"{path}: no routes")
    return expected


def _modules(module: dict[str, Any]) -> Iterator[dict[str, Any]]:
    yield module
    for child in module.get("child_modules") or []:
        yield from _modules(child)


def planned_routes(plan: dict[str, Any]) -> list[Planned]:
    root = (plan.get("planned_values") or {}).get("root_module")
    if not isinstance(root, dict):
        raise InputError("the plan JSON has no planned_values.root_module (is this `terraform show -json tfplan`?)")
    found: list[Planned] = []
    for module in _modules(root):
        for res in module.get("resources") or []:
            if res.get("type") != ROUTE_TYPE or res.get("mode", "managed") != "managed":
                continue
            values = res.get("values") or {}
            scopes = values.get("authorization_scopes")
            found.append(Planned(
                address=res.get("address", "?"),
                key=values.get("route_key"),
                authorization_type=values.get("authorization_type"),
                scopes=None if scopes is None else tuple(sorted(scopes)),
            ))
    return found


def compare(expected: dict[str, Expected], planned: list[Planned]) -> list[str]:
    problems: list[str] = []
    for p in planned:
        if p.key is None:
            problems.append(f"`{p.address}`: route_key is unknown at plan time (must be a literal)")
    counts = Counter(p.key for p in planned if p.key is not None)
    for key, n in sorted(counts.items()):
        if n > 1:
            problems.append(f"`{key}` is planned {n} times")
    planned_keys = set(counts)
    for key in sorted(set(expected) - planned_keys):
        problems.append(f"missing from the plan: {expected[key].id} `{key}`")
    for p in planned:
        if p.key is not None and p.key not in expected:
            problems.append(f"not in routes.json: `{p.key}` (`{p.address}`)")
    for p in planned:
        want = expected.get(p.key or "")
        if want is None:
            continue
        if p.authorization_type != want.authorization_type:
            problems.append(f"{want.id} `{p.key}`: authorization_type is {p.authorization_type!r}, "
                            f"expected {want.authorization_type!r}")
        got_scopes = p.scopes or ()  # NONE routes may report [] or null
        if p.scopes is None and want.scopes:
            problems.append(f"{want.id} `{p.key}`: authorization_scopes is unknown at plan time, expected "
                            f"{list(want.scopes)}")
        elif tuple(sorted(got_scopes)) != tuple(sorted(want.scopes)):
            problems.append(f"{want.id} `{p.key}`: authorization_scopes is {list(got_scopes)}, expected "
                            f"{list(want.scopes)}")
    return problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Gate G-12: planned API route keys equal contracts/routes.json.")
    parser.add_argument("plan_json", type=Path, help="output of `terraform show -json tfplan`")
    parser.add_argument("--routes", type=Path, default=ROUTES_FILE,
                        help="route catalogue (default: contracts/routes.json)")
    parser.add_argument("--function", action="append", dest="functions", metavar="NAME",
                        help="only this function's routes (repeatable; default: every route)")
    args = parser.parse_args(argv)
    selection = f" (functions: {', '.join(args.functions)})" if args.functions else ""

    try:
        expected = load_catalogue(args.routes, args.functions)
        try:
            plan = json.loads(args.plan_json.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise InputError(f"{args.plan_json}: {exc}") from exc
        planned = planned_routes(plan)
    except InputError as exc:
        print(f"check_route_keys: error: {exc}", file=sys.stderr)
        return EXIT_BAD_INPUT

    problems = compare(expected, planned)
    print("### G-12 route keys\n")
    if problems:
        print(f"**FAILED**: the plan's {len(planned)} `{ROUTE_TYPE}` resource(s) do not match the "
              f"{len(expected)} routes in `contracts/routes.json`{selection}:\n")
        for line in problems:
            print(f"- {line}")
        print()
        print(f"check_route_keys: FAILED: {len(problems)} difference(s)", file=sys.stderr)
        return EXIT_MISMATCH
    jwt = sum(1 for e in expected.values() if e.authorization_type == "JWT")
    print(f"OK: the plan's {len(planned)} routes equal `contracts/routes.json`{selection} "
          f"({jwt} JWT with their scope, {len(expected) - jwt} without an authoriser).\n")
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())
