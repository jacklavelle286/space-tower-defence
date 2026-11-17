// Gate M, LD0 spike: the TypeScript test players (src/bot) against the Python simulator (tools/sim) on the live
// campaign, and the run time of a full check. Results go in docs/validation/ld0-spikes.md.
//
//   python3 tools/sim/bot_compare.py > /tmp/py.json                     (the Python side, about a minute on 8 cores)
//   cd web/game-core && PY_RESULTS=/tmp/py.json npx vitest run -c vitest.spike.config.ts --silent=false
//
// Prints Markdown tables. Without PY_RESULTS the Python columns are empty.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";
import { it } from "vitest";
import { competentPolicy, deriveBlueprint, minimalPolicy, naivePolicy, nonePolicy, playWaveSet, presetsOnlyPolicy, type BotRunResult, type Policy } from "../src/bot";
import { parsePlanet, parseRuleset } from "../src/data/game-data";
import { compileBattleConfig, type BattleConfig } from "../src/sim/config";
import { GAME_DATA_DIR } from "./build-bounds";

const rs = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r4.json"), "utf8")));
const planet = parsePlanet(JSON.parse(readFileSync(join(GAME_DATA_DIR, "campaign", "luna-1-c2.json"), "utf8")), rs);
const LEARN = [0, 0.6, 1] as const;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

interface PyRow {
  kind: string;
  policy: string;
  learn: number;
  seed: number;
  id?: string;
  cleared: number;
  health: number;
}
const py: PyRow[] = env.PY_RESULTS !== undefined && existsSync(env.PY_RESULTS) ? JSON.parse(readFileSync(env.PY_RESULTS, "utf8")) : [];

const now = (): number => globalThis.performance.now();

function timed(f: () => BotRunResult): [BotRunResult, number] {
  const t = now();
  const r = f();
  return [r, now() - t];
}

function quantiles(xs: number[]): string {
  const s = [...xs].sort((a, b) => a - b);
  const q = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] ?? NaN;
  const median = s.length % 2 === 1 ? q(0.5) : ((s[s.length / 2 - 1] ?? 0) + (s[s.length / 2] ?? 0)) / 2;
  return `${s[0]} / ${q(0.25)} / ${median} / ${q(0.75)} / ${s[s.length - 1]}`;
}

function play(config: BattleConfig, policy: Policy, learn: number, seed = 1): BotRunResult {
  return playWaveSet(rs, config, policy, { learn, seed });
}

it("LD0: TS test players against the simulator", () => {
  const campaign = compileBattleConfig(rs, planet, "campaign");
  const derived = deriveBlueprint(campaign);
  const out: string[] = [];
  let checkMs = 0;

  out.push("Derived plan for Moonbeam: " + campaign.pads.map((p) => `${p.id}:${derived[p.id]}`).join(" "));
  out.push("");
  out.push("| Policy | Learning | Python cleared (health) | TS, simulator's plan | TS, derived plan | TS ms (sim plan) |");
  out.push("|---|---|---|---|---|---|");
  for (const learn of LEARN) {
    const p = py.find((r) => r.kind === "campaign" && r.policy === "competent" && r.learn === learn);
    const [a, ms] = timed(() => play(campaign, competentPolicy(campaign), learn));
    const [b] = timed(() => play(campaign, competentPolicy(campaign, { blueprint: derived }), learn));
    checkMs += ms;
    out.push(`| competent | ${learn * 100}% | ${p ? `${p.cleared} (${p.health})` : "-"} | ${a.cleared} (${a.health}) | ${b.cleared} (${b.health}) | ${ms.toFixed(0)} |`);
  }
  const [m, mMs] = timed(() => playWaveSet(rs, campaign, minimalPolicy(campaign), { learn: 0, meteors: false }));
  checkMs += mMs;
  out.push(`| minimal | 0% | 12 (C17.2: defeated in wave 13) | ${m.cleared}, defeated in ${m.defeatedAt} | - | ${mMs.toFixed(0)} |`);
  for (const [name, pol] of [
    ["none", nonePolicy()],
    ["presets-only", presetsOnlyPolicy()],
  ] as const) {
    const [r, ms] = timed(() => play(campaign, pol, 0));
    checkMs += ms;
    out.push(`| ${name} | 0% | - | ${r.cleared} | - | ${ms.toFixed(0)} |`);
  }
  out.push("");
  out.push("Naive child, 20 seeds: min / lower quartile / median / upper quartile / max waves cleared");
  out.push("");
  out.push("| Learning | Python | TS | TS ms (20 seeds) |");
  out.push("|---|---|---|---|");
  for (const learn of LEARN) {
    const t = now();
    const ts = SEEDS.map((s) => play(campaign, naivePolicy(campaign, s), learn, s).cleared);
    const ms = now() - t;
    checkMs += ms;
    const pyc = py.filter((r) => r.kind === "campaign" && r.policy === "naive" && r.learn === learn).map((r) => r.cleared);
    out.push(`| ${learn * 100}% | ${pyc.length ? quantiles(pyc) : "-"} | ${quantiles(ts)} | ${ms.toFixed(0)} |`);
  }
  out.push("");
  out.push(`Full campaign check (competent x3, minimal, none, presets-only, naive 20 seeds x3), one thread: ${(checkMs / 1000).toFixed(1)} s`);
  out.push("");
  out.push("| Challenge | Learning | Python competent cleared/of (health) | TS sim plan | TS derived plan |");
  out.push("|---|---|---|---|---|");
  for (const id of ["blob-parade", "wobble-rematch", "bubble-trouble"]) {
    const config = compileBattleConfig(rs, planet, id);
    const plan = deriveBlueprint(config);
    for (const learn of LEARN) {
      const p = py.find((r) => r.kind === "challenge" && r.id === id && r.learn === learn);
      const a = play(config, competentPolicy(config), learn);
      const b = play(config, competentPolicy(config, { blueprint: plan }), learn);
      const of = config.waves.length;
      out.push(`| ${id} | ${learn * 100}% | ${p ? `${p.cleared}/${of} (${p.health})` : "-"} | ${a.cleared}/${of} (${a.health}) | ${b.cleared}/${of} (${b.health}) |`);
    }
  }
  console.log(out.join("\n"));
});
