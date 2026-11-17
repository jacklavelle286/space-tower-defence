// A level merged into a planet document (Gate M, LD4).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { buildBounds, parsePlanet, parseRuleset } from "./game-data";
import { levelOwnsField, mergeLevel, type LevelSections } from "./level";

const r4 = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r4.json"), "utf8")));
const LIVE = JSON.parse(readFileSync(join(GAME_DATA_DIR, "campaign", "luna-1-c2.json"), "utf8")) as Record<string, unknown>;
const fixture = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "schema2-planet.json"), "utf8")) as {
  maps: { zigzag: Record<string, unknown> };
  challengeWaves: Record<string, Record<string, unknown>>;
  waveSets: Record<string, Record<string, unknown>>;
};

/** The fixture's Zigzag map and Blob Rush challenge, as a level whose pads carry its ID. */
function zigzagLevel(): LevelSections {
  const map = structuredClone(fixture.maps.zigzag) as { pads: { id: string }[] };
  map.pads.forEach((p, i) => (p.id = `zigzag-p${String(i + 1).padStart(2, "0")}`));
  return {
    levelId: "zigzag",
    map: map as unknown as Record<string, unknown>,
    challengeWaves: { "zigzag-burst": fixture.challengeWaves["blob-burst"] ?? {} },
    waveSets: { "zigzag-rush": { ...fixture.waveSets["blob-rush"], mapId: "zigzag", waves: [3, "zigzag-burst"] } },
  };
}

describe("mergeLevel", () => {
  it("puts a challenge level onto a schema 1 planet: a schema 2 document that parses and builds bounds", () => {
    const merged = mergeLevel(LIVE, zigzagLevel(), "luna-1-c3");
    const planet = parsePlanet(merged, r4);
    expect(planet.schema).toBe(2);
    expect(Object.keys(planet.maps)).toEqual(["main", "zigzag"]);
    expect(planet.waveSets["campaign"]?.mapId).toBe("main");
    expect(planet.waveSets["zigzag-rush"]?.waves).toEqual([3, "zigzag-burst"]);
    expect(planet.waves).toHaveLength(50);
    expect(buildBounds(r4, planet).waveSets["zigzag-rush"]?.pads).toHaveLength(14);
  });

  it("merging the same level again replaces it", () => {
    const once = mergeLevel(LIVE, zigzagLevel(), "luna-1-c3");
    const twice = mergeLevel(once, { ...zigzagLevel(), waveSets: {} }, "luna-1-c4");
    expect(Object.keys(twice["waveSets"] as object)).toContain("zigzag-rush"); // a removed set is not deleted by a merge
    expect(twice["version"]).toBe("luna-1-c4");
  });

  it("a campaign level replaces the waves and the campaign set, and its map becomes the campaign's", () => {
    const live = parsePlanet(LIVE, r4);
    const waves = live.waves.map((w) => ({ ...w, hpMult: w.hpMult + 0.1 }));
    const campaign = { ...LIVE["waveSets"] as Record<string, unknown> }["campaign"] as Record<string, unknown>;
    const level: LevelSections = { ...zigzagLevel(), waves, waveSets: { campaign: { ...campaign, mapId: "zigzag" } } };
    const planet = parsePlanet(mergeLevel(LIVE, level, "luna-1-c3"), r4);
    expect(planet.waveSets["campaign"]?.mapId).toBe("zigzag");
    expect(planet.waves[0]?.hpMult).toBeCloseTo((live.waves[0]?.hpMult ?? 0) + 0.1);
    expect(planet.waveSets["blob-parade"]?.mapId).toBe("main");
  });

  it("names the fields that belong to the level", () => {
    const level = zigzagLevel();
    expect(levelOwnsField(level, "planet.maps.zigzag.pads[2]")).toBe(true);
    expect(levelOwnsField(level, "planet.waveSets.zigzag-rush.waves")).toBe(true);
    expect(levelOwnsField(level, "planet.challengeWaves.zigzag-burst")).toBe(true);
    expect(levelOwnsField(level, "planet.maps.main.pads")).toBe(false);
    expect(levelOwnsField(level, "planet.waves[3]")).toBe(false); // not a campaign level
  });
});
