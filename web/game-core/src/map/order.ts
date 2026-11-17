// Pad order and arrow-key neighbours (Gate M, LD1; D5.1, D5.2): moved here from web/player/src/hud/padNav.ts so the
// design rules (pad order = route order, every pad reachable by arrows) and the player's keyboard use one rule.
import type { Route } from "../sim/route.ts";
import type { MapGeometry } from "./geometry.ts";

/** The route progress (units) nearest a point in units: each segment is straight and axis-aligned (C3.2). */
export function nearestProgress(route: Route, x: number, y: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const s of route.segments) {
    const length = s.end - s.start;
    // Along the segment from its start point, clamped to the segment.
    const along = Math.max(0, Math.min(length, (x - s.x0) * s.dx + (y - s.y0) * s.dy));
    const px = s.x0 + along * s.dx;
    const py = s.y0 + along * s.dy;
    const distance = (x - px) ** 2 + (y - py) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = s.start + along;
    }
  }
  return Math.round(best);
}

/** Pad IDs in route order (D5.1 tab order): by the route point nearest each pad, ties by ID. */
export function padOrder(map: MapGeometry): string[] {
  const at = new Map(map.pads.map((p) => [p.id, nearestProgress(map.route, p.cx, p.cy)]));
  return map.pads
    .map((p) => p.id)
    .sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
}

export type Direction = "left" | "right" | "up" | "down";
export const DIRECTIONS: readonly Direction[] = ["left", "right", "up", "down"];
const VECTORS: Record<Direction, readonly [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/**
 * The nearest pad within a 90-degree cone in `direction` from `fromId` (D5.2 [ASSUMPTION]): a pad counts when its
 * offset along the direction is positive and at least its sideways offset. Ties go to route order. Null if none.
 */
export function padInDirection(map: MapGeometry, fromId: string, direction: Direction): string | null {
  const from = map.pads.find((p) => p.id === fromId);
  if (from === undefined) return null;
  const [vx, vy] = VECTORS[direction];
  const order = padOrder(map);
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const id of order) {
    const pad = map.pads.find((p) => p.id === id);
    if (pad === undefined || pad.id === fromId) continue;
    const dx = pad.x - from.x;
    const dy = pad.y - from.y;
    const forward = dx * vx + dy * vy;
    const sideways = Math.abs(dx * vy - dy * vx);
    if (forward <= 0 || forward < sideways) continue;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  return best;
}

/** Pads the arrow keys never reach from the first pad in route order (D5.2), in document order. */
export function padsUnreachableByArrows(map: MapGeometry): string[] {
  const start = padOrder(map)[0];
  if (start === undefined) return [];
  const seen = new Set<string>([start]);
  const queue = [start];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const d of DIRECTIONS) {
      const to = padInDirection(map, next, d);
      if (to !== null && !seen.has(to)) {
        seen.add(to);
        queue.push(to);
      }
    }
  }
  return map.pads.map((p) => p.id).filter((id) => !seen.has(id));
}
