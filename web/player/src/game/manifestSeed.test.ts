// The m1 asset manifest (Gate M, LD8) is the repo art exactly: every asset in the battlefield's tables (ART, the power
// effects, the decorations) with its frames, anchor and size, and the moon art set. game-data/asset-manifest/m1.json
// is published create-only and pinned by runs, so it never changes: art that changes shape (frames, anchor, size)
// needs a new manifest version. Regenerate before m1 is first released with: WRITE_MANIFEST=1 npx vitest run manifestSeed
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bindManifest, DEFAULT_MANIFEST_VERSION, manifestFromArt, MOON_ART_SET, parseManifest } from "@scd/shared/manifest";
import { DECORATIONS, frameKey, frameUrl } from "@scd/shared/map";
import { describe, expect, it } from "vitest";
import { ART, POWER_ART } from "./assets";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const FILE = join(REPO, "game-data", "asset-manifest", `${DEFAULT_MANIFEST_VERSION}.json`);
const seed = manifestFromArt(DEFAULT_MANIFEST_VERSION, [...Object.values(ART), ...Object.values(POWER_ART), ...Object.values(DECORATIONS)], { moon: MOON_ART_SET });
const text = `${JSON.stringify(seed, null, 1)}\n`;

if (process.env["WRITE_MANIFEST"] === "1") {
  mkdirSync(join(REPO, "game-data", "asset-manifest"), { recursive: true });
  writeFileSync(FILE, text);
}

describe("the m1 asset manifest", () => {
  it("is the repo art tables exactly", () => {
    expect(existsSync(FILE), `${FILE} is missing`).toBe(true);
    expect(readFileSync(FILE, "utf8")).toBe(text);
  });

  it("parses, and every frame it names is a file under web/player/public", () => {
    const manifest = parseManifest(JSON.parse(text), DEFAULT_MANIFEST_VERSION);
    for (const entry of Object.values(manifest.assets)) {
      for (const url of entry.frames) expect(existsSync(join(REPO, "web", "player", "public", url)), url).toBe(true);
    }
  });
});

describe("drawing through m1", () => {
  it("resolves every repo asset to the repo files, keys, anchors and sizes: the battlefield looks the same", () => {
    const art = bindManifest(parseManifest(JSON.parse(text), DEFAULT_MANIFEST_VERSION));
    for (const repo of [...Object.values(ART), ...Object.values(POWER_ART), ...Object.values(DECORATIONS)]) {
      const bound = art.map(repo);
      expect([bound.id, bound.frames, bound.anchor, bound.displaySize]).toEqual([repo.id, repo.frames, repo.anchor, repo.displaySize]);
      for (let n = 1; n <= repo.frames; n += 1) {
        expect([frameKey(bound, n), frameUrl(bound, n)]).toEqual([frameKey(repo, n), frameUrl(repo, n)]);
        expect(art.fallback(frameKey(repo, n))).toBeNull();
      }
    }
  });
});
