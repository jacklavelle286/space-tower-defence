// The battlefield page for the local slice (Phase 14): the Phaser canvas with React overlays on top (HUD, pad
// panel, activity placeholder, completion and defeat). React talks to the game only through GameBridge, and to the
// run rules only through LocalRun (the stand-in for the sync engine of Phase 21).
import { compileBattleConfig, initialRunState, type BattleConfig, type RunState } from "@scd/game-core";
import { AUTO, Game, Scale } from "phaser";
import { useEffect, useMemo, useRef, useState } from "react";
import { BattleScene } from "../game/BattleScene";
import { GameBridge } from "../game/GameBridge";
import type { GameData } from "../game/gameData";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../game/layout";
import { LocalRun } from "../game/localRun";
import { ActivityPlaceholder, PLACEHOLDER_ANSWER } from "./ActivityPlaceholder";
import { EndScreen } from "./EndScreen";
import { Hud } from "./Hud";
import { PadPanel } from "./PadPanel";
import { useAutoPlay, type AutoPlayMode } from "./useAutoPlay";
import { useHud } from "./useBridge";
import "./battlefield.css";

/** The M1 wave set (J-1). */
export const WAVE_SET_ID = "first-contact";

export interface LocalOptions {
  /** The run seed (the server makes 64 random bits in the real game, spine S5.1). */
  readonly seed: string;
  /** Development only: start with less colony health (with autoPlay "lose", or no Novas placed, defeat comes quickly). */
  readonly colonyHealth: number | null;
  /**
   * Development only (for screenshots and smoke checks): "play" places Novas, presses Ready and answers by itself;
   * "lose" does the same but places nothing, so the run reaches the defeat screen; null is a normal game.
   */
  readonly autoPlay: AutoPlayMode | null;
  readonly speed: 1 | 2;
}

function startingRun(data: GameData, config: BattleConfig, options: LocalOptions): RunState {
  const run = initialRunState(data.ruleset, config, [PLACEHOLDER_ANSWER]);
  if (options.colonyHealth === null || run.snapshot === undefined) return run;
  return { ...run, snapshot: { ...run.snapshot, colony: { ...run.snapshot.colony, health: options.colonyHealth } } };
}

export function Battlefield({ data, options, onNewGame }: { data: GameData; options: LocalOptions; onNewGame: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const config = useMemo(() => compileBattleConfig(data.ruleset, data.planet, WAVE_SET_ID), [data]);
  const [session, setSession] = useState<{ bridge: GameBridge; run: LocalRun } | null>(null);

  useEffect(() => {
    const parent = container.current;
    if (!parent) return;
    const run = new LocalRun(startingRun(data, config, options));
    const bridge = new GameBridge(config, run, options.seed);
    bridge.setSpeed(options.speed);
    // Created inside the effect and destroyed in its cleanup (React StrictMode mounts twice in development).
    const game = new Game({
      type: AUTO,
      parent,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: "#141633",
      scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_HORIZONTALLY },
      scene: [new BattleScene(bridge)],
      // Keyboard shortcuts and accessible controls live in the React DOM (plan E.5.2).
      input: { keyboard: false },
    });
    setSession({ bridge, run });

    // A hidden page pauses the simulation; coming back stays paused until Resume (C2.1, spine S10).
    const onVisibility = () => {
      if (document.visibilityState === "hidden") bridge.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      game.destroy(true);
      bridge.destroy();
      setSession(null);
    };
  }, [data, config, options]);

  return (
    <div className="bf">
      <div className="bf-stage">
        <div ref={container} className="bf-canvas" />
        {session !== null && <Overlays bridge={session.bridge} run={session.run} autoPlay={options.autoPlay} onNewGame={onNewGame} />}
      </div>
    </div>
  );
}

function Overlays({ bridge, run, autoPlay, onNewGame }: { bridge: GameBridge; run: LocalRun; autoPlay: AutoPlayMode | null; onNewGame: () => void }) {
  const hud = useHud(bridge);
  useAutoPlay(bridge, run, hud, autoPlay);
  const ended = hud.runStatus !== "IN_PROGRESS";
  return (
    <>
      <Hud bridge={bridge} hud={hud} />
      {!ended && hud.runPhase !== "ACTIVITY" && <PadPanel bridge={bridge} credits={hud.credits} />}
      {hud.runPhase === "ACTIVITY" && <ActivityPlaceholder run={run} afterWave={hud.wave - 1} />}
      {hud.paused && !ended && hud.battle === "IN_WAVE" && (
        <div className="bf-overlay">
          <div className="bf-card">
            <h2>Paused</h2>
            <button type="button" className="bf-big" onClick={() => bridge.resume()} autoFocus>
              Resume
            </button>
          </div>
        </div>
      )}
      {ended && <EndScreen hud={hud} onNewGame={onNewGame} />}
    </>
  );
}
