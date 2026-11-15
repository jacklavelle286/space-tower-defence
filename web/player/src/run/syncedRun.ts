// The real run's rules state on the client (spine S7.2): every change goes through game-core's reducer first, and
// only an APPLIED op is queued for the server, stamped with the run revision it was computed against. The server's
// answer is authoritative: when it disagrees, the run screen rebuilds this state from the cloud save (replace()).
//
// Nothing here talks to the network directly; ops go to the account's serial SyncQueue.
import {
  currentSlotId,
  reduce,
  type Applied,
  type Op,
  type Placements,
  type RunState,
  type Snapshot,
} from "@scd/game-core";
import type { RunPort } from "../game/runPort";
import type { NewOp } from "../sync/queue";

type Listener = (state: RunState) => void;
type OpPayload<T extends Op["type"]> = Extract<Op, { type: T }>["payload"];

export interface SyncedRunOptions {
  runId: string;
  initial: RunState;
  enqueue(op: NewOp): unknown;
  /** The reducer refused an op this screen built: local state and the screen disagree. The screen reloads the run. */
  onLocalRefusal?: (type: Op["type"], code: string) => void;
  newId?: () => string;
  now?: () => string;
}

export interface SubmittedAttempt {
  readonly opId: string;
  readonly applied: Applied;
}

export class SyncedRun implements RunPort {
  readonly runId: string;
  #state: RunState;
  readonly #listeners = new Set<Listener>();
  readonly #options: SyncedRunOptions;
  readonly #newId: () => string;
  readonly #now: () => string;

  constructor(options: SyncedRunOptions) {
    this.runId = options.runId;
    this.#state = options.initial;
    this.#options = options;
    this.#newId = options.newId ?? (() => crypto.randomUUID());
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  get state(): RunState {
    return this.#state;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Adopt a state rebuilt from the cloud save (after a disagreement, or a reload of the run). */
  replace(state: RunState): void {
    this.#state = state;
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners) listener(this.#state);
  }

  #apply<T extends Op["type"]>(type: T, payload: OpPayload<T>): { opId: string; applied: Applied } | null {
    const opId = this.#newId();
    const op = { opId, expectedRevision: this.#state.revision, type, payload, clientTime: this.#now() } as Op;
    const result = reduce(this.#state, op);
    if (result.result !== "APPLIED") {
      this.#options.onLocalRefusal?.(type, result.code);
      return null;
    }
    // Queued before the state moves on, so the op order is the revision order.
    this.#options.enqueue({ ...op, payload: op.payload as Record<string, unknown>, runId: this.runId });
    this.#state = result.state;
    this.#emit();
    return { opId, applied: result };
  }

  startWave(credits: number, placements: Placements): void {
    this.#apply("START_WAVE", { wave: this.#state.wave, credits, placements });
  }

  completeWave(snapshot: Snapshot): void {
    this.#apply("COMPLETE_WAVE", { wave: this.#state.wave, ...snapshot });
  }

  defeat(): void {
    this.#apply("DEFEAT", { wave: this.#state.wave });
  }

  /**
   * SAVE_PREP on Save and exit from preparation, only when the purchases differ from the saved snapshot (the server
   * would accept a repeat, but it is one more write for nothing). Returns whether an op was queued.
   */
  savePrep(credits: number, placements: Placements): boolean {
    const phase = this.#state.phase;
    const saved = this.#state.snapshot;
    if ((phase !== "BUILD" && phase !== "IN_WAVE") || saved === undefined) return false;
    if (saved.credits === credits && JSON.stringify(saved.placements) === JSON.stringify(placements)) return false;
    return this.#apply("SAVE_PREP", { credits, placements }) !== null;
  }

  /** One try at the current activity: one SUBMIT_ATTEMPT op. Null when there is no current slot to answer. */
  submitAttempt(answer: string): SubmittedAttempt | null {
    const slotId = currentSlotId(this.#state);
    if (slotId === null) return null;
    return this.#apply("SUBMIT_ATTEMPT", { slotId, answer });
  }
}
