# Runbook: operator and test accounts

Your operator login and the three test accounts are created by the release, in
[infrastructure/main/accounts.tf](../../infrastructure/main/accounts.tf)
([ADR-0022](../decisions/0022-accounts-in-terraform.md), owner decision 2026-11-15): the pipeline creates the two pools, their
domains, clients, the `admin` group, the four accounts, your `admin` membership, and one SSM SecureString per account holding
the password Terraform set. **Children's accounts are never in Terraform**: children sign up themselves (with you) through the
game's sign-up page. J task M1-05; test accounts per [I §I.2.10](../plan/I-validation.md#i210-test-accounts-and-test-data).

What stays by hand (rows of [Local AWS writes that are not deployments](../build-phases.md#local-aws-writes-that-are-not-deployments)):
deleting the self-signed-up test child (section 4), and recovery and disabling (sections 5 and 6). Confirming the alarm e-mail
subscription (Phase 9) also stays manual: AWS requires the recipient to click the link.

Run this after the release that adds `accounts.tf` has been applied. The commands assume **bash** (`read -s -p`,
`set +o history`); in zsh, start `bash` first.

## Where things are

| What | Value | Label |
|---|---|---|
| Account, profile, region | `263185198757`, `--profile space-tower-defence`, `eu-west-2` | **[VERIFIED]** env files |
| Player pool | `space-tower-defence-prod-players`; self sign-up through managed login, auto-confirmed by `cognito-presignup` within the daily cap; no e-mail or phone; MFA off | **[PROPOSAL]** [E §E.7.1](../plan/E-architecture.md#e71-design-summary), ADR-0012 |
| Operator pool | `space-tower-defence-prod-operators`; `AdminCreateUser` only; TOTP MFA required; group `admin`; no e-mail or phone | **[PROPOSAL]** E §E.7.1 |
| Managed-login domains | `https://scd-aliens-play.auth.eu-west-2.amazoncognito.com` (players), `https://scd-aliens-admin.auth.eu-west-2.amazoncognito.com` (operators) | **[VERIFIED]** prod env file |
| App clients | `space-tower-defence-prod-player` (callback `https://aliens.jackgl.com/auth/callback`), `space-tower-defence-prod-admin` (callback `https://admin.aliens.jackgl.com/auth/callback`); public, no secret | **[PROPOSAL]** [H §H.4.5](../plan/H-infrastructure-and-delivery.md#h45-cognito_pool-called-twice) |
| Terraform-managed accounts | your operator login (username = `operator_username` in [prod.tfvars.json](../../infrastructure/envs/prod.tfvars.json), now `owner`; in `admin`; fixed once applied: a rename replaces the user, with a new `sub` and TOTP enrolment, and needs a reviewed commit lifting `prevent_destroy`), `test-operator` (operator pool, **not** in `admin`), `test-player-1`, `test-player-2` (player pool) | **[CONFIRMED by owner, 2026-11-15]** ADR-0022; names **[ASSUMPTION]** I §I.2.10 |
| Their passwords | SSM SecureString `/space-tower-defence/prod/accounts/<username>` (default `aws/ssm` key); also in Terraform state. Operator-pool accounts: a one-time password, useless after the first sign-in. Test players: their permanent password | **[PROPOSAL]** ADR-0022 |
| Release outputs | `account_usernames`, `account_password_parameters` (names only, never a password) | **[VERIFIED]** local read-only plan, 2026-11-15 |
| Password recovery | None self-service (account recovery `admin_only`, no "Forgot your password?" link): you reset passwords here | **[CONFIRMED]** E §E.7.1; link absent **[VERIFIED]** ADR-0012 check 3 |

## Rules

- **Passwords never appear in git, chat, a ticket or shell history.** Reading a password from SSM prints it once to your
  terminal: copy it into your password manager and clear the screen. Passwords you choose (new operator password, resets) are
  typed at a hidden `read -rs` prompt into a shell variable and unset afterwards. The value is still an argument of the one
  `aws` process while it runs (visible to `ps` on your own laptop for a second); that is accepted for a single-user machine
  **[ASSUMPTION]**.
- **No real children's names** in usernames, here or anywhere: usernames are visible to you in the console, in logs and (for the
  Terraform-managed four) in state and the release outputs. Your children's own accounts are made by them (with you) through the
  sign-up page in the game.
- **Never add a child's account to Terraform**, and never create one with `admin-create-user`.
- Usernames are case-insensitive and stored in lower case (ADR-0012 check 2).
- Never change a pool, client, group or a Terraform-managed account's existence or group membership in the console: change
  [accounts.tf](../../infrastructure/main/accounts.tf) and release. The only exceptions are the emergency delete and
  remove-from-group calls in sections 5 and 6, which the next release is expected to reverse. Passwords, MFA settings,
  sessions and the enabled flag are the only things you change by hand (Terraform ignores them).
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

OP_USER=owner   # operator_username in infrastructure/envs/prod.tfvars.json
account_pw() { aws ssm get-parameter --with-decryption --name "/space-tower-defence/prod/accounts/$1" --query Parameter.Value --output text; }

echo "players $PLAYER_POOL_ID / $PLAYER_CLIENT_ID; operators $OPERATOR_POOL_ID / $OPERATOR_CLIENT_ID"
```

Each value must be a single ID (`eu-west-2_…` for pools). The same IDs are in the Terraform outputs `player_config` and
`admin_config` (the release run's outputs, or `terraform output -json` in an initialised local copy of `infrastructure/main`,
read-only), and from Phase 9 in each site's `/config.json`.

Two sign-in links you will use. They are the pool's managed-login domain (`authDomain`), the client ID (`clientId`), the
client's scope (`openid` plus `scope`, URL-encoded) and the exact callback URL from the module (`https://<hostname>/auth/callback`).
The `code` they return to the site is not used and expires after five minutes:

```sh
OPERATOR_LOGIN="https://scd-aliens-admin.auth.eu-west-2.amazoncognito.com/oauth2/authorize?client_id=$OPERATOR_CLIENT_ID&response_type=code&scope=openid+ops%2Fcontent&redirect_uri=https%3A%2F%2Fadmin.aliens.jackgl.com%2Fauth%2Fcallback"
PLAYER_LOGIN="https://scd-aliens-play.auth.eu-west-2.amazoncognito.com/oauth2/authorize?client_id=$PLAYER_CLIENT_ID&response_type=code&scope=openid+game%2Fplay&redirect_uri=https%3A%2F%2Faliens.jackgl.com%2Fauth%2Fcallback"
echo "$OPERATOR_LOGIN"; echo "$PLAYER_LOGIN"
```

## 1. Your operator account: first sign-in

The release created it in `FORCE_CHANGE_PASSWORD`, put you in `admin`, and Cognito **e-mailed you an invitation** (subject "Your
Space Colony Defence admin account", from `no-reply@verificationemail.com`; check spam) with your username and a temporary
password. Terraform never sets or stores this password. It is valid for **7 days** from the apply (pool setting); if it expired
or the e-mail never came, resend it: `aws cognito-idp admin-create-user --user-pool-id "$OPERATOR_POOL_ID" --username "$OP_USER" --message-action RESEND`.

1. Check (read-only) that it exists and is in `admin`:

   ```sh
   aws cognito-idp admin-get-user --user-pool-id "$OPERATOR_POOL_ID" --username "$OP_USER" --query '{status: UserStatus, enabled: Enabled}'
   aws cognito-idp admin-list-groups-for-user --user-pool-id "$OPERATOR_POOL_ID" --username "$OP_USER" --query 'Groups[].GroupName'
   ```

   Expect `FORCE_CHANGE_PASSWORD`, `true`; groups `["admin"]`.
2. Open the invitation e-mail and copy the temporary password.

3. Open `$OPERATOR_LOGIN` in a private window. Sign in with `$OP_USER` and the temporary password from the e-mail. Managed login asks for a
   **new password** (12+ characters, upper, lower, digit, symbol; keep it in your password manager), then shows a **QR code for
   TOTP**: scan it with your authenticator app and enter the six-digit code. You land on
   `https://admin.aliens.jackgl.com/auth/callback?code=…`. **[UNVERIFIED]** in this account: the spike deferred the operator
   run (ADR-0012 check 12); write down what the pages actually showed for the Phase 8 gate.
4. Check (read-only):

   ```sh
   aws cognito-idp admin-get-user --user-pool-id "$OPERATOR_POOL_ID" --username "$OP_USER" \
     --query '{status: UserStatus, mfa: UserMFASettingList, preferred: PreferredMfaSetting, enabled: Enabled}'
   ```

   Pass: `CONFIRMED`, `["SOFTWARE_TOKEN_MFA"]`, `SOFTWARE_TOKEN_MFA`, `true`.
5. Sign out at `https://scd-aliens-admin.auth.eu-west-2.amazoncognito.com/logout?client_id=$OPERATOR_CLIENT_ID&logout_uri=https%3A%2F%2Fadmin.aliens.jackgl.com%2F`
   and sign in again: it must ask for the password **and** a TOTP code (Phase 8 exit criterion "the operator signs in with TOTP").

## 2. `test-operator`: first sign-in (operator pool, **not** in `admin`)

Used by the API tests for the 403 checks: a real operator-pool token that is not an operator
([I §I.2.10](../plan/I-validation.md#i210-test-accounts-and-test-data)). Same as section 1, steps 2 to 4, with
`account_pw test-operator` and username `test-operator`, in a new private window. Keep its new password and authenticator entry
separate from yours. Check its groups (expect `[]`):

```sh
aws cognito-idp admin-list-groups-for-user --user-pool-id "$OPERATOR_POOL_ID" --username test-operator --query 'Groups[].GroupName'
```

## 3. `test-player-1` and `test-player-2` (player pool): check only

The release created both with their permanent password, so they are `CONFIRMED` with no forced change. `AdminCreateUser`
accounts do not use a place in the daily sign-up cap: the trigger passes `PreSignUp_AdminCreateUser` through uncounted
(**[VERIFIED]** `api/functions/cognito_presignup/handler.py`).

```sh
for u in test-player-1 test-player-2; do
  aws cognito-idp admin-get-user --user-pool-id "$PLAYER_POOL_ID" --username "$u" --query '{status: UserStatus, attributes: UserAttributes[].Name}'
done
```

Pass: each `CONFIRMED`, attributes only `sub`. Sign in once with each through `$PLAYER_LOGIN` (private window) using
`account_pw <username>`; no password change is asked **[UNVERIFIED]** (register U-059, ADR-0012 "not in this spike"). The SSM
value stays their password: it is where the deployed tests (when written) will read it, or copy it into your local environment. Profile data (nickname, test date of birth per age band) is
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
3. Sign out (`/logout` on the player domain, as in step 1.5 with the player client and `https://aliens.jackgl.com/`), sign in
   again with the same username: it must ask for the password.
4. Delete it (I §I.2.10: self-signed-up test users never stay; this one is not in Terraform, so nothing recreates it):

   ```sh
   aws cognito-idp admin-delete-user --user-pool-id "$PLAYER_POOL_ID" --username "$SIGNUP_USER"
   ```

   The counter item is not touched: it expires on its own (`ttl`) and it only limits sign-ups for that day.

## 5. Recovery

| Situation | What you do | Label |
|---|---|---|
| A child (or a test player) forgot their password | `IFS= read -rs -p "New password: " PW; echo; aws cognito-idp admin-set-user-password --user-pool-id "$PLAYER_POOL_ID" --username <username> --password "$PW" --permanent; unset PW`. Tell the child the new password in person. The AC-02 drill does this on `test-player-2`: the new password works, the old one fails; then set it back to the SSM value (`PW=$(account_pw test-player-2)`, same call) so the tests keep working | **[CONFIRMED]** admin-managed recovery, E §E.7.1 |
| You forgot your operator password, or the one-time password expired before the first sign-in (7 days) | Same call on the operator pool with a **temporary** password instead (`--no-permanent`), then sign in through managed login and set a new one; TOTP is still required (or enrolled, on a first sign-in). Terraform ignores the change | **[PROPOSAL]** |
| You lost your authenticator (TOTP) | `aws cognito-idp admin-set-user-mfa-preference --user-pool-id "$OPERATOR_POOL_ID" --username <operator username> --software-token-mfa-settings Enabled=false,PreferredMfa=false`, then sign in: because MFA is required on the pool, managed login should ask you to enrol a new authenticator. **[UNVERIFIED]**: check it on `test-operator` first. If it does not work, delete the user (section 6): the next release should recreate it with the one-time password in SSM and the `admin` membership **[UNVERIFIED]**: check it first on `test-operator` (delete it, then confirm the next release's plan shows a create for it), and for the membership that the provider drops a missing user's `aws_cognito_user_in_group` rather than failing the plan. Then repeat section 1. A new user has a new `sub`, so audit lines from before name the old one | **[UNVERIFIED]** |
| Someone should be signed out everywhere now (lost device, shared laptop) | `aws cognito-idp admin-user-global-sign-out --user-pool-id <pool> --username <username>`: refresh tokens stop working; access tokens already issued stay valid until they expire (at most 60 minutes) | **[PROPOSAL]**; access-token behaviour **[UNVERIFIED]** (U-031) |

## 6. Disable or delete

| Goal | Call | Effect |
|---|---|---|
| Stop an account temporarily | `aws cognito-idp admin-disable-user --user-pool-id <pool> --username <username>`, then `admin-user-global-sign-out` | Cannot sign in or refresh; reversible with `admin-enable-user`. Player data in `game` is untouched. A release does not re-enable a Terraform-managed account (`enabled` is ignored) |
| Remove operator rights, keep the account | Emergency: `aws cognito-idp admin-remove-user-from-group --user-pool-id "$OPERATOR_POOL_ID" --username <username> --group-name admin`. For your Terraform-managed login, the next release should add it back **[UNVERIFIED]**: make it permanent by removing `aws_cognito_user_in_group.operator_admin` from `accounts.tf` | New tokens lack `admin`; current access tokens keep it until they expire (60 minutes) |
| Delete an account | `aws cognito-idp admin-delete-user --user-pool-id <pool> --username <username>` | Irreversible. The user's `sub` is gone; their `game` items stay (keyed by the old `sub`) until a whole-profile reset or the F-8 clean-up removes them. Never delete a child's account to "reset" it: use the in-game reset (Phase 55). A deleted Terraform-managed account should come back at the next release (same SSM password) **[UNVERIFIED]**, see section 5; to retire one for good, remove it from `accounts.tf` (your login also needs its `prevent_destroy` lifted, a reviewed commit) |

## 7. Phase 9: alarm e-mail and one signed-in call through each distribution

Run after the Phase 9 release is applied and you have confirmed both SNS subscriptions (one e-mail per topic: eu-west-2 and
us-east-1). It settles register rows U-042, U-044, U-045 and U-046, and the routing half of U-043
([docs/decisions/unverified.md](../decisions/unverified.md)). Everything is read-only except `set-alarm-state` (the Phase 9 row
of [Local AWS writes](../build-phases.md#local-aws-writes-that-are-not-deployments)).

**Expect alarm e-mails from the signed-in calls.** Until each route's real handler lands, a call that passes the gateway gets
the stub's `501 NOT_IMPLEMENTED` ([api/shared/router.py](../../api/shared/router.py)). A 501 is a 5xx, so step 3 fires
`space-tower-defence-prod-api-5xx` and, with so little traffic, probably both `space-tower-defence-prod-cloudfront-<site>-5xx-rate`
alarms. That is expected noise, not a failure. Keep the AC-40 real-failure test (I §I.3) separate from these calls.

1. **Alarm delivery** (U-046). One alarm per region; expect one e-mail each within a few minutes. The alarm returns to its real
   state at its next evaluation.

   ```sh
   aws cloudwatch set-alarm-state --alarm-name space-tower-defence-prod-api-5xx \
     --state-value ALARM --state-reason "Phase 9 delivery test"
   aws cloudwatch set-alarm-state --region us-east-1 --alarm-name space-tower-defence-prod-cloudfront-player-5xx-rate \
     --state-value ALARM --state-reason "Phase 9 delivery test"
   ```

2. **Throttles as deployed** (U-045). Record both numbers for the stage default and confirm every route has its own entry:

   ```sh
   API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='space-tower-defence-prod-api'].ApiId" --output text)
   aws apigatewayv2 get-stage --api-id "$API_ID" --stage-name '$default' \
     --query '{default: DefaultRouteSettings, routes: length(keys(RouteSettings))}'
   ```

   Expect rate 20 / burst 40 and 30 routes (spine S9.5, **[ASSUMPTION]** numbers).

3. **A signed-in call** (U-042 `Authorization` forwarded, U-044 invoke permission). Get an access token for `test-player-1`
   with the code flow and PKCE. The token stays in a shell variable and is never printed:

   ```sh
   VERIFIER=$(openssl rand -hex 32)
   CHALLENGE=$(printf '%s' "$VERIFIER" | openssl dgst -sha256 -binary | openssl base64 -A | tr '+/' '-_' | tr -d '=')
   echo "$PLAYER_LOGIN&code_challenge=$CHALLENGE&code_challenge_method=S256"
   ```

   Open that link in a private window and sign in as `test-player-1` (`account_pw test-player-1`). Copy the `code` value from
   the address bar of the callback page (it expires after five minutes), then:

   ```sh
   read -rs -p 'code: ' CODE; echo
   TOKEN=$(curl -s https://scd-aliens-play.auth.eu-west-2.amazoncognito.com/oauth2/token \
     -d grant_type=authorization_code -d "client_id=$PLAYER_CLIENT_ID" -d "code=$CODE" -d "code_verifier=$VERIFIER" \
     --data-urlencode redirect_uri=https://aliens.jackgl.com/auth/callback \
     | python3 -c 'import json, sys; print(json.load(sys.stdin)["access_token"])')
   unset CODE VERIFIER CHALLENGE

   PLAYER_CF=<player_distribution_domain>   # release outputs, *.cloudfront.net
   ADMIN_CF=<admin_distribution_domain>
   for h in aliens.jackgl.com admin.aliens.jackgl.com "$PLAYER_CF" "$ADMIN_CF"; do
     printf '%s ' "$h"
     curl -s -o /dev/null -w '%{http_code} %{content_type}\n' -H "Authorization: Bearer $TOKEN" "https://$h/api/me"
   done
   ```

   Pass: `501 application/json` on all four (the stub answered, so CloudFront forwarded the header and the gateway could invoke
   the function). A `401` means the header was dropped (U-042) or the token is wrong; a `500` from the gateway with an
   `integrationError` in the access log (`/aws/apigateway/space-tower-defence-prod-api`) means the permission's `source_arn` is
   wrong (U-044).

4. **A `DELETE` with a body** (U-043, routing half):

   ```sh
   curl -s -o /dev/null -w '%{http_code} %{content_type}\n' -X DELETE -H "Authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' --data '{"sessionId":"00000000-0000-4000-8000-000000000000"}' \
     https://aliens.jackgl.com/api/session
   unset TOKEN
   ```

   Pass: `501 application/json` (the request reached the function). Whether the body arrives unchanged needs the real handler's
   log line, so the other half of U-043 moves to Phase 16 (session lease routes).

Record each result in the Phase 9 gate log row, and mark the register rows.

Finish the session:

```sh
unset OP_USER SIGNUP_USER PLAYER_LOGIN OPERATOR_LOGIN TOKEN API_ID PLAYER_CF ADMIN_CF; unset -f account_pw
set -o history
```

## Checks to record for the Phase 8 gate

ADR-0012 deferred these to Phase 8 (M1-05) or later. Write down what you saw while running sections 1 to 4; the gate summary
records each one as settled or moved.

| ADR-0012 check | What to record | Settled in |
|---|---|---|
| 4 (cap message) | How managed login shows the trigger's refusal: needs a release with the cap at 0, then sign-up; screenshot | Phase 8, or moved to Phase 9 by you at the gate |
| 11 (shared browser) | With and without `/logout` and `prompt=login`: was a password page shown? | Phase 8 (section 4.3 covers the `/logout` case) |
| 12 (operator) | Forced new password, TOTP enrolment, `admin` in the access token (section 1.3) | Phase 8 |
| 13 / U-058 (auth flows) | Whether managed login still works with the smallest `explicit_auth_flows`, and which work with rotation on (operator client ships `ALLOW_USER_SRP_AUTH` only, **[UNVERIFIED]**); also that the narrowed client attributes (`zoneinfo` only) do not break sign-up or sign-in | Phase 8 |
| 19 / U-031 (global sign-out) | Access token after `GlobalSignOut`: still accepted until expiry? Refresh refused? Needs the API | Phase 9 |
| U-059 | Player-pool forced-change page for a user created with a permanent password (Terraform `password`, which sets it permanent after `AdminCreateUser`; section 3) | Phase 8 |

## What this runbook does not do

- Create or change pools, clients, domains, the `admin` group, the sign-up cap, the four managed accounts or your `admin`
  membership: those are Terraform ([accounts.tf](../../infrastructure/main/accounts.tf)), changed through a release. Closing self sign-up is the `player_signup_closed` variable (spine S1.2), not a console switch.
- Create any child's account, ever.
- Give any test password to the tests as a CI secret (the values are nevertheless present in Terraform state and in saved
  plans, ADR-0022; the test players' passwords are in SSM for the deployed tests, when written, run from your laptop): the
  authenticated smoke test waits for a deliberately added secret
  ([H §H.8.6](../plan/H-infrastructure-and-delivery.md#h86-smoke-checks-step-7-read-only)).
