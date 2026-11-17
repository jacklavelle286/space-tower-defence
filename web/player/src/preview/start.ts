// Where a battle preview starts (Gate M, LD12): at the wave the operator chose, holding what the competent test player
// (C17.1, learning 60 %) holds by then, so wave 30 can be seen without playing 29 waves first. In watch mode the test
// player also builds its towers for that wave; in play mode the operator starts from the same credits and towers and
// builds their own.
import { battleSnapshot, competentPolicy, createBattle, initialRunState, playUpTo, type BattleConfig, type RunState, type Ruleset } from "@scd/game-core";
import { PLACEHOLDER_ANSWER } from "../battlefield/ActivityPlaceholder";
import type { PreviewMode } from "@scd/shared/preview";

/** The test player's learning success (C17.2's middle rate). */
export const PREVIEW_LEARN = 0.6;

export interface PreviewStart {
  readonly run: RunState;
  /** The wave the test player lost on before reaching the chosen one, if it did (the preview starts there instead). */
  readonly lostAt: number | null;
}

export function previewStart(ruleset: Ruleset, config: BattleConfig, wave: number, mode: PreviewMode): PreviewStart {
  const base = initialRunState(ruleset, config, [PLACEHOLDER_ANSWER]);
  const target = Math.min(Math.max(1, wave), base.finalWave);
  const policy = competentPolicy(config);
  const reached = playUpTo(ruleset, config, policy, target, { learn: PREVIEW_LEARN, runSeed: "preview" });
  const start = reached.defeatedAt ?? target;
  let snapshot = reached.defeatedAt === null ? reached.snapshot : playUpTo(ruleset, config, competentPolicy(config), start, { learn: PREVIEW_LEARN, runSeed: "preview" }).snapshot;
  if (mode === "watch") {
    // The test player's own towers for this wave, built now (its moves during the wave are not replayed).
    const battle = createBattle(config, snapshot, start, "preview");
    competentPolicy(config).prep(battle);
    snapshot = battleSnapshot(battle);
  }
  return {
    run: { ...base, wave: start, highestCompletedWave: start - 1, snapshot },
    lostAt: reached.defeatedAt,
  };
}
