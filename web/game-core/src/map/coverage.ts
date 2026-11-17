// How much route each pad reaches (Gate M, LD1; C3.1-C3.3): used by the design rules (scope §5 "route in range",
// "start pads reach 5.5 tiles", "pads covering 3+ stretches") and by the test players' pad plans (src/bot).
//
// Measured in tiles of route within a radius of the pad centre, sampled every 1/SAMPLES_PER_TILE of a tile. A
// planning measure only: the battle's own range checks (sim/route.ts withinRange) stay exact.
import { routePoint, UNITS_PER_TILE } from "../sim/route.ts";
import type { MapGeometry } from "./geometry.ts";

const SAMPLES_PER_TILE = 20;

export interface PadReach {
  /** Tiles of route within the radius of the pad centre. */
  readonly tiles: number;
  /** Route progress (0..1) of the first covered point, or 1 when nothing is covered. */
  readonly first: number;
  /** How many route segments (stretches) the circle touches. */
  readonly stretches: number;
}

/** Tiles of route within `radiusTiles` of each pad, by pad ID (tools/sim Game.coverage). */
export function padReach(map: MapGeometry, radiusTiles: number): Map<string, PadReach> {
  const stepUnits = UNITS_PER_TILE / SAMPLES_PER_TILE;
  const pts: { x: number; y: number; progress: number; segment: number }[] = [];
  for (let progress = 0; progress <= map.route.length; progress += stepUnits) {
    const p = routePoint(map.route, progress);
    const segment = map.route.segments.findIndex((s) => progress <= s.end);
    pts.push({ x: p.x, y: p.y, progress, segment });
  }
  const r = radiusTiles * UNITS_PER_TILE;
  const rSq = r * r;
  const out = new Map<string, PadReach>();
  for (const pad of map.pads) {
    let n = 0;
    let first = map.route.length;
    const segments = new Set<number>();
    for (const s of pts) {
      const dx = s.x - pad.cx;
      const dy = s.y - pad.cy;
      if (dx * dx + dy * dy <= rSq) {
        n += 1;
        segments.add(s.segment);
        if (s.progress < first) first = s.progress;
      }
    }
    out.set(pad.id, { tiles: n / SAMPLES_PER_TILE, first: first / map.route.length, stretches: segments.size });
  }
  return out;
}
