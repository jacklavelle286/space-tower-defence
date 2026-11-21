# 0045. The family edition is frozen as the proof of concept
Status: Proposed · Date: 2026-11-21

Context: [0044](0044-branches-family-dev-main.md) kept the family edition on `family` and merged its fixes one way into
`dev`, so that the platform, built from the same code, would get them too. PR #6 made the first such merge (the level
editor's Ctrl+S fix). The owner, the same day: "family will remain untouched and not recieve any extra updates as the
dev and prod platform for sca is going to be entirely different and my kids are happy with their family version -
essentially we can see it as the POC".

Decision: the family edition is the proof of concept, frozen at `family` 30c12bf.
- No more commits to `family`, no family releases (`release.yml`, `apply.yml`) and no merges from `family` into `dev`.
  PR #6 was the last.
- `aliens.jackgl.com`, its AWS account and `infrastructure/main` stay as they are.
- The platform on `dev` changes the code it inherited as it needs to. A bug in that code is fixed on `dev`, through an
  `SCD-<n>` branch, and not on `family`.

Alternatives: keep merging family fixes into `dev`, as 0044 planned (pointless once the family edition stops changing
and the platform becomes entirely different); fix bugs in both editions (twice the work, for an edition the children are
happy with).

Consequences: amends 0044 ("family fixes land on `family` and are merged one way into `dev`") and CLAUDE.md's `family`
rules. Jira story ENV-13 (SCD-67, regular family merges) is superseded. The `edition` setting that was to keep shared
files in step ([docs/platform 02 §5](../platform/02-environments-and-delivery.md#5-code-on-the-dev-branch)) is no
longer needed, and `dev` drifting from `family` is expected ([13 §6](../platform/13-delivery-plan.md#6-risks), risk
12). The ruleset "Long-lived branches" stops `family` being deleted or force-pushed, but not pushed to, so the freeze is
a working rule, not one GitHub enforces; adding "Restrict updates" to that ruleset would enforce it (the owner's
choice). The editor fix 30c12bf is on `family` but was never released. Reopening `family` is the owner's call and a new
ADR.

Evidence: the owner's message above (2026-11-21); PR #6, the last merge from `family`; the repository's rulesets, read
with `gh api repos/{owner}/{repo}/rulesets` on 2026-11-21 (rules: deletion and non-fast-forward only).
