// Board geometry for the test players (Gate M, LD0; C17.1): how much route each pad reaches, and a pad plan derived
// from that for any map. The Python simulator's Competent player has a hand-made plan for Moonbeam
// (tools/sim/sim.py Competent.BLUEPRINT); a level designer's map needs one made from the geometry instead.
//
// Coverage is measured in tiles of route within a radius of the pad centre, sampled every 1/SAMPLES_PER_TILE of a
// tile. It is a planning heuristic only: the battle's own range checks (sim/route.ts withinRange) stay exact.
import type { BattleConfig, PadInfo } from "../sim/config";
import { routePoint, UNITS_PER_TILE } from "../sim/route";

const SAMPLES_PER_TILE = 20;

/** Route sample points (units) every 1/SAMPLES_PER_TILE tile, with their progress (units). */
function samples(config: BattleConfig): { x: number; y: number; progress: number }[] {
  const stepUnits = UNITS_PER_TILE / SAMPLES_PER_TILE;
  const out: { x: number; y: number; progress: number }[] = [];
  for (let progress = 0; progress <= config.route.length; progress += stepUnits) {
    const p = routePoint(config.route, progress);
    out.push({ x: p.x, y: p.y, progress });
  }
  return out;
}

export interface PadReach {
  /** Tiles of route within `radiusTiles` of the pad centre. */
  readonly tiles: number;
  /** Route progress (0..1) of the first covered point, or 1 when nothing is covered. */
  readonly first: number;
}

/** Tiles of route within `radiusTiles` of each pad, by pad ID (tools/sim Game.coverage). */
export function padReach(config: BattleConfig, radiusTiles: number): Map<string, PadReach> {
  const pts = samples(config);
  const r = radiusTiles * UNITS_PER_TILE;
  const rSq = r * r;
  const out = new Map<string, PadReach>();
  for (const pad of config.pads) {
    let n = 0;
    let first = config.route.length;
    for (const s of pts) {
      const dx = s.x - pad.cx;
      const dy = s.y - pad.cy;
      if (dx * dx + dy * dy <= rSq) {
        n += 1;
        if (s.progress < first) first = s.progress;
      }
    }
    out.set(pad.id, { tiles: n / SAMPLES_PER_TILE, first: first / config.route.length });
  }
  return out;
}

/** Pad ID -> class ID: which class the competent player means to put on each pad. */
export type Blueprint = Readonly<Record<string, string>>;

/** The simulator's Moonbeam plan (tools/sim/sim.py Competent.BLUEPRINT), with the planet document's pad IDs. */
export const MOONBEAM_BLUEPRINT: Blueprint = {
  p01: "nova",
  p02: "nova",
  p03: "pip",
  p04: "orion",
  p05: "juno",
  p06: "nova",
  p07: "nova",
  p08: "juno",
  p09: "orion",
  p10: "sol",
  p11: "pip",
  p12: "orion",
  p13: "juno",
  p14: "juno",
  p15: "mira",
  p16: "nova",
};

function rangeTiles(config: BattleConfig, classId: string): number {
  const cls = config.classes[classId];
  const top = cls?.levels[cls.levels.length - 1];
  return top?.shot?.rangeTiles ?? top?.buff?.radiusTiles ?? 2.5;
}

function take(pads: PadInfo[], count: number, score: (p: PadInfo) => number): PadInfo[] {
  // Highest score first; ties by pad order, so the plan is a pure function of the map.
  const ranked = [...pads].sort((a, b) => score(b) - score(a) || pads.indexOf(a) - pads.indexOf(b));
  return ranked.slice(0, Math.max(0, count));
}

/**
 * A pad plan for any map, in the spirit of the Moonbeam plan (C17.1): area damage (Juno) on the pads that reach the
 * most route, long range (Orion) on the pads that reach the most at its range, slows (Pip) where the route is early
 * and well covered, Sol beside the most planned attackers, one Mira on the pad that reaches least, Nova elsewhere.
 * How many of each follows the Moonbeam plan (4, 3, 2, 1, 1), never above the class's deploy cap. A class the
 * ruleset does not have is skipped. [PROPOSAL; the LD0 spike compares it with the hand-made plan]
 */
export function deriveBlueprint(config: BattleConfig): Blueprint {
  const has = (id: string): boolean => config.classes[id] !== undefined;
  const capped = (id: string, n: number): number => (has(id) ? Math.min(n, config.classes[id]?.deployCap ?? n) : 0);
  const near = padReach(config, 2.5);
  const far = padReach(config, rangeTiles(config, "orion"));
  const plan: Record<string, string> = {};
  let left = [...config.pads];
  const assign = (picked: PadInfo[], classId: string): void => {
    for (const p of picked) plan[p.id] = classId;
    left = left.filter((p) => !picked.includes(p));
  };
  assign(take(left, capped("juno", 4), (p) => near.get(p.id)?.tiles ?? 0), "juno");
  assign(take(left, capped("orion", 3), (p) => far.get(p.id)?.tiles ?? 0), "orion");
  assign(
    take(left, capped("pip", 2), (p) => {
      const r = near.get(p.id);
      return r === undefined ? 0 : r.tiles * (1.5 - r.first);
    }),
    "pip",
  );
  if (has("sol")) {
    const buff = rangeTiles(config, "sol") * UNITS_PER_TILE;
    const attackers = config.pads.filter((p) => plan[p.id] !== undefined);
    const around = (p: PadInfo): number =>
      attackers.filter((a) => (a.cx - p.cx) ** 2 + (a.cy - p.cy) ** 2 <= buff * buff).length * 100 + (near.get(p.id)?.tiles ?? 0);
    assign(take(left, capped("sol", 1), around), "sol");
  }
  assign(take(left, capped("mira", 1), (p) => -(near.get(p.id)?.tiles ?? 0)), "mira");
  for (const p of left) plan[p.id] = "nova";
  return plan;
}
