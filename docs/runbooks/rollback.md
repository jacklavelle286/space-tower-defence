# Runbook: roll back

Three different things can be rolled back. Pick by what went wrong.

| What went wrong | Roll back | How |
|---|---|---|
| A release broke the site or the API (code, infrastructure) | **The release** | Re-publish an earlier release's archived build (below, A) |
| A level or campaign version published from the admin portal plays badly | **That planet's live version** | Admin → Levels → Versions → **Make live** on the version before (B) |
| A made alien (AM1) causes trouble | **The ruleset pointer** | Not in the portal: a release with `reseed_current` (C) |

Saved games are never affected by any of these: a run keeps the ruleset, planet document and asset manifest it
started with ([spine S5.1](../plan/00-spine.md)). Only new games change.

## A. Re-publish an earlier release (H.12)

1. Find the release ID to go back to in `docs/releases/` (e.g. `20261117T1725Z-51b23b2`). It must be from Gate M LD6
   on (seven Lambda zips) for current Terraform to accept it.
2. Dispatch `release.yml` with **`artefacts_from` = that release ID** (and `reseed_current` unticked: a rollback
   never reseeds; the run refuses both). Nothing is rebuilt: the archived static archives and Lambda zips are
   reused, each checked by SHA-256.
3. Read the plan: Lambda code back to that release's zips; no destroys (the plan guard stops one anyway). Approve
   `prod-apply`.
4. Check the smoke job is green and the site works; record the rollback in `docs/releases/`.
5. Fix forward in a new commit; the next normal release replaces the rolled-back build.

G-8 checks that every game-data file the archived build re-publishes is byte-identical to the same path on `main`
(only additions since): published versions never change, so this always holds while the lock holds.

## B. A planet's live version (admin portal, LD7)

Levels → **Versions**: each planet's live version is marked. **Make live** on the version you want back moves
`current.json` for that planet only; new games use it within about a minute (the API's cache). Retire or mark
invalid the bad version's wave sets if they must not be chosen again (same page). Nothing is deleted.

## C. The ruleset (a made alien)

The portal publishes rulesets forward only (ADR-0041); there is no ruleset Make live. To point new games back at the
repository's ruleset and campaign: dispatch `release.yml` with **`reseed_current` ticked**. This overwrites
`game-data/current.json` with the repository's (`r4` + `luna-1-c2`): every portal publish (levels, planets, aliens)
stops reaching new games until published again. Use it only when the alternative is worse.

## Log

| Date | Kind (A, B, C) | From → to | Why |
|---|---|---|---|
| | | | |
