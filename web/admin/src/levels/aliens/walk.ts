// A made alien's walk, made in the browser (Gate M, AM1; ADR-0041; the owner's AM0 verdict, 2026-11-17): one drawing of
// the Alien kind (R39's sanitised SVG) becomes the six walk frames of art/STYLE.md §11 through the shared animator,
// shrunk about its base when a pose would leave the canvas, each rendered to a 256 x 256 PNG through an <img> and a
// canvas (never put into the page), as the picture library renders drawings. No extra drawing calls.
import { animate, BASE, CANVAS, fitScale, movingParts, neutralise, WALK, type Row } from "@scd/shared/animator";
import { browserTools } from "../../pictures/normalise";

/** The browser parts; tests pass a fake. */
export interface WalkTools {
  /** Each row's leftmost and rightmost pixel that is not see-through when the SVG is drawn on the 256 canvas
   *  (rows with none left out), or [] for an empty drawing. */
  outline(svg: string): Promise<readonly Row[]>;
  /** The SVG as a 256 x 256 PNG. */
  render(svg: string): Promise<Blob>;
}

export interface Walk {
  readonly frames: readonly Blob[];
  /** How much the drawing was shrunk so every pose fits (1: as drawn). */
  readonly fit: number;
  /** The parts that move on their own; none means the whole body leans and squashes (the fallback). */
  readonly parts: readonly string[];
}

export class WalkError extends Error {}

/** The six frames from one drawing. */
export async function makeWalk(svg: string, tools: WalkTools = browserWalkTools): Promise<Walk> {
  const neutral = neutralise(svg);
  const rows = await tools.outline(neutral);
  if (rows.length === 0) throw new WalkError("The drawing is empty.");
  const fit = fitScale(rows);
  const frames: Blob[] = [];
  for (const frame of animate(neutral, WALK, BASE, fit)) frames.push(await tools.render(frame));
  const moving = movingParts(neutral);
  return { frames, fit, parts: [...moving.antennae, ...moving.legs, ...(moving.face ? ["face"] : [])] };
}

/** How a walk moves, in words for the operator. */
export function partsText(parts: readonly string[]): string {
  if (parts.length === 0) return "The whole alien leans and squashes as it walks (the drawing names no moving parts).";
  const names = parts.map((p) => p.replace("-", " "));
  return `The body leans and squashes; these parts move on their own: ${names.join(", ")}.`;
}

async function drawn(svg: string): Promise<CanvasRenderingContext2D> {
  const picture = await browserTools.decodeSvg(svg);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS;
    canvas.height = CANVAS;
    const context = canvas.getContext("2d");
    if (context === null) throw new WalkError("This browser cannot draw the frames.");
    context.drawImage(picture.source, 0, 0, CANVAS, CANVAS);
    return context;
  } finally {
    picture.close();
  }
}

export const browserWalkTools: WalkTools = {
  async outline(svg) {
    const context = await drawn(svg);
    let pixels: Uint8ClampedArray;
    try {
      pixels = context.getImageData(0, 0, CANVAS, CANVAS).data;
    } catch {
      return [[0, 0, CANVAS], [BASE[1], 0, CANVAS]]; // a canvas the browser will not read: assume edge to edge
    }
    const rows: Row[] = [];
    for (let y = 0; y < CANVAS; y += 1) {
      let [left, right] = [-1, -1];
      for (let x = 0; x < CANVAS; x += 1) {
        if ((pixels[(y * CANVAS + x) * 4 + 3] ?? 0) > 16) {
          if (left < 0) left = x;
          right = x + 1;
        }
      }
      if (left >= 0) rows.push([y, left, right]);
    }
    return rows;
  },
  async render(svg) {
    const context = await drawn(svg);
    const png = await new Promise<Blob | null>((resolve) => {
      try {
        context.canvas.toBlob(resolve, "image/png");
      } catch {
        resolve(null);
      }
    });
    if (png === null) throw new WalkError("This browser cannot make the frames.");
    return png;
  },
};
