# 02. Environments and delivery

Part of the [platform scope](README.md). Status: scope, parked.

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
| **Platform dev** | Development and testing; made-up data only | New; the owner creates it |
| **Platform prod** | Real schools, the demo school, the owner's console and content | New; the owner creates it |

Account names are the owner's choice [ASSUMPTION: e.g. `scd-platform-dev`, `scd-platform-prod`].

**Guardrails** for an OU holding both accounts [PROPOSAL; the owner knows the org's existing SCPs]:

- Regions limited to `eu-west-2` plus the global services that need `us-east-1` (CloudFront certificates, Cognito
  custom domain certificates).
- No leaving the organisation; CloudTrail and Config not removable.
- IAM Identity Center permission sets per account: the owner's admin set, and a **read-only set** for local checks.
  Claude uses only the read-only profiles (new CLI profiles, e.g. `scd-dev-readonly` and `scd-prod-readonly`).
- An AWS Budget and cost anomaly detection on each account, alerting the owner.

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

[PROPOSAL; an ADR records it] The existing bootstrap root gains one instance per new account: `envs/platform-dev` and
`envs/platform-prod` tfvars and their own state. That is **more instances of the same root, not a replacement
bootstrap**, so it keeps to [H §H.5](../plan/H-infrastructure-and-delivery.md#h5-bootstrap-changes-you-make-no-replacement-bootstrap).
The owner applies each one; Claude edits and reviews the plan output.

The roles trust GitHub's OIDC token only for this repository and only from a named GitHub environment:

| Role | Trusted subject [PROPOSAL] |
|---|---|
| dev plan | `repo:<owner>/space-tower-defence:environment:platform-dev-plan` |
| dev apply | `…:environment:platform-dev-apply` |
| prod plan | `…:environment:platform-prod-plan` |
| prod apply | `…:environment:platform-prod-apply` (required reviewer: the owner) |

---

## 4. Terraform

[PROPOSAL] A new root, **`infrastructure/platform/`**, built from the existing modules (static site, HTTP API, Lambda
function, DynamoDB table, alarms) and some new ones:

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
| `infrastructure/envs/platform-dev.tfvars.json` | Account ID, domain `dev.spacecolonydefence.com`, Stripe mode `test`, small log retention, budgets |
| `infrastructure/envs/platform-prod.tfvars.json` | Account ID, domain `spacecolonydefence.com`, Stripe mode `live`, alarms, backups |
| `infrastructure/envs/common.auto.tfvars.json` | Shared (Terraform 1.17.2 exact, region) |

---

## 5. Code on the `schools` branch

| Path | Change |
|---|---|
| `web/game-core`, `web/shared` | Shared with the family edition. Changes are additive (e.g. year-group content choice) |
| `web/player` | Becomes school-aware: sign-in by class code or QR, This week, school branding ([07](07-pupil-experience.md)) |
| `web/admin` | Becomes the **console**: today's content tools plus Schools, Plans, Billing, Support ([05](05-platform-console.md)) |
| **`web/portal`** (new) | The **staff portal** SPA served at `/staff` ([06](06-school-portal.md)). A separate bundle keeps pupils' pages small and free of staff code |
| `api/functions/player_api` | School-aware ([10](10-data-and-api.md)) |
| **New functions** | `school_api`, `platform_api`, `pupil_auth`, `auth_triggers`, `billing` ([10 §4](10-data-and-api.md#4-lambda-functions-and-their-permissions)) |
| `infrastructure/platform` | New root (section 4) |

**Keeping the branch healthy** [PROPOSAL]: merge `main` into `schools` regularly so game and content fixes flow one way.
Platform code stays additive where it can; where a shared file must differ (the player API, the player app), it reads
an `edition` setting (`family` or `schools`). Whether the family edition eventually becomes a tenant of the platform, or
both editions stay on one branch, is decided after the platform launches ([13](13-delivery-plan.md#5-decisions-still-open)).

---

## 6. Pipelines

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | Push to `main` **and `schools`** | Today's checks plus platform tests (RBAC matrix, tenant isolation, billing webhooks) [PROPOSAL; today CI runs on `main` only, VERIFIED `.github/workflows/ci.yml`] |
| **`platform-release.yml`** (new) | Manual dispatch by the owner; inputs `environment` (dev or prod) and `ref` | Plan → (prod: the owner approves `platform-prod-apply`) → apply → publish the web apps and game data → smoke test. Today's `release.yml`, `apply.yml`, `plan.yml` and `oidc-smoke.yml` hard-code `prod.tfvars.json` and the `prod` environments [VERIFIED release.yml:147-171, apply.yml:163-183], so the platform gets its own parameterised workflows and the family edition's stay untouched |
| `platform-plan.yml` (new) | Schedule or dispatch | Drift check per environment |

Rules [PROPOSAL; follow CLAUDE.md]:

- The owner dispatches every deploying run, dev included. Auto-deploy to dev on each push is possible later if the owner
  wants it.
- **Prod deploys only from a tag** `platform-v<major>.<minor>.<patch>` on `schools` (later on `main`). The workflow
  refuses any other ref for prod.
- Claude does not dispatch or approve any of them, even if `gh` is signed in.
- Releases are kept outside school hours where possible ([11](11-privacy-security-and-assurance.md)).

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
