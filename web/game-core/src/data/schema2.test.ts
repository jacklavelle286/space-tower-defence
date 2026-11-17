// Planet document schema 2 (Gate M, LD2; scope-level-designer.md §3.1): several maps with their own pictures,
// challenge-only waves and a map per wave set. Schema 1 documents (every published file) still parse, to the same
// shape, and keep their bounds bytes (build-bounds --check compares the published pair's fixture).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { competentPolicy, deriveBlueprint, playWaveSet } from "../bot";
import { planetProblems } from "../map";
import { compileBattleConfig } from "../sim/config";
import { alienBounty, buildBounds, parsePlanet, parseRuleset, SCHEMA1_MAP_ID, waveBounty } from "./game-data";

const r4 = parseRuleset(JSON.parse(readFileSync(join(GAME_DATA_DIR, "ruleset", "r4.json"), "utf8")));
type Json = Record<string, unknown>;
const RAW = JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", "schema2-planet.json"), "utf8")) as Json;
const LIVE_RAW = JSON.parse(readFileSync(join(GAME_DATA_DIR, "campaign", "luna-1-c2.json"), "utf8")) as Json;
const copy = (): Json => structuredClone(RAW);
const at = (o: Json, ...path: string[]): Json => path.reduce((x, k) => x[k] as Json, o);

describe("schema 2", () => {
  const doc = parsePlanet(RAW, r4);

  it("parses maps, their pictures, challenge waves and each wave set's map", () => {
    expect(doc.schema).toBe(2);
    expect(Object.keys(doc.maps)).toEqual(["moonbeam", "zigzag"]);
    expect(doc.maps["zigzag"]?.art.backdrop).toBe("lib-0123456789abcdef0123456789abcdef");
    expect(doc.maps["moonbeam"]?.art.decorations).toEqual([
      { art: "deco-rock-1", x: 1, y: 9 },
      { art: "deco-crater-2", x: 19, y: 9 },
    ]);
    expect(Object.keys(doc.challengeWaves)).toEqual(["blob-burst"]);
    expect(doc.waveSets["blob-rush"]).toMatchObject({ mapId: "zigzag", waves: [3, "blob-burst"] });
    expect(doc.waveSets["campaign"]?.mapId).toBe("moonbeam");
  });

  it("a wave set's battle uses its own map and its challenge waves", () => {
    const config = compileBattleConfig(r4, doc, "blob-rush");
    expect(config.route.waypoints).toEqual(doc.maps["zigzag"]?.route);
    expect(config.pads.map((p) => p.id)).toEqual(doc.maps["zigzag"]?.pads.map((p) => p.id));
    expect(config.art.backdrop).toBe("lib-0123456789abcdef0123456789abcdef");
    expect(config.waves).toHaveLength(2);
    expect(config.waves[1]?.spawns).toHaveLength(12); // blob-burst: 12 blobs
    expect(config.waves[1]?.hpMult).toBe(1.2);
  });

  it("the competent test player can play the new map", () => {
    const config = compileBattleConfig(r4, doc, "blob-rush");
    const r = playWaveSet(r4, config, competentPolicy(config, { blueprint: deriveBlueprint(config) }), { learn: 0 });
    expect(r.cleared).toBe(2);
  });

  it("bounds: every pad on the planet, and each set's own pads; maxBounty by position, challenge waves included", () => {
    const bounds = buildBounds(r4, doc);
    expect(Object.keys(bounds.pads)).toHaveLength(16 + 14);
    expect(bounds.waveSets["blob-rush"]?.pads).toEqual(doc.maps["zigzag"]?.pads.map((p) => p.id).sort());
    expect(bounds.waveSets["campaign"]?.pads).toHaveLength(16);
    const wave3 = doc.waves.find((w) => w.wave === 3);
    if (wave3 === undefined) throw new Error("wave 3");
    expect(bounds.waveSets["blob-rush"]?.maxBounty).toEqual([waveBounty(r4, wave3), 12 * alienBounty(r4, "blob")]);
    expect(bounds.waveSets["blob-rush"]?.finalWave).toBe(2);
  });

  it("the new map has no hard or block problem, with pads in route order (its pads only warn: they reach little)", () => {
    const zigzag = planetProblems(doc, r4, { strictPadOrder: true }).filter((p) => p.field.startsWith("planet.maps.zigzag") && p.severity !== "warn");
    expect(zigzag.map((p) => [p.rule, p.severity, p.at])).toEqual([]);
  });

  it("a decoration on the route, beside it, on a pad or under the portal or colony blocks publishing", () => {
    const bad = copy();
    (at(bad, "maps", "moonbeam", "art")["decorations"] as Json[]).push({ art: "deco-rock-2", x: 5, y: 2 });
    const problems = planetProblems(parsePlanet(bad, r4), r4).filter((p) => p.rule === "decorationPlacement");
    expect(problems).toEqual([{ field: "planet.maps.moonbeam.art.decorations[2]", rule: "decorationPlacement", severity: "block", at: [5, 2] }]);
  });

  it.each<[string, (d: Json) => void, RegExp]>([
    ["schema 3", (d) => (d["schema"] = 3), /schema: must be 2/],
    ["a challenge wave in the campaign", (d) => (at(d, "waveSets", "campaign")["waves"] as unknown[]).splice(0, 1, "blob-burst"), /only a CHALLENGE wave set/],
    ["an unknown challenge wave", (d) => (at(d, "waveSets", "blob-rush")["waves"] = [3, "nope"]), /challenge wave "nope" is not/],
    ["an unknown map", (d) => (at(d, "waveSets", "blob-rush")["mapId"] = "nope"), /map "nope" is not/],
    ["a missing mapId", (d) => delete at(d, "waveSets", "blob-rush")["mapId"], /"mapId" is missing/],
    ["a pad ID on two maps", (d) => ((at(d, "maps", "zigzag")["pads"] as Json[])[0] = { id: "p01", x: 1, y: 3, opensAfterWave: 0 }), /pad IDs.*"p01" appears twice/],
    ["a preset on another map's pad", (d) => (at(d, "waveSets", "blob-rush")["presetPlacements"] = [{ padId: "p02", classId: "nova", level: 1, targeting: "FRONT" }]), /pad "p02" is not open/],
    ["a decoration that is neither repo art nor a library picture", (d) => ((at(d, "maps", "zigzag", "art")["decorations"] as Json[])[0] = { art: "rock", x: 1, y: 1 }), /neither a repo decoration/],
    ["a backdrop that is not a library picture", (d) => (at(d, "maps", "zigzag", "art")["backdrop"] = "luna-backdrop"), /backdrop/],
    ["five maps", (d) => ["a", "b", "c"].forEach((k) => (at(d, "maps")[k] = structuredClone(at(d, "maps", "zigzag")))), /at most 4 maps|appears twice/],
    ["a schema 1 key in schema 2", (d) => (d["map"] = at(d, "maps", "moonbeam")), /unknown key "map"/],
    ["a hard map problem names the map", (d) => (at(d, "maps", "zigzag")["route"] = [[0, 5], [10, 5], [10, 8], [5, 8], [5, 10], [19, 10]]), /planet\.maps\.zigzag\.route\[3\]: The route never heads left/],
  ])("refuses %s", (_name, change, message) => {
    const bad = copy();
    change(bad);
    expect(() => parsePlanet(bad, r4)).toThrow(message);
  });
});

describe("schema 1", () => {
  it("parses to the same shape: one map, no pictures, every wave set on it", () => {
    const doc = parsePlanet(LIVE_RAW, r4);
    expect(doc.schema).toBe(1);
    expect(Object.keys(doc.maps)).toEqual([SCHEMA1_MAP_ID]);
    expect(doc.maps[SCHEMA1_MAP_ID]?.art).toEqual({ backdrop: null, decorations: [] });
    expect(Object.values(doc.waveSets).every((ws) => ws.mapId === SCHEMA1_MAP_ID)).toBe(true);
    expect(doc.challengeWaves).toEqual({});
    expect(Object.values(buildBounds(r4, doc).waveSets).some((ws) => "pads" in ws)).toBe(false);
  });

  it("refuses schema 2 keys", () => {
    expect(() => parsePlanet({ ...LIVE_RAW, challengeWaves: {} }, r4)).toThrow(/unknown key "challengeWaves"/);
  });
});
