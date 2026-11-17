// Merge a level file into a planet document as a new campaign version (Gate M, LD4): the "download, commit, normal
// release" path the scope gives before the publisher exists (scope-level-designer.md §3.1). Run from web/:
//
//   node game-core/scripts/merge-level.ts --level ~/Downloads/zigzag.level.json --into luna-1-c2 --as luna-1-c3
//   node game-core/scripts/merge-level.ts ... --write      also writes game-data/campaign/luna-1-c3.json
//
// It parses the merged document against the ruleset current.json names and runs the design rules; any hard or block
// problem in the level's own sections exits 1 and writes nothing. It never overwrites a file (published game data is
// create-only) and never touches current.json: pointing new games at the new version is a separate, reviewed commit,
// and the player release with the schema 2 parser (LD2) must already be live.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argv, exit } from "node:process";
import { GameDataError, parseCurrent, parsePlanet, parseRuleset } from "../src/data/game-data.ts";
import { levelOwnsField, mergeLevel, type LevelSections } from "../src/data/level.ts";
import { planetProblems, problemMessage } from "../src/map/rules.ts";
import { GAME_DATA_DIR } from "./build-bounds.ts";

function option(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
}

const levelPath = option("level");
const into = option("into");
const as = option("as");
if (levelPath === undefined || into === undefined || as === undefined) {
  console.error("usage: merge-level.ts --level <file> --into <campaign version> --as <new campaign version> [--write]");
  exit(2);
}

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
try {
  const level = readJson(levelPath) as LevelSections & { kind?: unknown };
  if (level.kind !== "level") throw new GameDataError(`${levelPath}: not a level file`);
  const current = parseCurrent(readJson(join(GAME_DATA_DIR, "current.json")));
  const ruleset = parseRuleset(readJson(join(GAME_DATA_DIR, "ruleset", `${current.rulesetVersion}.json`)));
  const merged = mergeLevel(readJson(join(GAME_DATA_DIR, "campaign", `${into}.json`)), level, as);
  const planet = parsePlanet(merged, ruleset);
  const problems = planetProblems(planet, ruleset, { strictPadOrder: true }).filter((p) => levelOwnsField(level, p.field));
  for (const p of problems) console.log(`${p.severity.padEnd(5)} ${p.field}: ${problemMessage(p)}`);
  if (problems.some((p) => p.severity !== "warn")) {
    console.error(`merge-level: the level has problems that block publishing; nothing written`);
    exit(1);
  }
  const out = join(GAME_DATA_DIR, "campaign", `${as}.json`);
  if (argv.includes("--write")) {
    if (existsSync(out)) throw new GameDataError(`${out} exists: published game data is create-only; choose another --as`);
    writeFileSync(out, `${JSON.stringify(merged, null, 2)}\n`);
    console.log(`merge-level: wrote ${out} (${Object.keys(planet.maps).length} maps, ${Object.keys(planet.waveSets).length} wave sets)`);
  } else {
    console.log(`merge-level: ${as} is valid (${problems.length} warnings); add --write to write ${out}`);
  }
} catch (error) {
  console.error(`merge-level: ${error instanceof Error ? error.message : String(error)}`);
  exit(1);
}
