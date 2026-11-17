// A level merged into a planet document (Gate M, LD4; scope-level-designer.md §3.1 "Publish unit"). A level owns its
// map, its challenge waves and its wave sets, and (a campaign level) the campaign's waves 1-50 and the `campaign` wave
// set. Merging puts exactly those sections onto the planet document; everything else comes from the planet as it is.
// The editor validates the merged document (so it shows what publishing will refuse), the merge-level script writes
// it as a new campaign version for a normal release, and the publisher (LD6) does the same merge.
//
// Works on JSON, before parsing: the result goes through parsePlanet like any other file. Imports nothing but types
// (and SCHEMA1_MAP_ID), with explicit .ts extensions, so Node runs scripts/merge-level.ts directly.
import { CAMPAIGN_WAVE_SET_ID, SCHEMA1_MAP_ID } from "./game-data.ts";

type Json = Record<string, unknown>;

/** The level file's sections the merge reads (the full shape is web/admin's LevelFile; api/shared/levels.py checks it). */
export interface LevelSections {
  readonly levelId: string;
  readonly map: Json;
  readonly waves?: readonly Json[];
  readonly challengeWaves: Readonly<Record<string, Json>>;
  readonly waveSets: Readonly<Record<string, Json>>;
}

const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** A planet document as schema 2: a schema 1 file's map becomes maps[SCHEMA1_MAP_ID], every wave set on it. */
export function asSchema2(planet: unknown): Json {
  if (!isObj(planet)) throw new Error("merge: the planet document is not an object");
  if (planet["schema"] === 2) return clone(planet);
  const { map, waveSets, $comment: _comment, ...rest } = clone(planet);
  const sets: Json = {};
  for (const [id, set] of Object.entries(isObj(waveSets) ? waveSets : {})) sets[id] = { ...(isObj(set) ? set : {}), mapId: SCHEMA1_MAP_ID };
  const m = isObj(map) ? map : {};
  return {
    kind: rest["kind"],
    schema: 2,
    version: rest["version"],
    planetId: rest["planetId"],
    name: rest["name"],
    maps: { [SCHEMA1_MAP_ID]: { name: rest["name"], grid: m["grid"], route: m["route"], pads: m["pads"], art: { backdrop: null, decorations: [] } } },
    waves: rest["waves"],
    challengeWaves: {},
    waveSets: sets,
  };
}

/** Whether the level owns the campaign (its waves 1-50 and the `campaign` wave set). */
export function ownsCampaign(level: Pick<LevelSections, "waveSets">): boolean {
  return Object.hasOwn(level.waveSets, CAMPAIGN_WAVE_SET_ID);
}

/**
 * The planet document with the level's sections in it, as `version`. Sections with the level's IDs are replaced (a
 * level merged again replaces itself); a campaign level replaces the waves and the campaign wave set, and its map
 * becomes the campaign's map (the old map stays for the wave sets still on it).
 */
export function mergeLevel(planet: unknown, level: LevelSections, version: string): Json {
  const doc = asSchema2(planet);
  const maps = { ...(doc["maps"] as Json), [level.levelId]: clone(level.map) };
  const challengeWaves = { ...(isObj(doc["challengeWaves"]) ? doc["challengeWaves"] : {}), ...clone(level.challengeWaves) };
  const waveSets = { ...(doc["waveSets"] as Json), ...clone(level.waveSets) };
  const waves = ownsCampaign(level) && level.waves !== undefined && level.waves.length > 0 ? clone(level.waves) : doc["waves"];
  return { ...doc, version, maps, waves, challengeWaves, waveSets };
}

/** The fields of a merged document that belong to the level (for showing only its own problems). */
export function levelOwnsField(level: LevelSections, field: string): boolean {
  if (field === `planet.maps.${level.levelId}` || field.startsWith(`planet.maps.${level.levelId}.`) || field.startsWith(`planet.maps.${level.levelId}[`)) return true;
  if (ownsCampaign(level) && (field === "planet.waves" || field.startsWith("planet.waves["))) return true;
  const owned = (prefix: string, ids: readonly string[]): boolean => ids.some((id) => field === `${prefix}.${id}` || field.startsWith(`${prefix}.${id}.`) || field.startsWith(`${prefix}.${id}[`));
  return owned("planet.waveSets", Object.keys(level.waveSets)) || owned("planet.challengeWaves", Object.keys(level.challengeWaves));
}
