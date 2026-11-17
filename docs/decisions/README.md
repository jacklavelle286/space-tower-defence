# Decisions

An architecture decision record (ADR) is one short file per decision: what we chose, what we rejected and why.
Once accepted, an ADR is never rewritten. A change of mind is a new ADR that supersedes the old one, and both stay.
The rules are in [J §J.6](../plan/J-execution-backlog.md#j6-decision-log-practice); new ADRs start from [0000-template.md](0000-template.md).

## Status lifecycle

`Proposed` (not yet agreed) → `Accepted` → `Superseded by NNNN` (or `Rejected`).

- ADR-0001 to 0010 record decisions accepted with the plan on 2026-11-14, so they start as `Accepted`.
- An ADR written during a build phase starts as `Proposed` and becomes `Accepted` when the owner approves that phase's gate.
- A later change to a spine rule is made by an ADR first, then added to the spine change log ([S14](../plan/00-spine.md#s14-change-log-v02--v03)).

## Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-same-origin-api.md) | Same-origin API through CloudFront | Accepted |
| [0002](0002-two-cognito-pools.md) | Two Cognito user pools with managed login and PKCE | Accepted |
| [0003](0003-four-lambdas.md) | Four Python Lambdas, one role each, no Lambda calls another | Accepted |
| [0004](0004-two-dynamodb-tables.md) | Two DynamoDB tables, no GSI, almost no TTL | Accepted |
| [0005](0005-family-level-trust.md) | Family-level trust with per-op plausibility bounds | Accepted |
| [0006](0006-run-state-and-snapshots.md) | Run state as status, stage and phase, with one snapshot | Accepted |
| [0007](0007-one-write-path-op-batches.md) | One write path: ordered op batches through a shared pure reducer | Accepted |
| [0008](0008-play-session-lease.md) | Account-wide play-session lease with a fencing generation | Accepted |
| [0009](0009-speech-render-path-and-voice.md) | One speech render path; Polly generative en-GB Amy | Accepted |
| [0010](0010-delivery-and-release.md) | Delivery: one manual release, pipelines only | Accepted |
| [0011](0011-oidc-trust-environments-and-artefacts-bucket.md) | OIDC trust, GitHub environments and the artefacts bucket | Accepted |
| [0012](0012-auth-spike.md) | Auth spike results: managed login for the player pool | Accepted |
| [0013](0013-front-end-stack-versions.md) | Front-end stack versions | Accepted |
| [0014](0014-listening-bake-off.md) | Listening bake-off: `tts_phoneme_engine`, per-sound verdicts and SSML templates | Accepted |
| [0015](0015-browser-audio-storage.md) | Browser audio storage (IndexedDB `scd-<sub>`, memory fallback) and the Play rule in code | Accepted |
| [0016](0016-m1-wave-set-challenge.md) | The Milestone 1 wave set is a two-wave CHALLENGE (J-1) | Accepted |
| [0017](0017-m1-session-scope.md) | Milestone 1 session scope: full server fence, a thin client (J-2) | Accepted |
| [0018](0018-m1-minimal-admin-app.md) | The M1 clip goes through a minimal admin app on `admin.aliens.jackgl.com` (J-3) | Accepted |
| [0019](0019-single-release-run-with-approval.md) | One release run with a manual approval (supersedes in part 0010, 0011 once accepted) | Accepted |
| [0020](0020-spike-workflow-destroy-path.md) | A separate spike workflow whose destroy reaches spike state only (amends H §H.7 W-1 and the J M0 order for Phases 5–6) | Accepted |
| [0021](0021-skip-remaining-spikes.md) | Skip the DynamoDB and browser-audio spikes (M0-13, M0-12); their questions move to Phases 17, 19 and 22 | Accepted |
| [0022](0022-accounts-in-terraform.md) | Operator and test accounts in Terraform (supersedes, for those four accounts only, H §H.9.1's "no users in Terraform") | Accepted |
| [0024](0024-content-first-offline-after-launch.md) | Content before game systems; offline play after launch (gate order D, G, H1, I, E, F, J, L, then K) | Accepted |
| [0023](0023-admin-sign-in-without-amplify.md) | Admin sign-in: hand-written code + PKCE, tokens in sessionStorage, no refresh (the player keeps Amplify, E.7.1) | Accepted |
| [0025](0025-speech-takes.md) | Speech takes: a draft's `take` (1..50, absent = 1) is the clip key's generation, so the operator can re-roll a generative render | Accepted |
| [0026](0026-picture-library-generate-and-upload.md) | Picture library: generate with Claude on Bedrock, and upload | Proposed |
| [0027](0027-editor-topics-auto-ids-either-slot.md) | Editor: topic registry, automatic IDs, activities for either slot (`BOTH`), one review tick | Accepted |
| [0028](0028-in-app-listening-verdict-and-auto-published-starter-pack.md) | In-app listening is the phoneme verdict (only `word-only` refused); the starter pack is auto-published by the seed | Accepted |
| [0029](0029-activity-hard-delete.md) | Activities (R31) and unused speech (R32) can be deleted: header, draft and versions; audit item kept; in-progress slots read as withdrawn | Accepted |
| [0030](0030-gate-h1-speech-templates-selection.md) | Gate H1: approve bound to the played clip, 17 template generators (5,000-instance check), starter rules until an age is eligible | Accepted |
| [0031](0031-gate-p-picture-library-and-generation.md) | Gate P: pictures bucket at /pictures/*, browser conversion with strict server PNG check, fifth Lambda picture-gen via SQS (OpenAI gpt-6.1-sol, EU residency, key in Secrets Manager since 2026-11-16; Bedrock Opus 5.5 a variable away), caps 100/day 150/month, budget USD 65 | Accepted |
| [0032](0032-admin-level-designer-gate-m.md) | Admin level and planet designer (all three tiers) as new Gate M after J, before L; export first, runtime publish in LD6; two blocking bot checks; tester preview | Proposed |
| [0033](0033-ruleset-r2-mechanics-2-roster.md) | Ruleset r2 with mechanics 2 holds the six-class roster; current.json stays on r1 until Phase 25 | Accepted |
| [0034](0034-ruleset-r3-mechanics-3-aliens.md) | Ruleset r3 with mechanics 3 holds the alien catalogue (traits as data), carriers, splitters and caps (amended in Phase 27: and the five bosses; in Phase 28: and the meteor powers); current.json stays on r1 | Accepted |
| [0035](0035-ac42-performance-target.md) | The AC-42 performance target, from the first measurement (busiest wave at 2x: 1%-low ≥ 55, average ≥ 58; synthetic scene: 1%-low ≥ 45) | Proposed |

## Next in line

Topics still to record when the work happens ([J §J.6.3](../plan/J-execution-backlog.md#j63-the-first-ten-adrs-from-the-spine)). Next: game data as immutable versioned files with `mechanics` compatibility, the fixed 60 Hz timestep, and the data-freeze point when it is named (M6-10).

## Register

[unverified.md](unverified.md): every unverified fact from the plan, the phase that settles it, and its status (M0-14).
