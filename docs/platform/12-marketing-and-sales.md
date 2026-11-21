# 12. Marketing and sales

Part of the [platform scope](README.md). Status: active on `dev` from 2026-11-21.

What it takes to sell the platform: a brand, a marketing site, a demo school, a sales kit, trials, routes to schools,
and the pilot. The owner chose to keep the name and to have the full sales kit (PD-19). The demo school is a tenant in
prod (PD-15). The owner also set the selling routes and chose the pilot school (PD-17) [CONFIRMED by owner 2026-11-21].
Sources are keyed M1 to M17 and listed in [§10](#10-sources).

---

## 1. Summary

| Piece | What | Release |
|---|---|---|
| Brand kit | Logo, wordmark, palette, type, favicon and app icon, drawn as SVG | Pilot |
| Marketing site | Apex and `www`: what the platform is, prices, safety and privacy, "Book a demo" | Launch |
| Demo school | `demo.spacecolonydefence.com`, with made-up data and a reset | Pilot |
| Sales kit | Brochure, deck, curriculum map, privacy pack, price sheet, case study | Launch (case study Later) |
| Trials | Created by the owner at first; teachers sign up themselves later | Launch, then Later |
| Pilot | The owner's children's school, one free term | Pilot |

---

## 2. Brand kit

| Asset | Used on |
|---|---|
| Logo mark | Favicon, app icon, social preview image, printed QR cards |
| Wordmark "Space Colony Defence", plus a "for schools" version | Marketing site, portal header, brochure, deck |
| Lock-ups (horizontal and stacked) | Headers, documents |
| Palette as named tokens for light and dark, each text and background pair checked against WCAG 2.2 AA contrast | Every app and document |
| Type: one heading family, system fonts for body text | Marketing site, portal, documents |
| Favicon set and app icon (the iPad app comes later, PD-18) | Browsers; the App Store later |
| Email header | Invitations and notices sent through SES ([03](03-domains-edge-and-email.md)) |
| Social preview image | Links shared to the site |

How it is made [PROPOSAL]:

- **Like all the art today.** Hand-drawn SVG that follows [art/STYLE.md](../../art/STYLE.md), kept in
  `art/svg/brand/`, rendered by `tools/art/render.py` as a `brand` family, and listed in
  [docs/art/asset-catalogue.json](../art/asset-catalogue.json).
- **Original.** Nothing borrowed from other games' branding.
- **Fonts served from our own origin**, so no page asks a third party for anything
  ([11 §10](11-privacy-security-and-assurance.md#10-security-controls)).

**Trade mark.** The earlier scope proposed searching the UK IPO register for "Space Colony Defence" before filing
([docs/plan/scope-schools.md §10.2](../plan/scope-schools.md)). That is still open (MKT-Q6).

**Voice.** To adults: plain, practical, short. To pupils: the game's own voice. Claims follow rule R8: the game helps
pupils *practise*. Nothing says it raises attainment unless there is evidence for it [PROPOSAL].

---

## 3. Marketing site

### 3.1 Pages

| Page | What it says |
|---|---|
| Home | Maths and phonics practice inside a space tower-defence game, for Years 1 to 4. Screenshots, a short self-hosted video, "Book a demo" |
| For teachers | Classes, CSV enrolment, QR cards and picture passwords, This week, progress by topic |
| For school leaders | Curriculum coverage, safety and privacy, accessibility, price, trusts |
| Curriculum | Years 1–4 maths headings and English (phonics, spelling), each mapped to the game's topics ([08](08-learning-content.md)) |
| Pricing | Price per pupil per term and the minimum (PD-12); VAT; payment methods; purchase order numbers; free until the next billing date (PQ-13) |
| Safety and privacy | The assurance pack download ([11 §17](11-privacy-security-and-assurance.md#17-the-assurance-pack)), the sub-processor list, the DPA, the accessibility statement, the domain list for IT |
| Book a demo | The form (§3.4) |
| Support | Contact details and a link to the status page |
| Legal | Privacy notice, terms, cookie statement ([11 §16](11-privacy-security-and-assurance.md#16-legal-documents)) |

### 3.2 Messages and claims

- **Phonics.** The site says the game supports phonics practice and names no programme. The DfE lists 45 validated
  systematic synthetic phonics programmes, and "There is no statutory requirement for schools to choose one of the SSP
  programmes on the validated list" [VERIFIED M1].
- **Times tables in Year 4.** The multiplication tables check is "statutory for all year 4 pupils". The check period
  opens on Monday 7 June 2027 [VERIFIED M2]. It has 25 questions with "6 seconds to answer each question" [VERIFIED
  M3], drawn from "the 121 items that make up the 2 to 12 multiplication tables" [VERIFIED M4]. The site talks about
  practising the tables, not about scores in the check [PROPOSAL].
- **Phonics screening check in Year 1.** It has "20 real words and 20 pseudo-words" and runs in the week from Monday
  14 June 2027 [VERIFIED M5]. The site mentions practice for it only if the content includes pseudo-words
  ([08](08-learning-content.md)) [PROPOSAL].
- **The curriculum is changing.** The government aims "to publish the final revised national curriculum by spring
  2027", for first teaching from September 2028 [VERIFIED M6]. The curriculum page shows a date and is revised when the
  new curriculum is published.
- **No learning-gain claims without evidence** (R8, [01](01-product-and-roles.md)).

### 3.3 Prices on the site

- **What is shown.** The price per pupil per term and the minimum per school (PD-12). The figures are still to be set
  (MKT-Q1).
- **VAT.** Prices are shown "plus VAT", with an FAQ:
  - Software is standard-rated: "supplies of such software are standard rated" [VERIFIED M7].
  - Maintained schools recover VAT through their local authority (s.33), and academies through the s.33B refund
    scheme, for spending that is not for business purposes [VERIFIED M8, M9].
  - The VAT liability of this particular product is for the accountant to confirm [UNVERIFIED].

### 3.4 Book a demo

| Item | Proposal |
|---|---|
| Fields | Name, role, school, work email, optional phone number, preferred times, message |
| Our role | Controller ([11 §2](11-privacy-security-and-assurance.md#2-who-is-responsible-for-what)); the form links to our privacy notice |
| Retention | 12 months (MKT-Q2) |
| Spam | A hidden honeypot field and a rate limit. No third-party CAPTCHA, because pages load no third-party scripts |
| Flow | Browser → `POST /api/public/demo-requests` ([10](10-data-and-api.md)) → stored with a 12-month TTL → emailed to the owner through SES ([03](03-domains-edge-and-email.md)) → listed in the console ([05](05-platform-console.md)) |

### 3.5 Build and hosting

[PROPOSAL]

- **Build.** A static site with no server rendering. Its source is in `web/marketing/` (MKT-Q3).
- **Hosting.** S3 and a CloudFront distribution for the apex and `www`, in the prod account
  ([03](03-domains-edge-and-email.md)). The platform release workflow deploys it
  ([02](02-environments-and-delivery.md)). A dev copy runs at `dev.spacecolonydefence.com`.
- **Privacy.** An enforced CSP. No trackers, no analytics scripts, no cookies. If page counts are wanted, they come
  from CloudFront logs, aggregated so they hold no personal data.
- **Quality.** WCAG 2.2 AA. Page titles, descriptions and a sitemap.

---

## 4. The demo school

The demo school is a tenant in prod with the slug `demo`, at `demo.spacecolonydefence.com` (PD-15). It is left out
of billing, reports and counts ([02 §10](02-environments-and-delivery.md#10-the-demo-school-pd-15)).

| Fixture | Contents [PROPOSAL] |
|---|---|
| School | "Demo Primary School", a made-up name |
| Classes | One per year: Year 1 "Comets", Year 2 "Meteors", Year 3 "Rockets", Year 4 "Orbiters" |
| Pupils | About 25 per class. First names and initials come from an invented list kept in the repository, never real children's names. Avatars and picture passwords are set |
| QR cards | Printable, with a DEMO watermark |
| This week | Set for every class |
| Progress | Six weeks of practice made by a seeded script, so the progress views look real |
| Staff | Four accounts (Admin, Teacher, Read-only, Billing admin), on email addresses the owner controls, with MFA on the owner's device |
| Billing page | Sample invoices marked "Demo". No Stripe objects; live Stripe is never used for the demo |

- **Reset.** A console action, **Reset demo school**, deletes the data and recreates the fixtures
  ([02 §10](02-environments-and-delivery.md#10-the-demo-school-pd-15)). The owner runs it before each demo. A nightly
  reset, and demo pupil accounts handed out to real children, were offered and not chosen [CONFIRMED by owner
  2026-11-21].
- **Guided demos only at first.** The owner runs every demo, and prospects get no demo logins of their own (MKT-Q4). A
  prospect who wants to try it themselves gets a trial school (§6).

**Demo script, about 15 minutes** [PROPOSAL]:

| Step | Show |
|---|---|
| 1 | The marketing site: what it is, for whom, the price |
| 2 | Portal as Admin: the setup checklist, staff and roles, the Billing page with sample invoices |
| 3 | Portal as Teacher: a class, a CSV upload of made-up names with its preview, printing QR cards |
| 4 | Open class sign-in. On an iPad, sign in as a pupil with the class code and pictures, then play a wave and an activity |
| 5 | Back in the portal: the class progress grid, then setting This week |
| 6 | Safety and privacy: the assurance pack, the domain list for IT |
| 7 | Price and next steps: a trial school, the quote |

---

## 5. Sales kit

The owner chose the full kit (PD-19). Its sources are kept in the repository as Markdown and SVG and exported to PDF.
They contain no personal data [PROPOSAL].

| Item | Contents | Release |
|---|---|---|
| Teacher brochure (PDF, 2–4 pages) | What it is, how a lesson works, signing in, progress, safety, price, contact | Launch |
| Sales deck (10–12 slides) | For heads and trusts: the product, the curriculum, safety and privacy, what the pilot showed, the price, how a school starts | Launch |
| Curriculum mapping sheet, Years 1–4 | Maths headings by year: Year 1 lists number and place value, addition and subtraction, multiplication and division, fractions, measurement, properties of shapes, and position and direction. Year 2 adds statistics. In Year 3, statistics replaces position and direction. Year 4 is the Year 2 list with fractions "(including decimals)" [VERIFIED M10]. English: word reading and phonics, spelling (the Year 3–4 list of 100 words is statutory [VERIFIED M11]), grammar. Each heading maps to the game's topics, generated from the content tags so it stays in step ([08](08-learning-content.md)) | Launch |
| Privacy pack | The assurance pack ([11 §17](11-privacy-security-and-assurance.md#17-the-assurance-pack)) | Launch |
| Price sheet and quote template | Per-pupil termly price, the minimum, VAT, payment methods, purchase orders. For low- and medium-value purchases schools must "get at least 3 quotes from suppliers" [VERIFIED M12], so a quote they can file helps | Launch |
| FAQ | Sign-in for 5-year-olds, devices, home use, data, VAT, cancelling | Launch |
| Case study | After the pilot, with the school's written permission. Staff quotes with their consent; no pupil data and no pictures of pupils | Later |

---

## 6. Trials

- **The owner creates trial schools at first**, in the console ([05](05-platform-console.md)), after a demo.
  - A new school is free until the next billing date, and for at least 30 days (PQ-13).
  - When the trial ends, the first invoice is for the pupils enrolled on that billing date ([09](09-billing.md)). The
    school can stop before then.
- **Turning a trial into a customer** needs the billing details, the Admin's acceptance of the terms, and a purchase
  order number if the school uses them.
- **Teachers sign up for a trial themselves, later** (MKT-Q5) [PROPOSAL].
  - The school is identified by its GIAS URN (§8).
  - The owner approves each sign-up before the trial school is created. Checking that a person works at a school is
    hard, because school email domains are not uniform ([docs/plan/scope-schools.md §10.7](../plan/scope-schools.md)).

---

## 7. Selling to schools

### 7.1 Routes

The owner chose all four [CONFIRMED by owner, PD-17]:

| Route | How |
|---|---|
| Teachers try it free | A teacher or a school starts a trial (§6); the school buys when it ends |
| Direct to heads and trusts | Demos, visits and calls. Selling to a trust as one customer comes later ([01](01-product-and-roles.md)) |
| Resellers and catalogues | Which ones is [UNVERIFIED]. Each needs a reseller price and a way to be invoiced (MKT-Q7; [09](09-billing.md)) |
| Word of mouth from the pilot | References and, later, the case study (§5) |

### 7.2 How schools buy

| Fact | Effect on selling |
|---|---|
| Maintained schools "plan and spend within a financial year period of April to March" [VERIFIED M13]. An academy trust's accounting period "will end on 31 August" [VERIFIED M14] | Budgets are set at different times of year for the two kinds of school; time sales and price changes around both [ASSUMPTION] |
| DfE value bands: "low is under £10,000". For low and medium values, schools "get at least 3 quotes" and should "Check your school's procurement rules" [VERIFIED M12] | A school's yearly cost will usually be low value [ASSUMPTION: depends on the prices], so quotes must be quick to give (§5) |
| The Procurement Act's implied 30-day payment terms do not apply to "a contract awarded by a school" [VERIFIED M15]. Under the late payment rules, with no agreed date, payment is late after 30 days [VERIFIED M16] | Invoices state 30 days ([09](09-billing.md)) |
| VAT recovery under s.33 and s.33B (§3.3) | Prices are shown plus VAT, with the FAQ |
| Schools check suppliers against the DfE standards and data protection guidance | The assurance pack ([11](11-privacy-security-and-assurance.md)) |

---

## 8. Prospect data

- **GIAS.** Get Information About Schools publishes every school as CSV under the Open Government Licence v3.0, and
  "This data is updated daily". There is no public API; a WebServices sign-up exists. The fields include:
  - the URN, establishment type, phase, status and local authority;
  - the trust, the address and the number of pupils;
  - head teacher names.

  There is no email column [VERIFIED M17].
- **How we use it.** To filter open state-funded primary schools in England, and to find trusts from the trust
  downloads. The URN is recorded when a school is enrolled ([05](05-platform-console.md)).
- **Rule.** The repository holds no personal data (CLAUDE.md). Prospect lists contain head teachers' names, so they
  stay outside the repository and out of Jira descriptions: Jira tickets describe features, not prospects. Prospect
  lists live in the company's own business tools [PROPOSAL].
- **Emailing school staff.** Whether the rules for business email allow contacting named school staff is
  [UNVERIFIED: the solicitor confirms how PECR and UK GDPR apply].

---

## 9. The pilot

- **School:** the owner's children's school (PD-17).
- **Terms:** free for one term (MKT-Q9). This is done with a 100% coupon on the school's subscription, so the whole
  billing path runs without charging anything (PQ-13, [09](09-billing.md)). The DPA is signed before any pupil signs in
  (PRV-1 in [11](11-privacy-security-and-assurance.md#20-user-stories)).
- **Scope:** the Pilot release ([01 §6](01-product-and-roles.md#6-releases)).

**Safeguards**, because the owner is both the platform operator and a parent at the school. These carry over from
[docs/plan/scope-schools.md §10.8](../plan/scope-schools.md) [PROPOSAL]:

1. The school signs the DPA, even for a free pilot.
2. A named teacher at the school is the contact.
3. The owner uses support access only when the school asks; it is audited and visible to the school.
4. The owner's own children's accounts get no special treatment.
5. No pupil's real name goes into the repository, tests, Jira or demo data.
6. The school's data protection officer reads the DPIA before any pupil signs in.

**Success measures** (MKT-Q8) [PROPOSAL]:

| Measure | Target |
|---|---|
| Classes using it in a normal week | At least 3 |
| A teacher's time to set up a class, from CSV to printed cards | Under 15 minutes |
| Year 1 pupils signing in without adult help | Most of them by the third week |
| Sign-in or play problems that need the owner | Fewer each week |
| Data or isolation incidents | None |
| Teachers using it who would recommend it | Most of them |
| Defects found | All tracked in Jira |

**Timeline.**

1. Start after the Pilot release.
2. Run for one term, with a check-in halfway.
3. Review with the school at the end of term.
4. Use the review to settle what goes into Launch.

---

## 10. Sources

All checked 2026-11-21.

| Key | Source |
|---|---|
| M1 | DfE, list of validated phonics teaching programmes, updated 11 November 2026: https://www.gov.uk/government/publications/choosing-a-phonics-teaching-programme/list-of-phonics-teaching-programmes |
| M2 | DfE, 2027 key stage 2 assessment and reporting arrangements: https://www.gov.uk/government/publications/key-stage-2-assessment-and-reporting-arrangements-ara/2027-key-stage-2-assessment-and-reporting-arrangements |
| M3 | DfE, multiplication tables check administration guidance (2026 edition; the 2027 one is not out yet): https://www.gov.uk/government/publications/multiplication-tables-check-administration-guidance/multiplication-tables-check-administration-guidance |
| M4 | DfE, multiplication tables check assessment framework: https://assets.publishing.service.gov.uk/media/62384958e90e0779a5e700c3/2018_MTC_assessment_framework_PDFA_updated_for_2022.pdf |
| M5 | DfE, 2027 phonics screening check assessment and reporting arrangements: https://www.gov.uk/government/publications/phonics-screening-check-assessment-and-reporting-arrangements-ara/2027-phonics-screening-check-assessment-and-reporting-arrangements |
| M6 | Government response to the Curriculum and Assessment Review: https://assets.publishing.service.gov.uk/media/690b2a4a14b040dfe82922ea/Government_response_to_the_Curriculum_and_Assessment_Review.pdf |
| M7 | HMRC, zero rate of VAT for electronic publications: https://www.gov.uk/guidance/zero-rate-of-vat-for-electronic-publications |
| M8 | HMRC, VAT Education Manual VATEDU65750 (maintained schools, s.33): https://www.gov.uk/hmrc-internal-manuals/vat-education-manual/vatedu65750 |
| M9 | HMRC, VAT Education Manual VATEDU70000 (academies, s.33B): https://www.gov.uk/hmrc-internal-manuals/vat-education-manual/vatedu70000 |
| M10 | DfE, national curriculum in England: mathematics programmes of study: https://www.gov.uk/government/publications/national-curriculum-in-england-mathematics-programmes-of-study/national-curriculum-in-england-mathematics-programmes-of-study |
| M11 | DfE, English Appendix 1: Spelling: https://assets.publishing.service.gov.uk/media/5a7ccc06ed915d63cc65ce61/English_Appendix_1_-_Spelling.pdf |
| M12 | DfE, buying procedures and procurement law for schools: https://www.gov.uk/guidance/buying-procedures-and-procurement-law-for-schools |
| M13 | DfE, LA and school expenditure methodology: https://explore-education-statistics.service.gov.uk/methodology/la-and-school-expenditure |
| M14 | DfE, Academy Trust Handbook 2026, §4.3: https://www.gov.uk/government/publications/academy-trust-handbook/academy-trust-handbook-2026-effective-from-1-october-2026 |
| M15 | Procurement Act 2023, section 68, and the government's schools factsheet: https://www.legislation.gov.uk/ukpga/2023/54/section/68, https://assets.publishing.service.gov.uk/media/6569fc94946226049cc567eb/20231127-factsheet-schools.pdf |
| M16 | GOV.UK, late commercial payments: https://www.gov.uk/late-commercial-payments-interest-debt-recovery |
| M17 | Get Information About Schools, downloads and glossary: https://get-information-schools.service.gov.uk/Downloads, https://get-information-schools.service.gov.uk/Glossary |

---

## 11. Decisions for the owner

| ID | Proposal |
|---|---|
| MKT-Q1 | The prices published on the site: the per-pupil termly price and the minimum per school (PD-12 sets the model, not the figures) |
| MKT-Q2 | Keep demo requests for 12 months |
| MKT-Q3 | The marketing site is static, with its source in `web/marketing/` |
| MKT-Q4 | Guided demos only at first; no demo logins for prospects |
| MKT-Q5 | Teachers sign up for trials themselves later, each approved by the owner |
| MKT-Q6 | Search the UK IPO register for "Space Colony Defence" and decide whether to file |
| MKT-Q7 | Reseller terms (discount or margin, how they are invoiced), once a reseller is interested |
| MKT-Q8 | The pilot's success measures (§9) |
| MKT-Q9 | The pilot runs for one term, free, through a 100% coupon |

---

## 12. User stories

*Snapshot of 2026-11-21. The source of truth for these stories is now Jira (project SCD); see
[README §6](README.md#6-user-stories-and-jira). Edit the tickets, not this table.*

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| MKT-1 | As the owner, I want a brand kit in the game's art style, so that the platform looks the same everywhere | Logo, wordmark, palette tokens, favicon and app icon as SVG in `art/svg/brand/`, rendered by `tools/art/render.py` and listed in the asset catalogue; every palette text pair passes WCAG 2.2 AA contrast; the owner approves a brand sheet | Pilot |
| MKT-2 | As a school leader, I want a marketing site that explains the product, so that I can decide whether to see a demo | The §3.1 pages are live at the apex and `www`; an automated accessibility scan finds no serious issues; a network check shows no third-party requests | Launch |
| MKT-3 | As a school leader, I want to book a demo online, so that I don't have to find an email address | The form posts to `/api/public/demo-requests`; the owner gets an email through SES; the request is stored with a 12-month TTL; a honeypot and a rate limit stop scripted posts; the privacy notice is linked | Launch |
| MKT-4 | As a business manager, I want clear prices, so that I can budget | The pricing page shows the per-pupil termly price, the minimum, "plus VAT" with the VAT FAQ, the payment methods and purchase order support | Launch |
| MKT-5 | As the owner, I want a ready-made demo school in prod, so that every demo starts the same | The `demo` tenant has the §4 fixtures; **Reset demo school** recreates them; the demo is left out of billing, reports and counts; no real names appear | Pilot |
| MKT-6 | As the owner, I want demo staff accounts for each role, so that I can show what each person sees | Admin, Teacher, Read-only and Billing admin accounts sign in with MFA; the demo pupils' pictures are written in the demo script | Pilot |
| MKT-7 | As the owner, I want a demo script, so that demos are short and cover the main points | The §4 steps are written down and run in about 15 minutes from a reset demo school | Pilot |
| MKT-8 | As a teacher, I want a short brochure, so that I can show colleagues | A 2–4 page PDF exported from repository sources, with no personal data | Launch |
| MKT-9 | As a head or trust leader, I want a sales deck, so that the decision makers see the case | 10–12 slides covering the product, the curriculum, safety, the pilot's results, the price and how a school starts | Launch |
| MKT-10 | As a subject lead, I want a curriculum mapping sheet for Years 1–4, so that I can see what is covered | Built from the content's curriculum tags ([08](08-learning-content.md)); shows the national curriculum headings for each year; dated, and revised when the new curriculum is published | Launch |
| MKT-11 | As a DPO, I want the privacy pack on the website, so that I can check the supplier before a demo | The assurance pack ([11 §17](11-privacy-security-and-assurance.md#17-the-assurance-pack)) can be downloaded from the safety and privacy page | Launch |
| MKT-12 | As a business manager, I want a quote I can file, so that I can meet our procurement rules | A quote template with the school's pupil count, the termly price, the minimum, VAT and validity; produced by the owner | Launch |
| MKT-13 | As the owner, I want a pilot plan agreed with the school, so that we both know what success means | Dates, a named contact, the §9 measures and safeguards written down; DPA signed; a 100% coupon on the school's subscription | Pilot |
| MKT-14 | As the owner, I want a case study after the pilot, so that other schools hear from a real one | Written permission from the school; only staff quotes given with consent; no pupil data | Later |
| MKT-15 | As a teacher, I want to start a trial from the website, so that I can try it without waiting for a demo | A sign-up form takes the school's URN and the teacher's work email; the owner approves before the trial school is created; the trial follows PQ-13 | Later |
