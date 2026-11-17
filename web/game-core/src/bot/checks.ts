// The balance checks for a wave set (Gate M, LD5; scope-level-designer.md §4 option A and §5 "Balance"): the C17.1 test
// players on the game's own simulation, and what their results say. Three pure steps, so the editor can spread the
// runs over Web Workers and the publisher (LD6) can run the same ones:
//
//   planChecks(planet, ids)        every run a wave set needs (policy, learning success, seed)
//   runJob(ruleset, planet, job)   one run (the slow part)
//   judgeChecks(planet, results)   findings and the results table
//
// Two findings block publishing from the start (ADR-0032): the minimal player clears waves 1-5 of the campaign, and the
// competent player with no learning success clears the whole set. Everything else warns until playtests trust the bots
// (LD0 showed the competent and minimal players match the simulator; the naive child runs 1.5-2.5 waves lower).
import type { PlanetDocument, Ruleset } from "../data/game-data";
import { compileBattleConfig } from "../sim/config";
import { deriveBlueprint } from "./board";
import { competentPolicy, minimalPolicy, naivePolicy, nonePolicy, presetsOnlyPolicy } from "./policies";
import { playWaveSet, type BotRunResult, type Policy } from "./runner";

export type CheckPolicy = "minimal" | "competent" | "naive" | "presets-only" | "none";
export const LEARNING_RATES: readonly number[] = [0, 0.6, 1];
/** C17.3 runs twenty naive seeds; a challenge is short, so fewer give the same picture [PROPOSAL]. */
export const NAIVE_SEEDS = { campaign: 20, challenge: 5 } as const;

export interface CheckJob {
  readonly waveSetId: string;
  readonly policy: CheckPolicy;
  readonly learn: number;
  readonly seed: number;
}

export interface JobResult {
  readonly job: CheckJob;
  readonly result: BotRunResult;
}

/** Every run the checks need for these wave sets, the slow competent runs first so a pool finishes evenly. */
export function planChecks(planet: PlanetDocument, waveSetIds: readonly string[]): CheckJob[] {
  const jobs: CheckJob[] = [];
  for (const waveSetId of waveSetIds) {
    const set = planet.waveSets[waveSetId];
    if (set === undefined) continue;
    const campaign = set.mode === "CAMPAIGN";
    for (const learn of LEARNING_RATES) jobs.push({ waveSetId, policy: "competent", learn, seed: 1 });
    if (campaign) jobs.push({ waveSetId, policy: "minimal", learn: 0, seed: 1 });
    jobs.push({ waveSetId, policy: "none", learn: 0, seed: 1 });
    if (set.presetPlacements.length > 0) jobs.push({ waveSetId, policy: "presets-only", learn: 0, seed: 1 });
    const seeds = campaign ? NAIVE_SEEDS.campaign : NAIVE_SEEDS.challenge;
    for (const learn of LEARNING_RATES) for (let seed = 1; seed <= seeds; seed += 1) jobs.push({ waveSetId, policy: "naive", learn, seed });
  }
  return jobs;
}

/** Plays one job. The competent player plans from the map's geometry (deriveBlueprint), as it would on any new map. */
export function runJob(ruleset: Ruleset, planet: PlanetDocument, job: CheckJob): JobResult {
  const config = compileBattleConfig(ruleset, planet, job.waveSetId);
  let policy: Policy;
  switch (job.policy) {
    case "competent":
      policy = competentPolicy(config, { blueprint: deriveBlueprint(config) });
      break;
    case "minimal":
      policy = minimalPolicy(config);
      break;
    case "naive":
      policy = naivePolicy(config, job.seed);
      break;
    case "presets-only":
      policy = presetsOnlyPolicy();
      break;
    case "none":
      policy = nonePolicy();
      break;
  }
  const meteors = job.policy !== "minimal";
  return { job, result: playWaveSet(ruleset, config, policy, { learn: job.learn, seed: job.seed, meteors }) };
}

export type CheckRule =
  | "minimalOpening"
  | "competentClears"
  | "minimalNine"
  | "noneLoses"
  | "playsItself"
  | "naiveReach"
  | "waveShort"
  | "waveLong"
  | "bossWaveLength"
  | "challengeLong"
  | "busy";

export const CHECK_TEXT: Readonly<Record<CheckRule, string>> = {
  minimalOpening: "The minimal player (three Novas, nothing more) does not clear waves 1 to 5: the opening is too hard.",
  competentClears: "The competent player with no learning success does not clear every wave.",
  minimalNine: "The minimal player does not clear waves 1 to 9 (C17.2 has it clearing them).",
  noneLoses: "With no astronauts at all, the colony still survives every wave.",
  playsItself: "The preset astronauts alone clear every wave: this challenge plays itself.",
  naiveReach: "A young first-time player at 60% learning success reaches wave 20 in fewer than half the runs.",
  waveShort: "This wave is over in under 25 seconds.",
  waveLong: "This wave lasts more than 90 seconds.",
  bossWaveLength: "This boss wave lasts under 40 or over 100 seconds.",
  challengeLong: "The challenge's combat lasts more than 10 minutes.",
  busy: "This wave has 44 or more aliens on the route at once (the cap is 48).",
};

export interface CheckFinding {
  readonly waveSetId: string;
  readonly rule: CheckRule;
  readonly severity: "block" | "warn";
  /** 1-based position in the wave set, when the finding is about one wave. */
  readonly wave?: number;
}

/** One cell of the results table: how a run ended a wave. */
export type CellState = "clear" | "leaked" | "lost" | "not reached";

export interface CheckColumn {
  readonly label: string;
  readonly cleared: number;
  readonly cells: readonly CellState[];
  /** Colony health after each wave (null where the run never got there). */
  readonly health: readonly (number | null)[];
}

export interface WaveSetReport {
  readonly waveSetId: string;
  readonly finalWave: number;
  readonly columns: readonly CheckColumn[];
  /** Naive child: waves cleared per learning rate, over the seeds (min / median / max). */
  readonly naive: readonly { readonly learn: number; readonly min: number; readonly median: number; readonly max: number }[];
  /** Seconds each wave lasted for the competent player at 60% learning success. */
  readonly seconds: readonly number[];
  readonly findings: readonly CheckFinding[];
  readonly verdict: string;
}

const pct = (learn: number): string => `${Math.round(learn * 100)}%`;

function column(label: string, r: BotRunResult, finalWave: number): CheckColumn {
  const cells: CellState[] = [];
  const health: (number | null)[] = [];
  for (let w = 1; w <= finalWave; w += 1) {
    const row = r.rows[w - 1];
    if (row === undefined) {
      cells.push("not reached");
      health.push(null);
    } else {
      cells.push(!row.cleared ? "lost" : row.leaked > 0 ? "leaked" : "clear");
      health.push(row.healthEnd);
    }
  }
  return { label, cleared: r.cleared, cells, health };
}

function median(xs: readonly number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
}

/** The findings, table and one-line verdict for each wave set in the results. */
export function judgeChecks(planet: PlanetDocument, ruleset: Ruleset, results: readonly JobResult[]): WaveSetReport[] {
  const ids = [...new Set(results.map((r) => r.job.waveSetId))];
  return ids.map((waveSetId) => {
    const set = planet.waveSets[waveSetId];
    const finalWave = set?.waves.length ?? 0;
    const campaign = set?.mode === "CAMPAIGN";
    const mine = results.filter((r) => r.job.waveSetId === waveSetId);
    const one = (policy: CheckPolicy, learn: number): BotRunResult | undefined => mine.find((r) => r.job.policy === policy && r.job.learn === learn)?.result;
    const findings: CheckFinding[] = [];
    const add = (rule: CheckRule, severity: "block" | "warn", wave?: number): void => {
      findings.push(wave === undefined ? { waveSetId, rule, severity } : { waveSetId, rule, severity, wave });
    };

    const columns: CheckColumn[] = [];
    for (const learn of LEARNING_RATES) {
      const r = one("competent", learn);
      if (r !== undefined) columns.push(column(`Competent ${pct(learn)}`, r, finalWave));
    }
    const minimal = one("minimal", 0);
    if (minimal !== undefined) columns.push(column("Minimal", minimal, finalWave));
    const presets = one("presets-only", 0);
    if (presets !== undefined) columns.push(column("Presets only", presets, finalWave));
    const none = one("none", 0);
    if (none !== undefined) columns.push(column("No astronauts", none, finalWave));

    const competent0 = one("competent", 0);
    if (competent0 !== undefined && competent0.cleared < finalWave) add("competentClears", "block", competent0.cleared + 1);
    if (minimal !== undefined) {
      if (minimal.cleared < Math.min(5, finalWave)) add("minimalOpening", "block", minimal.cleared + 1);
      else if (minimal.cleared < Math.min(9, finalWave)) add("minimalNine", "warn", minimal.cleared + 1);
    }
    if (none !== undefined && none.cleared >= finalWave) add("noneLoses", "warn");
    if (presets !== undefined && presets.cleared >= finalWave) add("playsItself", "warn");

    const naive = LEARNING_RATES.map((learn) => {
      const cleared = mine.filter((r) => r.job.policy === "naive" && r.job.learn === learn).map((r) => r.result.cleared);
      return { learn, min: Math.min(...cleared), median: median(cleared), max: Math.max(...cleared) };
    }).filter((n) => Number.isFinite(n.min));
    if (campaign) {
      const at60 = mine.filter((r) => r.job.policy === "naive" && r.job.learn === 0.6).map((r) => r.result.cleared);
      if (at60.length > 0 && at60.filter((c) => c >= 20).length * 2 < at60.length) add("naiveReach", "warn");
    }

    // Wave length and crowding from the competent player at 60% (C17.5-C17.7): the nearest thing to a child's game.
    const typical = one("competent", 0.6) ?? competent0;
    const seconds = (typical?.rows ?? []).map((row) => Math.round(row.ticks / 60));
    (typical?.rows ?? []).forEach((row, i) => {
      const s = row.ticks / 60;
      const ref = set?.waves[i];
      const wave = ref === undefined ? undefined : typeof ref === "number" ? planet.waves.find((w) => w.wave === ref) : planet.challengeWaves[ref];
      const boss = wave?.groups.some((g) => Object.hasOwn(ruleset.bosses, g.type)) ?? false;
      if (boss) {
        if (s < 40 || s > 100) add("bossWaveLength", "warn", i + 1);
      } else if (s < 25) add("waveShort", "warn", i + 1);
      else if (s > 90) add("waveLong", "warn", i + 1);
      if (row.peakAliens >= 44) add("busy", "warn", i + 1);
    });
    if (!campaign && seconds.reduce((a, b) => a + b, 0) > 600) add("challengeLong", "warn");

    const blocking = findings.filter((f) => f.severity === "block").length;
    const parts = [
      minimal === undefined ? null : `Minimal player clears ${minimal.cleared >= 5 ? "1-5: yes" : `only ${minimal.cleared}`}.`,
      competent0 === undefined ? null : `Competent at 0% learning ${competent0.cleared >= finalWave ? "clears all" : `stops at wave ${competent0.cleared + 1}`}.`,
      presets === undefined ? null : `Plays itself: ${presets.cleared >= finalWave ? "yes" : "no"}.`,
      typical === undefined ? null : `Peak ${Math.max(0, ...typical.rows.map((r) => r.peakAliens))}/48.`,
    ];
    const verdict = `${parts.filter((p) => p !== null).join(" ")} ${blocking === 0 ? "Nothing blocks publishing." : `${blocking} blocking.`}`;
    return { waveSetId, finalWave, columns, naive, seconds, findings, verdict };
  });
}
