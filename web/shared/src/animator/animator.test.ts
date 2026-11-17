// The shared animator (Gate M, AM0): from the Moon Blob's frame 01 it makes exactly the six hand-drawn walk poses
// (the hand-drawn frames are STYLE §11's table applied by hand), a drawing with no part names still walks (the
// whole-sprite fallback), and antennae turn about their own root.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { animate, fitScale, frame, movingParts, neutralise, WALK } from "./animator";

const ALIENS = join(import.meta.dirname, "..", "..", "..", "..", "art", "svg", "aliens");
const blob = (n: number): string => readFileSync(join(ALIENS, `alien-blob-walk-0${n}.svg`), "utf8");
const attr = (svg: string, id: string): string | null => new RegExp(`<g\\b[^>]*\\bid="${id}"[^>]*\\btransform="([^"]*)"`, "u").exec(svg)?.[1] ?? new RegExp(`<g\\b[^>]*\\btransform="([^"]*)"[^>]*\\bid="${id}"`, "u").exec(svg)?.[1] ?? null;
const numbers = (text: string | null): number[] => (text ?? "").match(/-?[\d.]+/gu)?.map(Number) ?? [];

describe("animate", () => {
  it("from the blob's frame 01 makes the six hand-drawn walk poses", () => {
    const frames = animate(blob(1));
    expect(frames).toHaveLength(6);
    frames.forEach((derived, i) => {
      const hand = blob(i + 1);
      expect(numbers(attr(derived, "anim-pose"))).toEqual(numbers(attr(hand, "blob")));
      expect(numbers(attr(derived, "antenna-front"))).toEqual(numbers(attr(hand, "antenna-front")));
      expect(numbers(attr(derived, "antenna-back"))).toEqual(numbers(attr(hand, "antenna-back")));
      expect(numbers(attr(derived, "face"))).toEqual(numbers(attr(hand, "face")));
      expect(attr(derived, "blob")).toBeNull(); // frame 01's own pose was taken off first
    });
  });

  it("a drawing with no part names still walks: the whole sprite leans and squashes about the base", () => {
    const plain = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><circle cx="128" cy="180" r="60"/></svg>';
    expect(movingParts(plain)).toEqual({ antennae: [], legs: [], face: false });
    const frames = animate(plain);
    expect(frames.map((f) => numbers(attr(f, "anim-pose")).slice(2, 5))).toEqual(WALK.map((p) => [p.skewX, p.scale[0], p.scale[1]]));
    expect(frames[0]).toContain('<circle cx="128" cy="180" r="60"/>');
  });

  it("an antenna turns about the first point of its own path", () => {
    const svg = '<svg viewBox="0 0 256 256"><g id="alien"><g id="antenna-front"><path d="M140 90 Q150 70 160 60"/></g></g></svg>';
    expect(attr(frame(neutralise(svg), WALK[1]!), "antenna-front")).toBe("rotate(6 140 90)");
  });

  it("legs step in turn: back along the ground, then lifted forward, half a cycle apart, returning to frame 1", () => {
    const svg = '<svg viewBox="0 0 256 256"><g id="alien"><g id="leg-back" transform="rotate(4)"><path d="M100 220 L100 250"/></g><g id="leg-front"><path d="M150 220 L150 250"/></g></g></svg>';
    expect(movingParts(svg).legs).toEqual(["leg-front", "leg-back"]);
    const frames = animate(svg);
    const front = frames.map((f) => numbers(attr(f, "leg-front")));
    const back = frames.map((f) => numbers(attr(f, "leg-back")));
    expect(front).toEqual([[3, 0], [1.5, 0], [-1.5, 0], [-3, 0], [-1.5, -3], [1.5, -3]]);
    expect(back).toEqual([[-3, 0], [-1.5, -3], [1.5, -3], [3, 0], [1.5, 0], [-1.5, 0]]);
    expect(frames[0]).not.toContain("rotate(4)"); // the drawing's own leg pose is taken off first
  });

  it("fit shrinks a drawing about the base until every pose stays inside the canvas", () => {
    expect(fitScale([60, 70, 196, 250])).toBe(1); // the Moon Blob's size: room to lean
    const wide = fitScale([4, 20, 252, 250]); // edge to edge, nearly full height
    expect(wide).toBeLessThan(1);
    for (const pose of WALK) {
      const t = Math.tan((pose.skewX * Math.PI) / 180);
      for (const [x, y] of [[4, 20], [252, 20], [4, 250], [252, 250]] as const) {
        const dy = wide * pose.scale[1] * (y - 250);
        const px = 128 + wide * pose.scale[0] * (x - 128) + t * dy;
        expect(px).toBeGreaterThanOrEqual(10 - 1e-9);
        expect(px).toBeLessThanOrEqual(246 + 1e-9);
        expect(250 + dy).toBeGreaterThanOrEqual(10 - 1e-9);
      }
    }
    const shrunk = frame(neutralise('<svg viewBox="0 0 256 256"><circle cx="128" cy="180" r="60"/></svg>'), WALK[0]!, [128, 250], 0.5);
    expect(numbers(attr(shrunk, "anim-pose")).slice(3, 5)).toEqual([0.5, 0.52]);
  });
});
