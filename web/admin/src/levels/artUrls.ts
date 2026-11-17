// The map art for the editor (Gate M, LD3): the same files the player draws (web/player/public/assets/luna-1), bundled
// by Vite as content-hashed assets so the admin site serves its own copy (the release classifies them as hashed and
// caches them for a year). Looked up by file name from @scd/shared/map's asset paths, so editor and game draw one table.
import { frameUrl, type ArtAsset } from "@scd/shared/map";
import { libraryPictureUrl } from "@scd/shared";

const FILES = import.meta.glob<string>(
  ["../../../player/public/assets/luna-1/route-*.png", "../../../player/public/assets/luna-1/deco-*.png", "../../../player/public/assets/luna-1/pad-empty.png", "../../../player/public/assets/luna-1/pad-closed.png", "../../../player/public/assets/luna-1/luna-backdrop.webp"],
  { eager: true, query: "?url", import: "default" },
);
const BY_NAME = new Map(Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf("/") + 1), url]));

/** The bundled URL of an asset's first frame, or its player-site path when it is not bundled (tests). */
export function artUrl(asset: ArtAsset): string {
  const path = frameUrl(asset, 1);
  return BY_NAME.get(path.slice(path.lastIndexOf("/") + 1)) ?? path;
}

/** A library picture's served URL (same origin: /pictures/v1/<id>.png on both sites). */
export function pictureUrl(id: string): string | null {
  return libraryPictureUrl(id);
}
