// Aliens, carriers and caps (Phase 26, M2-03): one test per trait (C6.1, C6.2), carrier and splitter releases (C6.3:
// counts, timing, positions, depth, order, wave completion) and the object caps (C6.4: what happens when a spawn or a
// release would pass a cap, exactly, and a stress wave that never passes one).
//
// Every alien number comes from game-data/ruleset/r3.json through compileBattleConfig. The literal numbers in
// expectations are C6.1's (Shellback armour 4, four bubble layers, Patchling 6 x hpMult every 3 s within 1.5 tiles,
// a Craft's 4 Moon Blobs, a Split Slime's 2 Slimelets) and C6.4's (60, 48, 24, 0.25 s = 15 ticks, depth 2).
//
// Geometry used throughout, as in support.test.ts: pad p04 is at (6, 5); the route runs down x = 4 from (4, 2) to
// (4, 8), where route progress is 4 + (y - 2) tiles. A 2.5-tile range from p04 covers y = 3.5 to 6.5 there.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alienBounty, parsePlanet, parseRuleset, waveBounty, type AuthoredWave, type ReleaseSpec, type Ruleset } from "../data/game-data";
import type { Placement, Snapshot } from "../rules";
import {
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
} from "./index";

const GAME_DATA = join(import.meta.dirname, "..", "..", "..", "..", "game-data");
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(join(GAME_DATA, path), "utf8")) as Record<string, unknown>;
const R3_RAW = readJson("ruleset/r3.json");
const r3 = parseRuleset(R3_RAW);
const PLANET_RAW = readJson("campaign/luna-1-c1.json");
const SEED = "5eed5eed5eed5eed";

/** A one-alien wave 1 that keeps the battle running; the tests put their own aliens on the route. */
const QUIET_WAVE: AuthoredWave = { wave: 1, groups: [{ type: "blob", count: 1, at: 0, gap: 0 }], hpMult: 1, speedMult: 1 };

/**
 * A test-only planet on Moonbeam Colony with these waves, in a CHALLENGE wave set "aliens" offering every class with
 * every pad open. Nothing here is game data.
 */
function testConfig(ruleset: Ruleset, waves: readonly AuthoredWave[] = [QUIET_WAVE]): BattleConfig {
  const doc = structuredClone(PLANET_RAW);
  doc["waves"] = waves;
  doc["waveSets"] = {
    aliens: {
      mode: "CHALLENGE",
      name: "Aliens",
      waves: waves.map((w) => w.wave),
      meteorAfter: [],
      startCredits: 150,
      colonyHealth: 20,
      classes: Object.keys(ruleset.classes),
      padsOpenAsForWave: 26,
      presetPlacements: [],
    },
  };
  return compileBattleConfig(ruleset, parsePlanet(doc, ruleset), "aliens");
}

/** r3 with some caps changed, so a cap can be reached with a handful of aliens. */
function withCaps(caps: Record<string, number>): Ruleset {
  const raw = structuredClone(R3_RAW);
  raw["caps"] = { ...(raw["caps"] as Record<string, number>), ...caps };
  return parseRuleset(raw);
}

const config = testConfig(r3);

/** Route progress (units) at height y on the x = 4 stretch beside p04. */
const at = (y: number): number => Math.round((4 + (y - 2)) * UNITS_PER_TILE);

/** An alien of `type` as spawn() would make it at hpMult 1 and speed x1, at height y. */
function alien(id: number, type: string, y: number, more: Partial<AlienState> = {}, cfg = config): AlienState {
  const s = cfg.aliens[type];
  if (s === undefined) throw new Error(`no alien ${type}`);
  return {
    id,
    type,
    hp: s.hp,
    maxHp: s.hp,
    progress: at(y),
    speed: speedToUnitsPerTick(s.speed),
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

function snapshot(placements: Placement[], health = 20): Snapshot {
  return { credits: 10_000, placements, colony: { health, shield: 0 }, powers: {} };
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

const hp = (battle: Battle, id: number): number | undefined => battle.aliens.find((a) => a.id === id)?.hp;
const ofKind = <K extends BattleEvent["kind"]>(events: readonly BattleEvent[], kind: K) =>
  events.filter((e): e is Extract<BattleEvent, { kind: K }> => e.kind === kind);

// ---- C6.1 / C6.2: one test per trait -----------------------------------------------------------------------------

describe("traits are data (C6.1): the simulation reads them from the ruleset, not from the alien's name", () => {
  it("every r3 alien's compiled traits are its ruleset traits", () => {
    for (const [id, a] of Object.entries(r3.aliens)) {
      const s = config.aliens[id];
      expect(
        {
          armour: s?.armour,
          bubbles: s?.bubbles,
          flying: s?.flying,
          cluster: s?.cluster,
          heals: s?.healer !== null,
          children: s?.children,
        },
        id,
      ).toEqual({
        armour: a.traits.armour ?? 0,
        bubbles: a.traits.bubbles ?? 0,
        flying: a.traits.flying === true,
        cluster: a.traits.cluster === true,
        heals: a.traits.healer !== undefined,
        children: a.traits.children ?? [],
      });
    }
    expect(config.healPeriodTicks).toBe(180); // Patchling's 3 s clock
  });

  it("a renamed alien keeps its behaviour: armour 4 on an alien called 'tank' works the same as on the Shellback", () => {
    const raw = structuredClone(R3_RAW);
    const aliens = raw["aliens"] as Record<string, unknown>;
    aliens["tank"] = { ...(aliens["shell"] as object), name: "Tank" };
    const cfg = testConfig(parseRuleset(raw));
    const battle = fight([place("p04", "nova")], [alien(1, "tank", 5, {}, cfg)], cfg);
    step(battle);
    expect(hp(battle, 1)).toBe(60 - 6);
  });
});

describe("armour (Shellback, armour 4): every hit loses 4 damage, but always does at least 1 (C2.2)", () => {
  it("a level-1 Nova (10) does 6; a level-3 Nova (16) does 12; a level-1 Pip (5) does 1", () => {
    for (const [classId, level, dealt] of [
      ["nova", 1, 6],
      ["nova", 3, 12],
      ["pip", 1, 1],
    ] as const) {
      const battle = fight([place("p04", classId, level)], [alien(1, "shell", 5)]);
      step(battle);
      expect(hp(battle, 1), `${classId} ${level}`).toBe(60 - dealt);
      expect(ofKind(drainEvents(battle), "shot")[0]?.damage).toBe(dealt);
    }
  });

  it("at least 1 lands, however thick the armour (armour 50 against Nova's 10)", () => {
    const raw = structuredClone(R3_RAW);
    ((raw["aliens"] as Record<string, Record<string, unknown>>)["shell"] as Record<string, unknown>)["traits"] = { armour: 50 };
    const cfg = testConfig(parseRuleset(raw));
    const battle = fight([place("p04", "nova")], [alien(1, "shell", 5, {}, cfg)], cfg);
    step(battle);
    expect(hp(battle, 1)).toBe(59);
  });
});

describe("bubble layers (Bubble Guard, 4): each layer absorbs one whole hit of any size, then pops; never comes back", () => {
  it("four hits pop four layers and leave health alone, even Orion's 90; the fifth lands", () => {
    const battle = fight([place("p04", "orion", 3)], [alien(1, "guard", 5, { hp: 1000, maxHp: 1000 })]);
    const events = runTo(battle, 4 * 144 + 1); // Orion fires every 2.4 s = 144 ticks: ticks 0, 144, 288, 432, 576
    expect(ofKind(events, "popped").map((e) => [e.tick, e.layersLeft])).toEqual([
      [0, 3],
      [144, 2],
      [288, 1],
      [432, 0],
    ]);
    expect(ofKind(events, "shot").map((e) => [e.tick, e.damage])).toEqual([[576, 90]]);
    expect(battle.aliens[0]).toMatchObject({ hp: 910, bubbles: 0 });
  });

  it("a blast pops one layer on every guard inside it, one hit each", () => {
    const battle = fight([place("p04", "juno", 3)], [alien(1, "guard", 5), alien(2, "guard", 5.5), alien(3, "blob", 5.2)]);
    step(battle); // Juno level 3: 26 damage, 1.4-tile blast
    expect(battle.aliens.map((a) => [a.id, a.bubbles, a.hp])).toEqual([
      [1, 3, 34],
      [2, 3, 34],
    ]); // the blob (24) had no layer and is defeated
  });

  it("slows still apply (C6.1): Pip's frost lands on a guard whose layer absorbs the damage", () => {
    const battle = fight([place("p04", "pip", 1)], [alien(1, "guard", 5)]);
    step(battle);
    expect(battle.aliens[0]).toMatchObject({ hp: 34, bubbles: 3, slowPct: 30 });
  });
});

describe("flying (Orbit Flutter): Juno's blast does half damage, rounded up; aimed shots are unaffected (C6.2)", () => {
  it("a level-1 Juno (16) does 8 to a flutter and 16 to a blob beside it; a Nova does its full 10", () => {
    const battle = fight([place("p04", "juno", 1)], [alien(1, "flutter", 5), alien(2, "blob", 5.2)]);
    step(battle);
    expect([hp(battle, 1), hp(battle, 2)]).toEqual([20 - 8, 24 - 16]);
    const nova = fight([place("p04", "nova", 1)], [alien(1, "flutter", 5)]);
    step(nova);
    expect(hp(nova, 1)).toBe(10);
  });

  it("C2.2 order: Sol's buff first, then the halving: (16 + 15%) = 18, halved = 9; an odd 19 would round up to 10", () => {
    const battle = fight([place("p04", "juno", 1), place("p03", "sol", 1)], [alien(1, "flutter", 5)]);
    step(battle);
    expect(hp(battle, 1)).toBe(20 - 9);
  });
});

describe("cluster (Bubble Swarm): each bubble is an ordinary alien with its own id, health and bounty (C6.1)", () => {
  it("a cluster of six spawns six aliens; one Nova shot pops one bubble; a blast pops several", () => {
    const cfg = testConfig(r3, [{ wave: 1, groups: [{ type: "swarm", count: 6, at: 0, gap: 0.1 }], hpMult: 1, speedMult: 1 }]);
    expect(cfg.aliens["swarm"]?.cluster).toBe(true);
    expect(cfg.waves[0]?.spawns.map((s) => s.tick)).toEqual([0, 6, 12, 18, 24, 30]);
    const swarm = (n: number) => Array.from({ length: n }, (_, i) => alien(i + 1, "swarm", 5 + i * 0.1, {}, cfg));
    const nova = fight([place("p04", "nova", 1)], swarm(6), cfg);
    step(nova);
    expect(ofKind(drainEvents(nova), "defeated").map((e) => [e.alienId, e.bounty])).toEqual([[6, 1]]);
    const juno = fight([place("p04", "juno", 1)], swarm(6), cfg);
    step(juno);
    expect(ofKind(drainEvents(juno), "defeated")).toHaveLength(6);
  });
});

describe("healer (Patchling): every 3 s, every OTHER alien within 1.5 tiles regains 6 x hpMult, once, never above its maximum", () => {
  /** A battle at the tick before a pulse, nothing firing, with these aliens. */
  function beforePulse(aliens: AlienState[], cfg = config): Battle {
    const battle = fight([], aliens, cfg);
    battle.tick = 179;
    return battle;
  }

  it("heals on the shared clock from wave start (ticks 180, 360, ...), not between", () => {
    const battle = beforePulse([alien(1, "patch", 5), alien(2, "blob", 5.5, { hp: 10 })]);
    step(battle); // tick 179: no pulse
    expect(hp(battle, 2)).toBe(10);
    step(battle); // tick 180
    expect(hp(battle, 2)).toBe(16);
    drainEvents(battle);
    const events = runTo(battle, 360);
    expect(ofKind(events, "healed")).toEqual([]);
    step(battle); // tick 360
    expect(hp(battle, 2)).toBe(22);
  });

  it("reaches 1.5 tiles and no further; never heals itself; heals another Patchling", () => {
    const battle = beforePulse([
      alien(1, "patch", 4, { hp: 5 }),
      alien(2, "blob", 5.5, { hp: 10 }), // 1.5 tiles: healed
      alien(3, "blob", 5.6, { hp: 10 }), // 1.6 tiles: not
      alien(4, "patch", 3, { hp: 5 }), // 1 tile from patch 1: healed by it; patch 1 is healed by patch 4
    ]);
    runTo(battle, 181);
    expect([hp(battle, 1), hp(battle, 2), hp(battle, 3), hp(battle, 4)]).toEqual([11, 16, 10, 11]);
  });

  it("near several Patchlings an alien is healed once, not once per Patchling", () => {
    const battle = beforePulse([alien(1, "patch", 4), alien(2, "patch", 4.5), alien(3, "patch", 5.5), alien(4, "blob", 5, { hp: 1 })]);
    const events = runTo(battle, 181);
    expect(hp(battle, 4)).toBe(7);
    expect(ofKind(events, "healed")).toEqual([{ kind: "healed", tick: 180, alienId: 4, health: 6 }]);
    expect(ofKind(events, "healPulse").map((e) => e.alienId)).toEqual([1, 2, 3]);
  });

  it("6 x the wave's hpMult, rounded (C2.2): hpMult 2.5 heals 15; never above the maximum", () => {
    const cfg = testConfig(r3, [{ ...QUIET_WAVE, hpMult: 2.5 }]);
    const battle = beforePulse([alien(1, "patch", 5, {}, cfg), alien(2, "blob", 5.5, { hp: 10, maxHp: 60 }, cfg), alien(3, "blob", 5.2, { hp: 55, maxHp: 60 }, cfg)], cfg);
    runTo(battle, 181);
    expect([hp(battle, 2), hp(battle, 3)]).toEqual([25, 60]);
    expect(battle.stats.healed).toBe(15 + 5);
  });

  it("no healer alive, no pulse", () => {
    const battle = beforePulse([alien(1, "blob", 5, { hp: 1 })]);
    expect(ofKind(runTo(battle, 181), "healPulse")).toEqual([]);
  });
});

// ---- C6.3 carriers and splitters ---------------------------------------------------------------------------------

describe("C6.3 carriers and splitters: releases when defeated", () => {
  /** Kill a one-health carrier at y = 5 with a level-1 Nova on tick 0, then take the towers away. */
  function killAt5(type: string, more: Partial<AlienState> = {}, cfg = config, others: AlienState[] = []): Battle {
    const battle = fight([place("p04", "nova", 1)], [alien(1, type, 5, { hp: 1, ...more }, cfg), ...others], cfg);
    step(battle);
    battle.towers = [];
    return battle;
  }

  it("Alien Craft: 4 Moon Blobs at its route progress, the first on the next tick, then one every 0.25 s (15 ticks)", () => {
    const battle = killAt5("craft");
    expect(battle.releases).toEqual([{ parentId: 1, progress: at(5), depth: 1, types: ["blob", "blob", "blob", "blob"], released: 0, nextTick: 1 }]);
    const ticks: number[] = [];
    while (battle.tick < 60) {
      step(battle);
      for (const e of ofKind(drainEvents(battle), "released")) {
        ticks.push(e.tick);
        // It appeared at the parent's defeat point this tick, then moved once (C2.3: releases in step 2, movement in 5).
        const child = battle.aliens.find((a) => a.id === e.alienId);
        expect(child).toMatchObject({ type: "blob", progress: at(5) + 1000, depth: 1, cargo: [], hp: 24 });
      }
    }
    expect(ticks).toEqual([1, 16, 31, 46]);
    expect(battle.aliens.map((a) => a.id)).toEqual([2, 3, 4, 5]); // new ids, in release order
    expect(battle.releases).toEqual([]);
    expect(battle.stats.released).toBe(4);
  });

  it("Split Slime: 2 Slimelets; Slimelets never split; bounties are separate lines (3, then 1 each)", () => {
    const battle = killAt5("slime");
    runTo(battle, 20);
    expect(battle.aliens.map((a) => [a.type, a.depth])).toEqual([
      ["slimelet", 1],
      ["slimelet", 1],
    ]);
    expect(battle.credits).toBe(10_000 + 3);
    battle.towers = [{ padId: "p04", classId: "orion", level: 3, targeting: "FRONT", readyTick: 0, lastShotTick: -1, lastShotAt: null }];
    battle.aliens.forEach((a) => (a.progress = at(5)));
    const events = runTo(battle, 200);
    expect(ofKind(events, "defeated").map((e) => [e.type, e.bounty])).toEqual([
      ["slimelet", 1],
      ["slimelet", 1],
    ]);
    expect(ofKind(events, "released")).toEqual([]); // a Slimelet releases nothing
    expect(battle.credits).toBe(10_000 + 3 + 1 + 1);
  });

  it("a wave may name a Craft's cargo (C6.3, wave 38: 6 Meteor Mites)", () => {
    const cfg = testConfig(r3, [
      { wave: 1, groups: [{ type: "craft", count: 1, at: 0, gap: 0, cargo: [{ type: "mite", count: 6 }] }], hpMult: 1, speedMult: 1 },
    ]);
    expect(cfg.waves[0]?.spawns[0]?.cargo).toEqual([{ type: "mite", count: 6 }]);
    const battle = createBattle(cfg, snapshot([]), 1, SEED);
    startWave(battle);
    step(battle); // tick 0: the craft spawns with the wave's cargo
    const craft = battle.aliens[0];
    if (craft === undefined) throw new Error("the craft did not spawn");
    expect(craft.cargo).toEqual([{ type: "mite", count: 6 }]);
    craft.hp = 1;
    craft.progress = at(5);
    battle.towers = [{ padId: "p04", classId: "nova", level: 1, targeting: "FRONT", readyTick: 0, lastShotTick: -1, lastShotAt: null }];
    step(battle);
    battle.towers = [];
    const events = runTo(battle, 100);
    expect(ofKind(events, "released").map((e) => [e.tick, e.type])).toEqual([
      [2, "mite"],
      [17, "mite"],
      [32, "mite"],
      [47, "mite"],
      [62, "mite"],
      [77, "mite"],
    ]);
  });

  it("a carrier or splitter that reaches the colony applies its own leak damage and releases nothing", () => {
    for (const [type, leak] of [
      ["craft", 4],
      ["slime", 2],
    ] as const) {
      const battle = fight([], [alien(1, type, 5, { progress: config.route.length - 1 })]);
      step(battle);
      expect([battle.status, battle.health, battle.releases, battle.stats.released], type).toEqual(["CLEARED", 20 - leak, [], 0]);
    }
  });

  it("the wave is complete only when the schedule is exhausted, no release is queued and no alien is active (AC-10)", () => {
    const battle = killAt5("craft");
    expect([battle.aliens.length, battle.releases.length, battle.status]).toEqual([0, 1, "IN_WAVE"]);
  });

  it("depth: a descendant is generation 1 and carries no cargo, so nothing ever goes deeper than C6.4 allows", () => {
    const battle = killAt5("craft");
    runTo(battle, 60);
    expect(battle.aliens.every((a) => a.depth === 1 && a.cargo.length === 0)).toBe(true);
    expect(config.caps.maxDescendantDepth).toBe(2);
  });

  it("release order is deterministic: parents in the order they were defeated (a blast: id order), one each per tick", () => {
    const battle = fight([place("p04", "juno", 3)], [alien(1, "craft", 5, { hp: 1 }), alien(2, "slime", 5.3, { hp: 1 })]);
    step(battle); // one blast defeats both, craft (id 1) first
    battle.towers = [];
    const events = runTo(battle, 60);
    expect(ofKind(events, "released").map((e) => [e.tick, e.parentId, e.alienId, e.type])).toEqual([
      [1, 1, 3, "blob"],
      [1, 2, 4, "slimelet"],
      [16, 1, 5, "blob"],
      [16, 2, 6, "slimelet"],
      [31, 1, 7, "blob"],
      [46, 1, 8, "blob"],
    ]);
  });
});

// ---- C6.4 object caps --------------------------------------------------------------------------------------------

describe("C6.4 caps: what happens when a spawn or a release would pass a cap", () => {
  it("scheduled spawns wait at the soft cap and are released in schedule order, at most one every 0.25 s, as room appears", () => {
    // Soft cap 4, ten blobs due at once, nothing firing: four come out on tick 0 and leak together on tick 2,399. Then
    // the waiting six trickle in one every 15 ticks until four are alive again; the last two wait for those to leak.
    const cfg = testConfig(withCaps({ maxActiveAliens: 6, scheduledSpawnSoftCap: 4 }), [
      { wave: 1, groups: [{ type: "blob", count: 10, at: 0, gap: 0 }], hpMult: 1, speedMult: 1 },
    ]);
    const battle = createBattle(cfg, snapshot([]), 1, SEED);
    startWave(battle);
    const spawnTicks: number[] = [];
    while (battle.status === "IN_WAVE") {
      const before = battle.nextAlienId;
      step(battle);
      for (let id = before; id < battle.nextAlienId; id += 1) spawnTicks.push(battle.tick - 1);
      expect(battle.aliens.length).toBeLessThanOrEqual(4);
    }
    expect(spawnTicks).toEqual([0, 0, 0, 0, 2400, 2415, 2430, 2445, 4800, 4815]);
    expect(battle.stats).toMatchObject({ spawned: 10, leaked: 10, deferredSpawns: 6, peakAliens: 4 });
  });

  it("a release waits at its parent's defeat point while maxActiveAliens are alive, and nothing is dropped", () => {
    // Hard cap 6. Four blobs that leak on tick 99, and a craft defeated on tick 0: its blobs come out on ticks 1 and 16
    // (6 alive), the third waits until the four leak, then comes out on tick 100 and the fourth a gap later.
    const cfg = testConfig(withCaps({ maxActiveAliens: 6, scheduledSpawnSoftCap: 4 }));
    const fillers = [1, 2, 3, 4].map((id) => alien(id + 1, "blob", 0, { progress: cfg.route.length - 100_000 }, cfg));
    const battle = fight([place("p04", "nova", 1)], [alien(1, "craft", 5, { hp: 1 }, cfg), ...fillers], cfg, 100);
    step(battle);
    battle.towers = [];
    const events: BattleEvent[] = [];
    while (battle.status === "IN_WAVE") {
      step(battle);
      events.push(...drainEvents(battle));
      expect(battle.aliens.length).toBeLessThanOrEqual(6);
    }
    expect(ofKind(events, "released").map((e) => e.tick)).toEqual([1, 16, 100, 115]);
    expect(battle.stats).toMatchObject({ released: 4, heldReleases: 1, peakAliens: 6 });
  });

  it("a release waits while maxLiveDescendants descendants are alive", () => {
    // Descendant cap 2: the craft's third and fourth blobs wait for the first two to leave (they leak on 1,980 and 1,995).
    const cfg = testConfig(withCaps({ maxLiveDescendants: 2 }));
    const battle = fight([place("p04", "nova", 1)], [alien(1, "craft", 5, { hp: 1 }, cfg)], cfg, 100);
    step(battle);
    battle.towers = [];
    const events: BattleEvent[] = [];
    while (battle.status === "IN_WAVE") {
      step(battle);
      events.push(...drainEvents(battle));
      expect(battle.aliens.filter((a) => a.depth > 0).length).toBeLessThanOrEqual(2);
    }
    expect(ofKind(events, "released").map((e) => e.tick)).toEqual([1, 16, 1981, 1996]);
    // Only the third was held by the cap: the fourth came out one release gap after it, as C6.3 spaces them anyway.
    expect(battle.stats).toMatchObject({ released: 4, heldReleases: 1, peakDescendants: 2, leaked: 4 });
  });

  it("descendants count towards the soft cap: a due spawn waits while released blobs fill it", () => {
    const cfg = testConfig(withCaps({ maxActiveAliens: 6, scheduledSpawnSoftCap: 2 }), [
      { wave: 1, groups: [{ type: "mite", count: 1, at: 0.5, gap: 0 }], hpMult: 1, speedMult: 1 },
    ]);
    const battle = fight([place("p04", "nova", 1)], [alien(1, "craft", 5, { hp: 1 }, cfg)], cfg, 100);
    battle.spawnIndex = 0;
    step(battle);
    battle.towers = [];
    runTo(battle, 40); // blobs at ticks 1 and 16: two alive, so the mite due on tick 30 waits
    expect([battle.spawnIndex, battle.aliens.map((a) => a.type)]).toEqual([0, ["blob", "blob", "blob"]]);
  });
});

// ---- the stress wave -----------------------------------------------------------------------------------------------

describe("stress wave: every alien, far more than the caps, and the caps are never passed", () => {
  // 240 scheduled aliens of every type, far above the soft cap: 40 Shellbacks fill the route first, with 35 Crafts
  // (10 carrying wave cargo) and 20 Split Slimes among them. Three level-3 Orions on STRONG pick the Crafts (120
  // health, the strongest on the route) and leave the Shellbacks and the released Moon Blobs alone, so carriers die
  // while the route is full: the soft cap, the hard cap and the descendant cap all bind. The colony has 1,000 health
  // so the wave runs to its end whatever leaks.
  const STRESS: AuthoredWave = {
    wave: 1,
    groups: [
      { type: "shell", count: 40, at: 0, gap: 0.1 },
      { type: "craft", count: 25, at: 0.05, gap: 0.4 },
      { type: "slime", count: 20, at: 0.15, gap: 0.5 },
      { type: "blob", count: 30, at: 3, gap: 0.1 },
      { type: "mite", count: 30, at: 4, gap: 0.15 },
      { type: "swarm", count: 40, at: 5, gap: 0.05 },
      { type: "flutter", count: 20, at: 6, gap: 0.2 },
      { type: "guard", count: 15, at: 7, gap: 0.3 },
      { type: "patch", count: 10, at: 8, gap: 0.5 },
      { type: "craft", count: 10, at: 9, gap: 0.3, cargo: [{ type: "flutter", count: 3 }, { type: "slimelet", count: 2 }] },
    ],
    hpMult: 1,
    speedMult: 1,
  };
  const cfg = testConfig(r3, [STRESS]);
  const BOARD = [place("p02", "orion", 3, "STRONG"), place("p04", "orion", 3, "STRONG"), place("p05", "orion", 3, "STRONG")];

  /** Run the wave, checking the caps after every tick; returns every event and what each alien was. */
  function run() {
    const battle = createBattle(cfg, snapshot(BOARD, 1000), 1, SEED);
    startWave(battle);
    const events: BattleEvent[] = [];
    const seen = new Map<number, { type: string; cargo: readonly ReleaseSpec[] }>();
    let worst = { aliens: 0, descendants: 0, depth: 0, scheduledWhileFull: 0, ticksAtHardCap: 0 };
    while (battle.status === "IN_WAVE") {
      if (battle.tick > 50_000) throw new Error("stress wave did not end");
      const before = battle.spawnIndex;
      const aliveBefore = battle.aliens.length;
      step(battle);
      // A scheduled spawn only enters while fewer than the soft cap are alive (descendants included).
      if (battle.spawnIndex > before && aliveBefore >= cfg.caps.scheduledSpawnSoftCap) worst.scheduledWhileFull += 1;
      const descendants = battle.aliens.filter((a) => a.depth > 0).length;
      worst = {
        aliens: Math.max(worst.aliens, battle.aliens.length),
        descendants: Math.max(worst.descendants, descendants),
        depth: Math.max(worst.depth, ...battle.aliens.map((a) => a.depth)),
        scheduledWhileFull: worst.scheduledWhileFull,
        ticksAtHardCap: worst.ticksAtHardCap + (battle.aliens.length === cfg.caps.maxActiveAliens ? 1 : 0),
      };
      for (const a of battle.aliens) seen.set(a.id, { type: a.type, cargo: a.cargo });
      events.push(...drainEvents(battle));
    }
    return { battle, events, seen, worst };
  }

  const { battle, events, seen, worst } = run();

  it("never more than 60 aliens, never more than 24 live descendants, never deeper than generation 2", () => {
    expect(worst.aliens).toBeLessThanOrEqual(60);
    expect(worst.descendants).toBeLessThanOrEqual(24);
    expect(worst.depth).toBeLessThanOrEqual(2);
    expect(worst.scheduledWhileFull).toBe(0);
    expect([battle.stats.peakAliens, battle.stats.peakDescendants]).toEqual([worst.aliens, worst.descendants]);
  });

  it("the caps were really reached: spawns were deferred, releases held, 60 alive and 24 descendants at the peak", () => {
    expect(battle.stats.peakAliens).toBe(60);
    expect(battle.stats.peakDescendants).toBe(24);
    expect(worst.ticksAtHardCap).toBeGreaterThan(0);
    expect(battle.stats.deferredSpawns).toBeGreaterThan(0);
    expect(battle.stats.heldReleases).toBeGreaterThan(0);
  });

  it("nothing is dropped or duplicated: every scheduled alien and every owed descendant entered, and each left once", () => {
    const scheduled = STRESS.groups.reduce((n, g) => n + g.count, 0);
    const owed = ofKind(events, "defeated").reduce((n, e) => n + (seen.get(e.alienId)?.cargo.reduce((m, r) => m + r.count, 0) ?? 0), 0);
    expect(battle.stats.spawned).toBe(scheduled + owed);
    expect(battle.stats.released).toBe(owed);
    expect(battle.stats.defeated + battle.stats.leaked).toBe(battle.stats.spawned);
    const gone = [...ofKind(events, "defeated"), ...ofKind(events, "leaked")].map((e) => e.alienId);
    expect(new Set(gone).size).toBe(gone.length);
    expect(battle.status).toBe("CLEARED");
  });

  it("the bounty on offer is a constant (C6.4): earned + what leaked aliens and their unreleased cargo were worth = waveBounty", () => {
    const leakedWorth = ofKind(events, "leaked").reduce((n, e) => {
      const a = seen.get(e.alienId);
      return n + (a === undefined ? 0 : alienBounty(r3, a.type, a.cargo));
    }, 0);
    expect(battle.stats.bounty + leakedWorth).toBe(waveBounty(r3, STRESS));
  });

  it("is deterministic: the same wave gives the same events, tick for tick", () => {
    const again = run();
    expect(again.events).toEqual(events);
    expect(again.battle.tick).toBe(battle.tick);
  });
});

// ---- two models, one answer ----------------------------------------------------------------------------------------

/**
 * Whole waves with every alien and trait (the Moon Blob to the Alien Craft with wave cargo), scored by both models.
 * The expected numbers are the Python model's (tools/sim/sim.py Game at tick_hz 60, the same boards, every pad open,
 * colony health 15, the waves of traitWave); this simulation must produce the same kills, the same leaked aliens by
 * id and in the same order, the same bounty, shots, damage, health, shield and number of aliens (descendants
 * included), and the same tick count.
 *
 * To re-run the Python side: as support.test.ts describes, with run_wave on the dict traitWave builds (pad IDs upper
 * case, boss None), wrapping Game._leak to record ids, and reading WaveStats kills, bounty, shots and spawned,
 * Game.dmg_total, health and shield.
 *
 * One rule differs (ADR-0034): the Python model queues a parent's k-th descendant at defeat time + k x 0.25 s, so the
 * first comes out on the next tick and the second only 14 ticks after it. C6.3 and this simulation release them one
 * full gap (15 ticks) apart, the first on the next tick. The first four waves agree either way. The last agrees with
 * the Python model run with C6.3's release times (Game._queue_release queuing at t + dt + k x gap); unchanged, the
 * Python model ends that wave 59 ticks sooner with 3 fewer shots, the same kills and bounty.
 *
 * Why these waves: in others the two models differ on a shot or two, and every difference traced is float arithmetic in
 * the Python model, as in Phase 25: a Pip slow counted down in float seconds lasts a tick longer, so an alien enters a
 * range one tick later; and two aliens at exactly equal progress (a Shellback and a Bubble Guard can meet at the same
 * unit) are told apart by rounding noise, where this simulation's tie-break picks the lower id.
 */
function traitWave(wave: number, hpMult: number, speedMult: number): AuthoredWave {
  return {
    wave,
    groups: [
      { type: "blob", count: 8, at: 0, gap: 1.1 },
      { type: "shell", count: 4, at: 3, gap: 2.3 },
      { type: "swarm", count: 10, at: 6, gap: 0.25 },
      { type: "flutter", count: 6, at: 9, gap: 0.9 },
      { type: "guard", count: 4, at: 12, gap: 1.7 },
      { type: "patch", count: 3, at: 14.5, gap: 2.05 },
      { type: "slime", count: 3, at: 16, gap: 2.95 },
      { type: "craft", count: 2, at: 20, gap: 5.35 },
      { type: "mite", count: 8, at: 22, gap: 0.6 },
      { type: "craft", count: 1, at: 26, gap: 0, cargo: [{ type: "flutter", count: 3 }] },
    ],
    hpMult,
    speedMult,
  };
}

describe("whole waves with every alien, scored by both models (tools/sim/sim.py at 60 Hz), agree", () => {
  const cfg = testConfig(r3, [traitWave(1, 3.5, 1.07), traitWave(2, 2, 1.03), traitWave(3, 3.5, 1.03), traitWave(4, 2.3, 1.07), traitWave(5, 2.3, 1.03)]);
  // Blasts on flying and bubbled aliens, Mira's shield and repair, Sol's buff.
  const BLAST = [
    place("p02", "orion", 3, "STRONG"),
    place("p04", "nova", 2, "FAST"),
    place("p05", "juno", 2, "CROWD"),
    place("p09", "juno", 3, "CROWD"),
    place("p12", "sol", 2),
    place("p16", "mira", 3),
  ];
  // Big single hits against armour and layers.
  const HEAVY = [
    place("p02", "nova", 3, "FAST"),
    place("p04", "nova", 1),
    place("p05", "juno", 3, "CROWD"),
    place("p09", "orion", 1),
    place("p12", "orion", 3, "STRONG"),
    place("p16", "sol", 3),
  ];
  // Support.test.ts's MIX board: Pip's slow on every kind of alien.
  const MIX = [
    place("p02", "nova", 3, "FAST"),
    place("p04", "pip", 1),
    place("p05", "juno", 3, "CROWD"),
    place("p09", "orion", 1),
    place("p12", "orion", 3, "STRONG"),
    place("p16", "sol", 3),
  ];
  const seen = { popped: 0, healed: 0, armoured: 0, flyingBlast: 0, released: new Set<string>() };
  it.each([
    ["blasts and Mira; hpMult 3.5, speed x1.07", BLAST, 1, { ticks: 4939, defeated: 43, leaked: [29, 41, 27, 30, 17, 33, 23, 54, 55, 56, 37, 39, 38], bounty: 131, shots: 142, damage: 5555, health: 5, shield: 0, spawned: 56 }],
    ["heavy hitters; hpMult 2, speed x1.03", HEAVY, 2, { ticks: 3626, defeated: 66, leaked: [], bounty: 202, shots: 161, damage: 3564, health: 15, shield: 0, spawned: 66 }],
    ["heavy hitters; hpMult 3.5, speed x1.03", HEAVY, 3, { ticks: 4665, defeated: 55, leaked: [50, 51, 17, 33, 23, 60, 61, 59, 54], bounty: 175, shots: 186, damage: 6002, health: 3, shield: 0, spawned: 64 }],
    ["heavy hitters; hpMult 2.3, speed x1.07", HEAVY, 4, { ticks: 4305, defeated: 66, leaked: [], bounty: 202, shots: 172, damage: 4075, health: 15, shield: 0, spawned: 66 }],
    ["Pip's slow; hpMult 2.3, speed x1.03 (C6.3 release times)", MIX, 5, { ticks: 4009, defeated: 66, leaked: [], bounty: 202, shots: 185, damage: 4121, health: 15, shield: 0, spawned: 66 }],
  ] as const)("%s", (_name, board, wave, python) => {
    const battle = createBattle(cfg, snapshot([...board], 15), wave, SEED);
    startWave(battle);
    const leaked: number[] = [];
    while (battle.status === "IN_WAVE") {
      if (battle.tick > 20_000) throw new Error("wave did not end");
      const types = new Map(battle.aliens.map((a) => [a.id, a.type]));
      step(battle);
      for (const e of drainEvents(battle)) {
        if (e.kind === "leaked") leaked.push(e.alienId);
        if (e.kind === "popped") seen.popped += 1;
        if (e.kind === "healed") seen.healed += 1;
        if (e.kind === "released") seen.released.add(e.type);
        const type = e.kind === "shot" ? (types.get(e.alienId) ?? battle.aliens.find((a) => a.id === e.alienId)?.type) : undefined;
        if (e.kind === "shot" && type === "shell" && e.damage < 10) seen.armoured += 1;
        if (e.kind === "shot" && type === "flutter" && e.padId === "p05") seen.flyingBlast += 1;
      }
    }
    expect({
      ticks: battle.tick,
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

  it("between them, those waves exercised every trait: layers, heals, armour, blasts on flyers, every kind of release", () => {
    expect(seen.popped).toBeGreaterThan(0);
    expect(seen.healed).toBeGreaterThan(0);
    expect(seen.armoured).toBeGreaterThan(0);
    expect(seen.flyingBlast).toBeGreaterThan(0);
    expect([...seen.released].sort()).toEqual(["blob", "flutter", "slimelet"]);
  });
});
