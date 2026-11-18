// Copy waves and wave sets from another level (Gate M, LD17; owner 2026-11-18). Pure: the panel (CopyWaves.tsx)
// loads the other level's draft and applies the result as one edit, so Ctrl+Z puts back what there was.
//
// What moves, and how it is renamed so it belongs to this level (levelFile.ts readLevelFile's rules):
//   campaign    the 50 waves, the campaign card (played on this level's map) and the keyframe marks
//   challenges  every challenge wave set and challenge wave, "<other>-x" becoming "<this>-x"; a set's challenge-wave
//               references are renamed the same way; campaign wave numbers stay as they are
// Preset astronauts stand on pads: "<other>-p03" becomes "<this>-p03" when this map has that pad, otherwise the preset
// is left out (and counted in the notes). A challenge with the same new name as one already here replaces it.
import type { LevelFile, LevelWaveSet } from "../api";

export interface CopyChoice {
  readonly campaign: boolean;
  readonly challenges: boolean;
}

export interface CopyResult {
  readonly level: LevelFile;
  /** One sentence per thing done, for the panel's status line. */
  readonly notes: readonly string[];
}

/** "<from>-x" (or a bare "x") as "<to>-x". */
export function renameOwned(key: string, from: string, to: string): string {
  return `${to}-${key.startsWith(`${from}-`) ? key.slice(from.length + 1) : key}`;
}

/** What the source has to copy: [campaign waves, challenge wave sets, challenge waves]. */
export function copyable(source: LevelFile): { campaign: boolean; challenges: number; challengeWaves: number } {
  return {
    campaign: (source.waves?.length ?? 0) > 0 && source.waveSets["campaign"] !== undefined,
    challenges: Object.keys(source.waveSets).filter((k) => k !== "campaign").length,
    challengeWaves: Object.keys(source.challengeWaves).length,
  };
}

export function copyWavesFrom(target: LevelFile, source: LevelFile, choice: CopyChoice): CopyResult {
  const from = source.levelId;
  const to = target.levelId;
  const pads = new Set(target.map.pads.map((p) => p.id));
  const notes: string[] = [];
  let droppedPresets = 0;
  const onThisMap = (set: LevelWaveSet): LevelWaveSet => {
    const presetPlacements = set.presetPlacements
      .map((p) => ({ ...p, padId: renameOwned(p.padId, from, to) }))
      .filter((p) => pads.has(p.padId));
    droppedPresets += set.presetPlacements.length - presetPlacements.length;
    return { ...structuredClone(set), mapId: to, presetPlacements };
  };

  let level: LevelFile = structuredClone(target);
  const has = copyable(source);
  if (choice.campaign && has.campaign) {
    level = {
      ...level,
      waves: structuredClone(source.waves ?? []),
      waveSets: { ...level.waveSets, campaign: onThisMap(source.waveSets["campaign"] as LevelWaveSet) },
      design: { ...level.design, keyframes: [...(source.design?.keyframes ?? [])], overrides: [...(source.design?.overrides ?? [])] },
    };
    notes.push(`Copied the ${source.waves?.length ?? 0} campaign waves and the campaign card.`);
  }
  if (choice.challenges && (has.challenges > 0 || has.challengeWaves > 0)) {
    const challengeWaves = { ...level.challengeWaves };
    const waveSets = { ...level.waveSets };
    const replaced: string[] = [];
    for (const [key, wave] of Object.entries(source.challengeWaves)) challengeWaves[renameOwned(key, from, to)] = structuredClone(wave);
    for (const [key, set] of Object.entries(source.waveSets)) {
      if (key === "campaign") continue;
      const name = renameOwned(key, from, to);
      if (waveSets[name] !== undefined) replaced.push(name);
      const copied = onThisMap(set);
      waveSets[name] = { ...copied, waves: copied.waves.map((w) => (typeof w === "string" ? renameOwned(w, from, to) : w)) };
    }
    level = { ...level, challengeWaves, waveSets };
    notes.push(
      `Copied ${has.challenges} challenge${has.challenges === 1 ? "" : "s"} and ${has.challengeWaves} challenge wave${has.challengeWaves === 1 ? "" : "s"}${
        replaced.length > 0 ? ` (replacing ${replaced.join(", ")})` : ""
      }.`,
    );
  }
  if (droppedPresets > 0) notes.push(`${droppedPresets} preset astronaut${droppedPresets === 1 ? " was" : "s were"} left out: ${droppedPresets === 1 ? "its pad is" : "their pads are"} not on this map.`);
  if (notes.length === 0) notes.push("Nothing to copy: that level has none of what you chose.");
  return { level, notes };
}
