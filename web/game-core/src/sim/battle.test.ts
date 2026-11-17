// The battle simulation (Phase 14, M1-21): rules of one tick (C2.3), commands validated at tick boundaries (AC-09),
// the post-wave snapshot for the same seed and inputs (the J row's "Done when"), frame-rate independence (AC-13), and
// the two-wave M1 run through the rules reducer.
//
// The outcome numbers below were checked against the balance simulator (tools/sim/sim.py, Scripted policy, tick_hz
// 60, the same pads): kills, leaks, bounty, shots, credits and health agree in every scenario. Its tick counts are
// one higher, because its float route progress (40 tiles in steps of 1/60) lands a hair short of the end; this
// simulation counts progress in integer units, so a 1 tile/s blob takes exactly 2,400 ticks.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STEPS_PER_SECOND, type Speed } from "../clock";
import { parsePlanet, parseRuleset, type PlanetDocument, type Ruleset } from "../data/game-data";
import { reduce, type Op, type RunState, type Snapshot } from "../rules";
import {
  battleSnapshot,
  compileBattleConfig,
  createBattle,
  drainEvents,
  giveCommand,
  initialRunState,
  padOpen,
  runFrame,
  sellRefund,
  startWave,
  step,
  UNITS_PER_TILE,
  waveHealth,
  type Battle,
  type BattleConfig,
  type BattleEvent,
} from "./index";

const GAME_DATA = join(import.meta.dirname, "..", "..", "..", "..", "game-data");
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(GAME_DATA, path), "utf8"));
const ruleset: Ruleset = parseRuleset(readJson("ruleset/r1.json"));
const planet: PlanetDocument = parsePlanet(readJson("campaign/luna-1-c1.json"), ruleset);
const config: BattleConfig = compileBattleConfig(ruleset, planet, "first-contact");

const SEED = "5eed5eed5eed5eed";
const START: Snapshot = { credits: 150, placements: [], colony: { health: 20, shield: 0 }, powers: {} };

/** The fate of each alien, in the order it happened: the outcome list I.2 golden scenarios hash. */
type Outcome = readonly [tick: number, alienId: number, what: "defeated" | "leaked"];

function outcomes(events: readonly BattleEvent[]): Outcome[] {
  const out: Outcome[] = [];
  for (const e of events) {
    if (e.kind === "defeated") out.push([e.tick, e.alienId, "defeated"]);
    if (e.kind === "leaked") out.push([e.tick, e.alienId, "leaked"]);
  }
  return out;
}

function prepare(snapshot: Snapshot, wave: number, pads: readonly string[]): Battle {
  const battle = createBattle(config, snapshot, wave, SEED);
  for (const padId of pads) expect(giveCommand(battle, { kind: "place", padId, classId: "nova" })).toEqual({ ok: true });
  return battle;
}

/** Run the wave to its end one tick at a time; returns every event. */
function finish(battle: Battle, limit = 20_000): BattleEvent[] {
  startWave(battle);
  const events: BattleEvent[] = [];
  while (battle.status === "IN_WAVE") {
    if (battle.tick >= limit) throw new Error("wave did not end");
    step(battle);
    events.push(...drainEvents(battle));
  }
  return events;
}

/** Drive a wave through the fixed-timestep clock with a repeating pattern of frame deltas (ms). */
function finishWithFrames(battle: Battle, deltas: readonly number[], speed: Speed = 1): { ticks: number; events: BattleEvent[] } {
  startWave(battle);
  let clock = { accumulator: 0 };
  const events: BattleEvent[] = [];
  let frames = 0;
  while (battle.status === "IN_WAVE") {
    const delta = deltas[frames % deltas.length] ?? 16;
    const frame = runFrame(battle, clock, delta, speed, false);
    clock = frame.clock;
    events.push(...drainEvents(battle));
    frames += 1;
    if (frames > 100_000) throw new Error("wave did not end");
  }
  return { ticks: battle.tick, events };
}

describe("compiled numbers (C2.1, C2.2)", () => {
  it("turns seconds into ticks and tiles into integer units once, at load", () => {
    const nova = config.classes["nova"];
    expect(nova?.levels.map((l) => [l.cost, l.invested, l.shot?.periodTicks, l.shot?.damage, l.shot?.rangeSq])).toEqual([
      [50, 50, 60, 10, 150_000 ** 2],
      [60, 110, 36, 10, 150_000 ** 2],
      [150, 260, 36, 16, 180_000 ** 2],
    ]);
    expect(config.route.length).toBe(40 * UNITS_PER_TILE);
    expect(config.waves.map((w) => w.spawns.map((s) => s.tick))).toEqual([
      [0, 150, 300, 450, 600, 750],
      [0, 120, 240, 360, 480, 600, 720, 840],
    ]);
  });

  it("opens the six starting pads for the M1 wave set (C3.3, padsOpenAsForWave 1)", () => {
    expect(config.pads.filter((p) => p.open).map((p) => p.id)).toEqual(["p02", "p04", "p05", "p09", "p12", "p16"]);
  });

  it("applies the C2.2 rounding rules", () => {
    expect(waveHealth(24, 1.0)).toBe(24);
    expect(waveHealth(24, 1.05)).toBe(25); // 25.2 -> 25
    expect(waveHealth(1, 0.1)).toBe(1);
    expect([50, 110, 260].map((invested) => sellRefund(invested, config.sell))).toEqual([35, 75, 180]); // C5.2
  });

  it("refuses data mechanics 1 cannot run", () => {
    expect(() => compileBattleConfig(ruleset, planet, "no-such-set")).toThrow(/no wave set/);
    const fastClock = { ...ruleset, simulation: { tickRateHz: 30 } };
    expect(() => compileBattleConfig(fastClock, planet, "first-contact")).toThrow(/tickRateHz/);
  });
});

describe("commands (C2.3 step 1, AC-07, AC-09)", () => {
  it("places on an open, free pad and takes the price", () => {
    const battle = createBattle(config, START, 1, SEED);
    expect(giveCommand(battle, { kind: "place", padId: "p05", classId: "nova" })).toEqual({ ok: true });
    expect(battle.credits).toBe(100);
    expect(battle.towers.map((t) => [t.padId, t.level, t.targeting])).toEqual([["p05", 1, "FRONT"]]);
  });

  it("refuses closed, occupied and unknown pads, unknown classes, and too few credits, leaving credits alone", () => {
    const battle = createBattle(config, { ...START, credits: 60 }, 1, SEED);
    const tries = [
      { kind: "place", padId: "p03", classId: "nova" }, // opens after wave 5
      { kind: "place", padId: "p99", classId: "nova" },
      { kind: "place", padId: "p02", classId: "pip" },
      { kind: "upgrade", padId: "p02" },
    ] as const;
    expect(tries.map((c) => giveCommand(battle, c))).toEqual([
      { ok: false, reason: "PAD_CLOSED" },
      { ok: false, reason: "UNKNOWN_PAD" },
      { ok: false, reason: "CLASS_UNAVAILABLE" },
      { ok: false, reason: "PAD_EMPTY" },
    ]);
    expect(giveCommand(battle, { kind: "place", padId: "p02", classId: "nova" })).toEqual({ ok: true });
    expect(giveCommand(battle, { kind: "place", padId: "p02", classId: "nova" })).toEqual({ ok: false, reason: "PAD_OCCUPIED" });
    expect(giveCommand(battle, { kind: "place", padId: "p04", classId: "nova" })).toEqual({ ok: false, reason: "NOT_ENOUGH_CREDITS" });
    expect(battle.credits).toBe(10);
    expect(drainEvents(battle).map((e) => (e.kind === "rejected" ? e.reason : e.kind))).toEqual([
      "PAD_CLOSED",
      "UNKNOWN_PAD",
      "CLASS_UNAVAILABLE",
      "PAD_EMPTY",
      "PAD_OCCUPIED",
      "NOT_ENOUGH_CREDITS",
    ]);
  });

  it("in a CAMPAIGN, pads open as waves are cleared (C3.3); a CHALLENGE keeps its fixed pads", () => {
    const r3 = parseRuleset(readJson("ruleset/r3.json"));
    const c2 = compileBattleConfig(r3, parsePlanet(readJson("campaign/luna-1-c2.json"), r3), "campaign");
    const p03 = (wave: number) => giveCommand(createBattle(c2, START, wave, SEED), { kind: "place", padId: "p03", classId: "nova" });
    expect(p03(5)).toEqual({ ok: false, reason: "PAD_CLOSED" }); // opens after wave 5: preparing wave 6
    expect(p03(6)).toEqual({ ok: true });
    const pad = c2.pads.find((p) => p.id === "p01");
    if (pad === undefined) throw new Error("no p01");
    expect([padOpen(c2, pad, 20), padOpen(c2, pad, 21)]).toEqual([false, true]);
    expect(padOpen(config, pad, 50)).toBe(false); // first-contact is a CHALLENGE: its pads never change
  });

  it("two purchases queued in one tick with credits for one: exactly one applies, credits never go negative", () => {
    const battle = createBattle(config, { ...START, credits: 70 }, 1, SEED);
    startWave(battle);
    expect(giveCommand(battle, { kind: "place", padId: "p02", classId: "nova" })).toEqual({ ok: true }); // queued
    expect(giveCommand(battle, { kind: "place", padId: "p04", classId: "nova" })).toEqual({ ok: true }); // queued
    expect(battle.credits).toBe(70); // nothing changes until the tick
    step(battle);
    expect(battle.credits).toBe(20);
    expect(battle.towers.map((t) => t.padId)).toEqual(["p02"]);
    expect(drainEvents(battle).filter((e) => e.kind === "rejected")).toEqual([
      { kind: "rejected", tick: 0, command: { kind: "place", padId: "p04", classId: "nova" }, reason: "NOT_ENOUGH_CREDITS" },
    ]);
  });

  it("upgrades to level 3 and no further; sells for the C5.7 refund; changes targeting only to the class's modes", () => {
    const battle = createBattle(config, { ...START, credits: 1000 }, 1, SEED);
    giveCommand(battle, { kind: "place", padId: "p09", classId: "nova" });
    expect(giveCommand(battle, { kind: "upgrade", padId: "p09" })).toEqual({ ok: true });
    expect(giveCommand(battle, { kind: "upgrade", padId: "p09" })).toEqual({ ok: true });
    expect(giveCommand(battle, { kind: "upgrade", padId: "p09" })).toEqual({ ok: false, reason: "MAX_LEVEL" });
    expect(battle.credits).toBe(1000 - 260);
    expect(giveCommand(battle, { kind: "setTargeting", padId: "p09", targeting: "FAST" })).toEqual({ ok: true });
    expect(giveCommand(battle, { kind: "setTargeting", padId: "p09", targeting: "CROWD" })).toEqual({
      ok: false,
      reason: "TARGETING_UNAVAILABLE",
    });
    expect(battleSnapshot(battle).placements).toEqual([{ padId: "p09", classId: "nova", level: 3, targeting: "FAST" }]);
    expect(giveCommand(battle, { kind: "sell", padId: "p09" })).toEqual({ ok: true });
    expect(battle.credits).toBe(1000 - 260 + 180);
    expect(battle.towers).toEqual([]);
  });

  it("keeps towers in pad order whatever order they were placed in (attack order, C2.3 step 4)", () => {
    const battle = prepare(START, 1, ["p16", "p02", "p09"]);
    expect(battle.towers.map((t) => t.padId)).toEqual(["p02", "p09", "p16"]);
  });

  it("refuses every command once the wave has ended", () => {
    const battle = prepare(START, 1, ["p02", "p04", "p05"]);
    finish(battle);
    expect(giveCommand(battle, { kind: "place", padId: "p09", classId: "nova" })).toEqual({ ok: false, reason: "NOT_NOW" });
  });
});

describe("one tick (C2.3, C2.4)", () => {
  it("spawns at progress 0 and moves 1,000 units a tick at 1 tile/s", () => {
    const battle = createBattle(config, START, 1, SEED);
    startWave(battle);
    step(battle);
    expect(battle.aliens.map((a) => [a.id, a.progress, a.hp])).toEqual([[1, 1000, 24]]);
  });

  it("a ready attacker fires the moment a target is in range, and then waits its period", () => {
    // The blob spawns at (0, 2), sqrt(2^2 + 2^2) = 2.83 tiles from p02 (2, 4): out of range 2.5. It is exactly 2.5
    // away at (0.5, 2), progress 30,000 units, reached by the move on tick 29; attacks come before movement (C2.3),
    // so the first shot is on tick 30, then every 60 ticks (period 1 s).
    const battle = prepare(START, 1, ["p02"]);
    startWave(battle);
    const shotTicks: number[] = [];
    while (battle.tick < 200) {
      step(battle);
      for (const e of drainEvents(battle)) if (e.kind === "shot") shotTicks.push(e.tick);
    }
    expect(shotTicks.slice(0, 3)).toEqual([30, 90, 150]);
  });

  it("leaks come off the shield first, then health", () => {
    const battle = createBattle(config, { ...START, colony: { health: 20, shield: 4 } }, 1, SEED);
    const events = finish(battle);
    expect(outcomes(events).every(([, , what]) => what === "leaked")).toBe(true);
    expect([battle.shield, battle.health]).toEqual([0, 18]); // 6 leaks: 4 absorbed, 2 off health
  });

  it("the soft cap holds spawns back while too many aliens are alive (C6.4)", () => {
    const tight = { ...config, caps: { ...config.caps, scheduledSpawnSoftCap: 2 } };
    const battle = createBattle(tight, START, 1, SEED);
    startWave(battle);
    while (battle.tick < 1000) step(battle);
    expect(battle.aliens.length).toBe(2);
    expect(battle.spawnIndex).toBe(2);
  });

  it("colony at zero is defeat, and a defeated wave has no snapshot (spine S3.2 DEFEAT)", () => {
    const battle = createBattle(config, { ...START, colony: { health: 3, shield: 0 } }, 1, SEED);
    const events = finish(battle);
    expect(battle.status).toBe("DEFEATED");
    expect(outcomes(events)).toEqual([
      [2399, 1, "leaked"],
      [2549, 2, "leaked"],
      [2699, 3, "leaked"],
    ]);
    expect(battle.health).toBe(0);
    expect(() => battleSnapshot(battle)).toThrow(/no snapshot/);
  });
});

describe("same seed and inputs -> same post-wave snapshot (M1-21 Done when)", () => {
  // Wave 1 with three Novas on p02, p04 and p05. Changing any number that matters (an alien's speed or health, a
  // range, a period, a spawn time) changes this result. tools/sim agrees on every count (header comment).
  const EXPECTED_WAVE_1 = {
    ticks: 1081,
    snapshot: {
      credits: 24,
      placements: [
        { padId: "p02", classId: "nova", level: 1, targeting: "FRONT" },
        { padId: "p04", classId: "nova", level: 1, targeting: "FRONT" },
        { padId: "p05", classId: "nova", level: 1, targeting: "FRONT" },
      ],
      colony: { health: 20, shield: 0 },
      powers: {},
    },
    outcomes: [
      [150, 1, "defeated"],
      [330, 2, "defeated"],
      [510, 3, "defeated"],
      [750, 4, "defeated"],
      [870, 5, "defeated"],
      [1080, 6, "defeated"],
    ],
    stats: {
      spawned: 6,
      released: 0,
      defeated: 6,
      leaked: 0,
      bounty: 24,
      shots: 18,
      damage: 144,
      powerDamage: 0,
      healthLost: 0,
      healed: 0,
      deferredSpawns: 0,
      heldReleases: 0,
      peakAliens: 3,
      peakDescendants: 0,
    },
  };

  it("matches the recorded snapshot, tick count and per-alien outcomes", () => {
    const battle = prepare(START, 1, ["p02", "p04", "p05"]);
    const events = finish(battle);
    expect(battle.status).toBe("CLEARED");
    expect({ ticks: battle.tick, snapshot: battleSnapshot(battle), outcomes: outcomes(events), stats: battle.stats }).toEqual(
      EXPECTED_WAVE_1,
    );
  });

  it("gives the identical result twice, and for any run seed (combat has no randomness, C2.2)", () => {
    const a = prepare(START, 1, ["p02", "p04", "p05"]);
    const b = prepare(START, 1, ["p02", "p04", "p05"]);
    const c = createBattle(config, START, 1, "another-seed");
    for (const padId of ["p02", "p04", "p05"]) giveCommand(c, { kind: "place", padId, classId: "nova" });
    const ea = finish(a);
    expect(finish(b)).toEqual(ea);
    expect(outcomes(finish(c))).toEqual(outcomes(ea));
    expect(battleSnapshot(c)).toEqual(battleSnapshot(a));
  });

  it("gives the identical tick count and snapshot at 30, 60 and 144 Hz frame deltas, with jitter, and at 2x (AC-13)", () => {
    const patterns: readonly (readonly number[])[] = [
      [1000 / 30],
      [1000 / 60],
      [1000 / 144],
      [7, 23, 16.6, 33.4, 9, 250, 1, 0, 40], // jittery, with a stall at the 250 ms clamp
    ];
    for (const deltas of patterns) {
      for (const speed of [1, 2] as const) {
        const battle = prepare(START, 1, ["p02", "p04", "p05"]);
        const { ticks, events } = finishWithFrames(battle, deltas, speed);
        expect({ ticks, snapshot: battleSnapshot(battle), outcomes: outcomes(events) }).toEqual({
          ticks: EXPECTED_WAVE_1.ticks,
          snapshot: EXPECTED_WAVE_1.snapshot,
          outcomes: EXPECTED_WAVE_1.outcomes,
        });
      }
    }
  });

  it("a paused frame runs no ticks; the clock banks nothing outside a running wave", () => {
    const battle = prepare(START, 1, ["p02"]);
    expect(runFrame(battle, { accumulator: 0 }, 100, 1, false)).toEqual({ clock: { accumulator: 0 }, ticks: 0 }); // PREP
    startWave(battle);
    expect(runFrame(battle, { accumulator: 500 }, 100, 1, true)).toEqual({ clock: { accumulator: 500 }, ticks: 0 });
    expect(runFrame(battle, { accumulator: 0 }, 100, 1, false).ticks).toBe(6);
  });

  it("the seeded generator gives each alien a cosmetic look from (seed, wave) only", () => {
    const looks = (seed: string, wave: number): number[] => {
      const battle = createBattle(config, START, wave, seed);
      startWave(battle);
      while (battle.status === "IN_WAVE" && battle.tick < 900) step(battle);
      return battle.aliens.map((a) => a.look);
    };
    expect(looks(SEED, 1)).toEqual(looks(SEED, 1));
    expect(looks(SEED, 1).every((l) => Number.isInteger(l) && l >= 0 && l < 6)).toBe(true);
    expect(looks(SEED, 1)).not.toEqual(looks("different", 1));
  });
});

describe("the two-wave M1 run through the rules reducer (J-1)", () => {
  let n = 0;
  const op = <T extends Op["type"]>(state: RunState, type: T, payload: Extract<Op, { type: T }>["payload"]): Op =>
    ({
      opId: `00000000-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`,
      expectedRevision: state.revision,
      type,
      payload,
      clientTime: "2026-11-15T10:00:00Z",
    }) as Op;
  const apply = (state: RunState, o: Op): RunState => {
    const r = reduce(state, o);
    if (r.result !== "APPLIED") throw new Error(`refused: ${JSON.stringify(r)}`);
    return r.state;
  };
  const playWave = (state: RunState, pads: readonly string[]): { state: RunState; battle: Battle } => {
    if (state.snapshot === undefined) throw new Error("no snapshot");
    const battle = prepare(state.snapshot, state.wave, pads);
    const prep = battleSnapshot(battle);
    const started = apply(state, op(state, "START_WAVE", { wave: state.wave, credits: prep.credits, placements: prep.placements }));
    finish(battle);
    if (battle.status === "DEFEATED") return { state: apply(started, op(started, "DEFEAT", { wave: state.wave })), battle };
    const post = battleSnapshot(battle);
    return { state: apply(started, op(started, "COMPLETE_WAVE", { wave: state.wave, ...post })), battle };
  };

  it("wave 1 -> activity (+30) -> wave 2 -> COMPLETED, with the snapshots the battles produced", () => {
    let state = initialRunState(ruleset, config, ["continue"]);
    expect(state).toMatchObject({ phase: "BUILD", wave: 1, finalWave: 2, snapshot: START });
    expect(state.slots.map((s) => [s.slotId, s.reward.credits])).toEqual([["N-001", 30]]);

    state = playWave(state, ["p02", "p04", "p05"]).state;
    expect(state).toMatchObject({ phase: "ACTIVITY", wave: 2, highestCompletedWave: 1, snapshot: { credits: 24 } });

    state = apply(state, op(state, "SUBMIT_ATTEMPT", { slotId: "N-001", answer: "continue" }));
    expect(state).toMatchObject({ phase: "BUILD", snapshot: { credits: 54 } });

    const last = playWave(state, ["p09"]);
    expect(last.state.status).toBe("COMPLETED");
    expect(last.state.highestCompletedWave).toBe(2);
    expect(battleSnapshot(last.battle)).toMatchObject({ credits: 36, colony: { health: 20, shield: 0 } }); // tools/sim: 36, 20
  });

  it("a colony that falls in wave 1 ends the run DEFEATED", () => {
    const fresh = initialRunState(ruleset, config, ["continue"]);
    const weak = { ...fresh, snapshot: { ...START, colony: { health: 2, shield: 0 } } };
    const { state } = playWave(weak, []);
    expect(state.status).toBe("DEFEATED");
    expect(state.snapshot).toBeUndefined();
  });

  it("ticks per second come from the one clock constant", () => {
    expect(STEPS_PER_SECOND).toBe(ruleset.simulation.tickRateHz);
  });
});
