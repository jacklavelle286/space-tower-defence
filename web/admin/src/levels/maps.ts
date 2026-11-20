// Maps (Gate M, LD22; ADR-0043, owner 2026-11-20: "drop the concept of planets - and just do maps"). Each map is its
// own adventure on Home: underneath, one level on its own planet, which the admin makes (R54) and, when the map is
// first published live, releases (R56). The Moon (luna-1) is the repository's first map; levels made on it before LD22
// can be made into maps of their own here.
import type { AdminApi, LevelFile, LevelSummary, PlanetSummary } from "../api";
import { copyLevel } from "./copyLevel";
import { withAdventure } from "./levelFile";

export const MOON = "luna-1";
/** A planet's versions are "<planetId>-a<n>" within 40 characters, so a map's ID (its planet's) is at most 34. */
export const MAP_ID_MAX = 34;
/** A map's ID: a level ID that is also a planet ID (a letter first, at most 34). */
export const MAP_ID = /^[a-z][a-z0-9-]{0,32}[a-z0-9]$/u;
const PLANET_NAME_MAX = 40;

/** The planet a level is on. */
export const planetOf = (item: Pick<LevelSummary, "planetId">): string => item.planetId ?? MOON;

/** A level made on the Moon before maps (it shares the Moon's adventure instead of having its own). */
export const onTheMoon = (item: Pick<LevelSummary, "planetId">): boolean => planetOf(item) === MOON;

/** A free ID from a name: "<slug>", then "<slug>-2", "-3"… (at most MAP_ID_MAX). */
export function freeId(name: string, taken: ReadonlySet<string>): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^[^a-z]+|-+$/gu, "")
    .slice(0, MAP_ID_MAX - 3)
    .replace(/-+$/u, "");
  const base = slug.length >= 2 ? slug : "map";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

type MapApi = Pick<AdminApi, "createPlanet" | "createLevel">;

/** Makes a new map: its planet (named as the map, the Moon's look, the map's backdrop) and its level, with its 50-wave
 *  adventure. The planet's ID is the level's. `planetMade`: an unreleased planet with that ID and no level is there
 *  already (an earlier try whose level was not saved), so only the level is made. */
export async function createMap(api: MapApi, level: LevelFile, planetMade = false): Promise<void> {
  const map = withAdventure(level);
  if (!planetMade)
    await api.createPlanet({
      planetId: map.levelId,
      name: map.name.slice(0, PLANET_NAME_MAX).trim(),
      icon: null,
      artSet: "moon",
      backdrop: map.map.art.backdrop,
    });
  await api.createLevel(map, map.levelId);
}

/** An unreleased planet with no level on it: left by a New map whose level was not saved, so its ID can be used again. */
export const emptyPlanet = (planet: PlanetSummary | undefined, levelIds: ReadonlySet<string>): boolean =>
  planet !== undefined && planet.status === "DRAFT" && planet.latestVersion === undefined && !levelIds.has(planet.planetId);

/**
 * Makes a level on the Moon into a map of its own. A draft whose ID can be a map's (`newId` is its own ID) moves onto
 * its new planet (R62) and is given an adventure if it has none; otherwise (a published level stays where it is: saved
 * games are pinned to its versions) it is copied, under `newId`, into the new map. Returns the map's level ID.
 */
export async function makeOwnMap(
  api: Pick<AdminApi, "createPlanet" | "createLevel" | "moveLevel" | "getLevel" | "saveLevel">,
  item: LevelSummary,
  newId: string,
): Promise<string> {
  const view = await api.getLevel(item.levelId);
  if (item.status === "DRAFT" && newId === item.levelId) {
    const draft = view.draft.level;
    await api.createPlanet({
      planetId: item.levelId,
      name: draft.name.slice(0, PLANET_NAME_MAX).trim(),
      icon: null,
      artSet: "moon",
      backdrop: draft.map.art.backdrop,
    });
    await api.moveLevel(item.levelId, item.levelId);
    const full = withAdventure(draft);
    if (full !== draft)
      await api.saveLevel(item.levelId, {
        draftRevision: view.draft.draftRevision,
        level: full,
      });
    return item.levelId;
  }
  await createMap(
    api,
    copyLevel(view.draft.level, {
      levelId: newId,
      name: view.draft.level.name,
      campaign: true,
    }),
  );
  return newId;
}
