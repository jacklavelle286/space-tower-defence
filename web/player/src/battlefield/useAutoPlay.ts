// Development only (?auto=1 or ?auto=lose): plays the slice by itself so a headless browser can screenshot a running
// battle and the end screens. It uses the same bridge commands and the same reducer path as a child's clicks.
// "play" buys Novas on open pads (it usually wins, even from ?colony=1); "lose" places nothing, so every alien
// reaches the colony and the run ends on the defeat screen.
import { useEffect } from "react";
import type { GameBridge, HudState } from "../game/GameBridge";
import type { LocalRun } from "../game/localRun";
import { PLACEHOLDER_ANSWER } from "./ActivityPlaceholder";

export type AutoPlayMode = "play" | "lose";

export function useAutoPlay(bridge: GameBridge, run: LocalRun, hud: HudState, mode: AutoPlayMode | null): void {
  useEffect(() => {
    if (mode === null || hud.runStatus !== "IN_PROGRESS") return;
    if (hud.runPhase === "ACTIVITY") {
      run.submitAttempt(PLACEHOLDER_ANSWER);
      return;
    }
    if (hud.runPhase !== "BUILD" || hud.battle !== "PREP") return;
    const battle = bridge.battle;
    if (battle === null) return;
    const cost = bridge.config.classes["nova"]?.levels[0]?.cost ?? Infinity;
    let credits = mode === "lose" ? 0 : battle.credits;
    for (const pad of bridge.config.pads) {
      if (credits < cost) break;
      if (!pad.open || battle.towers.some((t) => t.padId === pad.id)) continue;
      bridge.place(pad.id, "nova");
      credits -= cost;
    }
    bridge.startWave();
  }, [bridge, run, hud, mode]);
}
