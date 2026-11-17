// Every number in game-data/ agrees with the balance simulator (tools/sim/game_data.json, the C17 evidence): the
// rulesets r1 (Nova only), r2 (the six-class roster, Phase 24) and r3 (the alien catalogue, Phase 26, the bosses,
// Phase 27, and the meteor powers, Phase 28), and the planet document. Prices, cumulative costs
// and sell refunds equal the simulator's own C5.2 roster table, and the bounds file's maxBounty equals its "Total
// bounty available" column (C8.2); both tables are tools/sim/tables.json, written by the Python model.
// Where game-data/ renames something, the mapping is stated here: pad IDs are lower case (C3.2), and the
// simulator's colony and planet notes are prose, not data.
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { armouredDamage, buffedDamage, cometDamage, compileBattleConfig, flyingBlastDamage, healAmount, sellRefund } from "../sim/config";
import { initialRunState } from "../sim/run";
import { alienBounty, buildBounds, meteorAward, parsePlanet, parseRuleset, TARGETING_MODES, waveBounty, type AuthoredWave } from "./game-data";

const REPO = resolve(import.meta.dirname, "..", "..", "..", "..");
const SIM_DIR = join(REPO, "tools", "sim");

// The simulator's file is untyped JSON; these tests only index into it.
// oxlint-disable-next-line typescript/no-explicit-any
type Loose = any;
const sim: Loose = JSON.parse(readFileSync(join(SIM_DIR, "game_data.json"), "utf8"));
const simTables: Loose = JSON.parse(readFileSync(join(SIM_DIR, "tables.json"), "utf8"));
const ruleset = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r1.json"), "utf8")));
const ruleset2 = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r2.json"), "utf8")));
const ruleset3 = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r3.json"), "utf8")));
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
  ["r3", ruleset3],
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

  it("every alien present, every number and trait (C6.1)", () => {
    for (const [id, alien] of Object.entries(rs.aliens)) {
      const s = sim.aliens[id];
      expect(s, `alien ${id} is in the simulator`).toBeDefined();
      // The simulator's traits object is copied key for key (armour, bubbles, flying, cluster, healer, children).
      // Mechanics 1 and 2 have no traits: those rulesets hold only the Moon Blob, which has none in the simulator.
      expect(alien, id).toEqual({
        name: s.name,
        hp: s.hp,
        speed: s.speed,
        leak: s.leak,
        bounty: s.bounty,
        traits: s.traits,
        descendantOnly: s.descendantOnly ?? false,
      });
      if (rs.mechanics < 3) expect(s.traits).toEqual({});
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

describe("ruleset r3 is the whole alien catalogue (Phase 26, M2-03)", () => {
  it("has exactly the simulator's ten aliens (C6.1) and declares mechanics 3", () => {
    expect(Object.keys(ruleset3.aliens)).toEqual(Object.keys(sim.aliens).sort());
    expect(Object.keys(ruleset3.aliens)).toEqual(["blob", "craft", "flutter", "guard", "mite", "patch", "shell", "slime", "slimelet", "swarm"]);
    expect(ruleset3.mechanics).toBe(3);
  });

  it("changes nothing r2 had except the aliens (and adds the bosses, Phase 27, and the powers and their rules, Phase 28)", () => {
    const { aliens: a2, version: _v2, mechanics: _m2, bosses: b2, powers: p2, powerRules: pr2, ...rest2 } = ruleset2;
    const { aliens: a3, version: _v3, mechanics: _m3, bosses: _b3, powers: _p3, powerRules: pr3, ...rest3 } = ruleset3;
    expect(b2).toEqual({});
    expect(p2).toEqual({});
    expect(rest3).toEqual(rest2);
    expect(a3["blob"]).toEqual(a2["blob"]);
    // r2's one power rule, the inventory cap, is unchanged; r3 adds the rules that come with the powers.
    expect(pr2).toEqual({ inventoryCapPerPower: 2 });
    expect(pr3.inventoryCapPerPower).toBe(pr2.inventoryCapPerPower);
  });

  it("the C6.1 trait numbers and the C6.4 caps, as C states them", () => {
    const t = (id: string) => ruleset3.aliens[id]?.traits;
    expect([t("shell")?.armour, t("guard")?.bubbles, t("flutter")?.flying, t("swarm")?.cluster]).toEqual([4, 4, true, true]);
    expect(t("patch")?.healer).toEqual({ amount: 6, radius: 1.5, period: 3 });
    expect([t("slime")?.children, t("craft")?.children]).toEqual([[{ type: "slimelet", count: 2 }], [{ type: "blob", count: 4 }]]);
    expect(ruleset3.caps).toEqual({
      maxActiveAliens: 60,
      scheduledSpawnSoftCap: 48,
      maxLiveDescendants: 24,
      descendantReleaseGap: 0.25,
      deferredSpawnGap: 0.25,
      maxDescendantDepth: 2,
    });
  });

  it("parent and offspring bounties are separate lines (C6.3): a Craft is worth 6 + 4 x 4, a Split Slime 3 + 2 x 1", () => {
    expect(alienBounty(ruleset3, "craft")).toBe(22);
    expect(alienBounty(ruleset3, "slime")).toBe(5);
    expect(alienBounty(ruleset3, "craft", [{ type: "mite", count: 6 }])).toBe(6 + 6 * 2); // wave 38's cargo
  });

  it("every campaign wave's bounty, cargo and bosses included, equals the simulator's 'Total bounty available' (C8.2)", () => {
    // The simulator's 50 waves as authored waves (Phase 27 added the five boss waves). waveBounty is what the bounds
    // file's maxBounty uses, so this also checks the server's bound for every alien, carrier, cargo and boss.
    const table: string = simTables.tables.waves;
    const header = table.split("\n")[0]?.split("|").map((c) => c.trim()) ?? [];
    const col = header.indexOf("Total bounty available");
    const bounty = new Map(
      table
        .split("\n")
        .filter((l) => /^\| \d+ \|/.test(l))
        .map((l) => {
          const cells = l.split("|").map((c) => c.trim());
          return [Number(cells[1]), Number(cells[col])];
        }),
    );
    const waves: Loose[] = sim.waves;
    expect(waves).toHaveLength(50);
    expect(waves.filter((w) => w.boss !== null).map((w) => w.wave)).toEqual([10, 20, 30, 40, 50]);
    expect(waves.some((w) => w.groups.some((g: Loose) => g.cargo !== undefined))).toBe(true);
    for (const w of waves) {
      const wave: AuthoredWave = { wave: w.wave, groups: w.groups, hpMult: w.hpMult, speedMult: w.speedMult };
      expect(waveBounty(ruleset3, wave), `wave ${w.wave}`).toBe(bounty.get(w.wave));
    }
  });

  it("the trait rounding rules are the simulator's (C2.2): flying blast, armour, Patchling heal", () => {
    const simSource = readFileSync(join(SIM_DIR, "sim.py"), "utf8");
    expect(sim.combatRules.rounding.junoBlastOnFlying).toBe("ceil(damage / 2)");
    expect(sim.combatRules.rounding.armour).toBe("max(1, damage - armour)");
    expect(sim.combatRules.rounding.patchlingHeal).toBe("floor(amount * hpMult + 0.5), never above maximum health");
    // sim.py Game._hit and the heal pulse in Game.run_wave, as written there.
    expect(simSource).toContain("dmg = (dmg + 1) // 2");
    expect(simSource).toContain('amt = int(math.floor(h.healer["amount"] * wd["hpMult"] + 0.5))');
    for (let d = 1; d <= 200; d += 1) {
      expect(flyingBlastDamage(d)).toBe(Math.ceil(d / 2));
      expect(armouredDamage(d, 4)).toBe(Math.max(1, d - 4));
    }
    // Every hpMult the simulator's campaign uses.
    for (const w of sim.waves) expect(healAmount(6, w.hpMult)).toBe(Math.floor(6 * w.hpMult + 0.5));
  });

  it("the simulator's damage order is C2.2's: buff, flying, bubble layer, armour, health", () => {
    expect(sim.combatRules.damageOrder).toEqual([
      "base damage",
      "Sol buff: floor((base*(100+pct)+50)/100)",
      "flying: Juno blast halved, rounded up",
      "bubble layer absorbs the whole hit",
      "armour: max(1, damage - armour)",
      "health",
    ]);
  });
});

describe("ruleset r3's bosses are the simulator's (Phase 27, M2-04, C7)", () => {
  it("the same five bosses, every number, every phase and action; the simulator's prose and duplicates left out", () => {
    expect(Object.keys(ruleset3.bosses)).toEqual(Object.keys(sim.bosses).sort());
    expect(Object.keys(ruleset3.bosses)).toEqual(["boss1", "boss2", "boss3", "boss4", "boss5"]);
    for (const [id, boss] of Object.entries(ruleset3.bosses)) {
      const s = sim.bosses[id];
      // The simulator's top-level armour and bubbles repeat its first phase's (Game._spawn reads the phase); `wave`
      // is where the campaign puts the boss, which is planet data (C8), not ruleset data.
      expect(s.armour, id).toBe(s.phases[0].armour);
      expect(s.bubbles, id).toBe(s.phases[0].onEnter?.selfBubbles ?? 0);
      expect(boss, id).toEqual({
        name: s.name,
        hp: s.hp,
        speed: s.speed,
        leak: s.leak,
        bounty: s.bounty,
        slowFactorPct: Math.round(s.bossSlowFactor * 100),
        phases: s.phases.map(({ cue: _cue, ...phase }: Loose) => phase),
        ...(s.onDefeatRelease === undefined ? {} : { onDefeatRelease: s.onDefeatRelease }),
      });
    }
  });

  it("the C7 tables, as C states them (initial playtest settings, C17.7)", () => {
    const b = (id: string) => ruleset3.bosses[id];
    expect(["boss1", "boss2", "boss3", "boss4", "boss5"].map((id) => [b(id)?.name, b(id)?.hp, b(id)?.speed, b(id)?.leak, b(id)?.bounty])).toEqual([
      ["King Wobble", 450, 0.5, 8, 50],
      ["Captain Clank", 1000, 0.45, 10, 75],
      ["Queen Bubbla", 2200, 0.45, 12, 100],
      ["The Mothership", 2300, 0.4, 14, 125],
      ["The Great Glorp", 3600, 0.4, 20, 150],
    ]);
    expect(b("boss2")?.phases.map((p) => [p.fromPct, p.armour, p.speedFactor])).toEqual([
      [100, 5, 1],
      [60, 2, 1.15],
      [25, 0, 1.4],
    ]);
    expect(b("boss3")?.phases[1]?.onEnter).toEqual({ selfBubbles: 8, giveBubbles: { layers: 1, radius: 2 } });
    expect(b("boss4")?.onDefeatRelease).toEqual([{ type: "blob", count: 4 }]);
    expect(b("boss5")?.phases[2]?.onEnter?.release).toEqual([
      { type: "slime", count: 2 },
      { type: "mite", count: 4 },
    ]);
  });

  it("slows on bosses: the simulator's half strength (combatRules.slow.bossSlowFactor and every boss's own)", () => {
    expect(sim.combatRules.slow.bossSlowFactor).toBe(0.5);
    for (const boss of Object.values(ruleset3.bosses)) expect(boss.slowFactorPct).toBe(50);
  });

  it("a boss is worth its bounty plus every release (sim.py Game._type_bounty): the Great Glorp 150 + 6 + 2 x 5 + 4 x 2", () => {
    expect(alienBounty(ruleset3, "boss1")).toBe(50);
    expect(alienBounty(ruleset3, "boss4")).toBe(125 + 4 * 2 + 4 * 3 + 2 * 5 + 4 * 4);
    expect(alienBounty(ruleset3, "boss5")).toBe(150 + 6 * 1 + 2 * (3 + 2 * 1) + 4 * 2);
  });

  it("the simulator's phase test is C7's: a phase begins when health x 100 <= fromPct x maximum (sim.py Game._boss_phase)", () => {
    const simSource = readFileSync(join(SIM_DIR, "sim.py"), "utf8");
    expect(simSource).toContain('a.hp * 100 <= ph[a.phase + 1]["fromPct"] * a.maxhp');
    // Health and speed are the boss's own, not scaled by the wave (Game._spawn).
    expect(simSource).toContain('a.maxhp = int(wd.get("bossHp") or b["hp"])');
    expect(simSource).toContain('a.speed = b["speed"] * b["phases"][0]["speedFactor"]');
  });
});

/**
 * The meteor powers (Phase 28, M2-05, C10). game-data names them with the contracts' hyphenated key IDs (spine S9.5
 * keyId: "powers frost-pulse"), the simulator with underscores: frost_pulse is frost-pulse, and so on. The
 * simulator's prose (effect, targeting, mouse, keyboard), its pausedWhileTargeting flag (a player-app rule, D) and its
 * meteorSchedule (planet data: the wave set's meteorAfter) are not ruleset data; `effect` is game-data's own field,
 * naming which rule the simulation applies (the simulator decides by the power's ID).
 */
describe("ruleset r3's meteor powers are the simulator's (Phase 28, M2-05, C10)", () => {
  const simId = (id: string): string => id.replaceAll("-", "_");
  const simSource = readFileSync(join(SIM_DIR, "sim.py"), "utf8");

  it("the same three powers, every number", () => {
    expect(Object.keys(ruleset3.powers).map(simId).sort()).toEqual(Object.keys(sim.powers).sort());
    expect(ruleset3.powers).toEqual({
      "colony-shield": { name: sim.powers.colony_shield.name, effect: "shield", shieldPoints: sim.powers.colony_shield.shieldPoints },
      "comet-burst": {
        name: sim.powers.comet_burst.name,
        effect: "burst",
        radius: sim.powers.comet_burst.radius,
        pctMaxHp: sim.powers.comet_burst.pctMaxHp,
        bossPctMaxHp: sim.powers.comet_burst.bossPctMaxHp,
      },
      "frost-pulse": { name: sim.powers.frost_pulse.name, effect: "slow", slowPct: sim.powers.frost_pulse.slowPct, duration: sim.powers.frost_pulse.duration },
    });
  });

  it("the C10 table, as C states it: 50% for 6 s (bosses 25%); 50% of maximum health within 1.5 tiles (bosses 10%); 10 points", () => {
    expect(ruleset3.powers["frost-pulse"]).toMatchObject({ slowPct: 50, duration: 6 });
    // Bosses 25%: the boss's own slowFactorPct (50) applies to the pulse as to Pip's slow (C5.4, C7).
    for (const boss of Object.values(ruleset3.bosses)) expect(Math.floor((50 * boss.slowFactorPct) / 100)).toBe(25);
    expect(ruleset3.powers["comet-burst"]).toMatchObject({ radius: 1.5, pctMaxHp: 50, bossPctMaxHp: 10 });
    expect(ruleset3.powers["colony-shield"]).toMatchObject({ shieldPoints: 10 });
    expect([ruleset3.colony.shieldCap, ruleset3.colony.shieldAbsoluteCap]).toEqual([10, 20]);
  });

  it("powerRules: cap 2, each power once a wave, a 3 s shared lockout, the rotation of the meteor schedule, one charge each", () => {
    const pr = sim.powerRules;
    expect(ruleset3.powerRules).toEqual({
      inventoryCapPerPower: pr.inventoryCapPerPower,
      perWaveUseLimitPerPower: pr.perWaveUseLimitPerPower,
      sharedLockoutSeconds: pr.sharedLockoutSeconds,
      awardRotation: ["frost-pulse", "comet-burst", "colony-shield"],
    });
    expect(ruleset3.powerRules).toMatchObject({ inventoryCapPerPower: 2, perWaveUseLimitPerPower: 1, sharedLockoutSeconds: 3 });
    // The simulator's five meteor challenges follow the rotation, one charge each (the contract's reward holds one
    // powerId: one charge per success).
    // oxlint-disable-next-line typescript/no-explicit-any
    pr.meteorSchedule.forEach((m: any, i: number) => {
      expect(meteorAward(ruleset3, i + 1), m.slotId).toBe(m.power.replaceAll("_", "-"));
      expect(m.charges, m.slotId).toBe(1);
    });
    // The sixth (endless M-059) is the third again (C10: "the mapping continues in endless").
    expect(meteorAward(ruleset3, 6)).toBe("colony-shield");
    expect(pr.awardMapping).toMatch(/Frost Pulse, Comet Burst, Colony Shield, then round again/);
    expect(meteorAward(ruleset2, 1)).toBeNull();
  });

  it("Comet Burst's rounding is the simulator's: ceil(maxHealth x pct / 100), for every health up to 4,000 and both shares", () => {
    expect(sim.combatRules.rounding.cometBurst).toBe("ceil(maxHealth * pct / 100), removed directly from health");
    expect(simSource).toContain('self._lose(a, int(math.ceil(a.maxhp * pct / 100.0)))');
    for (const pct of [50, 10]) {
      for (let maxHp = 1; maxHp <= 4000; maxHp += 1) expect(cometDamage(maxHp, pct)).toBe(Math.ceil((maxHp * pct) / 100));
    }
  });

  it("the simulator's use rules are C10's: in a wave, a charge held, once a wave, after the lockout; the charge taken on use", () => {
    expect(simSource).toContain("self.in_wave and self.powers.get(pid, 0) > 0 and pid not in self.power_used_this_wave");
    expect(simSource).toContain("and self.t >= self.power_lock_until)");
    expect(simSource).toContain('self.shield = min(self.col["shieldAbsoluteCap"], self.shield + p["shieldPoints"])');
    expect(simSource).toContain("self.powers[pid] -= 1");
    // Reset at every wave start (run_wave), so nothing but the counts crosses a wave (C2.5).
    expect(simSource).toContain("self.power_used_this_wave = set()\n        self.power_lock_until = 0.0");
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

describe("planet document luna-1-c2: the 50-wave campaign (Phase 50, M4-01; C8.2, C3.3, C13)", () => {
  const raw: Loose = JSON.parse(readFileSync(join(GAME_DATA_DIR, "campaign", "luna-1-c2.json"), "utf8"));
  const c2 = parsePlanet(raw, ruleset3);
  const campaign = c2.waveSets["campaign"];

  it("is the simulator's 50 waves, number for number, and keeps luna-1-c1's map and first-contact", () => {
    const simWaves: Loose[] = sim.waves;
    expect(c2.waves.map((w) => w.wave)).toEqual(simWaves.map((w) => w.wave));
    for (const w of simWaves) {
      const mine = c2.waves.find((x) => x.wave === w.wave);
      expect(mine?.hpMult, `wave ${w.wave}`).toBe(w.hpMult);
      expect(mine?.speedMult, `wave ${w.wave}`).toBe(w.speedMult);
      expect(JSON.parse(JSON.stringify(mine?.groups)), `wave ${w.wave}`).toEqual(w.groups);
    }
    const c1: Loose = planetRaw;
    expect(raw.map).toEqual(c1.map);
    expect(raw.waveSets["first-contact"]).toEqual(c1.waveSets["first-contact"]);
  });

  it("the campaign: waves 1-50, meteors after 9/19/29/39/49, bosses only on 10/20/30/40/50, every class in unlock order", () => {
    expect(campaign?.mode).toBe("CAMPAIGN");
    expect(campaign?.waves).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
    expect(campaign?.meteorAfter).toEqual([9, 19, 29, 39, 49]);
    const bossWaves = c2.waves.filter((w) => w.groups.some((g) => Object.hasOwn(ruleset3.bosses, g.type))).map((w) => w.wave);
    expect(bossWaves).toEqual([10, 20, 30, 40, 50]);
    expect(campaign?.classes).toEqual(["nova", "pip", "juno", "orion", "mira", "sol"]);
    expect(campaign?.classes.map((id) => ruleset3.classes[id]?.unlockAfterWave)).toEqual([0, 5, 10, 15, 20, 25]); // C5.9
  });

  it("G-15: the create-run transaction is 3 + (finalWave - 1) + len(meteorAfter) = 57 actions, within 100 (spine S5.1)", () => {
    const bounds = buildBounds(ruleset3, c2);
    expect(bounds.waveSets["campaign"]?.createRunActions).toBe(3 + (50 - 1) + 5);
    expect(bounds.waveSets["campaign"]?.createRunActions).toBeLessThanOrEqual(100);
    expect(bounds.waveSets["campaign"]?.maxBounty).toHaveLength(50);
    expect(bounds.waveSets["campaign"]?.normalRewardByInterval).toHaveLength(49);
  });

  it("a new campaign run has 49 normal and 5 meteor slots; meteors award the powers in rotation (C9.2, C10)", () => {
    const run = initialRunState(ruleset3, compileBattleConfig(ruleset3, c2, "campaign"), ["x"]);
    expect(run.slots.filter((s) => s.kind === "NORMAL")).toHaveLength(49);
    const meteors = run.slots.filter((s) => s.kind === "METEOR");
    expect(meteors.map((s) => [s.slotId, s.reward.powerId, s.reward.credits])).toEqual([
      ["M-009", "frost-pulse", 0],
      ["M-019", "comet-burst", 0],
      ["M-029", "colony-shield", 0],
      ["M-039", "frost-pulse", 0],
      ["M-049", "comet-burst", 0],
    ]);
    expect(run.slots.find((s) => s.slotId === "N-010")?.reward).toEqual({ credits: 40 }); // C9.2 block 10-19
  });

  it("pads open as C3.3 schedules them, the same pads as the simulator's map", () => {
    const simPads: Loose[] = sim.map.pads;
    expect(c2.map.pads.map((p) => [p.id, p.opensAfterWave])).toEqual(simPads.map((p) => [p.id.toLowerCase(), p.opensAfterWave]));
  });
});
