// The map's art (Gate M, LD1): route tiles, portal, pads, colony and the decorations, shared by the player's
// battlefield and the admin level editor so both draw a map from one table. Moved from web/player/src/game/assets.ts;
// the decoration entries are new (the catalogue had them, nothing placed them).
//
// Each entry copies its catalogue entry in docs/art/asset-catalogue.json: the app path, the frame count and file
// pattern ({nn} = 01..frames), the anchor (normalised origin) and the display size on the 1920 x 1056 logical
// canvas. The PNGs are drawn at 2x, so sprites are always shown scaled down to displaySize. web/player's
// assets.test.ts checks every entry against the catalogue and that every frame exists under web/player/public/.

export interface ArtAsset {
  /** Catalogue id; also the Phaser texture key (frame n of an animation is `${id}-${nn}`). */
  readonly id: string;
  /** URL path, with {nn} for an animation's frame number. */
  readonly path: string;
  readonly frames: number;
  readonly anchor: readonly [number, number];
  readonly displaySize: readonly [number, number];
  /** One URL per frame, when an asset manifest gives them (Gate M, LD8; shared/manifest). Absent: `path` with {nn}. */
  readonly urls?: readonly string[];
}

export const COMMON_DIR = "/assets/common";
export const LUNA_DIR = "/assets/luna-1";

export const still = (id: string, dir: string, anchor: readonly [number, number], size: readonly [number, number], file = `${id}.png`): ArtAsset => ({
  id,
  path: `${dir}/${file}`,
  frames: 1,
  anchor,
  displaySize: size,
});

export const anim = (id: string, dir: string, frames: number, anchor: readonly [number, number], size: readonly [number, number]): ArtAsset => ({
  id,
  path: `${dir}/${id}-{nn}.png`,
  frames,
  anchor,
  displaySize: size,
});

export const CENTRE = [0.5, 0.5] as const;
export const FEET = [0.5, 1.0] as const;
const TILE = [96, 96] as const;
const L = LUNA_DIR;

export const MAP_ART = {
  backdrop: still("luna-backdrop", L, [0, 0], [1920, 1056], "luna-backdrop.webp"),
  routeH: still("route-straight-h", L, CENTRE, TILE),
  routeDown: still("route-straight-v", L, CENTRE, TILE),
  routeUp: still("route-straight-up", L, CENTRE, TILE),
  cornerRightDown: still("route-corner-right-down", L, CENTRE, TILE),
  cornerDownRight: still("route-corner-down-right", L, CENTRE, TILE),
  cornerRightUp: still("route-corner-right-up", L, CENTRE, TILE),
  cornerUpRight: still("route-corner-up-right", L, CENTRE, TILE),
  portalEnd: still("route-portal-end", L, CENTRE, TILE),
  colonyEnd: still("route-colony-end", L, CENTRE, TILE),
  portal: anim("portal-idle", L, 6, [0.5, 0.62], [256, 256]),
  padEmpty: still("pad-empty", L, CENTRE, [128, 128]),
  padHover: still("pad-hover", L, CENTRE, [128, 128]),
  padSelected: still("pad-selected", L, CENTRE, [128, 128]),
  padClosed: still("pad-closed", L, CENTRE, [128, 128]),
  colonyHealthy: still("colony-healthy", L, FEET, [384, 384]),
  colonyWorried: still("colony-worried", L, FEET, [384, 384]),
  colonyVeryWorried: still("colony-very-worried", L, FEET, [384, 384]),
} as const satisfies Record<string, ArtAsset>;

/**
 * The repo decorations a map may place (scope-level-designer.md §3.1 `map.art.decorations[].art`), by catalogue id.
 * Rocks, the antenna, lamps and the flag stand on their feet; craters lie flat, centred on their tile.
 */
export const DECORATIONS: Readonly<Record<string, ArtAsset>> = Object.fromEntries(
  [
    still("deco-crater-1", L, CENTRE, [128, 128]),
    still("deco-crater-2", L, CENTRE, [128, 128]),
    still("deco-crater-3", L, CENTRE, [128, 128]),
    still("deco-rock-1", L, FEET, [128, 128]),
    still("deco-rock-2", L, FEET, [128, 128]),
    still("deco-rock-3", L, FEET, [128, 128]),
    still("deco-antenna", L, FEET, [128, 128]),
    still("deco-lamp-on", L, FEET, [64, 64]),
    still("deco-lamp-off", L, FEET, [64, 64]),
    still("deco-flag-plain", L, FEET, [64, 64]),
  ].map((a) => [a.id, a]),
);

/** Texture key of frame `n` (1-based) of an asset: the id itself for a still. */
export function frameKey(asset: ArtAsset, n: number): string {
  return asset.frames === 1 ? asset.id : `${asset.id}-${String(n).padStart(2, "0")}`;
}

/** URL of frame `n` (1-based): the manifest's URL when it gave one, else the repo path. */
export function frameUrl(asset: ArtAsset, n: number): string {
  return asset.urls?.[n - 1] ?? asset.path.replace("{nn}", String(n).padStart(2, "0"));
}
