// The next-phase rule (spine S3.2, F section 3.4): the one place that decides which phase follows an interval.
// The Python mirror (Phase 12) implements the same function; contracts/fixtures/next-phase.json checks both.
import type { RunPhase, RunState, Slot, SlotId, SlotKind } from "./contracts.generated";

/** The phases the rule can choose. COMPLETION_OFFER and IN_WAVE are set by COMPLETE_WAVE and START_WAVE, never here. */
export type BetweenWavesPhase = Extract<RunPhase, "ACTIVITY" | "METEOR" | "BUILD">;

/** `N-<i>` for the normal activity after wave i, `M-<i>` for the meteor after wave i, with i written as three digits. */
export function slotIdFor(kind: SlotKind, interval: number): SlotId {
  return `${kind === "NORMAL" ? "N" : "M"}-${String(interval).padStart(3, "0")}`;
}

/**
 * For interval i (the wave just cleared, which is wave - 1 once the run has moved on):
 * ACTIVITY if N-<i> exists and is UNRESOLVED; else METEOR if M-<i> exists and is UNRESOLVED; else BUILD.
 * A missing or already-resolved slot simply falls through (that is how an empty endless interval reaches BUILD).
 */
export function nextPhase(slots: readonly Pick<Slot, "slotId" | "status">[], interval: number): BetweenWavesPhase {
  const open = (id: SlotId): boolean => slots.some((slot) => slot.slotId === id && slot.status === "UNRESOLVED");
  if (open(slotIdFor("NORMAL", interval))) return "ACTIVITY";
  if (open(slotIdFor("METEOR", interval))) return "METEOR";
  return "BUILD";
}

/** The current slot is derived, never stored: N-<wave-1> in ACTIVITY, M-<wave-1> in METEOR, none otherwise. */
export function currentSlotId(state: Pick<RunState, "phase" | "wave">): SlotId | null {
  if (state.phase === "ACTIVITY") return slotIdFor("NORMAL", state.wave - 1);
  if (state.phase === "METEOR") return slotIdFor("METEOR", state.wave - 1);
  return null;
}
