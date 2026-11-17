// G-9 golden scenarios (Phase 71; H.10, spine S5.1): for each mechanics number, how chosen waves end when the
// competent test player (60 % learning) plays them, recorded once in contracts/golden/<id>.json. A released
// simulation must never change what happens in a run pinned to it, so any difference fails here, and G-8 keeps the
// recorded files themselves from changing (a new mechanics number adds a new file). Record a new scenario with:
//   WRITE_GOLDEN=1 npx vitest run src/golden.test.ts      (in web/game-core; only for a file that does not exist yet)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../scripts/build-bounds";
import { betweenWaves, competentPolicy, fightWave, startingSnapshot } from "./bot";
import { parsePlanet, parseRuleset } from "./data/game-data";
import { battleSnapshot, createBattle } from "./sim/battle";
import { compileBattleConfig } from "./sim/config";

const GOLDEN = join(GAME_DATA_DIR, "..", "contracts", "golden");

interface Scenario {
  readonly id: string;
  readonly ruleset: string;
  readonly planet: string;
  readonly waveSet: string;
  readonly waves: readonly number[];
}

const SCENARIOS: readonly Scenario[] = [
  { id: "m1-first-contact", ruleset: "r1", planet: "luna-1-c1", waveSet: "first-contact", waves: [1, 2] },
  { id: "m2-first-contact", ruleset: "r2", planet: "luna-1-c1", waveSet: "first-contact", waves: [1, 2] },
  { id: "m3-campaign", ruleset: "r3", planet: "luna-1-c2", waveSet: "campaign", waves: [3, 10, 22, 30] },
  { id: "m4-campaign-and-endless", ruleset: "r4", planet: "luna-1-c2", waveSet: "campaign", waves: [12, 27, 40, 50, 55, 60] },
];

const readJson = (dir: string, name: string): unknown => JSON.parse(readFileSync(join(GAME_DATA_DIR, dir, `${name}.json`), "utf8"));

/** One pass of the competent player through the wave set (into endless waves past the authored ones), recording the
 *  chosen waves as they end. Stops at a defeat (later chosen waves are then missing, which the file records too). */
function play(s: Scenario) {
  const ruleset = parseRuleset(readJson("ruleset", s.ruleset));
  const config = compileBattleConfig(ruleset, parsePlanet(readJson("campaign", s.planet), ruleset), s.waveSet);
  const policy = competentPolicy(config);
  const wanted = new Set(s.waves);
  const rows = [];
  let snapshot = startingSnapshot(config);
  for (let wave = 1; wave <= Math.max(...s.waves); wave += 1) {
    if (wave > 1) snapshot = betweenWaves(ruleset, config, snapshot, wave - 1, 0.6, true);
    const battle = createBattle(config, snapshot, wave, "golden");
    policy.prep(battle);
    const row = fightWave(battle, policy);
    policy.afterWave({ leakDamage: row.leakDamage, penetration: row.penetration });
    if (wanted.has(wave)) rows.push({ wave, cleared: row.cleared, healthEnd: row.healthEnd, leaked: row.leaked, ticks: row.ticks, bounty: row.bounty, credits: row.credits });
    if (!row.cleared) break;
    snapshot = battleSnapshot(battle);
  }
  return { kind: "golden", id: s.id, mechanics: ruleset.mechanics, ruleset: s.ruleset, planet: s.planet, waveSet: s.waveSet, rows };
}

describe("golden scenarios (G-9)", () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))("%s plays as it did when it was recorded", (id, s) => {
    const file = join(GOLDEN, `${id}.json`);
    const now = play(s);
    if (process.env["WRITE_GOLDEN"] === "1" && !existsSync(file)) writeFileSync(file, `${JSON.stringify(now, null, 1)}\n`);
    expect(existsSync(file), `${file} is missing: record it once with WRITE_GOLDEN=1`).toBe(true);
    expect(now).toEqual(JSON.parse(readFileSync(file, "utf8")));
  }, 120_000);

  it("covers every mechanics number the repository's rulesets use", () => {
    const used = new Set(["r1", "r2", "r3", "r4"].map((r) => parseRuleset(readJson("ruleset", r)).mechanics));
    const covered = new Set(SCENARIOS.map((s) => parseRuleset(readJson("ruleset", s.ruleset)).mechanics));
    expect([...covered].sort()).toEqual([...used].sort());
  });
});
