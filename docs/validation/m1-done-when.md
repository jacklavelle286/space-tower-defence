# Milestone 1: "done when" on production

The [B §B3.2](../plan/B-scope-and-decisions.md#b32-side-by-side) "Done when" row, plus the
[J M1-24](../plan/J-execution-backlog.md) and Phase 23 exit criteria, as a list the owner walks on the real hostname. A
row is done when it has an observation (date, release ID, what was seen), not when a build passes. Walking it on a
`*.cloudfront.net` name does not count (Phase 23 risk).

Status: **not started**. Every row below is **[UNVERIFIED]** until filled.

## Before the walk

| # | Precondition | How to check | Done (date, by) |
|---|---|---|---|
| 0.1 | The release carrying Phases 20–23 is live | `curl -s https://aliens.jackgl.com/config.json` shows that `releaseId`; its entry is in [docs/releases/](../releases/) | |
| 0.2 | The seed is loaded (owner, [Local AWS writes](../build-phases.md#local-aws-writes-that-are-not-deployments)) | `scripts/seed_content.py` reports `ph-0102` and `phoneme-sh` created; a second run reports "skipped, exists" | |
| 0.3 | The clip is previewed, played and approved on `admin.aliens.jackgl.com`; the activity validated and published | The approved speech version shows the same `clipKey` as the preview; `ph-0102` shows Published | |
| 0.4 | `test-player-1` and `test-player-2` passwords are in your shell only | [e2e README](../../web/player/e2e/deployed/README.md), "Run" | |

## The B3.2 list

| # | Done when | Walk it like this (on `https://aliens.jackgl.com`, signed in as `test-player-1`) | Automated check | Observation (date, release, what you saw) |
|---|---|---|---|---|
| 1 | A clip plays through the real speech service | New game, place Novas, Ready!, clear wave 1. In the learning panel press Play: you hear /sh/. In DevTools → Network: `POST /api/speech` 200 on every press; the audio plays at once from stored bytes. Then DevTools → Network → throttling "Slow 4G", press Play again: the sound starts before the `POST /api/speech` row finishes, and the row is still there | `journey.spec.ts` steps "Play: …" (audio from a `blob:` URL, `POST /api/speech` 200, zero `speechSynthesis` calls) and "slow network: …" (speech response held back 3 s by `page.route`; audio starts first; request sent, 200) | |
| 1b | Each Play reached the `tts` function (AC-19, log half) | The journey prints `requestId <id>` for each press. For two of them, read-only: `aws logs filter-log-events --profile space-tower-defence --region eu-west-2 --log-group-name /aws/lambda/space-tower-defence-prod-eu-west-2-tts --filter-pattern '"<id>"'` finds one line with that `requestId` and status 200 | none (owner; the test prints the IDs) | |
| 2 | Three attempts and one reward work | Choose a wrong answer, Check: "Not quite. Have another go.", "Tries left: 2", the option says "tried". Wrong again: "Tries left: 1". Right: "You got it!" and one "+30 space credits" line; after Continue the credits go up by that amount, once | steps "attempt 1/2/3" and "Continue: credits up by the reward" | |
| 3 | A refresh keeps the attempts | After the first wrong answer press F5: the same question, the same option order, the tried option still "tried", "Tries left: 2". After the second wrong answer F5 again: both wrong options "tried" (greyed), "Tries left: 1". After the reward, F5 again: no panel, credits unchanged | steps "refresh keeps the attempt", "refresh after two wrong answers", "refresh again" | |
| 4 | Leaving and returning resumes from the cloud save | At wave 2's Ready!, note the credits, press Save and exit. Open a private window (no local state), sign in, Home shows Continue, Wave 2. Continue: same wave, same credits | step "a fresh browser signs in and continues the same run from the cloud save" | |
| 5 | Playtest P1 recorded | [playtests/P1.md](playtests/P1.md) filled, no names | none (owner) | |

## Also in the Phase 23 exit criteria

| # | Item | Where | Observation |
|---|---|---|---|
| 6 | The run ends and reopening it shows its final screen (RUN_TERMINAL, owner decision at Gate C) | `journey.spec.ts` last steps; by hand: open `/play/<runId>` of a finished run | |
| 7 | Two browsers on one account: the second is told "You're already playing on …" until the first saves and exits | `sessions.spec.ts` (AC-28, M1 fence) | |
| 8 | Sign out, then the next child signs in: the password is asked again, nothing of the first child shows | `sessions.spec.ts` (AC-05 basic) | |
| 9 | Release entry written | [docs/releases/](../releases/) | |
| 10 | Speech latency rows recorded | [performance/speech-latency.md](performance/speech-latency.md) | |
| 11 | One-clip browser rows recorded | [browsers.md](browsers.md) | |
| 12 | ADR-0016, 0017, 0018 move to Accepted at the gate | [decisions/](../decisions/README.md) | |

## E2E-D run record

One row per run of `cd web/player && npx playwright test e2e/deployed`.

| Date | Release ID | Browser (`E2E_BROWSER`) | Result (passed / failed, which step) | Run ID printed | Notes |
|---|---|---|---|---|---|
| | | | | | |
