// Game data (Phase 13, M1-23): the repository's game-data/ builds, the G-15 wave-set action limit refuses an oversized
// wave set, version strings are path-safe, and the bounds fixture api/tests reads is the generated one.
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
  SUPPORTED_MECHANICS,
  TARGETING_MODES,
  VERSION_PATTERN,
  type PlanetDocument,
  type Ruleset,
} from "./game-data";
import { LIMITS } from "../rules/contracts.generated";

type JsonObject = Record<string, unknown>;

const readJson = (path: string): JsonObject => JSON.parse(readFileSync(path, "utf8")) as JsonObject;
const RULESET_RAW = readJson(join(GAME_DATA_DIR, "ruleset", "r1.json"));
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
    expect(() => parseRuleset({ ...copy(RULESET_RAW), mechanics: 2 })).toThrow(/mechanics: 2 is not supported/);
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
