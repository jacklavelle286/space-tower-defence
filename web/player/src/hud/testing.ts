// Test helpers for the battlefield controls (excluded from the app build by tsconfig.json): an r3 battle on the first-contact planet with every class listed.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileBattleConfig, initialRunState, parsePlanet, parseRuleset, type BattleConfig } from "@scd/game-core";
import { GameBridge } from "../game/GameBridge";
import { LocalRun } from "../game/localRun";

const GAME_DATA = join(import.meta.dirname, "..", "..", "..", "..", "game-data");
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(GAME_DATA, path), "utf8"));

/** Ruleset r3 with every class in the wave set (a CHALLENGE, so none is locked) and every pad open. */
export function everyClassConfig(): BattleConfig {
  const r3 = parseRuleset(readJson("ruleset/r3.json"));
  const raw = structuredClone(readJson("campaign/luna-1-c1.json")) as { waveSets: Record<string, { classes: string[]; padsOpenAsForWave: number }> };
  const set = raw.waveSets["first-contact"];
  if (set !== undefined) {
    set.classes = ["nova", "pip", "juno", "orion", "mira", "sol"];
    set.padsOpenAsForWave = 26;
  }
  return compileBattleConfig(r3, parsePlanet(raw, r3), "first-contact");
}

export function bridgeWith(credits: number, powers: Record<string, number> = {}): GameBridge {
  const config = everyClassConfig();
  const start = initialRunState(parseRuleset(readJson("ruleset/r3.json")), config, ["continue"]);
  if (start.snapshot === undefined) throw new Error("a new run has a snapshot");
  let n = 0;
  const run = new LocalRun(
    { ...start, snapshot: { ...start.snapshot, credits, powers } },
    () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`,
  );
  return new GameBridge(config, run, "test-seed", { announceNewAliens: false }); // the new-alien card (Phase 66) has its own tests
}
