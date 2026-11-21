# Platform release (sca-dev and sca-prod)

How the schools platform deploys: [`platform-release.yml`](../../.github/workflows/platform-release.yml) (ENV-6,
[ADR-0044](../decisions/0044-branches-family-dev-main.md),
[docs/platform 02 §6](../platform/02-environments-and-delivery.md#6-pipelines)). The family edition's release is separate
and unchanged (`release.yml`, [rollback](rollback.md)).

Each run: config → checks → plan → apply → smoke. The plan is saved create-only in the account's artefacts bucket
(`plans/<run_id>/`, kept 30 days), and the apply applies exactly that plan. A plan with no changes skips the apply.

## Dev: every merge into `dev`

A merge into `dev` starts a run on the merge commit, in GitHub environment `sca-dev`, with no approval. There is nothing
to do unless it fails:

| What failed | What to do |
|---|---|
| The apply says `Saved plan is stale` | Another run changed the state first. Actions → platform-release → Run workflow → branch `dev`. |
| "Re-run failed jobs" on the plan stops at the upload (412, create-only) | A saved plan is never overwritten. Run workflow on `dev` instead of re-running. |
| A check or the plan fails | Fix it on an `SCD-<n>-…` branch and merge; the merge deploys. |

## Prod: one dispatch on `main`, one approval (the owner)

Only after `dev` has been merged into `main` for the big release ([branches runbook](branches.md)).

1. Actions → platform-release → Run workflow → branch `main`.
2. Read the plan in the run summary (the plan job runs in environment `sca-prod`).
3. **Review deployments** → `sca-prod-apply`: approve to apply exactly that plan, or reject to stop with nothing changed.
4. The smoke job checks the result; its summary is at the end of the run.

Claude never dispatches or approves a prod release (CLAUDE.md). Any other branch or event is refused by the config
job.

## The alerts email

The first apply in each account subscribes the owner's address to `space-tower-defence-<env>-alerts`. AWS sends an
"AWS Notification - Subscription Confirmation" email: click the link, or no alert ever arrives. The smoke summary of
each run says whether the subscription is confirmed.
