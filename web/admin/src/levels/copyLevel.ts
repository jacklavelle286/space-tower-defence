// Copy a level to a planet (Gate M, LD19; owner 2026-11-19): a new level with the same map, waves and challenges under
// a new ID, for the same planet or another. Pure: the Levels page loads the source draft, makes the copy here and
// creates it on the chosen planet (R41). A published level cannot move planet (R62 refuses it): this is how its map and
// waves get onto another planet.
//
// Renamed so the copy owns everything (levelFile.ts readLevelFile's rules): pads "<from>-p03" -> "<to>-p03", challenge
// wave sets and waves "<from>-x" -> "<to>-x", every wave set's mapId -> the new ID (copyWaves.ts does the waves).
import type { LevelFile } from "../api";
import { copyWavesFrom, renameOwned } from "./copyWaves";

export interface CopyLevelOptions {
  readonly levelId: string;
  readonly name: string;
  /** Bring the 50 campaign waves and the campaign card (publishing the copy makes it the planet's campaign map). */
  readonly campaign: boolean;
}

/** Whether a level holds the 50-wave campaign. */
export const ownsCampaign = (level: LevelFile): boolean => (level.waves?.length ?? 0) > 0 && level.waveSets["campaign"] !== undefined;

export function copyLevel(source: LevelFile, options: CopyLevelOptions): LevelFile {
  const from = source.levelId;
  const to = options.levelId;
  const target: LevelFile = {
    kind: "level",
    schema: 1,
    levelId: to,
    name: options.name,
    map: {
      ...structuredClone(source.map),
      name: options.name,
      pads: source.map.pads.map((p) => ({ ...p, id: renameOwned(p.id, from, to) })),
    },
    challengeWaves: {},
    waveSets: {},
  };
  return copyWavesFrom(target, source, { campaign: options.campaign, challenges: true }).level;
}
