// Roster and economy (Phase 24, M2-01): the six classes of ruleset r2 bought, upgraded, sold and re-aimed through
// commands that are validated against the battle at the moment they apply (C2.3 step 1, AC-09), with refunds per
// C5.7, deployment caps per C5.8 and unlock waves per C5.9. Also the two attack shapes r2 adds that the simulation
// already runs: Juno's blast (C5.2) and support classes that never fire.
//
// Every price and refund here comes from game-data/ruleset/r2.json through compileBattleConfig; the literal numbers
// in the expectations are the C5.2 table, so a changed ruleset number fails a test that names where it came from.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePlanet, parseRuleset, type Targeting } from "../data/game-data";
import type { Placement, Snapshot } from "../rules";
import {
  checkCommand,
  classAvailability,
  compileBattleConfig,
  createBattle,
  drainEvents,
  giveCommand,
  nextInt,
  sellRefund,
  startWave,
  step,
  UNITS_PER_TILE,
  type AlienState,
  type Battle,
  type BattleConfig,
  type Command,
} from "./index";

const GAME_DATA = join(import.meta.dirname, "..", "..", "..", "..", "game-data");
const readJson = (path: string): Record<string, unknown> => JSON.parse(readFileSync(join(GAME_DATA, path), "utf8")) as Record<string, unknown>;
const r2 = parseRuleset(readJson("ruleset/r2.json"));
const PLANET_RAW = readJson("campaign/luna-1-c1.json");

const ALL_CLASSES = ["nova", "pip", "juno", "orion", "mira", "sol"] as const;
const SEED = "5eed5eed5eed5eed";

/**
 * Two test-only wave sets on Moonbeam Colony with every r2 class listed: "every-class", a CHALLENGE (classes fixed by
 * the set, no unlock waves, C13), and "campaign", a CAMPAIGN of 50 copies of wave 1 (unlock waves apply, C5.9).
 * Both open the six starting pads. Nothing here is game data: the real wave sets list their own classes.
 */
function testPlanet() {
  const doc = structuredClone(PLANET_RAW);
  const wave1 = (doc["waves"] as Record<string, unknown>[])[0];
  const fifty = Array.from({ length: 50 }, (_, i) => i + 1);
  doc["waves"] = fifty.map((wave) => ({ ...wave1, wave }));
  const base = { startCredits: 150, colonyHealth: 20, classes: [...ALL_CLASSES], padsOpenAsForWave: 1, presetPlacements: [] };
  doc["waveSets"] = {
    "every-class": { ...base, mode: "CHALLENGE", name: "Every class", waves: [1, 2], meteorAfter: [] },
    campaign: { ...base, mode: "CAMPAIGN", name: "Campaign", waves: fifty, meteorAfter: [9, 19, 29, 39, 49] },
  };
  return parsePlanet(doc, r2);
}
const planet = testPlanet();
const challenge: BattleConfig = compileBattleConfig(r2, planet, "every-class");
const campaign: BattleConfig = compileBattleConfig(r2, planet, "campaign");

/** The six starting pads (C3.3). */
const OPEN_PADS = ["p02", "p04", "p05", "p09", "p12", "p16"] as const;

function snapshot(credits: number, placements: Placement[] = []): Snapshot {
  return { credits, placements, colony: { health: 20, shield: 0 }, powers: {} };
}

function battleWith(credits: number, placements: Placement[] = [], config = challenge, wave = 1): Battle {
  return createBattle(config, snapshot(credits, placements), wave, SEED);
}

const rejections = (battle: Battle): string[] => drainEvents(battle).flatMap((e) => (e.kind === "rejected" ? [e.reason] : []));

/** credits + everything invested in the astronauts on the board: C5.7's W, spine S6's value(s). */
function value(battle: Battle): number {
  let invested = 0;
  for (const t of battle.towers) invested += battle.config.classes[t.classId]?.levels[t.level - 1]?.invested ?? 0;
  return battle.credits + invested;
}

/** C5.2 "Sell refund at this level", class by class (C5.7: floor(floor(invested x 70 / 100) / 5) x 5). */
const C52_REFUNDS: Record<(typeof ALL_CLASSES)[number], readonly number[]> = {
  nova: [35, 75, 180],
  pip: [40, 95, 215],
  juno: [75, 165, 350],
  orion: [115, 185, 420],
  mira: [110, 235, 430],
  sol: [105, 245, 455],
};

describe("buy and sell in the same tick (C2.3 step 1: arrival order, each checked against the state at that moment)", () => {
  // A level-1 Nova stands on p02 (refund 35, C5.2). With 20 credits a new Nova (50) is affordable only after the sale.
  const NOVA_ON_P02: Placement[] = [{ padId: "p02", classId: "nova", level: 1, targeting: "FRONT" }];
  const SELL: Command = { kind: "sell", padId: "p02" };
  const BUY: Command = { kind: "place", padId: "p04", classId: "nova" };

  function sameTick(commands: readonly Command[]): Battle {
    const battle = battleWith(20, NOVA_ON_P02);
    startWave(battle);
    for (const command of commands) expect(giveCommand(battle, command)).toEqual({ ok: true }); // queued, not applied
    expect(battle.credits).toBe(20);
    step(battle);
    return battle;
  }

  it("sell, then buy: the sale pays first, so the purchase is affordable (20 + 35 - 50 = 5)", () => {
    const battle = sameTick([SELL, BUY]);
    expect(battle.credits).toBe(5);
    expect(battle.towers.map((t) => t.padId)).toEqual(["p04"]);
    expect(rejections(battle)).toEqual([]);
  });

  it("buy, then sell: the purchase is checked first and refused, the sale still applies (20 + 35 = 55)", () => {
    const battle = sameTick([BUY, SELL]);
    expect(battle.credits).toBe(55);
    expect(battle.towers).toEqual([]);
    expect(rejections(battle)).toEqual(["NOT_ENOUGH_CREDITS"]);
  });

  it("on the same pad: sell then place reuses the freed pad; place then sell finds it occupied", () => {
    const rebuy: Command = { kind: "place", padId: "p02", classId: "pip" };
    const a = battleWith(30, NOVA_ON_P02);
    startWave(a);
    giveCommand(a, SELL);
    giveCommand(a, rebuy);
    step(a);
    expect([a.credits, a.towers.map((t) => `${t.padId}/${t.classId}`)]).toEqual([5, ["p02/pip"]]); // 30 + 35 - 60
    const b = battleWith(30, NOVA_ON_P02);
    startWave(b);
    giveCommand(b, rebuy);
    giveCommand(b, SELL);
    step(b);
    expect([b.credits, b.towers]).toEqual([65, []]);
    expect(rejections(b)).toEqual(["PAD_OCCUPIED"]);
  });

  it("nothing in the queue applies mid-tick or before the next tick, and the queue is empty after it", () => {
    const battle = battleWith(500);
    startWave(battle);
    giveCommand(battle, BUY);
    expect([battle.credits, battle.towers.length, battle.queue.length]).toEqual([500, 0, 1]);
    step(battle);
    expect([battle.credits, battle.towers.length, battle.queue.length]).toEqual([450, 1, 0]);
  });
});

describe("rapid buy, sell and upgrade sequences never make credits negative (AC-09) or create credits (C5.7)", () => {
  /** A random command: any class, any pad (closed and unknown pads included), any mode. */
  function randomCommand(rng: number): { command: Command; rng: number } {
    const pads = ["p01", "p02", "p03", "p04", "p05", "p09", "p12", "p16", "p99"];
    const modes: Targeting[] = ["FRONT", "FAST", "CROWD", "STRONG"];
    let r = rng;
    const pick = <T>(items: readonly T[]): T => {
      const n = nextInt(r, items.length);
      r = n.state;
      return items[n.value] as T;
    };
    const kind = pick(["place", "place", "upgrade", "upgrade", "sell", "setTargeting"] as const);
    const padId = pick(pads);
    let command: Command;
    if (kind === "place") command = { kind, padId, classId: pick([...ALL_CLASSES, "comet"]) };
    else if (kind === "setTargeting") command = { kind, padId, targeting: pick(modes) };
    else command = { kind, padId };
    return { command, rng: r };
  }

  it("400 seeded sequences of 300 actions each, in preparation and mid-wave, bursts of up to 8 commands per tick", () => {
    let applied = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      let rng = seed * 7919;
      const start = nextInt(rng, 800);
      rng = start.state;
      const battle = battleWith(start.value);
      // W may rise only by bounty (C5.7): track W minus the bounty earned so far, which must never rise.
      let floor = value(battle);
      for (let action = 0; action < 300 && (battle.status === "PREP" || battle.status === "IN_WAVE"); action += 1) {
        const roll = nextInt(rng, 10);
        rng = roll.state;
        if (battle.status === "PREP" && roll.value === 0) startWave(battle);
        else if (battle.status === "IN_WAVE" && roll.value < 3) step(battle);
        else {
          const burst = nextInt(rng, 8);
          rng = burst.state;
          for (let k = 0; k <= burst.value; k += 1) {
            const next = randomCommand(rng);
            rng = next.rng;
            giveCommand(battle, next.command);
          }
          if (battle.status === "IN_WAVE") step(battle);
        }
        applied += drainEvents(battle).length;
        expect(Number.isInteger(battle.credits), `seed ${seed}`).toBe(true);
        expect(battle.credits, `seed ${seed} action ${action}`).toBeGreaterThanOrEqual(0);
        const now = value(battle) - battle.stats.bounty;
        expect(now, `seed ${seed} action ${action}: W rose without bounty`).toBeLessThanOrEqual(floor);
        floor = now;
      }
    }
    expect(applied).toBeGreaterThan(10_000); // the sequences really did exercise the commands
  });

  it("selling always loses at least 30% of what was invested, so sell-and-rebuy can never gain (C5.7)", () => {
    for (const classId of ALL_CLASSES) {
      for (const invested of challenge.classes[classId]?.levels.map((l) => l.invested) ?? []) {
        const refund = sellRefund(invested, challenge.sell);
        expect(refund % 5).toBe(0);
        expect(refund).toBeLessThanOrEqual((invested * 70) / 100);
        expect(refund).toBeGreaterThan(0);
      }
    }
  });
});

describe("refunds (C5.7) for every class and level", () => {
  it("sellRefund of the cumulative cost equals the C5.2 'Sell refund' column", () => {
    for (const classId of ALL_CLASSES) {
      const levels = challenge.classes[classId]?.levels ?? [];
      expect(levels.map((l) => sellRefund(l.invested, challenge.sell)), classId).toEqual(C52_REFUNDS[classId]);
    }
  });

  it("buying, upgrading to each level and selling through commands returns exactly that refund", () => {
    for (const classId of ALL_CLASSES) {
      for (let level = 1; level <= 3; level += 1) {
        const battle = battleWith(10_000);
        expect(giveCommand(battle, { kind: "place", padId: "p05", classId })).toEqual({ ok: true });
        for (let l = 2; l <= level; l += 1) expect(giveCommand(battle, { kind: "upgrade", padId: "p05" })).toEqual({ ok: true });
        const before = battle.credits;
        expect(giveCommand(battle, { kind: "sell", padId: "p05" })).toEqual({ ok: true });
        expect(battle.credits - before, `${classId} level ${level}`).toBe(C52_REFUNDS[classId][level - 1]);
      }
    }
  });
});

describe("prices come from the ruleset (C5.2)", () => {
  it("a purchase takes the level-1 price and an upgrade the next level's price, for every class", () => {
    const prices: Record<string, number[]> = {};
    for (const classId of ALL_CLASSES) {
      const battle = battleWith(10_000);
      const paid: number[] = [];
      let credits = battle.credits;
      for (const command of [
        { kind: "place", padId: "p09", classId },
        { kind: "upgrade", padId: "p09" },
        { kind: "upgrade", padId: "p09" },
      ] as const) {
        giveCommand(battle, command);
        paid.push(credits - battle.credits);
        credits = battle.credits;
      }
      prices[classId] = paid;
    }
    expect(prices).toEqual({
      nova: [50, 60, 150],
      pip: [60, 80, 170],
      juno: [110, 130, 260],
      orion: [170, 100, 330],
      mira: [160, 180, 280],
      sol: [150, 200, 300],
    });
  });

  it("refuses a purchase or upgrade one credit short, leaving credits alone", () => {
    const battle = battleWith(169);
    expect(giveCommand(battle, { kind: "place", padId: "p02", classId: "orion" })).toEqual({ ok: false, reason: "NOT_ENOUGH_CREDITS" });
    expect(giveCommand(battle, { kind: "place", padId: "p02", classId: "mira" })).toEqual({ ok: true }); // 160
    expect(giveCommand(battle, { kind: "upgrade", padId: "p02" })).toEqual({ ok: false, reason: "NOT_ENOUGH_CREDITS" }); // 180 > 9
    expect(battle.credits).toBe(9);
  });
});

describe("upgrades stop at level 3", () => {
  it("every class: the fourth level is refused with MAX_LEVEL and costs nothing", () => {
    for (const classId of ALL_CLASSES) {
      const battle = battleWith(10_000, [{ padId: "p12", classId, level: 3, targeting: challenge.classes[classId]?.defaultTargeting ?? "FRONT" }]);
      expect(giveCommand(battle, { kind: "upgrade", padId: "p12" }), classId).toEqual({ ok: false, reason: "MAX_LEVEL" });
      expect(battle.credits).toBe(10_000);
      expect(battle.towers[0]?.level).toBe(3);
    }
  });

  it("mid-wave, two upgrades queued for a level-2 astronaut: the first applies, the second is MAX_LEVEL", () => {
    const battle = battleWith(1000, [{ padId: "p04", classId: "juno", level: 2, targeting: "CROWD" }]);
    startWave(battle);
    giveCommand(battle, { kind: "upgrade", padId: "p04" });
    giveCommand(battle, { kind: "upgrade", padId: "p04" });
    step(battle);
    expect([battle.credits, battle.towers[0]?.level]).toEqual([1000 - 260, 3]);
    expect(rejections(battle)).toEqual(["MAX_LEVEL"]);
  });
});

describe("deployment caps (C5.8)", () => {
  it("each class's cap from the ruleset: Nova none, Pip 3, Juno 4, Orion 3, Mira 2, Sol 2", () => {
    expect(Object.fromEntries(ALL_CLASSES.map((id) => [id, challenge.classes[id]?.deployCap]))).toEqual({
      nova: null,
      pip: 3,
      juno: 4,
      orion: 3,
      mira: 2,
      sol: 2,
    });
  });

  it("refuses one more than the cap with DEPLOY_CAP; a sale frees a place; Nova fills every open pad", () => {
    for (const classId of ALL_CLASSES) {
      const cap = challenge.classes[classId]?.deployCap ?? OPEN_PADS.length;
      const battle = battleWith(10_000);
      const results = OPEN_PADS.map((padId) => giveCommand(battle, { kind: "place", padId, classId }));
      expect(results.filter((r) => r.ok).length, classId).toBe(Math.min(cap, OPEN_PADS.length));
      if (cap < OPEN_PADS.length) {
        expect(results[cap], classId).toEqual({ ok: false, reason: "DEPLOY_CAP" });
        giveCommand(battle, { kind: "sell", padId: OPEN_PADS[0] });
        expect(giveCommand(battle, { kind: "place", padId: OPEN_PADS[cap] ?? "", classId }), classId).toEqual({ ok: true });
      }
    }
  });

  it("purchases queued in one tick count the ones before them: three Pips apply, the fourth is DEPLOY_CAP", () => {
    const battle = battleWith(1000);
    startWave(battle);
    for (const padId of ["p02", "p04", "p05", "p09"]) giveCommand(battle, { kind: "place", padId, classId: "pip" });
    step(battle);
    expect(battle.towers.map((t) => t.padId)).toEqual(["p02", "p04", "p05"]);
    expect(rejections(battle)).toEqual(["DEPLOY_CAP"]);
    expect(battle.credits).toBe(1000 - 3 * 60);
  });
});

describe("unlock order (C5.9): 'after wave 5' means available while preparing wave 6", () => {
  it("in a CAMPAIGN, each class is CLASS_LOCKED at wave unlockAfterWave and placeable at the next wave", () => {
    const unlocks = { nova: 0, pip: 5, juno: 10, orion: 15, mira: 20, sol: 25 } as const;
    for (const classId of ALL_CLASSES) {
      const after = unlocks[classId];
      expect(campaign.classes[classId]?.unlockAfterWave).toBe(after);
      if (after > 0) {
        const early = battleWith(10_000, [], campaign, after);
        expect(giveCommand(early, { kind: "place", padId: "p02", classId }), `${classId} at wave ${after}`).toEqual({
          ok: false,
          reason: "CLASS_LOCKED",
        });
        expect(early.credits).toBe(10_000);
      }
      const ready = battleWith(10_000, [], campaign, after + 1);
      expect(giveCommand(ready, { kind: "place", padId: "p02", classId }), `${classId} at wave ${after + 1}`).toEqual({ ok: true });
    }
  });

  it("the classes a campaign offers while preparing waves 1, 6, 11, 16, 21 and 26", () => {
    const offered = (wave: number) => ALL_CLASSES.filter((id) => classAvailability(campaign, id, wave) === "AVAILABLE");
    expect([1, 6, 11, 16, 21, 26].map(offered)).toEqual([
      ["nova"],
      ["nova", "pip"],
      ["nova", "pip", "juno"],
      ["nova", "pip", "juno", "orion"],
      ["nova", "pip", "juno", "orion", "mira"],
      ["nova", "pip", "juno", "orion", "mira", "sol"],
    ]);
  });

  it("a CHALLENGE offers exactly its listed classes from its first wave (C13), and refuses any other", () => {
    expect(ALL_CLASSES.map((id) => classAvailability(challenge, id, 1))).toEqual(Array(6).fill("AVAILABLE"));
    const m1 = compileBattleConfig(r2, parsePlanet(PLANET_RAW, r2), "first-contact"); // classes: nova only
    const battle = createBattle(m1, snapshot(1000), 1, SEED);
    expect(giveCommand(battle, { kind: "place", padId: "p02", classId: "sol" })).toEqual({ ok: false, reason: "CLASS_UNAVAILABLE" });
    expect(giveCommand(battle, { kind: "place", padId: "p02", classId: "comet" })).toEqual({ ok: false, reason: "CLASS_UNAVAILABLE" });
  });
});

describe("targeting changes (C5.3)", () => {
  it("a new astronaut takes its class's default mode: Juno CROWD, the others FRONT", () => {
    const battle = battleWith(10_000);
    for (const [padId, classId] of [["p02", "nova"], ["p04", "pip"], ["p05", "juno"], ["p09", "orion"], ["p12", "mira"], ["p16", "sol"]] as const) {
      giveCommand(battle, { kind: "place", padId, classId });
    }
    expect(battle.towers.map((t) => `${t.classId}:${t.targeting}`)).toEqual([
      "nova:FRONT",
      "pip:FRONT",
      "juno:CROWD",
      "orion:FRONT",
      "mira:FRONT",
      "sol:FRONT",
    ]);
  });

  it("Orion gains STRONG at level 3; Mira and Sol have no modes to change; a mode a class lacks is refused", () => {
    const battle = battleWith(10_000);
    giveCommand(battle, { kind: "place", padId: "p02", classId: "orion" });
    giveCommand(battle, { kind: "place", padId: "p04", classId: "mira" });
    const strong: Command = { kind: "setTargeting", padId: "p02", targeting: "STRONG" };
    expect(giveCommand(battle, strong)).toEqual({ ok: false, reason: "TARGETING_UNAVAILABLE" }); // level 1
    giveCommand(battle, { kind: "upgrade", padId: "p02" });
    expect(giveCommand(battle, strong)).toEqual({ ok: false, reason: "TARGETING_UNAVAILABLE" }); // level 2
    giveCommand(battle, { kind: "upgrade", padId: "p02" });
    expect(giveCommand(battle, strong)).toEqual({ ok: true }); // level 3
    expect(giveCommand(battle, { kind: "setTargeting", padId: "p02", targeting: "FAST" })).toEqual({ ok: false, reason: "TARGETING_UNAVAILABLE" });
    expect(giveCommand(battle, { kind: "setTargeting", padId: "p04", targeting: "FRONT" })).toEqual({ ok: false, reason: "TARGETING_UNAVAILABLE" });
    expect(battle.towers.map((t) => t.targeting)).toEqual(["STRONG", "FRONT"]);
  });
});

describe("checkCommand previews exactly what applying would do", () => {
  it("agrees with giveCommand in preparation and changes nothing itself", () => {
    const battle = battleWith(100, [{ padId: "p02", classId: "mira", level: 1, targeting: "FRONT" }]);
    const tries: Command[] = [
      { kind: "place", padId: "p02", classId: "nova" },
      { kind: "place", padId: "p03", classId: "nova" },
      { kind: "place", padId: "p04", classId: "orion" },
      { kind: "upgrade", padId: "p02" },
      { kind: "setTargeting", padId: "p02", targeting: "FAST" },
      { kind: "place", padId: "p04", classId: "nova" },
      { kind: "sell", padId: "p02" },
    ];
    for (const command of tries) {
      const credits = battle.credits;
      const preview = checkCommand(battle, command);
      expect(battle.credits).toBe(credits);
      expect(giveCommand(battle, command), JSON.stringify(command)).toEqual(preview);
    }
  });
});

describe("what each class does when it fires (C5.2), as far as Phase 24 goes", () => {
  // Pad p04 is at (6, 5). The route runs down x = 4 from (4, 2) to (4, 8): route progress 4 + (y - 2) tiles there.
  const at = (y: number): number => Math.round((4 + (y - 2)) * UNITS_PER_TILE);
  function alien(id: number, y: number): AlienState {
    return { id, type: "blob", hp: 24, maxHp: 24, progress: at(y), speed: 1000, slowPct: 0, slowTicksLeft: 0, look: 0, bubbles: 0, depth: 0, cargo: [] };
  }
  /**
   * One tick with these aliens on the route and one astronaut on p04, aiming with `mode` (default: the class's default
   * mode); returns each alien's health afterwards.
   */
  function oneTick(classId: string, level: number, ys: readonly number[], mode?: Targeting): number[] {
    const targeting = mode ?? challenge.classes[classId]?.defaultTargeting ?? "FRONT";
    const battle = battleWith(0, [{ padId: "p04", classId, level, targeting }]);
    startWave(battle);
    battle.spawnIndex = challenge.waves[0]?.spawns.length ?? 0; // no scheduled spawns: only the aliens below
    battle.aliens = ys.map((y, i) => alien(i + 1, y));
    battle.nextAlienId = ys.length + 1;
    step(battle);
    return ys.map((_, i) => battle.aliens.find((a) => a.id === i + 1)?.hp ?? 0);
  }

  it("Juno's blast hits the target and every alien within the splash radius, inclusive (1 tile at level 1, 1.4 at 2)", () => {
    // Aiming FRONT, the target is the alien furthest along, at y = 6 (in range: sqrt(2^2 + 1^2) = 2.24 tiles). Others
    // 1.0 and 1.4 tiles behind. (Juno's default CROWD would aim at the middle one: support.test.ts.)
    expect(oneTick("juno", 1, [6, 5, 4.6], "FRONT")).toEqual([24 - 16, 24 - 16, 24]);
    expect(oneTick("juno", 2, [6, 5, 4.6], "FRONT")).toEqual([24 - 16, 24 - 16, 24 - 16]);
    expect(oneTick("juno", 3, [6, 5, 4.5], "FRONT")).toEqual([24 - 24, 24 - 24, 24]); // 26 damage defeats both; 1.5 tiles is outside
  });

  it("Nova, Orion and Pip hit one alien only (Pip's slow: support.test.ts)", () => {
    expect(oneTick("nova", 1, [6, 5.5])).toEqual([24 - 10, 24]);
    expect(oneTick("orion", 1, [6, 5.5])).toEqual([0, 24]); // 50 damage
    expect(oneTick("pip", 1, [6, 5.5])).toEqual([24 - 5, 24]);
  });

  it("Mira and Sol never fire", () => {
    expect(oneTick("mira", 3, [6, 5])).toEqual([24, 24]);
    expect(oneTick("sol", 3, [6, 5])).toEqual([24, 24]);
  });

  it("a blast pays the bounty of every alien it defeats", () => {
    const battle = battleWith(0, [{ padId: "p04", classId: "juno", level: 3, targeting: "CROWD" }]);
    startWave(battle);
    battle.spawnIndex = challenge.waves[0]?.spawns.length ?? 0;
    battle.aliens = [alien(1, 6), alien(2, 5.2)];
    battle.nextAlienId = 3;
    step(battle);
    expect([battle.credits, battle.stats.defeated, battle.stats.shots, battle.stats.damage]).toEqual([8, 2, 1, 48]); // 2 x bounty 4
    expect(battle.status).toBe("CLEARED");
  });
});
