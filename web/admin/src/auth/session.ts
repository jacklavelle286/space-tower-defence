// The browser side of sign-in (ADR-0023): where the PKCE verifier and the tokens live, and the redirects.
//
// Storage: sessionStorage, so tokens belong to this tab and vanish when it closes; nothing in localStorage. The ID and
// refresh tokens are not kept at all: the API takes the access token only (E.7.1), and with operator refresh-token
// rotation unverified (U-058) the admin simply asks for a new sign-in when the access token expires (60 minutes).

import type { AdminConfig } from "../config";
import {
  CALLBACK_PATH,
  authorizeUrl,
  codeChallenge,
  logoutUrl,
  randomToken,
  readCallback,
  readClaims,
  tokenRequestBody,
  type AccessClaims,
} from "./pkce";

const PENDING_KEY = "scd-admin-pkce";
const TOKEN_KEY = "scd-admin-token";
const EXPIRY_MARGIN_SECONDS = 60;

export type Session = { readonly accessToken: string; readonly claims: AccessClaims };

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // blocked storage: sign-in still works for this page load only
  }
}

export async function startSignIn(config: AdminConfig): Promise<void> {
  const verifier = randomToken();
  const state = randomToken();
  storage()?.setItem(PENDING_KEY, JSON.stringify({ verifier, state }));
  window.location.assign(authorizeUrl(config, window.location.origin, await codeChallenge(verifier), state));
}

export function isCallback(): boolean {
  return window.location.pathname === CALLBACK_PATH;
}

/** Finish the redirect: swap the code for tokens, keep the access token, and return to "/". */
export async function completeSignIn(config: AdminConfig, fetchFn: typeof fetch = fetch): Promise<Session> {
  const search = window.location.search; // read before the address bar is cleaned below
  const store = storage();
  const pendingRaw = store?.getItem(PENDING_KEY) ?? null;
  store?.removeItem(PENDING_KEY); // single use, whatever happens next
  window.history.replaceState(null, "", "/"); // the code must not stay in the address bar or history
  const pending = pendingRaw === null ? null : (JSON.parse(pendingRaw) as { verifier?: unknown; state?: unknown });
  const expected = typeof pending?.state === "string" ? pending.state : null;
  const result = readCallback(search, expected);
  if (!result.ok || typeof pending?.verifier !== "string") {
    throw new Error(result.ok ? "Sign-in was started in another tab. Try again." : `Sign-in did not complete (${result.reason}).`);
  }
  const response = await fetchFn(`https://${config.authDomain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenRequestBody(config, window.location.origin, result.code, pending.verifier),
  });
  if (!response.ok) throw new Error(`Sign-in did not complete (token HTTP ${response.status}).`);
  const tokens = (await response.json()) as { access_token?: unknown };
  const token = typeof tokens.access_token === "string" ? tokens.access_token : "";
  const claims = readClaims(token);
  if (claims === null) throw new Error("Sign-in did not complete (unreadable token).");
  store?.setItem(TOKEN_KEY, token);
  return { accessToken: token, claims };
}

/** The stored session, or null when there is none or it is about to expire. */
export function currentSession(nowSeconds: number = Date.now() / 1000): Session | null {
  const token = storage()?.getItem(TOKEN_KEY) ?? null;
  const claims = token === null ? null : readClaims(token);
  if (token === null || claims === null || claims.exp - EXPIRY_MARGIN_SECONDS <= nowSeconds) return null;
  return { accessToken: token, claims };
}

export function forgetSession(): void {
  storage()?.removeItem(TOKEN_KEY);
}

export function signOut(config: AdminConfig): void {
  forgetSession();
  window.location.assign(logoutUrl(config, window.location.origin));
}
