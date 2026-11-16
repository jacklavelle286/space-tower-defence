// The activity pictures the editor can pick from (D §D8.4 "pictures are picked from the asset manifest"): the
// catalogue's "activity" family, the same files the player shows (web/player/public/assets/activity/). Vite bundles
// them into the admin build as content-hashed files, so the admin site needs no copy of the player's public folder.
// assets.test.ts checks this list equals admin-api's (api/shared/activity_assets.json), so a picture the editor offers
// is always one publish accepts, and the other way round. Every picture is text-free (art/STYLE.md), as D10 requires.
//
// Library pictures (Phase 42a: uploaded or drawn by Claude, approved in Pictures) have "lib-" IDs and are served at
// /pictures/v1/<id>.png on the admin site too; library.tsx loads their names for the picker's "My pictures".
import { isLibraryPictureId, libraryPictureUrl } from "@scd/shared";
import type { LibraryPicture } from "./library";

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
  return URLS.get(assetId) ?? libraryPictureUrl(assetId);
}

/** A readable, unique name for the picker: "pic-night-sky" -> "night sky (pic-night-sky)". */
export function pictureLabel(assetId: string): string {
  return `${pictureName(assetId)} (${assetId})`;
}

/** The picture's name without its family prefix: "pic-night-sky" -> "night sky". A library picture has no name in
 * its ID; the picker shows the library's name for it when it has one. */
export function pictureName(assetId: string): string {
  if (isLibraryPictureId(assetId)) return "my picture";
  return assetId.replace(/^(pic|obj|shape)-/u, "").replaceAll("-", " ");
}

const FAMILIES: readonly { readonly prefix: string; readonly label: string }[] = [
  { prefix: "pic-", label: "Pictures" },
  { prefix: "obj-", label: "Objects" },
  { prefix: "shape-", label: "Shapes" },
  { prefix: "dice-", label: "Dice" },
];

export type PictureFamily = { readonly label: string; readonly ids: readonly string[] };

/** The family label of the operator's approved library pictures, shown first. */
export const MY_PICTURES = "My pictures";

/** Pictures grouped by family for the picker (My pictures, then Pictures, Objects, Shapes, Dice, then Other), keeping
 * those matching `query`. `library` is the approved library pictures (never drafts), sorted by name. */
export function pictureFamilies(query = "", library: readonly LibraryPicture[] = []): PictureFamily[] {
  const needle = query.trim().toLowerCase();
  const ids = PICTURE_IDS.filter((id) => needle === "" || id.includes(needle) || pictureName(id).includes(needle));
  const mine = [...library]
    .filter((p) => isLibraryPictureId(p.id) && (needle === "" || p.name.toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => p.id);
  const families = FAMILIES.map((f) => ({ label: f.label, ids: ids.filter((id) => id.startsWith(f.prefix)) }));
  const other = ids.filter((id) => !FAMILIES.some((f) => id.startsWith(f.prefix)));
  return [{ label: MY_PICTURES, ids: mine }, ...families, { label: "Other", ids: other }].filter((f) => f.ids.length > 0);
}
