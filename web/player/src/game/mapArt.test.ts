// A map's own pictures (Gate M, LD2): what is loaded, where decorations stand, and the fallbacks.
import { describe, expect, it } from "vitest";
import { backdropKey, mapPicturesToLoad, placedDecorations } from "./mapArt";

const LIB_BACK = "lib-0123456789abcdef0123456789abcdef";
const LIB_DECO = "lib-fedcba9876543210fedcba9876543210";
const art = (backdrop: string | null, decorations: { art: string; x: number; y: number }[] = []) => ({ art: { backdrop, decorations } });

describe("map pictures", () => {
  it("a schema 1 map (no pictures) loads nothing extra and draws the Moonbeam ground", () => {
    expect(mapPicturesToLoad(art(null))).toEqual([]);
    expect(backdropKey(art(null), () => true)).toBe("luna-backdrop");
  });

  it("a library backdrop is loaded from /pictures/v1/ and used once it loaded, else the ground", () => {
    expect(mapPicturesToLoad(art(LIB_BACK))).toEqual([{ key: LIB_BACK, url: `/pictures/v1/${LIB_BACK}.png` }]);
    expect(backdropKey(art(LIB_BACK), () => true)).toBe(LIB_BACK);
    expect(backdropKey(art(LIB_BACK), () => false)).toBe("luna-backdrop");
  });

  it("decorations: a repo rock stands on its tile's bottom edge, a crater lies centred, a library picture is one tile", () => {
    const placed = placedDecorations(art(null, [
      { art: "deco-rock-1", x: 1, y: 9 },
      { art: "deco-crater-2", x: 19, y: 9 },
      { art: LIB_DECO, x: 3, y: 0 },
    ]));
    expect(placed.map((d) => [d.key, d.x, d.y, d.size])).toEqual([
      ["deco-rock-1", 144, 960, [128, 128]],
      ["deco-crater-2", 1872, 912, [128, 128]],
      [LIB_DECO, 336, 96, [96, 96]],
    ]);
    expect(placed[0]?.url).toBe("/assets/luna-1/deco-rock-1.png");
    expect(placed[0]?.depth).toBeCloseTo(10.96);
  });

  it("each file is loaded once, even when placed twice", () => {
    const twice = art(null, [
      { art: "deco-rock-1", x: 1, y: 9 },
      { art: "deco-rock-1", x: 2, y: 9 },
    ]);
    expect(mapPicturesToLoad(twice)).toEqual([{ key: "deco-rock-1", url: "/assets/luna-1/deco-rock-1.png" }]);
  });
});
