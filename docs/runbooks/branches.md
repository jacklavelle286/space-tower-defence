# Runbook: branches and pull requests

Why: [ADR-0044](../decisions/0044-branches-family-dev-main.md) and
[ADR-0045](../decisions/0045-family-edition-frozen.md) (`family` frozen). Who: Claude or the owner.

| Branch | Holds | Changes arrive by |
|---|---|---|
| `family` | The family edition, `aliens.jackgl.com`: the proof of concept, **frozen** from 2026-11-21 | Nothing: no commits, releases or merges into `dev` |
| `dev` | The schools platform; deploys to sca-dev on every merge | Pull requests only, with the four CI checks passing (repository ruleset) |
| `SCD-<n>-<short-name>` | One Jira story or phase | Commits `SCD-<n> <area>: …`; lives for days, then merges into `dev` |
| `main` | The platform's release branch; untouched until the Pilot release | One pull request from `dev` at each release (Pilot, Launch, Later) |

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
2. **Squash and merge**, keeping the title starting with the key, so `dev` gets one commit per story. Claude may merge
   its own pull requests once CI passes (owner, 2026-11-21); the owner reviews everything before the prod release.
3. Delete the feature branch.
4. The merge deploys to sca-dev through `platform-release.yml` ([runbook](platform-release.md)).

## `family` is frozen

From 2026-11-21 the family edition is the proof of concept and stays as it is
([ADR-0045](../decisions/0045-family-edition-frozen.md)): no commits, no releases and no merges into `dev`. PR #6 was
the last merge from `family`. A bug in code the platform inherited from the family edition is fixed on `dev`, through
an `SCD-<n>` branch like any story. GitHub does not enforce the freeze: the ruleset "Long-lived branches" only stops
deletion and force-pushes.

Changes flow one way: `SCD-<n>-…` → `dev` → `main`.

## Releases to prod

At each release (the Pilot first, then Launch and Later), one pull request from `dev` into `main` (**Create a merge
commit**). The owner then dispatches the platform release on `main` and approves `sca-prod-apply`
([ADR-0055](../decisions/0055-prod-release-per-release.md), ENV-6).
