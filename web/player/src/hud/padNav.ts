// Pads for the keyboard (Phase 31, D5.2): their order, arrow-key movement, accessible names, and the route point
// nearest a press (for aiming a Comet Burst with the pointer). Pure functions of the battle configuration.
import type { Battle, BattleConfig, Route, Targeting } from "@scd/game-core";

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
export function padOrder(config: BattleConfig): string[] {
  const at = new Map(config.pads.map((p) => [p.id, nearestProgress(config.route, p.cx, p.cy)]));
  return config.pads
    .map((p) => p.id)
    .sort((a, b) => (at.get(a) ?? 0) - (at.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
}

export type Direction = "left" | "right" | "up" | "down";
const VECTORS: Record<Direction, readonly [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/**
 * The nearest pad within a 90-degree cone in `direction` from `fromId` (D5.2 [ASSUMPTION]): a pad counts when its
 * offset along the direction is positive and at least its sideways offset. Ties go to route order. Null if none.
 */
export function padInDirection(config: BattleConfig, fromId: string, direction: Direction): string | null {
  const from = config.pads.find((p) => p.id === fromId);
  if (from === undefined) return null;
  const [vx, vy] = VECTORS[direction];
  const order = padOrder(config);
  let best: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const id of order) {
    const pad = config.pads.find((p) => p.id === id);
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

const AIM_WORDS: Record<Targeting, string> = {
  FRONT: "aiming at the front",
  FAST: "aiming at the fastest",
  CROWD: "aiming at the biggest group",
  STRONG: "aiming at the strongest",
};

/** What a screen reader hears for a pad button (D5.2): "Pad 4, Nova level 2, aiming at the front", "Pad 5, empty". */
export function padLabel(config: BattleConfig, battle: Readonly<Battle> | null, padId: string): string {
  const pad = config.pads.find((p) => p.id === padId);
  const name = `Pad ${Number.parseInt(padId.replace(/\D/g, ""), 10) || padId}`;
  if (pad === undefined) return name;
  if (!pad.open) return `${name}, opens after wave ${pad.opensAfterWave}`;
  const tower = battle?.towers.find((t) => t.padId === padId);
  if (tower === undefined) return `${name}, empty`;
  const cls = config.classes[tower.classId];
  const aims = (cls?.targeting.length ?? 0) > 0;
  return `${name}, ${cls?.name ?? tower.classId} level ${tower.level}${aims ? `, ${AIM_WORDS[tower.targeting]}` : ""}`;
}

/** The modes the astronaut on a pad may choose at its level (C5.3), in the class's order. */
export function aimChoices(config: BattleConfig, classId: string, level: number): Targeting[] {
  const cls = config.classes[classId];
  if (cls === undefined) return [];
  return cls.targeting.filter((mode) => level >= (cls.targetingFromLevel[mode] ?? 1));
}
