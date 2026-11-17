// Where a route's ends are drawn (Gate M, LD11): a route heading right keeps the layout the battlefield always had
// (Moonbeam draws pixel for pixel as before), and every other heading turns it, keeping the colony on the canvas.
import { describe, expect, it } from "vitest";
import fixtures from "./fixtures-any-direction.json";
import { COLONY_PX, routeEnds, tileCentrePx } from "./ends";
import { GRID_COLS, GRID_ROWS } from "./grid";

const ROUTES = fixtures.routes as unknown as Record<string, [number, number][]>;
const MOONBEAM: [number, number][] = [[0, 2], [4, 2], [4, 7], [9, 7], [9, 3], [14, 3], [14, 8], [17, 8], [17, 3], [19, 3]];

describe("routeEnds", () => {
  it("a route heading right draws where BattleScene always drew it", () => {
    const ends = routeEnds(MOONBEAM);
    // BattleScene before LD11: portal at the start tile's left edge; colony feet at the gate + (-72, 74) (its centre
    // COLONY_PX / 2 higher); the leak puff 24 px before the gate.
    expect(ends?.portal).toEqual({ x: tileCentrePx(0) - 48, y: tileCentrePx(2) });
    expect(ends?.colony).toEqual({ x: tileCentrePx(19) - 72, y: tileCentrePx(3) + 74 - COLONY_PX / 2 });
    expect(ends?.leak).toEqual({ x: tileCentrePx(19) - 24, y: tileCentrePx(3) });
    // The footprint cells rules.ts always used: the portal's 2 x 3 at the edge, the colony's 3 x 2 above the gate.
    expect([...(ends?.portalCells ?? [])].sort()).toEqual([[0, 1], [0, 2], [0, 3]]);
    expect([...(ends?.colonyCells ?? [])].sort()).toEqual([[17, 2], [17, 3], [18, 2], [18, 3], [19, 2], [19, 3]].sort());
  });

  it.each(Object.entries(ROUTES))("%s: the portal sits on its edge and the colony stays on the canvas", (_name, route) => {
    const ends = routeEnds(route);
    if (ends === null) throw new Error("no ends");
    const [sx, sy] = route[0] ?? [0, 0];
    const onEdge = ends.portal.x === 0 || ends.portal.y === 0 || ends.portal.x === GRID_COLS * 96 || ends.portal.y === GRID_ROWS * 96;
    expect(onEdge).toBe(true);
    expect(Math.abs(ends.portal.x - tileCentrePx(sx)) + Math.abs(ends.portal.y - tileCentrePx(sy))).toBe(48);
    const half = COLONY_PX / 2;
    expect(ends.colony.x - half).toBeGreaterThanOrEqual(0);
    expect(ends.colony.x + half).toBeLessThanOrEqual(GRID_COLS * 96);
    expect(ends.colony.y - half).toBeGreaterThanOrEqual(0);
    expect(ends.colony.y + half).toBeLessThanOrEqual(GRID_ROWS * 96);
    // The gate tile is under the colony, and the leak puff is 24 px back along the route from it.
    const [gx, gy] = route[route.length - 1] ?? [0, 0];
    expect(ends.colonyCells).toContainEqual([gx, gy]);
    expect(Math.abs(ends.leak.x - tileCentrePx(gx)) + Math.abs(ends.leak.y - tileCentrePx(gy))).toBe(24);
  });

  it("turns the layout with the route: a route ending down has its colony over the last stretch, inside the bottom edge", () => {
    const ends = routeEnds([[3, 0], [3, 10]]);
    expect(ends?.endHeading).toBe("down");
    expect(ends?.colony).toEqual({ x: tileCentrePx(3) + 46, y: GRID_ROWS * 96 - COLONY_PX / 2 });
    expect(ends?.colonyCells).toEqual(expect.arrayContaining([[3, 8], [3, 9], [3, 10]]));
  });

  it("is null before the route has two cells", () => {
    expect(routeEnds([[0, 2]])).toBeNull();
  });
});
