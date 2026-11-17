// Pads for the keyboard (Phase 31, D5.2): their order, arrow-key movement, accessible names, and the route point
// nearest a press (for aiming a Comet Burst with the pointer). Pure functions of the battle configuration.
import type { Battle, BattleConfig, Targeting } from "@scd/game-core";

// Route order, arrow neighbours and the nearest route point moved to game-core (Gate M, LD1: src/map/order.ts) so the
// level designer's rules use the same ones; re-exported here for the battlefield code.
export { nearestProgress, padInDirection, padOrder, type Direction } from "@scd/game-core";

const AIM_WORDS: Record<Targeting, string> = {
  FRONT: "aiming at the front",
  FAST: "aiming at the fastest",
  CROWD: "aiming at the biggest group",
  STRONG: "aiming at the strongest",
};

/** What a screen reader hears for a pad button (D5.2): "Pad 4, Nova level 2, aiming at the front", "Pad 5, empty". */
export function padLabel(config: BattleConfig, battle: Readonly<Battle> | null, padId: string, open?: boolean): string {
  const pad = config.pads.find((p) => p.id === padId);
  const name = `Pad ${Number.parseInt(padId.replace(/\D/g, ""), 10) || padId}`;
  if (pad === undefined) return name;
  if (!(open ?? pad.open)) return `${name}, opens after wave ${pad.opensAfterWave}`;
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
