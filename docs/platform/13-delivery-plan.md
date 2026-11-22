# 13. Delivery plan

Part of the [platform scope](README.md). Status: active on `dev` from 2026-11-21 (PLAN-Q2); progress is in the
[gate log](#8-gate-log).

---

## 1. Summary

The platform is built in **three releases**: Pilot, Launch, Later ([01 §6](01-product-and-roles.md#6-releases)). Work is
grouped into **12 epics**, one per layer plus one for the owner's own actions. Every story in the layer documents belongs
to exactly one epic and one release, and becomes a Jira story (§7). Building follows the same loop as the family edition
([build-phases.md](../build-phases.md#the-loop-for-every-phase)): short-lived feature branches merged into `dev` (ADR-0044), every local
check, the owner deploying through the pipelines.

---

## 2. Epics

| Epic | Name | Stories | Document |
|---|---|---|---|
| E01 | Accounts and delivery | ENV-* | [02](02-environments-and-delivery.md) |
| E02 | Domains, edge and email | DNS-* | [03](03-domains-edge-and-email.md) |
| E03 | Identity and access | AUTH-* | [04](04-identity-and-access.md) |
| E04 | Platform console | CON-* | [05](05-platform-console.md) |
| E05 | School portal | SCH-* | [06](06-school-portal.md) |
| E06 | Pupil experience | PUP-* | [07](07-pupil-experience.md) |
| E07 | Learning content, Years 1 to 4 | LRN-* | [08](08-learning-content.md) |
| E08 | Billing | BIL-* | [09](09-billing.md) |
| E09 | Data and API | DAT-* | [10](10-data-and-api.md) |
| E10 | Privacy, security and assurance | PRV-* | [11](11-privacy-security-and-assurance.md) |
| E11 | Marketing and sales | MKT-* | [12](12-marketing-and-sales.md) |
| E12 | Owner actions | OWN-* (§4) | This document |

Story counts per epic and release are in §7.3.

---

## 3. Phases

Phases order the work inside each release. A phase takes stories from several epics. Sizes are relative (S, M, L), not
estimates of time [ASSUMPTION].

### 3.1 Pilot

| Phase | Builds | Epics | Needs first | Size |
|---|---|---|---|---|
| PS0 | Decisions and ADRs: tenancy model, pupil identity, staff sign-in, DNS role, new Terraform root, billing provider. The owner answers the open decisions (§5) that block the Pilot | All | — | S |
| PS1 | Accounts, bootstrap, `infrastructure/platform`, CI on `dev`, platform release workflow (auto-deploy to sca-dev), alarms | E01 | OWN-1, OWN-2 | M |
| PS2 | DNS role and delegated dev zone, certificates, the four distributions, the host function, enforced CSP, SES | E02 | PS1, OWN-3, OWN-4 | M |
| PS3 | The `tenancy` table, school registry and slugs, the tenant-isolation module and its tests, the `x-scd-host` mapping | E09 | PS1 | M |
| PS4 | Console: Schools (enrol, lifecycle), demo school reset, platform audit | E04 | PS3 | M |
| PS5 | Staff pool, embedded sign-in with MFA, invitations, memberships, the RBAC module and its route × role matrix tests | E03 | PS2, PS3 | L |
| PS6 | Portal: staff, classes, pupils, **CSV enrolment**, unassigned pupils, audit log | E05 | PS5 | L |
| PS7 | Pupil pool, `pupil_auth`, class sign-in, QR cards, picture and typed passwords, lockouts; card and password-sheet printing | E03, E05 | PS6 | L |
| PS8 | The player app made school-aware: sign-in screens, avatar, Home with This week, Finish, status screens; `player_api` reading year groups and class settings | E06 | PS7 | M |
| PS9 | Content model for Years 1–4, topic sets, selection weighting; the first content set; AI-assisted question drafting in the console | E07 | PS3 | L (mostly content) |
| PS10 | This week and class settings in the portal; progress summaries, class grid, pupil page, CSV export | E05, E07 | PS8, PS9 | M |
| PS11 | Privacy pack drafts (DPA, DPIA template, privacy notices, sub-processors, retention), domain list for school IT, accessibility check of pupil and portal paths | E10 | PS6 to PS10 | M |
| PS12 | Pilot readiness: load test of five classes signing in together, restore drill, runbook, the pilot school set up | E01, E09, E10 | All above, OWN-7 | M |

### 3.2 Launch

| Phase | Builds | Epics | Needs first | Size |
|---|---|---|---|---|
| PS13 | Billing I: Stripe set-up, plan catalogue, customers and subscriptions at enrolment, quantity sync, webhooks, invoice mirror, the school's Billing page | E08, E04, E05 | OWN-5 | L |
| PS14 | Billing II: purchase orders and held drafts, Direct Debit, reminders, overdue and suspension, credit notes, cancellations, reports | E08 | PS13 | M |
| PS15 | Microsoft and Google sign-in for staff (after the spike in [04](04-identity-and-access.md)) | E03 | PS5 | M |
| PS16 | New school year wizard; data export, deletion and retention; support access | E05, E09, E10 | PS6 | M |
| PS17 | Assurance: penetration test and fixes, Cyber Essentials, accessibility audit, WAF if chosen, status page | E10, E02 | OWN-12, OWN-13 | M |
| PS18 | Marketing site, sales kit, demo script, trials | E11 | OWN-6 | M |

### 3.3 Later

iPad app, trusts, teachers' own questions, roster sync (Wonde / MyLogin), family subscription, schools' own domains,
slug renames, self-serve trials. Each is a story in its layer with release **Later**; each becomes its own phase when
chosen.

---

## 4. Owner actions (epic E12)

Things only the owner can do. They become Jira tasks under E12.

| ID | Action | Needed by |
|---|---|---|
| OWN-1 | Create the platform dev and prod accounts in the organisation (OU, guardrails, Identity Center admin and read-only permission sets, budgets) | PS1 |
| OWN-2 | Apply the bootstrap for each account (Claude prepares and reviews the plan) | PS1 |
| OWN-3 | Create the cross-account DNS role in the DNS account, or choose the hand-off (DNS-Q1) | PS2 |
| OWN-4 | Request SES production access in prod | PS2 |
| OWN-5 | Open the company's Stripe account: verify the business; enable cards, Bacs Direct Debit and bank transfers; set the invoice numbering, footer and VAT number; create restricted keys and webhook endpoints; create a sandbox for dev | PS13 |
| OWN-6 | Solicitor: terms, DPA, privacy notices. Accountant: VAT treatment, invoice wording, record keeping | PS11 (drafts), Launch (final) |
| OWN-7 | Pilot school: agreement, DPA signed, the school's DPO reads the DPIA, a named contact teacher | PS12 |
| OWN-8 | Check the company's ICO registration covers this processing [UNVERIFIED whether it is already registered] | Pilot |
| OWN-9 | Insurance: professional indemnity and cyber cover for the company | Launch |
| OWN-10 | Business mailbox: `support@`, `privacy@`, `billing@` (DNS-Q4) | Pilot |
| OWN-11 | Jira: connect the site, create the project, give Claude the key (§7) | Before tickets are created |
| OWN-12 | Cyber Essentials certification | Launch |
| OWN-13 | Commission the penetration test | Launch |
| OWN-14 | Set the price per pupil per term (P) and the minimum (M) | PS13 |
| OWN-15 | Apple Developer Program enrolment for the company (the iPad app) | Later |
| OWN-16 | Create the platform's OpenAI project (Europe data residency, a monthly budget) and its key; store the key in sca-prod's secret, as in the [OpenAI key runbook](../runbooks/openai-key.md) (LRN-Q8) | PS9 |

---

## 5. Decisions still open

The proposals in [README §3.2](README.md#32-proposed-for-the-owner-to-confirm) (PQ-1 to PQ-15), plus each document's
"Decisions for the owner" table: DNS-Q (03), AUTH-Q (04), CON-Q (05), SCH-Q (06), PUP-Q (07), LRN-Q (08), BIL-Q (09),
DAT-Q (10), PRV-Q (11), MKT-Q (12). Those that block the Pilot are answered in PS0: all of them are in the
[decision register](14-decision-register.md), with their release, recommendation and state. Three cross-cutting ones:

| ID | Question | Recommendation |
|---|---|---|
| PLAN-Q1 | What happens to the family edition after the platform launches: stay separate, or become a "family" tenant? | Partly answered (owner, 2026-11-21, [ADR-0045](../decisions/0045-family-edition-frozen.md)): it is frozen as the proof of concept and stays separate on `family`. Whether it ever becomes a tenant: decide after the pilot |
| PLAN-Q2 | When does the platform come off the back burner? | **Answered** [CONFIRMED by owner 2026-11-21]: now ("we are going to stay on this for a while"); the family edition stays playable on `family` (ADR-0044) |
| PLAN-Q3 | Does the pilot wait for billing (Launch) or run free before billing exists? | **Answered** [CONFIRMED by owner 2026-11-22]: run the pilot free, as a "Not billed" school (BIL-1); billing is built while the pilot runs |
| PLAN-Q4 | Add **EventBridge Scheduler** for timed jobs: notices before each billing date, trial-ending emails, PO chasers, a nightly check against Stripe, retention deletions ([09](09-billing.md) BIL-Q11, [10](10-data-and-api.md)). It is new to the architecture (PD-4) | **Answered** [CONFIRMED by owner 2026-11-22]: yes, at Launch. Without it, these become banners and owner-pressed buttons |

---

## 6. Risks

| # | Risk | Label | Mitigation |
|---|---|---|---|
| 1 | A school sees another school's data | [ASSUMPTION high impact] | One isolation module; route × role matrix tests; tenant-isolation tests on every route; penetration test |
| 2 | Microsoft and Google sign-in run into Cognito limits (100 exact callback URLs per app client, 50 audiences per authoriser, one identity provider per Entra tenant, possibly 20 branding styles) | [VERIFIED limits, Cognito research; the styles limit UNCONFIRMED] | Email and password first (PD-9); a spike before PS15; the options in [04](04-identity-and-access.md) |
| 3 | Invoices go out with the wrong pupil count, because Stripe sends no warning before a `send_invoice` renewal | [VERIFIED Stripe docs] | Continuous quantity sync plus a check on the draft invoice ([09](09-billing.md)) |
| 4 | Schools reject the product on data protection (the ICO found most edtech providers short on contracts and DPIAs) | [VERIFIED ICO "Edtech examined", June 2026] | Processor-only design, a full Article 28 DPA, a DPIA template, a sub-processor list ([11](11-privacy-security-and-assurance.md)) |
| 5 | Staff MFA is required by the DfE cyber standard, and schools check it | [VERIFIED DfE standard] | MFA required for native staff accounts; federated staff rely on the school's own MFA |
| 6 | The Years 1–4 content is a large job for one person | [ASSUMPTION] | AI-assisted drafting with owner review; phase the years; reuse the 288 existing activities |
| 7 | The national curriculum changes for teaching from September 2028 | [VERIFIED government response, 2025] | Re-map the content model when the final curriculum is published (spring 2027) |
| 8 | A class starting together hits API throttles or Cognito quotas | [VERIFIED limits: route throttles in main.tf, Cognito 120 RPS UserAuthentication] | Per-route limits sized for classes; load test in PS12 |
| 9 | Support load in school hours for a part-time owner | [ASSUMPTION] | Self-service resets, help pages, status page, support hours in the terms |
| 10 | The pilot school is the owner's children's school | [CONFIRMED by owner, PD-17] | Safeguards in [12](12-marketing-and-sales.md) and [11](11-privacy-security-and-assurance.md); support access only at the school's request |
| 11 | VAT treatment of the licence is wrong | [VERIFIED standard-rated for software generally; this product UNVERIFIED] | Accountant confirms (OWN-6) |
| 12 | `dev` drifts from `family` | [CONFIRMED by owner 2026-11-21] | No longer a risk: `family` is frozen and drift is expected ([ADR-0045](../decisions/0045-family-edition-frozen.md)) |
| 13 | School web filters block the platform | [ASSUMPTION] | Published domain list ([03 §9](03-domains-edge-and-email.md#9-what-school-it-needs-from-us)); check with the pilot school's IT early |
| 14 | Stripe transfers billing contacts' data to the US | [VERIFIED Stripe DPA] | Adults' contact data only; named in the privacy notice and sub-processor list |

---

## 7. Jira

### 7.1 Where

Site `cumulus-consulting.atlassian.net`, project **SCD** ("Space Colony Defence", team-managed; created as KAN and renamed SCD on 2026-11-21), created by the owner
on 2026-11-21 [VERIFIED through the Atlassian connector, 2026-11-21]. The connector cannot create Jira projects, only
issues, versions and boards inside one. Jira re-keyed every ticket (KAN-17 became SCD-17) and keeps the old keys working [VERIFIED 2026-11-21].

**From 2026-11-21 the tickets are the source of truth for the stories** [CONFIRMED by owner 2026-11-21]. The owner
reviews and edits them in Jira; the story tables in the layer documents are the starting snapshot.

### 7.2 What was created (2026-11-21) [CONFIRMED by owner 2026-11-21: epics, stories and release versions]

| Jira item | What |
|---|---|
| Versions | Pilot, Launch, Later |
| Epics | E01 to E12 as SCD-4 to SCD-15 (§2), each with its layer's summary and a link to its document; assigned to the owner |
| Stories (268) | Summary `<ID> <Role>: <what they want>`; description = the story, its acceptance criteria, its release and a link to the document's stories section; parent = its epic; labels = the story ID (e.g. `SCH-12`), the layer (e.g. `portal`) and `release-pilot`, `release-launch` or `release-later` |
| Tasks (15) | OWN-1 to OWN-15 (§4) under E12, labelled `owner-action` and `release-…`; assigned to the owner |

**Fix versions** were set the same day, once the owner had switched on Releases: Pilot 164, Launch 103 and Later 16
(stories and owner tasks; epics have none) [VERIFIED by JQL per release, 2026-11-21]. The `release-…` labels stay as
a backup filter.

The full map from scope ID to Jira key is [jira-keys.json](jira-keys.json); in Jira, `labels = <ID>` finds any one.

### 7.3 Counts

Counted from the stories tables on 2026-11-21.

| Epic | Prefix | Pilot | Launch | Later | Total |
|---|---|---|---|---|---|
| E01 Accounts and delivery | ENV | 9 | 4 | 0 | 13 |
| E02 Domains, edge and email | DNS | 10 | 3 | 1 | 14 |
| E03 Identity and access | AUTH | 19 | 4 | 2 | 25 |
| E04 Platform console | CON | 14 | 15 | 1 | 30 |
| E05 School portal | SCH | 32 | 7 | 0 | 39 |
| E06 Pupil experience | PUP | 21 | 5 | 0 | 26 |
| E07 Learning content | LRN | 15 | 7 | 3 | 25 |
| E08 Billing | BIL | 2 | 29 | 4 | 35 |
| E09 Data and API | DAT | 16 | 5 | 1 | 22 |
| E10 Privacy, security and assurance | PRV | 13 | 10 | 1 | 24 |
| E11 Marketing and sales | MKT | 5 | 8 | 2 | 15 |
| **Stories** | | **156** | **97** | **15** | **268** |
| E12 Owner actions (tasks) | OWN | | | | 15 |

In Jira that is 3 versions, 12 epics, 268 stories and 15 tasks.

---

## 8. Gate log

As in the family edition's [gate log](../build-phases.md#gate-log): Claude fills "Summary" at the end of each phase and
the owner fills "Approved". Stories merge into `dev` as they pass CI ([ADR-0044](../decisions/0044-branches-family-dev-main.md));
the owner reviews each phase here, and everything again before the prod release.

| Phase | Gate commit | Summary (Claude) | Approved (date, by, notes) |
|---|---|---|---|
| PS1 | `a3be3df` (PR #5, merged on the owner's go-ahead 2026-11-21) | **Accounts and delivery (E01).** sca-dev and sca-prod bootstrapped by the owner; the OIDC provider, a CI role trusting only each account's own GitHub environments, and the state and artefacts buckets verified with read-only calls (ENV-2, OWN-2). A `ReadOnlyAccess` permission set in every account and six `-readonly` profiles, created by Claude at the owner's request and written into CLAUDE.md on `dev` and `family` (ENV-3, PR #3). `infrastructure/platform`: the alerts topic and email subscription, `allowed_account_ids`, environment limited to sca-dev and sca-prod, 6 offline tests in CI, a read-only plan of 2 to add in each account (ENV-4, PR #4). CI on `dev` and its pull requests, four required checks (ENV-5). `platform-release.yml`: push to `dev` → sca-dev; dispatch on `main` → sca-prod with the apply held on `sca-prod-apply`; saved plan create-only in the account's bucket; smoke checks the alerts topic; [runbook](../runbooks/platform-release.md) (ENV-6, PR #5). Branches runbook (ENV-13, PR #1). Still open: OWN-1 (OU, guardrails, budgets, anomaly alerts); alarms beyond the topic are ENV-11 (Launch). The first platform-release run on `dev` (the PR #5 merge) planned 2 to add, applied exactly that plan and passed its smoke check; the run after PR #6 planned no changes and skipped the apply. **For the owner:** confirm the alerts email (the subscription is pending), then approve this gate. | 2026-11-22, the owner, in chat: "approved" |
