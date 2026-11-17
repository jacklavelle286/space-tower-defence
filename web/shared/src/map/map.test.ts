// The shared map module (Gate M, LD1). The property the design rules promise: any planet document with no hard
// problem parses, draws (every route cell has a tile) and builds a bounds file. Routes are random walks from a
// seeded generator, in all four headings, so the hard rules have plenty to refuse.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildBounds, hardMapProblems, nextRandom, parsePlanet, parseRuleset, REPO_DECORATIONS } from "@scd/game-core";
import { describe, expect, it } from "vitest";
import { DECORATIONS, MAP_ART, routeTiles } from ".";

const GAME_DATA = join(import.meta.dirname, "..", "..", "..", "..", "game-data");
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(GAME_DATA, path), "utf8"));
// luna-1-c1 (one challenge, no presets), so removing the pads a route runs over leaves a valid document.
const r1 = parseRuleset(readJson("ruleset/r1.json"));
const LIVE = readJson("campaign/luna-1-c1.json") as { map: { route: [number, number][]; pads: { x: number; y: number }[] } };

function randomRoute(seed: number): [number, number][] {
  let state = seed >>> 0;
  const rand = (n: number): number => {
    const r = nextRandom(state);
    state = r.state;
    return r.value % n;
  };
  const route: [number, number][] = [[rand(3) === 0 ? 1 : 0, rand(11)]];
  for (let i = 0; i < 14; i += 1) {
    const [x, y] = route[route.length - 1] ?? [0, 0];
    const heading = rand(i % 2 === 0 ? 5 : 4); // 0-1 right, 2 up, 3 down, 4 left
    const n = 1 + rand(6);
    const next: [number, number] = heading <= 1 ? [Math.min(19, x + n), y] : heading === 2 ? [x, Math.max(0, y - n)] : heading === 3 ? [x, Math.min(10, y + n)] : [Math.max(0, x - n), y];
    if (next[0] === x && next[1] === y) continue;
    const prev = route[route.length - 2];
    // Keep segments alternating so no two in a row share an axis (the parser refuses an empty or diagonal one).
    if (prev !== undefined && (prev[0] === x) === (next[0] === x)) continue;
    route.push(next);
    if (next[0] === 19 && rand(2) === 0) break;
  }
  return route;
}

describe("documents with no hard problem always draw", () => {
  it("over 10000 random routes", () => {
    let clean = 0;
    for (let seed = 1; seed <= 10000; seed += 1) {
      const route = randomRoute(seed);
      const onRoute = new Set<string>();
      for (let i = 1; i < route.length; i += 1) {
        const [ax, ay] = route[i - 1] ?? [0, 0];
        const [bx, by] = route[i] ?? [0, 0];
        for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x += 1) for (let y = Math.min(ay, by); y <= Math.max(ay, by); y += 1) onRoute.add(`${x},${y}`);
      }
      // Moonbeam's pads, minus any the route runs over (a pad on the route is a hard problem of its own).
      const pads = (LIVE.map.pads as { id: string; x: number; y: number; opensAfterWave: number }[]).filter((p) => !onRoute.has(`${p.x},${p.y}`));
      if (!pads.some((p) => p.opensAfterWave === 0)) continue;
      const doc = { ...LIVE, map: { ...LIVE.map, route, pads } };
      if (hardMapProblems({ grid: { cols: 20, rows: 11 }, route, pads }).length > 0) {
        expect(() => parsePlanet(doc, r1)).toThrow();
        continue;
      }
      clean += 1;
      const planet = parsePlanet(doc, r1);
      const tiles = routeTiles(planet.maps["main"]?.route ?? []);
      // LD11: the caps follow the route's first and last heading (any edge).
      expect(tiles[0]?.art.id).toMatch(/^route-portal-end/u);
      expect(tiles.at(-1)?.art.id).toMatch(/^route-colony-end/u);
      if (route[0]?.[0] === 0 && route[1]?.[1] === route[0]?.[1]) expect(tiles[0]?.art).toBe(MAP_ART.portalEnd);
      expect(() => buildBounds(r1, planet)).not.toThrow();
    }
    expect(clean).toBeGreaterThan(100); // the generator makes enough clean maps for the property to mean something
  });
});

describe("decorations", () => {
  it("game-core's parser accepts exactly the decorations this module can draw", () => {
    expect([...REPO_DECORATIONS].sort()).toEqual(Object.keys(DECORATIONS).sort());
  });
});
