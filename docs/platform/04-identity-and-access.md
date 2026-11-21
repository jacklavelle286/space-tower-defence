# 04. Identity and access

Part of the [platform scope](README.md). Status: scope, parked.

Sources are keyed S1–S16 in [section 12](#12-sources). Code references come from a read of `main` at 292f4bc on
2026-11-21.

---

## 1. Summary

| Who | Pool | How they sign in | Pilot | Launch |
|---|---|---|---|---|
| Owner | Operators (as today) | Managed login, TOTP MFA, the console's own PKCE code, trusted browser | ✔ | ✔ |
| Staff | **Staff** (new) | Email, password and **required MFA**, on the school's own address | ✔ | ✔ |
| Staff | Staff | **Microsoft or Google**, chosen per school | — | ✔ (PD-9) |
| Pupils | **Pupils** (new) | Class code or QR card, then a picture password (or a typed password, per class) | ✔ | ✔ |

Three rules run through this document:

- **Our API decides who may do what**, on every request, from the `tenancy` table (PQ-8). Tokens only prove who someone
  is. Cognito groups are not used for school roles.
- **Pupil sign-in runs through our API.** `pupil_auth` applies the rate limits and lockouts, then has Cognito issue the
  tokens through server-side custom authentication (PQ-6).
- **A school's address decides which school a request is for**, and a staff member must be a member of that school.

---

## 2. What exists today

Facts from the family edition, and whether the platform keeps each [VERIFIED code, paths given]:

| Today | Where | Platform |
|---|---|---|
| Two pools (players, operators) from one module, `ESSENTIALS` tier, deletion protection | `infrastructure/modules/cognito_pool/main.tf:38`; `infrastructure/main/main.tf:560-638` | Keep the module; add the staff and pupil pools |
| Managed login v2 on Cognito prefix domains; one public client per pool, code flow with PKCE, one custom scope (`game/play`, `ops/content`) | `cognito_pool/main.tf:105-164` | Operators unchanged. Staff and pupils mostly don't use managed login (§4, §6) |
| Players self-sign-up behind a daily cap (`cognito-presignup`); username only; recovery `admin_only` | `api/functions/cognito_presignup/handler.py:47-81`; `cognito_pool/main.tf:62-67` | Not used: staff are invited and pupils are created by teachers |
| Operators: AdminCreateUser only, TOTP MFA required, refresh 30 days with rotation, group `admin` | `cognito_pool/main.tf:78-88`; `main.tf:605-637` | Kept for the console |
| Console keeps its refresh token in `localStorage` only when "Trust this browser for 30 days" is ticked (ADR-0042, still Proposed) | `web/admin/src/auth/session.ts:4-12, 36-37` | Kept |
| Player app uses `aws-amplify` 6 (auth only); tokens in `localStorage` | `web/player/src/auth/amplifyAuth.ts:24-66` | Staff portal and pupil app use Amplify too |
| JWT authorisers check issuer and client ID; each function re-checks route, `token_use=access`, `admin` group and a UUID `sub` | `infrastructure/modules/http_api/main.tf:23-36`; `api/shared/auth.py:72-93` | Kept and extended with school membership (§5) |

---

## 3. User pools

| Setting | Operators | Staff (new) | Pupils (new) |
|---|---|---|---|
| Feature plan | Essentials (as today) | **Essentials**: needed for email-OTP MFA, refresh token rotation and pre token generation v2 [VERIFIED S2] | **Essentials** [PROPOSAL]. Custom auth works on every plan, so **Lite** is a cost lever if `game/play` scopes and rotation can be dropped (AUTH-Q4) [VERIFIED S2] |
| Username | Username | **Email**, case-insensitive | **pupilId** (our opaque ID); no email or phone |
| Sign-up | AdminCreateUser only | AdminCreateUser only (invitations) | AdminCreateUser only, at first sign-in (§6.7) |
| MFA | TOTP, required | **Required**: TOTP or email OTP (email OTP via SES). No SMS [PROPOSAL] | None (children; §6) |
| Recovery | Admin only | Verified email (forgotten password by code) | Not applicable |
| App clients | `console-web` (PKCE) | `staff-web` (Pilot, API sign-in); federation clients (Launch, §4.3) | `pupil-web` (custom auth, used server-side) |
| Tokens | As today | Access and ID 30 min; refresh 12 h with rotation [PROPOSAL] | Access and ID 60 min; refresh 12 h with rotation [PROPOSAL] |
| Domain | Prefix domain, as today | `login.spacecolonydefence.com` custom domain (Launch, for federation) | None |
| Triggers | None | Custom message, pre sign-up, inbound federation, pre token generation v2, post authentication | Define, Create and Verify auth challenge; pre token generation v2 |

Cognito limits the design must respect [VERIFIED S1, S2, S3, S12, S13]:

| Limit | Value |
|---|---|
| App clients per pool | 1,000 (adjustable to 10,000) |
| Identity providers per pool | 300 (adjustable to 1,000) |
| Callback URLs per app client | 100, not adjustable; **exact match, no wildcards** |
| Managed login branding styles per pool | 20, not adjustable; SDK-created clients may each need one (UNCONFIRMED, S14) |
| JWT authoriser audiences | **50 per authoriser, not adjustable**; 10 authorisers per API (adjustable) |
| Token lifetimes | Access and ID 5 min–1 day; refresh 1 h–3,650 days |
| Free tier | 10,000 MAU a month per account or organisation on Lite and Essentials |
| Price per MAU | Lite $0.0055 (above the free tier); Essentials $0.015; SAML/OIDC federated users $0.015 above 50 free |

---

## 4. Staff sign-in

### 4.1 Pilot: email, password and MFA, on the school's address [PROPOSAL, AUTH-Q1]

Staff sign in at `https://<slug>.spacecolonydefence.com/staff` on **our own sign-in screens**, which call Cognito
through the user-pool API (SRP, or USER_AUTH on Essentials) with Amplify. There is one app client, `staff-web`, for
every school.

**Why not managed login**: managed login returns to a callback URL, and callbacks must match exactly, with at most 100
per app client [VERIFIED S13, S1]. Every school's address would need its own callback. API sign-in needs no callback,
so one client serves every school and the staff authoriser's audience list holds one entry. The cost is that we build
the sign-in, MFA set-up and reset screens. Amplify supplies the calls, and the player app already uses it [VERIFIED
`web/player/src/auth/amplifyAuth.ts`].

| Step | What happens |
|---|---|
| Invite | An Admin invites an email address with an access level and a billing flag. `school_api` calls AdminCreateUser on the staff pool. The custom message trigger writes the invitation email: the school's name, its `/staff` link and the temporary password. The temporary password lasts 7 days [PROPOSAL] |
| First sign-in | Email and temporary password → **set a new password** → **set up MFA** (scan a TOTP code, or choose email codes) → signed in. `GET /api/school/me` turns the membership from `invited` to `active` |
| First Admin only | Accepts the terms and the data processing agreement (version, time and name recorded) before anything else ([06](06-school-portal.md)) |
| Later sign-ins | Email and password → MFA code → signed in |
| Forgotten password | Code to the verified email → new password. The invitation counts as verifying the email, because the temporary password reached it [PROPOSAL] |
| Lost MFA device | An Admin uses **Reset sign-in** on the staff member: their MFA setting is cleared and a password reset forced, so they set MFA up again. Audited. The last Admin's reset goes through the owner (§8) |

- **MFA is required** for every native staff account. The DfE cyber security standard says MFA "must be enabled for all
  staff accounts with access to cloud services" [VERIFIED S15]. Cognito applies required MFA to native users only
  [VERIFIED S9].
- A pool **cannot require MFA if it allows passwordless one-time-password sign-in** [VERIFIED S9]. The staff pool
  therefore uses passwords plus MFA. **Passkeys**, which with user verification can satisfy MFA on Essentials [VERIFIED
  S9], come Later (AUTH-24).
- **Password policy** [PROPOSAL]: at least 12 characters, no composition rules, with the screen suggesting three random
  words (NCSC style).
- Repeated wrong passwords: Cognito's own sign-in throttling applies [UNVERIFIED: AWS states no exact numbers for the
  Essentials plan; threat protection is Plus only, VERIFIED S2]. Our sign-in page adds nothing that counts passwords.

### 4.2 Launch: Microsoft and Google (PD-9)

An Admin chooses the school's staff sign-in methods in Settings: email and password (always available to the Admin),
Microsoft, Google. Federated sign-in has to go through Cognito's hosted endpoints: "You can't sign in federated users
with the Amazon Cognito user pools API" [VERIFIED S5].

**Microsoft**

- One **OIDC identity provider per school's Entra tenant**, named `ms-<slug>`, with that tenant's issuer.
- Cognito compares the token's `iss` with the provider's configured issuer [VERIFIED S7]. Tokens from Microsoft's
  multi-tenant `/common` endpoint carry the user's own tenant as issuer [VERIFIED S7, Microsoft], so one provider cannot
  serve many tenants.
- The quota of 300 identity providers (adjustable to 1,000) is therefore the number of Microsoft schools per pool
  [VERIFIED S1].
- The company registers one multi-tenant Entra application. Each school's Entra admin grants consent once.
- SAML is not offered: a multi-tenant SAML setup with Cognito is reported to fail [UNVERIFIED: Microsoft Q&A, July 2025].

**Google**

- Cognito's built-in Google identity provider, shared by all schools.
- Google says the `hd` request parameter only shapes the sign-in screen, and that apps must check the `hd` claim in the
  ID token themselves [VERIFIED S8].
- The **inbound federation trigger** (January 2026) receives the validated ID token claims on every federated sign-in
  and can refuse it [VERIFIED S5, S6]. It refuses unless the `hd` claim is a domain the school registered and an
  invitation or membership exists for that email.

**Which triggers can refuse a federated sign-in** [VERIFIED S5]:

| Trigger | First federated sign-in | Later sign-ins | Use |
|---|---|---|---|
| Pre sign-up | Yes | No | Require an invitation; link to an existing native user (below) |
| Inbound federation | Yes | Yes | Check `hd` (Google) or the tenant and IdP (Microsoft) against the school |
| Pre token generation v2 | Yes | Yes | Add the `school/staff` scope |
| Post authentication | No | Yes | Record the last sign-in; doesn't refuse |

**Rules**

- **No domain auto-join** [PROPOSAL, AUTH-Q11]. Signing in with a school Google or Microsoft account never creates
  access by itself; an Admin must have invited that email.
- **Linking.** When a staff member who already signs in with a password first uses Microsoft or Google, the pre sign-up
  trigger links the external identity to the existing native user (AdminLinkProviderForUser), so their `sub` and
  membership stay the same. Linked users count as federated MAUs [VERIFIED S1].
- **MFA for federated users** is the school's identity provider's job: Cognito adds no factors for them [VERIFIED S9].
  The privacy pack tells schools to require MFA in Microsoft 365 or Google Workspace ([11](11-privacy-security-and-assurance.md)).

### 4.3 Choosing how federation returns to each school's address [PROPOSAL, AUTH-Q2]

| Option | How | Limits | For | Against |
|---|---|---|---|---|
| **A. Federation app clients** | Clients `staff-fed-1…n`. Each holds up to 100 school callbacks (`https://<slug>.spacecolonydefence.com/staff/auth/callback`) and those schools' identity providers. The portal sends `identity_provider=<idp>`, so Cognito goes straight to Microsoft or Google | Callbacks: 100 per client [VERIFIED S1]. Audience list: `staff-web` + 49 federation clients = about 4,900 schools [VERIFIED S12]. If each SDK-created client needs its own branding style, 20 clients = 2,000 schools [UNCONFIRMED S14] | Cognito does all the token work. Standard federation. Few moving parts in our code | `platform_api` must update clients (a read-modify-write; UpdateUserPoolClient replaces the whole client configuration [UNVERIFIED: check the API reference]) under a lock. Audience edits may need a stage deployment (auto-deploy is on today) [UNVERIFIED S12] |
| **B. Central sign-in origin** | One client, one callback on a fixed host (e.g. `auth.spacecolonydefence.com`). After sign-in our API issues a one-time handoff code (60 s, single use, bound to user and school), redeemed on the school's address | None from Cognito | Scales without limit | Our code moves a refresh token between origins: more security-sensitive code and a pen-test focus |
| **C. Cognito token exchange** (12 Nov 2026) | The browser gets a Microsoft or Google token itself and exchanges it for Cognito tokens on one client | The identity provider must still be registered in the pool; the user must already exist; Essentials or Plus; account must be enabled for it [VERIFIED S11] | No Cognito callbacks | **Never issues a refresh token** [VERIFIED S11]. The browser needs our Microsoft and Google registrations to list every school's address as a redirect, which just moves the per-address problem to them [UNVERIFIED limits]. New feature |

**Recommendation: A**, after a one-week **spike** (AUTH-20) in dev that answers:

1. Does `/oauth2/authorize` with `identity_provider` work for an SDK-created client without its own branding style?
2. Do audience edits take effect without a deployment?
3. Do the inbound federation and pre sign-up triggers behave as in the table above?
4. Does linking keep the `sub`?

If the branding-style limit applies, A still covers 2,000 schools. Option B is the fallback.

### 4.4 Staff sessions

- Access and ID tokens last 30 minutes; the refresh token 12 hours with rotation. Rotation doesn't extend the original
  refresh window [VERIFIED S10]. So a staff member signs in at most once a working day [PROPOSAL, AUTH-Q8].
- The refresh token is kept in `sessionStorage`, so closing the browser signs out (staffroom computers are shared). The
  portal signs out after **60 minutes without activity**.
- **Sign out** revokes the refresh token (RevokeToken) and clears storage.
- **Removing a staff member** sets their membership to `removed` and calls AdminUserGlobalSignOut. Revoked access tokens
  still pass a JWT check until they expire [VERIFIED S10], so the immediate effect comes from the membership check in
  §5.3, not from Cognito.
- **Later**: Cognito session management (November 2026, Essentials) adds a `sid` claim and lets sessions be listed and
  revoked [VERIFIED S16]. That becomes a "Signed-in devices" list for staff (AUTH-25).

---

## 5. Access control (RBAC)

### 5.1 Model

- A **membership** joins a staff member (their Cognito `sub`) to a school. It holds an **access level** (`admin`,
  `teacher`, `readonly` or `none`), a **billing** flag, a status (`invited`, `active` or `removed`) and the sign-in
  method used. Its keys are in [10 §2.4](10-data-and-api.md#24-the-new-tenancy-table).
- **Roles are bundles of named permissions** (§5.2). Code checks permissions, never role names, so roles can change
  without code changes (PQ-8).
- **Teacher permissions are scoped to their own classes**: the class's `teacherSub` must be the caller's `sub`, and for a
  pupil, the pupil's class must be one of the caller's classes.
- **Why not Cognito groups**:
  - groups belong to the whole pool, while a role belongs to a membership;
  - tokens carry groups until refresh, so changes would lag;
  - a user can be in at most 100 groups [VERIFIED S1].

  Groups stay only for the operator pool (§7).

### 5.2 Permissions

From the matrix in [01 §3.1](01-product-and-roles.md#31-school-roles-confirmed-by-owner-2026-11-21-pd-7-and-pd-8-details-proposal)
[CONFIRMED by owner 2026-11-21 for the roles; names and the Read-only staff view are PROPOSAL]:

| Permission | Covers | Admin | Teacher | Read-only | Billing |
|---|---|---|---|---|---|
| `school.view` | School name, status, own membership | ✔ | ✔ | ✔ | ✔ |
| `school.settings.manage` | Name, badge, sign-in methods, defaults, enrolment limit | ✔ | | | |
| `school.terms.accept` | Accept terms and DPA | ✔ | | | |
| `staff.view` | Staff names and roles | ✔ | | ✔ | |
| `staff.manage` | Invite, remove, change role, reset sign-in | ✔ | | | |
| `class.view` | Classes and their settings | all | own | all | |
| `class.create` | New class (a teacher becomes its teacher) | ✔ | ✔ | | |
| `class.edit` | Name, year groups, sign-in mode, home play | all | own | | |
| `class.assign_teacher` / `class.archive` | Change teacher / archive | ✔ | | | |
| `class.signin.manage` | Open or close class sign-in, new code, print cards, sign everyone out | all | own | | |
| `class.play.manage` | This week, maps on or off, pause | all | own | | |
| `pupil.view` | Pupils and their details | all | own classes | all | |
| `pupil.enrol` | Add one, a list or a CSV | any class | own classes, within the enrolment limit | | |
| `pupil.edit` | Name, year group, avatar | all | own classes | | |
| `pupil.unassign` | Remove from a class (stays enrolled, PQ-10) | all | own classes | | |
| `pupil.move` | Move between classes | ✔ | | | |
| `pupil.unenrol` / `pupil.delete` | Archive (stops billing) / delete | ✔ | | | |
| `pupil.signin.manage` | Reset, view the secret, reissue card, unlock | all | own classes | | |
| `progress.view` / `progress.export` | Practice records, CSV | all | own classes | all | |
| `counts.view` | Enrolled numbers only | ✔ | | ✔ | ✔ |
| `billing.view` / `billing.pay` / `billing.manage` | Invoices; pay; payment method, Direct Debit, PO numbers, billing contacts | ✔ | | | ✔ |
| `data.export` / `data.delete_request` | Whole-school export; ask for deletion | ✔ | | | |
| `audit.view` | School audit log | ✔ | | | |
| `support.grant` | Grant or end support access | ✔ | | | |
| `newyear.run` | New-school-year wizard | ✔ | | | |

Rules:

- A Teacher enrolling past the school's **enrolment limit** gets `ENROLMENT_LIMIT`. Admins may go past it after
  confirming ([06](06-school-portal.md)).
- The **last active Admin** cannot be removed, demoted or have their access level set to `none`
  (`LAST_ADMIN`).

### 5.3 Enforcement on every request

The staff path through `school_api` (and `billing` for `/api/school/billing/*`):

| # | Check | Fails with |
|---|---|---|
| 1 | API Gateway JWT authoriser: staff pool issuer, audience `staff-web` (plus federation clients at Launch), scope `school/staff` | 401 |
| 2 | The request came through CloudFront: the origin-verify header matches (§10, AUTH-Q10) | 403 `FORBIDDEN` |
| 3 | `x-scd-host` names a school host. The slug maps to a `schoolId` (cached 60 s); the school's status allows the route ([09](09-billing.md) for suspended) | 404 `NOT_FOUND`, 403 `SCHOOL_SUSPENDED` |
| 4 | `token_use=access`; a UUID `sub` (today's checks, `api/shared/auth.py:72-93`) | 403 |
| 5 | Membership `SCH#<schoolId>` / `MEMBER#<sub>`, read **strongly consistent on every request, never cached**; status `active` | 403 `NOT_A_MEMBER` |
| 6 | The route's permission (from the generated route table, as today's allow-list) is in the role's bundle | 403 `FORBIDDEN` |
| 7 | The resource is in this school (all its keys sit under `SCH#<schoolId>`, so another school's ID is simply not found); for own-class permissions, ownership | 404 / 403 |
| 8 | Writes add an audit record (§9) | — |

- Step 2 matters because the execute-api endpoint is public. A direct call could carry a forged `x-scd-host`.
  - That would still fail at step 5 for a school the caller doesn't belong to.
  - The origin-verify header stops such calls earlier.
  - It also protects `pupil_auth`, which has no authoriser.
- Scopes are required on every route because ID tokens can pass a client-ID audience check [VERIFIED S12].
- Whether pre token generation v2 adds custom scopes to tokens from the user-pool API (not just OAuth) is
  [UNVERIFIED: spike]. If it doesn't, the routes require `aws.cognito.signin.user.admin` instead.

### 5.4 Pupils

`player_api` takes the pupil's ID from the access token's `username` claim, which is the pupilId [UNVERIFIED that the
claim is present: check the access token claims in the spike]. It then:

1. reads the pupil and their class from `tenancy`;
2. checks that the host's school is the pupil's school, the pupil is enrolled, the school is not suspended and the class
   is not paused ([07](07-pupil-experience.md));
3. works only inside that pupil's own `game` partition, as today (IAM `dynamodb:LeadingKeys`,
   `infrastructure/main/main.tf:209`).

The game partition is keyed by **pupilId, not `sub`**, so it survives the pupil's Cognito user being deleted and
recreated ([10 §2.2](10-data-and-api.md#22-changes-to-game), DAT-Q2).

### 5.5 Tests

- **A generated matrix test**: every school route × every access level (plus billing-only) × own class or another class
  × same school or another school × through CloudFront or direct. Each combination has an expected allow or deny.
- CI fails if a new route has no permission entry, as today's route allow-list does.
- The same suite runs for the console (§7) and for pupils (one pupil cannot read another's data or another school's
  class list).

---

## 6. Pupil sign-in

### 6.1 Two ways in (PD-13, PQ-11)

| | **Class code** (classroom) | **QR card** (any time, e.g. homework book) |
|---|---|---|
| Starts with | The teacher opens **class sign-in** (default 60 minutes, at most 3 hours [PROPOSAL]); a code like `KMTPRW` and its QR show on the board | The card's QR opens `https://<slug>.spacecolonydefence.com/c/<handle>` |
| Pupil sees | The class's first names with last initials and avatars, only while sign-in is open | Their own first name and avatar |
| Then | Taps their name → picture password (or typed password) | Picture password (or typed password) |
| Works when | Sign-in is open; the school is not suspended | Always, unless the school turned home play off or is suspended |
| Not a secret | The code reveals the class list during the window | The handle reveals one first name and avatar |

### 6.2 What happens on the server

`POST /api/pupil-auth/sign-in` carries the pupil (picked from the class list, or the card's handle) and the answer.
`pupil_auth`:

1. Checks the origin-verify header, the host's school, the class window or the card handle, and the lockout counters
   (§6.4).
2. Calls **AdminInitiateAuth** with `CUSTOM_AUTH` for username = pupilId.
   - On `UserNotFoundException` it creates the user first, at first sign-in (§6.7).
3. The Define trigger asks for one custom challenge. The Create trigger issues it; nothing secret is sent.
4. Calls **AdminRespondToAuthChallenge** with the answer. The **Verify trigger** reads the pupil's stored hash and
   compares. Define then issues tokens [VERIFIED S4].
5. Records success or failure on the pupil item and returns the tokens.

The whole exchange is one HTTP request, so Cognito's 3–15 minute challenge session is never a constraint [VERIFIED S4].
Triggers must answer within 5 seconds [VERIFIED S5], so the trigger functions stay small, with no heavy imports.
Custom auth cannot run on hosted sign-in pages [VERIFIED S17], which this design never uses for pupils.

### 6.3 Picture and typed passwords

| | Picture password (default) | Typed password (per class, meant for Years 3–4) |
|---|---|---|
| Form | **3 of 9 pictures, in order, no repeats**: 504 combinations [PROPOSAL, AUTH-Q5] | A word from a child-friendly list plus two digits, e.g. `comet42`, generated by us [PROPOSAL] |
| The pictures | One fixed set of nine space pictures in the game's art style, always in the same positions so young children remember where to tap | — |
| Chosen by | Generated on enrolment; a teacher can reset | Generated; a teacher can regenerate. Children don't choose (no personal words) |

**Storage** [PROPOSAL, AUTH-Q7]:

- **`secretHash`**: HMAC-SHA256 with a per-pupil salt and an environment pepper (Secrets Manager). The Verify trigger
  only ever checks against this.
- **`secretEnc`**: the secret encrypted with a dedicated KMS key, encryption context `{schoolId, pupilId}`. Only
  `school_api` can decrypt it, so a teacher can see a pupil's pictures or print the class password sheet. **Every view is
  audited** (`pupil.secret.viewed`).
- Hashing doesn't make 504 combinations safe offline. The protection is the online limits in §6.4. The hash keeps
  KMS out of the 5-second trigger and keeps decrypt rights in one function.

### 6.4 Lockouts and limits

The DfE standard asks schools to "protect all passwords – for example, by allowing no more than 10 guesses in 5
minutes" [VERIFIED S15]. Proposed numbers [PROPOSAL, AUTH-Q6]:

| Scope | Rule | Effect |
|---|---|---|
| One pupil | 5 wrong answers | Locked 5 minutes (at most 5 guesses per 5 minutes) |
| One pupil | 10 wrong answers in 24 hours | Locked until a teacher unlocks; the teacher sees a badge |
| One class (code route) | 30 wrong answers in 5 minutes | Class sign-in closes; the teacher sees why |
| One school | 200 wrong answers in 5 minutes | Alarm to the owner |
| Per IP | A CloudFront WAF rate-based rule on `/api/pupil-auth/*`, generous, because a whole school shares one IP | 429 |

At 5 guesses per 5 minutes, a classmate guessing has about a 1% chance per lock window and at most 10 tries a day. The
DPIA records this trade-off ([11](11-privacy-security-and-assurance.md)). The harm is a classmate playing as someone
else; no personal data beyond a first name is exposed.

### 6.5 Class codes and QR handles

- **Class code**:
  - 6 letters from an alphabet without look-alikes (no I, L, O): about 148 million combinations;
  - unique within the school;
  - kept until the teacher asks for a new one, so it can stay on the wall;
  - **only works while class sign-in is open** (PQ-11).
- **QR handle**:
  - 128 random bits, base32;
  - one per pupil, looked up directly;
  - **reissuing a card** makes a new handle, and the old card stops working.

### 6.6 Pupil sessions

- Access and ID tokens last 60 minutes, the refresh token 12 hours with rotation [PROPOSAL, AUTH-Q8]. The browser
  refreshes directly with Cognito (GetTokensFromRefreshToken, needed when rotation is on [VERIFIED S10]).
- After class sign-in, tokens are kept in `sessionStorage`, so closing the tab ends the session. After QR sign-in at
  home, they are kept for the session's 12-hour life so a reload carries on ([07 §7](07-pupil-experience.md#7-finishing)).
  Either way, the app signs out after **20 minutes without input**, after a 60-second warning.
- **Finish** revokes the refresh token and clears storage.
- A teacher's **Sign everyone out** sets `signedOutAt` on the class and calls AdminUserGlobalSignOut for each pupil who
  has a Cognito user. `player_api` refuses access tokens issued before `signedOutAt`, so it takes effect at once
  [PROPOSAL].

### 6.7 Pupils' Cognito users

- **Created at first sign-in**, not at enrolment. A CSV of 300 pupils makes only `tenancy` records, so imports never
  hit Cognito's UserCreation quota of 50 per second per account [VERIFIED S1].
- Creation: AdminCreateUser with the message suppressed, then AdminSetUserPassword with a long random permanent password
  that is never stored. No password flow is enabled on `pupil-web`, so it cannot be used [ASSUMPTION: confirm in the
  spike that custom auth works for a user in this state].
- **Archiving or deleting a pupil deletes their Cognito user** (AdminDeleteUser). Their data is keyed by pupilId, so
  nothing is lost if they are restored and the user is recreated.

---

## 7. Operators (the console)

- The same as today, in each new account: AdminCreateUser only, TOTP MFA required, the console's own PKCE code, and the
  trusted browser of ADR-0042, which is still Proposed and whose first live renewal check (U-058) is open [VERIFIED
  code map].
- New scope `ops/platform` for `/api/platform/*`, alongside `ops/content` [PROPOSAL].
- Operator groups stay. Today's exact `admin` group check [VERIFIED `api/shared/auth.py:72-93`] becomes named
  permissions:
  - `platform.schools.*`, `platform.billing.*`, `platform.support.*`, `platform.content.*` and the rest, listed in
    full in [05 §13](05-platform-console.md#13-permissions);
  - the group `owner` grants all of them;
  - `support`, `content` and `finance` groups come Later ([01 §3.2](01-product-and-roles.md#32-platform-roles)).
- `/api/platform/*` is accepted only on the `admin.` host.

---

## 8. Support access

- By default the owner sees, for each school:
  - its details, status, plan and billing;
  - its staff (names, emails, roles);
  - enrolment counts.

  The owner sees **no pupil names and no progress** (rule R1).
- **Support access** opens a time-limited window for that school.
  - Who starts it:
    - an Admin grants it in the portal;
    - or the owner requests it and an Admin approves.
  - How long and why [PROPOSAL, AUTH-Q9]: 24 hours by default, at most 7 days, with a reason.
  - While it is open, `platform_api` can read and act on that school's classes, pupils and progress.
  - Every action goes into **the school's audit log**, and the portal shows a banner: "Support access open until …".
  - An Admin can end it at any time.
- **Break-glass**, when a school has no working Admin:
  1. The owner confirms the request by phoning the school office on the number in GIAS
     ([05](05-platform-console.md)).
  2. The owner then reassigns the Admin role.
  3. Both the school's audit log and the platform's record it.

---

## 9. Audit

| | |
|---|---|
| **Recorded** | Every staff write. Every sign-in method change. Role changes. Pupil secret views and resets. Unlocks. Exports. Support access. Billing actions. Operator actions on a school |
| **Not recorded** | Secrets, tokens, pupil names. Targets are recorded by ID; the portal shows names when an Admin reads the log |
| **Fields** | Time, actor (staff `sub` or operator), action, target type and ID, school, a short summary |
| **Kept** | 2 years (PQ-15) through TTL; school audit records outlive the 90-day pupil-data deletion, since they hold IDs only [PROPOSAL] |
| **Who reads** | A school's Admins read their school's log; the owner reads the platform log and, during support access, the school's |

Sign-in failures are counted on the pupil item and in metrics, not written as audit records one by one.

---

## 10. Capacity and security controls

| Control | Detail |
|---|---|
| Origin-verify header [PROPOSAL, AUTH-Q10] | CloudFront adds a secret header on `/api/*`. Every function refuses requests without it. The value is rotated through Terraform |
| MFA | Required for staff (native); schools enforce it for Microsoft and Google |
| Membership check per request | §5.3; removal works at once |
| Scopes on every route | Stops ID tokens being used as access tokens [VERIFIED S12] |
| Pupil limits | §6.4; WAF on CloudFront (WAF cannot attach to an HTTP API stage, E §E.2) |
| KMS | Pupil secrets only, decrypt by `school_api` alone |
| CSP | Enforced on the platform. Today the family edition's CSP is still Report-Only [VERIFIED code map] |
| Cognito quotas | Per account, all pools: UserAuthentication 120 RPS, RespondToAuthChallenge three times that, UserCreation 50 RPS, 10 operations per second per user. Adjustable; self-service increases are billed (since July 2026) [VERIFIED S1] |
| Class start | Five classes of 30 signing in within two minutes is about 1.3 sign-ins a second, plus user creation on the first day. Well inside the quotas; the load test checks it ([10](10-data-and-api.md)) |

---

## 11. Decisions for the owner

| ID | Question | Recommendation |
|---|---|---|
| AUTH-Q1 | Pilot staff sign-in: our own screens on the school's address (API sign-in), or Cognito managed login? | Our own screens, one `staff-web` client (§4.1) |
| AUTH-Q2 | Launch federation wiring: A, B or C (§4.3)? | A, after the spike; B as fallback |
| AUTH-Q3 | Staff MFA methods | TOTP and email codes; no SMS; passkeys Later |
| AUTH-Q4 | Pupil pool plan: Essentials or Lite? | Essentials for rotation and scopes; Lite only if MAU cost matters |
| AUTH-Q5 | Picture password: 3 of 9 in order, no repeats, fixed positions; typed password generated as word + 2 digits | Yes |
| AUTH-Q6 | Lockout numbers (§6.4) | As proposed |
| AUTH-Q7 | Teachers can view pupils' secrets (encrypted copy, audited) rather than reset-only | Yes: young children forget, and teachers need the sheet |
| AUTH-Q8 | Token lifetimes and idle sign-out: staff 30 min / 12 h / 60 min idle; pupils 60 min / 12 h / 20 min idle | Yes |
| AUTH-Q9 | Support access: granted by the school, 24 hours by default, at most 7 days | Yes |
| AUTH-Q10 | An origin-verify header between CloudFront and the API | Yes |
| AUTH-Q11 | Federated sign-in needs a prior invitation (no domain auto-join) | Yes |

---

## 12. Sources

All read 2026-11-21.

| Key | Source |
|---|---|
| S1 | Amazon Cognito quotas: https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html |
| S2 | Cognito feature plans: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-sign-in-feature-plans.html |
| S3 | Cognito pricing: https://aws.amazon.com/cognito/pricing/ (cross-checked with the eu-west-2 price list) |
| S4 | Custom authentication challenge triggers: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-challenge.html |
| S5 | Lambda triggers, federated trigger sources and the 5-second limit: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-working-with-lambda-triggers.html |
| S6 | Inbound federation trigger: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-lambda-inbound-federation.html |
| S7 | OIDC flow (issuer check): https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-oidc-flow.html; Microsoft multi-tenant issuers: https://learn.microsoft.com/en-us/entra/identity-platform/howto-convert-app-to-be-multi-tenant |
| S8 | Google OpenID Connect (`hd`): https://developers.google.com/identity/openid-connect/openid-connect |
| S9 | Cognito MFA: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html |
| S10 | Refresh tokens and revocation: https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html; https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html |
| S11 | Token exchange: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-token-exchange.html |
| S12 | HTTP API JWT authorisers and quotas: https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html; https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-quotas.html |
| S13 | App clients (exact callback match): https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-client-apps.html |
| S14 | Managed login: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-managed-login.html |
| S15 | DfE cyber security standard: https://www.gov.uk/guidance/meeting-digital-and-technology-standards-in-schools-and-colleges/cyber-security-core-standard |
| S16 | Cognito session management: https://docs.aws.amazon.com/cognito/latest/developerguide/managing-user-sessions.html |
| S17 | Authentication flows: https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html |

---

## 13. User stories

*Snapshot of 2026-11-21. The source of truth for these stories is now Jira (project SCD); see
[README §6](README.md#6-user-stories-and-jira). Edit the tickets, not this table.*

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| AUTH-1 | As the owner, I want staff and pupil pools in each environment, so that adults and children are kept apart | Terraform creates both (Essentials, deletion protection); the staff pool has email usernames, required MFA (TOTP, email OTP) and no self sign-up; the pupil pool has no attributes and no self sign-up; `staff-web` and `pupil-web` clients exist with the flows in §3 | Pilot |
| AUTH-2 | As an Admin, I want to invite a colleague by email with a role, so that they can use the portal | The invite email names the school and links to its `/staff`; the temporary password expires after 7 days; the membership shows `invited` until first sign-in; resend and cancel work | Pilot |
| AUTH-3 | As a staff member, I want to set my password and MFA at first sign-in, so that my account is protected | A new password (12+ characters) is required, then TOTP or email-code setup; no route works before MFA is set; the membership becomes `active` | Pilot |
| AUTH-4 | As a staff member, I want to sign in on my school's address with password and MFA, so that I reach my school | Works on Safari (iPad), Chrome (Chromebook), Edge; wrong MFA codes are refused; a member of school A signing in on school B's address sees "You don't have access to this school" | Pilot |
| AUTH-5 | As a staff member, I want to reset a forgotten password, so that I don't need the Admin | A code goes to the verified email; the new password works; MFA is still required | Pilot |
| AUTH-6 | As an Admin, I want to reset a colleague's sign-in when they lose their phone, so that they can set MFA up again | Their MFA is cleared and a reset forced; audited; Admins cannot reset themselves this way | Pilot |
| AUTH-7 | As an Admin, I want removing a colleague to cut their access at once, so that leavers can't see pupils | After removal, any request with their unexpired token returns 403 within one request; their refresh token is revoked; audited | Pilot |
| AUTH-8 | As the owner, I want every school route checked against the permission table, so that roles mean what 01 says | Generated matrix tests cover route × access level × own/other class × same/other school × direct/CloudFront; CI fails on a route with no permission entry | Pilot |
| AUTH-9 | As the owner, I want a school's last Admin protected, so that no school locks itself out | Removing, demoting or setting `none` on the last active Admin returns `LAST_ADMIN` | Pilot |
| AUTH-10 | As a pupil, I want to sign in with my class code and pictures, so that I can play in class | Code accepted only while sign-in is open; the class list shows first names, initials and avatars; correct pictures sign in within 2 s (p95); first sign-in creates the Cognito user | Pilot |
| AUTH-11 | As a pupil, I want my QR card to sign me in at home, so that I can do homework | Scanning opens my page with my name and avatar; correct pictures sign me in; a reissued card's old handle returns "This card no longer works – ask your teacher" | Pilot |
| AUTH-12 | As a teacher, I want to open and close class sign-in, so that the class list isn't shown when I'm not there | Default 60 minutes, at most 3 hours; closing early works at once; the code page shows the code and its QR big enough for the board | Pilot |
| AUTH-13 | As a teacher, I want to choose typed passwords for my Year 3 or 4 class, so that older pupils have stronger sign-in | Switching generates word-plus-two-digit passwords for every pupil in the class; the cards and sheet update; switching back restores pictures | Pilot |
| AUTH-14 | As the owner, I want lockouts within the DfE guidance, so that guessing is impractical | 5 wrong → 5-minute lock; 10 in 24 h → teacher unlock; 30 wrong in a class in 5 minutes closes sign-in; tested with a scripted guesser | Pilot |
| AUTH-15 | As a teacher, I want to see and print my pupils' passwords and unlock them, so that I can help children who forget | The password sheet and pupil page show pictures or words; each view and unlock is audited; another teacher's pupils are refused | Pilot |
| AUTH-16 | As a teacher, I want to sign my whole class out, so that shared iPads are clean at the end of a lesson | Every pupil's next request fails with "signed out"; refresh tokens revoked; works within 5 seconds for 35 pupils | Pilot |
| AUTH-17 | As a pupil, I want Finish to sign me out, so that the next child can't play as me | Finish revokes the refresh token and clears storage; 20 minutes idle (after a 60-second warning) does the same | Pilot |
| AUTH-18 | As an Admin, I want an audit log of staff actions, so that I can see who did what | Every write in §9 appears with time, actor and target within a minute; no secrets or names stored; kept 2 years | Pilot |
| AUTH-19 | As the owner, I want CloudFront's origin-verify header checked by every function, so that the public API endpoint can't be called directly | Direct execute-api calls return 403 on every route; the header value rotates without downtime | Pilot |
| AUTH-20 | As the owner, I want a spike on federation wiring, so that Microsoft and Google sign-in works for many school addresses | A dev report answers the four questions in §4.3 and confirms or changes AUTH-Q2 | Launch |
| AUTH-21 | As a staff member at a Microsoft school, I want to sign in with my school account, so that I don't need another password | The Admin enters the tenant; consent is granted once; invited staff sign in; uninvited accounts are refused; an existing password user is linked with the same `sub` | Launch |
| AUTH-22 | As a staff member at a Google school, I want to sign in with Google, so that I use my school account | Only accounts whose `hd` is the school's domain and who were invited get in; personal Gmail is refused with a clear message | Launch |
| AUTH-23 | As an Admin, I want to grant the owner time-limited support access, so that problems can be fixed without sharing passwords | Grant with reason and length (24 h default, 7 days max); banner while open; every support action in the school's audit; ends early on request | Launch |
| AUTH-24 | As a staff member, I want to sign in with a passkey, so that I need no password | Passkey with user verification meets the MFA requirement; password sign-in still available | Later |
| AUTH-25 | As a staff member, I want to see and end my signed-in devices, so that a lost laptop isn't a risk | Uses Cognito session management; ending a session stops its refresh within one request | Later |
