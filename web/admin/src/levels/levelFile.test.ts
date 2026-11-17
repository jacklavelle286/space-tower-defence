// Level files and templates (Gate M, LD3).
import { buildRoute, nearestProgress, UNITS_PER_TILE } from "@scd/game-core";
import { describe, expect, it } from "vitest";
import shapes from "../../../../contracts/fixtures/levels/shapes.json";
import { levelFileDownload, levelProblems, newLevel, numberPadsInRouteOrder, readLevelFile, TEMPLATES } from "./levelFile";

describe("templates", () => {
  it.each(TEMPLATES.filter((t) => t.id !== "blank").map((t) => [t.id]))("%s starts with no hard or block problem", (id) => {
    const level = newLevel("try-it", "Try it", id);
    expect(levelProblems(level).filter((p) => p.severity !== "warn").map((p) => [p.rule, p.at])).toEqual([]);
  });

  it("blank starts empty, and says what is missing", () => {
    const level = newLevel("empty", "Empty", "blank");
    expect(level.map.route).toEqual([]);
    expect(level.map.pads).toEqual([]);
    expect(levelProblems(level).map((p) => p.rule)).toContain("padCount");
  });

  it("pads carry the level's ID and are numbered in route order", () => {
    const level = newLevel("zig", "Zig", "zigzag");
    expect(level.map.pads[0]?.id).toBe("zig-p01");
    const shuffled = { ...level, map: { ...level.map, pads: [...level.map.pads].reverse().map((p, i) => ({ ...p, id: `zig-p${String(i + 50)}` })) } };
    const renumbered = numberPadsInRouteOrder(shuffled).map.pads;
    expect(renumbered.map((p) => p.id)).toEqual(level.map.pads.map((p) => p.id));
    // The same cells in the same route order (pads level with each other may swap: ties go by ID).
    const progress = (p: { x: number; y: number }) => nearestProgress(buildRoute(level.map.route), p.x * UNITS_PER_TILE, p.y * UNITS_PER_TILE);
    expect(renumbered.map(progress)).toEqual(level.map.pads.map(progress));
  });
});

describe("level files", () => {
  it("a downloaded file uploads unchanged", () => {
    const level = newLevel("zig", "Zig", "zigzag");
    const file = levelFileDownload(level);
    expect(file.name).toBe("zig.level.json");
    expect(readLevelFile(file.text)).toEqual({ ok: true, level });
  });

  it.each<[string, string]>([
    ["not json", "{"],
    ["a planet document", JSON.stringify({ kind: "campaign" })],
    ["a bad ID", JSON.stringify({ ...newLevel("zig", "Zig", "zigzag"), levelId: "Zig!" })],
    ["a pad from another level", JSON.stringify({ ...newLevel("zig", "Zig", "zigzag"), levelId: "zag" })],
    ["a point off the map", JSON.stringify({ ...newLevel("zig", "Zig", "zigzag"), map: { ...newLevel("zig", "Zig", "zigzag").map, route: [[0, 5], [25, 5]] } })],
    ["an unknown decoration", JSON.stringify({ ...newLevel("zig", "Zig", "blank"), map: { ...newLevel("zig", "Zig", "blank").map, art: { backdrop: null, decorations: [{ art: "rock", x: 1, y: 1 }] } } })],
    ["an extra key", JSON.stringify({ ...newLevel("zig", "Zig", "zigzag"), extra: 1 })],
  ])("refuses %s", (_name, text) => {
    expect(readLevelFile(text).ok).toBe(false);
  });
});

describe("shared level file vectors (contracts/fixtures/levels/shapes.json)", () => {
  it.each(Object.entries(shapes.valid))("accepts %s", (_name, level) => {
    expect(readLevelFile(JSON.stringify(level)).ok).toBe(true);
  });
  it.each(Object.entries(shapes.invalid))("refuses %s", (_name, entry) => {
    expect(readLevelFile(JSON.stringify(entry.level)).ok).toBe(false);
  });
});

describe("waves and wave sets in the problems", () => {
  it("the campaign template owns the campaign and has no blocking problem", () => {
    const level = newLevel("moon2", "Moon two", "moonbeam-campaign");
    expect(level.waves).toHaveLength(50);
    expect(level.waveSets["campaign"]?.mapId).toBe("moon2");
    expect(levelProblems(level).filter((p) => p.severity !== "warn").map((p) => [p.field, p.rule])).toEqual([]);
  });

  it("a G-15 refusal lands on the wave set's waves", () => {
    const level = newLevel("zig", "Zig", "zigzag");
    level.waveSets["zig-long"] = {
      mode: "CHALLENGE", name: "Too long", mapId: "zig", waves: Array.from({ length: 99 }, (_, i) => (i % 50) + 1), meteorAfter: [],
      startCredits: 200, colonyHealth: 20, classes: ["nova"], padsOpenAsForWave: 1, presetPlacements: [],
    };
    const parse = levelProblems(level).find((p) => p.rule === "parse");
    expect(parse?.field).toBe("planet.waveSets.zig-long");
  });

  it("changing a wave a live challenge plays, or an endless template, warns", () => {
    const level = newLevel("moon2", "Moon two", "moonbeam-campaign");
    const w45 = level.waves?.[44];
    const w7 = level.waves?.[6]; // blob-parade and wobble-rematch play wave 7
    const w3 = level.waves?.[2]; // no challenge plays wave 3
    if (w45 === undefined || w7 === undefined || w3 === undefined) throw new Error("waves");
    w45.hpMult += 0.5;
    w7.hpMult += 0.5;
    w3.hpMult += 0.5;
    const impact = levelProblems(level).filter((p) => p.rule === "impact").map((p) => p.field);
    expect(impact).toContain("planet.waves[44]");
    expect(impact).toContain("planet.waves[6]");
    expect(impact).not.toContain("planet.waves[2]");
  });
});

describe("the base of a planet with nothing published (LD10)", () => {
  it("is taken as it is, and a campaign level merged into it parses", async () => {
    const { setLiveBase, resetLiveBase, mergedLevel, newLevel: make } = await import("./levelFile");
    const empty = { kind: "campaign", schema: 2, version: "mars-1-new", planetId: "mars-1", name: "Red Dust", look: { icon: null, artSet: "moon" }, maps: {}, waves: [], challengeWaves: {}, waveSets: {} };
    try {
      const base = setLiveBase("mars-1-new", empty);
      expect(base.planet.waves).toEqual([]);
      // The base has no campaign yet: the template copies the Moon's 50 waves and campaign wave set.
      const campaign = make("dusty", "Dusty", "moonbeam-campaign");
      expect(campaign.waves).toHaveLength(50);
      expect(campaign.waveSets["campaign"]?.mapId).toBe("dusty");
      expect(mergedLevel(campaign, empty).waves).toHaveLength(50);
      expect(mergedLevel(campaign, empty).planetId).toBe("mars-1");
    } finally {
      resetLiveBase();
    }
  });
});
