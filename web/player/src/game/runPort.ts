// What the battlefield needs from "the run": its state, a change signal, and the three ops the battle itself makes.
// LocalRun (the development slice, memory only) and SyncedRun (the real run, saved through the op queue) both
// provide it, so GameBridge does not know or care whether anything is saved.
import type { Placements, RunState, Snapshot } from "@scd/game-core";

export interface RunPort {
  readonly state: RunState;
  subscribe(listener: (state: RunState) => void): () => void;
  startWave(credits: number, placements: Placements): void;
  completeWave(snapshot: Snapshot): void;
  defeat(): void;
}
