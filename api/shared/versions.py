"""Per (campaign version, wave set) states from game-data/versions.json (Gate M, LD6; scope-level-designer.md §3.1).

The game-data publisher writes `<prefix>versions.json` (If-Match, no-cache) beside current.json:

    {"kind": "versions", "schema": 1,
     "testers": ["<Cognito sub>", ...],
     "versions": {"luna-1-a3": {"campaign": "published", "luna-1-a3-rush": "preview"}}}

States [PROPOSAL, ADR-0037; scope-asset-kinds-and-makers.md §3.0 "Retire and recover"]:

    published  playable by everyone (the default: a version or wave set the file does not list, which is every
               repo-released version, is published)
    preview    playable only by the tester accounts listed in `testers`
    retired    no new runs; runs already started resume as normal
    invalid    no new runs; a run already started is not playable: Saved games offers only End, which records
               ABANDONED (never DEFEATED), so it never counts as a loss, and every other op is REJECTED

`testers` holds Cognito subs (opaque IDs, never names or emails). A missing file means no states at all. The shape is
checked strictly; anything malformed raises VersionsUnavailable, so a broken file fails closed (500), as a broken
current.json does.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from typing import Any

from shared.bounds import VERSION

STATES = ("published", "preview", "retired", "invalid")
PUBLISHED = "published"
MAX_TESTERS = 20  # [ASSUMPTION] a family and a few friends
MAX_VERSIONS = 500  # [ASSUMPTION] years of publishing; the file stays far under the reader's 1 MiB cap
WAVE_SET_ID = re.compile(r"^[a-z0-9-]{1,40}$")
SUB = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


class VersionsUnavailable(Exception):
    """versions.json exists but is unreadable or malformed."""


@dataclass(frozen=True)
class Versions:
    """The parsed file. Empty (the default) when there is no file."""

    testers: frozenset[str] = frozenset()
    states: Mapping[str, Mapping[str, str]] = field(default_factory=dict)

    def state(self, campaign_version: Any, wave_set_id: Any) -> str:
        return self.states.get(str(campaign_version), {}).get(str(wave_set_id), PUBLISHED)

    def can_start(self, campaign_version: Any, wave_set_id: Any, sub: str) -> bool:
        """Whether this account may start a new run on the wave set (R8)."""
        state = self.state(campaign_version, wave_set_id)
        return state == PUBLISHED or (state == "preview" and sub in self.testers)

    def can_resume(self, campaign_version: Any, wave_set_id: Any) -> bool:
        """Whether a run already started may go on: everything but `invalid` (a preview run stays the tester's)."""
        return self.state(campaign_version, wave_set_id) != "invalid"


def parse_versions(data: Any) -> Versions:
    if not isinstance(data, dict) or set(data) != {"kind", "schema", "testers", "versions"}:
        raise VersionsUnavailable("versions.json: not an object with exactly kind, schema, testers and versions")
    if data["kind"] != "versions" or data["schema"] != 1:
        raise VersionsUnavailable("versions.json: kind must be 'versions' and schema 1")
    testers = data["testers"]
    if not isinstance(testers, list) or len(testers) > MAX_TESTERS:
        raise VersionsUnavailable(f"versions.json: testers must be a list of at most {MAX_TESTERS}")
    if not all(isinstance(t, str) and SUB.match(t) for t in testers) or len(set(testers)) != len(testers):
        raise VersionsUnavailable("versions.json: testers must be distinct account IDs")
    versions = data["versions"]
    if not isinstance(versions, dict) or len(versions) > MAX_VERSIONS:
        raise VersionsUnavailable(f"versions.json: versions must be an object of at most {MAX_VERSIONS}")
    states: dict[str, dict[str, str]] = {}
    for version, sets in versions.items():
        if not VERSION.match(version) or not isinstance(sets, dict):
            raise VersionsUnavailable("versions.json: bad version entry")
        for wave_set_id, state in sets.items():
            if not WAVE_SET_ID.match(wave_set_id) or state not in STATES:
                raise VersionsUnavailable(f"versions.json: bad state for {version}")
        states[version] = dict(sets)
    return Versions(testers=frozenset(testers), states=states)


def versions_body(versions: Versions) -> dict[str, Any]:
    """The file's JSON for `versions` (sorted, so the same states always give the same bytes)."""
    return {
        "kind": "versions",
        "schema": 1,
        "testers": sorted(versions.testers),
        "versions": {v: dict(sorted(sets.items())) for v, sets in sorted(versions.states.items())},
    }
