# Authoriser event fixtures

Real HTTP API (payload 2.0) events as a Lambda behind a Cognito JWT authoriser receives them, captured by the auth spike
(M0-10, build Phase 5) and replayed by the router tests from Phase 7.

Nothing is here yet. The files land after the owner runs the spike ([spikes/auth-cognito/README.md](../../../../spikes/auth-cognito/README.md)):

| File | Written by | Token from |
|---|---|---|
| `player-event.json` | `check.py --client player` (default scopes) | player pool, client with `scd-spike/play` |
| `operator-event.json` | `check.py --client operator` | operator pool, user in groups `admin` and `admin-extra`, client with `scd-spike/admin` |

Redaction (done twice: by the spike's API function and again by `check.py` before writing): the `Authorization` and
`Cookie` headers and any `cookies` become `<redacted>`; `requestContext.http.sourceIp` and the `x-forwarded-for`,
`forwarded` and `x-real-ip` headers become `203.0.113.10` (documentation range); the claims `jti`, `origin_jti` and
`event_id` become `<redacted>`. `check.py` refuses to write a file that contains anything shaped like a token. Usernames are made-up test names; pool and client IDs belong to the
destroyed spike stack.

What the router depends on, recorded in [ADR-0012](../../../../docs/decisions/0012-auth-spike.md): the shape of
`requestContext.authorizer.jwt.claims["cognito:groups"]` (list or bracketed string) and of
`requestContext.authorizer.jwt.scopes`. The spike's scope names (`scd-spike/*`) differ from production's (`game/play`,
`ops/content`); tests that need production names rewrite them.
