# Space Colony Defence: design spine v0.3

## What this file is

The spine is the short, canonical list of names, states, keys, routes, codes and rules that the whole plan uses. The detailed
sections [A](A-repository-findings.md) to [J](J-execution-backlog.md) elaborate it: they explain the reasons, the trade-offs, the
examples and the tasks. When a section and the spine disagree, the spine wins and the section is corrected. Sections cite it as
"spine Sn"; the numbering S0 to S13 is kept stable for that reason, and S14 records what changed.

v0.3 is v0.2 plus the owner's decisions of 2026-11-14 and the planner decisions that settle every open point raised by sections A to J
(S14 lists each change). Research evidence is published under [`sources/`](sources/) and the balance simulator under `tools/sim/`.

Labels:

| Label | Meaning |
|---|---|
| **[CONFIRMED]** | fixed by the spec, [prompt.md](../../prompt.md) |
| **[CONFIRMED by owner]** | decided by the repository owner in chat (date given) |
| **[PROPOSAL]** | planner recommendation; the owner may change it |
| **[ASSUMPTION]** | routine detail chosen without asking; cheap to change |
| **[VERIFIED]** | checked directly (source given) |
| **[UNVERIFIED]** | a fact not yet checked (how to check it is given) |

Numbers for game balance live in [C](C-game-and-learning-design.md), not here; they are initial playtest settings **[PROPOSAL]**.

---

## S0. Verified starting point

Recorded at the start of planning, 2026-11-14 **[VERIFIED]**:

- Repo `space-tower-defence`: one commit; tracked `README.md` only; untracked `.github/workflows/{deploy.yml,tf-apply-destroy-env.yml}`
  (byte-identical copies of the reference product's workflows; non-functional here), `infrastructure/{bootstrap,envs,main(empty)}`, `prompt.md`.
  No `.gitignore` (so `infrastructure/bootstrap/.terraform-prod/` would be committed), no app code, tests or docs.
- Bootstrap root applied (14:24): state bucket `prod-state-bucket-space-tower-defence` (from
  [locals.tf:2](../../infrastructure/bootstrap/locals.tf#L2), `<environment>-state-bucket-<project>`, NOT the module default the copied
  workflows compute); CI role `space-tower-defence-prod-github-oidc` (AdministratorAccess, trust `sub` LIKE
  `repo:jacklavelle286/space-tower-defence:*`); GitHub OIDC provider. Nothing else exists in account 263185198757 (eu-west-2).
- **Risk to verify first (likely blocker for CI):** GitHub repositories created after 15 July 2026 emit the immutable OIDC subject
  `repo:OWNER@OWNER-ID/REPO@REPO-ID:...` (VERIFIED in GitHub docs). The deployed trust pattern will not match it. Repo creation date
  and visibility are **[UNVERIFIED]** (`gh` not authenticated; the M0 OIDC smoke test settles it). Fix = `trusted_subs` + bootstrap
  re-apply by the owner.
- **Required reviewers** on GitHub Environments are available only on public repos for Free/Pro/Team plans (VERIFIED in GitHub docs).
  Visibility unknown, so the release design works without them (S11.1).
- Local machine: Python 3.12.3 (VERIFIED during planning research). Node 24 has since been installed via nvm **[CONFIRMED by owner, 2026-11-14]**.
- Added during planning: the plan itself (`docs/plan/`, with evidence in `docs/plan/sources/`) and the balance simulator in `tools/sim/`
  (`python3 -B tools/sim/selftest.py` passes) **[PROPOSAL]**.

### S0.1 Way of working **[CONFIRMED by owner, 2026-11-14]**
- Claude builds the app in sequential build phases; the owner reviews the code at each phase gate (J describes the first build phase and
  how to review a phase).
- Git: work on `main`; Claude or the owner commits and pushes.
- Deployment happens **only** through GitHub Actions pipelines. No local `terraform apply` on the main stack; local `fmt`/`validate`/`plan`
  and read-only AWS calls are fine. The one exception is the bootstrap root, which creates the CI's own trust and is applied locally by the
  owner (S11.1).

## S1. System shape

All of S1 is **[PROPOSAL]** unless marked.

- Two static SPAs: **player** at `aliens.jackgl.com` and **admin** at `admin.aliens.jackgl.com` (hostnames **[CONFIRMED]**).
  Each: private S3 bucket + CloudFront distribution + Origin Access Control. One ACM certificate in us-east-1 with two exact SANs.
- **API reach: same-origin.** Each distribution has a `/api/*` behaviour to the HTTP API's **default endpoint**: managed `CachingDisabled`
  cache policy, `AllViewerExceptHostHeader` origin request policy (forwards `Authorization`), all methods. No CORS, no API hostname, no
  API certificate. HTTP API route keys keep the `/api` prefix. (The reference product, `jacks-productivity-tool`, differs: its `/api/*`
  goes to a Lambda Function URL behind a prefix-stripping CloudFront Function **[VERIFIED in that repo]**. We borrow the same-origin
  idea, not the origin type.)
  SPA deep-link fallback via a **CloudFront Function on the default behaviour only**, never distribution-wide custom error responses
  (they would rewrite API 403/5xx into `index.html`). No `x-origin-verify` header. The CSP and security-headers policy is owned by
  [H](H-infrastructure-and-delivery.md).
- **One HTTP API** (eu-west-2), payload format 2.0, `$default` stage, access logging, route throttles (S9.5). Access-log fields are the
  S2 allow-list plus the diagnostic fields `integrationLatency`, `integrationError`, `authorizerError` (no player data).
  Two **JWT authorisers**: `player` (issuer = player pool, audience = player app client) on player routes and `POST /api/speech`;
  `operator` (issuer = operator pool, audience = admin app client) on `/api/admin/*`. Every route requires a scope (`player_route_scope`
  = `game/play`, `operator_route_scope` = `ops/content`); handlers also check `token_use = access`.
- **Cognito: two user pools** (runner-up = one pool with an `admin` group; D-10 accepted).
  - *Player pool*: username + password, `case_sensitive = false` on usernames, no email/phone, self sign-up on, pre sign-up trigger
    auto-confirms (S1.2), account recovery `admin_only`, deletion protection ACTIVE. App client `player`: public (no secret),
    **managed login + authorization code + PKCE** (**[CONFIRMED]** prompt.md:777), callback/sign-out URLs on `aliens.jackgl.com`.
  - *Operator pool*: self sign-up OFF (AdminCreateUser only), TOTP MFA required, group `admin` (**[CONFIRMED]** "admin role/group";
    also checked in Lambda), app client `admin` with managed login + PKCE on `admin.aliens.jackgl.com`.
  - Managed login on the Essentials tier; a sign-in uses `prompt=login`; sign-out always goes through the `/logout` endpoint.
  - **Main risk:** managed-login sign-up for a username-only auto-confirmed pool is **[UNVERIFIED]**; the Milestone 0 auth spike checks it.
    Fallback (in-app SRP form via the SDK) is a deviation from prompt.md:777 and needs the owner's approval. Evidence:
    [sources/05-cognito-auth.md](sources/05-cognito-auth.md).
  - Profile data (nickname, avatar, DOB) is never a Cognito attribute (it would leak into ID tokens). Identity = access-token `sub`.
  - Password recovery: the operator runs `AdminSetUserPassword` (permanent) from a runbook (**[CONFIRMED]** admin-managed).
- **Four Python 3.14 zip Lambdas (arm64)**, names `space-tower-defence-prod-eu-west-2-<key>` (reference pattern), one IAM role each.
  Timeouts stay under the 30 s HTTP API integration limit:

  | Key | Purpose | Routes / trigger | Data access (least privilege) | Timeout |
  |---|---|---|---|---|
  | `player-api` | profile, runs, session lease, run ops, packs, resets | all `/api/*` player routes except speech | `game`: full item CRUD on `U#*` keys; `content`: read only; S3 read of game-data bounds files | 25 s |
  | `admin-api` | content administration, speech approval | `/api/admin/*` except preview | `content`: read/write; S3 `GetObject` + prefix `ListBucket` on `tts/v1/`; never `game`; env `tts_voice_id`, `tts_engine`, `tts_phoneme_engine` | < 30 s **[ASSUMPTION]** |
  | `tts` | dedicated text-to-speech microservice | `POST /api/speech`, `POST /api/admin/speech/preview` | `game`: `GetItem` only; **no `content` access**; S3 `GetObject`/`PutObject` (no Delete) on `tts/v1/*` plus `s3:ListBucket` conditioned on `s3:prefix` `tts/v1/*` (so `HeadObject` on a missing key returns 404, not 403); `polly:SynthesizeSpeech`; env as admin-api. **Never writes DynamoDB.** | < 30 s **[ASSUMPTION]** |
  | `cognito-presignup` | auto-confirm within a daily cap | player pool pre sign-up trigger | `game`: `UpdateItem` with `dynamodb:LeadingKeys = SYS#SIGNUPS` only; no Cognito permissions | short **[ASSUMPTION]** |

  No Lambda calls another Lambda. No VPC, containers, queues, streams, schedulers, WebSockets, GraphQL, Redis (**[CONFIRMED]** exclusions).
  Terraform owns the code via the variable `lambda_artifacts` (S11.1).
- **Two DynamoDB tables** (on-demand, deletion protection, PITR, `prevent_destroy`): **`game`** (player-owned + one system partition)
  and **`content`** (operator-owned). Reasons: table-level IAM blast radius; `game` can be restored alone because content versions are
  never deleted. `content` is never rolled back behind `game` (restore to a scratch table and copy needed items back, S8.4).
  Names can be pointed at a restored table with the variable `table_name_overrides`.
- **S3 buckets** (`<account>-<region>-<environment>-<purpose>-bucket`, reference convention): `…-player-spa-bucket`, `…-admin-spa-bucket`,
  `…-audio-bucket` (clips under `tts/v1/`; private; never-overwrite keys; CORS GET/HEAD from the two exact origins), and
  `…-artifacts-bucket` (Lambda zips by content hash, release manifests, archived static builds, saved plans under `plans/<run_id>/`;
  versioned). The artefacts bucket is created in the **bootstrap root** beside the existing module call, not in the main stack (S11.1).
  Game-data files live in the player site bucket under immutable paths (S5.1).
- **Polly** **[CONFIRMED by owner, 2026-11-14]**: the newest engine, **generative**, en-GB, default voice **Amy**. Isolated phonemes and
  letter names use the engine in `tts_phoneme_engine` (default `neural`), because AWS documentation is contradictory on `<phoneme>` support
  in the generative engine; the M0 listening bake-off decides, and if generative passes the variable is set to `generative`. Nova Sonic
  was rejected (conversational speech-to-speech, no SSML, not in eu-west-2, experimental Python SDK); evidence in
  [sources/11-voice-engine.md](sources/11-voice-engine.md) and [sources/06-polly-tts.md](sources/06-polly-tts.md). Human recordings
  are the fallback for any sound that fails the listening test. Configuration and caching rules are in S5.2.
- **Ops**: CloudWatch logs (`log_retention_days`, default 7 as in the reference; the admin audit log group uses
  `audit_log_retention_days`, longer) → alarms → SNS topic `space-tower-defence-prod-alerts` → e-mail (`notification_email`); AWS Backup
  daily plan, 7 daily recovery points for both tables (**[CONFIRMED]** retention) plus PITR.
- **DNS** stays in the owner's DNS account (**[CONFIRMED]**; the owner integrates). Integration points only: ACM validation CNAMEs (output by
  Terraform) and alias records `aliens.jackgl.com` / `admin.aliens.jackgl.com` → their distributions. The plan does not redesign DNS.

### S1.0 DNS hand-off facts **[CONFIRMED by owner, 2026-11-14]** unless marked
- An HTTPS app already serves the apex `jackgl.com` (a separate app and API in another account). `aliens` and `admin.aliens` do not exist
  yet. There is no clash: different hostnames and origins.
- Hand-off checklist additions: CAA records on `jackgl.com` (if any) must allow `amazon.com`; check whether the apex CloudFront
  distribution has a wildcard alternate domain name `*.jackgl.com`, which could block adding `aliens.jackgl.com` to a distribution in
  another account (**[UNVERIFIED]**: check the apex distribution's alternate domain names before M1); apex domain-wide cookies will be sent
  to our subdomains (harmless, we use bearer tokens); HSTS `includeSubDomains` on the apex is fine.
- Never touch the apex or `www` records; never use `allow_overwrite`.

### S1.1 Naming (VERIFIED reference conventions, applied as **[PROPOSAL]**)
Project `space-tower-defence`, environment `prod`, region `eu-west-2`, account `263185198757` (VERIFIED `infrastructure/envs/`).
Regional names: `space-tower-defence-prod-<thing>`; Lambdas `space-tower-defence-prod-eu-west-2-<key>`; roles `…-<component>-role`;
alarms `space-tower-defence-prod-<thing>-<condition>`; distribution comments `space-tower-defence-prod-player|admin`;
tables `space-tower-defence-prod-game|content`; pools `space-tower-defence-prod-players|operators`.
Workflows learn names and IDs from `terraform output -json`, not by recomputing names (a deliberate deviation from the reference).

### S1.2 Sign-up control (**[PROPOSAL]**; numbers **[ASSUMPTION]**)
Pre sign-up, only for `PreSignUp_SignUp`: conditional `UpdateItem` on `game` `SYS#SIGNUPS`/`<yyyy-mm-dd UTC>`: `ADD count 1` if
`attribute_not_exists(count) OR count < :cap`; then `autoConfirmUser = true`. Cap reached or write failure → **raise** a child-safe
error (fail closed; never `autoConfirmUser=false`, which would strand an UNCONFIRMED user). `PreSignUp_AdminCreateUser` passes uncounted.
Cap = Terraform variable `signup_daily_cap` (default 20). Kill switch = Terraform variable `player_signup_closed`, driving
`allow_admin_create_user_only` through a normal release (never ad-hoc `update-user-pool`, which resets unspecified settings). The Lambda
`Errors` alarm covers cap hits. Residual: anyone can exhaust a day's allowance; the owner can still AdminCreateUser.

### S1.3 Configuration names and repository layout **[PROPOSAL]**
| Kind | Names |
|---|---|
| Environment-file keys | `domain_name`, `player_hostname`, `admin_hostname`, `notification_email`, `terraform_version`, `player_signup_closed`, `player_auth_domain_prefix`, `operator_auth_domain_prefix`, `signup_daily_cap`, `tts_voice_id` (default `Amy`), `tts_engine` (default `generative`), `tts_phoneme_engine` (default `neural`) |
| Terraform variables (not in env files) | `player_route_scope` = `game/play`, `operator_route_scope` = `ops/content`, `lambda_artifacts`, `table_name_overrides`, `log_retention_days`, `audit_log_retention_days` |
| Folders | `web/` (npm workspaces `game-core`, `player`, `admin`, `shared`), `api/` (Python Lambdas), `contracts/`, `game-data/`, `content/seed/`, `scripts/`, `tools/sim/`, `spikes/`, `docs/runbooks/`, `docs/releases/`, `docs/validation/` (`playtests/`, `performance/`, `acceptance/`, `browsers.md`), `docs/decisions/` |
| Files | `infrastructure/plan-guard.json` (to create), `contracts/routes.json` (to create), `content/listening-verdicts.json` (to create), `docs/build-phases.md` (to create), `CLAUDE.md` (to create) |
| S3 prefixes | clips `tts/v1/`; saved plans `plans/<run_id>/` (artefacts bucket) |
| Game-data kinds | `ruleset`, `campaign`, `asset-manifest`, `bounds` |
| Release tag | `release-<release_id>` |

## S2. Trust model (**[CONFIRMED]** family-level trust; mechanisms **[PROPOSAL]**)
- The browser runs combat and judges answers locally when offline; the backend does not simulate battles.
- The backend owns: authentication, ownership, accepted run state, recorded attempts, reward accounting, permanent progress.
- Every `game` key is built from the token `sub`; no request field names an owner; other players' IDs return `NOT_FOUND` (AC-03).
- Operator = token from the operator pool **and** `cognito:groups` contains exactly `admin` (parse; never substring-match).
  Authorisation is decided from the route key before any lookup; unknown routes are denied. Hostnames grant nothing.
- **DOB is write-only**: enters only in `PUT/PATCH /api/me/profile`, stored only as `PROFILE.dob`, read only by `player-api` to derive
  `age`/`ageBand` (Europe/London; bundle `tzdata` if the runtime lacks it, to verify in M0). No response, error body, log line, local store,
  op payload, speech request, audio key or Cognito attribute carries it. Correcting it means typing it again.
- **Speech is resolved, never free text (AC-20):** `POST /api/speech` takes `{runId, slotId, variant}` and `tts` resolves the clip
  **from the slot's pinned clips map** (S3.3). It never reads `content` and never calls Polly on the player path.
- **Logs are allow-list only** (all four functions + API access log): requestId, routeKey, sub, runId, slotId, opId, op type,
  result/error code, revision, generation, duration (plus the access-log diagnostic fields in S1). Never raw events, bodies,
  `Authorization`, presigned URLs, answers, nicknames.
- The server derives badge IDs, class unlocks, slot rewards, summary keys and available classes; never from payloads.
- Accepted tampering gains (stated so nobody mistakes bounds for anti-cheat): a modified client can report maximum bounty and full
  health each wave, answer from pack data, and drop wrong attempts before sync, all within its own account; no leaderboard exists.
  It cannot touch another account, skip a phase, receive a reward twice, record a fourth attempt or exceed per-wave income ceilings.

## S3. State machines (**[PROPOSAL]**)

### S3.1 Run: persisted fields
| Field | Values / meaning |
|---|---|
| `runId` | client-generated UUID, one per create intent (S3.2 CREATE_RUN) |
| `planetId`, `waveSetId`, `mode` | pinned; `mode` = `CAMPAIGN` \| `CHALLENGE` (copied from the wave set) |
| `status` | `IN_PROGRESS` \| `DEFEATED` \| `ABANDONED` \| `COMPLETED` (last three terminal, never left) |
| `stage` | `AUTHORED` (inside the pinned wave set) \| `ENDLESS` (only after a CAMPAIGN wave set) |
| `phase` (IN_PROGRESS only) | `ACTIVITY` \| `METEOR` \| `BUILD` \| `IN_WAVE` \| `COMPLETION_OFFER` |
| `wave` | 1-based position. Invariant: `wave = highestCompletedWave + 1` in every phase except `COMPLETION_OFFER` (`wave = finalWave`) |
| `highestCompletedWave` | 0..n; "best wave" always means highest COMPLETED wave (**[CONFIRMED]**) |
| `campaignCompletedAt` | set when the final wave of a CAMPAIGN wave set is cleared; never unset |
| `plannedThrough` | highest interval whose slots have been selected (`finalWave − 1` after creation) |
| `snapshot` | exactly ONE snapshot (S4); its role follows `phase` |
| `revision` | +1 for every APPLIED op (including no-op outcomes) |
| `recentOps` | last 32 `{opId, revision}`; kept forever on the item (≈2 KB), including on terminal runs |
| `writerGeneration` | session generation of the last applied op (diagnosis) |
| pins | `ageBand`, `seed`, `rulesetVersion`, `campaignVersion`, `assetManifestVersion`, `selection{algorithmVersion, bankReadAt, packId}`; `protocolVersion` of creation |
| `createdAt`, `lastPlayedAt` | server UTC; `lastPlayedAt` stamped on every applied op (so for terminal runs it is the end time) |

Spec concept mapping: PREPARING→`BUILD`; ACTIVITY_PENDING→`ACTIVITY`/`METEOR`; READY→the START_WAVE transition; IN_WAVE→`IN_WAVE`;
PAUSED→client-only; SUSPENDED→derived (IN_PROGRESS, not the account session's current run); DEFEATED/ABANDONED→status;
CAMPAIGN_COMPLETE→`campaignCompletedAt` + `COMPLETION_OFFER`; ENDLESS→`stage=ENDLESS`.

Wave sets (from the pinned planet document `campaignVersion`): `waveSets{ campaign:{mode CAMPAIGN, waves[50], meteorAfter[9,19,29,39,49],
startCredits, unlocks, …}, <challengeId>:{mode CHALLENGE, waves[k], meteorAfter[…], …} }`. `finalWave = len(waves)`. Milestone 1's
"small wave set" is simply a short wave set. Every wave set must pass the transaction-size build gate in S5.1.

### S3.2 Operations (the only ways run state changes)
Online-only (never queued, never applied optimistically): `CREATE_RUN` (via `POST /api/runs`) and `CHOOSE_ENDLESS`.
All other ops are queueable and are applied by the client's pure reducer first (S7).

| Op | Allowed when | Effect |
|---|---|---|
| `CREATE_RUN` | profile exists; pinned versions released and loadable (else `409 CONTENT_VERSION_UNSUPPORTED`; the client re-reads `current.json`); planet unlocked (else `CONTENT_UNAVAILABLE{reason: PLANET_LOCKED}`); wave set available for the age band; soft cap 5 IN_PROGRESS; session free or held by this sessionId, with the **same takeover rule as the session claim** (S3.4): a lapsed, unreleased lease held by another sessionId needs `takeover: true`, else `409 TAKEOVER_CONFIRM_REQUIRED` | run `IN_PROGRESS`, `AUTHORED`, `phase=BUILD`, `wave=1`, snapshot from wave set; slots `N-001..N-(finalWave−1)` + `M-<p>` for each `p` in meteorAfter, all `UNRESOLVED`; session claimed in the same transaction (G7) |
| `SAVE_PREP` | phase `BUILD` or `IN_WAVE` | payload `{credits, placements[]}` replaces those snapshot fields; `phase=BUILD` |
| `START_WAVE` | phase `BUILD` or `IN_WAVE`, `payload.wave == run.wave` | payload `{credits, placements[]}` → snapshot (the wave-start snapshot); `phase=IN_WAVE` |
| `COMPLETE_WAVE` | phase `IN_WAVE`, `payload.wave == run.wave` | snapshot := payload `{credits, placements, colony, powers}` (bounds S6); `highestCompletedWave=wave`; PROFILE updated only if something changes (S8); then: if `wave == finalWave` and stage AUTHORED: CAMPAIGN → `campaignCompletedAt`, `phase=COMPLETION_OFFER`; CHALLENGE → `status=COMPLETED`, and this final COMPLETE_WAVE may write PROFILE `badges` **only** (never `planets` or eligibility). Else `wave+=1`; if stage ENDLESS plan blocks (S5.3); phase := next-phase rule for interval `wave−1` |
| `SUBMIT_ATTEMPT` | phase `ACTIVITY`/`METEOR`; `payload.slotId` is the current slot and `UNRESOLVED` | if pinned version withdrawn/missing → VOID (S3.3); else record attempt `{n, attemptId=opId, answer(canonical), correct, recordedAt}`; correct → `SUCCEEDED` + reward + summary; 3rd incorrect → `FAILED` + summary; on resolution phase := next-phase rule. A meteor success when that power is already at its cap (2): slot `SUCCEEDED` and counted, no charge added (endless only) |
| `DISMISS_SLOT` | current slot `UNRESOLVED` and (meteor slot **before any attempt**, or pinned version withdrawn) | withdrawn → `VOIDED` (+reward); else `DECLINED`; phase := next-phase rule |
| `DEFEAT` | phase `IN_WAVE`, `payload.wave == run.wave` | `status=DEFEATED`; REMOVE snapshot |
| `ABANDON` | `campaignCompletedAt` not set; any persisted phase | `status=ABANDONED`; REMOVE snapshot |
| `CHOOSE_ENDLESS` | phase `COMPLETION_OFFER` | `stage=ENDLESS`, `wave=finalWave+1`; plan blocks; phase := next-phase rule for interval `finalWave` |
| `FINISH_RUN` | `campaignCompletedAt` set, phase not `IN_WAVE` | `status=COMPLETED`; REMOVE snapshot |

- **Next-phase rule** (one shared function, both languages): for interval `i`: `ACTIVITY` if `N-<i>` exists and is UNRESOLVED; else
  `METEOR` if `M-<i>` exists and is UNRESOLVED; else `BUILD`.
- **Current slot** (derived, never stored): `N-<wave−1>` in `ACTIVITY`, `M-<wave−1>` in `METEOR`; none in other phases.
- Wave 1 has no preceding activity (**[CONFIRMED]**). The normal activity must resolve (succeeded, failed, voided) before BUILD; untimed;
  may stay pending across sessions (**[CONFIRMED]**). Meteor is optional (**[CONFIRMED]**).
- Save-and-exit mid-wave writes **nothing**: the stored snapshot is already the wave-start snapshot. Resuming never writes. Loading a run in
  `IN_WAVE` shows preparation from the snapshot with the notice "Wave N will start again from the beginning" (**[CONFIRMED]** behaviour AC-24/25).
- Nothing is persisted during combat (locally or in the cloud).
- A replayed op that names an already-`VOIDED` slot (SUBMIT_ATTEMPT or DISMISS_SLOT) is an APPLIED no-op (revision +1) in any phase;
  this keeps offline branches aligned after a withdrawal.
- Endless hard cap: `COMPLETE_WAVE` at wave 999 sets `status=COMPLETED` (keeps 3-digit slot IDs) **[ASSUMPTION]**. Endless planning never
  creates a slot for an interval above 998 (S5.3).
- **Badges v1:** campaign and progress badges as in [C §C12](C-game-and-learning-design.md#c12-badges); the five learning-outcome badges are
  dropped from v1. Challenge badges are kept (the CHALLENGE rule above). Challenge slot rewards use the ruleset's campaign interval table
  (no per-wave-set reward table).

### S3.3 Activity slot
- `slotId` `^[NM]-[0-9]{3}$`: `N-<i>` normal activity after wave `i`; `M-<i>` meteor after wave `i` (campaign `M-009…M-049`; endless `M-059`, `M-069`, …).
- Created only by `Put … attribute_not_exists(pk)`; updated only by `Update … attribute_exists(pk) AND #status = :unresolved`.
- Pinned at creation: `kind` (NORMAL|METEOR), `subject`, `topicId`, `activityId`, `activityVersion` (non-reusable id, S8.3),
  `resolved` (template snapshot or null), `presentation` (option/tile order), `intro` (`AUTO`|`ON_REQUEST`),
  `clips{variant → {speechId, speechVersion, clipKey}}` (the clips map), `reward` (from the pinned ruleset by `(kind, interval)`, never
  from content or client), `attempts: []`.
- `status`: `UNRESOLVED` → `SUCCEEDED` | `FAILED` | `DECLINED` (meteor) | `VOIDED`.
- Rules (**[CONFIRMED]**): ≤3 attempts; first correct → SUCCEEDED, reward exactly once; third incorrect → FAILED, no reward; no penalty;
  untimed. One SUBMIT_ATTEMPT = the whole answer (multi-step included).
- **Canonical answer:** a single string of ≤64 characters for every interaction type (ARRANGE uses tile values; two-step answers are joined
  by `|`). The reserved separators `;` `=` `,` `|` are refused inside answer values at publish validation. There is no "array of option IDs" form.
- Never consumes an attempt: empty/incomplete answer, audio play, demonstration, network/speech failure, refresh (**[CONFIRMED]** list).
  **Client-only guard:** options already tried are greyed out; an identical typed/arranged resubmission is blocked with a gentle
  message and creates no op. The server counts every SUBMIT_ATTEMPT it receives (no server identical-answer rule). Choice activities need
  ≥4 options (publish validation) so failure stays possible (D-8).
- VOID (withdrawn or missing pinned version): no judging, no attempt counted, slot `VOIDED`, **reward granted once** (same `(runId, slotId)`
  marker as success), learning summary unchanged; the child sees "This one had a mistake, so we took it away. You still get your reward."
  Only UNRESOLVED slots are voided; already SUCCEEDED/FAILED slots are left as recorded (D-9).
- **Offline VOID vs a locally FAILED branch:** if a slot was FAILED locally offline and the server voids it on sync, the cloud keeps what the
  child saw: the server grants the VOID reward, then the next queued `SAVE_PREP` carries the lower local credits (allowed by S6), so the
  reward does not stick. Accepted; pairs with D-9.
- Learning summary counters change only on SUCCEEDED/FAILED, in the resolving transaction (AC-18). DECLINED/VOIDED never count.
  Meteor activities count like any other (D-5).

### S3.4 Play session (account-wide lease with fencing token)
One `SESSION` item per account: `generation` (only increases; item never deleted), `sessionId`, `runId` (information only),
`leaseExpiresAt`, `released` (bool), `deviceLabel`, `lastRenewedAt`.
- `sessionId`: random UUID per browser profile in IndexedDB `meta` (sessionStorage fallback when IndexedDB is unavailable).
- `PUT /api/session {mode, runId, sessionId, generation?, takeover?, deviceLabel}`; `mode` is `claim` or `renew`. A failed renew
  never falls back to a claim.
  - `claim`: first a consistent `GetItem RUN` under the caller's pk (missing → `404 NOT_FOUND`; terminal → `409 RUN_TERMINAL`). Then two
    conditional updates in order: (1) same holder `sessionId = :s` → extend, set runId, `released=false` (generation unchanged);
    (2) `attribute_not_exists(sessionId) OR released = true OR leaseExpiresAt <= :now`, where the lapsed-lease clause is included **only
    when `takeover: true`** → take over: `ADD generation 1`. If (2) fails, the handler reads the returned old item
    (`ReturnValuesOnConditionCheckFailure = ALL_OLD`): lease still live → `409 ACTIVE_SESSION_ELSEWHERE {retryAfterSeconds, deviceLabel}`;
    lapsed **without release** by another sessionId → `409 TAKEOVER_CONFIRM_REQUIRED {deviceLabel, lastSeenSecondsAgo}`; the client asks
    "This game may have unsaved progress on <device>. Play here instead?" and repeats with `takeover:true`. (Detail in
    [F §5.3](F-state-and-data.md#53-requests).)
  - A holder whose `sessionId` starts `RESET#` (an interrupted WHOLE_PROFILE reset, S8.2) is treated as released: no takeover prompt.
  - `renew`: condition `sessionId = :s AND generation = :g` → extend lease. Failure → `409 STALE_SESSION`.
- `DELETE /api/session {sessionId, generation}`: condition match → `leaseExpiresAt = now, released = true`.
- **Fence**: every op transaction ConditionChecks `SESSION` with `sessionId = :s AND generation = :g` only (no runId). The lease holder may
  write to any of the account's runs; each run's `revision` orders its ops. Correctness never depends on clocks; the lease clock only decides
  when another session may claim.
- Lease 180 s; renew every 60 s **only while the page is visible and there was input in the last 5 minutes** **[ASSUMPTION; tune]**.
- Terminal ops do not touch SESSION; the client releases when it shows a terminal screen.
- Second tab: an origin-wide Web Lock `scd-play` allows one playing tab per browser profile, acquired before any network call.
- Every restore cut-over of `game` bumps every `SESSION.generation` (S8.4), so no pre-restore device can write.
- Honest limitation (**[CONFIRMED]**): an offline browser cannot be stopped; the guarantee is one **accepted** writer.

### S3.5 Client sync status (per account, client-only)
| State | Meaning | Copy |
|---|---|---|
| `SYNCED` | queue empty, last view acknowledged | "Saved to the cloud" |
| `PENDING` | ops queued, flushing | "Saving…" |
| `OFFLINE_PENDING` | ops queued, no connection | "Saved on this device — waiting to sync" (**[CONFIRMED]** wording) |
| `RETRYING` | transient failure (timeout, 5xx, 429), back-off; also `PROTOCOL_UNSUPPORTED` (S7.1) | "Couldn't save — trying again"; for `PROTOCOL_UNSUPPORTED`: "Saving paused while the game updates" |
| `AUTH_REQUIRED` | 401 after one refresh | "Sign in again to finish saving" |
| `DIVERGED` | `STALE_SESSION` or any per-op `REJECTED` | "This game was continued somewhere else" / "We couldn't save some progress" + options (S7.5) |
| `UPGRADE_REQUIRED` | `CLIENT_UPGRADE_REQUIRED` | "Reload to update the game" (queue kept) |

Flag (not a state): `LOCAL_STORAGE_UNAVAILABLE` → online-only mode banner.

### S3.6 Offline readiness (per run, client-only)
`NOT_PREPARED` → `PREPARING(n of m)` → `READY_OFFLINE` | `INCOMPLETE(missing list)`; `PREPARE_FAILED` (retry). Re-enter `PREPARING` when the
slot list grows (endless) or the pack changes. READY requires: manifest, every planned slot definition, every clip's bytes (stored once per
clipKey), ruleset + campaign JSON stored locally, and every asset and code chunk for the run loaded into memory **in this page session**
(asset readiness is per page load; there is no service worker and no offline cold start, **[CONFIRMED]**). Endless shows "Ready offline up
to wave N". Online play is allowed in any state.

### S3.7 Resume per persisted phase (client)
| Phase found | Shows | Writes on resume |
|---|---|---|
| BUILD | preparation from snapshot | none |
| IN_WAVE | preparation from snapshot + "Wave N will start again" | none |
| ACTIVITY / METEOR | the current slot, with recorded attempts and greyed tries | none |
| COMPLETION_OFFER | the offer again (badge already committed) | none |

Order when entering a run online: renew (or claim if no lease) → flush this account's queue to empty → adopt returned view → act on phase.

## S4. Snapshot and checkpoint semantics (**[PROPOSAL]**)
- One `snapshot` per run: `{credits, placements[{padId, classId, level, targeting}], colony{health, shield}, powers{powerId: charges}}`.
  Role by phase: build state (ACTIVITY/METEOR/BUILD), wave-start state (IN_WAVE). Available classes are derived from the unlock schedule
  and `highestCompletedWave`, never stored from the client.
- BUILD ops carry only `{credits, placements}`; the server carries colony and powers forward. COMPLETE_WAVE carries the full snapshot.
- **Rule for the game design:** no timer or cooldown crosses a wave boundary; wave randomness derives from `(run seed, wave number)`.
  If the game design needs otherwise, the snapshot gains those fields (and this spine is amended).
- SAVE_PREP is debounced ~2 s after a purchase/sale/upgrade/targeting change; the local snapshot is written on every change; at most one
  unsent SAVE_PREP sits at the queue tail; queuing START_WAVE cancels the pending SAVE_PREP debounce.
- **Durability rule:** an op is durable when written to the local op log OR acknowledged by the server. Feedback and advancement wait for
  durability, so in online-only mode attempt feedback waits for the acknowledgement (AC-17 holds without IndexedDB).
- Cloud save = result of the last acknowledged op; unacknowledged progress is "saved on this device" only (AC-31).

## S5. Content, versions and compatibility (**[PROPOSAL]**)

### S5.1 Pins and game data
Pinned at creation: `ageBand` (from DOB on creation date, Europe/London), `seed` (64 random bits, server), `rulesetVersion`,
`campaignVersion` (planet document incl. wave sets), `assetManifestVersion`, slots. A birthday affects new runs only (**[CONFIRMED]** AC-06).
- **Game data** of kinds `ruleset`, `campaign` (planet documents), `asset-manifest` and `bounds` is authored in the repo (`game-data/`) as JSON,
  published by the release to the player site under immutable paths `/game-data/<kind>/<version>.json`, plus a no-cache
  `/game-data/current.json` naming the versions for new runs. The client reads `current.json` at start-up and sends `rulesetVersion` +
  `campaignVersion` in `POST /api/runs`; the server only checks they are released and loadable. An unknown or unreleased version →
  `409 CONTENT_VERSION_UNSUPPORTED`; the client re-reads `current.json` and retries.
- **Bounds files**: a TypeScript build script (using `game-core`) emits one small numbers-only file per `(rulesetVersion, campaignVersion)`:
  `maxBounty` per wave (endless range capped), prices, unlock waves, pads, caps, inventory caps; published beside the game data. `player-api`
  loads it via `load_bounds(version)` from the site bucket (cached per container). Python never interprets waves. Rollback-safe: files are
  never deleted.
- **Build gate:** the game-data build refuses any wave set with `3 + (finalWave − 1) + len(meteorAfter) > 100`, the DynamoDB transaction
  action limit for G7 (S8.1).
- **Compatibility**: each ruleset declares `mechanics` (integer). `game-core` declares the mechanics numbers it supports; support is additive
  forever ("supported" is separate from "used for new runs", which is `current.json`). Golden scenarios (2–3 scripted per mechanics number,
  in `contracts/golden/`, additive-only like game data) run in CI once the data freeze starts (S11.4). `playable(run)` = server can load its
  bounds file AND client supports its mechanics. A non-playable run stays IN_PROGRESS untouched; lists return
  `playable:false, reason: CONTENT_VERSION_UNSUPPORTED`; Continue skips it; every op except ABANDON/FINISH_RUN is refused with that code.
  Runbook: never roll back past a mechanics addition while an IN_PROGRESS run pins it.
- `protocolVersion` in the ops envelope and pack manifest: the API accepts current and previous; a version's schema is strict (unknown fields
  rejected). Older than supported → `426`-style `CLIENT_UPGRADE_REQUIRED` that never freezes the queue (ops flushed after reload with their
  stored version). **Newer** than the server supports (possible only after a rollback) → `409 PROTOCOL_UNSUPPORTED` at batch level; the
  client holds the queue in `RETRYING` ("Saving paused while the game updates") and never marks it REJECTED.
  The IndexedDB schema is versioned; upgrades must preserve the `ops` and `recovery` stores. CI replays a recorded previous-release batch.

### S5.2 Activities, templates, speech
- **Activities**: immutable published versions (**[CONFIRMED]**); edit → new version; retire → not selectable for new runs, pinned runs
  unaffected; **withdraw** `{version, reason}` → exceptional invalid content (affects pinned UNRESOLVED slots via S3.3 VOID).
  Identity fields locked once an activity has a published version: `subject`, `topicId`, `rewardCategory`, `authoringMode`,
  `interactionType` (`400 VALIDATION_FAILED` rule `locked_after_publish`). Only `minAge/maxAge` and content vary between versions.
- **Content header `state`**: activity `DRAFT` (never published) | `PUBLISHED` | `RETIRED` (withdrawal is recorded per version as
  `withdrawn{at, reason}`, not as a header state); speech `DRAFT` (never approved) | `APPROVED`.
- **Draft concurrency**: every save, publish and approve names `draftRevision`; a mismatch is `409 DRAFT_CONFLICT`. Publish and approve
  write `fromDraftRevision` on the new version and the header; a repeat whose `draftRevision` equals the stored `fromDraftRevision` returns
  the existing version (safe retry). Publish records `review{checklist, previewSolvedDraftRevision}` with `publishedBy` from the token.
- **Templates** = ordinary activities with `authoringMode = TEMPLATE` and `template{generatorKind, generatorVersion, domain, presentation}`.
  Generators are pure Python code in a shared module (admin-api for preview/validation, player-api for run creation); `(kind, version)` output
  never changes. Instances are materialised at run creation into the slot's `resolved` snapshot; the browser never runs a generator.
  Publish runs an exhaustive machine check over the bounded domain (cap 5,000) plus human review of a rendered sample. No `TPL#` entity.
- **Speech definitions** carry `kind` (`WORD` | `PHONEME` | `LETTER_NAME` | `INSTRUCTION` | `DICTATION`), `provider` (`"polly"`), `engine`,
  `voiceId`, text/SSML. `engine` and `voiceId` come from server configuration: `tts_voice_id`, `tts_engine`, and `tts_phoneme_engine` for
  `PHONEME` and `LETTER_NAME` (S1). The voice/engine allow-list stays in code (IAM cannot restrict them) **[CONFIRMED by owner, 2026-11-14]**.
  A machine check refuses a `PHONEME` definition whose sound has a `word-only` verdict in `content/listening-verdicts.json` (to create).
- **Speech clips** (one render path): clip key = SHA-256 of the canonical synthesis input (text/SSML, locale, voice, engine, output format,
  generation number), computed by one shared Python module (tts + admin-api); objects live under `tts/v1/`. A clip is synthesised **once
  ever** and shared by every activity that uses the same text + voice + engine + settings **[CONFIRMED by owner, 2026-11-14]**.
  **Preview** (tts) is the only Polly path: validate (≤300 chars, tag allow-list, server-configured voice/engine/format), synthesise only if
  the object is absent, `PutObject If-None-Match: *`, return `{clipKey, url}`. **Approve** (admin-api) recomputes the key from the saved
  draft, requires the object to exist (else `VALIDATION_FAILED` rule `not_previewed`), and writes the speech version with the key, the `sha256`
  of the MP3 bytes, the render date and the review record. So the bytes the operator heard are byte-for-byte what children hear.
  Activity versions pin resolved speech refs per variant `{variant → speechId, speechVersion, clipKey}` at publish; publish ConditionChecks
  that every referenced speech version is approved.
- **Changing voice or engine** **[CONFIRMED by owner, 2026-11-14]**: changing a `tts_*` variable affects **new previews only** (voice and
  engine are part of the clip identity). Approved clips keep their bytes until re-previewed and re-approved; there is no silent re-voicing.
- **Speech withdrawal** in v1 is a runbook ([D §D9.6](D-ux-and-content-operations.md)), with no route and no "used by" index.
- **Play** **[CONFIRMED by owner, 2026-11-14]** (meets AC-19/22). The browser stores clip bytes once per clipKey, pre-fetched at run
  preparation.
  - Online, pinned clipKey stored locally: start playback **immediately** from local bytes and send `POST /api/speech` (debounced)
    concurrently, so the authenticated TTS call is still made on every Play (AC-19).
  - Online, not stored: wait for the response, download, verify `sha256`, store, play.
  - The response's clipKey differs from the stored one: log it, download and store the server's clip, and use it from the next Play.
  - Offline: local bytes only.
  - Failure → Retry; never an attempt. `POST /api/speech` never calls Polly; a missing object → `503 SPEECH_UNAVAILABLE` + ERROR log
    (narrows the spec's proposed cache-miss step, prompt.md:577; D-12).

### S5.3 Selection (from [sources/09-learning-design.md](sources/09-learning-design.md) §7; **[PROPOSAL]**)
- Subject rotation maths → phonics → spelling by interval (`N-k` subject = rotation[(k−1) mod 3]; meteor j = rotation[(j−1) mod 3]).
  Campaign: 17 maths, 16 phonics, 16 spelling normal; 5 meteors.
- Seeded labelled hash draws (`SHA-256("<seed>|<label>|<i>")`), topic round-robin, no repeat of an activity or template instance within a run,
  ≤2 instances per template per campaign/block.
- Eligibility per age band: every slot fillable AND each group ≥2× per-run need (thresholds are server configuration, shown in bank status).
  Otherwise `CONTENT_UNAVAILABLE {reason: AGE_OUT_OF_RANGE | BANK_NOT_READY}` with honest copy; no other-age fallback (**[CONFIRMED]**).
- **Endless blocks**: K = 10 intervals per block (+ meteor for the interval ending in 9). CHOOSE_ENDLESS and every endless COMPLETE_WAVE plan
  blocks in the same transaction while `plannedThrough < (wave − 1) + K` (≈10–19 intervals in hand), from the bank published at that moment,
  for the pinned age band, excluding everything used in the run. **No slot is ever planned for an interval above 998.** Where nothing unused
  remains, no slot is written (never a repeat) and the interval shows "You have done every activity we have for now" (D-6; subject
  fallback order maths, phonics, spelling first).
- Client: Ready for endless wave w is enabled only when interval w's slot definitions and clips are held locally; otherwise pause in BUILD
  with "Reconnect to get more activities" (**[CONFIRMED]** AC-34). When an acknowledged view shows `plannedThrough` beyond the local pack,
  refresh the pack in the background.

## S6. Plausibility bounds (**[PROPOSAL]**; per op, against the stored snapshot)
`value(s) = s.credits + invested(s.placements)` (invested = cumulative price paid for each placement's levels, from the bounds file).
1. `credits ≥ 0`; integers only.
2. SAVE_PREP / START_WAVE: `value(payload) ≤ value(stored)` (no income in BUILD; learning rewards are already in the stored snapshot because
   the resolving transaction added them).
3. COMPLETE_WAVE(w): `value(payload) ≤ value(stored) + maxBounty[w]`; `0 < colony.health ≤ maxHealth`; `0 ≤ shield ≤ cap`;
   each power count ≤ stored count (charges enter only via the server's meteor grant, capped by the inventory cap).
4. Placements: pad IDs exist and are unique; class unlocked at `highestCompletedWave`; level 1..3; per-class caps; targeting valid.

Violation → per-op `REJECTED CHECKPOINT_OUT_OF_BOUNDS` (nothing applied). The v0.1 absolute caps follow by induction and are test invariants.
Ordering (wave skips, wrong phase) is `PHASE_MISMATCH`, not a bounds error.

## S7. Operation log, revisions, idempotency (**[PROPOSAL]**)

### S7.1 Envelope and per-op processing
- One write path for run state: `POST /api/runs/{runId}/ops`, an ordered batch of 1–25 ops, ≤64 KB, `{protocolVersion, sessionId, generation, ops[]}`.
  Each op `{opId (UUID), expectedRevision, type, payload, clientTime (informational)}`.
- **Every queued op stores the generation current when it was queued; a batch is sent with that stored generation**, never a newer one.
  A batch never mixes generations.
- Batch level, before any op: `protocolVersion` newer than supported → `409 PROTOCOL_UNSUPPORTED`; older than supported → `426 CLIENT_UPGRADE_REQUIRED` (S5.1).
- Per op, in order (every `game` read is ConsistentRead):
  (a) read SESSION, RUN, and the addressed SLOT; opId in `recentOps` (or attemptId in slot) → `ALREADY_APPLIED` with the original logical
      result (writes nothing; checked before everything else);
  (b) fence mismatch → `STALE_SESSION` (stop);
  (c) run terminal → `REJECTED RUN_TERMINAL`;
  (d) `expectedRevision ≠ revision` → `REJECTED STALE_REVISION`;
  (e) pins not loadable (except ABANDON/FINISH_RUN) → `REJECTED CONTENT_VERSION_UNSUPPORTED`;
  (f) phase / wave / current-slot identity → `REJECTED PHASE_MISMATCH {phase, wave, currentSlotId}`;
  (g) payload schema → `REJECTED VALIDATION_FAILED`;
  (h) bounds → `REJECTED CHECKPOINT_OUT_OF_BOUNDS`;
  (i) the G5 transaction. **Any** cancellation (condition race, TransactionConflict, throttling) → jittered 20–100 ms pause, back to (a);
      max 3 tries, then `503 THROTTLED`. The loser of a duplicate-delivery race answers ALREADY_APPLIED by rule (a).
- The first REJECTED or STALE_SESSION stops the batch; later ops return `NOT_PROCESSED`.
- Response is always the per-op list `[{opId, result: APPLIED|ALREADY_APPLIED|REJECTED|STALE_SESSION|NOT_PROCESSED, code?, outcome?, appliedRevision}]`
  plus the authoritative run view (incl. `recentOpIds`) after the last applied op. HTTP 200 for any processed request (even if REJECTED),
  409 only when step (a)/(b) of the first op fails the fence (or for `PROTOCOL_UNSUPPORTED`), 503 on exhaustion. 409/503 still carry the
  results decided so far.
- "Original logical result" = `{result, appliedRevision}` + current run view; for attempts also `{n, correct, slotStatus, rewardGranted}` rebuilt from the slot.
- `outcome` (APPLIED only): `VOIDED`, `NO_OP_VOIDED_SLOT`, `INCORRECT`, `RESOLVED_SUCCEEDED`, `RESOLVED_FAILED`, `DECLINED`.
- Stable identities: attempt = opId; reward = `(runId, slotId)` via slot condition `#status = :unresolved`; badge = map key with `if_not_exists`;
  finalisation = terminal status conditioned on IN_PROGRESS. Summary counters change in the resolving transaction (exactly once).
- The `recentOps` window is sufficient because: one batch in flight per account; the local trim of an acknowledged batch is committed before
  the next batch is sent; ≤25 ops per batch < 32 entries; and recentOps survives finalisation.
- The `game` table uses **no TTL** except the sign-up counter's tidy-up (correctness never depends on TTL timing, **[CONFIRMED]**).

### S7.2 Client sync engine
- **Ops are created only through the pure reducer** (`game-core/rules`, mirrored by the Python reducer; shared JSON fixtures in `contracts/`
  run by Vitest and pytest). A precondition the reducer refuses creates no op. So any server REJECTED is a divergence and is never retried.
- **Answer canonicalisation happens once, in TypeScript** (in `web/shared`, used by the player and admin apps). Published versions store
  accepted answers in canonical form. Both judges compare by exact equality. Python only validates the shape. No second normaliser.
- **One serial queue per account** carries op batches and claim/renew/release; one request in flight; only the tab holding `scd-play` runs it.
  Pending ops for any of the account's runs flush in the background whichever run is on screen (revision order within a run).
- Local truth for a run = last acknowledged view + pending ops applied by the reducer (op and derived view written in one IndexedDB transaction).
  Home/Continue: runs with pending ops use the local view; locally DEFEATED/ABANDONED runs are not resumable. Empty queue: cloud view wins.
- Online-only mode (no IndexedDB): defeat is not shown as final until DEFEAT is acknowledged.
- HTTP 401 → refresh once, resend the same batch unchanged, else `AUTH_REQUIRED`. 5xx/429/timeout → `RETRYING` with back-off, same ops.
  `409 PROTOCOL_UNSUPPORTED` → `RETRYING` with the "Saving paused while the game updates" copy, same ops.
- **One page load = one account**: at start-up the page binds `ownerSub` and opens only `scd-<ownerSub>`. Before every request (ops, session,
  speech, pack) and on visibility change and cross-tab sign-in/out events, the API client compares the token's `sub` with `ownerSub`.
  Mismatch or sign-out anywhere → send nothing more, stop everything and reload (offline: blocking "a different player is signed in" screen).
  Identity change never marks a queue REJECTED/DIVERGED. Sign-out (with a warning if ops are pending, **[CONFIRMED]**) flushes if possible,
  releases, then hard-reloads after Cognito `/logout`.

### S7.3 Local database `scd-<sub>` (IndexedDB, schema-versioned)
Stores: `ops` (pending, with stored generation and protocolVersion), `runs` (acknowledged view + revision), `packs`, `audio` (clip bytes, one
entry per clipKey, sha256-verified), `recovery` (frozen branches), `meta` (sessionId, schema version, cached nickname/avatar/ageBand, never DOB).
Sign-out never deletes it; another account never opens it (AC-05). After a successful WHOLE_PROFILE reset the device deletes it. Request
persistent storage; quota errors → online-only.

### S7.4 Offline rules
- Offline attempts are judged locally from pack data; the server judges the same canonical bytes on sync.
- Pack incomplete offline → stop at the first wave/interval whose content is missing (`OFFLINE_PACK_INCOMPLETE`, client-only; never invent content).
- Connection-required actions (shown disabled with the reason offline): sign-in/sign-up, **sign-out**, profile setup, new run, choose
  endless, resets, pack preparation, first fetch of a clip.

### S7.5 Divergence procedure (STALE_SESSION or any REJECTED)
1. Stop flushing; stop play at the next boundary (at once in ACTIVITY/BUILD; at wave end in combat).
2. Report the server's per-op results; drop ops reported APPLIED/ALREADY_APPLIED.
3. Offer, in child-level words:
   (a) **Use the cloud save**: remaining ops move to `recovery`; adopt the authoritative view.
   (b) **Keep this device's progress**: only for `STALE_SESSION`, only when the next remaining op's `expectedRevision` equals the cloud revision
       (after skipping ops whose opIds the server already holds, from `recentOpIds`), and only after a deliberate claim (with takeover
       confirmation). The frozen ops are re-stamped with the new generation and replayed in order: explicit, never automatic. When frozen
       ops span several runs, (b) is **all-or-nothing**: offered only if every affected run is eligible.
   A REJECTED divergence offers (a) only. If a REJECTED response carries a terminal run view: adopt it, move leftovers to recovery, SYNCED.
4. `recovery` is inspectable: "Progress that was not saved" panel (run, wave reached, date, reason code) and "Download recovery file" (JSON);
   deleted only on explicit dismissal. Honest copy that it cannot be replayed once the cloud run has advanced, and that "some of this may
   already be saved" (a lost response followed by a takeover can leave ops in recovery that did land).
5. Log one structured server line per REJECTED op; a metric filter on `result=REJECTED` alarms (it always means a rule mismatch or tampering).

## S8. DynamoDB (**[PROPOSAL]**)

### S8.1 Table `game` (pk `pk`, sk `sk`, both strings; no GSI; no TTL except SYS#SIGNUPS)
| Entity | pk | sk | Attributes |
|---|---|---|---|
| Profile | `U#<sub>` | `PROFILE` | nickname, avatarId, dob, createdAt, `planets{planetId:{bestCompletedWave}}`, `badges{badgeId: earnedAt}` (both maps initialised `{}`) |
| Session | `U#<sub>` | `SESSION` | generation, sessionId, runId, leaseExpiresAt, released, deviceLabel, lastRenewedAt |
| Run | `U#<sub>` | `RUN#<runId>` | S3.1 fields |
| Slot | `U#<sub>` | `SLOT#<runId>#<slotId>` | S3.3 fields |
| Learning summary | `U#<sub>` | `SUM#<subject>#<topicId>` | completed, succeeded, failed, lastResolvedAt |
| Sign-up counter | `SYS#SIGNUPS` | `<yyyy-mm-dd>` | count, ttl |

Next-planet eligibility is derived (`bestCompletedWave ≥ 20`), not stored. Milestones/badges are thresholds re-evaluated on every COMPLETE_WAVE.

| # | Pattern | Operation |
|---|---|---|
| G1 | `GET /api/me` (optional `?sessionId=` to compute `activeElsewhere`) | GetItem PROFILE, GetItem SESSION, Query `RUN#` (projection of summary fields, full collection, loop LastEvaluatedKey) |
| G2 | list runs | same Query; filter/sort by `lastPlayedAt`/slice in handler; opaque offset cursor |
| G3 | load run / pack | GetItem RUN + Query `SLOT#<runId>#` (loop) + de-duplicated consistent BatchGetItem of pinned versions (drain UnprocessedKeys; match returned to requested) |
| G4 | claim/renew/release | conditional UpdateItem SESSION (S3.4); retry TransactionConflict/throttle; failed heartbeat = 503, never STALE_SESSION |
| G5 | apply op | TransactWriteItems: ConditionCheck SESSION + Update RUN (`revision = :expected`) [+ Update SLOT] [+ Update SUM# (`if_not_exists` counters)] [+ Update PROFILE `attribute_exists(pk)` only if something changes] [+ Put new endless SLOTs `attribute_not_exists`] |
| G6 | progress view | Query `SUM#` + PROFILE planets/badges |
| G7 | create run | consistent GetItem RUN (exists → return as original); else one TransactWriteItems: Update SESSION (the claim, with the S3.4 takeover rule; single SESSION action) + Put RUN `attribute_not_exists` + **ConditionCheck PROFILE `attribute_exists(pk)`** + slot Puts. Campaign = 1 + 1 + 1 + 49 + 5 = **57 actions**; the S5.1 build gate keeps every wave set ≤ 100. CCF on RUN → replay path; on SESSION → session error; on PROFILE → `PROFILE_NOT_FOUND`. Soft cap check from the G1 Query |
| G8 | resets | S8.2 |
| G9 | prune | best-effort after a terminal op commits: runs beyond the 50 most recently ended → delete slots (BatchWrite 25, retry UnprocessedItems) then the RUN item last; failures logged, never change the op result |
| G10 | sign-up cap | S1.2 |
| G11 | speech ownership (tts) | consistent GetItem `U#<sub>`/`SLOT#<runId>#<slotId>`; clip from its `clips` map |

Rules: every attribute name via ExpressionAttributeNames (`status`, `state`, `level`, `value`, `text`, `type`, `snapshot`, `session` are reserved);
RUN is changed after creation only by the revision-conditioned Update (`SET recentOps = :newList`, handler-built, trimmed to 32); only
`PUT /api/me/profile` creates PROFILE (UpdateItem SET fields + `if_not_exists` containers); every other PROFILE write has `attribute_exists(pk)`;
IDs used in keys match patterns without `#`; best wave is computed in code, never in a ConditionExpression.
Bounded growth: ≤5 IN_PROGRESS (soft), ≤50 retained terminal runs and their slots; RUN ≤ ~8 KB; SLOT ≤ ~2 KB; endless ≤ 999 waves.

### S8.2 Resets (`POST /api/me/resets {type, confirm}`; `confirm` must equal `type`; idempotent; 200 only when finished)
| Reset | Changes | Leaves |
|---|---|---|
| Current run | `ABANDON` op (or FINISH_RUN if campaign completed) | everything else |
| `CAMPAIGN_PROGRESS` | UpdateItem PROFILE `attribute_exists`: `SET planets = {}, badges = {}` | runs (continue and re-earn by threshold; the dialog says so), SUM#, SESSION, nickname/avatar/DOB |
| `LEARNING_HISTORY` | delete all `SUM#` | everything else incl. slot attempt records |
| `WHOLE_PROFILE` | (1) fence: UpdateItem SESSION `ADD generation 1, sessionId = "RESET#<requestId>", leaseExpiresAt = now+60, released=false`; (2) delete all RUN#, SLOT#, SUM#; (3) DeleteItem PROFILE last; (4) release if still ours | SESSION item, Cognito user |

Client: resets need a connection and an empty queue (WHOLE_PROFILE may discard pending progress after the **[CONFIRMED]** warning). Offline
devices add queued results on next sync (stated plainly). `player-api` timeout 25 s. If the handler dies before step (4), the `RESET#` holder
is treated as released by the next claim (S3.4). NOT_FOUND or PROFILE_NOT_FOUND on flush → recovery, option (a) only.

### S8.3 Table `content` (no GSI)
| Entity | pk | sk | Notes |
|---|---|---|---|
| Activity header | `ACT` | `<activityId>` | title, subject, topicId, rewardCategory, minAge, maxAge, interactionType, authoringMode, domainSize, state (`DRAFT`\|`PUBLISHED`\|`RETIRED`), publishedVersion, fromDraftRevision, updatedAt |
| Activity draft | `ACT#<activityId>` | `DRAFT` | working copy + `draftRevision` |
| Activity version | `ACT#<activityId>` | `V#<UTC publish timestamp, e.g. 20261114T100000Z>` | immutable definition, resolved speech refs, review record `{checklist, previewSolvedDraftRevision}`, publishedBy, fromDraftRevision, withdrawn{at, reason}? |
| Speech header | `SPEECH` | `<speechId>` | title, kind, state (`DRAFT`\|`APPROVED`), approvedVersion, fromDraftRevision, updatedAt |
| Speech draft / version | `SPEECH#<speechId>` | `DRAFT` / `V#<timestamp>` | kind, provider, text/SSML, voiceId, engine, clipKey; versions add `sha256`, render date, review record, fromDraftRevision |
| Audit | `AUDIT#<yyyy-mm>` | `<timestamp>#<id>` | publish/retire/withdraw/approve (admin-api also logs them; log group kept `audit_log_retention_days`) |

Version IDs are non-reusable timestamps; display "v3" is derived by counting. A pinned version not found (ConsistentRead, after draining
UnprocessedKeys) is treated exactly like WITHDRAWN (VOID) and logged at ERROR.

| # | Pattern | Operation |
|---|---|---|
| C1 | selection / bank status / admin list | Query `pk = ACT` (consistent, full partition, a few hundred items) and filter in code |
| C2 | read pinned versions | BatchGetItem (S8.1 G3) |
| C3 | save draft | Update DRAFT with `draftRevision = :r` (+ header updatedAt in a transaction); mismatch → `409 DRAFT_CONFLICT` |
| C4 | publish | (replay check on `fromDraftRevision`) Put `V#ts` `attribute_not_exists` + Update header (`publishedVersion`, state, `fromDraftRevision`; ConditionCheck DRAFT `draftRevision = :r`) + ConditionCheck each referenced speech version approved + Put audit |
| C5 | retire | Update header state=RETIRED + audit (versions untouched) |
| C6 | withdraw `{version, reason}` | Update `V#version` (`attribute_exists`) withdrawn + audit; if version = publishedVersion also retire |
| C7 | approve speech | (replay check on `fromDraftRevision`) Put speech `V#ts` (with `sha256`, render date) + Update speech header (condition draftRevision) + audit (admin-api, after HeadObject) |
| C8 | seed/import | create-only conditional Puts through the draft → publish path; never overwrites operator content (**[CONFIRMED]**) |

### S8.4 Backup and restore
AWS Backup daily, 7 recovery points (**[CONFIRMED]**) + PITR on both tables. A restore always creates a new table without tags, TTL, PITR,
deletion protection or alarms (VERIFIED, [sources/08-aws-data-ops.md](sources/08-aws-data-ops.md)). `game`: restore to a new table, verify,
then cut over via `table_name_overrides` or copy back; **either way, every `SESSION.generation` is bumped** so no pre-restore device can write.
`content`: restore to a scratch table and copy needed items back; verification = every `activityId@version` pinned by an IN_PROGRESS run resolves.

## S9. API surface (**[PROPOSAL]**; all routes under `/api`, JSON; `Authorization: Bearer <access token>`)
Error envelope (Lambda errors only): `{"error": {"code", "message", "details"?, "requestId"}}`; `details` for VALIDATION_FAILED = `[{field, rule}]`,
never values. The machine-readable route list is `contracts/routes.json` (to create); Terraform route keys must equal it (S11.6).

| Route | Lambda | Authoriser / who | Purpose |
|---|---|---|---|
| `GET /api/me` | player-api | player | optional `?sessionId=`; nickname, avatarId, age, ageBand, planets, badges, session `{activeElsewhere, runId, deviceLabel, leaseExpiresAt}`, resumable-run summaries; 404 PROFILE_NOT_FOUND before setup |
| `GET /api/me/progress` | player-api | player | learning summaries by subject/topic + planets + badges |
| `PUT /api/me/profile` | player-api | player | create/complete profile `{nickname, avatarId, dob}`; idempotent; returns the `/me` shape |
| `PATCH /api/me/profile` | player-api | player | nickname/avatar; DOB correction (new runs only) |
| `POST /api/me/resets` | player-api | player | S8.2 |
| `GET /api/planets` | player-api | player | planets → wave sets `{waveSetId, mode, name, finalWave, available, reason?}` for the caller's age band |
| `GET /api/runs` | player-api | player | `?state=open\|done&limit(1–50)&cursor` |
| `POST /api/runs` | player-api | player | `{runId, planetId, waveSetId, rulesetVersion, campaignVersion, sessionId, deviceLabel, takeover?}` → run view + session (G7) |
| `GET /api/runs/{runId}` | player-api | owner | authoritative run view (slots, `withdrawn` flag on current slot, `recentOpIds`, `plannedThrough`, playable) |
| `GET /api/runs/{runId}/pack` | player-api | owner | pack manifest: protocolVersion, versions, slot definitions (allow-listed fields incl. answer data), clip refs, asset manifest, packStatus |
| `POST /api/runs/{runId}/ops` | player-api | owner + session | S7.1 |
| `POST /api/runs/{runId}/endless` | player-api | owner + session | the online-only CHOOSE_ENDLESS op (same envelope, one op) |
| `PUT /api/session` · `DELETE /api/session` | player-api | owner of runId | S3.4 |
| `POST /api/speech` | tts | player | `{runId, slotId, variant}` → `{clipKey, sha256, url (300 s), contentType, bytes}`; any ownership/variant failure → NOT_FOUND |
| `POST /api/admin/speech/preview` | tts | operator | `{kind, speechId?, text\|ssml}` (validated); `kind` ∈ `WORD`\|`PHONEME`\|`LETTER_NAME`\|`INSTRUCTION`\|`DICTATION` selects the engine (S5.2), because `tts` has no `content` access to look the draft up → `{clipKey, url}`; the only Polly path |
| `GET/POST /api/admin/speech-definitions`, `GET/PUT …/{id}`, `POST …/{id}/approve {draftRevision}` | admin-api | operator | speech lifecycle (no withdrawal route in v1) |
| `GET/POST /api/admin/activities`, `GET …/{id}`, `PUT …/{id}/draft`, `POST …/{id}/validate`, `…/publish`, `…/retire`, `…/withdraw {version, reason}` | admin-api | operator | activity lifecycle |
| `GET /api/admin/bank-status` | admin-api | operator | counts vs thresholds per age × subject × category |

### S9.1 Error table (source → HTTP → client action)
| Code | Source | HTTP | Client action |
|---|---|---|---|
| (gateway 401, no envelope) | JWT authoriser | 401 | refresh once, resend; else AUTH_REQUIRED |
| (gateway 429, no envelope) / `THROTTLED` | gateway / Lambda | 429 / 503 | RETRYING with back-off |
| `FORBIDDEN` | Lambda | 403 | show message (admin only) |
| `NOT_FOUND` | Lambda | 404 | for a queued run: recovery (a) |
| `PROFILE_NOT_FOUND` | Lambda | 404 | profile setup (or recovery if local ops exist) |
| `VALIDATION_FAILED` | Lambda / per-op | 400 / 200 REJECTED | bug: divergence |
| `CLIENT_UPGRADE_REQUIRED` | Lambda | 426 | UPGRADE_REQUIRED, keep queue |
| `PROTOCOL_UNSUPPORTED` | Lambda (batch level) | 409 | RETRYING "Saving paused while the game updates"; keep queue, never REJECTED |
| `ACTIVE_SESSION_ELSEWHERE {retryAfterSeconds, deviceLabel}` | Lambda | 409 | "Being played on <device>", retryAfter |
| `TAKEOVER_CONFIRM_REQUIRED` | Lambda (claim and `POST /api/runs`) | 409 | confirmation dialog |
| `STALE_SESSION` | Lambda / per-op | 409 / 200 | divergence (a)/(b) |
| `RUN_TERMINAL` | Lambda (claim) / per-op | 409 / 200 REJECTED | show the terminal run / divergence (a) |
| `STALE_REVISION`, `PHASE_MISMATCH`, `CHECKPOINT_OUT_OF_BOUNDS`, `CONTENT_VERSION_UNSUPPORTED` | per-op | 200 REJECTED | divergence (a) |
| `CONTENT_VERSION_UNSUPPORTED` | Lambda (`POST /api/runs`) | 409 | re-read `current.json`, retry |
| `RUN_LIMIT_REACHED`, `CONTENT_UNAVAILABLE{reason: AGE_OUT_OF_RANGE \| BANK_NOT_READY \| PLANET_LOCKED}` | Lambda | 409 / 409 | honest message |
| `DRAFT_CONFLICT` | admin-api | 409 | "Someone saved this draft after you opened it. Reload to see their changes." |
| `SPEECH_UNAVAILABLE` | tts | 503 | Retry button; never an attempt |
| `SPEECH_SYNTHESIS_FAILED` | tts preview | 502 | operator retry |
| `INTERNAL` | Lambda | 500 | RETRYING |

`ATTEMPTS_EXHAUSTED`, `DUPLICATE_ANSWER`, `CONTENT_WITHDRAWN` (as an op result) and `INVALID_ANSWER_FORMAT` (server) are removed.

### S9.5 Limits (one shared limits file read by client and handlers; numbers **[ASSUMPTION]**)
Body ≤64 KB (`/ops`, admin draft PUT), ≤8 KB elsewhere, checked on the raw body. Strict schemas per route/op/protocolVersion; handlers write
named attributes only. IDs: opId/sessionId/runId UUID; slotId `^[NM]-[0-9]{3}$`; every other key ID is hyphenated lower case,
`^[a-z0-9-]{1,40}$` (examples: topic `maths-count-objects-to10`, activity `ma-0101`, speech `phoneme-sh`, pads `p01`..`p16`, classes
`nova` `pip` `juno` `mira` `orion` `sol`); targeting enum `FRONT` | `FAST` | `CROWD` | `STRONG`; nickname 1–20 (letters, digits, space,
hyphen); avatarId from the shipped list; canonical answer one string ≤64 chars without the reserved separators (S3.3); deviceLabel ≤40;
preview text ≤300 chars.
Throttles (Terraform; shared, best-effort): stage 20 rps / burst 40; `POST /api/runs` 1/5; `POST /api/speech` 20/40; admin speech 2/5.
Optional `on_demand_throughput` maxima on both tables above the largest transaction.

## S10. React / Phaser split (**[PROPOSAL]**)
- npm workspaces under `web/`: `game-core` (pure TS: fixed-timestep simulation, rules reducer, next-phase rule; no Phaser/DOM),
  `player` (React + Phaser app), `admin` (React app), `shared` (API types, limits, answer canonicaliser, test vectors, and the **shared
  learning panel**: React, no Phaser, used by the player app and the admin preview-solve). `contracts/` at repo root holds JSON Schemas,
  `routes.json`, `golden/` and shared fixtures (op sequences, answer vectors) consumed by Vitest and pytest.
- Fixed 60 Hz step with an **integer accumulator in units of 1/60,000 s** (one step = 1,000 units, so no floating-point drift): each frame
  `acc += min(frameDelta, 250 ms) × speed`; `while acc ≥ STEP && steps < MAX: step(); acc −= STEP`, with **MAX = 30 steps per frame**; if
  the cap is hit, the remaining accumulator is discarded (the game slows rather than spiralling). Paused/hidden adds nothing.
  Frame-rate determinism is a spec rule (prompt.md:303, AC-13): the same wave at 30/60/144 Hz deltas gives an identical tick count and
  post-wave snapshot. AC-42 is only the busiest-wave performance target; its number is set after the first prototype measurement in M2.
- Phaser scene: rendering and battlefield pointer mapping only; Phaser keyboard capture disabled; keyboard shortcuts and accessible controls live in the DOM.
- React: routing, auth, screens, HUD, shop, learning panels, dialogs, sync status; never re-renders per frame (HUD events ≤10 Hz).
- `GameBridge` commands: `loadRun`, `startWave`, `pause`, `resume`, `setSpeed`, `place`, `upgrade`, `sell`, `setTargeting`, `usePower`, `selectPad`;
  events: `hud`, `selectionChanged`, `waveCleared{snapshot, stats}`, `defeated{wave}`, `commandRejected`.
- Economy mutations are simulation commands validated at tick boundaries (no negative balances from UI races, AC-09).
- Simulation-level pause flag: page hidden or dialog open → pause; only an explicit Resume clears it (Phaser auto-resumes otherwise;
  VERIFIED during planning research).
- Stack (current versions VERIFIED 2026-11-14 during planning research; pins **[PROPOSAL]**): Node 24 LTS, Vite 8, React 19, TypeScript per
  create-vite (TS 7 + oxlint), Phaser 4.2.1, React Router (declarative), Vitest, Playwright, `idb`; Python 3.14 + Powertools (Logger,
  Event Handler, Parser) + pytest + moto.

## S11. Delivery (**[PROPOSAL]**)

### S11.1 Workflows
All deployment goes through these pipelines (S0.1). The bootstrap root is the only thing applied locally, by the owner.
- **Bootstrap root additions** (applied locally by the owner, together with the `trusted_subs` fix): the Lambda artefacts bucket, added beside
  the existing module call (no replacement bootstrap). This removes the chicken-and-egg of the main stack needing a bucket for its own
  Lambda zips (no `-target` apply in the pipeline).
- `release.yml` (`workflow_dispatch`, inputs `ref` and optional `artefacts_from=<release_id>`), jobs in order:
  1. checks (lint, type-check, unit tests TS + Python, contract fixtures, DynamoDB Local integration tests as a CI service container,
     Terraform fmt/validate, the gates in S11.6);
  2. build: two static apps (environment-free), four Lambda zips, game-data + bounds files; upload zips to the artefacts bucket under
     content-hash keys; write a release manifest (git sha, zip keys + hashes, static build hash, game-data versions). With `artefacts_from`,
     the build is skipped and that release's archived manifest is used instead (S11.2);
  3. `terraform plan -out` with `-var-file` envs + manifest variables (`lambda_artifacts`); plan guard against `infrastructure/plan-guard.json`
     (fails if any protected resource type would be deleted or replaced); store plan + `.terraform.lock.hcl` + manifest in the artefacts
     bucket under `plans/<run_id>/` (never as a GitHub artefact, which could be public);
  4. **default: two-dispatch.** The workflow stops after the plan; the owner reviews it and dispatches `apply.yml` with the plan's run ID.
     If required reviewers are available, a second environment `prod-apply` (with reviewers) is added and used only by the apply job;
  5. apply the exact saved plan (same runner image, same Terraform version);
  6. publish static: game data + hashed assets first (immutable cache headers), then `config.json` (from `terraform output -json`: pool IDs,
     client IDs, managed-login domains, API base `/api`) and `index.html` last (no-cache); no `--delete`; CloudFront invalidation of
     `index.html`, `config.json` and `/game-data/current.json` only;
  7. smoke checks (S11.6); archive the manifest; tag `release-<release_id>`.
- `plan.yml` (manual, plan-only) replaces `tf-apply-destroy-env.yml`; `deploy.yml` is replaced by `release.yml`. No destroy workflow.
  `oidc-smoke.yml` (the M0 OIDC smoke test) is kept after M0 as a manual workflow.
- **OIDC subjects:** every job that assumes the CI role declares `environment: prod` (main-only deployment branch rule), so the subject becomes
  `…:environment:prod`; with `prod-apply`, both subjects go into the bootstrap `trusted_subs` (in the immutable subject format if the repo uses
  it). If environments are unavailable on a private repo, fall back to the subject `…:ref:refs/heads/main`. The M0 OIDC smoke test settles
  which applies; the result is recorded as an ADR in `docs/decisions/`.
- Terraform 1.x pinned to `terraform_version` (the owner's local version; ≥1.11 for GA S3 native locking); backend
  `bucket=prod-state-bucket-space-tower-defence`, `key=main/terraform.tfstate`, `use_lockfile=true`, `region=eu-west-2`; commit
  `infrastructure/main/.terraform.lock.hcl`.
- Ownership: Terraform owns all infrastructure **and Lambda code** (via `s3_key` + hash from the manifest); the workflow owns static
  publication and `config.json`. Nothing is owned twice; the workflow never calls `update-function-code`.

### S11.2 Rollback
Re-dispatch `release.yml` with `artefacts_from=<release_id>`: current `main` Terraform plus that release's archived manifest (zips, static build,
game data), so nothing is rebuilt. Rolling back Terraform code itself is a normal forward commit. Static files are never deleted, so old and
new hashed assets coexist. Player data is never rolled back by a release. Never roll back past a mechanics or protocol addition while an
IN_PROGRESS run or a queued client needs it (S5.1); a client queue that meets an older server waits in `RETRYING` (`PROTOCOL_UNSUPPORTED`).

### S11.3 Data protection
Tables, pools and buckets: native deletion protection where it exists + `prevent_destroy`, **on from the first apply**; no `force_destroy`;
the plan guard (by resource type listed in `infrastructure/plan-guard.json`, including Cognito app clients: replacing one changes its ID and
signs everyone out).

### S11.4 Data-freeze point
Name the first release whose saves the children keep. Before it, tables/pools may be replaced deliberately (by lifting the protection flags in
a reviewed commit) and game-data files edited. From it: the plan-guard check enforces (`enforce: true`); game-data lock check (git diff vs the
last `release-*` tag shows only added files under `game-data/`, and likewise for `contracts/golden/`); golden scenarios required; archive kept;
restore test run.

### S11.5 Monitoring (alarms → SNS e-mail; Sum ≥ 1 over 5 min, notBreaching; **[ASSUMPTION]**)
Lambda Errors (all four, incl. presignup cap hits), Lambda Throttles, HTTP API 5xx, metric filter `result=REJECTED`, metric filter `SPEECH_UNAVAILABLE`,
CloudFront 5xx rate (us-east-1 mirror topic), AWS Backup job failures, DynamoDB throttled requests. The e-mail subscription must be confirmed
within 48 h.

### S11.6 Validation gates
Gate IDs are those of [H.10](H-infrastructure-and-delivery.md#h10-quality-gates).
- G-12: plan route keys must equal `contracts/routes.json` (a gate beside the other plan checks).
- Release smoke test iterates `contracts/routes.json`: every route returns 401 without a token on **both** distributions; site 200; `config.json`
  fetchable.
- `contracts/golden/` is additive-only, like game data.
- G-13: DynamoDB Local integration tests run in CI (service container) and are optional locally (no Docker/Java on the owner's machine).
- G-14: machine check on speech definitions against `content/listening-verdicts.json` (S5.2).
- G-15: game-data build gate refusing a wave set whose create-run transaction would exceed 100 actions (S5.1).
- Evidence (playtests, performance, acceptance, browsers) lives under `docs/validation/`. Detail in [I](I-validation.md).

## S12. Milestones (**[PROPOSAL]**; the spec heads them "SUGGESTED")
Built in sequential build phases with an owner code review at each gate (S0.1).

| Milestone | Scope |
|---|---|
| M0 | repo hygiene + spikes: OIDC smoke test (`oidc-smoke.yml`); auth (managed-login username-only sign-up, token claims, groups serialisation); Polly listening bake-off (rendered with the AWS CLI from the same canonical inputs; decides `tts_phoneme_engine`); Phaser 4 + Vite 8 + TS 7 scaffold; IndexedDB/presigned-audio; DynamoDB transaction fixtures |
| M1 | thin vertical slice: one planet, short wave set, one class, one alien, one phonics multiple-choice activity with Play, online ops, cloud save; the admin alias record and a **minimal admin app** (needed for clip approval); clips re-rendered through the real preview route; playtest P1 |
| M2 | core game systems; first performance measurement sets the AC-42 target; playtest P2 |
| M3 | content + admin |
| M4 | full campaign + progression + challenges + endless |
| M5 | robust persistence + offline + conflict handling |
| M6 | art, performance, release confidence |

The first release where children keep saves = data-freeze point (S11.4). [J](J-execution-backlog.md) holds the tasks and a cross-plan ID legend.

## S13. Owner decisions

All recommendations below were **accepted as recommended [CONFIRMED by owner, 2026-11-14]** (the owner approved all the plan's design
decisions in chat).

| ID | Decision | Accepted answer |
|---|---|---|
| D-1 | clips for spelling dictation and instruction stems | yes |
| D-2 | "Show me" after an incorrect attempt | yes |
| D-3 | eighth birthday | accept for v1 |
| D-4 | show the correct answer after resolution | yes |
| D-5 | meteor results count in summaries | yes |
| D-6 | endless bank exhausted | subject fallback, never repeat |
| D-7 | typed words at age 5 | no; tiles |
| D-8 | client-only "tried that" guard + ≥4 options | yes |
| D-9 | already-FAILED slots on a withdrawn version stay FAILED | accept |
| D-10 | two Cognito pools vs one pool + group | two |
| D-11 | meteor skip allowed only before the first attempt | yes |
| D-12 | player speech never re-synthesises on a missing clip (narrows prompt.md:577) | yes |
| D-13 | repo visibility / required reviewers | two-dispatch default works either way (S11.1) |

Owner decisions taken on 2026-11-14 and folded into this spine: voice engine and configuration (S1, S5.2), speech reuse and the play rule (S5.2),
the domain facts (S1.0), and the way of working (S0.1).

Genuine blockers (need the owner's action, not a decision):
- GitHub OIDC subject format check (M0 smoke test) and the bootstrap `trusted_subs` update, applied locally by the owner.
- DNS integration of the ACM validation and alias records (owner-owned), including the S1.0 checks.

## S14. Change log (v0.2 → v0.3)

| # | Change | Where |
|---|---|---|
| 1 | Published as `docs/plan/00-spine.md`; planner-only instructions removed; intro added; research evidence now cited from `sources/` | top, S5.3, S8.4 |
| 2 | Way of working: Claude builds in phases, owner reviews at gates, work on `main`, deploy only via GitHub Actions; Node 24 via nvm | S0, S0.1 |
| 3 | Polly: generative engine, en-GB, voice Amy; `tts_phoneme_engine` (default neural) for phonemes and letter names; Nova Sonic rejected; human recordings as fallback | S1, S5.2 |
| 4 | `tts_voice_id`, `tts_engine`, `tts_phoneme_engine` variables feed `tts` and `admin-api`; changes affect new previews only | S1, S1.3, S5.2 |
| 5 | Speech definitions gain `kind`, `provider`, `engine`, `voiceId`; approval records render date | S5.2, S8.3 |
| 6 | Clips synthesised once ever and stored once per clipKey; Play starts at once from local bytes while `POST /api/speech` runs concurrently | S5.2, S3.6, S7.3 |
| 7 | Domain facts: apex app exists in another account; CAA, wildcard-alias, cookie and HSTS checks; never touch apex/www or overwrite | S1.0 |
| 8 | Frame-rate determinism cites prompt.md:303 and AC-13; AC-42 is the performance target only | S10 |
| 9 | Reference product's `/api/*` path (Function URL + prefix strip) distinguished from ours (HTTP API default endpoint, `/api` kept) | S1 |
| 10 | Configuration keys, variables, folders, files, prefixes, game-data kinds, release tag and Lambda timeouts recorded (player-api 25 s) | S1, S1.3, S8.2 |
| 11 | Key ID format and examples; targeting enum | S9.5 |
| 12 | Canonical answer is one string ≤64 chars for every type; option-ID array removed; reserved separators refused | S3.3, S9.5 |
| 13 | Learning-outcome badges dropped from v1; challenge badges kept (final CHALLENGE COMPLETE_WAVE writes `badges` only); challenge rewards use the campaign interval table | S3.2 |
| 14 | Meteor success at the power cap: SUCCEEDED and counted, no charge | S3.2 |
| 15 | Identity fields locked after publish (adds `authoringMode`, `interactionType`); header `state` enums; `fromDraftRevision` replay; `409 DRAFT_CONFLICT`; publish review record | S5.2, S8.3, S9.1 |
| 16 | Speech withdrawal is a runbook only | S5.2, S9 |
| 17 | Sign-out is connection-required | S7.4 |
| 18 | Shared learning panel lives in `web/shared` | S10 |
| 19 | `tts` IAM: add prefix-scoped `s3:ListBucket`, remove `content` read; speech resolved from the slot's pinned clips map | S1, S2, S3.3 |
| 20 | `sha256` of MP3 bytes on approved speech versions and in the `POST /api/speech` response; client verifies | S5.2, S8.3, S9 |
| 21 | Create run: PROFILE ConditionCheck (57 actions), `takeover` + `TAKEOVER_CONFIRM_REQUIRED`, `409 CONTENT_VERSION_UNSUPPORTED`, `PLANET_LOCKED` | S3.2, S5.1, S8.1, S9 |
| 22 | Session: claim condition realised as F §5.3; `RESET#` holder treated as released; `deviceLabel` on ACTIVE_SESSION_ELSEWHERE; restore cut-over bumps generations; option (b) all-or-nothing; recovery copy; offline VOID vs local FAILED keeps local result; `GET /api/me?sessionId=` | S3.3, S3.4, S7.5, S8.1, S8.4, S9 |
| 23 | Endless planning never creates a slot above interval 998 | S3.2, S5.3 |
| 24 | Per-op outcomes: `CORRECT` dropped, `DECLINED` added | S7.1 |
| 25 | Newer protocolVersion → `409 PROTOCOL_UNSUPPORTED`, queue held in RETRYING | S3.5, S5.1, S7, S9.1 |
| 26 | Game-data build gate on wave-set transaction size (≤100 actions) | S5.1 |
| 27 | Rollback via `artefacts_from=<release_id>`; Terraform rollback is a forward commit | S11.1, S11.2 |
| 28 | Environments: two-dispatch default, optional `prod-apply` with reviewers, `ref:refs/heads/main` fallback, settled by the M0 smoke test as an ADR | S11.1 |
| 29 | Artefacts bucket moves to the bootstrap root; saved plans stored under `plans/<run_id>/` | S1, S11.1 |
| 30 | Access-log diagnostic fields allowed | S1, S2 |
| 31 | `/game-data/current.json` added to the CloudFront invalidation | S11.1 |
| 32 | Protection flags on from the first apply; plan guard enforces from the data freeze | S11.3, S11.4 |
| 33 | Validation gates: routes.json smoke and plan check, additive golden files, DynamoDB Local in CI, listening-verdict check, evidence folders | S11.6 |
| 34 | Milestones: admin alias + minimal admin in M1; listening spike via AWS CLI; MAX 30 steps and integer accumulator; `oidc-smoke.yml` kept; AC-42 target from M2 measurement; playtests P1 (M1) and P2 (M2) | S10, S11.1, S12 |
| 35 | D-1..D-13 accepted as recommended by the owner | S13 |
| 36 | Speech preview body gains `kind` (selects `tts_engine` or `tts_phoneme_engine`, since `tts` cannot read the draft); validation gates cite H.10 IDs G-12–G-15; `docs/build-phases.md` and `CLAUDE.md` listed as files to create | S9, S11.6, S1.3 |
