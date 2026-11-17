// Game data (Phase 13, M1-23): the repository's game-data/ builds, the G-15 wave-set action limit refuses an oversized
// wave set, version strings are path-safe, and the bounds fixture api/tests reads is the generated one. Phase 24
// (M2-01): ruleset r2 and the mechanics 2 parse rules for the six-class roster. Phase 26 (M2-03): ruleset r3 and the
// mechanics 3 parse rules for the alien catalogue, traits, releases and cargo.
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildGameData, GAME_DATA_DIR, staleBoundsFixture } from "../../scripts/build-bounds";
import {
  boundsVersion,
  buildBounds,
  CAMPAIGN_METEOR_AFTER,
  checkVersion,
  createRunActions,
  GameDataError,
  KEY_ID_PATTERN,
  LEVELS_PER_CLASS,
  MAX_TRANSACTION_ACTIONS,
  parseCurrent,
  parsePlanet,
  parseRuleset,
  placementTargetings,
  SUPPORTED_MECHANICS,
  targetingAllowed,
  TARGETING_MODES,
  VERSION_PATTERN,
  type PlanetDocument,
  type Ruleset,
} from "./game-data";
import { LIMITS } from "../rules/contracts.generated";

type JsonObject = Record<string, unknown>;

const readJson = (path: string): JsonObject => JSON.parse(readFileSync(path, "utf8")) as JsonObject;
const RULESET_RAW = readJson(join(GAME_DATA_DIR, "ruleset", "r1.json"));
const RULESET2_RAW = readJson(join(GAME_DATA_DIR, "ruleset", "r2.json"));
const RULESET3_RAW = readJson(join(GAME_DATA_DIR, "ruleset", "r3.json"));
const PLANET_RAW = readJson(join(GAME_DATA_DIR, "campaign", "luna-1-c1.json"));
const OVERSIZED_RAW = readJson(resolve(import.meta.dirname, "fixtures", "g15-oversized-planet.json"));
const ruleset: Ruleset = parseRuleset(RULESET_RAW);
const planet: PlanetDocument = parsePlanet(PLANET_RAW, ruleset);

/** A deep copy that can be changed freely. */
const copy = <T>(value: T): T => structuredClone(value);

describe("the repository's game-data/", () => {
  it("builds: every file parses, versions match file names, current.json names files that exist", () => {
    const build = buildGameData();
    expect([...build.files.keys()]).toEqual([
      "ruleset/r1.json",
      "ruleset/r2.json",
      "ruleset/r3.json",
      "campaign/luna-1-c1.json",
      "bounds/r1__luna-1-c1.json",
      "current.json",
    ]);
    expect(build.current).toEqual({ rulesetVersion: "r1", campaignVersion: "luna-1-c1" });
  });

  it("copies ruleset and planet files byte for byte (they are published create-only)", () => {
    const build = buildGameData();
    expect(build.files.get("ruleset/r1.json")).toBe(readFileSync(join(GAME_DATA_DIR, "ruleset", "r1.json"), "utf8"));
    expect(build.files.get("current.json")).toBe(readFileSync(join(GAME_DATA_DIR, "current.json"), "utf8"));
  });

  it("every version string matches ^[a-z0-9.-]{1,40}$ (H.8.5)", () => {
    const build = buildGameData();
    for (const path of build.files.keys()) {
      if (path === "current.json") continue;
      const version = path.split("/")[1]?.replace(/\.json$/, "") ?? "";
      for (const part of version.split("__")) expect(part).toMatch(VERSION_PATTERN);
    }
  });

  it("the ruleset declares mechanics 1, which this game-core supports", () => {
    expect(ruleset.mechanics).toBe(1);
    expect(SUPPORTED_MECHANICS).toContain(1);
  });

  it("the M1 wave set is J-1: CHALLENGE, two waves, one normal interval (slot N-001), no meteorAfter", () => {
    const set = planet.waveSets["first-contact"];
    expect(set).toBeDefined();
    expect(set?.mode).toBe("CHALLENGE");
    expect(set?.waves).toEqual([1, 2]);
    expect(set?.meteorAfter).toEqual([]);
    expect(set?.classes).toEqual(["nova"]);
    expect(Object.keys(planet.waveSets)).toEqual(["first-contact"]); // no campaign entry until Phase 50 (F 3.7)
    const bounds = buildBounds(ruleset, planet).waveSets["first-contact"];
    expect(bounds?.createRunActions).toBe(4); // F 3.7: SESSION, RUN, one slot, PROFILE check
    expect(bounds?.normalRewardByInterval).toEqual([30]); // C13: challenge slots use the campaign table (C9.2)
  });

  it("the bounds fixture api/tests loads is the generated file (run build-bounds.ts --write-fixture if this fails)", () => {
    expect(staleBoundsFixture()).toBe("");
  });

  it("bounds carry each class's targeting modes, so the server can check 'targeting valid' (spine S6 rule 4)", () => {
    const bounds = buildBounds(ruleset, planet);
    expect(bounds.classes["nova"]?.targeting).toEqual(["FRONT", "FAST"]); // C5.2
  });
});

describe("the copies of contracts/limits.json in this module (it imports nothing, so it cannot read LIMITS)", () => {
  it("version pattern, key-ID pattern, G-15 limit, levels and targeting modes equal limits.json", () => {
    expect(VERSION_PATTERN.source).toBe(LIMITS.gameData.versionPattern);
    expect(KEY_ID_PATTERN.source).toBe(LIMITS.ids.keyId);
    expect(MAX_TRANSACTION_ACTIONS).toBe(LIMITS.gameData.createRunMaxActions);
    expect(LEVELS_PER_CLASS).toBe(LIMITS.placementLevel.max);
    expect([...TARGETING_MODES]).toEqual([...LIMITS.targeting]);
  });
});

describe("G-15: the wave-set action limit (spine S5.1, H.10)", () => {
  it("counts 3 + (finalWave - 1) + len(meteorAfter)", () => {
    expect(createRunActions(2, 0)).toBe(4); // M1
    expect(createRunActions(50, CAMPAIGN_METEOR_AFTER.length)).toBe(57); // the campaign (F 12.3)
  });

  it("refuses the deliberately oversized fixture (101 actions)", () => {
    expect(() => parsePlanet(OVERSIZED_RAW, ruleset)).toThrow(GameDataError);
    expect(() => parsePlanet(OVERSIZED_RAW, ruleset)).toThrow(/G-15: .* = 101 TransactWriteItems actions/);
  });

  it("accepts the same wave set at exactly 100 actions", () => {
    const atLimit = copy(OVERSIZED_RAW);
    const sets = atLimit["waveSets"] as Record<string, JsonObject>;
    const set = sets["too-long"] as JsonObject;
    set["meteorAfter"] = [];
    // r1 prices intervals 1-49 only (C9.2); a 98-wave set also needs intervals 50-97 priced to get past G-15.
    const wide = copy(RULESET_RAW);
    const economy = wide["economy"] as JsonObject;
    economy["learningRewardByBlock"] = [
      ...(economy["learningRewardByBlock"] as JsonObject[]),
      { afterWaveFrom: 50, afterWaveTo: 99, credits: 75 },
    ];
    const wideRuleset = parseRuleset(wide);
    const parsed = parsePlanet(atLimit, wideRuleset);
    expect(buildBounds(wideRuleset, parsed).waveSets["too-long"]?.createRunActions).toBe(MAX_TRANSACTION_ACTIONS);
    // ...and the oversized original is still refused by G-15 under that ruleset, not by anything else.
    expect(() => parsePlanet(OVERSIZED_RAW, wideRuleset)).toThrow(/G-15/);
  });

  it("stops the whole game-data build when an oversized planet is in game-data/campaign/", () => {
    const dir = scratchCopy();
    try {
      writeFileSync(join(dir, "campaign", "g15-oversized.json"), JSON.stringify(OVERSIZED_RAW));
      expect(() => buildGameData(dir)).toThrow(/G-15/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("version strings", () => {
  it.each(["r1", "luna-1-c1", "1.2.3", "a".repeat(40)])("accepts %s", (v) => {
    expect(checkVersion(v, "v")).toBe(v);
  });

  it.each(["", "R1", "r_1", "r1__c1", "r/1", "r 1", "a".repeat(41), 7])("refuses %s", (v) => {
    expect(() => checkVersion(v, "v")).toThrow(GameDataError);
  });

  it("names a bounds file <rulesetVersion>__<campaignVersion>", () => {
    expect(boundsVersion("r1", "luna-1-c1")).toBe("r1__luna-1-c1");
    expect(() => boundsVersion("r1", "Luna")).toThrow(GameDataError);
  });

  it("current.json must name two valid versions and nothing else", () => {
    expect(parseCurrent({ rulesetVersion: "r1", campaignVersion: "luna-1-c1" })).toEqual({
      rulesetVersion: "r1",
      campaignVersion: "luna-1-c1",
    });
    expect(() => parseCurrent({ rulesetVersion: "r1" })).toThrow(/campaignVersion" is missing/);
    expect(() => parseCurrent({ rulesetVersion: "r1", campaignVersion: "c1", extra: 1 })).toThrow(/unknown key "extra"/);
    expect(() => parseCurrent({ rulesetVersion: "r1", campaignVersion: "C1" })).toThrow(GameDataError);
  });
});

describe("parse rules", () => {
  it("refuses an unknown key, so a misspelt field cannot be ignored", () => {
    const bad = copy(RULESET_RAW);
    (bad["colony"] as JsonObject)["maxHelth"] = 20;
    expect(() => parseRuleset(bad)).toThrow(/ruleset.colony: unknown key "maxHelth"/);
  });

  it("refuses a mechanics number this game-core does not support", () => {
    expect(() => parseRuleset({ ...copy(RULESET_RAW), mechanics: 99 })).toThrow(/mechanics: 99 is not supported/);
  });

  it("refuses a fractional cost (credits are integers, C2.2)", () => {
    const bad = copy(RULESET_RAW);
    const nova = (bad["classes"] as Record<string, JsonObject>)["nova"] as JsonObject;
    (nova["levels"] as JsonObject[])[0] = { level: 1, cost: 50.5, range: 2.5, period: 1, damage: 10 };
    expect(() => parseRuleset(bad)).toThrow(/levels\[0\].cost: must be an integer/);
  });

  it("refuses a wave that names an alien the ruleset does not have", () => {
    const bad = copy(PLANET_RAW);
    const wave = (bad["waves"] as JsonObject[])[0] as JsonObject;
    wave["groups"] = [{ type: "mite", count: 3, at: 0, gap: 1 }];
    expect(() => parsePlanet(bad, ruleset)).toThrow(/alien "mite" is not in ruleset r1/);
  });

  it("refuses a wave set that references a wave the planet does not author", () => {
    const bad = copy(PLANET_RAW);
    ((bad["waveSets"] as Record<string, JsonObject>)["first-contact"] as JsonObject)["waves"] = [1, 3];
    expect(() => parsePlanet(bad, ruleset)).toThrow(/authored wave 3 is not in this planet document/);
  });

  it("refuses a meteor challenge after the final wave", () => {
    const bad = copy(PLANET_RAW);
    ((bad["waveSets"] as Record<string, JsonObject>)["first-contact"] as JsonObject)["meteorAfter"] = [2];
    expect(() => parsePlanet(bad, ruleset)).toThrow(/meteorAfter/);
  });

  it("refuses a diagonal route segment (C2.2: horizontal and vertical only)", () => {
    const bad = copy(PLANET_RAW);
    (bad["map"] as JsonObject)["route"] = [
      [0, 2],
      [4, 6],
    ];
    expect(() => parsePlanet(bad, ruleset)).toThrow(/horizontal or vertical/);
  });

  it("refuses a preset placement on a pad that is not open yet", () => {
    const bad = copy(PLANET_RAW);
    ((bad["waveSets"] as Record<string, JsonObject>)["first-contact"] as JsonObject)["presetPlacements"] = [
      { padId: "p03", classId: "nova", level: 1, targeting: "FRONT" },
    ];
    expect(() => parsePlanet(bad, ruleset)).toThrow(/pad "p03" is not open when preparing wave 1/);
  });

  it("holds a CAMPAIGN wave set to the campaign's shape (50 waves, meteors after 9, 19, 29, 39, 49)", () => {
    const withCampaign = (waves: number[], meteorAfter: readonly number[]): JsonObject => {
      const doc = copy(PLANET_RAW);
      doc["waves"] = Array.from({ length: 50 }, (_, i) => ({
        wave: i + 1,
        groups: [{ type: "blob", count: 1, at: 0, gap: 0 }],
        hpMult: 1,
        speedMult: 1,
      }));
      (doc["waveSets"] as Record<string, JsonObject>)["campaign"] = {
        mode: "CAMPAIGN",
        name: "Big adventure",
        waves,
        meteorAfter: [...meteorAfter],
        startCredits: 150,
        colonyHealth: 20,
        classes: ["nova"],
        padsOpenAsForWave: 1,
        presetPlacements: [],
      };
      return doc;
    };
    const fifty = Array.from({ length: 50 }, (_, i) => i + 1);
    const ok = parsePlanet(withCampaign(fifty, CAMPAIGN_METEOR_AFTER), ruleset);
    expect(buildBounds(ruleset, ok).waveSets["campaign"]?.createRunActions).toBe(57);
    expect(() => parsePlanet(withCampaign(fifty.slice(0, 49), CAMPAIGN_METEOR_AFTER.slice(0, 4)), ruleset)).toThrow(
      /waves 1 to 50/,
    );
    expect(() => parsePlanet(withCampaign(fifty, [10, 20, 30, 40, 49]), ruleset)).toThrow(/meteor challenges follow/);
  });
});

describe("ruleset r2 and mechanics 2 (Phase 24, M2-01; ADR-0033)", () => {
  const r2 = parseRuleset(RULESET2_RAW);
  const classOf = (raw: JsonObject, id: string): JsonObject => (raw["classes"] as Record<string, JsonObject>)[id] as JsonObject;

  it("is a new version beside r1 (r1 is published, so it is never edited), and current.json still names r1", () => {
    expect([r2.version, r2.mechanics]).toEqual(["r2", 2]);
    expect(SUPPORTED_MECHANICS).toEqual([1, 2, 3]);
    expect(buildGameData().current.rulesetVersion).toBe("r1");
    expect(buildGameData().files.get("ruleset/r2.json")).toBe(readFileSync(join(GAME_DATA_DIR, "ruleset", "r2.json"), "utf8"));
  });

  it("the planet document parses against r2 as well, so r2 can be played on Moonbeam Colony", () => {
    expect(parsePlanet(PLANET_RAW, r2).version).toBe("luna-1-c1");
  });

  it("each attack kind has its own level fields (C5.2)", () => {
    expect(Object.fromEntries(Object.entries(r2.classes).map(([id, c]) => [id, [c.attack, Object.keys(c.levels[0] ?? {})]]))).toEqual({
      juno: ["blast", ["level", "cost", "range", "period", "damage", "splashRadius"]],
      mira: ["shield", ["level", "cost", "shieldPoints", "period", "repairOnWaveClear"]],
      nova: ["single", ["level", "cost", "range", "period", "damage"]],
      orion: ["single", ["level", "cost", "range", "period", "damage"]],
      pip: ["slow", ["level", "cost", "range", "period", "damage", "slowPct", "slowDuration", "slowRadius"]],
      sol: ["buff", ["level", "cost", "buffPct", "radius"]],
    });
  });

  it("mechanics 1 still refuses what only mechanics 2 knows: another attack kind, or targetingFromLevel", () => {
    const blast = copy(RULESET_RAW);
    classOf(blast, "nova")["attack"] = "blast";
    expect(() => parseRuleset(blast)).toThrow(/nova.attack: must be one of single, got "blast"/);
    const fromLevel = copy(RULESET_RAW);
    classOf(fromLevel, "nova")["targetingFromLevel"] = { FAST: 1 };
    expect(() => parseRuleset(fromLevel)).toThrow(/nova: unknown key "targetingFromLevel"/);
  });

  it("refuses a level without its attack kind's fields, or with another kind's", () => {
    const noSplash = copy(RULESET2_RAW);
    delete ((classOf(noSplash, "juno")["levels"] as JsonObject[])[1] as JsonObject)["splashRadius"];
    expect(() => parseRuleset(noSplash)).toThrow(/juno.levels\[1\]: "splashRadius" is missing/);
    const shieldDamage = copy(RULESET2_RAW);
    ((classOf(shieldDamage, "mira")["levels"] as JsonObject[])[0] as JsonObject)["damage"] = 5;
    expect(() => parseRuleset(shieldDamage)).toThrow(/mira.levels\[0\]: unknown key "damage"/);
  });

  it("support classes have no targeting modes and store FRONT; attackers need one or two", () => {
    const aimingMira = copy(RULESET2_RAW);
    classOf(aimingMira, "mira")["targeting"] = ["FRONT"];
    expect(() => parseRuleset(aimingMira)).toThrow(/mira.targeting: must have 0 to 0 items/);
    const solStrong = copy(RULESET2_RAW);
    classOf(solStrong, "sol")["defaultTargeting"] = "STRONG";
    expect(() => parseRuleset(solStrong)).toThrow(/sol.defaultTargeting: must be "FRONT" for a class that does not aim/);
    const blindNova = copy(RULESET2_RAW);
    classOf(blindNova, "nova")["targeting"] = [];
    expect(() => parseRuleset(blindNova)).toThrow(/nova.targeting: must have 1 to 2 items/);
  });

  it("targetingFromLevel names only the class's modes, and the default mode is open at level 1", () => {
    const stranger = copy(RULESET2_RAW);
    classOf(stranger, "orion")["targetingFromLevel"] = { CROWD: 2 };
    expect(() => parseRuleset(stranger)).toThrow(/orion.targetingFromLevel: unknown key "CROWD"/);
    const lateDefault = copy(RULESET2_RAW);
    classOf(lateDefault, "juno")["targetingFromLevel"] = { CROWD: 2 };
    expect(() => parseRuleset(lateDefault)).toThrow(/juno.targetingFromLevel: the default mode must be available from level 1/);
  });

  it("CROWD belongs to a blast class only: it counts the aliens inside the blast (C5.3, Phase 25)", () => {
    const crowdNova = copy(RULESET2_RAW);
    classOf(crowdNova, "nova")["targeting"] = ["FRONT", "CROWD"];
    classOf(crowdNova, "nova")["targetingFromLevel"] = {};
    expect(() => parseRuleset(crowdNova)).toThrow(/nova.targeting: CROWD needs a blast attack/);
  });

  it("the slow block (C5.4, Phase 25): required in mechanics 2, refused in mechanics 1, cap below 100", () => {
    expect(r2.slow).toEqual({ capPct: 50, refreshWithinSeconds: 0.15 });
    expect(ruleset.slow).toBeUndefined();
    const missing = copy(RULESET2_RAW);
    delete missing["slow"];
    expect(() => parseRuleset(missing)).toThrow(/ruleset.slow: must be an object/);
    const inR1 = copy(RULESET_RAW);
    inR1["slow"] = { capPct: 50, refreshWithinSeconds: 0.15 };
    expect(() => parseRuleset(inR1)).toThrow(/ruleset.slow: is mechanics 2; mechanics 1 has no slow attack/);
    const stopped = copy(RULESET2_RAW);
    stopped["slow"] = { capPct: 100, refreshWithinSeconds: 0.15 };
    expect(() => parseRuleset(stopped)).toThrow(/ruleset.slow.capPct: must be between 1 and 99/);
  });

  it("which modes a placement may store, by level (C5.3: Orion's STRONG from level 3)", () => {
    const orion = r2.classes["orion"];
    const mira = r2.classes["mira"];
    if (orion === undefined || mira === undefined) throw new Error("r2 lacks orion or mira");
    expect([1, 2, 3].map((level) => targetingAllowed(orion, "STRONG", level))).toEqual([false, false, true]);
    expect(targetingAllowed(orion, "FRONT", 1)).toBe(true);
    expect(placementTargetings(mira)).toEqual(["FRONT"]);
    expect(targetingAllowed(mira, "FAST", 3)).toBe(false);
  });

  it("refuses a preset placement whose mode is not open at its level", () => {
    const doc = copy(PLANET_RAW);
    const set = (doc["waveSets"] as Record<string, JsonObject>)["first-contact"] as JsonObject;
    set["classes"] = ["nova", "orion", "mira"];
    set["presetPlacements"] = [{ padId: "p02", classId: "orion", level: 1, targeting: "STRONG" }];
    expect(() => parsePlanet(doc, r2)).toThrow(/orion at level 1 has no STRONG mode/);
    set["presetPlacements"] = [
      { padId: "p02", classId: "orion", level: 3, targeting: "STRONG" },
      { padId: "p04", classId: "mira", level: 1, targeting: "FRONT" },
    ];
    expect(parsePlanet(doc, r2).waveSets["first-contact"]?.presetPlacements).toHaveLength(2);
  });

  it("bounds for r2 carry every class's unlock wave, cap, placement modes and costs (spine S6 rule 4)", () => {
    const bounds = buildBounds(r2, parsePlanet(PLANET_RAW, r2));
    expect(bounds.classes).toEqual({
      juno: { unlockAfterWave: 10, deployCap: 4, targeting: ["CROWD", "FRONT"], levelCosts: [110, 130, 260], cumulativeCosts: [110, 240, 500] },
      mira: { unlockAfterWave: 20, deployCap: 2, targeting: ["FRONT"], levelCosts: [160, 180, 280], cumulativeCosts: [160, 340, 620] },
      nova: { unlockAfterWave: 0, deployCap: null, targeting: ["FRONT", "FAST"], levelCosts: [50, 60, 150], cumulativeCosts: [50, 110, 260] },
      orion: { unlockAfterWave: 15, deployCap: 3, targeting: ["FRONT", "STRONG"], levelCosts: [170, 100, 330], cumulativeCosts: [170, 270, 600] },
      pip: { unlockAfterWave: 5, deployCap: 3, targeting: ["FRONT", "FAST"], levelCosts: [60, 80, 170], cumulativeCosts: [60, 140, 310] },
      sol: { unlockAfterWave: 25, deployCap: 2, targeting: ["FRONT"], levelCosts: [150, 200, 300], cumulativeCosts: [150, 350, 650] },
    }); // C5.1 unlocks and caps, C5.2 prices and the "Total cost to level 3" column, C5.8 caps
    expect(bounds.mechanics).toBe(2);
  });
});

describe("ruleset r3 and mechanics 3 (Phase 26, M2-03; ADR-0034)", () => {
  const r3 = parseRuleset(RULESET3_RAW);
  const aliensOf = (raw: JsonObject): Record<string, JsonObject> => raw["aliens"] as Record<string, JsonObject>;
  const traitsOf = (raw: JsonObject, id: string): JsonObject => (aliensOf(raw)[id] as JsonObject)["traits"] as JsonObject;
  /** The planet document with wave 1's only group replaced by `group`. */
  function planetWithGroup(group: JsonObject): JsonObject {
    const doc = copy(PLANET_RAW);
    ((doc["waves"] as JsonObject[])[0] as JsonObject)["groups"] = [group];
    return doc;
  }

  it("is a new version beside r1 and r2 (both published, never edited), and current.json still names r1", () => {
    expect([r3.version, r3.mechanics]).toEqual(["r3", 3]);
    expect(buildGameData().current.rulesetVersion).toBe("r1");
    expect(buildGameData().files.get("ruleset/r3.json")).toBe(readFileSync(join(GAME_DATA_DIR, "ruleset", "r3.json"), "utf8"));
  });

  it("the planet document parses against r3, and its bounds are r1's (Moon Blobs only)", () => {
    const bounds = buildBounds(r3, parsePlanet(PLANET_RAW, r3));
    expect(bounds.waveSets["first-contact"]?.maxBounty).toEqual([24, 32]);
    expect(bounds.mechanics).toBe(3);
  });

  it("mechanics 2 refuses traits (its simulation would ignore them); mechanics 3 requires them", () => {
    const traitsIn2 = copy(RULESET2_RAW);
    (aliensOf(traitsIn2)["blob"] as JsonObject)["traits"] = { armour: 4 };
    expect(() => parseRuleset(traitsIn2)).toThrow(/aliens.blob: unknown key "traits"/);
    const onlyIn2 = copy(RULESET2_RAW);
    (aliensOf(onlyIn2)["blob"] as JsonObject)["descendantOnly"] = true;
    expect(() => parseRuleset(onlyIn2)).toThrow(/aliens.blob: unknown key "descendantOnly"/);
    const missing = copy(RULESET3_RAW);
    delete (aliensOf(missing)["blob"] as JsonObject)["traits"];
    expect(() => parseRuleset(missing)).toThrow(/aliens.blob: "traits" is missing/);
  });

  it("refuses an unknown trait, a flag that is not true, and a non-integer armour", () => {
    const unknown = copy(RULESET3_RAW);
    traitsOf(unknown, "shell")["spikes"] = 2;
    expect(() => parseRuleset(unknown)).toThrow(/shell.traits: unknown key "spikes"/);
    const falseFlag = copy(RULESET3_RAW);
    traitsOf(falseFlag, "flutter")["flying"] = false;
    expect(() => parseRuleset(falseFlag)).toThrow(/flutter.traits.flying: must be true/);
    const fraction = copy(RULESET3_RAW);
    traitsOf(fraction, "shell")["armour"] = 4.5;
    expect(() => parseRuleset(fraction)).toThrow(/shell.traits.armour: must be an integer/);
  });

  it("C6.3: a release names aliens that exist and release nothing themselves (no Crafts or Split Slimes in cargo)", () => {
    const missing = copy(RULESET3_RAW);
    traitsOf(missing, "craft")["children"] = [{ type: "ghost", count: 4 }];
    expect(() => parseRuleset(missing)).toThrow(/craft.traits.children\[0\].type: alien "ghost" is not in this ruleset/);
    const nested = copy(RULESET3_RAW);
    traitsOf(nested, "craft")["children"] = [{ type: "slime", count: 2 }];
    expect(() => parseRuleset(nested)).toThrow(/craft.traits.children\[0\].type: "slime" releases aliens itself/);
    const splittingSlimelet = copy(RULESET3_RAW);
    traitsOf(splittingSlimelet, "slimelet")["children"] = [{ type: "blob", count: 1 }];
    expect(() => parseRuleset(splittingSlimelet)).toThrow(/slime.traits.children\[0\].type: "slimelet" releases aliens itself/);
  });

  it("C6.4: maxDescendantDepth 0 allows no carrier or splitter", () => {
    const shallow = copy(RULESET3_RAW);
    (shallow["caps"] as JsonObject)["maxDescendantDepth"] = 0;
    expect(() => parseRuleset(shallow)).toThrow(/craft.traits.children: maxDescendantDepth 0 allows no descendants/);
  });

  it("every healer shares one clock (C6.1), so all healers have the same period", () => {
    const two = copy(RULESET3_RAW);
    traitsOf(two, "blob")["healer"] = { amount: 6, radius: 1.5, period: 2.0 };
    expect(() => parseRuleset(two)).toThrow(/healer.period: every healer shares one clock/);
    traitsOf(two, "blob")["healer"] = { amount: 3, radius: 1.0, period: 3.0 };
    expect(parseRuleset(two).aliens["blob"]?.traits.healer).toEqual({ amount: 3, radius: 1, period: 3 });
  });

  it("a wave may name a carrier's cargo (C6.3), in mechanics 3 only, and the cargo follows the release rules", () => {
    const cargo = [{ type: "mite", count: 6 }];
    const craft = { type: "craft", count: 1, at: 0, gap: 0, cargo };
    expect(parsePlanet(planetWithGroup(craft), r3).waves[0]?.groups[0]?.cargo).toEqual(cargo);
    expect(() => parsePlanet(planetWithGroup(craft), parseRuleset(RULESET2_RAW))).toThrow(/groups\[0\]: unknown key "cargo"/);
    expect(() => parsePlanet(planetWithGroup({ ...craft, type: "blob" }), r3)).toThrow(/"blob" releases nothing, so it has no cargo/);
    expect(() => parsePlanet(planetWithGroup({ ...craft, cargo: [{ type: "craft", count: 1 }] }), r3)).toThrow(
      /cargo\[0\].type: "craft" releases aliens itself/,
    );
    const bounds = buildBounds(r3, parsePlanet(planetWithGroup(craft), r3));
    expect(bounds.waveSets["first-contact"]?.maxBounty[0]).toBe(6 + 6 * 2); // C6.3: parent and cargo are separate lines
  });

  it("a wave may not schedule a descendant-only alien (Slimelets only come out of Split Slimes)", () => {
    expect(() => parsePlanet(planetWithGroup({ type: "slimelet", count: 2, at: 0, gap: 1 }), r3)).toThrow(
      /"slimelet" is only ever released by another alien, never scheduled/,
    );
  });
});

describe("the game-data build refuses", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function scratch(): string {
    const dir = scratchCopy();
    dirs.push(dir);
    return dir;
  }

  it("a file whose version differs from its name", () => {
    const dir = scratch();
    writeFileSync(join(dir, "ruleset", "r2.json"), JSON.stringify(RULESET_RAW));
    expect(() => buildGameData(dir)).toThrow(/"version" is "r1" but the file is named r2.json/);
  });

  it("a current.json that names a missing file", () => {
    const dir = scratch();
    writeFileSync(join(dir, "current.json"), JSON.stringify({ rulesetVersion: "r9", campaignVersion: "luna-1-c1" }));
    expect(() => buildGameData(dir)).toThrow(/ruleset r9 is not in game-data\/ruleset/);
  });

  it("an unexpected file, so nothing is silently left unpublished", () => {
    const dir = scratch();
    writeFileSync(join(dir, "notes.json"), "{}");
    expect(() => buildGameData(dir)).toThrow(/unexpected entry/);
  });
});

/** A throwaway copy of game-data/ in the OS temp directory. */
function scratchCopy(): string {
  const dir = mkdtempSync(join(tmpdir(), "game-data-"));
  cpSync(GAME_DATA_DIR, dir, { recursive: true });
  return dir;
}
