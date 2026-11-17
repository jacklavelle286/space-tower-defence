// The asset manifest (Gate M, LD8): the shared contract fixtures (also read by api/tests), and the binding the scene
// draws through: the repo art without a manifest, the manifest's files with one, the repo file as each one's fallback,
// and art sets that give a map role to another asset.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { frameUrl, MAP_ART, type ArtAsset } from "../map/art";
import { bindManifest, DEFAULT_ART_SET, ManifestError, manifestFromArt, MOON_ART_SET, parseManifest, REPO_ART } from "./manifest";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const cases = JSON.parse(readFileSync(join(REPO, "contracts", "fixtures", "asset-manifest", "cases.json"), "utf8")) as {
  valid: { name: string; manifest: unknown }[];
  invalid: { name: string; manifest: unknown; field: string }[];
};

const BLOB: ArtAsset = { id: "alien-blob-walk", path: "/assets/common/alien-blob-walk-{nn}.png", frames: 6, anchor: [0.5, 1], displaySize: [128, 128] };
const LIB = "lib-0123456789abcdef0123456789abcdef";

function manifestWith(entries: Record<string, unknown>, artSets: Record<string, unknown> = {}) {
  const base = manifestFromArt("m9", [...Object.values(MAP_ART), BLOB], { moon: MOON_ART_SET }) as Record<string, Record<string, unknown>>;
  return parseManifest({ ...base, assets: { ...base["assets"], ...entries }, artSets: { ...base["artSets"], ...artSets } });
}

describe("parseManifest (contract fixtures)", () => {
  it.each(cases.valid.map((c) => [c.name, c.manifest]))("accepts %s", (_, manifest) => {
    expect(parseManifest(manifest).version).toBe("m9");
  });

  it.each(cases.invalid.map((c) => [c.name, c.manifest, c.field]))("refuses %s", (_, manifest, field) => {
    expect(() => parseManifest(manifest)).toThrow(ManifestError);
    expect(() => parseManifest(manifest)).toThrow(new RegExp(`^${String(field).replaceAll(".", "\\.")}`, "u"));
  });

  it("refuses a file whose version is not its name", () => {
    expect(() => parseManifest(cases.valid[0]?.manifest, "m1")).toThrow(/expected m1/u);
  });
});

describe("bindManifest", () => {
  it("with no manifest, every asset is the repo asset", () => {
    expect(REPO_ART.asset(BLOB)).toBe(BLOB);
    expect(REPO_ART.map(MAP_ART.padEmpty)).toBe(MAP_ART.padEmpty);
    expect(REPO_ART.fallback("alien-blob-walk-01")).toBeNull();
  });

  it("a manifest built from the repo art draws exactly the repo files", () => {
    const art = bindManifest(manifestWith({}));
    const bound = art.asset(BLOB);
    expect(Array.from({ length: bound.frames }, (_, i) => frameUrl(bound, i + 1))).toEqual(Array.from({ length: 6 }, (_, i) => frameUrl(BLOB, i + 1)));
    expect([bound.anchor, bound.displaySize]).toEqual([BLOB.anchor, BLOB.displaySize]);
    expect(art.fallback("alien-blob-walk-01")).toBeNull(); // the same file: nothing to fall back to
  });

  it("another file for an asset, with the repo file as its fallback", () => {
    const frames = [1, 2, 3, 4].map((n) => `/assets/common/blob-new-0${n}.png`);
    const art = bindManifest(manifestWith({ "alien-blob-walk": { frames, anchor: [0.5, 0.9], size: [140, 140] } }));
    const bound = art.asset(BLOB);
    expect([bound.frames, frameUrl(bound, 4), bound.displaySize]).toEqual([4, frames[3], [140, 140]]);
    expect(art.fallback("alien-blob-walk-04")).toBe("/assets/common/alien-blob-walk-04.png");
  });

  it("ignores an entry that turns an animation into a still (the code could not play it)", () => {
    const art = bindManifest(manifestWith({ "alien-blob-walk": { frames: [`/pictures/v1/${LIB}.png`], anchor: [0.5, 1], size: [128, 128] } }));
    expect(art.asset(BLOB)).toBe(BLOB);
  });

  it("an art set gives a map role to another asset, falling back to the repo piece", () => {
    const tile = { frames: [`/pictures/v1/${LIB}.png`], anchor: [0.5, 0.5], size: [96, 96] };
    const art = bindManifest(manifestWith({ [LIB]: tile }, { mars: { ...MOON_ART_SET, routeH: LIB } }));
    expect(art.map(MAP_ART.routeH, "mars").id).toBe(LIB);
    expect(art.map(MAP_ART.routeH).id).toBe(MAP_ART.routeH.id); // the default set is the moon
    expect(art.map(MAP_ART.routeH, "unknown-set").id).toBe(MAP_ART.routeH.id);
    expect(art.fallback(LIB)).toBe(frameUrl(MAP_ART.routeH, 1));
    expect(art.frames([MAP_ART.routeH, BLOB], "mars")[0]).toEqual([LIB, `/pictures/v1/${LIB}.png`]);
    expect(DEFAULT_ART_SET).toBe("moon");
  });
});
