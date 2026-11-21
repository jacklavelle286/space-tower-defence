# 05. Platform console

Part of the [platform scope](README.md). Status: scope, parked.

---

## 1. Summary

The console at `admin.spacecolonydefence.com` (dev: `admin.dev.spacecolonydefence.com`) is the owner's app
[CONFIRMED by owner 2026-11-21, PD-5]. It does three jobs:

- **Running the business**: enrolling schools, plans and billing, support for schools.
- **Making the game**: every content tool the family edition's admin has today, plus year groups, topic sets and
  AI-assisted question drafting.
- **Running the platform**: health, costs, audit, settings, the demo school, and content export and import.

The code base is today's `web/admin` app, extended ([02 §5](02-environments-and-delivery.md#5-code-on-the-dev-branch)).

In the first releases the owner is the only user. Every screen still checks a **named permission** (section 13), so
that Support, Content editor and Finance roles can be added later without rewriting screens
([01 §3.2](01-product-and-roles.md#32-platform-roles)).

What the console never shows outside **support access** (section 9.1): pupils' names, classes' names, or progress. Those
belong to the school (rule R1, [01 §4](01-product-and-roles.md#4-rules-that-shape-every-layer-proposal-unless-marked)).
The console works with counts, school details, staff details and billing.

---

## 2. Sign-in and access

| Item | How |
|---|---|
| Pool | The **operator pool** in each platform account, as in the family edition: accounts created by the owner only, no self sign-up [PROPOSAL; today's pool: VERIFIED infrastructure/main/main.tf:601-638] |
| Factors | Password and **TOTP MFA**, enrolled at first sign-in [VERIFIED today: cognito_pool/main.tf:78-88] |
| Flow | Managed login on a Cognito domain with the admin's own PKCE code: access token in `sessionStorage`, renewal through `/oauth2/token`, revoke and logout on sign-out [VERIFIED today: web/admin/src/auth/session.ts] |
| Trusted browser | "Trust this browser" keeps the refresh token in `localStorage` (ADR-0042, **Proposed**). The console can enrol schools and move money, so a shorter trust window is proposed (CON-Q8) |
| Network | Only `admin.` serves the console bundle and the `/api/platform/*` routes. A request for those routes on any other host is refused at the edge ([03](03-domains-edge-and-email.md)) |
| Idle | The console signs out after 30 minutes without input; a warning appears 2 minutes before, with "Stay signed in" [PROPOSAL] |

The owner's own sign-ins, failed sign-ins and MFA changes go to the platform audit (section 11.3).

---

## 3. Layout and navigation

| Area | Pages | Permission (section 13) |
|---|---|---|
| Dashboard | Dashboard | `platform.dashboard.read` |
| Schools | Schools, Enrol a school, School page | `platform.schools.*` |
| Plans | Plans | `platform.plans.*` |
| Billing | Overview, Invoices, Payments, Credit notes, Overdue, Billing date preview, Reports | `platform.billing.*` |
| Content | Activities, Speech, Pictures, Maps, Aliens, Versions, Bank status, **Topics and topic sets**, **Question drafts** | `platform.content.*` |
| Support | Support access, Admin replacement, Data requests, Announcements | `platform.support.*` |
| Demo school | Demo school | `platform.demo.reset` |
| Operations | Health, Costs, Audit, Settings, Content export and import | `platform.ops.*`, `platform.settings.write` |

A user sees only the areas their permissions allow; hidden, not greyed out. Every page title states the environment
("Dev" in an orange bar, nothing in prod), so dev is never mistaken for prod [PROPOSAL].

---

## 4. Dashboard

Numbers only; no pupil names (R1). Each tile links to the page behind it.

| Tile | Shows | Source |
|---|---|---|
| Schools | Count by status: pending, trial, active, past due, suspended, ending, ended (section 5.6) | School records |
| Pupils | Enrolled pupils in total and by year group; change since the last billing date | Enrolment counts ([10](10-data-and-api.md)) |
| Next billing date | The date (1 September, 1 January or 1 May, PQ-12) and the projected total: enrolled pupils × price, minimum applied, before VAT | Plans and counts; Stripe after Launch |
| Overdue | Count and amount of overdue invoices; oldest days overdue | Billing mirror ([09](09-billing.md)) |
| Trials ending | Schools whose trial ends in the next 14 days, and whether each has a billing contact | School records |
| Waiting for the owner | Pending enrolments with a failed step; Admin replacement requests; data requests; question drafts to review | Support and content records |
| Support access | Grants active now, with their end times | Support records |
| Health | Alarm states for the environment; sign-in failures and webhook failures in the last 24 hours | CloudWatch ([02 §11](02-environments-and-delivery.md#11-user-stories)) |
| Announcements | Banners live now | Announcement records |

The demo school is left out of every count and total (section 10).

Empty state, before the first school exists: "No schools yet. Enrol your first school." with the Enrol button.

---

## 5. Schools

### 5.1 School list

| Column | Notes |
|---|---|
| School | Display name, with the address (`<slug>.spacecolonydefence.com`) underneath, as a link that opens in a new tab |
| URN | From the school register (section 5.2) |
| Status | Section 5.6, with a coloured label and the text (never colour alone) |
| Plan | Plan name and any discount (e.g. "Pilot, 100% off until 1 May 2027") |
| Pupils | Enrolled count now |
| Next invoice | Date and estimate; "No billing" for pilot or demo schools without a subscription |
| Overdue | Days overdue of the oldest unpaid invoice, if any |
| Created | Date |

- **Search** by name, slug, URN or postcode.
- **Filters**: status, plan, overdue, trial ending within 14 days, sign-in method (email, Microsoft, Google).
- Sorted by name; the sort is remembered per browser.
- **Export** the list as CSV. School-level data only, with formula-injection protection (cells starting with `=`, `+`,
  `-`, `@`, tab or carriage return are prefixed with `'`) [PROPOSAL].

### 5.2 The school register (GIAS)

The DfE's Get Information About Schools (GIAS) publishes every establishment in England as **CSV downloads, updated
daily, under the Open Government Licence v3.0**. It says "The data fields and the order of the data fields can change".
There is **no public API**: GIAS offers "WebServices" only by service request [VERIFIED
get-information-schools.service.gov.uk/Downloads, read 2026-11-21]. Today's all-establishments file has 135 columns,
including URN, local authority, establishment name, type, type group, status, phase of education, statutory low and high
ages, number of pupils, trust, address fields, postcode and website [VERIFIED: header of `edubasealldata20261121.csv`,
read 2026-11-21].

[PROPOSAL] **Refresh school register** in Settings (section 11.4):

1. Fetches the all-establishments CSV, or accepts it as an upload if a stable download URL can't be used [UNVERIFIED:
   whether the file can be fetched without the download page].
2. Finds columns **by header name, not position**, because the order can change. If a needed column is missing it
   stops with a clear message.
3. Keeps only open establishments in England whose phase includes primary, and only these fields: URN, name, type,
   type group, status, phase, statutory ages, number of pupils, local authority, trust code and name, street, locality,
   town, postcode.
4. **Head teacher names and phone numbers are never stored**, although GIAS publishes them. The one exception is the
   phone check in section 9.2, which reads GIAS at the time of the check and keeps nothing.
5. Writes a compact lookup file that the console searches in the browser, plus the date of the register. A primary
   phase extract of about 20,000 rows is small enough for that [ASSUMPTION: size to be measured].

The enrol wizard shows the register's date. If it is older than 30 days, it suggests a refresh.

### 5.3 Enrol a school

A wizard of eight steps. Each step can go back; nothing is created until step 8.

| Step | What the owner enters or checks | Rules and errors |
|---|---|---|
| 1. Find the school | Search the register by name, URN or postcode; pick one. "Not in the register" lets the owner type details by hand (e.g. a school that opened this week), flagged on the school record | A URN already enrolled is refused, unless that school's record is **ended** or **deleted**, which re-enrols it as a new school. A closed school, or one whose phase is not primary, gives a warning the owner must tick to continue (e.g. an all-through school) |
| 2. School details | **Display name** (shown to pupils and staff), **invoice name** (the legal customer: the governing body or school for maintained schools, the academy trust for academies), invoice address, school type and trust (from the register) | Display name 2–60 characters. Invoice name and address are required before Launch billing; optional for a pilot school |
| 3. Address | **Slug**, suggested from the display name, e.g. `exampleprimary` for "Example Primary School" → `exampleprimary.spacecolonydefence.com` | 3–30 characters; lower-case letters, digits and hyphens; starts with a letter; no double hyphen; not on the reserved list (section 11.4); not used by a deleted school in the last 12 months [PROPOSAL, CON-Q2]. Checked live as the owner types |
| 4. Plan and trial | Plan (one at launch, PD-12); trial end (default: the next billing date, at least 30 days away, PQ-13); discount (e.g. pilot: 100% for named terms); **PO required** (yes or no); "Not billed" for the pilot before billing exists | Trial end must be on or before a billing date. A 100% discount needs an end date or "until changed" |
| 5. Billing contact | Name and email of the person who receives invoices (e.g. the school business manager). Optional second contact | Email format checked. The school's Billing admins can change contacts later ([09 §13](09-billing.md#13-the-schools-billing-page)) |
| 6. First Admin | Email and name of the person who will set the school up. Option: send the invitation now or later | Email format checked; warns if the address looks personal (a common webmail domain) rather than a school one [PROPOSAL] |
| 7. Sign-in defaults | Staff: email, password and MFA (Pilot). Microsoft or Google is noted as "to set up with the school" (Launch, [04](04-identity-and-access.md)). Pupils: picture password by default; typed passwords allowed per class (PD-13) | — |
| 8. Review | Everything on one page with Edit links, and what will happen (section 5.4) | "Create school" |

### 5.4 What "Create school" does

Creating a school is a sequence of steps. Each is idempotent (keyed by the new school's ID), and each one's state is
shown on the school page, so a failure can be retried without making duplicates [PROPOSAL]:

| # | Step | If it fails |
|---|---|---|
| 1 | Reserve the slug (a conditional write; fails if another school took it a moment ago) | Back to step 3 of the wizard with "This address was just taken" |
| 2 | Create the school record with status **Pending**, its settings, and the enrolment counter at 0 ([10](10-data-and-api.md)) | Retry |
| 3 | **Launch:** create the Stripe customer and subscription, with the trial end, discount, PO setting and billing contact ([09](09-billing.md)). Pilot: skipped, school marked "Not billed" | School stays Pending with "Billing not set up · Retry" |
| 4 | Create the first Admin's staff invitation and send it by email ([04](04-identity-and-access.md)); skipped if "send later" was chosen | "Invitation not sent · Resend" |
| 5 | Write the platform audit entry | Retried automatically; never blocks |

No DNS or certificate work is needed per school: the wildcard covers every slug ([03](03-domains-edge-and-email.md)).
The school's address shows "This school is getting ready" to pupils until the school has classes.

### 5.5 The school page

| Tab | Shows | Actions |
|---|---|---|
| **Overview** | Status and its reason; address link; created, trial end, next billing date; counts of staff, classes and enrolled pupils by year group (numbers only); last staff sign-in; last pupil play (date only); provisioning steps if any failed | Retry a failed step |
| **Details** | Display name, invoice name and address, URN, type, trust, local authority, register date | Edit; re-read from the register (shows a diff first) |
| **Staff** | Name, email, access level, Billing admin flag, sign-in method, invite status, last sign-in. Staff are adults the school chose to invite; seeing them is needed for support (CON-Q4) | Resend the first Admin's invitation; start an Admin replacement (section 9.2). The owner cannot add, remove or change staff in any other way: that is the school's job |
| **Billing** | Plan, discount, trial end, PO setting, collection method, next invoice estimate, invoices, payments, credit notes ([09 §14](09-billing.md#14-the-owners-billing-tools)) | As in 09 |
| **Sign-in** | Staff methods turned on and their state (e.g. "Microsoft: waiting for the school's IT consent"); pupil defaults | Help the school connect Microsoft or Google (Launch, [04](04-identity-and-access.md)) |
| **Support** | Support access grants and requests, with times and reasons; data requests | Request access (section 9.1) |
| **Audit** | Platform actions on this school (owner and system). The school's own audit log is visible only during support access | Export CSV |
| **Notes** | The owner's private notes about the customer relationship. A warning above the box: "No pupils' names or details here" | Add, edit |
| **Lifecycle** | Current status, history of changes with who and why | The actions allowed in section 5.6, each needing a typed reason |

### 5.6 Lifecycle

[PROPOSAL; CON-Q3, CON-Q11; billing parts follow PQ-13, PQ-14 and [09](09-billing.md)]

| Status | Meaning | Pupils sign in and play | Staff portal | Enrol pupils | Invoices | Who moves it on | Next |
|---|---|---|---|---|---|---|---|
| **Pending** | Created; the first Admin has not yet accepted the terms and DPA | No (no classes yet) | First Admin only: invitation, terms and DPA | No: nothing is processed before the DPA is accepted | None | The first Admin accepting | Trial (or Active if there is no trial) |
| **Trial** | Free until the trial end | Yes | Yes | Yes | None; the first comes at the trial end | Automatic at the trial end, or an Admin turning renewal off | Active, Ending |
| **Active** | Licensed | Yes | Yes | Yes | On each billing date | Stripe events; the owner; an Admin turning renewal off | Past due, Ending, Suspended |
| **Past due** | An invoice is overdue | Yes | Yes, with an overdue banner for Admins and Billing admins | Yes | Continue | Payment (automatic) or the owner | Active, Suspended, Ending |
| **Suspended** | **The owner's decision only** (PQ-14): non-payment, or a breach of terms | **No**: "Space Colony Defence is resting at your school. Ask your teacher." | Admins and Billing admins only: Billing, data export, Help. Teachers and Read-only see the reason | No | Paused or continuing, as the owner chooses ([09](09-billing.md)) | The owner | Active, Ending, Ended |
| **Ending** | Renewal turned off; runs to the end of the paid term or trial | Yes | Yes, with "Your licence ends on …" | Yes | No further invoices | Automatic at the end date; turning renewal back on undoes it | Active, Ended |
| **Ended** | Licence over | No | Admins only, **read-only**, for 90 days to export | No | None | Automatic deletion after 90 days (PQ-15); the owner can re-activate before that | Deleted, Active |
| **Deleted** | School data erased | — | — | — | Billing records kept 6 years in Stripe and our billing mirror; they hold no pupil data (PQ-15) | — | — |

Rules:

- Every change made by the owner needs a reason, which is shown to the school's Admins for Suspended, Ended and Deleted.
- Changes to **Suspended** or **Ended** email the school's Admins and Billing admins, and show a portal banner at once.
- **Deleted** removes: pupils, their sign-in identities, their game data, classes, staff memberships and staff sign-in
  identities, settings, and the school's audit log ([10](10-data-and-api.md), [11](11-privacy-security-and-assurance.md)).
  What stays is a **tombstone**: school ID, display name, URN, dates and a deletion record, so the owner can prove what
  was deleted and when. The slug stays reserved for 12 months.
- **Hold**: the owner can hold an Ended school from automatic deletion, for example when a legal request or a dispute
  is open. A hold needs a reason and a review date, and the school is told [PROPOSAL].

---

## 6. Plans

One plan at launch: a price per pupil per term and a minimum per school [CONFIRMED by owner, PD-12]. The catalogue
still supports more plans without code changes.

| Field | Rules |
|---|---|
| Name | Shown on invoices and in the school's Billing page |
| Price per pupil per term | GBP, before VAT |
| Minimum pupils | The invoice counts at least this many pupils, e.g. 30 ([09](09-billing.md)) |
| VAT | The rate to apply ([09](09-billing.md); VAT treatment confirmed by the owner's accountant) |
| Included | A list of features (entitlements), e.g. "Microsoft and Google sign-in". All on in the one launch plan |
| Status | Draft, Active (can be given to schools), Retired (no new schools; existing ones keep it until moved) |
| Stripe IDs | Product and price, created on activation (Launch) |

**Changing a price** [PROPOSAL, CON-Q7]. Stripe prices can't be edited, so a change makes a new **price version**:

1. The owner chooses the billing date it takes effect.
2. It must be at least 60 days away.
3. The console lists the affected schools, and their Admins and Billing admins are emailed with the new price and date.
4. On that date each school's subscription moves to the new version ([09](09-billing.md)).

Past versions stay listed with their dates.

Empty state in Pilot: "No plans yet. Pilot schools are not billed."

---

## 7. Billing

The owner's billing screens are specified in [09 §14](09-billing.md#14-the-owners-billing-tools). In brief:

| Screen | Purpose |
|---|---|
| Billing overview | Totals for the current and next term; collected, outstanding, overdue |
| Invoices | All invoices, filterable by school, status, term; open the Stripe-hosted invoice; resend; void; mark paid elsewhere |
| Payments | Payments received by method (bank transfer, card, Direct Debit) |
| Credit notes | Issue and list credit notes |
| Overdue | Overdue invoices with reminder history; the place to decide on suspension (PQ-14) |
| Billing date preview | For the next billing date: each school's expected count, amount, PO status |
| Reports and exports | Termly revenue, by school; CSV for the accountant |

Each school's billing also appears on its school page (section 5.5).

---

## 8. Content

Content is global: every school plays the same published content, and teachers choose from it (This week, maps on or
off). It is authored in **prod's** console [PQ-5; [02 §9](02-environments-and-delivery.md#9-content-between-environments-pq-5)].

### 8.1 Today's tools, kept

[VERIFIED: the code map of `main` at 292f4bc, 2026-11-21]

| Tool | What it does today |
|---|---|
| Activities | List; editor with steps, templates, picture picker and preview-solve; a seven-line checklist; validate, publish, retire, withdraw, delete |
| Speech | Preview (Polly, through `tts`), takes, approve, delete |
| Pictures | Upload, Draw, Library; approval with a "no text" tick. **Draw is the only AI feature today**: `picture_gen` asks OpenAI for an SVG of one of 10 kinds, within caps of 100 a day and 150 a month |
| Maps | New map; editor tabs Map, Waves, Wave sets, Test, Publish; the makers ("Make a map", wave maker, challenges, "Make it all for me") are seeded game code in the browser, with no AI; publish then release puts a map on Home |
| Aliens | Stats, one drawing to six walk frames, publish |
| Versions | Make live (also the rollback), wave-set states, testers |
| Bank status | Whether each age band has enough published activities |

`AI_ASSISTED` exists only as a source label on activities; nothing generates questions or speech today.

### 8.2 Year groups and topics

Schools need **Years 1 to 4** (PD-10). Today's content is banded by age 5, 6 and 7 (`minAge` and `maxAge`), with 88
topics in `contracts/topics.json` [VERIFIED code map]. What changes in the console (the model itself is in
[08](08-learning-content.md)):

- The activity editor shows **year groups** (Y1 to Y4) instead of ages. Validation requires the activity's topic to be
  taught in each year group it is marked for.
- **Topics and topic sets** is a new page: the topic list with year groups, subject, curriculum references and the
  activity types each allows. Topics for Years 3 and 4 are added here.
- **Bank status** gains rows per year group and per topic set, showing when a set has too few questions to offer
  teachers.

### 8.3 Topic sets

A topic set is what a teacher picks in **This week** (PD-14): a named group of topics, e.g. "Number bonds to 10" or
"3, 4 and 8 times tables" ([06 §9](06-school-portal.md#9-this-week-and-class-settings)).

| Field | Rules |
|---|---|
| Name | Teacher-facing, ≤ 50 characters |
| Year groups | One or more of Y1–Y4 |
| Topics | One or more topics; each must be taught in the set's year groups |
| Minimum bank | A set is offered to teachers only when each of its year groups has at least N published questions in it [PROPOSAL: N set in [08](08-learning-content.md)] |
| Status | Draft, Offered, Retired. A retired set stays on classes that chose it until their This week ends |

### 8.4 AI-assisted question drafting

New, and the only new AI feature [CONFIRMED by owner, PD-11: AI only in the owner's backend, to help make questions
and art].

1. The owner chooses a topic, year group, activity type and how many drafts (up to 10 at a time).
2. A backend function asks the AI service for drafts. The prompt carries the topic, the curriculum reference, the year
   group, the activity type's shape and the house style (UK spelling, plain words, no real people, no brands). **It
   never carries school or pupil data**, because the console has none to give it (R1).
3. Drafts arrive in a **Question drafts** list as ordinary activity drafts, labelled `AI_ASSISTED` (the existing label).
   They are never published automatically.
4. The owner reviews each draft in the normal editor:
   - the seven-line checklist;
   - an extra AI check: the answer is right, the wording suits the year group, there are no names of real people or
     brands, the picture fits, and any speech needed is made and approved;
   - then validate and publish, or delete.
5. Daily and monthly caps, like pictures' [PROPOSAL, CON-Q10].

**No model or vendor names appear anywhere in the console** [CONFIRMED by owner, standing rule]. The screen says
"Draft with help", and the provider is backend configuration.

### 8.5 Publishing to schools, and testers

Publishing and releasing work as today: a published version goes to every school. **Testers** today are a list of
player accounts in `versions.json` [VERIFIED code map]. On the platform [PROPOSAL, CON-Q9], a preview version is made
visible to **tester schools** instead, by default the demo school and, if it agrees, the pilot school. A new map or topic
set can then be tried in a real classroom before every school gets it.

---

## 9. Support

### 9.1 Support access

The owner sees a school's pupils, classes or progress only through a grant the school can see [PROPOSAL; CON-Q5; rule
R1].

| Step | What happens |
|---|---|
| Request | On the school page: the reason (required), read-only or read-write, and duration (2, 24 or 72 hours) |
| School sees it | The school's Admins get an email and a portal notice: who is asking, why, for how long, what kind of access |
| Grant | An Admin grants or declines in the portal. An Admin can also grant without a request ("Let support see our school for 24 hours"), e.g. while on the phone |
| During | The console shows a red bar: "Support access to Example Primary School, read-only, until 15:30". The owner sees the portal as an Admin would, without billing actions or staff changes. Every page viewed and every change is written to **the school's** audit log |
| End | Access stops at the end time, or when an Admin revokes it, or when the owner ends it. Revocation takes effect on the next request |

**Without consent**: only for a security incident or a legal obligation. The owner records the reason, the school's
Admins are told at once, and it is in their audit log. Read-only only [PROPOSAL].

### 9.2 Replacing a lost last Admin

A school always has an active Admin ([01 §3.1](01-product-and-roles.md#31-school-roles-confirmed-by-owner-2026-11-21-pd-7-and-pd-8-details-proposal)).
If the last one leaves without promoting anyone, or loses access:

1. Someone at the school contacts support.
2. The owner **calls the school back on its public phone number from the GIAS register**, never on a number given in
   the request, and confirms with the head teacher or office who the new Admin should be [PROPOSAL, CON-Q6].
3. The owner starts **Admin replacement** on the school page. It needs:
   - the new Admin's email;
   - a note of the call (date, time, the job title of the person spoken to, no names needed);
   - a tick confirming the call-back was to the GIAS number.
4. The new Admin is invited. The old Admin's access is removed if they are still listed.
5. The school's other staff with Admin or Read-only access are emailed, and the replacement is in the school's audit log.

### 9.3 Data requests

| Request | Who starts it | What the owner does |
|---|---|---|
| Export of everything | A school Admin, in the portal ([06 §12](06-school-portal.md#12-school-settings)) | Nothing normally; helps if it fails |
| A parent's subject access request | The school (it is the controller); it uses exports | Helps the school if asked, under support access |
| Delete the school's data early | A school Admin requests it in the portal | Confirms with the school (call-back as in 9.2), then moves the school to Ended with immediate deletion |
| Delete one pupil now | A school Admin, in the portal | Nothing; the portal does it |

The console's Data requests page lists each request, its state and dates.

### 9.4 Announcements

| Field | Rules |
|---|---|
| Text | ≤ 200 characters, plain text |
| Audience | All staff portals; one school's staff; or, for a platform-wide outage only, **pupils** (shown on the pupil sign-in page in child-friendly words) [PROPOSAL, CON-Q12] |
| Severity | Information, Warning, Problem |
| Start and end | Times; shown only between them |

Typical uses: planned maintenance outside school hours, a known problem, a new feature for teachers.

---

## 10. Demo school

The demo school is a tenant in prod with the slug `demo` [CONFIRMED by owner, PD-15].

| Item | How [PROPOSAL] |
|---|---|
| Status | A special **Demo** status: never billed, left out of all counts, totals and reports; a "Demo school" ribbon on every page of its portal and pupil pages |
| Fixtures | Three classes (e.g. "Year 1 Comets", "Year 2/3 Rockets", "Year 4 Orbit"), about 60 made-up pupils with obviously fictional names, This week set on each class, and six weeks of generated progress so the grid has something to show |
| Staff | A demo Admin and a demo Teacher account, held by the owner, with MFA like any staff account |
| Pupils | Picture passwords printed on a demo sign-in sheet; QR cards that work |
| **Reset demo school** | Deletes everything in the tenant and recreates the fixtures; takes under a minute; available to `platform.demo.reset` only; asks for confirmation |
| After a demo | Reset again, so the next demo starts clean |

Fixture data is generated by code from fixed lists, so it is repeatable and can never contain a real child's details.

### 10.1 Demo requests

The marketing site's "Book a demo" form ([12](12-marketing-and-sales.md)) lands here, newest first [PROPOSAL]: name,
school, role, email, message and when it arrived, each with a **Handled** tick and a free-text note. Requests expire
after 12 months (MKT-Q2) through TTL. Only `platform.demo.requests` may see them. They hold adults' contact details, for
which we are the controller ([11](11-privacy-security-and-assurance.md)), so they are never copied into Jira or the
repository.

---

## 11. Operations

### 11.1 Health

A page of the environment's alarm states and recent problems, linking to the CloudWatch dashboards
([02 §11](02-environments-and-delivery.md#11-user-stories), ENV-11):

- API errors and throttles;
- Lambda errors;
- staff and pupil sign-in failures;
- webhook failures;
- invitation emails bounced.

### 11.2 Costs

The month's AWS cost for the environment's account and the trend, read from Cost Explorer [PROPOSAL; needs a read-only
cost permission]. Cost per school is an **estimate**: the account's cost spread by enrolled pupils and by sign-ins. It is
labelled as an estimate, because AWS bills do not break down by school [ASSUMPTION].

### 11.3 Platform audit

Every console action is recorded with who, when, what and the reason given:

- enrolments and lifecycle changes;
- plan and price changes;
- billing actions;
- support access requests and use;
- Admin replacements;
- content publishes and releases;
- demo resets;
- settings changes;
- the owner's own sign-ins.

Kept 2 years (PQ-15); searchable; exportable as CSV.

### 11.4 Settings

| Setting | What |
|---|---|
| Reserved slugs | The list no school can take. Starts with: `www`, `admin`, `api`, `app`, `auth`, `login`, `sso`, `id`, `account`, `accounts`, `hooks`, `status`, `help`, `support`, `docs`, `blog`, `news`, `mail`, `email`, `smtp`, `imap`, `mx`, `ns`, `autodiscover`, `autoconfig`, `postmaster`, `hostmaster`, `webmaster`, `abuse`, `security`, `privacy`, `legal`, `terms`, `billing`, `pay`, `invoice`, `shop`, `store`, `sales`, `marketing`, `about`, `static`, `assets`, `cdn`, `media`, `images`, `files`, `download`, `demo`, `dev`, `staging`, `test`, `sandbox`, `staff`, `teacher`, `teachers`, `parent`, `parents`, `pupil`, `pupils`, `school`, `schools`, `class`, `classes`. A word list of offensive terms is also checked [PROPOSAL] |
| Legal documents | Versions of the terms of service, the DPA and the privacy notice, each with an effective date. Publishing a new version asks every school's Admins to accept it at their next sign-in ([06 §2](06-school-portal.md#2-sign-in-and-first-time-setup)) |
| Email templates | Staff invitation, support access request, Admin replacement, lifecycle notices, announcements. Each has a preview, plain text, and the school's display name and address filled in. Billing emails come from Stripe ([09](09-billing.md)) |
| School register | Refresh (section 5.2) and its date |

---

## 12. Content export and import

Content is authored in prod; dev tests with a copy (PQ-5, [02 §9](02-environments-and-delivery.md#9-content-between-environments-pq-5)).

| Action | Where | What |
|---|---|---|
| **Export content bundle** | Prod console (`platform.content.export`) | One file holding the published game-data versions, published activities, topics and topic sets, aliens and the speech manifest. **No school data is in content, so none is in the bundle**; a check refuses to export if a school record type ever appears |
| **Import content bundle** | Dev console only (`platform.content.import`); the button does not exist in prod | Checks the bundle's format version; shows what will change (counts added, replaced); imports; republishes dev's game data |

Speech audio files are copied with the bundle or re-rendered in dev, whichever is simpler to build [ASSUMPTION].

---

## 13. Permissions

Proposed permission names for console screens. They are listed with the school permissions in
[04 §5](04-identity-and-access.md#5-access-control-rbac). **Owner** holds all of them. The later roles of
[01 §3.2](01-product-and-roles.md#32-platform-roles) get subsets.

| Permission | Allows | Owner | Support (Later) | Content editor (Later) | Finance (Later) |
|---|---|---|---|---|---|
| `platform.dashboard.read` | Dashboard | ✔ | ✔ | ✔ | ✔ |
| `platform.schools.read` | School list and pages | ✔ | ✔ | — | ✔ |
| `platform.schools.write` | Enrol, edit details, retry provisioning | ✔ | — | — | — |
| `platform.schools.lifecycle` | Suspend, reinstate, end, hold, delete | ✔ | — | — | — |
| `platform.plans.write` | Plans and price versions | ✔ | — | — | ✔ |
| `platform.billing.read` / `.write` | Billing screens / billing actions | ✔ | — | — | ✔ |
| `platform.content.*` | Content tools, drafting, publishing | ✔ | — | ✔ | — |
| `platform.content.export` / `.import` | Section 12 | ✔ | — | ✔ | — |
| `platform.support.request` | Request support access | ✔ | ✔ | — | — |
| `platform.support.admin-replace` | Admin replacement | ✔ | — | — | — |
| `platform.support.announce` | Announcements | ✔ | ✔ | — | — |
| `platform.demo.reset` | Reset the demo school | ✔ | ✔ | — | — |
| `platform.demo.requests` | See and mark demo requests (§10.1) | ✔ | ✔ | — | — |
| `platform.ops.read` | Health, costs, audit | ✔ | ✔ | — | ✔ |
| `platform.settings.write` | Settings | ✔ | — | — | — |

---

## 14. Decisions for the owner

| ID | Proposal |
|---|---|
| CON-Q1 | Load GIAS from the daily CSV into a compact lookup file; find columns by name; **never store head teacher names or phone numbers** |
| CON-Q2 | Slug rules: 3–30 characters, letters, digits and hyphens, a letter first; the reserved list in 11.4; a deleted school's slug is held for 12 months |
| CON-Q3 | A school moves from Pending to Trial only when its first Admin accepts the terms and DPA; no pupils can be enrolled before that |
| CON-Q4 | The owner sees staff names and emails (needed for support), but never pupils' or classes' names or progress outside support access |
| CON-Q5 | Support access needs the school's grant; without consent only for a security incident or legal obligation, read-only, told to the school at once |
| CON-Q6 | A lost last Admin is replaced only after calling the school back on its public GIAS phone number |
| CON-Q7 | Price changes take effect on a billing date at least 60 days after schools are told |
| CON-Q8 | Shorter trusted-browser window for the platform console than ADR-0042's 30 days, e.g. 12 hours |
| CON-Q9 | Preview versions are shown to tester schools (the demo school, and the pilot school if it agrees) instead of a list of tester accounts |
| CON-Q10 | AI-assisted question drafting: up to 10 drafts per request, daily and monthly caps, never published automatically |
| CON-Q11 | Ended schools are deleted automatically 90 days after ending (PQ-15), unless the owner places a hold with a reason |
| CON-Q12 | Announcements reach pupils only for platform-wide outages |

---

## 15. User stories

*Snapshot of 2026-11-21. The source of truth for these stories is now Jira (project SCD); see
[README §6](README.md#6-user-stories-and-jira). Edit the tickets, not this table.*

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| CON-1 | As the owner, I want to sign in to the console with my password and an authenticator code, so that only I can run the platform | Operator pool in each account; TOTP required; sign-in, sign-out and failed sign-ins in the platform audit; console routes refused on any host but `admin.` | Pilot |
| CON-2 | As the owner, I want the console to show which environment I am in, so that I never change prod by mistake | Dev pages carry an orange "Dev" bar; prod has none; the page title includes the environment | Pilot |
| CON-3 | As the owner, I want a dashboard of schools, pupils, billing and problems, so that I see the state of the business at a glance | Tiles as in §4; numbers only; the demo school excluded; each tile links to its page; loads in under 2 seconds with 200 schools | Pilot |
| CON-4 | As the owner, I want to refresh the school register from GIAS, so that I can find any school in England by name, URN or postcode | Columns found by header name; a missing column stops the refresh with a message; only the fields in §5.2 kept; no head teacher names stored; the register date shown | Pilot |
| CON-5 | As the owner, I want an enrol wizard, so that a new school is set up correctly in one go | Eight steps as §5.3; all validation as listed; nothing created before Review; back and forth keeps entries | Pilot |
| CON-6 | As the owner, I want slugs checked as I type, so that a school gets a valid, unique address | Rules of CON-Q2; reserved and offensive words refused; a race between two enrolments gives one winner and a clear message to the other | Pilot |
| CON-7 | As the owner, I want school creation to be retryable step by step, so that a failure never leaves duplicates | Each step in §5.4 idempotent by school ID; failed steps shown on the school page with Retry; retries never create a second customer, subscription or invitation | Pilot |
| CON-8 | As the owner, I want a school page with tabs, so that everything about a school is in one place | Tabs as §5.5; no pupil or class names outside support access; edits audited with a reason | Pilot |
| CON-9 | As the owner, I want the school lifecycle enforced, so that each status allows exactly what §5.6 says | A test per status checks pupil sign-in, staff portal access, enrolment and invoicing; status changes email Admins and Billing admins where §5.6 says | Launch |
| CON-10 | As the owner, I want to suspend a school only by my own decision, with a reason, so that a child is never cut off by an automatic rule | No code path suspends without an owner action; the reason is shown to the school's Admins; reinstating restores access at once | Launch |
| CON-11 | As the owner, I want ended schools deleted after 90 days unless I hold them, so that we keep no data we don't need | Deletion runs on day 90; a hold with a reason and review date stops it; a tombstone remains; the slug is held 12 months | Launch |
| CON-12 | As the owner, I want a plan catalogue with price versions, so that prices can change without editing live subscriptions | Fields as §6; a price change creates a version effective on a billing date ≥ 60 days away; affected schools listed and emailed | Launch |
| CON-13 | As the owner, I want my billing screens, so that I can follow and act on every invoice | Screens as §7 and 09 §14 | Launch |
| CON-14 | As the owner, I want the activity editor to use year groups Y1–Y4, so that school content fits the years schools teach | Year-group chips replace ages for platform content; validation checks the topic is taught in each chosen year | Pilot |
| CON-15 | As the owner, I want a Topics and topic sets page, so that teachers have well-formed sets to choose from | Fields as §8.3; a set is offered only when every year group meets the minimum bank; retired sets stay on classes until This week ends | Pilot |
| CON-16 | As the owner, I want help drafting questions for a topic and year group, so that I can make content faster | Up to 10 drafts per request; drafts labelled `AI_ASSISTED`; never auto-published; caps enforced; prompts contain no school data (tested); no model or vendor name in the UI | Launch |
| CON-17 | As the owner, I want preview versions visible to tester schools, so that a real class can try new content first | A preview version is visible only in tester schools; turning a school off as tester hides it at the next page load | Launch |
| CON-18 | As the owner, I want to request support access to a school, so that I can help with its pupils or classes with the school's permission | Request with reason, mode and duration; Admins emailed; access only after a grant; a red bar while active; every view and change in the school's audit; stops at the end time or on revocation | Launch |
| CON-19 | As the owner, I want to replace a lost last Admin after a call-back, so that a school is never locked out and never hijacked | The flow in §9.2; the call-back confirmation is mandatory; staff notified; audited in both logs | Launch |
| CON-20 | As the owner, I want a list of data requests, so that none is forgotten | Requests listed with state and dates; early deletion needs a call-back confirmation | Launch |
| CON-21 | As the owner, I want to post announcements, so that schools hear about maintenance and problems | Fields as §9.4; shown only between start and end; pupil-facing only for platform-wide outages | Launch |
| CON-22 | As the owner, I want to reset the demo school in under a minute, so that every demo starts clean | Fixtures as §10, generated from fixed lists; the demo tenant excluded from counts and billing; ribbon on all its pages | Pilot |
| CON-23 | As the owner, I want a health page, so that I see problems affecting schools | Alarms and the counts in §11.1; links to the dashboards | Launch |
| CON-24 | As the owner, I want to see costs and an estimate per school, so that I can check prices cover costs | Monthly account cost and trend; per-school estimate labelled as an estimate | Later |
| CON-25 | As the owner, I want every console action audited, so that I can show what was done and why | Events in §11.3; who, when, what, reason; kept 2 years; CSV export | Pilot |
| CON-26 | As the owner, I want to edit the reserved slug list, so that new reserved names can be added without a release | List editable; adding a name used by an existing school is refused with that school named | Pilot |
| CON-27 | As the owner, I want to publish new versions of the terms and DPA, so that schools accept the current ones | Version with effective date; Admins asked to accept at next sign-in; acceptance recorded (version, who, when) | Launch |
| CON-28 | As the owner, I want editable email templates with preview, so that platform emails read well | Templates in §11.4; preview with a made-up school; plain text | Launch |
| CON-29 | As the owner, I want to export content from prod and import it into dev, so that dev tests with real content | Bundle as §12; import exists only in dev; no school data in the bundle (checked) | Pilot |
| CON-30 | As the owner, I want the "Book a demo" requests listed in the console, so that I can follow each one up | Requests from `/api/public/demo-requests` appear newest first with a Handled tick and a note; they expire after 12 months; only `platform.demo.requests` sees them | Launch |
