// Operator sign-in: Cognito managed login with the authorisation code flow and PKCE (plan E.7.2, ADR-0002, ADR-0023).
// Pure helpers only (no storage, no navigation), so each step can be tested. session.ts wires them to the browser.
//
// The flow, for a reader new to it:
//   1. make a random `code_verifier` and keep it in this tab; send only its SHA-256 (`code_challenge`, S256);
//   2. send the browser to the operator pool's /oauth2/authorize; the password and TOTP are typed on Cognito's page;
//   3. Cognito redirects to https://admin.aliens.jackgl.com/auth/callback?code=...&state=...;
//   4. POST the code plus the verifier to /oauth2/token (no client secret: this is a public client). Someone who stole
//      the code cannot use it without the verifier, which never left this tab.

import type { AdminConfig } from "../config";

export const CALLBACK_PATH = "/auth/callback";

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

/** 32 random bytes as base64url: 43 characters, inside RFC 7636's 43-128 range. */
export function randomToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** RFC 7636 S256: base64url(SHA-256(verifier)). */
export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export function redirectUri(origin: string): string {
  return `${origin}${CALLBACK_PATH}`;
}

export function authorizeUrl(config: AdminConfig, origin: string, challenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: redirectUri(origin),
    scope: `openid ${config.scope}`,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `https://${config.authDomain}/oauth2/authorize?${params.toString()}`;
}

/** Cognito's /logout clears its own sign-in cookie, then returns to the site (E.7.4). It revokes no tokens. */
export function logoutUrl(config: AdminConfig, origin: string): string {
  const params = new URLSearchParams({ client_id: config.clientId, logout_uri: `${origin}/` });
  return `https://${config.authDomain}/logout?${params.toString()}`;
}

export function tokenRequestBody(config: AdminConfig, origin: string, code: string, verifier: string): URLSearchParams {
  return new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.clientId,
    code,
    redirect_uri: redirectUri(origin),
    code_verifier: verifier,
  });
}

export type CallbackResult = { ok: true; code: string } | { ok: false; reason: "denied" | "state" | "missing" };

/** Read the callback's query string against the state this tab sent. */
export function readCallback(search: string, expectedState: string | null): CallbackResult {
  const params = new URLSearchParams(search);
  if (params.has("error")) return { ok: false, reason: "denied" };
  const code = params.get("code");
  const state = params.get("state");
  if (code === null || state === null) return { ok: false, reason: "missing" };
  if (expectedState === null || state !== expectedState) return { ok: false, reason: "state" };
  return { ok: true, code };
}

export type AccessClaims = {
  readonly sub: string;
  readonly username: string;
  readonly exp: number;
  readonly tokenUse: string;
  /** The app client the token was issued to, and the pool that issued it: the route guard compares both with config.json. */
  readonly clientId: string;
  readonly issuer: string;
  readonly groups: readonly string[];
};

/**
 * Read an access token's claims to show who is signed in and whether the account is in `admin`. This does NOT verify
 * the signature and is not a security check: the API gateway verifies every token, and admin-api checks the group
 * again (E.7.3). It only decides what the page shows.
 */
export function readClaims(token: string): AccessClaims | null {
  const part = token.split(".")[1];
  if (part === undefined) return null;
  try {
    const padded = part.replace(/-/gu, "+").replace(/_/gu, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const json = new TextDecoder().decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)));
    const claims = JSON.parse(json) as Record<string, unknown>;
    const groups = claims["cognito:groups"];
    const sub = claims["sub"];
    const exp = claims["exp"];
    if (typeof sub !== "string" || typeof exp !== "number") return null;
    return {
      sub,
      username: typeof claims["username"] === "string" ? claims["username"] : "",
      exp,
      tokenUse: typeof claims["token_use"] === "string" ? claims["token_use"] : "",
      clientId: typeof claims["client_id"] === "string" ? claims["client_id"] : "",
      issuer: typeof claims["iss"] === "string" ? claims["iss"] : "",
      groups: Array.isArray(groups) ? groups.filter((g): g is string => typeof g === "string") : [],
    };
  } catch {
    return null;
  }
}

/** Exact group name, never a substring (E.7.3). */
export function isAdmin(claims: AccessClaims): boolean {
  return claims.groups.includes("admin");
}
