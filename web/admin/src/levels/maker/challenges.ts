// Making a level's challenges in Web Workers (Gate M, LD18): one worker per challenge, each playing the campaign with
// the competent test player up to the challenge's first wave and then trying the challenge (game-core makeChallenge),
// so four challenges take about as long as the furthest one. The results are keyed and named for the level here.
import { assembleChallenges, type ChallengePlan, type MadeChallenge, type MadeChallenges } from "@scd/game-core";
import type { LevelFile } from "../../api";
import { currentRulesetRaw, liveBase } from "../levelFile";

export type ChallengeRequest = {
  /** The level with the campaign (for a level without it, a copy that has it: the test player needs one to play). */
  readonly level: LevelFile;
  readonly base: unknown;
  readonly ruleset: unknown;
  readonly plan: ChallengePlan;
  readonly index: number;
  readonly seed: number;
  readonly ownsCampaign: boolean;
};
export type ChallengeReply = { readonly type: "done"; readonly made: MadeChallenge } | { readonly type: "error"; readonly message: string };

export interface ChallengeWorker {
  postMessage(message: ChallengeRequest): void;
  onmessage: ((event: MessageEvent<ChallengeReply>) => void) | null;
  terminate(): void;
}

export function browserChallengeWorker(): ChallengeWorker {
  return new Worker(new URL("./challenges.worker.ts", import.meta.url), { type: "module" }) as unknown as ChallengeWorker;
}

export interface ChallengeRun {
  readonly done: Promise<MadeChallenges>;
  cancel(): void;
}

/** Every planned challenge, one worker each; `onOne` hears how many are done. */
export function makeLevelChallenges(
  level: LevelFile,
  plans: readonly ChallengePlan[],
  options: { readonly seed: number; readonly ownsCampaign: boolean },
  onOne: (done: number, total: number) => void,
  makeWorker: () => ChallengeWorker = browserChallengeWorker,
): ChallengeRun {
  const workers: ChallengeWorker[] = [];
  const rejects: ((error: Error) => void)[] = [];
  let finished = 0;
  const one = (plan: ChallengePlan, index: number): Promise<MadeChallenge> =>
    new Promise((resolve, reject) => {
      const worker = makeWorker();
      workers.push(worker);
      rejects.push(reject);
      worker.onmessage = (event) => {
        worker.terminate();
        const reply = event.data;
        if (reply.type === "error") {
          reject(new Error(reply.message));
          return;
        }
        finished += 1;
        onOne(finished, plans.length);
        resolve(reply.made);
      };
      worker.postMessage({ level, base: liveBase().raw, ruleset: currentRulesetRaw(), plan, index, seed: options.seed, ownsCampaign: options.ownsCampaign });
    });
  const done = Promise.all(plans.map(one)).then((made) => assembleChallenges(level.levelId, made, Object.keys(level.waveSets)));
  return {
    done,
    cancel: () => {
      for (const w of workers) w.terminate();
      for (const r of rejects) r(new Error("cancelled"));
    },
  };
}
