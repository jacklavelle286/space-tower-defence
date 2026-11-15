import type { TokenSource } from "@scd/shared";

/** What the shell needs from sign-in: the real one is Amplify (amplifyAuth.ts), local development uses a fake. */
export interface AuthPort extends TokenSource {
  /** Full-page redirect to managed login: `sign-up` opens its sign-up page, `sign-in` its sign-in page. */
  signIn(mode: "sign-in" | "sign-up"): Promise<void>;
  /** Clears this browser's tokens and goes through Cognito /logout back to `/` (a fresh page load, E.7.4 point 3). */
  signOut(): Promise<void>;
  /**
   * True when a `storage` event key belongs to the auth library's token entries (another tab signed in, refreshed or
   * signed out). The identity guard re-checks the account when it sees one.
   */
  isTokenStorageKey(key: string | null): boolean;
}
