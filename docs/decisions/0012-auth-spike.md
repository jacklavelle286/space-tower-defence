# 0012. Auth spike results: managed login works for the player pool
Status: Proposed · Date: 2026-11-15 (player runs P1–P7 done; the rest deferred by the owner)

Context: Phase 8 builds both Cognito pools. Managed-login sign-up for a username-only pool that auto-confirms through a pre
sign-up trigger is undocumented **[UNVERIFIED]** ([E §E.7.5](../plan/E-architecture.md#e75-main-risk-managed-login-sign-up)); if it
fails, the owner decides the N-8 fallback ([B §B4](../plan/B-scope-and-decisions.md#b4-where-this-plan-narrows-or-reinterprets-the-spec)).
D-10 (two pools) is already accepted. M0-10 checks this on the throwaway stack [spikes/auth-cognito/](../../spikes/auth-cognito/)
(applied and destroyed by `spike.yml`, ADR-0020); runs P1–P11 and O1–O2 are in its [README](../../spikes/auth-cognito/README.md).

| # | Check (source) | How | Result | Evidence |
|---|---|---|---|---|
| 1 | Username + password sign-up on managed login, auto-confirmed, no e-mail (M0-10, E.7.5) | P1, P2 `--signup` | **Works** [VERIFIED]: sign-up with username + password only, no e-mail or code, account confirmed and signed in at once (P1, P2). **N-8 fallback not needed.** | screenshots of form and after-submit |
| 2 | Usernames case-insensitive (M0-10) | P3: sign in lower case | **Yes** [VERIFIED]: `SpikeChild1` stored and returned as `spikechild1`; lower-case sign-in reaches the same `sub` (P3) | `results/player-case-*.json` |
| 3 | No "Forgot your password?" with `admin_only` (sources/05 §12.2) | Look at the sign-in page | **No link** [VERIFIED] (owner observed on the sign-in page) | owner note |
| 4 | How managed login shows the trigger's raised message (M0-10) | Cap 0, re-apply, sign-up | Deferred to Phase 8 (M1-05) by the owner, 2026-11-15 | screenshot |
| 5 | Access-token claims: `iss`, `client_id`, no `aud`, `sub`, `token_use`, `scope`, `username`, `cognito:groups` (M0-10) | Every run | Player pool [VERIFIED]: `iss` = pool, `client_id`, **no `aud`**, `sub`, `token_use: access`, `scope: openid scd-spike/play`, `username` (lower case), `amr`; `cognito:groups` absent for an ungrouped user. Operator claims deferred to Phase 8 | `results/*.json` |
| 6 | ID token carries no profile data (sources/05 §12.3) | Every run | **No profile data** [VERIFIED]: ID token has only `acr amr at_hash aud auth_time cognito:username event_id exp iat iss jti origin_jti sub token_use` | `results/*.json` |
| 7 | `cognito:groups` and `scopes` shapes in the payload 2.0 authoriser event, with two groups (`admin`, `admin-extra`: separator and whole-name match) (M0-10, E.7.3) | P3, O1 | Deferred to Phase 8 (operator not run). Seen on the player side: list claims reach the Lambda **flattened to strings** (`amr` arrives as `"[pwd]"`, not a list) [VERIFIED]; expect `cognito:groups` the same — Phase 7's router must parse it | `api/tests/fixtures/authorizer/*-event.json` |
| 8 | No token, ID token, other pool's token, expired token: status, body and `www-authenticate` (sources/05 §12.5; U-026) | Every run; P11 (expired) | [VERIFIED]: no token → **401**; other pool's access token → **401** `invalid_token` (key not in JWKS); **ID token → 403** `insufficient_scope` (accepted as a JWT, lacks the scope). Expired token deferred | `results/*.json` `api_calls` |
| 9 | Token without the route scope: 401 or 403 (M0-10, E.7.3) | O2 (same pool, no-scope client); P8 | **403** `insufficient_scope` [VERIFIED via the ID token, which has no scope]; P8/O2 not run | `results/*noscope*`, `*no-scope*` |
| 10 | Refresh keeps scopes: `/oauth2/token` and `GetTokensFromRefreshToken` (M0-10; sources/05 risk 5) | Every run | **Kept** [VERIFIED]: `GetTokensFromRefreshToken` returns the same scopes; the API accepts the refreshed token; no new refresh token (rotation off) | `results/*.json` `refresh` |
| 11 | Shared browser: with/without `/logout` × with/without `prompt=login` (M0-10, E.7.4) | P3–P7 | Runs completed; P4 without `/logout` and without `prompt=login` came back as the previous child (`spikechild1`), P6 as `spikechild2`, P7 after `/logout` as `spikechild1`. Whether a password page was shown was not recorded. Design keeps both `prompt=login` and `/logout` (E.7.4); re-check in Phase 8 | owner notes + printed usernames |
| 12 | Operator: forced new password, TOTP enrolment, group `admin` in the token (M0-10) | O1 | Deferred to Phase 8 (M1-05) | screenshots, `results/operator-*` |
| 13 | Smallest `explicit_auth_flows` for managed login (sources/05 §4.2, §12.9) | SRP + refresh for P/O runs; refresh only after re-apply | Deferred to Phase 8 (M1-05; U-058) | `results/player-narrow-flows-*` |
| 14 | `zoneinfo.ZoneInfo("Europe/London")` on `python3.14` arm64 (M0-10) | `runtime` in any 200 | **Works** [VERIFIED]: Python 3.14.10, `Europe/London` resolves from the runtime's `/usr/share/zoneinfo` (no `tzdata` package needed) | `results/*.json` |
| 15 | Does the browser library verify token signatures? (I §I.2.6) | Read the shipped source | **No** **[VERIFIED]** | below |
| 16 | Managed-login wording for ages 5–7 (E.7.5; sources/05 §12.10) | Optional, child with a parent | Deferred (optional) | owner note |
| 17 | Where the browser library stores tokens (U-030) | Read the shipped source | `localStorage` **[VERIFIED]** | below |
| 18 | Gateway 404 (unmatched route), 429 (burst of 40 past burst 10 / rate 5), function crash, function timeout: status and body (U-027, U-028) | P9 | Deferred to Phase 9 (U-027, U-028) | `results/*probes*` `gateway_probes` |
| 19 | Access token after the user's own `GlobalSignOut`: still accepted by the authoriser until expiry? Refresh refused? (U-031) | P10 | Deferred to Phase 8 (U-031) | `results/*global-sign-out*` |

Not in this spike: `AdminSetUserPassword` and the player-pool forced-change page (register U-059, Phase 8), narrowing client
read/write attributes (Phase 8), the `explicit_auth_flows` that work with refresh-token rotation on (U-058, Phase 8), the
library keeping tokens on a failed offline refresh (Phase 21).

Check 15: `aws-amplify` 6.22.2 (latest on npm, 2026-11-15) uses `@aws-amplify/auth` 6.21.2 and `@aws-amplify/core` 6.19.3.
`decodeJWT` (core `dist/esm/singleton/Auth/utils/index.mjs`) only splits the token into three parts and base64-decodes the
payload; `completeOAuthFlow.mjs` reads tokens through it. Neither package's `dist` mentions `jwks`, `.well-known`,
`subtle.verify` or `importKey`. So E2E-L's crafted unsigned JWTs work, provided they have three dot-separated parts.
Check 17: `CognitoUserPoolsTokenProvider` stores tokens through core's `defaultStorage`, which is `window.localStorage` (an
in-memory store if that throws), under `CognitoIdentityServiceProvider.<clientId>.<username>.{accessToken,idToken,refreshToken}`
plus `….LastAuthUser`; the OAuth PKCE state uses the same storage. `setKeyValueStorage` can swap it (e.g. `sessionStorage`).

Decision: keep managed login for both sign-up and sign-in (spine S1). It does username-only, auto-confirmed sign-up (check 1),
so the N-8 fallbacks are not needed. The API treats 401 and 403 alike as "sign in again" (check 8/9), and the router parses
list claims that arrive as strings (check 7).

Alternatives: N-8 fallback 1 (in-app sign-up form) and fallback 2 (in-app SRP sign-in): both unnecessary now, and both move
password handling into our code.

Consequences: Phase 8 builds the real pools on this shape. Deferred by the owner on 2026-11-15 ("get it built, fix after
launch"), re-checked in Phase 8/9: the cap message (4), operator TOTP and groups (7, 12), smallest auth flows (13), expired
token and gateway errors (8, 18), global sign-out (19), the shared-browser prompt observation (11). Already true: E2E-L can fake sign-in (check 15); Phase 7's group helper still parses a list
or a string until check 7 is in.

Evidence: redacted run results in `spikes/auth-cognito/results/` (P1–P7, 2026-11-15; kept in git until Phase 6 deletes `spikes/`, then in history); fixtures in `api/tests/fixtures/authorizer/`; npm tarballs above.
Register checks run in this phase (M0-14), 2026-11-15, **[VERIFIED]**: U-010, scratch root on Terraform 1.17.2 with an
undeclared key in a `-var-file`: warning "Value for undeclared variable", plan completes. U-018 negative case, scratch root:
`init -lockfile=readonly` exits 1 when the lock lacks a required provider ("lock file is read-only") and when it pins a
version the configuration no longer allows; the lock is not changed. U-019: `aws iam get-role` on the CI role,
`MaxSessionDuration` 3600. U-020: `aws lambda get-account-settings` (eu-west-2), `ConcurrentExecutions` 10, unreserved 10.
U-057: `aws acm list-certificates` (us-east-1), `aliens.jackgl.com` `NotAfter` 2027-06-01.
