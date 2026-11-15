# Auth spike: Cognito managed login (M0-10, build Phase 5)

A throwaway stack that answers the sign-in questions before Phase 8 builds the real pools. Results go into
[ADR-0012](../../docs/decisions/0012-auth-spike.md). The stack is applied and destroyed **only** through
`.github/workflows/spike.yml` (spike `auth-cognito`, state key `spikes/auth-cognito/terraform.tfstate`). This folder is
deleted in Phase 6 once its state is empty.

## What it builds

All names start `space-tower-defence-spike-`; tags include `spike = auth-cognito`. 37 resources.

| Part | Resources |
|---|---|
| Player pool | Essentials tier; username + password only, case-insensitive, nothing verified, self sign-up on, recovery `admin_only`; pre sign-up trigger; resource server `scd-spike` with scope `play`; public PKCE client (code flow only); prefix domain `space-tower-defence-spike-play` with managed login (version 2) and the default style |
| Operator pool | AdminCreateUser only; MFA required, TOTP; groups `admin` and `admin-extra`; scope `scd-spike/admin`; two public PKCE clients: `admin` (may get the admin scope) and `noscope` (never does); prefix domain `space-tower-defence-spike-admin`; user `spike-operator` in both groups with a random one-time password in an SSM SecureString |
| HTTP API | One JWT authoriser per pool; `GET /spike/player` (scope `scd-spike/play`) and `GET /spike/admin` (scope `scd-spike/admin`), both to one function that echoes the authoriser context (never the token) and reports Python version and `Europe/London` (`?fail=crash` and `?fail=timeout` make it crash or run past its 10 s timeout); access log with `authorizerError` |
| Functions | `presignup` and `api`: Python 3.14, arm64, 128 MB, logs-only roles, log groups with 1-day retention |

Every app client: callback `http://localhost:8765/callback`, sign-out `http://localhost:8765/logged-out`, explicit auth
flows from `spike_explicit_auth_flows` (start: `ALLOW_USER_SRP_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`), refresh-token rotation off.

## Choices

- **No sign-up counting.** Production counts sign-ups per UTC day in DynamoDB (spine S1.2). The spike needs only two answers
  from managed login: what an auto-confirmed sign-up looks like, and how a raised error is shown. So `spike_signup_cap = 0`
  makes the trigger raise for every self sign-up; any other value confirms every sign-up. The counter itself is tested in
  Phase 8 with fixtures.
- **Operator user made by Terraform**, not by a local `admin-create-user`: Phase 5 has no row in the local-writes table, and a
  pipeline-created user needs none. The password is random, never in logs or outputs, works once (managed login forces a new
  password and TOTP enrolment at first sign-in), and is destroyed with the stack. It does sit in the spike's state file in the
  encrypted state bucket until destroy.
- **Managed login, not the classic hosted UI**: provider 6.73 supports `managed_login_version = 2` and
  `aws_cognito_managed_login_branding` (checked against the provider schema).

## Owner steps

Use made-up usernames only (for example `SpikeChild1`, `SpikeChild2`): they appear in the saved files.

1. **Apply.** GitHub → Actions → spike → Run workflow: spike `auth-cognito`, action `plan`; read the plan (37 to add, all
   `space-tower-defence-spike-*`). Then the same with action `apply`.
2. **Save the outputs.** Copy the JSON block under "Outputs" in the apply run's summary into
   `spikes/auth-cognito/outputs.json` (git-ignored; `check.py` reads its `check_config`). Or, read-only from the laptop,
   staying in the repository root:
   ```sh
   export AWS_PROFILE=space-tower-defence   # init (the S3 backend) and output both need it
   terraform -chdir=spikes/auth-cognito init -reconfigure -backend-config=bucket=prod-state-bucket-space-tower-defence \
     -backend-config=key=spikes/auth-cognito/terraform.tfstate -backend-config=region=eu-west-2 -backend-config=use_lockfile=true
   terraform -chdir=spikes/auth-cognito output -json > spikes/auth-cognito/outputs.json
   ```
3. **Player runs** (from the repository root; each opens the browser and waits on `localhost:8765`). Note what the browser
   shows at each step; take the screenshots marked "(screenshot)" into `spikes/auth-cognito/screenshots/`.

   | # | Command (`python3 spikes/auth-cognito/check.py …`) | Do in the browser | Note |
   |---|---|---|---|
   | P1 | `--signup --label child1-signup` | Sign up `SpikeChild1` with a password | (screenshot) the sign-up form; (screenshot) the page after submit. Is there a "Forgot your password?" link on the sign-in page? |
   | P2 | `--signup --label child2-signup` | Sign up `SpikeChild2` | |
   | P3 | `--label case --skip-logout` | Sign in as `spikechild1` (lower case) | Did it work? |
   | P4 | `--label no-logout-no-prompt --no-prompt-login --skip-logout` | Nothing, if it signs straight in | Which username did it print? Was a password asked? |
   | P5 | `--label no-logout-prompt --skip-logout` | Sign in as `SpikeChild2` if asked | Was a password asked? |
   | P6 | `--label cookie-then-logout --no-prompt-login` | | Signed straight in as child 2? (then it signs out) |
   | P7 | `--label after-logout --no-prompt-login` | Sign in as `SpikeChild1` if asked | Was a password asked after `/logout`? |
   | P8 | `--label no-scope --scopes openid` | Sign in as `SpikeChild1` | |
   | P9 | `--label probes --gateway-probes` | Sign in as `SpikeChild1` | Unmatched route, a burst of 40 calls, a crash and a timeout (takes about 15 s) |
   | P10 | `--label global-sign-out --global-sign-out` | Sign in as `SpikeChild1` | Signs `SpikeChild1` out everywhere through its own token, then tries the old tokens |
   | P11 | `--label expiry --wait-expiry` | Sign in as `SpikeChild2` | Leave it running: it waits about an hour for the access token to expire, then calls the API with it |

   P3 writes the player fixture `api/tests/fixtures/authorizer/player-event.json`.
4. **Operator runs.** Read the one-time password (read-only):
   ```sh
   aws ssm get-parameter --name space-tower-defence-spike-operator-temporary-password --with-decryption \
     --query Parameter.Value --output text --profile space-tower-defence --region eu-west-2
   ```
   | # | Command | Do in the browser | Note |
   |---|---|---|---|
   | O1 | `--client operator --label first` | `spike-operator` + that password; set a new password; enrol TOTP in an authenticator app; enter a code | (screenshot) the new-password page and the TOTP set-up page |
   | O2 | `--client operator-noscope --label noscope` | Sign in again (password + TOTP code) | |

   O1 writes `api/tests/fixtures/authorizer/operator-event.json`.
5. **Cap and narrower flows (one re-apply).** In `spike.auto.tfvars.json` set `"spike_signup_cap": 0` and
   `"spike_explicit_auth_flows": ["ALLOW_REFRESH_TOKEN_AUTH"]`; commit and push; dispatch spike `plan`, then `apply`
   (expect 4 to change in place: the trigger function and the three clients). Then:
   - `check.py --signup --label cap0` and try to sign up `SpikeChild3` → (screenshot) the error message. Close the tab, press Ctrl-C.
   - `check.py --label narrow-flows` and sign in as `SpikeChild1` → did sign-in still work with only `ALLOW_REFRESH_TOKEN_AUTH`?
6. **Optional:** with a parent, show a child the sign-in and sign-up pages and note what they make of the wording.
7. **Destroy.** Dispatch spike `auth-cognito`, action `destroy`. Its log ends with an empty `terraform state list`. Then,
   read-only: `aws s3 ls s3://prod-state-bucket-space-tower-defence/spikes/ --recursive --profile space-tower-defence`.
   Set `spike.auto.tfvars.json` back to the defaults afterwards (or leave it: the folder is deleted in Phase 6).

## What to send back to Claude

Claude reads the files on the laptop, so send only:
- "spike runs done", plus your one-line note per row above (what the browser showed);
- the screenshots in `spikes/auth-cognito/screenshots/`;
- the spike.yml run IDs (apply, re-apply, destroy).

The files Claude reads: `spikes/auth-cognito/results/*.json` (claims, status codes, refresh, logout; tokens are never
written: `check.py` refuses to write anything shaped like a token) and `api/tests/fixtures/authorizer/*-event.json`.
Claude checks them again for anything personal before committing.

## Local checks

```sh
terraform fmt -check -recursive spikes/
terraform -chdir=spikes/auth-cognito init -backend=false && terraform -chdir=spikes/auth-cognito validate
.venv/bin/python -m pytest spikes -q
```
