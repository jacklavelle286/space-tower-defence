# 0023. Admin sign-in: hand-written code + PKCE, tokens in sessionStorage, no refresh
Status: Accepted · Date: 2026-11-15 · Amended by [ADR-0042](0042-admin-trusted-browser.md) (refresh and a trusted browser)

Context: Phase 20 (M1-19) needs operator sign-in on `admin.aliens.jackgl.com`: managed login, authorisation code + PKCE,
the operator pool's client and the admin callback ([E §E.7.1–E.7.2](../plan/E-architecture.md#e71-design-summary), ADR-0002).
E.7.1 proposes `aws-amplify` v6 as the browser library for both apps. ADR-0012 check 17 found that Amplify keeps tokens in
`localStorage`. Operator refresh-token rotation is on, and whether Cognito's refresh paths work with it is unverified (U-058).

Decision: the admin app does the code flow itself in about 150 lines (`web/admin/src/auth/`): a random verifier and state
per sign-in, S256 challenge, `/oauth2/authorize` with `scope=openid ops/content`, the token exchange with `fetch` (no
secret), and Cognito `/logout` on sign-out. Only the access token is kept, in `sessionStorage` (this tab only, gone when it
closes). There is no refresh: when the 60-minute access token is near expiry the page asks the operator to sign in again.
Claims are read only to show the username and the "not authorised" screen; the gateway verifies the token and admin-api
checks the `admin` group (E.7.3). The player app keeps Amplify as E.7.1 says (Phase 21).

Alternatives: Amplify in the admin too: consistent with the player, but tokens in `localStorage` unless storage is swapped,
a much larger bundle, and its refresh path depends on U-058. A generic OIDC library: another dependency for one flow.

Consequences: no new dependency in the admin bundle; an operator signs in again every hour (with TOTP), which suits short
review sessions. The PKCE helpers are pure and tested against RFC 7636's vector. If the player's Amplify setup later proves
simpler to share, this ADR is superseded and the admin moves over.

Evidence: `web/admin/src/auth/pkce.test.ts`; `npm run build -w admin` (one 245 kB script, no Phaser); E.7.1, ADR-0012
checks 15 and 17.
