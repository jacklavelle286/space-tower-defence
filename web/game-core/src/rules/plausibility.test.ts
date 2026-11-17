// Plausibility bounds (Phase 30, M2-07; spine S6). The shared vectors pin the rules (api/tests/unit/test_plausibility.py
// reads the same file). The property test is the exit criterion "thousands of simulated legitimate waves never trip a
// bound": random but legal play through the real simulation on the simulator's 50 campaign waves (carriers,
// splitters, healers, all five bosses) with ruleset r3 (six classes, caps, Orion's level-3 STRONG, three powers), and
// every checkpoint it produces is checked against the bounds file buildBounds generates for that pair.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { env } from "node:process";
import { describe, expect, it } from "vitest";
import { buildBounds, parsePlanet, parseRuleset, type AuthoredWave, type Bounds } from "../data/game-data";
import { battleSnapshot, compileBattleConfig, createBattle, giveCommand, startWave, step, type Battle, type Command } from "../sim";
import type { Op, Snapshot, Targeting } from "./contracts.generated";
import { plausibilityProblems, snapshotValue, type PlausibilityRun } from "./plausibility";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(join(REPO, path), "utf8")) as Record<string, unknown>;

type Vector = { name: string; run: PlausibilityRun; op: Op; problems: unknown[] };
const VECTORS = readJson("contracts/fixtures/plausibility/vectors.json") as unknown as { bounds: Bounds; vectors: Vector[] };

describe("plausibility vectors (contracts/fixtures/plausibility/vectors.json)", () => {
  it.each(VECTORS.vectors.map((v) => [v.name, v] as const))("%s", (_name, vector) => {
    expect(plausibilityProblems(VECTORS.bounds, vector.run, vector.op)).toEqual(vector.problems);
  });

  it("value is credits plus each placement's cumulative cost", () => {
    expect(snapshotValue(VECTORS.bounds, 7, [{ padId: "p01", classId: "nova", level: 3, targeting: "FRONT" }])).toBe(267);
  });
});

// ---- the property test ------------------------------------------------------------------------------------------

const r3 = parseRuleset(readJson("game-data/ruleset/r3.json"));
// oxlint-disable-next-line typescript/no-explicit-any
const SIM: any = readJson("tools/sim/game_data.json");
// oxlint-disable-next-line typescript/no-explicit-any
const WAVES: AuthoredWave[] = SIM.waves.map((w: any) => ({ wave: w.wave, groups: w.groups, hpMult: w.hpMult, speedMult: w.speedMult }));
const doc = structuredClone(readJson("game-data/campaign/luna-1-c1.json"));
doc["waves"] = WAVES;
doc["waveSets"] = {
  campaign: {
    mode: "CAMPAIGN",
    name: "Property test campaign",
    waves: WAVES.map((w) => w.wave),
    meteorAfter: [9, 19, 29, 39, 49],
    startCredits: 150,
    colonyHealth: 20,
    classes: Object.keys(r3.classes),
    padsOpenAsForWave: 26, // every pad open, so random play can build real defences (the server allows the same)
    presetPlacements: [],
  },
};
const planet = parsePlanet(doc, r3);
const config = compileBattleConfig(r3, planet, "campaign");
const bounds = buildBounds(r3, planet);
const CLASSES = Object.keys(r3.classes);
const POWERS = Object.keys(r3.powers);
const MODES: readonly Targeting[] = ["FRONT", "FAST", "CROWD", "STRONG"];
/** How many legitimate waves to play; PLAUSIBILITY_WAVES raises it for a longer local run. */
const WAVES_TO_PLAY = Number(env["PLAUSIBILITY_WAVES"] ?? 2000);

/** A small seeded generator (mulberry32): the same samples on every run, no Math.random in game-core. */
function generator(seed: number): (n: number) => number {
  let a = seed >>> 0;
  return (n) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

function randomCommand(battle: Battle, rand: (n: number) => number): Command {
  const pad = config.pads[rand(config.pads.length)]?.id ?? "p01";
  switch (rand(battle.status === "IN_WAVE" ? 6 : 5)) {
    case 0:
    case 1:
      return { kind: "place", padId: pad, classId: CLASSES[rand(CLASSES.length)] ?? "nova" };
    case 2:
      return { kind: "upgrade", padId: pad };
    case 3:
      return { kind: "sell", padId: pad };
    case 4:
      return { kind: "setTargeting", padId: pad, targeting: MODES[rand(MODES.length)] ?? "FRONT" };
    default:
      return { kind: "usePower", powerId: POWERS[rand(POWERS.length)] ?? "frost-pulse", target: rand(config.route.length) };
  }
}

const op = (type: string, payload: object): Op => ({ opId: "x", expectedRevision: 0, type, payload, clientTime: "x" }) as unknown as Op;

describe("property: legitimate play never trips a bound", () => {
  it(`${WAVES_TO_PLAY} random legal waves on the 50-wave campaign with ruleset r3`, () => {
    const rand = generator(20261117);
    let cleared = 0;
    let checked = 0;
    for (let i = 0; i < WAVES_TO_PLAY; i += 1) {
      const wave = 1 + rand(50);
      const highestCompletedWave = wave - 1;
      const stored: Snapshot = {
        credits: 500 + rand(4000),
        placements: [],
        colony: { health: 1 + rand(20), shield: rand(11) },
        powers: Object.fromEntries(POWERS.map((id) => [id, rand(3)])),
      };
      const battle = createBattle(config, stored, wave, `prop-${i}`);
      for (let c = 10 + rand(30); c > 0; c -= 1) giveCommand(battle, randomCommand(battle, rand));
      const prep = battleSnapshot(battle);
      const run = { waveSetId: "campaign", highestCompletedWave, snapshot: stored };
      for (const type of ["SAVE_PREP", "START_WAVE"]) {
        const problems = plausibilityProblems(bounds, run, op(type, { wave, credits: prep.credits, placements: prep.placements }));
        expect(problems, `sample ${i}, ${type} for wave ${wave}`).toEqual([]);
        checked += 1;
      }
      startWave(battle);
      while (battle.status === "IN_WAVE") {
        if (rand(150) === 0) giveCommand(battle, randomCommand(battle, rand));
        step(battle);
      }
      if (battle.status !== "CLEARED") continue;
      cleared += 1;
      const after = battleSnapshot(battle);
      const problems = plausibilityProblems(bounds, { ...run, snapshot: prep }, op("COMPLETE_WAVE", { wave, ...after }));
      expect(problems, `sample ${i}, COMPLETE_WAVE for wave ${wave}`).toEqual([]);
      checked += 1;
    }
    // Not vacuous: most samples clear their wave, so COMPLETE_WAVE is checked thousands of times too.
    expect(cleared).toBeGreaterThan(WAVES_TO_PLAY / 2);
    expect(checked).toBeGreaterThan(2 * WAVES_TO_PLAY);
  }, 120_000);

  it("the bounds file carries Orion's level-3 STRONG, and a forged wave is caught", () => {
    expect(bounds.classes["orion"]?.targetingFromLevel).toEqual({ STRONG: 3 });
    const stored: Snapshot = { credits: 100, placements: [], colony: { health: 20, shield: 0 }, powers: {} };
    const max = bounds.waveSets["campaign"]?.maxBounty[9] ?? 0;
    const forged = op("COMPLETE_WAVE", { wave: 10, credits: 100 + max + 1, placements: [], colony: { health: 20, shield: 0 }, powers: {} });
    expect(plausibilityProblems(bounds, { waveSetId: "campaign", highestCompletedWave: 9, snapshot: stored }, forged)).toEqual([
      { field: "op.payload.credits", rule: "value" },
    ]);
  });
});
