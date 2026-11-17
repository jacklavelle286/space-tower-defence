// A map's own pictures (Gate M, LD2; scope-level-designer.md §3.1): its backdrop and decorations, from the battle
// configuration (planet document schema 2). Pure, so it is tested without Phaser; BattleScene loads what this lists
// and draws only what loaded: a picture that fails to load is skipped, and a backdrop that fails falls back to the
// repo Moonbeam ground, so a missing file never stops a battle.
import type { BattleConfig } from "@scd/game-core";
import { DECORATIONS, FEET, frameUrl, MAP_ART, TILE_PX, tileToPx, type ArtAsset } from "@scd/shared/map";
import { libraryPictureUrl } from "@scd/shared";
import { REPO_ART, type ArtBinding } from "@scd/shared/manifest";

export interface MapPicture {
  /** Texture key: the picture's own ID (a library ID or a catalogue ID), so two maps share a loaded file. */
  readonly key: string;
  readonly url: string;
}

export interface PlacedDecoration extends MapPicture {
  /** Pixel position of the anchor on the 1920 x 1056 canvas. */
  readonly x: number;
  readonly y: number;
  readonly anchor: readonly [number, number];
  readonly size: readonly [number, number];
  /** Sorted with the astronauts and aliens by their feet (10 + y / 1000, as BattleScene draws them). */
  readonly depth: number;
}

/** A library decoration is drawn on its tile, standing on its feet, one tile wide (scope §3.1 "one 96 px tile"). */
const LIBRARY_DECORATION: Pick<ArtAsset, "anchor" | "displaySize"> = { anchor: FEET, displaySize: [TILE_PX, TILE_PX] };

/** The map's backdrop picture, or null for the repo Moonbeam ground (ART.backdrop, always loaded). */
export function backdropPicture(config: Pick<BattleConfig, "art">): MapPicture | null {
  const id = config.art.backdrop;
  const url = id === null ? null : libraryPictureUrl(id);
  return id === null || url === null ? null : { key: id, url };
}

/** Every decoration with where and how to draw it. An ID that is neither a repo decoration nor a library picture is
 *  left out (the parser refuses one, so this is only a guard). */
export function placedDecorations(config: Pick<BattleConfig, "art">, art: ArtBinding = REPO_ART): PlacedDecoration[] {
  const out: PlacedDecoration[] = [];
  for (const d of config.art.decorations) {
    // A repo decoration is drawn as the run's asset manifest says (LD8); a library one is its own picture.
    const known = DECORATIONS[d.art];
    const repo = known === undefined ? undefined : art.asset(known);
    const url = repo !== undefined ? frameUrl(repo, 1) : libraryPictureUrl(d.art);
    if (url === null) continue;
    const look = repo ?? LIBRARY_DECORATION;
    // A standing decoration's feet are on the bottom edge of its tile; a flat one (a crater) is centred on it.
    const y = tileToPx(d.y) + (look.anchor[1] === 1 ? TILE_PX / 2 : 0);
    out.push({ key: d.art, url, x: tileToPx(d.x), y, anchor: look.anchor, size: look.displaySize, depth: 10 + y / 1000 });
  }
  return out;
}

/** What to load for this map beyond the always-loaded art (BattleScene preload). */
export function mapPicturesToLoad(config: Pick<BattleConfig, "art">, art: ArtBinding = REPO_ART): MapPicture[] {
  const all = [backdropPicture(config), ...placedDecorations(config, art)].filter((p): p is MapPicture => p !== null);
  const seen = new Set<string>();
  return all.filter((p) => !seen.has(p.key) && seen.add(p.key) !== undefined).map(({ key, url }) => ({ key, url }));
}

/** The texture to draw the backdrop with: the map's own when it loaded, else the art set's ground (`ground`; the
 *  repo Moonbeam ground unless an asset manifest's art set says otherwise, LD8). */
export function backdropKey(config: Pick<BattleConfig, "art">, loaded: (key: string) => boolean, ground: string = MAP_ART.backdrop.id): string {
  const own = backdropPicture(config);
  return own !== null && loaded(own.key) ? own.key : ground;
}
