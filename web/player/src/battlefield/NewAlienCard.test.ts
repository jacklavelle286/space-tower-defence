// The new-alien card's words (Phase 66): one short line per trait, the plain aliens by speed, bosses their own line.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compileBattleConfig, parsePlanet, parseRuleset } from "@scd/game-core";
import { describe, expect, it } from "vitest";
import { COPY } from "../copy/en-GB";
import { alienLines } from "./NewAlienCard";

const GAME_DATA = join(import.meta.dirname, "..", "..", "..", "..", "game-data");
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(GAME_DATA, path), "utf8"));
const ruleset = parseRuleset(readJson("ruleset/r4.json"));
const config = compileBattleConfig(ruleset, parsePlanet(readJson("campaign/luna-1-c2.json"), ruleset), "campaign");
const lines = (type: string) => {
  const alien = config.aliens[type];
  if (alien === undefined) throw new Error(type);
  return alienLines(alien);
};
const t = COPY.newAlien;

describe("alienLines", () => {
  it.each([
    ["blob", [t.plain]],
    ["mite", [t.fast]],
    ["shell", [t.armour]],
    ["swarm", [t.cluster]],
    ["flutter", [t.flying]],
    ["guard", [t.bubbles]],
    ["patch", [t.healer]],
    ["slime", [t.children]],
    ["craft", [t.children]],
  ])("%s", (type, expected) => {
    expect(lines(type)).toEqual(expected);
  });

  it("every boss has the boss line", () => {
    for (const id of Object.keys(ruleset.bosses)) expect(lines(id)).toEqual([t.bossLine]);
  });
});
