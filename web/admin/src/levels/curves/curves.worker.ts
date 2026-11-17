// The margin worker (Gate M, LD13): measures the campaign waves it is sent (measure.ts). Numbers only: no network.
import { compileBattleConfig, measureWaves, parseRuleset } from "@scd/game-core";
import { mergedLevel, setLiveRuleset } from "../levelFile";
import type { CurveReply, CurveRequest } from "./measure";

const post = (reply: CurveReply): void => (self as unknown as { postMessage: (m: CurveReply) => void }).postMessage(reply);

self.onmessage = (event: MessageEvent<CurveRequest>) => {
  try {
    setLiveRuleset(event.data.ruleset);
    const ruleset = parseRuleset(event.data.ruleset);
    const planet = mergedLevel(event.data.level, event.data.base);
    measureWaves(compileBattleConfig(ruleset, planet, "campaign"), event.data.waves, (measure) => post({ type: "wave", measure }));
    post({ type: "done" });
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
