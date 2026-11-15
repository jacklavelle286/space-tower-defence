// Loads the versioned game data the way the release publishes it (spine S5.1): /game-data/current.json names the
// versions, then /game-data/ruleset/<v>.json and /game-data/campaign/<v>.json. In `npm run dev` these paths are
// served straight from the repository's game-data/ folder by the dev-only plugin in vite.config.ts, so the local
// battlefield always plays the data in the working tree (Phase 14 local development entry [ASSUMPTION]).
//
// Everything fetched is untrusted until game-core's strict parsers accept it.
import { parseCurrent, parsePlanet, parseRuleset, SUPPORTED_MECHANICS, type CurrentPointers, type PlanetDocument, type Ruleset } from "@scd/game-core";
import { LIMITS } from "@scd/shared";

export interface GameData {
  readonly ruleset: Ruleset;
  readonly planet: PlanetDocument;
}

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/** The released versions (/game-data/current.json); a new run pins these (spine S5.1). */
export async function loadCurrent(): Promise<CurrentPointers> {
  return parseCurrent(await getJson("/game-data/current.json"));
}

/** The ruleset and planet document of given versions: a saved run plays the versions it pinned, not current.json. */
export async function loadGameDataVersions(rulesetVersion: string, campaignVersion: string): Promise<GameData> {
  const pattern = new RegExp(LIMITS.gameData.versionPattern);
  if (!pattern.test(rulesetVersion) || !pattern.test(campaignVersion)) throw new Error("game data version is malformed");
  const ruleset = parseRuleset(await getJson(`/game-data/ruleset/${rulesetVersion}.json`));
  if (!SUPPORTED_MECHANICS.includes(ruleset.mechanics)) throw new Error(`ruleset ${ruleset.version}: mechanics ${ruleset.mechanics} not supported`);
  const planet = parsePlanet(await getJson(`/game-data/campaign/${campaignVersion}.json`), ruleset);
  return { ruleset, planet };
}

export async function loadGameData(): Promise<GameData> {
  const current = await loadCurrent();
  return loadGameDataVersions(current.rulesetVersion, current.campaignVersion);
}
