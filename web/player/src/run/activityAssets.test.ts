// The activity picture table matches the catalogue's activity family, and every file exists under public/.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTIVITY_ASSET_IDS, activityAssetUrl } from "./activityAssets";

const REPO = join(import.meta.dirname, "..", "..", "..", "..");
const PUBLIC = join(REPO, "web", "player", "public");
const catalogue = JSON.parse(readFileSync(join(REPO, "docs", "art", "asset-catalogue.json"), "utf8")) as {
  assets: { id: string; appPath: string | null }[];
};
const activity = catalogue.assets.filter((a) => a.appPath?.startsWith("web/player/public/assets/activity/"));

describe("activity pictures", () => {
  it("lists exactly the catalogue's activity pictures, at their catalogue paths", () => {
    expect([...ACTIVITY_ASSET_IDS].sort()).toEqual(activity.map((a) => a.id).sort());
    for (const a of activity) expect(activityAssetUrl(a.id)).toBe(`/${a.appPath?.replace(/^web\/player\/public\//, "")}`);
  });

  it("every picture is a file in public/", () => {
    expect(ACTIVITY_ASSET_IDS.filter((id) => !existsSync(join(PUBLIC, activityAssetUrl(id) ?? "")))).toEqual([]);
  });

  it("an unknown ID has no URL", () => {
    expect(activityAssetUrl("pic-unicorn")).toBeNull();
    expect(activityAssetUrl("../ui/logo")).toBeNull();
  });

  it("serves a library picture from /pictures/v1/, and only an exact library ID", () => {
    const id = `lib-${"0123456789abcdef".repeat(2)}`;
    expect(activityAssetUrl(id)).toBe(`/pictures/v1/${id}.png`);
    expect(activityAssetUrl(`lib-${"a".repeat(33)}`)).toBeNull();
    expect(activityAssetUrl(`lib-${"A".repeat(32)}`)).toBeNull();
    expect(activityAssetUrl("lib-../x")).toBeNull();
    expect(ACTIVITY_ASSET_IDS.some((a) => a.startsWith("lib-"))).toBe(false);
  });
});
