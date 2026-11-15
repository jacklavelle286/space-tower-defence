// The run's rules state for the local slice (Phase 14), kept in memory only.
//
// Every change goes through the shared rules reducer from game-core, exactly as the sync engine will (Phase 21):
// the op is built, reduce() decides, and only an APPLIED result changes the state. Nothing is saved or sent: signing
// in, the op queue and IndexedDB are later phases. A refused op here is a bug in the slice, so it throws.
import { currentSlotId, reduce, type Op, type Placements, type RunState, type Snapshot } from "@scd/game-core";

type Listener = (state: RunState) => void;

type OpPayload<T extends Op["type"]> = Extract<Op, { type: T }>["payload"];

export class LocalRun {
  #state: RunState;
  readonly #listeners = new Set<Listener>();
  readonly #newId: () => string;
  readonly #now: () => string;

  constructor(initial: RunState, newId: () => string = () => crypto.randomUUID(), now: () => string = () => new Date().toISOString()) {
    this.#state = initial;
    this.#newId = newId;
    this.#now = now;
  }

  get state(): RunState {
    return this.#state;
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #apply<T extends Op["type"]>(type: T, payload: OpPayload<T>): RunState {
    const op = { opId: this.#newId(), expectedRevision: this.#state.revision, type, payload, clientTime: this.#now() } as Op;
    const result = reduce(this.#state, op);
    if (result.result !== "APPLIED") throw new Error(`local run: ${type} refused: ${JSON.stringify(result)}`);
    this.#state = result.state;
    for (const listener of this.#listeners) listener(this.#state);
    return this.#state;
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

  /** Answer the current activity slot (the placeholder panel sends the slot's accepted answer). */
  submitAttempt(answer: string): void {
    const slotId = currentSlotId(this.#state);
    if (slotId === null) throw new Error("local run: no activity is waiting");
    this.#apply("SUBMIT_ATTEMPT", { slotId, answer });
  }
}
