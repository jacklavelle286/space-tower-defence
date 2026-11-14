# J. Execution backlog

This section turns the plan into an ordered list of tasks you can pick up one at a time. Each task says what it covers, which
files it touches, what it waits for, roughly how big it is, what could go wrong, and how you will know it is finished. It ends
with the first task, explained step by step, and a way of recording decisions as the work lands.

Spec anchors: "Return dependency-ordered tasks with scope, affected areas/files, relative effort, risks and concrete completion
criteria. Give a small first task that I can implement myself. Document decisions as work is completed" (`prompt.md:76-77`);
"A phased backlog with dependencies, concrete completion criteria, affected areas/files based on the real repository and
relative effort" (`prompt.md:1316`); "A proposed first task small enough for the user to implement, explained as a
colleague/mentor" (`prompt.md:1318`); "Remaining genuine blockers only" (`prompt.md:1320`); the suggested milestones
(`prompt.md:1263-1288`).

What this section does not repeat (it links instead):

- What exists today and why: [A. Repository findings](A-repository-findings.md).
- The milestone contents, the first playable slice and owner decisions D-1 to D-13: [B. Scope and decisions](B-scope-and-decisions.md).
- Designs: [C](C-game-and-learning-design.md) (game and learning), [D](D-ux-and-content-operations.md) (UX and content operations),
  [E](E-architecture.md) (architecture), [F](F-state-and-data.md) (state and data), [G](G-api-contracts.md) (API),
  [H](H-infrastructure-and-delivery.md) (infrastructure and delivery), [I](I-validation.md) (tests and AC mapping).

Nothing in this section exists yet. Every task is future work, and every path in backticks marked "(to create)" is a planned
path. Paths that exist today are links.

---

## J.1 How to read the backlog

### J.1.1 Task fields

| Field | Meaning |
|---|---|
| **ID** | `M<milestone>-<nn>`. The number gives a sensible order inside a milestone; the "Depends on" column is the real constraint. |
| **Task (scope)** | What is in, in one or two lines. Anything not named is out. |
| **Areas / files** | Real paths are links. Planned paths are in backticks with "(to create)". `web/…` and `api/…` follow [E §E.5.1](E-architecture.md#e51-workspace-layout-all-to-create) and [H §H.2](H-infrastructure-and-delivery.md#h2-repository-layout-after-this-plan). |
| **Depends on** | Task IDs that must be finished first. "—" means it can start now. |
| **Effort** | Relative size, scale below. |
| **Risks** | What is most likely to go wrong or take longer. |
| **Done when** | Observable evidence: a command output, a screen, a green job, a recorded file. Not "code written". |
| **Trace** | The plan section that designs it. |

### J.1.2 Effort scale **[ASSUMPTION]**

Sizes assume you are learning the application stack as you go, and that AWS/Terraform work goes at expert speed.

| Size | Meaning |
|---|---|
| **S** | Up to about one focused day. One idea, a handful of files, one test or check proves it. |
| **M** | Two to four days. Several files or one new concept to learn (e.g. a first reducer, a first Terraform module of this kind). |
| **L** | One to two weeks. Several concepts or a whole component with tests. |
| **XL** | More than two weeks. Never started as one task: split it first. Only the art and content items are XL, and each is split. |

### J.1.3 Definition of done for every task **[PROPOSAL]**

A task is only finished when all of these hold, in addition to its own "Done when":

1. The change is committed on `main` (or merged to it), and any CI gate that exists at that point is green
   ([H §H.10](H-infrastructure-and-delivery.md#h10-quality-gates)).
2. If behaviour, setup or operations changed, the README or the relevant runbook says so (`prompt.md:1288`: documentation grows with the work).
3. If a decision was made or changed, there is an ADR in `docs/decisions/` (to create; J.6).
4. If the task settles one of a plan section's "Open points" or an **[UNVERIFIED]** fact, the ADR says so.

---

## J.2 Milestones and dependencies

### J.2.1 Milestone graph

```mermaid
flowchart LR
  BL1{{BL-1 OIDC trust}} --> M0
  M0[M0 hygiene,<br/>blockers, spikes] --> M1[M1 thin slice]
  BL2{{BL-2 DNS records}} --> M1
  M1 --> M2[M2 core game]
  M1 --> M3[M3 content + admin]
  M2 --> M4[M4 campaign,<br/>progression, endless]
  M3 --> M4
  M2 --> M5[M5 persistence<br/>+ offline]
  M4 --> M5
  M5 --> M6[M6 art, perf,<br/>confidence]
  M6 --> F[[Full first release<br/>= data freeze]]
```

Reading the diagram: the two genuine blockers ([B §B7](B-scope-and-decisions.md#b7-genuine-blockers)) sit in front of the
milestones they gate: the OIDC trust (BL-1) gates every CI run from M0 onwards, and your DNS records (BL-2) gate the first
deployed site in M1. After M1, game systems (M2) and content plus admin (M3) run in parallel because they meet only at the
activity slot. M4 needs both. M5 needs M4 because endless block planning and resets change what the offline pack holds. The
freeze comes at the end, no earlier than M5 ([B §B3.4](B-scope-and-decisions.md#b34-the-data-freeze-point-proposal-spine-s114)).
This keeps the milestone order of [B §B3.3](B-scope-and-decisions.md#b33-milestone-path), adding only the M2 → M5 edge. **[PROPOSAL]**

### J.2.2 Critical path to the first playable slice

```mermaid
flowchart TD
  T01[M0-01 .gitignore +<br/>first commit] --> T02[M0-02 OIDC smoke]
  T02 --> T03[M0-03 trust fix<br/>BL-1]
  T01 --> T04[M0-04 DNS<br/>hand-off plan]
  T03 --> I1[M1-01..02 env keys,<br/>main root]
  I1 --> I3[M1-03 foundation apply<br/>+ CNAMEs BL-2]
  I3 --> I10[M1-10 workflows]
  T01 --> T07[M0-07 toolchain]
  T07 --> T08a[M0-08a game-core<br/>package]
  T08a --> T09[M0-09 clock]
  T08a --> T08b[M0-08b scaffold]
  T08b --> A1[M1 app tasks]
  T09 --> A1
  T10[M0-10 auth spike] --> I5[M1-05 Cognito]
  I10 --> R[M1-11 first release]
  I5 --> R
  A1 --> R
  R --> D[M1-24 slice<br/>demonstrated]
```

Reading the diagram: the infrastructure path (left) is short for you and mostly waits on the two blockers. The application
path (right) is long because it is new to you. It starts with the toolchain (M0-07) and a minimal `game-core` package
(M0-08a); the clock (M0-09) needs only those two, and the larger scaffold spike (M0-08b) follows. Work on them while the OIDC
and DNS items are waiting on GitHub settings or DNS propagation. **[PROPOSAL]**

### J.2.3 Parallel tracks **[PROPOSAL]**

| Track | Runs through | Note |
|---|---|---|
| Platform (Terraform, workflows, ops) | M0-02/03, M1-01..11, M2-11, M6-04..09 | Your strongest area; good to interleave when the app work feels slow |
| Game (game-core, Phaser, React player) | M0-08a/08b/09, M1-12..13, M1-20..23, M2 (except M2-11), M4 | The main learning track |
| Server (Python Lambdas, DynamoDB) | M0-13, M1-14..19, M2-06/07, M3, M5 | |
| Content (authoring, audio review) | M0-11, M1-19, M3-10a..d, M4-02 (meteor pool) | Mostly operator time, not code; can run in evenings once the admin app exists |

---

## J.3 The backlog

### M0 — Repository hygiene, genuine blockers and spikes

Goal: remove the unknowns before anything gets big. Spec: "Inspect existing infrastructure/workflows. Confirm authentication
setup, React/Phaser integration and representative phonics generation. Resolve poor pronunciation before scaling the content
bank. Produce architecture decisions and a requirement trace" (`prompt.md:1267-1269`). Spikes build throwaway things; their
output is a recorded answer (an ADR), not production code. **[PROPOSAL]**

Spikes that need AWS resources use a throwaway Terraform root `spikes/<name>/` (to create) with **local** state, names prefixed
`space-tower-defence-spike-`, applied from your laptop with the `space-tower-defence` profile and destroyed at the end. They
never touch `prod-state-bucket-space-tower-defence` or the main stack. The `.gitignore` that M0-01 adds (its `.terraform/` and
`*.tfstate` patterns, [H §H.16](H-infrastructure-and-delivery.md#h16-gitignore-to-create-before-the-first-git-add-infrastructure))
keeps their state out of git. **[PROPOSAL]**

| ID | Task (scope) | Areas / files | Depends on | Effort | Risks | Done when | Trace |
|---|---|---|---|---|---|---|---|
| M0-01 | **Blocker prerequisite. `.gitignore` and first commit.** Add the `.gitignore` from H.16. Commit [prompt.md](../../prompt.md) unchanged, [infrastructure/](../../infrastructure/bootstrap/main.tf) (minus ignored paths, **with** `infrastructure/bootstrap/.terraform.lock.hcl`; the main root's lock file is committed later, in M1-02) and `docs/`. Leave the two copied workflows **uncommitted** until M1-10 replaces them. Push to `main`. *Part of your first task (J.4).* | `.gitignore` (to create); [prompt.md](../../prompt.md); [infrastructure/bootstrap/](../../infrastructure/bootstrap/main.tf); [infrastructure/envs/](../../infrastructure/envs/prod.tfvars.json); `docs/plan/` | — | S | A `git add .` before the ignore file commits `infrastructure/bootstrap/.terraform-prod/`; committing the copied workflows exposes a dispatchable broken pipeline | `git check-ignore -v infrastructure/bootstrap/.terraform-prod` names the `.gitignore` rule; `git ls-files` lists `infrastructure/bootstrap/.terraform.lock.hcl` and both env JSON files but nothing under `.terraform-prod/` and nothing under `.github/`; GitHub shows the commit on `main` | [A §10.1](A-repository-findings.md#101-checklist) #1–2, [H §H.16](H-infrastructure-and-delivery.md#h16-gitignore-to-create-before-the-first-git-add-infrastructure) |
| M0-02 | **Blocker check (BL-1). OIDC smoke-test workflow.** A `workflow_dispatch` workflow, one job with `environment: prod`, that (1) prints the ID token's `sub` claim (never the token), then (2) assumes the CI role and prints `aws sts get-caller-identity`. *Your first task (J.4).* | `.github/workflows/oidc-smoke.yml` (to create); GitHub Settings → Environments → `prod` | M0-01 | S | Token leaked into logs; environments unavailable on the repository's plan **[UNVERIFIED]**; immutable subject means step 2 fails (expected, and that is the finding) | One run on `main` shows the `sub` line; step 2 either shows `arn:aws:sts::263185198757:assumed-role/space-tower-defence-prod-github-oidc/…` or an `AssumeRoleWithWebIdentity` access-denied error; the observed subject is written down (it goes into ADR-0011 in M0-03) | [A §5.2](A-repository-findings.md#52-immutable-oidc-subject-likely-ci-blocker), [H §H.5](H-infrastructure-and-delivery.md#h5-bootstrap-changes-you-make-no-replacement-bootstrap) B-1 |
| M0-03 | **Blocker fix (BL-1), owner action. Trust narrowing and bootstrap re-apply.** Set `trusted_subs` to exactly the subject M0-02 printed, narrowed to `…:environment:prod` (or the B-3 fallback `…:ref:refs/heads/main` if environments are unavailable). Give `prod` a deployment-branch rule allowing only `main`. Re-apply the bootstrap root with your existing `bootstrap.sh`. | [common.auto.tfvars.json:4](../../infrastructure/envs/common.auto.tfvars.json#L4); GitHub environment settings; [infrastructure/bootstrap/](../../infrastructure/bootstrap/main.tf) (no file change beyond the env JSON) | M0-02 | S | A typo in the subject locks CI out (recoverable from your laptop); the branch rule silently missing makes the narrowing meaningless | Bootstrap plan shows **only** an in-place update of the role's trust policy; M0-02 re-run on `main` prints the role ARN and account `263185198757`; a run dispatched from any other branch is refused before the job starts (branch rule) or at `AssumeRoleWithWebIdentity`; ADR-0011 records the final subject and whether environments are available | [A §5.3](A-repository-findings.md#53-recommended-narrowing), [H §H.5](H-infrastructure-and-delivery.md#h5-bootstrap-changes-you-make-no-replacement-bootstrap) B-1–B-3, [B §B7](B-scope-and-decisions.md#b7-genuine-blockers) BL-1 |
| M0-04 | **Blocker planning (BL-2), owner action. DNS hand-off plan.** Decide how you will create the two ACM validation CNAMEs and the two alias records (A + AAAA) in your DNS account, using your established lookup approach. Check the `jackgl.com` zone for CAA records that would block Amazon's CAs. Write the steps down. No records are created yet. | `docs/runbooks/dns-hand-off.md` (to create) | M0-01 | S | CAA records block issuance **[UNVERIFIED]**; accidental change to the apex or `www` (other product) | The runbook names: where the records are created, who/what creates them, the four record names, the Terraform outputs they come from (`acm_validation_records`, `player_distribution_domain`, `admin_distribution_domain`, `cloudfront_hosted_zone_id`), and the CAA result | [E §E.3.3](E-architecture.md#e33-dns-integration-points-no-redesign), [H §H.15](H-infrastructure-and-delivery.md#h15-dns-hand-off), [A §7](A-repository-findings.md#7-dns-integration-points-only) |
| M0-05 | **Repository instructions and decision log.** A short `CLAUDE.md` or README section (labels, layout, "the owner writes the code"); `docs/decisions/` with the ADR template and ADR-0001…0010 (J.6), status *Proposed* until you have read them. Record the spine's open spine amendments that sections A–H list as ADR candidates. This is also M0's "requirement trace": the ADRs link to the plan, and [I](I-validation.md) holds the AC mapping. | `CLAUDE.md` (to create); [README.md](../../README.md); `docs/decisions/README.md`, `docs/decisions/0000-template.md`, `docs/decisions/0001-…` to `0010-…` (to create) | M0-01 | S | Writing too much; ADRs that restate the plan instead of recording a decision | Ten ADR files exist, each under one screen, each linking to its plan section; README links the decision index | [A §10.1](A-repository-findings.md#101-checklist) #4, #13; J.6 |
| M0-06 | **Keep the balance simulator.** Copy the planning simulator into the repository so the C17 evidence can be re-run; make it importable under `python3 -I`. Do this early: today it lives only in a scratch folder that can be cleared. | `tools/sim/` (to create) | M0-01 | S | Source already deleted (then C's tables stay usable as the starting ruleset but cannot be regenerated) | `python3 -I tools/sim/selftest.py` prints "selftest: all checks passed" | [C §C17.8](C-game-and-learning-design.md#c178-how-to-re-run-it-and-keeping-it) |
| M0-07 | **Toolchain.** Install Node 24 LTS and Python 3.14 locally; add `.nvmrc` and `.python-version`. | `.nvmrc`, `.python-version` (to create) | M0-01 | S | Python 3.14 not packaged for your OS yet (use a version manager) | `node -v` prints `v24.x`; `python3.14 -V` prints `3.14.x`; both files committed | [H §H.17](H-infrastructure-and-delivery.md#h17-version-pins), [B §B7.1](B-scope-and-decisions.md#b71-things-to-check-early-that-are-not-blockers) |
| M0-08a | **Minimal `game-core` package.** `web/package.json` declaring one npm workspace, and `web/game-core/` with its own `package.json`, `tsconfig.json` and Vitest; one trivial passing test. Why a workspace package: `game-core` holds the rules that both the player and admin apps import, and making it a separate package with no Phaser or DOM dependency is what keeps the simulation pure and testable on its own ([E §E.5.1](E-architecture.md#e51-workspace-layout-all-to-create)). | `web/package.json`, `web/game-core/package.json`, `web/game-core/tsconfig.json`, `web/game-core/src/` (to create) | M0-07 | S | TypeScript 7 / Vitest configuration mismatch **[UNVERIFIED]** until tried | `npm ci && npm test` from `web/` runs one green Vitest test in `game-core` | [E §E.5.1](E-architecture.md#e51-workspace-layout-all-to-create), [H §H.17](H-infrastructure-and-delivery.md#h17-version-pins) |
| M0-08b | **Spike: front-end scaffold.** Add the `player`, `admin` and `shared` workspaces; Vite 8 + React 19 + TypeScript (per create-vite) + Phaser 4.2.1 + oxlint. One React page that mounts a Phaser scene drawing a rectangle, with Phaser keyboard capture disabled. `game-core` must not import Phaser or DOM (enforced by a lint rule or a test). | `web/player/`, `web/admin/`, `web/shared/` (to create) | M0-08a | M | TS 7 / Phaser 4 / Vite 8 type or plugin incompatibilities **[UNVERIFIED]** until tried; Phaser double-mount under React strict mode | `npm ci && npm run build && npm test` succeed from `web/`; the page shows the scene in a browser; an import of `phaser` inside `game-core` fails the check; versions recorded in ADR-0013 | [E §E.5.1](E-architecture.md#e51-workspace-layout-all-to-create), [H §H.17](H-infrastructure-and-delivery.md#h17-version-pins) |
| M0-09 | **Fixed-timestep clock in `game-core` with Vitest.** The accumulator loop of spine S10 as a pure function plus tests at 30/60/144 Hz frame deltas, the 250 ms clamp, the per-frame step cap `MAX = 30` (250 ms × 2x ÷ one 1/60 s step) **[ASSUMPTION]** and pause. When the cap is hit, the remaining accumulator is discarded, so a slow laptop plays in slow motion (C §C2.1) **[ASSUMPTION]**. *Recommended second task (J.5).* | `web/game-core/src/clock.ts`, `web/game-core/src/clock.test.ts` (to create) | M0-07, M0-08a | S | Floating-point drift in the accumulator; tests that pass because they test the wrong thing | Vitest shows exactly 60 steps per simulated second at 30, 60 and 144 Hz (integer accumulator, J.5); a 2 s frame gap at 2x produces at most 30 steps and leaves the accumulator empty; paused time produces zero steps | [C §C2.1](C-game-and-learning-design.md#c21-time), [E §E.5.3](E-architecture.md#e53-the-bridge) |
| M0-10 | **Spike: authentication.** Throwaway player pool (username-only, case-insensitive, pre sign-up trigger that auto-confirms) and operator pool (admin group, TOTP). Check: managed-login sign-up for this pool shape; how a trigger's raised error is shown; access-token claims (`sub`, `scope`, `token_use`, `cognito:groups` serialisation in a captured HTTP API JWT-authoriser event); refresh keeps scopes; `prompt=login` and `/logout` switching on a shared browser; `tzdata`/Europe/London in the Python 3.14 runtime. | `spikes/auth-cognito/` (to create, local state) | M0-07 | M | Managed login cannot do username-only auto-confirmed sign-up **[UNVERIFIED]** → owner approval needed for the fallback (N-8); adult-only managed-login wording | ADR-0012 records each check's result with a captured (redacted) event; D-10 and the N-8 contingency are decided; the spike stack is destroyed (`terraform state list` empty) | [E §E.7.5](E-architecture.md#e75-main-risk-managed-login-sign-up), [B §B4](B-scope-and-decisions.md#b4-where-this-plan-narrows-or-reinterprets-the-spec) N-8, [B §B6](B-scope-and-decisions.md#b6-owner-decisions-d-1-to-d-13) D-10 |
| M0-11 | **Spike: Polly listening matrix.** Render the test set (about 24 items × Amy, Emma, Brian, Arthur; neural; en-GB) with the AWS CLI from your laptop, using exactly the canonical inputs the clip key will hash (text/SSML, voice, engine, format). Try the variants for risky sounds. Listen with a second adult and one child. The real preview route does not exist yet, so the chosen clips are re-rendered through it later (M1-18, M3-05). | `spikes/polly-listening/` (to create; clips stay local, not committed: add an ignore line for the clip folder, since H.16 has no audio pattern) | — | M | Isolated phonemes sound wrong in every voice (then fewer sounds are published in isolation, L-09); listening fatigue | ADR-0014 names one voice, a per-sound verdict (publishable · with small schwa · word-only) and the frozen SSML templates | [D §D9.1](D-ux-and-content-operations.md#d91-milestone-0-listening-spike-before-any-phonics-authoring), [C §C26.3](C-game-and-learning-design.md#c263-authoring-sequence-and-sources) phase A |
| M0-12 | **Spike: IndexedDB and presigned audio.** A throwaway bucket with CORS for `http://localhost:<port>`, one MP3, a presigned GET; in the browser fetch the bytes, store them with `idb`, play them with the network off; try `navigator.storage.persist()`, a quota error and an origin-wide Web Lock. | `spikes/audio-idb/` (to create) | M0-08b | M | Autoplay rules block playback without a user gesture; Safari/Firefox storage differences | A short screen recording or notes show offline playback from stored bytes; ADR-0015 records the playback API choice and the persist/quota behaviour seen | [E §E.9](E-architecture.md#e9-audio-caching-and-playback), [F §9.3](F-state-and-data.md#93-local-database-scd-sub) |
| M0-13 | **Spike: DynamoDB transaction fixtures.** On a throwaway real table **and** in moto: a G5-shaped `TransactWriteItems` (ConditionCheck SESSION + revision-conditioned RUN update + slot update); capture `CancellationReasons` for each failure; `ReturnValuesOnConditionCheckFailure`; the nested-map `SET` after `planets = {}`; reserved-word handling via `ExpressionAttributeNames`. Save the real responses as fixtures. | `spikes/ddb-transactions/` (to create); `api/tests/fixtures/ddb/` (to create) | M0-07 | M | moto's cancellation reasons differ from the real service (the reason to capture real ones) | Fixture files hold real cancellation responses for SESSION-fence, revision and slot-status failures; a pytest shows moto matching or a note says where it differs | [F §12.3](F-state-and-data.md#123-transaction-composition-and-action-counts), [F §8](F-state-and-data.md#8-attempt-and-reward-idempotency) |
| M0-14 | **Unverified-facts register.** Collect every **[UNVERIFIED]** item from A–H open points into one checklist with the task that will settle it (M0 spike, M1 smoke, or later). | `docs/decisions/unverified.md` (to create) | M0-05 | S | Items fall through the cracks | Every listed item has an owner task ID; items already settled are ticked with their ADR number (the rest are ticked as M0-10..13 and later tasks finish, which is not part of this task) | [H open points](H-infrastructure-and-delivery.md#open-points-for-the-planner), [G open points](G-api-contracts.md#open-points-for-the-planner) |

### M1 — Thin vertical slice (one planet, two waves, one activity with Play, cloud save)

Goal and scope: [B §B3.2](B-scope-and-decisions.md#b32-side-by-side). It uses the real op envelope, slot model, session fence and
speech path, with less content. Three choices this section makes for M1, each recorded as an ADR in M1-24:

| # | Choice | Why | Label |
|---|---|---|---|
| J-1 | The M1 wave set is `mode = CHALLENGE` (two waves, slot `N-001` only, no `meteorAfter`). | Smallest op set (no `COMPLETION_OFFER`, `FINISH_RUN` or an empty endless offer). The first `PROFILE` write on `COMPLETE_WAVE` moves to M2 ([F §3.7](F-state-and-data.md#37-the-milestone-1-wave-set-data-view)). | **[PROPOSAL]** |
| J-2 | Session scope: server side complete (SESSION item, claim/renew/release, fence in every op, claim inside create); client stamps every op with its generation and runs one serial queue; a plain message for the session 409s. Takeover dialog, divergence options, recovery panel and offline wait for M5. | Adding generation stamping later would change stored ops ([F §5.6](F-state-and-data.md#56-what-milestone-1-needs-answer-to-bs-question)). | **[PROPOSAL]** |
| J-3 | The one M1 clip is previewed and approved through a **minimal admin app** (operator sign-in, a speech page with Preview / Play / Approve, an activity page with Validate / Publish for seeded drafts), served on `admin.aliens.jackgl.com`. So the admin alias record moves from M3 to M1. | The real preview → approve path without extra auth flows. The operator app client's callback URLs are on the admin hostname, so a CLI or `localhost` route would need a second client or a weaker auth flow. These pages are the first slice of the M3 admin app, not throwaway. | **[PROPOSAL]** (changes the "M3" timing in [B §B7](B-scope-and-decisions.md#b7-genuine-blockers) BL-2 and [H §H.15.1](H-infrastructure-and-delivery.md#h151-what-terraform-gives-you-and-what-you-create) row 4) |

Bank eligibility thresholds are set to 1 as labelled milestone configuration (N-7).

| ID | Task (scope) | Areas / files | Depends on | Effort | Risks | Done when | Trace |
|---|---|---|---|---|---|---|---|
| M1-01 | **Env keys.** Add the H.6 keys; declare them (`default = null`) in the bootstrap root (B-5); re-apply the bootstrap. | [common.auto.tfvars.json](../../infrastructure/envs/common.auto.tfvars.json), [prod.tfvars.json](../../infrastructure/envs/prod.tfvars.json), [bootstrap/variables.tf](../../infrastructure/bootstrap/variables.tf) | M0-03 | S | A key declared in one root only (warnings on every run) | Bootstrap plan: no changes and no undeclared-variable warnings | [H §H.6](H-infrastructure-and-delivery.md#h6-environment-file-keys), [A §10.2](A-repository-findings.md#102-environment-file-keys-to-add) |
| M1-02 | **Main root skeleton.** `provider.tf` (default + `us_east_1` alias, `allowed_account_ids`, `default_tags`, partial S3 backend), `variables.tf`, `locals.tf`, `data.tf` (managed CloudFront policy lookups only), `main.tf`, `outputs.tf`; commit the lock file. | `infrastructure/main/*.tf` (to create; the directory exists, empty); `infrastructure/main/.terraform.lock.hcl` (to create) | M1-01 | S | Backend bucket typo creates state elsewhere (the `head-bucket` guard prevents it in CI) | `terraform init` with the H.8.4 settings and `terraform validate` succeed locally; `terraform plan` shows no resources yet | [H §H.3](H-infrastructure-and-delivery.md#h3-infrastructuremain-all-to-create), [H §H.8.4](H-infrastructure-and-delivery.md#h84-backend-initialisation-every-job-that-runs-terraform) |
| M1-03 | **Foundation apply (F1) and validation CNAMEs (F2, BL-2).** Modules `certificate` and `private_bucket` (artefacts). One targeted apply from your laptop; you create the two CNAMEs per M0-04. | `infrastructure/modules/certificate/`, `infrastructure/modules/private_bucket/` (to create) | M1-02, M0-04 | M | Validation stalls (CAA, typo); ACM gives up after 72 h | `terraform output acm_validation_records` shows two records; `aws acm describe-certificate --region us-east-1` shows `ISSUED`; the artefacts bucket exists with versioning on | [H §H.15.2](H-infrastructure-and-delivery.md#h152-first-apply-sequencing-proposal) |
| M1-04 | **Data modules.** `dynamodb_table` ×2 (`game`, `content`; PITR, deletion protection, `prevent_destroy`; TTL attribute only on `game` for the sign-up counter) and `private_bucket` for audio (CORS from the two exact origins). | `infrastructure/modules/dynamodb_table/` (to create) | M1-02 | S | TTL accidentally enabled on items other than `SYS#SIGNUPS` (it is per table, by attribute name; only that item carries `ttl`) | `terraform plan` shows two tables and the audio bucket with the protections listed in H.11.1 | [H §H.4.6](H-infrastructure-and-delivery.md#h46-dynamodb_table-called-twice-and-private_bucket-called-twice), [F §12](F-state-and-data.md#12-dynamodb-design) |
| M1-05 | **Cognito.** `cognito_pool` ×2 with the spike's findings (M0-10): player pool + pre sign-up trigger wiring and daily cap; operator pool with TOTP and `admin` group; prefix domains; resource servers and scopes; app clients with PKCE. Operator account created by `AdminCreateUser` per a runbook. | `infrastructure/modules/cognito_pool/` (to create); `docs/runbooks/operator-accounts.md` (to create) | M1-02, M0-10 | M | Changing an app client attribute that forces replacement (signs everyone out; plan guard reports it) | Plan shows both pools with deletion protection `ACTIVE`, the pre sign-up trigger attached to the player pool only, and TOTP required on the operator pool (the live sign-up and sign-in checks are part of M1-11) | [E §E.7](E-architecture.md#e7-authentication-and-authorisation), [H §H.4.5](H-infrastructure-and-delivery.md#h45-cognito_pool-called-twice) |
| M1-06 | **API and functions.** `lambda_function` ×4 (log group first, role beside function, zip from S3 by `s3_key` + hash, `Errors`/`Throttles` alarms) and `http_api` (payload 2.0, `$default` stage, access log allow-list, two JWT authorisers, route scopes, throttles, permissions). | `infrastructure/modules/lambda_function/`, `infrastructure/modules/http_api/` (to create) | M1-02 | M | `source_arn` format for API Gateway permissions **[UNVERIFIED]**; bare `default_route_settings` meaning zero throttling **[UNVERIFIED]** | Plan shows four functions with the per-function IAM of E.6.4 and every route with an authoriser and scope; no route without one | [E §E.6](E-architecture.md#e6-lambda-and-api-boundaries), [H §H.4.3](H-infrastructure-and-delivery.md#h43-http_api), [H §H.4.4](H-infrastructure-and-delivery.md#h44-lambda_function-called-four-times) |
| M1-07 | **Sites.** `static_site` ×2: private bucket + OAC, CloudFront Function SPA fallback on the default behaviour only, `/api/*` behaviour (`CachingDisabled`, `AllViewerExceptHostHeader`), response headers policy and CSP, aliases on the issued certificate. | `infrastructure/modules/static_site/` (to create) | M1-03 | M | A distribution-wide custom error response would rewrite API errors into `index.html` (gate G-5 refuses it); CloudFront Function size limit **[UNVERIFIED]** | Plan shows two distributions with no `custom_error_response` and the CloudFront Function on the default behaviour only (the live deep-link, `/missing.js` and `/api/me` 401 checks are M1-11's smoke checks) | [E §E.2](E-architecture.md#e2-same-origin-api-through-cloudfront), [H §H.4.2](H-infrastructure-and-delivery.md#h42-static_site-called-twice) |
| M1-08 | **Monitoring.** `monitoring` module: SNS topic + us-east-1 mirror, e-mail subscriptions, the H.14 alarms that exist at M1 (Lambda, API 5xx, `ops-rejected`, `speech-unavailable`, DynamoDB throttles, CloudFront 5xx). | `infrastructure/modules/monitoring/` (to create) | M1-06, M1-07 | S | Subscriptions not confirmed within 48 h (deleted by SNS) | Plan shows every alarm in H.14 except Backup, each wired to the right topic (the subscription confirmation and test e-mail are checked in M1-11) | [H §H.14](H-infrastructure-and-delivery.md#h14-monitoring-and-alarms-spine-s115) |
| M1-09 | **Python packaging and API skeleton.** `api/` with four function folders, `api/shared/` (data-access helper with ConsistentRead and `ExpressionAttributeNames`, error envelope, allow-list logger, route-key authorisation), Powertools, ruff, pytest + moto; `scripts/build_lambdas.py` producing reproducible arm64 zips. | `api/functions/{player_api,admin_api,tts,cognito_presignup}/`, `api/shared/`, `api/tests/`, `api/requirements*.txt`, `scripts/build_lambdas.py` (to create) | M0-07, M0-13 | M | Non-reproducible zips (every release shows every function changing); a missing arm64 wheel | Building twice gives identical SHA-256 per zip; `pytest` and `ruff` pass; a test proves an unknown route key is denied before any lookup | [H §H.9.2](H-infrastructure-and-delivery.md#h92-build-rules-that-keep-the-plan-honest), [E §E.6](E-architecture.md#e6-lambda-and-api-boundaries), [G §15](G-api-contracts.md#15-logging-allow-list) |
| M1-10 | **Release workflows.** `release.yml`, `apply.yml`, `plan.yml` per H.7–H.8 (config, checks, build, plan + guard in report mode, two-dispatch approval, apply saved plan, publish, smoke, record). Delete the two copied workflows from your working copy in the same commit. Gates G-1, G-2, G-4, G-5, G-6, G-7 (report), G-10, G-11. | `.github/workflows/release.yml`, `apply.yml`, `plan.yml` (to create); `scripts/plan_guard.py`, `infrastructure/plan-guard.json` (to create); [deploy.yml](../../.github/workflows/deploy.yml) and [tf-apply-destroy-env.yml](../../.github/workflows/tf-apply-destroy-env.yml) (deleted) | M0-03, M1-02, M1-03 (the artefacts bucket the build uploads to), M1-09 | L | Saved plan applied on a different runner/Terraform (stale or refused); inputs interpolated into shell; plan artefact visibility if the repo is public | A dispatch on `main` runs to "dispatch apply.yml with plan_run_id = N"; `apply.yml` with that ID applies exactly that plan; a dispatch from another branch fails in `config`; `grep -r -- '-auto-approve\|update-function-code\|destroy' .github/` finds nothing | [H §H.7](H-infrastructure-and-delivery.md#h7-workflows-what-replaces-the-two-copies), [H §H.8](H-infrastructure-and-delivery.md#h8-the-manual-release-spine-s111), [H §H.10](H-infrastructure-and-delivery.md#h10-quality-gates) |
| M1-11 | **First release (F3), alias records (F4, BL-2) and alarms (F5).** Dispatch the release; create `aliens.jackgl.com` and (per J-3) `admin.aliens.jackgl.com` aliases; confirm SNS; first entry in `docs/releases/`. | `docs/releases/` (to create) | M1-03…M1-10 | S | Distribution waits on certificate (should not: issued in M1-03) | All H.8.6 smoke checks green on both hostnames, not only `*.cloudfront.net`; a test child signs up and signs in through managed login and the operator signs in with TOTP (M1-05); both SNS subscriptions are confirmed and a `set-alarm-state` test e-mail arrives (M1-08); `docs/releases/` has the entry with the release ID | [H §H.15.2](H-infrastructure-and-delivery.md#h152-first-apply-sequencing-proposal), [H §H.8.6](H-infrastructure-and-delivery.md#h86-smoke-checks-step-7-read-only) |
| M1-12 | **Contracts for M1.** JSON Schemas for the ops envelope and the six M1 ops (`SAVE_PREP`, `START_WAVE`, `COMPLETE_WAVE`, `SUBMIT_ATTEMPT`, `DEFEAT`, `ABANDON`), the shared limits file, and the first op-sequence and answer fixtures. | `contracts/schemas/`, `contracts/fixtures/` (to create); `web/shared/src/limits.ts` (to create) | M0-08b | M | Schemas drift from G (generate types from them rather than writing both by hand) | Both Vitest and pytest load the same fixture files; an unknown field in a payload fails schema validation in both | [G §5](G-api-contracts.md#5-the-ops-batch--post-apirunsrunidops-r11), [G §1.4](G-api-contracts.md#14-request-limits-applied-before-any-business-logic) |
| M1-13 | **`game-core` rules reducer (M1 ops), next-phase rule, multiple-choice canonicaliser.** A reducer is a pure function `(state, op) → new state or refusal`; it is how the client decides whether an op may exist at all. | `web/game-core/src/rules/` (to create) | M0-09, M1-12 | M | Reducer and server rules disagree (the fixtures exist to catch it) | Vitest runs every M1 fixture sequence and produces the expected views and refusals | [F §3.3](F-state-and-data.md#33-operations-the-only-ways-run-state-changes), [C §C20](C-game-and-learning-design.md#c20-the-six-interaction-types-data-definitions) |
| M1-14 | **Python reducer mirror (M1 ops).** The same rules on the server side, run against the same fixtures. | `api/shared/rules/` (to create) | M1-09, M1-12 | M | Subtle integer/rounding differences between languages | pytest runs the same fixture files as M1-13 with identical results | [F §3.3](F-state-and-data.md#33-operations-the-only-ways-run-state-changes) |
| M1-15 | **Profile routes.** `PUT/PATCH /api/me/profile`, `GET /api/me`, `GET /api/planets`; DOB write-only; age band in Europe/London; `cognito-presignup` daily cap (fail closed). | `api/functions/player_api/`, `api/functions/cognito_presignup/` (to create) | M1-09, M0-10 | M | DOB leaking into a response, error detail or log line | A pytest posts a known DOB and asserts it appears in no response body and no captured log line; a test at the cap raises, never `autoConfirmUser=false` | [G §3](G-api-contracts.md#3-profile-and-dashboard-routes), [E §E.10](E-architecture.md#e10-family-level-trust-model) |
| M1-16 | **Runs and session routes.** `POST /api/runs` (G7: lookup first, one transaction with the claim, run and slot), selection with threshold 1 (tests use small fixture game-data and bounds files until M1-23 supplies the real ones), `GET /api/runs/{runId}`, `/pack`; `PUT/DELETE /api/session` (claim/renew/release). | `api/functions/player_api/`, `api/shared/selection/` (to create) | M1-14, M1-15 | L | Transaction cancellation mis-classified (use the M0-13 fixtures) | moto tests: repeating a create returns the same run unchanged; a second session gets `ACTIVE_SESSION_ELSEWHERE`; another player's `runId` returns `NOT_FOUND` | [F §5](F-state-and-data.md#5-play-session-state-machine-account-wide-lease-with-fencing-token), [G §4](G-api-contracts.md#4-runs), [G §7](G-api-contracts.md#7-session-lease--r13-put-apisession-r14-delete-apisession) |
| M1-17 | **The ops endpoint.** `POST /api/runs/{runId}/ops`: per-op order (a)–(i), G5 transaction, jittered retry, `recentOps`, per-op results, HTTP status rules, structured log line per op. | `api/functions/player_api/` | M1-16 | L | Duplicate check placed after the fence (breaks idempotency); retries that re-use a stale read | Tests: replaying a batch returns `ALREADY_APPLIED` with the original result; a wrong `expectedRevision` stops the batch and later ops are `NOT_PROCESSED`; the third wrong answer resolves `FAILED` and a correct one grants the reward exactly once | [F §8](F-state-and-data.md#8-attempt-and-reward-idempotency), [G §5](G-api-contracts.md#5-the-ops-batch--post-apirunsrunidops-r11) |
| M1-18 | **Speech service.** `tts`: `POST /api/speech` (one consistent slot read under the caller's `sub`, presigned 300 s URL, `SPEECH_UNAVAILABLE` on a missing object) and `POST /api/admin/speech/preview` (validation, synthesise only if absent, `PutObject If-None-Match: *`); shared clip-key module. | `api/functions/tts/`, `api/shared/clipkey.py` (to create) | M1-09, M0-11 | M | `HeadObject` returns 403 not 404 without `ListBucket` (E open point) | pytest: preview of the same input twice calls Polly once; a child's request for another child's slot returns `NOT_FOUND`; a missing clip returns 503 `SPEECH_UNAVAILABLE` and writes one ERROR line of the shape the `speech-unavailable` metric filter matches (the live alarm is proved in M6-07) | [E §E.4](E-architecture.md#e4-the-dedicated-tts-service), [G §11](G-api-contracts.md#11-speech) |
| M1-19 | **Minimal admin path and seed (J-3).** `admin-api`: speech draft + approve, activity draft + validate + publish (subset). `scripts/seed_content.py` (dry-run by default, create-only) loading `ph-0102` and `phoneme-sh` drafts. `web/admin`: operator sign-in, Speech page, Activity page. | `api/functions/admin_api/`, `scripts/seed_content.py`, `content/seed/`, `web/admin/` (to create) | M1-05, M1-11, M1-18, M0-08b | M | Seed script overwriting (must be conditional); approving a clip that was never previewed | On `admin.aliens.jackgl.com` you preview, play and approve the clip, and the approved speech version records the same `clipKey` as the preview; running the seed twice reports "skipped, exists"; a player token is refused on every `/api/admin/*` route (gateway 401, never 2xx) and an operator token without the `admin` group gets `403 FORBIDDEN` ([I §I.2.7](I-validation.md#i27-api-contract-tests)) | [D §D8.6](D-ux-and-content-operations.md#d86-seeding-and-import), [D §D9](D-ux-and-content-operations.md#d9-phonics-preview-review-and-the-quality-gate), [G §12](G-api-contracts.md#12-administration-routes) |
| M1-20 | **Player shell.** `config.json` load, managed-login PKCE sign-in/out, profile setup, Home; API client with `ownerSub` check before every request; serial queue with generation-stamped ops (online only); sync chip (`SYNCED`, `PENDING`, `RETRYING`, `AUTH_REQUIRED`). | `web/player/src/` (to create) | M0-08b, M1-11, M1-12, M1-15 | L | Token refresh races; React re-rendering per frame later | Sign up → profile → Home works on `aliens.jackgl.com`; signing in as a different child in another tab makes the first tab stop and reload | [E §E.7.4](E-architecture.md#e74-sign-out-shared-laptop-switching-and-one-page-load--one-account), [D §D3](D-ux-and-content-operations.md#d3-key-journeys), [F §7](F-state-and-data.md#7-client-sync-state-machine-per-account-client-only) |
| M1-21 | **Battlefield slice.** Phaser scene with placeholder art: one route, a few pads, one class at level 1, one alien; `GameBridge`; simulation driven by the M0-09 clock; wave 1 → activity → wave 2 → completed; defeat. | `web/player/src/game/`, `web/game-core/src/sim/` (to create) | M0-09, M1-13 | L | Simulation logic leaking into the Phaser scene (keep it in `game-core`) | A two-wave run completes in the browser; the same seed and inputs give the same post-wave snapshot in a Vitest | [C §C2](C-game-and-learning-design.md#c2-simulation-rules-game-core), [E §E.5](E-architecture.md#e5-react-phaser-and-game-core) |
| M1-22 | **Learning panel (multiple choice) and Play.** Panel, Play button through `POST /api/speech`, greyed tries (client guard, D-8), feedback, reward; resume per phase. | `web/player/src/learning/`, `web/shared/src/audio/` (to create) | M1-18, M1-20, M1-21 | M | Treating a speech failure as an attempt (it must not) | Two wrong answers, refresh, the panel shows two greyed tries and one attempt left; the third try resolves; Play works after refresh | [D §D6](D-ux-and-content-operations.md#d6-the-six-interaction-types-as-the-child-experiences-them), [E §E.4](E-architecture.md#e4-the-dedicated-tts-service) |
| M1-23 | **First game data.** Ruleset (`mechanics` 1) and planet document with the M1 challenge wave set; `current.json`; the TypeScript bounds-file build script. Seeded from `tools/sim/game_data.json` where it applies. | `game-data/ruleset/`, `game-data/campaign/`, `game-data/current.json`, `web/game-core/scripts/build-bounds.ts`, `api/shared/bounds.py` (`load_bounds`) (to create) | M0-06, M1-09, M1-10, M1-13 | S | Version strings that do not match `^[a-z0-9.-]{1,40}$` | The release publishes the files create-only; `player-api` loads the bounds file via `load_bounds` | [C §C15](C-game-and-learning-design.md#c15-where-these-numbers-live-in-the-build), [H §H.8.5](H-infrastructure-and-delivery.md#h85-static-publish-order-step-6) |
| M1-24 | **M1 demonstrated and recorded.** Walk the B3.2 "done when" list on production; ADRs for J-1…J-3; child playtest P1 ([I §I.5](I-validation.md#i5-child-playtest-protocol-ages-57)). | `docs/releases/`, `docs/decisions/`, `docs/validation/playtests/` (to create) | M1-11, M1-17, M1-19, M1-22, M1-23 | S | Declaring done on `*.cloudfront.net` only | On `aliens.jackgl.com`: a clip plays through the real service; three attempts and one reward; refresh keeps the attempts; leaving and returning resumes from the cloud save; release entry written; P1 notes (no names) in `docs/validation/playtests/` | [B §B3.2](B-scope-and-decisions.md#b32-side-by-side), [C §C26.3](C-game-and-learning-design.md#c263-authoring-sequence-and-sources) phase B |

### M2 — Core game systems

Goal: six classes, upgrades, selling, targeting, powers, the alien catalogue, carriers, bosses and the explicit run lifecycle
(`prompt.md:1273-1274`).

| ID | Task (scope) | Areas / files | Depends on | Effort | Risks | Done when | Trace |
|---|---|---|---|---|---|---|---|
| M2-01 | **Roster.** Six classes × three levels, purchase/upgrade/sell/refund, deployment caps; economy mutations validated at tick boundaries. | `web/game-core/src/sim/`, `game-data/ruleset/` | M1-24 | L | Negative balances from UI races (AC-09) | Vitest: rapid buy/sell commands never produce negative credits; refund values match C5.7 | [C §C5](C-game-and-learning-design.md#c5-astronaut-roster), [C §C9](C-game-and-learning-design.md#c9-economy) |
| M2-02 | **Targeting and support rules.** Targeting modes; slow cap and stacking; shield/repair limits; strongest-buff rule. | `web/game-core/src/sim/` | M2-01 | M | Feedback loops between buffs | Unit tests for each C5.4–C5.6 rule, including "no loops" | [C §C5.3](C-game-and-learning-design.md#c53-targeting) |
| M2-03 | **Aliens.** Catalogue, traits, carriers and splitters, object caps. | `web/game-core/src/sim/`, `web/player/src/game/` | M2-01 | L | Object counts above the caps (performance) | Tests: a carrier releases its descendants per C6.3; caps never exceeded in a stress wave | [C §C6](C-game-and-learning-design.md#c6-aliens) |
| M2-04 | **Bosses.** Five bosses with phases. | `web/game-core/src/sim/` | M2-03 | M | A boss that requires a class or power (C17.4 says none should) | Simulator and Vitest agree a baseline defence beats each boss | [C §C7](C-game-and-learning-design.md#c7-bosses) |
| M2-05 | **Meteor powers in the simulation.** `usePower`, charges, inventory cap. | `web/game-core/src/sim/` | M2-01 | M | A cooldown crossing a wave boundary (spine S4 forbids it) | Tests: charges only change through use or the server grant; nothing carries across waves except counts | [C §C10](C-game-and-learning-design.md#c10-meteor-powers) |
| M2-06 | **Full run lifecycle ops.** `METEOR` phase, `DISMISS_SLOT`, `COMPLETION_OFFER`, `FINISH_RUN`, `CHOOSE_ENDLESS` (route plumbing only; endless content in M4), `ABANDON` UI; `PROFILE` update on `COMPLETE_WAVE` (best wave). Both reducers. | `web/game-core/src/rules/`, `api/shared/rules/`, `api/functions/player_api/` | M1-24 | L | Phase × op matrix gaps | Fixtures cover every cell of F §3.5's matrix; both reducers pass | [F §3](F-state-and-data.md#3-run-state-machine), [G §6](G-api-contracts.md#6-post-apirunsrunidendless-r12-choose_endless--online-only) |
| M2-07 | **Plausibility bounds.** Bounds file with `maxBounty`, prices, caps; S6 checks in `player-api`. | `web/game-core/scripts/build-bounds.ts`, `api/shared/bounds.py` (both created in M1-23; extended here) | M2-01, M2-06 | M | Bounds too tight for legitimate play (false `REJECTED`, alarm fires) | Property test: thousands of simulated legitimate waves never trip a bound; a forged `COMPLETE_WAVE` with extra credits is `CHECKPOINT_OUT_OF_BOUNDS` | [E §E.10](E-architecture.md#e10-family-level-trust-model), [F §6](F-state-and-data.md#6-checkpoint-semantics) |
| M2-08 | **Shared fixtures become a gate (G-3).** Op sequences for every op and refusal; answer vectors. | `contracts/fixtures/`, `.github/workflows/release.yml` | M2-06 | M | Fixtures written from one implementation's output (they must come from the spec) | G-3 runs in `checks` and fails the release on any mismatch | [H §H.10](H-infrastructure-and-delivery.md#h10-quality-gates) |
| M2-09 | **HUD, shop and battlefield keys.** Speed, pause on hidden/dialog, keyboard actions (D5.2); HUD events ≤ 10 Hz. | `web/player/src/hud/` (to create) | M2-01 | M | React re-rendering every frame | Profiler shows no per-frame React commits; every battlefield action works mouse-only and keyboard-only | [D §D4](D-ux-and-content-operations.md#d4-screen-specifications), [D §D5](D-ux-and-content-operations.md#d5-keyboard-and-mouse) |
| M2-10 | **Determinism and frame-rate tests.** Same wave at 30/60/144 Hz gives identical tick count and post-wave snapshot. | `web/game-core/src/**/*.test.ts` | M2-04, M2-05 | S | Hidden use of wall-clock time or `Math.random` | Vitest passes for a boss wave at all three rates | [C §C2](C-game-and-learning-design.md#c2-simulation-rules-game-core), [I](I-validation.md) |
| M2-11 | **Backup module and restore runbook draft.** Vault, daily plan, 7 recovery points, selection by table ARN; `backup-job-failed` alarm. | `infrastructure/modules/backup/`, `docs/runbooks/restore.md` (to create) | M1-11 | M | Backup trust principal string **[UNVERIFIED]** | Vault shows daily recovery points for both tables after two days; runbook procedures A–D written | [H §H.13](H-infrastructure-and-delivery.md#h13-daily-backup-and-restore-runbook-spine-s84) |
| M2-12 | **Saved games.** `GET /api/runs` list and cursor, soft cap of 5 open runs, best-effort pruning beyond 50 terminal runs, Saved games screen. | `api/functions/player_api/`, `web/player/src/` | M2-06 | M | Prune failure changing an op result (it must not) | Tests: a sixth open run returns `RUN_LIMIT_REACHED`; the 51st finished run triggers pruning of the oldest | [F §12](F-state-and-data.md#12-dynamodb-design), [D §D4](D-ux-and-content-operations.md#d4-screen-specifications) |
| M2-13 | **First performance measurement and playtest P2.** Measure the busiest M2 waves (carriers, a boss) on the children's laptop at 2x; write the AC-42 target into C14 (via an ADR, since C is a plan section); run child playtest P2 ([I §I.5](I-validation.md#i5-child-playtest-protocol-ages-57)). | `docs/validation/` (to create), `docs/validation/playtests/` | M2-03, M2-04, M2-09 | M | Measuring on a faster machine than the children use; placeholder art understating draw cost | A recorded measurement in `docs/validation/` with the device, wave and frame-time figures; the AC-42 target is written down (ADR and C14); P2 notes in `docs/validation/playtests/` | [C §C14](C-game-and-learning-design.md#c14-performance-budget-feeds-ac-42), [I §I.6](I-validation.md#i6-evidence-kept-per-milestone) |

### M3 — Educational content and administration

Goal: the age-banked content model, six interaction types, subject rotation, binary summaries, immutable publication and audio
review (`prompt.md:1276-1277`). Owner decisions D-1, D-2, D-4, D-5, D-7, D-9 are due by now ([B §B6](B-scope-and-decisions.md#b6-owner-decisions-d-1-to-d-13)).

| ID | Task (scope) | Areas / files | Depends on | Effort | Risks | Done when | Trace |
|---|---|---|---|---|---|---|---|
| M3-01 | **Admin app shell.** Navigation, operator route guard, activity list, bank status page placeholder. Builds on M1-19. | `web/admin/` | M1-24 | M | Admin depending on Phaser (forbidden by E.5.1) | Operator signs in with TOTP; a player account sees "not authorised"; a player token is refused on every `/api/admin/*` call (gateway 401, never 2xx) and an operator token without the `admin` group gets `403 FORBIDDEN` | [D §D8](D-ux-and-content-operations.md#d8-operator-app-adminaliensjackglcom) |
| M3-02 | **Activity lifecycle API.** Draft (with `draftRevision`), validate, publish (condition checks on approved speech), retire, withdraw `{version, reason}`, audit. | `api/functions/admin_api/` | M1-24 | L | Publish race between two tabs | Tests: a stale `draftRevision` is refused; published versions are never modified; withdraw writes the audit item | [F §12](F-state-and-data.md#12-dynamodb-design), [G §12](G-api-contracts.md#12-administration-routes), [C §C22](C-game-and-learning-design.md#c22-activity-definition-schema-validation-and-lifecycle) |
| M3-03 | **Player learning panels for all six interaction types** and the canonicaliser for every type; shared learning panel placed in `web/shared`. | `web/shared/src/learning/` (to create), `web/game-core/src/rules/canonical.ts` (to create) | M1-22 | L | Two normalisers creeping in (there must be one, in TypeScript) | Answer vectors pass for all six types in Vitest; pytest checks shapes only; each type works mouse-only and keyboard-only | [C §C20](C-game-and-learning-design.md#c20-the-six-interaction-types-data-definitions), [D §D6](D-ux-and-content-operations.md#d6-the-six-interaction-types-as-the-child-experiences-them) |
| M3-04 | **Admin editor and preview-solve** for the six types, rendering the real player panel. | `web/admin/src/editor/` (to create) | M3-01, M3-02, M3-03 | L | Editor allowing a choice activity with < 4 options (publish validation must refuse) | An operator can create, validate, preview-solve and publish one activity of each type | [D §D8](D-ux-and-content-operations.md#d8-operator-app-adminaliensjackglcom) |
| M3-05 | **Speech lifecycle and listening checklist UI.** Full speech definitions; checklist before Approve; quality gate. | `web/admin/src/speech/` (to create), `api/functions/admin_api/` | M3-01, M0-11 | M | Approving without listening (the checklist is a declaration, not proof) | Approve is disabled until preview has played and the checklist is ticked; the approved `clipKey` matches the previewed one | [D §D9](D-ux-and-content-operations.md#d9-phonics-preview-review-and-the-quality-gate), [E §E.4](E-architecture.md#e4-the-dedicated-tts-service) |
| M3-06 | **Templates.** Python generator module (pure, versioned), exhaustive publish check (cap 5,000), materialisation into slots at run creation. | `api/shared/generators/` (to create) | M3-02 | L | A generator's output changing between versions (must never happen for the same `(kind, version)`) | Snapshot tests per `(kind, version)`; publish refuses a template whose domain has an invalid instance | [C §C25](C-game-and-learning-design.md#c25-templates) |
| M3-07 | **Selection and bank status.** Subject rotation, seeded draws, no repeats, eligibility thresholds (real values), `CONTENT_UNAVAILABLE`, bank-status page. | `api/shared/selection/`, `web/admin/src/bank/` (to create) | M3-02, M3-06 | L | An age band reported eligible that cannot fill a run | Property test over many seeds: every slot filled, no activity repeated within a run; bank status matches the counts | [C §C24](C-game-and-learning-design.md#c24-selection-when-a-run-is-created) |
| M3-08 | **Learning summaries.** `SUM#` counters in the resolving transaction; `GET /api/me/progress`; My progress screen. | `api/functions/player_api/`, `web/player/src/progress/` (to create) | M2-06 | M | Double counting on replay | Replaying a resolving op leaves counters unchanged; DECLINED/VOIDED never count | [C §C26](C-game-and-learning-design.md#c26-learning-summaries-and-bank-sizing), [F §10.2](F-state-and-data.md#102-permanent-vs-run-progression) |
| M3-09 | **Withdrawal and VOID.** Server VOID path, `withdrawn` flag in the run view, child copy, `DISMISS_SLOT` for withdrawn slots. | `api/functions/player_api/`, `web/player/src/learning/` | M3-02, M2-06 | M | Voiding already-resolved slots (must not; D-9) | Fixture: withdrawn version → `VOIDED`, reward once, summary unchanged | [F §4.4](F-state-and-data.md#44-void-exceptional-invalid-content), [C §C27](C-game-and-learning-design.md#c27-invalid-content-handling-spine-s33) |
| M3-10a | **Content phase C.** The worked records (about 17 activities, 12 clips). | `content/seed/` | M3-04, M3-05 | M | Answer-key mistakes | Every type and mode works mouse-only and keyboard-only on real content | [C §C26.3](C-game-and-learning-design.md#c263-authoring-sequence-and-sources) |
| M3-10b | **Content phase D.** First eight generator kinds and about 30 template rows (maths). | `content/seed/`, `api/shared/generators/` | M3-06, M3-07, M3-10a | L | Domain too small for the no-repeat rule | Bank status: maths groups at threshold in every band | [C §C25](C-game-and-learning-design.md#c25-templates) |
| M3-10c | **Content phase E.** Phonics items, age 5, then 6, then 7; every clip reviewed. | admin app (content), `content/seed/` | M3-07, M3-10a | L | Listening fatigue; tier B/C sounds | Bank status: phonics groups at threshold; every clip has a review record | [C §C26.3](C-game-and-learning-design.md#c263-authoring-sequence-and-sources), [D §D9](D-ux-and-content-operations.md#d9-phonics-preview-review-and-the-quality-gate) |
| M3-10d | **Content phase F.** Spelling items, age 5 (tiles and pictures), then 6, then 7. | admin app (content), `content/seed/` | M3-07, M3-10a | L | British spelling errors in AI-assisted drafts | Bank status: spelling groups at threshold | [C §C26.3](C-game-and-learning-design.md#c263-authoring-sequence-and-sources) |
| M3-11 | **Import (optional convenience).** Spreadsheet import creating drafts only. | `web/admin/src/import/` (to create) | M3-04 | M | An import overwriting operator content (must skip and report) | Importing a file twice creates nothing the second time and reports every row as skipped | [D §D8.6](D-ux-and-content-operations.md#d86-seeding-and-import) |

### M4 — Full campaign, progression, challenges and endless

Goal: the 50-wave schedule, meteor challenges, badges, planet eligibility, short challenges and endless, with balance set by
playtests (`prompt.md:1279-1280`). D-6 and D-11 are due by now.

| ID | Task (scope) | Areas / files | Depends on | Effort | Risks | Done when | Trace |
|---|---|---|---|---|---|---|---|
| M4-01 | **Campaign data.** 50 waves, pads opening in stages, unlocks, meteor slots `M-009…M-049`; re-run the simulator after any change. | `game-data/campaign/`, `game-data/ruleset/`, `tools/sim/` | M2-04, M2-05 | M | Transaction over 100 actions for a long wave set (F open point) | Game-data build refuses a wave set whose create transaction exceeds 100 actions; simulator margins recorded | [C §C8](C-game-and-learning-design.md#c8-the-50-wave-campaign), [C §C3](C-game-and-learning-design.md#c3-map-route-and-pads) |
| M4-02 | **Meteor offers.** Meteor phase UI, power grant by the server, skip only before the first attempt (D-11), meteor pool content (phase G). | `web/player/src/learning/`, `api/functions/player_api/`, `content/seed/` | M4-01, M3-07 | M | Inventory-cap edge case (C open point) | Fixture: dismiss after an attempt is refused by the reducer; a grant never exceeds the cap | [C §C10](C-game-and-learning-design.md#c10-meteor-powers) |
| M4-03 | **Badges and planet eligibility.** Thresholds re-evaluated on `COMPLETE_WAVE` (and on `SUBMIT_ATTEMPT` for learning badges if the spine is amended). | `api/functions/player_api/`, `web/player/src/progress/` | M2-06, M3-08 | M | Badge awarded twice (map key with `if_not_exists`) | Tests: each C12 badge awarded once; reset of campaign progress lets it be earned again | [C §C12](C-game-and-learning-design.md#c12-badges), [F §10.2](F-state-and-data.md#102-permanent-vs-run-progression) |
| M4-04 | **Challenges.** The short wave sets; planet/run setup screen. | `game-data/campaign/`, `web/player/src/` | M4-01 | M | Challenge reward source unsettled (C open point) | Each challenge completes to `COMPLETED` without touching best wave | [C §C13](C-game-and-learning-design.md#c13-standalone-short-challenges-wave-sets) |
| M4-05 | **Endless.** Scaling generator; block planning inside `CHOOSE_ENDLESS` and endless `COMPLETE_WAVE`; "You have done every activity we have for now"; cap at wave 999. | `web/game-core/src/sim/`, `api/shared/selection/`, `api/functions/player_api/` | M4-01, M3-07 | L | Planning beyond interval 998 (F open point) | Tests: `plannedThrough` stays ahead by K; an exhausted bank writes no slot and never repeats; wave 999 completes the run | [C §C11](C-game-and-learning-design.md#c11-endless-continuation-and-bounded-scaling), [F §3.6](F-state-and-data.md#36-endless-block-planning) |
| M4-06 | **Resets.** All four reset types and the settings screen. | `api/functions/player_api/`, `web/player/src/settings/` (to create) | M2-06, M3-08 | M | Interrupted whole-profile reset leaving a `RESET#` holder (F open point) | One test per reset type checks exactly the F §12.5 matrix; repeating a reset is harmless | [F §12.5](F-state-and-data.md#125-resets-post-apimeresets-type-confirm), [D §P13](D-ux-and-content-operations.md#p13-settings-and-resets) |
| M4-07 | **Balance playtests (P3).** Sessions with the children; observations recorded per [I](I-validation.md); number changes go through the simulator first. | `docs/validation/playtests/`, `game-data/` | M4-01…M4-05 | M (repeats) | Tuning to one child | Each session has a short note; every number change has a simulator run behind it | [C §C17](C-game-and-learning-design.md#c17-simulator-evidence), [I §I.5](I-validation.md#i5-child-playtest-protocol-ages-57) |

### M5 — Robust persistence and offline continuation

Goal: local packs and audio caching, attempt persistence, reconnect idempotency, session exclusivity and stale-writer handling,
exercised on refresh/defeat and concurrent devices (`prompt.md:1282-1283`).

| ID | Task (scope) | Areas / files | Depends on | Effort | Risks | Done when | Trace |
|---|---|---|---|---|---|---|---|
| M5-01 | **Local database.** `scd-<sub>` with versioned stores (`ops`, `runs`, `packs`, `audio`, `recovery`, `meta`); durability rule; online-only flag when storage is unavailable. | `web/player/src/sync/db.ts` (to create) | M2-06 | L | A schema upgrade that drops `ops` or `recovery` | Upgrade test from the M1 schema keeps queued ops; private-window run shows the online-only banner | [F §9.3](F-state-and-data.md#93-local-database-scd-sub), [F §6](F-state-and-data.md#6-checkpoint-semantics) |
| M5-02 | **Offline queue.** `OFFLINE_PENDING`, background flush for all of the account's runs, Web Lock `scd-play`, identity checks, sign-out with pending warning. | `web/player/src/sync/` | M5-01 | L | Two tabs flushing at once | Playwright: second tab cannot play; going offline mid-activity and back flushes in order | [F §7](F-state-and-data.md#7-client-sync-state-machine-per-account-client-only), [D §D7](D-ux-and-content-operations.md#d7-player-facing-copy-for-saving-sync-and-offline-states) |
| M5-03 | **Offline preparation and audio cache.** Pack download, readiness states, clip bytes stored, offline Play rules; "Ready offline up to wave N" for endless. | `web/player/src/offline/` (to create) | M5-01, M0-12, M4-05 | L | Asset chunks not loaded into memory in this page session | Playwright with the network cut after "Ready offline": a prepared campaign continues and every clip plays | [E §E.8](E-architecture.md#e8-offline-preparation), [E §E.9](E-architecture.md#e9-audio-caching-and-playback) |
| M5-04 | **Divergence and recovery.** S7.5 procedure, option (a) and (b), recovery store, "Progress that was not saved" panel and download. | `web/player/src/sync/`, `web/player/src/recovery/` (to create) | M5-02 | L | Automatic replay sneaking in (it must be explicit) | F §11.3 scenario passes end to end; the recovery file downloads as JSON | [F §9](F-state-and-data.md#9-offline-conflict-handling-divergence), [D §P14](D-ux-and-content-operations.md#p14-progress-that-was-not-saved) |
| M5-05 | **Takeover confirmation and lease timing.** Takeover dialog; renew only while visible and recently used. | `web/player/src/sync/` | M5-02 | M | Lease expiring during a long activity (renew rules) | Two-browser test shows the "Play here instead?" prompt only after a lapse without release | [F §5](F-state-and-data.md#5-play-session-state-machine-account-wide-lease-with-fencing-token), [G §7](G-api-contracts.md#7-session-lease--r13-put-apisession-r14-delete-apisession) |
| M5-06 | **Version compatibility.** `protocolVersion` current + previous, `CLIENT_UPGRADE_REQUIRED` that keeps the queue, `playable(run)`, supported `mechanics` list; previous-release batch replay test. | `api/functions/player_api/`, `web/player/src/sync/`, `contracts/fixtures/` | M5-01 | M | A newer client protocol after a rollback (G open point) | A recorded previous-release batch is accepted; an unsupported run shows `playable:false` and is skipped by Continue | [F §10](F-state-and-data.md#10-content-version-compatibility-and-progression), [G §9](G-api-contracts.md#9-versioning) |
| M5-07 | **Hard-case scenarios.** The F §11 scenarios and the automatable parts of the nine I §I.4 hard cases (for example refresh after wrong answers, lost `DEFEAT` response, stale offline writer, withdrawn activity offline, expired auth) as Playwright or pytest tests. Phonics correctness also needs human listening (M0-11, M3-05). | `web/player/e2e/` (to create), `api/tests/` | M5-03, M5-04, M5-05, M5-06 | L | Flaky timing in offline emulation | Every automatable I §I.4 case has a named test that is green in CI | [F §11](F-state-and-data.md#11-four-scenarios-step-by-step), [I §I.4](I-validation.md#i4-the-named-hard-cases) |

### M6 — Art, performance and release confidence

Goal: consistent generated art, measured frame rate and audio latency, full keyboard coverage, verified backup/restore and
compatible rollback, and documentation of what was actually built (`prompt.md:1285-1286`).

| ID | Task (scope) | Areas / files | Depends on | Effort | Risks | Done when | Trace |
|---|---|---|---|---|---|---|---|
| M6-01a | **Asset pipeline and manifest.** Asset manifest versions, naming conventions, loader. | `game-data/asset-manifest/`, `web/player/src/assets/` (to create) | M1-24 | M | Manifest edits after freeze (additive only) | Placeholder art loads through the manifest | [D §D10](D-ux-and-content-operations.md#d10-generated-art-and-audio-inventory) |
| M6-01b | **Battlefield art.** Planet, colony, astronauts × levels, aliens, bosses, power effects. | `web/player/public/` or `web/player/src/assets/` | M6-01a | L | Inconsistent style across generations | Every D10.2–D10.7 row has a final asset in the manifest | [D §D10](D-ux-and-content-operations.md#d10-generated-art-and-audio-inventory) |
| M6-01c | **Interface art and activity pictures; combat sound set.** | as above | M6-01a | L | Picture count larger than estimated | Every D10.8–D10.10 row has a final asset | [D §D10](D-ux-and-content-operations.md#d10-generated-art-and-audio-inventory) |
| M6-02 | **Performance.** Busiest representative waves measured against the C14 budget; audio latency from Play. | `docs/validation/` | M6-01b, M2-13 | M | Measuring on a faster machine than the children use | A recorded measurement on the children's laptop meets the documented target | [C §C14](C-game-and-learning-design.md#c14-performance-budget-feeds-ac-42) |
| M6-03 | **Keyboard and accessibility pass.** Every essential control and interaction with keyboard and mouse; axe scans. | `web/player/e2e/`, `web/admin/` | M3-03, M2-09 | M | Focus traps in dialogs | Playwright keyboard-only journeys pass; axe reports no serious issues | [D §D5](D-ux-and-content-operations.md#d5-keyboard-and-mouse), [I](I-validation.md) |
| M6-04 | **Scoped CI role.** Replace `AdministratorAccess` with the inline policy (B-4) plus a permissions boundary or equivalent; re-apply bootstrap. | [bootstrap/main.tf](../../infrastructure/bootstrap/main.tf), [bootstrap/variables.tf](../../infrastructure/bootstrap/variables.tf), [prod.tfvars.json](../../infrastructure/envs/prod.tfvars.json) | M5-07 | M | A missing permission found mid-release | A full release and a rollback rehearsal succeed with the scoped role; an attempt to delete a table from CI is denied | [H §H.5.1](H-infrastructure-and-delivery.md#h51-scoped-ci-policy-outline-not-json), [A §5.3](A-repository-findings.md#53-recommended-narrowing) |
| M6-05 | **Restore drill.** Both tables to scratch tables; verify; record time and result. | `docs/runbooks/restore.md`, `scripts/restore_copy.py`, `scripts/verify_pins.py` (to create) | M2-11 | M | Restored table lacks protections (expected; it is scratch) | Runbook entry with date, duration and result for both tables | [H §H.13.4](H-infrastructure-and-delivery.md#h134-restore-drill-ac-39) |
| M6-06 | **Rollback rehearsal and game-data lock.** Release an earlier tag; G-8 lock check and G-9 golden scenarios become gates. | `.github/workflows/release.yml`, `scripts/gamedata_lock_check.py` (to create) | M5-06 | M | Rolling back past a mechanics addition | An earlier release re-published from its archive; a modified game-data file fails G-8 | [H §H.12](H-infrastructure-and-delivery.md#h12-compatible-rollback-spine-s112), [H §H.10](H-infrastructure-and-delivery.md#h10-quality-gates) |
| M6-07 | **Monitoring proof (AC-40).** `set-alarm-state` test and one real failure. | — | M1-08 | S | Unconfirmed subscriptions | Both e-mails received and noted in `docs/releases/` | [H §H.14](H-infrastructure-and-delivery.md#h14-monitoring-and-alarms-spine-s115) |
| M6-08 | **Runbooks and README.** Operator password reset, sign-up kill switch, rollback, restore, DNS; README with local setup, build, test and release. | `docs/runbooks/` (to create), [README.md](../../README.md) | M6-05, M6-06 | M | Runbooks describing intended rather than actual behaviour | Each runbook has been followed once and says so | [A §10.1](A-repository-findings.md#101-checklist) #13 |
| M6-09 | **Acceptance pass.** AC-01…AC-43 demonstrated per [I](I-validation.md); browser matrix; child playtest P4; gaps become tasks. | `docs/validation/` (the AC table and `browsers.md`), `docs/validation/playtests/` | M6-01…M6-08 | L | Treating a test as proof of a behaviour it does not exercise | Every AC has evidence recorded (test name, screenshot or log) in the `docs/validation/` AC table; `docs/validation/browsers.md` is filled in; P4 notes in `docs/validation/playtests/` | [I §I.3](I-validation.md#i3-acceptance-criteria-map-ac-01-to-ac-43) |
| M6-10 | **Data-freeze release.** Checklist F-1…F-8; plan guard enforcing; release tagged and noted as the freeze. | `infrastructure/plan-guard.json`, `docs/releases/` | M6-04, M6-05, M6-06, M6-09 | S | Freezing with pre-freeze test data left by accident (F-8) | All eight checklist items have evidence; the freeze release is tagged | [H §H.11.3](H-infrastructure-and-delivery.md#h113-data-freeze-point-spine-s114), [B §B3.4](B-scope-and-decisions.md#b34-the-data-freeze-point-proposal-spine-s114) |

### J.3.1 Size of each milestone (count of tasks by effort) **[ASSUMPTION]**

| Milestone | S | M | L | Note |
|---|---|---|---|---|
| M0 | 10 | 5 | 0 | Spikes are M because each needs a throwaway stack and a written result |
| M1 | 7 | 12 | 5 | The largest learning step: every layer once |
| M2 | 1 | 9 | 3 | |
| M3 | 0 | 6 | 8 | Includes content authoring, which is operator time rather than code |
| M4 | 0 | 6 | 1 | M4-07 repeats |
| M5 | 0 | 2 | 5 | |
| M6 | 2 | 7 | 3 | Art (M6-01b/c) is split from an XL |

---

## J.4 Your first task: repository hygiene and the OIDC smoke test (M0-01 + M0-02)

### J.4.1 Why this one

I considered two candidates: this one, and the fixed-timestep clock in `game-core` (M0-09). I'd suggest you do this one first,
and the clock as your first piece of game code soon after it (J.5; the exact order is in J.4.8). **[PROPOSAL]**

| | Hygiene + OIDC smoke test | Fixed-timestep clock |
|---|---|---|
| On the critical path? | **Yes.** It is the first step of the only blocker that stops every release (BL-1). The trust fix (M0-03) cannot be done without the subject it prints. | No. Nothing waits on it until M1-13 (the rules reducer). |
| Needs anything installed? | `git`, the GitHub CLI (`gh auth login`), a browser. | Node 24, which is not on your machine yet (M0-07), and the minimal `game-core` package (M0-08a). |
| What it teaches | Git ignore rules, GitHub Actions structure (triggers, jobs, permissions, environments), how GitHub's OIDC token and its `sub` claim work, JWT anatomy | TypeScript, Vitest, pure functions, the game loop |
| Your existing strength | The AWS side (role trust, `AssumeRoleWithWebIdentity`) is your territory, so the new parts (Actions YAML, JWTs) have something to attach to | All new |
| Size | Small: two files and one GitHub setting | Small, after two small set-up tasks (M0-07, M0-08a) |

The deciding reason: the smoke test turns the biggest **[UNVERIFIED]** risk in the plan into a fact, at almost no cost, and it
has to happen before any of the platform work. The clock is the better *software* lesson, which is why it is the second task.

### J.4.2 What you will produce

1. `.gitignore` (to create), committed before anything under `infrastructure/` is added.
2. A first commit on `main` with `prompt.md`, `infrastructure/` and `docs/` (the two copied workflows stay out).
3. `.github/workflows/oidc-smoke.yml` (to create): manual trigger only, one job, two steps.
4. A GitHub environment called `prod`, created by you in Settings before the first run.
5. A one-paragraph note of what the run printed (it becomes ADR-0011 when you finish M0-03).

### J.4.3 Before you start: two read-only checks

- Authenticate `gh` and ask GitHub what it knows about the repository:
  `gh api repos/jacklavelle286/space-tower-defence --jq '.created_at, .visibility, .id, .owner.id'`.
  A creation date after 15 July 2026 means the immutable subject format is likely, and the two IDs are what it will contain
  ([A §5.2](A-repository-findings.md#52-immutable-oidc-subject-likely-ci-blocker)).
- Open Settings → Environments. If you cannot create an environment on this repository, note it: that selects the fallback
  subject (`…:ref:refs/heads/main`, no `environment:` on the job) in M0-03 ([H §H.5](H-infrastructure-and-delivery.md#h5-bootstrap-changes-you-make-no-replacement-bootstrap) B-3).

### J.4.4 Steps

**Step 1: the ignore file.** Create `.gitignore` from [H §H.16](H-infrastructure-and-delivery.md#h16-gitignore-to-create-before-the-first-git-add-infrastructure).
Before adding anything else, prove it works: `git status --ignored` should list `infrastructure/bootstrap/.terraform-prod/` as
ignored, and `git check-ignore -v infrastructure/bootstrap/.terraform-prod` should name the line that matched. Then confirm the
lock file is **not** ignored: `git check-ignore infrastructure/bootstrap/.terraform.lock.hcl` should print nothing.

Why: git decides what to ignore when you `add`, not when you commit. Once a file is tracked, adding it to `.gitignore` later
does nothing. So the order matters.

**Step 2: the first commit.** Add `.gitignore`, `prompt.md`, `infrastructure/` and `docs/` explicitly by path (not `git add .`).
Look at `git status` before committing: `.github/` should still be untracked. Push to `main`.

Why the copied workflows stay out: anything under `.github/workflows/` on the default branch can be dispatched. Those two files
point at another product's role and a destroy path ([A §4](A-repository-findings.md#4-the-two-workflow-files-what-they-reference-that-does-not-exist-here)).
They stay as local reference until M1-10 replaces them.

**Step 3: the `prod` environment.** In Settings → Environments, create `prod`. Add the deployment-branch rule "selected
branches: `main`" now, so the smoke test runs under the same rules the release will. No secrets, no reviewers.

**Step 4: the workflow.** Shape only (fill in the rest yourself):

```yaml
on: workflow_dispatch
permissions: { id-token: write, contents: read }
jobs:
  smoke:
    runs-on: ubuntu-24.04
    environment: prod
    steps: [ "print sub claim", "assume role + get-caller-identity" ]
```

- The first step asks the runner for an ID token with audience `sts.amazonaws.com`. Inside a job that has `id-token: write`, the
  runner exposes `ACTIONS_ID_TOKEN_REQUEST_URL` and `ACTIONS_ID_TOKEN_REQUEST_TOKEN` for exactly this **[UNVERIFIED]** (check the
  names in GitHub's "OpenID Connect" docs). Conceptually: GET `$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com` with the
  header `Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN`; the JSON response's `.value` is the JWT. A JWT is three base64url parts joined by dots: header, payload, signature. You only
  need the middle one. Conceptually: `payload = split(token, ".")[1] → base64url-decode → JSON → .sub`. Print that one field
  (and, if you like, `repository_id` and `repository_owner_id`). Never echo the token or the whole payload. For the decode, a
  hint rather than a script: Python's `base64.urlsafe_b64decode` handles the `-`/`_` alphabet once you pad the string with `=`
  to a multiple of 4, and `python3` is already on the runner.
- The second step uses `aws-actions/configure-aws-credentials@v6` with the role ARN
  `arn:aws:iam::263185198757:role/space-tower-defence-prod-github-oidc`, region `eu-west-2` and `allowed-account-ids: 263185198757`,
  then runs `aws sts get-caller-identity`.

**Step 5: run it.** Commit the workflow to `main` (a `workflow_dispatch` workflow only appears in the Actions tab once it is on
the default branch). Dispatch it from the Actions tab or `gh workflow run oidc-smoke.yml --ref main`.

**Step 6: read the result.** Two possible outcomes, both useful:

| Outcome | Meaning | Next |
|---|---|---|
| Step 2 prints the role's assumed-role ARN and account `263185198757` | The deployed wildcard matched; the repository uses the classic subject | M0-03 still narrows `trusted_subs` to `repo:jacklavelle286/space-tower-defence:environment:prod` |
| Step 2 fails with `Not authorized to perform sts:AssumeRoleWithWebIdentity` and step 1 printed `repo:jacklavelle286@<id>/space-tower-defence@<id>:environment:prod` | The immutable format, as the plan expects | M0-03 sets `trusted_subs` to exactly that printed value and re-applies the bootstrap |

### J.4.5 What to learn along the way

| Topic | The idea in one or two sentences |
|---|---|
| Ignore rules | Patterns are matched against paths relative to the `.gitignore`; a trailing `/` matches directories only; `!` re-includes. Ignoring is about *untracked* files only. |
| Workflow anatomy | A workflow has triggers (`on:`), a default permission set for the job token, and jobs; each job runs on a fresh runner and has steps. Permissions are least-privilege: `id-token: write` is what allows the OIDC request at all. |
| Environments | A job that names an environment gets that environment's protection rules (branch rules, reviewers) and its name appears in the OIDC `sub`. That is why naming one changes what IAM sees. |
| JWT anatomy | Header and payload are just base64url-encoded JSON, readable by anyone who has the token. The signature is what makes it trustworthy. So "it's only the payload" is still sensitive while the token is valid: print a claim, never the token. |
| OIDC trust on the AWS side | You know this part: the role's trust policy matches `token.actions.githubusercontent.com:sub` with `StringLike`. The new fact is only the subject's shape. |

### J.4.6 How you know it is done

- `git ls-files` shows `.gitignore`, `prompt.md`, the bootstrap `.tf` files and lock file, both env JSON files and `docs/plan/*`;
  nothing under `infrastructure/bootstrap/.terraform-prod/` and nothing under `.github/` except `oidc-smoke.yml`.
- The Actions tab shows one run of the smoke workflow on `main`, with the `sub` line visible in step 1's log.
- You have written down the exact subject and the outcome of step 2. If step 2 failed, that is a successful smoke test: it found
  the blocker.
- Searching the run log for `eyJ` (the start of every base64url-encoded JSON header) finds nothing.

### J.4.7 Pitfalls

| Pitfall | How to avoid it |
|---|---|
| Printing the token by accident (`set -x`, echoing a variable, a failed `jq` dumping its input) | Don't enable shell tracing in that step. Decode in one pipeline that outputs only `.sub`. As a belt-and-braces measure, register the token with GitHub's log masking (`::add-mask::`) before anything else touches it. |
| Putting the print step after the role step | If the role step fails, the job stops and you never see the subject. Print first. |
| Using `ubuntu-latest` | Fine for this workflow, but use `ubuntu-24.04` now so the habit matches the release (W-7). |
| Base64url vs base64 | JWT parts use `-` and `_` and drop the `=` padding. A plain `base64 -d` may fail or produce garbage; translate the alphabet and pad, or use a decoder that understands base64url. |
| Referencing an environment that does not exist | GitHub may create it on the fly with no branch rule **[UNVERIFIED]**. Create `prod` yourself first (step 3). |
| Dispatching from a branch | With the branch rule set, a run from another branch is refused. That is the rule working, not a bug; it is also M0-03's negative test. |
| `git add .` | Add by path in this first commit. |
| Leaving the smoke workflow with broader permissions later | Keep it exactly as it is: `workflow_dispatch` only, `id-token: write`, `contents: read`, read-only AWS call. I'd keep it after M0 as a diagnostic for any future trust change **[PROPOSAL]**; it never prints anything sensitive. |

### J.4.8 Then

Do M0-03 (the trust fix) yourself from your laptop with `bootstrap.sh`; it is an in-place change to one trust policy, and the
re-run of this workflow is its proof. Record the result as ADR-0011.

The order from here: 1. M0-01 + M0-02 (this task), 2. M0-03, 3. M0-07 (toolchain), 4. M0-08a (minimal `game-core` package),
5. M0-09 (the clock, J.5). M0-08b (the full scaffold spike) comes after the clock. **[PROPOSAL]**

---

## J.5 Your second task, in brief: the fixed-timestep clock (M0-09)

Once Node is installed and the minimal `game-core` package exists (M0-07, M0-08a), this is the best first piece of real game
code. It does not need React, Vite or Phaser, so it comes before the full scaffold spike (M0-08b).

**Why the pattern exists.** Browsers call your frame callback at whatever rate the screen runs (30, 60, 144 Hz) and irregularly
when busy. If the simulation moved "by however much time passed", the same wave would play out differently on different laptops.
A fixed timestep keeps a time bank: each frame adds the elapsed time, and the simulation takes as many fixed 1/60 s steps as the
bank allows. Same inputs, same steps, same result ([C §C2.1](C-game-and-learning-design.md#c21-time), spine S10).

**Shape** (conceptual, from spine S10): `acc += min(frameDeltaMs, 250) × speed`; `while acc ≥ STEP and steps < MAX: step(); acc −= STEP`.
Paused or hidden adds nothing. `MAX = 30` (250 ms × 2x ÷ one step) **[ASSUMPTION]**; when the cap is hit, the remaining
accumulator is discarded, so a slow laptop plays in slow motion rather than catching up in a burst ([C §C2.1](C-game-and-learning-design.md#c21-time)) **[ASSUMPTION]**.

**Steps.** (1) Write the tests first: feed a fake sequence of frame deltas for one simulated second at 30, 60 and 144 Hz and
assert the step count is 60 in each case. (2) Write the smallest pure function that passes. It takes the accumulator and a delta
and returns the new accumulator and the number of steps; it never reads the real clock. (3) Add tests for the 250 ms clamp, the
per-frame cap (including that the leftover accumulator is discarded) and pause.

**Done when** Vitest shows all three frame rates producing exactly 60 steps per simulated second, the clamp and cap tests pass,
and the module imports nothing from Phaser or the DOM.

**Pitfalls.** `STEP = 1000/60` is not exact in floating point: a naive float accumulator fed 144 deltas of `1000/144` ms takes
59 steps, not 60 (checked with a quick Python run). I'd suggest keeping the accumulator in integer units of 1/60,000 s:
`acc += Math.round(min(deltaMs, 250) × speed × 60)`, with `STEP = 1000` units. In tests, feed deltas whose units sum to exactly
60,000 per simulated second; at 144 Hz that is a repeating integer pattern (417, 417, 416 units, 48 times), so 60 steps is
exact. **[PROPOSAL]** Don't call `performance.now()` inside the function; pass time in, which is what makes it testable.

---

## J.6 Decision log practice

### J.6.1 What and why **[PROPOSAL]**

The spec asks for decisions to be documented as work is completed (`prompt.md:77`, `prompt.md:1288`). I'd suggest Architecture
Decision Records (ADRs): one short file per decision, numbered, never rewritten once accepted. When a decision changes, a new ADR
supersedes the old one, and both stay. The point is that in six months you can see *why* something is the way it is, and what was
rejected.

- Folder: `docs/decisions/` (to create), files `NNNN-short-title.md`, plus `docs/decisions/README.md` (to create) as an index.
- When: in the same commit as the work that made the decision. A spike's output **is** an ADR.
- Numbers 0011–0015 are reserved for the M0 tasks named in J.6.3. Whichever task writes an ADR first creates the
  `docs/decisions/` folder, so no M0 task has to wait for M0-05's template and index. **[ASSUMPTION]**
- Status: `Proposed` (planner or you, not yet agreed) → `Accepted` → `Superseded by NNNN` (or `Rejected`). The ADRs taken from the
  spine start as `Proposed` until you have read and agreed them.
- Size: one screen. If it needs more, the detail belongs in a plan section or a runbook, and the ADR links to it.
- Spine amendments that sections A–H list in their open points are settled by ADRs too, so the spine and the code never drift silently.

### J.6.2 Template

```markdown
# NNNN. <Decision in a few words>
Status: Proposed | Accepted | Superseded by NNNN | Rejected · Date: YYYY-MM-DD
Context: <the problem and the forces, 2–5 lines; link the plan section>
Decision: <what we do, stated plainly>
Alternatives: <each rejected option and why, one line each>
Consequences: <what becomes easier, harder, or must now be true>
Evidence: <spike output, test, doc link, ADR it supersedes>
```

### J.6.3 The first ten ADRs, from the spine

| ADR | Decision | Source | Plan section |
|---|---|---|---|
| 0001 | Same-origin API: each distribution routes `/api/*` to one HTTP API; no API hostname, no CORS; SPA fallback via a CloudFront Function on the default behaviour only | spine S1 | [E §E.2](E-architecture.md#e2-same-origin-api-through-cloudfront) |
| 0002 | Two Cognito user pools (player, operator), managed login with PKCE; identity is the access-token `sub`; profile data never in Cognito attributes (contingent on M0-10) | spine S1, D-10, N-8 | [E §E.7](E-architecture.md#e7-authentication-and-authorisation) |
| 0003 | Four Python arm64 Lambdas with one role each, including a dedicated `tts`; no Lambda calls another | spine S1 | [E §E.6](E-architecture.md#e6-lambda-and-api-boundaries) |
| 0004 | Two DynamoDB tables (`game`, `content`), no GSI, no TTL except the sign-up counter | spine S1, S8 | [F §12](F-state-and-data.md#12-dynamodb-design) |
| 0005 | Family-level trust: the browser simulates combat; the server owns identity, accepted state, attempts and rewards, and checks per-op plausibility bounds; accepted tampering gains stated | spine S2, S6 | [E §E.10](E-architecture.md#e10-family-level-trust-model) |
| 0006 | Run state as `status` + `stage` + `phase` with one snapshot; nothing persisted during combat; a wave restarts from its start snapshot | spine S3, S4 | [F §3](F-state-and-data.md#3-run-state-machine), [F §6](F-state-and-data.md#6-checkpoint-semantics) |
| 0007 | One write path: ordered op batches with `expectedRevision`, `recentOps` idempotency and a pure reducer in both languages sharing fixtures; answers canonicalised once, in TypeScript | spine S7 | [F §8](F-state-and-data.md#8-attempt-and-reward-idempotency), [G §5](G-api-contracts.md#5-the-ops-batch--post-apirunsrunidops-r11) |
| 0008 | Account-wide play-session lease with a fencing generation; one accepted writer; offline browsers cannot be stopped, only fenced | spine S3.4 | [F §5](F-state-and-data.md#5-play-session-state-machine-account-wide-lease-with-fencing-token) |
| 0009 | One speech render path: content-addressed clips, Polly only via operator preview, approval binds the previewed bytes; player speech never synthesises (narrows `prompt.md:577`) | spine S5.2, D-12 | [E §E.4](E-architecture.md#e4-the-dedicated-tts-service) |
| 0010 | Delivery: one manual release; Terraform owns infrastructure and Lambda code, the workflow owns static files and `config.json`; two-dispatch approval by default; no destroy workflow; data-freeze point | spine S11 | [H §H.8](H-infrastructure-and-delivery.md#h8-the-manual-release-spine-s111), [H §H.9](H-infrastructure-and-delivery.md#h9-artefact-ownership) |

Next in line, recorded when the work happens: 0011 OIDC subject and trust (M0-02/03) · 0012 auth spike results (M0-10) ·
0013 front-end stack versions (M0-08b) · 0014 Polly voice and SSML templates (M0-11) · 0015 browser audio storage (M0-12) ·
0016–0018 M1 choices J-1, J-2, J-3 (M1-24) · then game data as immutable versioned files with `mechanics` compatibility
(spine S5.1), the fixed 60 Hz timestep (spine S10), and the data-freeze point when it is named (M6-10).

---

## J.7 Traceability: every major plan element has a task

| Plan element | Tasks |
|---|---|
| [A](A-repository-findings.md) `.gitignore`, first commit, repository instructions | M0-01, M0-05 |
| [A §5](A-repository-findings.md#5-github-oidc-trust-breadth-subject-format-and-the-review-pause) OIDC subject, trust narrowing, reviewers; CI permission scoping | M0-02, M0-03, M6-04 |
| [A §6](A-repository-findings.md#6-state-bucket-naming-mismatch) state-bucket name | M1-02, M1-10 |
| [A §7](A-repository-findings.md#7-dns-integration-points-only) / [E §E.3.3](E-architecture.md#e33-dns-integration-points-no-redesign) / [H §H.15](H-infrastructure-and-delivery.md#h15-dns-hand-off) DNS hand-off | M0-04, M1-03, M1-11 |
| [B §B3](B-scope-and-decisions.md#b3-full-first-release-versus-the-first-playable-milestone) milestones, M1 slice, data freeze | M1-24, M6-10 |
| [B §B6](B-scope-and-decisions.md#b6-owner-decisions-d-1-to-d-13) owner decisions D-1…D-13 | D-10: M0-10 · D-8, D-12: M1 · D-1, D-2, D-4, D-5, D-7, D-9: M3 · D-6, D-11: M4 · D-3: before the eldest child turns 8 · D-13: M1-10 |
| [C §C2](C-game-and-learning-design.md#c2-simulation-rules-game-core) simulation, timestep, determinism | M0-09, M1-21, M2-10 |
| [C §C3–C7](C-game-and-learning-design.md#c5-astronaut-roster) map, colony, roster, aliens, bosses | M1-21, M2-01…M2-04 |
| [C §C8](C-game-and-learning-design.md#c8-the-50-wave-campaign), [C §C9](C-game-and-learning-design.md#c9-economy) campaign and economy | M2-01, M4-01, M4-07 |
| [C §C10](C-game-and-learning-design.md#c10-meteor-powers)–[C §C13](C-game-and-learning-design.md#c13-standalone-short-challenges-wave-sets) powers, endless, badges, challenges | M2-05, M4-02…M4-05 |
| [C §C14](C-game-and-learning-design.md#c14-performance-budget-feeds-ac-42) performance budget | M2-13, M6-02 |
| [C §C17](C-game-and-learning-design.md#c17-simulator-evidence) simulator | M0-06, M4-01, M4-07 |
| [C §C18–C27](C-game-and-learning-design.md#c24-selection-when-a-run-is-created) content bank, interaction types, schema, selection, templates, summaries, invalid content | M1-13, M3-02…M3-10d |
| [D §D2–D7](D-ux-and-content-operations.md#d4-screen-specifications) player screens, keys, sync copy | M1-20…M1-22, M2-09, M2-12, M4-06, M5-02, M5-04, M6-03 |
| [D §D8](D-ux-and-content-operations.md#d8-operator-app-adminaliensjackglcom) admin app, seeding | M1-19, M3-01, M3-04, M3-11 |
| [D §D9](D-ux-and-content-operations.md#d9-phonics-preview-review-and-the-quality-gate) listening spike, review, quality gate | M0-11, M1-19, M3-05, M3-10c |
| [D §D10](D-ux-and-content-operations.md#d10-generated-art-and-audio-inventory) art and audio inventory | M6-01a…M6-01c |
| [E §E.2](E-architecture.md#e2-same-origin-api-through-cloudfront) same-origin API | M1-07 |
| [E §E.4](E-architecture.md#e4-the-dedicated-tts-service) dedicated TTS | M0-11, M1-18, M3-05 |
| [E §E.5](E-architecture.md#e5-react-phaser-and-game-core) React / Phaser / game-core | M0-08a, M0-08b, M1-21 |
| [E §E.6](E-architecture.md#e6-lambda-and-api-boundaries), [E §E.7](E-architecture.md#e7-authentication-and-authorisation) Lambdas, auth | M0-10, M1-05, M1-06, M1-09, M1-15 |
| [E §E.8](E-architecture.md#e8-offline-preparation), [E §E.9](E-architecture.md#e9-audio-caching-and-playback) offline preparation, audio cache | M0-12, M5-03 |
| [E §E.10](E-architecture.md#e10-family-level-trust-model) trust model | M1-15, M2-07 |
| [F §3–4](F-state-and-data.md#3-run-state-machine) run and slot state machines | M1-13, M1-14, M2-06, M3-09 |
| [F §5](F-state-and-data.md#5-play-session-state-machine-account-wide-lease-with-fencing-token) session lease | M1-16, M5-05 |
| [F §6–9](F-state-and-data.md#9-offline-conflict-handling-divergence) checkpoints, sync, idempotency, divergence | M1-17, M1-20, M5-01, M5-02, M5-04 |
| [F §10](F-state-and-data.md#10-content-version-compatibility-and-progression) compatibility and progression | M5-06, M4-03 |
| [F §11](F-state-and-data.md#11-four-scenarios-step-by-step) scenarios | M5-07 |
| [F §12](F-state-and-data.md#12-dynamodb-design) DynamoDB, resets, bounded growth | M0-13, M1-04, M1-16, M2-12, M4-06 |
| [G](G-api-contracts.md) routes, errors, limits, logging | M1-12, M1-15…M1-19, M2-06, M3-02, M5-06 |
| [H §H.3–H.6](H-infrastructure-and-delivery.md#h4-infrastructuremodules-all-to-create) root, modules, bootstrap, env keys | M1-01…M1-08, M2-11 |
| [H §H.7–H.10](H-infrastructure-and-delivery.md#h8-the-manual-release-spine-s111) workflows, release, ownership, gates | M1-09, M1-10, M2-08, M6-06 |
| [H §H.11–H.14](H-infrastructure-and-delivery.md#h11-data-protection-spine-s113) protection, rollback, backup, monitoring | M1-08, M2-11, M6-05…M6-07, M6-10 |
| [H §H.17](H-infrastructure-and-delivery.md#h17-version-pins) version pins | M0-07, M0-08a, M0-08b |
| [I](I-validation.md) tests, AC mapping, playtests (P1 M1-24, P2 M2-13, P3 M4-07, P4 M6-09), hard cases | M1-24, M2-08, M2-10, M2-13, M4-07, M5-07, M6-09 |

---

## Open points for the planner

- **J-3 moves the admin alias record to M1.** B §B7 (BL-2 "admin alias when the admin site ships (M3)"), B §B3.2 and H §H.15.1 row 4
  say M3. I chose a minimal admin app for the M1 clip approval (answering B's open point) because the operator client's callback
  URLs are on `admin.aliens.jackgl.com`. If B/H keep M3, M1 needs another approval route (an extra app client with a `localhost`
  callback, or an operator-only CLI flow), which I'd avoid.
- **J-1 (M1 wave set = `CHALLENGE`)** follows F §3.7's suggestion and answers B's open point; C's open point about challenge badges
  needing a `PROFILE` write is unaffected in M1 but must be settled before M4-04.
- **D §D9.1 says the listening spike renders "through the preview route"**, which does not exist in M0. M0-11 renders the same
  canonical inputs with the AWS CLI instead, and the chosen clips are re-rendered through the real preview route in M1-18/M3-05.
  D should say so, or the spike moves after M1-18 (which would delay the "resolve pronunciation before scaling" requirement less
  than it delays M1).
- **Simulator source is only in the session scratchpad** (C §C17.8). M0-06 copies it, but if the scratchpad is cleared before the
  owner starts, the evidence is gone. The planner may want to hand the folder over with the plan.
- **Links to [I. Validation](I-validation.md) are partly reconciled.** M1-19, M1-24, M2-13, M4-07, M5-07 and M6-09 link to I's
  subsections and use I's evidence folders and playtest sessions P1–P4; the test names in other "Done when" columns are still
  descriptive, not I's identifiers.
- **Voice engine.** The rationale notes record an owner decision (chat, 2026-11-14) to use Polly **generative** en-GB (default Amy) with
  neural kept for `<phoneme>` clips, set through Terraform variables `tts_voice_id`, `tts_engine`, `tts_phoneme_engine`, and to start
  playback at once from locally stored bytes while `POST /api/speech` runs in parallel. Spine v0.2 (S1, S5.2) and D §D9.1 still say
  neural and the original Play rule, so M0-11, M1-18 and M1-22 follow the spine. Once the spine is amended, M0-11 becomes a bake-off
  per clip kind (generative vs neural), M1-05/M1-06 gain the three variables, and M1-22 gains the immediate-local-playback rule.
- **Dependency fixes made by the checker**: post-deploy checks moved from M1-05/M1-07/M1-08 into M1-11's "Done when"; M1-10 now
  depends on M1-03 (artefacts bucket), M1-19 on M1-11, M1-20 on M1-11 and M1-15, M1-23 on M1-09 and M1-10, M3-10b/c/d on M3-07,
  M5-07 on M5-06. M1-16 and M1-17 run on fixture game-data and bounds files until M1-23, which is numbered later; renumbering would be
  cleaner if the planner prefers strict numeric order.
- **Milestone graph adds an M2 → M5 edge** to B §B3.3's graph (M5's local database depends on M2-06's full op set). Harmless, but
  B's diagram could show it.
- **H §H.2's layout should list `docs/validation/` (with `playtests/` and `browsers.md`, owned by I §I.6), `docs/decisions/`
  (with `unverified.md`), `docs/runbooks/dns-hand-off.md`, `tools/sim/` and `spikes/`.** J now uses I's evidence folders; the
  others are this section's names and are not in the spine or H §H.2 yet.
- **C §C2.1 should record `MAX = 30` and the discard-on-cap rule.** Spine S10 and C §C2.1 leave MAX without a value; J (M0-09, J.5)
  uses `MAX = 30` **[ASSUMPTION]** and an integer accumulator in 1/60,000 s units. C should carry both so the clock task and the
  design agree.
- **Keeping `oidc-smoke.yml` after M0** is my proposal; H §H.7's workflow list has only `release.yml`, `apply.yml`, `plan.yml`.
  Gate G-5's grep must not trip on it (it contains none of the forbidden strings).
- **GitHub facts used in J.4 are [UNVERIFIED] in this run**: the names of the runner's OIDC request environment variables,
  whether referencing a missing environment auto-creates it, and environment availability for private repositories on the owner's
  plan. The smoke test itself settles the last one.
- **Effort counts (J.3.1)** are from the tables above; they are a relative guide only, not an estimate of calendar time.
