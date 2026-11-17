// Every number in game-data/ agrees with the balance simulator (tools/sim/game_data.json, the C17 evidence): both
// rulesets, r1 (Nova only) and r2 (the six-class roster, Phase 24), and the planet document. Prices, cumulative costs
// and sell refunds equal the simulator's own C5.2 roster table, and the bounds file's maxBounty equals its "Total
// bounty available" column (C8.2); both tables are tools/sim/tables.json, written by the Python model.
// Where game-data/ renames something, the mapping is stated here: pad IDs are lower case (C3.2), and the
// simulator's colony and planet notes are prose, not data.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { buffedDamage, sellRefund } from "../sim/config";
import { buildBounds, parsePlanet, parseRuleset, TARGETING_MODES } from "./game-data";

const REPO = resolve(import.meta.dirname, "..", "..", "..", "..");
const SIM_DIR = join(REPO, "tools", "sim");

// The simulator's file is untyped JSON; these tests only index into it.
// oxlint-disable-next-line typescript/no-explicit-any
type Loose = any;
const sim: Loose = JSON.parse(readFileSync(join(SIM_DIR, "game_data.json"), "utf8"));
const simTables: Loose = JSON.parse(readFileSync(join(SIM_DIR, "tables.json"), "utf8"));
const ruleset = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r1.json"), "utf8")));
const ruleset2 = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r2.json"), "utf8")));
const planetRaw: unknown = JSON.parse(readFileSync(join(GAME_DATA_DIR, "campaign", "luna-1-c1.json"), "utf8"));
const planet = parsePlanet(planetRaw, ruleset);

/** The C5.2 roster table the simulator wrote (tools/sim/tables.py, from its own refund formula), keyed "class/level". */
function simRosterTable(): Map<string, { cost: number; cumulative: number; refund: number }> {
  const table: string = simTables.tables.roster;
  const rows = new Map<string, { cost: number; cumulative: number; refund: number }>();
  let name = "";
  for (const line of table.split("\n").slice(2)) {
    const cells = line.split("|").map((c) => c.trim());
    if (cells[1] !== "") name = (cells[1] ?? "").split(" - ")[0]?.toLowerCase() ?? "";
    rows.set(`${name}/${cells[2]}`, { cost: Number(cells[3]), cumulative: Number(cells[4]), refund: Number(cells[5]) });
  }
  return rows;
}

describe.each([
  ["r1", ruleset],
  ["r2", ruleset2],
])("ruleset %s agrees with tools/sim/game_data.json", (_version, rs) => {
  it("simulation tick rate", () => {
    expect(rs.simulation.tickRateHz).toBe(sim.simulation.tickRateHz);
  });

  it("colony", () => {
    const { note: _note, ...simColony } = sim.colony;
    expect(rs.colony).toEqual(simColony);
  });

  it("every class present, level by level, every number (C5.1, C5.2)", () => {
    for (const [id, cls] of Object.entries(rs.classes)) {
      const s = sim.classes[id];
      expect(s, `class ${id} is in the simulator`).toBeDefined();
      expect(cls.name).toBe(s.name);
      expect(cls.role).toBe(s.role);
      expect(cls.unlockAfterWave).toBe(s.unlockAfterWave);
      expect(cls.deployCap).toBe(s.deployCap);
      expect(cls.attack).toBe(s.attack);
      expect(cls.targeting).toEqual(s.targeting);
      // The simulator has no defaultTargeting field: a new tower takes its first mode, or FRONT (Game.place).
      expect(cls.defaultTargeting).toBe(s.targeting[0] ?? "FRONT");
      expect(cls.levels).toEqual(s.levels);
    }
  });

  it("targeting levels: r2 copies the simulator; r1 (mechanics 1, no such field) is right only because every r1 mode opens at level 1", () => {
    for (const [id, cls] of Object.entries(rs.classes)) {
      const s = sim.classes[id];
      if (rs.mechanics >= 2) expect(cls.targetingFromLevel, id).toEqual(s.targetingFromLevel);
      else expect(Object.values(s.targetingFromLevel).every((level) => level === 1), id).toBe(true);
    }
  });

  it("every alien present", () => {
    for (const [id, alien] of Object.entries(rs.aliens)) {
      const s = sim.aliens[id];
      expect(s, `alien ${id} is in the simulator`).toBeDefined();
      expect(alien).toEqual({ name: s.name, hp: s.hp, speed: s.speed, leak: s.leak, bounty: s.bounty });
      expect(s.traits).toEqual({}); // no traits until Phase 26
    }
  });

  it("economy, sell rule, caps and the power inventory cap", () => {
    expect(rs.economy).toEqual({
      startingCredits: sim.economy.startingCredits,
      waveClearBonus: sim.economy.waveClearBonus,
      learningRewardByBlock: sim.economy.learningRewardByBlock,
      endlessLearningReward: sim.economy.endlessLearningReward,
    });
    expect(rs.sell).toEqual({
      refundPct: sim.combatRules.sell.refundPct,
      roundDownTo: sim.combatRules.sell.roundDownTo,
    });
    const { rule: _rule, ...simCaps } = sim.caps;
    expect(rs.caps).toEqual(simCaps);
    expect(rs.powerRules.inventoryCapPerPower).toBe(sim.powerRules.inventoryCapPerPower);
  });

  it("price, cumulative cost and sell refund of every class and level equal the simulator's C5.2 table (C5.7)", () => {
    const table = simRosterTable();
    const bounds = buildBounds(rs, parsePlanet(planetRaw, rs));
    for (const [id, cls] of Object.entries(rs.classes)) {
      const b = bounds.classes[id];
      cls.levels.forEach((l, i) => {
        const invested = b?.cumulativeCosts[i] ?? -1;
        expect({ cost: l.cost, cumulative: invested, refund: sellRefund(invested, rs.sell) }, `${id} level ${l.level}`).toEqual(
          table.get(`${id}/${l.level}`),
        );
      });
    }
  });
});

describe("ruleset r2 is the whole roster (Phase 24, M2-01)", () => {
  it("has exactly the simulator's six classes (C5.1) and declares mechanics 2", () => {
    expect(Object.keys(ruleset2.classes)).toEqual(Object.keys(sim.classes).sort());
    expect(Object.keys(ruleset2.classes)).toEqual(["juno", "mira", "nova", "orion", "pip", "sol"]);
    expect(ruleset2.mechanics).toBe(2);
  });

  it("changes nothing r1 had except the classes, and adds the slow rules (Phase 25)", () => {
    const { classes: _c1, version: _v1, mechanics: _m1, ...rest1 } = ruleset;
    const { classes: _c2, version: _v2, mechanics: _m2, slow, ...rest2 } = ruleset2;
    expect(slow).toBeDefined();
    expect(ruleset.slow).toBeUndefined();
    expect(rest2).toEqual(rest1);
    const { targetingFromLevel: _t, ...nova2 } = ruleset2.classes["nova"] ?? {};
    const { targetingFromLevel: _t1, ...nova1 } = ruleset.classes["nova"] ?? {};
    expect(nova2).toEqual(nova1);
  });
});

describe("the Phase 25 rules (C5.3 - C5.6) agree with the simulator", () => {
  const simSource = readFileSync(join(SIM_DIR, "sim.py"), "utf8");

  it("the targeting modes are the spine's enum, FRONT | FAST | CROWD | STRONG (P5)", () => {
    expect(Object.keys(sim.combatRules.targetingModes)).toEqual([...TARGETING_MODES]);
  });

  it("r2's slow cap is the simulator's combatRules.slow.capPct (C5.4)", () => {
    expect(ruleset2.slow?.capPct).toBe(sim.combatRules.slow.capPct);
    expect(ruleset2.slow?.capPct).toBe(50);
  });

  it("r2's refreshWithinSeconds is the threshold in the simulator's Pip preference (sim.py Game._pick)", () => {
    // The simulator keeps this number in code, not in game_data.json: `a.slowrem <= 0.15` in its "fresh" filter.
    const match = /fresh = \[a for a in c if a\.slowrem <= ([0-9.]+) or /.exec(simSource);
    expect(match, "sim.py's Pip preference has moved; find the threshold again").not.toBeNull();
    expect(ruleset2.slow?.refreshWithinSeconds).toBe(Number(match?.[1]));
  });

  it("the stacking rules differ only where no slow in the game can reach (C5.4 vs combatRules.slow.stacking)", () => {
    // C5.4: an equal or stronger slow replaces the current one and keeps the longer of the two remaining times.
    // The simulator: a stronger one takes its own duration. They differ only if a stronger slow lasts less than a
    // weaker one has left, so it is enough that every stronger slow lasts at least as long as every weaker one in
    // full: Pip's levels and the Frost Pulse power, capped, at full strength and at a boss's half strength.
    expect(sim.combatRules.slow.stacking).toMatch(/stronger slow replaces it \(strength and duration\)/);
    const cap = ruleset2.slow?.capPct ?? 0;
    const pip = ruleset2.classes["pip"];
    const sources = [
      ...(pip?.attack === "slow" ? pip.levels.map((l) => [l.slowPct, l.slowDuration] as const) : []),
      [sim.powers.frost_pulse.slowPct, sim.powers.frost_pulse.duration] as const,
    ];
    expect(sources).toHaveLength(4);
    for (const factor of [1, sim.combatRules.slow.bossSlowFactor]) {
      for (const [pctA, durA] of sources) {
        for (const [pctB, durB] of sources) {
          if (Math.min(pctB * factor, cap) > Math.min(pctA * factor, cap)) expect(durB, `${pctB}% vs ${pctA}%`).toBeGreaterThanOrEqual(durA);
        }
      }
    }
  });

  it("Sol's rounding is the simulator's: floor((damage x (100 + buffPct) + 50) / 100) for every attacker and Sol level", () => {
    expect(sim.combatRules.rounding.solBuff).toBe("floor((damage * (100 + buffPct) + 50) / 100)");
    const sol = ruleset2.classes["sol"];
    const pcts = sol?.attack === "buff" ? sol.levels.map((l) => l.buffPct) : [];
    expect(pcts).toEqual([15, 25, 25]);
    for (const cls of Object.values(ruleset2.classes)) {
      for (const l of cls.levels) {
        // sim.py Game._fire: dmg = (lv["damage"] * (100 + tw.buff) + 50) // 100
        if ("damage" in l) for (const pct of pcts) expect(buffedDamage(l.damage, pct)).toBe(Math.floor((l.damage * (100 + pct) + 50) / 100));
      }
    }
    expect(simSource).toContain('dmg = (lv["damage"] * (100 + tw.buff) + 50) // 100');
  });

  it("the simulator's buff and Pip rules say what C5.6 and C5.3 say", () => {
    expect(sim.combatRules.buff).toMatch(/single largest buffPct/);
    expect(sim.combatRules.buff).toMatch(/Sol never buffs Sol, Mira or itself/);
    expect(sim.combatRules.pipTargetRule).toMatch(/prefers aliens that are not currently slowed/);
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
    expect(buildBounds(ruleset2, parsePlanet(planetRaw, ruleset2)).classes["orion"]?.cumulativeCosts).toEqual([170, 270, 600]);
  });
});
