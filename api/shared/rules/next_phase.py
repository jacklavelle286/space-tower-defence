"""The next-phase rule (spine S3.2, F section 3.4): Python mirror of web/game-core/src/rules/next-phase.ts.

The one place that decides which phase follows an interval; contracts/fixtures/next-phase.json checks both languages.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any


def slot_id_for(kind: str, interval: int) -> str:
    """`N-<i>` for the normal activity after wave i, `M-<i>` for the meteor after wave i, i written as three digits.

    str().rjust() is String().padStart(): the same answer as TypeScript even for a value the rules never pass.
    """
    return f"{'N' if kind == 'NORMAL' else 'M'}-{str(interval).rjust(3, '0')}"


def next_phase(slots: Iterable[Mapping[str, Any]], interval: int) -> str:
    """For interval i (the wave just cleared, which is wave - 1 once the run has moved on):
    ACTIVITY if N-<i> exists and is UNRESOLVED; else METEOR if M-<i> exists and is UNRESOLVED; else BUILD.
    A missing or already-resolved slot simply falls through (that is how an empty endless interval reaches BUILD).
    """
    slots = list(slots)

    def is_open(slot_id: str) -> bool:
        return any(slot["slotId"] == slot_id and slot["status"] == "UNRESOLVED" for slot in slots)

    if is_open(slot_id_for("NORMAL", interval)):
        return "ACTIVITY"
    if is_open(slot_id_for("METEOR", interval)):
        return "METEOR"
    return "BUILD"


def current_slot_id(state: Mapping[str, Any]) -> str | None:
    """The current slot is derived, never stored: N-<wave-1> in ACTIVITY, M-<wave-1> in METEOR, none otherwise."""
    phase = state.get("phase")
    if phase == "ACTIVITY":
        return slot_id_for("NORMAL", state["wave"] - 1)
    if phase == "METEOR":
        return slot_id_for("METEOR", state["wave"] - 1)
    return None
