// The admin's route guard (Phase 35, M3-01; D §D8). It runs on the stored token's claims BEFORE the app builds its
// API client, so a page for a token that cannot use the admin never sends an admin request.
//
// Convenience, not security: the claims are read without checking the signature. The API gateway verifies every token
// (a player-pool token gets 401 and never reaches the function) and admin-api checks the exact `admin` group again
// (403 FORBIDDEN). This guard only decides what the page shows.

import type { AccessClaims } from "./auth/pkce";
import { isAdmin } from "./auth/pkce";
import type { AdminConfig } from "./config";

export type Access =
  | { readonly allowed: true }
  /** `wrong-pool`: not an operator-pool access token for this admin app (a player account, or any other token). */
  | { readonly allowed: false; readonly reason: "wrong-pool" | "not-admin" };

export function issuerOf(config: AdminConfig): string {
  return `https://cognito-idp.${config.region}.amazonaws.com/${config.userPoolId}`;
}

export function checkAccess(claims: AccessClaims, config: AdminConfig): Access {
  if (claims.tokenUse !== "access" || claims.clientId !== config.clientId || claims.issuer !== issuerOf(config)) {
    return { allowed: false, reason: "wrong-pool" };
  }
  return isAdmin(claims) ? { allowed: true } : { allowed: false, reason: "not-admin" };
}

/** D §D8 copy: one sentence for both reasons; the grown-up line says which. */
export const NOT_AUTHORISED = "This account can't use the content admin.";

export function accessDetail(reason: "wrong-pool" | "not-admin" | "server"): string {
  switch (reason) {
    case "wrong-pool":
      return "It is not an operator account. Player accounts sign in to the game, not here.";
    case "not-admin":
      return "It is an operator account, but it is not in the admin group.";
    case "server":
      return "The server refused this account (403 FORBIDDEN).";
  }
}
