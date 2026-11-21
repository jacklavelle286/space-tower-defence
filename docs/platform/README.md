# Space Colony Defence for schools: platform scope

Status: **scope, parked.** Not planned work and not built. Written 2026-11-21 at the owner's request: "we need to scope
each layer of the app out in great detail - the architecture remains the same for now". It lives on the `dev`
branch (called `schools` until 2026-11-21; [ADR-0044](../decisions/0044-branches-family-dev-main.md)). It replaces [docs/plan/scope-schools.md](../plan/scope-schools.md) as the working scope; that file stays for its
research and its first answers.

Labels as in the [spine](../plan/00-spine.md#what-this-file-is): **[CONFIRMED by owner 2026-11-21]**, **[PROPOSAL]**,
**[ASSUMPTION]**, **[VERIFIED]** (source given), **[UNVERIFIED]** (how to check given).

---

## 1. What the platform is

A paid version of the game for state primary schools in England, Years 1 to 4. Schools buy a licence charged per
enrolled pupil and invoiced each term. Each school gets its own address, `<school>.spacecolonydefence.com`. There its
staff manage classes and pupils and see progress, and its pupils sign in and play. The owner runs everything else from
`admin.spacecolonydefence.com`: enrolling schools, plans, invoices and payments, and all game content (levels, maps,
aliens, questions, speech), including content made with AI help.

The family edition at `aliens.jackgl.com` stays as it is, for the owner's children, on `main` and in its own account
[CONFIRMED by owner 2026-11-21]. The platform is a separate deployment of the same code base and the same architecture
(CloudFront and S3 single-page apps, an HTTP API, Python Lambdas, DynamoDB, Cognito, Terraform, GitHub Actions), in two
new AWS accounts.

---

## 2. Documents

Read in this order. Each layer document ends with its user stories, written to be copied into Jira (section 6).

| # | Document | What it covers |
|---|---|---|
| 01 | [Product, people and roles](01-product-and-roles.md) | Who uses the platform, the roles and what each may do, the release plan in one page |
| 02 | [Environments and delivery](02-environments-and-delivery.md) | Dev and prod accounts, bootstrap, Terraform roots, pipelines, branches, secrets, content between environments |
| 03 | [Domains, edge and email](03-domains-edge-and-email.md) | `spacecolonydefence.com`, hostnames, wildcard schools, CloudFront, how a request knows its school, email sending |
| 04 | [Identity and access](04-identity-and-access.md) | Staff and pupil sign-in, MFA, Microsoft and Google, invitations, sessions, RBAC and how it is enforced, support access, audit |
| 05 | [Platform console](05-platform-console.md) | `admin.spacecolonydefence.com`: schools, plans, billing, content, support, operations |
| 06 | [School portal](06-school-portal.md) | `<school>.spacecolonydefence.com/staff`: staff, classes, pupils, CSV enrolment, sign-in cards, progress, billing, settings, new school year |
| 07 | [Pupil experience](07-pupil-experience.md) | A pupil's day: signing in at school and at home, This week, playing, progress, finishing |
| 08 | [Learning content, Years 1 to 4](08-learning-content.md) | Curriculum coverage, the content model, assignments, progress measures, AI-assisted authoring with review |
| 09 | [Billing](09-billing.md) | Plans, counting pupils, termly invoices, Stripe, payment methods, purchase orders, VAT, overdue and suspension, the owner's billing tools |
| 10 | [Data and API](10-data-and-api.md) | Tables and keys, the route catalogue, Lambdas and their permissions, how a school's data is kept apart, retention |
| 11 | [Privacy, security and assurance](11-privacy-security-and-assurance.md) | Data protection roles, DPA and DPIA, sub-processors, security controls, testing, accessibility, DfE standards |
| 12 | [Marketing and sales](12-marketing-and-sales.md) | Brand kit, marketing site, demo school, sales kit, trials |
| 13 | [Delivery plan](13-delivery-plan.md) | Epics, releases and phases, owner actions, decisions still open, risks, Jira import |

---

## 3. Decisions so far

### 3.1 Confirmed by the owner

All dated 2026-11-21. Where an answer replaces one given earlier the same day, the earlier one is noted.

| ID | Decision |
|---|---|
| PD-1 | The platform is a separate product. `aliens.jackgl.com` stays, unchanged, for the owner's children |
| PD-2 | Domain **`spacecolonydefence.com`**, registered by the owner 2026-11-21 (section 4) |
| PD-3 | Two environments, **dev and prod, each its own AWS account** in the owner's organisation |
| PD-4 | **The architecture stays the same** (section 1) |
| PD-5 | **`admin.spacecolonydefence.com` is the owner's console**: enrol schools, billing, automatic invoices, and all content (levels, aliens, maps, questions) |
| PD-6 | **`<school>.spacecolonydefence.com`** for each school; the school's staff manage pupils there |
| PD-7 | School roles: **Admin** (all pupils and classes), **Teacher** (their classes), **Read-only** (sees all pupils and classes), **Billing admin** (pays invoices; Admins can too) |
| PD-8 | **One teacher per class**, many pupils. Teachers add and remove pupils in their classes and can **upload a CSV that enrols a whole list** |
| PD-9 | Staff sign in with **email, password and MFA first**; Microsoft and Google sign-in next. Integration with what schools use is wanted |
| PD-10 | **Years 1 to 4.** Earlier the same day: Reception to Year 4 |
| PD-11 | **AI is used only in the owner's backend**, to help make questions and art. Nothing in the pupil or staff experience uses AI |
| PD-12 | Billing is **per enrolled pupil, termly, in advance, invoiced automatically**. An invoice counts the pupils **enrolled when it is made**. **One plan: a price per pupil with a minimum per school.** Schools pay by **bank transfer, card or Direct Debit**, and can put **purchase order numbers** on invoices. Earlier the same day: per school, per year |
| PD-13 | Pupils sign in with a **class code and a picture password**, or a **QR card glued into the homework book**. The **teacher chooses per class** whether pupils type a password instead (meant for Years 3 and 4) |
| PD-14 | A pupil's Home shows **this week's work first**, then the maps the class allows |
| PD-15 | The **demo school is a tenant in prod** (`demo.spacecolonydefence.com`). Earlier the same day: a separate environment |
| PD-16 | **England only**; a **real business** run through the owner's **existing limited company**, part-time at first |
| PD-17 | Selling: teachers try it free; direct to heads and trusts; resellers and catalogues; word of mouth. **The pilot is the owner's children's school** |
| PD-18 | Web browser first; an **iPad app** later. Parents may **subscribe separately** later. Teachers' own questions later |
| PD-19 | Keep the name **Space Colony Defence**; the full sales kit (brand, site, brochure, deck, curriculum map, privacy pack) |
| PD-20 | Work happens on **`dev`**, through short-lived feature branches named after the Jira ticket (`SCD-<n>-…`); the family edition lives on **`family`**; `main` is kept for the one big release ([ADR-0044](../decisions/0044-branches-family-dev-main.md)). Stories are tracked in **Jira** project SCD. Earlier the same day: the `schools` branch |
| PD-21 | The accounts are **`sca-dev`** and **`sca-prod`**, created and bootstrapped by the owner, locally, with the repository's bootstrap root |
| PD-22 | **A merge into `dev` deploys to sca-dev automatically.** Everything stays on dev until **one big release to prod**: `dev` merges into `main`, and the owner dispatches and approves the prod deploy |

### 3.2 Proposed, for the owner to confirm

The documents use these as their working assumption. Each is argued where it is introduced.

| ID | Proposal | Where |
|---|---|---|
| PQ-1 | The staff portal lives at `/staff` on the school's address; pupils use `/` | [03](03-domains-edge-and-email.md) |
| PQ-2 | A school's address comes from a **slug** the owner chooses at enrolment, checked against a reserved list | [03](03-domains-edge-and-email.md) |
| PQ-3 | DNS: the zone stays in the DNS account. The prod pipeline gets a narrow cross-account role for its records. `dev.spacecolonydefence.com` is delegated to the dev account | [03](03-domains-edge-and-email.md) |
| PQ-4 | A new Terraform root, `infrastructure/platform`, reuses the existing modules; `infrastructure/main` (the family edition) is untouched | [02](02-environments-and-delivery.md) |
| PQ-5 | Content (levels, maps, questions, speech) is authored in **prod's** console; dev gets content by export and import | [02](02-environments-and-delivery.md) |
| PQ-6 | Three Cognito user pools per environment: operators, staff, pupils. Pupils sign in through our API, which checks the picture password and has Cognito issue the tokens | [04](04-identity-and-access.md) |
| PQ-7 | Microsoft and Google sign-in (Launch) uses Cognito federation through **federation app clients that each hold up to 100 school callback URLs**, after a spike; a central sign-in origin is the fallback (AUTH-Q2) | [04](04-identity-and-access.md) |
| PQ-8 | RBAC is checked in our API on every request, from a permission table; Cognito groups are not used for school roles | [04](04-identity-and-access.md) |
| PQ-9 | A pupil record holds first name, last initial, year group and class, plus an optional school reference. No date of birth, email or photo | [06](06-school-portal.md) |
| PQ-10 | A teacher's "remove from class" leaves the pupil enrolled but unassigned; only Admins un-enrol (which stops billing) | [06](06-school-portal.md) |
| PQ-11 | A class code works only while the teacher has **class sign-in open**; QR cards work any time | [07](07-pupil-experience.md) |
| PQ-12 | Billing runs on **Stripe**: one subscription per school, a four-monthly cycle on **1 September, 1 January and 1 May**, quantity kept equal to the enrolled count | [09](09-billing.md) |
| PQ-13 | New schools are free until the next billing date (at least 30 days). The pilot school gets a 100% discount for agreed terms | [09](09-billing.md) |
| PQ-14 | Overdue invoices bring reminders and banners. **Suspension is the owner's decision, never automatic**; a suspended school's pupils cannot play, but its staff can still pay and export | [09](09-billing.md) |
| PQ-15 | Retention: a school's pupil data is deleted 90 days after its licence ends; audit records are kept 2 years; invoices 6 years | [11](11-privacy-security-and-assurance.md) |

---

## 4. Addresses

The owner registered `spacecolonydefence.com` on 2026-11-21 through Route 53 Domains, in the DNS account 521764600394
(CLI profile `dns`). Its public hosted zone is `Z05584941EODCDVG5OXIT`; auto-renew and privacy protection are on, and
it expires 2027-11-21 [VERIFIED: `route53domains get-domain-detail` and `route53 list-hosted-zones-by-name`, read
2026-11-21]. The layout [PROPOSAL; detail in [03](03-domains-edge-and-email.md)]:

| Address (prod) | What | Dev equivalent |
|---|---|---|
| `spacecolonydefence.com`, `www.` | Marketing site | `dev.spacecolonydefence.com` |
| `admin.spacecolonydefence.com` | Platform console (the owner) | `admin.dev.spacecolonydefence.com` |
| `<school>.spacecolonydefence.com` | A school: pupils at `/`, staff at `/staff` | `<school>.dev.spacecolonydefence.com` |
| `demo.spacecolonydefence.com` | The demo school (a tenant in prod) | none |
| `login.spacecolonydefence.com` | Staff sign-in pages (Cognito managed login, custom domain) | `login.dev.spacecolonydefence.com` |
| `hooks.spacecolonydefence.com` | Incoming webhooks (Stripe) | `hooks.dev.spacecolonydefence.com` |

---

## 5. Words used

| Word | Meaning |
|---|---|
| Platform | The schools product on `spacecolonydefence.com` |
| Family edition | The existing game at `aliens.jackgl.com` |
| Owner | The platform operator (you), the only user of the console in the first releases |
| Console | `admin.spacecolonydefence.com`, the owner's app |
| School | A customer, and the unit of data separation (a *tenant*). Has a slug, a status, a plan and a subscription |
| Slug | The school's part of the address, e.g. `stjosephs` in `stjosephs.spacecolonydefence.com` |
| Portal | The staff side of a school's address, `/staff` |
| Staff member | An adult at a school with a portal account. Holds one **access level** (Admin, Teacher or Read-only, or none) and may also be a **Billing admin** |
| Class | A teaching group with one teacher, a name, and one year group or more (mixed-age classes exist) |
| Pupil | A child in a school. **Enrolled** (active, and billed), **unassigned** (enrolled, no class), or **archived** (left; not billed; deleted after the retention period) |
| Class code | Six letters a teacher shows on the board to let the class sign in while class sign-in is open |
| QR card | A pupil's printed card; its code opens that pupil's sign-in page. Not a secret |
| Picture password | Three pictures tapped in order. **Typed password** is the alternative a teacher can turn on for a class |
| This week | What a teacher sets for a class: a map, the topics to practise, and an end date |
| Topic | A small piece of the curriculum, e.g. "number bonds to 10" or "the 3 times table" |
| Plan | A catalogue entry: price per pupil per term, a minimum number of pupils, and what is included |
| Billing date | 1 September, 1 January or 1 May [PROPOSAL]; an invoice is made on each |
| Demo school | A tenant in prod with made-up classes, pupils and progress, used in sales demos |

---

## 6. User stories and Jira

**Source of truth.** From 2026-11-21 the stories live in **Jira**: project **SCD** ("Space Colony Defence", key KAN until renamed on 2026-11-21) on
`cumulus-consulting.atlassian.net`, epics SCD-4 to SCD-15, versions Pilot, Launch and Later. The owner reviews and edits
them there. The story tables in these documents are the **starting snapshot** and are not kept up to date; the documents
keep the reasoning behind the design. Every ticket carries its scope ID as a label, so a story's ticket is found with
JQL `project = SCD AND labels = SCH-12`.

Each layer document ends with **user stories** in one format:

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| SCH-12 | As a teacher, I want to … so that … | Testable statements | Pilot, Launch or Later |

- **ID prefixes**: ENV (02), DNS (03), AUTH (04), CON (05), SCH (06), PUP (07), LRN (08), BIL (09), DAT (10), PRV (11),
  MKT (12).
- **Releases**: **Pilot** = what the first pilot school needs (free, one school); **Launch** = what selling to paying
  schools needs; **Later** = after launch.
- **Epics** group the stories in [13](13-delivery-plan.md#2-epics). On 2026-11-21 every epic, story and owner task
  was created in Jira (SCD-4 onwards) with its release, acceptance criteria, a link back here and its ID as a label
  ([13 §7](13-delivery-plan.md#7-jira); the ID-to-key map is [jira-keys.json](jira-keys.json)).
