// The walk maker (Gate M, AM1): six frames from one drawing, shrunk when a pose would leave the canvas.
import { describe, expect, it } from "vitest";
import { makeWalk, partsText, WalkError, type WalkTools } from "./walk";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><g id="alien"><g id="antenna-front"><path d="M140 90 L150 60"/></g><g id="face"><circle cx="140" cy="170" r="5"/></g></g></svg>';
const rendered: string[] = [];
const tools = (box: readonly [number, number, number, number] | null): WalkTools => ({
  outline: async () => box,
  render: async (svg) => {
    rendered.push(svg);
    return new Blob([svg]);
  },
});

describe("makeWalk", () => {
  it("makes six frames and names the parts that move", async () => {
    rendered.length = 0;
    const walk = await makeWalk(SVG, tools([60, 70, 196, 250]));
    expect(walk.frames).toHaveLength(6);
    expect(walk.fit).toBe(1);
    expect(walk.parts).toEqual(["antenna-front", "face"]);
    expect(rendered.every((svg) => svg.includes('id="anim-pose"'))).toBe(true);
    expect(partsText(walk.parts)).toMatch(/antenna front, face/u);
  });

  it("shrinks a drawing that fills the canvas, and refuses an empty one", async () => {
    rendered.length = 0;
    const walk = await makeWalk(SVG, tools([2, 4, 254, 250]));
    expect(walk.fit).toBeLessThan(1);
    expect(rendered[0]).toContain(`scale(${walk.fit} `);
    await expect(makeWalk(SVG, tools(null))).rejects.toBeInstanceOf(WalkError);
  });
});
