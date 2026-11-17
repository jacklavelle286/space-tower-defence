import { compileBattleConfig, initialRunState, type RunState } from "@scd/game-core";
import { useEffect, useMemo, useState } from "react";
import { loadCurrent, loadGameDataVersions, type GameData } from "../game/gameData";
import { LocalRun } from "../game/localRun";
import { ActivityPlaceholder, PLACEHOLDER_ANSWER } from "./ActivityPlaceholder";
import { devWave } from "./devWave";
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
  /** Play this ruleset version instead of the one current.json names (e.g. r2, the six-class roster of Phase 24). */
  readonly ruleset: string | null;
  /** Offer every class in the ruleset in the local wave set, not only the classes the wave set lists. */
  readonly allClasses: boolean;
  /** Start with this many credits instead of the wave set's starting credits. */
  readonly credits: number | null;
  /** A dev wave played first: "all" (every alien a wave may schedule) or "type:count,..." (e.g. "craft:2,slime:3"). */
  readonly aliens: string | null;
}

/**
 * Development options from the page URL (local slice only): ?seed=<text>, ?colony=<1..20> (start with less colony
 * health), ?auto=1 (plays by itself, placing Novas: it usually wins), ?auto=lose (presses Ready with no Novas placed,
 * so the aliens get through: with ?colony=1 the defeat screen comes in seconds), ?speed=2.
 *
 * Phase 24 adds three for trying the six-class roster: ?ruleset=r2 (play that ruleset version on the current planet
 * document), ?roster=all (the local wave set offers every class in the ruleset) and ?credits=<0..100000>. For example
 * /play/local?ruleset=r2&roster=all&credits=2000. They change only this development page: game data, current.json
 * and the real run screen are untouched.
 *
 * Phase 26 adds ?aliens= for trying the alien catalogue: a dev wave played before the wave set's own waves, with
 * ?aliens=all for every alien a wave may schedule (two of each) or a list such as ?aliens=craft:2,slime:3,patch:2.
 * For example /play/local?ruleset=r3&roster=all&credits=3000&aliens=all.
 */
function localOptions(search: string): LocalOptions {
  const params = new URLSearchParams(search);
  const colony = Number.parseInt(params.get("colony") ?? "", 10);
  const credits = Number.parseInt(params.get("credits") ?? "", 10);
  return {
    seed: params.get("seed") ?? "local-dev-seed",
    colonyHealth: Number.isInteger(colony) && colony >= 1 && colony <= 20 ? colony : null,
    autoPlay: params.get("auto") === "1" ? "play" : params.get("auto") === "lose" ? "lose" : null,
    speed: params.get("speed") === "2" ? 2 : 1,
    ruleset: params.get("ruleset"),
    allClasses: params.get("roster") === "all",
    credits: Number.isInteger(credits) && credits >= 0 && credits <= 100_000 ? credits : null,
    aliens: params.get("aliens"),
  };
}

/** The game data for the local slice: current.json's versions, or ?ruleset=, with ?roster=all and ?aliens= applied. */
async function localGameData(options: LocalOptions): Promise<GameData> {
  const current = await loadCurrent();
  const data = await loadGameDataVersions(options.ruleset ?? current.rulesetVersion, current.campaignVersion);
  let waveSet = data.planet.waveSets[WAVE_SET_ID];
  if (waveSet === undefined) return data;
  let waves = data.planet.waves;
  if (options.allClasses) {
    // The local wave set lists every class, in the ruleset's unlock order. A CHALLENGE wave set ignores unlock waves
    // (C13), so every class can be placed from wave 1.
    const classes = Object.entries(data.ruleset.classes)
      .sort(([, a], [, b]) => a.unlockAfterWave - b.unlockAfterWave)
      .map(([id]) => id);
    waveSet = { ...waveSet, classes };
  }
  if (options.aliens !== null) {
    // The dev wave is a new authored wave (numbered after the planet's own) that the local wave set plays first.
    const dev = devWave(data.ruleset, options.aliens, Math.max(...waves.map((w) => w.wave)) + 1);
    waves = [...waves, dev];
    waveSet = { ...waveSet, waves: [dev.wave, ...waveSet.waves] };
  }
  // A copy of the planet document: the loaded data and the game-data/ files are untouched.
  return { ...data, planet: { ...data.planet, waves, waveSets: { ...data.planet.waveSets, [WAVE_SET_ID]: waveSet } } };
}

function startingRun(data: GameData, options: LocalOptions): RunState {
  const config = compileBattleConfig(data.ruleset, data.planet, WAVE_SET_ID);
  const run = initialRunState(data.ruleset, config, [PLACEHOLDER_ANSWER]);
  if (run.snapshot === undefined) return run;
  const { snapshot } = run;
  return {
    ...run,
    snapshot: {
      ...snapshot,
      credits: options.credits ?? snapshot.credits,
      colony: { ...snapshot.colony, health: options.colonyHealth ?? snapshot.colony.health },
    },
  };
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
    localGameData(options).then(
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
