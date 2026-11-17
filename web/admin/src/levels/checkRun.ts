// Running the balance checks for a level (Gate M, LD5) in parallel Web Workers. The jobs come from game-core's
// planChecks; each worker merges the level into the live planet once and plays the jobs it is given (runJob); the
// results are judged here with judgeChecks. A pool of up to four workers (one fewer than the laptop's cores) runs the
// campaign check in about a quarter of the 75 s LD0 measured on one thread. Cancel ends every worker at once.
import {
  judgeChecks,
  planChecks,
  type CheckJob,
  type JobResult,
  type PlanetDocument,
  type WaveSetReport,
} from "@scd/game-core";
import type { LevelFile } from "../api";
import { CURRENT_RULESET, mergedLevel } from "./levelFile";

export type WorkerRequest = {
  readonly level: LevelFile;
  readonly jobs: readonly CheckJob[];
};
export type WorkerReply =
  | { readonly type: "result"; readonly result: JobResult }
  | { readonly type: "error"; readonly message: string };

/** What the pool needs from a worker; tests pass one that runs the jobs on the main thread. */
export interface CheckWorker {
  postMessage(message: WorkerRequest): void;
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null;
  terminate(): void;
}

export function browserWorker(): CheckWorker {
  return new Worker(new URL("./checks.worker.ts", import.meta.url), {
    type: "module",
  }) as unknown as CheckWorker;
}

export function poolSize(): number {
  const cores =
    typeof navigator === "undefined" ? 2 : navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(4, cores - 1));
}

export interface CheckRun {
  readonly done: Promise<WaveSetReport[]>;
  cancel(): void;
}

/** The wave sets this level owns, in the order the tab shows them. */
export function ownedWaveSets(level: LevelFile): string[] {
  return Object.keys(level.waveSets).sort((a, b) =>
    a === "campaign" ? -1 : b === "campaign" ? 1 : a.localeCompare(b),
  );
}

/** Plans, spreads and judges the checks for every wave set the level owns. `onProgress(done, total)` after each run. */
export function runChecks(
  level: LevelFile,
  onProgress: (done: number, total: number) => void,
  makeWorker: () => CheckWorker = browserWorker,
  size = poolSize(),
): CheckRun {
  const planet: PlanetDocument = mergedLevel(level);
  const jobs = planChecks(planet, ownedWaveSets(level));
  const workers: CheckWorker[] = [];
  let cancelled = false;
  const done = new Promise<WaveSetReport[]>((resolve, reject) => {
    const results: JobResult[] = [];
    if (jobs.length === 0) {
      resolve([]);
      return;
    }
    const share = Array.from(
      { length: Math.min(size, jobs.length) },
      () => [] as typeof jobs,
    );
    jobs.forEach((job, i) => share[i % share.length]?.push(job));
    for (const part of share) {
      const worker = makeWorker();
      workers.push(worker);
      worker.onmessage = (event) => {
        if (cancelled) return;
        const reply = event.data;
        if (reply.type === "error") {
          workers.forEach((w) => w.terminate());
          reject(new Error(reply.message));
          return;
        }
        results.push(reply.result);
        onProgress(results.length, jobs.length);
        if (results.length === jobs.length) {
          workers.forEach((w) => w.terminate());
          // Judge in plan order, so the report does not depend on which worker finished first.
          const order = new Map(jobs.map((j, i) => [keyOf(j), i]));
          const sorted = [...results].sort(
            (a, b) =>
              (order.get(keyOf(a.job)) ?? 0) - (order.get(keyOf(b.job)) ?? 0),
          );
          resolve(judgeChecks(planet, CURRENT_RULESET, sorted));
        }
      };
      worker.postMessage({ level, jobs: part });
    }
  });
  return {
    done,
    cancel: () => {
      cancelled = true;
      workers.forEach((w) => w.terminate());
    },
  };
}

function keyOf(job: CheckJob): string {
  return `${job.waveSetId}|${job.policy}|${job.learn}|${job.seed}`;
}
