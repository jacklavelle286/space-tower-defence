# 0044. Branches: `family` for the family edition, `dev` for the schools platform, `main` for its release
Status: Proposed · Date: 2026-11-21

Context: the family edition at `aliens.jackgl.com` is ready to play and stays for the owner's children. The schools
platform ([docs/platform](../platform/README.md) on the platform branch) will be built over a long period, in two new
AWS accounts the owner is creating and bootstrapping, `sca-dev` and `sca-prod`, with Jira project SCD as the source of
truth for its stories. Until now everything lived on `main`, and the family edition's `release.yml`, `apply.yml` and
`plan.yml`, and the GitHub environment `prod-apply` ([0019](0019-single-release-run-with-approval.md)), accepted only
`main`. The owner, 2026-11-21: "main is ready to play on but we should have a branch called family - which is the
current main - then we'll ideally need to have feature branches for each epic, then we merge in dev (everything will stay
on dev until we do one big release to prod at the end)". Chosen the same day: rename the platform branch `schools` to
`dev`; short-lived feature branches per story or phase; deploy to sca-dev automatically on merge to `dev`; move the family
edition to `family` now.

Decision: four kinds of branch.
- **`family`**: the family edition, cut from `main` at 292f4bc. Its release, apply and plan workflows refuse any other
  branch; the owner changes `prod-apply`'s deployment branch from `main` to `family`. Family fixes land on `family` and
  are merged one way into `dev`.
- **`dev`**: the platform's integration branch (renamed from `schools`). Work happens on short-lived feature branches
  named after the Jira ticket, `SCD-<n>-<short-name>`, merged into `dev` by pull request once CI passes. Each merge
  deploys to sca-dev automatically through the platform's own workflow (when built); GitHub environment `sca-dev` is
  limited to `dev`.
- **`main`**: untouched until the platform's one big release. Then `dev` merges into `main`, and the owner dispatches the
  platform release to sca-prod. GitHub environments `sca-prod` and `sca-prod-apply` are limited to `main`, with the owner
  the required reviewer on `sca-prod-apply`.
- CI runs on pushes to `main`, `family` and `dev`, and on pull requests into them.

Alternatives: keep the family edition on `main` and the platform on one long-lived branch (the old `schools` plan; it
leaves `main` holding two meanings at the big release); a long-lived branch per epic (epics are layers and build phases
cut across them, so epic branches would keep touching the same files); dispatch every dev deploy by hand (slower
testing; kept for prod).

Consequences: amends 0019 (the family edition releases only from `family`; the deployment-branch rule is changed by the
owner in GitHub) and CLAUDE.md's Git and dispatch rules. A merge into `dev` deploying to sca-dev is the one exception to
"the owner dispatches every deploying workflow"; prod keeps the owner's dispatch and approval. The owner, 2026-11-21:
Claude may merge its own pull requests into `dev` once CI passes; the owner reviews everything before the prod release. The platform scope's "prod deploys only from a tag on the platform branch" (docs/platform 02 §6) is replaced by
"prod deploys from `main` after the big release".
