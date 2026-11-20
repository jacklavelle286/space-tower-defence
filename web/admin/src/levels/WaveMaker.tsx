// Waves tab → Make the waves for me (Gate M, LD15; owner 2026-11-18). game-core's generateWaves makes the 50 campaign
// waves in the Moon campaign's shape from a number (the same number and choices make the same waves); then, when asked,
// the test player tunes each wave's health to the difficulty target (curves/tune.ts). The result goes in as one edit,
// so Ctrl+Z puts back the waves there were. On a level without the campaign, it also gives the level the campaign
// card (the live campaign's credits, colony health, classes and pads), so this map becomes the planet's campaign map.
import { generateWaves, introductionOrder, MARGIN_PRESETS, type MarginPreset } from "@scd/game-core";
import { useEffect, useId, useRef, useState } from "react";
import type { LevelFile, LevelWave } from "../api";
import type { CurveWorker } from "./curves/measure";
import { tuneWaves, type TuneProgress, type TuneRun } from "./curves/tune";
import { campaignCard, currentRuleset, routeTiles } from "./levelFile";

type Props = {
  readonly level: LevelFile;
  readonly onEdit: (level: LevelFile) => void;
  /** The first number (tests); otherwise a random one. */
  readonly firstSeed?: number;
  readonly makeWorker?: () => CurveWorker;
};

const SEED_MAX = 999_999;

export function WaveMaker({ level, onEdit, firstSeed, makeWorker }: Props) {
  const id = useId();
  const ruleset = currentRuleset();
  const order = introductionOrder(ruleset);
  const [seed, setSeed] = useState(() => firstSeed ?? 1 + Math.floor(Math.random() * SEED_MAX));
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [presetId, setPresetId] = useState(MARGIN_PRESETS[0]?.id ?? "campaign");
  const [tune, setTune] = useState(true);
  const [progress, setProgress] = useState<TuneProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = useRef<TuneRun | null>(null);
  useEffect(() => () => run.current?.cancel(), []);
  const ownsCampaign = (level.waves?.length ?? 0) > 0;
  const hasRoute = level.map.route.length >= 2;
  const preset = MARGIN_PRESETS.find((p) => p.id === presetId) ?? (MARGIN_PRESETS[0] as MarginPreset);
  const aliens = order.filter((a) => !skipped.has(a));

  const make = async (n: number) => {
    setSeed(n);
    const result = generateWaves({ seed: n, ruleset, routeTiles: routeTiles(level), aliens, preset });
    if ("reason" in result) {
      setMessage(result.reason);
      return;
    }
    const made: LevelFile = {
      ...level,
      waves: result.waves as unknown as LevelWave[],
      waveSets: ownsCampaign ? level.waveSets : { ...level.waveSets, campaign: campaignCard(level.levelId) },
      // Keyframes and hand-set marks belonged to the old waves.
      design: { ...level.design, keyframes: [], overrides: [] },
    };
    const undo = "Ctrl+Z puts back the waves you had.";
    if (!tune) {
      onEdit(made);
      setMessage(`Waves ${n} are in, health from the toughness curve. ${undo}`);
      return;
    }
    setMessage(null);
    setProgress({ pass: 1, passes: 4, measured: 0, total: result.waves.length });
    const current = tuneWaves(made, preset, setProgress, makeWorker);
    run.current = current;
    try {
      const tuned = await current.done;
      onEdit({ ...made, waves: tuned.waves });
      const close = tuned.waves.length - tuned.off.length;
      setMessage(
        `Waves ${n} are in and tuned: ${close} of ${tuned.waves.length} are within 15 % of the difficulty target${
          tuned.off.length === 0 ? "" : ` (not yet: ${tuned.off.join(", ")}; a boss wave keeps its boss's health)`
        }. ${undo}`,
      );
    } catch (error) {
      setMessage(error instanceof Error && error.message === "cancelled" ? "Stopped: the waves were not changed." : `Tuning failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      run.current = null;
      setProgress(null);
    }
  };

  const busy = progress !== null;
  return (
    <details className="map-maker wave-maker">
      <summary>Make the waves for me</summary>
      <p className="hint">
        All 50 campaign waves: each alien first on its own, then in growing mixes, a boss every tenth wave, meteors after waves 9, 19, 29, 39 and 49. Change
        anything afterwards by hand.
      </p>
      {!ownsCampaign && <p className="hint">This map has no 50 waves of its own yet: making waves gives it its own adventure.</p>}
      <fieldset>
        <legend>Aliens, in the order they arrive</legend>
        {order.map((a) => (
          <label key={a} className="check">
            <input
              type="checkbox"
              checked={!skipped.has(a)}
              disabled={busy}
              onChange={(e) => {
                const next = new Set(skipped);
                if (e.target.checked) next.delete(a);
                else next.add(a);
                setSkipped(next);
              }}
            />{" "}
            {ruleset.aliens[a]?.name ?? a}
          </label>
        ))}
      </fieldset>
      <label htmlFor={`${id}-preset`}>Difficulty</label>
      <select id={`${id}-preset`} value={presetId} disabled={busy} onChange={(e) => setPresetId(e.target.value)}>
        {MARGIN_PRESETS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <label className="check">
        <input type="checkbox" checked={tune} disabled={busy} onChange={(e) => setTune(e.target.checked)} /> Tune with the test player (about half a minute)
      </label>
      <label htmlFor={`${id}-seed`}>Waves number</label>
      <input id={`${id}-seed`} type="number" min={1} max={SEED_MAX} value={seed} disabled={busy} onChange={(e) => setSeed(Math.max(1, Math.min(SEED_MAX, Math.round(Number(e.target.value)) || 1)))} />
      <p className="row">
        <button type="button" disabled={busy || !hasRoute} onClick={() => void make(seed)}>
          Make the waves
        </button>
        <button type="button" disabled={busy || !hasRoute} onClick={() => void make(seed >= SEED_MAX ? 1 : seed + 1)}>
          Another set
        </button>
        {busy && (
          <button type="button" onClick={() => run.current?.cancel()}>
            Stop
          </button>
        )}
      </p>
      {!hasRoute && <p className="hint">Draw the route first (Map tab): the waves are tuned on it.</p>}
      {progress !== null && (
        <p role="status">
          Tuning, pass {progress.pass}: {progress.measured} of {progress.total} waves measured…
        </p>
      )}
      {message !== null && <p role="status">{message}</p>}
    </details>
  );
}
