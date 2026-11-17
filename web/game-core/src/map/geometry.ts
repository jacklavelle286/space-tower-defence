// Map geometry shared by the design rules, the test players and the player's keyboard map (Gate M, LD1).
//
// A MapGeometry is the route plus the pads with their centres in units: a BattleConfig already has that shape, and
// mapGeometry() builds it from a planet document's map so the rules can run on a draft that has not been compiled.
// Imports use explicit .ts extensions: src/data/game-data.ts imports this folder, and Node 24 runs
// scripts/build-bounds.ts (which imports game-data.ts) directly, with no resolver for extensionless paths.
import { buildRoute, UNITS_PER_TILE, type Route } from "../sim/route.ts";

export interface MapPad {
  readonly id: string;
  /** Tile coordinates (tile centres). */
  readonly x: number;
  readonly y: number;
  /** Centre in units. */
  readonly cx: number;
  readonly cy: number;
}

export interface MapGeometry {
  readonly route: Route;
  readonly pads: readonly MapPad[];
}

export type Heading = "right" | "left" | "down" | "up";

export interface RouteCell {
  readonly x: number;
  readonly y: number;
  /** The heading of the segment the cell starts; the last cell (the colony end) takes the last segment's heading. */
  readonly heading: Heading;
  /** 0-based index of the segment the cell belongs to (the last cell belongs to the last segment). */
  readonly segment: number;
}

export function headingOf(dx: number, dy: number): Heading {
  if (dx > 0) return "right";
  if (dx < 0) return "left";
  return dy > 0 ? "down" : "up";
}

/** Every cell the route passes through, in route order, ending on the last waypoint. Empty for fewer than 2 points. */
export function routeCells(waypoints: readonly (readonly [number, number])[]): RouteCell[] {
  const cells: RouteCell[] = [];
  for (let i = 0; i + 1 < waypoints.length; i += 1) {
    const [ax, ay] = waypoints[i] ?? [0, 0];
    const [bx, by] = waypoints[i + 1] ?? [0, 0];
    const sx = Math.sign(bx - ax);
    const sy = Math.sign(by - ay);
    if (sx !== 0 && sy !== 0) return cells; // diagonal: the parser refuses it; stop rather than loop
    if (sx === 0 && sy === 0) continue;
    const heading = headingOf(bx - ax, by - ay);
    for (let x = ax, y = ay; x !== bx || y !== by; x += sx, y += sy) cells.push({ x, y, heading, segment: i });
  }
  const last = waypoints[waypoints.length - 1];
  const before = cells[cells.length - 1];
  if (last !== undefined && before !== undefined) cells.push({ x: last[0], y: last[1], heading: before.heading, segment: before.segment });
  return cells;
}

/** The geometry of a planet document's map (pads keep their document order). */
export function mapGeometry(map: {
  readonly route: readonly (readonly [number, number])[];
  readonly pads: readonly { readonly id: string; readonly x: number; readonly y: number }[];
}): MapGeometry {
  return {
    route: buildRoute(map.route),
    pads: map.pads.map((p) => ({ id: p.id, x: p.x, y: p.y, cx: p.x * UNITS_PER_TILE, cy: p.y * UNITS_PER_TILE })),
  };
}
