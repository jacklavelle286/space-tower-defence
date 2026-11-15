# Releases

One file per production release: `docs/releases/<release_id>.md`, for example `20261115T0905Z-101f353.md`. The release ID is
`<UTC yyyymmddThhmmZ>-<sha7>`, set by `release.yml`'s `config` job ([H §H.8.2](../plan/H-infrastructure-and-delivery.md#h82-steps)).

## How an entry is made

One dispatch, one approval ([ADR-0019](../decisions/0019-single-release-run-with-approval.md)):

1. Dispatch `release.yml` on `main` (`ref=main`). It runs checks, builds, uploads and saves a plan. Its summary ends with
   "Next: waiting for approval in this run (environment prod-apply)", and the run shows **Review deployments**.
2. Read the plan in the summary, then **Review deployments** → tick `prod-apply` → **Approve and deploy**. To stop, reject: the
   run fails at `deploy / apply` with nothing applied.
   While a run waits, dispatch nothing else in the concurrency group `terraform-prod` (`release.yml`, `apply.yml`): a new
   dispatch waits behind it, and GitHub keeps only one pending run per group, so a newer dispatch silently cancels an older
   waiting one. Approve or reject first.
3. After approval the same run's `deploy` job (the called `apply.yml`) applies that plan, publishes, runs the smoke checks and
   records the release. Its `record` job:
   - writes the final manifest `releases/<release_id>/record.json` in the artefacts bucket (create-only);
   - tags the released commit `release-<release_id>`;
   - updates `releases/latest.json`;
   - prints the entry text in the run summary, under "Commit this as `docs/releases/<release_id>.md`".
4. Claude or the owner copies that text into `docs/releases/<release_id>.md`, fills in "What changed" and commits it on `main`
   as `P<nn> docs: release <release_id>` in the next commit ([H §H.8.2](../plan/H-infrastructure-and-delivery.md#h82-steps)
   step 7). The workflow never pushes commits; its only write to the repository is the tag.

A release that fails before `record` gets no entry and no tag. If it failed after the apply started, its plan can no longer be
applied (`scripts/apply_guard.py`): dispatch `release.yml` again. If the approval was rejected (nothing applied), either use
"Re-run failed jobs" on that run (it asks for approval again, and the guard still refuses the plan if another apply ran since)
or dispatch `release.yml` again. If the run was cancelled or the approval timed out, nothing was applied; dispatch `release.yml`
again.

`apply.yml` can still be dispatched by hand with `plan_run_id` = a finished, successful `release.yml` run, but this is a fallback
that is not expected to succeed: a successful one-run release has already applied its own plan (the stale-plan guard refuses it),
and a rejected, cancelled or timed-out run did not succeed (the `config` check refuses it). Roll back through `release.yml`'s
`artefacts_from`; recover a rejected approval with "Re-run failed jobs".

## Format

Everything except "What changed" comes from the record, so it matches the artefacts bucket exactly. A release applied by a
separate `apply.yml` dispatch (before ADR-0019, or a hand dispatch) has two rows instead of the one run row: "Release run
(plan)" and "Apply run".

```markdown
# Release <release_id>

| Field | Value |
|---|---|
| Release ID | `<release_id>` |
| Commit | `<40-character SHA>` |
| Tag | `release-<release_id>` |
| Build | fresh, or reused from `<release_id>` (rollback) |
| Release run (plan, approval, apply) | [<run id>](https://github.com/<owner>/<repo>/actions/runs/<run id>) |
| Plan | <n> to add, <n> to change, <n> to delete; Terraform <version> |
| Smoke | green on both *.cloudfront.net names and both hostnames (or: hostnames skipped, DNS not live) |
| Finished | <UTC time> |
| Previous release | `<release_id>` or none |
| Record | `releases/<release_id>/record.json` in the artefacts bucket |

## What changed

- One line per change since the previous release, e.g. "P04: walking skeleton: both app shells live".
```

Keep entries short. Anything that went wrong goes in "What changed" with a link to the run. Do not put e-mail addresses or
other personal data in an entry.

## The first releases (Phase 4)

| Release | What it proves |
|---|---|
| First (a new `release.yml` run on the Phase 4 commit) | The 18 resources exist; both sites pass the smoke checks on their `*.cloudfront.net` names. Hostnames are reported "skipped: DNS not live" because the alias records come after this apply ([runbook](../runbooks/dns-hand-off.md#phase-4-alias-records-records-3-and-4)) |
| Second (after the alias records exist; the first one-run release with approval, ADR-0019) | Smoke green on both hostnames too. From then on `releases/latest.json` has `hostnamesLive: true` and every later release requires the hostnames. Dispatching `apply.yml` again with the first plan's run ID (43700031098) and approving is then refused at the stale-plan guard, which is the last Phase 4 exit check |
