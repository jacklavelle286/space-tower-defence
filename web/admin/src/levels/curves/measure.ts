// Measuring a campaign's margins in a Web Worker (Gate M, LD13): the competent test player at 0 % learning plays the
// level merged into the live planet; each measured wave comes back as it is done, so the panel fills as it goes.
// game-core's measureWaves does the work (C8.1 margin, 1x length).
import type { WaveMeasure } from "@scd/game-core";
import type { LevelFile } from "../../api";
import { currentRulesetRaw, liveBase } from "../levelFile";

export type CurveRequest = {
  readonly level: LevelFile;
  /** The live planet document the level is merged into. */
  readonly base: unknown;
  /** The live ruleset as R46 sent it. */
  readonly ruleset: unknown;
  readonly waves: readonly number[];
};
export type CurveReply = { readonly type: "wave"; readonly measure: WaveMeasure } | { readonly type: "done" } | { readonly type: "error"; readonly message: string };

export interface CurveWorker {
  postMessage(message: CurveRequest): void;
  onmessage: ((event: MessageEvent<CurveReply>) => void) | null;
  terminate(): void;
}

export function browserCurveWorker(): CurveWorker {
  return new Worker(new URL("./curves.worker.ts", import.meta.url), { type: "module" }) as unknown as CurveWorker;
}

export interface CurveRun {
  readonly done: Promise<void>;
  cancel(): void;
}

/** Measures `waves` of the level's campaign; `onWave` hears each one. */
export function measureCurve(level: LevelFile, waves: readonly number[], onWave: (m: WaveMeasure) => void, makeWorker: () => CurveWorker = browserCurveWorker): CurveRun {
  const worker = makeWorker();
  let settle: { resolve: () => void; reject: (e: Error) => void } = { resolve: () => undefined, reject: () => undefined };
  const done = new Promise<void>((resolve, reject) => (settle = { resolve, reject }));
  worker.onmessage = (event) => {
    const reply = event.data;
    if (reply.type === "wave") onWave(reply.measure);
    else if (reply.type === "done") {
      worker.terminate();
      settle.resolve();
    } else {
      worker.terminate();
      settle.reject(new Error(reply.message));
    }
  };
  worker.postMessage({ level, base: liveBase().raw, ruleset: currentRulesetRaw(), waves });
  return {
    done,
    cancel: () => {
      worker.terminate();
      settle.reject(new Error("cancelled"));
    },
  };
}
