// Make a planet for me (Gate M, LD20): the theme's name and the drawing descriptions, which must fit the drawing's limits.
import { LIMITS } from "@scd/shared";
import { describe, expect, it } from "vitest";
import { backdropDescription, iconDescription, suggestName, THEME_MAX, themeOk } from "./makePlanet";

describe("makePlanet", () => {
  it("suggests a name from the theme", () => {
    expect(suggestName("fire")).toBe("Fire Planet");
    expect(suggestName("  ice   crystals ")).toBe("Ice Crystals Planet");
    expect(suggestName("jungle world")).toBe("Jungle World");
    expect(suggestName("x".repeat(40)).length).toBeLessThanOrEqual(40);
  });

  it("takes a theme of 3 to 40 characters without < or >", () => {
    expect(themeOk("ice")).toBe(true);
    expect(themeOk("ab")).toBe(false);
    expect(themeOk("x".repeat(THEME_MAX + 1))).toBe(false);
    expect(themeOk("<b>fire</b>")).toBe(false);
  });

  it("describes both pictures within the drawing's limit for the longest theme", () => {
    const longest = "y".repeat(THEME_MAX);
    for (const text of [iconDescription(longest), backdropDescription(longest)]) {
      expect(text.length).toBeLessThanOrEqual(LIMITS.picture.descriptionMaxLength);
      expect(text).toContain(longest);
    }
    expect(backdropDescription("fire")).toMatch(/no paths, no creatures/u);
  });
});
