# Scope: a schools edition (licensed, multi-tenant, online)

Status: **scope for the owner's decision**, not planned work. Written 2026-11-17 at the owner's request ("make this a
fully online playable game to be sold to schools / played online by students, issuing numbers of users per school,
licences etc., hosted on their own domain, e.g. stjosephs.spaceadventure.com; fully scope this out").
Labels as in the [spine](00-spine.md). Legal and commercial points marked [UNVERIFIED] need a solicitor or accountant,
not a code change; who settles each is named.

---

## 1. Summary

Today the game is a free, single-family product: children sign themselves up, one operator runs the content, and the
specification rules out "any parent/teacher account model, classroom features or commercial product changes" as later
scope [CONFIRMED prompt.md:101,147]. A schools edition changes the product, the legal position and parts of the
architecture:

- **Tenants.** Each school (and, optionally, a multi-academy trust over several schools) is a tenant with its own
  address (`<school>.<product-domain>`, or the school's own domain), its own pupils, teachers and licence.
- **People.** Four roles instead of two: platform operator (you), school administrator, teacher, pupil. Pupils aged
  5-7 sign in without email or typed passwords (class code or QR card and a picture password); teachers create and
  manage them, by hand, by spreadsheet, or synced from the school's records.
- **Licences.** A school buys a number of pupil seats for a period; the game enforces the seat count and the end date,
  with a grace period, renewal, and data export and deletion at the end.
- **Teaching.** Classes, login cards, a progress view per class built on the learning summaries the game already
  records, year-group (not birthday) based content, and year-end roll-over.
- **Law and assurance.** The school is the data controller and we are its processor; a data processing agreement, a
  DPIA, published security and accessibility evidence, and the DfE digital and technology standards schools check
  suppliers against.
- **Commercial.** Pricing, invoicing with purchase orders, terms, support, a company and insurance.

**Size** [ASSUMPTION, J's scale]: about 12-14 phases (a new Gate S, section 7), comparable to Gate M, plus legal and
commercial work outside the code. **Recommendation** [PROPOSAL]: decide the business questions (section 8) now, keep
building towards launch (Gates M and L), and start Gate S after launch with one pilot school. Gate K (offline) becomes
more valuable for schools (patchy classroom Wi-Fi) and could run before or beside Gate S.

---

## 2. What the game assumes today (and why each matters for schools)

| Today | Where | Matters because |
|---|---|---|
| Self sign-up on managed login (username + password), capped at 20 a day | [VERIFIED infrastructure/envs/prod.tfvars.json:9; api/functions/cognito_presignup] | A class of 30 cannot sign up; 5-year-olds cannot type passwords |
| The child enters a date of birth; the age band comes from it | [VERIFIED spine S8.1 PROFILE `dob`] | Schools know year groups, not birthdays; collecting DOB is avoidable data |
| One player pool, one operator pool; tokens carry no tenant | [VERIFIED ADR-0002, ADR-0012] | Nothing separates one school's pupils from another's |
| `game` table keys are `U#<sub>`; no GSI | [VERIFIED spine S8.1, ADR-0004] | "All pupils in a class" has no query today |
| One domain; CloudFront does not forward Host to the API | [VERIFIED modules/static_site/main.tf:172-174] | The API cannot tell which school a request came from |
| API throttles are per route for the whole stage: `POST /api/runs` 1 per second, burst 5; the stage default 20/s, burst 40 | [VERIFIED infrastructure/main/main.tf:669-681] | A class pressing New game together would be throttled [UNVERIFIED that the limit is shared by all callers: check the HTTP API throttling docs and a load test] |
| One production environment | [VERIFIED infrastructure/envs/: prod only] | Paying customers need a staging copy for changes and a demo school |
| Family-level trust: combat runs in the browser, rewards bounded, not anti-cheat | [VERIFIED ADR-0005] | Acceptable with no leaderboard; teacher reports must say they are practice records, not tests |
| Content: one global bank, one operator | [VERIFIED ADR-0024 et seq.] | Fine for v1; per-school content is a later choice |
| Curriculum reference: England's national curriculum | [CONFIRMED prompt.md:475] | Wales, Scotland and Northern Ireland schools follow other curricula |
| No analytics, no ads, allow-list logging | [VERIFIED ADR-0005, spine S2] | A strength in school procurement: keep it |

---

## 3. The product, role by role

### 3.0 Two consoles (owner clarification, 2026-11-17)

| | **Platform console** (yours) | **School portal** (one per school) |
|---|---|---|
| Who | You (the operator pool, as today) | Each school's administrators and teachers (a new staff pool, section 5.4) |
| Where | `admin.<domain>`, never reachable from a school's address | On the school's own address, e.g. `stjosephs.<domain>/admin` [PROPOSAL; decision 8.5] |
| What | Everything that exists today: activities, speech, pictures, the level and planet designer, versions and publishing. New: schools (create, subdomain, custom domain), licences and seats, invoices' state, time-limited audited support access, costs and health per school | Teachers, classes, pupils and login cards; progress; pausing a class; licence and seats; sign-in options; school name and badge; data export and deletion |
| Content | Global: one bank, one game, published to every school | Read-only use of the global content in v1; later, choosing which challenges a class sees [PROPOSAL] |

The two never share accounts or sessions: a school administrator cannot reach the platform console, and your operator
account reaches a school's portal only through the audited support access.

### 3.1 Pupil (ages 5-7)

- Opens `stjosephs.<domain>`: the school's name and badge on the landing page.
- **Signs in** [PROPOSAL]: picks their class (or scans the QR on their login card), taps their name or picture, then a
  picture password (three pictures in order). No email, no typed password. A teacher can reset it. Optional Google or
  Microsoft sign-in where the school already gives pupils accounts.
- Plays exactly the game that exists (same rules for everyone, prompt.md:99). Display name: what the teacher entered
  (first name and initial) [PROPOSAL; data minimisation].
- Age band from the class's **year group** (Reception = age band 5, Year 1 = 6, Year 2 = 7) [PROPOSAL], not a birthday.
  The age mapping stays a product decision, as today (prompt.md:475).
- No chat, no free text to other pupils, nothing pupils publish (unchanged).

### 3.2 Teacher

- **Classes**: create, rename, set year group; add pupils by typing names, pasting a list, or a CSV; move pupils
  between classes; archive at year end.
- **Login cards**: print a sheet per class (name, picture password reminder, QR code that opens the class sign-in).
- **Progress**: per class and per pupil: activities done, stars, "still practising" topics (the learning summaries the
  game records today, F §10.2), campaign progress and badges. Exports to CSV. No grades or rankings (C12 notes).
- **Controls** [PROPOSAL]: pause play for a class (assembly, end of lesson), reset a pupil's password, clear a pupil's
  progress (the resets that exist, spine S8.2), see who is playing now.
- Teachers never see other schools; a teacher sees only their classes unless the school admin grants more.

### 3.3 School administrator

- Invites teachers (email), removes them, assigns classes.
- Sees the licence: seats bought, seats used, end date; buys more seats or renews (section 6).
- Sets the school's sign-in options (picture passwords, Google, Microsoft), its display name and badge, and its custom
  domain if it has one.
- Data: export all pupil data (machine-readable), delete a pupil, delete the school's data at the end of the contract.
- Roster sync [PROPOSAL, later phase]: connect the school's MIS through Wonde, which reads classes, pupils and teachers
  with the school's approval [VERIFIED wonde.com, docs.wonde.com; widely used by UK primaries]. Saves teachers typing.

### 3.4 Platform operator (you)

- The existing content admin (activities, speech, pictures, levels) stays global.
- New: tenants (create a school, its subdomain, its licence), licence history, invoices' state, support access to a
  school (time-limited, audited, school can see it), platform-wide health and costs per school.

### 3.5 Multi-academy trusts (optional)

- A trust as a parent tenant: one contract and invoice, seats shared or per school, trust-wide reporting. Decide
  whether v1 sells to single schools only (simpler) [PROPOSAL: single schools first].

---

## 4. Data protection, safeguarding and assurance (UK)

Settled by a solicitor familiar with education data unless stated; this section scopes the work, it is not advice.

- **Roles.** Schools are the controllers of pupil data; the provider is "most likely" a processor, and the role follows
  what the provider actually does, not the contract's label [VERIFIED ICO, "The Children's code and edtech"]. Anything
  done for our own purposes (product analytics, improving content from answer data, marketing) makes us a controller
  for that processing. **Design rule** [PROPOSAL]: do nothing with pupil data except deliver the service to the school,
  so we stay a processor; aggregate content statistics, if wanted, only with each school's written agreement.
- **Children's code (Age Appropriate Design Code).** It does not apply to schools processing pupils' data for
  education, but may apply to edtech providers, especially where they act as controllers [VERIFIED ICO edtech page,
  updated May 2023]. Most of its standards are already met by design (no profiling, no nudges, no sharing, privacy by
  default) [ASSUMPTION; the solicitor confirms].
- **Documents to produce** [UNVERIFIED list, solicitor settles]: data processing agreement (UK GDPR Article 28 terms),
  sub-processor list (AWS; the speech and picture services see content, not pupil data [VERIFIED by design: R16 speech
  renders content text, picture generation is operator-only]), privacy notice schools can give parents, DPIA template
  for schools, retention schedule, breach procedure (we tell the school without undue delay), ICO registration for the
  company [UNVERIFIED whether a processor-only business must pay the data protection fee].
- **Data minimisation** [PROPOSAL]: pupils: first name, last initial, class, year group, picture password; no DOB, no
  email, no photo. Teachers: name, school email. Region: data stays in eu-west-2 London (as today).
- **Retention** [PROPOSAL]: pupil data kept while the licence is live; a 90-day read-only grace period after expiry;
  then deleted, backups expire after 7 days (as today's backup retention, spine Platform). Exports on request.
- **DfE standards.** The DfE's "Meeting digital and technology standards in schools and colleges" includes cloud
  solution, cyber security and identity standards that schools work towards and check suppliers against [VERIFIED
  gov.uk guidance pages exist; check the current list of core standards]. Supplier evidence pack to prepare: security
  overview, Cyber Essentials (Plus) certificate [UNVERIFIED whether schools require it; widely asked for], independent
  penetration test, uptime and support terms, backup and restore (Gate L's drill), accessibility statement (WCAG 2.2 AA
  target, Gate L's pass).
- **Safeguarding.** No pupil-to-pupil contact, no pupil-generated public content, no external links in the child UI;
  operator support access audited and visible to the school. Keeping Children Safe in Education is the school's duty;
  our product should not create new risks [ASSUMPTION].
- **Regulatory watch.** A 2026 ICO report on edtech reportedly found repeated gaps around processor status, contracts,
  data mapping, minimisation and retention [UNVERIFIED: search snippet only; read the report before Gate S].

---

## 5. Architecture changes

### 5.1 Tenancy model

| Option | How | For | Against |
|---|---|---|---|
| A. User pool per school | A Cognito pool for each school's pupils (and staff) | Strongest isolation; per-school settings; AWS's recommendation when isolation matters [VERIFIED Cognito multi-tenancy best practices] | Pools to create per school (automation); quotas are per account and Region and shared [VERIFIED same page; UNVERIFIED the current pools-per-account limit] |
| B. Shared pupil pool + tenant bound server-side | One pupil pool, custom (API) sign-in for picture passwords; a `TENANT#` mapping per user; a pre-token Lambda puts `tenantId` in tokens; every API call checks the token's tenant against the request's school | One pool to run; fits picture passwords (custom auth, no hosted UI) | Tenant checks are ours to get right everywhere; a shared hosted-UI cookie can cross tenants if hosted UI is used [VERIFIED Cognito docs] |
| C. Stack per school | The whole deployment per school | Total isolation | Unmanageable cost and releases |

**Recommendation** [PROPOSAL]: **B for pupils** (custom sign-in never uses the hosted UI, so the cookie issue does not
arise) with tenant checks enforced in one shared module and tested like today's ownership rule (spine S2); **a staff
pool** with per-school Google or Microsoft federation (SAML or OIDC identity providers on the pool). Revisit A if a
school demands its own pool.

### 5.2 Requests know their school

- A CloudFront function on `/api/*` derives the school from the viewer's host and sets a header the API trusts
  (overwriting any client value); the API refuses a token whose tenant differs. Today no function runs on `/api/*` and
  Host is not forwarded [VERIFIED static_site/main.tf:172-174]; this is a deliberate ADR change (ADR-0001 amended).
- Keys: `game` partitions become `T#<tenant>#U#<sub>`, plus class membership items (`T#<tenant>#CLASS#<id>`) for teacher
  queries; ADR-0004's "no GSI" is revisited for "pupils by class" and "who is playing now". Existing family accounts
  migrate to a "family" tenant or stay on the current domain [decision 8.6].

### 5.3 Domains

- **Subdomains of the product domain** (`stjosephs.<domain>`): one wildcard ACM certificate and one wildcard alternate
  name on the player distribution; the school is created in our tenant registry, no DNS work for the school
  [ASSUMPTION: standard CloudFront wildcard behaviour; verify in a spike].
- **A school's own domain** (`play.stjosephs.sch.uk`): CloudFront SaaS Manager onboards each customer domain as a
  distribution tenant on one multi-tenant distribution, each with its own ACM certificate; the school adds a CNAME
  [VERIFIED AWS docs and launch blog]. One source cites 10,000 tenants per multi-tenant distribution [UNVERIFIED: check
  the CloudFront quotas page]. Firewall Manager does not yet cover multi-tenant distributions [VERIFIED AWS docs].
- The product domain itself is a decision (8.1); `jackgl.com` stays for the family edition.

### 5.4 Sign-in for 5-7-year-olds

- Cognito custom authentication (define, create and verify challenge triggers) for "class code + picture password"
  [ASSUMPTION: Cognito custom auth flow fits; spike it], rate-limited per pupil and per class, with lock-out the teacher
  clears. Picture passwords are weak by design (a few pictures): acceptable inside a school's class context
  [ASSUMPTION; the DPIA records it].
- QR login cards encode the school and class (never a secret); the picture password stays the secret.
- Federated sign-in for staff (Google Workspace, Microsoft Entra ID), optionally pupils. Federated users are billed
  separately by Cognito ($0.015 per MAU after 50 free per month at the time of writing) [VERIFIED aws.amazon.com/cognito/
  pricing via search; recheck before pricing].

### 5.5 Licences and seats

- `TENANT#<id>` items: licence (seats, start, end, status: trial, active, grace, expired), billing references.
- Enforcement: creating a pupil beyond the seat count is refused; at expiry sign-in still works read-only for the
  grace period (progress viewable, no new games) [PROPOSAL]; after grace, data deleted (section 4).
- Seat counting: pupils on the roll, not monthly actives [PROPOSAL; simpler for schools to budget].

### 5.6 Capacity and cost

- A class of 30 starting together: per-route throttles must become generous and per tenant where possible; Lambda
  reserved concurrency, Cognito request quotas, and the lease logic (ADR-0008) under load. A load test of "five classes
  start at 9:05" is an exit criterion [PROPOSAL].
- Cost per pupil: Lambda, DynamoDB, CloudFront, Cognito MAUs, Polly for any speech not pre-rendered. Model it from the
  real CloudWatch and billing data after launch before setting prices [UNVERIFIED all numbers; no estimate is given here
  on purpose].

### 5.7 Environments and operations

- A staging environment (a second `envs/staging.tfvars.json`, its own account or at least its own stack) and a demo
  school, so a release is tried before schools see it.
- Status page, support inbox, on-call expectations during school hours, incident communication to school admins.
- Release windows outside school hours [PROPOSAL].

### 5.8 Apps

- Player: tenant branding, class sign-in, year-group age bands.
- **New school portal** for school administrators and teachers (`/admin` on each school's host, decision 8.5): classes,
  pupils, login cards, progress, licence, data export (section 3.0).
- **Platform console** (today's admin app): unchanged content and designer, plus a Schools section (tenants,
  licences, support access).

---

## 6. Commercial

All [UNVERIFIED]; the owner, with an accountant and solicitor, settles.

- **Price model** options: per pupil per year; per school flat by size band; free trial term (e.g. half a term).
- **Buying**: UK schools often pay by invoice against a purchase order; VAT on digital services; annual terms aligned to
  the school year. Card payment for small schools via a payment provider (Stripe or similar) [ASSUMPTION].
- **Contracts**: terms of service, data processing agreement, service levels (availability in school hours, support
  response), acceptable use.
- **Company**: trading entity, professional indemnity and cyber insurance, ICO registration, accounting.
- **Marketing claims**: "aligned to England's national curriculum" is true of the content references (prompt.md:475);
  claims about learning gains need evidence the game does not produce (practice records only).
- **Frameworks**: some schools buy through approved supplier frameworks or marketplaces (for example the UK Digital
  Marketplace, where Wonde lists services) [UNVERIFIED which frameworks suit a small edtech product].
- **Spec change**: prompt.md says the product is free and has no commercial features (prompt.md:101). Selling it is
  the owner's decision and amends B §B1.2 and the spine's scope.

---

## 7. Proposed phases: Gate S (after launch) [PROPOSAL]

| Phase | Builds | Checks | Size |
|---|---|---|---|
| S0 Decisions and legal | Section 8 answered; solicitor's DPA, privacy notice and DPIA templates; product domain registered; ADR for tenancy | Owner sign-off; documents in docs/legal (not code) | — |
| S1 Staging and tenants | Staging environment; tenant registry; host to tenant at the edge (CloudFront function on /api/*); tenant on every key; family tenant migration | Two tenants cannot read each other (tests on every route, like today's ownership tests); staging release | L |
| S2 Wildcard subdomains | Wildcard certificate and alternate name; tenant branding on the landing page | `a.<domain>` and `b.<domain>` show their school | S |
| S3 Pupil sign-in | Custom auth: class code or QR, picture password; lock-out; teacher reset; year-group age band; no DOB for school pupils | Keyboard-only and mouse-only sign-in by a 5-year-old (owner playtest); brute-force limits tested | L |
| S4 Staff accounts and roles | Staff pool; school admin and teacher roles; invitations; Google and Microsoft federation | Role matrix tests; a teacher of school A cannot see school B | M |
| S5 Teacher app I | Classes, pupils (typed, pasted, CSV), login cards, archive, move | Bulk add 30 pupils in under a minute | L |
| S6 Teacher app II | Progress per class and pupil, CSV export, pause a class, who is playing | Numbers match the pupil's own My progress | M |
| S7 Licences and seats | Licence items, seat enforcement, trial, grace, expiry behaviour; operator Schools page | Seat 31 of 30 refused; expiry turns read-only | M |
| S8 Data rights | School data export, pupil deletion, end-of-contract deletion, retention jobs, audit of support access | Export is complete and machine-readable; deletion leaves nothing but audit | M |
| S9 Custom domains | CloudFront SaaS Manager tenant per school domain; certificate validation flow for the school | A test domain served end to end | M |
| S10 Billing | Invoices and card payment; renewal reminders; seat top-ups | Payment provider test mode end to end | M |
| S11 Scale and security | Throttles per tenant; load test (five classes at once); penetration test; Cyber Essentials | Load test passes; pen test findings fixed | M |
| S12 Roster sync (optional) | Wonde integration: classes, pupils, teachers, daily sync | One sandbox school synced | M |
| S13 Pilot | One school for a half term; support routine; feedback | Pilot review with the school | — |

Order: S0 → S1 → S2/S3/S4 → S5/S6 → S7/S8 → S9/S10/S11 → S13; S12 when a school asks.

---

## 8. Decisions for you

1. **Product domain.** Which domain (and brand name) for the schools edition; register it before S2.
2. **Who buys.** Single schools only in v1, or trusts too? *Recommend:* single schools first.
3. **Price model.** Per pupil per year, per school band, or both; trial length. (Needs the cost model from launch data.)
4. **Pupil sign-in.** Picture passwords and QR cards as the default, Google and Microsoft as options? *Recommend:* yes.
5. **School portal location.** A separate `teach.<domain>`, or `/admin` on each school's address? *Recommend:* `/admin`
   on the school's address (one place per school, simpler for staff); the platform console stays on `admin.<domain>`.
6. **The family edition.** Keep `aliens.jackgl.com` free for families as a "family" tenant, or close self sign-up when
   schools launch? *Recommend:* keep it, as one tenant.
7. **Our data role.** Commit to processor-only (no analytics on pupil data)? *Recommend:* yes.
8. **Curriculum reach.** England only at first (as the content is), or adapt for Wales, Scotland and NI later?
9. **Custom domains.** Offer schools their own domains in v1, or subdomains only? *Recommend:* subdomains first, own
   domains on request (S9).
10. **When.** Gate S after launch (Gate L), and before or after offline play (Gate K)? *Recommend:* after L; consider K
    first or alongside, since classroom networks are patchy.
11. **Company and paperwork.** Who drafts the DPA and terms (solicitor), and the company structure (accountant).

---

## 9. Risks and unknowns

| # | Risk or unknown | Label | Mitigation or how to check |
|---|---|---|---|
| 1 | Our processor status is lost by an innocent feature (analytics, content tuning from answers) | [VERIFIED role follows practice, ICO] | Processor-only design rule (4); review every new data use against it |
| 2 | A cross-tenant data leak | [ASSUMPTION high impact] | One tenant-check module; tests on every route; pen test (S11) |
| 3 | Class-start load hits stage-wide throttles and Cognito quotas | [VERIFIED throttles in main.tf; UNVERIFIED shared-limit behaviour] | Per-tenant limits; load test before the pilot |
| 4 | Picture passwords guessed by classmates | [ASSUMPTION] | Lock-out, teacher reset, short sessions; DPIA records the trade-off |
| 5 | Schools require certifications we lack | [UNVERIFIED] | Ask the pilot school's IT and data protection officer early (S0) |
| 6 | Pricing below cost (speech, sign-in MAUs at scale) | [UNVERIFIED] | Cost model from real launch data before prices |
| 7 | Support load during school hours for a one-person business | [ASSUMPTION] | Pilot first; status page; self-service resets for teachers |
| 8 | Curriculum outside England | [CONFIRMED England only, prompt.md:475] | Sell to English schools first (decision 8) |
| 9 | Teacher reports read as assessment | [ASSUMPTION] | Wording: practice records; no grades (C12) |
| 10 | Legal documents drafted without a specialist | [UNVERIFIED] | Solicitor in S0 |
| 11 | Wonde costs or terms for small suppliers | [UNVERIFIED] | Ask Wonde before S12 |
| 12 | CloudFront SaaS Manager quotas and Terraform support | [UNVERIFIED] | Spike in S9 |

---

## 10. Sources

- ICO, The Children's code and education technologies (edtech):
  https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/the-children-s-code-and-education-technologies-edtech/
- ICO, FAQs for edtech and schools: https://ico.org.uk/for-organisations/childrens-code-hub/faqs-for-education-technologies-edtech-and-schools/
- DfE, Meeting digital and technology standards in schools and colleges (cloud solutions):
  https://www.gov.uk/guidance/meeting-digital-and-technology-standards-in-schools-and-colleges/cloud-solutions
- AWS, Cognito multi-tenancy best practices: https://docs.aws.amazon.com/cognito/latest/developerguide/multi-tenant-application-best-practices.html
  and https://docs.aws.amazon.com/us_en/cognito/latest/developerguide/bp_user-pool-based-multi-tenancy.html
- AWS, Cognito pricing: https://aws.amazon.com/cognito/pricing/
- AWS, CloudFront multi-tenant distributions (SaaS Manager): https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/distribution-config-options.html
  and https://aws.amazon.com/blogs/aws/reduce-your-operational-overhead-today-with-amazon-cloudfront-saas-manager
- Wonde developers: https://wonde.com/developers ; docs: https://docs.wonde.com
- Search snippet on a 2026 ICO edtech report (unread): https://www.lawyer-monthly.com/2026/06/ico-edtech-report-dfe-school-data/
