# 0042. Admin stays signed in on a trusted browser: 30-day refresh, silent renewal
Status: Proposed · Date: 2026-11-18

Context: the owner asked (2026-11-18) for a much longer admin sign-in and to trust one browser so the authenticator code
is not asked every time. ADR-0023 kept only the 60-minute access token, so the operator typed the password and the TOTP
code about every hour (Cognito's one-hour login cookie aside), and the operator refresh token lasted 1 day (E.7.1).
Cognito's "remember this device", which skips MFA on a known device, is not available here: "managed login ... doesn't
offer to remember devices" (AWS developer guide, device tracking) **[VERIFIED]**, and this admin signs in through managed
login (ADR-0002, ADR-0023).

Decision: the operator client's refresh token lasts 30 days (`refresh_token_validity_days = 30`; rotation stays on;
revocation stays on; flows stay `ALLOW_USER_SRP_AUTH` only). The admin keeps the refresh token and renews the access token
at `/oauth2/token` when it is within a minute of expiry, before each request and on opening. The sign-in page has a tick
box, "Trust this browser for 30 days": ticked, the refresh token is kept in `localStorage`, so every tab and restart of
that browser stays signed in; unticked, it is kept in `sessionStorage` and goes with the tab. Tabs renew one at a time
(Web Locks), so two tabs never spend the same rotating token. Sign out revokes the refresh token at `/oauth2/revoke`,
clears both stores, stops trusting the browser and goes to Cognito `/logout`. The window is counted from the sign-in and
rotation "doesn't extend" it (AWS docs) **[VERIFIED]**, so every 30 days the password and TOTP code are typed again.

Alternatives: device remembering through the Cognito SDK flows (`USER_SRP_AUTH` + `DEVICE_SRP_AUTH`) with an app-built
sign-in page: much more code, our own password and MFA screens, and a bigger attack surface. A longer window (up to
3650 days): fewer sign-ins, but a stolen token lasts longer. Passkeys: a separate change.

Consequences: script running on the admin origin could read a trusted browser's refresh token; the CSP is still
Report-Only (main.tf), so an XSS would not be blocked. Mitigations: no third-party scripts, Sign out and
`AdminUserGlobalSignOut` (runbook) revoke it, and the box says to tick it only on the owner's own computer, never one
the children use. A renewal Cognito refuses (400) drops the token and shows Sign in; an unreachable Cognito keeps it.
Amends ADR-0023 (no refresh, `sessionStorage` only) and E.7.1's operator refresh lifetime (1 day).

Evidence: `web/admin/src/auth/session.test.ts`, `web/admin/src/App.test.tsx` ("staying signed in");
`terraform validate`. **[UNVERIFIED]** live (U-058): the first renewal after this release, an hour after signing in,
needs no sign-in; check by leaving the admin open for over an hour, then saving something.
