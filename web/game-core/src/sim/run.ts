// A new run's state for the rules reducer, built from game data alone (Phase 14 local slice).
//
// In the real game the server creates the run (CREATE_RUN, spine S3.2, G7) and the client adopts the returned view.
// Until that exists (Phases 16 and 21) the local development entry builds the same starting state here: phase BUILD,
// wave 1, the wave set's starting snapshot, and one UNRESOLVED normal slot after every wave but the last, each with
// its reward pinned from the ruleset (C9.2). The accepted answers stand in for the content pack (Phase 22).
import { learningReward, type Ruleset } from "../data/game-data";
import { slotIdFor, type RunState, type Slot } from "../rules";
import type { BattleConfig } from "./config";

export function initialRunState(ruleset: Ruleset, config: BattleConfig, accepted: readonly string[]): RunState {
  const { waveSet } = config;
  if (waveSet.meteorAfter.length > 0) throw new Error("initialRunState: meteor slots need powers, which mechanics 1 does not have");
  const finalWave = waveSet.waves.length;
  const slots: Slot[] = [];
  for (let interval = 1; interval < finalWave; interval += 1) {
    slots.push({
      slotId: slotIdFor("NORMAL", interval),
      kind: "NORMAL",
      status: "UNRESOLVED",
      attempts: [],
      accepted: [...accepted],
      withdrawn: false,
      reward: { credits: learningReward(ruleset, interval) },
    });
  }
  return {
    mode: waveSet.mode,
    status: "IN_PROGRESS",
    stage: "AUTHORED",
    phase: "BUILD",
    wave: 1,
    finalWave,
    highestCompletedWave: 0,
    campaignCompleted: false,
    plannedThrough: finalWave - 1,
    revision: 0,
    powerChargeCap: ruleset.powerRules.inventoryCapPerPower,
    snapshot: {
      credits: waveSet.startCredits,
      placements: waveSet.presetPlacements.map((p) => ({ padId: p.padId, classId: p.classId, level: p.level, targeting: p.targeting })),
      colony: { health: waveSet.colonyHealth, shield: 0 },
      powers: {},
    },
    slots,
  };
}
