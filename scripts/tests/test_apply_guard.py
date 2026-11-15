"""Tests for scripts/apply_guard.py: a saved plan is applied once, and never after a newer apply started."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

import apply_guard as ag  # noqa: E402


def listing(*items: tuple[str, str]) -> dict:
    return {"Contents": [{"Key": f"applied/{rid}.json", "LastModified": ts, "Size": 200} for rid, ts in items]}


def test_first_apply_is_fresh():
    assert ag.decide("100", ag.parse_time("2026-11-15T09:08:41+00:00"), ag.parse_markers(None)) is None
    assert ag.parse_markers({}) == [] and ag.parse_markers({"Contents": []}) == []


def test_plan_made_after_the_last_apply_is_fresh():
    markers = ag.parse_markers(listing(("90", "2026-11-14T10:00:00+00:00")))
    assert ag.decide("100", ag.parse_time("2026-11-15T09:08:41+00:00"), markers) is None


def test_same_plan_twice_is_refused():
    markers = ag.parse_markers(listing(("100", "2026-11-15T10:00:00+00:00")))
    reason = ag.decide("100", ag.parse_time("2026-11-15T09:08:41+00:00"), markers)
    assert reason and "already been applied" in reason


def test_older_plan_after_a_newer_apply_is_refused():
    # The exit criterion: release A plans, release B plans, B is applied, then A is dispatched.
    markers = ag.parse_markers(listing(("105", "2026-11-15T11:00:00Z")))
    reason = ag.decide("100", ag.parse_time("2026-11-15T09:08:41Z"), markers)
    assert reason and "stale" in reason and "105" in reason


def test_newer_run_id_planned_before_an_apply_is_still_refused():
    # Run IDs are not the test: B (105) planned at 10:00, A (100) applied at 10:30 -> B describes old state.
    markers = ag.parse_markers(listing(("100", "2026-11-15T10:30:00Z")))
    assert "stale" in ag.decide("105", ag.parse_time("2026-11-15T10:00:00Z"), markers)


def test_same_second_counts_as_stale():
    markers = ag.parse_markers(listing(("100", "2026-11-15T10:00:00Z")))
    assert ag.decide("105", ag.parse_time("2026-11-15T10:00:00Z"), markers) is not None


def test_unexpected_key_is_an_error():
    with pytest.raises(ValueError):
        ag.parse_markers({"Contents": [{"Key": "applied/notes.txt", "LastModified": "2026-11-15T10:00:00Z"}]})


def test_cli(tmp_path, capsys):
    f = tmp_path / "markers.json"
    f.write_text(json.dumps(listing(("105", "2026-11-15T11:00:00+00:00"))))
    assert ag.main(["--plan-run-id", "100", "--plan-created", "2026-11-15T09:08:41+00:00", "--markers", str(f)]) == 1
    assert "stale" in capsys.readouterr().err
    assert ag.main(["--plan-run-id", "110", "--plan-created", "2026-11-15T12:00:00+00:00", "--markers", str(f)]) == 0
    f.write_text("")  # the CLI prints nothing for an empty prefix with --output json and a --query
    assert ag.main(["--plan-run-id", "110", "--plan-created", "2026-11-15T12:00:00+00:00", "--markers", str(f)]) == 0
    assert ag.main(["--plan-run-id", "1; rm", "--plan-created", "2026-11-15T12:00:00+00:00", "--markers", str(f)]) == 1
