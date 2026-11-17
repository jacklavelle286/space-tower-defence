// Waves tab → Difficulty curve (Gate M, LD13; scope-level-designer.md §3.3 "Admin UX"; C8.1, C8.3, C17.5): the
// campaign's waves against the anchors it is shaped by.
//
//   Health      each wave's health multiplier against C8.1's toughness curve (x1 at wave 1 to x7 at 50)
//   Margin      Measure plays the competent test player (0 % learning) in a Web Worker and finds, for each wave of
//               the chosen range, how much tougher it could be before an alien gets through; the target is C8.3's
//               sawtooth, or a gentler or tougher preset
//   Length      seconds at 1x against C17.5's bands (an ordinary wave 25 s or more, a boss wave 40 to 100 s)
//
// Two ways to set health over a range: from the toughness curve, or to meet the margin target (from the margins just
// measured: health x margin / target, so the next measurement lands within about 15 % of the target). Then the
// endless waves 51 to 60 the game would make from these waves (C11), to see where the campaign leads.
import {
  compileBattleConfig,
  durationProblem,
  fitHpMult,
  MARGIN_PRESETS,
  marginTarget,
  planFor,
  toughnessAt,
  type MarginPreset,
  type WaveMeasure,
} from "@scd/game-core";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LevelFile, LevelWave } from "../../api";
import { currentRuleset, mergedLevel } from "../levelFile";
import { measureCurve, type CurveRun, type CurveWorker } from "./measure";

type Props = {
  readonly level: LevelFile;
  readonly onSetWaves: (waves: LevelWave[]) => void;
  readonly makeWorker?: () => CurveWorker;
};

/** A measurement, kept with the health it was taken at: a later change of that wave's health makes it stale. */
type Measured = WaveMeasure & { readonly atHpMult: number };

const W = 640;
const H = 180;
const PAD = 28;

function Chart({ waves, measured, preset }: { waves: readonly LevelWave[]; measured: ReadonlyMap<number, Measured>; preset: MarginPreset }) {
  const n = Math.max(1, waves.length);
  const x = (wave: number) => PAD + ((wave - 1) * (W - 2 * PAD)) / Math.max(1, n - 1);
  const maxHp = Math.max(7, ...waves.map((w) => w.hpMult));
  const yHp = (v: number) => H - PAD - (v * (H - 2 * PAD)) / maxHp;
  const yMargin = (v: number) => H - PAD - (Math.min(v, 5) * (H - 2 * PAD)) / 5;
  const line = (points: [number, number][]) => points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)} ${py.toFixed(1)}`).join(" ");
  const anchor = line(waves.map((w) => [x(w.wave), yHp(toughnessAt(w.wave))]));
  const health = line(waves.map((w) => [x(w.wave), yHp(w.hpMult)]));
  const target = line(waves.map((w) => [x(w.wave), yMargin(marginTarget(w.wave, preset))]));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="curve-chart" role="img" aria-label="Health against the toughness curve, and measured margins against the target">
      <path d={anchor} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth={6} />
      <path d={health} fill="none" stroke="#3f7fd0" strokeWidth={2} />
      <path d={target} fill="none" stroke="#c0702a" strokeDasharray="5 4" strokeWidth={2} />
      {[...measured.values()].map((m) =>
        m.margin === null ? null : <circle key={m.wave} cx={x(m.wave)} cy={yMargin(m.margin)} r={3.5} fill="#c0702a" />,
      )}
      <text x={PAD} y={14} fontSize={11}>
        Blue: health. Grey: toughness curve. Orange dashes: margin target (dots: measured, up to 5).
      </text>
    </svg>
  );
}

export function CurvePanel({ level, onSetWaves, makeWorker }: Props) {
  const ids = { preset: useId(), from: useId(), to: useId() };
  const waves = useMemo(() => level.waves ?? [], [level.waves]);
  const [presetId, setPresetId] = useState(MARGIN_PRESETS[0]?.id ?? "campaign");
  const preset = MARGIN_PRESETS.find((p) => p.id === presetId) ?? (MARGIN_PRESETS[0] as MarginPreset);
  const [range, setRange] = useState({ from: 1, to: Math.min(10, Math.max(1, waves.length)) });
  const [measured, setMeasured] = useState<ReadonlyMap<number, Measured>>(new Map());
  const [running, setRunning] = useState<{ total: number; done: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const run = useRef<CurveRun | null>(null);
  useEffect(() => () => run.current?.cancel(), []);

  const inRange = waves.filter((w) => w.wave >= range.from && w.wave <= range.to);
  const fresh = (w: LevelWave): Measured | undefined => {
    const m = measured.get(w.wave);
    return m !== undefined && m.atHpMult === w.hpMult ? m : undefined;
  };

  const measure = () => {
    const wanted = inRange.map((w) => w.wave);
    const hp = new Map(waves.map((w) => [w.wave, w.hpMult]));
    setMessage(null);
    setRunning({ total: wanted.length, done: 0 });
    const current = measureCurve(
      level,
      wanted,
      (m) => {
        setMeasured((prev) => new Map(prev).set(m.wave, { ...m, atHpMult: hp.get(m.wave) ?? 1 }));
        setRunning((r) => (r === null ? r : { ...r, done: r.done + 1 }));
      },
      makeWorker,
    );
    run.current = current;
    current.done.then(
      () => {
        run.current = null;
        setRunning(null);
      },
      (error: unknown) => {
        run.current = null;
        setRunning(null);
        const text = error instanceof Error ? error.message : String(error);
        setMessage(text === "cancelled" ? "Measuring stopped." : `Could not measure: ${text}`);
      },
    );
  };

  const setFromToughness = () =>
    onSetWaves(waves.map((w) => (w.wave >= range.from && w.wave <= range.to ? { ...w, hpMult: toughnessAt(w.wave) } : w)));

  const missing = inRange.filter((w) => fresh(w)?.margin == null).map((w) => w.wave);
  const setFromMargin = () => {
    onSetWaves(
      waves.map((w) => {
        const m = w.wave >= range.from && w.wave <= range.to ? fresh(w) : undefined;
        return m?.margin == null ? w : { ...w, hpMult: fitHpMult(w.hpMult, m.margin, marginTarget(w.wave, preset)) };
      }),
    );
    setMessage("Health set from the margin target. Measure again to see the new margins.");
  };

  const endless = useMemo(() => {
    try {
      const config = compileBattleConfig(currentRuleset(), mergedLevel(level), "campaign");
      if (config.endless === null) return null;
      const ruleset = currentRuleset();
      return [51, 52, 53, 54, 55, 56, 57, 58, 59, 60].map((wave) => {
        const plan = planFor(config, wave);
        const counts = new Map<string, number>();
        for (const s of plan.spawns) counts.set(s.type, (counts.get(s.type) ?? 0) + 1);
        const aliens = [...counts.entries()].map(([type, count]) => `${count} ${ruleset.aliens[type]?.name ?? ruleset.bosses[type]?.name ?? type}`).join(", ");
        return { wave, aliens, hpMult: plan.hpMult, speedMult: plan.speedMult, boss: plan.hasBoss };
      });
    } catch {
      return null; // the level does not parse yet: its problems are listed above
    }
  }, [level]);

  return (
    <section className="curve-panel" aria-labelledby={`${ids.preset}-h`}>
      <h4 id={`${ids.preset}-h`}>Difficulty curve</h4>
      <Chart waves={waves} measured={measured} preset={preset} />
      <p className="row">
        <label htmlFor={ids.preset}>Margin target</label>
        <select id={ids.preset} value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {MARGIN_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <label htmlFor={ids.from}>Waves</label>
        <input id={ids.from} type="number" min={1} max={waves.length} value={range.from} onChange={(e) => setRange({ ...range, from: Math.max(1, Math.min(range.to, Number(e.target.value) || 1)) })} />
        <label htmlFor={ids.to}>to</label>
        <input id={ids.to} type="number" min={1} max={waves.length} value={range.to} onChange={(e) => setRange({ ...range, to: Math.min(waves.length, Math.max(range.from, Number(e.target.value) || 1)) })} />
      </p>
      <p className="row">
        <button type="button" disabled={running !== null} onClick={measure}>
          Measure margins
        </button>
        {running !== null && (
          <>
            <progress max={running.total} value={running.done} aria-label="Waves measured" /> {running.done} of {running.total}{" "}
            <button type="button" onClick={() => run.current?.cancel()}>
              Stop
            </button>
          </>
        )}
        <button type="button" onClick={setFromToughness}>
          Set health from the toughness curve
        </button>
        <button type="button" disabled={missing.length > 0 || running !== null} onClick={setFromMargin} title={missing.length > 0 ? "Measure these waves first" : undefined}>
          Set health to meet the margin target
        </button>
      </p>
      {message !== null && <p role="status">{message}</p>}
      <table className="versions-table curve-table">
        <thead>
          <tr>
            <th scope="col">Wave</th>
            <th scope="col">Health</th>
            <th scope="col">Toughness curve</th>
            <th scope="col">Margin</th>
            <th scope="col">Target</th>
            <th scope="col">Length at 1x</th>
          </tr>
        </thead>
        <tbody>
          {inRange.map((w) => {
            const m = fresh(w);
            const target = marginTarget(w.wave, preset);
            const off = m?.margin != null && Math.abs(m.margin / target - 1) > 0.15;
            const band = m?.seconds != null ? durationProblem(m.seconds, w.wave % 10 === 0) : null;
            return (
              <tr key={w.wave}>
                <th scope="row">
                  {w.wave}
                  {w.wave % 10 === 0 ? " (boss)" : ""}
                </th>
                <td>x{w.hpMult}</td>
                <td>x{toughnessAt(w.wave)}</td>
                <td className={off ? "warning" : undefined}>{m === undefined ? "–" : m.margin === null ? "not reached" : m.margin}</td>
                <td>{target}</td>
                <td className={band !== null ? "warning" : undefined}>
                  {m?.seconds == null ? "–" : `${m.seconds} s${band === "short" ? " (short)" : band === "long" ? " (long)" : ""}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {endless !== null && (
        <details>
          <summary>Endless waves 51 to 60 (what the game makes after the campaign)</summary>
          <table className="versions-table">
            <thead>
              <tr>
                <th scope="col">Wave</th>
                <th scope="col">Aliens</th>
                <th scope="col">Health</th>
                <th scope="col">Speed</th>
              </tr>
            </thead>
            <tbody>
              {endless.map((e) => (
                <tr key={e.wave}>
                  <th scope="row">
                    {e.wave}
                    {e.boss ? " (boss)" : ""}
                  </th>
                  <td>{e.aliens}</td>
                  <td>x{e.hpMult}</td>
                  <td>x{e.speedMult}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
