// Library picture IDs resolve to their served file; anything else that only looks like one does not.
import { describe, expect, it } from "vitest";
import { isLibraryPictureId, libraryPictureUrl } from "./index";

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
