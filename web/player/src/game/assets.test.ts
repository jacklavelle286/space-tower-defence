// The battlefield's asset table matches docs/art/asset-catalogue.json (path, frames, anchor, display size) and
// every frame it loads exists under web/player/public/. Until the asset manifest exists (Phase 64), this test is
// what keeps the hand-written table honest.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DECORATIONS, frameUrl } from "@scd/shared/map";
import { bindManifest, parseManifest } from "@scd/shared/manifest";
import { alienArt, allFrames, ART, bossArt, bossBubbleArt, bubbleLayersArt, hasAlienArt, madeAlienArt, POWER_ART, powerFrames } from "./assets";

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

  it.each(Object.values(DECORATIONS).map((a) => [a.id, a]))("decoration %s matches its catalogue entry and its file exists (LD1)", (id, asset) => {
    const entry = byId.get(id);
    expect(entry, `catalogue has no ${id}`).toBeDefined();
    expect({
      path: `/${entry?.appPath?.replace(/^web\/player\/public\//, "")}`,
      frames: entry?.frames,
      anchor: entry?.anchor,
      displaySize: entry?.displaySize,
    }).toEqual({ path: asset.path, frames: asset.frames, anchor: [...asset.anchor], displaySize: [...asset.displaySize] });
    expect(existsSync(join(PUBLIC, frameUrl(asset, 1)))).toBe(true);
  });

  it("every catalogued decoration is offered to maps", () => {
    const catalogued = catalogue.assets.filter((a) => a.id.startsWith("deco-")).map((a) => a.id).sort();
    expect(Object.keys(DECORATIONS).sort()).toEqual(catalogued);
  });

  it("every alien in every ruleset in game-data/ has its own art (Phase 26)", () => {
    const rulesets = readdirSync(join(REPO, "game-data", "ruleset")).map(
      (f) => JSON.parse(readFileSync(join(REPO, "game-data", "ruleset", f), "utf8")) as { aliens: Record<string, unknown> },
    );
    const types = new Set(rulesets.flatMap((r) => Object.keys(r.aliens)));
    expect(types.size).toBe(10);
    for (const type of types) expect(hasAlienArt(type), type).toBe(true);
    expect(alienArt("craft").defeat?.id).toBe("alien-craft-release");
    // A made alien (AM1) walks with its manifest asset, shaped like the Moon Blob's walk and falling back to its files.
    const made = alienArt("zorp").move;
    expect(made).toEqual({ ...ART.blobWalk, id: "alien-zorp-walk" });
  });

  it("every boss in every ruleset has art for each of its phases (Phase 27)", () => {
    const rulesets = readdirSync(join(REPO, "game-data", "ruleset")).map(
      (f) => JSON.parse(readFileSync(join(REPO, "game-data", "ruleset", f), "utf8")) as { bosses?: Record<string, { phases: unknown[] }> },
    );
    const bosses = rulesets.flatMap((r) => Object.entries(r.bosses ?? {}));
    expect([...new Set(bosses.map(([id]) => id))].sort()).toEqual(["boss1", "boss2", "boss3", "boss4", "boss5"]); // r3 and r4 share them
    for (const [id, boss] of bosses) {
      const art = bossArt(id);
      expect(art?.phases, id).toHaveLength(boss.phases.length);
      expect([art?.phases[0]?.enter, art?.phases[0]?.burst], `${id} arrives in its first phase`).toEqual([null, null]);
      // C7: every phase change is readable from shape and motion.
      expect(art?.phases.slice(1).every((p) => p.enter !== null || p.burst !== null), `${id}: every later phase has a cue`).toBe(true);
    }
    expect(bossArt("boss4")?.defeat?.id).toBe("boss-mothership-release");
    expect(bossArt("blob")).toBeNull();
  });

  it("a boss's bubble is full from 5 layers, thin from 4 to 1, gone at 0", () => {
    expect([0, 1, 4, 5, 8, 10].map((n) => bossBubbleArt(n)?.id ?? null)).toEqual([
      null,
      "boss-bubbla-bubble-thin",
      "boss-bubbla-bubble-thin",
      "boss-bubbla-bubble-full",
      "boss-bubbla-bubble-full",
      "boss-bubbla-bubble-full",
    ]);
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

  it.each(Object.values(POWER_ART).map((a) => [a.id, a]))("power effect %s matches its catalogue entry (Phase 28)", (id, asset) => {
    const entry = byId.get(id);
    expect(entry, `catalogue has no ${id}`).toBeDefined();
    expect({
      path: `/${entry?.appPath?.replace(/^web\/player\/public\//, "")}`,
      frames: entry?.frames,
      anchor: entry?.anchor,
      displaySize: entry?.displaySize,
    }).toEqual({ path: asset.path, frames: asset.frames, anchor: [...asset.anchor], displaySize: [...asset.displaySize] });
  });

  it("the power effects' frames are files in public/, and are not in the frames every game preloads", () => {
    expect(powerFrames().filter(([, url]) => !existsSync(join(PUBLIC, url)))).toEqual([]);
    expect(powerFrames()).toHaveLength(22);
    const always = new Set(allFrames().map(([key]) => key));
    expect(powerFrames().filter(([key]) => always.has(key))).toEqual([]);
  });
});

describe("a made alien (Gate M, AM1)", () => {
  const m1 = JSON.parse(readFileSync(join(REPO, "game-data", "asset-manifest", "m1.json"), "utf8")) as { assets: Record<string, unknown> };
  const frames = Array.from({ length: 6 }, (_, i) => `/pictures/v1/lib-${String(i + 1).repeat(32)}.png`);

  it("walks with its manifest entry, and with the Moon Blob's files if a frame fails", () => {
    const manifest = parseManifest({ ...m1, version: "m2", assets: { ...m1.assets, "alien-zorp-walk": { frames, anchor: [0.5, 1], size: [128, 128] } } });
    const art = bindManifest(manifest);
    const walk = art.asset(madeAlienArt("zorp"));
    expect(walk.frames).toBe(6);
    expect(frameUrl(walk, 1)).toBe(frames[0]);
    expect(art.frames([madeAlienArt("zorp")])).toContainEqual(["alien-zorp-walk-06", frames[5]]);
    expect(art.fallback("alien-zorp-walk-01")).toBe(frameUrl(ART.blobWalk, 1));
  });

  it("is a Moon Blob under a manifest without it (a run pinned before the alien was published)", () => {
    const walk = bindManifest(parseManifest(m1)).asset(madeAlienArt("zorp"));
    expect(walk.id).toBe("alien-zorp-walk");
    expect(frameUrl(walk, 3)).toBe(frameUrl(ART.blobWalk, 3));
  });
});
