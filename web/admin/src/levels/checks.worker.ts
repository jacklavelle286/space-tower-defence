// The balance-check worker (Gate M, LD5): plays the jobs it is sent on the level merged into the live planet, posting
// each result as it finishes. The simulation is game-core's: no network, no storage, nothing but numbers.
import { parseRuleset, runJob } from "@scd/game-core";
import type { WorkerReply, WorkerRequest } from "./checkRun";
import { mergedLevel, setLiveRuleset } from "./levelFile";

const post = (reply: WorkerReply): void =>
  (self as unknown as { postMessage: (m: WorkerReply) => void }).postMessage(
    reply,
  );

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  try {
    setLiveRuleset(event.data.ruleset); // the page's live ruleset (AM1): the merge parses with it too
    const ruleset = parseRuleset(event.data.ruleset);
    const planet = mergedLevel(event.data.level, event.data.base);
    for (const job of event.data.jobs)
      post({ type: "result", result: runJob(ruleset, planet, job) });
  } catch (error) {
    post({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
