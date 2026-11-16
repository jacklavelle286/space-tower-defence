// Pictures from the operator's picture library (Phases 42a and 42b, ADR-0026 as amended): uploaded or drawn by Claude,
// approved in the admin, and served by CloudFront from the pictures bucket at /pictures/v1/<id>.png on both sites.
// Their asset IDs are "lib-" plus the first 32 hex characters of the sha256 of the canonical PNG, so the ID alone
// names the file: the player and the admin need no manifest for them. Only an approved picture is ever copied to
// /pictures/v1/, and publish refuses an activity that names any other, so a child only ever sees approved pictures.

import { LIMITS } from "./limits";

/** A library picture ID: exactly "lib-" and 32 lowercase hex characters (36 characters, within keyId's 40). */
export const LIBRARY_PICTURE_ID = /^lib-[0-9a-f]{32}$/u;

export function isLibraryPictureId(assetId: string): boolean {
  return LIBRARY_PICTURE_ID.test(assetId);
}

/** Where an approved library picture is served (same origin, so CSP `img-src 'self'` covers it), or null. */
export function libraryPictureUrl(assetId: string): string | null {
  return isLibraryPictureId(assetId) ? `/pictures/v1/${assetId}.png` : null;
}

// Picture kinds (Gate P2, ADR-0031 as amended): what a library picture is for. The list, its order and its labels come
// from contracts/limits.json (`picture.kinds`), which admin-api and picture-gen read too. Each kind also gives its
// stored size (256 x 256; 1920 x 1056 for a background, the game's logical canvas) and its byte limits, so the admin
// draws and checks a picture at the size admin-api will insist on. `consumer` says who can use the picture: "activity" kinds can go in a learning activity (publish refuses any
// other kind); "later" kinds are built up now for the avatar library and the makers (Gate F, Gate M).

export type PictureKind = (typeof LIMITS.picture.kinds)[number];
export type PictureKindId = PictureKind["id"];
export type PictureKindConsumer = PictureKind["consumer"];

/** Every kind, in menu order. */
export const PICTURE_KINDS: readonly PictureKind[] = LIMITS.picture.kinds;

/** The kind of a picture, job or upload saved before kinds existed (and the upload form's default). */
export const DEFAULT_PICTURE_KIND: PictureKindId = LIMITS.picture.defaultKind;

/** The kinds a learning activity may use (the activity picture picker shows only these). */
export const ACTIVITY_PICTURE_KINDS: readonly PictureKind[] = PICTURE_KINDS.filter((k) => k.consumer === "activity");

/** The kinds kept for later (not used in the game yet). */
export const LATER_PICTURE_KINDS: readonly PictureKind[] = PICTURE_KINDS.filter((k) => k.consumer === "later");

export function isPictureKind(value: unknown): value is PictureKindId {
  return typeof value === "string" && PICTURE_KINDS.some((k) => k.id === value);
}

/** A picture's kind as stored: a missing or unknown value reads as the default, as admin-api reads it. */
export function pictureKindOf(value: unknown): PictureKindId {
  return isPictureKind(value) ? value : DEFAULT_PICTURE_KIND;
}

export function pictureKindLabel(kind: PictureKindId): string {
  return PICTURE_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

export function isActivityPictureKind(kind: PictureKindId): boolean {
  return PICTURE_KINDS.find((k) => k.id === kind)?.consumer === "activity";
}

/** A kind's stored size and byte limits, from its contracts/limits.json entry (admin-api checks the same numbers). */
export type PictureKindSpec = {
  /** The stored PNG's size in pixels. */
  readonly width: number;
  readonly height: number;
  /** The largest SVG a drawing of this kind can be. */
  readonly svgMaxBytes: number;
  /** The largest PNG admin-api accepts and stores for this kind. */
  readonly maxBytes: number;
  /** The largest R34 request body (the PNG in base64 and the other fields). */
  readonly bodyMaxBytes: number;
  /** How many places one drawing of this kind takes in the daily and monthly caps (R38): 1, or 3 for a background. */
  readonly capWeight: number;
};

export function pictureKindSpec(kind: PictureKindId): PictureKindSpec {
  const entry = PICTURE_KINDS.find((k) => k.id === kind) ?? PICTURE_KINDS.find((k) => k.id === DEFAULT_PICTURE_KIND);
  if (entry === undefined) throw new Error("contracts/limits.json has no default picture kind");
  const capWeight = "capWeight" in entry ? entry.capWeight : 1;
  return { width: entry.width, height: entry.height, svgMaxBytes: entry.svgMaxBytes, maxBytes: entry.maxBytes, bodyMaxBytes: entry.bodyMaxBytes, capWeight };
}
