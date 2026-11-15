# Releases

One file per production release: `docs/releases/<release_id>.md`, for example `20261115T0905Z-101f353.md`. The release ID is
`<UTC yyyymmddThhmmZ>-<sha7>`, set by `release.yml`'s `config` job ([H §H.8.2](../plan/H-infrastructure-and-delivery.md#h82-steps)).

## How an entry is made

1. `release.yml` builds and saves a plan. Its summary ends with "dispatch apply.yml with plan_run_id = N". Dispatch
   `apply.yml` only once that run has finished, and dispatch nothing else in the meantime: both share the concurrency group
   `terraform-prod`, and GitHub keeps only one pending run per group, so a newer dispatch silently cancels a waiting one.
2. `apply.yml` applies that plan, publishes, runs the smoke checks and records the release. Its `record` job:
   - writes the final manifest `releases/<release_id>/record.json` in the artefacts bucket (create-only);
   - tags the released commit `release-<release_id>`;
   - updates `releases/latest.json`;
   - prints the entry text in the run summary, under "Commit this as `docs/releases/<release_id>.md`".
3. Claude or the owner copies that text into `docs/releases/<release_id>.md`, fills in "What changed" and commits it on `main`
   as `P<nn> docs: release <release_id>` in the next commit ([H §H.8.2](../plan/H-infrastructure-and-delivery.md#h82-steps)
   step 7). The workflow never pushes commits; its only write to the repository is the tag.

A release that fails before `record` gets no entry and no tag. Its plan can no longer be applied
(`scripts/apply_guard.py`): dispatch `release.yml` again.

## Format

Everything except "What changed" comes from the record, so it matches the artefacts bucket exactly.

```markdown
# Release <release_id>

| Field | Value |
|---|---|
| Release ID | `<release_id>` |
| Commit | `<40-character SHA>` |
| Tag | `release-<release_id>` |
| Build | fresh, or reused from `<release_id>` (rollback) |
| Release run (plan) | [<run id>](https://github.com/<owner>/<repo>/actions/runs/<run id>) |
| Apply run | [<run id>](https://github.com/<owner>/<repo>/actions/runs/<run id>) |
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
| Second (after the alias records exist) | Smoke green on both hostnames too. From then on `releases/latest.json` has `hostnamesLive: true` and every later release requires the hostnames. Dispatching `apply.yml` again with the first plan's run ID is then refused (stale plan), which is the last Phase 4 exit check |
