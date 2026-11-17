// Loads the versioned game data the way the release publishes it (spine S5.1): /game-data/current.json names the
// versions, then /game-data/ruleset/<v>.json and /game-data/campaign/<v>.json. In `npm run dev` these paths are
// served straight from the repository's game-data/ folder by the dev-only plugin in vite.config.ts, so the local
// battlefield always plays the data in the working tree (Phase 14 local development entry [ASSUMPTION]).
//
// Everything fetched is untrusted until game-core's strict parsers accept it. The asset manifest (Gate M, LD8) is the
// one optional file: if it cannot be loaded or parsed, the battle draws the repo art (REPO_ART), never fails.
import { parseCurrent, parsePlanet, parseRuleset, SUPPORTED_MECHANICS, type CurrentPointers, type PlanetDocument, type Ruleset } from "@scd/game-core";
import { LIMITS } from "@scd/shared";
import { bindManifest, DEFAULT_MANIFEST_VERSION, parseManifest, REPO_ART, type ArtBinding } from "@scd/shared/manifest";

export interface GameData {
  readonly ruleset: Ruleset;
  readonly planet: PlanetDocument;
  /** How the battle draws its art: the pinned asset manifest, or the repo art when it could not be loaded. */
  readonly art: ArtBinding;
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

/** The asset manifest of a version (null: m1, the repo art) bound for drawing; the repo art if it cannot be loaded. */
export async function loadArt(manifestVersion: string | null | undefined): Promise<ArtBinding> {
  const version = manifestVersion ?? DEFAULT_MANIFEST_VERSION;
  try {
    if (!new RegExp(LIMITS.gameData.versionPattern).test(version)) throw new Error("asset manifest version is malformed");
    return bindManifest(parseManifest(await getJson(`/game-data/asset-manifest/${version}.json`), version));
  } catch (error) {
    console.warn(`asset manifest ${version}: ${error instanceof Error ? error.message : String(error)}; drawing the repo art`);
    return REPO_ART;
  }
}

/** The ruleset, planet document and art of given versions: a saved run plays the versions it pinned, not
 *  current.json's. */
export async function loadGameDataVersions(rulesetVersion: string, campaignVersion: string, manifestVersion: string | null = null): Promise<GameData> {
  const pattern = new RegExp(LIMITS.gameData.versionPattern);
  if (!pattern.test(rulesetVersion) || !pattern.test(campaignVersion)) throw new Error("game data version is malformed");
  const ruleset = parseRuleset(await getJson(`/game-data/ruleset/${rulesetVersion}.json`));
  if (!SUPPORTED_MECHANICS.includes(ruleset.mechanics)) throw new Error(`ruleset ${ruleset.version}: mechanics ${ruleset.mechanics} not supported`);
  const planet = parsePlanet(await getJson(`/game-data/campaign/${campaignVersion}.json`), ruleset);
  return { ruleset, planet, art: await loadArt(manifestVersion) };
}

export async function loadGameData(): Promise<GameData> {
  const current = await loadCurrent();
  return loadGameDataVersions(current.rulesetVersion, current.campaignVersion, current.assetManifestVersion ?? null);
}
