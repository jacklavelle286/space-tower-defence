// The rules reducer for the six Milestone 1 ops (spine S3.2, F sections 3.3-3.5; M1-13).
//
// reduce(state, op) is a pure function: it never changes `state` or `op`, reads no clock and does no I/O, and it
// returns either the new state or a refusal with a named code. The browser calls it before an op may exist at all;
// the server's Python mirror (Phase 12) runs the same rules, and contracts/fixtures/ops/*.json checks that they agree.
//
// Check order, taken from the server's per-op order (spine S7.1, G section 5.3) minus the server-only steps:
//   envelope  the op's own fields (opId, expectedRevision, type, payload is an object, clientTime) -> VALIDATION_FAILED
//   (c)       run terminal                                                                       -> RUN_TERMINAL
//   (d)       expectedRevision != revision                                                       -> STALE_REVISION
//   (f)       phase, wave and current slot (F section 3.5)                                       -> PHASE_MISMATCH
//   (g)       payload schema                                                                     -> VALIDATION_FAILED
// Not here: (a) duplicates (the pure reducers have no duplicate memory, I.2.3), (b) the session fence and
// (e) loadable pins (server only), and (h) plausibility bounds (Phase 30, needs the bounds file).
//
// (f) compares a payload field (wave, slotId) only when it has the right JSON type; a missing or wrongly typed
// field is left for (g) to refuse, so the same bad op gets the same code in both languages.
import {
  LIMITS,
  type AttemptResult,
  type Op,
  type Outcome,
  type PhaseMismatchDetails,
  type Placements,
  type Powers,
  type Reward,
  type RunPhase,
  type RunState,
  type Slot,
  type Snapshot,
  type ValidationProblem,
} from "./contracts.generated";
import { currentSlotId, nextPhase } from "./next-phase";
import { validate } from "./schema";

export type Applied = {
  readonly result: "APPLIED";
  readonly state: RunState;
  readonly outcome?: Outcome;
  readonly attempt?: AttemptResult;
};

export type Rejected =
  | { readonly result: "REJECTED"; readonly code: "RUN_TERMINAL" | "STALE_REVISION" }
  | { readonly result: "REJECTED"; readonly code: "PHASE_MISMATCH"; readonly details: PhaseMismatchDetails }
  | { readonly result: "REJECTED"; readonly code: "VALIDATION_FAILED"; readonly details: readonly ValidationProblem[] };

export type ReduceResult = Applied | Rejected;

const PAYLOAD_PREFIX = "op.payload.";

/** What step (f) decided: go on, the VOIDED-slot no-op, or a phase mismatch. */
type Gate = "ok" | "voided-slot" | "mismatch";

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

/** `wave` must equal the run's wave when it is an integer; any other value is left for the schema step. */
function waveMatches(payload: Readonly<Record<string, unknown>>, wave: number): boolean {
  const value = payload["wave"];
  return !isInteger(value) || value === wave;
}

function gate(state: RunState, phase: RunPhase, op: Op): Gate {
  const payload: Readonly<Record<string, unknown>> = op.payload;
  switch (op.type) {
    case "SAVE_PREP":
      return phase === "BUILD" || phase === "IN_WAVE" ? "ok" : "mismatch";
    case "START_WAVE":
      return (phase === "BUILD" || phase === "IN_WAVE") && waveMatches(payload, state.wave) ? "ok" : "mismatch";
    case "COMPLETE_WAVE":
    case "DEFEAT":
      return phase === "IN_WAVE" && waveMatches(payload, state.wave) ? "ok" : "mismatch";
    case "ABANDON":
      return state.campaignCompleted ? "mismatch" : "ok";
    case "SUBMIT_ATTEMPT": {
      const slotId = payload["slotId"];
      if (typeof slotId === "string" && state.slots.some((s) => s.slotId === slotId && s.status === "VOIDED")) {
        return "voided-slot";
      }
      if (phase !== "ACTIVITY" && phase !== "METEOR") return "mismatch";
      if (typeof slotId !== "string") return "ok";
      const slot = state.slots.find((s) => s.slotId === slotId);
      return slotId === currentSlotId(state) && slot?.status === "UNRESOLVED" ? "ok" : "mismatch";
    }
  }
}

function copyPlacements(placements: Placements): Placements {
  return placements.map((p) => ({ ...p }));
}

/**
 * One more charge of `powerId`, unless the run already holds `cap` of it (C10 "inventory cap"; spine S3.2: a success
 * at the cap is still SUCCEEDED, with no charge added). This is the one place a charge is ever added, and so the one
 * place the cap is enforced: the battle only ever takes charges away (usePower), and the server's grant runs this
 * same rule in its Python mirror (api/shared/rules/reducer.py _grant).
 */
export function grantPowerCharge(powers: Powers, powerId: string, cap: number): Powers {
  const held = powers[powerId] ?? 0;
  return held < cap ? { ...powers, [powerId]: held + 1 } : powers;
}

/** Add a slot's pinned reward: credits, or one power charge unless that power is already at its cap. */
function grant(snapshot: Snapshot, reward: Reward, powerChargeCap: number): Snapshot {
  const powers = reward.powerId === undefined ? snapshot.powers : grantPowerCharge(snapshot.powers, reward.powerId, powerChargeCap);
  return { ...snapshot, credits: snapshot.credits + reward.credits, powers };
}

/** A terminal run keeps its fields but loses `phase` and `snapshot` (spine S3.1, S4). */
function finish(state: RunState, status: "DEFEATED" | "ABANDONED" | "COMPLETED"): RunState {
  const { phase: _phase, snapshot: _snapshot, ...rest } = state;
  return { ...rest, status };
}

function needSnapshot(state: RunState): Snapshot {
  if (state.snapshot === undefined) throw new Error("invalid run state: an IN_PROGRESS run has no snapshot");
  return state.snapshot;
}

function submitAttempt(state: RunState, op: Extract<Op, { type: "SUBMIT_ATTEMPT" }>, revision: number): Applied {
  const interval = state.wave - 1;
  const index = state.slots.findIndex((s) => s.slotId === op.payload.slotId);
  const slot = state.slots[index];
  if (slot === undefined) throw new Error("invalid run state: the current slot is missing");
  const snapshot = needSnapshot(state);
  const replace = (next: Slot): Slot[] => state.slots.map((s, i) => (i === index ? next : s));

  if (slot.withdrawn) {
    // VOID: no judging, no attempt counted, the reward granted once, and the phase moves on (spine S3.3).
    const slots = replace({ ...slot, status: "VOIDED" });
    return {
      result: "APPLIED",
      outcome: "VOIDED",
      state: {
        ...state,
        revision,
        slots,
        phase: nextPhase(slots, interval),
        snapshot: grant(snapshot, slot.reward, state.powerChargeCap),
      },
    };
  }

  const n = slot.attempts.length + 1;
  const correct = slot.accepted.includes(op.payload.answer);
  const status = correct ? "SUCCEEDED" : n >= LIMITS.attemptsPerSlot ? "FAILED" : "UNRESOLVED";
  const slots = replace({
    ...slot,
    status,
    attempts: [...slot.attempts, { n, attemptId: op.opId, answer: op.payload.answer, correct }],
  });
  const outcome: Outcome = correct ? "RESOLVED_SUCCEEDED" : status === "FAILED" ? "RESOLVED_FAILED" : "INCORRECT";
  return {
    result: "APPLIED",
    outcome,
    attempt: { n, correct, slotStatus: status, rewardGranted: correct },
    state: {
      ...state,
      revision,
      slots,
      ...(status === "UNRESOLVED" ? {} : { phase: nextPhase(slots, interval) }),
      snapshot: correct ? grant(snapshot, slot.reward, state.powerChargeCap) : snapshot,
    },
  };
}

function completeWave(state: RunState, op: Extract<Op, { type: "COMPLETE_WAVE" }>, revision: number): RunState {
  const { wave, credits, placements, colony, powers } = op.payload;
  const snapshot: Snapshot = { credits, placements: copyPlacements(placements), colony: { ...colony }, powers: { ...powers } };
  const cleared = { ...state, revision, snapshot, highestCompletedWave: wave };
  if (state.stage === "AUTHORED" && wave === state.finalWave) {
    // CAMPAIGN: the offer screen (wave stays at finalWave). CHALLENGE: the run is complete (J-1).
    return state.mode === "CAMPAIGN"
      ? { ...cleared, campaignCompleted: true, phase: "COMPLETION_OFFER" }
      : finish(cleared, "COMPLETED");
  }
  if (wave >= LIMITS.endless.finalWave) return finish(cleared, "COMPLETED");
  // Endless block planning (F section 3.6) needs the server's content selection, so it is not part of this reducer.
  return { ...cleared, wave: wave + 1, phase: nextPhase(state.slots, wave) };
}

/**
 * Apply one op to a run. `op` is untrusted (it may come from a queue, a fixture or a test), so it is validated
 * against contracts/schemas/op.schema.json here; `state` is trusted to match contracts/schemas/run-state.schema.json.
 */
export function reduce(state: RunState, op: unknown): ReduceResult {
  const problems = validate("op.schema.json", op);
  const envelopeProblems = problems.filter((p) => !p.field.startsWith(PAYLOAD_PREFIX));
  if (envelopeProblems.length > 0) return { result: "REJECTED", code: "VALIDATION_FAILED", details: envelopeProblems };
  const valid = op as Op; // its own fields are checked; the payload is checked at (g) below

  if (state.status !== "IN_PROGRESS") return { result: "REJECTED", code: "RUN_TERMINAL" };
  if (valid.expectedRevision !== state.revision) return { result: "REJECTED", code: "STALE_REVISION" };
  const phase = state.phase;
  if (phase === undefined) throw new Error("invalid run state: an IN_PROGRESS run has no phase");

  const decision = gate(state, phase, valid);
  if (decision === "mismatch") {
    return {
      result: "REJECTED",
      code: "PHASE_MISMATCH",
      details: { phase, wave: state.wave, currentSlotId: currentSlotId(state) },
    };
  }
  const payloadProblems = problems.filter((p) => p.field.startsWith(PAYLOAD_PREFIX));
  if (payloadProblems.length > 0) return { result: "REJECTED", code: "VALIDATION_FAILED", details: payloadProblems };

  const revision = state.revision + 1;
  if (decision === "voided-slot") {
    // A replayed op naming an already-VOIDED slot: applied, but changes nothing except the revision (F section 3.3).
    return { result: "APPLIED", outcome: "NO_OP_VOIDED_SLOT", state: { ...state, revision } };
  }

  switch (valid.type) {
    case "SAVE_PREP":
    case "START_WAVE": {
      const { credits, placements } = valid.payload;
      const snapshot = { ...needSnapshot(state), credits, placements: copyPlacements(placements) };
      const next: RunPhase = valid.type === "SAVE_PREP" ? "BUILD" : "IN_WAVE";
      return { result: "APPLIED", state: { ...state, revision, snapshot, phase: next } };
    }
    case "COMPLETE_WAVE":
      return { result: "APPLIED", state: completeWave(state, valid, revision) };
    case "SUBMIT_ATTEMPT":
      return submitAttempt(state, valid, revision);
    case "DEFEAT":
      return { result: "APPLIED", state: finish({ ...state, revision }, "DEFEATED") };
    case "ABANDON":
      return { result: "APPLIED", state: finish({ ...state, revision }, "ABANDONED") };
  }
}
