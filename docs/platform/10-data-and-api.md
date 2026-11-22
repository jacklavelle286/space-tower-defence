# 10. Data and API

Part of the [platform scope](README.md). Status: active on `dev` from 2026-11-21.

Code facts come from a read of `main` at 292f4bc on 2026-11-21. Cognito and API Gateway facts are sourced in
[04 §12](04-identity-and-access.md#12-sources).

---

## 1. Summary

The platform keeps today's shape (PD-4):

- one HTTP API per environment, reached only through CloudFront `/api/*`;
- routes generated from `contracts/routes.json`;
- Python Lambdas behind it;
- DynamoDB tables on demand.

What changes:

| Layer | Change |
|---|---|
| Tables | `game` and `content` stay. A new **`tenancy`** table holds everything about schools: schools, staff, classes, pupils, sign-in, imports, audit, support access, plans and the billing mirror |
| Keys | Everything a school owns sits under `SCH#<schoolId>`, except its audit, lookup and rate-counter items (ADR-0046). The rest is one partition: easy to keep apart, export and delete |
| Pupils' play | Stays in `game`, keyed by **pupilId** for school pupils (DAT-Q2) |
| API | New route groups: `/api/pupil-auth/*`, `/api/school/*`, `/api/platform/*`, `/api/hooks/stripe`. The player routes become school-aware |
| Functions | New: `school_api`, `platform_api`, `pupil_auth`, `auth_triggers` (two deployments), `billing`. Existing functions are unchanged apart from `player_api` and `tts` |
| Throttles | Redesigned for whole classes starting together (§3.4) |

---

## 2. Tables

### 2.1 What exists today [VERIFIED code map]

| Table | Keys | Settings | Items |
|---|---|---|---|
| `game` | `pk`, `sk` (strings); no GSI | On demand; PITR; deletion protection; `prevent_destroy`; TTL attribute `ttl` (`infrastructure/modules/dynamodb_table/main.tf:14-51`) | `U#<sub>` with `PROFILE` (nickname, avatarId, dob, planets, badges), `SESSION`, `RUN#<runId>`, `SLOT#<runId>#<slotId>`, `SUM#<subject>#<topicId>`; `SYS#SIGNUPS` (`api/shared/runs.py:6-18`) |
| `content` | as above; no TTL | as above | Speech, activities, audit, levels, maps (`PLANET`), aliens, pictures, publishing counters (`api/shared/content.py:5-20`, `levels.py`, `pictures.py`) |

- Backups: AWS Backup daily, keeping 7 points, plus PITR. All reads are strongly consistent (`api/shared/data.py:1-10`).
- `player_api` may touch only `game` keys starting `U#` (IAM `dynamodb:LeadingKeys`, `infrastructure/main/main.tf:209`).

### 2.2 Changes to `game`

- **School pupils' partitions are `U#<pupilId>`, not `U#<sub>`** [PROPOSAL, DAT-Q2].
  - The pupilId is the pupil's Cognito username and comes in the access token's `username` claim (claim presence
    UNVERIFIED; a short spike in sca-dev before PS5 checks it, PS0-11).
  - A pupil's Cognito user is deleted when they are archived and created again at their next sign-in
    ([04 §6.7](04-identity-and-access.md#67-pupils-cognito-users)), which gives it a new `sub`. Keying by pupilId keeps
    their play.
  - The family edition keeps `U#<sub>`.
- **PROFILE for a school pupil** holds: `schoolId`, `pupilId`, `classId`, `yearGroup`, `avatarId`, `archived`, badges and
  maps progress.
  - **No `dob`, no nickname.** The display name lives in `tenancy` only.
  - `pupil_auth` writes the school fields at each sign-in. `school_api` updates them when a pupil moves class or
    year, or is archived, so `player_api` sees changes at once.
- **Runs** pin the pupil's year group and the class's This week topics instead of an age band
  ([08](08-learning-content.md)).
- **`SUM#` learning summaries are unchanged.** They feed the teachers' progress views (§3.2).
- **Not used for school pupils**: birthday profile writes, self-service resets (teachers reset instead) and
  `SYS#SIGNUPS`.

### 2.3 Changes to `content`

Content stays **global**: one bank for every school, published by the owner (PQ-5). It holds no school data.

- Activities gain year groups (Year 1 to Year 4) alongside or instead of today's `minAge`/`maxAge`.
- New **topic sets** are what teachers pick for This week.
- Curriculum references move to Year 1–4 statements ([08](08-learning-content.md)).
- Teachers' own questions (Later, PD-18) would be school data, so they would live in `tenancy` under the school, not in
  `content` (DAT-Q10).

### 2.4 The new `tenancy` table

**Settings** [built in PS3, DAT-1: `infrastructure/platform/tenancy.tf`, with the daily backup plan]:

- on demand, `pk` and `sk` strings;
- PITR, deletion protection, `prevent_destroy`;
- TTL attribute `ttl`;
- one overloaded global secondary index, `gsi1` (`gsi1pk`, `gsi1sk`, projection ALL).

This revisits ADR-0004 (no GSI) **for this table only**; `game` keeps none (DAT-Q1).

**Key rules**

1. **Everything a school owns is under `pk = SCH#<schoolId>`**, except its audit, lookup and rate-counter items
   (ADR-0046). One Query returns the rest of a school's data for export or deletion. An ID from another school is
   simply not found under this school's key.
2. **Anything that decides access is a strongly consistent GetItem on the base table.** That covers sign-in lookups,
   membership checks and uniqueness. GSIs only return eventually consistent reads [ASSUMPTION: standard DynamoDB
   behaviour], so `gsi1` is used **only for lists**.
3. **Uniqueness uses conditional puts** on lookup items: slugs, class codes, QR handles, invited emails and Stripe
   event IDs.
4. **IDs are opaque.**
   - `schoolId`: `s` + ULID.
   - `classId`: `c` + ULID.
   - `pupilId`: `p` + ULID (also the Cognito username).
   - Staff are identified by their Cognito `sub`.

**Items**

| Item | `pk` | `sk` | Main attributes | `gsi1pk` / `gsi1sk` | `ttl` |
|---|---|---|---|---|---|
| School | `SCH#<schoolId>` | `PROFILE` | slug, display and legal name, URN, establishment type, status, plan and version, settings (staff sign-in methods, school hours, enrolment limit, PO required), counts (enrolled pupils, classes, staff), terms accepted (version, by, at), Stripe IDs, billing contacts, `demo` | `SCHOOLS` / `<status>#<slug>` | — |
| Slug | `SLUG#<slug>` | `SLUG` | schoolId; `retired: true` after deletion (a tombstone holding no school data) | — | Never: slugs are never reused ([03 §5](03-domains-edge-and-email.md#5-school-addresses-slugs-pq-2), DAT-Q8) |
| Invitation | `SCH#<schoolId>` | `INVITE#<email>` | access level, billing flag, invited by and when | — | 14 days |
| Email pointer | `EMAIL#<email>` | `SCH#<schoolId>` | status. Used by the triggers and to stop duplicate invitations | — | — |
| Membership | `SCH#<schoolId>` | `MEMBER#<sub>` | email, name, access level, billing, status, identity provider, joined, last sign-in | `SUB#<sub>` / `SCH#<schoolId>` | — |
| Class | `SCH#<schoolId>` | `CLASS#<classId>` | name, year groups, `teacherSub`, status. Sign-in: mode, code, `openUntil`, `signedOutAt`. Play: This week (map, topic set, ends on), maps off, paused, home play (a class setting: SCH-Q8, PS0-10) | — | — |
| Class code | `SCH#<schoolId>` | `CODE#<code>` | classId | — | — |
| Pupil | `SCH#<schoolId>` | `PUPIL#<pupilId>` | first name, last initial, display name, year group, optional level override, classId or none, status (`enrolled`, `archived`), avatar, optional school reference, `hasCognitoUser`. Sign-in: mode, `secretHash`, salt, `secretEnc`, failure counters, `lockedUntil`, `needsTeacher`. Plus qrHandle, created by and at, `archivedAt` | `CLASS#<classId>` or `UNASSIGNED#<schoolId>` / `<displayName>#<pupilId>` | `archivedAt` + 90 days (DAT-Q9) |
| QR handle | `QR#<handle>` | `QR` | schoolId, pupilId | — | with the pupil |
| Import | `SCH#<schoolId>` | `IMPORT#<importId>` | by, class, status (`PREVIEW`, `CONFIRMED`, `DISCARDED`, `FAILED`), parsed rows (preview only), counts, problems by row number | — | Preview 24 hours; the counts-only summary 30 days |
| Export | `SCH#<schoolId>` | `EXPORT#<exportId>` | by, status, object key | — | 7 days |
| Support grant | `SCH#<schoolId>` | `SUPPORT#<grantId>` | requested by, granted by, reason, from, until, ended | — | 2 years |
| Audit (school) | `AUDIT#<schoolId>#<yyyy-mm>` | `<isoTime>#<eventId>` | actor, action, target type and ID, summary | — | 2 years (PQ-15) |
| Audit (platform) | `AUDIT#PLATFORM#<yyyy-mm>` | `<isoTime>#<eventId>` | as above | — | 2 years |
| Plan | `PLAN` | `<planId>#V<n>` | name, price per pupil per term (pence), minimum pupils, features, Stripe price ID, status ([09](09-billing.md)) | — | — |
| Subscription mirror | `SCH#<schoolId>` | `BILLING#SUB` | Stripe subscription ID, status, collection method, quantity, last synced count and time, current period, trial end, discount | — | — |
| Invoice mirror | `SCH#<schoolId>` | `BILLING#INV#<invoiceId>` | number, status, totals, dates, period, quantity, PO number, hosted page and PDF links, held for PO | `INVOICES` / `<status>#<dueDate>#<schoolId>` | 6 years from issue (PQ-15) |
| Stripe event | `STRIPE#EVT#<eventId>` | `EVT` | type, received, processed | — | 30 days |
| Rate counter | `RL#CLASS#<classId>`, `RL#SCHOOL#<schoolId>` | `<window start>` | failure count | — | 1 hour |

**Uses of `gsi1`** (lists only):

| Partition key | Lists |
|---|---|
| `SUB#<sub>` | A person's schools (the portal header; several schools Later) |
| `CLASS#<classId>`, `UNASSIGNED#<schoolId>` | A class roster sorted by name; unassigned pupils |
| `SCHOOLS` | The console's school list |
| `INVOICES` | The console's invoices by status |

`SCHOOLS` and `INVOICES` are single partitions, written rarely; fine into the thousands of schools [ASSUMPTION].

**Writes that must be atomic** (TransactWriteItems) [PROPOSAL]:

| Action | Items |
|---|---|
| Enrol a school | Put `SLUG#` (must not exist) + put school `PROFILE` |
| Invite staff | Put `INVITE#` or `MEMBER#` (status `invited`) + put `EMAIL#` (must not exist); then AdminCreateUser |
| Enrol pupils | Per pupil: put `PUPIL#` + put `QR#` (both must not exist); once per batch: add to the school's enrolled count. Then an asynchronous call to `billing` to sync the Stripe quantity ([09](09-billing.md)) |
| New class code | Put the new `CODE#` (must not exist) + update the class + delete the old `CODE#` |
| Archive a pupil | Update the pupil (status, `archivedAt`, `ttl`) + delete `QR#` + subtract from the count; then AdminDeleteUser, TTL on the pupil's `game` items, and a `billing` sync |

-  A CSV of up to 500 pupils (Admins; 60 for Teachers, SCH-Q2) goes in batches of 30 pupils per transaction, each
  holding its own count update. - Pupil IDs are generated when the preview is made and stored on the import item, so a
  retried confirm is idempotent through the "must not exist" conditions. - The transaction size limit is [UNVERIFIED:
  check the current TransactWriteItems item limit].
- **Hot partitions**: one school's partition takes all its staff writes and its pupils' sign-in counters. A school of a
  few hundred pupils is far below DynamoDB's per-partition throughput [ASSUMPTION: documented per-partition limits; to
  be confirmed by the load test, DAT-19].

---

## 3. API

### 3.1 Shape

**Routes**

- Routes stay in **`contracts/routes.json`**. Today it has R1–R62, and Terraform and the functions' allow-lists are
  generated from it [VERIFIED `contracts/routes.json`; `infrastructure/main/locals.tf:66-75`].
- New routes continue from **R63** (DAT-Q7). Each entry gains a `permission` field, from which the permission table in
  [04 §5.2](04-identity-and-access.md#52-permissions) is generated.

**Authorisers** (JWT, one per pool):

| Authoriser | Audience | Scopes |
|---|---|---|
| `operator` | `console-web` | `ops/content`, `ops/platform` |
| `staff` | `staff-web`, plus the federation clients at Launch; at most 50 entries in all [VERIFIED 04 S12] | `school/staff` |
| `pupil` | `pupil-web` | `game/play` |

Every authorised route requires its scope.

**Hosts.** Each distribution runs a CloudFront Function on viewer request for `/api/*` that **sets `x-scd-host`**,
overwriting anything the client sent:

| Distribution | `x-scd-host` |
|---|---|
| School | The slug |
| Console | `admin` |
| Hooks | `hooks` |
| Marketing | `www` |

- Today `/api/*` uses `AllViewerExceptHostHeader`, so the Host header never reaches the API [VERIFIED
  `infrastructure/modules/static_site/main.tf:185`, code map]. The function's header carries the host instead.
- **Origin verify**: CloudFront also adds a secret header as an origin custom header [ASSUMPTION: a viewer cannot
  override an origin custom header; confirm]. Every function refuses requests without it
  ([04 §5.3](04-identity-and-access.md#53-enforcement-on-every-request), AUTH-Q10).

| Namespace | Host | Authoriser | Function |
|---|---|---|---|
| `/api/pupil-auth/*` | School | None (rate-limited, origin-verified; WAF from Launch, DNS-Q3) | `pupil_auth` |
| `/api/me*`, `/api/planets`, `/api/runs*`, `/api/session`, `/api/speech` | School | `pupil` | `player_api`, `tts` |
| `/api/school/*` (except billing) | School | `staff` | `school_api` |
| `/api/school/billing/*` | School | `staff` | `billing` |
| `/api/platform/*` (except billing) | Console | `operator` | `platform_api` |
| `/api/platform/billing/*` | Console | `operator` | `billing` |
| `/api/admin/*` (content, R17–R62) | Console | `operator` | `admin_api`, `tts`, as today |
| `/api/hooks/stripe` | Hooks | None (Stripe signature) | `billing` |
| `/api/public/demo-requests` | Marketing | None (rate-limited) | `platform_api` ([12](12-marketing-and-sales.md)) |

Billing routes go **straight to `billing`**, which shares the RBAC module, so the Stripe key lives in one function and
no API function calls another synchronously (DAT-Q3).

### 3.2 Route catalogue (new and changed)

**Pupil sign-in** (`pupil_auth`):

| Route | Does |
|---|---|
| `POST /api/pupil-auth/class` | `{code}` → class name, plus pupils' display names, avatars and IDs, **only while sign-in is open** |
| `POST /api/pupil-auth/card` | `{handle}` → that pupil's display name, avatar and sign-in mode |
| `POST /api/pupil-auth/sign-in` | `{pupilId or handle, answer}` → tokens, or `WRONG_ANSWER`, `LOCKED`, `NEEDS_TEACHER`, `SIGN_IN_CLOSED` ([04 §6](04-identity-and-access.md#6-pupil-sign-in)) |

**Player** (`player_api`; existing routes made school-aware):

| Route | Change for school pupils |
|---|---|
| `GET /api/me` | Adds school, class, display name, This week, paused |
| `PUT /api/me/profile` | Refused (`NOT_FOR_SCHOOL_PUPILS`): no birthday step |
| `PATCH /api/me/profile` | Avatar only |
| `POST /api/me/resets` | Refused; teachers clear progress |
| `GET /api/planets` | Only the maps the class allows, This week's map first ([07](07-pupil-experience.md)) |
| `POST /api/runs`, `…/ops`, `…/endless` | Refused while the class is paused or the school suspended; tokens older than the class's `signedOutAt` refused |
| `PUT`/`DELETE /api/session` | As today. The play lease (180 s, renewed every 60 s) is when a pause or sign-out takes effect for a game already open [VERIFIED `web/player/src/run/lease.ts:1-21`] |

**School portal** (`school_api`; permission names from [04 §5.2](04-identity-and-access.md#52-permissions)):

| Route | Permission |
|---|---|
| `GET /api/school/me` (membership, permissions, school summary; first sign-in activates) | `school.view` |
| `POST /api/school/terms/accept` | `school.terms.accept` |
| `GET`, `PATCH /api/school/settings` | `school.view` / `school.settings.manage` |
| `GET /api/school/counts` | `counts.view` |
| `GET /api/school/staff` | `staff.view` |
| `POST /api/school/staff/invitations`; `DELETE …/invitations/{email}`; `POST …/invitations/{email}/resend` | `staff.manage` |
| `PATCH /api/school/staff/{sub}` (access level, billing); `DELETE /api/school/staff/{sub}`; `POST /api/school/staff/{sub}/reset-sign-in` | `staff.manage` |
| `GET /api/school/classes`; `GET …/classes/{classId}` | `class.view` |
| `POST /api/school/classes` | `class.create` |
| `PATCH /api/school/classes/{classId}` | `class.edit` (teacher change: `class.assign_teacher`) |
| `POST …/classes/{classId}/archive` | `class.archive` |
| `POST`, `DELETE …/classes/{classId}/sign-in`; `POST …/code`; `POST …/sign-out-all`; `GET …/cards`; `GET …/password-sheet` (audited) | `class.signin.manage` (sheet also `pupil.signin.manage`) |
| `PUT …/classes/{classId}/this-week`; `PUT …/maps`; `POST …/pause`; `POST …/resume` | `class.play.manage` |
| `GET /api/school/pupils?classId=&status=&cursor=` | `pupil.view` |
| `POST /api/school/pupils` (1 to 60 pupils) | `pupil.enrol` |
| `GET`, `PATCH /api/school/pupils/{pupilId}` | `pupil.view` / `pupil.edit` |
| `POST …/pupils/{pupilId}/unassign` | `pupil.unassign` |
| `POST …/pupils/{pupilId}/move` | `pupil.move` |
| `POST …/pupils/{pupilId}/archive`; `POST …/restore`; `DELETE …/pupils/{pupilId}` | `pupil.unenrol` / `pupil.delete` |
| `POST …/pupils/{pupilId}/sign-in/reset`; `GET …/sign-in/secret` (audited); `POST …/card/reissue`; `POST …/unlock` | `pupil.signin.manage` |
| `POST /api/school/imports` (CSV up to 256 KB → preview); `GET …/imports/{id}`; `POST …/imports/{id}/confirm`; `DELETE …/imports/{id}` | `pupil.enrol` ([06](06-school-portal.md)) |
| `GET /api/school/progress/classes/{classId}`; `GET …/progress/pupils/{pupilId}` | `progress.view` |
| `GET …/progress/classes/{classId}/export` (CSV) | `progress.export` |
| `POST /api/school/new-year/preview`; `POST …/new-year/confirm` | `newyear.run` |
| `POST /api/school/exports`; `GET …/exports/{id}` | `data.export` |
| `POST /api/school/deletion-request` | `data.delete_request` |
| `GET /api/school/audit?month=` | `audit.view` |
| `POST /api/school/support-grants`; `DELETE …/support-grants/{id}` | `support.grant` |

**School billing** (`billing`; detail in [09](09-billing.md)):

| Route | Permission |
|---|---|
| `GET /api/school/billing` (plan, enrolled count, next-invoice estimate, invoices) | `billing.view` |
| `GET /api/school/billing/invoices/{invoiceId}/pay` (the hosted invoice page link) | `billing.pay` |
| `PUT /api/school/billing/details`; `PUT …/po`; `POST …/portal-session`; `POST …/direct-debit-session`; `POST …/invoices/{invoiceId}/release` | `billing.manage` |

**Console** (`platform_api`, or `billing` for `/billing/`; operator permissions in
[04 §7](04-identity-and-access.md#7-operators-the-console); screens in [05](05-platform-console.md)):

| Route | Does |
|---|---|
| `GET`, `POST /api/platform/schools`; `GET`, `PATCH …/schools/{schoolId}` | List, enrol, read, edit schools |
| `GET /api/platform/slugs/{slug}` | Is a slug free and allowed |
| `GET /api/platform/gias/{urn}` | Look a school up in the GIAS extract the owner loaded ([05](05-platform-console.md)) |
| `POST …/schools/{schoolId}/status` | Activate, suspend, reinstate, end |
| `POST …/schools/{schoolId}/admin-invitations`; `PUT …/admin` | First Admin; break-glass reassignment |
| `GET …/schools/{schoolId}/staff`; `…/counts`; `…/audit` | School overview (no pupil names) |
| `POST …/schools/{schoolId}/support-requests` | Ask for support access |
| `GET …/schools/{schoolId}/pupils` and similar | Only while a support grant is active |
| `DELETE …/schools/{schoolId}/data` | Delete an ended school's data early (guarded, audited) |
| `POST /api/platform/demo/reset` | Recreate the demo school |
| `POST /api/platform/content/export`; `POST …/content/import` (dev only) | Content bundles (PQ-5) |
| `GET`, `POST /api/platform/billing/plans`; `POST …/plans/{planId}/versions` | Plan catalogue |
| `POST`, `PATCH /api/platform/billing/schools/{schoolId}/subscription` | Create the subscription, trial end, discount, collection method |
| `GET /api/platform/billing/invoices?status=`; `POST …/invoices/{invoiceId}/{void,credit-note,mark-paid,resend,release}` | Invoice actions |
| `GET /api/platform/billing/reports` | Billed pupils, termly revenue, overdue |

**Webhook** (`billing`):

| Route | Does |
|---|---|
| `POST /api/hooks/stripe` | Checks the `Stripe-Signature` HMAC over the **raw body**, within Stripe's 5-minute tolerance. De-duplicates by event ID (`STRIPE#EVT#`), answers 2xx quickly, and acts idempotently. Stripe retries failed deliveries for up to three days and doesn't guarantee order, so the handler fetches the current object from Stripe rather than trusting the event's copy [VERIFIED https://docs.stripe.com/webhooks, read 2026-11-21]. With payload 2.0 the body may arrive base64-encoded and must be decoded byte-exact before checking [ASSUMPTION] |

### 3.3 Conventions

- **Errors**: as today's contracts. New codes:
  - `NOT_A_MEMBER`, `LAST_ADMIN`, `ENROLMENT_LIMIT`;
  - `SCHOOL_SUSPENDED`, `SCHOOL_ENDED`, `CLASS_PAUSED`, `SIGNED_OUT`;
  - `SIGN_IN_CLOSED`, `WRONG_ANSWER`, `LOCKED`, `NEEDS_TEACHER`;
  - `IMPORT_INVALID`, `PO_REQUIRED`, `NOT_FOR_SCHOOL_PUPILS`.
- **Lists** take `cursor` (an encoded LastEvaluatedKey) and `limit`.
- **Idempotency** comes from natural keys: invitations by email, imports by importId, Stripe calls with idempotency
  keys built from the school and the action [PROPOSAL].
- **Names in responses**: pupils' display names go only to staff with `pupil.view`, and to the class list while sign-in
  is open.

### 3.4 Throttling and capacity

| Today [VERIFIED `infrastructure/main/main.tf:672-688`] | Problem for schools |
|---|---|
| Stage default 20 requests/s, burst 40, on every route | Shared by every caller in every school |
| `POST /api/runs` 1/s, burst 5 | Five classes of 30 starting together need about 150 run starts in a minute: most would be refused |

**Sizing case**: five classes of 30 sign in and start a game within two minutes. That is about:

- 300 `pupil-auth` calls;
- 150 run starts;
- 150 lease claims;
- 300 pack and run reads;
- then a few operations per pupil per wave.

**Proposed limits** [PROPOSAL, DAT-Q6]:

| Route group | Requests per second / burst |
|---|---|
| Stage default | 200 / 400 |
| `POST /api/runs` | 50 / 100 |
| `/api/pupil-auth/*` | 50 / 100 |
| `/api/hooks/stripe` | 20 / 40 |

- **Fairness per pupil and per school goes in our code** (for example at most one new run per pupil every 10 seconds),
  because HTTP APIs have no per-client usage plans [UNVERIFIED, noted in the code map].
- From Launch (DNS-Q3), abuse per IP goes in CloudFront WAF rate rules, set high enough for a school's shared IP. The
  Pilot relies on the throttles above.
- **Cognito**: 120 sign-ins per second per account across pools, more than enough
  ([04 §10](04-identity-and-access.md#10-capacity-and-security-controls)).
- **Lambda**: new accounts may start with a low concurrency quota. Check it, and ask for an increase before the pilot
  [UNVERIFIED for these accounts].
- **Load test** (DAT-19): the sizing case plus ten waves of play. Pass mark: no 429 or 5xx responses, p95 under 1 second.

---

## 4. Lambda functions and their permissions

Python 3.14 arm64 zips from the artefacts bucket, as today [VERIFIED `infrastructure/modules/lambda_function/main.tf:71-103`].
Least privilege, as in E §E.6. The table proposes each function's grants:

| Function | New? | Serves | `tenancy` | `game` | `content` | Other grants |
|---|---|---|---|---|---|---|
| `player_api` | Changed | Pupil routes | Read: the pupil's school, class and pupil items | Read and write `U#*` (LeadingKeys, as today) | Read | game-data read. No Cognito |
| `pupil_auth` | New | `/api/pupil-auth/*` | Read `CODE#`, `QR#`, school, class and pupil. Write: the pupil's sign-in fields, `RL#` counters | Write `U#*` PROFILE only | — | Cognito pupil pool: AdminInitiateAuth, AdminRespondToAuthChallenge, AdminCreateUser, AdminSetUserPassword |
| `auth_triggers` (pupil) | New | Define, Create, Verify; pre token generation | Read the pupil's `secretHash` and salt | — | — | Secrets: the pepper. No Cognito calls |
| `auth_triggers` (staff) | New | Custom message; pre sign-up; inbound federation; pre token generation; post authentication | Read `EMAIL#`, `INVITE#`, `MEMBER#`, the school. Write the membership (activate, last sign-in) | — | — | Cognito staff pool: AdminLinkProviderForUser (Launch) |
| `school_api` | New | `/api/school/*` except billing | Read and write under `SCH#*`, `QR#*`, `EMAIL#*`, `AUDIT#*`. Read `SLUG#*` | Read `U#*` (`SUM#`, PROFILE) for progress. Update and delete `U#*` (archive TTL, deletion, profile fields) | Read (topic names) | Cognito staff pool: AdminCreateUser, AdminDeleteUser, AdminUserGlobalSignOut, AdminSetUserMFAPreference, AdminResetUserPassword. Cognito pupil pool: AdminDeleteUser, AdminUserGlobalSignOut. KMS: encrypt and decrypt with the pupil-secret key. Secrets: pepper. Lambda: asynchronous invoke of `billing`. S3: exports bucket put and presign. SES: send from `no-reply@` only |
| `platform_api` | New | `/api/platform/*` except billing; demo requests | Read and write all prefixes | Delete `U#*` (school deletion); write `U#*` for the demo school's fixtures | Read; content bundles | Cognito staff pool: AdminCreateUser, AdminDeleteUser, AdminUserGlobalSignOut; at Launch CreateIdentityProvider, UpdateIdentityProvider, DeleteIdentityProvider, DescribeUserPoolClient, UpdateUserPoolClient, CreateUserPoolClient on the staff pool only. Cognito pupil pool: AdminDeleteUser. S3: game-data read; content bundles. SES |
| `billing` | New | School and console billing routes; `/api/hooks/stripe`; asynchronous quantity sync | Read and write the school's billing fields and `BILLING#*`, `PLAN`, `STRIPE#EVT#*`. Read counts | — | — | Secrets: Stripe restricted key, webhook signing secret. Outbound HTTPS to Stripe. No Cognito |
| `admin_api` | Unchanged | `/api/admin/*` | — | Never | Read and write, as today | As today [VERIFIED code map] |
| `tts` | Changed | `/api/speech`, preview | — | GetItem on `U#*`; must accept pupilId keys | — | Polly as today. Drop the unused game-data grant [VERIFIED `infrastructure/main/main.tf:449-455`] |
| `picture_gen`, `game_data_publish`, `game_data_check` | Unchanged | As today | — | — | As today | As today (OpenAI only in `picture_gen`) |

Notes:

- **One synchronous chain only, as today.** `admin_api` invokes `game_data_publish`
  [VERIFIED `api/shared/gamedata_admin.py:64-79`]. The only new call between functions is `school_api` → `billing` with
  `InvocationType=Event` ("sync the quantity for school X").
- `auth_triggers` is one code base deployed as **two functions**, so the pupil triggers can't touch the staff pool and
  the reverse. Each must answer Cognito within 5 seconds [VERIFIED 04 S5]: small packages, no heavy imports.
- **Shared code**:
  - `api/shared/auth.py` keeps today's checks [VERIFIED `api/shared/auth.py:72-93`].
  - New `api/shared/tenancy_auth.py`: host → school, membership, permission, ownership.
  - New `api/shared/permissions.py`: generated from `contracts/routes.json`.
- **IAM conditions**:
  - `dynamodb:LeadingKeys` per function, as used today [VERIFIED `infrastructure/main/main.tf:209, 438, 524`];
  - Cognito actions only on the named pool's ARN;
  - KMS through the key policy, with the encryption context `{schoolId, pupilId}`;
  - SES restricted by `ses:FromAddress`.

---

## 5. Keeping schools apart

| Layer | How |
|---|---|
| Edge | `x-scd-host` set by CloudFront; origin-verify header; no route works on the wrong kind of host |
| Identity | Staff need an active membership of the host's school, checked on every request. Pupils' tokens map to one pupil in one school |
| Keys | Everything under `SCH#<schoolId>` except audit, lookup and rate-counter items (ADR-0046); a pupil's play under `U#<pupilId>` |
| IAM | LeadingKeys per function; only `platform_api` and `billing` read across schools |
| Logs | `schoolId` in every log line; no names |
| Tests | Below; the penetration test focuses here ([11](11-privacy-security-and-assurance.md)) |

**Isolation suite** (runs in CI and against dev):

1. A staff member of school A, on A's address: allowed exactly as the permission matrix says.
2. The same person on B's address: `NOT_A_MEMBER` on every route.
3. A's token, sent straight to execute-api with a forged `x-scd-host: b`: 403 (origin verify).
4. School B's object IDs used on A's address: 404.
5. A pupil of A: cannot read another pupil, cannot see B's class list even with B's open class code on A's address, and
   cannot reach any `/api/school/*` route.
6. A support grant for A gives the owner nothing in B.

---

## 6. Retention and deletion

| Data | Kept | How it goes |
|---|---|---|
| Enrolled pupil | While enrolled | — |
| Archived pupil (un-enrolled) | **90 days** after archiving (DAT-Q9) | When archived: TTL on the pupil item and their `game` items; Cognito user deleted. Restoring within 90 days clears the TTLs |
| School after its licence ends | **90 days** (PQ-15) | When the school becomes `ENDED`, `platform_api` sets TTL (end + 90 days) on every `SCH#<id>` item except billing, every pupil's `game` items, `QR#` and `EMAIL#`. It deletes pupils' Cognito users and staff users who have no other membership, except the school's Admins: they keep sign-in for the 90-day export window, and a scheduler job (Launch) deletes their Cognito users at day 90 (PS0-12) |
| Slug | Kept as a tombstone for ever, so it is never reused | `SLUG#` with `retired: true`, no TTL (DAT-Q8) |
| Invoices, subscription mirror | **6 years** from issue (PQ-15) | TTL; also kept by Stripe |
| Audit | **2 years** | TTL |
| Import preview / summary | 24 hours / 30 days | TTL |
| Exports | 7 days | S3 lifecycle |
| Stripe events | 30 days | TTL |
| Backups | PITR up to 35 days; AWS Backup 7 daily points (today's pattern) | Expire; the privacy notice says deleted data can survive in backups up to 35 days [PROPOSAL] |

- No scheduler is needed for table items: TTLs are set at the moment a pupil is archived or a school ends.
- DynamoDB TTL deletes items some time after they expire, so reads filter out expired items [ASSUMPTION: standard TTL
  behaviour].
- A pupil with very many `game` items has their TTLs set by an asynchronous invoke of `school_api` itself.

---

## 7. Exports

- **Whole school** (`data.export`, Admin):
  - **Contents**: a ZIP of JSON and CSV files (classes, pupils, staff, progress summaries, the last two years of audit).
  - **Storage**: the exports bucket (SSE-KMS, 7-day lifecycle); the Admin gets a link that lasts 15 minutes.
  - **Why**: the DfE cloud standard asks for exit data "in an open standard or neutral format" [VERIFIED DfE cloud
    solutions standard, read 2026-11-21].
  - **Large schools**: built asynchronously, with progress shown [PROPOSAL].
- **Progress CSV** (`progress.export`): built synchronously. Cells starting with `=`, `+`, `-` or `@` are prefixed to stop
  spreadsheet formula injection [PROPOSAL].

---

## 8. Observability

- **Logs**: JSON with route, `schoolId`, outcome, error code and latency.
  - **Never** pupil names, secrets, tokens or raw CSV rows.
  - The API access log stays an allow-list, as today (it includes `sub`) [VERIFIED code map].
- **Metrics and alarms**:
  - pupil sign-in failures (all schools);
  - lockouts;
  - API 5xx and 429;
  - Lambda errors and throttles;
  - webhook failures;
  - Stripe quantity-sync failures.

  Per-school breakdowns come from Logs Insights rather than a metric for each school, to keep custom metrics few
  [PROPOSAL].

---

## 9. Decisions for the owner

Answered at the PS0 gate on 2026-11-22: every recommendation below was accepted, except where the
[decision register](14-decision-register.md) says Open.

| ID | Question | Recommendation |
|---|---|---|
| DAT-Q1 | A new `tenancy` table with one overloaded GSI (revisiting ADR-0004 for this table only), with access decisions always on base-table reads? | Yes |
| DAT-Q2 | School pupils' `game` partitions keyed by pupilId (the Cognito username), not `sub`? | Yes. This differs from the family edition, so `player_api` and `tts` read the key from the `username` claim for school pupils |
| DAT-Q3 | Billing routes served by `billing` directly, rather than `school_api` and `platform_api` calling it? | Yes: one holder of the Stripe key, no synchronous chains |
| DAT-Q4 | Deletion by TTL set when a pupil is archived or a school ends (no scheduler)? | Yes |
| DAT-Q5 | Whole-school exports as a ZIP in an exports bucket with 7-day expiry and 15-minute links? | Yes |
| DAT-Q6 | Throttles as in §3.4, with fairness per pupil and school in code and WAF rate rules per IP? | Yes, then tuned by the load test. The WAF rules come at Launch, with DNS-Q3 (PS0 gate) |
| DAT-Q7 | New routes numbered from R63 in `contracts/routes.json`, each with a `permission` field? | Yes |
| DAT-Q8 | A deleted school's slug is never reused (a tombstone with no school data), so an old QR card or bookmark can't reach a new school ([03 §5](03-domains-edge-and-email.md#5-school-addresses-slugs-pq-2))? | Yes |
| DAT-Q9 | Archived pupils deleted 90 days after archiving (the same period as a school's end)? | Yes |
| DAT-Q10 | Teachers' own questions (Later) stored as school data in `tenancy`, not in `content`? | Yes, decided when that work starts |

---

## 10. User stories

*Snapshot of 2026-11-21. The source of truth for these stories is now Jira (project SCD); see
[README §6](README.md#6-user-stories-and-jira). Edit the tickets, not this table.*

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| DAT-1 | As the owner, I want the `tenancy` table in each environment, so that school data has its own home | Terraform creates it with PITR, deletion protection, `prevent_destroy`, TTL `ttl` and `gsi1`; in the backup plan | Pilot |
| DAT-2 | As the owner, I want slugs to be unique and reserved names refused, so that two schools never share an address | Conditional put on `SLUG#`; the reserved list (one file, the union of [03](03-domains-edge-and-email.md) §5 and [05](05-platform-console.md) §11.4: PS0-6) enforced; a deleted school's slug never reused: its `SLUG#` item stays as a tombstone with no school data (DAT-Q8) | Pilot |
| DAT-3 | As a developer, I want membership and invitation items with strongly consistent lookups, so that access checks are never stale | Membership read by GetItem on every request; email pointer stops duplicate invites; tests cover invite → active → removed | Pilot |
| DAT-4 | As a developer, I want class, class-code and pupil items with a roster index, so that teachers can list a class quickly | A roster of 35 lists in under 300 ms; class codes unique per school; moves update the roster | Pilot |
| DAT-5 | As a developer, I want school pupils' play keyed by pupilId, so that it survives their Cognito user being recreated | `player_api` and `tts` use the `username` claim for school pupils; archive and restore keeps progress; family edition unchanged | Pilot |
| DAT-6 | As the owner, I want CloudFront to set `x-scd-host` and the origin-verify header on every distribution, so that functions know the host and refuse direct calls | Client-sent `x-scd-host` is overwritten; direct execute-api calls get 403; each namespace refuses the wrong host | Pilot |
| DAT-7 | As a developer, I want the new routes in `contracts/routes.json` with a permission each, so that authorisers, allow-lists and the RBAC table are generated | Routes R63+ present; generation produces Terraform routes and `permissions.py`; CI fails on a route with no permission | Pilot |
| DAT-8 | As a developer, I want `school_api` built on a shared tenancy-auth module, so that every route checks host, membership, permission and ownership the same way | The module is the only path to data; the matrix tests in 04 pass | Pilot |
| DAT-9 | As a developer, I want the pupil sign-in endpoints with counters and limits, so that classes can sign in safely | The three routes behave as §3.2; counters expire after an hour; limits match 04 §6.4 | Pilot |
| DAT-10 | As a pupil, I want the game to follow my class's settings, so that pause, This week and maps work | `player_api` reads the class each request; paused → `CLASS_PAUSED`; sign-out-all takes effect at the next request or lease renewal | Pilot |
| DAT-11 | As a teacher, I want enrolment from a list or CSV to be all-or-nothing per batch and safe to retry, so that I never get duplicate pupils | Batches of 30 in transactions; a retried confirm creates nothing new; enrolled count correct afterwards | Pilot |
| DAT-12 | As a teacher, I want progress endpoints for my class and each pupil, so that the portal can show practice | Class grid for 35 pupils in under 1 s; numbers match the pupil's own My progress | Pilot |
| DAT-13 | As an Admin, I want audit records written for every write, so that the log is complete | Every write route produces one record; records hold IDs, not names; month queries work; TTL 2 years | Pilot |
| DAT-14 | As the owner, I want the isolation suite in CI and against dev, so that a cross-school leak is caught before release | The six cases in §5 pass; a deliberately broken check makes CI fail | Pilot |
| DAT-15 | As the owner, I want throttles sized for whole classes, so that a lesson start isn't refused | Limits as §3.4; per-pupil run limit in code. The Pilot relies on these throttles in code; any WAF part, such as a rule on `/api/pupil-auth/*`, comes at Launch with DNS-Q3 (DAT-Q6) | Pilot |
| DAT-16 | As an Admin, I want archived pupils deleted after 90 days, so that we keep no more than needed | TTLs set at archive on both tables; Cognito user deleted; restore within 90 days clears the TTLs | Pilot |
| DAT-17 | As the billing function, I want mirror items and event de-duplication, so that invoices show in the portal and duplicates do nothing | Each Stripe event processed once; the mirror matches Stripe after replaying events out of order | Launch |
| DAT-18 | As an Admin, I want a whole-school export, so that I can leave with our data or answer a request | ZIP of JSON and CSV in the exports bucket; 15-minute link; expires after 7 days; audited | Launch |
| DAT-19 | As the owner, I want a load test of five classes starting at once, so that I know the pilot won't fail at 9:05 | 150 pupils sign in and play ten waves; no 429 or 5xx; p95 under 1 s; results recorded | Launch |
| DAT-20 | As the owner, I want an ended school's data to go 90 days after its licence ends, so that we meet the DPA | TTLs set at `ENDED`; Cognito users removed (its Admins' at day 90, after the export window, PS0-12); invoices and audit kept; slug kept as a tombstone, never reused (DAT-Q8) | Launch |
| DAT-21 | As the owner, I want each function's IAM reviewed against §4, so that a bug in one can't reach another school's data | Policies match §4; IAM Access Analyzer shows no unused grants; the `tts` game-data grant removed | Launch |
| DAT-22 | As a trust's staff member, I want one account in several schools, so that I don't need many logins | Memberships in several schools; school picker from `gsi1` `SUB#`; each request still checks the host's school | Later |
