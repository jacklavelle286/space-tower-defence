// The battlefield's asset table matches docs/art/asset-catalogue.json (path, frames, anchor, display size) and
// every frame it loads exists under web/player/public/. Until the asset manifest exists (Phase 64), this test is
// what keeps the hand-written table honest.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { alienArt, allFrames, ART, bubbleLayersArt, hasAlienArt } from "./assets";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const PUBLIC = join(REPO, "web", "player", "public");

interface CatalogueEntry {
  id: string;
  appPath: string | null;
  frames: number;
  anchor: [number, number];
  displaySize: [number, number];
}

const catalogue = JSON.parse(readFileSync(join(REPO, "docs", "art", "asset-catalogue.json"), "utf8")) as { assets: CatalogueEntry[] };
const byId = new Map(catalogue.assets.map((a) => [a.id, a]));

describe("battlefield art", () => {
  it.each(Object.values(ART).map((a) => [a.id, a]))("%s matches its catalogue entry", (id, asset) => {
    const entry = byId.get(id);
    expect(entry, `catalogue has no ${id}`).toBeDefined();
    expect({
      path: `/${entry?.appPath?.replace(/^web\/player\/public\//, "")}`,
      frames: entry?.frames,
      anchor: entry?.anchor,
      displaySize: entry?.displaySize,
    }).toEqual({ path: asset.path, frames: asset.frames, anchor: [...asset.anchor], displaySize: [...asset.displaySize] });
  });

  it("every alien in every ruleset in game-data/ has its own art (Phase 26)", () => {
    const rulesets = readdirSync(join(REPO, "game-data", "ruleset")).map(
      (f) => JSON.parse(readFileSync(join(REPO, "game-data", "ruleset", f), "utf8")) as { aliens: Record<string, unknown> },
    );
    const types = new Set(rulesets.flatMap((r) => Object.keys(r.aliens)));
    expect(types.size).toBe(10);
    for (const type of types) expect(hasAlienArt(type), type).toBe(true);
    expect(alienArt("craft").defeat?.id).toBe("alien-craft-release");
    expect(alienArt("not-yet-drawn").move.id).toBe("alien-blob-walk");
  });

  it("a Bubble Guard's overlay shows the layers it has left", () => {
    expect([0, 1, 2, 3, 4].map((n) => bubbleLayersArt(n)?.id ?? null)).toEqual([
      null,
      "alien-guard-layers-1",
      "alien-guard-layers-2",
      "alien-guard-layers-3",
      "alien-guard-layers-4",
    ]);
  });

  it("every frame it loads is a file in public/", () => {
    const missing = allFrames().filter(([, url]) => !existsSync(join(PUBLIC, url)));
    expect(missing).toEqual([]);
    expect(allFrames().length).toBeGreaterThan(60);
  });
});
