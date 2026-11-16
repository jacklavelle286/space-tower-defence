// Pictures from the operator's picture library (Phases 42a and 42b, ADR-0026 as amended): uploaded or drawn by Claude,
// approved in the admin, and served by CloudFront from the pictures bucket at /pictures/v1/<id>.png on both sites.
// Their asset IDs are "lib-" plus the first 32 hex characters of the sha256 of the canonical PNG, so the ID alone
// names the file: the player and the admin need no manifest for them. Only an approved picture is ever copied to
// /pictures/v1/, and publish refuses an activity that names any other, so a child only ever sees approved pictures.

/** A library picture ID: exactly "lib-" and 32 lowercase hex characters (36 characters, within keyId's 40). */
export const LIBRARY_PICTURE_ID = /^lib-[0-9a-f]{32}$/u;

export function isLibraryPictureId(assetId: string): boolean {
  return LIBRARY_PICTURE_ID.test(assetId);
}

/** Where an approved library picture is served (same origin, so CSP `img-src 'self'` covers it), or null. */
export function libraryPictureUrl(assetId: string): string | null {
  return isLibraryPictureId(assetId) ? `/pictures/v1/${assetId}.png` : null;
}
