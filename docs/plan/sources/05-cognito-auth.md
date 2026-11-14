# 05 — Amazon Cognito user pools and API Gateway HTTP API JWT authorisers

Research date: 2026-11-14. Web access WORKED. Every AWS statement marked VERIFIED was read today from the cited
official page (fetched through a page-to-text tool, so wording is as returned by that tool). Library facts were read
from the published npm packages (registry metadata and the shipped files on unpkg). Terraform facts were read from the
provider documentation at tag `v6.73.0` (the version in `infrastructure/bootstrap/.terraform.lock.hcl`, per
`00-verified-repo-facts.md`).

Labels: **VERIFIED** = read today at the cited URL. **PROPOSAL** = my design recommendation. **UNVERIFIED** = from
memory or from a non-primary source; must be confirmed in the Milestone 0 spike (section 12).

No terraform, aws CLI, git, npm install or docker commands were run. Nothing under `/home/jack/Documents/Projects` was
changed. No owner name, account ID, repository name or domain name was sent to any external service.

---

## 0. Headline answers

1. **Username-only pool with no email/phone is supported and documented.** A pre sign-up Lambda trigger that returns
   `autoConfirmUser: true` makes a self-registered user `CONFIRMED` immediately; AWS documents this under "Confirming
   user accounts without verifying email or phone number". VERIFIED [C1][C2].
2. **The price of no verified contact is no self-service password reset.** `ForgotPassword` needs a verified email or
   phone. Set account recovery to `admin_only` and use `AdminSetUserPassword`. `AdminResetUserPassword` is NOT usable in
   this design. VERIFIED [C2][C3][C5].
3. **Only managed login (or the classic hosted UI) gives an authorisation-code + PKCE flow.** In-app sign-in through
   the SDK (`USER_SRP_AUTH`) is not an OAuth grant. Both are AWS-documented best practice for their own model.
   VERIFIED [C18].
4. **Cognito access tokens normally have `client_id` and no `aud`.** The HTTP API JWT authoriser matches its
   `audience` list against `aud`, or against `client_id` when `aud` is absent. So `audience` = app client ID.
   VERIFIED [A1][C29].
5. **Custom scopes exist only on tokens issued through the OAuth endpoints** (or added by a pre token generation
   trigger, Essentials/Plus). SDK sign-in tokens carry the single scope `aws.cognito.signin.user.admin`.
   VERIFIED [C22][C26].
6. **Scopes are per app client, not per user.** They cannot prove that a user is an operator. Admin privilege must be
   proved by pool membership (two pools) or by the `cognito:groups` claim (one pool). Group membership can only be
   changed with IAM-authorised APIs. VERIFIED [C21][C30]; the conclusion is a PROPOSAL.
7. **Managed login text cannot be edited, and its sign-up behaviour for a username-only, auto-confirmed pool is not
   documented.** That is the main open risk; it needs a short spike before the plan commits. VERIFIED (text) [C12];
   UNVERIFIED (sign-up behaviour).
8. **Keep nickname, avatar and date of birth in DynamoDB, never in Cognito attributes.** Readable attributes flow
   into the ID token and `userInfo`. VERIFIED [C6][C23][C27]; recommendation is a PROPOSAL.

---

## 1. (a) Username-only user pools

### 1.1 Sign-in identifiers, aliases, immutability

| Fact | Status | Source |
|---|---|---|
| Each user has a `username` attribute; "After you create a user, you can't change the value of the `username` attribute." | VERIFIED | [C6] |
| Usernames are unique within a pool; a username can be reused only after the user is deleted. | VERIFIED | [C6] |
| SignUp `Username`: length 1–128, pattern `[\p{L}\p{M}\p{S}\p{N}\p{P}]+` (letters, marks, symbols, numbers, punctuation; no spaces). | VERIFIED | [C8] |
| Except `sub`, standard attributes are optional by default. Required attributes cannot be changed after pool creation. | VERIFIED | [C6][C39] |
| Sign-in options (`AliasAttributes` / `UsernameAttributes`) cannot be changed after creation. | VERIFIED | [C6][C39] |
| Alias attributes available: `email`, `phone_number`, `preferred_username`. `preferred_username` gives a changeable sign-in name, but the user can supply it only after confirmation, not during registration. | VERIFIED | [C6] |
| Email/phone aliases become active only when verified. | VERIFIED | [C6] |
| Case sensitivity: API default is `CaseSensitive = true`; AWS recommends `false`; "This configuration is immutable after you set it." Console-created pools are case-insensitive. In a case-insensitive pool, mixed-case values are flattened to lower case in output. | VERIFIED | [C7] |
| The Cognito CONSOLE wizard states "Username requires email or phone attributes for each user so that they can receive a password-reset code". | VERIFIED | [C42] |

PROPOSAL:
- No `alias_attributes` and no `username_attributes`: the username is the only sign-in identifier.
- `username_configuration { case_sensitive = false }` set explicitly in Terraform (Caps Lock tolerance for children).
  It can never be changed, so it must be right on first apply.
- No required attributes, no custom attributes, no `schema` blocks at all.
- Create the pool with Terraform/API, not the console wizard, because the wizard pushes a required email/phone.
- The nickname shown in the game is a DynamoDB field, so the immutable username is not a UX problem.
- Do not use `preferred_username`: it adds a second sign-in name and more states for no product benefit.

### 1.2 Reaching CONFIRMED without email or phone

User states: Registered (Unconfirmed) — "cannot sign in until the user account is confirmed"; Confirmed; Password Reset
Required; Force Change Password; Disabled. VERIFIED [C2].

Three confirmation routes exist: a code/link sent to email or phone; `AdminConfirmSignUp` (IAM); or the pre sign-up
trigger. VERIFIED [C2]. AWS text: "The pre sign-up Lambda trigger can be used to auto-confirm user accounts at
sign-up, without requiring a confirmation code or verifying email or phone number. Users who are confirmed this way can
immediately sign in without having to receive a code." VERIFIED [C2].

Trigger-specific event (combined with the common fields below). VERIFIED [C1]:

```json
{
  "request": {
    "userAttributes": { "string": "string" },
    "validationData": { "string": "string" },
    "clientMetadata": { "string": "string" }
  },
  "response": {
    "autoConfirmUser": "boolean",
    "autoVerifyPhone": "boolean",
    "autoVerifyEmail": "boolean"
  }
}
```

Common fields on every trigger event. VERIFIED [C33]: `version`, `triggerSource`, `region`, `userPoolId`, `userName`,
`callerContext.awsSdkVersion`, `callerContext.clientId`, `request.userAttributes`, `response`.

A full example event printed by AWS for a `SignUp` call. VERIFIED [C33]:

```json
{
  "callerContext": { "awsSdkVersion": "aws-sdk-unknown-unknown", "clientId": "1example23456789" },
  "region": "us-west-2",
  "request": { "clientMetadata": { }, "userAttributes": { }, "validationData": null },
  "response": { "autoConfirmUser": false, "autoVerifyEmail": false, "autoVerifyPhone": false },
  "triggerSource": "PreSignUp_SignUp",
  "userName": "mary_major2",
  "userPoolId": "us-west-2_EXAMPLE",
  "version": "1"
}
```

Rules that matter. All VERIFIED:
- The function must return the whole event with `response` filled in. [C33]
- `triggerSource` values for this trigger: `PreSignUp_SignUp`, `PreSignUp_AdminCreateUser`,
  `PreSignUp_ExternalProvider`. [C33]
- `autoConfirmUser` / `autoVerify*` are ignored when the trigger was invoked by `AdminCreateUser`. [C1]
- If `autoVerifyEmail` (or `autoVerifyPhone`) is `true` and the attribute has no value, "an error will occur and the
  user will not be able to complete sign-up". So leave both `false`. [C1]
- The function must answer within 5 seconds; the timeout cannot be changed. [C33]
- If the function returns an error or does not return the event, the operation fails. The API returns
  `PreSignUp failed with error <text>`; managed login shows the error text above the form. [C33]
- Trigger changes take up to 70 seconds to apply. [C33]
- The managed login `/signup` page invokes the same trigger with `PreSignUp_SignUp`. [C33]
- The `SignUp` API response contains `UserConfirmed` (boolean, "whether the user was automatically confirmed") and
  `UserSub`. [C8]
- A Lambda created outside the console needs a resource policy allowing principal `cognito-idp.amazonaws.com` with
  `aws:SourceArn` = the user pool ARN and `aws:SourceAccount`. [C33]

PROPOSAL — what the pre sign-up function does (Python, a few lines, no AWS calls):
1. If `triggerSource == "PreSignUp_SignUp"`: validate `userName`, then set `response.autoConfirmUser = True`.
2. Validation: 3–20 characters from a small allow-list (letters, digits, `_`, `-`); reject anything containing `@`
   (keeps e-mail addresses out of usernames, and therefore out of tokens).
3. Raise errors only with short child-safe text, because the text reaches the screen.
4. Never log the whole event (it holds the username, attributes and client metadata).
5. Never touch groups. The function's IAM role needs only CloudWatch Logs.

How an account could still get stuck, and the guard for each (PROPOSAL):
- Trigger returns the event unchanged (a bug): the user is created `UNCONFIRMED` and the username is taken. Guard:
  unit test on the handler; a release smoke check that signs up a throwaway user and asserts `UserConfirmed == true`;
  runbook entry for `AdminConfirmSignUp`.
- Trigger throws or times out: sign-up fails cleanly, no user is created. Guard: alarm on the function's `Errors`.
- Whether Cognito ever removes long-unconfirmed users automatically: UNVERIFIED (nothing found on the pages read).

### 1.3 What breaks without a verified contact

- Self-service reset: "the forgot-password flow requires a verified email or phone number"; without one "the user is
  locked out of the account". VERIFIED [C2].
- Cognito "replies to password-reset requests from users who don't have a valid recovery method with an
  `InvalidParameterException`". VERIFIED [C3].
- `AccountRecoverySetting` value `admin_only` "turns off self-service account recovery ... You cannot use `admin_only`
  with any other account recovery mechanism." VERIFIED [C3].
- The recovery setting "determines whether your sign-in pages display a link where users can reset their password".
  VERIFIED [C19].
- Also unavailable without contact data: email/SMS MFA, passwordless OTP, and threat-protection notifications.
  VERIFIED [C10][C35].

### 1.4 Administrator password reset (supports AC-02)

| Operation | Behaviour | Fit here |
|---|---|---|
| `AdminSetUserPassword`, `Permanent=true` | Password is usable immediately; status becomes `Confirmed`. VERIFIED [C4] | **Recommended** routine reset |
| `AdminSetUserPassword`, `Permanent=false` | Status `FORCE_CHANGE_PASSWORD`; next sign-in returns the `NEW_PASSWORD_REQUIRED` challenge; if unused before the temporary password expires, the admin must repeat the operation. VERIFIED [C4] | Works; one more screen for a child |
| `AdminResetUserPassword` | Sets `RESET_REQUIRED` and sends a code like `ForgotPassword`; "To use this API operation, your user pool must have self-service account recovery configured." AWS adds: "Use AdminSetUserPassword if you manage passwords as an administrator." VERIFIED [C5] | **Do not use** |

Other verified facts: both operations require IAM credentials [C4][C5]; temporary password validity is
`TemporaryPasswordValidityDays`, 0–365, default 7 [P1]; managed login gives 8 minutes for the forced password change
page [C38]; `AdminSetUserPassword` counts the user as a monthly active user while `AdminResetUserPassword` does not
[C36].

UNVERIFIED: whether `AdminSetUserPassword` revokes existing refresh tokens. PROPOSAL: the runbook calls
`AdminUserGlobalSignOut` straight afterwards (it "revokes all of the target user's refresh, ID, and access tokens"
VERIFIED [C25]).

PROPOSAL — runbook for AC-02: the owner, using their own IAM identity (console or CLI), looks the user up by username,
runs `AdminSetUserPassword` with `Permanent=true` and a password agreed in person, then `AdminUserGlobalSignOut`.
No application Lambda is given these permissions.

### 1.5 Password policy and lockout

VERIFIED [P1][C3][C36][C38]:
- `MinimumLength` 6–99; passwords up to 256 characters.
- Optional requirements: lower case, upper case, numbers, symbols.
- `PasswordHistorySize` 0–24 — Essentials or Plus only.
- Passwords for local users do not expire automatically.
- Built-in lockout: after five failed password attempts the user is locked for 1 second, doubling per further failure
  up to about 15 minutes; it resets after a successful sign-in or 15 quiet minutes; "subject to change"; not
  configurable.

PROPOSAL (initial setting, owner's call): `minimum_length = 8`, `require_lowercase = true`, numbers/symbols/upper case
not required, no password history. Reason: children aged 5–7 must be able to type it; the data is low sensitivity; the
built-in lockout slows guessing. Stricter policy for the operator (see 4.3).

---

## 2. (b) Managed login versus in-app sign-in

### 2.1 Feature plans (tiers)

VERIFIED [C9][C10][C37]:

| | Lite | Essentials (default for new pools) | Plus |
|---|---|---|---|
| Sign-up/sign-in, groups, Lambda triggers, OAuth 2.0/OIDC server, resource servers | yes | yes | yes |
| Login pages | classic hosted UI only | managed login + classic | managed login + classic |
| Branding | logo + limited CSS file | visual branding editor | branding editor |
| Managed login localisation (`lang`) | no | yes | yes |
| Access-token customisation (pre token generation V2/V3) | no | yes | yes |
| Password history, passkeys, e-mail MFA/OTP, session management | no | yes | yes |
| TOTP and SMS MFA | yes | yes | yes |
| Threat protection (compromised credentials, adaptive authentication, activity logs) | no | no | yes |
| AWS WAF web ACL association | yes | yes | yes |
| Price as read on the pricing page today | first 10,000 MAU free | first 10,000 MAU free, then $0.015/MAU | no free tier, $0.020/MAU |

Other VERIFIED points: the plan is per pool, set by `UserPoolTier` (`LITE | ESSENTIALS | PLUS`); it can be switched
"at any time", though some switches need features turned off first [C9]. The Lite/Essentials free allowance "does not
automatically expire" [C37] (prices were read through a summarising tool; re-check before quoting them in the plan).

What each tier changes for this product (PROPOSAL):
- **Lite**: enough only for the in-app SRP design; managed login is unavailable.
- **Essentials**: required for managed login; free at family scale. **Recommended.**
- **Plus**: poor fit. No free tier, and its automated responses assume e-mail or MFA (see 5.1).

### 2.2 Managed login facts

VERIFIED:
- Managed login needs a user pool domain. Managed login and the classic hosted UI are alternatives per domain. [C11]
- An app client created by API (therefore by Terraform) has no style: "Managed login isn't available for an app
  client created with an AWS SDK until you create one with a `CreateManagedLoginBranding` request." [C11]
- **Text is fixed**: "you can't modify the text that's displayed on your managed login pages, except to apply
  localization". Languages: de, en, es, fr, id, nl, it, ja, ko, pt-BR, zh-CN, zh-TW. There is no en-GB variant. [C11][C12]
- "You can't directly edit the fields in managed login and the hosted UI"; the form follows pool configuration. For
  each required attribute, the sign-up page prompts for a value. [C19]
- Brandable items: light/dark/adaptive mode, spacing, border radius, page background image or colour, form alignment
  and logo, primary colour, header/footer, buttons, inputs, links, favicon, error/success indicators. Image types
  png/svg/jpeg (ico/svg for favicons); a branding request is limited to 2 MB. One style per app client; up to 20
  styles per pool. [C12][C36]
- Optional "Terms of use" and "Privacy policy" links can be shown on the sign-up page (`CreateTerms`; both documents
  must be defined). [C11]
- **One-hour session cookie**: after sign-in "users can sign in again with the same authentication method for one
  hour" without credentials; the hour is not extended by cookie sign-ins. [C11]
- Managed login covers sign-up, sign-in and password management only; no profile self-service. [C11]
- An authentication prompt left for more than five minutes is cancelled with "Something went wrong". [C11]
- No custom Lambda challenge flows in managed login. [C11][C38]
- Pages: `/login`, `/signup` ("The /login page directs your user to /signup when they select Sign up"; can also be
  linked directly "with same parameters as `/oauth2/authorize`"), `/confirm`, `/forgotPassword`, `/logout`. [C41]
- AWS caution: managed login "work[s] best when you configure your user pool to Allow Cognito to automatically send
  messages to verify and confirm. ... When you instead confirm users as a user pool administrator, your login pages
  display an error message after sign-up." [C11] That sentence is about administrator confirmation; the page says
  nothing about pre sign-up auto-confirmation.

**Does the managed login sign-up page work for a username-only pool with auto-confirm?**
- Documented: the form asks for username, password and required attributes only [C19]; it runs the pre sign-up
  trigger [C33].
- UNVERIFIED: what the user sees after submitting when the trigger auto-confirms and there is no e-mail. A search
  snippet of the AWS Knowledge Center article "How do I automatically confirm users in Amazon Cognito?" says that
  after hosted-UI sign-up the user "is redirected to the callback URL without OTP verification"; the article itself
  returned HTTP 403 to my fetch, and it describes the hosted UI rather than the newer managed login.
- UNVERIFIED: whether the "Sign up" link can be hidden for one app client while self-registration is on for the pool.
- Conclusion: treat as a Milestone 0 spike item with a pass/fail result (section 12). Fallback if it fails: an in-app
  sign-up form that calls the public `SignUp` API, then starts managed login with `login_hint=<username>` (managed
  login pre-fills the username field — VERIFIED [C14]).

### 2.3 Authorisation-code flow with PKCE for a public client

Endpoints. VERIFIED [C14][C15][C16][C28]:

| Purpose | URL |
|---|---|
| Start sign-in (browser redirect) | `GET https://<pool-domain>/oauth2/authorize` |
| Exchange code / refresh (browser `fetch`) | `POST https://<pool-domain>/oauth2/token` |
| Sign out (browser redirect) | `GET https://<pool-domain>/logout` |
| Revoke a refresh token | `POST https://<pool-domain>/oauth2/revoke` |
| User info | `GET https://<pool-domain>/oauth2/userInfo` |
| Discovery | `https://cognito-idp.<region>.amazonaws.com/<userPoolId>/.well-known/openid-configuration` |
| Signing keys | `https://cognito-idp.<region>.amazonaws.com/<userPoolId>/.well-known/jwks.json` |

Protocol details. VERIFIED:
- `/oauth2/authorize` parameters: `response_type=code`, `client_id`, `redirect_uri`, `state` (recommended; must not be
  URL-encoded JSON — base64 it), `scope`, `code_challenge_method` (**only `S256`**), `code_challenge`, `nonce`, `lang`,
  `login_hint`, `prompt` (`none` / `login`, managed login only), `resource`. [C14]
- If `scope` is omitted, all scopes allowed on the client are issued. [C14][C15]
- The authorisation code is valid for five minutes. [C14]
- A public client sends `client_id` in the token request body; no `Authorization` header and no secret. `redirect_uri`
  must equal the one used at `/authorize`; `code_verifier` is required when a challenge was sent. [C15]
- The token endpoint returns `Access-Control-Allow-Origin: *`; AWS explicitly says a browser SPA can complete code +
  PKCE against it. [C15][C11]
- A refresh token is returned only for `grant_type=authorization_code`. [C15]
- PKCE is used when the client sends `code_challenge`; none of the pages read documents an app-client setting that
  makes PKCE mandatory. [C14][C17] (So "PKCE is enforced by Cognito" must not be claimed; the library always sends it.)
- AWS guidance: "As a best security practice in public-client apps, activate only the authorization-code grant OAuth
  flow, and implement Proof Key for Code Exchange (PKCE)". The implicit grant cannot use PKCE and returns no refresh
  token. [C18]
- Callback URLs must be absolute, pre-registered, without a fragment, and HTTPS "except for `http://localhost` for
  testing purposes only". Up to 100 callback and 100 logout URLs per client. [C18][C36]
- `/logout` needs `client_id` plus `logout_uri` (must be one of the client's allowed sign-out URLs) or `redirect_uri`.
  It clears the browser session; it "doesn't revoke any tokens". [C16]
- Whether an app client has a secret cannot be changed after creation. [C18][C39]

Required app-client settings (PROPOSAL built from the verified options above):
- `generate_secret = false`
- `allowed_oauth_flows_user_pool_client = true`, `allowed_oauth_flows = ["code"]` (never `implicit`)
- `allowed_oauth_scopes = ["openid", "<resource-server>/<scope>"]` — leave out `aws.cognito.signin.user.admin`,
  `email`, `phone`, `profile`
- `supported_identity_providers = ["COGNITO"]`
- `callback_urls` / `logout_urls`: exact HTTPS URLs on the app's own hostname (see section 11)

### 2.4 Honest comparison

| Topic | Managed login + code + PKCE | In-app form + `USER_SRP_AUTH` through the SDK |
|---|---|---|
| Meets the spec sentence "authorisation-code/PKCE flow without an embedded client secret" | **Yes** | **No** — not an OAuth grant. Still no client secret, and AWS says "use SRP authentication for username and password authentication in custom-built applications" (VERIFIED [C18]) |
| Access-token `scope` | Whatever was requested and allowed, e.g. `openid game/play`; custom scopes work (VERIFIED [C22][C26]) | Always exactly `aws.cognito.signin.user.admin` (VERIFIED [C22][C26]) |
| Route `authorizationScopes` | Useful: per-client custom scopes; rejects ID tokens | Only one possible value; still rejects ID tokens |
| Can the browser token call Cognito self-service APIs (`UpdateUserAttributes`, `ChangePassword`, `DeleteUser`, `GlobalSignOut`)? | Not if `aws.cognito.signin.user.admin` is left off the client (those APIs are access-token authorised — VERIFIED [C21][C22]) | Yes, always; limit with attribute read/write permissions |
| Where the password is typed | On Cognito's page; application code never sees it | In the app's own form; JavaScript handles it. SRP does not send the password itself |
| Needs a user pool domain | Yes | No |
| Minimum tier | Essentials | Lite |
| Wording and layout | Fixed adult English text; colours, logo and background only (VERIFIED [C12]) | Fully child-friendly: big buttons, pictures, own wording |
| Sign-up for this pool | Behaviour UNVERIFIED (2.2) | Documented: `SignUp` returns `UserConfirmed: true`; the app can sign in straight away |
| Re-authentication | Full-page redirect: the SPA unloads and reloads | A dialog over the paused game; nothing unloads |
| Shared laptop | One-hour cookie can silently sign the previous child back in unless sign-out goes through `/logout` | No cookie; sign-out is local plus token revocation |
| States the learner must code | Almost none (Cognito pages handle wrong password, forced password change, lockout) | Wrong password, lockout, `NEW_PASSWORD_REQUIRED`, reset-required, etc. |
| Operator MFA | Managed login prompts for TOTP set-up when MFA is required (VERIFIED [C19]) | The app must build TOTP enrolment screens |
| Effort for a learner | Low for sign-in; medium for redirect handling and state restore | Medium: more screens and states, simpler mental model, no redirects |
| Reversibility | With aws-amplify v6 the switch is mostly `signInWithRedirect()` ↔ `signIn()`, plus route-scope configuration | Same |

### 2.5 Recommendation and runner-up (PROPOSAL)

**Recommended: managed login + authorisation code + PKCE, on the Essentials plan.**
- Operator (admin) app: managed login without reservation. The user is an adult; fixed wording is fine; required
  TOTP comes with no application code.
- Player app: managed login as the baseline, because it is what the approved specification states and it puts the
  least security-sensitive code in a learner's hands. The game's own Landing screen carries the child-friendly
  wording and two large buttons; both lead to the branded Cognito page.
- This is conditional on the Milestone 0 spike in section 12 (sign-up behaviour, wording acceptable to the family).

**Runner-up: in-app sign-in and sign-up with `USER_SRP_AUTH` for the player app** (operator app stays on managed
login). It is the better experience for five-to-seven-year-olds and the simpler answer to AC-33, and it relies only on
documented behaviour. It is a deviation from the spec's PKCE sentence, so the plan must label it as such and let the
owner approve it; it must not be adopted silently.

Keep the backend indifferent to the choice (PROPOSAL): identify the caller by `sub`; check `token_use == "access"` in
the Lambda; make route scopes a Terraform variable.

---

## 3. (c) Tokens and the HTTP API JWT authoriser

### 3.1 Token contents

VERIFIED [C22][C23]:

| Claim | Access token | ID token |
|---|---|---|
| `sub` | yes | yes |
| `iss` | `https://cognito-idp.<region>.amazonaws.com/<userPoolId>` | same |
| App client | **`client_id`** | **`aud`** |
| `aud` | absent, unless the sign-in asked for a resource binding (`resource=` parameter), in which case it is that URL | app client ID |
| `token_use` | `access` | `id` |
| `scope` | yes | no |
| Username | `username` | `cognito:username` |
| `cognito:groups` | **yes** (array of group names) | yes ("always an array") |
| User attributes (email, birthdate, `custom:*` …) | no | **yes — every attribute the client can read, subject to scopes** |
| `auth_time`, `exp`, `iat`, `jti`, `origin_jti`, `event_id` | yes | yes |

More VERIFIED facts:
- "The purpose of the access token is to authorize API operations." [C22]
- Access and ID tokens are signed with different keys (RS256). [C22]
- With scope `openid` alone, the ID token and `userInfo` contain all client-readable attributes; adding `email` /
  `phone` / `profile` narrows the set. [C26][C27]
- Both token types now document a `sid` claim when session tracking is switched on (off by default, Essentials/Plus).
  [C22][C40]
- AWS warns that token schemas grow over time; parse tolerantly. [C23][C26]
- Issuer formats: the "original" issuer above is "the current default"; an "updated" issuer
  `https://issuer-cognito-idp.<region>.amazonaws.com/<userPoolId>` also exists and is "recommended". [C28]
  PROPOSAL: stay on the default issuer; how a pool is switched and whether Terraform exposes it were not checked
  (UNVERIFIED). The authoriser's `issuer` must equal the token's `iss` exactly, so check `iss` in the spike.

### 3.2 How the authoriser validates a Cognito access token

VERIFIED [A1][A3]:
1. Reads the token from `identitySource`, with or without a `Bearer` prefix.
2. Verifies the signature with the key from the issuer's `jwks_uri` (RSA algorithms only). Keys are cached for up to
   two hours.
3. Checks claims:
   - `kid` matches a key in the JWKS.
   - `iss` equals the configured `issuer`.
   - "`aud` or `client_id` – Must match one of the `audience` entries ... API Gateway validates `client_id` only if
     `aud` is not present. When both `aud` and `client_id` are present, API Gateway evaluates `aud`."
   - `exp`, `nbf`, `iat` are sane.
   - `scope` or `scp` contains at least one of the route's `authorizationScopes`.
4. A bad audience gives `401 {"message":"Unauthorized"}` with a `www-authenticate` header explaining why.

AWS's own summary for Cognito: "Set the issuer to your user pool endpoint ... Set the audience to your app client ID.
API Gateway matches the audience against the token's `aud` claim, or against the `client_id` claim when the token has
no `aud` claim." VERIFIED [C29].

Settings (VERIFIED formats; PROPOSAL values):
- `issuer = "https://cognito-idp.eu-west-2.amazonaws.com/<userPoolId>"`. In Terraform the pool's `endpoint` attribute
  is `cognito-idp.REGION.amazonaws.com/<id>` without the scheme, so the value is `"https://${...endpoint}"`. [T1][T6]
- `audience = [<app client ID>]`.
- `identity_sources = ["$request.header.Authorization"]`.
- Do not request a resource binding at first. If one is added later, `aud` becomes the resource URL and the
  authoriser's audience must change to that URL. [C29]

Important consequence (reasoning from the verified rules): an **ID token also passes** the issuer and audience checks,
because its `aud` is the same client ID. AWS notes "There is no standard mechanism to differentiate JWT access tokens
from other types of JWTs ... we recommend that you configure your routes to require authorization scopes." VERIFIED
[A1]. PROPOSAL: every route sets `authorization_scopes`, and the Lambda also checks `token_use == "access"`.

Revocation: "revoked tokens will still be valid if they are verified using any JWT library that verifies the signature
and expiration". VERIFIED [C25]. API Gateway therefore honours a revoked or signed-out access token until `exp`.
PROPOSAL: accept a 60-minute window.

### 3.3 `authorizationScopes` with Cognito tokens

- Any-of match against the `scope` claim. VERIFIED [A1].
- Custom scopes are `<resource-server-identifier>/<scope-name>`, enabled per app client, and reach a user's token only
  when sign-in starts at `/oauth2/authorize`. "`InitiateAuth` and `AdminInitiateAuth` requests only produce a `scope`
  claim in the access token with the single value `aws.cognito.signin.user.admin`." VERIFIED [C26].
- A pre token generation trigger at event version `V2_0` can add or suppress scopes on SDK tokens; it needs Essentials
  or Plus. VERIFIED [C32].
- Scopes say which **client** issued the token, never who the user is: every user who signs in through a client gets
  that client's scopes. (Reasoning from [C26]; PROPOSAL.)
- Status code when the scope is missing: UNVERIFIED on an AWS page (the CDK authoriser README says 403). Confirm in
  the spike.

PROPOSAL (managed login design): a resource server per pool with one scope each, e.g. `game/play` on the player
client and `ops/content` on the operator client; player routes require the first, admin routes the second.
PROPOSAL (SRP runner-up): player routes require `aws.cognito.signin.user.admin`, the only scope those tokens have.

### 3.4 Where claims appear in the Lambda event (payload format 2.0)

VERIFIED [A2] — relevant part of the documented example:

```json
"requestContext": {
  "authorizer": {
    "jwt": {
      "claims": { "claim1": "value1", "claim2": "value2" },
      "scopes": [ "scope1", "scope2" ]
    }
  }
}
```

- Python access: `event["requestContext"]["authorizer"]["jwt"]["claims"]["sub"]`. [A1][A2]
- `payloadFormatVersion` must be given explicitly when the integration is created outside the console. [A2]
- UNVERIFIED: how array claims such as `cognito:groups` are serialised (the AWS example shows only string values;
  community reports describe a single string rather than a JSON array). PROPOSAL: capture one real event in the
  spike, write the parser to accept a list or a string, compare whole group names exactly (no substring match), and
  keep the captured event as a test fixture.
- PROPOSAL: log `sub` and the request ID only; never log the `Authorization` header, the full claims map or the
  username.

### 3.5 Lifetimes, refresh, rotation, revocation, sign-out

VERIFIED [C22][C23][C24][C25][C36]:

| Item | Range / behaviour |
|---|---|
| Access token | 5 minutes – 1 day, per app client |
| ID token | 5 minutes – 1 day, per app client |
| Refresh token | 60 minutes – 10 years (3,650 days), default 30 days, per app client |
| Managed login caveat | Do not set access/ID tokens below one hour with managed login: the one-hour cookie still allows silent re-authentication |
| Refresh window | Counted from sign-in. Rotation "doesn't extend the window" |
| Ways to refresh | `GetTokensFromRefreshToken` API; `InitiateAuth` with `REFRESH_TOKEN_AUTH`; token endpoint `grant_type=refresh_token` |
| Rotation | Optional per client; each refresh returns a new refresh token; old one can be given a grace period of up to 60 seconds; AWS calls enabling it a best practice; incompatible with `REFRESH_TOKEN_AUTH` |
| Revocation | Enabled by default on new clients; `RevokeToken` or `/oauth2/revoke` revokes one refresh token and the access/ID tokens derived from it |
| `GlobalSignOut` | Authorised by the user's access token; revokes all of that user's tokens |
| `AdminUserGlobalSignOut` | IAM-authorised; same effect for any user |
| After global sign-out | The managed login cookie can still sign the user back in; send the browser to `/logout` |
| Disabling a user | Revokes refresh and access tokens |

PROPOSAL — initial values:
- Access and ID tokens: 60 minutes.
- Player refresh token: 90 days (children forget passwords and reset needs the owner). Operator: 1 day.
- `enable_token_revocation = true`.
- Refresh-token rotation: **off at first** for the player client. Reason: a refresh response lost on a flaky
  connection leaves the browser holding a rotated-out token, which forces a full sign-in exactly when the game has
  unsynchronised progress. AWS recommends rotation, so record this as a conscious trade-off to revisit. Rotation
  **on** for the operator client.

---

## 4. (d) Admin separation

### 4.1 Verified building blocks

- Group membership is changed only by `AdminAddUserToGroup` / `AdminRemoveUserFromGroup`, both listed under
  "IAM-authorized user operations". The lists of unauthenticated and token-authorised operations contain no group
  operation. VERIFIED [C21][C30].
- `cognito:groups` is in both access and ID tokens. VERIFIED [C22][C30]. Tokens are signed, so the claim cannot be
  forged.
- A pre token generation trigger can override or suppress `cognito:groups`; no other claim with the `cognito:`
  prefix can be added or changed. VERIFIED [C32]. So such a trigger is the only non-IAM code path that can alter the
  claim — do not deploy one unless needed, and never let it add groups.
- Limits: 10,000 groups per pool; 100 groups per user. VERIFIED [C36].
- Attribute permissions: "When you don't specify `WriteAttributes` for an app client, the app client has write access
  to all standard and custom attributes. Users can change the value of these attributes for themselves with
  `UpdateUserAttributes`." and "Your application ... might make authorization decisions based on an attribute. In that
  case, remove the attribute from the `WriteAttributes` of every app client". VERIFIED [C6]. **Never base
  authorisation on a user attribute.**
- `PreventUserExistenceErrors`: API default is `LEGACY`; `ENABLED` makes sign-in return a generic "Incorrect username
  or password". AWS advises using it with SRP only in pools without alias attributes — which this pool is.
  **`SignUp` always returns `UsernameExistsException`** when a name is taken. VERIFIED [C31].
- Self-registration is a pool-level switch (`AdminCreateUserConfig.AllowAdminCreateUserOnly`). VERIFIED [T1][C8].
- In a pool where MFA is required, managed login pages "automatically prompt users to set up their additional
  factor"; where MFA is optional they do not prompt. TOTP MFA is available on every plan. VERIFIED [C19][C9].
- Distinct authorisers can be attached to different routes of one HTTP API. VERIFIED [A1].

### 4.2 Auth flows to enable (`explicit_auth_flows`)

VERIFIED meanings [C20][T2]: `ALLOW_USER_SRP_AUTH` (SRP), `ALLOW_USER_PASSWORD_AUTH` (password sent to Cognito in the
request), `ALLOW_ADMIN_USER_PASSWORD_AUTH` (server-side, IAM), `ALLOW_CUSTOM_AUTH` (Lambda challenges),
`ALLOW_USER_AUTH` (choice-based: password, passkey, OTP), `ALLOW_REFRESH_TOKEN_AUTH`.

PROPOSAL:
- Never enable `ALLOW_USER_PASSWORD_AUTH`, `ALLOW_ADMIN_USER_PASSWORD_AUTH`, `ALLOW_CUSTOM_AUTH`, the implicit grant
  or client credentials on these clients.
- Managed login clients: the smallest set that still lets the login page accept a password. UNVERIFIED which that is
  ([C19] mentions `ALLOW_USER_AUTH` and `ALLOW_USER_PASSWORD_AUTH` only as examples). Start with
  `["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]` and settle it in the spike. Tokens obtained by calling the
  SDK directly against such a client carry only `aws.cognito.signin.user.admin`, so they fail the route scope check.
- SRP runner-up: `["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]`.
- Where rotation is on, AWS says to disable `REFRESH_TOKEN_AUTH` [C24]; confirm the exact list in the spike.

### 4.3 One pool with two app clients, or two pools?

| Topic | A: one pool, two public clients, `admin` group | B: two pools (players; operators) |
|---|---|---|
| Can a self-registered player pass the gateway on an admin route? | Yes, by signing in through the admin client (it is public and shares the directory): issuer, audience and client scope all match. Only the Lambda's group check stops them — unless a pre token generation trigger refuses to issue admin-client tokens to non-members | **No.** The operator pool has no self sign-up and a different issuer, so a player's token fails the admin authoriser at the gateway |
| A forgotten group check on a new admin route | Privilege escalation | Still blocked at the gateway |
| Public sign-up abuse | Lands in the same directory as the operator | Cannot touch the operator directory |
| Operator MFA | Pool-wide MFA must be `OPTIONAL` (children have none); the app would have to build TOTP enrolment | Operator pool sets MFA `ON` with TOTP; managed login handles enrolment |
| One-hour login cookie | Shared login domain: a child's cookie can sign them into the admin client silently (then 403), and the operator's cookie into the game | Separate domains; no crossover |
| "Sign up" link on the admin login page | Present if self-registration is on (hiding per client UNVERIFIED); needs a pre sign-up check on `callerContext.clientId` | Not applicable (`allow_admin_create_user_only = true`) |
| Terraform | 1 pool, 1 domain, 2 clients, 2 styles, 1 group | 2 pools, 2 domains, 2 clients, 2 styles, 1 group — roughly five more resources, mostly a repeat |
| Frontend | Two builds, same issuer | Two builds, different configuration (they are separate builds and hostnames anyway) |
| Cost | Free at this scale | Free at this scale |
| Matches "separately authorised admin role/group" in the spec | Yes | Yes (keep the `admin` group in the operator pool and check it too) |

**Recommendation (PROPOSAL): B, two pools.** It is the only arrangement where "a normal signup must never be able to
request or grant admin membership" holds by construction rather than by every handler remembering a check, and it
gives required TOTP for the operator without writing any MFA screens. The extra Terraform is small and repetitive.

**Runner-up (PROPOSAL): A.** It is the conventional pattern and fine at family scale if all of these are in place:
separate authoriser per client; route scopes per client; the Lambda checks `cognito:groups` on every admin route
through one shared helper; an automated test for AC-04 that signs a normal account in through the admin client and
expects 403; a pre sign-up rule rejecting sign-ups whose `callerContext.clientId` is the admin client.

Moving from A to B later is cheap: only operator accounts move, and they can simply be re-created.

### 4.4 Making sure a self-registering user cannot become an operator (PROPOSAL checklist)

1. Operators are created only by the owner with IAM credentials (`AdminCreateUser`, then `AdminAddUserToGroup`), as a
   runbook step — not by a Lambda and not by Terraform holding a password.
2. No Lambda execution role is granted `cognito-idp:AdminAddUserToGroup`, `AdminCreateUser`,
   `AdminUpdateUserAttributes`, `AdminSetUserPassword` or `UpdateUserPool*`.
3. The pre sign-up function has no Cognito permissions at all.
4. No post confirmation trigger. No pre token generation trigger unless a specific need appears; if one is added it
   only ever suppresses.
5. Admin routes: operator-pool authoriser (design B) or admin-client authoriser (design A); required scope; Lambda
   checks `token_use == "access"` and that the groups claim contains exactly `admin`.
6. Authorisation never reads user attributes, the username, the hostname or the `Origin` header.
7. An EventBridge rule on CloudTrail management events for `AdminAddUserToGroup`, `AdminCreateUser` and
   `UpdateUserPool` notifies the existing alert topic. (CloudTrail event names UNVERIFIED — confirm when building.)
8. Tests for AC-03/AC-04: player token on admin route → rejected; ID token on any route → rejected; operator token
   without the group → rejected.

### 4.5 App-client attribute read/write permissions

VERIFIED [C6][C18]: a new client reads and writes all attributes unless told otherwise; the ID token "only contains
claims that correspond to the readable attributes"; `GetUser` returns only readable attributes.

PROPOSAL: store nothing in Cognito attributes (section 6), and additionally narrow `read_attributes` and
`write_attributes` on both clients to one harmless standard attribute. UNVERIFIED: how to express "none" — an empty or
omitted list means "all" [C6] — so verify the final shape in the spike. In the managed login design the token cannot
call `UpdateUserAttributes` anyway, because the `aws.cognito.signin.user.admin` scope is not issued.

---

## 5. (e) Abuse controls for public self sign-up without verification

### 5.1 What exists

| Control | Facts | Status |
|---|---|---|
| API rate quotas | `UserCreation` (SignUp, ConfirmSignUp, AdminCreateUser, AdminConfirmSignUp): 50 requests/second per account per Region, shared across pools. `UserAuthentication`: 120 rps. `UserAccountRecovery`: 30 rps. Per-user limit 10 rps. Pool domain: 300 rps per source IP, 300 per app client, 500 per domain. These are ceilings, not protection. | VERIFIED [C36] |
| AWS WAF web ACL on the pool | Available on all plans; one web ACL per pool; covers managed login/hosted UI endpoints and the public (non-IAM) API operations such as `InitiateAuth` and `GetUser`. WAF runs before Cognito throttling; blocked requests do not count against quotas. | VERIFIED [C34] |
| WAF visibility | Rules cannot see usernames, passwords, e-mail or phone. API requests carry `x-amzn-cognito-operation-name` and `x-amzn-cognito-client-id`; managed login requests carry only the client-id header and no body. | VERIFIED [C34] |
| CAPTCHA | "You can only present a CAPTCHA for your user to solve in managed login." SDK and CLI callers get `ForbiddenException` on Block or CAPTCHA. | VERIFIED [C34] |
| WAF Fraud Control | ATP rule group cannot be associated with a user pool. "The ACFP feature is not available for Amazon Cognito user pools." | VERIFIED [C34][W1] |
| WAF billing | Billed separately by AWS WAF. Figures not checked. | VERIFIED [C34]; prices UNVERIFIED |
| Threat protection (Plus) | Compromised-credential check at sign-up, sign-in and password change (not for SRP sign-in); adaptive authentication; IP always-block/always-allow lists; activity logs. "Threat protection doesn't apply rate limits." | VERIFIED [C35] |
| Threat protection side effects | A compromised-credentials block sets the user to `RESET_REQUIRED`; adaptive responses are "require MFA", "notify by e-mail" or "block". All assume contact data or MFA. | VERIFIED [C35] |
| Pre sign-up trigger | Can reject any sign-up; sees `userName`, `callerContext.clientId`, `validationData`, `clientMetadata`. | VERIFIED [C1][C33] |
| Registration kill switch | `allow_admin_create_user_only = true` closes self sign-up for the pool. | VERIFIED [T1] |
| Built-in password lockout | Exponential, per user (section 1.5). | VERIFIED [C38] |
| Billing exposure | A user is a monthly active user if any identity operation concerns them in the month, sign-up included. Beyond the free allowance each one is billed. | VERIFIED [C36][C37] |

### 5.2 Proportionate recommendation for a family-scale app (PROPOSAL)

Baseline (cheap, build in the first release):
1. Username validation in the pre sign-up trigger (section 1.2).
2. A simple **daily sign-up cap** in the same trigger: a DynamoDB counter item keyed by date, incremented with a
   conditional update; over the cap (say 20 per day, a Terraform variable) the trigger rejects with a friendly
   message. This bounds both junk accounts and the bill. It needs `dynamodb:UpdateItem` on one item and must stay
   well inside the five-second limit.
3. A CloudWatch alarm on sign-up volume routed to the existing notification topic (count the trigger's invocations).
4. The kill switch as a documented one-variable Terraform change.
5. A scheduled clean-up of accounts that never created a game profile after N days (PROPOSAL; also data
   minimisation). This job is the one place a Lambda would need `cognito-idp:ListUsers` and `AdminDeleteUser`; scope
   it to the player pool only.
6. `prevent_user_existence_errors = "ENABLED"`.

Add when the first sign of abuse appears, or sooner if the owner prefers:
7. A WAF web ACL on the **player** pool with one rate-based rule per source IP. In the managed login design a CAPTCHA
   action on the sign-up path is possible; in the SRP design only blocking is.

Not recommended: the Plus plan (no free tier; its automated responses do not fit accounts without e-mail).

Optional product decision for the owner, not a default: a "family code" checked by the pre sign-up trigger. It needs
a custom sign-up form (managed login cannot add fields — VERIFIED [C19]) and it narrows "public self sign-up", so it
would be a labelled scope change.

Residual risk to state honestly: anyone can test whether a username exists through `SignUp` [C31]. Mitigation is to
keep usernames non-identifying (on-screen hint: "Don't use your real name").

---

## 6. (f) Where nickname, avatar and date of birth live

VERIFIED:
- AWS: "Don't store all information about your users in attributes ... keep user data that changes frequently ... in
  a separate data store, such as ... Amazon DynamoDB." [C6]
- Readable attributes appear in the ID token and in `userInfo`; `openid` alone returns all of them; `profile` covers
  `nickname`, `picture`, `birthdate` and all custom attributes. [C23][C26][C27]
- Custom attributes can never be removed, renamed or retyped; maximum 50. [C6]
- Attributes are shared by all app clients of a pool. [C6]
- Every Lambda trigger event includes `request.userAttributes`. [C33]
- The username is in every token (`username` / `cognito:username`). [C22][C23]

| | Cognito attributes | DynamoDB profile item keyed by `sub` |
|---|---|---|
| DOB could reach a token | Yes, unless every client's read list and scopes are kept right forever | No |
| DOB in trigger events / trigger logs | Yes | No |
| Change rules (run pinning, separate resets) | Hard to express | Normal application logic |
| Schema changes | Irreversible | Free |
| Deletion | Part of the Cognito user | Explicit delete of owned items |
| Single source of truth for the game | No (split) | Yes |

**Recommendation (PROPOSAL): DynamoDB only.** Cognito holds exactly: username, password verifier, `sub`, and group
membership for operators. Profile setup is a normal authenticated API call after first sign-in (the spec already
lists "Create/complete own profile after Cognito signup").

Supporting measures (PROPOSAL):
- The age band is derived on the server; only the profile-edit screen ever receives the date of birth.
- Handlers and API access logs never record request bodies for profile routes; structured logs carry `sub` only.
- Speech requests and audio cache keys are built from content identifiers, never from profile fields.
- The pre sign-up trigger logs nothing from the event.

---

## 7. (g) Offline implications — design consequences

Verified mechanics:
- Access tokens last at most one day and are checked by API Gateway only for signature, issuer, audience, time and
  scope. [C22][A1]
- Refresh needs a network call. [C24]
- The refresh token's life is counted from sign-in and is not extended by use. [C24]
- An authorisation code lasts five minutes; an idle managed login prompt is cancelled after five minutes. [C14][C11]
- The managed login cookie allows silent re-authentication for one hour after the last interactive sign-in. [C11]
- `/logout` is a browser redirect. [C16]
- aws-amplify v6.21.2 (read from the shipped source): tokens live in `localStorage` by default; a refresh failure
  clears stored tokens only for definite authentication errors (`NotAuthorizedException`, `TokenRevokedException`,
  `UserNotFoundException`, `PasswordResetRequiredException`, `UserNotConfirmedException`,
  `RefreshTokenReuseException`); network and service errors keep the tokens; a `tokenRefresh_failure` Hub event is
  dispatched either way. With OAuth configured, `signOut()` navigates to
  `https://<domain>/logout?client_id=…&logout_uri=…`. [N2]

Consequences the plan must state (PROPOSAL):

1. **Token expiry while offline is harmless on its own.** No API call is possible offline anyway. The game continues
   from the prepared pack and queues operations.
2. **On reconnect, refresh first, then upload.** Normal case: silent refresh succeeds and the queue drains.
3. **If the refresh token has expired or been revoked, interactive sign-in is required before upload** (AC-33).
   Local pending data is keyed by the owner's `sub`. After sign-in, compare the new `sub` with the owner of the
   pending queue. Same → upload. Different → do not upload, do not delete; keep it for the original account and say
   so.
4. **Redirect-based sign-in unloads the page.** Everything in JavaScript memory is gone: the Phaser scene, a wave in
   progress, React state. Therefore:
   - every checkpoint, attempt and queued operation is written to IndexedDB at the moment it happens, never only on
     exit;
   - re-authentication is never started automatically during combat. Show "Sign in again to save to the cloud" and
     redirect only from the preparation phase or when the player chooses;
   - if it happens during a wave, the wave restarts from its wave-start checkpoint, the same rule as Save and exit;
   - the OAuth `state` value carries only a short "where to return" hint, never game data;
   - returning from Cognito is a fresh load of the web app, which needs the network. That is acceptable because
     sign-in needs the network too; it is not an offline cold start.
5. **Sign-out is a redirect in the managed login design.** Offline, the browser would land on an error page and the
   loaded game would be lost (offline cold start is not promised). So while offline: disable sign-out, or do a local
   sign-out (clear tokens, show the landing screen) and finish `/logout` when next online. Warn about unsynchronised
   progress before either.
6. **Shared laptop and the one-hour cookie.** If child A signs out locally without `/logout`, child B pressing "Sign
   in" within the hour is signed in as A without a password. Always go through `/logout`; additionally send
   `prompt=login` when starting sign-in from the landing page (supported by managed login — VERIFIED [C14]).
7. **Long refresh life means few interruptions** — and it means anyone at the laptop is "that child" until sign-out.
   That is accepted under the family trust model; say it plainly.
8. **Stolen or lost device**: `AdminUserGlobalSignOut` stops refresh at once, but an already issued access token
   works at the API for up to its remaining lifetime.
9. The runner-up (in-app SRP) removes items 4, 5 and 6: re-authentication is a dialog over the paused game.

---

## 8. (h) Browser libraries

Verified today from the npm registry and shipped package files:

| Package | Latest | Published | Notes |
|---|---|---|---|
| `aws-amplify` | 6.22.2 | 2026-10-13 | Umbrella; auth lives in `@aws-amplify/auth` 6.21.2. Not deprecated. [N1] |
| `amazon-cognito-identity-js` | 6.3.22 | 2026-10-13 | Still published, not flagged deprecated, but its README opens "Developer Note: Please Update to Amplify v6 — We recommend using the Amplify JavaScript library's Auth features in place of the Amazon Cognito Identity SDK." [N3] |
| `oidc-client-ts` | 3.5.0 | 2026-03-13 | Generic OIDC client. Code + PKCE and refresh-token grant; implicit grant deliberately unsupported. Sign-in arguments include `prompt`, `login_hint`, `resource`, `state`. [N4] |
| `react-oidc-context` | 3.3.1 | 2026-03-13 | React provider and `useAuth` hook over `oidc-client-ts` (peer `^3.1.0`, React ≥ 16.14). README: `onSigninCallback` must be implemented to strip the code from the URL. [N5] |
| `aws-jwt-verify` | 5.2.1 | 2026-06-05 | AWS-recommended for verifying Cognito JWTs in Node.js; not needed here because API Gateway verifies. [N1][C29] |

aws-amplify v6 details read from the shipped type definitions and source [N2]:
- Works against an existing pool with no Amplify backend. Configuration shape:
  `Amplify.configure({ Auth: { Cognito: { userPoolId, userPoolClientId, loginWith: { username: true, oauth: { domain, scopes, redirectSignIn: [..], redirectSignOut: [..], responseType: 'code' } } } } })`.
  An identity pool is optional in the types.
- `signInWithRedirect()` builds the `/oauth2/authorize` URL and, when `responseType` is `'code'`, adds
  `code_challenge` and `code_challenge_method` from a generated verifier — **PKCE is automatic**. It also supports
  `customState`, `loginHint`, `lang`, `nonce` and `prompt`.
- It always targets `/oauth2/authorize`; there is no option to open `/signup` directly, and no `resource` option.
- `signIn({ username, password, options: { authFlowType } })` supports `USER_SRP_AUTH`, `USER_PASSWORD_AUTH`,
  `USER_AUTH`, `CUSTOM_WITH_SRP`, `CUSTOM_WITHOUT_SRP`.
- `signUp` reads `UserConfirmed`; when true the result step is `DONE` (or `COMPLETE_AUTO_SIGN_IN` if auto sign-in
  was requested).
- Refresh uses the `GetTokensFromRefreshToken` API, which is the rotation-compatible operation.
- Token storage can be replaced with `cognitoUserPoolsTokenProvider.setKeyValueStorage(...)` (documented [N6]).
- Documented [N6]: `fetchAuthSession()` returns `tokens` and refreshes expired tokens automatically;
  `forceRefresh: true` is available; `getCurrentUser()` throws when not signed in; `signOut({ global: true })` signs
  out everywhere; a `customOAuthState` Hub event returns the `customState` after the redirect.

**Recommendation for a learner (PROPOSAL): `aws-amplify` v6, importing only `aws-amplify/auth`,** configured by hand
from Terraform outputs. Reasons:
1. One maintained AWS library covers both candidate designs, so the Milestone 0 decision does not change the library.
2. It also covers the public `SignUp` call needed by the fallback sign-up form.
3. PKCE, state, refresh and `/logout` are handled; the learner writes very little security-sensitive code.
4. Its behaviour on failed refresh (keep tokens on network errors) suits the offline requirement.
5. Storage is pluggable if a different persistence choice is wanted later.

Cautions: Amplify's documentation is written mainly for Amplify-managed backends, and the pages on existing resources
do not show the OAuth block, so the plan should give the exact configuration object. Do not adopt the Amplify CLI,
Amplify hosting or the `@aws-amplify/ui-react` Authenticator (its screens are e-mail-centred and not child-oriented).

**Runner-up (PROPOSAL): `react-oidc-context` + `oidc-client-ts`.** Smaller, standards-based, and it teaches the real
protocol. Choose it only if managed login does everything (it cannot call `SignUp` or do SRP). UNVERIFIED and to be
tested if chosen: whether Cognito's discovery document provides an end-session endpoint that the library's
sign-out helper can use, or whether the `/logout` URL must be built by hand; and whether the AWS console's React quick
start still uses this pair.

Not recommended: starting new work on `amazon-cognito-identity-js` (its own README says to move to Amplify v6).

Token storage (PROPOSAL): keep the default `localStorage` so a reload keeps the session. Because any script on the
page could read it, the plan should include a strict Content-Security-Policy on the CloudFront responses and no
third-party scripts. All game data in IndexedDB is namespaced by `sub`.

---

## 9. (i) Terraform resources and key arguments (provider 6.73.0)

Names and important arguments only. All argument names VERIFIED against the provider docs [T1]–[T9]; values are
PROPOSALS. Repeat the pool/domain/client/branding set for the operator pool if design B is chosen.

**`aws_cognito_user_pool`** (players) [T1]
- `name`
- `user_pool_tier = "ESSENTIALS"`
- `deletion_protection = "ACTIVE"` (Terraform default is `INACTIVE`)
- `username_configuration { case_sensitive = false }` — immutable
- no `alias_attributes`, no `username_attributes`, no `auto_verified_attributes`, no `schema` blocks
- `account_recovery_setting { recovery_mechanism { name = "admin_only", priority = 1 } }`
- `admin_create_user_config { allow_admin_create_user_only = false }` (the kill switch is `true`)
- `password_policy { minimum_length, require_lowercase, require_numbers, require_symbols, require_uppercase, temporary_password_validity_days }`
- `mfa_configuration = "OFF"`
- `lambda_config { pre_sign_up = <function ARN> }`
- `lifecycle { prevent_destroy = true }` (core Terraform)
- exported: `id`, `arn`, `endpoint` (`cognito-idp.<region>.amazonaws.com/<id>`)
- Operator pool differences: `allow_admin_create_user_only = true`; `mfa_configuration = "ON"` with
  `software_token_mfa_configuration { enabled = true }`; stronger `password_policy`; no pre sign-up trigger.
- Provider notes: "Attributes can be added, but not modified or removed"; changing immutable settings means a new
  pool, which loses every account. The provider doc still says `password_history_size` "requires advanced security
  features", which differs from the AWS statement (Essentials or higher) — leave it unset.

**`aws_cognito_user_pool_domain`** [T3]
- `domain` (prefix only, or a full custom name), `user_pool_id`, `managed_login_version = 2`
- `certificate_arn` only for a custom domain
- Prefix domains must not contain `aws`, `amazon` or `cognito`. VERIFIED [C13].
- Custom domain requirements, if ever wanted: ACM certificate in us-east-1; the parent domain must have a DNS **A
  record**; an alias record to the Cognito-managed CloudFront distribution; up to an hour to propagate; four custom
  domains per Region. VERIFIED [C13][C36]. PROPOSAL: start with a prefix domain — it avoids a third certificate and
  another record in the separate DNS account.

**`aws_cognito_resource_server`** [T7]
- `identifier`, `name`, `user_pool_id`, `scope { scope_name, scope_description }`

**`aws_cognito_user_pool_client`** [T2]
- `name`, `user_pool_id`, `generate_secret = false`
- `allowed_oauth_flows_user_pool_client = true`, `allowed_oauth_flows = ["code"]`
- `allowed_oauth_scopes = ["openid", "<identifier>/<scope>"]`
- `supported_identity_providers = ["COGNITO"]`
- `callback_urls`, `logout_urls`
- `explicit_auth_flows` (section 4.2)
- `prevent_user_existence_errors = "ENABLED"`
- `enable_token_revocation = true`
- `access_token_validity`, `id_token_validity`, `refresh_token_validity`, `token_validity_units { access_token, id_token, refresh_token }`
- `refresh_token_rotation { feature, retry_grace_period_seconds }`
- `read_attributes`, `write_attributes`
- `auth_session_validity` (3–15 minutes, default 3)
- exported: `id`
- Depends on the resource server (the custom scope must exist first).

**`aws_cognito_managed_login_branding`** [T4]
- `user_pool_id`, `client_id`
- `use_cognito_provided_values = true` to start, later `settings = jsonencode({...})` and `asset { category, color_mode, extension, bytes }`
- Required for every Terraform-created client that uses managed login (section 2.2).

**`aws_cognito_user_group`** [T5]
- `name = "admin"`, `user_pool_id`, optional `description`, `precedence`; no `role_arn` (no identity pool)
- `aws_cognito_user_in_group` and `aws_cognito_user` exist in the provider, but PROPOSAL: do not manage people or
  membership in Terraform; keep it a manual, audited step.

**`aws_lambda_permission`** (pre sign-up) [T8]
- `action = "lambda:InvokeFunction"`, `function_name`, `principal = "cognito-idp.amazonaws.com"`,
  `source_arn = <user pool ARN>` (and `source_account`)

**`aws_apigatewayv2_authorizer`** [T6]
- `api_id`, `name`, `authorizer_type = "JWT"`, `identity_sources = ["$request.header.Authorization"]`
- `jwt_configuration { issuer = "https://${<pool>.endpoint}", audience = [<client id>] }`
- One for players, one for operators.

**`aws_apigatewayv2_route`** [T6]
- `authorization_type = "JWT"`, `authorizer_id`, `authorization_scopes = [...]`

**Optional later** [T9]
- `aws_wafv2_web_acl` (scope `REGIONAL`) + `aws_wafv2_web_acl_association { resource_arn = <user pool ARN> }`.
- Note from the same provider page: WAF can be associated with an API Gateway **REST** stage; "HTTP is unsupported".
  Relevant to whoever plans API-level abuse controls.

Not available in provider 6.73.0 (the doc paths return 404): resources for managed login terms documents and for
session-tracking configuration. Neither is needed for the first release.

Release-safety notes (PROPOSAL, based on VERIFIED [C39]): the Cognito update APIs reset unspecified settings to
defaults, so the pool must be changed only through Terraform, never by hand in the console; reviewers should treat any
plan line that says a user pool "must be replaced" as a stop.

---

## 10. (j) Data-protection note (technical measures only; not legal advice)

Flag for the owner: an online game that children in the UK are likely to use should be reviewed by the owner against
the ICO's Age appropriate design code (the "Children's Code"). The ICO says the code applies to "information society
services likely to be accessed by children" in the UK and "is not restricted to services specifically directed at
children"; its fifteen standards include data protection impact assessments, transparency, default settings and data
minimisation. VERIFIED [I1][I2]. Whether and how it applies to this project is the owner's assessment.

Technical data-minimisation measures already built into the design above (PROPOSALS):
1. No e-mail address, phone number or real name is collected by Cognito; the pool has no required attributes.
2. Usernames are restricted in format, cannot be e-mail addresses, and the UI advises against real names.
3. Date of birth is stored once, in the DynamoDB profile; never in Cognito, tokens, trigger events, audio keys or
   logs. Only the derived age band is used elsewhere.
4. Tokens carry `sub`, username, groups and scopes only; requested scopes exclude `email`, `phone`, `profile`.
5. Browser tokens cannot call Cognito self-service APIs (managed login design).
6. Logs record `sub` and request IDs; no tokens, no request bodies on profile routes.
7. Accounts without a profile are cleaned up after a set period; whole-profile reset also deletes the Cognito user.
8. No Plus-tier activity logging (which records IP, device and location per sign-in).
9. All identity data stays in eu-west-2. The login pages are served from Cognito's domain; the cookies it sets are
   listed in [C11] and can be described in the privacy notice.
10. Managed login can show links to the owner's terms and privacy documents on the sign-up page [C11] (not yet
    manageable from Terraform 6.73.0).

---

## 11. Recommended auth design — concrete settings (PROPOSAL)

Pools
- Two user pools in eu-west-2, both Essentials, both `deletion_protection = "ACTIVE"`, `prevent_destroy`.
- **Player pool**: username only; case-insensitive; no attributes; self sign-up on; pre sign-up Lambda sets
  `autoConfirmUser`; recovery `admin_only`; MFA off; password minimum 8.
- **Operator pool**: username only; self sign-up off; users created by the owner; `admin` group; MFA required (TOTP);
  recovery `admin_only`; password minimum 12 with mixed character types.

Domains and login pages
- One Cognito prefix domain per pool, `managed_login_version = 2`, one branding style per client.
- Player style: game logo, space background, large contrast buttons. Wording stays Cognito's.

App clients (public, no secret)
- Flow: authorisation code only; PKCE sent by the library.
- Player: scopes `openid` + `game/play`; callback `https://aliens.<domain>/auth/callback`; sign-out URL
  `https://aliens.<domain>/`.
- Operator: scopes `openid` + `ops/content`; callback `https://admin.aliens.<domain>/auth/callback`; sign-out URL
  `https://admin.aliens.<domain>/`.
- A separate "local development" client per pool with only `http://localhost:<port>/...` URLs, so localhost never
  sits on the production clients and can be removed in one change.
- Tokens: access/ID 60 minutes; refresh 90 days (player), 1 day (operator); revocation on; rotation off (player), on
  (operator); `prevent_user_existence_errors = "ENABLED"`.

API Gateway HTTP API
- Player authoriser: issuer = player pool, audience = player client (+ player dev client).
- Operator authoriser: issuer = operator pool, audience = operator client (+ operator dev client).
- Every route: `authorization_type = "JWT"` and a required scope. Admin routes use only the operator authoriser.
- Lambda integrations use payload format 2.0.

Lambda rules
- Caller identity = `claims["sub"]` from `requestContext.authorizer.jwt`; ownership checks on every run/profile ID.
- Reject unless `token_use == "access"`.
- Admin handlers also require the `admin` group through one shared helper.
- Profile (nickname, avatar, date of birth) lives in DynamoDB under `sub`.

Browser
- `aws-amplify` v6 (`aws-amplify/auth`): `signInWithRedirect`, `fetchAuthSession`, `signOut`.
- Sign-in from the landing page uses `prompt=login`; sign-out always goes through `/logout`; both are disabled or
  deferred while offline.
- All local game data namespaced by `sub`; pending uploads released only when the signed-in `sub` matches.

Operations
- Runbook: reset a child's password (`AdminSetUserPassword` permanent + `AdminUserGlobalSignOut`); confirm a stuck
  user (`AdminConfirmSignUp`); create an operator; close registration (kill switch).
- Alarms: pre sign-up errors; sign-up volume; privileged Cognito admin calls.
- Daily sign-up cap in the pre sign-up trigger.

## 12. Runner-up design, open risks and the Milestone 0 spike

**Runner-up (PROPOSAL)**: player app signs up and signs in inside the game with `USER_SRP_AUTH` (`signUp` / `signIn`
from the same library); no player pool domain; Lite would suffice; player routes require the
`aws.cognito.signin.user.admin` scope; attribute permissions narrowed. Operator side unchanged. Label it a deviation
from the specification's PKCE sentence, for the owner to approve.

**Second fallback inside the recommended design**: if only the managed login sign-up page disappoints, keep managed
login for sign-in and add an in-app sign-up form calling the public `SignUp` API, then start sign-in with
`login_hint`.

**Open risks**
1. Managed login sign-up for a username-only, auto-confirmed pool is undocumented (2.2).
2. Fixed adult wording on the login pages may not suit five-to-seven-year-olds; only a look with the children settles it.
3. `cognito:groups` serialisation in the Lambda event is undocumented (3.4).
4. The minimal `explicit_auth_flows` for managed login, and the list to use with rotation, are unconfirmed (4.2).
5. Whether refreshed tokens (via `GetTokensFromRefreshToken`) keep custom scopes for a managed login session is
   unconfirmed; if they did not, routes would start returning 403 after the first refresh.
6. Username enumeration through `SignUp` cannot be prevented (5.2).
7. No self-service recovery: every forgotten password needs the owner (accepted by the spec).
8. A token revoked by sign-out still works at the API until it expires (3.2).
9. Refresh-token rotation is off for players against AWS's general advice (3.5).
10. The one-hour login cookie and redirect sign-out need careful handling on a shared, sometimes-offline laptop (7).
11. Immutable pool settings: a mistake in case sensitivity or sign-in options can only be fixed by a new pool.
12. Public sign-up can run up monthly-active-user charges until the cap or WAF stops it (5).
13. Prices and WAF costs were not verified line by line.

**Milestone 0 spike (PROPOSAL)** — a throwaway pool (deletion protection off, deleted afterwards), about half a day:
1. Sign up on managed login with a username and password only. Record the fields shown and what happens after
   submit. Pass = the child ends up signed in, or on the sign-in page with a working account, with no error.
2. Confirm "Forgot your password?" is absent with `admin_only`.
3. Decode an access token and an ID token: check `iss`, `client_id`, no `aud`, `scope`, `cognito:groups`,
   `username`, and that the ID token carries no profile data.
4. Capture the Lambda event behind a JWT authoriser; save it as a fixture; note the shape of `cognito:groups` and
   `scopes`.
5. Call a scoped route with: no token; an ID token; a token from the other client/pool; a token without the scope.
   Record status codes and `www-authenticate` headers.
6. Refresh through the library; confirm scopes survive; pull the network cable and confirm tokens are kept.
7. Sign out and sign in as a second user within the hour, with and without `/logout`, with and without
   `prompt=login`.
8. `AdminSetUserPassword` permanent and temporary; confirm the managed login forced-change page works.
9. Find the smallest working `explicit_auth_flows`; find the working way to narrow read/write attributes.
10. Show the branded page to the children with a parent. Decide: recommended design, sign-up fallback, or runner-up.

---

## Sources

AWS Cognito developer guide (`https://docs.aws.amazon.com/cognito/latest/developerguide/` + page):
- [C1] `user-pool-lambda-pre-sign-up.html`
- [C2] `signing-up-users-in-your-app.html`
- [C3] `managing-users-passwords.html`
- [C6] `user-pool-settings-attributes.html`
- [C7] `user-pool-case-sensitivity.html` and API `API_UsernameConfigurationType.html`
- [C9] `cognito-sign-in-feature-plans.html`
- [C10] `feature-plans-features-essentials.html`
- [C11] `cognito-user-pools-managed-login.html`
- [C12] `managed-login-branding.html`, `managed-login-brandingeditor.html`
- [C13] `cognito-user-pools-assign-domain.html`, `cognito-user-pools-add-custom-domain.html`
- [C14] `authorization-endpoint.html`
- [C15] `token-endpoint.html`
- [C16] `logout-endpoint.html`
- [C17] `using-pkce-in-authorization-code.html`
- [C18] `user-pool-settings-client-apps.html` (the spec's [R6])
- [C19] `authentication-flows-selection-managedlogin.html`
- [C20] `authentication-flows-selection-sdk.html`
- [C21] `authentication-flows-public-server-side.html`
- [C22] `amazon-cognito-user-pools-using-the-access-token.html`
- [C23] `amazon-cognito-user-pools-using-the-id-token.html`
- [C24] `amazon-cognito-user-pools-using-the-refresh-token.html`
- [C25] `token-revocation.html`
- [C26] `cognito-user-pools-define-resource-servers.html`
- [C27] `userinfo-endpoint.html`
- [C28] `federation-endpoints.html`
- [C29] `amazon-cognito-user-pools-using-tokens-verifying-a-jwt.html`
- [C30] `cognito-user-pools-user-groups.html` and API `API_AdminAddUserToGroup.html`
- [C31] `cognito-user-pool-managing-errors.html`
- [C32] `user-pool-lambda-pre-token-generation.html`
- [C33] `cognito-user-pools-working-with-lambda-triggers.html`
- [C34] `user-pool-waf.html`
- [C35] `cognito-user-pool-settings-threat-protection.html`, `cognito-user-pool-settings-compromised-credentials.html`
- [C36] `quotas.html`
- [C38] `authentication-flow-things-to-know.html`
- [C39] `cognito-user-pool-updating.html`
- [C40] `managing-user-sessions.html`
- [C41] `managed-login-endpoints.html`, `login-endpoint.html`
- [C42] `getting-started-user-pools-application.html`

AWS Cognito API reference (`https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/` + page):
- [C4] `API_AdminSetUserPassword.html`
- [C5] `API_AdminResetUserPassword.html`
- [C8] `API_SignUp.html`, `API_CreateUserPool.html`
- [P1] `API_PasswordPolicyType.html`

Other AWS:
- [C37] `https://aws.amazon.com/cognito/pricing/`
- [A1] `https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html` (the spec's [R8])
- [A2] `https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-develop-integrations-lambda.html`
- [A3] `https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-troubleshooting-jwt.html`
- [W1] `https://docs.aws.amazon.com/waf/latest/developerguide/waf-acfp.html`

Terraform AWS provider docs at tag v6.73.0
(`https://raw.githubusercontent.com/hashicorp/terraform-provider-aws/v6.73.0/website/docs/r/` + file):
- [T1] `cognito_user_pool.html.markdown`
- [T2] `cognito_user_pool_client.html.markdown`
- [T3] `cognito_user_pool_domain.html.markdown`
- [T4] `cognito_managed_login_branding.html.markdown`
- [T5] `cognito_user_group.html.markdown`, `cognito_user_in_group.html.markdown`, `cognito_user.html.markdown`
- [T6] `apigatewayv2_authorizer.html.markdown`, `apigatewayv2_route.html.markdown`
- [T7] `cognito_resource_server.html.markdown`
- [T8] `lambda_permission.html.markdown`
- [T9] `wafv2_web_acl_association.html.markdown`

Libraries:
- [N1] `https://registry.npmjs.org/<package>` for `aws-amplify`, `@aws-amplify/auth`, `amazon-cognito-identity-js`,
  `oidc-client-ts`, `react-oidc-context`, `aws-jwt-verify`
- [N2] `https://unpkg.com/@aws-amplify/auth@6/dist/esm/providers/cognito/` — `apis/signInWithRedirect.mjs`,
  `apis/signOut.mjs`, `apis/signUp.mjs`, `utils/refreshAuthTokens.mjs`, `utils/oauth/oAuthSignOutRedirect.mjs`,
  `tokenProvider/TokenOrchestrator.mjs`, `types/models.d.ts`; and
  `https://unpkg.com/@aws-amplify/core@6/dist/esm/singleton/Auth/types.d.ts`
- [N3] `https://unpkg.com/amazon-cognito-identity-js@6.3.22/README.md`
- [N4] `https://unpkg.com/oidc-client-ts@3.5.0/README.md` and `dist/types/oidc-client-ts.d.ts`
- [N5] `https://unpkg.com/react-oidc-context@3.3.1/README.md`
- [N6] `https://docs.amplify.aws/react/build-a-backend/auth/concepts/tokens-and-credentials/`,
  `.../auth/connect-your-frontend/manage-user-sessions/`, `.../auth/connect-your-frontend/sign-in/`,
  `.../auth/concepts/external-identity-providers/`, `.../auth/use-existing-cognito-resources/`

ICO:
- [I1] `https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/`
- [I2] the same path + `services-covered-by-this-code/`

Could not be fetched: `https://repost.aws/knowledge-center/cognito-automatically-confirm-users` (HTTP 403); only a
search-result summary of it was seen.
