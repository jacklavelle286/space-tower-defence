import { compileBattleConfig, initialRunState, type RunState } from "@scd/game-core";
import { useEffect, useMemo, useState } from "react";
import { loadGameData, type GameData } from "../game/gameData";
import { LocalRun } from "../game/localRun";
import { ActivityPlaceholder, PLACEHOLDER_ANSWER } from "./ActivityPlaceholder";
import { Battlefield, WAVE_SET_ID } from "./Battlefield";
import { useGameBridge } from "./bridgeContext";
import { EndScreen } from "./EndScreen";
import { Hud } from "./Hud";
import { PadPanel } from "./PadPanel";
import { PausedCard } from "./PausedCard";
import { useAutoPlay, type AutoPlayMode } from "./useAutoPlay";
import { useHud } from "./useBridge";

interface LocalOptions {
  /** The run seed (the server makes 64 random bits in the real game, spine S5.1). */
  readonly seed: string;
  /** Start with less colony health (with autoPlay "lose", or no Novas placed, defeat comes quickly). */
  readonly colonyHealth: number | null;
  /**
   * For screenshots and smoke checks: "play" places Novas, presses Ready and answers by itself; "lose" does the same
   * but places nothing, so the run reaches the defeat screen; null is a normal game.
   */
  readonly autoPlay: AutoPlayMode | null;
  readonly speed: 1 | 2;
}

/**
 * Development options from the page URL (local slice only): ?seed=<text>, ?colony=<1..20> (start with less colony
 * health), ?auto=1 (plays by itself, placing Novas: it usually wins), ?auto=lose (presses Ready with no Novas placed,
 * so the aliens get through: with ?colony=1 the defeat screen comes in seconds), ?speed=2.
 */
function localOptions(search: string): LocalOptions {
  const params = new URLSearchParams(search);
  const colony = Number.parseInt(params.get("colony") ?? "", 10);
  return {
    seed: params.get("seed") ?? "local-dev-seed",
    colonyHealth: Number.isInteger(colony) && colony >= 1 && colony <= 20 ? colony : null,
    autoPlay: params.get("auto") === "1" ? "play" : params.get("auto") === "lose" ? "lose" : null,
    speed: params.get("speed") === "2" ? 2 : 1,
  };
}

function startingRun(data: GameData, options: LocalOptions): RunState {
  const config = compileBattleConfig(data.ruleset, data.planet, WAVE_SET_ID);
  const run = initialRunState(data.ruleset, config, [PLACEHOLDER_ANSWER]);
  if (options.colonyHealth === null || run.snapshot === undefined) return run;
  return { ...run, snapshot: { ...run.snapshot, colony: { ...run.snapshot.colony, health: options.colonyHealth } } };
}

/**
 * The Phase 14 local battlefield slice at /play/local, development builds only: it reads game-data/ from the working
 * tree and saves nothing. The real run screen is /play/:runId (Phase 22).
 */
export function LocalSlice() {
  const options = useMemo(() => localOptions(window.location.search), []);
  const [data, setData] = useState<GameData | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A new game is a new LocalRun and a new key: the battlefield (and its Phaser game) is rebuilt around it.
  const [game, setGame] = useState<{ n: number; run: LocalRun } | null>(null);

  useEffect(() => {
    let live = true;
    loadGameData().then(
      (loaded) => {
        if (!live) return;
        setData(loaded);
        setGame({ n: 0, run: new LocalRun(startingRun(loaded, options)) });
      },
      (e: unknown) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [options]);

  const newGame = () => {
    if (data !== null) setGame((g) => ({ n: (g?.n ?? 0) + 1, run: new LocalRun(startingRun(data, options)) }));
  };

  let body;
  if (error !== null) body = <p style={{ padding: 16 }}>Could not load the game data: {error}</p>;
  else if (data === null || game === null) body = <p style={{ padding: 16 }}>Loading…</p>;
  else
    body = (
      <Battlefield key={game.n} data={data} waveSetId={WAVE_SET_ID} run={game.run} seed={options.seed} speed={options.speed}>
        <Overlays run={game.run} autoPlay={options.autoPlay} onNewGame={newGame} />
      </Battlefield>
    );
  return (
    <main style={{ margin: 0, minHeight: "100vh", background: "#141633", color: "#FFF4D6" }}>
      <h1 style={{ margin: 0, padding: "8px 16px", fontSize: 28 }}>Space Colony Defence</h1>
      {body}
    </main>
  );
}

function Overlays({ run, autoPlay, onNewGame }: { run: LocalRun; autoPlay: AutoPlayMode | null; onNewGame: () => void }) {
  const bridge = useGameBridge();
  const hud = useHud(bridge);
  useAutoPlay(bridge, run, hud, autoPlay);
  const ended = hud.runStatus !== "IN_PROGRESS";
  return (
    <>
      <Hud bridge={bridge} hud={hud} />
      {!ended && hud.runPhase !== "ACTIVITY" && <PadPanel bridge={bridge} credits={hud.credits} />}
      {hud.runPhase === "ACTIVITY" && <ActivityPlaceholder run={run} afterWave={hud.wave - 1} />}
      {hud.paused && !ended && hud.battle === "IN_WAVE" && <PausedCard bridge={bridge} />}
      {ended && <EndScreen hud={hud} onAction={onNewGame} actionLabel="New game" />}
    </>
  );
}
