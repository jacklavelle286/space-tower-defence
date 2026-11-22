# 0050. The platform has its own Terraform root, `infrastructure/platform`
Status: Proposed · Date: 2026-11-22

Context: the platform runs in two new accounts, `sca-dev` and `sca-prod` [CONFIRMED by owner 2026-11-21, PD-3, PD-21],
with the same architecture as the family edition (PD-4). The family edition's root, `infrastructure/main`, encodes that
edition: one distribution, self sign-up, birthday-based profiles. Changing it for the platform would put conditionals
into a working production stack, and the family edition is now frozen ([0045](0045-family-edition-frozen.md)). PQ-4
proposed a separate root; PS1 built it ([02 §4](../platform/02-environments-and-delivery.md#4-terraform), ENV-4).

Decision: the platform's infrastructure lives in one root, `infrastructure/platform`, and nowhere else.
- State: `platform/terraform.tfstate` in each account's state bucket (made by the owner's bootstrap), with S3 locking.
- Guards: `allowed_account_ids` refuses any account but the env file's, and the `environment` variable accepts only
  `sca-dev` and `sca-prod`. Everything is tagged `edition = platform`.
- Variables: `infrastructure/envs/sca-dev.tfvars.json` and `sca-prod.tfvars.json`, beside the shared
  `common.auto.tfvars.json` (Terraform 1.17.2 exact, region).
- Providers: the same constraints and the same lock entry as `infrastructure/main`.
- It reuses the existing modules (static site, HTTP API, Lambda function, DynamoDB table, alarms) and adds new ones as
  phases need them: `school_edge`, `cognito_staff_pool`, `cognito_pupil_pool`, `ses_domain`, `dns_records` and
  `secrets` ([02 §4](../platform/02-environments-and-delivery.md#4-terraform)).
- Only [`platform-release.yml`](../../.github/workflows/platform-release.yml) applies it, and only a plan it saved
  ([02 §6](../platform/02-environments-and-delivery.md#6-pipelines)).

Alternatives: build the platform inside `infrastructure/main` behind an edition flag (conditionals in a live stack, and
the family edition is frozen); one root per layer (more state files and wiring between roots, with no need yet);
a separate repository (loses the shared modules, CI and checks).

Consequences: the two editions share no state, so a platform apply cannot touch the family edition. The family edition
deploys from `family`, which keeps its own copy of the modules, so module changes on `dev` never reach it either. Each
new module comes with offline `terraform test` runs, as the root's own six do; CI tests the root on every pull request.
Open: if the root grows too large to plan quickly, splitting it is a new ADR.

Evidence: PS1 gate ([13 §8](../platform/13-delivery-plan.md#8-gate-log)); `terraform validate`, `terraform test` (6
offline runs) and a read-only plan for each account, 2 to add, on 2026-11-21; the first platform-release run on `dev`
planned the same 2 resources and applied its saved plan; PQ-4
([README §3.2](../platform/README.md#32-proposed-for-the-owner-to-confirm)).
