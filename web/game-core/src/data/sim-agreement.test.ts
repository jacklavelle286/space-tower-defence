// Every number in game-data/ agrees with the balance simulator (tools/sim/game_data.json, the C17 evidence), and the
// bounds file's maxBounty equals the simulator's "Total bounty available" column (C8.2, tools/sim/tables.json).
// Where game-data/ renames something, the mapping is stated here: pad IDs are lower case (C3.2), and the
// simulator's colony and planet notes are prose, not data.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { buildBounds, parsePlanet, parseRuleset } from "./game-data";

const REPO = resolve(import.meta.dirname, "..", "..", "..", "..");
const SIM_DIR = join(REPO, "tools", "sim");

// The simulator's file is untyped JSON; these tests only index into it.
// oxlint-disable-next-line typescript/no-explicit-any
type Loose = any;
const sim: Loose = JSON.parse(readFileSync(join(SIM_DIR, "game_data.json"), "utf8"));
const simTables: Loose = JSON.parse(readFileSync(join(SIM_DIR, "tables.json"), "utf8"));
const ruleset = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r1.json"), "utf8")));
const planet = parsePlanet(JSON.parse(readFileSync(join(GAME_DATA_DIR, "campaign", "luna-1-c1.json"), "utf8")), ruleset);

describe("ruleset r1 agrees with tools/sim/game_data.json", () => {
  it("simulation tick rate", () => {
    expect(ruleset.simulation.tickRateHz).toBe(sim.simulation.tickRateHz);
  });

  it("colony", () => {
    const { note: _note, ...simColony } = sim.colony;
    expect(ruleset.colony).toEqual(simColony);
  });

  it("every class present, level by level", () => {
    for (const [id, cls] of Object.entries(ruleset.classes)) {
      const s = sim.classes[id];
      expect(s, `class ${id} is in the simulator`).toBeDefined();
      expect(cls.name).toBe(s.name);
      expect(cls.role).toBe(s.role);
      expect(cls.unlockAfterWave).toBe(s.unlockAfterWave);
      expect(cls.deployCap).toBe(s.deployCap);
      expect(cls.attack).toBe(s.attack);
      expect(cls.targeting).toEqual(s.targeting);
      expect(cls.levels).toEqual(s.levels);
    }
  });

  it("every alien present", () => {
    for (const [id, alien] of Object.entries(ruleset.aliens)) {
      const s = sim.aliens[id];
      expect(s, `alien ${id} is in the simulator`).toBeDefined();
      expect(alien).toEqual({ name: s.name, hp: s.hp, speed: s.speed, leak: s.leak, bounty: s.bounty });
      expect(s.traits).toEqual({}); // mechanics 1 has no traits
    }
  });

  it("economy, sell rule, caps and the power inventory cap", () => {
    expect(ruleset.economy).toEqual({
      startingCredits: sim.economy.startingCredits,
      waveClearBonus: sim.economy.waveClearBonus,
      learningRewardByBlock: sim.economy.learningRewardByBlock,
      endlessLearningReward: sim.economy.endlessLearningReward,
    });
    expect(ruleset.sell).toEqual({
      refundPct: sim.combatRules.sell.refundPct,
      roundDownTo: sim.combatRules.sell.roundDownTo,
    });
    const { rule: _rule, ...simCaps } = sim.caps;
    expect(ruleset.caps).toEqual(simCaps);
    expect(ruleset.powerRules.inventoryCapPerPower).toBe(sim.powerRules.inventoryCapPerPower);
  });
});

describe("planet luna-1-c1 agrees with tools/sim/game_data.json", () => {
  it("planet, grid and route", () => {
    expect(planet.planetId).toBe(sim.map.planetId);
    expect(planet.map.grid).toEqual({ cols: sim.map.grid.cols, rows: sim.map.grid.rows });
    expect(planet.map.route).toEqual(sim.map.route);
  });

  it("pads (IDs lower case, C3.2)", () => {
    expect(planet.map.pads).toEqual(
      sim.map.pads.map((p: Loose) => ({ id: p.id.toLowerCase(), x: p.x, y: p.y, opensAfterWave: p.opensAfterWave })),
    );
  });

  it("every authored wave", () => {
    for (const wave of planet.waves) {
      const s = sim.waves.find((w: Loose) => w.wave === wave.wave);
      expect(s, `wave ${wave.wave} is in the simulator`).toBeDefined();
      expect(wave.groups).toEqual(s.groups);
      expect(wave.hpMult).toBe(s.hpMult);
      expect(wave.speedMult).toBe(s.speedMult);
      expect(s.boss).toBeNull(); // mechanics 1 has no bosses
    }
  });

  it("the M1 wave set's start matches a fresh run (C9.1) and Blob Parade's opening (C13)", () => {
    const set = planet.waveSets["first-contact"];
    const parade = sim.challenges.find((c: Loose) => c.id === "blob-parade");
    expect(set?.startCredits).toBe(sim.economy.startingCredits);
    expect(set?.colonyHealth).toBe(sim.colony.maxHealth);
    expect(set?.classes).toEqual(parade.classes);
    expect(set?.padsOpenAsForWave).toBe(parade.padsOpenAsForWave);
    expect(set?.waves).toEqual(parade.waves.slice(0, 2));
  });
});

describe("bounds agree with the simulator's tables", () => {
  /** "Total bounty available" per campaign wave, read from the C8.2 table the simulator wrote. */
  function simBountyByWave(): Map<number, number> {
    const table: string = simTables.tables.waves;
    const lines = table.split("\n").filter((l) => /^\| \d+ \|/.test(l));
    const header = table.split("\n")[0]?.split("|").map((c) => c.trim()) ?? [];
    const col = header.indexOf("Total bounty available");
    expect(col).toBeGreaterThan(0);
    return new Map(lines.map((l) => {
      const cells = l.split("|").map((c) => c.trim());
      return [Number(cells[1]), Number(cells[col])];
    }));
  }

  it("maxBounty of every wave set position equals the simulator's bounty for that campaign wave", () => {
    const bounty = simBountyByWave();
    const bounds = buildBounds(ruleset, planet);
    for (const [id, set] of Object.entries(planet.waveSets)) {
      expect(bounds.waveSets[id]?.maxBounty, id).toEqual(set.waves.map((w) => bounty.get(w)));
    }
    expect(bounds.waveSets["first-contact"]?.maxBounty).toEqual([24, 32]); // C8.2 rows 1 and 2
  });

  it("cumulative costs equal the C5.2 'Cumulative cost' column", () => {
    expect(buildBounds(ruleset, planet).classes["nova"]?.cumulativeCosts).toEqual([50, 110, 260]);
  });
});
