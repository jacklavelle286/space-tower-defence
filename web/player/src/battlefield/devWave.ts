// The local battlefield's dev wave (Phase 26, development builds only): /play/local?aliens=... plays one extra wave
// made here, so every alien of the ruleset can be watched without waiting for the campaign wave it first appears in.
// It is never game data: it exists only in the copy of the planet document LocalSlice builds.
import type { AuthoredWave, Ruleset } from "@scd/game-core";

/**
 * The ?aliens= dev wave: one group per alien type, 3 s apart, its aliens 0.6 s apart, at the health and speed the data
 * gives (hpMult 1). Aliens that are only ever released (Slimelets) are refused here, as parsePlanet refuses them in a
 * real wave: they come out of Split Slimes.
 */
export function devWave(ruleset: Ruleset, spec: string, wave: number): AuthoredWave {
  const entries: [string, number][] =
    spec === "all"
      ? Object.entries(ruleset.aliens)
          .filter(([, a]) => !a.descendantOnly)
          .map(([id]) => [id, 2])
      : spec.split(",").map((part) => {
          const [id = "", n = "1"] = part.split(":");
          return [id, Number.parseInt(n, 10)];
        });
  for (const [id, count] of entries) {
    const alien = ruleset.aliens[id];
    if (alien === undefined) throw new Error(`?aliens=: ruleset ${ruleset.version} has no alien "${id}"`);
    if (alien.descendantOnly) throw new Error(`?aliens=: "${id}" is only ever released by another alien`);
    if (!Number.isInteger(count) || count < 1 || count > 20) throw new Error(`?aliens=: count for "${id}" must be 1 to 20`);
  }
  return { wave, groups: entries.map(([type, count], i) => ({ type, count, at: i * 3, gap: 0.6 })), hpMult: 1, speedMult: 1 };
}
