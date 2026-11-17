// Library picture IDs resolve to their served file; anything else that only looks like one does not.
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_PICTURE_KINDS,
  DEFAULT_PICTURE_KIND,
  isActivityPictureKind,
  isLibraryPictureId,
  isPictureKind,
  LATER_PICTURE_KINDS,
  libraryPictureUrl,
  LIMITS,
  PICTURE_KINDS,
  pictureKindLabel,
  pictureKindOf,
  pictureKindSpec,
} from "./index";

const ID = `lib-${"0123456789abcdef".repeat(2)}`;

describe("library pictures", () => {
  it("serves a library ID from /pictures/v1/", () => {
    expect(isLibraryPictureId(ID)).toBe(true);
    expect(libraryPictureUrl(ID)).toBe(`/pictures/v1/${ID}.png`);
  });

  it.each([
    "pic-cat",
    `lib-${"a".repeat(31)}`,
    `lib-${"a".repeat(33)}`,
    `lib-${"A".repeat(32)}`,
    `lib-${"g".repeat(32)}`,
    "lib-../x",
    `lib-${"a".repeat(32)}/../../index`,
    ` ${ID}`,
    `${ID}\n`,
    "",
  ])("refuses %j", (id) => {
    expect(isLibraryPictureId(id)).toBe(false);
    expect(libraryPictureUrl(id)).toBeNull();
  });
});

describe("picture kinds", () => {
  it("lists every kind from limits.json, in menu order", () => {
    expect(PICTURE_KINDS.map((k) => k.id)).toEqual([
      "activity-object",
      "activity-scene",
      "avatar",
      "alien",
      "astronaut",
      "decoration",
      "planet",
      "badge",
      "background",
      "route-tile",
    ]);
    expect(PICTURE_KINDS).toBe(LIMITS.picture.kinds);
    expect(new Set(PICTURE_KINDS.map((k) => k.id)).size).toBe(PICTURE_KINDS.length);
  });

  it("splits the kinds into activity ones and later ones", () => {
    expect(ACTIVITY_PICTURE_KINDS.map((k) => k.id)).toEqual(["activity-object", "activity-scene"]);
    expect(LATER_PICTURE_KINDS.map((k) => k.id)).toEqual(["avatar", "alien", "astronaut", "decoration", "planet", "badge", "background", "route-tile"]);
    expect(isActivityPictureKind("activity-scene")).toBe(true);
    expect(isActivityPictureKind("avatar")).toBe(false);
    expect(isActivityPictureKind("background")).toBe(false); // library only until Gate M
  });

  it("reads a missing or unknown kind as the default, activity-object", () => {
    expect(DEFAULT_PICTURE_KIND).toBe("activity-object");
    expect(pictureKindOf(undefined)).toBe("activity-object");
    expect(pictureKindOf("boss")).toBe("activity-object");
    expect(pictureKindOf("avatar")).toBe("avatar");
    expect(isPictureKind("planet")).toBe(true);
    expect(isPictureKind("Planet")).toBe(false);
    expect(isPictureKind(3)).toBe(false);
  });

  it("gives each kind its size from limits.json: 256 x 256, and 1920 x 1056 for a background", () => {
    for (const k of PICTURE_KINDS) {
      const spec = pictureKindSpec(k.id);
      expect([spec.width, spec.height]).toEqual(k.id === "background" ? [1920, 1056] : k.id === "route-tile" ? [192, 192] : [256, 256]);
      expect(spec.maxBytes).toBe(k.maxBytes);
      expect(spec.svgMaxBytes).toBe(k.svgMaxBytes);
      expect(spec.bodyMaxBytes).toBe(k.bodyMaxBytes);
    }
    expect(pictureKindSpec("background").maxBytes).toBe(4_194_304);
  });

  it("weighs a background as 3 drawings in the caps and every other kind as 1", () => {
    for (const k of PICTURE_KINDS) expect(pictureKindSpec(k.id).capWeight).toBe(k.id === "background" ? 3 : 1);
  });

  it("labels each kind", () => {
    expect(pictureKindLabel("background")).toBe("Background (battle scene)");
    expect(pictureKindLabel("avatar")).toBe("Profile avatar");
    expect(pictureKindLabel("activity-scene")).toBe("Activity scene (fills the square)");
  });
});
