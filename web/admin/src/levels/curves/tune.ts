// Tuning made waves with the test player (Gate M, LD15): measure every campaign wave's margin, set its health to meet
// the target (fitHpMult, as "Set health to meet the margin target" does), and measure again. A wave's board depends on
// the waves before it, so one fit moves the later margins a little: up to three fits, stopping once every ordinary
// wave is within 15 % of its target (LD13's exit tolerance). A boss wave keeps its boss's own health, so only its
// escort moves: it may stay outside. Each measurement is split across workers, each playing from wave 1 and measuring
// every third wave, so a pass takes about a third of the 24 s one worker needs (measured 2026-11-18, node).
import { fitHpMult, marginTarget, type MarginPreset, type WaveMeasure } from "@scd/game-core";
import type { LevelFile, LevelWave } from "../../api";
import { browserCurveWorker, measureCurve, type CurveRun, type CurveWorker } from "./measure";

export const TOLERANCE = 0.15;
const MAX_FITS = 3;
const WORKERS = 3;

export interface TuneProgress {
  readonly pass: number;
  readonly passes: number;
  readonly measured: number;
  readonly total: number;
}

export interface TuneResult {
  readonly waves: LevelWave[];
  /** The last measurement, of the waves returned. */
  readonly measured: readonly WaveMeasure[];
  /** Waves whose margin is more than 15 % from the target, or that the test player did not reach. */
  readonly off: readonly number[];
}

export interface TuneRun {
  readonly done: Promise<TuneResult>;
  cancel(): void;
}

export const offTarget = (measured: readonly WaveMeasure[], preset: MarginPreset): number[] =>
  measured
    .filter((m) => m.margin === null || Math.abs(m.margin - marginTarget(m.wave, preset)) > marginTarget(m.wave, preset) * TOLERANCE)
    .map((m) => m.wave)
    .sort((a, b) => a - b);

export function tuneWaves(
  level: LevelFile,
  preset: MarginPreset,
  onProgress: (p: TuneProgress) => void,
  makeWorker: () => CurveWorker = browserCurveWorker,
): TuneRun {
  let runs: CurveRun[] = [];
  let cancelled = false;
  const total = level.waves?.length ?? 0;

  const measureAll = async (waves: LevelWave[], pass: number): Promise<WaveMeasure[]> => {
    const out: WaveMeasure[] = [];
    const numbers = waves.map((w) => w.wave);
    const parts = Array.from({ length: WORKERS }, (_, k) => numbers.filter((_n, i) => i % WORKERS === k)).filter((p) => p.length > 0);
    runs = parts.map((part) =>
      measureCurve({ ...level, waves }, part, (m) => {
        out.push(m);
        onProgress({ pass, passes: MAX_FITS + 1, measured: out.length, total });
      }, makeWorker),
    );
    await Promise.all(runs.map((r) => r.done));
    return out.sort((a, b) => a.wave - b.wave);
  };

  const done = (async (): Promise<TuneResult> => {
    let waves = structuredClone(level.waves ?? []);
    for (let pass = 1; ; pass += 1) {
      const measured = await measureAll(waves, pass);
      if (cancelled) throw new Error("cancelled");
      const off = offTarget(measured.filter((m) => !m.boss), preset);
      if (off.length === 0 || pass > MAX_FITS) return { waves, measured, off: offTarget(measured, preset) };
      const byWave = new Map(measured.map((m) => [m.wave, m]));
      waves = waves.map((w) => {
        const m = byWave.get(w.wave);
        return m?.margin == null ? w : { ...w, hpMult: fitHpMult(w.hpMult, m.margin, marginTarget(w.wave, preset)) };
      });
    }
  })();

  return {
    done,
    cancel: () => {
      cancelled = true;
      for (const r of runs) r.cancel();
    },
  };
}
