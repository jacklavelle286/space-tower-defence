// Activity pictures (PICTURE_SELECT cards, question pictures) by asset ID, until the asset manifest exists (Phase 64).
// The pictures are the catalogue's "activity" family (docs/art/asset-catalogue.json), served as loose files from
// /assets/activity/ (atlas "activity": DOM images, not Phaser textures). activityAssets.test.ts checks this list
// against the catalogue and that every file exists, so a renamed picture fails the tests rather than a child's panel.

/** Pictures drawn as PNG (author size 2x, shown at 128 px). */
const PNG = [
  "pic-cat", "pic-dog", "pic-sun", "pic-moon", "pic-pin", "pic-pan", "pic-pen", "pic-pig", "pic-hat", "pic-bed",
  "pic-cup", "pic-map", "pic-net", "pic-van", "pic-jam", "pic-box", "pic-fox", "pic-bus", "pic-web", "pic-zip",
  "pic-mug", "pic-peg", "pic-log", "pic-ship", "pic-shop", "pic-chip", "pic-fish", "pic-ring", "pic-rain",
  "pic-boat", "pic-frog", "pic-flag", "pic-bell", "pic-sock", "pic-duck", "pic-knight", "pic-night-sky", "pic-kite",
  "pic-knot", "pic-football", "pic-bird", "pic-foxes", "obj-star", "obj-moon-rock", "obj-rocket", "obj-alien-egg",
  "obj-planet", "obj-comet", "obj-alien", "shape-cube", "shape-cuboid", "shape-sphere", "shape-cylinder",
  "shape-cone", "shape-pyramid",
] as const;

/** Pictures drawn as SVG (shapes, dice, frames). */
const SVG = [
  "shape-circle", "shape-triangle", "shape-square", "shape-rectangle", "shape-pentagon", "shape-hexagon",
  "ten-frame", "dice-1", "dice-2", "dice-3", "dice-4", "dice-5", "dice-6", "group-frame", "bin-plain", "zone-plain",
  "tray",
] as const;

const FILES = new Map<string, string>([...PNG.map((id) => [id, `${id}.png`] as const), ...SVG.map((id) => [id, `${id}.svg`] as const)]);

/** Every activity picture ID this app can show. */
export const ACTIVITY_ASSET_IDS: readonly string[] = [...FILES.keys()];

/** The URL of an activity picture, or null when this app has no picture with that ID. */
export function activityAssetUrl(assetId: string): string | null {
  const file = FILES.get(assetId);
  return file === undefined ? null : `/assets/activity/${file}`;
}
