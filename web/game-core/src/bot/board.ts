// Board geometry for the test players (Gate M, LD0; C17.1): how much route each pad reaches, and a pad plan derived
// from that for any map. The Python simulator's Competent player has a hand-made plan for Moonbeam
// (tools/sim/sim.py Competent.BLUEPRINT); a level designer's map needs one made from the geometry instead.
//
// Coverage comes from src/map/coverage.ts, the measure the design rules use too.
import { padReach } from "../map/coverage";
import type { BattleConfig, PadInfo } from "../sim/config";
import { UNITS_PER_TILE } from "../sim/route";

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
