// The challenge worker (Gate M, LD18): makes one challenge (challenges.ts). Numbers only: no network.
import { makeChallenge, parseRuleset } from "@scd/game-core";
import { mergedLevel, setLiveRuleset } from "../levelFile";
import type { ChallengeReply, ChallengeRequest } from "./challenges";

const post = (reply: ChallengeReply): void => (self as unknown as { postMessage: (m: ChallengeReply) => void }).postMessage(reply);

self.onmessage = (event: MessageEvent<ChallengeRequest>) => {
  try {
    const { level, base, ruleset: raw, plan, index, seed, ownsCampaign } = event.data;
    setLiveRuleset(raw);
    const ruleset = parseRuleset(raw);
    const made = makeChallenge(ruleset, mergedLevel(level, base), plan, { seed, levelId: level.levelId, ownsCampaign, index });
    post({ type: "done", made });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
