# 0002. Two Cognito user pools with managed login and PKCE
Status: Accepted · Date: 2026-11-14

Context: Children sign in with a username and password only (no e-mail); one operator administers content. The two groups need
different sign-up, MFA and recovery rules, and an admin route must stay out of reach of a player token.
See [spine S1](../plan/00-spine.md#s1-system-shape) and [E §E.7](../plan/E-architecture.md#e7-authentication-and-authorisation);
owner decision D-10 and the N-8 contingency.

Decision:
- Two user pools: players (self sign-up, auto-confirmed within a daily cap) and operators (AdminCreateUser only, TOTP MFA, group `admin`).
- Both use Cognito managed login with authorisation code + PKCE and public clients.
- The API accepts access tokens only; identity is the access-token `sub`.
- Profile data (nickname, avatar, date of birth) is never a Cognito attribute.
- Contingent on the auth spike (M0-10): if managed login cannot do username-only, auto-confirmed sign-up, the owner is asked to
  approve a fallback (N-8). Until then this decision stands as written.

Alternatives:
- One pool with an `admin` group: player and operator share sign-up, MFA and recovery policy, and a mistaken group grant is the only barrier.
- In-app SRP sign-in form: a deviation from the spec's PKCE requirement; only with the owner's approval if the spike fails (N-8).
- Profile data in custom Cognito attributes: attributes leak into ID tokens.
- Optional MFA for the operator: a stolen operator password alone would allow publishing content to children.

Consequences:
- Easier: the operator authoriser rejects a player token at the gateway even if a handler forgot its group check; operator MFA needs no app code.
- Harder: two pools, two app clients, two login domains to manage in Terraform.
- Must be true: handlers check `token_use = access` and the exact `admin` group; the auth spike result is recorded in ADR-0012.

Evidence: [B §B6](../plan/B-scope-and-decisions.md#b6-owner-decisions-d-1-to-d-13-o-1-to-o-4) D-10;
[B §B4](../plan/B-scope-and-decisions.md#b4-where-this-plan-narrows-or-reinterprets-the-spec) N-8;
[B §B5.2](../plan/B-scope-and-decisions.md#b52-identity-and-privacy) I-01, I-02, I-06, I-08;
[E §E.7.5](../plan/E-architecture.md#e75-main-risk-managed-login-sign-up);
[sources/05-cognito-auth.md](../plan/sources/05-cognito-auth.md).
