// The activity pictures the editor can pick from (D §D8.4 "pictures are picked from the asset manifest"): the
// catalogue's "activity" family, the same files the player shows (web/player/public/assets/activity/). Vite bundles
// them into the admin build as content-hashed files, so the admin site needs no copy of the player's public folder.
// assets.test.ts checks this list equals admin-api's (api/shared/activity_assets.json), so a picture the editor offers
// is always one publish accepts, and the other way round. Every picture is text-free (art/STYLE.md), as D10 requires.

const FILES = import.meta.glob<string>("../../../player/public/assets/activity/*.{png,svg}", {
  eager: true,
  query: "?url",
  import: "default",
});

function idOf(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.slice(0, file.lastIndexOf("."));
}

const URLS = new Map<string, string>(Object.entries(FILES).map(([path, url]) => [idOf(path), url]));

/** Every picture ID, sorted so the picker groups families (bin-, dice-, obj-, pic-, shape-, ...). */
export const PICTURE_IDS: readonly string[] = [...URLS.keys()].sort();

/** The URL the browser loads a picture from, or null for an ID that is not an activity picture. */
export function pictureUrl(assetId: string): string | null {
  return URLS.get(assetId) ?? null;
}

/** A readable name for the picker: "pic-night-sky" -> "night sky (pic-night-sky)". */
export function pictureLabel(assetId: string): string {
  const words = assetId.replace(/^(pic|obj|shape)-/u, "").replaceAll("-", " ");
  return `${words} (${assetId})`;
}
