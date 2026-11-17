import { describe, expect, it } from "vitest";
import { hrefOf, parseRoute, sectionOf, SECTIONS, type Route } from "./routes";

describe("hash routes", () => {
  it.each<[string, Route]>([
    ["", { page: "activities" }],
    ["#", { page: "activities" }],
    ["#activities", { page: "activities" }],
    ["#activities/ph-0102", { page: "activity", id: "ph-0102" }],
    ["#speech", { page: "speech", id: null }],
    ["#speech/phoneme-sh", { page: "speech", id: "phoneme-sh" }],
    ["#bank", { page: "bank" }],
    ["#new-activity", { page: "new" }],
    ["#pictures", { page: "pictures", tab: "upload" }],
    ["#pictures/draw", { page: "pictures", tab: "draw" }],
    ["#pictures/library", { page: "pictures", tab: "library" }],
    ["#pictures/nonsense", { page: "pictures", tab: "upload" }],
    ["#levels", { page: "levels" }],
    ["#levels/zigzag", { page: "level", id: "zigzag" }],
    ["#versions", { page: "versions" }],
    ["#nonsense", { page: "activities" }],
  ])("%s", (hash, route) => {
    expect(parseRoute(hash)).toEqual(route);
  });

  it("ignores IDs that are not key IDs instead of passing them to the API", () => {
    expect(parseRoute("#activities/..%2Fadmin")).toEqual({ page: "activities" });
    expect(parseRoute("#activities/PH-0102")).toEqual({ page: "activities" });
    expect(parseRoute(`#speech/${"a".repeat(41)}`)).toEqual({ page: "speech", id: null });
  });

  it("round-trips every route through its link", () => {
    const routes: Route[] = [
      { page: "activities" },
      { page: "activity", id: "ma-0101" },
      { page: "speech", id: null },
      { page: "speech", id: "phoneme-sh" },
      { page: "bank" },
      { page: "new" },
      { page: "pictures", tab: "upload" },
      { page: "pictures", tab: "draw" },
      { page: "pictures", tab: "library" },
      { page: "levels" },
      { page: "level", id: "zigzag" },
      { page: "versions" },
    ];
    for (const route of routes) expect(parseRoute(hrefOf(route))).toEqual(route);
  });

  it("puts an activity page under the Activities tab, and every tab has a page", () => {
    expect(sectionOf({ page: "activity", id: "ph-0102" })).toBe("activities");
    expect(sectionOf({ page: "new" })).toBe("activities");
    for (const item of SECTIONS) expect(sectionOf(parseRoute(item.href))).toBe(item.section);
  });
});
