// The editor's picture list is admin-api's (api/shared/activity_assets.json): every picture the editor offers is one
// publish accepts, and every accepted picture can be picked and shown.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PICTURE_IDS, pictureLabel, pictureUrl } from "./assets";

const manifest = JSON.parse(readFileSync(resolve(__dirname, "../../../../api/shared/activity_assets.json"), "utf8")) as {
  assets: { id: string; textFree: boolean }[];
};

describe("pictures", () => {
  it("are exactly admin-api's activity pictures, all text-free", () => {
    expect([...PICTURE_IDS]).toEqual(manifest.assets.map((a) => a.id).sort());
    expect(manifest.assets.every((a) => a.textFree)).toBe(true);
  });

  it("each has a URL and a readable name", () => {
    for (const id of PICTURE_IDS) expect(pictureUrl(id)).not.toBeNull();
    expect(pictureUrl("not-a-picture")).toBeNull();
    expect(pictureLabel("pic-night-sky")).toBe("night sky (pic-night-sky)");
  });
});
