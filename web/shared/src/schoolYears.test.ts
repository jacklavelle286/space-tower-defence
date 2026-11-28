import { describe, expect, it } from "vitest";
import { bandName, bandRangeName, yearName } from "./schoolYears";

describe("school years (YG1)", () => {
  it("names the years and the bands that hold their questions", () => {
    expect([0, 1, 2, 5].map(yearName)).toEqual(["Reception", "Year 1", "Year 2", "Year 5"]);
    expect(yearName(6)).toBe("Year 6"); // past the list: Hard for Year 5
    expect([5, 6, 7, 8, 11].map(bandName)).toEqual(["Reception", "Year 1", "Year 2", "Year 3", "Year 6"]);
    expect(bandRangeName(6, 6)).toBe("Year 1");
    expect(bandRangeName(6, 7)).toBe("Year 1–Year 2");
  });
});
