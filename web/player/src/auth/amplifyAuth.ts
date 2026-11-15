import { Amplify } from "aws-amplify";
// Importing signInWithRedirect also registers the library's OAuth listener (its module imports
// enable-oauth-listener, a declared side effect): with Amplify.configure below, it completes the code exchange when the
// page loads at /auth/callback?code=…&state=…, using the PKCE verifier it stored before the redirect.
import { fetchAuthSession, signInWithRedirect, signOut } from "aws-amplify/auth";
import type { PlayerConfig } from "../config";
import type { AuthPort } from "./types";

/** The managed-login callback and sign-out return paths, as registered on the app client (infrastructure/main/main.tf). */
export const CALLBACK_PATH = "/auth/callback";
export const SIGNED_OUT_PATH = "/";

/**
 * Sign-in through Cognito managed login with the authorisation-code flow and PKCE (E.7.2), configured by hand from
 * config.json (sources/05 §8). Only `aws-amplify/auth` is used.
 *
 * Token storage: the library's default, `localStorage`, under `CognitoIdentityServiceProvider.<clientId>.*` (ADR-0012
 * check 17). The plan accepts this so a reload keeps the child signed in, with a strict CSP and no third-party scripts
 * as the guard (sources/05 §8, E.3, E.10). This app writes nothing else to `localStorage`.
 *
 * Refresh: the library refreshes an expired access token inside `fetchAuthSession`, deduplicating concurrent refreshes
 * in this tab; rotation is off for players, so two tabs refreshing at once cannot invalidate each other (E.7.1).
 */
export function createAmplifyAuth(config: PlayerConfig, origin: string = window.location.origin): AuthPort {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: config.userPoolId,
        userPoolClientId: config.clientId,
        loginWith: {
          username: true,
          oauth: {
            domain: config.authDomain,
            scopes: ["openid", config.scope],
            redirectSignIn: [`${origin}${CALLBACK_PATH}`],
            redirectSignOut: [`${origin}${SIGNED_OUT_PATH}`],
            responseType: "code",
          },
        },
      },
    },
  });
  const keyPrefix = `CognitoIdentityServiceProvider.${config.clientId}.`;

  return {
    async accessToken({ forceRefresh }) {
      const session = await fetchAuthSession({ forceRefresh });
      return session.tokens?.accessToken?.toString() ?? null;
    },
    async signIn(mode) {
      await signInWithRedirect({
        options: {
          // prompt=login: always ask for the password, even inside the one-hour managed-login cookie left by a
          // sibling (E.7.2, sources/05 §7 item 6).
          prompt: "LOGIN",
          // "I'm new" opens managed login's /signup page, which takes the same parameters as /oauth2/authorize,
          // PKCE included (D4 P1; the Phase 5 spike signed up this way, ADR-0012 check 1).
          ...(mode === "sign-up"
            ? {
                authSessionOpener: async (url: string) => {
                  window.location.href = url.replace("/oauth2/authorize?", "/signup?");
                },
              }
            : {}),
        },
      });
    },
    async signOut() {
      // With OAuth configured this clears the tokens, then navigates to <authDomain>/logout?client_id=…&logout_uri=…
      await signOut();
    },
    isTokenStorageKey(key) {
      return key === null || key.startsWith(keyPrefix);
    },
  };
}
