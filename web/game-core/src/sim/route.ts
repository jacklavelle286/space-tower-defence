// The route as integer geometry (C3.1, C2.2).
//
// Positions are in "units": 60,000 per tile, so every number the simulation stores is an integer. One alien at
// 1 tile per second moves 1,000 units per tick (60 ticks a second), and a range of 2.5 tiles is exactly 150,000 units.
// The route has only horizontal and vertical segments, so turning progress into a point needs no trigonometry and
// range checks compare squared distances (no square roots).

/** Units per tile. Divisible by 60 (ticks per second) and by 1,000, so the data's speeds and ranges stay integers. */
export const UNITS_PER_TILE = 60_000;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface RouteSegment {
  /** Route progress (units) where the segment starts and ends. */
  readonly start: number;
  readonly end: number;
  /** Start point in units, and the direction: exactly one of dx, dy is +1 or -1. */
  readonly x0: number;
  readonly y0: number;
  readonly dx: -1 | 0 | 1;
  readonly dy: -1 | 0 | 1;
}

export interface Route {
  /** The authored waypoints in tiles (tile centres), as in the planet document. */
  readonly waypoints: readonly (readonly [number, number])[];
  readonly segments: readonly RouteSegment[];
  /** Total length in units (40 tiles = 2,400,000 on Moonbeam Colony). */
  readonly length: number;
}

function sign(n: number): -1 | 0 | 1 {
  return n > 0 ? 1 : n < 0 ? -1 : 0;
}

/** Build the route from tile waypoints. Refuses a diagonal or zero-length segment, or fewer than two points. */
export function buildRoute(waypoints: readonly (readonly [number, number])[]): Route {
  if (waypoints.length < 2) throw new Error("route: needs at least two waypoints");
  const segments: RouteSegment[] = [];
  let progress = 0;
  for (let i = 0; i + 1 < waypoints.length; i += 1) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    if (from === undefined || to === undefined) throw new Error("route: missing waypoint");
    const [ax, ay] = from;
    const [bx, by] = to;
    if (!Number.isInteger(ax) || !Number.isInteger(ay) || !Number.isInteger(bx) || !Number.isInteger(by)) {
      throw new Error(`route: waypoint ${i} is not on a tile centre`);
    }
    if ((ax !== bx && ay !== by) || (ax === bx && ay === by)) {
      throw new Error(`route: segment ${i + 1} must be horizontal or vertical and not empty`);
    }
    const length = (Math.abs(bx - ax) + Math.abs(by - ay)) * UNITS_PER_TILE;
    segments.push({
      start: progress,
      end: progress + length,
      x0: ax * UNITS_PER_TILE,
      y0: ay * UNITS_PER_TILE,
      dx: sign(bx - ax),
      dy: sign(by - ay),
    });
    progress += length;
  }
  return { waypoints, segments, length: progress };
}

/** The point (units) at a route progress (units). Progress below 0 is the start; at or past the end, the end. */
export function routePoint(route: Route, progress: number): Point {
  for (const s of route.segments) {
    if (progress <= s.end) {
      const t = progress < s.start ? 0 : progress - s.start;
      return { x: s.x0 + s.dx * t, y: s.y0 + s.dy * t };
    }
  }
  const last = route.segments[route.segments.length - 1];
  if (last === undefined) throw new Error("route: no segments");
  const t = last.end - last.start;
  return { x: last.x0 + last.dx * t, y: last.y0 + last.dy * t };
}

/** True when `p` is within `rangeSq` (squared units) of the point (cx, cy), alien size ignored (C3.2). */
export function withinRange(p: Point, cx: number, cy: number, rangeSq: number): boolean {
  const dx = p.x - cx;
  const dy = p.y - cy;
  return dx * dx + dy * dy <= rangeSq;
}
