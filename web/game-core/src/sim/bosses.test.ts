// Bosses (Phase 27, M2-04; C7): each boss's phase change as a pure function of its health, each phase action, how
// slows and heals apply to a boss, what happens when one reaches the colony, that no boss state crosses a wave
// boundary, determinism, and the exit criterion: a baseline defence (Nova alone, no powers) beats every boss, and the
// Python simulator and this simulation agree on it, number for number.
//
// Every boss number comes from game-data/ruleset/r3.json through compileBattleConfig; they are initial playtest
// settings (C17.7). The literal numbers in expectations are C7's (King Wobble 450 health, phase 2 from 50% at x1.3;
// Captain Clank's armour 5, 2, 0; Queen Bubbla's 8 layers and her 1-layer gift within 2 tiles; the Mothership's doors;
// the Great Glorp's four phases) and C2's arithmetic (60 ticks per second, 60,000 units per tile).
//
// Geometry, as in aliens.test.ts: pad p04 is at (6, 5); the route runs down x = 4 from (4, 2) to (4, 8), where route
// progress is 4 + (y - 2) tiles. A 2.5-tile range from p04 covers y = 3.5 to 6.5 there.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alienBounty, parsePlanet, parseRuleset, waveBounty, type AuthoredWave, type Ruleset } from "../data/game-data";
import type { Placement, Snapshot } from "../rules";
import {
  battleSnapshot,
  bossPhaseAt,
  compileBattleConfig,
  createBattle,
  drainEvents,
  speedToUnitsPerTick,
  startWave,
  step,
  UNITS_PER_TILE,
  type AlienState,
  type Battle,
  type BattleConfig,
  type BattleEvent,
  type BossStats,
} from "./index";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(join(REPO, path), "utf8")) as Record<string, unknown>;
const R3_RAW = readJson("game-data/ruleset/r3.json");
const r3 = parseRuleset(R3_RAW);
const PLANET_RAW = readJson("game-data/campaign/luna-1-c1.json");
const SEED = "5eed5eed5eed5eed";

// The simulator's five boss waves (C8.2 rows 10, 20, 30, 40, 50), as authored waves. They are not game data yet: the
// 50-wave campaign arrives in a planet document in Phase 50. Reading them from tools/sim keeps the two models on the
// same waves.
// oxlint-disable-next-line typescript/no-explicit-any
const SIM: any = readJson("tools/sim/game_data.json");
// oxlint-disable-next-line typescript/no-explicit-any
const BOSS_WAVES: AuthoredWave[] = SIM.waves.filter((w: any) => w.boss !== null).map((w: any) => ({ wave: w.wave, groups: w.groups, hpMult: w.hpMult, speedMult: w.speedMult }));

/** A one-alien wave that keeps the battle running; the tests put their own aliens on the route. */
const QUIET_WAVE: AuthoredWave = { wave: 1, groups: [{ type: "blob", count: 1, at: 0, gap: 0 }], hpMult: 1, speedMult: 1 };

/** A test-only planet on Moonbeam Colony with these waves in a CHALLENGE wave set "bosses", every class, every pad open. */
function testConfig(ruleset: Ruleset, waves: readonly AuthoredWave[]): BattleConfig {
  const doc = structuredClone(PLANET_RAW);
  doc["waves"] = waves;
  doc["waveSets"] = {
    bosses: {
      mode: "CHALLENGE",
      name: "Bosses",
      waves: waves.map((w) => w.wave),
      meteorAfter: [],
      startCredits: 150,
      colonyHealth: 20,
      classes: Object.keys(ruleset.classes),
      padsOpenAsForWave: 26,
      presetPlacements: [],
    },
  };
  return compileBattleConfig(ruleset, parsePlanet(doc, ruleset), "bosses");
}

const config = testConfig(r3, [QUIET_WAVE]);

/** Route progress (units) at height y on the x = 4 stretch beside p04. */
const at = (y: number): number => Math.round((4 + (y - 2)) * UNITS_PER_TILE);

function bossStats(id: string, cfg = config): BossStats {
  const boss = cfg.aliens[id]?.boss;
  if (boss === undefined || boss === null) throw new Error(`${id} is not a boss`);
  return boss;
}

/** An alien (or a boss) as spawn() makes it at hpMult 1, at height y. */
function alien(id: number, type: string, y: number, more: Partial<AlienState> = {}, cfg = config): AlienState {
  const s = cfg.aliens[type];
  if (s === undefined) throw new Error(`no alien ${type}`);
  return {
    id,
    type,
    hp: s.hp,
    maxHp: s.hp,
    progress: at(y),
    speed: s.boss?.phases[0]?.speed ?? speedToUnitsPerTick(s.speed),
    slowPct: 0,
    slowTicksLeft: 0,
    look: 0,
    bubbles: s.bubbles,
    depth: 0,
    cargo: s.children,
    phase: 0,
    ...more,
  };
}

function snapshot(placements: readonly Placement[], health = 20): Snapshot {
  return { credits: 10_000, placements: [...placements], colony: { health, shield: 0 }, powers: {} };
}

function place(padId: string, classId: string, level = 1, targeting: Placement["targeting"] = "FRONT"): Placement {
  return { padId, classId, level, targeting };
}

/** A running wave with these astronauts and exactly these aliens on the route (no scheduled spawns). */
function fight(placements: Placement[], aliens: AlienState[], cfg = config, health = 20): Battle {
  const battle = createBattle(cfg, snapshot(placements, health), 1, SEED);
  startWave(battle);
  battle.spawnIndex = cfg.waves[0]?.spawns.length ?? 0;
  battle.aliens = aliens;
  battle.nextAlienId = Math.max(0, ...aliens.map((a) => a.id)) + 1;
  return battle;
}

function runTo(battle: Battle, tick: number): BattleEvent[] {
  const events: BattleEvent[] = [];
  while (battle.status === "IN_WAVE" && battle.tick < tick) {
    step(battle);
    events.push(...drainEvents(battle));
  }
  return events;
}

const ofKind = <K extends BattleEvent["kind"]>(events: readonly BattleEvent[], kind: K) =>
  events.filter((e): e is Extract<BattleEvent, { kind: K }> => e.kind === kind);
const find = (battle: Battle, id: number): AlienState | undefined => battle.aliens.find((a) => a.id === id);
/** The alien with this id, which the test expects to be on the route. */
function get(battle: Battle, id: number): AlienState {
  const found = find(battle, id);
  if (found === undefined) throw new Error(`alien ${id} is not on the route`);
  return found;
}

// ---- the phase change: a pure function of health ----------------------------------------------------------------

describe("bossPhaseAt: a boss's phase is a pure function of its health (C7: from the moment health falls to or below)", () => {
  // Each boss's thresholds in health points (fromPct x maximum / 100), from C7's table.
  it.each([
    ["boss1", 450, [225]], // King Wobble: Wobble dash from 50%
    ["boss2", 1000, [600, 250]], // Captain Clank: 60%, 25%
    ["boss3", 2200, [1452, 726]], // Queen Bubbla: 66%, 33%
    ["boss4", 2300, [1725, 1150, 575]], // the Mothership: 75%, 50%, 25%
    ["boss5", 3600, [2520, 1440, 540]], // the Great Glorp: 70%, 40%, 15%
  ] as const)("%s (max %i): each phase begins exactly at its threshold, not one point above", (id, max, thresholds) => {
    const boss = bossStats(id);
    expect(config.aliens[id]?.hp).toBe(max);
    expect(bossPhaseAt(boss, max, max)).toBe(0);
    thresholds.forEach((hp, i) => {
      expect(bossPhaseAt(boss, hp + 1, max), `${hp + 1}`).toBe(i);
      expect(bossPhaseAt(boss, hp, max), `${hp}`).toBe(i + 1);
    });
    expect(bossPhaseAt(boss, 0, max)).toBe(thresholds.length);
  });

  it("never goes back as health falls, and depends on nothing but health (every health value, every boss)", () => {
    for (const id of ["boss1", "boss2", "boss3", "boss4", "boss5"]) {
      const boss = bossStats(id);
      const max = config.aliens[id]?.hp ?? 0;
      let last = 0;
      for (let hp = max; hp >= 0; hp -= 1) {
        const phase = bossPhaseAt(boss, hp, max);
        expect(phase).toBeGreaterThanOrEqual(last);
        expect(bossPhaseAt(boss, hp, max)).toBe(phase); // same health, same phase
        last = phase;
      }
    }
  });

  it("in a battle, the tick it happens on does not matter: the same damage gives the same phase at tick 0 or 5,000", () => {
    const phases = [0, 5000].map((tick) => {
      const battle = fight([place("p04", "orion", 3)], [alien(1, "boss1", 5, { hp: 226 + 89 })]);
      battle.tick = tick;
      battle.towers.forEach((t) => (t.readyTick = tick));
      step(battle); // Orion's 90 takes it from 315 to 225: exactly 50%
      return [find(battle, 1)?.hp, find(battle, 1)?.phase];
    });
    expect(phases).toEqual([
      [225, 1],
      [225, 1],
    ]);
  });
});

// ---- each boss's phases and actions -------------------------------------------------------------------------------

describe("King Wobble (C7): Royal stroll, then Wobble dash from 50% at x1.3", () => {
  it("arrives with its own 450 health (not x hpMult) at 0.5 tiles/s (not x speedMult); dashes at 0.65 tiles/s", () => {
    const cfg = testConfig(r3, [{ wave: 1, groups: [{ type: "boss1", count: 1, at: 0, gap: 0 }], hpMult: 3, speedMult: 1.5 }]);
    const battle = createBattle(cfg, snapshot([]), 1, SEED);
    startWave(battle);
    step(battle);
    expect(battle.aliens[0]).toMatchObject({ type: "boss1", hp: 450, maxHp: 450, speed: 500, phase: 0, bubbles: 0 });
    const boss = battle.aliens[0];
    if (boss === undefined) throw new Error("no boss");
    boss.hp = 226;
    boss.progress = at(5);
    battle.towers = [{ padId: "p04", classId: "nova", level: 1, targeting: "FRONT", readyTick: 0, lastShotTick: -1, lastShotAt: null }];
    const events = runTo(battle, 2);
    expect(boss).toMatchObject({ hp: 216, phase: 1, speed: 650 });
    expect(ofKind(events, "bossPhase")).toEqual([{ kind: "bossPhase", tick: 1, alienId: 1, type: "boss1", phase: 1, at: { x: 4 * UNITS_PER_TILE, y: 5 * UNITS_PER_TILE } }]);
  });
});

describe("Captain Clank (C7): armour 5, then 2 from 60% at x1.15, then 0 from 25% at x1.4", () => {
  it("a level-1 Nova (10) does 5, then 8, then 10; the speed follows the phase", () => {
    const dealt: number[] = [];
    for (const [hp, phase, speed] of [
      [1000, 0, 450],
      [600, 1, 517], // 0.45 x 1.15 = 0.5175 tiles/s: 517.5 units a tick, 517 after rounding (config.ts)
      [250, 2, 630],
    ] as const) {
      // Put the boss in the phase that health gives it, as advanceBossPhase would have.
      const battle = fight([place("p04", "nova", 1)], [alien(1, "boss2", 5, { hp, phase, speed })]);
      step(battle);
      dealt.push(hp - (find(battle, 1)?.hp ?? 0));
      expect(find(battle, 1)?.speed).toBe(speed);
    }
    expect(dealt).toEqual([5, 8, 10]);
  });

  it("the armour of the phase the hit lands in applies: the hit that cracks the shell loses 5, the next only 2", () => {
    const battle = fight([place("p04", "nova", 1)], [alien(1, "boss2", 5, { hp: 604 })]);
    step(battle); // 604 - 5 = 599: Cracked shell
    expect(find(battle, 1)).toMatchObject({ hp: 599, phase: 1, speed: 517 });
    runTo(battle, 61); // Nova level 1 fires every 60 ticks
    expect(find(battle, 1)?.hp).toBe(599 - 8);
  });

  it("one hit across two thresholds runs both phases, in order (C7)", () => {
    const battle = fight([place("p04", "orion", 3)], [alien(1, "boss2", 5, { hp: 330 })]);
    const events = runTo(battle, 1); // Orion 90 - armour 5 = 85: 330 -> 245, below 60% and 25%
    expect(ofKind(events, "bossPhase").map((e) => e.phase)).toEqual([1, 2]);
    expect(find(battle, 1)).toMatchObject({ hp: 245, phase: 2, speed: 630 });
  });
});

describe("Queen Bubbla (C7): 8 layers; at 66% and 33% 8 layers again and 1 layer for every alien within 2 tiles", () => {
  it("arrives with 8 layers: eight hits of any size pop them and leave health alone", () => {
    const battle = fight([place("p04", "orion", 3)], [alien(1, "boss3", 5)]);
    expect(find(battle, 1)?.bubbles).toBe(8);
    const events = runTo(battle, 7 * 144 + 1);
    expect(ofKind(events, "popped").map((e) => e.layersLeft)).toEqual([7, 6, 5, 4, 3, 2, 1, 0]);
    expect(find(battle, 1)?.hp).toBe(2200);
  });

  it("Bubble gift: her layers are set to 8, and every other live alien within 2 tiles of her gets at least 1", () => {
    // Orion on STRONG aims at her (the most health) whatever is further along.
    const battle = fight(
      [place("p04", "orion", 3, "STRONG")],
      [
        alien(1, "boss3", 5, { hp: 1452 + 90, bubbles: 0 }),
        alien(2, "blob", 3), // 2 tiles: gets a layer
        alien(3, "blob", 7.1), // 2.1 tiles: does not
        alien(4, "guard", 6), // already has 4 layers: keeps 4 ("raises to at least 1")
        alien(5, "mite", 6.5, { bubbles: 0 }),
      ],
    );
    const events = runTo(battle, 1);
    expect(find(battle, 1)).toMatchObject({ hp: 1452, phase: 1, bubbles: 8, speed: 450 });
    expect([2, 3, 4, 5].map((id) => find(battle, id)?.bubbles)).toEqual([1, 0, 4, 1]);
    expect(ofKind(events, "bubbleGift").map((e) => [e.alienId, e.layers])).toEqual([
      [2, 1],
      [5, 1],
    ]);
  });

  it("Bubble storm at 33%: the same again, and she speeds up to x1.15", () => {
    const battle = fight([place("p04", "orion", 3, "STRONG")], [alien(1, "boss3", 5, { hp: 726 + 90, bubbles: 0, phase: 1 }), alien(2, "blob", 5.5)]);
    runTo(battle, 1);
    expect(find(battle, 1)).toMatchObject({ hp: 726, phase: 2, bubbles: 8, speed: 517 });
    expect(find(battle, 2)?.bubbles).toBe(1);
  });

  it("a layer given by her is an ordinary layer: it absorbs one whole hit, then pops", () => {
    const battle = fight([place("p04", "nova", 1)], [alien(2, "blob", 5, { bubbles: 1 })]);
    step(battle);
    expect(find(battle, 2)).toMatchObject({ hp: 24, bubbles: 0 });
  });
});

describe("The Mothership (C7): armour 2; doors at 75%, 50%, 25% release Mites, Flutters, Shellbacks; 4 Moon Blobs when defeated", () => {
  it("each door releases its aliens at the ship's route position, the first on the next tick, then one every 15 ticks", () => {
    const battle = fight([place("p04", "orion", 3)], [alien(1, "boss4", 5, { hp: 1725 + 88 })]);
    step(battle); // 90 - armour 2 = 88: exactly 75%
    battle.towers = [];
    expect(battle.releases).toEqual([{ parentId: 1, progress: at(5), depth: 1, types: ["mite", "mite", "mite", "mite"], released: 0, nextTick: 1 }]);
    const events = runTo(battle, 60);
    expect(ofKind(events, "released").map((e) => [e.tick, e.type, e.parentId])).toEqual([
      [1, "mite", 1],
      [16, "mite", 1],
      [31, "mite", 1],
      [46, "mite", 1],
    ]);
  });

  it("released aliens are ordinary aliens of the wave: their health is x the wave's hpMult (C7)", () => {
    const cfg = testConfig(r3, [{ ...QUIET_WAVE, hpMult: 6 }]);
    const battle = fight([place("p04", "orion", 3)], [alien(1, "boss4", 5, { hp: 1150 + 88, phase: 1 }, cfg)], cfg);
    step(battle);
    battle.towers = [];
    runTo(battle, 2);
    expect(battle.aliens.find((a) => a.type === "flutter")).toMatchObject({ hp: 120, maxHp: 120, depth: 1 }); // 20 x 6
  });

  it("door three: armour 0, x1.2, 2 Shellbacks; defeated: 4 Moon Blobs; every release counted in the bounty", () => {
    const battle = fight([place("p04", "orion", 3)], [alien(1, "boss4", 5, { hp: 575 + 88, phase: 2 })]);
    step(battle);
    expect(find(battle, 1)).toMatchObject({ hp: 575, phase: 3, speed: 480 });
    battle.towers.forEach((t) => (t.readyTick = 0));
    get(battle, 1).hp = 90; // the next Orion shot (no armour now) defeats it
    const events = runTo(battle, 200);
    expect(ofKind(events, "defeated").filter((e) => e.type === "boss4").map((e) => e.bounty)).toEqual([125]);
    expect(
      ofKind(events, "released")
        .map((e) => e.type)
        .sort(),
    ).toEqual(["blob", "blob", "blob", "blob", "shell", "shell"]);
  });

  it("one killing hit from above 75% runs all three doors, then the defeat release: 14 aliens, nothing skipped (C7)", () => {
    // At 50 health (of 2300) and still in its first phase, as if every earlier hit had been absorbed: one Orion shot
    // (90 - armour 2) takes it past all three thresholds to 0.
    const battle = fight([place("p04", "orion", 3)], [alien(1, "boss4", 5, { hp: 50 })]);
    const events = runTo(battle, 1);
    expect(ofKind(events, "bossPhase").map((e) => e.phase)).toEqual([1, 2, 3]);
    expect(ofKind(events, "defeated").map((e) => e.type)).toEqual(["boss4"]);
    expect(battle.releases.map((r) => r.types.join(","))).toEqual([
      "mite,mite,mite,mite",
      "flutter,flutter,flutter,flutter",
      "shell,shell",
      "blob,blob,blob,blob",
    ]);
  });
});

describe("The Great Glorp (C7): armour 4; Bubbled at 70%; Cargo at 40%; Wobble dash at 15%", () => {
  it("each phase's armour, speed, layers and releases", () => {
    // Orion on STRONG keeps aiming at the Glorp after its releases come out ahead of it.
    const battle = fight([place("p04", "orion", 3, "STRONG")], [alien(1, "boss5", 5, { hp: 2520 + 86 })]);
    step(battle); // 90 - 4 = 86: exactly 70%
    expect(find(battle, 1)).toMatchObject({ hp: 2520, phase: 1, bubbles: 10, speed: 400 });
    expect(battle.releases.at(-1)?.types).toEqual(["swarm", "swarm", "swarm", "swarm", "swarm", "swarm"]);
    // Cargo: 2 Split Slimes and 4 Mites, x1.1.
    get(battle, 1).bubbles = 0;
    get(battle, 1).hp = 1440 + 90;
    battle.towers.forEach((t) => (t.readyTick = battle.tick));
    step(battle);
    expect(find(battle, 1)).toMatchObject({ hp: 1440, phase: 2, speed: 440 });
    expect(battle.releases.at(-1)?.types).toEqual(["slime", "slime", "mite", "mite", "mite", "mite"]);
    // Wobble dash: x1.35, no armour.
    get(battle, 1).hp = 540 + 90;
    battle.towers.forEach((t) => (t.readyTick = battle.tick));
    step(battle);
    expect(find(battle, 1)).toMatchObject({ hp: 540, phase: 3, speed: 540 });
  });

  it("a Split Slime it releases splits again: its Slimelets are generation 2, the deepest C6.4 allows", () => {
    const battle = fight([place("p04", "orion", 3)], [alien(1, "boss5", 5, { hp: 1440 + 90, phase: 1, bubbles: 0 })]);
    step(battle);
    battle.towers = [];
    runTo(battle, 3);
    const slime = battle.aliens.find((a) => a.type === "slime");
    if (slime === undefined) throw new Error("no Split Slime came out");
    expect(slime).toMatchObject({ depth: 1, cargo: [{ type: "slimelet", count: 2 }] });
    battle.towers = [{ padId: "p04", classId: "orion", level: 3, targeting: "FRONT", readyTick: battle.tick, lastShotTick: -1, lastShotAt: null }];
    slime.hp = 1;
    slime.progress = at(6.4); // furthest along: Orion's FRONT target
    const events = runTo(battle, battle.tick + 40);
    expect(ofKind(events, "released").filter((e) => e.type === "slimelet")).toHaveLength(2);
    expect(battle.aliens.filter((a) => a.type === "slimelet").map((a) => a.depth)).toEqual([2, 2]);
  });
});

// ---- support effects, heals and leaks on a boss ----------------------------------------------------------------------

describe("support effects and a boss (C7)", () => {
  it("slows work at half strength: Pip's 30% is 15% and 40% is 20% on a boss; an ordinary alien beside it gets 30%", () => {
    for (const [level, pct] of [
      [1, 15],
      [2, 20],
    ] as const) {
      const battle = fight([place("p04", "pip", level)], [alien(1, "boss1", 5), alien(2, "blob", 4)]);
      step(battle);
      expect(find(battle, 1)?.slowPct, `level ${level}`).toBe(pct);
    }
    const battle = fight([place("p04", "pip", 1)], [alien(1, "boss1", 4), alien(2, "blob", 5)]);
    step(battle);
    expect(find(battle, 2)?.slowPct).toBe(30);
  });

  it("a half-strength slow slows the boss's current phase speed: 650 x (100 - 20)% = 520 units a tick", () => {
    const battle = fight([place("p04", "pip", 2)], [alien(1, "boss1", 5, { hp: 200, phase: 1, speed: 650 })]);
    const before = find(battle, 1)?.progress ?? 0;
    step(battle);
    expect((find(battle, 1)?.progress ?? 0) - before).toBe(520);
  });

  it("Pip prefers an alien its slow would improve, judged at the boss's half strength (sim.py Game._eff_slow)", () => {
    // The boss already has 20% (Pip level 2's 40% halved): a level-2 Pip would not improve it, so it slows the blob.
    const battle = fight([place("p04", "pip", 2)], [alien(1, "boss1", 6, { slowPct: 20, slowTicksLeft: 200 }), alien(2, "blob", 4)]);
    step(battle);
    expect(find(battle, 2)?.slowPct).toBe(40);
  });

  it("a Patchling heals a boss (C6.1 'every other alien'), but a phase that has begun never ends", () => {
    const battle = fight([], [alien(1, "boss1", 5, { hp: 220, phase: 1, speed: 650 }), alien(2, "patch", 5.5)]);
    battle.tick = 180;
    step(battle);
    expect(find(battle, 1)).toMatchObject({ hp: 226, phase: 1, speed: 650 });
  });
});

describe("a boss that reaches the colony (C7)", () => {
  it("applies its leak damage, pays nothing, releases nothing more; what its phases released still comes out", () => {
    const L = config.route.length;
    const battle = fight([], [alien(1, "boss4", 5, { phase: 1, progress: L - 1 })], config, 20);
    // Its door-one Mites, queued before it leaked.
    battle.releases = [{ parentId: 1, progress: at(5), depth: 1, types: ["mite", "mite"], released: 0, nextTick: 1 }];
    const events = runTo(battle, 30);
    expect(ofKind(events, "leaked")).toEqual([{ kind: "leaked", tick: 0, alienId: 1, damage: 14 }]);
    expect(ofKind(events, "released").map((e) => e.type)).toEqual(["mite", "mite"]);
    expect(battle.stats.bounty).toBe(0);
    expect(battle.releases).toEqual([]);
  });

  it("the boss wave still completes, and completing it repairs 3, whether the boss was defeated or reached the colony", () => {
    const cfg = testConfig(r3, [{ wave: 1, groups: [{ type: "boss1", count: 1, at: 0, gap: 0 }], hpMult: 1, speedMult: 1 }]);
    const leaked = createBattle(cfg, snapshot([], 15), 1, SEED);
    startWave(leaked);
    const events = runTo(leaked, 100_000);
    expect(leaked.status).toBe("CLEARED");
    expect(ofKind(events, "leaked")).toHaveLength(1);
    expect(leaked.health).toBe(15 - 8 + 3);
    expect(ofKind(events, "repaired").map((e) => e.health)).toEqual([3]);
    // Never above the maximum; and an ordinary wave repairs nothing.
    const full = createBattle(cfg, snapshot([place("p02", "orion", 3), place("p04", "orion", 3), place("p05", "orion", 3), place("p09", "orion", 3)], 19), 1, SEED);
    startWave(full);
    runTo(full, 100_000);
    expect([full.status, full.stats.leaked, full.health]).toEqual(["CLEARED", 0, 20]);
    const plain = createBattle(config, snapshot([place("p02", "nova", 1)], 15), 1, SEED);
    startWave(plain);
    runTo(plain, 100_000);
    expect([plain.status, plain.health]).toEqual(["CLEARED", 15]);
  });
});

// ---- no boss state crosses a wave boundary ------------------------------------------------------------------------

describe("no boss state leaks between waves (spine S4, C2.5: one Battle per wave)", () => {
  const WAVES: AuthoredWave[] = [
    { wave: 1, groups: [{ type: "blob", count: 2, at: 0, gap: 1 }, { type: "boss3", count: 1, at: 2, gap: 0 }], hpMult: 1, speedMult: 1 },
    { wave: 2, groups: [{ type: "blob", count: 2, at: 0, gap: 1 }, { type: "boss3", count: 1, at: 2, gap: 0 }], hpMult: 1, speedMult: 1 },
  ];
  const cfg = testConfig(r3, WAVES);
  const BOARD = [place("p02", "orion", 3), place("p04", "juno", 3), place("p05", "nova", 3), place("p09", "orion", 3), place("p12", "orion", 3)];

  function play(battle: Battle): BattleEvent[] {
    startWave(battle);
    return runTo(battle, 100_000);
  }

  it("after a boss wave the snapshot holds only credits, placements, colony and powers; the next wave starts empty", () => {
    const configBefore = JSON.stringify(cfg);
    const first = createBattle(cfg, snapshot(BOARD), 1, SEED);
    const firstEvents = play(first);
    expect(ofKind(firstEvents, "bossPhase").length).toBeGreaterThan(0); // the boss really changed phase
    expect(first.status).toBe("CLEARED");
    const after = battleSnapshot(first);
    expect(Object.keys(after).sort()).toEqual(["colony", "credits", "placements", "powers"]);
    const second = createBattle(cfg, after, 2, SEED);
    expect([second.aliens, second.releases, second.tick, second.nextAlienId]).toEqual([[], [], 0, 1]);
    // The compiled configuration both battles share was only read: a phase never writes into the boss's stats.
    expect(JSON.stringify(cfg)).toBe(configBefore);
    // The same boss in the next wave starts in its first phase with its full layers and speed.
    startWave(second);
    runTo(second, 121);
    expect(second.aliens.find((a) => a.type === "boss3")).toMatchObject({ phase: 0, bubbles: 8, hp: 2200, speed: 450 });
  });

  it("the second wave plays exactly as it does from the same snapshot with no boss wave before it", () => {
    const first = createBattle(cfg, snapshot(BOARD), 1, SEED);
    play(first);
    const after = battleSnapshot(first);
    const following = play(createBattle(cfg, after, 2, SEED));
    const fresh = play(createBattle(testConfig(r3, WAVES), after, 2, SEED));
    expect(following).toEqual(fresh);
  });
});

// ---- the exit criterion: a baseline defence beats every boss, and both models agree ---------------------------------

/**
 * C17.4: no boss requires a class or a power. The baseline defence is the C17.4 "Nova only" board: what the
 * simulator's competent policy has built with every class but Nova removed, 0% learning and no powers, when each boss
 * wave starts (tools/sim/tune.py measure; margins 2.05 / 1.43 / 1.35 / 1.29 / 1.2, the C17.4 table). Nova is the
 * starting class, so a win with Nova alone shows that no boss needs any other class or any power.
 *
 * Each boss wave is played once with that board fixed (no purchases, no powers, colony health 20). The expected
 * numbers are the Python model's, and this simulation must give the same kills, leaks, bounty, shots, damage, health
 * and aliens. The wave's length may differ by one tick, for Queen Bubbla only: her storm speed is 0.45 x 1.15 =
 * 0.5175 tiles/s, 517.5 units a tick, which the Python model moves in floating point and this simulation rounds to
 * 517 (config.ts); rounding it to 518 instead makes Captain Clank's wave (same speed when cracked) one tick short.
 * To re-run the Python side: `python3 -B tools/sim/boss_baseline.py` from the repository root (about 15 s), which
 * derives the boards and plays the same waves at 60 Hz. Its output on 2026-11-17 (the "simulator unchanged" and
 * "C6.3 release times" runs are identical for every boss):
 *
 *   wave 10 King Wobble:     ticks 2268, defeated 9,  leaked [], bounty 82,  shots 77,  damage 722,  health 20
 *   wave 20 Captain Clank:   ticks 3630, defeated 9,  leaked [], bounty 97,  shots 237, damage 1612, health 20
 *   wave 30 Queen Bubbla:    ticks 4282, defeated 19, leaked [], bounty 126, shots 342, damage 3134, health 20
 *   wave 40 The Mothership:  ticks 4166, defeated 25, leaked [], bounty 195, shots 415, damage 5276, health 20
 *   wave 50 The Great Glorp: ticks 4356, defeated 29, leaked [], bounty 220, shots 564, damage 7858, health 20
 */
describe("a baseline defence (Nova alone, no powers) beats every boss, and the simulator agrees (C17.4)", () => {
  const cfg = testConfig(r3, BOSS_WAVES);
  const nova = (board: string): Placement[] =>
    board.split(" ").map((entry) => {
      const [pad = "", level = "1"] = entry.split(":");
      return place(pad, "nova", Number(level));
    });

  it.each([
    ["King Wobble", 1, "boss1", "p02:1 p03:1 p04:1 p05:1 p09:1 p12:1 p13:1 p16:1", { ticks: 2268, defeated: 9, leaked: [], bounty: 82, shots: 77, damage: 722, health: 20, spawned: 9 }],
    ["Captain Clank", 2, "boss2", "p02:1 p03:2 p04:2 p05:2 p06:1 p07:1 p08:2 p09:2 p11:2 p12:2 p13:2 p16:1", { ticks: 3630, defeated: 9, leaked: [], bounty: 97, shots: 237, damage: 1612, health: 20, spawned: 9 }],
    ["Queen Bubbla", 3, "boss3", "p01:2 p02:2 p03:2 p04:2 p05:2 p06:2 p07:2 p08:2 p09:2 p10:2 p11:2 p12:3 p13:2 p14:2 p15:2 p16:2", { ticks: 4282, defeated: 19, leaked: [], bounty: 126, shots: 342, damage: 3134, health: 20, spawned: 19 }],
    ["The Mothership", 4, "boss4", "p01:2 p02:3 p03:3 p04:3 p05:3 p06:2 p07:2 p08:2 p09:3 p10:3 p11:3 p12:3 p13:3 p14:2 p15:2 p16:3", { ticks: 4166, defeated: 25, leaked: [], bounty: 195, shots: 415, damage: 5276, health: 20, spawned: 25 }],
    ["The Great Glorp", 5, "boss5", "p01:3 p02:3 p03:3 p04:3 p05:3 p06:3 p07:3 p08:3 p09:3 p10:3 p11:3 p12:3 p13:3 p14:3 p15:3 p16:3", { ticks: 4356, defeated: 29, leaked: [], bounty: 220, shots: 564, damage: 7858, health: 20, spawned: 29 }],
  ] as const)("%s (wave set position %i): defeated with no leak, every phase seen, the Python model's numbers", (name, position, bossId, board, python) => {
    const battle = createBattle(cfg, snapshot(nova(board)), position, SEED);
    startWave(battle);
    const leaked: number[] = [];
    const phases: number[] = [];
    let bossDefeated = false;
    while (battle.status === "IN_WAVE") {
      if (battle.tick > 20_000) throw new Error("wave did not end");
      step(battle);
      for (const e of drainEvents(battle)) {
        if (e.kind === "leaked") leaked.push(e.alienId);
        if (e.kind === "bossPhase") phases.push(e.phase);
        if (e.kind === "defeated" && e.type === bossId) bossDefeated = true;
      }
    }
    // C17.4: the boss is defeated, nothing reaches the colony, and every phase of C7 happened on the way.
    expect(bossDefeated).toBe(true);
    expect(phases).toEqual(Array.from({ length: bossStats(bossId).phases.length - 1 }, (_, i) => i + 1));
    expect(battle.stats.bounty).toBe(waveBounty(r3, BOSS_WAVES[position - 1] as AuthoredWave));
    // Two models, one answer.
    const { ticks: pythonTicks, ...pythonRest } = python;
    expect({
      defeated: battle.stats.defeated,
      leaked,
      bounty: battle.stats.bounty,
      shots: battle.stats.shots,
      damage: battle.stats.damage,
      health: battle.health,
      spawned: battle.stats.spawned,
    }).toEqual(pythonRest);
    // The wave's length: the same tick, except Queen Bubbla's, one tick later here (the half unit explained above).
    expect(battle.tick - pythonTicks).toBe(name === "Queen Bubbla" ? 1 : 0);
  });

  it("every boss wave's bounty is the simulator's 'Total bounty available' (the boss with all it releases, C8.2)", () => {
    expect(BOSS_WAVES.map((w) => waveBounty(r3, w))).toEqual([82, 97, 126, 195, 220]);
    expect(alienBounty(r3, "boss5")).toBe(174);
  });
});

/**
 * The same boss waves with a mixed board of every class (support.test.ts's FULL board): Pip's level-3 slow on bosses
 * at half strength, Juno's blasts on bubbled and flying aliens, Sol's buff, Mira's shield, bosses that get through.
 * Colony health and maximum 200 (a test-only copy of r3) so every wave runs to its end. The expected numbers are the
 * "mixed board" lines of `python3 -B tools/sim/boss_baseline.py`; this simulation must give the same kills, the same
 * leaked aliens by id and in order, the same bounty, shots, damage, health, shield and tick count.
 *
 * Wave 40 agrees with the Python model run with C6.3's release times (its "C6.3 release times" line); unchanged, the
 * Python model does 3066 damage, not 3059, because it releases a door's second alien 14 ticks after the first, not 15
 * (ADR-0034 difference 1). Wave 50 is left out: there every event in this simulation comes one tick before the
 * Python model's (its float route progress, summed 1/60 s at a time, lands a hair short), and at tick 2846 that tick
 * puts one more Bubble Swarm inside a Juno blast, which changes the rest of the wave. That is the float rounding
 * Phases 25 and 26 found (support.test.ts, aliens.test.ts), not a boss rule: the Nova-only wave 50 above agrees.
 */
describe("whole boss waves with every class, scored by both models (tools/sim/sim.py at 60 Hz), agree", () => {
  const raw = structuredClone(R3_RAW);
  (raw["colony"] as Record<string, number>)["maxHealth"] = 200;
  const cfg = testConfig(parseRuleset(raw), BOSS_WAVES);
  const MIXED = [
    place("p02", "orion", 3, "STRONG"),
    place("p04", "pip", 3),
    place("p05", "nova", 2, "FAST"),
    place("p09", "juno", 2, "CROWD"),
    place("p12", "sol", 2),
    place("p16", "mira", 3),
  ];
  const seen = { bossSlowPcts: new Set<number>(), phases: 0, bossLeaks: 0 };
  it.each([
    ["King Wobble", 1, { ticks: 1873, bossDefeated: true, defeated: 9, leaked: [], bounty: 82, shots: 15, damage: 722, health: 200, shield: 4, spawned: 9 }],
    ["Captain Clank", 2, { ticks: 2245, bossDefeated: true, defeated: 9, leaked: [], bounty: 97, shots: 77, damage: 1612, health: 200, shield: 6, spawned: 9 }],
    ["Queen Bubbla", 3, { ticks: 6121, bossDefeated: false, defeated: 18, leaked: [3], bounty: 26, shots: 144, damage: 1835, health: 200, shield: 0, spawned: 19 }],
    ["The Mothership (C6.3 release times)", 4, { ticks: 6778, bossDefeated: false, defeated: 13, leaked: [8, 10, 11, 13, 12, 5], bounty: 30, shots: 138, damage: 3059, health: 200, shield: 0, spawned: 19 }],
  ] as const)("%s", (_name, position, python) => {
    const battle = createBattle(cfg, snapshot(MIXED, 200), position, SEED);
    startWave(battle);
    const leaked: number[] = [];
    let bossDefeated = false;
    while (battle.status === "IN_WAVE") {
      if (battle.tick > 20_000) throw new Error("wave did not end");
      step(battle);
      const boss = battle.aliens.find((a) => a.type.startsWith("boss"));
      if (boss !== undefined && boss.slowPct > 0) seen.bossSlowPcts.add(boss.slowPct);
      for (const e of drainEvents(battle)) {
        if (e.kind === "leaked") leaked.push(e.alienId);
        if (e.kind === "leaked" && e.damage >= 8) seen.bossLeaks += 1;
        if (e.kind === "bossPhase") seen.phases += 1;
        if (e.kind === "defeated" && e.type.startsWith("boss")) bossDefeated = true;
      }
    }
    expect({
      ticks: battle.tick,
      bossDefeated,
      defeated: battle.stats.defeated,
      leaked,
      bounty: battle.stats.bounty,
      shots: battle.stats.shots,
      damage: battle.stats.damage,
      health: battle.health,
      shield: battle.shield,
      spawned: battle.stats.spawned,
    }).toEqual(python);
  });

  it("between them, those waves slowed bosses (Pip level 3's 40% at half strength: 20%), changed phases, let bosses through", () => {
    expect([...seen.bossSlowPcts]).toEqual([20]);
    expect(seen.phases).toBeGreaterThan(0);
    expect(seen.bossLeaks).toBe(2);
  });
});

// ---- determinism ----------------------------------------------------------------------------------------------------

describe("a boss wave is deterministic: the same wave and board give the same events, tick for tick", () => {
  it.each([1, 2, 3, 4, 5])("boss wave %i, a mixed board with every class", (position) => {
    const cfg = testConfig(r3, BOSS_WAVES);
    const BOARD = [
      place("p02", "orion", 3, "STRONG"),
      place("p04", "pip", 3),
      place("p05", "nova", 2, "FAST"),
      place("p09", "juno", 2, "CROWD"),
      place("p12", "sol", 2),
      place("p16", "mira", 3),
    ];
    const run = () => {
      const battle = createBattle(cfg, snapshot(BOARD, 20), position, SEED);
      startWave(battle);
      const events = runTo(battle, 30_000);
      return { events, status: battle.status, tick: battle.tick, stats: { ...battle.stats } };
    };
    const a = run();
    expect(a.events.some((e) => e.kind === "bossPhase")).toBe(true);
    expect(run()).toEqual(a);
  });
});
