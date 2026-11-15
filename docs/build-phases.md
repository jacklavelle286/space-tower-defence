# Build phases

This file cuts the [execution backlog](plan/J-execution-backlog.md) into **sequential build phases**. Claude implements one phase at a
time; you review the code at the end of each phase (the *gate*) and approve it before the next one starts. It is the working order for
the build and supersedes the milestone ordering of [J §J.2](plan/J-execution-backlog.md#j2-milestones-and-dependencies) for execution
purposes. J stays the source for each task's scope, dependencies and "Done when"; this file holds the cut, the owner actions, the review
guide per phase and the gate log. Every J task is delivered by exactly one phase, or split across named phases
([Appendix A](#appendix-a-j-task--phase)).

**Way of working** **[CONFIRMED by owner, 2026-11-14]** (O-4, [spine S0.1](plan/00-spine.md#s01-way-of-working-confirmed-by-owner-2026-11-14)):
Claude builds in sequential phases and you review at each gate; work happens on `main`; Claude or you commit and push; deployment happens
only through GitHub Actions pipelines; the bootstrap root is the one thing you apply locally, with your existing bootstrap script.
The cut itself, the phase sizes and everything below not otherwise labelled are **[PROPOSAL]**.

Labels as in the plan: **[CONFIRMED]** spec · **[CONFIRMED by owner, 2026-11-14]** your chat decisions O-1…O-4 · **[PROPOSAL]** ·
**[ASSUMPTION]** · **[VERIFIED]** (source given) · **[UNVERIFIED]** (how to check given). Paths that exist are links; planned paths are in
backticks and are to be created.

> **Start here: [Phase 0 — Repository hygiene and pipeline trust](#phase-0--repository-hygiene-and-pipeline-trust).**

---

## Overview of all phases

"Owner" lists what only you can do. "Release" means you dispatch `release.yml` and then `apply.yml` in the GitHub UI after approving the
gate; nothing deploys on push.

| # | Phase | M | J tasks | Observable at the gate | Owner |
|---|---|---|---|---|---|
| **0** | **Repository hygiene and pipeline trust** ← start | M0 | M0-01, M0-02, M0-03, M0-05, M0-07 | `oidc-smoke` run prints the assumed-role ARN; ADR-0011 | GitHub env `prod` (and `prod-apply` or B-3 fallback); dispatch smoke; bootstrap apply; confirm local-writes table |
| 1 | Web workspace scaffold and push CI | M0 | M0-08a, M0-08b | Phaser rectangle in a local browser; green CI on push | Run `npm run dev` |
| 2 | Main root, certificate and DNS hand-off | M0/M1 | M0-04, M1-01, M1-02, M1-03 | Certificate `ISSUED` (read-only `describe-certificate`) | CAA/wildcard checks; 2 CNAMEs; dispatch interim pipeline |
| 3 | Static sites and the release pipeline, plan side | M1 | M1-07 (part 1), M1-10 (part 1) | Release run ends at "dispatch apply.yml with plan_run_id" | Dispatch release; read plan |
| 4 | Walking skeleton live | M1 | M1-10 (part 2), M1-11 (part 1) | `https://aliens.jackgl.com` shows the app shell | Dispatch apply; 2 alias records |
| 5 | Spike workflow and auth spike | M0 | M0-15, M0-10, M0-14 | ADR-0012; spike stack destroyed | Dispatch spike runs; sign up in managed login |
| 6 | DynamoDB and browser-audio spikes; spike tooling removed | M0 | M0-13, M0-12, M1-10 (part 3) | Real cancellation fixtures; offline playback notes; `spike.yml` gone | Dispatch spike runs; browser checks |
| 7 | Python API skeleton | M1 | M1-09, M1-12 (part 1), M1-15 (part 1) | `pytest` + `ruff` green locally and in CI; identical zip hashes twice | — |
| 8 | Data, sign-in and functions deployed | M1 | M1-04, M1-05, M1-06 (part 1), M1-10 (part 4) | Test child signs up through managed login; operator signs in with TOTP | Release; operator account; test accounts |
| 9 | Same-origin API live | M1 | M1-06 (part 2), M1-07 (part 2), M1-08, M1-10 (part 5), M1-11 (part 2) | Every route 401 without a token on both hostnames; alarm e-mail | Release; confirm SNS |
| 10 | Fixed-timestep clock | M0 | M0-09 (M0-06 check) | Vitest: 60 steps per second at 30/60/144 Hz | — |
| 11 | Contracts and the TypeScript rules reducer | M1 | M1-12 (part 2), M1-13 | Vitest runs every M1 fixture | — |
| 12 | Python reducer mirror | M1 | M1-14 | pytest runs the same fixtures, same results | — |
| 13 | First game data | M1 | M1-23 | Game-data build + bounds file; G-15 refuses an oversized fixture | — |
| 14 | Battlefield slice (local) | M1 | M1-21 | Two-wave run playable in a local browser | Play it (maybe with the children) |
| 15 | Profile routes | M1 | M1-15 (part 2) | DOB-leak test green; `GET /api/me` with a token after release | Release |
| 16 | Runs and the session lease | M1 | M1-16 | moto tests for create/claim/takeover | — |
| 17 | The ops endpoint | M1 | M1-17 | Replay = `ALREADY_APPLIED`; DynamoDB Local tests green in CI | Release |
| 18 | Polly listening bake-off | M0 | M0-11 | ADR-0014; `content/listening-verdicts.json` | Listening sessions (adult + child) |
| 19 | Speech service | M1 | M1-18 | pytest: one Polly call per input; `sha256` matches | Release |
| 20 | Minimal admin app and seed | M1 | M1-19 | You preview, play and approve the clip on `admin.aliens.jackgl.com` | Release; run seed; approve clip |
| 21 | Player shell | M1 | M1-20 | Sign up → profile → Home on `aliens.jackgl.com` | Release |
| 22 | Learning panel and Play: the slice joined | M1 | M1-22 | Activity with Play mid-run, three tries, reward | Release |
| 23 | M1 demonstrated, playtest P1 | M1 | M1-24 | B3.2 "done when" walked on production; P1 notes | Playtest P1 |
| 24 | Roster and economy | M2 | M2-01 | Rapid buy/sell never goes negative | — |
| 25 | Targeting and support rules | M2 | M2-02 | One test per C5.4–C5.6 rule | — |
| 26 | Aliens, carriers and caps | M2 | M2-03 | Carrier releases per C6.3; caps hold in a stress wave | — |
| 27 | Bosses | M2 | M2-04 | Simulator and Vitest agree a baseline beats each boss | — |
| 28 | Meteor powers and determinism tests | M2 | M2-05, M2-10 | Boss wave identical at 30/60/144 Hz | — |
| 29 | Full run lifecycle ops | M2 | M2-06 | Every F §3.5 matrix cell has a fixture; both reducers pass | Release |
| 30 | Plausibility bounds and the fixtures gate | M2 | M2-07, M2-08 | Forged checkpoint refused; G-3 gates the release | Release |
| 31 | HUD, shop and battlefield keys | M2 | M2-09 | No per-frame React commits; keyboard-only and mouse-only | Try both |
| 32 | Saved games | M2 | M2-12 | Sixth open run refused; pruning beyond 50 | Release |
| 33 | Backup and restore runbook draft | M2 | M2-11 | Vault, plan and selection deployed; two-day recovery-point check as a follow-up | Release; later read-only check |
| 34 | First performance measurement, playtest P2 | M2 | M2-13 | AC-42 target written down; P2 notes | Measure on the children's laptop; P2 |
| 35 | Admin app shell | M3 | M3-01 | Operator in, player "not authorised" | Release |
| 36 | Activity lifecycle API | M3 | M3-02 | Stale draft 409; locked identity fields | Release |
| 37 | Interaction types I: picture and number select | M3 | M3-03 (part 1) | Answer vectors + keyboard tests for two types | — |
| 38 | Interaction types II: move, arrange, typed, two-step | M3 | M3-03 (part 2) | All six types pass vectors | — |
| 39 | Admin editor and preview-solve | M3 | M3-04 | One activity of each type published | Release; author six |
| 40 | Speech lifecycle and listening checklist | M3 | M3-05 | Approve disabled until played + ticked; G-14 live | Release |
| 41 | Templates | M3 | M3-06 | Snapshot tests per `(kind, version)` | — |
| 42 | Selection and bank status | M3 | M3-07 | Property test: no repeats, every slot filled | Release |
| 43 | Learning summaries | M3 | M3-08 | Replay leaves counters unchanged | Release |
| 44 | Withdrawal and VOID | M3 | M3-09 | Withdrawn → `VOIDED`, reward once | Release |
| 45 | Content phase C: worked records | M3 | M3-10a | ~17 activities, 12 clips approved | Review and approve clips |
| 46 | Content phase D: maths generators | M3 | M3-10b | Maths groups at threshold | Review rows |
| 47 | Content phase E: phonics | M3 | M3-10c | Phonics groups at threshold; every clip reviewed | Listening and approval |
| 48 | Content phase F: spelling | M3 | M3-10d | Spelling groups at threshold | Review and approval |
| 49 | Spreadsheet import (optional) | M3 | M3-11 | Second import creates nothing | Decide if wanted |
| 50 | Campaign data | M4 | M4-01 | 50 waves pass G-15; simulator green | — |
| 51 | Meteor offers | M4 | M4-02 | Grant never exceeds the cap | Release |
| 52 | Badges and planet eligibility | M4 | M4-03 | Each badge once | Release |
| 53 | Challenges | M4 | M4-04 | Challenge never touches best wave | Release |
| 54 | Endless | M4 | M4-05 | Nothing planned above interval 998 | Release |
| 55 | Resets | M4 | M4-06 | F §12.5 matrix per reset type | Release |
| 56 | Balance playtests P3 | M4 | M4-07 | Session notes; simulator run behind each change | Playtests |
| 57 | Local database | M5 | M5-01 | Upgrade keeps queued ops | — |
| 58 | Offline queue | M5 | M5-02 | Playwright: offline then flush in order | Release |
| 59 | Offline preparation and audio cache | M5 | M5-03 | Network cut after "Ready offline": play continues | Release; try it |
| 60 | Divergence and recovery | M5 | M5-04 | F §11.3 scenario end to end | Release |
| 61 | Takeover and lease timing | M5 | M5-05 | "Play here instead?" only after a lapse | Release; two browsers |
| 62 | Version compatibility | M5 | M5-06 | `PROTOCOL_UNSUPPORTED` keeps the queue | Release |
| 63 | Hard-case scenarios | M5 | M5-07 | Every automatable I §I.4 case green in CI | — |
| 64 | Asset pipeline and manifest | M6 | M6-01a | The existing art loads through the manifest | Release |
| 65 | Battlefield art | M6 | M6-01b | Every D10.2–D10.7 row integrated and polished | Review art in the game |
| 66 | Interface art and combat sounds | M6 | M6-01c | Every D10.8–D10.10 row final, sounds and app icons made | Review art; approve sounds and font |
| 67 | Performance against the budget | M6 | M6-02 | Measurement meets the C14 target | Measure |
| 68 | Keyboard and accessibility pass | M6 | M6-03 | Keyboard-only journeys + axe clean | — |
| 69 | Scoped CI role | M6 | M6-04 | Release with the scoped role; table delete denied | Bootstrap apply |
| 70 | Restore drill | M6 | M6-05 | Runbook entry with time and result | Run the drill |
| 71 | Rollback rehearsal and game-data lock | M6 | M6-06 | Earlier release re-published; G-8 refuses an edit | Dispatch rollback |
| 72 | Monitoring proof, runbooks and README | M6 | M6-07, M6-08 | Three alarm e-mails (one test, two real failures); each runbook followed once | Follow runbooks |
| 73 | Acceptance pass, playtest P4 | M6 | M6-09 | Every AC has evidence | Playtest P4; browsers |
| 74 | Data-freeze release | M6 | M6-10 | Freeze release tagged; guard enforcing | Release; tag |

Reading the table: phases 0–9 build the platform and a deployed walking skeleton (a page, sign-in and an API that refuses strangers)
before any game code is large. Phases 10–23 build the M1 slice layer by layer, each reviewable on its own. Phases 24 onwards follow J's
milestone order M2 → M3 → M4 → M5 → M6 ([B §B3.3](plan/B-scope-and-decisions.md#b33-milestone-path)); since phases are strictly
sequential, "M2 and M3 in parallel" becomes "M2 first, then M3". **[PROPOSAL]**

---

## How we work

### The loop for every phase

| Step | Who | What |
|---|---|---|
| 1. Start | Claude | Reads this file's entry for the phase and each task's row in [J §J.3](plan/J-execution-backlog.md#j3-the-backlog). Says which owner actions are needed and when. |
| 2. Build | Claude | Implements on `main` in small commits (conventions below). Tests first where the phase says so. Runs every local check that exists at that point. Never runs `terraform apply` on the main stack; `fmt`, `validate`, `init -backend=false` and read-only AWS calls are fine. |
| 3. Push | Claude or you | Pushing to `main` runs **CI checks only** (`.github/workflows/ci.yml`, from Phase 1). CI never assumes the AWS role and never deploys. |
| 4. Stop at the gate | Claude | Writes a gate summary in the reply and in the [gate log](#gate-log): what changed, commits since the last gate, how to run the tests, what to look at, open questions, owner actions still due. Then stops. |
| 5. Review | You | Follow the phase's "How to review this phase" and [J §J.4.3](plan/J-execution-backlog.md#j43-how-to-review-a-phase-proposal). Ask anything; Claude explains. |
| 6. Fix | Claude | Requested changes land as follow-up commits on `main`; you re-review only those. |
| 7. Approve | You | Record date, commit SHA and notes in the gate log. Then dispatch any release the phase needs. ADRs written in the phase move from `Proposed` to `Accepted`. |

Deployments are always **manual workflow dispatches** in the GitHub UI (`gh` is not authenticated on your machine; authenticating it
later also works: `gh workflow run release.yml -f ref=main`). Until Phase 4, the interim pipeline
[tf-apply-destroy-env.yml](../.github/workflows/tf-apply-destroy-env.yml) is the deployment path; from Phase 4, `release.yml` then
`apply.yml` (two dispatches, [H §H.7.1](plan/H-infrastructure-and-delivery.md#h71-decisions) W-4). **[PROPOSAL]**

**Push-triggered CI** (`.github/workflows/ci.yml`, to create in Phase 1): runs on `push` to `main`, with `permissions: contents: read`
only, no `id-token`, no environment, so it cannot assume the CI role. It runs the same checks as the release's `checks` job that need no
AWS. This is an addition to [H §H.7](plan/H-infrastructure-and-delivery.md#h7-workflows-what-replaces-the-two-copies), whose four
workflows stay `workflow_dispatch` only; it matches I's "every push" test runs ([I §I.2.1](plan/I-validation.md#i21-test-levels)).
**[PROPOSAL]**

### Local toolchain and how tests run on your machine

| Tool | Local | CI / AWS | How the gap is handled |
|---|---|---|---|
| Node | 24 via nvm **[CONFIRMED by owner, 2026-11-14]** | 24 (`setup-node` reads `.nvmrc`) | Same everywhere. `nvm use` in `web/`. |
| Python | 3.12.3 **[VERIFIED]** ([spine S0](plan/00-spine.md#s0-verified-starting-point)) | 3.14 (`setup-python` reads `.python-version`; Lambda `python3.14`) | CI on 3.14 is the authority. Locally, `api/` tests run on 3.12: `ruff` is configured with `target-version = "py312"` until you install 3.14, so no syntax newer than 3.12 slips in, and the code then runs on both. Lambda zips are built with `pip --python-version 3.14 --platform manylinux_2_28_aarch64 --only-binary=:all:` ([H §H.9.2](plan/H-infrastructure-and-delivery.md#h92-build-rules-that-keep-the-plan-honest)), which downloads 3.14 wheels whatever the local interpreter is. Installing 3.14 (e.g. `uv python install 3.14`, no root needed) is optional and recommended before Phase 15; then `target-version` moves to `py314`. **[PROPOSAL]** Whether every pinned dev package installs on 3.12 is **[UNVERIFIED]**; Phase 7 finds out. |
| DynamoDB Local | not available (no Docker or Java) **[VERIFIED]** ([I §I.2.2](plan/I-validation.md#i22-the-order-the-tools-arrive-in)) | service container in CI (G-13) | Tests marked `ddblocal` are skipped locally and run in CI; moto covers the rest locally. |
| Playwright | installs its own Chromium via npm | Chromium in CI | Works locally without Docker. |
| Terraform | 1.17.2 **[VERIFIED]** ([common.auto.tfvars.json](../infrastructure/envs/common.auto.tfvars.json)) | 1.17.2 exact | `fmt`, `validate`, `init -backend=false` locally; `plan` locally only with read-only credentials; never `apply` on the main stack. |
| AWS CLI | your profile for this account | OIDC role | Read-only calls locally (e.g. `describe-certificate`, `head-bucket`). The Polly bake-off's `SynthesizeSpeech` creates nothing ([D §D9.1](plan/D-ux-and-content-operations.md#d91-milestone-0-listening-spike-before-any-phonics-authoring)). Every call that is *not* read-only is in the next table. |

### Local AWS writes that are not deployments

The rule is "read-only AWS calls from the laptop are fine; everything that changes infrastructure goes through a pipeline"
([spine S0.1](plan/00-spine.md#s01-way-of-working-confirmed-by-owner-2026-11-14)). The calls below change something in the account
but are not deployments: data, users, alarm states, or (for the restore drill) scratch tables outside Terraform. Each one has a plan
basis. **You confirm this list once, at the Phase 0 gate** (owner action 6); anything not on it needs a new row and your approval at
the gate where it first appears. **[PROPOSAL]**

| Phase | Call (who runs it) | What it changes | Plan basis | Label |
|---|---|---|---|---|
| 0 | Test-bucket clean-up, **only** in the fallback case (bucket exists but is not in any state): `aws s3 rb --force` (you) | Deletes a throwaway bucket and its objects | One-off **break-glass**, recorded as a line in ADR-0011. The preferred path is the interim pipeline (import, then apply), which needs no local write; see Phase 0 owner action 5 | **[PROPOSAL]** |
| 6 | `spikes/ddb-transactions/capture.py` (you) | Items in the throwaway spike table only | Not covered by H §H.13.3 (that exception is for restore and seed). Needs your explicit yes at Phase 0; the alternative is a `run` action in `spike.yml` | **[PROPOSAL]** |
| 8, 72 | `cognito-idp admin-create-user` for the operator, `test-player-1`, `test-player-2`, `test-operator`; `admin-delete-user` for the self-signed-up test child (you) | Users in the two pools | [spine S1](plan/00-spine.md#s1-system-shape) (operator pool is AdminCreateUser-only); [I §I.2.10](plan/I-validation.md#i210-test-accounts-and-test-data) | **[PROPOSAL]** |
| 9, 72 | `cloudwatch set-alarm-state` on one alarm (you) | An alarm's state, until its next evaluation | [I §I.2.9](plan/I-validation.md#i29-manual-and-operational-tests) alarm delivery; AC-40 | **[PROPOSAL]** |
| 72 | `lambda invoke` of `player-api` with a malformed event (you) | Nothing persistent; produces one function error and log lines | I §I.3 AC-40 step 2 | **[PROPOSAL]** |
| 20, 45–48, 51 | `scripts/seed_content.py` (dry run, then real) (you) | Create-only conditional writes to the `content` table | [H §H.13.3](plan/H-infrastructure-and-delivery.md#h133-procedures-docsrunbooksrestoremd-to-create) operator data procedures | **[PROPOSAL]** |
| 70 | Restore drill: `restore-table-to-point-in-time` / `start-restore-job` to scratch tables, then `delete-table` on the scratch tables (you) | **Creates and deletes DynamoDB tables outside Terraform** (not just data) | [H §H.13.3](plan/H-infrastructure-and-delivery.md#h133-procedures-docsrunbooksrestoremd-to-create), [H §H.13.4](plan/H-infrastructure-and-delivery.md#h134-restore-drill-ac-39) | **[PROPOSAL]** |
| 74 | F-8 pre-freeze test data removal (you) | Player data and users that are not test accounts or the canary | Proposed mechanism: the in-app whole-profile reset (Phase 55) signed in as each affected account, then `admin-delete-user` for accounts that should not survive; no direct table writes. Anything else is written up as a dry-run-first script and added here before it runs | **[PROPOSAL]** |

Phase 69's denied-delete check uses `iam simulate-principal-policy`, which is read-only and so is not in this table.

### Phase sizes and split gates

J sizes an L task at 1–2 weeks and an M at 2–4 days ([J §J.1.2](plan/J-execution-backlog.md#j12-effort-scale-assumption)). A gate
should be reviewable in about one to two hours, so the phases below have **two gates, `a` then `b`**, each with its own gate summary,
gate-log row and approval. The phase number, its J tasks and its exit criteria stay as written; part `a`'s gate checks only what `a`
built, and part `b`'s gate checks the whole exit list. A release is dispatched after `b` unless the table says otherwise. **[PROPOSAL]**

| Phase | Part a | Part b |
|---|---|---|
| 3 | `static_site` module; `scripts/plan_guard.py`, `scripts/scan_dist.py` and their tests | `release.yml` plan side (`config`, `checks`, `build`, `plan`) and `plan.yml` |
| 6 | DynamoDB spike: fixtures and the moto comparison | Audio spike and ADR-0015; `spike.yml` and spike roots removed; G-5 (first rules) |
| 8 | Both tables, audio bucket, `lambda_function` ×4 with roles, release build job (release and apply after `a`) | Both Cognito pools (the trigger function already exists) and the operator/test accounts (release and apply after `b`) |
| 9 | `http_api`, `/api/*` behaviour, G-12, route smoke, full `config.json` (release and apply after `a`) | `monitoring`, SNS, alarms in `lambda_function`, the G-5 alarm rule, G-13 (release and apply after `b`) |
| 11 | Schemas, limits, fixtures | Reducer and canonicaliser |
| 14 | Headless simulation and snapshot tests | Phaser scene and `GameBridge` |
| 16 | `POST`/`GET /api/runs` (G7) | Session lease routes (`PUT`/`DELETE /api/session`) |
| 17 | Check order (duplicate, fence, revision) and the non-answer ops | `SUBMIT_ATTEMPT` outcomes and rewards, retry, G5 `ddblocal` tests |
| 21 | `config.json` load, PKCE, `ownerSub` check, profile, Home | Serial queue and sync chip |
| 24 | Buy and upgrade | Sell, refund and caps |
| 26 | Catalogue and traits | Carriers, splitters and caps |
| 29 | `METEOR`, `DISMISS_SLOT` | `COMPLETION_OFFER`, `FINISH_RUN`, `CHOOSE_ENDLESS`, `ABANDON`, best wave |
| 36 | Draft and validate | Publish, retire, withdraw, audit |
| 39 | Editors for the Phase 37 types | Editors for the Phase 38 types |
| 41 | Generator framework and snapshots | Publish check and materialisation |
| 42 | Selection algorithm | Bank-status page |
| 46, 47, 48 | One gate per age band: age 5, age 6, age 7 (three gates, `a`/`b`/`c`; J already orders them so) | — |
| 54 | `game-core` scaling | Server block planning |
| 57 | Store schema and upgrade | Durability rule and online-only banner |
| 58 | Queue and flush | Web Lock, identity checks, sign-out |
| 59 | Pack download and readiness | Audio cache |
| 60 | Option (a) | Option (b) and the recovery download |
| 63 | pytest cases | Playwright cases |
| 65 | One gate per D10 group, D10.2 to D10.7 (six gates, `a`…`f`), if the polish list is long | — |
| 66 | One gate per D10 group, D10.8 to D10.10 (three gates, `a`…`c`); favicon, app icons and font go with `a` | — |
| 73 | AC evidence | Browser matrix and P4 |

Optional: ADR-0001…0010 can move out of Phase 0 into a small docs-only gate `0b` straight after it, if Phase 0's diff feels too big.
The overview table keeps one row per phase; the gate log gets one row per part.

### Commit messages

| Rule | Example |
|---|---|
| Subject: `P<nn> <area>: <imperative summary>`, at most 72 characters. Areas: `infra`, `ci`, `web`, `core`, `player`, `admin`, `shared`, `api`, `contracts`, `data`, `content`, `docs`, `tools`. | `P03 infra: add static_site module with OAC and SPA function` |
| Body: why (one or two lines), the J task IDs, and the checks run. | `Delivers M1-07 part 1. Checks: terraform fmt/validate, plan_guard tests.` |
| One concern per commit; tests in the same commit as the code they test. | — |
| Decisions: the ADR goes in the same commit as the change that made the decision ([J §J.6.1](plan/J-execution-backlog.md#j61-what-and-why-proposal)). | `P05 docs: ADR-0012 auth spike results` |
| Gate commits: `P<nn> docs: gate summary` updates the gate log; your approval edit is `P<nn> docs: gate approved`. | — |
| Claude's commits end with a `Co-Authored-By:` trailer naming Claude. Never commit secrets, tokens, `.terraform*` folders or clip audio. | — |

### What "done" means

A **task** is done when its "Done when" in J holds and J's definition of done holds
([J §J.1.3](plan/J-execution-backlog.md#j13-definition-of-done-for-every-task-proposal)). A **phase** is done when all of these hold:

1. Every task (or task part) the phase lists meets its "Done when", or the gate log says which part moved to a named later phase and why.
2. The phase's exit criteria below are observable: a passing suite, a page, a pipeline run, a deployed URL, a recorded file.
3. CI on `main` is green at the gate commit.
4. Anything deployed went through a pipeline. The bootstrap root is the only local apply.
5. New decisions are ADRs; README, runbooks and the [unverified register](#phase-5--spike-workflow-and-auth-spike) are updated.
6. You have reviewed and approved the gate, recorded in the [gate log](#gate-log).

### Two things to settle before Phase 0 starts

Both are settled.

| Item | State | Outcome |
|---|---|---|
| The plan edits in `docs/plan/` and `docs/art/` were modified but not committed | **Settled** | Committed as `1812208` "docs: plan v0.3, design doc and build phases", so the first gate's diff contains only Phase 0. |
| `art/` and `web/player/public/assets/` were untracked | **Settled** | Committed as `bc454c2`: `art/` (minus `review/`, which [.gitignore](../.gitignore) ignores), `web/player/public/assets/`, the gallery and `tools/art/`. All 352 catalogue entries are drawn in-repo as SVG ([asset catalogue](art/asset-catalogue.json)); the ChatGPT prompt route is superseded. Phase 1 must not overwrite `web/player/public/assets/`. |

---
## How each phase is described

Every phase has the same fields: **Goal** (one sentence) · **Why now** · a field table (J tasks, in scope, out of scope, files, depends on,
owner actions, tests and how to run them, what gets deployed and how to see it, exit criteria, risks) · **How to review this phase**
(concrete things to look at, then the one or two concepts worth learning). File paths that exist are links; planned paths are in
backticks and are to be created. Task scope, risks and "Done when" are not repeated in full: open the task's row in
[J §J.3](plan/J-execution-backlog.md#j3-the-backlog).

---

## Stage A — Foundations and the walking skeleton (phases 0–9)

### Phase 0 — Repository hygiene and pipeline trust

> **This is the phase to start with.**

**Goal.** Make the repository safe to build in and prove that GitHub Actions can assume the CI role with a narrowed, correct trust.

**Why now.** Nothing can deploy until the OIDC trust matches the subject GitHub actually sends (blocker BL-1,
[B §B7](plan/B-scope-and-decisions.md#b7-genuine-blockers)). It is mostly platform work, your strongest area, so the first gate is
quick and sets the review rhythm before application code arrives ([J §J.4.2](plan/J-execution-backlog.md#j42-the-first-build-phase-hygiene-oidc-trust-and-the-bootstrap)).

| Field | Detail |
|---|---|
| J tasks | M0-01 (what is left), M0-02, M0-03, M0-05, M0-07 |
| In scope | `.gitignore` check against [H §H.16](plan/H-infrastructure-and-delivery.md#h16-gitignore-to-create-before-the-first-git-add-infrastructure); `CLAUDE.md` with project conventions; docs index; ADR folder, template, index, ADR-0001…0010 (already accepted decisions) and ADR-0011 (OIDC outcome); `.nvmrc` and `.python-version`; trust fix and artefacts bucket in the bootstrap root; Phase 0 test-bucket clean-up; removing the interim workflow's `destroy` action |
| Out of scope | Any `infrastructure/main` resource (except the temporary test-bucket import in owner action 5, only if the bucket exists outside any state); any application code; the scoped CI policy (Phase 69); env keys for the main stack (Phase 2) |
| Files | [.gitignore](../.gitignore) (already ignores `.terraform-*/`, which covers `infrastructure/bootstrap/.terraform-prod/` **[VERIFIED]**; add `release.tfvars.json`, `*.local`, `.vscode/` from H.16); `CLAUDE.md`; `docs/README.md` (index: plan, build phases, decisions, runbooks, releases, validation, art); `docs/decisions/README.md`, `docs/decisions/0000-template.md`, `docs/decisions/0001-…` to `0011-…`; `.nvmrc` (`24`), `.python-version` (`3.14`); [README.md](../README.md) (links); [common.auto.tfvars.json](../infrastructure/envs/common.auto.tfvars.json) (`trusted_subs`, only if the smoke test prints something else, plus `prod-apply` if reviewers exist); `infrastructure/bootstrap/artifacts.tf` (B-6, beside the module call in [bootstrap/main.tf](../infrastructure/bootstrap/main.tf)); [bootstrap/outputs.tf](../infrastructure/bootstrap/outputs.tf) (bucket name output); [tf-apply-destroy-env.yml](../.github/workflows/tf-apply-destroy-env.yml) (drop `destroy` and `confirm`); [oidc-smoke.yml](../.github/workflows/oidc-smoke.yml) (unchanged unless the run shows a problem) |
| Depends on | The plan commit (see "Two things to settle") |
| Owner actions | (1) GitHub → Settings → Environments: create `prod` with deployment branches "selected: `main`" **before** the first run; note whether required reviewers can be added. Then one of three branches ([J §J.4.2](plan/J-execution-backlog.md#j42-the-first-build-phase-hygiene-oidc-trust-and-the-bootstrap) outcome table, [H §H.7.1](plan/H-infrastructure-and-delivery.md#h71-decisions) W-3/W-5): **(1a)** reviewers available and you want one dispatch: also create `prod-apply` with deployment branch `main` and you as required reviewer; Claude adds its subject to `trusted_subs`; **(1b)** environments available, no reviewers: `prod` only (the two-dispatch default); **(1c)** environments unavailable on this plan/visibility: no environment, Claude sets `trusted_subs` to the fallback B-3 subject `repo:…:ref:refs/heads/main` and no job declares an environment. (2) Dispatch `oidc-smoke` on `main`; read the outcome table in [J §J.4.2](plan/J-execution-backlog.md#j42-the-first-build-phase-hygiene-oidc-trust-and-the-bootstrap). (3) Review Claude's bootstrap diff; run your bootstrap script's plan, then apply, locally. (4) Re-run `oidc-smoke` on `main`; dispatch it once from a throwaway branch (negative test) and delete the branch. (5) `aws s3api head-bucket --bucket testing-bucket-9489424594` (read-only). The test-bucket resource is already gone from [main.tf](../infrastructure/main/main.tf) **[VERIFIED]** (commit `f88439c`), so if the bucket still exists and is in state, dispatch the interim pipeline `plan` then `apply` (Terraform destroys a resource that is in state but not in code); if it exists but is **not** in state, prefer the pipeline: Claude commits the resource back (with `force_destroy = true`) plus an `import` block, you dispatch the interim `plan` then `apply` (import), then Claude removes both and you dispatch `plan` then `apply` again (destroy). Only if that is impractical, delete it by hand as a **break-glass** one-off and Claude records it as a line in ADR-0011 ([local writes table](#local-aws-writes-that-are-not-deployments)). (6) Read the [local AWS writes table](#local-aws-writes-that-are-not-deployments) and confirm it once; the confirmation goes in the gate log, including your yes or no to the Phase 6 `capture.py` row. |
| Tests and how to run | No code tests yet. Checks: `git check-ignore -v infrastructure/bootstrap/.terraform-prod/x` names the `.terraform-*/` rule; `git ls-files \| grep -c terraform-prod` prints 0; `terraform fmt -check -recursive infrastructure/`; your bootstrap plan output; the smoke run log searched for `eyJ` (finds nothing) |
| Deployed / how to see | Bootstrap only (your local apply): the updated trust policy and the artefacts bucket `263185198757-eu-west-2-prod-artifacts-bucket` ([H §H.5](plan/H-infrastructure-and-delivery.md#h5-bootstrap-changes-you-make-no-replacement-bootstrap) B-6). See them in the smoke log and with `aws s3api head-bucket` |
| Exit criteria | `oidc-smoke` on `main` prints the `sub` line and `arn:aws:sts::263185198757:assumed-role/space-tower-defence-prod-github-oidc/…`; the run from another branch is refused; the artefacts bucket exists; the test bucket returns 404; the interim workflow offers only `plan` and `apply`; ADR-0011 records the branch taken (1a, 1b or 1c), the subject(s), whether `prod-apply` exists and the bucket name; ten more ADRs exist, each one screen; the gate log records that M0-07 is accepted against the adjusted Done when (local Python 3.12, `.python-version` = 3.14, CI on 3.14; see [How we work](#local-toolchain-and-how-tests-run-on-your-machine)) until J's row is changed, and your confirmation of the local-writes table |
| Risks | A typo in the subject locks CI out (recoverable from your laptop); the environment created without its branch rule; the test bucket's removal destroys it on the next apply (its state carries `force_destroy = true`, so contents go with it — it was a throwaway); required reviewers unavailable (fine: two-dispatch default, D-13) |

**How to review this phase**

1. [.gitignore](../.gitignore): the `.terraform-*/` rule; that `.terraform.lock.hcl` and `*.tfvars.json` are *not* ignored; the new lines from H.16.
2. `CLAUDE.md`: does it say exactly what you agreed (O-4: phases, gates, pipelines only, bootstrap the only local apply, labels, layout)? Anything you would not want an assistant to do should be written there.
3. `infrastructure/bootstrap/artifacts.tf`: beside the module call, not inside it; public access block, BucketOwnerEnforced, SSE-S3, versioning, TLS-only policy, `prevent_destroy`, no `force_destroy`; lifecycle: multipart abort 1 day, `plans/` expiry 30 days.
4. Your bootstrap plan: an in-place update of the role's trust policy and new bucket resources; nothing replaced, nothing destroyed. Under branch 1c, no workflow file declares `environment:`; under 1a, `trusted_subs` has exactly two entries.
5. `trusted_subs` equals the printed `sub` character for character (owner ID and repo ID included).
6. The smoke run log: only the `sub` line, the caller identity, and no `eyJ` anywhere.
7. The negative test: the run from another branch stopped at the environment's branch rule (or at `AssumeRoleWithWebIdentity`).
8. [tf-apply-destroy-env.yml](../.github/workflows/tf-apply-destroy-env.yml): no `destroy`, no `confirm`, no `-destroy` flag left in the plan step.
9. ADR-0001…0010: each matches its spine section and says `Accepted`; ADR-0011 says `Proposed` until you approve this gate.

*Concepts worth learning:* how a GitHub **environment** changes the OIDC `sub` claim and adds branch rules (why naming one changes what IAM sees);
**tracked versus untracked** files in git (an ignore rule does nothing for a file already tracked).

---

### Phase 1 — Web workspace scaffold and push CI

**Goal.** Create the four front-end packages and a push-triggered CI that builds and tests them, with a Phaser scene mounted in a React page.

**Why now.** It removes the biggest front-end unknown (TypeScript 7 + Vite 8 + Phaser 4.2.1 + React 19 working together,
**[UNVERIFIED]** until tried), and the walking skeleton in Phases 3–4 needs a real build to publish. It needs no AWS.

| Field | Detail |
|---|---|
| J tasks | M0-08a, M0-08b; plus the push CI workflow (an addition, see [How we work](#how-we-work)) |
| In scope | npm workspaces `game-core`, `player`, `admin`, `shared`; Vitest in `game-core`; one React page per app; a Phaser scene drawing a rectangle in the player app with keyboard capture disabled; oxlint and `tsc -p` per package ([ADR-0013](decisions/0013-front-end-stack-versions.md)); a check that `game-core` imports no Phaser or DOM; `ci.yml` |
| Out of scope | Any game rule (the clock is Phase 10); routing, sign-in, API calls; deployment |
| Files | `web/package.json`, `web/package-lock.json`, `web/tsconfig.base.json`, `web/.oxlintrc.json`; `web/game-core/` (`package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `src/purity.test.ts`); `web/player/` (`index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/game/BootScene.ts`) — keeping the existing committed `web/player/public/assets/` untouched; `web/admin/` (Vite + React page); `web/shared/` (empty package with its import rule); `.github/workflows/ci.yml`; `docs/decisions/0013-front-end-stack-versions.md` |
| Depends on | Phase 0 (`.nvmrc`) |
| Owner actions | Run the app locally once (`npm run dev -w player`) and look at it |
| Tests and how to run | `cd web && nvm use && npm ci && npm run lint && npm run typecheck && npm test && npm run build`. `purity.test.ts` fails if any `game-core` source imports `phaser`, `react` or touches `window`/`document` |
| Deployed / how to see | Nothing deployed. Locally: `npm run dev -w player`, open the printed `localhost` URL, see the rectangle. CI: the push's run in the Actions tab is green |
| Exit criteria | Fresh clone → `npm ci && npm run build && npm test` green; the page shows the scene; adding `import 'phaser'` to `game-core` fails the check (try it, then revert); CI green on push; ADR-0013 lists exact versions |
| Risks | Version incompatibilities between TS 7, Vite 8 and Phaser 4 types; Phaser mounting twice under React strict mode; the scaffold overwriting `web/player/public/assets/` |

**How to review this phase**

1. `web/package.json`: the `workspaces` list and the root scripts; `package-lock.json` committed (it is what makes `npm ci` reproducible).
2. Each package's `package.json`: exact versions as in ADR-0013 and [H §H.17](plan/H-infrastructure-and-delivery.md#h17-version-pins); `game-core` has no `phaser` or `react` dependency.
3. `web/player/src/App.tsx`: Phaser is created inside an effect and destroyed in its cleanup. Ask Claude to show what happens in strict mode without the cleanup.
4. `BootScene.ts`: keyboard capture disabled (so the page's own keys keep working later).
5. `purity.test.ts`: would it actually fail? Make the bad import and run `npm test`.
6. `.github/workflows/ci.yml`: `on: push` to `main`; `permissions: contents: read`; no `id-token`, no `environment`, no AWS action.
7. `npm run build` output in `web/player/dist/`: hashed file names, and no hostname or account ID baked in (the build is environment-free; runtime values come from `config.json` later).

*Concepts worth learning:* **npm workspaces** (one lockfile, several packages that import each other by name);
**React effects and cleanup** (why strict mode runs them twice in development, and why a cleanup makes that harmless).

---

### Phase 2 — Main root, certificate and DNS hand-off

**Goal.** Give the main root its real structure and its first real resource, the us-east-1 certificate, issued through the pipeline with your validation records.

**Why now.** Distributions cannot be planned with aliases until the certificate is `ISSUED`, and validation waits on records only you can
create (BL-2). Doing it before the site phases means DNS propagation never blocks a review.

| Field | Detail |
|---|---|
| J tasks | M0-04, M1-01, M1-02, M1-03 |
| In scope | DNS hand-off runbook (record names, outputs, CAA and wildcard checks, never-touch rules); H.6 env keys in both env files and declared in **both** roots (B-5 in the bootstrap root, [main/variables.tf](../infrastructure/main/variables.tf) for main); `us_east_1` provider alias; `locals.tf`, `data.tf`, `outputs.tf`; module wiring; `certificate` module (both hostnames, DNS validation with a 30-minute create timeout); the interim pipeline's job `timeout-minutes: 60` |
| Out of scope | Distributions and buckets (Phase 3); Route 53 resources of any kind (never: DNS is yours, `prompt.md:822`) |
| Files | `docs/runbooks/dns-hand-off.md`; [common.auto.tfvars.json](../infrastructure/envs/common.auto.tfvars.json), [prod.tfvars.json](../infrastructure/envs/prod.tfvars.json); [bootstrap/variables.tf](../infrastructure/bootstrap/variables.tf); [main/variables.tf](../infrastructure/main/variables.tf), [main/provider.tf](../infrastructure/main/provider.tf), [main/main.tf](../infrastructure/main/main.tf); `infrastructure/main/locals.tf`, `data.tf`, `outputs.tf`; `infrastructure/modules/certificate/`; [tf-apply-destroy-env.yml](../.github/workflows/tf-apply-destroy-env.yml) (timeout) |
| Depends on | Phase 0 (trust works; destroy action gone) |
| Owner actions | Supply `notification_email` and the two auth domain prefixes. DNS-2: `dig CAA jackgl.com`. DNS-3: read the apex CloudFront distribution's alternate domain names in its own account (read-only) for `*.jackgl.com`. Run the bootstrap plan locally: the Phase 2 declarations add nothing, but the Phase 0 artefacts bucket (not yet applied on 2026-11-15) shows as to-add; apply it now. Nothing changed or destroyed, no undeclared-variable warnings. Dispatch the interim pipeline `plan`, then `apply`; while the apply waits, read the two records with `aws acm describe-certificate --region us-east-1` and create both CNAMEs in your DNS account. Keep them forever |
| Tests and how to run | `terraform fmt -check -recursive infrastructure/`; `terraform -chdir=infrastructure/main init -backend=false && terraform -chdir=infrastructure/main validate`; bootstrap plan "No changes" with no undeclared-variable warnings |
| Deployed / how to see | The certificate (us-east-1), through the interim pipeline. `aws acm describe-certificate --region us-east-1 --certificate-arn …` shows `ISSUED`; the pipeline's `terraform output acm_validation_records` lists two records |
| Exit criteria | Certificate `ISSUED`; runbook filled in, including the CAA and wildcard results; both roots declare every env key |
| Risks | A CAA record without `amazon.com`, or a wildcard alias on the apex distribution in the other account **[UNVERIFIED]**: either stops the walking skeleton until resolved; ACM gives up after 72 h; the apply outliving the role session (hence the timeouts) |

**How to review this phase**

1. `modules/certificate/`: provider alias `aws.us_east_1` passed explicitly; both hostnames as SANs; no Route 53 resource; the validation resource's 30-minute create timeout.
2. `outputs.tf`: `acm_validation_records` gives name, type and value per record (what the runbook tells you to copy).
3. `variables.tf` in both roots: every key in the env files is declared; bootstrap-only and main-only keys say so in their descriptions.
4. `data.tf` holds only managed CloudFront policy lookups, nothing that reads your other account.
5. The runbook: the four record names, where each value comes from, DNS-1 to DNS-5 from [H §H.15.1](plan/H-infrastructure-and-delivery.md#h151-what-terraform-gives-you-and-what-you-create), and "never `allow_overwrite`".
6. The pipeline run: the plan was saved and the apply used that saved plan.

*Concept worth learning:* nothing new on the AWS side. On the delivery side: **one env file, two roots** — every key must be declared in
both or every run warns, which is why config changes in this repo always touch both `variables.tf` files.

---

### Phase 3 — Static sites and the release pipeline, plan side

**Goal.** Add both static sites to the main root and build the release workflow up to a saved, guarded plan, without applying anything.

**Why now.** The certificate is issued, so the distributions can be planned. Splitting the release workflow into a plan half (here) and
an apply half (Phase 4) keeps each review to one idea: "what will change" before "how it changes".

| Field | Detail |
|---|---|
| J tasks | M1-07 (part 1: sites without the `/api/*` behaviour), M1-10 (part 1: plan side) |
| In scope | `static_site` ×2: private bucket + OAC, CloudFront Function SPA fallback on the default behaviour only, response headers policy with the CSP owned by [H](plan/H-infrastructure-and-delivery.md), aliases on the issued certificate, no `custom_error_response`, protection flags on from the first apply (P26). `release.yml` jobs `config` (main only, `release_id`), `checks` (G-1, G-2, G-4 — whatever exists), `build` (both apps, G-6 asset scan, static archive to `static/<build-hash>/`, manifest to `releases/<release_id>/`), `plan` (`-detailed-exitcode` captured, plan guard G-7 in report mode, tarball to `plans/<run_id>/plan.tar.gz` with its SHA-256). `plan.yml` (manual plan-only drift check). `scripts/plan_guard.py` and its tests |
| Out of scope | `apply.yml`, publishing, smoke, DNS aliases (Phase 4); Lambda zips (Phase 8); the `/api/*` behaviour (Phase 9) |
| Files | `infrastructure/modules/static_site/`; [main/main.tf](../infrastructure/main/main.tf), `outputs.tf`; `.github/workflows/release.yml`, `.github/workflows/plan.yml`; `scripts/plan_guard.py`, `scripts/tests/test_plan_guard.py` (with three saved `terraform show -json` samples, [I §I.2.8](plan/I-validation.md#i28-infrastructure-checks)); `infrastructure/plan-guard.json` (`enforce: false`); `scripts/scan_dist.py` (G-6) |
| Depends on | Phase 1 (a build to publish), Phase 2 (issued certificate) |
| Owner actions | Dispatch `release.yml` with `ref=main`; read the plan in the run summary. Do **not** dispatch `apply.yml` yet: it does not exist |
| Tests and how to run | `python3 -m pytest scripts/tests` (plan guard: update passes, table replace and app-client delete listed, exit non-zero with `enforce: true`); G-6 test with a fixture `dist/`; `terraform validate`; `ci.yml` now also runs the script tests |
| Deployed / how to see | Nothing applied. The saved plan sits in the artefacts bucket: `aws s3 ls s3://263185198757-eu-west-2-prod-artifacts-bucket/plans/` (read-only) |
| Exit criteria | A release run on `main` ends with "dispatch apply.yml with plan_run_id = N"; the plan shows two distributions, two buckets, OAC, one CloudFront Function, one response headers policy and no `custom_error_response`; a dispatch from another branch fails in `config`; plan-guard tests green |
| Risks | Inputs interpolated into shell (W-9); the plan tarball missing `.terraform/` or the lock file (apply later refuses it); a CloudFront Function size limit **[UNVERIFIED]** |

**How to review this phase**

1. `static_site`: the bucket policy allows only this distribution's ARN through OAC; the function is attached to the default behaviour only.
2. The CSP and security headers: compare with H; no `unsafe-inline` scripts.
3. `release.yml`: every `${{ inputs.* }}` reaches shell through `env:`; runner `ubuntu-24.04`; Terraform version read from the env file; actions at the H.17 majors.
4. The plan step: `set +e … rc=$?` around `-detailed-exitcode`, and only exit code 1 fails.
5. The tarball: includes `.terraform/`, the lock file, the var files and the manifest; uploaded to S3, never `actions/upload-artifact`.
6. `scripts/plan_guard.py` and its three samples: would a table replace actually be listed?
7. `infrastructure/plan-guard.json`: the protected types include Cognito app clients (replacing one signs everyone out), even though none exist yet.
8. G-6: the forbidden-string list matches [H §H.10](plan/H-infrastructure-and-delivery.md#h10-quality-gates) and does not match the bare word "Polly".

*Concepts worth learning:* **GitHub Actions job graph** (`needs`, job outputs, why each job gets a fresh runner);
**why a saved plan must be applied by the same Terraform, providers and OS** (and so travels with its `.terraform/`).

---

### Phase 4 — Walking skeleton live

**Goal.** Finish the release (apply the saved plan, publish, smoke, record) and serve the app shells at `https://aliens.jackgl.com` and `https://admin.aliens.jackgl.com`.

**Why now.** It proves the whole delivery path end to end with almost no application risk, and it retires the interim pipeline so there
is exactly one way to deploy from here on.

| Field | Detail |
|---|---|
| J tasks | M1-10 (part 2: apply, publish, smoke, record), M1-11 (part 1: first release, alias records, first release entry) |
| In scope | `apply.yml` (download `plans/<plan_run_id>/`, verify SHA-256 and commit, apply the saved plan, capture outputs); publish: hashed assets first with immutable cache headers (only Vite's content-hashed bundles; the unhashed art copied from `player/public/assets/` gets `no-cache` until Phase 64 hashes it, [ADR-0013](decisions/0013-front-end-stack-versions.md)), then `config.json` (only `apiBase: "/api"` and the release ID for now), then `index.html` last with `no-cache`, no `--delete`; invalidation of `/index.html`, `/config.json` (and `/game-data/current.json` on the player site, P25); smoke: 200 on both hostnames and both `*.cloudfront.net` names, a deep link returns the app, `/missing.js` returns 404 not HTML; record: final manifest, `releases/latest.json`, tag `release-<release_id>` (that job alone gets `contents: write`), a line in `docs/releases/`; one concurrency group for `release.yml` and `apply.yml` (`terraform-prod`, which `release.yml` already uses so it also serialises with the interim workflow; H.7.1 W-6 names it `prod-release`); delete the interim workflow in the same commit |
| Out of scope | Any API or sign-in; alarms (Phase 9) |
| Files | `.github/workflows/apply.yml`; `.github/workflows/release.yml` (publish, smoke, record jobs); [tf-apply-destroy-env.yml](../.github/workflows/tf-apply-destroy-env.yml) (deleted); `scripts/publish_static.py` or equivalent shell steps; `scripts/smoke.py`; `docs/releases/README.md`, `docs/releases/<release_id>.md` |
| Depends on | Phase 3 |
| Owner actions | Dispatch `release.yml`, read the plan, dispatch `apply.yml` with the plan's run ID. After the distributions exist, create A + AAAA alias records for both hostnames to the output distribution domains (zone `Z2FDTNDATAQYW2`), per the runbook; check the apex `jackgl.com` still answers as before |
| Tests and how to run | `python3 -m pytest scripts/tests` (smoke script against a recorded response set); the release's own smoke job |
| Deployed / how to see | Both sites: open `https://aliens.jackgl.com` (the Phase 1 page with the rectangle) and `https://admin.aliens.jackgl.com`; check the certificate in the browser; `curl -I https://aliens.jackgl.com/index.html` shows `cache-control: no-cache` |
| Exit criteria | Smoke green on both hostnames, not only `*.cloudfront.net`; tag `release-<release_id>` exists; `docs/releases/` has the entry; the interim workflow is gone; a stale plan (dispatch `apply.yml` with an old run ID after a newer apply) is refused |
| Risks | Publishing `index.html` before its assets (a blank page for a minute); a missing distribution ID silently skipping invalidation (must fail); alias records created before the distribution exists |

**How to review this phase**

1. `apply.yml`: it applies only `tfplan` from the tarball, after checking the digest and commit; no `plan` inside apply.
2. Publish order and headers: assets, then `config.json`, then `index.html`; no `--delete` anywhere.
3. Invalidation paths: exactly the entry points, never `/*`.
4. The tag job: the only one with `contents: write`.
5. Smoke: the 404 check would catch a distribution-wide error page rewriting missing files into `index.html` ([E §E.2.2](plan/E-architecture.md#e22-why-custom-error-responses-must-not-be-distribution-wide)).
6. The release entry: release ID, commit, plan run ID, what changed.
7. `git ls-files .github/workflows`: `oidc-smoke.yml`, `ci.yml`, `release.yml`, `apply.yml`, `plan.yml` only. (`spike.yml` appears temporarily in Phases 5–6 and is gone again at Phase 6's gate; `ci.yml` is this file's addition to H's list, see the open points.)

*Concepts worth learning:* **content-hashed assets and cache headers** (why hashed files can be cached forever and `index.html` never);
**why `index.html` goes last** (a browser that loads the new `index.html` must find every asset it names).

---

### Phase 5 — Spike workflow and auth spike

**Goal.** Answer the managed-login and token questions on a throwaway stack before any Cognito resource is built for real.

**Why now.** Phase 8 builds the real pools. If managed login cannot do username-only, auto-confirmed sign-up, you must decide the N-8
fallback ([B §B4](plan/B-scope-and-decisions.md#b4-where-this-plan-narrows-or-reinterprets-the-spec)) before that, not after.

| Field | Detail |
|---|---|
| J tasks | M0-15, M0-10, M0-14 |
| In scope | `spike.yml` (spike name from a choice list, `plan`/`apply`/`destroy`, backend key `spikes/<spike>/terraform.tfstate`, `environment: prod`); throwaway auth stack (player pool with pre sign-up trigger, operator pool with TOTP and `admin` group, a tiny HTTP API with a JWT authoriser whose Lambda logs the event and checks `zoneinfo.ZoneInfo("Europe/London")` on `python3.14`); every check listed in M0-10 and [E §E.7.5](plan/E-architecture.md#e75-main-risk-managed-login-sign-up), plus whether the chosen auth library verifies token signatures in the browser ([I §I.2.6](plan/I-validation.md#i26-front-end-tests-what-runs-where)); the unverified-facts register |
| Out of scope | Production pools; any player-facing UI |
| Files | `.github/workflows/spike.yml`; `spikes/auth-cognito/` (Terraform root, check notes); `api/tests/fixtures/authorizer/` (the captured event, redacted); `docs/decisions/0012-auth-spike.md`; `docs/decisions/unverified.md` |
| Depends on | Phase 0 (trust), Phase 4 (only one deploy pipeline besides this one). This order conflicts with [H §H.7](plan/H-infrastructure-and-delivery.md#h7-workflows-what-replaces-the-two-copies) ("never a destroy path once real resources exist") and J M0 (spikes before any M1 resource): the certificate, distributions and site buckets exist while `spike.yml` has a `destroy` action. Claude writes an ADR in this phase (next free number) recording the decision and its guard (the review check below), for your approval at this gate; the planner amends H §H.7 and J M0 to match, or the spikes move before Phase 2 (see open points) **[PROPOSAL]** |
| Owner actions | Dispatch `spike.yml` (`auth-cognito`: plan, apply); sign up a test child through managed login; sign in as an operator with TOTP; run the token checks Claude scripts in `spikes/auth-cognito/` (they call the spike API with your tokens; nothing is created); screenshot the cap message; dispatch `destroy`. If sign-up fails: decide N-8 at the gate |
| Tests and how to run | The spike's checks are manual and recorded; the captured event is replayed later as a pytest fixture (Phase 7) |
| Deployed / how to see | The spike stack, through `spike.yml` only, then destroyed. `aws s3 ls s3://prod-state-bucket-space-tower-defence/spikes/` (read-only) shows only spike keys |
| Exit criteria | ADR-0012 records each check with evidence; the spike stack's state is empty after `destroy`; the register lists every "Unverified items to check" row of A–J with the phase that settles it |
| Risks | Managed login unable to do the pool shape (owner decision N-8); `cognito:groups` serialised differently than expected in the authoriser event; forgetting to destroy |

**How to review this phase**

1. `spike.yml`: the `spike` input is a choice list, the working directory is built only from it, and the backend key always starts `spikes/`. Check that no input value, default or expression can make the backend key or the working directory resolve to `main/` or `infrastructure/main` (a `destroy` there would hit production); ideally a step fails the job if either does.
2. The spike's resource names start `space-tower-defence-spike-`.
3. The captured authoriser event: tokens removed; `cognito:groups` and `scope` shapes noted in the ADR (the router in Phase 7 depends on them).
4. ADR-0012: findings with evidence, not opinions; the 401-versus-403 answer for a token without the route scope.
5. The register: every row has a phase number; nothing settled is left unticked.

*Concepts worth learning:* **OAuth authorisation code flow with PKCE** (why a browser app cannot keep a client secret, and what the code
verifier proves); **access token versus ID token** (scopes live in the access token, which is the one the API accepts).

---

### Phase 6 — DynamoDB and browser-audio spikes; spike tooling removed

**Goal.** Capture real DynamoDB transaction failures as fixtures, prove browser audio storage and offline playback, then delete every spike stack and the spike workflow.

**Why now.** The server code in Phases 7 and 15–17 classifies transaction cancellations, and the speech service (Phase 19) needs the
`sha256` source; both answers must be real before that code is written. Deleting `spike.yml` before any table or user pool exists
(Phase 8) means a workflow with a `destroy` action never coexists with children's data.

| Field | Detail |
|---|---|
| J tasks | M0-13, M0-12; the end of M0-15 (workflow and spike roots deleted); M1-10 (part 3: gate G-5 repository invariants, now that no workflow may contain `destroy`) |
| In scope | Throwaway table: G5-shaped `TransactWriteItems`, `CancellationReasons` per failure, `ReturnValuesOnConditionCheckFailure`, nested-map `SET` after `planets = {}`, reserved words; the same in moto. Throwaway bucket with CORS for `localhost`, one MP3 uploaded by Terraform with `checksum_algorithm = "SHA256"`; a small standalone page that fetches via a presigned GET, stores with `idb`, plays offline; `navigator.storage.persist()`, a quota error, a Web Lock; Safari `play()` after an awaited fetch; `HeadObject` with checksum mode. `scripts/check_invariants.py` (G-5) in `release.yml` and `ci.yml`, **with the first two G-5 rules only**: no `destroy`, `-auto-approve` or `update-function-code` in `.github/`, and no `custom_error_response` in modules. The rule "every `lambda_function` call has alarms" lands in Phase 9 (functions arrive in Phase 8 without alarms) and "both tables in the backup selection" in Phase 33; adding either earlier would fail every release in between |
| Out of scope | Production tables; the real audio module (Phase 22); the G-5 alarm rule (Phase 9) and backup rule (Phase 33) |
| Files | `spikes/ddb-transactions/` (Terraform root, `capture.py`, `test_moto_vs_real.py`); `api/tests/fixtures/ddb/`; `spikes/audio-idb/` (Terraform root, `page/`); `docs/decisions/0015-browser-audio-storage.md`; `scripts/check_invariants.py`, `scripts/tests/test_check_invariants.py`; deleted at the end: `.github/workflows/spike.yml`, every Terraform root under `spikes/` |
| Depends on | Phase 5 (`spike.yml`), Phase 1 (`idb` and Vite available) |
| Owner actions | Dispatch `spike.yml` apply for `ddb-transactions` and `audio-idb`. Run `capture.py` from your laptop against the throwaway table (it writes items to that table only; if you prefer every AWS write in CI, say so and `spike.yml` gains a `run` action). Generate the presigned URL locally (signing makes no AWS call); open the spike page in each browser the family uses; run `aws s3api head-object --checksum-mode ENABLED` (read-only). Dispatch `destroy` for both, then approve deleting the workflow |
| Tests and how to run | `pytest spikes/ddb-transactions` (moto versus the captured real responses); `python3 -m pytest scripts/tests` (each G-5 rule fed a small bad file) |
| Deployed / how to see | Two spike stacks, then destroyed. Browser notes or a short screen recording of offline playback in ADR-0015 |
| Exit criteria | Fixture files hold real cancellation responses for session-fence, revision and slot-status failures; the moto comparison test passes or documents each difference; ADR-0015 records the playback API, persist/quota behaviour and the checksum result (or the metadata fallback); every spike state under `spikes/` is empty; `spike.yml` and the Terraform under `spikes/` are deleted; `grep -rn -- 'destroy\|-auto-approve\|update-function-code' .github/` finds nothing and G-5 (its first two rules) is green |
| Risks | moto's cancellation reasons differ from the real service (that is why real ones are captured); autoplay rules block playback; a spike left undestroyed when the workflow is deleted (check the state keys first) |

**How to review this phase**

1. `api/tests/fixtures/ddb/`: real responses, with the `CancellationReasons` order matching the transaction's action order.
2. `test_moto_vs_real.py`: where moto differs, is the difference written down where Phase 16 will see it?
3. ADR-0015: which browsers were tried, and what happens in a private window (storage refused → online-only).
4. The checksum result: does `HeadObject` give the SHA-256 directly, or does `tts` need to store it as metadata?
5. `scripts/check_invariants.py`: each rule has a failing sample in its test; only the workflow-string and `custom_error_response` rules exist yet.
6. The S3 listing under `spikes/`: only empty states before the workflow is deleted.

*Concepts worth learning:* **DynamoDB transactions from the application's side** (all-or-nothing, and how a cancellation tells you which
condition failed); **IndexedDB** (a database in the browser per origin, asynchronous, cleared by the browser under storage pressure unless persisted).

---

### Phase 7 — Python API skeleton

**Goal.** Create the `api/` package with four function entry points, the shared helpers every handler will use, the route catalogue and reproducible Lambda zips, tested locally.

**Why now.** Phase 8 deploys the functions and needs real zips; the route catalogue must exist before the API (Phase 9) so the plan gate
and smoke test have something to compare against. The first pytest + moto tests arrive with the first Python code
([I §I.2.2](plan/I-validation.md#i22-the-order-the-tools-arrive-in)).

| Field | Detail |
|---|---|
| J tasks | M1-09, M1-12 (part 1: `contracts/routes.json`), M1-15 (part 1: `cognito_presignup` with the daily cap, fail closed) |
| In scope | `api/functions/{player_api,admin_api,tts,cognito_presignup}/`; `api/shared/` (data-access helper with `ConsistentRead` and `ExpressionAttributeNames`, error envelope, allow-list logger, route-key authorisation that denies unknown keys before any lookup); Powertools, ruff (`target-version = "py312"` locally, see [How we work](#local-toolchain-and-how-tests-run-on-your-machine)), pytest + moto; `scripts/build_lambdas.py` (arm64, 3.14 wheels, fixed timestamps, sorted entries); `contracts/routes.json` (R1–R30 from [G §2](plan/G-api-contracts.md#2-route-catalogue)); the pre sign-up handler (auto-confirm, cap in `SYS#SIGNUPS`, raise at the cap, never `autoConfirmUser=false`); Python job in `ci.yml` on 3.14 |
| Out of scope | Real route handlers (stubs answer catalogued routes with a `501` envelope **[ASSUMPTION]**); any deployment |
| Files | `api/requirements.txt`, `api/requirements-dev.txt`, `api/pyproject.toml` (tool settings) **[ASSUMPTION]**; `api/functions/*/handler.py`; `api/shared/`; `api/tests/unit/`; `scripts/build_lambdas.py`, `scripts/tests/test_build_lambdas.py`; `contracts/routes.json`; `.github/workflows/ci.yml` |
| Depends on | Phase 6 (DynamoDB fixtures), Phase 5 (authoriser event fixture) |
| Owner actions | None beyond the review. Optional: install Python 3.14 (`uv python install 3.14`) |
| Tests and how to run | `cd api && python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt && pytest && ruff check .`; `python3 scripts/build_lambdas.py` twice, then `sha256sum build/*.zip` gives identical hashes |
| Deployed / how to see | Nothing. CI shows the Python job green on 3.14 |
| Exit criteria | pytest and ruff green locally (3.12) and in CI (3.14); a test proves an unknown route key is denied before any DynamoDB call (the fake records zero calls); the presignup test at the cap raises; two builds give identical zip hashes; `routes.json` has 30 entries, each with method, path, function, authoriser |
| Risks | A pinned dev package not installing on 3.12 **[UNVERIFIED]** (fall back to installing 3.14 locally); a missing arm64 wheel; non-reproducible zips (every release would show every function changing) |

**How to review this phase**

1. `api/shared/` logger: only allow-listed fields are ever written; ask Claude to show what happens to an unexpected field.
2. The router: the route key comes from the gateway event, and anything not in this function's allow-list is refused first.
3. The presignup handler and its tests: at the cap it raises; it never lets a user in unconfirmed.
4. `scripts/build_lambdas.py`: what makes the zip reproducible (file order, timestamps, permissions).
5. `contracts/routes.json` against [G §2](plan/G-api-contracts.md#2-route-catalogue): same routes, same authoriser per route.
6. A moto test: read one and ask "would this fail if the condition expression were wrong?"
7. `ci.yml`: the Python job uses 3.14; the local `ruff` target keeps the code 3.12-compatible.

*Concepts worth learning:* **pytest fixtures** (setup shared between tests, injected by name) and **moto** (an in-process fake of AWS APIs:
fast, but not a perfect copy, which is why the real fixtures from Phase 6 exist).

---

### Phase 8 — Data, sign-in and functions deployed

**Goal.** Deploy both tables, the audio bucket, both Cognito pools and the four functions through the release, and sign in through managed login for real.

**Why now.** The auth spike has answered the sign-up question and the zips are reproducible. Deploying data and identity before the API
keeps this gate to resources you review at expert speed, with protection flags on from the first apply (P26).

| Field | Detail |
|---|---|
| J tasks | M1-04, M1-05, M1-06 (part 1: `lambda_function` ×4 with stub handlers, per-function roles), M1-10 (part 4: Lambda build, content-hash upload, manifest, `lambda_artifacts`) |
| In scope | `dynamodb_table` ×2 (PITR, deletion protection, `prevent_destroy`, TTL attribute only on `game`); `private_bucket` for audio (CORS from the two origins, clips under `tts/v1/`); `cognito_pool` ×2 per ADR-0012 (player pool + trigger + cap; operator pool with TOTP and `admin` group; prefix domains; resource servers and scopes `game/play`, `ops/content`; PKCE clients); `lambda_function` ×4 (log group first, role beside function, zip by `s3_key` + hash, `player-api` timeout 25 s, `tts_*` variables to `tts` and `admin-api`, `tts` role with prefix-scoped `s3:ListBucket` on `tts/v1/*` and no `content` read); release build of four zips to `lambda/<key>/<sha256>.zip` with `If-None-Match: *`; `release.tfvars.json`; operator-accounts runbook |
| Out of scope | The HTTP API and the `/api/*` behaviour, alarms (Phase 9); any real handler logic |
| Files | `infrastructure/modules/dynamodb_table/`, `private_bucket/`, `cognito_pool/`, `lambda_function/`; [main/main.tf](../infrastructure/main/main.tf), `outputs.tf`; `.github/workflows/release.yml` (build job); `infrastructure/plan-guard.json`; `docs/runbooks/operator-accounts.md` |
| Depends on | Phases 5, 6, 7 |
| Owner actions | Dispatch the release and apply. Create the operator account with `AdminCreateUser` per the runbook and enrol TOTP; create `test-player-1`, `test-player-2` and `test-operator` ([I §I.2.10](plan/I-validation.md#i210-test-accounts-and-test-data)). Self-sign-up one test child through managed login, then `AdminDeleteUser` it |
| Tests and how to run | `terraform validate`; plan-guard report lists the new protected types; the release's checks |
| Deployed / how to see | Tables, bucket, pools, functions. Read-only: `aws dynamodb describe-table` (deletion protection, PITR), `aws cognito-idp describe-user-pool` (deletion protection `ACTIVE`, trigger), managed-login sign-up page on the player prefix domain |
| Exit criteria | A test child signs up and signs in through managed login; the operator signs in with TOTP; plan showed four functions with the E.6.4 roles; both tables and both pools have native deletion protection and `prevent_destroy`; the manifest lists four zips by hash |
| Risks | An app-client attribute change that forces replacement (the guard reports it); TTL enabled on the wrong attribute; IAM wider than E.6.4 |

**How to review this phase**

1. Each function's role against [E §E.6.4](plan/E-architecture.md#e64-per-function-iam): one table where possible, actions listed, no wildcards that are not needed.
2. `tts`: `s3:ListBucket` with an `s3:prefix` condition on `tts/v1/*`, no `content` table permission (P13).
3. Pools: callback and logout URLs are exactly the two hostnames; clients have no secret; scopes match `routes.json` authorisers.
4. Tables: `prevent_destroy`, deletion protection, PITR; `game` has the TTL attribute and nothing else expires.
5. The build job: zips uploaded by content hash; the manifest is the only thing that feeds `lambda_artifacts`; no `update-function-code` anywhere.
6. The runbook: how an operator is created and recovered, without a password ever in git or chat.

*Concept worth learning:* **artefact ownership** — Terraform owns Lambda code through the manifest's hash keys and the workflow owns static
files; nothing is owned twice ([H §H.9](plan/H-infrastructure-and-delivery.md#h9-artefact-ownership)). On the app side, how managed login
hands the browser a code that becomes tokens (seen for real here; the app uses it in Phase 21).

---

### Phase 9 — Same-origin API live

**Goal.** Put the HTTP API behind both distributions at `/api/*`, add monitoring, and prove that every route refuses a request without a token on both hostnames.

**Why now.** It completes the walking skeleton (page, sign-in, API) so every later phase can deploy real behaviour onto a path that already works.

| Field | Detail |
|---|---|
| J tasks | M1-06 (part 2: `http_api`), M1-07 (part 2: `/api/*` behaviour), M1-08, M1-10 (part 5: G-12, G-13, API smoke, full `config.json`), M1-11 (part 2: smoke on both hostnames, SNS, test alarm, sign-in checks) |
| In scope | `http_api`: payload 2.0, `$default` stage, access-log allow-list including `integrationLatency`, `integrationError`, `authorizerError` (P24), two JWT authorisers, every route from `routes.json` with its scope, explicit throttles, Lambda permissions; `/api/*` behaviour with `CachingDisabled` and `AllViewerExceptHostHeader`; `monitoring` (SNS + us-east-1 mirror, e-mail subscriptions, the H.14 alarms that exist now, alarms wired into `lambda_function`); G-12 (plan route keys equal `routes.json`); G-13 (DynamoDB Local service container in `checks`, one trivial `ddblocal` test); smoke iterating `routes.json` without a token on both distributions; `config.json` with pool IDs, client IDs, managed-login domains, `apiBase` |
| Out of scope | Real route behaviour (stubs until their phases) |
| Files | `infrastructure/modules/http_api/`, `infrastructure/modules/monitoring/`; `infrastructure/modules/static_site/`, `lambda_function/` (alarms); `.github/workflows/release.yml`; `scripts/check_route_keys.py` and tests; `scripts/smoke.py`; `scripts/check_invariants.py` and `scripts/tests/test_check_invariants.py` (G-5 rule "every `lambda_function` call has alarms", added in the same commit that wires the alarms); `api/tests/integration/` |
| Depends on | Phase 8 |
| Owner actions | Dispatch the release and apply; confirm both SNS subscriptions within 48 h; `aws cloudwatch set-alarm-state` on one alarm and check the e-mail; record the release |
| Tests and how to run | `python3 -m pytest scripts/tests` (route-key check fails on a mismatching fixture); `pytest -m ddblocal` runs in CI only |
| Deployed / how to see | `curl -i https://aliens.jackgl.com/api/me` returns a 401 JSON body from the gateway, never HTML; the same on `admin.aliens.jackgl.com`; the release smoke summary lists 30 routes × 2 distributions |
| Exit criteria | Every H.8.6 smoke check green on both hostnames; every route 401 without a token on both distributions; G-12 and G-13 green; G-5's alarm rule green, and red on a test module call without alarms; both subscriptions confirmed and a test alarm e-mail received; `docs/releases/` entry |
| Risks | `source_arn` format for API Gateway permissions **[UNVERIFIED]**; bare `default_route_settings` meaning zero throttling **[UNVERIFIED]**; a CloudFront cache policy that drops the `Authorization` header |

**How to review this phase**

1. `http_api`: every route has an authoriser and a scope; there is no route without one; route keys keep `/api` (P3).
2. Throttles are explicit numbers, not module defaults.
3. Access-log format: only allow-listed fields, no headers, no bodies.
4. The `/api/*` behaviour: caching disabled, the origin request policy forwards everything except `Host`, and the SPA function is not attached to it.
5. Alarms: one `Errors` and one `Throttles` per function; CloudFront alarms in us-east-1 on the mirror topic; the new G-5 rule would catch a fifth function added without them.
6. `scripts/check_route_keys.py`: what it reads from `terraform show -json`, and its failing test.
7. `config.json` contents: identifiers only, no secrets.

*Concept worth learning:* **two layers of authorisation** — the gateway's JWT authoriser rejects a missing or wrong token before your code
runs, and the function still checks the route key and groups itself ([E §E.7.3](plan/E-architecture.md#e73-token-checks-gateway-versus-function)).

---
## Stage B — Game core and the M1 slice (phases 10–23)

The slice's scope is [B §B3.2](plan/B-scope-and-decisions.md#b32-side-by-side) and J's choices J-1 to J-3
([J, M1](plan/J-execution-backlog.md#m1--thin-vertical-slice-one-planet-two-waves-one-activity-with-play-cloud-save)). From here on most
phases are application code, so the review guides lean towards the software ideas rather than AWS.

### Phase 10 — Fixed-timestep clock

**Goal.** Write the simulation's clock as a pure, tested function that gives exactly 60 steps per simulated second at any frame rate.

**Why now.** It is the first real game code, it needs nothing but Vitest, and it is the best small place to learn what a good test looks
like before the reducer arrives ([J §J.5](plan/J-execution-backlog.md#j5-the-fixed-timestep-clock-m0-09-background-for-its-review)).

| Field | Detail |
|---|---|
| J tasks | M0-09; M0-06 re-check (`tools/sim` self-test still green) |
| In scope | Tests first, then `clock.ts`: integer accumulator in units of 1/60,000 s, 250 ms clamp, speed multiplier, `MAX = 30` steps per frame with the remainder discarded, zero steps while paused |
| Out of scope | The simulation itself; anything Phaser |
| Files | `web/game-core/src/clock.ts`, `web/game-core/src/clock.test.ts` |
| Depends on | Phase 1 |
| Owner actions | — |
| Tests and how to run | `cd web && npm test -w game-core`; `python3 -B tools/sim/selftest.py` prints "selftest: all checks passed" |
| Deployed / how to see | Nothing; the test output |
| Exit criteria | 60 steps per simulated second at 30, 60 and 144 Hz; a 2 s gap at 2x gives at most 30 steps and an empty accumulator; paused gives zero; the module imports nothing and never calls `performance.now()` |
| Risks | A float accumulator that passes at 60 Hz and fails at 144 Hz; tests that pass because they test the wrong thing |

**How to review this phase**

1. Read the tests before the code: do they say, in plain words, what the clock promises?
2. The 144 Hz test feeds the repeating 417/417/416 pattern, not `1000/144` floats ([J §J.5](plan/J-execution-backlog.md#j5-the-fixed-timestep-clock-m0-09-background-for-its-review)).
3. Change `MAX` to 31 or remove the discard: does a test fail? It should.
4. The function takes the elapsed time as an argument; nothing reads a real clock.
5. The commit order: the test commit came first and failed, then the code made it pass.

*Concepts worth learning:* the **fixed timestep** (same inputs, same steps, same result on any laptop) and **test-first** (write the
promise as a test, watch it fail, then make it pass).

---

### Phase 11 — Contracts and the TypeScript rules reducer

**Goal.** Define the M1 op schemas, shared limits and fixtures, and implement the reducer and the multiple-choice canonicaliser in TypeScript against them.

**Why now.** Every later layer (server mirror, ops endpoint, player sync) obeys this one set of rules; writing them first, as data and as
a pure function, means the server and client can be checked against the same files.

| Field | Detail |
|---|---|
| J tasks | M1-12 (part 2: schemas, limits, fixtures), M1-13 |
| In scope | JSON Schemas for the op envelope and the six M1 ops (`SAVE_PREP`, `START_WAVE`, `COMPLETE_WAVE`, `SUBMIT_ATTEMPT`, `DEFEAT`, `ABANDON`); TypeScript types generated from the schemas; the shared limits file; first op-sequence and answer fixtures; the reducer `(state, op) → new state or refusal` and the next-phase rule in `game-core`; the canonicaliser in `web/shared` for `MULTIPLE_CHOICE` (one string ≤ 64 characters, P6) |
| Out of scope | M2 ops; other interaction types (Phases 37–38) |
| Files | `contracts/schemas/`, `contracts/fixtures/ops/`, `contracts/fixtures/answers/`; `web/shared/src/limits.ts`; `web/game-core/src/rules/`; `web/shared/src/learning/canonical.ts` |
| Depends on | Phases 7 (routes catalogue), 10 |
| Owner actions | — |
| Tests and how to run | `cd web && npm test` runs every fixture sequence and answer vector; a payload with an unknown field fails schema validation |
| Deployed / how to see | Nothing |
| Exit criteria | Vitest runs every M1 fixture and produces the expected views and refusals; types come from the schemas, not hand-written twice |
| Risks | Fixtures written from the implementation's output instead of from [F §3](plan/F-state-and-data.md#3-run-state-machine) and the spine (they must come from the spec) |

**How to review this phase**

1. Pick one fixture file and read it as a story: starting state, ops, expected result. Does it match [F §3.3](plan/F-state-and-data.md#33-operations-the-only-ways-run-state-changes)?
2. The reducer never mutates its input; every refusal has a named reason.
3. The next-phase rule: one function that says what phase follows; no copy of it elsewhere.
4. `canonical.ts`: no `trim()`, `Number()` or case folding built-ins ([C §C20.1](plan/C-game-and-learning-design.md#c201-canonical-answers-one-normaliser-exact-equality)).
5. Schemas: `additionalProperties: false`; limits come from the shared file.

*Concepts worth learning:* the **reducer** (a pure function from state and action to new state; it is how the client decides whether an
op may exist at all) and **schemas as contracts** (one definition, checked on both sides).

---

### Phase 12 — Python reducer mirror

**Goal.** Implement the same M1 rules in Python and prove, with the same fixture files, that both reducers agree.

**Why now.** The ops endpoint (Phase 17) runs this mirror; agreeing now, on fixtures, is far cheaper than finding a disagreement in a live save.

| Field | Detail |
|---|---|
| J tasks | M1-14 |
| In scope | `api/shared/rules/` mirroring `game-core/src/rules/`; pytest loading `contracts/fixtures/` directly |
| Out of scope | Persistence; handlers |
| Files | `api/shared/rules/`, `api/tests/unit/test_rules_fixtures.py` |
| Depends on | Phases 7, 11 |
| Owner actions | — |
| Tests and how to run | `cd api && pytest tests/unit/test_rules_fixtures.py`; CI runs both suites |
| Deployed / how to see | Nothing |
| Exit criteria | pytest runs the same fixture files as Phase 11 with identical results |
| Risks | Integer and rounding differences between languages; a fixture "fixed" in one language only |

**How to review this phase**

1. Put the TypeScript and Python reducers side by side: same structure, same names, same refusal reasons.
2. Integer arithmetic only; no floats in credits or health.
3. The pytest reads the fixture files, it does not copy them.
4. Break one fixture's expected value: both suites must fail.

*Concept worth learning:* **shared fixtures as an executable specification** — two implementations, one set of examples, so neither can drift quietly.

---

### Phase 13 — First game data

**Goal.** Publish the first ruleset, the M1 challenge wave set, `current.json` and the bounds file through the release.

**Why now.** The battlefield (Phase 14) and run creation (Phase 16) should use real, versioned game data rather than ad hoc fixtures.

| Field | Detail |
|---|---|
| J tasks | M1-23; gate G-15 (wave-set action limit), brought forward from M4 because the first wave set appears here **[PROPOSAL]** |
| In scope | Ruleset (`mechanics` 1) and planet document with the M1 `CHALLENGE` wave set (J-1); `current.json`; the bounds-file build script; `load_bounds` in Python; G-15 test with an oversized fixture; create-only publish in the release |
| Out of scope | The 50-wave campaign (Phase 50) |
| Files | `game-data/ruleset/`, `game-data/campaign/`, `game-data/current.json`; `web/game-core/scripts/build-bounds.ts`; `api/shared/bounds.py`; `.github/workflows/release.yml` (game-data publish) |
| Depends on | Phases 9, 11, 12 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd web && npm test` (G-15 and campaign-shape tests); `cd api && pytest -k bounds`; `python3 -B tools/sim/selftest.py` |
| Deployed / how to see | `curl https://aliens.jackgl.com/game-data/current.json` returns the version pointers |
| Exit criteria | The release publishes the files create-only; `player-api` loads the bounds file via `load_bounds` in a test; version strings match `^[a-z0-9.-]{1,40}$` |
| Risks | Editing a published file in place (allowed before the freeze, but it should be a habit to add, not edit) |

**How to review this phase**

1. Compare the M1 numbers with `tools/sim/game_data.json`: where they differ, the commit says why.
2. The publish step refuses to overwrite an existing game-data object.
3. The bounds file is generated, never hand-edited.
4. G-15's oversized fixture is refused.

*Concept worth learning:* **versioned, immutable data files** — a run pins a version, so changing the game means adding a new file,
never editing the one a saved run uses ([spine S5.1](plan/00-spine.md#s51-pins-and-game-data)).

---

### Phase 14 — Battlefield slice (local)

**Goal.** Play the two-wave M1 run in a local browser: the real art, one route, a few pads, one class, one alien, a pause for the activity, completion and defeat.

**Why now.** It needs only the clock, the rules and the game data, not the deployed stack, so you can see and play the game long before
the first full slice release. A good moment to show the children ([B §B3.1](plan/B-scope-and-decisions.md#b31-two-different-things)).

| Field | Detail |
|---|---|
| J tasks | M1-21 |
| In scope | `game-core/src/sim/` (movement, firing, damage, wave flow, seeded RNG); Phaser scene drawing state only; `GameBridge` between React and Phaser; a local development entry that loads `game-data/` directly **[ASSUMPTION]**; the real art from `web/player/public/assets/` (already drawn, see [Phase 64](#phase-64--asset-pipeline-and-manifest)), loaded by path until the manifest exists |
| Out of scope | Sign-in, saving, the real learning panel (a placeholder "activity" pause stands in until Phase 22) |
| Files | `web/game-core/src/sim/`, `web/player/src/game/`, `web/player/src/game/GameBridge.ts` |
| Depends on | Phases 10, 11, 13 |
| Owner actions | Play it; optionally let the children try it |
| Tests and how to run | `cd web && npm test` (same seed and inputs → same post-wave snapshot); `npm run dev -w player` and open the battlefield |
| Deployed / how to see | Nothing deployed; local browser |
| Exit criteria | A two-wave run completes in the browser and a lost run reaches defeat; the snapshot test passes; `game-core` stays free of Phaser and DOM |
| Risks | Simulation logic leaking into the scene; React re-rendering every frame |

**How to review this phase**

1. The scene reads state and draws it; it decides nothing.
2. Randomness comes from a seeded generator passed in; no `Math.random`.
3. `GameBridge`: events out at most 10 per second; React does not re-render per frame.
4. The snapshot test: change one alien's speed and watch it fail.
5. Play with the browser's dev tools at a throttled CPU: it slows down rather than skipping (the clock's cap).

*Concepts worth learning:* **separating simulation from rendering** (the same rules can run in a test with no screen) and
**seeded randomness** (random-looking but repeatable).

---

### Phase 15 — Profile routes

**Goal.** Implement profile setup and the dashboard reads with the date of birth write-only and the age band derived in Europe/London.

**Why now.** Every other player route needs a profile, and the DOB rules are a privacy promise that is easiest to get right in a small handler.

| Field | Detail |
|---|---|
| J tasks | M1-15 (part 2) |
| In scope | `PUT /api/me/profile`, `PATCH /api/me/profile`, `GET /api/me` (optional `?sessionId=` for `activeElsewhere`, P16), `GET /api/planets`; age band with an injected clock; the AC-06 test cases ([I §I.3.1](plan/I-validation.md#i31-identity-and-ownership)) |
| Out of scope | Runs and sessions (Phase 16) |
| Files | `api/functions/player_api/`, `api/tests/unit/test_profile.py` |
| Depends on | Phases 7, 9 |
| Owner actions | Dispatch the release and apply (the routes go live behind the token check; token-level checks come with the player shell in Phase 21) |
| Tests and how to run | `cd api && pytest` |
| Deployed / how to see | Release smoke still 401 on every route without a token |
| Exit criteria | A test posts a known DOB and asserts it appears in no response body and no captured log line; the Europe/London birthday edge case passes |
| Risks | DOB leaking into an error detail or a log line |

**How to review this phase**

1. Search the handler and the logger for the DOB field name: it is written once and never read back into a response.
2. The clock is injected; tests set it to the eve of a summer birthday at 23:30 UTC.
3. Validation errors use the shared envelope and never echo input values.
4. `ConsistentRead` on the reads that need it.

*Concept worth learning:* **dependency injection for time** — passing "now" in, so a test can stand on any date.

---

### Phase 16 — Runs and the session lease

**Goal.** Create runs in one transaction, read them and their packs, and claim, renew and release the account-wide play session.

**Why now.** The ops endpoint (Phase 17) fences every op with the session generation and appends to a run; both must exist first.

| Field | Detail |
|---|---|
| J tasks | M1-16 |
| In scope | `POST /api/runs` (G7: lookup first, one transaction with `ConditionCheck PROFILE attribute_exists(pk)`, claim, run and slots; `takeover` and `409 TAKEOVER_CONFIRM_REQUIRED`; `409 CONTENT_VERSION_UNSUPPORTED`; `CONTENT_UNAVAILABLE{reason: PLANET_LOCKED}`), selection with threshold 1 (N-7), `GET /api/runs/{runId}`, `/pack`, `PUT`/`DELETE /api/session`; first `ddblocal` tests for G7 |
| Out of scope | Ops (Phase 17); takeover UI (Phase 61) |
| Files | `api/functions/player_api/`, `api/shared/selection/`, `api/tests/unit/`, `api/tests/integration/` |
| Depends on | Phases 6 (fixtures), 12, 13, 15 |
| Owner actions | — (deployed with Phase 17's release) |
| Tests and how to run | `cd api && pytest` locally (moto); `ddblocal` tests run in CI |
| Deployed / how to see | Nothing new until Phase 17 |
| Exit criteria | moto tests: repeating a create returns the same run; a second session gets `ACTIVE_SESSION_ELSEWHERE` with `deviceLabel`; a claim on a terminal run gets `409 RUN_TERMINAL`; a create without a profile is refused; another player's `runId` is `NOT_FOUND`; CI's G7 integration test green |
| Risks | Mis-classifying a transaction cancellation (use the Phase 6 fixtures) |

**How to review this phase**

1. The create path: a lookup first, so a repeat returns the existing run without a second transaction.
2. The transaction's action list against [F §12.3](plan/F-state-and-data.md#123-transaction-composition-and-action-counts): count them.
3. Cancellation handling reads `CancellationReasons` by position, matching the real fixtures.
4. `NOT_FOUND` for another child's run, never `FORBIDDEN` (no hint that it exists).
5. The lease: renew never falls back to claim.

*Concepts worth learning:* **idempotency** (doing the same request twice has the effect of doing it once) and the
**lease with a fencing token** (a numbered permission to write, so an old writer is refused even if it wakes up late).

---

### Phase 17 — The ops endpoint

**Goal.** Accept ordered op batches with revision checks, the session fence, duplicate detection and at-most-once rewards.

**Why now.** It is the one write path for run state; the player sync (Phase 21) and the learning panel (Phase 22) both depend on it.

| Field | Detail |
|---|---|
| J tasks | M1-17 |
| In scope | `POST /api/runs/{runId}/ops`: per-op order (a)–(i), G5 transaction, jittered retry, `recentOps`, per-op `outcome` (`VOIDED`, `NO_OP_VOIDED_SLOT`, `INCORRECT`, `RESOLVED_SUCCEEDED`, `RESOLVED_FAILED`, `DECLINED`; P18), HTTP status rules, one structured log line per op; `ddblocal` tests for G5 |
| Out of scope | M2 ops; `PROTOCOL_UNSUPPORTED` (Phase 62) |
| Files | `api/functions/player_api/`, `api/tests/unit/test_ops.py`, `api/tests/integration/test_g5.py` |
| Depends on | Phase 16 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest`; CI runs the integration tests |
| Deployed / how to see | Release smoke; behaviour is seen end to end in Phase 22 |
| Exit criteria | A replayed batch returns `ALREADY_APPLIED` with the original result; a wrong `expectedRevision` stops the batch and later ops are `NOT_PROCESSED`; the third wrong answer resolves `FAILED`; a correct one grants the reward exactly once |
| Risks | The duplicate check placed after the fence (breaks idempotency); retries that reuse a stale read |

**How to review this phase**

1. The order of checks (a)–(i) in [G §5](plan/G-api-contracts.md#5-the-ops-batch--post-apirunsrunidops-r11): duplicate check first.
2. Each op's transaction: session condition, revision condition, slot condition.
3. The log line: allow-listed fields only, one per op, `result` present (the `ops-rejected` alarm counts it).
4. The retry: re-reads before retrying, with jitter.
5. A test that sends the same batch twice concurrently (integration, CI).

*Concept worth learning:* **optimistic concurrency** — every write says which revision it expects, and the database refuses it if
someone else got there first.

---

### Phase 18 — Polly listening bake-off

**Goal.** Decide, by listening, which engine renders isolated phonemes and letter names, and which sounds may be published in isolation.

**Why now.** The speech service (Phase 19) hard-codes the engine selection and the SSML templates; this phase settles both
**[CONFIRMED by owner, 2026-11-14]** (O-1: Amy, generative, with `tts_phoneme_engine` decided here).

| Field | Detail |
|---|---|
| J tasks | M0-11 |
| In scope | A render script using the AWS CLI `SynthesizeSpeech` with exactly the canonical inputs the clip key will hash; the ~24-item test set on generative and neural; variants for risky sounds; other en-GB voices only where Amy fails on both engines ([D §D9.1](plan/D-ux-and-content-operations.md#d91-milestone-0-listening-spike-before-any-phonics-authoring)); an ignore line for the clip folder |
| Out of scope | The preview route (clips are re-rendered through it in Phases 19–20) |
| Files | `spikes/polly-listening/` (script, test set, SSML templates; clips ignored, never committed); [.gitignore](../.gitignore); `content/listening-verdicts.json`; `docs/decisions/0014-listening-bake-off.md` |
| Depends on | — (placed here because it de-risks Phase 19) |
| Owner actions | Run the render script with your credentials (creates nothing in the account); listen on speakers and headphones with a second adult, then the shortlist with one child; record scores |
| Tests and how to run | A small test that the script builds the same canonical input string the clip key will hash |
| Deployed / how to see | Nothing |
| Exit criteria | ADR-0014 records `tts_phoneme_engine` (`neural` unless generative passes), that Amy suits every kind, the frozen SSML templates; `content/listening-verdicts.json` has a verdict per sound (publishable · with small schwa · word-only) |
| Risks | Phonemes failing on both engines (fewer isolated sounds, or human recordings, the confirmed fallback); listening fatigue |

**How to review this phase**

1. The script's input strings are the canonical form, byte for byte, that Phase 19 hashes.
2. No clip files in git (`git ls-files spikes/polly-listening`).
3. The verdicts file's shape matches what G-14 will read.
4. The ADR says who listened and on what devices (no names needed).

*Concept worth learning:* **content addressing** — a clip's key is a hash of exactly what produced it, so the same input always finds the same clip.

---

### Phase 19 — Speech service

**Goal.** Serve approved clips to players by slot and render previews for operators, with clip keys that include voice and engine.

**Why now.** The admin approval path (Phase 20) and the Play button (Phase 22) both call it; the engine choice is now settled.

| Field | Detail |
|---|---|
| J tasks | M1-18; gate G-14 (speech definitions checked against `content/listening-verdicts.json`), brought forward because the first speech definition appears in Phase 20 **[PROPOSAL]** |
| In scope | `tts`: `POST /api/speech` (one consistent slot read under the caller's `sub`; clip from the slot's pinned clips map; `{clipKey, sha256, url (300 s), contentType, bytes}`; `503 SPEECH_UNAVAILABLE` on a missing object with one ERROR line for the metric filter) and `POST /api/admin/speech/preview` (synthesise only if absent, `PutObject If-None-Match: *`); `api/shared/clipkey.py`; engine by kind (`tts_engine` for WORD, INSTRUCTION, DICTATION; `tts_phoneme_engine` for PHONEME, LETTER_NAME); voice/engine allow-list in code; `tts_phoneme_engine` updated in [prod.tfvars.json](../infrastructure/envs/prod.tfvars.json) if ADR-0014 says `generative` |
| Out of scope | Admin pages (Phase 20); the client audio module (Phase 22) |
| Files | `api/functions/tts/`, `api/shared/clipkey.py`, `api/tests/unit/test_tts.py`; `scripts/check_speech_defs.py` and test (G-14) |
| Depends on | Phases 6 (`sha256` source), 16, 18 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest` (fake Polly client) |
| Deployed / how to see | Release smoke: both speech routes 401 without a token |
| Exit criteria | Preview of the same input twice calls Polly once; a changed `tts_engine` gives a different clip key and leaves approved bytes untouched; `sha256` equals the stored bytes' hash; another child's slot is `NOT_FOUND`; a missing clip returns 503 with the right log line |
| Risks | A missing object answered 403 instead of 404 if the `ListBucket` permission is wrong (checked in Phase 8's IAM) |

**How to review this phase**

1. `clipkey.py`: the exact inputs hashed, including voice, engine and format.
2. The player route never calls Polly (D-12, N-1).
3. The allow-list of voices and engines lives in code, with a test.
4. The presigned URL lifetime is 300 s and the response carries `sha256`.
5. G-14: a PHONEME definition for a `word-only` sound fails.

*Concept worth learning:* **the cache key is the identity** — because voice and engine are in the key, changing a setting creates new
clips instead of silently changing approved ones (O-1).

---

### Phase 20 — Minimal admin app and seed

**Goal.** Let the operator preview, play and approve the M1 clip and publish the M1 activity on `admin.aliens.jackgl.com`.

**Why now.** The slice needs one approved clip and one published activity, through the real paths (J-3).

| Field | Detail |
|---|---|
| J tasks | M1-19 |
| In scope | `admin-api`: speech draft and approve (definitions carry `kind`, `provider = polly`, `engine`, `voiceId`; approval records `clipKey`, `sha256`, render date), activity draft, validate and publish (subset); `scripts/seed_content.py` (dry-run by default, create-only) loading `ph-0102` and `phoneme-sh`; `web/admin`: operator sign-in, Speech page, Activity page |
| Out of scope | The full admin app (Phases 35–40) |
| Files | `api/functions/admin_api/`; `scripts/seed_content.py`; `content/seed/`; `web/admin/src/` |
| Depends on | Phases 8, 9, 19 |
| Owner actions | Dispatch the release and apply. Run the seed: dry run, then for real (it makes conditional writes to the `content` table from your laptop: data, not infrastructure **[PROPOSAL]**). Sign in as the operator; preview, listen, approve the clip; validate and publish the activity |
| Tests and how to run | `cd api && pytest`; `cd web && npm test -w admin`; `python3 scripts/seed_content.py --dry-run` |
| Deployed / how to see | `https://admin.aliens.jackgl.com`: sign in, Speech page, Activity page |
| Exit criteria | The approved version records the same `clipKey` as the preview; a second seed run reports "skipped, exists"; a player token is refused on every `/api/admin/*` route (401, never 2xx); an operator without `admin` gets `403 FORBIDDEN` |
| Risks | The seed overwriting (must be conditional); approving a clip that was never previewed |

**How to review this phase**

1. The approve handler refuses a speech version without a preview of the same draft revision.
2. The seed script: conditional writes, dry run by default, a clear report.
3. The admin sign-in uses the operator pool's client and the admin hostname's callback.
4. The group check happens in the function as well as the authoriser.
5. The admin bundle contains no Phaser (check the build output size and imports).

*Concept worth learning:* **draft → publish lifecycle** — drafts change freely, published versions never change, and a publish records
exactly which draft revision was reviewed.

---

### Phase 21 — Player shell

**Goal.** Sign in, set up a profile and reach Home on `aliens.jackgl.com`, with a serial, generation-stamped op queue and a sync chip.

**Why now.** The learning panel and the battlefield need a signed-in player and a way to send ops.

| Field | Detail |
|---|---|
| J tasks | M1-20 |
| In scope | `config.json` load; managed-login PKCE sign-in and sign-out; profile setup; Home; API client checking `ownerSub` before every request; serial queue with generation-stamped ops (online only); sync chip (`SYNCED`, `PENDING`, `RETRYING`, `AUTH_REQUIRED`); one page load = one account |
| Out of scope | Offline queue (Phase 58); takeover dialog (Phase 61) |
| Files | `web/player/src/` (app shell, routes, `sync/`, `api/`); `web/shared/src/api/` |
| Depends on | Phases 9, 11, 15 |
| Owner actions | Dispatch the release and apply; sign in as `test-player-1` |
| Tests and how to run | `cd web && npm test` (React Testing Library for the chip and queue with a fake transport) |
| Deployed / how to see | `https://aliens.jackgl.com`: sign up or sign in → profile → Home |
| Exit criteria | Sign up → profile → Home works on the real hostname; signing in as another child in a second tab makes the first tab stop and reload |
| Risks | Token refresh races; React re-rendering on every queue change |

**How to review this phase**

1. Where tokens live and how they are refreshed; nothing in `localStorage` that the plan does not allow.
2. The queue: one request in flight; every op stamped with the session generation.
3. The `ownerSub` check before each request.
4. The sync chip's copy against [D §D7](plan/D-ux-and-content-operations.md#d7-player-facing-copy-for-saving-sync-and-offline-states).
5. A component test: would it fail if the chip showed `SYNCED` while ops were pending?

*Concept worth learning:* **client state machines** — the sync chip is a small state machine; naming the states makes impossible
combinations impossible ([F §7](plan/F-state-and-data.md#7-client-sync-state-machine-per-account-client-only)).

---

### Phase 22 — Learning panel and Play: the slice joined

**Goal.** Join battlefield, panel, speech and saving: a run pauses for the activity, the child plays the clip, gets three tries and one reward, and a refresh keeps the attempts.

**Why now.** Every piece exists; this phase joins them into the M1 slice.

| Field | Detail |
|---|---|
| J tasks | M1-22 |
| In scope | Learning panel in `web/shared` (no Phaser), letters and words set in the self-hosted Andika reading font ([ADR-0013](decisions/0013-front-end-stack-versions.md)), greyed tries (D-8), feedback, reward, resume per phase; audio module with the Play rule **[CONFIRMED by owner, 2026-11-14]** (O-2: stored clip plays at once while `POST /api/speech` runs concurrently; otherwise wait, download, verify `sha256`, store, play; a different `clipKey` is logged and used next time); battlefield wired to the real run and ops |
| Out of scope | Other interaction types; offline |
| Files | `web/shared/src/learning/`, `web/shared/src/audio/`; `web/player/src/` (run screen) |
| Depends on | Phases 14, 19, 20, 21 |
| Owner actions | Dispatch the release and apply; play the run as `test-player-1` |
| Tests and how to run | `cd web && npm test` (panel and Play states with a fake transport and fake audio element) |
| Deployed / how to see | On `aliens.jackgl.com`: start the run, reach the activity, press Play, answer wrong twice, refresh, answer |
| Exit criteria | After two wrong answers and a refresh, two greyed tries and one attempt left; the third resolves; Play works after refresh; with the network throttled, a second Play starts before the `POST /api/speech` response and the request still appears in the network log |
| Risks | A speech failure counted as an attempt (it must not); a stored clip skipping the request (AC-19 needs every online Play to reach the service) |

**How to review this phase**

1. The Play handler: local bytes start playing and the request is still sent, in that order.
2. The `sha256` check before storing a downloaded clip.
3. A failed speech request leaves the attempt count unchanged.
4. Greyed tries are client-only; the server still counts every attempt it receives.
5. Resume: the panel's state comes from the saved slot, not from memory.

*Concept worth learning:* **optimistic UI with an authoritative server** — the browser shows the result at once but the server's answer decides what is saved.

---

### Phase 23 — M1 demonstrated, playtest P1

**Goal.** Walk the M1 "done when" list on production, record the decisions and run the first child playtest.

**Why now.** It closes M1 with evidence before M2 adds breadth.

| Field | Detail |
|---|---|
| J tasks | M1-24; first speech-latency measurement and one-clip browser check ([I §I.2.9](plan/I-validation.md#i29-manual-and-operational-tests)) |
| In scope | The [B §B3.2](plan/B-scope-and-decisions.md#b32-side-by-side) list on `aliens.jackgl.com`; ADR-0016…0018 for J-1…J-3; playtest P1 per [I §I.5](plan/I-validation.md#i5-child-playtest-protocol-ages-57); first E2E-D journey |
| Out of scope | Fixing everything P1 finds (findings become tasks) |
| Files | `docs/releases/`, `docs/decisions/0016-…` to `0018-…`, `docs/validation/playtests/`, `docs/validation/performance/`, `docs/validation/browsers.md`, `web/player/e2e/deployed/` |
| Depends on | Phase 22 |
| Owner actions | Run P1 with the children (notes without names); run the E2E-D journey from your laptop; measure Play latency per browser |
| Tests and how to run | `cd web && npx playwright test e2e/deployed` (with test-account passwords from your local environment, never committed) |
| Deployed / how to see | The slice on production |
| Exit criteria | A clip plays through the real service; three attempts and one reward; refresh keeps the attempts; leaving and returning resumes from the cloud save; release entry; P1 notes; latency and browser rows recorded |
| Risks | Declaring done on `*.cloudfront.net` only |

**How to review this phase**

1. Walk the list yourself on the real hostname.
2. Read the P1 notes: which findings change numbers (through the simulator) and which become tasks.
3. The three ADRs say `Accepted` after this gate.
4. The deployed Playwright test uses only test accounts.

*Concept worth learning:* **evidence over assertion** — "done" is a recorded observation, not a passing build.

---
## Stage C — Core game systems, M2 (phases 24–34)

Goal of the milestone: six classes, upgrades, selling, targeting, powers, the alien catalogue, carriers, bosses and the explicit run
lifecycle (`prompt.md:1273-1274`). Numbers are initial playtest settings from [C](plan/C-game-and-learning-design.md) **[PROPOSAL]**;
every number change goes through the simulator first.

### Phase 24 — Roster and economy

**Goal.** Six classes at three levels with purchase, upgrade, sell and refund, and deployment caps, validated at tick boundaries.
**Why now.** Everything else in M2 (targeting, aliens, HUD, bounds) acts on placed astronauts and credits.

| Field | Detail |
|---|---|
| J tasks | M2-01 |
| In scope | Roster data in the ruleset; economy commands applied at tick boundaries; refunds per C5.7 |
| Out of scope | Targeting modes (Phase 25); HUD (Phase 31) |
| Files | `web/game-core/src/sim/`, `game-data/ruleset/` |
| Depends on | Phase 23 |
| Owner actions | — |
| Tests and how to run | `cd web && npm test -w game-core`; `python3 -B tools/sim/selftest.py` |
| Deployed / how to see | Nothing; local battlefield with the new classes (`npm run dev -w player`) |
| Exit criteria | Rapid buy/sell commands never produce negative credits (AC-09); refunds match C5.7 |
| Risks | UI races producing negative balances |

**How to review this phase**
1. Commands are queued and applied at a tick, never mid-tick.
2. One test fires buy and sell in the same tick in both orders.
3. Class numbers come from the ruleset, not from code.
4. Refund rounding is integer and matches C5.7.
5. A new ruleset version was added rather than the M1 one edited, or the commit says why editing is still fine before the freeze.

*Concept:* **command queues at tick boundaries** — input becomes data that the simulation applies at a defined moment, which keeps it deterministic.

---

### Phase 25 — Targeting and support rules

**Goal.** Targeting modes (`FRONT`, `FAST`, `CROWD`, `STRONG`), slow cap and stacking, shield and repair limits, and the strongest-buff rule.
**Why now.** Aliens and bosses (Phases 26–27) are tuned against these rules.

| Field | Detail |
|---|---|
| J tasks | M2-02 |
| In scope | C5.3–C5.6 rules with one test each |
| Out of scope | New aliens |
| Files | `web/game-core/src/sim/` |
| Depends on | Phase 24 |
| Owner actions | — |
| Tests and how to run | `cd web && npm test -w game-core` |
| Deployed / how to see | Nothing; local battlefield |
| Exit criteria | Each C5.4–C5.6 rule has a passing test, including "no loops" between buffs |
| Risks | Feedback loops between buffs |

**How to review this phase**
1. Each targeting mode's tie-break is explicit and tested.
2. Buffs do not stack beyond the strongest; there is a test that would catch a loop.
3. Iteration order over units is fixed (determinism).
4. No floating-point comparisons in tie-breaks.
5. Names match the spine's enum (P5).

*Concept:* **deterministic ordering** — iterating a set in insertion or ID order, never "whatever order the engine picks".

---

### Phase 26 — Aliens, carriers and caps

**Goal.** The alien catalogue with traits, carriers and splitters, and object caps.
**Why now.** Bosses and the performance measurement need the full catalogue.

| Field | Detail |
|---|---|
| J tasks | M2-03 |
| In scope | Catalogue, traits, carrier release per C6.3, object caps; scene drawing them with the existing art from `web/player/public/assets/` |
| Out of scope | Bosses |
| Files | `web/game-core/src/sim/`, `web/player/src/game/` |
| Depends on | Phase 25 |
| Owner actions | — |
| Tests and how to run | `cd web && npm test` |
| Deployed / how to see | Local battlefield |
| Exit criteria | A carrier releases its descendants per C6.3; caps never exceeded in a stress wave |
| Risks | Object counts above the caps (performance) |

**How to review this phase**
1. The stress-wave test: what happens when a release would exceed the cap?
2. Traits are data, read from the ruleset.
3. Despawn and release order is deterministic.
4. The scene creates and recycles sprites rather than leaking them.
5. Carrier numbers match C6.3.

*Concept:* **object pooling** — reusing sprites instead of creating new ones, to keep frame time steady.

---

### Phase 27 — Bosses

**Goal.** Five bosses with phases.
**Why now.** The campaign and determinism tests need them.

| Field | Detail |
|---|---|
| J tasks | M2-04 |
| In scope | Boss definitions and phase transitions per C7 |
| Out of scope | Campaign placement (Phase 50) |
| Files | `web/game-core/src/sim/`, `game-data/ruleset/`, `tools/sim/` (if numbers change) |
| Depends on | Phase 26 |
| Owner actions | — |
| Tests and how to run | `cd web && npm test`; `python3 -B tools/sim/selftest.py` |
| Deployed / how to see | Local battlefield boss wave |
| Exit criteria | Simulator and Vitest agree a baseline defence beats each boss (C17.4: none requires a class or power) |
| Risks | A boss that needs a specific class or power |

**How to review this phase**
1. Each boss's phase change is a pure function of its health and time.
2. The baseline-defence test per boss.
3. Simulator output recorded in the commit message.
4. No boss state leaks between waves.
5. Numbers labelled as initial playtest settings.

*Concept:* **two models, one answer** — the Python simulator and the TypeScript game must agree; disagreement is a bug in one of them.

---

### Phase 28 — Meteor powers and determinism tests

**Goal.** Meteor powers in the simulation (`usePower`, charges, inventory cap) and the frame-rate determinism test over a boss wave.
**Why now.** Determinism (`prompt.md:303`, AC-13) can only be proved once powers and bosses exist.

| Field | Detail |
|---|---|
| J tasks | M2-05, M2-10 |
| In scope | Powers per C10; charges change only through use or the server grant; nothing crosses a wave except counts; the 30/60/144 Hz boss-wave test |
| Out of scope | Meteor offers UI (Phase 51) |
| Files | `web/game-core/src/sim/`, `web/game-core/src/**/*.test.ts` |
| Depends on | Phase 27 |
| Owner actions | — |
| Tests and how to run | `cd web && npm test -w game-core` |
| Deployed / how to see | Nothing |
| Exit criteria | Charges tests pass; a boss wave at 30, 60 and 144 Hz gives identical tick count and post-wave snapshot |
| Risks | A cooldown crossing a wave boundary (spine S4 forbids it); hidden wall-clock or `Math.random` use |

**How to review this phase**
1. The determinism test compares whole snapshots, not one number.
2. Search `game-core` for `Date`, `performance`, `Math.random`: none.
3. Power cooldowns reset at wave end.
4. Charge cap is enforced in one place.
5. The test runs in CI on every push.

*Concept:* **determinism as a test** — the claim "same on every laptop" is checked by running the same wave at three frame rates.

---

### Phase 29 — Full run lifecycle ops

**Goal.** The full op set and phase machine: `METEOR`, `DISMISS_SLOT`, `COMPLETION_OFFER`, `FINISH_RUN`, `CHOOSE_ENDLESS` plumbing, `ABANDON` UI, and the `PROFILE` best-wave write.
**Why now.** Bounds, saved games, summaries and offline all depend on the complete op set.

| Field | Detail |
|---|---|
| J tasks | M2-06 |
| In scope | Both reducers; fixtures for every cell of [F §3.5](plan/F-state-and-data.md#3-run-state-machine)'s phase × op matrix; `player-api` handling; `POST /api/runs/{runId}/endless` route plumbing |
| Out of scope | Endless content (Phase 54) |
| Files | `web/game-core/src/rules/`, `api/shared/rules/`, `api/functions/player_api/`, `contracts/fixtures/`, `contracts/schemas/` |
| Depends on | Phase 23 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd web && npm test`; `cd api && pytest` |
| Deployed / how to see | Release smoke; the ABANDON control on production. The completion offer has no player screen yet (M2-06 adds only the ABANDON UI); it is seen through the fixtures and API tests here and on screen from Phase 54 ("Choose endless after a campaign completion") |
| Exit criteria | Every matrix cell has a fixture; both reducers pass; a `player-api` test drives a run to `COMPLETION_OFFER` and then `FINISH_RUN` and `CHOOSE_ENDLESS` through the handler |
| Risks | Gaps in the phase × op matrix |

**How to review this phase**
1. Print the matrix and tick each cell against a fixture name.
2. Refusals are fixtures too, not only successes.
3. The `PROFILE` write happens in the same transaction as the wave completion.
4. Challenge runs never write best wave.
5. Schemas for new ops have `additionalProperties: false`.

*Concept:* **exhaustive state × event tables** — listing every combination is how you find the ones nobody thought about.

---

### Phase 30 — Plausibility bounds and the fixtures gate

**Goal.** Per-op plausibility checks against the stored snapshot, and shared fixtures as a release gate (G-3).
**Why now.** The full op set exists, so bounds can cover it and the fixtures can gate it.

| Field | Detail |
|---|---|
| J tasks | M2-07, M2-08 |
| In scope | Bounds file with `maxBounty`, prices, caps; S6 checks in `player-api`; property test over simulated legitimate waves; G-3 in `checks` |
| Out of scope | Server-side combat simulation (not in the design) |
| Files | `web/game-core/scripts/build-bounds.ts`, `api/shared/bounds.py`, `api/functions/player_api/`, `contracts/fixtures/`, `.github/workflows/release.yml`, `.github/workflows/ci.yml` |
| Depends on | Phase 29 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest -k bounds`; `cd web && npm test` |
| Deployed / how to see | Release run shows G-3 |
| Exit criteria | Thousands of simulated legitimate waves never trip a bound; a forged `COMPLETE_WAVE` with extra credits is `CHECKPOINT_OUT_OF_BOUNDS`; G-3 fails the release on any mismatch |
| Risks | Bounds too tight (false `REJECTED`, alarm fires) |

**How to review this phase**
1. The property test's generator: does it produce the worst legitimate case?
2. The forged-checkpoint fixture.
3. Bounds are generated from the ruleset, not typed in.
4. G-3 runs both reducers on the same files in the release.
5. The family-level trust model is respected: bounds limit gains, they do not try to prove play ([E §E.10](plan/E-architecture.md#e10-family-level-trust-model)).

*Concept:* **property-based testing** — instead of a few examples, generate many inputs and check a rule that must always hold.

---

### Phase 31 — HUD, shop and battlefield keys

**Goal.** Speed control, pause on hidden page or dialog, keyboard actions (D5.2), and HUD events at most 10 per second.
**Why now.** The roster and powers need controls; keyboard support is an acceptance criterion.

| Field | Detail |
|---|---|
| J tasks | M2-09 |
| In scope | HUD and shop in React; keyboard map; pause rules |
| Out of scope | Full accessibility pass (Phase 68) |
| Files | `web/player/src/hud/` |
| Depends on | Phase 28 |
| Owner actions | Play keyboard-only and mouse-only |
| Tests and how to run | `cd web && npm test -w player` |
| Deployed / how to see | Local at this gate; on production with the Phase 32 release (the next phase that dispatches one) |
| Exit criteria | The React profiler shows no per-frame commits; every battlefield action works mouse-only and keyboard-only |
| Risks | React re-rendering every frame |

**How to review this phase**
1. Record a React profile during a wave.
2. Every action has a key and a visible focus state.
3. Hidden tab and open dialog both pause.
4. HUD updates are throttled in the bridge, not in components.
5. Keys do not clash with browser shortcuts.

*Concept:* **throttling between a fast loop and a slow UI** — the game runs at 60 Hz, the interface only needs a few updates a second.

---

### Phase 32 — Saved games

**Goal.** List runs with a cursor, the soft cap of five open runs, best-effort pruning beyond 50 finished runs, and the Saved games screen.
**Why now.** With the full lifecycle, children accumulate runs.

| Field | Detail |
|---|---|
| J tasks | M2-12 |
| In scope | `GET /api/runs`; `RUN_LIMIT_REACHED`; pruning that never changes an op's result |
| Out of scope | Offline saved games |
| Files | `api/functions/player_api/`, `web/player/src/` |
| Depends on | Phase 29 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest`; `cd web && npm test` |
| Deployed / how to see | Saved games screen on production |
| Exit criteria | A sixth open run returns `RUN_LIMIT_REACHED`; the 51st finished run triggers pruning of the oldest |
| Risks | A prune failure changing an op result |

**How to review this phase**
1. Pruning runs after the op's write and swallows its own errors.
2. The cursor is opaque to the client.
3. Limits come from the shared limits file.
4. Tests for both caps.
5. The screen's copy for the limit.

*Concept:* **best-effort side work** — housekeeping that may fail without affecting the main result.

---

### Phase 33 — Backup and restore runbook draft

**Goal.** AWS Backup for both tables (daily, seven recovery points) with a failure alarm, and the restore runbook's first draft.
**Why now.** Real saves now exist on production; backups should start well before the freeze.

| Field | Detail |
|---|---|
| J tasks | M2-11 |
| In scope | `backup` module (vault, plan, selection by table ARN), `backup-job-failed` alarm; runbook procedures A–D |
| Out of scope | The drill (Phase 70) |
| Files | `infrastructure/modules/backup/`, [main/main.tf](../infrastructure/main/main.tf), `docs/runbooks/restore.md`, `scripts/check_invariants.py` (both tables in the selection) |
| Depends on | Phase 9 |
| Owner actions | Dispatch the release and apply; check recovery points after two days (read-only) and record the result in the gate log |
| Tests and how to run | `terraform validate`; invariants test |
| Deployed / how to see | `aws backup list-recovery-points-by-backup-vault` (read-only) |
| Exit criteria | At the gate: the deployed vault, plan and selection (both table ARNs) seen with read-only `describe` calls; G-5's backup rule green; runbook A–D written. Follow-up, not blocking: daily recovery points for both tables after two days, recorded in the gate log (at the latest at Phase 34's gate). Phase 34 does not wait for it |
| Risks | The Backup trust principal string **[UNVERIFIED]** |

**How to review this phase**
1. Selection by ARN, not by tag.
2. Vault and plan protected like the tables.
3. The alarm goes to the right topic.
4. The runbook's cut-over step bumps every `SESSION.generation` (spine S8.4).
5. G-5 now checks both tables are selected.

*Concept:* (AWS side, familiar) — the new idea is in the runbook: **fencing after a restore**, so no browser holding an old lease can write.

---

### Phase 34 — First performance measurement, playtest P2

**Goal.** Measure the busiest M2 waves on the children's laptop at 2x, set the AC-42 target, and run playtest P2.
**Why now.** The heaviest content exists; the target must be set from a real measurement before art adds load.

| Field | Detail |
|---|---|
| J tasks | M2-13 |
| In scope | Frame-time measurement procedure and record; ADR with the AC-42 target and a note for C14; P2 |
| Out of scope | Optimisation work (becomes tasks if needed) |
| Files | `docs/validation/performance/`, `docs/validation/playtests/`, `docs/decisions/` |
| Depends on | Phases 26, 27, 31 |
| Owner actions | Run the measurement on the children's laptop; run P2 |
| Tests and how to run | The measurement procedure in the record |
| Deployed / how to see | Production build on the children's laptop |
| Exit criteria | A recorded measurement with device, wave and frame-time figures; the AC-42 target written in an ADR; P2 notes |
| Risks | Measuring on a faster machine; art not yet packed into atlases (Phase 64) giving a different draw cost |

**How to review this phase**
1. The device is the one the children use.
2. The wave is the busiest one, at 2x.
3. The target is stated with its margin.
4. P2 findings are sorted into "number change (simulator first)" and "task".
5. The ADR updates C14 by reference.

*Concept:* **measure before optimising** — a target from the real device beats a guess.

---

## Stage D — Content and administration, M3 (phases 35–49)

Goal of the milestone: the age-banked content model, six interaction types, subject rotation, summaries, immutable publication and audio
review (`prompt.md:1276-1277`). D-1, D-2, D-4, D-5, D-7 and D-9 are built in here **[CONFIRMED by owner, 2026-11-14]**.

### Phase 35 — Admin app shell

**Goal.** Navigation, operator route guard, activity list and a bank-status placeholder, building on the minimal M1 pages.
**Why now.** Every later M3 phase adds a page to it.

| Field | Detail |
|---|---|
| J tasks | M3-01 |
| In scope | Shell, guard, list; "not authorised" for player accounts |
| Out of scope | Editor (Phase 39) |
| Files | `web/admin/src/` |
| Depends on | Phase 23 |
| Owner actions | Dispatch the release and apply; sign in |
| Tests and how to run | `cd web && npm test -w admin` |
| Deployed / how to see | `https://admin.aliens.jackgl.com` |
| Exit criteria | Operator signs in with TOTP; a player account sees "not authorised"; player token refused on every `/api/admin/*` (401) and operator without `admin` gets 403 |
| Risks | The admin app pulling in Phaser |

**How to review this phase**
1. The admin bundle has no Phaser.
2. The guard runs before any admin data request.
3. Server-side checks do not rely on the guard.
4. Navigation is keyboard-usable.
5. The bank page is clearly a placeholder.

*Concept:* **client guards are convenience, server checks are security.**

---

### Phase 36 — Activity lifecycle API

**Goal.** Draft, validate, publish, retire and withdraw activities with replay protection, locked identity fields and an audit trail.
**Why now.** The editor, templates and selection all build on it.

| Field | Detail |
|---|---|
| J tasks | M3-02 |
| In scope | `draftRevision` with `409 DRAFT_CONFLICT`; validation (one answer string ≤ 64 characters; separators `;` `=` `,` `\|` refused); publish with approved-speech condition checks, `fromDraftRevision` replay protection and `review{checklist, previewSolvedDraftRevision}` (P9); retire; withdraw `{version, reason}`; audit items; locked identity fields |
| Out of scope | Speech withdrawal (a runbook in v1, P10) |
| Files | `api/functions/admin_api/`, `api/tests/` |
| Depends on | Phase 35 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest` |
| Deployed / how to see | Through the admin app in Phase 39 |
| Exit criteria | Stale `draftRevision` → 409; replayed publish refused; locked field change refused; published versions never modified; withdraw writes the audit item |
| Risks | A publish race between two tabs |

**How to review this phase**
1. Published versions are written with "must not exist" conditions.
2. The locked fields list matches P9.
3. Validation errors name the field and rule.
4. The audit item is in the same transaction.
5. A test for two tabs publishing at once.

*Concept:* **immutability by condition** — the database itself refuses a second write to a published version.

---

### Phase 37 — Interaction types I: picture and number select

**Goal.** Player panels and canonicalisation for `PICTURE_SELECT` and `NUMBER_SELECT`.
**Why now.** Splitting M3-03 (an L task) keeps each review to a few types; selection types come first because they share the multiple-choice pattern from M1.

| Field | Detail |
|---|---|
| J tasks | M3-03 (part 1) |
| In scope | Two panels in `web/shared/src/learning/`; canonicaliser cases; answer vectors; keyboard and mouse operation per [D §D6](plan/D-ux-and-content-operations.md#d6-the-six-interaction-types-as-the-child-experiences-them) |
| Out of scope | The other types (Phase 38) |
| Files | `web/shared/src/learning/`, `web/shared/src/learning/canonical.ts`, `contracts/fixtures/answers/` |
| Depends on | Phase 22 |
| Owner actions | Try both types keyboard-only |
| Tests and how to run | `cd web && npm test -w shared`; `cd api && pytest -k answers` (shape only) |
| Deployed / how to see | Nothing deployed; a local development preview page for the panels **[ASSUMPTION]** |
| Exit criteria | Answer vectors pass; each type works mouse-only and keyboard-only |
| Risks | A second normaliser creeping in |

**How to review this phase**
1. One canonicaliser, extended, not a new one.
2. Vectors include tricky inputs from C20.
3. Each option has an accessible name.
4. Python checks shape only.
5. Four to six options enforced (D-8).

*Concept:* **accessible names** — tests and screen readers find controls by role and name, so both benefit from the same markup.

---

### Phase 38 — Interaction types II: object move, arrange, typed, two-step

**Goal.** Panels and canonicalisation for `OBJECT_MOVE`, `ARRANGE`, `TYPED` and two-step activities.
**Why now.** Completes the six types before the editor renders them.

| Field | Detail |
|---|---|
| J tasks | M3-03 (part 2) |
| In scope | Four panels; ARRANGE uses tile values; two-step answers joined by `\|`; letter tiles for age 5 (D-7) |
| Out of scope | Editor |
| Files | as Phase 37 |
| Depends on | Phase 37 |
| Owner actions | Try each keyboard-only |
| Tests and how to run | as Phase 37 |
| Deployed / how to see | Local preview |
| Exit criteria | All six types pass answer vectors and keyboard/mouse tests |
| Risks | Drag-only interactions with no keyboard path |

**How to review this phase**
1. Every drag has a keyboard equivalent.
2. `TYPED` disables spellcheck and autocorrect.
3. Two-step canonical form matches C20.3.
4. Tile values, not tile IDs, in ARRANGE answers.
5. Vectors for whitespace and leading zeros.

*Concept:* **canonical form** — turning many ways of saying the same answer into one string, so checking is a plain comparison.

---

### Phase 39 — Admin editor and preview-solve

**Goal.** Create, validate, preview-solve and publish one activity of each type, rendering the real player panel.
**Why now.** Content authoring (Phases 45–48) needs it.

| Field | Detail |
|---|---|
| J tasks | M3-04 |
| In scope | Editor per type; preview-solve with the shared panel; publish flow with checklist |
| Out of scope | Import (Phase 49) |
| Files | `web/admin/src/editor/` |
| Depends on | Phases 36, 38 |
| Owner actions | Dispatch the release and apply; author one activity per type |
| Tests and how to run | `cd web && npm test -w admin` |
| Deployed / how to see | Admin app |
| Exit criteria | One activity of each type created, validated, preview-solved and published |
| Risks | The editor allowing a choice activity with fewer than four options (publish must refuse) |

**How to review this phase**
1. Preview-solve uses the same component as the player.
2. Publish is disabled until preview-solve passed on this draft revision.
3. Validation messages are readable.
4. Unsaved changes are not lost on navigation.
5. Server validation is the authority.

*Concept:* **one component, two apps** — the operator sees exactly what the child will see.

---

### Phase 40 — Speech lifecycle and listening checklist

**Goal.** Full speech definitions, a listening checklist before Approve, and the machine check against listening verdicts.
**Why now.** Phonics authoring needs approved clips at scale.

| Field | Detail |
|---|---|
| J tasks | M3-05 |
| In scope | Kinds WORD · PHONEME · LETTER_NAME · INSTRUCTION · DICTATION; `provider`, `engine`, `voiceId`; checklist; G-14 over drafts as well as seed files |
| Out of scope | Speech withdrawal route (runbook only, P10) |
| Files | `web/admin/src/speech/`, `api/functions/admin_api/` |
| Depends on | Phases 18, 35 |
| Owner actions | Dispatch the release and apply; approve a few clips |
| Tests and how to run | `cd api && pytest`; `cd web && npm test -w admin` |
| Deployed / how to see | Admin Speech pages |
| Exit criteria | Approve disabled until preview played and checklist ticked; approved `clipKey` and `sha256` match the preview; a PHONEME draft for a `word-only` sound fails |
| Risks | Approving without listening (the checklist is a declaration, not proof) |

**How to review this phase**
1. The approve request carries the previewed `clipKey` and the server compares it.
2. The verdict check runs on the server, not only in the UI.
3. Kinds map to engines as O-1 says.
4. The render date is recorded.
5. Re-preview after a variable change creates a new key.

*Concept:* **binding approval to bytes** — the operator approves a specific clip, identified by its hash.

---

### Phase 41 — Templates

**Goal.** A pure, versioned Python generator module, exhaustive publish checks, and materialisation into slots at run creation.
**Why now.** Maths content depends on generators; selection (Phase 42) draws from them.

| Field | Detail |
|---|---|
| J tasks | M3-06 |
| In scope | Generators per C25; publish check up to 5,000 instances; materialisation |
| Out of scope | Content rows (Phase 46) |
| Files | `api/shared/generators/` |
| Depends on | Phase 36 |
| Owner actions | — |
| Tests and how to run | `cd api && pytest -k generators` |
| Deployed / how to see | Nothing visible |
| Exit criteria | Snapshot tests per `(kind, version)`; publish refuses a template whose domain has an invalid instance |
| Risks | A generator's output changing for the same `(kind, version)` |

**How to review this phase**
1. Generators take a seed and return data; no I/O.
2. Snapshot files exist per version and are never edited.
3. Generated answers are already canonical (checked against the vectors).
4. The 5,000 cap is enforced.
5. A new behaviour means a new version number.

*Concept:* **snapshot tests** — store the output once; any change fails the test until someone decides it is intended.

---

### Phase 42 — Selection and bank status

**Goal.** Subject rotation, seeded draws, no repeats, real eligibility thresholds, `CONTENT_UNAVAILABLE`, and the bank-status page.
**Why now.** Runs must be fillable from the real bank before content is authored at scale.

| Field | Detail |
|---|---|
| J tasks | M3-07 |
| In scope | Selection per C24; thresholds replace the M1 value of 1; bank-status page |
| Out of scope | Endless planning (Phase 54) |
| Files | `api/shared/selection/`, `web/admin/src/bank/` |
| Depends on | Phase 41 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest -k selection` |
| Deployed / how to see | Admin bank-status page |
| Exit criteria | Property test over many seeds: every slot filled, no activity repeated within a run; bank status matches counts |
| Risks | An age band reported eligible that cannot fill a run |

**How to review this phase**
1. Seeds come from the run, so a re-create gives the same draw.
2. The no-repeat rule is tested over many seeds.
3. Thresholds are configuration, labelled.
4. The status page and the selector use the same counting function.
5. `CONTENT_UNAVAILABLE` carries a reason.

*Concept:* **seeded selection** — random-looking but reproducible, so a bug report can be replayed.

---

### Phase 43 — Learning summaries

**Goal.** Summary counters written in the resolving transaction, `GET /api/me/progress`, and the My progress screen.
**Why now.** Badges and eligibility (Phase 52) read them.

| Field | Detail |
|---|---|
| J tasks | M3-08 |
| In scope | `SUM#` counters; route; screen; D-5 (meteor results count) |
| Out of scope | Learning-outcome badges (dropped in v1, P7) |
| Files | `api/functions/player_api/`, `web/player/src/progress/` |
| Depends on | Phase 29 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest`; `cd web && npm test` |
| Deployed / how to see | My progress screen |
| Exit criteria | Replaying a resolving op leaves counters unchanged; `DECLINED` and `VOIDED` never count |
| Risks | Double counting on replay |

**How to review this phase**
1. Counters update inside the resolving transaction, not after it.
2. Replay test.
3. The screen shows binary summaries only, no scores.
4. Copy is child-appropriate.
5. Counter keys match the spine.

*Concept:* **writing derived data atomically** — the summary changes in the same transaction as the fact it summarises.

---

### Phase 44 — Withdrawal and VOID

**Goal.** The server VOID path, `withdrawn` flag in the run view, child copy, and `DISMISS_SLOT` for withdrawn slots.
**Why now.** Withdrawal must work before real content is published at scale.

| Field | Detail |
|---|---|
| J tasks | M3-09 |
| In scope | VOID per F §4.4; D-9 (resolved slots stay as they were) |
| Out of scope | Offline VOID (Phase 60) |
| Files | `api/functions/player_api/`, `web/player/src/learning/` |
| Depends on | Phases 36, 29 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest`; `cd web && npm test` |
| Deployed / how to see | Withdraw a test activity and see the child copy |
| Exit criteria | Fixture: withdrawn version → `VOIDED`, reward once, summary unchanged |
| Risks | Voiding already-resolved slots |

**How to review this phase**
1. Only unresolved slots are voided.
2. The reward for a voided slot is granted once.
3. The child copy is calm and blame-free.
4. Fixtures in both reducers.
5. Audit trail of the withdrawal.

*Concept:* **compensating actions** — instead of rewriting history, record a new event that makes the outcome fair.

---

### Phase 45 — Content phase C: worked records

**Goal.** Author the worked records (about 17 activities, 12 clips) covering every type and mode.
**Why now.** Real content proves the editor and panels before bulk authoring.

| Field | Detail |
|---|---|
| J tasks | M3-10a |
| In scope | Seed files drafted by Claude from C's worked examples; your review, preview and approval |
| Out of scope | Bulk content |
| Files | `content/seed/`; `docs/validation/content-c-keyboard-checklist.md` |
| Depends on | Phases 39, 40 |
| Owner actions | Run `seed_content.py` dry run, then real; preview, listen, approve, publish; fill in the keyboard/mouse checklist |
| Tests and how to run | G-14 in CI; `python3 scripts/seed_content.py --dry-run` |
| Deployed / how to see | Admin bank status; a child account plays them |
| Exit criteria | The admin bank-status page shows the C-phase counts (about 17 published activities, 12 approved clips, each clip with a review record); a keyboard/mouse checklist (each type and mode, mouse-only and keyboard-only, pass or fail) recorded in `docs/validation/` and linked from the gate log |
| Risks | Answer-key mistakes |

**How to review this phase**
1. Each record's answer against its question, by hand.
2. British spelling throughout.
3. Pictures are text-free where the type requires it.
4. Clips listened to, not only previewed.
5. No test-only activity published (I.2.10).

*Concept:* **content is code** — it goes through review and validation like any change.

---

### Phase 46 — Content phase D: maths generators

**Goal.** The first eight generator kinds and about 30 maths template rows.
**Why now.** Maths groups reach threshold mostly through templates.

| Field | Detail |
|---|---|
| J tasks | M3-10b |
| In scope | Generators and rows per C25 and C26.3 |
| Out of scope | Phonics, spelling |
| Files | `content/seed/`, `api/shared/generators/` |
| Depends on | Phases 41, 42, 45 |
| Owner actions | Dispatch the release and apply (the new generator kinds in `api/shared/generators/` must be deployed before their rows can be published); run `seed_content.py` dry run, then real; review rows; publish |
| Tests and how to run | `cd api && pytest -k generators`; `python3 scripts/seed_content.py --dry-run` |
| Deployed / how to see | Bank status |
| Exit criteria | Maths groups at threshold in every band |
| Risks | Domains too small for the no-repeat rule |

**How to review this phase**
1. Domain sizes against the per-run need.
2. Snapshots for each new kind.
3. Age-band pitch per C.
4. Answers canonical.
5. Bank status screenshot in the gate log.

*Concept:* **domain size** — how many distinct questions a template can make, which limits how long a child can play without repeats.

---

### Phase 47 — Content phase E: phonics

**Goal.** Phonics items for age 5, then 6, then 7, with every clip reviewed.
**Why now.** Follows the verdicts and the speech lifecycle.

| Field | Detail |
|---|---|
| J tasks | M3-10c |
| In scope | Drafts by Claude; your listening and approval; tier B/C sounds per verdicts |
| Out of scope | Sounds marked word-only (refused by G-14) |
| Files | `content/seed/` |
| Depends on | Phases 42, 45 |
| Owner actions | Run `seed_content.py` dry run, then real; listening sessions; approval; publish |
| Tests and how to run | G-14 in CI; `python3 scripts/seed_content.py --dry-run` |
| Deployed / how to see | Bank status |
| Exit criteria | Phonics groups at threshold; every clip has a review record |
| Risks | Listening fatigue; tier B/C sounds |

**How to review this phase**
1. Sample clips per band on speakers and headphones.
2. No word-only sound used in isolation.
3. Review records complete.
4. Distractors follow C's rules.
5. Bank status per band.

*Concept:* none new; this phase is mostly your listening time. If authoring is slow, you may move Phases 47–48 after Phase 63 at a gate (record it in the gate log); M4 needs only selection, not a full bank. **[PROPOSAL]**

---

### Phase 48 — Content phase F: spelling

**Goal.** Spelling items for age 5 (tiles and pictures), then 6, then 7.
**Why now.** Completes the three subjects.

| Field | Detail |
|---|---|
| J tasks | M3-10d |
| In scope | Drafts; D-1 dictation clips; D-7 tiles at age 5 |
| Out of scope | Typed words at age 5 |
| Files | `content/seed/` |
| Depends on | Phases 42, 45 |
| Owner actions | Run `seed_content.py` dry run, then real; review, approve, publish |
| Tests and how to run | G-14; validation; `python3 scripts/seed_content.py --dry-run` |
| Deployed / how to see | Bank status |
| Exit criteria | Spelling groups at threshold |
| Risks | British spelling errors in AI-assisted drafts |

**How to review this phase**
1. Spelling checked against a British dictionary.
2. "Which is spelt correctly?" distractors are not real homophones.
3. Dictation clips approved.
4. Age-5 items use tiles or pictures only.
5. Bank status.

*Concept:* none new.

---

### Phase 49 — Spreadsheet import (optional)

**Goal.** Import drafts from a spreadsheet export, create-only, with a skip report.
**Why now.** Last M3 item; skip it if seed files are enough (decide at the Phase 48 gate).

| Field | Detail |
|---|---|
| J tasks | M3-11 |
| In scope | Admin import page creating drafts only |
| Out of scope | Publishing through import |
| Files | `web/admin/src/import/` |
| Depends on | Phase 39 |
| Owner actions | Decide whether you want it; if yes, dispatch the release and apply, then try it on the admin app |
| Tests and how to run | `cd web && npm test -w admin` |
| Deployed / how to see | Admin import page |
| Exit criteria | Importing a file twice creates nothing the second time and reports every row skipped |
| Risks | Overwriting operator content |

**How to review this phase**
1. Conditional creates only.
2. The skip report lists every row.
3. Nothing is published.
4. Large files handled in pages.
5. Errors per row, not one failure for the file.

*Concept:* **idempotent imports** — running the same import twice is harmless.

---
## Stage E — Campaign, progression, challenges and endless, M4 (phases 50–56)

Goal of the milestone: the 50-wave schedule, meteor challenges, badges, planet eligibility, short challenges and endless, with balance set
by playtests (`prompt.md:1279-1280`). D-6 and D-11 are built in here **[CONFIRMED by owner, 2026-11-14]**.

### Phase 50 — Campaign data

**Goal.** The 50-wave campaign with pads opening in stages, unlocks and meteor slots `M-009…M-049`, checked by the simulator and the action-limit gate.
**Why now.** Meteor offers, challenges and endless all hang off the campaign.

| Field | Detail |
|---|---|
| J tasks | M4-01 |
| In scope | Campaign and ruleset versions; G-15 over the real campaign; simulator re-run |
| Out of scope | Balance changes from playtests (Phase 56) |
| Files | `game-data/campaign/`, `game-data/ruleset/`, [tools/sim/](../tools/sim/) |
| Depends on | Phases 27, 28 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd web && npm test` (campaign shape, G-15); `python3 -B tools/sim/selftest.py` |
| Deployed / how to see | New game-data version under `/game-data/` |
| Exit criteria | The 50-wave campaign passes `3 + (finalWave − 1) + len(meteorAfter) ≤ 100` (P20); bosses only on 10/20/30/40/50; simulator margins recorded |
| Risks | A long wave set tripping the transaction-size gate |

**How to review this phase**
1. Simulator margins in the commit or `tools/sim/results.md`.
2. New files, not edited ones, for the new version.
3. Pad opening schedule matches C3.
4. Meteor slot IDs follow `^[NM]-[0-9]{3}$`.
5. The gate's arithmetic in the test is the spine's formula.

*Concept:* **data-driven content with gates** — the campaign is data, and the build refuses data that would break a server limit.

---

### Phase 51 — Meteor offers

**Goal.** The meteor phase UI, server-granted powers, skip only before the first attempt, and the meteor content pool.
**Why now.** Needs the campaign's meteor slots and selection.

| Field | Detail |
|---|---|
| J tasks | M4-02 |
| In scope | D-11; P8 (success at the cap counts, no charge added); meteor pool content (phase G) |
| Out of scope | Endless meteor behaviour beyond P8 |
| Files | `web/player/src/learning/`, `api/functions/player_api/`, `content/seed/` |
| Depends on | Phases 42, 50 |
| Owner actions | Dispatch the release and apply; run `seed_content.py` dry run, then real, for the meteor pool; review meteor content |
| Tests and how to run | `cd web && npm test`; `cd api && pytest` |
| Deployed / how to see | A meteor offer after wave 9 on production |
| Exit criteria | Dismiss after an attempt is refused by the reducer; a grant never exceeds the cap; success at cap leaves the slot `SUCCEEDED` and counted with no charge added |
| Risks | Treating a success at the cap as a failure |

**How to review this phase**
1. The skip button disappears after the first attempt, and the reducer refuses it anyway.
2. The grant happens on the server only.
3. Fixtures for the cap case.
4. Meteor results count in summaries (D-5).
5. Copy for the offer.

*Concept:* **the server grants, the client asks** — rewards are never minted by the browser.

---

### Phase 52 — Badges and planet eligibility

**Goal.** Campaign and progress badges and planet eligibility, re-evaluated on `COMPLETE_WAVE`.
**Why now.** Needs summaries and the full lifecycle.

| Field | Detail |
|---|---|
| J tasks | M4-03 |
| In scope | C12 badges (learning-outcome badges dropped in v1, P7); eligibility |
| Out of scope | Challenge badges (Phase 53) |
| Files | `api/functions/player_api/`, `web/player/src/progress/` |
| Depends on | Phases 43, 50 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest` |
| Deployed / how to see | Badges on My progress |
| Exit criteria | Each C12 badge awarded once; a campaign reset lets it be earned again |
| Risks | A badge awarded twice |

**How to review this phase**
1. Badge writes use a map key with `if_not_exists`.
2. Eligibility rules match C12 and F §10.2.
3. Tests per badge.
4. The UI shows earned and not-yet badges kindly.
5. Reset interaction tested.

*Concept:* **write-once fields** — a condition makes "award once" a database guarantee.

---

### Phase 53 — Challenges

**Goal.** The short wave sets, the planet/run setup screen and challenge badges.
**Why now.** Needs badges and the campaign.

| Field | Detail |
|---|---|
| J tasks | M4-04 |
| In scope | Final `COMPLETE_WAVE` of a CHALLENGE run writes `PROFILE.badges` only; slot rewards from the campaign interval table (P7) |
| Out of scope | Endless |
| Files | `game-data/campaign/`, `web/player/src/`, `api/functions/player_api/` |
| Depends on | Phase 52 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest`; `cd web && npm test` |
| Deployed / how to see | Run setup screen with challenges |
| Exit criteria | Each challenge completes without touching best wave, planets or eligibility; its badge once; rewards match the interval table |
| Risks | A challenge write leaking into planets or eligibility |

**How to review this phase**
1. The transaction for a challenge's final wave: only `badges` on PROFILE.
2. Tests that best wave is unchanged.
3. Challenge wave sets pass G-15.
4. Setup screen keyboard path.
5. Reward table reuse.

*Concept:* none new; the review is about **scope of a write**.

---

### Phase 54 — Endless

**Goal.** Bounded endless scaling, block planning inside `CHOOSE_ENDLESS` and endless `COMPLETE_WAVE`, the "done every activity" message, and the wave-999 end.
**Why now.** Last gameplay mode; offline preparation (Phase 59) depends on its planning.

| Field | Detail |
|---|---|
| J tasks | M4-05 |
| In scope | C11 scaling; F §3.6 planning; D-6 fallback order; nothing planned above interval 998 (P17) |
| Out of scope | Offline readiness copy (Phase 59) |
| Files | `web/game-core/src/sim/`, `api/shared/selection/`, `api/functions/player_api/` |
| Depends on | Phases 42, 50 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd web && npm test`; `cd api && pytest` |
| Deployed / how to see | Choose endless after a campaign completion |
| Exit criteria | `plannedThrough` stays ahead by K; an exhausted bank writes no slot and never repeats; no slot above interval 998; wave 999 completes the run |
| Risks | Off-by-one at the end of endless |

**How to review this phase**
1. Boundary tests at 997, 998, 999.
2. Fallback order maths → phonics → spelling.
3. Planning writes are bounded per transaction.
4. Scaling is capped (C11).
5. The message copy.

*Concept:* **boundary testing** — bugs live at the edges, so test the last valid and first invalid values.

---

### Phase 55 — Resets

**Goal.** All four reset types and the settings screen.
**Why now.** Needs badges, summaries and runs to reset.

| Field | Detail |
|---|---|
| J tasks | M4-06 |
| In scope | `POST /api/me/resets {type, confirm}` per F §12.5; leftover `RESET#<requestId>` holder treated as released (P16) |
| Out of scope | Operator-side resets |
| Files | `api/functions/player_api/`, `web/player/src/settings/` |
| Depends on | Phases 43, 52 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest` |
| Deployed / how to see | Settings screen |
| Exit criteria | One test per reset type checks the F §12.5 matrix; repeating a reset is harmless; a leftover holder gives no takeover prompt |
| Risks | An interrupted whole-profile reset |

**How to review this phase**
1. `confirm` must equal `type`.
2. 200 only when finished.
3. The matrix test per type.
4. Copy makes the consequence clear to a parent.
5. Interrupted-reset test.

*Concept:* **resumable multi-step operations** — a long reset records progress so a retry finishes it.

---

### Phase 56 — Balance playtests P3

**Goal.** Run playtest sessions with the children and tune numbers through the simulator.
**Why now.** The full campaign exists.

| Field | Detail |
|---|---|
| J tasks | M4-07 |
| In scope | Sessions per I.5; number changes as new game-data versions |
| Out of scope | New features |
| Files | `docs/validation/playtests/`, `game-data/` |
| Depends on | Phases 50–55 |
| Owner actions | Run the sessions; dispatch the release and apply for each tuned game-data version |
| Tests and how to run | `python3 -B tools/sim/selftest.py` and the simulator runs |
| Deployed / how to see | Releases with tuned data |
| Exit criteria | Each session has a short note; every number change has a simulator run behind it |
| Risks | Tuning to one child |

**How to review this phase**
1. Notes contain no names.
2. Each change links its simulator run.
3. New data versions, not edits.
4. Findings that are not numbers become tasks.
5. The schedule of sessions.

*Concept:* none new.

---

## Stage F — Robust persistence and offline, M5 (phases 57–63)

Goal of the milestone: local packs and audio caching, attempt persistence, reconnect idempotency, session exclusivity and stale-writer
handling (`prompt.md:1282-1283`). The freeze comes no earlier than the end of this stage ([B §B3.4](plan/B-scope-and-decisions.md#b34-the-data-freeze-point-proposal-spine-s114)).

### Phase 57 — Local database

**Goal.** The per-account IndexedDB `scd-<sub>` with versioned stores and the online-only fallback.
**Why now.** Every offline feature stores data here.

| Field | Detail |
|---|---|
| J tasks | M5-01 |
| In scope | Stores `ops`, `runs`, `packs`, `audio`, `recovery`, `meta`; durability rule; online-only banner when storage is unavailable |
| Out of scope | Queue behaviour (Phase 58) |
| Files | `web/player/src/sync/db.ts` |
| Depends on | Phase 29 |
| Owner actions | Dispatch the release and apply; try a private window on production |
| Tests and how to run | `cd web && npm test -w player` (fake-indexeddb) |
| Deployed / how to see | Online-only banner in a private window on production, after this phase's release |
| Exit criteria | Upgrade test from the M1 schema keeps queued ops; private window shows the banner |
| Risks | A schema upgrade dropping `ops` or `recovery` |

**How to review this phase**
1. The upgrade function handles every older version.
2. No store is deleted in an upgrade.
3. The database name includes the account `sub`.
4. Errors from storage lead to online-only, not a crash.
5. ADR-0015's findings are reflected.

*Concept:* **schema migrations in the browser** — the database on a child's laptop is upgraded by the new code, so upgrades must never lose data.

---

### Phase 58 — Offline queue

**Goal.** `OFFLINE_PENDING`, background flush for all the account's runs, the `scd-play` Web Lock, identity checks, and sign-out disabled offline.
**Why now.** Needs the local database.

| Field | Detail |
|---|---|
| J tasks | M5-02 |
| In scope | Spine S7.4 rules; P11 (sign-out connection-required); pending-ops warning online |
| Out of scope | Divergence (Phase 60) |
| Files | `web/player/src/sync/` |
| Depends on | Phase 57 |
| Owner actions | Dispatch the release and apply; try offline mid-activity |
| Tests and how to run | `cd web && npm test`; `npx playwright test e2e/local` |
| Deployed / how to see | Offline and back on production |
| Exit criteria | Playwright: second tab cannot play; offline mid-activity then back flushes in order; Sign out disabled offline |
| Risks | Two tabs flushing at once |

**How to review this phase**
1. One flusher per account, held by the Web Lock.
2. Order preserved across runs.
3. Identity checked before each flush.
4. Playwright uses `setOffline`.
5. Copy per D7.

*Concept:* **Web Locks** — a browser-wide mutex so two tabs never do the same work at once.

---

### Phase 59 — Offline preparation and audio cache

**Goal.** Pack download, readiness states, clip bytes pre-fetched and verified, offline Play from local bytes, and "Ready offline up to wave N" for endless.
**Why now.** Needs the queue and endless planning.

| Field | Detail |
|---|---|
| J tasks | M5-03 |
| In scope | E.8 and E.9; O-2 offline rule (local bytes only) |
| Out of scope | Divergence |
| Files | `web/player/src/offline/` |
| Depends on | Phases 54, 58 |
| Owner actions | Dispatch the release and apply; prepare a run and play it offline |
| Tests and how to run | `npx playwright test e2e/local` |
| Deployed / how to see | "Ready offline" on production |
| Exit criteria | With the network cut after "Ready offline", a prepared campaign continues and every clip plays |
| Risks | Asset chunks not loaded into memory in this page session |

**How to review this phase**
1. Readiness is only shown when every needed byte is stored and verified.
2. Code-split chunks needed offline are loaded during preparation.
3. Each clip's `sha256` checked.
4. Storage quota errors handled.
5. Endless readiness says up to which wave.

*Concept:* **"ready" must be provable** — readiness is a checklist of stored things, not a hope.

---

### Phase 60 — Divergence and recovery

**Goal.** The divergence procedure (options a and b), the recovery store, the "Progress that was not saved" panel and its download.
**Why now.** Offline writers can now diverge.

| Field | Detail |
|---|---|
| J tasks | M5-04 |
| In scope | Spine S7.5; P16 (option b all-or-nothing; copy "some of this may already be saved"; offline VOID versus locally FAILED keeps the local result) |
| Out of scope | Automatic replay (never) |
| Files | `web/player/src/sync/`, `web/player/src/recovery/` |
| Depends on | Phase 58 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `npx playwright test e2e/local` |
| Deployed / how to see | The panel in a forced divergence on a test account |
| Exit criteria | F §11.3 scenario passes end to end; the recovery file downloads as JSON |
| Risks | Automatic replay sneaking in |

**How to review this phase**
1. Nothing is replayed without the child or parent choosing it.
2. Frozen ops are kept until resolved.
3. The panel's copy.
4. The download contains no tokens.
5. Scenario test names match F §11.

*Concept:* **conflict resolution by explicit choice** — when two histories disagree, a person picks.

---

### Phase 61 — Takeover and lease timing

**Goal.** The "Play here instead?" dialog and renew rules (only while visible and recently used).
**Why now.** Needs the queue and the session lease from Phase 16.

| Field | Detail |
|---|---|
| J tasks | M5-05 |
| In scope | Takeover dialog; renew timing; `takeover` input on create (P15) in the UI |
| Out of scope | — |
| Files | `web/player/src/sync/` |
| Depends on | Phase 58 |
| Owner actions | Dispatch the release and apply; try two browsers |
| Tests and how to run | Playwright with two contexts and `context.clock` |
| Deployed / how to see | Two laptops or two browsers on production |
| Exit criteria | A Playwright test with two contexts and an injected clock (`context.clock`) asserts no "Play here instead?" dialog before the lease expires and the dialog after it lapses without a release; a second case asserts no dialog after a clean release |
| Risks | The lease expiring during a long activity |

**How to review this phase**
1. Renew only while visible and recently used.
2. Release on sign-out and page hide.
3. Dialog copy.
4. Two-context test.
5. A `RESET#` holder never prompts.

*Concept:* **leases with timers** — a lease expires unless renewed, so timing rules decide the experience.

---

### Phase 62 — Version compatibility

**Goal.** Current and previous `protocolVersion`, `CLIENT_UPGRADE_REQUIRED`, `409 PROTOCOL_UNSUPPORTED` holding the queue, `playable(run)` and supported `mechanics`.
**Why now.** Must exist before the freeze and before rollback rehearsal.

| Field | Detail |
|---|---|
| J tasks | M5-06 |
| In scope | P19; previous-release batch replay test |
| Out of scope | Golden scenarios as a gate (Phase 71) |
| Files | `api/functions/player_api/`, `web/player/src/sync/`, `contracts/fixtures/` |
| Depends on | Phase 57 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd api && pytest`; `cd web && npm test` |
| Deployed / how to see | Release |
| Exit criteria | A recorded previous-release batch is accepted; a newer `protocolVersion` gets 409 and the queue keeps every op; an unsupported run shows `playable:false` and Continue skips it |
| Risks | A client treating `PROTOCOL_UNSUPPORTED` as a rejection |

**How to review this phase**
1. The queue state stays `RETRYING`, never `REJECTED`.
2. The recorded batch is a real one from a previous release.
3. Supported lists only grow.
4. Copy "Saving paused while the game updates".
5. Tests on both sides.

*Concept:* **backward and forward compatibility** — old clients and new servers (and, after a rollback, the reverse) must both behave safely.

---

### Phase 63 — Hard-case scenarios

**Goal.** The F §11 scenarios and the automatable parts of the nine I §I.4 hard cases as named tests in CI.
**Why now.** Closes M5 with proof.

| Field | Detail |
|---|---|
| J tasks | M5-07 |
| In scope | Playwright and pytest tests per [I §I.4](plan/I-validation.md#i4-the-named-hard-cases) |
| Out of scope | Human listening parts (Phases 18, 40) |
| Files | `web/player/e2e/`, `api/tests/` |
| Depends on | Phases 59–62 |
| Owner actions | — |
| Tests and how to run | `npx playwright test`; `cd api && pytest`; CI |
| Deployed / how to see | CI run |
| Exit criteria | Every automatable I §I.4 case has a named, green test in CI |
| Risks | Flaky timing in offline emulation |

**How to review this phase**
1. Each test name maps to an I §I.4 case.
2. No arbitrary sleeps; use Playwright's clock and events.
3. Lost-response cases use `route.fetch()` then `abort()`.
4. Tests fail when the guarded behaviour is removed (try one).
5. CI runtime acceptable.

*Concept:* **testing failure paths on purpose** — dropping a response after the server acted is the only way to prove idempotency end to end.

---

## Stage G — Art, performance and release confidence, M6 (phases 64–74)

Goal of the milestone: the existing drawn art served through a manifest, the missing sounds and icons made, measured frame rate and audio latency, full keyboard coverage, verified backup and
restore, compatible rollback, and documentation of what was built (`prompt.md:1285-1286`).

All 352 images in the [asset catalogue](art/asset-catalogue.json) already exist: drawn as SVG in `art/svg/` following `art/STYLE.md`,
rendered by [tools/art/render.py](../tools/art/render.py) into `web/player/public/assets/`, and viewable in the
[gallery](art/gallery.html). Phases 64–66 therefore wire the art in and polish it rather than produce it. Still to make: the 25 combat
and feedback sounds of D10.10 (including the correct chime and the not-quite "bloop",
[D §D6.4](plan/D-ux-and-content-operations.md#d64-feedback-words)), the favicon and app icons (from the logo), the choice of UI font,
and the rest of [D10.9](plan/D-ux-and-content-operations.md#d109-activity-pictures): the remaining age 6–7 noun pictures (about 8,
chosen while authoring those banks) and the demonstration card art (about 20, one per concept as authored), drawn here in the same style.

### Phase 64 — Asset pipeline and manifest

**Goal.** Asset-manifest versions, naming conventions and a loader, built from the [asset catalogue](art/asset-catalogue.json).
**Why now.** Until now the game loads the existing art from `web/player/public/assets/` by path; production needs hashed, versioned
URLs and atlases. (It depends only on M1, so you may move it earlier at any gate.)

| Field | Detail |
|---|---|
| J tasks | M6-01a |
| In scope | `asset-manifest` game-data kind generated from the catalogue; loader; atlas packing (D10.1); the existing art through the manifest; labelled placeholders only for entries added later; the art tools in [tools/art/](../tools/art/render.py) and the house style in `art/STYLE.md` |
| Out of scope | Polishing the art (Phases 65, 66) |
| Files | `game-data/asset-manifest/`, `web/player/src/assets/` |
| Depends on | Phase 23 |
| Owner actions | Dispatch the release and apply |
| Tests and how to run | `cd web && npm test` |
| Deployed / how to see | The existing art renders on production through the manifest |
| Exit criteria | The existing art loads through the manifest |
| Risks | Manifest edits after the freeze (additive only) |

**How to review this phase**
1. Manifest naming matches the existing frame names (e.g. `nova-l1-idle-01`).
2. The loader fails loudly on a missing asset.
3. Hashed asset URLs.
4. Manifest is versioned game data.
5. No art bytes in `game-core`.

*Concept:* **indirection through a manifest** — code asks for "nova level 1 idle", the manifest says which file.

---

### Phase 65 — Battlefield art

**Goal.** Integrate and polish the existing planet, colony, astronauts × levels, aliens, bosses and power effects: check each in the
game at 1x and 2x and redraw any SVG that reads badly there.
**Why now.** Performance must be measured with the final art.

| Field | Detail |
|---|---|
| J tasks | M6-01b |
| In scope | Every D10.2–D10.7 row: in-game check, anchors and stand points, animation timing, fixes to `art/svg/` re-rendered with `tools/art/render.py` |
| Out of scope | Interface art |
| Files | `art/svg/`, `web/player/public/assets/`, `game-data/asset-manifest/` |
| Depends on | Phase 64 |
| Owner actions | Review the art in the game; dispatch the release and apply |
| Tests and how to run | Manifest completeness test |
| Deployed / how to see | Release |
| Exit criteria | Every D10.2–D10.7 row has a final asset in the manifest |
| Risks | Inconsistent style between redrawn and untouched SVGs |

**How to review this phase**
1. Contact sheets at 1x and 2x.
2. Style matches `art/STYLE.md` and the style anchor.
3. Sizes within the budget.
4. Every row ticked.
5. Source noted (drawn in-repo; `source` is `drawn-svg` in the catalogue).

*Concept:* none new.

---

### Phase 66 — Interface art and combat sounds

**Goal.** Integrate and polish the existing interface art and activity pictures, and make what is still missing: the D10.10 sound set
(25 sounds, including the correct chime `sfx-correct` and the not-quite "bloop" `sfx-not-quite`), the favicon and app icons (from the
logo), the UI font choice, and the rest of D10.9 (remaining age 6–7 noun pictures, about 8; demonstration card art, about 20).
**Why now.** Completes the inventory.

| Field | Detail |
|---|---|
| J tasks | M6-01c |
| In scope | Every D10.8–D10.10 row, including the remaining age 6–7 noun pictures and the demonstration card art (D10.9), drawn in-repo in the same style; favicon and app icons; the UI font (a free, child-friendly face with a single-storey "a"; which one is your call at this gate) |
| Out of scope | Speech (Polly clips are content) |
| Files | as Phase 65, plus the sound files and their provenance note in the manifest (paths settled in Phase 64) |
| Depends on | Phase 64 |
| Owner actions | Review the art in the game; approve the sounds and the font; dispatch the release and apply |
| Tests and how to run | Manifest completeness test |
| Deployed / how to see | Release |
| Exit criteria | Every D10.8–D10.10 row has a final asset; favicon and app icons ship; the font is chosen and loaded |
| Risks | Picture count larger than estimated (new words each need a drawn picture); sound licence or provenance unclear |

**How to review this phase**
1. Activity pictures are text-free where required.
2. Alt text present.
3. Sound volume levels consistent.
4. Every row ticked.
5. Asset sizes.

*Concept:* none new.

---

### Phase 67 — Performance against the budget

**Goal.** Measure the busiest waves with final art and audio latency from Play against the targets.
**Why now.** Final art is in.

| Field | Detail |
|---|---|
| J tasks | M6-02 |
| In scope | C14 budget; speech latency re-measure |
| Out of scope | — |
| Files | `docs/validation/performance/` |
| Depends on | Phases 34, 65 |
| Owner actions | Measure on the children's laptop |
| Tests and how to run | The recorded procedure |
| Deployed / how to see | Production |
| Exit criteria | A recorded measurement on the children's laptop meets the documented target |
| Risks | Measuring on a faster machine |

**How to review this phase**
1. Same device and procedure as Phase 34.
2. Both frame time and audio latency.
3. Any miss becomes a task.
4. Numbers in the record.
5. AC-42 evidence linked.

*Concept:* none new.

---

### Phase 68 — Keyboard and accessibility pass

**Goal.** Every essential control and interaction works with keyboard and mouse; axe scans clean.
**Why now.** All screens exist.

| Field | Detail |
|---|---|
| J tasks | M6-03 |
| In scope | Player and admin; axe on every screen |
| Out of scope | — |
| Files | `web/player/e2e/`, `web/admin/` |
| Depends on | Phases 38, 31 |
| Owner actions | Dispatch the release and apply; try keyboard-only journeys on production |
| Tests and how to run | `npx playwright test` |
| Deployed / how to see | CI; the fixed screens on production after the release |
| Exit criteria | Keyboard-only journeys pass; axe reports no serious issues |
| Risks | Focus traps in dialogs |

**How to review this phase**
1. Dialogs return focus.
2. Visible focus everywhere.
3. axe results attached.
4. Keyboard map documented.
5. No mouse-only control left.

*Concept:* **focus management** — where keyboard focus goes after a dialog opens or closes.

---

### Phase 69 — Scoped CI role

**Goal.** Replace `AdministratorAccess` with the scoped inline policy (B-4) and a permissions boundary or equivalent.
**Why now.** The module set is stable; required before the freeze.

| Field | Detail |
|---|---|
| J tasks | M6-04 |
| In scope | [H §H.5.1](plan/H-infrastructure-and-delivery.md#h51-scoped-ci-policy-outline-not-json) policy; one variable and one line in the bootstrap root |
| Out of scope | Main-stack changes |
| Files | [bootstrap/main.tf](../infrastructure/bootstrap/main.tf), [bootstrap/variables.tf](../infrastructure/bootstrap/variables.tf), [prod.tfvars.json](../infrastructure/envs/prod.tfvars.json) |
| Depends on | Phase 63 |
| Owner actions | Bootstrap plan and apply locally; run a full release; run `aws iam simulate-principal-policy --policy-source-arn <CI role ARN> --action-names dynamodb:DeleteTable --resource-arns <both table ARNs>` (read-only) |
| Tests and how to run | Your bootstrap plan; a release; the simulation |
| Deployed / how to see | Release succeeds with the scoped role |
| Exit criteria | A full release succeeds with the scoped role; `simulate-principal-policy` returns `explicitDeny` for `dynamodb:DeleteTable` on both tables (no workflow ever tries a real delete, which G-5 would forbid anyway). The rollback rehearsal is not part of this gate: it is built in Phase 71, which therefore runs with the scoped role already in place, and its exit says so. J's M6-04 has the same order problem (see open points) |
| Risks | A missing permission found mid-release |

**How to review this phase**
1. Explicit denies for state buckets, tables, pools, vault, the CI role and OIDC provider.
2. `iam:PassRole` limited by `iam:PassedToService`.
3. The escalation caveat addressed by a boundary.
4. Bootstrap plan: in-place policy change only.
5. The `simulate-principal-policy` output recorded in the gate log: `explicitDeny` on both table ARNs, and also on the state bucket and the CI role itself.

*Concept:* your territory; nothing new.

---

### Phase 70 — Restore drill

**Goal.** Restore both tables to scratch tables, verify, record time and result.
**Why now.** Required before the freeze (AC-39).

| Field | Detail |
|---|---|
| J tasks | M6-05 |
| In scope | Procedure from Phase 33's runbook; canary profile and run checks |
| Out of scope | Restoring over production |
| Files | `docs/runbooks/restore.md`, `scripts/restore_copy.py`, `scripts/verify_pins.py` |
| Depends on | Phase 33 |
| Owner actions | Run the drill (a restore to a scratch table is an operational action you take, not a deployment) |
| Tests and how to run | `python3 -m pytest scripts/tests` for the helper scripts |
| Deployed / how to see | Runbook entry |
| Exit criteria | Runbook entry with date, duration and result for both tables |
| Risks | Restored table lacks protections (expected; it is scratch) |

**How to review this phase**
1. The scripts are read-only against production.
2. The cut-over step bumps every `SESSION.generation`.
3. Canary run compared before and after.
4. Timing recorded.
5. Scratch tables cleaned up.

*Concept:* none new.

---

### Phase 71 — Rollback rehearsal and game-data lock

**Goal.** Rehearse `artefacts_from=<release_id>` rollback and turn the game-data/golden lock (G-8) and golden scenarios (G-9) into gates.
**Why now.** Required before the freeze.

| Field | Detail |
|---|---|
| J tasks | M6-06 |
| In scope | P21 rollback; G-8 with the rollback rule; G-9 |
| Out of scope | Rolling back Terraform code (a forward commit) |
| Files | `.github/workflows/release.yml`, `scripts/gamedata_lock_check.py`, `contracts/golden/`, `contracts/replay/` |
| Depends on | Phase 62 |
| Owner actions | Dispatch a rollback release |
| Tests and how to run | `python3 -m pytest scripts/tests` (throwaway git repo test per I.2.8) |
| Deployed / how to see | The earlier release re-published |
| Exit criteria | An earlier release re-published from its archived manifest without a rebuild, **using the scoped CI role from Phase 69** (this closes M6-04's rollback condition); a modified game-data or golden file fails G-8 |
| Risks | Rolling back past a mechanics or protocol addition |

**How to review this phase**
1. The rollback path skips the build and checks every archived object.
2. G-8's ancestry rule.
3. Golden scenarios per `mechanics` number.
4. Release entry for the rehearsal.
5. Canary run unaffected.

*Concept:* **additive-only data** — if files are only ever added, any older release still finds what it needs.

---

### Phase 72 — Monitoring proof, runbooks and README

**Goal.** Prove alarm delivery with a test alarm and two real failures, and finish every runbook and the README.
**Why now.** Documentation of what was actually built.

| Field | Detail |
|---|---|
| J tasks | M6-07, M6-08 |
| In scope | AC-40 evidence; runbooks: operator password reset, sign-up kill switch, rollback, restore, DNS, speech withdrawal (runbook only, P10); README with local setup, build, test and release |
| Out of scope | — |
| Files | `docs/runbooks/`, [README.md](../README.md), `docs/releases/` |
| Depends on | Phases 70, 71 |
| Owner actions | Trigger a test alarm (`aws cloudwatch set-alarm-state` on `api-5xx`) and two real failures per I §I.3 AC-40: (a) `aws lambda invoke` of `player-api` with a malformed event, so `lambda-player-api-errors` fires; (b) as `test-player-1`, a crafted out-of-bounds `COMPLETE_WAVE` (the Phase 30 forged-checkpoint fixture) sent to the deployed ops route, so the op is `REJECTED CHECKPOINT_OUT_OF_BOUNDS` and `ops-rejected` fires. Follow each runbook once |
| Tests and how to run | — |
| Deployed / how to see | E-mails; runbook entries |
| Exit criteria | The test-alarm e-mail and both real-failure e-mails received within 10 minutes and noted with times; each runbook says it has been followed once |
| Risks | Runbooks describing intended rather than actual behaviour |

**How to review this phase**
1. Follow the README on a fresh clone.
2. Each runbook's "last followed" line.
3. The real-failure alarm evidence.
4. No secrets in runbooks.
5. Links from `docs/README.md`.

*Concept:* none new.

---

### Phase 73 — Acceptance pass, playtest P4

**Goal.** Demonstrate AC-01…AC-43 per [I](plan/I-validation.md), complete the browser matrix and run playtest P4.
**Why now.** Last check before the freeze.

| Field | Detail |
|---|---|
| J tasks | M6-09 |
| In scope | AC table with evidence; `browsers.md`; P4 |
| Out of scope | New features; gaps become tasks |
| Files | `docs/validation/` (AC table, `browsers.md`), `docs/validation/playtests/` |
| Depends on | Phases 64–72 |
| Owner actions | P4; browser checks; token-level API checks from your laptop |
| Tests and how to run | Full CI; E2E-D and API-D from your laptop |
| Deployed / how to see | Production |
| Exit criteria | Every AC has evidence recorded; `browsers.md` filled in; P4 notes |
| Risks | Treating a test as proof of a behaviour it does not exercise |

**How to review this phase**
1. Spot-check five ACs: open the evidence and check it proves the criterion.
2. Every browser the family uses is listed.
3. P4 notes without names.
4. Gaps listed as tasks with phases.
5. The unverified register is fully ticked.

*Concept:* **traceability** — each requirement points to its evidence.

---

### Phase 74 — Data-freeze release

**Goal.** Release the first version whose saves the children keep, with the plan guard enforcing.
**Why now.** Everything that might reshape data is done ([B §B3.4](plan/B-scope-and-decisions.md#b34-the-data-freeze-point-proposal-spine-s114)).

| Field | Detail |
|---|---|
| J tasks | M6-10 |
| In scope | Checklist F-1…F-8 ([H §H.11.3](plan/H-infrastructure-and-delivery.md#h113-data-freeze-point-spine-s114)); `enforce: true`; tag `release-<release_id>` noted as the freeze |
| Out of scope | — |
| Files | `infrastructure/plan-guard.json`, `docs/releases/` |
| Depends on | Phases 69–73 |
| Owner actions | Dispatch the release and apply; remove pre-freeze test data by the mechanism in the [local AWS writes table](#local-aws-writes-that-are-not-deployments) (F-8) and confirm it is gone |
| Tests and how to run | Plan-guard tests; full CI |
| Deployed / how to see | The freeze release on production |
| Exit criteria | All eight checklist items have evidence; the freeze release is tagged |
| Risks | Freezing with pre-freeze test data left by accident |

**How to review this phase**
1. Each F item's evidence.
2. `enforce: true` and a plan that would replace a table now fails (test).
3. Test accounts and canary are the only non-child data.
4. The release entry names the freeze.
5. Tell the children their saves are now real.

*Concept:* none new.

---

## Gate log

Claude fills "Summary" at each gate; you fill "Approved". The last approved commit is the base for the next gate's
`git diff <sha>..main` ([J §J.4.3](plan/J-execution-backlog.md#j43-how-to-review-a-phase-proposal)).

| Phase | Gate commit | Summary (Claude) | Approved (date, by, notes) |
|---|---|---|---|
| 0 | `43fc22b` (Claude's part; owner actions open) | Plan v0.3 committed (`1812208`), art committed (`bc454c2`). Added CLAUDE.md, docs index, `.nvmrc`/`.python-version`, H.16 ignore lines; artefacts bucket in `infrastructure/bootstrap/artifacts.tf` + output; interim workflow is plan/apply only; ADR template, index, ADR-0001…0010 (Accepted) and ADR-0011 (Proposed). Art phases 64–66 kept in place but reworded (art already drawn; real art used from Phase 14). Owner request: human cast redrawn as white European men. Found: `prod` has no deployment-branch rule (fix first). M0-07 accepted against the adjusted Done when (local 3.12, CI 3.14). Open: owner actions 1–6, ADR-0011 pending list. | 2026-11-15, owner (in chat). Branch rule set to `main`; branch 1b (no `prod-apply`); test bucket 404. Deferred: negative test, smoke re-run, local-writes table confirmation. **Bootstrap apply (artefacts bucket) due before Phase 3.** |
| 1 | `6ea00e4` | npm workspaces `game-core`, `shared`, `player`, `admin` (TS 7.0.2, Vite 8.3.8, React 19.3.1, Phaser 4.2.1, Vitest 5.1.0, oxlint 1.93.0; ADR-0013 Proposed). Player page mounts a Phaser scene (rectangle + Nova), keyboard input off, destroyed in the effect cleanup. `game-core` purity enforced by lint, tsc (no DOM/Node types) and `purity.test.ts`; bad import proven to fail. Push CI `ci.yml` (read-only) green on run 43692712122. Review: 9 findings, all fixed. Carried to Phase 4: unhashed art must not get the immutable cache rule. Owner: run `npm run dev -w @scd/player` and look. | 2026-11-15, owner (in chat). Page seen; global font changed to Unkempt (`eb36d89`); Andika chosen as the reading font for Phase 22. |
| 2 | `ca05483` | Main root structure: H.6 env keys in `prod.tfvars.json` and declared in both roots; `us_east_1` alias; `locals.tf`, `data.tf` (managed CloudFront policies only), `outputs.tf`; `modules/certificate` (both hostnames, DNS validation, 30 min wait, no Route 53); interim job `timeout-minutes: 60`; `docs/runbooks/dns-hand-off.md` with DNS-1…5 results (no CAA, no apex wildcard, no HSTS/cookies, zone in 060421969689). Local read-only plan: 2 to add, 0 change, 0 destroy, no warnings. Review: 7 findings, 5 fixed in the runbook; interim workflow action majors behind H.17 (left until release.yml replaces it). Owner: bootstrap plan+apply, dispatch plan then apply, create the 2 CNAMEs while it waits. Result: CNAMEs created by the owner (CREATE), certificate `14aa0591-…` **ISSUED** 2026-11-15, interim apply run 43695288228 green. Backlog B-1: DNS through Terraform later. | 2026-11-15, owner (in chat). Bootstrap applied: artefacts bucket exists. |
| 3 | `5c89c13` | `static_site` module ×2 (private versioned buckets, OAC-only + TLS-only policy, CloudFront on the issued certificate, one SPA fallback function on the default behaviour, one response headers policy: CSP **report-only**, HSTS 1 y + subdomains, nosniff, DENY, no-referrer; no `custom_error_response`; buckets `prevent_destroy`). Read-only plan: 18 add / 0 change / 0 destroy. `release.yml` plan side: config (main only) → checks → build (**no AWS**: npm runs without credentials) → upload (SHA-256 verified, create-only) → plan (detailed-exitcode, guard report, tarball with `.terraform/` + lock to `plans/<run_id>/`, `plan-info.json` last as completion marker). `plan.yml`, `plan_guard.py`, `scan_dist.py`, SPA function tests (44 pass), actionlint clean. Deviations to note: bucket policy also grants `s3:ListBucket` (same distribution only) so missing files are 404 not 403; build/upload split carries the build as a 1-day GitHub artefact (public content; the plan is never one); concurrency group `terraform-prod` (shared with the interim workflow) instead of W-6's `prod-release`; CSP report-only header sent as a custom header (CloudFront acceptance [UNVERIFIED] until the Phase 4 apply). Owner: dispatch `release.yml`, read the plan. | |

(One row is added per phase as it reaches its gate; a phase with [split gates](#phase-sizes-and-split-gates) gets one row per part, e.g. `8a`, `8b`.)

---

## Appendix A: J task → phase

Every task in [J §J.3](plan/J-execution-backlog.md#j3-the-backlog), in J's order. "Part" means the task is split; each part's content is
in the named phase.

| J task | Phase(s) | Note |
|---|---|---|
| M0-01 | 0 | Test-bucket resource already removed from code (`f88439c`); destroy action removed here |
| M0-02 | 0 | |
| M0-03 | 0 | Your local bootstrap apply |
| M0-04 | 2 | Runbook ahead of the certificate |
| M0-05 | 0 | Includes ADR-0001…0011 and the docs index |
| M0-06 | 10 | Done during planning; self-test re-run at Phases 10, 13, 27, 50, 56 |
| M0-07 | 0 | Done-when adjusted: local Python stays 3.12 (see How we work) |
| M0-08a | 1 | |
| M0-08b | 1 | |
| M0-09 | 10 | |
| M0-10 | 5 | |
| M0-11 | 18 | Placed just before the speech service |
| M0-12 | 6 | |
| M0-13 | 6 | |
| M0-14 | 5 | |
| M0-15 | 5 (create), 6 (delete) | |
| M1-01 | 2 | Declaration-only bootstrap change: plan, no apply |
| M1-02 | 2 | |
| M1-03 | 2 | Through the interim pipeline |
| M1-04 | 8 | |
| M1-05 | 8 | |
| M1-06 | 8 (part 1: functions), 9 (part 2: HTTP API) | |
| M1-07 | 3 (part 1: sites), 9 (part 2: `/api/*` behaviour) | |
| M1-08 | 9 | |
| M1-09 | 7 | |
| M1-10 | 3 (plan side), 4 (apply, publish, smoke, record), 6 (G-5 workflow and `custom_error_response` rules), 8 (Lambda build), 9 (G-12, G-13, API smoke, G-5 alarm rule) | G-5's backup rule arrives with M2-11 in Phase 33. Gates G-15 (13) and G-14 (19) arrive with the first data they check |
| M1-11 | 4 (part 1: sites, aliases), 9 (part 2: API smoke, SNS, sign-in) | |
| M1-12 | 7 (part 1: `routes.json`), 11 (part 2: schemas, limits, fixtures) | |
| M1-13 | 11 | |
| M1-14 | 12 | |
| M1-15 | 7 (part 1: pre sign-up), 15 (part 2: profile routes) | |
| M1-16 | 16 | |
| M1-17 | 17 | |
| M1-18 | 19 | |
| M1-19 | 20 | |
| M1-20 | 21 | |
| M1-21 | 14 | |
| M1-22 | 22 | |
| M1-23 | 13 | |
| M1-24 | 23 | |
| M2-01 | 24 | |
| M2-02 | 25 | |
| M2-03 | 26 | |
| M2-04 | 27 | |
| M2-05 | 28 | |
| M2-06 | 29 | |
| M2-07 | 30 | |
| M2-08 | 30 | |
| M2-09 | 31 | |
| M2-10 | 28 | |
| M2-11 | 33 | |
| M2-12 | 32 | |
| M2-13 | 34 | |
| M3-01 | 35 | |
| M3-02 | 36 | |
| M3-03 | 37 (part 1), 38 (part 2) | Split by interaction type |
| M3-04 | 39 | |
| M3-05 | 40 | |
| M3-06 | 41 | |
| M3-07 | 42 | |
| M3-08 | 43 | |
| M3-09 | 44 | |
| M3-10a | 45 | |
| M3-10b | 46 | |
| M3-10c | 47 | May move after Phase 63 at a gate |
| M3-10d | 48 | May move after Phase 63 at a gate |
| M3-11 | 49 | Optional |
| M4-01 | 50 | |
| M4-02 | 51 | |
| M4-03 | 52 | |
| M4-04 | 53 | |
| M4-05 | 54 | |
| M4-06 | 55 | |
| M4-07 | 56 | |
| M5-01 | 57 | |
| M5-02 | 58 | |
| M5-03 | 59 | |
| M5-04 | 60 | |
| M5-05 | 61 | |
| M5-06 | 62 | |
| M5-07 | 63 | |
| M6-01a | 64 | J's "Placeholder art loads through the manifest" is met with the existing drawn art |
| M6-01b | 65 | Art already drawn in-repo; the phase integrates and polishes it |
| M6-01c | 66 | Art already drawn in-repo; the sounds, favicon, app icons and font are still to make |
| M6-02 | 67 | |
| M6-03 | 68 | |
| M6-04 | 69 | Your local bootstrap apply |
| M6-05 | 70 | |
| M6-06 | 71 | |
| M6-07 | 72 | |
| M6-08 | 72 | |
| M6-09 | 73 | |
| M6-10 | 74 | |

93 tasks; every one has a phase. Additions that are not J tasks: the push CI workflow `ci.yml` (Phase 1).

Plan gates without a J task of their own ([H §H.10](plan/H-infrastructure-and-delivery.md#h10-quality-gates)):

- **G-10** (human plan review) is the W-4 two-dispatch approval: you read the saved plan in the `release.yml` run summary before dispatching `apply.yml`. It exists from Phase 3 (plan side) and is used from Phase 4 (first apply) on every release.
- **G-11** (smoke) is the release's smoke job: hostnames, deep link and 404 checks from Phase 4, extended in Phase 9 to every route in `contracts/routes.json` returning 401 without a token on both distributions.
- **G-5** (repository invariants) is staged: workflow strings and `custom_error_response` in Phase 6, "every `lambda_function` has alarms" in Phase 9, "both tables in the backup selection" in Phase 33.

---

## Open points for the planner

- **Push CI is a flagged addition; H and J need a line.** H W-2 says the four workflows are `workflow_dispatch` only, and neither the
  W-1 list nor H's repository layout (the `.github/workflows/` tree in H §H.7) shows `ci.yml`. Required edits: add
  "`ci.yml` (push to `main`, `permissions: contents: read`, no `id-token`, no environment, never assumes the role)" to H §H.7 (W-2 and the
  layout tree) and to the J M0-08a scope. `spike.yml` also appears in the workflow folder during Phases 5–6 only.
- **Required J edits (J §J.4.2 and J.4.4 still describe the old first phase).** (a) J.4.2's scope includes M0-04; this file puts M0-04 in
  Phase 2, so J.4.2's scope should drop it. (b) J.4.2's M0-01 row has Claude remove the test-bucket resource "after the destroy run" and the
  owner "dispatch the destroy run first"; the resource is already gone from code (`f88439c`) and Phase 0 removes it from AWS through an
  interim `apply` (or an import-then-apply), so the row should be rewritten to that. (c) M0-07's Done when (`python3.14 -V` prints 3.14) and
  J.4.2's "owner installs Python 3.14" cannot be met at the Phase 0 gate; relax both to "`.python-version` = 3.14, CI on 3.14, local 3.12 with
  `ruff target-version = py312`". Until then, Phase 0's gate log records M0-07 as accepted against the adjusted Done when. (d) J.4.4 orders
  M0-08a, M0-09 (clock), M0-08b; this file does M0-08a and M0-08b in Phase 1 and the clock in Phase 10. J.4.4 should point to this file.
- **Spike ordering contradicts H §H.7 and J M0; needs a decision.** H says the interim pipeline goes with release/apply/plan so "there is
  always exactly one working pipeline and never a destroy path once real resources exist"; J M0 runs spikes before any M1 resource and
  deletes `spike.yml` "at the end of M0" (J.4.4 orders the spikes before M1). This file deploys the certificate, distributions and site
  buckets (Phases 2–4) and then runs `spike.yml`, which has `destroy`, in Phases 5–6: two working deploy pipelines and a destroy path while
  production resources exist. Two ways out: **(1)** keep the order, record it as an ADR in Phase 5 (owner approval at that gate), amend H §H.7's
  sentence and J M0's "at the end of M0", and rely on Phase 5's review check that the backend key and working directory can never resolve to
  `main/`; or **(2)** move Phases 5–6 before Phase 2 (they need only Phase 0's trust and Phase 1's `idb`), which keeps H's invariant and puts
  the N-8 auth risk earlier, at the cost of renumbering. I lean to (2) if you are happy to renumber; this file currently describes (1).
  Either way J's M1-10 "Done when" (grep finds no `destroy`) is met at Phase 6, not at the first `release.yml`.
- **M6-04 order (also in J).** J's M6-04 depends only on M5-07, yet its Done when needs a rollback rehearsal, which M6-06 builds. This file
  drops the rehearsal from Phase 69's exit and puts "with the scoped role" into Phase 71's exit; J should either do the same or make M6-04
  depend on M6-06.
- **G-5 is staged across three phases.** H lists G-5 as one gate "required from M1"; this file adds its rules in Phases 6, 9 and 33 so that
  no release in between fails on a rule whose subject does not exist yet. H §H.10 could say so.
- **Gates brought forward.** G-15 lands with the first game data (Phase 13) and G-14 with the first speech definition (Phase 19); J places
  the related work in M4-01 and M3-05. H already says "required from M1", so this follows H.
- **Local AWS writes.** Every non-read-only call from the laptop is now listed in the
  [local AWS writes table](#local-aws-writes-that-are-not-deployments), with its plan basis, for one confirmation at Phase 0. Two rows have
  no plan basis yet: Phase 6's `capture.py` (H §H.13.3 covers restore and seed, not spike capture) and the Phase 0 break-glass bucket delete
  (fallback only). The restore drill creates and deletes tables outside Terraform; H.13.3/H.13.4 sanction it, but spine S0.1's wording
  ("read-only AWS calls are fine") should mention these exceptions.
- **Phase sizes.** The split gates in [How we work](#phase-sizes-and-split-gates) keep the phase numbers; if you prefer one phase per gate,
  the overview table and cross-references need renumbering.
- **Stub handlers answering `501`** for catalogued routes until their phase is an **[ASSUMPTION]** not in G.
- **Token-level checks of deployed routes before the player shell.** Phases 15–19 deploy routes that can only be exercised with a token from
  managed login; this file defers token-level checks to Phase 21 and E2E-D. If you want them earlier, a small local script that drives managed
  login with Playwright would do it.
- **The art is already drawn** (committed in `bc454c2`), so J's M6-01b/c ("generated" art, "inconsistent style across generations") describe
  work that is now integration and polish; J could say so. The phase numbers stay (64–66 were not moved earlier, as first suggested
  to you): instead the art is used early, from Phase 14, by loading it by path until the Phase 64 manifest exists. Phase 64 can still
  be moved earlier at any gate if you prefer.
- Phase 37's "local preview page" for interaction types is an **[ASSUMPTION]**; D does not specify a development preview.
