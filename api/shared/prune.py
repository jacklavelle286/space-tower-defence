"""G9 prune: keep an account's 50 most recently ended runs (spine S8.1 G9, F §12; Phase 32, M2-12).

Best-effort housekeeping after an op ends a run. For every terminal run beyond the newest RETAINED by `lastPlayedAt`
(which, for a terminal run, is its end time), the run's SLOT items are deleted in batches of 25 and the RUN item
**last**, so a prune that stops half-way leaves a run that a later prune finishes, never slots without their run.
Every failure is caught and logged here: pruning never changes the result of the op that triggered it.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from shared.data import DynamoTable
from shared.rules.contracts import LIMITS
from shared.runs import RUN_PREFIX, TERMINAL, run_sk, slot_prefix

RETAINED: int = LIMITS["retainedTerminalRuns"]

Log = Callable[..., None]


def runs_to_prune(runs: list[dict[str, Any]], keep: int = RETAINED) -> list[str]:
    """The runIds of terminal runs beyond the newest `keep`, oldest last-played first. Ties by runId, so the choice is
    the same on every call."""
    ended = [r for r in runs if r.get("status") in TERMINAL]
    ended.sort(key=lambda r: (str(r.get("lastPlayedAt") or ""), str(r["sk"])), reverse=True)
    return [str(r["sk"]).removeprefix(RUN_PREFIX) for r in reversed(ended[keep:])]


def prune_terminal_runs(
    table: DynamoTable,
    pk: str,
    log: Log,
    *,
    keep: int = RETAINED,
    sleep: Callable[[float], None] | None = None,
) -> int:
    """Delete the runs beyond the newest `keep` ended ones, with their slots. Returns how many runs were removed.
    Never raises: a failure is logged at WARNING with code PRUNE_FAILED and the count so far is returned."""
    removed = 0
    try:
        runs = table.query_prefix(pk, RUN_PREFIX, attributes=("sk", "status", "lastPlayedAt"))
        for run_id in runs_to_prune(runs, keep):
            slots = table.query_prefix(pk, slot_prefix(run_id), attributes=("pk", "sk"))
            table.batch_delete([(pk, str(s["sk"])) for s in slots], sleep=sleep)
            table.delete_item(pk, run_sk(run_id))  # last: a half-done prune leaves a run, never orphaned slots
            removed += 1
    except Exception as error:  # noqa: BLE001 - best effort by design (G9): log, never fail the op
        log("WARNING", code="PRUNE_FAILED", errorType=type(error).__name__, pruned=removed)
        return removed
    if removed:
        log("INFO", code="PRUNED", pruned=removed)
    return removed
