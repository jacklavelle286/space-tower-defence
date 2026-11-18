// The map generator (Gate M, LD14): every map it makes meets the design rules, as asked, the same for the same seed.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_DATA_DIR } from "../../scripts/build-bounds";
import { parsePlanet, parseRuleset, REPO_DECORATIONS, type PlanetMap } from "../data/game-data";
import { generateMap, GRID_COLS, mapProblems, routeCells, TWISTS, type GeneratedMap, type MapEdge, type Twist } from ".";

const readJson = (dir: string, name: string): unknown => JSON.parse(readFileSync(join(GAME_DATA_DIR, dir, `${name}.json`), "utf8"));
const MOONBEAM = parsePlanet(readJson("campaign", "luna-1-c2"), parseRuleset(readJson("ruleset", "r4"))).maps["main"] as PlanetMap;

const made = (result: ReturnType<typeof generateMap>): GeneratedMap => {
  if (!("map" in result)) throw new Error(result.reason);
  return result.map;
};
const asMap = (m: GeneratedMap): PlanetMap => ({ name: "", grid: { cols: 20, rows: 11 }, route: m.route, pads: m.pads, art: { backdrop: null, decorations: m.decorations } });
const turns = (m: GeneratedMap): number => {
  const cells = routeCells(m.route);
  let n = 0;
  for (let i = 1; i < cells.length - 1; i += 1) if (cells[i]?.heading !== cells[i - 1]?.heading) n += 1;
  return n;
};
const edgeOf = ([x, y]: readonly [number, number]): MapEdge[] =>
  [x === 0 && "left", x === GRID_COLS - 1 && "right", y === 0 && "top", y === 10 && "bottom"].filter((e): e is MapEdge => e !== false);

describe("generateMap", () => {
  const TWIST_IDS = Object.keys(TWISTS) as Twist[];
  const EDGES: (MapEdge | "any")[] = ["any", "left", "right", "top", "bottom"];

  it("makes a map with no hard or blocking problem, as asked, for 150 seeds", () => {
    let warned = 0;
    for (let seed = 1; seed <= 150; seed += 1) {
      const twist = TWIST_IDS[seed % 3] as Twist;
      const pads = 12 + (seed % 5);
      const from = EDGES[seed % 5] as MapEdge | "any";
      const to = EDGES[Math.floor(seed / 5) % 5] as MapEdge | "any";
      const m = made(generateMap({ seed, twist, pads, from, to, decorations: REPO_DECORATIONS, decorationCount: seed % 13 }));
      const problems = mapProblems(asMap(m));
      expect(problems.filter((p) => p.severity !== "warn"), `seed ${seed}`).toEqual([]);
      expect(m.problems).toEqual(problems);
      if (problems.length > 0) warned += 1;
      expect(m.pads).toHaveLength(pads);
      expect(m.pads.map((p) => p.id)).toEqual(m.pads.map((_, i) => `p${String(i + 1).padStart(2, "0")}`));
      expect(m.decorations.length).toBeLessThanOrEqual(seed % 13);
      for (const d of m.decorations) expect(REPO_DECORATIONS).toContain(d.art);
      const [lo, hi] = TWISTS[twist].turns;
      expect(turns(m)).toBeGreaterThanOrEqual(lo);
      expect(turns(m)).toBeLessThanOrEqual(hi);
      if (from !== "any") expect(edgeOf(m.route[0] as [number, number])).toContain(from);
      if (to !== "any") expect(edgeOf(m.route[m.route.length - 1] as [number, number])).toContain(to);
    }
    // Warnings are allowed (they do not block publishing) but rare: some choices cannot avoid one, such as a gentle
    // route that starts and ends on the top edge (too little room for 36 tiles). Measured 2026-11-18: 14 of 150.
    expect(warned).toBeLessThanOrEqual(25);
  }, 60_000); // about 35 ms a map

  it("makes the same map from the same seed, and another from the next", () => {
    const a = made(generateMap({ seed: 42 }));
    expect(made(generateMap({ seed: 42 }))).toEqual(a);
    expect(made(generateMap({ seed: 43 })).route).not.toEqual(a.route);
  });

  it("keeps the tier 1 rules when routes in any direction are off: left to right, never heading left", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const m = made(generateMap({ seed, anyDirection: false, from: "top", twist: "twisty" }));
      expect(m.route[0]?.[0]).toBe(0);
      expect(m.route[m.route.length - 1]?.[0]).toBe(GRID_COLS - 1);
      for (let i = 1; i < m.route.length; i += 1) expect((m.route[i] as [number, number])[0]).toBeGreaterThanOrEqual((m.route[i - 1] as [number, number])[0]);
    }
  });

  it("keeps the designer's route and makes only the pads and decorations", () => {
    const m = made(generateMap({ seed: 7, route: MOONBEAM.route, pads: 16, decorations: ["deco-rock-1"], decorationCount: 5 }));
    expect(m.route).toEqual(MOONBEAM.route);
    expect(m.pads).toHaveLength(16);
    expect(m.decorations.every((d) => d.art === "deco-rock-1")).toBe(true);
    expect(mapProblems(asMap(m)).filter((p) => p.severity !== "warn")).toEqual([]);
  });

  it("says why when the kept route has a problem, and places no decorations without pictures", () => {
    expect(generateMap({ seed: 1, route: [[0, 5], [10, 5]] })).toEqual({ reason: "Your route has a problem to fix first, so pads cannot be placed around it." });
    expect(made(generateMap({ seed: 1, decorations: [] })).decorations).toEqual([]);
  });
});
