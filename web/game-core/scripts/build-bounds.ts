// The game-data build (Phase 13, M1-23; spine S5.1, C15, H.8.5 b and e): checks every file in game-data/ and writes
// the tree the release publishes on the player site under /game-data/, including the generated bounds file.
//
// Run from web/:
//   node game-core/scripts/build-bounds.ts --out <dir>      check, then write <dir>/ruleset/<v>.json,
//                                                           <dir>/campaign/<v>.json, <dir>/bounds/<r>__<c>.json and
//                                                           <dir>/current.json (the release: --out player/dist/game-data)
//   node game-core/scripts/build-bounds.ts --check          check only; also fails if the bounds fixture is stale
//   node game-core/scripts/build-bounds.ts --write-fixture  rewrite contracts/fixtures/bounds/<r>__<c>.json, the copy of
//                                                           the current bounds file api/tests reads with load_bounds
//
// What "check" means: every ruleset and planet document parses (src/data/game-data.ts: unknown keys refused, version
// strings ^[a-z0-9.-]{1,40}$, G-15 wave-set action limit), each file's `version` equals its file name, current.json
// names files that exist, and the current planet document parses against the current ruleset. Any problem exits 1
// and writes nothing.
//
// Ruleset and planet files are copied byte for byte: the publish uploads them create-only, so a file already
// published must never change (add a new version instead). The bounds file is generated here and never hand-edited.
// Only the pair named by current.json gets a bounds file; earlier pairs keep the files earlier releases published.
//
// It imports only node: modules and src/data/game-data.ts (which imports nothing), so Node 24 runs it directly.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { argv, exit } from "node:process";
import { fileURLToPath } from "node:url";
import {
  boundsJson,
  boundsVersion,
  buildBounds,
  GameDataError,
  parseCurrent,
  parsePlanet,
  parseRuleset,
  type PlanetDocument,
  type Ruleset,
} from "../src/data/game-data.ts";

const REPO = resolve(import.meta.dirname, "..", "..", "..");
export const GAME_DATA_DIR = join(REPO, "game-data");
export const BOUNDS_FIXTURE_DIR = join(REPO, "contracts", "fixtures", "bounds");

/** Entries game-data/ may hold. Anything else stops the build, so no file is silently left unpublished. */
const ALLOWED_TOP = new Set(["ruleset", "campaign", "current.json", "README.md"]);
const KIND_DIRS = ["ruleset", "campaign"] as const;

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new GameDataError(`${path}: not valid JSON (${error instanceof Error ? error.message : String(error)})`);
  }
}

function jsonFiles(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir).sort();
  } catch {
    return [];
  }
  for (const name of names) {
    if (!name.endsWith(".json") || !statSync(join(dir, name)).isFile()) {
      throw new GameDataError(`${join(dir, name)}: only <version>.json files belong here`);
    }
  }
  return names;
}

export interface GameDataBuild {
  /** Path under /game-data/ -> file content, in publish order of kind (ruleset, campaign, bounds), then current.json. */
  files: Map<string, string>;
  current: { rulesetVersion: string; campaignVersion: string };
  boundsPath: string;
}

/** Check game-data/ and return the tree to publish. Throws GameDataError on the first problem. */
export function buildGameData(dir: string = GAME_DATA_DIR): GameDataBuild {
  for (const name of readdirSync(dir)) {
    if (!ALLOWED_TOP.has(name)) throw new GameDataError(`${join(dir, name)}: unexpected entry in game-data/`);
  }
  const files = new Map<string, string>();
  const rulesets = new Map<string, Ruleset>();
  const planetsRaw = new Map<string, unknown>();

  for (const kind of KIND_DIRS) {
    for (const name of jsonFiles(join(dir, kind))) {
      const path = join(dir, kind, name);
      const text = readFileSync(path, "utf8");
      const raw = readJson(path);
      const fileVersion = name.slice(0, -".json".length);
      const declared = (raw as { version?: unknown } | null)?.version;
      if (declared !== fileVersion) {
        throw new GameDataError(`${path}: "version" is ${JSON.stringify(declared)} but the file is named ${name}`);
      }
      if (kind === "ruleset") rulesets.set(fileVersion, parseRuleset(raw));
      else planetsRaw.set(fileVersion, raw);
      files.set(`${kind}/${name}`, text);
    }
  }

  const currentPath = join(dir, "current.json");
  const current = parseCurrent(readJson(currentPath));
  const ruleset = rulesets.get(current.rulesetVersion);
  if (ruleset === undefined) throw new GameDataError(`${currentPath}: ruleset ${current.rulesetVersion} is not in game-data/ruleset/`);
  if (!planetsRaw.has(current.campaignVersion)) {
    throw new GameDataError(`${currentPath}: campaign ${current.campaignVersion} is not in game-data/campaign/`);
  }

  // Each planet document must parse against some ruleset; the current one against the current ruleset.
  let currentPlanet: PlanetDocument | undefined;
  for (const [version, raw] of planetsRaw) {
    if (version === current.campaignVersion) {
      currentPlanet = parsePlanet(raw, ruleset);
      continue;
    }
    const problems: string[] = [];
    const fits = [...rulesets.values()].some((r) => {
      try {
        parsePlanet(raw, r);
        return true;
      } catch (error) {
        problems.push(`with ruleset ${r.version}: ${error instanceof Error ? error.message : String(error)}`);
        return false;
      }
    });
    if (!fits) throw new GameDataError(`campaign ${version} parses against no ruleset: ${problems.join("; ")}`);
  }
  if (currentPlanet === undefined) throw new GameDataError("unreachable: the current planet was not parsed");

  const boundsPath = `bounds/${boundsVersion(current.rulesetVersion, current.campaignVersion)}.json`;
  files.set(boundsPath, boundsJson(buildBounds(ruleset, currentPlanet)));
  files.set("current.json", readFileSync(currentPath, "utf8"));
  return { files, current, boundsPath };
}

/** The bounds fixture for api/tests, if it differs from what buildGameData() produces now ("" when up to date). */
export function staleBoundsFixture(dir: string = GAME_DATA_DIR): string {
  const build = buildGameData(dir);
  const fixture = join(BOUNDS_FIXTURE_DIR, build.boundsPath.slice("bounds/".length));
  let onDisk = "";
  try {
    onDisk = readFileSync(fixture, "utf8");
  } catch {
    onDisk = "";
  }
  return onDisk === build.files.get(build.boundsPath) ? "" : fixture.slice(REPO.length + 1);
}

function writeTree(build: GameDataBuild, out: string): void {
  for (const [rel, content] of build.files) {
    const path = join(out, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
}

if (argv[1] !== undefined && resolve(argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const outAt = argv.indexOf("--out");
    if (argv.includes("--write-fixture")) {
      const build = buildGameData();
      const path = join(BOUNDS_FIXTURE_DIR, build.boundsPath.slice("bounds/".length));
      mkdirSync(BOUNDS_FIXTURE_DIR, { recursive: true });
      writeFileSync(path, build.files.get(build.boundsPath) ?? "");
      console.log(`game-data: wrote ${path.slice(REPO.length + 1)}`);
    } else if (argv.includes("--check")) {
      const build = buildGameData();
      const stale = staleBoundsFixture();
      if (stale !== "") {
        console.error(`game-data: ${stale} is out of date (run node game-core/scripts/build-bounds.ts --write-fixture in web/)`);
        exit(1);
      }
      console.log(`game-data: ${build.files.size} files OK; current ${build.current.rulesetVersion} + ${build.current.campaignVersion}`);
    } else if (outAt !== -1 && argv[outAt + 1] !== undefined) {
      const out = resolve(argv[outAt + 1] ?? "");
      const build = buildGameData();
      writeTree(build, out);
      for (const rel of build.files.keys()) console.log(`game-data: ${join(out, rel)}`);
    } else {
      console.error("usage: node game-core/scripts/build-bounds.ts --out <dir> | --check | --write-fixture");
      exit(2);
    }
  } catch (error) {
    if (!(error instanceof GameDataError)) throw error;
    console.error(`game-data: ${error.message}`);
    exit(1);
  }
}
