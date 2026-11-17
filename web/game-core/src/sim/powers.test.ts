// Meteor powers (Phase 28, M2-05; C10): each power's effect, how charges change (only a use takes one; nothing in a
// battle adds one), the inventory cap in its one place, refusals with a reason, the per-wave limits and the shared
// lockout, that none of it crosses a wave boundary (spine S4, C2.5), and whole boss waves with powers used on fixed
// ticks, scored by this simulation and by the Python simulator, agreeing.
//
// Every power number comes from game-data/ruleset/r3.json through compileBattleConfig. The literal numbers in
// expectations are C10's (Frost Pulse 50% for 6 s, bosses 25%; Comet Burst 50% of maximum health within 1.5 tiles,
// bosses 10%; Colony Shield 10 points up to 20; 2 charges of each at most, each once a wave, 3 s between any two) and
// C2's arithmetic (60 ticks per second, 60,000 units per tile).
//
// Geometry, as in aliens.test.ts and bosses.test.ts: the route runs down x = 4 from (4, 2) to (4, 8), where route
// progress is 4 + (y - 2) tiles, so two aliens on that stretch are |dy| tiles apart.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePlanet, parseRuleset, type AuthoredWave, type Ruleset } from "../data/game-data";
import { grantPowerCharge, reduce, type Placement, type RunState, type Snapshot } from "../rules";
import {
  battleSnapshot,
  checkCommand,
  compileBattleConfig,
  createBattle,
  drainEvents,
  giveCommand,
  speedToUnitsPerTick,
  startWave,
  step,
  UNITS_PER_TILE,
  type AlienState,
  type Battle,
  type BattleConfig,
  type BattleEvent,
  type Command,
} from "./index";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(join(REPO, path), "utf8")) as Record<string, unknown>;
const R2_RAW = readJson("game-data/ruleset/r2.json");
const R3_RAW = readJson("game-data/ruleset/r3.json");
const r3 = parseRuleset(R3_RAW);
const PLANET_RAW = readJson("game-data/campaign/luna-1-c1.json");
const SEED = "5eed5eed5eed5eed";

// oxlint-disable-next-line typescript/no-explicit-any
const SIM: any = readJson("tools/sim/game_data.json");
// oxlint-disable-next-line typescript/no-explicit-any
const BOSS_WAVES: AuthoredWave[] = SIM.waves.filter((w: any) => w.boss !== null).map((w: any) => ({ wave: w.wave, groups: w.groups, hpMult: w.hpMult, speedMult: w.speedMult }));

/** A one-alien wave that keeps the battle running; the tests put their own aliens on the route. */
const QUIET_WAVE: AuthoredWave = { wave: 1, groups: [{ type: "blob", count: 1, at: 0, gap: 0 }], hpMult: 1, speedMult: 1 };

/** A test-only planet with these waves in a CHALLENGE wave set "powers", every class, every pad open. */
function testConfig(ruleset: Ruleset, waves: readonly AuthoredWave[]): BattleConfig {
  const doc = structuredClone(PLANET_RAW);
  doc["waves"] = waves;
  doc["waveSets"] = {
    powers: {
      mode: "CHALLENGE",
      name: "Powers",
      waves: waves.map((w) => w.wave),
      meteorAfter: [],
      startCredits: 150,
      colonyHealth: 20,
      classes: Object.keys(ruleset.classes),
      padsOpenAsForWave: 26,
      presetPlacements: [],
    },
  };
  return compileBattleConfig(ruleset, parsePlanet(doc, ruleset), "powers");
}

const config = testConfig(r3, [QUIET_WAVE]);

const FROST = "frost-pulse";
const COMET = "comet-burst";
const SHIELD = "colony-shield";
const ALL_CHARGES = { [FROST]: 2, [COMET]: 2, [SHIELD]: 2 };

/** Route progress (units) at height y on the x = 4 stretch. */
const at = (y: number): number => Math.round((4 + (y - 2)) * UNITS_PER_TILE);
/** A Moon Blob a few ticks from the colony, so the wave ends soon after it (it leaks 1). */
const nearEnd = (id: number): AlienState => alien(id, "blob", 2, { progress: config.route.length - 3000 });

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

function snapshot(placements: readonly Placement[], powers: Snapshot["powers"] = ALL_CHARGES, health = 20, shield = 0): Snapshot {
  return { credits: 10_000, placements: [...placements], colony: { health, shield }, powers: { ...powers } };
}

const place = (padId: string, classId: string, level = 1, targeting: Placement["targeting"] = "FRONT"): Placement => ({ padId, classId, level, targeting });

/** A running wave with these astronauts, charges and exactly these aliens on the route (no scheduled spawns). */
function fight(aliens: AlienState[], powers: Snapshot["powers"] = ALL_CHARGES, placements: Placement[] = [], cfg = config): Battle {
  const battle = createBattle(cfg, snapshot(placements, powers), 1, SEED);
  startWave(battle);
  battle.spawnIndex = cfg.waves[0]?.spawns.length ?? 0;
  battle.aliens = aliens;
  battle.nextAlienId = Math.max(0, ...aliens.map((a) => a.id)) + 1;
  drainEvents(battle);
  return battle;
}

/** Give a usePower command and run the one tick it applies on (C2.3 step 1); the events of that tick. */
function use(battle: Battle, powerId: string, target?: number): BattleEvent[] {
  const command: Command = target === undefined ? { kind: "usePower", powerId } : { kind: "usePower", powerId, target };
  expect(giveCommand(battle, command)).toEqual({ ok: true }); // queued; the refusal, if any, comes as an event
  step(battle);
  return drainEvents(battle);
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
const rejected = (events: readonly BattleEvent[]) => ofKind(events, "rejected").map((e) => e.reason);
const find = (battle: Battle, id: number): AlienState | undefined => battle.aliens.find((a) => a.id === id);
function get(battle: Battle, id: number): AlienState {
  const found = find(battle, id);
  if (found === undefined) throw new Error(`alien ${id} is not on the route`);
  return found;
}

// ---- the compiled numbers -------------------------------------------------------------------------------------------

describe("the powers as the simulation reads them (C10, compiled from r3)", () => {
  it("effects in simulation units: 50% for 360 ticks; 1.5 tiles (90,000 units) and 50% / 10%; 10 points", () => {
    expect(config.powers).toEqual({
      [FROST]: { id: FROST, name: "Frost Pulse", effect: { kind: "slow", pct: 50, ticks: 360 } },
      [COMET]: { id: COMET, name: "Comet Burst", effect: { kind: "burst", radiusSq: 90_000 * 90_000, radiusTiles: 1.5, pct: 50, bossPct: 10 } },
      [SHIELD]: { id: SHIELD, name: "Colony Shield", effect: { kind: "shield", points: 10 } },
    });
  });

  it("use rules: each power once a wave; 3 s (180 ticks) between any two powers", () => {
    expect(config.powerRules).toEqual({ usesPerWave: 1, lockoutTicks: 180 });
  });

  it("a ruleset with no powers (r2) compiles to none, and to no uses at all", () => {
    const r2config = testConfig(parseRuleset(R2_RAW), [QUIET_WAVE]);
    expect(r2config.powers).toEqual({});
    expect(r2config.powerRules).toEqual({ usesPerWave: 0, lockoutTicks: 0 });
  });
});

// ---- Frost Pulse ----------------------------------------------------------------------------------------------------

describe("Frost Pulse (C10): every alien on the field slowed by 50% for 6 s, bosses 25%, under the C5.4 rules", () => {
  it("slows every live alien, wherever it is, on the tick it is used; a boss at half strength", () => {
    const battle = fight([alien(1, "blob", 2), alien(2, "flutter", 7.5), alien(3, "guard", 4), alien(4, "boss1", 5)]);
    battle.tick = 300;
    const events = use(battle, FROST);
    expect(ofKind(events, "power")).toEqual([{ kind: "power", tick: 300, powerId: FROST, effect: "slow", at: null, shield: 0 }]);
    // 360 ticks, one of them already spent moving on this tick (step 5 counts the slow down, as for Pip's).
    expect([1, 2, 3, 4].map((id) => [get(battle, id).slowPct, get(battle, id).slowTicksLeft])).toEqual([
      [50, 359],
      [50, 359],
      [50, 359],
      [25, 359],
    ]);
    // A bubble layer does not stop a slow (C5.4); the pulse is not a hit, so no layer pops.
    expect(get(battle, 3).bubbles).toBe(4);
  });

  it("slowed aliens move at half speed for 360 ticks, then at full speed", () => {
    const battle = fight([alien(1, "blob", 2)]);
    const speed = get(battle, 1).speed; // 1,000 units a tick
    use(battle, FROST);
    runTo(battle, 360);
    expect(get(battle, 1).progress).toBe(at(2) + 360 * Math.floor((speed * 50) / 100));
    expect(get(battle, 1).slowTicksLeft).toBe(0);
    step(battle);
    expect(get(battle, 1).progress).toBe(at(2) + 360 * 500 + speed);
  });

  it("an alien that arrives after the pulse is not slowed by it", () => {
    const battle = fight([alien(1, "blob", 2)]);
    use(battle, FROST);
    battle.aliens.push(alien(2, "blob", 2));
    step(battle);
    expect(get(battle, 2).slowPct).toBe(0);
  });

  it("the strongest-slow rule: a weaker slow is replaced and the longer time kept; an equal slow keeps the longer time", () => {
    const battle = fight([
      alien(1, "blob", 2, { slowPct: 40, slowTicksLeft: 200 }), // Pip level 2's 40%: weaker, replaced; 360 > 200
      alien(2, "blob", 3, { slowPct: 50, slowTicksLeft: 500 }), // already at 50% with longer left: kept at 500
      alien(3, "boss1", 4, { slowPct: 20, slowTicksLeft: 100 }), // Pip's 40% on a boss is 20%: the pulse's 25% replaces it
    ]);
    use(battle, FROST);
    expect([1, 2, 3].map((id) => [get(battle, id).slowPct, get(battle, id).slowTicksLeft])).toEqual([
      [50, 359],
      [50, 499],
      [25, 359],
    ]);
  });

  it("the cap holds: a pulse stronger than the ruleset's 50% cap slows by 50% (and a boss by its half, under the cap)", () => {
    const raw = structuredClone(R3_RAW);
    ((raw["powers"] as Record<string, Record<string, number>>)[FROST] as Record<string, number>)["slowPct"] = 80;
    const cfg = testConfig(parseRuleset(raw), [QUIET_WAVE]);
    const battle = fight([alien(1, "blob", 2, {}, cfg), alien(2, "boss2", 4, {}, cfg)], ALL_CHARGES, [], cfg);
    use(battle, FROST);
    expect([get(battle, 1).slowPct, get(battle, 2).slowPct]).toEqual([50, 40]);
  });
});

// ---- Comet Burst ----------------------------------------------------------------------------------------------------

describe("Comet Burst (C10): within 1.5 tiles of a route point, 50% of maximum health (bosses 10%), ignoring armour and bubbles", () => {
  it("hits every alien within 1.5 tiles of the point, and nothing further; the share of MAXIMUM health, rounded up", () => {
    const battle = fight([
      alien(1, "blob", 5, { hp: 20 }), // max 24: loses 12 whatever its health now
      alien(2, "blob", 6.5), // exactly 1.5 tiles away: inside
      alien(3, "blob", 6.51), // just outside
      alien(4, "flutter", 3.6), // flying: hit in full (C2.2 halves only Juno's blast)
    ]);
    battle.tick = 200;
    const events = use(battle, COMET, at(5));
    expect(ofKind(events, "power")).toEqual([
      { kind: "power", tick: 200, powerId: COMET, effect: "burst", at: { x: 4 * UNITS_PER_TILE, y: 5 * UNITS_PER_TILE }, shield: 0 },
    ]);
    expect(ofKind(events, "burst")).toEqual([
      { kind: "burst", tick: 200, alienId: 1, damage: 12 },
      { kind: "burst", tick: 200, alienId: 2, damage: 12 },
      { kind: "burst", tick: 200, alienId: 4, damage: 10 },
    ]);
    expect([1, 2, 3, 4].map((id) => get(battle, id).hp)).toEqual([8, 12, 24, 10]);
    expect(battle.stats.powerDamage).toBe(34);
    expect(battle.stats.damage).toBe(0); // shots only
  });

  it("armour does not apply, and bubble layers neither absorb it nor pop", () => {
    const battle = fight([alien(1, "shell", 5), alien(2, "guard", 5.5)]);
    use(battle, COMET, at(5));
    // Shellback 60 -> 30 (armour 4 ignored); Bubble Guard 34 -> 17 with all 4 layers left.
    expect([get(battle, 1).hp, get(battle, 2).hp, get(battle, 2).bubbles]).toEqual([30, 17, 4]);
  });

  it("an alien brought to zero is defeated, pays its normal bounty, and a carrier releases its cargo (C6.3)", () => {
    const battle = fight([alien(1, "blob", 5, { hp: 12 }), alien(2, "craft", 5, { hp: 1 })]);
    const credits = battle.credits;
    const events = use(battle, COMET, at(5));
    expect(ofKind(events, "defeated").map((e) => [e.alienId, e.bounty])).toEqual([
      [1, config.aliens["blob"]?.bounty],
      [2, config.aliens["craft"]?.bounty],
    ]);
    expect(battle.credits - credits).toBe((config.aliens["blob"]?.bounty ?? 0) + (config.aliens["craft"]?.bounty ?? 0));
    // Gone before this tick's spawns and movement; the craft's four blobs come out from the next tick (C6.3).
    expect(battle.aliens).toEqual([]);
    expect(battle.releases).toHaveLength(1);
    step(battle); // the first blob comes out where the craft was (step 2) and walks its first tick (step 5)
    expect(battle.aliens.map((a) => [a.type, a.progress])).toEqual([["blob", at(5) + 1000]]);
  });

  it("a boss loses 10% of its maximum, and enters the phase that takes it to (C7: before the defeat check)", () => {
    // King Wobble, 450: 10% is 45. From 270 to 225 is exactly 50%: Wobble dash.
    const battle = fight([alien(1, "boss1", 5, { hp: 270 })]);
    const events = use(battle, COMET, at(5));
    expect(ofKind(events, "burst")).toEqual([{ kind: "burst", tick: 0, alienId: 1, damage: 45 }]);
    expect(ofKind(events, "bossPhase").map((e) => e.phase)).toEqual([1]);
    expect([get(battle, 1).hp, get(battle, 1).phase]).toEqual([225, 1]);
    // Queen Bubbla's eight layers do not stop it either, and she keeps all eight: 2,200 -> 1,980.
    const bubbla = fight([alien(1, "boss3", 5)]);
    use(bubbla, COMET, at(5));
    expect([get(bubbla, 1).hp, get(bubbla, 1).bubbles]).toEqual([1980, 8]);
  });

  it("needs a point on the route: none, a fraction, or beyond either end is BAD_TARGET, and the charge is kept", () => {
    for (const target of [undefined, 1.5, -1, config.route.length + 1]) {
      const battle = fight([alien(1, "blob", 5)]);
      expect(rejected(use(battle, COMET, target)), String(target)).toEqual(["BAD_TARGET"]);
      expect(battle.powers[COMET]).toBe(2);
    }
    // Both ends are points on the route.
    for (const target of [0, config.route.length]) {
      const battle = fight([alien(1, "blob", 5)]);
      expect(rejected(use(battle, COMET, target))).toEqual([]);
      expect(battle.powers[COMET]).toBe(1);
    }
  });
});

// ---- Colony Shield --------------------------------------------------------------------------------------------------

describe("Colony Shield (C10): 10 points at once, above the cap of 10 up to the absolute cap of 20, trimmed when the wave ends", () => {
  it.each([
    [0, 10],
    [6, 16],
    [10, 20],
    [15, 20],
  ])("from %i the shield goes to %i", (start, end) => {
    const battle = fight([alien(1, "blob", 2)]);
    battle.shield = start;
    const events = use(battle, SHIELD);
    expect(battle.shield).toBe(end);
    expect(ofKind(events, "power")).toEqual([{ kind: "power", tick: 0, powerId: SHIELD, effect: "shield", at: null, shield: end - start }]);
  });

  it("Mira's pulses neither raise nor cut a shield above 10; a leak takes points off it; the wave's end trims it to 10", () => {
    const battle = fight([nearEnd(1)], ALL_CHARGES, [place("p16", "mira", 3)]);
    battle.shield = 6;
    use(battle, SHIELD); // 16
    expect(battle.shield).toBe(16);
    runTo(battle, 1000); // the blob leaks (1 point: 15) and the wave is cleared
    expect(battle.status).toBe("CLEARED");
    expect(battle.stats.leaked).toBe(1);
    expect(battle.shield).toBe(10);
    expect(battleSnapshot(battle).colony.shield).toBe(10);
  });
});

// ---- charges, the cap, refusals -------------------------------------------------------------------------------------

describe("charges (C10, spine S3.2): only a use takes one, nothing in a battle adds one, and the cap lives in one place", () => {
  it("a use takes exactly one charge of that power and no other; the snapshot after the wave holds what is left", () => {
    const battle = fight([nearEnd(1)]);
    use(battle, FROST);
    expect(battle.powers).toEqual({ [FROST]: 1, [COMET]: 2, [SHIELD]: 2 });
    runTo(battle, 1000);
    expect(battleSnapshot(battle).powers).toEqual({ [FROST]: 1, [COMET]: 2, [SHIELD]: 2 });
  });

  it("a refused use takes nothing: no charge, no lockout, no use counted", () => {
    const battle = fight([alien(1, "blob", 5)], { [FROST]: 1 });
    expect(rejected(use(battle, COMET, at(5)))).toEqual(["NO_CHARGE"]);
    expect(rejected(use(battle, "laser-storm"))).toEqual(["UNKNOWN_POWER"]);
    expect([battle.powers, battle.powerUses, battle.powerReadyTick]).toEqual([{ [FROST]: 1 }, {}, 0]);
    expect(rejected(use(battle, FROST))).toEqual([]); // so the frost is still allowed at once
  });

  it("with no charge the use is refused with a reason (NO_CHARGE), the last charge spent included", () => {
    const battle = fight([alien(1, "blob", 2)], { [SHIELD]: 1 });
    use(battle, SHIELD);
    expect(battle.powers[SHIELD]).toBe(0);
    // A new wave from that snapshot: the count is 0, so the shield is refused, with a reason, and stays at 0.
    const next = createBattle(config, battleSnapshotAfter(battle), 1, SEED);
    startWave(next);
    expect(rejected(use(next, SHIELD))).toEqual(["NO_CHARGE"]);
    expect(next.powers[SHIELD]).toBe(0);
  });

  it("checkCommand says the same as the tick would, and changes nothing (the HUD can grey a button with it)", () => {
    const battle = fight([alien(1, "blob", 5)], { [FROST]: 1 });
    expect(checkCommand(battle, { kind: "usePower", powerId: FROST })).toEqual({ ok: true });
    expect(checkCommand(battle, { kind: "usePower", powerId: COMET, target: at(5) })).toEqual({ ok: false, reason: "NO_CHARGE" });
    expect(battle.powers).toEqual({ [FROST]: 1 });
  });

  it("powers are used during a wave only: in preparation and after the wave the use is refused (NOT_NOW), charges kept", () => {
    const battle = createBattle(config, snapshot([]), 1, SEED);
    expect(giveCommand(battle, { kind: "usePower", powerId: SHIELD })).toEqual({ ok: false, reason: "NOT_NOW" });
    expect([battle.shield, battle.powers[SHIELD]]).toEqual([0, 2]);
    startWave(battle);
    runTo(battle, 10_000);
    expect(battle.status).toBe("CLEARED");
    expect(giveCommand(battle, { kind: "usePower", powerId: SHIELD })).toEqual({ ok: false, reason: "NOT_NOW" });
    expect(battleSnapshot(battle).powers[SHIELD]).toBe(2);
  });

  it("a ruleset with no powers refuses every use as UNKNOWN_POWER (mechanics 1 and 2: the live game is unchanged)", () => {
    const r2config = testConfig(parseRuleset(R2_RAW), [QUIET_WAVE]);
    const battle = fight([alien(1, "blob", 5, {}, r2config)], ALL_CHARGES, [], r2config);
    for (const id of [FROST, COMET, SHIELD]) expect(rejected(use(battle, id, at(5)))).toEqual(["UNKNOWN_POWER"]);
    expect(battle.powers).toEqual(ALL_CHARGES);
  });

  it("over a whole boss wave with every use tried every tick, no count ever goes up", () => {
    const cfg = testConfig(r3, BOSS_WAVES);
    const battle = createBattle(cfg, snapshot([place("p04", "nova", 3), place("p05", "nova", 3)], { [FROST]: 2, [COMET]: 1 }, 200), 2, SEED);
    startWave(battle);
    let last = { ...battle.powers };
    while (battle.status === "IN_WAVE" && battle.tick < 20_000) {
      for (const id of [FROST, COMET, SHIELD]) giveCommand(battle, { kind: "usePower", powerId: id, target: battle.aliens[0]?.progress ?? 0 });
      step(battle);
      for (const id of Object.keys(battle.powers)) expect(battle.powers[id] ?? 0).toBeLessThanOrEqual(last[id] ?? 0);
      last = { ...battle.powers };
    }
    // Each power once in the wave: one frost and one comet were spent; no shield was held, none was used.
    expect(battle.powers).toEqual({ [FROST]: 1, [COMET]: 0 });
  });

  it("the cap is grantPowerCharge's (the reducer's grant): +1 below the cap, nothing at it", () => {
    const cap = r3.powerRules.inventoryCapPerPower;
    expect(cap).toBe(2);
    expect(grantPowerCharge({}, FROST, cap)).toEqual({ [FROST]: 1 });
    expect(grantPowerCharge({ [FROST]: 1 }, FROST, cap)).toEqual({ [FROST]: 2 });
    const full = { [FROST]: 2, [COMET]: 1 };
    expect(grantPowerCharge(full, FROST, cap)).toBe(full); // unchanged, the same object
  });

  it("the reducer's meteor grant goes through it: a success at the cap is SUCCEEDED with no charge added (spine S3.2)", () => {
    const state: RunState = {
      mode: "CAMPAIGN",
      status: "IN_PROGRESS",
      stage: "AUTHORED",
      phase: "METEOR",
      wave: 10,
      finalWave: 50,
      highestCompletedWave: 9,
      campaignCompleted: false,
      plannedThrough: 49,
      revision: 3,
      powerChargeCap: 2,
      snapshot: snapshot([], { [FROST]: 2 }),
      slots: [
        { slotId: "N-009", kind: "NORMAL", status: "SUCCEEDED", attempts: [], accepted: ["a"], withdrawn: false, reward: { credits: 30 } },
        { slotId: "M-009", kind: "METEOR", status: "UNRESOLVED", attempts: [], accepted: ["ship"], withdrawn: false, reward: { credits: 0, powerId: FROST } },
      ],
    };
    const op = { opId: "00000000-0000-4000-8000-000000000001", expectedRevision: 3, type: "SUBMIT_ATTEMPT", payload: { slotId: "M-009", answer: "ship" }, clientTime: "2026-01-01T00:00:00Z" };
    const result = reduce(state, op);
    expect(result.result).toBe("APPLIED");
    if (result.result !== "APPLIED") return;
    expect(result.state.slots[1]?.status).toBe("SUCCEEDED");
    expect(result.state.snapshot?.powers).toEqual({ [FROST]: 2 });
    const below = reduce({ ...state, snapshot: snapshot([], { [FROST]: 1 }) }, op);
    expect(below.result === "APPLIED" ? below.state.snapshot?.powers : null).toEqual({ [FROST]: 2 });
  });

  it("battle.ts only ever takes a charge away: its one write to a count is a minus one", () => {
    const source = readFileSync(join(import.meta.dirname, "battle.ts"), "utf8");
    const writes = [...source.matchAll(/battle\.powers\[[^\]]+\]\s*=[^;]*;/g)].map((m) => m[0]);
    expect(writes).toEqual(["battle.powers[power.id] = (battle.powers[power.id] ?? 0) - 1;"]);
  });
});

/** The snapshot a cleared wave hands on; this test's battle is still running, so it is ended by hand first. */
function battleSnapshotAfter(battle: Battle): Snapshot {
  battle.aliens = [];
  runTo(battle, battle.tick + 1);
  return battleSnapshot(battle);
}

// ---- per-wave limits and the lockout --------------------------------------------------------------------------------

describe("each power once a wave, and 3 s between any two (C10)", () => {
  it("a second use of the same power in the wave is refused (POWER_USED_THIS_WAVE), even with a charge left", () => {
    const battle = fight([alien(1, "blob", 2)]);
    use(battle, FROST);
    runTo(battle, 1000);
    expect(rejected(use(battle, FROST))).toEqual(["POWER_USED_THIS_WAVE"]);
    expect(battle.powers[FROST]).toBe(1);
  });

  it("another power is refused for 180 ticks after any power (POWER_LOCKED), and allowed on the 180th", () => {
    const battle = fight([alien(1, "blob", 2)]);
    battle.tick = 100;
    use(battle, SHIELD); // tick 100: next power from tick 280
    runTo(battle, 279);
    expect(rejected(use(battle, FROST))).toEqual(["POWER_LOCKED"]); // tick 279
    expect(rejected(use(battle, FROST))).toEqual([]); // tick 280
    expect(battle.powerReadyTick).toBe(460);
  });

  it("two powers queued for the same tick: the first is used, the second refused by the lockout (arrival order, C2.3)", () => {
    const battle = fight([alien(1, "blob", 2)]);
    giveCommand(battle, { kind: "usePower", powerId: SHIELD });
    giveCommand(battle, { kind: "usePower", powerId: FROST });
    step(battle);
    const events = drainEvents(battle);
    expect(ofKind(events, "power").map((e) => e.powerId)).toEqual([SHIELD]);
    expect(rejected(events)).toEqual(["POWER_LOCKED"]);
  });

  it("a command waits for the tick boundary: queued between ticks, it acts on the next tick and nowhere else", () => {
    const battle = fight([alien(1, "blob", 2)]);
    runTo(battle, 50);
    expect(giveCommand(battle, { kind: "usePower", powerId: SHIELD })).toEqual({ ok: true });
    expect([battle.shield, battle.powers[SHIELD]]).toEqual([0, 2]); // nothing yet
    step(battle);
    expect(ofKind(drainEvents(battle), "power").map((e) => e.tick)).toEqual([50]);
    expect(battle.shield).toBe(10);
  });
});

// ---- nothing crosses a wave -----------------------------------------------------------------------------------------

describe("nothing but the counts crosses a wave boundary (spine S4, C2.5)", () => {
  /** Use all three powers, then finish the wave. */
  function wavesWithPowers(): { first: Battle; after: Snapshot } {
    const first = fight([alien(1, "blob", 2), alien(2, "blob", 2.5)]);
    use(first, FROST);
    runTo(first, 200);
    use(first, COMET, get(first, 1).progress);
    runTo(first, 400);
    first.shield = 15;
    use(first, SHIELD); // 20, lasting only for this wave
    runTo(first, 10_000);
    expect(first.status).toBe("CLEARED");
    return { first, after: battleSnapshot(first) };
  }

  it("when the wave ends the use counts and the lockout are cleared on the battle itself, and the shield is trimmed", () => {
    const { first } = wavesWithPowers();
    expect(first.stats.leaked).toBe(2); // 20 - 2 = 18, trimmed to 10
    expect([first.powerUses, first.powerReadyTick, first.shield]).toEqual([{}, 0, 10]);
  });

  it("the snapshot holds only credits, placements, colony and powers: counts, no timer", () => {
    const { after } = wavesWithPowers();
    expect(Object.keys(after).sort()).toEqual(["colony", "credits", "placements", "powers"]);
    expect(after.powers).toEqual({ [FROST]: 1, [COMET]: 1, [SHIELD]: 1 });
    expect(after.colony.shield).toBe(10);
  });

  it("the next wave may use every power again at once, on its first tick, and its aliens carry no slow", () => {
    const { after } = wavesWithPowers();
    const next = createBattle(config, after, 1, SEED);
    expect([next.powerUses, next.powerReadyTick]).toEqual([{}, 0]);
    startWave(next);
    const events = use(next, FROST);
    expect(rejected(events)).toEqual([]);
    expect(ofKind(events, "power").map((e) => e.tick)).toEqual([0]);
    expect(next.powers[FROST]).toBe(0);
  });

  it("the next wave plays exactly as it does from the same snapshot with no powers used before it", () => {
    const { after } = wavesWithPowers();
    const play = (snap: Snapshot) => {
      const battle = createBattle(config, snap, 1, SEED);
      startWave(battle);
      const events = runTo(battle, 10_000);
      return { events, snapshot: battleSnapshot(battle), tick: battle.tick };
    };
    const fresh: Snapshot = { ...after, powers: { ...after.powers } };
    expect(play(after)).toEqual(play(fresh));
  });
});

// ---- whole boss waves with powers: both models ----------------------------------------------------------------------

/**
 * Whole boss waves with the mixed board of every class (bosses.test.ts's MIXED), colony health and maximum 200 (a
 * test-only copy of r3), holding Frost Pulse 1, Comet Burst 2 and Colony Shield 1, and trying a power on six fixed
 * ticks: 600 Frost Pulse (used), 660 Frost Pulse (refused: once a wave), 900 Comet Burst on the boss (used), 960
 * Colony Shield (refused: the lockout runs to 1080), 1100 Colony Shield (used), 1200 Comet Burst on the boss (refused:
 * once a wave). The expected numbers are the "game-core timing" lines of `python3 -B tools/sim/power_baseline.py`
 * (2026-11-17, about 1 s), which plays the same waves through tools/sim/sim.py at 60 Hz with Game.use_power called on
 * the same ticks, and with game-core's two timing rules: C6.3's release times (ADR-0034 difference 1) and whole-tick
 * slows (C2.1: a 6 s slow lasts 360 ticks; the unchanged simulator's float countdown gives 361, so every event after a
 * Frost Pulse comes one tick later there: Captain Clank's wave ends on 2185, not 2184; ADR-0034 difference 4). Burst is
 * the health the comets removed (the simulator counts only shots as damage).
 *
 * Queen Bubbla's wave ends one tick later here, as in bosses.test.ts (her storm speed, 517.5 units a tick, is 517
 * here). Wave 50 is left out for the float rounding bosses.test.ts describes.
 */
describe("whole boss waves with powers used on fixed ticks, scored by both models (tools/sim/sim.py at 60 Hz), agree", () => {
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
  const PLAN: readonly [number, string][] = [
    [600, FROST],
    [660, FROST],
    [900, COMET],
    [960, SHIELD],
    [1100, SHIELD],
    [1200, COMET],
  ];
  const USES = [true, false, true, false, true, false];

  it.each([
    ["King Wobble", 1, { ticks: 1873, bossDefeated: true, defeated: 9, leaked: [], bounty: 82, shots: 13, damage: 677, burst: 45, health: 200, shield: 10, spawned: 9 }],
    ["Captain Clank", 2, { ticks: 2184, bossDefeated: true, defeated: 9, leaked: [], bounty: 97, shots: 69, damage: 1512, burst: 100, health: 200, shield: 10, spawned: 9 }],
    ["Queen Bubbla", 3, { ticks: 6201, bossDefeated: false, defeated: 18, leaked: [3], bounty: 26, shots: 141, damage: 1722, burst: 220, health: 200, shield: 0, spawned: 19 }],
    [
      "The Mothership",
      4,
      { ticks: 6279, bossDefeated: false, defeated: 14, leaked: [9, 10, 12, 13, 21, 20, 5], bounty: 33, shots: 150, damage: 3333, burst: 230, health: 198, shield: 0, spawned: 21 },
    ],
  ] as const)("%s", (name, position, python) => {
    const battle = createBattle(cfg, snapshot(MIXED, { [FROST]: 1, [COMET]: 2, [SHIELD]: 1 }, 200), position, SEED);
    startWave(battle);
    const leaked: number[] = [];
    const uses: boolean[] = [];
    let bossDefeated = false;
    while (battle.status === "IN_WAVE") {
      if (battle.tick > 20_000) throw new Error("wave did not end");
      for (const [tick, powerId] of PLAN) {
        if (tick !== battle.tick) continue;
        const boss = battle.aliens.find((a) => a.type.startsWith("boss"));
        giveCommand(battle, powerId === COMET ? { kind: "usePower", powerId, target: boss?.progress ?? -1 } : { kind: "usePower", powerId });
      }
      step(battle);
      for (const e of drainEvents(battle)) {
        if (e.kind === "leaked") leaked.push(e.alienId);
        if (e.kind === "defeated" && e.type.startsWith("boss")) bossDefeated = true;
        if (e.kind === "power") uses.push(true);
        if (e.kind === "rejected") uses.push(false);
      }
    }
    expect(uses).toEqual(USES);
    const { ticks: pythonTicks, ...pythonRest } = python;
    expect(battle.tick - pythonTicks).toBe(name === "Queen Bubbla" ? 1 : 0);
    expect({
      bossDefeated,
      defeated: battle.stats.defeated,
      leaked,
      bounty: battle.stats.bounty,
      shots: battle.stats.shots,
      damage: battle.stats.damage,
      burst: battle.stats.powerDamage,
      health: battle.health,
      shield: battle.shield,
      spawned: battle.stats.spawned,
    }).toEqual(pythonRest);
    expect(battleSnapshot(battle).powers).toEqual({ [FROST]: 0, [COMET]: 1, [SHIELD]: 0 });
  });
});
