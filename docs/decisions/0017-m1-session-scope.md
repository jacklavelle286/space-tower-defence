# 0017. Milestone 1 session scope: full server fence, a thin client
Status: Proposed · Date: 2026-11-15

Context: The account-wide play-session lease ([ADR-0008](0008-play-session-lease.md)) fences every op. Takeover, divergence
and offline belong to M5, but generation stamping cannot be added later without changing how queued ops are stored
([F §5.6](../plan/F-state-and-data.md#56-what-milestone-1-needs)). Choice J-2 in
[J, M1](../plan/J-execution-backlog.md#m1--thin-vertical-slice-one-planet-two-waves-one-activity-with-play-cloud-save).

Decision: from M1 the server side is complete: the `SESSION` item, claim / renew / release, the fence in every ops
transaction and the claim inside `CREATE_RUN` (Phases 16–17). The client stamps every op with the generation current when
it was queued, sends through one serial queue (never two `/ops` in flight), renews every 60 s while visible and recently
used, releases after the queue on Save and exit and on sign-out, and shows plain messages for the session 409s:
"You're already playing on …" (`ACTIVE_SESSION_ELSEWHERE`), "This game was continued somewhere else." (`STALE_SESSION`, never
followed by a silent re-claim). Divergence options, the recovery panel and offline play wait for M5 (Phases 58–61).

Deviation to note: M1 already shows the D7.3 takeover question ("This game may have unsaved progress on …. Play here
instead?") for `TAKEOVER_CONFIRM_REQUIRED`, from Home's New game and from entering a run (Phase 22), because the server
returns that code from M1 and a plain message would leave a lapsed lease with no way back in. Phase 61 refines its timing.

Alternatives: client without stamping (stored ops would change shape in M5); the full M5 client now (offline and
divergence need the local database, Phase 57).

Consequences: a second browser on one account is kept out until the first saves and exits or its lease lapses. A stale
client stops instead of overwriting. `GET /api/me` is sent without `?sessionId=`, so Home counts any live lease, the
player's own included, as "playing on …" (G §3 R1 [ASSUMPTION]); harmless after Save and exit, which releases.

Evidence: **[VERIFIED]** in code and tests: `api/functions/player_api/` claim matrix and race tests (Phases 16–17),
`web/player/src/sync/queue.ts` (`queue.test.ts`), `web/player/src/run/lease.ts`, `RunScreen.tsx` `enterRun`.
**[UNVERIFIED]** on production until the owner runs `cd web/player && npx playwright test e2e/deployed/sessions.spec.ts`
after the Gate D release: the second browser must show "You're already playing on …" and get in after the first saves
and exits (AC-28, M1 fence).
