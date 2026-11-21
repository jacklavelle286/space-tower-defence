# Runbook: branches, pull requests and merging `family` into `dev`

Why: [ADR-0044](../decisions/0044-branches-family-dev-main.md). Jira story: ENV-13 (SCD-67). Who: Claude or the owner.

| Branch | Holds | Changes arrive by |
|---|---|---|
| `family` | The family edition, `aliens.jackgl.com` | Direct commits (`P<nn> <area>: …`); family releases are dispatched here |
| `dev` | The schools platform; deploys to sca-dev on every merge | Pull requests only, with the four CI checks passing (repository ruleset) |
| `SCD-<n>-<short-name>` | One Jira story or phase | Commits `SCD-<n> <area>: …`; lives for days, then merges into `dev` |
| `main` | Untouched until the platform's one big release | One pull request from `dev`, at the big release |

`main`, `family` and `dev` can't be deleted or force-pushed (ruleset "Long-lived branches").

## Starting a story

```sh
git switch dev && git pull --ff-only
git switch -c SCD-<n>-<short-name>          # e.g. SCD-20-sca-bootstrap-files
# work, commit with messages starting "SCD-<n> <area>: "
git push -u origin SCD-<n>-<short-name>
gh pr create --base dev --title "SCD-<n> <summary>" --body "<what, why, checks>"
```

The Jira key in the branch name, the commits and the pull request title is what puts them on the ticket's Development
panel (the GitHub for Atlassian app).

## Merging a story into `dev`

1. CI passes on the pull request: web, repo, scripts, api.
2. **Squash and merge**, keeping the title starting with the key, so `dev` gets one commit per story.
3. Delete the feature branch.
4. The merge deploys to sca-dev once the platform's release workflow exists (ENV-6).

## Merging `family` into `dev` (after a family fix)

`dev` takes pull requests only, so the merge goes through one:

```sh
gh pr create --base dev --head family --title "Merge family into dev" --body "Family fixes: <commits>"
```

1. CI passes on the pull request.
2. **Create a merge commit. Never squash this one**: a squash would make the same family commits conflict again at the
   next merge.
3. If shared files conflict (the player API, the player app), resolve them behind the `edition` setting
   ([docs/platform 02 §5](../platform/02-environments-and-delivery.md#5-code-on-the-dev-branch)) on a short branch from
   `dev`, then open the pull request from that branch instead.

**Never merge `dev` into `family`.** Changes flow one way: `family` → `dev` → `main`.

## The big release

When the platform is ready, one pull request from `dev` into `main` (**Create a merge commit**). The owner then
dispatches the platform release on `main` and approves `sca-prod-apply` (ADR-0044, ENV-6).
