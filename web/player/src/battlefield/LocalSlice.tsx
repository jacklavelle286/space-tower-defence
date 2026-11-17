import { compileBattleConfig, initialRunState, type AuthoredWave, type RunState } from "@scd/game-core";
import { useEffect, useMemo, useState } from "react";
import { loadCurrent, loadGameDataVersions, type GameData } from "../game/gameData";
import { LocalRun } from "../game/localRun";
import { ActivityPlaceholder, PLACEHOLDER_ANSWER } from "./ActivityPlaceholder";
import { devBossWaves, devPowers, devWave, simWaves, stressPlacements, stressWave, type SimWave } from "./devWave";
import { Battlefield, WAVE_SET_ID } from "./Battlefield";
import { useGameBridge } from "./bridgeContext";
import { EndScreen } from "./EndScreen";
import { Hud } from "./Hud";
import { PausedCard } from "./PausedCard";
import { useAutoPlay, type AutoPlayMode } from "./useAutoPlay";
import { useHud } from "./useBridge";
import { BattlefieldControls } from "../hud/BattlefieldControls";
import { FrameRecorder } from "../hud/FrameRecorder";
import "../run/run.css";

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
  /** Phase 34: play these simulator campaign waves first ("37", "37,31"), for the AC-42 measurement (C14 (a)). */
  readonly simWave: string | null;
  /** Phase 34: the synthetic scene, C14 (b): 60 tough aliens against 16 level-3 astronauts on every pad. */
  readonly stress: boolean;
  /** Phase 34: show the frame-time recorder (minimum, 1%-low and average frame rate per wave). */
  readonly perf: boolean;
  /** Phase 50: play this planet document instead of current.json's (e.g. luna-1-c2, the 50-wave campaign). */
  readonly planet: string | null;
  /** Phase 50: play this wave set of the planet (default first-contact; "campaign" in luna-1-c2). */
  readonly waveSetId: string;
  /** A dev wave played first: "all" (every alien a wave may schedule) or "type:count,..." (e.g. "craft:2,slime:3"). */
  readonly aliens: string | null;
  /** Dev boss waves played first (after ?aliens='s): "all" (one wave per boss) or one boss ID (e.g. "boss3"). */
  readonly boss: string | null;
  /** Test charges of the meteor powers: "all" or "power:count,..." (e.g. "frost-pulse:2,comet-burst:1"). */
  readonly powers: string | null;
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
 *
 * Phase 27 adds ?boss= for watching the bosses of C7 change phase: ?boss=boss3 plays a dev wave with Queen Bubbla
 * (and Moon Blobs around her) before the wave set's own waves; ?boss=all plays one such wave per boss, King Wobble
 * (boss1) to the Great Glorp (boss5). Bosses are in ruleset r3, so for example
 * /play/local?ruleset=r3&roster=all&credits=5000&boss=boss3.
 *
 * Phase 28 adds ?powers= for trying the meteor powers of C10: the run starts with test charges ("all": two of each,
 * the cap; or a list such as ?powers=frost-pulse:2,comet-burst:2,colony-shield:1), and a dev strip under the HUD uses
 * them, by click or with keys 1 (Frost Pulse), 2 (Comet Burst, on the front-most alien) and 3 (Colony Shield) during a
 * wave. Powers are in ruleset r3, so for example /play/local?ruleset=r3&roster=all&credits=5000&boss=boss5&powers=all.
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
    allClasses: params.get("roster") === "all" || params.get("stress") === "1", // the stress board needs every class
    credits: Number.isInteger(credits) && credits >= 0 && credits <= 100_000 ? credits : null,
    aliens: params.get("aliens"),
    boss: params.get("boss"),
    powers: params.get("powers"),
    simWave: params.get("simWave"),
    stress: params.get("stress") === "1",
    perf: params.get("perf") === "1",
    planet: params.get("planet"),
    waveSetId: params.get("set") ?? WAVE_SET_ID,
  };
}

/** The game data for the local slice: current.json's versions, or ?ruleset=, with ?roster=all, ?aliens= and ?boss= applied. */
async function localGameData(options: LocalOptions): Promise<GameData> {
  const current = await loadCurrent();
  const data = await loadGameDataVersions(options.ruleset ?? current.rulesetVersion, options.planet ?? current.campaignVersion);
  let waveSet = data.planet.waveSets[options.waveSetId];
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
  // Dev waves are new authored waves (numbered after the planet's own) that the local wave set plays first: the
  // ?aliens= wave, then the ?boss= waves.
  const dev: AuthoredWave[] = [];
  const next = () => Math.max(...waves.map((w) => w.wave), ...dev.map((w) => w.wave)) + 1;
  if (options.aliens !== null) dev.push(devWave(data.ruleset, options.aliens, next()));
  if (options.boss !== null) dev.push(...devBossWaves(data.ruleset, options.boss, next()));
  if (options.simWave !== null) {
    // The simulator's campaign (56 KB), loaded only when asked for and only in the local slice's chunk.
    const sim = (await import("../../../../tools/sim/game_data.json")).default as unknown as { waves: SimWave[] };
    dev.push(...simWaves(sim.waves, options.simWave, next()));
  }
  if (options.stress) {
    dev.push(stressWave(next()));
    waveSet = { ...waveSet, padsOpenAsForWave: 26 }; // every pad open for the 16 astronauts
  }
  if (dev.length > 0) {
    waves = [...waves, ...dev];
    waveSet = { ...waveSet, waves: [...dev.map((w) => w.wave), ...waveSet.waves] };
  }
  // A copy of the planet document: the loaded data and the game-data/ files are untouched.
  return { ...data, planet: { ...data.planet, waves, waveSets: { ...data.planet.waveSets, [options.waveSetId]: waveSet } } };
}

function startingRun(data: GameData, options: LocalOptions): RunState {
  const config = compileBattleConfig(data.ruleset, data.planet, options.waveSetId);
  const run = initialRunState(data.ruleset, config, [PLACEHOLDER_ANSWER]);
  if (run.snapshot === undefined) return run;
  const { snapshot } = run;
  return {
    ...run,
    snapshot: {
      ...snapshot,
      credits: options.credits ?? snapshot.credits,
      colony: { ...snapshot.colony, health: options.colonyHealth ?? snapshot.colony.health },
      powers: options.powers === null ? snapshot.powers : devPowers(data.ruleset, options.powers),
      placements: options.stress ? stressPlacements(data.ruleset, config.pads.map((p) => p.id)) : snapshot.placements,
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
      <Battlefield key={game.n} data={data} waveSetId={options.waveSetId} run={game.run} seed={options.seed} speed={options.speed}>
        <Overlays run={game.run} autoPlay={options.autoPlay} perf={options.perf} onNewGame={newGame} />
      </Battlefield>
    );
  return (
    // The run screen's one-window layout (run.css), so the local slice shows what a real run looks like.
    <main className="run-screen">
      <h1 style={{ margin: 0, padding: "8px 16px", fontSize: 28 }}>Space Colony Defence</h1>
      {body}
    </main>
  );
}

function Overlays({
  run,
  autoPlay,
  perf,
  onNewGame,
}: {
  run: LocalRun;
  autoPlay: AutoPlayMode | null;
  perf: boolean;
  onNewGame: () => void;
}) {
  const bridge = useGameBridge();
  const hud = useHud(bridge);
  useAutoPlay(bridge, run, hud, autoPlay);
  const ended = hud.runStatus !== "IN_PROGRESS";
  return (
    <>
      <Hud bridge={bridge} hud={hud} />
      <BattlefieldControls bridge={bridge} hud={hud} active={!ended && hud.runPhase !== "ACTIVITY" && hud.runPhase !== "METEOR"} />
      {perf && <FrameRecorder hud={hud} />}
      {/* A meteor challenge gets the same placeholder locally (the meteor offer is Phase 51). */}
      {(hud.runPhase === "ACTIVITY" || hud.runPhase === "METEOR") && <ActivityPlaceholder run={run} afterWave={hud.wave - 1} />}
      {hud.paused && !ended && hud.battle === "IN_WAVE" && <PausedCard bridge={bridge} />}
      {ended && <EndScreen hud={hud} onAction={onNewGame} actionLabel="New game" />}
    </>
  );
}
