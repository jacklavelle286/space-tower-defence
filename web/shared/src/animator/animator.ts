// The shared animator (Gate M, AM0 spike; scope-asset-kinds-and-makers.md §3.2 "Animation"): frames computed from one
// drawn frame by transforms, as art/STYLE.md §11 does by hand ("copy frame 01 and change only transforms"). No extra
// drawing calls: the alien maker (AM1) asks for one frame and makes the walk cycle here.
//
// How a frame is made from a drawing (any SVG on the 256 x 256 canvas, anchored bottom-centre):
//   1. the whole drawing is wrapped in one group that leans and squashes about the base (x 128, y 250): STYLE §11's
//      "about the base" moves, so even a drawing with no group names gets the walk's lean and squash (the
//      whole-sprite bob, the fallback the scope names);
//   2. if the drawing names its parts with STYLE §9's ids, they move too: `antenna-front` and `antenna-back` rotate
//      about their own root (the first point of their first path), lagging the body; `face` drifts 1-2 px.
// Pure string work on sanitised SVG (api/shared/svg_sanitise.py keeps ids and plain <g> tags), so it runs in the
// browser, in a Worker and in Node alike.

export interface Pose {
  /** Lean of the whole drawing about the base, degrees (negative leans the top to the right, the walking way). */
  readonly skewX: number;
  /** Squash and stretch about the base: [x, y]. */
  readonly scale: readonly [number, number];
  /** Rotation of each antenna about its root, degrees (follow-through, opposite to the lean). */
  readonly antenna: number;
  /** Drift of the face, px. */
  readonly face: readonly [number, number];
}

/** The alien walk of STYLE §11, six frames, with the numbers of the hand-drawn Moon Blob (alien-blob-walk-01..06). */
export const WALK: readonly Pose[] = [
  { skewX: -8, scale: [1, 1.04], antenna: -8, face: [2, -1] },
  { skewX: -2, scale: [1.08, 0.91], antenna: 6, face: [0, 2] },
  { skewX: -3, scale: [1, 1], antenna: 4, face: [1, 0] },
  { skewX: -4, scale: [0.95, 1.07], antenna: -4, face: [1, -2] },
  { skewX: -7, scale: [1.03, 1.01], antenna: -9, face: [2, -1] },
  { skewX: -3, scale: [1.02, 0.97], antenna: 5, face: [1, 1] },
];

/** The base the body moves about: the anchor's ground point on the 256 canvas (feet on y 250, STYLE §10). */
export const BASE: readonly [number, number] = [128, 250];

const ANTENNAE = ["antenna-front", "antenna-back"] as const;
/** Groups whose own transform is the drawing's pose, cleared by `neutralise` before animating. */
const POSED = ["antenna-front", "antenna-back", "face"] as const;

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

/** The opening tag of `<g id="<id>" ...>` and where it is, or null. */
function groupTag(svg: string, id: string): { start: number; end: number; tag: string } | null {
  const match = new RegExp(`<g\\b[^>]*\\bid="${id}"[^>]*>`, "u").exec(svg);
  return match === null ? null : { start: match.index, end: match.index + match[0].length, tag: match[0] };
}

/** The tag with its transform attribute set to `transform` (or removed when null). */
function withTransform(tag: string, transform: string | null): string {
  const bare = tag.replace(/\s+transform="[^"]*"/u, "");
  return transform === null ? bare : bare.replace(/^<g\b/u, `<g transform="${transform}"`);
}

/** The first point of the first path after `from`: an antenna's root, which it rotates about. */
function rootAfter(svg: string, from: number): readonly [number, number] | null {
  const match = /\bd="M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/u.exec(svg.slice(from));
  return match === null ? null : [Number(match[1]), Number(match[2])];
}

/** The drawing with its own pose removed: the top group's and the posed parts' transforms cleared (a hand-drawn walk
 *  frame 01 carries frame 01's pose; a made alien's drawing is drawn neutral). */
export function neutralise(svg: string): string {
  let out = svg;
  const top = /<svg\b[^>]*>(?:\s|<!--[\s\S]*?-->|<defs>[\s\S]*?<\/defs>)*(<g\b[^>]*>)/u.exec(out);
  if (top?.[1] !== undefined) {
    const at = out.indexOf(top[1], top.index);
    out = out.slice(0, at) + withTransform(top[1], null) + out.slice(at + top[1].length);
  }
  for (const id of POSED) {
    const g = groupTag(out, id);
    if (g !== null) out = out.slice(0, g.start) + withTransform(g.tag, null) + out.slice(g.end);
  }
  return out;
}

/** Which of the moving parts a drawing names (the rest of the motion still happens through the body). */
export function movingParts(svg: string): { antennae: string[]; face: boolean } {
  return { antennae: ANTENNAE.filter((id) => groupTag(svg, id) !== null), face: groupTag(svg, "face") !== null };
}

/** One frame: the drawing in `pose`. */
export function frame(svg: string, pose: Pose, base: readonly [number, number] = BASE): string {
  const open = /<svg\b[^>]*>/u.exec(svg);
  const close = svg.lastIndexOf("</svg>");
  if (open === null || close === -1) throw new Error("animator: not an SVG");
  let inner = svg.slice(open.index + open[0].length, close);
  for (const id of ANTENNAE) {
    const g = groupTag(inner, id);
    const root = g === null ? null : rootAfter(inner, g.end);
    if (g !== null && root !== null) {
      inner = inner.slice(0, g.start) + withTransform(g.tag, `rotate(${fmt(pose.antenna)} ${fmt(root[0])} ${fmt(root[1])})`) + inner.slice(g.end);
    }
  }
  const face = groupTag(inner, "face");
  if (face !== null) inner = inner.slice(0, face.start) + withTransform(face.tag, `translate(${fmt(pose.face[0])} ${fmt(pose.face[1])})`) + inner.slice(face.end);
  const [bx, by] = base;
  const body = `translate(${fmt(bx)} ${fmt(by)}) skewX(${fmt(pose.skewX)}) scale(${fmt(pose.scale[0])} ${fmt(pose.scale[1])}) translate(${fmt(-bx)} ${fmt(-by)})`;
  return `${svg.slice(0, open.index + open[0].length)}<g id="anim-pose" transform="${body}">${inner}</g>${svg.slice(close)}`;
}

/** Every frame of a cycle from one drawing (neutralised first). */
export function animate(svg: string, poses: readonly Pose[] = WALK, base: readonly [number, number] = BASE): string[] {
  const neutral = neutralise(svg);
  return poses.map((pose) => frame(neutral, pose, base));
}
