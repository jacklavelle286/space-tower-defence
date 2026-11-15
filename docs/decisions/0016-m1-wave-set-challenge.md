# 0016. The Milestone 1 wave set is a two-wave CHALLENGE
Status: Accepted · Date: 2026-11-15

Context: M1 has one phonics activity and one clip ([B §B3.2](../plan/B-scope-and-decisions.md#b32-side-by-side)). With the
no-repeat rule, one activity fills exactly one slot, so the wave set has one activity interval and no `meteorAfter` (two
waves, slot `N-001`). The state machine handles that in either mode; the mode decides which ops M1 must build
([F §3.7](../plan/F-state-and-data.md#37-the-milestone-1-wave-set-data-view)). Choice J-1 in
[J, M1](../plan/J-execution-backlog.md#m1--thin-vertical-slice-one-planet-two-waves-one-activity-with-play-cloud-save).

Decision: the M1 wave set `first-contact` in `luna-1-c1` is `mode = CHALLENGE`, waves `[1, 2]`, `meteorAfter: []`, one class
(`nova`), 150 start credits, colony health 20. Completing wave 2 sets `status = COMPLETED` directly: no `COMPLETION_OFFER`,
no `FINISH_RUN`, no endless offer. No `PROFILE` write on `COMPLETE_WAVE` in M1 (best wave is CAMPAIGN-only, M2-06; challenge
badges arrive with M4-04). Selection uses the labelled M1 configuration: thresholds 1, and the endless subject fallback so
the phonics activity can fill `N-001`, which the subject rotation makes a maths slot (N-7, C24.6).

Alternatives: `CAMPAIGN` (needs `FINISH_RUN`, an offer screen and a `CHOOSE_ENDLESS` that would meet an empty bank, for no
M1 benefit); a longer wave set (one activity cannot fill a second slot).

Consequences: M1 builds `SAVE_PREP`, `START_WAVE`, `COMPLETE_WAVE`, `SUBMIT_ATTEMPT`, `DEFEAT` only (`ABANDON` UI is M2-06).
The subject fallback is milestone configuration and must be switched off for authored slots in M3-07 (Phase 42); a run
created under it keeps its pinned slot plan. Every run of this set can end (COMPLETED or DEFEATED) within two waves, so the E2E-D
journey plays its run to the end and test runs do not pile up against the five-open-runs limit.

Evidence: **[VERIFIED]** `game-data/campaign/luna-1-c1.json` (`waveSets.first-contact`); the CHALLENGE branch in
`web/game-core/src/rules/reducer.ts` and the Python mirror, with fixtures `contracts/fixtures/ops/m1-*.json`; the
fallback in `api/shared/selection/plan.py` (`M1_CONFIG`). **[VERIFIED]** locally on 2026-11-15: the dev backend run of
`web/player/e2e/deployed` helpers reached "Challenge complete!" after wave 2. **[UNVERIFIED]** on production until the
owner runs `cd web/player && npx playwright test e2e/deployed/journey.spec.ts` after the Gate D release: its last steps
must show the end screen and, on reopening the run, its final screen (RUN_TERMINAL, confirmed by the owner at Gate C).
