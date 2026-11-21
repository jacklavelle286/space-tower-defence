# 02. Environments and delivery

Part of the [platform scope](README.md). Status: active on `dev` from 2026-11-21.

---

## 1. Summary

The platform runs in **two new AWS accounts, dev and prod**, in the owner's AWS Organization [CONFIRMED by owner
2026-11-21, PD-3]. It uses the same architecture and delivery rules as the family edition: Terraform applied only by
GitHub Actions on the owner's dispatch, the owner approving every prod apply, and Claude making only read-only AWS calls
(CLAUDE.md). The family edition keeps its account (263185198757), its `infrastructure/main` root and its workflows,
untouched [CONFIRMED by owner, PD-1]. The one addition to the architecture still open is a scheduler for timed jobs
(billing notices, a nightly Stripe check, retention deletions): [13 PLAN-Q4](13-delivery-plan.md#5-decisions-still-open).

---

## 2. Accounts

| Account | Purpose | Status |
|---|---|---|
| Organization management | Owner's AWS Organization | Exists |
| DNS, 521764600394 (profile `dns`) | Registration and hosted zone of `spacecolonydefence.com` | Exists [VERIFIED 2026-11-21] |
| Family edition, 263185198757 (profile `space-tower-defence`) | `aliens.jackgl.com` | Exists, unchanged |
| **`sca-dev`**, 814155454655 (profile `sca-dev`) | Development and testing; made-up data only; every merge into `dev` deploys here | Created and bootstrapped by the owner [VERIFIED 2026-11-21, §3] |
| **`sca-prod`**, 323879072257 (profile `sca-prod`) | Real schools, the demo school, the owner's console and content; deployed once, at the big release | Created and bootstrapped by the owner [VERIFIED 2026-11-21, §3] |

Named `sca-dev` and `sca-prod` [CONFIRMED by owner 2026-11-21, PD-21].

**Guardrails** for an OU holding both accounts [PROPOSAL; the owner knows the org's existing SCPs]:

- Regions limited to `eu-west-2` plus the global services that need `us-east-1` (CloudFront certificates, Cognito
  custom domain certificates).
- No leaving the organisation; CloudTrail and Config not removable.
- IAM Identity Center permission sets: the owner's admin set (`AdministratorAccess`) and a **read-only set**
  (`ReadOnlyAccess`) for local checks. Done for the whole organisation; see "Read-only access for Claude" below.
- An AWS Budget and cost anomaly detection on each account, alerting the owner.

**Read-only access for Claude (ENV-3).** At the owner's request on 2026-11-21, Claude created the Identity Center
permission set `ReadOnlyAccess` in the management account (the AWS managed policy of that name, 8-hour sessions) and
assigned it to the owner's user in all 20 accounts of the organisation [CONFIRMED by owner 2026-11-21: a one-off write
by Claude, asked for in chat]. From then on Claude's AWS calls use only the profiles below. The profiles without the
suffix keep AdministratorAccess and are the owner's, for the bootstrap and the runbooks.

| Read-only profile | Account |
|---|---|
| `sca-dev-readonly` | sca-dev |
| `sca-prod-readonly` | sca-prod |
| `dns-readonly` | DNS (`spacecolonydefence.com`) |
| `space-tower-defence-readonly` | Family edition |
| `productivity-prod-readonly` | The `jackgl.com` zone (the family edition's DNS) |
| `cumulus-main-readonly` | Organization management (Organizations and Identity Center reads) |

[VERIFIED 2026-11-21] Each profile signs in as `AWSReservedSSO_ReadOnlyAccess_…` and can list resources. An EC2
dry-run write returns `UnauthorizedOperation`, and a policy simulation denies `s3:PutObject`, `iam:CreateRole`,
`dynamodb:PutItem`, `lambda:UpdateFunctionCode`, `secretsmanager:GetSecretValue` and `kms:Decrypt`. ReadOnlyAccess can
still read data (S3 objects, DynamoDB items), so "no personal data" stays Claude's rule, not a permission.

---

## 3. Bootstrap

Each new account needs what the family account has. Today `infrastructure/bootstrap` calls the owner's
`terraform-bootstrap` module (tag `v1.0.0`), which creates the GitHub OIDC provider, **one CI role with
AdministratorAccess** trusted for the `prod` and `prod-apply` GitHub environments, and the Terraform state bucket. The
root itself adds an artefacts bucket [VERIFIED infrastructure/bootstrap/main.tf:18-30, artifacts.tf:13-142]. The owner
runs it with `scripts/bootstrap.sh`.

For the platform [PROPOSAL], a read-only **plan role** and a separate **apply role** per account are better than one
admin role. That needs either module support or a small addition in the bootstrap root [UNVERIFIED: check the
`terraform-bootstrap` v1.0.0 inputs]. Failing that, use today's single-role shape, trusted only for the platform's own
GitHub environments.

[PROPOSAL; an ADR records it] The existing bootstrap root gains one instance per new account, from the env files
`sca-dev.tfvars.json` and `sca-prod.tfvars.json` and with their own state. That is **more instances of the same root, not a replacement
bootstrap**, so it keeps to [H §H.5](../plan/H-infrastructure-and-delivery.md#h5-bootstrap-changes-you-make-no-replacement-bootstrap).
The owner applies each one; Claude edits and reviews the plan output.

The roles trust GitHub's OIDC token only for this repository and only from a named GitHub environment
[CONFIRMED by owner 2026-11-21 for the account names; environment names PROPOSAL]. The subjects use the same immutable
form as the family account's (`common.auto.tfvars.json`), and each account's env file overrides the common list:

| Env file (read by `bootstrap.sh <env>`) | Account | `trusted_subs` |
|---|---|---|
| `infrastructure/envs/sca-dev.tfvars.json` | sca-dev | `repo:jacklavelle286@78485499/space-tower-defence@1457706183:environment:sca-dev` |
| `infrastructure/envs/sca-prod.tfvars.json` | sca-prod | `…:environment:sca-prod` and `…:environment:sca-prod-apply` |

The owner applied both on 2026-11-21 with the single-role shape: one CI role per account, with AdministratorAccess.
The plan and apply role split above stays a proposal. Each account now holds the following [VERIFIED 2026-11-21,
read-only AWS calls with the `sca-dev` and `sca-prod` profiles]:

| What | Name (`<env>` is `sca-dev` or `sca-prod`; `<account>` is its ID) |
|---|---|
| GitHub OIDC provider, audience `sts.amazonaws.com` | `token.actions.githubusercontent.com` |
| CI role: AdministratorAccess, 1-hour sessions, trusts exactly the subjects in the table above | `space-tower-defence-<env>-github-oidc` |
| State bucket for the platform root (ENV-4) | `<env>-state-bucket-space-tower-defence` |
| Release artefacts bucket | `<account>-eu-west-2-<env>-artifacts-bucket` |
| The bootstrap's own state (made by `bootstrap.sh`) | `<account>-eu-west-2-space-tower-defence-<env>-bootstrap` |

All three buckets are in eu-west-2, versioned, encrypted with SSE-S3, and block all public access. There is no lock
table (state uses S3 native locking) and no ECR repository. Role ARNs for the platform's workflows:
`arn:aws:iam::814155454655:role/space-tower-defence-sca-dev-github-oidc` and
`arn:aws:iam::323879072257:role/space-tower-defence-sca-prod-github-oidc`.

GitHub environments, created by the owner on 2026-11-21 [VERIFIED 2026-11-21, `gh api` on the repository's
environments]:

| Environment | Deployment branches | Reviewer | Used for |
|---|---|---|---|
| `sca-dev` | `dev` only | none (auto-deploy, PD-22) | Plan, apply and publish to sca-dev on every merge into `dev` |
| `sca-prod` | `main` only | none | Plan, publish and smoke for prod |
| `sca-prod-apply` | `main` only | the owner | The prod apply, held for approval |

Limiting each environment to one branch matters because the bootstrap role has AdministratorAccess today: a feature
branch must never be able to assume it.

---

## 4. Terraform

**`infrastructure/platform/`** is the platform's root, separate from the family edition's `infrastructure/main`. It
exists from PS1 (ENV-4) and so far holds the alerts topic, `<project>-<environment>-alerts`, with the owner's email
subscription. Its state is `platform/terraform.tfstate` in each account's state bucket. It uses the same provider
constraints and lock entry as `infrastructure/main`, refuses any account but the env file's (`allowed_account_ids`)
and any environment but `sca-dev` and `sca-prod`, and tags everything `edition = platform` [VERIFIED 2026-11-21:
`terraform validate`; `terraform test`, 6 offline runs; a read-only `plan` for sca-dev and for sca-prod, 2 to add each].

[PROPOSAL] Later phases build the rest from the existing modules (static site, HTTP API, Lambda function, DynamoDB
table, alarms) and some new ones:

| New module | What |
|---|---|
| `school_edge` | The wildcard school distribution, its CloudFront Function, behaviours for `/`, `/staff`, `/api/*` |
| `cognito_staff_pool`, `cognito_pupil_pool` | The two new pools, triggers, custom domain ([04](04-identity-and-access.md)) |
| `ses_domain` | SES domain identity, DKIM, custom MAIL FROM ([03](03-domains-edge-and-email.md)) |
| `dns_records` | Records in the DNS account's zone, through a cross-account role (PQ-3) |
| `secrets` | Secrets Manager entries (empty; the owner puts the values in) |

**Why a separate root**: `infrastructure/main` encodes the family edition (one distribution, self sign-up, birthday-based
profiles). Changing it for the platform would put conditionals into a working production stack. A separate root keeps the
family edition safe and lets the two diverge [PROPOSAL].

| File | Holds |
|---|---|
| `infrastructure/envs/sca-dev.tfvars.json` (shared with the bootstrap, as `prod.tfvars.json` is today) | Now: account ID, trusted subjects, the alerts email (the family edition's alerts address). Later: domain `dev.spacecolonydefence.com`, Stripe mode `test`, small log retention |
| `infrastructure/envs/sca-prod.tfvars.json` | Now: as sca-dev. Later: domain `spacecolonydefence.com`, Stripe mode `live`, alarms, backups |
| `infrastructure/envs/common.auto.tfvars.json` | Shared (Terraform 1.17.2 exact, region) |

---

<a id="5-code-on-the-schools-branch"></a>

## 5. Code on the `dev` branch

| Path | Change |
|---|---|
| `web/game-core`, `web/shared` | Shared with the family edition. Changes are additive (e.g. year-group content choice) |
| `web/player` | Becomes school-aware: sign-in by class code or QR, This week, school branding ([07](07-pupil-experience.md)) |
| `web/admin` | Becomes the **console**: today's content tools plus Schools, Plans, Billing, Support ([05](05-platform-console.md)) |
| **`web/portal`** (new) | The **staff portal** SPA served at `/staff` ([06](06-school-portal.md)). A separate bundle keeps pupils' pages small and free of staff code |
| `api/functions/player_api` | School-aware ([10](10-data-and-api.md)) |
| **New functions** | `school_api`, `platform_api`, `pupil_auth`, `auth_triggers`, `billing` ([10 §4](10-data-and-api.md#4-lambda-functions-and-their-permissions)) |
| `infrastructure/platform` | New root (section 4) |

**Branches** [CONFIRMED by owner 2026-11-21, ADR-0044]: `family` holds the family edition, `dev` the platform, and
`main` waits for the big release. Platform work is done on short-lived feature branches named after the Jira ticket
(`SCD-<n>-<short-name>`) and merged into `dev` by pull request once CI passes [CONFIRMED by owner 2026-11-21: Claude may merge its own
green pull requests; the owner reviews everything before the prod release]. Merge `family` into `dev` after family fixes, so
game and content fixes flow one way. The day-to-day steps are in the [branches runbook](../runbooks/branches.md).
Platform code stays additive where it can; where a shared file must differ (the player API, the player app), it reads
an `edition` setting (`family` or `schools`). Whether the family edition eventually becomes a tenant of the platform, or
both editions stay on one branch, is decided after the platform launches ([13](13-delivery-plan.md#5-decisions-still-open)).

---

## 6. Pipelines

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Pushes to `main`, `family` and `dev`, and pull requests into them [VERIFIED `.github/workflows/ci.yml`, ADR-0044] | Today's checks, plus platform tests (RBAC matrix, tenant isolation, billing webhooks) as they are written |
| **`platform-release.yml`** (PS1, ENV-6) | **Push to `dev`**: deploys to sca-dev automatically (GitHub environment `sca-dev`, limited to `dev`). **Dispatch on `dev`** (`gh workflow run platform-release.yml --ref dev`; the Run workflow button needs the file on the default branch, `main`): the same, without a merge. **Dispatch on `main`** by the owner: deploys to sca-prod (environments `sca-prod` and `sca-prod-apply`, limited to `main`; the owner approves `sca-prod-apply`). Any other event or ref is refused | config → checks (fmt, validate, the root's tests, invariants) → plan (saved, then stored create-only in the account's artefacts bucket under `plans/<run_id>-<attempt>/`, so a re-run plans afresh) → apply (that plan only, from the verified tarball; skipped when nothing changes) → smoke (read-only checks of what the root holds). Publish (web apps and game data) arrives with the distributions in PS2. Today's `release.yml`, `apply.yml`, `plan.yml` and `oidc-smoke.yml` hard-code `prod.tfvars.json` and the `prod` environments [VERIFIED release.yml:147-171, apply.yml:163-183], so the platform has its own workflow and the family edition's stay untouched |
| `platform-plan.yml` (new) | Schedule or dispatch | Drift check per environment |

Rules [PROPOSAL; follow CLAUDE.md]:

- A merge into `dev` deploys to sca-dev automatically [CONFIRMED by owner 2026-11-21, PD-22]. Every prod deploy is
  dispatched and approved by the owner.
- **Prod deploys only from `main`**, after `dev`'s one big merge into it; the workflow refuses any other ref for prod.
- Claude does not dispatch or approve prod deploys, even if `gh` is signed in.
- Releases are kept outside school hours where possible ([11](11-privacy-security-and-assurance.md)).

How `platform-release.yml` keeps to those rules [ASSUMPTION, built in PS1]: the environment comes from the event and the
ref only (no inputs); one run at a time per ref; only the plan, apply and smoke jobs can assume the CI role; the
account is checked three times (credentials action, a step, the provider's `allowed_account_ids`); the apply job never
checks out code and applies only the tarball whose SHA-256 the plan job recorded and S3 verified. The repository is
public, so the saved plan stays in the account's bucket, never in a GitHub artifact, and the plan text in the run
summary is public: no secret value may go into the platform root. The day-to-day steps are in the
[platform release runbook](../runbooks/platform-release.md).

---

## 7. What differs between dev and prod

| Setting | Dev | Prod |
|---|---|---|
| Domain | `*.dev.spacecolonydefence.com` | `*.spacecolonydefence.com` |
| Schools | Test schools with made-up data | Real schools and the demo school |
| Stripe | Test mode or a Stripe sandbox; test clocks for renewals ([09](09-billing.md)) | Live mode |
| SES | May stay in the SES sandbox (verified addresses only) | Production access (the owner requests it) |
| AI content tools | Off, or stubbed | On (the owner authors content here, PQ-5) |
| Backups | PITR on, short retention | PITR on, deletion protection, restore drill |
| Alarms | To the owner, low priority | To the owner, school-hours priority |
| Log retention | Short | As in [11](11-privacy-security-and-assurance.md) |

**No real school data ever goes into dev**, not even for debugging (rule R1).

---

## 8. Secrets

Each in Secrets Manager in its own account, read only by the function that needs it. Values are put in by the owner, never
by Claude, never in tfvars, plans or logs (CLAUDE.md).

| Secret | Read by | Notes |
|---|---|---|
| Stripe secret key (restricted key) | `billing` | Test key in dev, live key in prod ([09](09-billing.md)) |
| Stripe webhook signing secret | `billing` | One per endpoint |
| AI vendor keys | The existing content generation functions | As today; Claude never reads them |

Plus a KMS key per account for pupils' sign-in secrets ([04](04-identity-and-access.md)).

---

## 9. Content between environments (PQ-5)

Content (levels, maps, aliens, questions, speech) is product data, not code. [PROPOSAL] It is authored and published in
**prod's** console, as today, with the same draft, preview and publish states. Dev needs realistic content to test with:

- **Export content bundle** (prod console): the published game-data versions, the question bank and speech manifest as
  one file. No school data is in content, so the bundle carries none.
- **Import content bundle** (dev console): loads it into dev.

A pipeline job copying published files between accounts can replace the manual step later.

---

## 10. The demo school (PD-15)

The demo school is a tenant in prod with the slug `demo`. A console action, **Reset demo school**, deletes its data and
recreates the fixtures: classes, made-up pupils, This week settings and several weeks of progress ([12](12-marketing-and-sales.md)).
It is excluded from billing, reports and counts.

---

## 11. User stories

*Snapshot of 2026-11-21. The source of truth for these stories is now Jira (project SCD); see
[README §6](README.md#6-user-stories-and-jira). Edit the tickets, not this table.*

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| ENV-1 | As the owner, I want dev and prod platform accounts in my organisation, so that real schools never share an account with testing | Two accounts exist in an OU with the guardrails in §2; budgets and anomaly alerts reach the owner | Pilot |
| ENV-2 | As the owner, I want each account bootstrapped like the family account, so that GitHub Actions can plan and apply there and nothing else can | `infrastructure/bootstrap` has `platform-dev` and `platform-prod` instances; roles trust only the platform's GitHub environments; a read-only plan role if the module allows (§3); the owner applied both | Pilot |
| ENV-3 | As Claude, I want read-only profiles for both accounts, so that I can check deployed state without being able to change it | Profiles exist; a write call fails with AccessDenied; documented in CLAUDE.md | Pilot |
| ENV-4 | As the owner, I want an `infrastructure/platform` root with dev and prod tfvars, so that the platform is deployed without touching the family edition | `terraform validate` and `plan` pass for both; `infrastructure/main` unchanged | Pilot |
| ENV-5 | As the owner, I want CI on the `schools` branch, so that platform changes are checked like `main` | CI runs on pushes to `schools`; includes the RBAC and tenant-isolation suites | Pilot |
| ENV-6 | As the owner, I want a platform release workflow, so that I deploy dev or prod by dispatch with an approval on prod | Inputs: environment, ref. Prod needs a `platform-v*` tag and the owner's approval. Smoke test runs after apply | Pilot |
| ENV-7 | As the owner, I want a drift check per environment, so that hand changes are noticed | Scheduled plan reports no changes on a clean environment and fails visibly otherwise | Launch |
| ENV-8 | As the owner, I want secret slots created empty, so that I can put in Stripe keys myself | Terraform creates the secrets with no value; functions fail closed with a clear log line if a value is missing | Launch |
| ENV-9 | As the owner, I want to export published content from prod and import it into dev, so that dev tests with real content | Bundle round-trips; dev shows the same maps and questions; the bundle contains no school data | Pilot |
| ENV-10 | As a developer, I want a dev seed command, so that dev has test schools, staff and pupils | Creates two test schools with made-up names; idempotent; refuses to run against prod | Pilot |
| ENV-11 | As the owner, I want alarms and dashboards per environment, so that I know when schools are affected | Alarms for API 5xx, Lambda errors, throttles, sign-in failures and webhook failures; prod alarms reach the owner within minutes | Launch |
| ENV-12 | As the owner, I want backups and a restore drill for the platform tables, so that a mistake can be undone | PITR on every platform table; a drill restores into a new table and is recorded | Launch |
| ENV-13 | As a developer, I want `main` merged into `schools` regularly, so that game fixes reach the platform | A documented routine; merges keep CI green; conflicts in shared files resolved behind the `edition` setting | Pilot |
