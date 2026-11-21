# 11. Privacy, security and assurance

Part of the [platform scope](README.md). Status: active on `dev` from 2026-11-21.

This document scopes what the platform must do, and what it must be able to show, for schools, their data protection
officers (DPOs) and their IT staff to buy it. It is scope, not legal advice. The **solicitor** settles the contracts,
the notices and the data protection roles; the **accountant** settles how long financial records are kept. Sources are
keyed S1 to S16 and listed in [§18](#18-sources).

---

## 1. Summary

- For everything it does for a school, the platform is the school's **processor**, and the school is the controller.
  We are a **controller** only for our own customer relationship (billing contacts), demo requests and marketing
  [PROPOSAL; the solicitor confirms].
- We hold only the pupil data the game needs (PQ-9) and keep it in London (`eu-west-2`). None of it goes to Stripe or
  to any AI provider, and it is deleted on a fixed schedule (PQ-15).
- Schools check suppliers against the DfE's digital and technology standards [VERIFIED S4–S8]. The evidence they need
  goes into one **assurance pack** (§17): the DPA, the sub-processor list, a pre-filled DPIA, a security overview, the
  domain list for IT, the accessibility statement and our certificates.
- Before Launch: an independent penetration test, Cyber Essentials, an accessibility audit and a restore drill
  [PROPOSAL].

---

## 2. Who is responsible for what

| Processing | School | Us | Why |
|---|---|---|---|
| Pupil accounts, sign-in, play, practice records, progress views | Controller | Processor | We act only on the school's instructions (rule R1, [01](01-product-and-roles.md)) |
| Staff accounts, roles, invitations, the audit log | Controller | Processor | As above |
| Support access to a school's data | Controller (it grants access) | Processor | Only at the school's request; time-limited, audited, visible to the school ([04](04-identity-and-access.md)) |
| Billing contacts, invoices, payments | — | Controller | Our own customer relationship with the school [PROPOSAL; the solicitor confirms] |
| Demo requests and other enquiries from the marketing site | — | Controller | [12](12-marketing-and-sales.md) |
| Security and operations logs | Controller for what they say about its users | Processor; possibly also controller for our own security purposes | [UNVERIFIED: the solicitor decides] |
| Content made with AI help | — | — | No personal data involved (§5) |

The ICO says schools are not information society services and are out of scope of the Children's code, but "edtech
providers may be in scope". That applies in particular where a provider sells direct to consumers or influences "the
nature and purpose of the processing". A provider that "processes children's personal information outside the school's
instructions" is a controller for that processing [VERIFIED S1]. Two consequences [PROPOSAL]:

- **We act only as a processor for school data.** No analytics on pupil data, no product research on their answers,
  no marketing use. Aggregate operational numbers (error rates, response times) contain no personal data
  [ASSUMPTION; the solicitor confirms].
- **We build to the Children's code anyway**: privacy by default, data minimisation, no profiling, no nudges, no
  sharing [ASSUMPTION: the design already meets these; the solicitor checks it against the code's standards]. The
  family subscription (Later, PD-18) would make us a controller selling to consumers, and then the code would apply in
  full.

### 2.1 The ICO's edtech audit findings, used as our checklist

The ICO's *Edtech examined* report (24 June 2026) covers audits of 28 providers in 2024–25 [VERIFIED S2]:

| ICO finding | What we do |
|---|---|
| "almost 70% of providers were found to be the controller for some of their uses of children's personal information" | Put the role table above, feature by feature, in the DPA annex. Check any new use of pupil data against it before it is built; this becomes a line in every phase review |
| "around 70% of edtech providers had contracts that lacked detail or didn't include the legal requirements in article 28" | A DPA, drafted by the solicitor, with every Article 28 element (§4) |
| "over 40% of edtech providers hadn't done a DPIA at all" | Our own DPIA for the processing we control, plus a pre-filled DPIA for schools (§6), both refreshed when data use changes |
| About 30% failed on sub-processor authorisation | A published list, general written authorisation in the DPA, and notice of changes with a right to object (§5) |
| The ICO is discussing "a new edtech code" | Review the platform against it when it is published (PRV-24) |

---

## 3. What data we hold, why, and where

| Data | About | Fields | Why | Where | Kept (§7) |
|---|---|---|---|---|---|
| Pupil record | Pupils | First name, last initial, year group, class, optional school reference, an avatar from the game's art (PQ-9) | Sign-in, and choosing the right content | DynamoDB, eu-west-2 | While enrolled, then 90 days after leaving |
| Sign-in secret | Pupils | Picture or typed password, encrypted with a KMS key; lockout counters | Sign-in | DynamoDB and KMS, eu-west-2 | Deleted with the pupil record |
| Sign-in identity | Pupils | A Cognito user named by an opaque ID; no email, no phone number | Issuing tokens | Cognito, eu-west-2 | Deleted with the pupil record |
| Play and practice | Pupils | Runs, answers and attempts, practice by topic, badges, time played | The game, and the teacher's progress views | DynamoDB, eu-west-2 | Deleted with the pupil record |
| Staff account | Staff | Name, school email, access level, billing flag, sign-in method, last sign-in; MFA secrets are held by Cognito | Portal access | Cognito and DynamoDB, eu-west-2 | Until the person is removed |
| Audit log | Staff (and pupils, as the records acted on) | Who did what, when, to which record; never a secret | Accountability to the school | DynamoDB, eu-west-2 | 2 years |
| Billing contact | Adults at the school | Names, emails, school address, purchase order numbers | Invoicing | DynamoDB (eu-west-2) and Stripe (US transfer, below) | 6 years |
| Payment details | The school | Card or bank details | Payment | **Stripe only**, never our systems ([09](09-billing.md)) | Under Stripe's terms |
| Demo request | Adults | Name, role, school, work email, message | Arranging a demo | DynamoDB and an email to the owner, eu-west-2 | 12 months (MKT-Q2 in [12](12-marketing-and-sales.md)) |

Not held [PROPOSAL]:

- dates of birth or full surnames;
- pupils' email addresses or photos;
- free-text notes about pupils;
- special educational needs or any other special category data.

The family edition's birthday field does not exist on the platform.

**Location.** Everything above is stored and processed in `eu-west-2` (London), with two exceptions:

- **Stripe.** Billing contacts' data goes to Stripe. Stripe's terms say "User transfers Personal Data to Stripe, LLC in
  the United States", under the Data Privacy Framework and the UK International Data Transfer Addendum [VERIFIED S13,
  S14]. Stripe receives the school's details, its contacts and the number of pupils, never pupils' data
  ([09](09-billing.md)).
- **CloudFront.** Requests pass through CloudFront edge locations. The API is not cached [VERIFIED
  infrastructure/modules/static_site/main.tf:129-234, from the code map]. Whether passing through an edge location
  counts as a transfer is [UNVERIFIED: the solicitor confirms].

The DfE cloud standard says "Data should be stored and processed in the UK or EU, unless you have confirmed that any
international transfer of your data complies with UK GDPR" [VERIFIED S5].

---

## 4. The data processing agreement

The solicitor drafts the DPA. It contains what the ICO says an Article 28 contract must include [VERIFIED S3; the ICO
notes its guidance is under review because of the Data (Use and Access) Act]:

- **Details:**
  - the subject matter and duration of the processing;
  - its nature and purpose;
  - the type of personal data and the categories of data subject;
  - the controller's obligations and rights.
- **Terms:**
  - acting only on documented instructions;
  - a duty of confidence;
  - security;
  - sub-processors;
  - helping with data subjects' rights;
  - assisting the controller;
  - what happens at the end of the contract;
  - audits and inspections.

The DfE's guidance on procuring edtech adds three points [VERIFIED S6]:

- the contract "should cover security measures, sub-processors, deletion and return of data";
- schools should check "whether the supplier is acting as a processor or joint controller for any features";
- "The supplier must have adequate safeguards in place for transfers outside the UK".

Our commitments in the annex [PROPOSAL]:

| Topic | Commitment |
|---|---|
| Duration | The licence term plus the 90-day export window (PQ-15) |
| Location | eu-west-2, with the exceptions in §3 |
| Breach notice | To the school's Admins within PRV-Q1's limit after we confirm a breach (§9) |
| Sub-processors | The published list (§5), 30 days' notice of changes and a right to object (PRV-Q8) |
| Return and deletion | A full export in CSV and JSON at any time and at the end; deletion after 90 days; backups age out (§7) |
| Audits | The assurance pack (§17) first, then a reasonable right to audit on request |
| Assistance | Tools for access, correction and erasure (§8); help with the school's DPIA (§6) |

The first Admin of each school accepts the terms and the DPA in the portal, and the version, the person and the time
are recorded ([06](06-school-portal.md)). A school that wants a signed copy gets one [PROPOSAL].

---

## 5. Sub-processors

| Sub-processor | Service | Personal data it handles | Location | Handles school data? |
|---|---|---|---|---|
| Amazon Web Services | Hosting (CloudFront, S3, Lambda, DynamoDB, Cognito, KMS), email (SES), speech synthesis (Polly) | Everything in §3 except payment details | eu-west-2; CloudFront edges as in §3 | Yes |
| Stripe | Invoices and payments ([09](09-billing.md)) | Billing contacts, the school's name and address, invoice amounts, pupil counts | United States (§3) | No pupil data. Stripe is our processor for billing, and a controller in its own right for fraud prevention, anti-money-laundering, know-your-customer checks and legal compliance [VERIFIED S13] |
| AI providers used to make content: OpenAI for pictures, called by `picture_gen` [VERIFIED infrastructure/main/variables.tf:188-219, from the code map], and any provider later used to draft questions | Drafting content for the owner to review | **None.** They receive only the owner's prompts and content drafts, never school, staff or pupil data (PD-11) | — | **No** [PROPOSAL; the solicitor confirms they need not be listed as sub-processors for school data] |

Two facts back the AI row:

- **Polly works only for the owner.** It is called only by the owner's speech preview; children's devices fetch
  pre-made clips through short-lived links [VERIFIED api/functions/tts/handler.py, from the code map].
- **AI functions cannot reach school tables.** Each function that calls an AI provider has an IAM role with no access
  to the platform's school tables, and a test proves it (PRV-23).

If we subscribe to Stripe's alerts, Stripe gives notice "at least 30 days before" adding a sub-processor. Its list
includes AWS, Microsoft Azure and Snowflake, all in the US [VERIFIED S13, S15]. The owner subscribes, and our own list
links to Stripe's.

---

## 6. DPIA

The DfE cloud standard says the school's data protection officer should carry out a DPIA for any cloud service that
stores personal data [VERIFIED S5]. The ICO found that over 40% of edtech providers had not done one at all [VERIFIED
S2]. We provide two documents [PROPOSAL]:

1. **Our own DPIA**, covering the processing we control (billing contacts, demo requests) and the design as a whole
   (PRV-3).
2. **A pre-filled DPIA for schools**, which the school's DPO completes and signs (PRV-2). It covers:
   - the processing (§3), with a data-flow diagram;
   - why each field is needed;
   - the risks below and their mitigations;
   - sub-processors and transfers;
   - retention;
   - how rights requests work;
   - space for the DPO's conclusion.

| Risk | Likelihood and severity [ASSUMPTION; the DPO judges] | Mitigation |
|---|---|---|
| A classmate guesses a pupil's picture password and plays as them | Possible; minimal harm | Lockout within "no more than 10 guesses in 5 minutes" (§10); teacher reset; nothing sensitive behind the sign-in |
| Someone outside school sees a QR card | Possible; minimal harm | The card's code is unguessable and shows only a first name, an initial and an avatar. Signing in still needs the pictures, and the card can be reissued ([07](07-pupil-experience.md)) |
| The class sign-in page shows the class list | Possible; minimal harm | Only while the teacher has class sign-in open (PQ-11) |
| A bug shows one school's data to another | Unlikely; significant harm | One access-check module; tests on every route and role; the request's school must match the token's school ([04](04-identity-and-access.md), [10](10-data-and-api.md)); penetration test |
| A staff account is taken over | Unlikely; significant harm | MFA, or the school's own MFA for Microsoft and Google; leavers removed; session timeouts |
| Support access is misused | Unlikely; significant harm | Only at the school's request; time-limited; audited; visible to the school |
| Data is kept longer than needed | Unlikely; moderate harm | Automatic deletion (§7) |
| A supplier is breached | Unlikely; moderate harm | No pupil data at Stripe; Stripe tells us within 48 hours [VERIFIED S13] |
| Billing contacts' data goes to the US | Certain; minimal harm | Adults' business contact details only, under the DPF and the IDTA (§3) |
| Teachers enter more than is needed | Possible; minimal harm | No free-text fields about pupils; CSV import keeps only the listed fields ([06](06-school-portal.md)) |
| Logs contain names or secrets | Unlikely; moderate harm | Allow-list logging, checked by a canary test (PRV-10) |

---

## 7. Retention and deletion

| Data | Kept | Then | How |
|---|---|---|---|
| An enrolled pupil's data | While the pupil is enrolled and the licence is live | — | — |
| An archived pupil (left the school) | 90 days after archiving (PRV-Q3) | Deleted, with their Cognito user | TTL and a deletion job |
| A school's data after its licence ends | 90 days, read-only, for export (PQ-15) | Deleted: pupils, classes, staff, game data, Cognito users | Deletion job, recorded |
| A staff account | Until the person is removed | Cognito user and membership deleted; their audit lines kept | Portal action |
| Audit log | 2 years (PQ-15) | Deleted | TTL |
| Lockout counters and sign-in attempts | 24 hours (PRV-Q9) | Deleted | TTL |
| Invoices and billing records | 6 years (PQ-15) [UNVERIFIED: the accountant confirms the period] | Deleted from our copy; Stripe keeps its own records under its terms | Deletion job |
| Demo requests | 12 months (MKT-Q2) | Deleted | TTL |
| Application logs | 90 days (PRV-Q9) | Expire | Log retention setting |
| Backups | AWS Backup recovery points, plus DynamoDB point-in-time recovery (PITR) | Deleted data leaves the backups when the oldest recovery point expires | The family edition keeps 7 daily points [VERIFIED: AWS Backup daily, 7 points, from the code map]; the platform's PITR period is [UNVERIFIED: check DynamoDB's PITR period options] |

The DPA gives two numbers [PROPOSAL; N and M are set when the jobs are built]:

- deletion from live systems within N days;
- deletion from backups within M days.

---

## 8. Data subject rights

Requests about pupils and staff go to the **school**, as controller. Our part [PROPOSAL]:

- **Tools in the portal** ([06](06-school-portal.md)):
  - export one pupil's data (JSON and CSV);
  - correct a name or a year group;
  - archive a pupil (which stops processing);
  - delete a pupil now;
  - export everything for the school.
- **Requests that reach us** from a parent or a pupil are passed to the school without delay; we do not act on them
  ourselves.
- **Anything the tools can't do** is done within 5 working days of the school asking (PRV-Q2).
- **Billing contacts and demo requests**, where we are the controller, are handled by the owner under our own privacy
  notice (§16).

---

## 9. Breaches

The DfE cloud standard expects a provider that "will share information promptly if there is a data breach" [VERIFIED
S5]. UK GDPR requires a processor to tell the controller without undue delay [UNVERIFIED: check UK GDPR Article 33(2);
the solicitor confirms the DPA wording].

| Step | What [PROPOSAL] |
|---|---|
| Detect | Alarms on errors, unusual sign-in failures, access-check refusals and webhook failures ([02](02-environments-and-delivery.md)); reports from schools |
| Contain | Shut off the affected access: revoke sessions, rotate keys, pause a school if needed |
| Assess | What data, which schools, how many people, likely harm; recorded in a breach log |
| Tell schools | Email each affected school's Admins within PRV-Q1's limit after we confirm a breach: what happened, what data, what we have done, what they may need to do |
| Our own data | For billing contacts or demo requests, the owner decides whether to report to the ICO [UNVERIFIED: check the ICO's breach-reporting guidance for the 72-hour rule] |
| Learn | A short note to affected schools; fixes tracked in Jira |

A runbook in `docs/runbooks/` and a yearly tabletop exercise put this into practice (PRV-7).

---

## 10. Security controls

| Control | How [PROPOSAL unless marked] | Evidence |
|---|---|---|
| Staff MFA | Required for email-and-password accounts (TOTP or an email code). For Microsoft or Google sign-in, Cognito "delegates all authentication processes to the IdP and doesn't offer them additional authentication factors" [VERIFIED S16], so schools are asked to require MFA in their own accounts | DfE cyber standard: "MFA must be enabled for all" "staff accounts with access to cloud services or remote access to on-site systems" [VERIFIED S4] |
| Owner MFA | TOTP required, as for operators today [VERIFIED infrastructure/modules/cognito_pool/main.tf:78-88] | A console sign-in test |
| Pupil sign-in | Picture or typed passwords. The DfE allows pupils "other means of logging on, other than passwords – for example, using a PIN code" [VERIFIED S4] | [07](07-pupil-experience.md) |
| Guessing limits | Limits per pupil and per class, inside the DfE example of "no more than 10 guesses in 5 minutes" [VERIFIED S4]; the teacher can unlock | Tests (PRV-9) |
| Keeping schools apart | On every request, one module checks that the school in the address matches the school in the token and the school that owns the record | A route × role test suite; the penetration test |
| Least privilege | One IAM role per function. Functions that touch school data never touch content, and the other way round, as today (admin-api never touches `game`) [VERIFIED, from the code map] | IAM review; deny tests |
| Encryption | TLS 1.2 or later at CloudFront [VERIFIED static_site module: TLS 1.2 (2021 policy)]; storage encrypted at rest [ASSUMPTION: AWS-managed encryption on DynamoDB and S3]; pupils' sign-in secrets under a customer-managed KMS key ([02](02-environments-and-delivery.md)) | Terraform |
| Secrets | Secrets Manager. The owner sets the values; Claude never reads them (CLAUDE.md) | — |
| Logging | Allow-listed fields only: no pupil names, no secrets, no tokens; opaque IDs only. The family edition's API access log already lists its fields and includes `sub` [VERIFIED, from the code map] | A canary test (PRV-10) |
| Browser policy | An **enforced** Content Security Policy on every platform site, with a separate policy for each app (pupil app, portal, console, marketing site). The family edition ships one shared Report-Only policy [VERIFIED infrastructure/main/main.tf:34-77]; the platform does not copy that. Other security headers as today (HSTS, nosniff, frame DENY, no-referrer) [VERIFIED infrastructure/main/main.tf:79-115] | Header tests (PRV-11) |
| Third-party code | No third-party scripts or fonts in pupils' pages or the portal. Payments happen only on Stripe-hosted pages, so we load no Stripe.js ([09](09-billing.md)) | CSP; a network check |
| Edge protection | AWS WAF with rate-based rules on the school and console distributions (PRV-Q10). Terraform has no WAF today [VERIFIED, from the code map] | Terraform |
| Backups | PITR and AWS Backup on every platform table; a restore drill each term | The drill record (PRV-20) |
| Dependencies | Lockfiles, CI checks, automated pull requests for updates | CI |
| Testing | An independent penetration test before Launch, then yearly (PRV-Q6) | A summary letter in the assurance pack |
| Certification | **Cyber Essentials** for the company before Launch (PRV-Q5). The DfE tells schools to ask whether a supplier "holds security certifications" [VERIFIED S6] | The certificate |
| Cloud principles | A self-assessment against the NCSC cloud security principles, which "All systems need to follow" [VERIFIED S5] | A document in the pack |

For context, the DfE's 2024–25 survey found that 72% of primary schools use "multi-factor authentication to access
personal or sensitive operational data and functions" [VERIFIED S10].

---

## 11. DfE standards and our evidence

The DfE publishes 12 digital and technology standards, 6 of them "core"; the pages were last updated on
16 September 2026 [VERIFIED S4]. These are the ones a school applies to us:

| Standard | What it asks of suppliers | Our evidence |
|---|---|---|
| **Cyber security** (core) | MFA for staff cloud accounts; logons other than passwords for pupils allowed; limits on password guessing; "supplier assessments"; checking that new cloud services meet the standard; a GDPR-compliant contract [VERIFIED S4] | §10; the DPA; the security overview; Cyber Essentials; the penetration test summary |
| **Cloud solutions** | Storage in the UK or EU, or lawful transfers; the NCSC principles; prompt information about breaches; on exit, "data transfer in an open standard or neutral format"; a DPIA [VERIFIED S5] | §3 and §9; the NCSC self-assessment; CSV and JSON export; the pre-filled DPIA |
| **Data protection**: the DfE's *procuring edtech* guidance, not one of the 12 standards | Contract terms on security, sub-processors, and deletion and return; processor or joint controller, feature by feature; safeguards for transfers; certifications [VERIFIED S6] | §2, §4 and §5 |
| **Digital accessibility** | Names no WCAG level. Schools ask suppliers about "accessibility statements" and expect accessibility "as part of their design or features" [VERIFIED S7] | §13 |
| **Filtering and monitoring** (core) | The school's own filtering; it notes "your filtering system might not pick up mobile or app content" [VERIFIED S8] | §12 and §14 |

---

## 12. Filtering, monitoring and the domain list

The filtering and monitoring standard covers school-managed devices (including when they are taken off-site),
bring-your-own-device schemes and guests. It asks schools to block ways round filtering, "such as VPNs, proxy services
and end-to-end encryption methods". Staff should be able to report "perceived unreasonable restrictions that affect
teaching and learning" [VERIFIED S8].

KCSIE 2026 says three things here [VERIFIED S9]:

- schools should review their filtering and monitoring "at least once every academic year" (para 173);
- the DfE standards give the detail (para 175);
- "over blocking" must not lead "to unreasonable restrictions" (para 163).

The standard says nothing about allow-lists [UNVERIFIED: no rule found], but a blocked domain stops a lesson. So we
publish a **domain list for school IT** [PROPOSAL; finalised once [03](03-domains-edge-and-email.md) and
[04](04-identity-and-access.md) are settled]:

| Domain | Used by | Why |
|---|---|---|
| `spacecolonydefence.com`, `*.spacecolonydefence.com` | Pupils and staff | The school's own site, the portal, staff sign-in (`login.`), the marketing site |
| `cognito-idp.eu-west-2.amazonaws.com` | Staff, and pupils if their browsers call Cognito directly | Sign-in and token refresh |
| The platform's audio bucket host, e.g. `<bucket>.s3.eu-west-2.amazonaws.com` | Pupils | Speech clips, fetched through short-lived links as in the family edition today [VERIFIED, from the code map] |
| Stripe's hosted pages: the hosted invoice page, the customer portal, Checkout for Direct Debit mandates | Billing admins only | Paying invoices ([09](09-billing.md)). The exact hostnames are [UNVERIFIED: check Stripe's published domain list] |
| `login.microsoftonline.com`, `accounts.google.com` | Staff who sign in with Microsoft or Google (Launch) | Already reachable in schools that use them [ASSUMPTION] |

Before the first lesson, the pilot school's IT tests the list from a filtered classroom device (PRV-17).

---

## 13. Accessibility

The Public Sector Bodies Accessibility Regulations 2018 exclude "schools or nurseries, except for the content of their
websites or mobile applications relating to essential online administrative functions" [VERIFIED S11]. GOV.UK
describes schools as partly exempt, "except for the content people need in order to use their services". It names WCAG
2.2 AA as the standard, and adds that "Even if you're exempt … you're still legally required to make reasonable
adjustments" under the Equality Act 2010 [VERIFIED S12]. Whether software a school buys counts as the school's own
website or app is [UNVERIFIED: no source settles it; the solicitor advises].

Either way, we do the following [PROPOSAL]:

- **Target WCAG 2.2 AA** for the pupil app, the portal and the marketing site (rule R10, [01](01-product-and-roles.md)).
  The family edition already runs an automated axe check in its keyboard end-to-end test [VERIFIED
  e2e/local/keyboard.spec.ts].
- **Commission an independent accessibility audit before Launch**, and publish an **accessibility statement** listing
  known gaps. The DfE tells schools to ask for one [VERIFIED S7].
- **State the game's limits plainly**: the timed tower-defence play itself; how keyboard, switch and reduced-motion
  users are supported; speech for children who can't read yet.

---

## 14. Safeguarding

[PROPOSAL; these follow rules R3 and R4 in [01](01-product-and-roles.md)]

- **No contact.** No messages between pupils, or between pupils and anyone else.
- **Nothing public.** No public profiles, and nothing a pupil makes is visible to other pupils.
- **Nothing outside.** No external links in the pupil app, no adverts, no trackers.
- **No generative AI** for pupils or staff (PD-11).
- **Names stay small.** A pupil's name appears only as first name and initial: to their own class on the class sign-in
  page (while it is open), and to their school's staff.
- **Typed answers** are checked against the expected answer and shown to no one else.
- **Owner access.** The owner reaches a school's data only through support access the school grants and can see. At
  the pilot school, where the owner is also a parent, the safeguards in
  [12 §9](12-marketing-and-sales.md#9-the-pilot) also apply.
- **The school's duties.** Vetting staff and supervising pupils remain the school's job [ASSUMPTION]. We give schools
  a way to report a concern about the platform (§15).

---

## 15. Support and incidents

| Item | Proposal |
|---|---|
| Support channel | A support email address on the brand domain, answered by the owner |
| Hours | School days, 08:00–16:00 UK time (PRV-Q2), since the owner works part-time at first (PD-16) |
| Response times | The same school day when pupils can't sign in or play; 2 working days otherwise (PRV-Q2) |
| Status page | Hosted outside the platform's AWS accounts so it stays up when the platform is down; linked from the portal and the marketing site (PRV-Q7) |
| Incidents | The Admins of affected schools are emailed when an incident starts and when it ends, and get a short note afterwards |
| Releases | Outside school hours where possible ([02](02-environments-and-delivery.md)) |
| Self-service first | Teachers reset pupils' sign-in, unlock them and reissue cards themselves ([06](06-school-portal.md)) |

---

## 16. Legal documents

The **solicitor** drafts or checks all of these; the **accountant** settles how long financial records are kept.

| Document | For | When |
|---|---|---|
| Terms of service for schools | Schools. The first Admin accepts them in the portal and the version is recorded | Pilot (pilot terms), Launch (full terms) |
| Data processing agreement (§4) | Schools | Pilot: signed before any pupil signs in |
| Privacy notice template for parents | Schools hand it to parents. It describes our processing as the school's processor | Pilot |
| Our own privacy notice | Billing contacts, demo requests, website visitors | Launch (in the Pilot, billing contacts are covered by email) |
| Sub-processor list | A public page with change alerts | Launch |
| Accessibility statement (§13) | Public | Launch |
| Security overview (§10) | DPOs and IT staff; may be shared under an NDA | Launch |
| Cookie statement | The marketing site: strictly necessary cookies only, no trackers [UNVERIFIED: the solicitor confirms no consent banner is needed] | Launch |

---

## 17. The assurance pack

One download from the marketing site ([12](12-marketing-and-sales.md)), also sent to each school's DPO when the school
is enrolled [PROPOSAL]. It contains:

1. The DPA and the role table (§2, §4).
2. The sub-processor list (§5).
3. The pre-filled DPIA (§6) and the data map (§3).
4. The retention schedule (§7) and how rights requests work (§8).
5. A summary of the breach procedure (§9).
6. The security overview: the controls (§10), the NCSC self-assessment, the Cyber Essentials certificate and the
   penetration test summary.
7. The DfE standards table (§11).
8. The domain list for IT (§12).
9. The accessibility statement (§13).
10. The support and incident terms (§15).

---

## 18. Sources

All checked 2026-11-21.

| Key | Source |
|---|---|
| S1 | ICO, *The Children's code and education technologies (edtech)*, page last updated 30 May 2023: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/the-children-s-code-and-education-technologies-edtech/ |
| S2 | ICO, *Edtech examined: key findings from our audits*, 24 June 2026: https://ico.org.uk/media2/13yfm55z/edtech-examined-key-findings-from-our-audits.pdf |
| S3 | ICO, what needs to be included in a controller–processor contract: https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/contracts-and-liabilities-between-controllers-and-processors-multi/what-needs-to-be-included-in-the-contract/ |
| S4 | DfE, cyber security core standard (standards pages updated 16 September 2026): https://www.gov.uk/guidance/meeting-digital-and-technology-standards-in-schools-and-colleges/cyber-security-core-standard |
| S5 | DfE, cloud solutions standard: https://www.gov.uk/guidance/meeting-digital-and-technology-standards-in-schools-and-colleges/cloud-solutions |
| S6 | DfE, *Data protection in schools: procuring edtech*, updated 13 November 2026: https://www.gov.uk/guidance/data-protection-in-schools/procuring-educational-technology-edtech |
| S7 | DfE, digital accessibility standard: https://www.gov.uk/guidance/meeting-digital-and-technology-standards-in-schools-and-colleges/digital-accessibility |
| S8 | DfE, filtering and monitoring core standard: https://www.gov.uk/guidance/meeting-digital-and-technology-standards-in-schools-and-colleges/filtering-and-monitoring-core-standard |
| S9 | DfE, *Keeping children safe in education 2026*: https://assets.publishing.service.gov.uk/media/6afb3830ba92e447920a6559/Keeping_children_safe_in_education_2026.pdf |
| S10 | DfE, *Technology in schools survey 2024 to 2025*, Table 6.6: https://assets.publishing.service.gov.uk/media/692834a6ce50d215cae9610e/Technology_in_schools_survey_2024_to_2025_research_report.pdf |
| S11 | Public Sector Bodies Accessibility Regulations 2018, regulation 4: https://www.legislation.gov.uk/uksi/2018/952/regulation/4 |
| S12 | GOV.UK guidance on accessibility requirements for public sector websites and apps: https://www.gov.uk/guidance/accessibility-requirements-for-public-sector-websites-and-apps |
| S13 | Stripe, data processing agreement, last updated 28 September 2026: https://stripe.com/gb/legal/dpa |
| S14 | Stripe, data transfer terms: https://stripe.com/gb/legal/dta |
| S15 | Stripe, list of service providers (sub-processors), updated 27 September 2026: https://stripe.com/legal/service-providers |
| S16 | AWS, Cognito user pool MFA: https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html |

---

## 19. Decisions for the owner

| ID | Proposal |
|---|---|
| PRV-Q1 | Tell affected schools within **24 hours** of confirming a breach |
| PRV-Q2 | Support on school days, 08:00–16:00 UK time. Reply the same school day when pupils can't sign in or play, 2 working days otherwise, and 5 working days for rights requests the tools can't handle |
| PRV-Q3 | Delete archived pupils **90 days** after archiving, the same window as a school leaving (PQ-15) |
| PRV-Q4 | Write our own DPIA before the pilot, and pre-fill the schools' DPIA from it |
| PRV-Q5 | **Cyber Essentials** before Launch; Cyber Essentials Plus later if schools or trusts ask for it |
| PRV-Q6 | An independent penetration test before Launch, then yearly and after major changes |
| PRV-Q7 | A status page hosted outside the platform's AWS accounts |
| PRV-Q8 | **30 days'** notice of sub-processor changes, with a right to object |
| PRV-Q9 | Keep application logs for 90 days and lockout counters for 24 hours |
| PRV-Q10 | AWS WAF with rate-based rules on the school and console distributions |

---

## 20. User stories

*Snapshot of 2026-11-21. The source of truth for these stories is now Jira (project SCD); see
[README §6](README.md#6-user-stories-and-jira). Edit the tickets, not this table.*

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| PRV-1 | As a school's DPO, I want a DPA that meets Article 28, so that our contract with the supplier is lawful | Has every ICO Article 28 element and the annex commitments (§4); drafted by the solicitor; signed by the pilot school before any pupil signs in | Pilot |
| PRV-2 | As a DPO, I want a pre-filled DPIA, so that I can assess the platform quickly | Covers the processing, necessity, the risks and mitigations in §6, sub-processors, retention and rights; completed by the pilot school's DPO before the first lesson | Pilot |
| PRV-3 | As the owner, I want our own DPIA, so that our controller processing and the design are assessed | Written before the pilot; reviewed whenever a release changes how data is used; stored with the legal documents | Pilot |
| PRV-4 | As a DPO, I want a published sub-processor list with change alerts, so that I can object to changes | A public page lists §5; subscribers get 30 days' notice of changes; it links to Stripe's list | Launch |
| PRV-5 | As a school, I want data deleted on schedule, so that nothing is kept longer than agreed | Archived pupils deleted after 90 days; a school's data deleted 90 days after its licence ends; audit entries deleted after 2 years; each deletion recorded; tests show the Cognito user and every item are gone | Launch |
| PRV-6 | As a school Admin, I want to export, correct and delete a pupil's data, so that I can answer rights requests | The export (JSON and CSV) holds every item about the pupil; corrections and deletions take effect at once; deletion also removes the Cognito user | Launch |
| PRV-7 | As the owner, I want a breach runbook, so that schools hear about a breach promptly | A runbook in `docs/runbooks/` covers §9; each school's Admin contacts come from the portal; a tabletop exercise is recorded | Pilot |
| PRV-8 | As a DPO, I want staff MFA enforced, so that the platform meets the DfE cyber standard | A staff account using email and password cannot reach the portal without MFA; staff cannot switch MFA off | Pilot |
| PRV-9 | As a DPO, I want limits on guessing pupils' passwords, so that picture passwords are safe enough | Limits per pupil and per class stop more than 10 guesses in 5 minutes; teacher unlock works; both are tested | Pilot |
| PRV-10 | As the owner, I want logs free of pupil names, secrets and tokens, so that logs can't leak them | Every function logs only allow-listed fields; an automated test signs in a canary pupil, then finds the canary's name and secret in no log group | Pilot |
| PRV-11 | As a DPO, I want an enforced CSP and no third-party scripts, so that pupils' pages can't load outside code | Every platform site sends an enforced CSP, not Report-Only; the pupil and portal policies allow only our own origins and the listed AWS endpoints; a test checks the headers | Pilot |
| PRV-12 | As a DPO, I want evidence that schools are kept apart, so that I can trust the isolation | CI produces a report of the route × role × school isolation tests ([10](10-data-and-api.md)); all pass; the report goes in the assurance pack | Pilot |
| PRV-13 | As a DPO, I want an independent penetration test, so that the security claims are checked | Done before Launch; high and medium findings fixed, or accepted by the owner in writing; the summary letter is in the pack | Launch |
| PRV-14 | As a school buyer, I want the supplier to hold Cyber Essentials, so that procurement can tick it off | The certificate is issued to the company and is in the pack | Launch |
| PRV-15 | As a school's IT lead, I want an NCSC cloud principles self-assessment, so that I can check the cloud standard | Covers every principle, with links to evidence | Launch |
| PRV-16 | As a school, I want the pupil app and the portal audited against WCAG 2.2 AA, so that every pupil and member of staff can use them | An independent audit is done; issues are fixed or listed in a published accessibility statement | Launch |
| PRV-17 | As a school's IT lead, I want a domain list, so that our filtering doesn't block lessons | The list is published (§12); a filtered classroom device at the pilot school reaches every listed domain before the first lesson | Pilot |
| PRV-18 | As a school, I want a status page and incident emails, so that I know when something is wrong | The status page is hosted outside the platform's accounts; affected schools' Admins are emailed when an incident starts and ends | Launch |
| PRV-19 | As a DPO, I want support access audited and visible, so that the supplier can't look at data unseen | Support access works only after the school grants it, and expires; every action is audited and shown in the school's audit log ([04](04-identity-and-access.md)) | Pilot |
| PRV-20 | As the owner, I want a restore drill each term, so that the backups are proven | The drill restores a platform table into a new table, checks it, and records the result in `docs/validation/` | Launch |
| PRV-21 | As a school, I want a privacy notice template for parents, so that families know how pupils' data is used | Checked by the solicitor; describes our processing; given to the pilot school | Pilot |
| PRV-22 | As the owner, I want the terms accepted in the portal, so that every school is on the current terms | The first Admin must accept before setup continues; the version, the person and the time are recorded; a new version asks for acceptance again | Launch |
| PRV-23 | As a DPO, I want proof that AI providers never see school data, so that the AI rule holds | The IAM roles of functions that call AI have no access to school tables; a test that tries it gets AccessDenied | Pilot |
| PRV-24 | As the owner, I want to review the platform against the ICO's edtech code once it is published, so that we stay compliant | The review is recorded; any gaps become Jira stories | Later |
