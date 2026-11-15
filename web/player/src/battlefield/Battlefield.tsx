// The battlefield page: the Phaser canvas with React overlays on top. React talks to the game only through
// GameBridge, and to the run rules only through a RunPort: LocalRun in the development slice (Phase 14, saves
// nothing) and SyncedRun on the real run screen (Phase 22, saved through the op queue). The overlays differ (the local
// slice has a placeholder activity, the real run the learning panel), so the caller passes them as children.
import { compileBattleConfig } from "@scd/game-core";
import { AUTO, Game, Scale } from "phaser";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BridgeContext } from "./bridgeContext";
import { BattleScene } from "../game/BattleScene";
import { GameBridge } from "../game/GameBridge";
import type { GameData } from "../game/gameData";
import { CANVAS_HEIGHT, CANVAS_WIDTH } from "../game/layout";
import type { RunPort } from "../game/runPort";
import "./battlefield.css";

/** The M1 wave set (J-1). */
export const WAVE_SET_ID = "first-contact";

export interface BattlefieldProps {
  readonly data: GameData;
  readonly waveSetId: string;
  readonly run: RunPort;
  /** The run seed (from the server for a saved run, spine S5.1). */
  readonly seed: string;
  readonly speed: 1 | 2;
  /** The overlays; they read the bridge with useGameBridge(). */
  readonly children: ReactNode;
  /** Called once the bridge exists (the run screen needs it for Save and exit), and with null when it goes. */
  readonly onBridge?: (bridge: GameBridge | null) => void;
}

export function Battlefield({ data, waveSetId, run, seed, speed, children, onBridge }: BattlefieldProps) {
  const container = useRef<HTMLDivElement>(null);
  const config = useMemo(() => compileBattleConfig(data.ruleset, data.planet, waveSetId), [data, waveSetId]);
  const [bridge, setBridge] = useState<GameBridge | null>(null);

  useEffect(() => {
    const parent = container.current;
    if (!parent) return;
    const created = new GameBridge(config, run, seed);
    created.setSpeed(speed);
    // Created inside the effect and destroyed in its cleanup (React StrictMode mounts twice in development).
    const game = new Game({
      type: AUTO,
      parent,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      backgroundColor: "#141633",
      scale: { mode: Scale.FIT, autoCenter: Scale.CENTER_HORIZONTALLY },
      scene: [new BattleScene(created)],
      // Keyboard shortcuts and accessible controls live in the React DOM (plan E.5.2).
      input: { keyboard: false },
    });
    setBridge(created);
    onBridge?.(created);

    // A hidden page pauses the simulation; coming back stays paused until Resume (C2.1, spine S10).
    const onVisibility = () => {
      if (document.visibilityState === "hidden") created.pause();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      game.destroy(true);
      created.destroy();
      setBridge(null);
      onBridge?.(null);
    };
  }, [config, run, seed, speed, onBridge]);

  return (
    <div className="bf">
      <div className="bf-stage">
        <div ref={container} className="bf-canvas" />
        {bridge !== null && <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>}
      </div>
    </div>
  );
}
