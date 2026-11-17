// Game data (Phase 13, M1-23): the repository's game-data/ builds, the G-15 wave-set action limit refuses an oversized
// wave set, version strings are path-safe, and the bounds fixture api/tests reads is the generated one. Phase 24
// (M2-01): ruleset r2 and the mechanics 2 parse rules for the six-class roster. Phase 26 (M2-03): ruleset r3 and the
// mechanics 3 parse rules for the alien catalogue, traits, releases and cargo. Phase 27 (M2-04): the bosses in r3 and
// their parse rules. Phase 28 (M2-05): the meteor powers in r3 and their parse rules.
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
  meteorAward,
  parseCurrent,
  parsePlanet,
  parseRuleset,
  placementTargetings,
  POWER_EFFECTS,
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
      "ruleset/r4.json", // Phase 54: r3 + the endless generator (mechanics 4; not current yet)
      "campaign/luna-1-c1.json",
      "campaign/luna-1-c2.json", // Phase 50: the 50-wave campaign (needs r3; not current yet)
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
    expect(SUPPORTED_MECHANICS).toEqual([1, 2, 3, 4]); // mechanics 4: the endless generator (Phase 54)
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
      orion: {
        unlockAfterWave: 15,
        deployCap: 3,
        targeting: ["FRONT", "STRONG"],
        levelCosts: [170, 100, 330],
        cumulativeCosts: [170, 270, 600],
        targetingFromLevel: { STRONG: 3 }, // C5.3: Orion's STRONG from level 3 (Phase 30); no other mode opens above 1
      },
      pip: { unlockAfterWave: 5, deployCap: 3, targeting: ["FRONT", "FAST"], levelCosts: [60, 80, 170], cumulativeCosts: [60, 140, 310] },
      sol: { unlockAfterWave: 25, deployCap: 2, targeting: ["FRONT"], levelCosts: [150, 200, 300], cumulativeCosts: [150, 350, 650] },
    }); // C5.1 unlocks and caps, C5.2 prices and the "Total cost to level 3" column, C5.8 caps, C5.3 level-gated modes
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

describe("bosses in ruleset r3 (Phase 27, M2-04; C7; ADR-0034 amended)", () => {
  const r3 = parseRuleset(RULESET3_RAW);
  const bossesOf = (raw: JsonObject): Record<string, JsonObject> => raw["bosses"] as Record<string, JsonObject>;
  const phasesOf = (raw: JsonObject, id: string): JsonObject[] => (bossesOf(raw)[id] as JsonObject)["phases"] as JsonObject[];
  /** The planet document with wave 1's groups replaced. */
  function planetWithGroups(groups: JsonObject[]): JsonObject {
    const doc = copy(PLANET_RAW);
    ((doc["waves"] as JsonObject[])[0] as JsonObject)["groups"] = groups;
    return doc;
  }
  const boss = (type = "boss1"): JsonObject => ({ type, count: 1, at: 8, gap: 0 });

  it("r3 holds the five bosses of C7 under mechanics 3; r1 and r2 have none", () => {
    expect(Object.keys(r3.bosses)).toEqual(["boss1", "boss2", "boss3", "boss4", "boss5"]);
    expect(parseRuleset(RULESET_RAW).bosses).toEqual({});
    expect(parseRuleset(RULESET2_RAW).bosses).toEqual({});
  });

  it("mechanics 1 and 2 refuse bosses (their game-core would play a boss with no phases); mechanics 3 may leave them out", () => {
    const in2 = copy(RULESET2_RAW);
    in2["bosses"] = copy(RULESET3_RAW["bosses"]);
    expect(() => parseRuleset(in2)).toThrow(/ruleset.bosses: is mechanics 3; mechanics 1 and 2 have no bosses/);
    const none = copy(RULESET3_RAW);
    delete none["bosses"];
    expect(parseRuleset(none).bosses).toEqual({});
  });

  it("phases: the first starts at 100%, each next one strictly lower; the first may only set the boss's own layers", () => {
    const notFull = copy(RULESET3_RAW);
    (phasesOf(notFull, "boss1")[0] as JsonObject)["fromPct"] = 90;
    expect(() => parseRuleset(notFull)).toThrow(/boss1.phases\[0\].fromPct: must be between 100 and 100/);
    const notLower = copy(RULESET3_RAW);
    (phasesOf(notLower, "boss2")[2] as JsonObject)["fromPct"] = 60;
    expect(() => parseRuleset(notLower)).toThrow(/boss2.phases\[2\].fromPct: must be between 1 and 59/);
    const giftOnArrival = copy(RULESET3_RAW);
    (phasesOf(giftOnArrival, "boss3")[0] as JsonObject)["onEnter"] = { selfBubbles: 8, giveBubbles: { layers: 1, radius: 2 } };
    expect(() => parseRuleset(giftOnArrival)).toThrow(/boss3.phases\[0\].onEnter: unknown key "giveBubbles"/);
    const empty = copy(RULESET3_RAW);
    (phasesOf(empty, "boss1")[1] as JsonObject)["onEnter"] = {};
    expect(() => parseRuleset(empty)).toThrow(/boss1.phases\[1\].onEnter: is empty/);
    const fraction = copy(RULESET3_RAW);
    (phasesOf(fraction, "boss2")[0] as JsonObject)["armour"] = 5.5;
    expect(() => parseRuleset(fraction)).toThrow(/boss2.phases\[0\].armour: must be an integer/);
  });

  it("releases: aliens only, never a boss; a Split Slime is allowed (C6.3: only a boss release may contain one) if depth 2 is", () => {
    const bossInRelease = copy(RULESET3_RAW);
    (bossesOf(bossInRelease)["boss5"] as JsonObject)["onDefeatRelease"] = [{ type: "boss1", count: 1 }];
    expect(() => parseRuleset(bossInRelease)).toThrow(/boss5.onDefeatRelease\[0\].type: alien "boss1" is not in this ruleset/);
    expect(r3.bosses["boss5"]?.phases[2]?.onEnter?.release?.[0]).toEqual({ type: "slime", count: 2 });
    const shallow = copy(RULESET3_RAW);
    (shallow["caps"] as JsonObject)["maxDescendantDepth"] = 1;
    expect(() => parseRuleset(shallow)).toThrow(/boss5.phases\[2\].onEnter.release\[0\].type: releasing "slime" needs maxDescendantDepth 2/);
  });

  it("a boss ID may not also be an alien ID (a spawn group names one or the other)", () => {
    const clash = copy(RULESET3_RAW);
    bossesOf(clash)["blob"] = copy(bossesOf(clash)["boss1"] as JsonObject);
    expect(() => parseRuleset(clash)).toThrow(/bosses.blob: "blob" is also an alien/);
  });

  it("a wave may schedule one boss, once, with no cargo; only under a ruleset that has it", () => {
    const doc = planetWithGroups([{ type: "blob", count: 4, at: 0, gap: 2 }, boss()]);
    expect(parsePlanet(doc, r3).waves[0]?.groups[1]).toEqual({ type: "boss1", count: 1, at: 8, gap: 0 });
    expect(() => parsePlanet(doc, parseRuleset(RULESET2_RAW))).toThrow(/alien "boss1" is not in ruleset r2/);
    expect(() => parsePlanet(planetWithGroups([{ ...boss(), count: 2 }]), r3)).toThrow(/at most one boss, once/);
    expect(() => parsePlanet(planetWithGroups([boss(), boss("boss2")]), r3)).toThrow(/groups\[1\]: a wave schedules at most one boss/);
    expect(() => parsePlanet(planetWithGroups([{ ...boss("boss4"), cargo: [{ type: "mite", count: 1 }] }]), r3)).toThrow(
      /"boss4" is a boss: its releases are in the ruleset/,
    );
  });

  it("the bounds file's maxBounty counts a boss with everything it releases (C8.2 wave 40: 4 x 3 + 171 + 6 x 2 = 195)", () => {
    const wave40 = [
      { type: "flutter", count: 4, at: 0, gap: 1.5 },
      boss("boss4"),
      { type: "mite", count: 6, at: 40, gap: 1 },
    ];
    expect(buildBounds(r3, parsePlanet(planetWithGroups(wave40), r3)).waveSets["first-contact"]?.maxBounty[0]).toBe(195);
  });
});

describe("meteor powers in ruleset r3 (Phase 28, M2-05; C10; ADR-0034 amended)", () => {
  const r3 = parseRuleset(RULESET3_RAW);
  const powersOf = (raw: JsonObject): Record<string, JsonObject> => raw["powers"] as Record<string, JsonObject>;
  const rulesOf = (raw: JsonObject): JsonObject => raw["powerRules"] as JsonObject;

  it("r3 holds the three powers of C10 under mechanics 3; r1 and r2 have none and only the inventory cap", () => {
    expect(Object.keys(r3.powers)).toEqual(["colony-shield", "comet-burst", "frost-pulse"]);
    expect(Object.values(r3.powers).map((p) => p.effect).sort()).toEqual([...POWER_EFFECTS].sort());
    for (const raw of [RULESET_RAW, RULESET2_RAW]) {
      expect(parseRuleset(raw).powers).toEqual({});
      expect(parseRuleset(raw).powerRules).toEqual({ inventoryCapPerPower: 2 });
    }
  });

  it("mechanics 1 and 2 refuse powers (their game-core has no usePower); mechanics 3 may leave them out, with their rules", () => {
    const in2 = copy(RULESET2_RAW);
    in2["powers"] = copy(RULESET3_RAW["powers"]);
    expect(() => parseRuleset(in2)).toThrow(/ruleset.powers: is mechanics 3; mechanics 1 and 2 have no meteor powers/);
    const none = copy(RULESET3_RAW);
    delete none["powers"];
    expect(() => parseRuleset(none)).toThrow(/ruleset.powerRules: unknown key "perWaveUseLimitPerPower"/);
    none["powerRules"] = { inventoryCapPerPower: 2 };
    expect(parseRuleset(none).powers).toEqual({});
  });

  it("with powers, every use rule is required: uses per wave, the shared lockout, the award rotation", () => {
    for (const key of ["perWaveUseLimitPerPower", "sharedLockoutSeconds", "awardRotation"]) {
      const missing = copy(RULESET3_RAW);
      delete rulesOf(missing)[key];
      expect(() => parseRuleset(missing), key).toThrow(new RegExp(`ruleset.powerRules: "${key}" is missing`));
    }
    const zero = copy(RULESET3_RAW);
    rulesOf(zero)["perWaveUseLimitPerPower"] = 0;
    expect(() => parseRuleset(zero)).toThrow(/perWaveUseLimitPerPower: must be between 1 and 100/);
  });

  it("the award rotation names only this ruleset's powers", () => {
    const stray = copy(RULESET3_RAW);
    rulesOf(stray)["awardRotation"] = ["frost-pulse", "laser-storm"];
    expect(() => parseRuleset(stray)).toThrow(/awardRotation\[1\]: "laser-storm" is not one of this ruleset's powers/);
    const empty = copy(RULESET3_RAW);
    rulesOf(empty)["awardRotation"] = [];
    expect(() => parseRuleset(empty)).toThrow(/awardRotation: must have 1 to 10 items/);
  });

  it("each effect has exactly its own fields; an unknown effect is refused; IDs are key IDs (hyphens, as the contracts)", () => {
    const wrongFields = copy(RULESET3_RAW);
    (powersOf(wrongFields)["frost-pulse"] as JsonObject)["radius"] = 1.5;
    expect(() => parseRuleset(wrongFields)).toThrow(/powers.frost-pulse: unknown key "radius"/);
    const missing = copy(RULESET3_RAW);
    delete (powersOf(missing)["comet-burst"] as JsonObject)["bossPctMaxHp"];
    expect(() => parseRuleset(missing)).toThrow(/powers.comet-burst: "bossPctMaxHp" is missing/);
    const unknown = copy(RULESET3_RAW);
    (powersOf(unknown)["colony-shield"] as JsonObject)["effect"] = "heal";
    expect(() => parseRuleset(unknown)).toThrow(/powers.colony-shield.effect: must be one of slow, burst, shield/);
    const underscore = copy(RULESET3_RAW);
    powersOf(underscore)["frost_pulse"] = copy(powersOf(underscore)["frost-pulse"] as JsonObject);
    expect(() => parseRuleset(underscore)).toThrow(/powers.frost_pulse: ID does not match/);
    const fraction = copy(RULESET3_RAW);
    (powersOf(fraction)["comet-burst"] as JsonObject)["pctMaxHp"] = 50.5;
    expect(() => parseRuleset(fraction)).toThrow(/comet-burst.pctMaxHp: must be an integer/);
  });

  it("meteorAward follows the rotation round and round (C10: M-059, the sixth meteor, is Colony Shield)", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((k) => meteorAward(r3, k))).toEqual([
      "frost-pulse",
      "comet-burst",
      "colony-shield",
      "frost-pulse",
      "comet-burst",
      "colony-shield",
      "frost-pulse",
    ]);
    expect(() => meteorAward(r3, 0)).toThrow(RangeError);
    expect(meteorAward(parseRuleset(RULESET_RAW), 1)).toBeNull();
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
