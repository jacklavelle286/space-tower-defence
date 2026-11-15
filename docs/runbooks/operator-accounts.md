# Runbook: operator and test accounts

Cognito users and `admin` group membership are yours, not Terraform's
([H §H.9.1](../plan/H-infrastructure-and-delivery.md#h91-one-owner-per-artefact)): the pipeline creates the two pools, their
domains, clients and the `admin` group, and you create the people in them with the calls below. These are the Phase 8 rows of
[Local AWS writes that are not deployments](../build-phases.md#local-aws-writes-that-are-not-deployments). J task M1-05; test
accounts per [I §I.2.10](../plan/I-validation.md#i210-test-accounts-and-test-data).

Run this after the Phase 8b release (both pools) has been applied. The commands assume **bash** (`read -s -p`,
`set +o history`); in zsh, start `bash` first.

Calls used here beyond the confirmed Phase 8 row (`admin-create-user`, `admin-delete-user`): `admin-add-user-to-group` and
`admin-set-user-password` (sections 1 and 3) are added to that row for your approval at the Phase 8 gate; the recovery and
disable calls in sections 5 and 6 are a separate **[PROPOSAL]** row. Until you approve them, they are **not approved yet**.

## Where things are

| What | Value | Label |
|---|---|---|
| Account, profile, region | `263185198757`, `--profile space-tower-defence`, `eu-west-2` | **[VERIFIED]** env files |
| Player pool | `space-tower-defence-prod-players`; self sign-up through managed login, auto-confirmed by `cognito-presignup` within the daily cap; no e-mail or phone; MFA off | **[PROPOSAL]** [E §E.7.1](../plan/E-architecture.md#e71-design-summary), ADR-0012 |
| Operator pool | `space-tower-defence-prod-operators`; `AdminCreateUser` only; TOTP MFA required; group `admin`; no e-mail or phone | **[PROPOSAL]** E §E.7.1 |
| Managed-login domains | `https://scd-aliens-play.auth.eu-west-2.amazoncognito.com` (players), `https://scd-aliens-admin.auth.eu-west-2.amazoncognito.com` (operators) | **[VERIFIED]** prod env file |
| App clients | `space-tower-defence-prod-player` (callback `https://aliens.jackgl.com/auth/callback`), `space-tower-defence-prod-admin` (callback `https://admin.aliens.jackgl.com/auth/callback`); public, no secret | **[PROPOSAL]** [H §H.4.5](../plan/H-infrastructure-and-delivery.md#h45-cognito_pool-called-twice) |
| Password recovery | None self-service (account recovery `admin_only`, no "Forgot your password?" link): you reset passwords here | **[CONFIRMED]** E §E.7.1; link absent **[VERIFIED]** ADR-0012 check 3 |

## Rules

- **Passwords never appear in git, chat, a ticket, a command line or shell history.** Every password below is typed at a
  hidden `read -rs` prompt into a shell variable and unset afterwards. Keep them in your password manager.
  The value is still an argument of the one `aws` process while it runs (visible to `ps` on your own laptop for a second);
  that is accepted for a single-user machine **[ASSUMPTION]**.
- **No real children's names** in usernames, here or anywhere: usernames are visible to you in the console and in logs.
  Your children's own accounts are made by them (with you) through the sign-up page in the game, not with this runbook.
- Usernames are case-insensitive and stored in lower case (ADR-0012 check 2). Use lower case here.
- Never change a pool, client or group in the console: Cognito update APIs reset unspecified settings, so the pools change
  only through a release ([H §H.4.5](../plan/H-infrastructure-and-delivery.md#h45-cognito_pool-called-twice)). Users and group
  membership are the only things you change by hand.
- Sign in to managed login in a **private window** per account, and close it afterwards: the one-hour managed-login cookie
  would otherwise sign the next account in as the previous one ([E §E.7.4](../plan/E-architecture.md#e74-sign-out-shared-laptop-switching-and-one-page-load--one-account)).

## 0. Session set-up and the IDs (read-only)

```sh
export AWS_PROFILE=space-tower-defence AWS_REGION=eu-west-2
set +o history   # belt and braces: nothing below enters the history file; `set -o history` at the end

pool_id() { aws cognito-idp list-user-pools --max-results 60 --query "UserPools[?Name=='$1'].Id" --output text; }
PLAYER_POOL_ID=$(pool_id space-tower-defence-prod-players)
OPERATOR_POOL_ID=$(pool_id space-tower-defence-prod-operators)

client_id() { aws cognito-idp list-user-pool-clients --user-pool-id "$1" --query "UserPoolClients[?ClientName=='$2'].ClientId" --output text; }
PLAYER_CLIENT_ID=$(client_id "$PLAYER_POOL_ID" space-tower-defence-prod-player)
OPERATOR_CLIENT_ID=$(client_id "$OPERATOR_POOL_ID" space-tower-defence-prod-admin)

echo "players $PLAYER_POOL_ID / $PLAYER_CLIENT_ID; operators $OPERATOR_POOL_ID / $OPERATOR_CLIENT_ID"
```

Each value must be a single ID (`eu-west-2_…` for pools). The same IDs are in the Terraform outputs `player_config` and
`admin_config` (`terraform output -json` in an initialised local copy of `infrastructure/main`, read-only), and from Phase 9 in
each site's `/config.json`.

Two sign-in links you will use (the `code` they return to the site is not used and expires after five minutes):

```sh
OPERATOR_LOGIN="https://scd-aliens-admin.auth.eu-west-2.amazoncognito.com/oauth2/authorize?client_id=$OPERATOR_CLIENT_ID&response_type=code&scope=openid+ops%2Fcontent&redirect_uri=https%3A%2F%2Fadmin.aliens.jackgl.com%2Fauth%2Fcallback"
PLAYER_LOGIN="https://scd-aliens-play.auth.eu-west-2.amazoncognito.com/oauth2/authorize?client_id=$PLAYER_CLIENT_ID&response_type=code&scope=openid+game%2Fplay&redirect_uri=https%3A%2F%2Faliens.jackgl.com%2Fauth%2Fcallback"
echo "$OPERATOR_LOGIN"; echo "$PLAYER_LOGIN"
```

## 1. Your operator account

1. Choose a username (not your real name is better; it is not written down in this repository). Create the user with a
   one-time temporary password and **no message** (the pool has no e-mail to send to):

   ```sh
   read -r -p "Operator username: " OP_USER
   IFS= read -rs -p "Temporary password (12+ chars, upper, lower, digit, symbol): " TEMP_PW; echo
   aws cognito-idp admin-create-user --user-pool-id "$OPERATOR_POOL_ID" --username "$OP_USER" \
     --temporary-password "$TEMP_PW" --message-action SUPPRESS \
     --query 'User.{username: Username, status: UserStatus}'
   unset TEMP_PW
   aws cognito-idp admin-add-user-to-group --user-pool-id "$OPERATOR_POOL_ID" --username "$OP_USER" --group-name admin
   ```

   Expect `FORCE_CHANGE_PASSWORD`. The temporary password is valid for 7 days.
2. Open `$OPERATOR_LOGIN` in a private window. Sign in with the temporary password. Managed login asks for a **new password**,
   then shows a **QR code for TOTP**: scan it with your authenticator app and enter the six-digit code. You land on
   `https://admin.aliens.jackgl.com/auth/callback?code=…`. **[UNVERIFIED]** in this account: the spike deferred the operator
   run (ADR-0012 check 12); write down what the pages actually showed for the Phase 8 gate.
3. Check (read-only):

   ```sh
   aws cognito-idp admin-get-user --user-pool-id "$OPERATOR_POOL_ID" --username "$OP_USER" \
     --query '{status: UserStatus, mfa: UserMFASettingList, preferred: PreferredMfaSetting, enabled: Enabled}'
   aws cognito-idp admin-list-groups-for-user --user-pool-id "$OPERATOR_POOL_ID" --username "$OP_USER" \
     --query 'Groups[].GroupName'
   ```

   Pass: `CONFIRMED`, `["SOFTWARE_TOKEN_MFA"]`, `SOFTWARE_TOKEN_MFA`, `true`; groups `["admin"]`.
4. Sign out at `https://scd-aliens-admin.auth.eu-west-2.amazoncognito.com/logout?client_id=$OPERATOR_CLIENT_ID&logout_uri=https%3A%2F%2Fadmin.aliens.jackgl.com%2F`
   and sign in again: it must ask for the password **and** a TOTP code (Phase 8 exit criterion "the operator signs in with TOTP").

## 2. `test-operator` (operator pool, **not** in `admin`)

Used by the API tests for the 403 checks: a real operator-pool token that is not an operator
([I §I.2.10](../plan/I-validation.md#i210-test-accounts-and-test-data)).

```sh
IFS= read -rs -p "test-operator temporary password: " TEMP_PW; echo
aws cognito-idp admin-create-user --user-pool-id "$OPERATOR_POOL_ID" --username test-operator \
  --temporary-password "$TEMP_PW" --message-action SUPPRESS --query 'User.UserStatus'
unset TEMP_PW
```

Then sign in once through `$OPERATOR_LOGIN` (private window): new password and TOTP enrolment, as in step 1.2. Keep its
authenticator entry separate from yours. **Do not** add it to `admin`; check with `admin-list-groups-for-user` (expect `[]`).

## 3. `test-player-1` and `test-player-2` (player pool)

`AdminCreateUser` accounts do not count against the daily sign-up cap: the trigger passes `PreSignUp_AdminCreateUser`
through uncounted. No temporary password is needed: the permanent one is set straight away, so the user goes to `CONFIRMED`
without a forced change.

```sh
for u in test-player-1 test-player-2; do
  aws cognito-idp admin-create-user --user-pool-id "$PLAYER_POOL_ID" --username "$u" --message-action SUPPRESS \
    --query 'User.UserStatus'
  IFS= read -rs -p "$u password (8+ chars, lower case): " PW; echo
  aws cognito-idp admin-set-user-password --user-pool-id "$PLAYER_POOL_ID" --username "$u" --password "$PW" --permanent
  unset PW
  aws cognito-idp admin-get-user --user-pool-id "$PLAYER_POOL_ID" --username "$u" --query UserStatus
done
```

Pass: each ends `CONFIRMED`. Sign in once with each through `$PLAYER_LOGIN` (private window); no password change is asked
**[UNVERIFIED]** (register U-059, ADR-0012 "not in this spike"). Profile data (nickname, test date of birth per age band) is
set later in the game itself, from Phase 21, never as a Cognito attribute.

`test-player-1` becomes the canary account (I §I.2.10) once runs exist.

## 4. Self sign-up of one test child, then delete it

This is the Phase 8 exit check "a test child signs up and signs in through managed login" (AC-01 part 1).

1. Open `$PLAYER_LOGIN` in a private window and choose **Sign up**. Username `test-signup-<yyyymmdd>` (today's **UTC** date,
   the same as `date -u +%Y%m%d`; never a child's name), any password you will not reuse. Expect no e-mail or code step and a redirect to
   `https://aliens.jackgl.com/auth/callback?code=…` (ADR-0012 check 1).
2. Check (read-only):

   ```sh
   read -r -p "Username you signed up with (test-signup-<yyyymmdd>): " SIGNUP_USER
   aws cognito-idp admin-get-user --user-pool-id "$PLAYER_POOL_ID" --username "$SIGNUP_USER" --query '{status: UserStatus, attributes: UserAttributes[].Name}'
   aws dynamodb get-item --table-name space-tower-defence-prod-game \
     --key "{\"pk\":{\"S\":\"SYS#SIGNUPS\"},\"sk\":{\"S\":\"$(date -u +%F)\"}}" --query 'Item.count'
   ```

   Pass: `CONFIRMED`, attributes only `sub` (no `email`, no `phone_number`); today's sign-up `count` is at least 1.
3. Sign out (`/logout` on the player domain, as in step 1.4 with the player client and `https://aliens.jackgl.com/`), sign in
   again with the same username: it must ask for the password.
4. Delete it (I §I.2.10: self-signed-up test users never stay):

   ```sh
   aws cognito-idp admin-delete-user --user-pool-id "$PLAYER_POOL_ID" --username "$SIGNUP_USER"
   ```

   The counter item is not touched: it expires on its own (`ttl`) and it only limits sign-ups for that day.

## 5. Recovery

| Situation | What you do | Label |
|---|---|---|
| A child (or a test player) forgot their password | `IFS= read -rs -p "New password: " PW; echo; aws cognito-idp admin-set-user-password --user-pool-id "$PLAYER_POOL_ID" --username <username> --password "$PW" --permanent; unset PW`. Tell the child the new password in person. The AC-02 drill does this on `test-player-2`: the new password works, the old one fails | **[CONFIRMED]** admin-managed recovery, E §E.7.1 |
| You forgot your operator password | Same call on the operator pool with a **temporary** password instead (`--no-permanent`), then sign in through managed login and set a new one; TOTP is still required | **[PROPOSAL]** |
| You lost your authenticator (TOTP) | `aws cognito-idp admin-set-user-mfa-preference --user-pool-id "$OPERATOR_POOL_ID" --username <operator username> --software-token-mfa-settings Enabled=false,PreferredMfa=false`, then sign in: because MFA is required on the pool, managed login should ask you to enrol a new authenticator. **[UNVERIFIED]**: check it on `test-operator` first. If it does not work, delete and recreate the user (section 1); a new user has a new `sub`, so audit lines from before name the old one | **[UNVERIFIED]** |
| Someone should be signed out everywhere now (lost device, shared laptop) | `aws cognito-idp admin-user-global-sign-out --user-pool-id <pool> --username <username>`: refresh tokens stop working; access tokens already issued stay valid until they expire (at most 60 minutes) | **[PROPOSAL]**; access-token behaviour **[UNVERIFIED]** (U-031) |

## 6. Disable or delete

| Goal | Call | Effect |
|---|---|---|
| Stop an account temporarily | `aws cognito-idp admin-disable-user --user-pool-id <pool> --username <username>`, then `admin-user-global-sign-out` | Cannot sign in or refresh; reversible with `admin-enable-user`. Player data in `game` is untouched |
| Remove operator rights, keep the account | `aws cognito-idp admin-remove-user-from-group --user-pool-id "$OPERATOR_POOL_ID" --username <username> --group-name admin` | New tokens lack `admin`; current access tokens keep it until they expire (60 minutes) |
| Delete an account | `aws cognito-idp admin-delete-user --user-pool-id <pool> --username <username>` | Irreversible. The user's `sub` is gone; their `game` items stay (keyed by the old `sub`) until a whole-profile reset or the F-8 clean-up removes them. Never delete a child's account to "reset" it: use the in-game reset (Phase 55) |

Finish the session:

```sh
unset OP_USER SIGNUP_USER PLAYER_LOGIN OPERATOR_LOGIN
set -o history
```

## Checks to record for the Phase 8 gate

ADR-0012 deferred these to Phase 8 (M1-05) or later. Write down what you saw while running sections 1 to 4; the gate summary
records each one as settled or moved.

| ADR-0012 check | What to record | Settled in |
|---|---|---|
| 4 (cap message) | How managed login shows the trigger's refusal: needs a release with the cap at 0, then sign-up; screenshot | Phase 8, or moved to Phase 9 by you at the gate |
| 11 (shared browser) | With and without `/logout` and `prompt=login`: was a password page shown? | Phase 8 (section 4.3 covers the `/logout` case) |
| 12 (operator) | Forced new password, TOTP enrolment, `admin` in the access token (section 1.2) | Phase 8 |
| 13 / U-058 (auth flows) | Whether managed login still works with the smallest `explicit_auth_flows`, and which work with rotation on (operator client ships `ALLOW_USER_SRP_AUTH` only, **[UNVERIFIED]**); also that the narrowed client attributes (`zoneinfo` only) do not break sign-up or sign-in | Phase 8 |
| 19 / U-031 (global sign-out) | Access token after `GlobalSignOut`: still accepted until expiry? Refresh refused? Needs the API | Phase 9 |
| U-059 | Player-pool forced-change page after `admin-set-user-password --permanent` (section 3) | Phase 8 |

## What this runbook does not do

- Create or change pools, clients, domains, the `admin` group or the sign-up cap: those are Terraform, changed through a
  release. Closing self sign-up is the `player_signup_closed` variable (spine S1.2), not a console switch.
- Put any test password into CI: the authenticated smoke test waits for a deliberately added secret
  ([H §H.8.6](../plan/H-infrastructure-and-delivery.md#h86-smoke-checks-step-7-read-only)).
