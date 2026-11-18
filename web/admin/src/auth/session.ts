// The browser side of sign-in (ADR-0023, ADR-0042): where the PKCE verifier and the tokens live, renewal, and the
// redirects.
//
// Storage:
// - the access token: sessionStorage (this tab). The API takes the access token only (E.7.1). The ID token is not kept.
// - the refresh token: localStorage when the operator ticked "Trust this browser", so every tab and every restart of
//   this browser renews without a sign-in; otherwise sessionStorage, so it goes when the tab closes.
// Renewal: when the 60-minute access token is near expiry, the refresh token buys a new one at /oauth2/token. Rotation
// is on for operators, so each renewal also returns a new refresh token; the refresh window still ends 30 days after
// the sign-in with password and authenticator code (Cognito: rotation "doesn't extend the window"). After that, or
// after Sign out, the operator signs in with both again. Cognito's own "remember this device" is not available with
// managed login, so trusting this browser means keeping the refresh token here.

import type { AdminConfig } from "../config";
import {
  CALLBACK_PATH,
  authorizeUrl,
  codeChallenge,
  logoutUrl,
  randomToken,
  readCallback,
  readClaims,
  refreshRequestBody,
  revokeRequestBody,
  tokenRequestBody,
  type AccessClaims,
} from "./pkce";

const PENDING_KEY = "scd-admin-pkce";
const TOKEN_KEY = "scd-admin-token";
const REFRESH_KEY = "scd-admin-refresh";
/** "1" while this browser is trusted: ticks the box again when the 30 days run out. Removed by Sign out. */
const TRUSTED_KEY = "scd-admin-trusted";
const RENEW_LOCK = "scd-admin-renew";
const EXPIRY_MARGIN_SECONDS = 60;
/** Must match refresh_token_validity_days on the operator pool's client (infrastructure/main/main.tf). */
export const TRUST_DAYS = 30;

export type Session = { readonly accessToken: string; readonly claims: AccessClaims };

function tabStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // blocked storage: sign-in still works for this page load only
  }
}

function browserStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const FORM = { "Content-Type": "application/x-www-form-urlencoded" };

/** Whether the last sign-in in this browser trusted it (the sign-in page ticks the box again). */
export function trustsThisBrowser(): boolean {
  return browserStore()?.getItem(TRUSTED_KEY) === "1";
}

export async function startSignIn(config: AdminConfig, trust = false): Promise<void> {
  const verifier = randomToken();
  const state = randomToken();
  tabStore()?.setItem(PENDING_KEY, JSON.stringify({ verifier, state, trust }));
  window.location.assign(authorizeUrl(config, window.location.origin, await codeChallenge(verifier), state));
}

export function isCallback(): boolean {
  return window.location.pathname === CALLBACK_PATH;
}

function keepRefreshToken(refreshToken: string, trust: boolean): void {
  const tab = tabStore();
  const browser = browserStore();
  if (trust && browser !== null) {
    browser.setItem(REFRESH_KEY, refreshToken);
    browser.setItem(TRUSTED_KEY, "1");
    tab?.removeItem(REFRESH_KEY);
  } else {
    tab?.setItem(REFRESH_KEY, refreshToken);
    browser?.removeItem(REFRESH_KEY); // not trusted this time: nothing stays behind in this browser
    browser?.removeItem(TRUSTED_KEY);
  }
}

/** Finish the redirect: swap the code for tokens, keep the access and refresh tokens, and return to "/". */
export async function completeSignIn(config: AdminConfig, fetchFn: typeof fetch = fetch): Promise<Session> {
  const search = window.location.search; // read before the address bar is cleaned below
  const store = tabStore();
  const pendingRaw = store?.getItem(PENDING_KEY) ?? null;
  store?.removeItem(PENDING_KEY); // single use, whatever happens next
  window.history.replaceState(null, "", "/"); // the code must not stay in the address bar or history
  const pending = pendingRaw === null ? null : (JSON.parse(pendingRaw) as { verifier?: unknown; state?: unknown; trust?: unknown });
  const expected = typeof pending?.state === "string" ? pending.state : null;
  const result = readCallback(search, expected);
  if (!result.ok || typeof pending?.verifier !== "string") {
    throw new Error(result.ok ? "Sign-in was started in another tab. Try again." : `Sign-in did not complete (${result.reason}).`);
  }
  const response = await fetchFn(`https://${config.authDomain}/oauth2/token`, {
    method: "POST",
    headers: FORM,
    body: tokenRequestBody(config, window.location.origin, result.code, pending.verifier),
  });
  if (!response.ok) throw new Error(`Sign-in did not complete (token HTTP ${response.status}).`);
  const tokens = (await response.json()) as { access_token?: unknown; refresh_token?: unknown };
  const token = typeof tokens.access_token === "string" ? tokens.access_token : "";
  const claims = readClaims(token);
  if (claims === null) throw new Error("Sign-in did not complete (unreadable token).");
  store?.setItem(TOKEN_KEY, token);
  if (typeof tokens.refresh_token === "string") keepRefreshToken(tokens.refresh_token, pending.trust === true);
  return { accessToken: token, claims };
}

/** The stored session, or null when there is none or it is about to expire. */
export function currentSession(nowSeconds: number = Date.now() / 1000): Session | null {
  const token = tabStore()?.getItem(TOKEN_KEY) ?? null;
  const claims = token === null ? null : readClaims(token);
  if (token === null || claims === null || claims.exp - EXPIRY_MARGIN_SECONDS <= nowSeconds) return null;
  return { accessToken: token, claims };
}

/** This tab's refresh token first (an untrusted sign-in), then this browser's (a trusted one). */
function heldRefreshToken(): { readonly token: string; readonly store: Storage } | null {
  for (const store of [tabStore(), browserStore()]) {
    const token = store?.getItem(REFRESH_KEY) ?? null;
    if (store !== null && token !== null) return { token, store };
  }
  return null;
}

/**
 * Renew the access token with the refresh token. Returns null when there is nothing to renew with or Cognito refuses
 * it (expired, revoked): the operator signs in again. Throws when Cognito cannot be reached, keeping the refresh token
 * for the next try. Tabs take turns (Web Locks), so two tabs never spend the same rotating refresh token at once.
 */
export async function renewSession(config: AdminConfig, fetchFn: typeof fetch = fetch): Promise<Session | null> {
  const renew = async (): Promise<Session | null> => {
    const held = heldRefreshToken(); // read inside the lock: another tab may just have rotated it
    if (held === null) return null;
    let response: Response;
    try {
      response = await fetchFn(`https://${config.authDomain}/oauth2/token`, {
        method: "POST",
        headers: FORM,
        body: refreshRequestBody(config, held.token),
      });
    } catch {
      throw new Error("The sign-in service could not be reached. Check the internet and try again.");
    }
    if (response.status === 400 || response.status === 401) {
      held.store.removeItem(REFRESH_KEY); // invalid_grant: expired or revoked
      return null;
    }
    if (!response.ok) throw new Error(`Sign-in could not be renewed (token HTTP ${response.status}).`);
    const tokens = (await response.json()) as { access_token?: unknown; refresh_token?: unknown };
    const token = typeof tokens.access_token === "string" ? tokens.access_token : "";
    const claims = readClaims(token);
    if (claims === null) return null;
    tabStore()?.setItem(TOKEN_KEY, token);
    if (typeof tokens.refresh_token === "string") held.store.setItem(REFRESH_KEY, tokens.refresh_token);
    return { accessToken: token, claims };
  };
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  return locks === undefined ? renew() : locks.request(RENEW_LOCK, renew);
}

/** A session good for at least another minute: the stored one, or a renewed one. Null means sign in again. */
export async function freshSession(config: AdminConfig, fetchFn: typeof fetch = fetch): Promise<Session | null> {
  return currentSession() ?? renewSession(config, fetchFn);
}

/** Drop this tab's tokens and the refresh token (the server refused the token). The trust tick stays. */
export function forgetSession(): void {
  tabStore()?.removeItem(TOKEN_KEY);
  tabStore()?.removeItem(REFRESH_KEY);
  browserStore()?.removeItem(REFRESH_KEY);
}

/** Sign out: revoke the refresh token, stop trusting this browser, and clear Cognito's sign-in cookie. */
export function signOut(config: AdminConfig, fetchFn: typeof fetch = fetch): void {
  const held = heldRefreshToken();
  if (held !== null) {
    // keepalive: the request still goes out while the page leaves for /logout.
    fetchFn(`https://${config.authDomain}/oauth2/revoke`, { method: "POST", headers: FORM, body: revokeRequestBody(config, held.token), keepalive: true }).catch(
      () => undefined,
    );
  }
  forgetSession();
  browserStore()?.removeItem(TRUSTED_KEY);
  window.location.assign(logoutUrl(config, window.location.origin));
}
