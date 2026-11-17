// The local battlefield's dev waves (development builds only): /play/local?aliens=... (Phase 26) plays one extra wave
// made here, so every alien of the ruleset can be watched without waiting for the campaign wave it first appears in;
// /play/local?boss=... (Phase 27) plays a boss wave, or one for each boss. They are never game data: they exist only
// in the copy of the planet document LocalSlice builds.
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

/**
 * The ?boss= dev waves: one wave per boss ("all": every boss in the ruleset, in ID order; or one boss ID such as
 * "boss3"). Each is four Moon Blobs, the boss 3 s in, then four more Moon Blobs walking just behind it, so Queen
 * Bubbla's gift has aliens to land on. hpMult 1: the boss has its own absolute health anyway (C7), and the blobs stay
 * easy. A wave holds one boss, as parsePlanet requires of real waves (C7).
 */
export function devBossWaves(ruleset: Ruleset, spec: string, firstWave: number): AuthoredWave[] {
  const ids = spec === "all" ? Object.keys(ruleset.bosses) : [spec];
  if (ids.length === 0) throw new Error(`?boss=: ruleset ${ruleset.version} has no bosses (try ?ruleset=r3)`);
  return ids.map((id, i) => {
    if (!Object.hasOwn(ruleset.bosses, id)) throw new Error(`?boss=: ruleset ${ruleset.version} has no boss "${id}" (try ?ruleset=r3)`);
    return {
      wave: firstWave + i,
      groups: [
        { type: "blob", count: 4, at: 0, gap: 1.5 },
        { type: id, count: 1, at: 3, gap: 0 },
        { type: "blob", count: 4, at: 6, gap: 1.5 },
      ],
      hpMult: 1,
      speedMult: 1,
    };
  });
}
