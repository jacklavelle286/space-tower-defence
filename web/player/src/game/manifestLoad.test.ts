// The run's asset manifest in the player (Gate M, LD8): the pinned version is loaded and bound (null is m1); one that
// cannot be loaded or parsed is the repo art, never a failed battle; the map's decorations and ground go through it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MAP_ART } from "@scd/shared/map";
import { REPO_ART } from "@scd/shared/manifest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadArt } from "./gameData";
import { backdropKey, mapPicturesToLoad, placedDecorations } from "./mapArt";

const M1 = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "..", "..", "game-data", "asset-manifest", "m1.json"), "utf8")) as {
  assets: Record<string, { frames: string[]; anchor: number[]; size: number[] }>;
  artSets: Record<string, Record<string, string>>;
};

function serve(files: Record<string, unknown>): string[] {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (path: string) => {
    asked.push(path);
    return path in files ? new Response(JSON.stringify(files[path])) : new Response("missing", { status: 404 });
  });
  return asked;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("loadArt", () => {
  it("a run with no pin loads m1", async () => {
    const asked = serve({ "/game-data/asset-manifest/m1.json": M1 });
    expect((await loadArt(null)).version).toBe("m1");
    expect(asked).toEqual(["/game-data/asset-manifest/m1.json"]);
  });

  it("a manifest that is missing or malformed draws the repo art", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    serve({ "/game-data/asset-manifest/m3.json": { ...M1, version: "m3", extra: true } });
    expect(await loadArt("m2")).toBe(REPO_ART);
    expect(await loadArt("m3")).toBe(REPO_ART);
    expect(await loadArt("../x")).toBe(REPO_ART);
  });
});

describe("map pictures through the manifest", () => {
  it("a decoration and the ground come from the manifest's art", async () => {
    const rock = { frames: ["/assets/luna-1/deco-rock-2.png"], anchor: [0.5, 1], size: [160, 160] };
    const ground = { frames: ["/assets/luna-1/luna-backdrop.webp"], anchor: [0, 0], size: [1920, 1056] };
    const manifest = {
      ...M1,
      version: "m2",
      assets: { ...M1.assets, "deco-rock-1": rock, "mars-ground": ground },
      artSets: { ...M1.artSets, mars: { ...M1.artSets["moon"], backdrop: "mars-ground" } },
    };
    serve({ "/game-data/asset-manifest/m2.json": manifest });
    const art = await loadArt("m2");
    const map = { art: { backdrop: null, decorations: [{ art: "deco-rock-1", x: 1, y: 9 }] } };
    expect(placedDecorations(map, art).map((d) => [d.url, d.size])).toEqual([["/assets/luna-1/deco-rock-2.png", [160, 160]]]);
    expect(mapPicturesToLoad(map, art)).toEqual([{ key: "deco-rock-1", url: "/assets/luna-1/deco-rock-2.png" }]);
    expect(art.fallback("deco-rock-1")).toBe("/assets/luna-1/deco-rock-1.png");
    expect(backdropKey(map, () => true, art.map(MAP_ART.backdrop, "mars").id)).toBe("mars-ground");
  });
});
