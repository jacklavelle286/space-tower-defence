// The game-data check (Gate M, LD6). The parity test is the one scope-asset-kinds-and-makers.md §3.6 asks for: the
// publisher's bounds bytes equal what the release's own build (game-core/scripts/build-bounds.ts) writes for the same
// files.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildGameData, GAME_DATA_DIR } from "../../game-core/scripts/build-bounds.ts";
import { check, utf8Bytes, type CheckInput } from "./check";
import { handler } from "./handler";

const readJson = (...parts: string[]): Record<string, unknown> => JSON.parse(readFileSync(join(...parts), "utf8")) as Record<string, unknown>;
const RULESET = readJson(GAME_DATA_DIR, "ruleset", "r4.json");
const LIVE = readJson(GAME_DATA_DIR, "campaign", "luna-1-c2.json");
const FIXTURE = readJson(import.meta.dirname, "..", "..", "game-core", "src", "data", "fixtures", "schema2-planet.json") as {
  maps: { zigzag: { pads: { id: string }[] } & Record<string, unknown> };
  challengeWaves: Record<string, Record<string, unknown>>;
  waveSets: Record<string, Record<string, unknown>>;
};

/** A challenge level: the fixture's Zigzag map and Blob Rush, as the editor would save it. */
function zigzagLevel(): Record<string, unknown> {
  const map = structuredClone(FIXTURE.maps.zigzag);
  map.pads.forEach((p, i) => (p.id = `zigzag-p${String(i + 1).padStart(2, "0")}`));
  return {
    kind: "level",
    schema: 1,
    levelId: "zigzag",
    name: "Zigzag",
    map,
    challengeWaves: { "zigzag-burst": FIXTURE.challengeWaves["blob-burst"] },
    waveSets: { "zigzag-rush": { ...FIXTURE.waveSets["blob-rush"], mapId: "zigzag", waves: [3, "zigzag-burst"] } },
  };
}

const input = (level: Record<string, unknown>, extra: Partial<CheckInput> = {}): CheckInput => ({
  ruleset: RULESET,
  planet: LIVE,
  level,
  version: "luna-1-a1",
  runBots: true,
  ...extra,
});

describe("check", () => {
  it("passes a good challenge level and returns the files to publish", () => {
    const out = check(input(zigzagLevel()));
    expect(out.problems.filter((p) => p.severity !== "warn")).toEqual([]);
    expect(out.findings.filter((f) => f.severity === "block")).toEqual([]);
    expect(out.ok).toBe(true);
    expect(out.boundsVersion).toBe("r4__luna-1-a1");
    expect(out.waveSets).toEqual(["zigzag-rush"]);
    const planet = JSON.parse(out.planetJson ?? "null") as { version: string; schema: number; maps: Record<string, unknown> };
    expect(planet.version).toBe("luna-1-a1");
    expect(planet.schema).toBe(2);
    expect(Object.keys(planet.maps)).toEqual(["main", "zigzag"]);
  });

  it("gives bounds byte-identical to the release's build-bounds for the same files (parity)", () => {
    const out = check(input(zigzagLevel()));
    const dir = mkdtempSync(join(tmpdir(), "gd-parity-"));
    mkdirSync(join(dir, "ruleset"));
    mkdirSync(join(dir, "campaign"));
    copyFileSync(join(GAME_DATA_DIR, "ruleset", "r4.json"), join(dir, "ruleset", "r4.json"));
    writeFileSync(join(dir, "campaign", "luna-1-a1.json"), out.planetJson ?? "");
    writeFileSync(join(dir, "current.json"), JSON.stringify({ rulesetVersion: "r4", campaignVersion: "luna-1-a1" }));
    const build = buildGameData(dir);
    expect(build.boundsPath).toBe(`bounds/${out.boundsVersion}.json`);
    expect(build.files.get(build.boundsPath)).toBe(out.boundsJson);
    expect(build.files.get("campaign/luna-1-a1.json")).toBe(out.planetJson);
  });

  it("is deterministic: the same input gives the same bytes and findings", () => {
    const a = check(input(zigzagLevel()));
    const b = check(input(zigzagLevel()));
    expect(b).toEqual(a);
  });

  it("refuses a level whose map breaks a hard rule, and says where", () => {
    const level = zigzagLevel();
    const map = level["map"] as { route: number[][] };
    map.route = [[3, 2], ...map.route.slice(1)]; // the route no longer starts on the left edge
    const out = check(input(level));
    expect(out.ok).toBe(false);
    expect(out.planetJson).toBeNull();
    expect(out.problems[0]).toMatchObject({ field: "planet", severity: "hard" });
  });

  it("reports only the level's own problems, as blocking when they block", () => {
    const level = zigzagLevel();
    const set = (level["waveSets"] as Record<string, Record<string, unknown>>)["zigzag-rush"] ?? {};
    set["waves"] = ["zigzag-burst"]; // a challenge needs at least two waves
    const out = check(input(level));
    expect(out.ok).toBe(false);
    expect(out.problems.length).toBeGreaterThan(0);
    expect(out.problems.every((p) => p.field.includes("zigzag"))).toBe(true);
  });

  it("re-runs the blocking balance check: an unwinnable challenge is refused", () => {
    const level = zigzagLevel();
    const waves = level["challengeWaves"] as Record<string, Record<string, unknown>>;
    // Forty very tough blobs: more than the colony's 20 health even if each leaks one (as LD5's known-bad level).
    waves["zigzag-burst"] = { groups: [{ type: "blob", count: 40, at: 0, gap: 0.8 }], hpMult: 60, speedMult: 1 };
    const out = check(input(level));
    expect(out.findings).toContainEqual(expect.objectContaining({ rule: "competentClears", severity: "block", waveSetId: "zigzag-rush" }));
    expect(out.ok).toBe(false);
    expect(check(input(level, { runBots: false })).ok).toBe(true); // a quick validate skips the bots
  });

  it("lists the library pictures the map uses", () => {
    const level = zigzagLevel();
    const lib = (n: number) => `lib-${String(n).repeat(32)}`;
    (level["map"] as Record<string, unknown>)["art"] = {
      backdrop: lib(1),
      decorations: [
        { art: lib(2), x: 1, y: 1 },
        { art: "deco-rock-1", x: 2, y: 1 },
        { art: lib(2), x: 3, y: 1 },
      ],
    };
    expect(check(input(level, { runBots: false })).pictures).toEqual({ backdrops: [lib(1)], decorations: [lib(2)] });
  });

  it("refuses something that is not a level file", async () => {
    const out = await handler(input({ kind: "planet" }));
    expect(out.ok).toBe(false);
    expect(out.problems[0]).toMatchObject({ field: "level", rule: "parse" });
  });

  it("counts UTF-8 bytes as Buffer does", () => {
    for (const text of ["abc", "é", "€", "🚀", "Zigzag 🚀 é"]) expect(utf8Bytes(text)).toBe(Buffer.byteLength(text));
  });
});
