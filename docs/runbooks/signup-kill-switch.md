# Runbook: stop new player sign-ups (the kill switch)

When: a flood of sign-ups, abuse, or anything that means no new child accounts should be made for now
([spine S1.2](../plan/00-spine.md)). Existing players are not affected: they keep signing in and playing.

| Control | Where | Effect |
|---|---|---|
| `player_signup_closed` | `infrastructure/envs/prod.tfvars.json` | `true` sets the player pool's `allow_admin_create_user_only`: "I'm new" fails, only you can create accounts |
| `signup_daily_cap` | same file | Self sign-ups allowed per UTC day, counted by the pre-sign-up function (default 20). `0` stops them too, but the closed switch is the clear one |

Both change **only through a release** (never in the console: the next release would put them back).

## Close sign-ups

1. Edit `infrastructure/envs/prod.tfvars.json`: `"player_signup_closed": true`. Commit and push to `main`.
2. Dispatch `release.yml` (leave `reseed_current` unticked). The plan should show one in-place change to the player
   user pool (`allow_admin_create_user_only`). Approve `prod-apply`.
3. Check: on the player site, "I'm new" → managed login refuses sign-up. Signing in with `test-player-1` still works.
4. Note the date and reason in `docs/releases/` (the release's own entry).

## Open them again

Same steps with `false`. If the cause was volume, consider a lower `signup_daily_cap` in the same commit.

## Log

| Date | Closed or opened | Release | Reason |
|---|---|---|---|
| | | | |
