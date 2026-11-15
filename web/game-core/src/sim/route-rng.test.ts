// Integer route geometry (C3.1) and the seeded generator (spine S4) used by the battle simulation.
import { describe, expect, it } from "vitest";
import { nextInt, nextRandom, waveSeed } from "./rng";
import { buildRoute, routePoint, UNITS_PER_TILE, withinRange } from "./route";

const U = UNITS_PER_TILE;
const LUNA: [number, number][] = [[0, 2], [4, 2], [4, 8], [8, 8], [8, 3], [12, 3], [12, 8], [16, 8], [16, 3], [19, 3]];

describe("route (C3.1)", () => {
  const route = buildRoute(LUNA);

  it("is 40 tiles long with the segment ends of the C3.1 table", () => {
    expect(route.length).toBe(40 * U);
    expect(route.segments.map((s) => s.end / U)).toEqual([4, 10, 14, 19, 23, 28, 32, 37, 40]);
  });

  it("maps progress to points along horizontal and vertical stretches, clamped at both ends", () => {
    expect(routePoint(route, -5)).toEqual({ x: 0, y: 2 * U });
    expect(routePoint(route, 0)).toEqual({ x: 0, y: 2 * U });
    expect(routePoint(route, 4 * U)).toEqual({ x: 4 * U, y: 2 * U });
    expect(routePoint(route, 5.5 * U)).toEqual({ x: 4 * U, y: 3.5 * U });
    expect(routePoint(route, 16 * U)).toEqual({ x: 8 * U, y: 6 * U }); // climbing up
    expect(routePoint(route, 40 * U)).toEqual({ x: 19 * U, y: 3 * U });
    expect(routePoint(route, 41 * U)).toEqual({ x: 19 * U, y: 3 * U });
  });

  it("refuses diagonal, empty and off-centre segments", () => {
    expect(() => buildRoute([[0, 0], [1, 1]])).toThrow(/horizontal or vertical/);
    expect(() => buildRoute([[0, 0], [0, 0]])).toThrow(/horizontal or vertical/);
    expect(() => buildRoute([[0, 0], [0.5, 0]])).toThrow(/tile centre/);
    expect(() => buildRoute([[0, 0]])).toThrow(/two waypoints/);
  });

  it("range is inclusive and uses squared distances (C3.2)", () => {
    const r = 2.5 * U;
    expect(withinRange({ x: 0.5 * U, y: 2 * U }, 2 * U, 4 * U, r * r)).toBe(true); // exactly 2.5
    expect(withinRange({ x: 0.5 * U - 1, y: 2 * U }, 2 * U, 4 * U, r * r)).toBe(false);
  });
});

describe("seeded generator", () => {
  it("is a pure function of its state", () => {
    expect(nextRandom(12345)).toEqual(nextRandom(12345));
    const first = nextRandom(waveSeed("abc", 1));
    expect(nextRandom(first.state).value).not.toBe(first.value);
  });

  it("derives a different stream per (seed, wave), always the same for the same pair", () => {
    expect(waveSeed("5eed", 1)).toBe(waveSeed("5eed", 1));
    expect(waveSeed("5eed", 1)).not.toBe(waveSeed("5eed", 2));
    expect(waveSeed("5eed", 1)).not.toBe(waveSeed("5eee", 1));
  });

  it("pins the stream, so a change to the generator is noticed", () => {
    let state = waveSeed("5eed5eed5eed5eed", 1);
    const values: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const r = nextRandom(state);
      values.push(r.value);
      state = r.state;
    }
    expect(values).toEqual(PINNED);
  });

  it("nextInt stays in [0, bound) and refuses a bad bound", () => {
    let state = 7;
    for (let i = 0; i < 1000; i += 1) {
      const r = nextInt(state, 6);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(6);
      state = r.state;
    }
    expect(() => nextInt(1, 0)).toThrow(RangeError);
    expect(() => nextInt(1, 1.5)).toThrow(RangeError);
  });
});

// mulberry32 from waveSeed("5eed5eed5eed5eed", 1), recorded when the generator was written.
const PINNED: number[] = [764364101, 682163028, 1950345033, 1014121664];
