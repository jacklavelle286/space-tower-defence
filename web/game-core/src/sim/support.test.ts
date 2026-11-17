// Targeting and support rules (Phase 25, M2-02): the four targeting modes and their tie-breaks (C5.3), Pip's slow
// with its cap and stacking rule (C5.4), Mira's shield and repair limits (C5.5) and Sol's strongest-wins buff (C5.6),
// one test per rule, plus three whole waves scored by both this simulation and the Python model (tools/sim/sim.py).
//
// Every number comes from game-data/ruleset/r2.json through compileBattleConfig. The literal numbers in expectations
// are the C5.2 table (Pip 30% for 3 s at level 1, Mira +2 every 12 s at level 3, Sol +15% and +25%, ...), so a
// changed ruleset number fails a test that says where it came from.
//
// Geometry used throughout: pad p04 is at (6, 5); the route runs down x = 4 from (4, 2) to (4, 8), where route
// progress is 4 + (y - 2) tiles. A 2.5-tile range from p04 covers y = 3.5 to 6.5 on that stretch.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePlanet, parseRuleset, type Ruleset, type Targeting } from "../data/game-data";
import type { Placement, Snapshot } from "../rules";
import {
  battleSnapshot,
  buffedDamage,
  buffPctAt,
  compileBattleConfig,
  createBattle,
  drainEvents,
  giveCommand,
  nextInt,
  routePoint,
  startWave,
  step,
  UNITS_PER_TILE,
  type AlienState,
  type Battle,
  type BattleConfig,
  type BattleEvent,
} from "./index";

const GAME_DATA = join(import.meta.dirname, "..", "..", "..", "..", "game-data");
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(join(GAME_DATA, path), "utf8")) as Record<string, unknown>;
const R2_RAW = readJson("ruleset/r2.json");
const r2 = parseRuleset(R2_RAW);
const PLANET_RAW = readJson("campaign/luna-1-c1.json");
const SEED = "5eed5eed5eed5eed";
const ALL_CLASSES = ["nova", "pip", "juno", "orion", "mira", "sol"];

/** A scenario wave scored by both models (the last describe): 30 Moon Blobs, then 10 more close together. */
function scenarioWave(wave: number, hpMult: number, speedMult: number) {
  return {
    wave,
    groups: [
      { type: "blob", count: 30, at: 0, gap: 0.55 },
      { type: "blob", count: 10, at: 30, gap: 0.35 },
    ],
    hpMult,
    speedMult,
  };
}

/**
 * A test-only planet on Moonbeam Colony: wave 1 is a single Moon Blob, which
 * keeps a wave running for 2,400 ticks (40 tiles at 1 tile per second) when nothing shoots it. The wave set
 * "support" is a CHALLENGE with every class and every pad open. Nothing here is game data.
 */
function testConfig(ruleset: Ruleset): BattleConfig {
  const doc = structuredClone(PLANET_RAW);
  doc["waves"] = [
    { wave: 1, groups: [{ type: "blob", count: 1, at: 0, gap: 0 }], hpMult: 1, speedMult: 1 },
    scenarioWave(2, 4, 1.03),
    scenarioWave(3, 4, 1.07),
    scenarioWave(4, 6, 1.07),
  ];
  doc["waveSets"] = {
    support: {
      mode: "CHALLENGE",
      name: "Support rules",
      waves: [1, 2, 3, 4],
      meteorAfter: [],
      startCredits: 150,
      colonyHealth: 20,
      classes: ALL_CLASSES,
      padsOpenAsForWave: 26,
      presetPlacements: [],
    },
  };
  return compileBattleConfig(ruleset, parsePlanet(doc, ruleset), "support");
}
const config = testConfig(r2);

/** Route progress (units) at height y on the x = 4 stretch beside p04. */
const at = (y: number): number => Math.round((4 + (y - 2)) * UNITS_PER_TILE);

/** A Moon Blob (24 health, 1 tile/s = 1,000 units a tick) at height y, unslowed unless `more` says otherwise. */
function alien(id: number, y: number, more: Partial<AlienState> = {}): AlienState {
  return { id, type: "blob", hp: 24, maxHp: 24, progress: at(y), speed: 1000, slowPct: 0, slowTicksLeft: 0, look: 0, bubbles: 0, depth: 0, cargo: [], phase: 0, ...more };
}

function snapshot(placements: Placement[], health = 20, shield = 0): Snapshot {
  return { credits: 10_000, placements, colony: { health, shield }, powers: {} };
}

function place(padId: string, classId: string, level = 1, targeting: Targeting = "FRONT"): Placement {
  return { padId, classId, level, targeting };
}

/**
 * A running wave with these astronauts and exactly these aliens on the route (no scheduled spawns), on wave 1 of
 * `cfg` unless another is given.
 */
function fight(placements: Placement[], aliens: AlienState[], cfg = config): Battle {
  const battle = createBattle(cfg, snapshot(placements), 1, SEED);
  startWave(battle);
  battle.spawnIndex = cfg.waves[0]?.spawns.length ?? 0;
  battle.aliens = aliens;
  battle.nextAlienId = Math.max(0, ...aliens.map((a) => a.id)) + 1;
  return battle;
}

const shots = (events: readonly BattleEvent[]) => events.flatMap((e) => (e.kind === "shot" ? [e] : []));

/** The alien a single-target astronaut on p04 shoots at in one tick, by id. */
function targetOf(classId: string, level: number, mode: Targeting, aliens: AlienState[]): number | undefined {
  const battle = fight([place("p04", classId, level, mode)], aliens);
  step(battle);
  return shots(drainEvents(battle))[0]?.alienId;
}

/** Where a blast astronaut on p04 aimed in one tick, as the y of the alien whose point it hit. */
function blastAimY(level: number, mode: Targeting, ys: readonly number[]): number | undefined {
  const battle = fight([place("p04", "juno", level, mode)], ys.map((y, i) => alien(i + 1, y)));
  step(battle);
  const aim = battle.towers[0]?.lastShotAt;
  return ys.find((y) => {
    const p = routePoint(config.route, at(y));
    return aim !== null && aim !== undefined && p.x === aim.x && p.y === aim.y;
  });
}

// ---- C5.3 targeting ---------------------------------------------------------------------------------------------

describe("C5.3 targeting: each mode, and every tie broken by FRONT, then the lower id", () => {
  it("FRONT: the alien furthest along the route; equal progress -> the lower id", () => {
    expect(targetOf("nova", 1, "FRONT", [alien(1, 4), alien(2, 6), alien(3, 5)])).toBe(2);
    expect(targetOf("nova", 1, "FRONT", [alien(4, 5), alien(7, 5)])).toBe(4);
    expect(targetOf("nova", 1, "FRONT", [alien(7, 5), alien(4, 5)])).toBe(4); // list order does not matter
  });

  it("FAST: the highest current speed, even behind; equal speeds -> FRONT; a slow counts", () => {
    expect(targetOf("nova", 1, "FAST", [alien(1, 4, { speed: 1500 }), alien(2, 6)])).toBe(1);
    expect(targetOf("nova", 1, "FAST", [alien(1, 4), alien(2, 6)])).toBe(2);
    // Alien 1 is faster on paper but slowed by 40%: 1,500 x 60% = 900 units a tick, slower than alien 2's 1,000.
    expect(targetOf("nova", 1, "FAST", [alien(1, 6, { speed: 1500, slowPct: 40, slowTicksLeft: 60 }), alien(2, 4)])).toBe(2);
    // Exactly equal current speeds (1,000 x 70% = 700 = 700 x 100%), compared as integers: a tie, so FRONT decides.
    expect(targetOf("nova", 1, "FAST", [alien(1, 4, { slowPct: 30, slowTicksLeft: 60 }), alien(2, 5, { speed: 700 })])).toBe(2);
    expect(targetOf("nova", 1, "FAST", [alien(1, 5, { slowPct: 30, slowTicksLeft: 60 }), alien(2, 4, { speed: 700 })])).toBe(1);
    expect(targetOf("nova", 1, "FAST", [alien(9, 5, { speed: 1200 }), alien(3, 5, { speed: 1200 })])).toBe(3);
  });

  it("STRONG (Orion, level 3): the highest current health; equal health -> FRONT; then the lower id", () => {
    expect(targetOf("orion", 3, "STRONG", [alien(1, 4, { hp: 20 }), alien(2, 6, { hp: 12 })])).toBe(1);
    expect(targetOf("orion", 3, "STRONG", [alien(1, 4, { hp: 20 }), alien(2, 6, { hp: 20 })])).toBe(2);
    expect(targetOf("orion", 3, "STRONG", [alien(5, 5, { hp: 20 }), alien(2, 5, { hp: 20 })])).toBe(2);
    // FRONT for comparison: the same aliens, the front one.
    expect(targetOf("orion", 3, "FRONT", [alien(1, 4, { hp: 20 }), alien(2, 6, { hp: 12 })])).toBe(2);
  });

  it("CROWD (Juno): the alien with the most live aliens within the blast radius around it; ties -> FRONT", () => {
    // Level 1, blast radius 1 tile. Counts (itself included): y = 6.5 alone, 1; 4.5 has 4, 2; 4 has 4.5 and 3.2, 3;
    // 3.2 (out of range, so not a candidate, but it counts as a neighbour) has 4, 2. So y = 4, behind 4.5.
    expect(blastAimY(1, "CROWD", [6.5, 4.5, 4, 3.2])).toBe(4);
    // Two pairs: every alien counts 2, so FRONT decides.
    expect(blastAimY(1, "CROWD", [6.2, 5.8, 4, 3.6])).toBe(6.2);
    // FRONT ignores the crowd.
    expect(blastAimY(1, "FRONT", [6.5, 4.5, 4, 3.2])).toBe(6.5);
  });

  it("Pip prefers an alien that wants its slow: not slowed, slowed more weakly, or with its slow about to end", () => {
    const slowedFront = (more: Partial<AlienState>) => [alien(1, 6, more), alien(2, 4)];
    // Level 2 slows 40%. The front alien already has 40% for another second: Pip spreads its frost to alien 2.
    expect(targetOf("pip", 2, "FRONT", slowedFront({ slowPct: 40, slowTicksLeft: 60 }))).toBe(2);
    // A weaker slow (30%) on the front alien: Pip's 40% would improve it, so the front alien it is.
    expect(targetOf("pip", 2, "FRONT", slowedFront({ slowPct: 30, slowTicksLeft: 60 }))).toBe(1);
    // A slow ending within refreshWithinSeconds (0.15 s = 9 ticks) counts as ending: Pip renews it.
    expect(config.slow.refreshTicks).toBe(9);
    expect(targetOf("pip", 2, "FRONT", slowedFront({ slowPct: 40, slowTicksLeft: 9 }))).toBe(1);
    expect(targetOf("pip", 2, "FRONT", slowedFront({ slowPct: 40, slowTicksLeft: 10 }))).toBe(2);
    // When every alien in range is already slowed, the mode decides among all of them.
    expect(targetOf("pip", 2, "FRONT", [alien(1, 6, { slowPct: 40, slowTicksLeft: 60 }), alien(2, 4, { slowPct: 40, slowTicksLeft: 60 })])).toBe(1);
    // Within FAST, the preference comes first: the faster alien is slowed already, so the slower one.
    expect(targetOf("pip", 2, "FAST", [alien(1, 4, { speed: 1500, slowPct: 40, slowTicksLeft: 60 }), alien(2, 5)])).toBe(2);
  });

  it("the choice never depends on the order of the alien list (deterministic ordering, seeded random boards)", () => {
    let rng = 12345;
    const draw = (n: number): number => {
      const r = nextInt(rng, n);
      rng = r.state;
      return r.value;
    };
    const modes: [string, number, Targeting][] = [
      ["nova", 1, "FRONT"],
      ["nova", 1, "FAST"],
      ["orion", 3, "STRONG"],
      ["juno", 1, "CROWD"],
      ["pip", 3, "FRONT"],
      ["pip", 1, "FAST"],
    ];
    for (let board = 0; board < 200; board += 1) {
      const aliens = Array.from({ length: 2 + draw(7) }, (_, i) => {
        const slowed = draw(2) === 1;
        return alien(i + 1, 3.5 + draw(7) / 2, {
          hp: 10 + draw(3) * 5,
          speed: 700 + draw(3) * 300,
          slowPct: slowed ? 30 + draw(2) * 10 : 0,
          slowTicksLeft: slowed ? 1 + draw(30) : 0,
        });
      });
      for (const [classId, level, mode] of modes) {
        const outcome = (list: AlienState[]) => {
          const battle = fight([place("p04", classId, level, mode)], list.map((a) => ({ ...a })));
          step(battle);
          return [...battle.aliens].sort((a, b) => a.id - b.id).map((a) => [a.id, a.hp, a.slowPct, a.slowTicksLeft, a.progress]);
        };
        expect(outcome([...aliens].reverse()), `${classId} ${mode} board ${board}`).toEqual(outcome(aliens));
      }
    }
  });
});

// ---- C5.4 Pip's slow --------------------------------------------------------------------------------------------

describe("C5.4 Pip's slow", () => {
  it("slows the target by its level's percent for its duration, then lets it go", () => {
    const battle = fight([place("p04", "pip", 1)], [alien(1, 6, { hp: 1000, maxHp: 1000 })]);
    const start = battle.aliens[0]?.progress ?? 0;
    step(battle); // level 1: 30% for 3 s = 180 ticks; this tick's movement is the first slowed one
    expect(battle.aliens[0]).toMatchObject({ hp: 1000 - 5, slowPct: 30, slowTicksLeft: 179, progress: start + 700 });
    battle.towers = []; // nobody renews it
    for (let i = 0; i < 179; i += 1) step(battle);
    expect(battle.aliens[0]).toMatchObject({ slowPct: 0, slowTicksLeft: 0, progress: start + 180 * 700 });
    step(battle);
    expect(battle.aliens[0]?.progress).toBe(start + 180 * 700 + 1000);
  });

  it("level 3 slows every live alien within 1 tile of the target, the target included; the damage is the target's only", () => {
    // Target y = 6 (FRONT). y = 5 is 1.0 tile away (inside, inclusive); y = 4.9 is 1.1 away (outside).
    const battle = fight([place("p04", "pip", 3)], [alien(1, 6), alien(2, 5), alien(3, 4.9)]);
    step(battle);
    expect(battle.aliens.map((a) => [a.id, a.hp, a.slowPct, a.slowTicksLeft])).toEqual([
      [1, 24 - 7, 40, 239],
      [2, 24, 40, 239],
      [3, 24, 0, 0],
    ]);
  });

  it("cap: no slow or combination of slows reduces speed by more than capPct (50%), so nothing is ever stopped", () => {
    expect(r2.slow?.capPct).toBe(50);
    // A test-only ruleset whose Pip would slow by 90%: the alien still moves at half speed.
    const raw = structuredClone(R2_RAW) as { classes: { pip: { levels: { slowPct: number }[] } } };
    for (const level of raw.classes.pip.levels) level.slowPct = 90;
    const strong = testConfig(parseRuleset(raw));
    const battle = fight([place("p04", "pip", 1), place("p05", "pip", 1)], [alien(1, 6, { hp: 1000, maxHp: 1000 })], strong);
    const start = battle.aliens[0]?.progress ?? 0;
    step(battle); // both Pips hit it (p04, then p05 also reaches y = 6)
    expect(battle.aliens[0]).toMatchObject({ slowPct: 50, progress: start + 500 });
  });

  describe("no stacking: one slow at a time; equal or stronger replaces it and keeps the longer time; weaker is ignored", () => {
    /** One level-`level` Pip shot at a lone alien already carrying `slowPct` for `ticks`; its slow afterwards. */
    function after(level: number, slowPct: number, ticks: number): [number, number] {
      const battle = fight([place("p04", "pip", level)], [alien(1, 6, { hp: 1000, maxHp: 1000, slowPct, slowTicksLeft: ticks })]);
      step(battle);
      const a = battle.aliens[0];
      return [a?.slowPct ?? -1, (a?.slowTicksLeft ?? -1) + 1]; // + 1: undo this tick's countdown
    }
    it("weaker: ignored, the 40% slow keeps its own time", () => expect(after(1, 40, 100)).toEqual([40, 100]));
    it("equal: the longer remaining time wins, either way round", () => {
      expect(after(2, 40, 100)).toEqual([40, 240]);
      expect(after(2, 40, 300)).toEqual([40, 300]);
    });
    it("stronger: replaces the strength, and keeps the longer remaining time", () => {
      expect(after(2, 30, 50)).toEqual([40, 240]);
      expect(after(2, 30, 300)).toEqual([40, 300]); // see sim-agreement.test.ts: the simulator would take 240 here
    });
    it("two Pips on one alien in one tick do not add up: 40% and 30% leave 40%", () => {
      const battle = fight([place("p04", "pip", 2), place("p05", "pip", 1)], [alien(1, 6, { hp: 1000, maxHp: 1000 })]);
      step(battle);
      expect(battle.aliens[0]).toMatchObject({ slowPct: 40, slowTicksLeft: 239 });
    });
  });
});

// ---- C5.5 Mira's shield and repair ------------------------------------------------------------------------------

/** Run ticks until the battle's tick counter reaches `tick` (each step runs the tick numbered by the counter). */
function runTo(battle: Battle, tick: number): void {
  while (battle.tick < tick) {
    if (battle.status !== "IN_WAVE") throw new Error(`wave ended at tick ${battle.tick}, before ${tick}`);
    step(battle);
  }
}

/** Wave 1 (one blob, which leaks at tick 2,399) with these astronauts and this colony, running. */
function oneBlob(placements: Placement[], health = 20, shield = 0): Battle {
  const battle = createBattle(config, snapshot(placements, health, shield), 1, SEED);
  startWave(battle);
  return battle;
}

describe("C5.5 Mira's shield: pulses, the cap of 10, the absolute cap of 20", () => {
  it("the first pulse comes one full period after the wave starts (level 1: +1 every 15 s = 900 ticks)", () => {
    const battle = oneBlob([place("p16", "mira", 1)]);
    runTo(battle, 900);
    expect(battle.shield).toBe(0);
    step(battle); // tick 900
    expect(battle.shield).toBe(1);
    runTo(battle, 1801);
    expect(battle.shield).toBe(2);
    expect(drainEvents(battle).filter((e) => e.kind === "shielded")).toEqual([
      { kind: "shielded", tick: 900, padId: "p16", points: 1 },
      { kind: "shielded", tick: 1800, padId: "p16", points: 1 },
    ]);
  });

  it("two Miras each pulse, but the shield never passes shieldCap (10)", () => {
    expect(config.colony.shieldCap).toBe(10);
    const battle = oneBlob([place("p12", "mira", 3), place("p16", "mira", 3)], 20, 7);
    runTo(battle, 721); // tick 720: +2 (p12) -> 9, +1 (p16, capped) -> 10
    expect(battle.shield).toBe(10);
    expect(drainEvents(battle).filter((e) => e.kind === "shielded").map((e) => (e.kind === "shielded" ? e.points : 0))).toEqual([2, 1]);
    runTo(battle, 1441);
    expect(battle.shield).toBe(10);
    expect(drainEvents(battle).filter((e) => e.kind === "shielded")).toEqual([]); // a pulse at the cap adds nothing
  });

  it("a shield above the cap (the Colony Shield power, up to the absolute cap of 20) is neither raised nor cut by a pulse, and is trimmed to 10 when the wave ends", () => {
    expect(config.colony.shieldAbsoluteCap).toBe(20);
    for (const start of [15, 20]) {
      const battle = oneBlob([place("p12", "mira", 3), place("p16", "mira", 3)], 20, 0);
      battle.shield = start; // as the power would leave it, mid-wave
      runTo(battle, 2399);
      expect(battle.shield).toBe(start);
      step(battle); // tick 2,399: the blob's 2,400th move reaches the end; it leaks (1 point off the shield), wave cleared
      // Phase 28: the wave's end trims the battle's own shield as well as the snapshot (sim.py run_wave does the same).
      expect([battle.status, battle.shield, battleSnapshot(battle).colony.shield]).toEqual(["CLEARED", 10, 10]);
    }
  });

  it("a Mira placed or re-placed mid-wave waits a full period; an upgrade keeps the timer, at most one new period away", () => {
    const battle = oneBlob([]);
    runTo(battle, 100);
    giveCommand(battle, { kind: "place", padId: "p16", classId: "mira" }); // applies at tick 100: first pulse 1,000
    runTo(battle, 1000);
    expect(battle.shield).toBe(0);
    step(battle);
    expect(battle.shield).toBe(1);
    // Sell and place again at tick 1,200: the pulse due at 1,900 is lost; the next is 1,200 + 900.
    runTo(battle, 1200);
    giveCommand(battle, { kind: "sell", padId: "p16" });
    giveCommand(battle, { kind: "place", padId: "p16", classId: "mira" });
    runTo(battle, 2100);
    expect(battle.shield).toBe(1);
    step(battle);
    expect(battle.shield).toBe(2);
  });

  it("an upgrade to level 3 (period 12 s) brings a pulse that is further than 12 s away forward", () => {
    const battle = oneBlob([place("p16", "mira", 2)]); // next pulse at 900
    runTo(battle, 10);
    giveCommand(battle, { kind: "upgrade", padId: "p16" }); // tick 10: min(900, 10 + 720) = 730
    expect(battle.towers[0]?.readyTick).toBe(900);
    step(battle);
    expect(battle.towers[0]?.readyTick).toBe(730);
    runTo(battle, 731);
    expect(battle.shield).toBe(2);
    expect(battle.towers[0]?.readyTick).toBe(730 + 720);
  });
});

describe("C5.5 Mira's repair: +1 health on a cleared wave from a level-3 Mira, at most 1 per wave in total", () => {
  /** A wave cleared on its first tick, with this colony and these Miras; returns [health, repaired events]. */
  function clear(levels: number[], health: number): [number, BattleEvent[]] {
    const battle = fight(levels.map((level, i) => place(i === 0 ? "p12" : "p16", "mira", level)), []);
    battle.health = health;
    step(battle);
    expect(battle.status).toBe("CLEARED");
    return [battle.health, drainEvents(battle).filter((e) => e.kind === "repaired")];
  }

  it("level 3 repairs 1; levels 1 and 2 repair nothing", () => {
    expect(clear([3], 15)).toEqual([16, [{ kind: "repaired", tick: 0, health: 1 }]]);
    expect(clear([1, 2], 15)).toEqual([15, []]);
  });

  it("two level-3 Miras still repair only miraRepairCapPerWave (1)", () => {
    expect(config.colony.miraRepairCapPerWave).toBe(1);
    expect(clear([3, 3], 15)[0]).toBe(16);
  });

  it("never above the colony's maximum (20)", () => {
    expect(clear([3, 3], 20)).toEqual([20, []]);
  });

  it("a defeated wave repairs nothing", () => {
    // One blob one unit from the end leaks this tick and takes the colony's last health point.
    const battle = fight([place("p16", "mira", 3)], [{ ...alien(1, 0), progress: config.route.length - 1 }]);
    battle.health = 1;
    step(battle);
    expect([battle.status, battle.health]).toEqual(["DEFEATED", 0]);
  });
});

// ---- C5.6 Sol's buff --------------------------------------------------------------------------------------------

describe("C5.6 Sol's buff: strongest wins, attackers only, damage only, no loops", () => {
  // Sol on p12 (14, 5). p09 (10, 6) is sqrt(17) = 4.12 tiles away: inside 4.5. p04 (6, 5) is 8 away: outside even 6.
  it("buffs an attacker whose pad centre is within Sol's radius, by Sol's own level", () => {
    const battle = fight([place("p09", "nova"), place("p04", "nova"), place("p12", "sol", 1)], []);
    expect(buffPctAt(battle, "p09")).toBe(15);
    expect(buffPctAt(battle, "p04")).toBe(0);
  });

  it("the C2.2 rounding: floor((damage x (100 + buff) + 50) / 100), integers only", () => {
    expect([buffedDamage(10, 15), buffedDamage(10, 25), buffedDamage(16, 15), buffedDamage(5, 15), buffedDamage(90, 25), buffedDamage(7, 0)]).toEqual([
      12, 13, 18, 6, 113, 7,
    ]);
  });

  it("the buffed damage is what lands: Nova level 1 (10) with a level-2 Sol (+25%) hits for 13", () => {
    // Sol on p12 reaches p09; an alien on the route near p09: (8, 6) is 2 tiles from p09, inside Nova's 2.5.
    const nearP09 = (id: number) => ({ ...alien(id, 0), progress: Math.round((4 + 6 + 4 + 2) * UNITS_PER_TILE) });
    const battle = fight([place("p09", "nova"), place("p12", "sol", 2)], [nearP09(1)]);
    step(battle);
    expect(shots(drainEvents(battle)).map((e) => e.damage)).toEqual([13]);
  });

  it("strongest wins: inside two Sols' radii an attacker gets only the larger percent (25, not 15 + 25)", () => {
    // Nova on p13 (14, 7): 2 tiles from the Sol on p12 (14, 5), sqrt(20) = 4.47 from the Sol on p16 (18, 5). Both reach.
    const battle = fight([place("p13", "nova"), place("p12", "sol", 1), place("p16", "sol", 2)], []);
    expect(buffPctAt(battle, "p13")).toBe(25);
    const swapped = fight([place("p13", "nova"), place("p12", "sol", 2), place("p16", "sol", 1)], []);
    expect(buffPctAt(swapped, "p13")).toBe(25);
  });

  it("no loop: Sols in each other's radius buff neither each other nor Mira, and no buff ever exceeds the largest Sol level", () => {
    const maxPct = Math.max(...(config.classes["sol"]?.levels.map((l) => l.buff?.pct ?? 0) ?? []));
    expect(maxPct).toBe(25);
    for (const a of [1, 2, 3]) {
      for (const b of [1, 2, 3]) {
        const battle = fight(
          [place("p09", "juno", 1, "CROWD"), place("p12", "sol", a), place("p13", "mira", 3), place("p16", "sol", b), place("p05", "pip")],
          [],
        );
        const own = (level: number) => config.classes["sol"]?.levels[level - 1]?.buff?.pct ?? -1;
        // Each Sol is in the other's radius (4 tiles), yet neither is buffed; Mira is not buffed.
        expect([buffPctAt(battle, "p12"), buffPctAt(battle, "p16"), buffPctAt(battle, "p13")]).toEqual([0, 0, 0]);
        // Juno on p09 is reached by the Sol on p12 only (p16 is 8.06 away, beyond even level 3's 6 tiles), and gets
        // exactly that Sol's own number. Were a Sol buffed by the other and the bonus fed into its own, this would
        // be larger; Pip on p05 (8.25 from p12) gets nothing.
        expect(buffPctAt(battle, "p09")).toBe(own(a));
        expect(buffPctAt(battle, "p05")).toBe(0);
        // After the wave has run five seconds (the Juno firing, Mira pulsing), the same: nothing feeds back.
        for (let i = 0; i < 300; i += 1) step(battle);
        expect(buffPctAt(battle, "p09")).toBe(own(a));
        expect(buffPctAt(battle, "p09")).toBeLessThanOrEqual(maxPct);
      }
    }
  });

  it("changes damage only: Pip under a Sol slows by its own 30% for its own 3 s and keeps its own rate", () => {
    const withSol = fight([place("p04", "pip", 1), place("p02", "sol", 2)], [alien(1, 6, { hp: 1000, maxHp: 1000 })]);
    const without = fight([place("p04", "pip", 1)], [alien(1, 6, { hp: 1000, maxHp: 1000 })]);
    expect(buffPctAt(withSol, "p04")).toBe(25);
    step(withSol);
    step(without);
    expect(withSol.aliens[0]).toMatchObject({ hp: 1000 - buffedDamage(5, 25), slowPct: 30, slowTicksLeft: 179 });
    expect(without.aliens[0]).toMatchObject({ hp: 1000 - 5, slowPct: 30, slowTicksLeft: 179 });
    expect(withSol.towers.find((t) => t.padId === "p04")?.readyTick).toBe(without.towers[0]?.readyTick);
  });
});

// ---- two models, one answer -------------------------------------------------------------------------------------

/**
 * Whole waves scored by both models. The expected numbers are the Python model's (tools/sim/sim.py Game at tick_hz
 * 60 with the same boards, pads open, colony health 15, waves as scenarioWave, every alien's fate recorded); this
 * simulation must produce the same kills, the same leaked aliens by id, bounty, shots, damage, health and shield.
 * Tick counts may differ by one (its float route progress can land a hair short of a tile boundary, battle.test.ts).
 *
 * To re-run the Python side: in tools/sim, `python3 -B -c "import sim; ..."` building Game(load_data(), tick_hz=60,
 * classes=[all six]), all_pads_open = True, health = 15, force_place / force_upgrade / set_mode per board (pad IDs
 * upper case), wrapping Game._leak to record ids, then run_wave(wave) and reading WaveStats kills, bounty, shots and
 * Game.dmg_total, health, shield.
 *
 * Why these waves: in many others the two models differ on a handful of aliens, and every difference traced so far
 * is float arithmetic in the Python model, not a rule: (1) it counts a slow down in float seconds, so a 4 s slow
 * can last 241 ticks instead of 240; (2) two aliens at exactly the same progress, or one exactly on a range edge,
 * are told apart by rounding noise there, while here the tie-break decides (further along, then the lower id). The
 * speed multipliers 1.03 and 1.07 make exact ties rare, so these waves test the rules rather than the rounding.
 */
describe("whole waves scored by both models (tools/sim/sim.py at 60 Hz) agree", () => {
  const FULL = [
    place("p02", "orion", 3, "STRONG"),
    place("p04", "pip", 3),
    place("p05", "nova", 2, "FAST"),
    place("p09", "juno", 2, "CROWD"),
    place("p12", "sol", 2),
    place("p16", "mira", 3),
  ];
  const MIX = [
    place("p02", "nova", 3, "FAST"),
    place("p04", "pip", 1),
    place("p05", "juno", 3, "CROWD"),
    place("p09", "orion", 1),
    place("p12", "orion", 3, "STRONG"),
    place("p16", "sol", 3),
  ];
  it.each([
    ["every class, every mode; hpMult 4, speed x1.03", FULL, 2, { pyTicks: 3672, defeated: 38, leaked: [17, 30], bounty: 152, shots: 147, damage: 3829, health: 16, shield: 8 }],
    ["every class, every mode; hpMult 4, speed x1.07", FULL, 3, { pyTicks: 3585, defeated: 39, leaked: [30], bounty: 156, shots: 151, damage: 3818, health: 16, shield: 7 }],
    ["no Mira, two Orions, Sol level 3; hpMult 6, speed x1.07", MIX, 4, { pyTicks: 3088, defeated: 40, leaked: [], bounty: 160, shots: 148, damage: 5760, health: 15, shield: 0 }],
  ] as const)("%s", (_name, board, wave, { pyTicks, ...python }) => {
    const battle = createBattle(config, snapshot([...board], 15), wave, SEED);
    startWave(battle);
    const leaked: number[] = [];
    while (battle.status === "IN_WAVE") {
      if (battle.tick > 20_000) throw new Error("wave did not end");
      step(battle);
      for (const e of drainEvents(battle)) if (e.kind === "leaked") leaked.push(e.alienId);
    }
    expect(Math.abs(battle.tick - pyTicks)).toBeLessThanOrEqual(1);
    expect({
      defeated: battle.stats.defeated,
      leaked,
      bounty: battle.stats.bounty,
      shots: battle.stats.shots,
      damage: battle.stats.damage,
      health: battle.health,
      shield: battle.shield,
    }).toEqual(python);
  });
});
