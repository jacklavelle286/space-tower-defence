# 0003. Four Python Lambdas, one role each, no Lambda calls another
Status: Accepted · Date: 2026-11-14

Context: The spec asks for a small number of cohesive Python Lambda boundaries for player/run operations, content administration
and dedicated speech, and for no Lambda that merely forwards to another. The split should follow data ownership and IAM blast radius.
See [spine S1](../plan/00-spine.md#s1-system-shape) and [E §E.6](../plan/E-architecture.md#e6-lambda-and-api-boundaries).

Decision:
- Four Python arm64 zip Lambdas, each with its own IAM role:
  - `player-api`: every write to player records.
  - `admin-api`: the only writer of `content`; never touches `game`.
  - `tts`: the dedicated speech service; the only role with Polly and clip `PutObject`; never writes DynamoDB, no `content` access.
  - `cognito-presignup`: the pre sign-up trigger; may update only `SYS#SIGNUPS`.
- No Lambda calls another. Shared logic is the `api/shared/` package bundled into each zip, not a network call.
- API-facing timeouts stay under the 30 s HTTP API integration limit (`player-api` 25 s).

Alternatives:
- One function per route: more functions and roles, with the fence and ownership logic duplicated.
- Splitting `player-api` further (profile, runs, session): duplicates the fence and needs cross-function calls.
- A shared role: loses the per-function blast radius.
- Container images (as in the reference): need Docker and ECR for small dependencies.
- Chained Lambda calls: forbidden by the spec; stack cold starts and timeouts inside 30 s; widen IAM with `lambda:InvokeFunction`.

Consequences:
- Easier: each role describes everything its function can do; one request is one function, one log stream, one error code.
- Harder: `tts` reads the slot item itself (`GetItem`) instead of asking `player-api`; `admin-api` cannot ask `tts` to synthesise.
- Must be true: per-function IAM matches the "Data access" column in spine S1.

Evidence: [B §B5.1](../plan/B-scope-and-decisions.md#b51-hosting-api-and-compute) E-06, E-07, E-08;
[E §E.6.2](../plan/E-architecture.md#e62-why-no-lambda-calls-another);
[E §E.6.4](../plan/E-architecture.md#e64-per-function-iam).
