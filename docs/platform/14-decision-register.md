# 14. Decision register

Status: PS0 ([SCD-299](https://cumulus-consulting.atlassian.net/browse/SCD-299)), 2026-11-22, for the owner's review at
the PS0 gate ([13 §8](13-delivery-plan.md#8-gate-log)).

Every open decision in the platform scope, in one place: the proposals PQ-1 to PQ-15
([README §3.2](README.md#32-proposed-for-the-owner-to-confirm)), each layer document's "Decisions for the owner" table,
the delivery plan's own ([13 §5](13-delivery-plan.md#5-decisions-still-open)), and the owner's new decisions
during PS0 (§14). The full question and its reasoning
stay in the source document. This register gives each one's release, the recommendation in brief and its state.

**How to answer.** Approving the PS0 gate accepts every row marked **Accept**, as recommended. To change one, name its
ID and what you want instead. Rows marked **Open** need something first (a figure, the accountant, the solicitor, a
spike, or your choice); each says what settles it and when it is needed.

| State | Meaning |
|---|---|
| **Confirmed** | The owner has answered (date given) |
| **Accept** | The recommendation, accepted when the PS0 gate is approved |
| **Open** | Not answered yet; the row says what settles it and by when |

**Release** is the first release whose work depends on the answer: Pilot (phases PS2 to PS12), Launch or Later. When
unsure, the earlier one.

**Four conflicts** between documents, settled here (each row says so): a deleted school's slug (CON-Q2, DAT-Q8); notice
of a price change (CON-Q7, BIL-Q12); how the pilot is free (PQ-13, MKT-Q9, PLAN-Q3); and when the WAF arrives (DNS-Q3,
DAT-Q6, PRV-Q10). The job list in PLAN-Q4 also names retention deletions, which DAT-Q4 does with DynamoDB TTL instead.

---

## 1. Totals

| State | Pilot | Launch | Later | All |
|---|---|---|---|---|
| Confirmed | 7 | 2 | 1 | 10 |
| Accept | 82 | 27 | 3 | 112 |
| Open | 1 | 9 | 2 | 12 |
| **All** | 90 | 38 | 6 | **134** |

The one Pilot item still open is LRN-Q8, the AI provider for question drafting, needed before PS9.

## 2. Proposals ([README §3.2](README.md#32-proposed-for-the-owner-to-confirm))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| PQ-1 | The staff portal is at `/staff` on the school's address; pupils use `/` | Pilot | Accept | [0049](../decisions/0049-domains-dns-and-edge.md) |
| PQ-2 | A school's address comes from a slug the owner chooses at enrolment, checked against a reserved list | Pilot | Accept | [0046](../decisions/0046-tenancy-model.md) |
| PQ-3 | The zone stays in the DNS account; a narrow cross-account role for the prod pipeline; `dev.` delegated to sca-dev | Pilot | Confirmed 2026-11-22 (DNS-Q1) | [0049](../decisions/0049-domains-dns-and-edge.md) |
| PQ-4 | A separate Terraform root, `infrastructure/platform`, reusing the modules (built in PS1) | Pilot | Accept | [0050](../decisions/0050-platform-terraform-root.md) |
| PQ-5 | Content is authored in prod's console; dev gets it by export and import | Pilot | Accept | — |
| PQ-6 | Three user pools per environment (operators, staff, pupils); pupils sign in through our API | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md), [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| PQ-7 | Microsoft and Google sign-in through federation app clients of up to 100 school callback URLs each | Launch | Open: the federation spike (AUTH-20) | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| PQ-8 | Roles are checked in our API on every request, from a permission table; no Cognito groups for school roles | Pilot | Accept | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| PQ-9 | A pupil record: first name, last initial, year group, class, optional school reference; no birth date, email or photo | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| PQ-10 | "Remove from class" leaves a pupil enrolled but unassigned; only Admins un-enrol | Pilot | Accept | — |
| PQ-11 | A class code works only while class sign-in is open; QR cards work any time | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| PQ-12 | Stripe: one subscription per school, billed on 1 September, 1 January and 1 May, quantity = enrolled pupils | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| PQ-13 | New schools are free until the next billing date (at least 30 days). The pilot itself is "Not billed" (PLAN-Q3); a 100% discount applies only if the pilot school stays on once billing exists | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| PQ-14 | Overdue invoices bring reminders and banners; suspension is only ever the owner's decision | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| PQ-15 | Retention: pupil data deleted 90 days after a licence ends; audit records 2 years; invoices 6 years | Pilot | Accept | — |

## 3. Domains, edge and email ([03 §10](03-domains-edge-and-email.md#10-decisions-for-the-owner))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| DNS-Q1 | A cross-account role limited to the zone, plus a delegated dev zone | Pilot | Confirmed 2026-11-22 | [0049](../decisions/0049-domains-dns-and-edge.md) |
| DNS-Q2 | The owner may rename a school's slug; the old address redirects for 12 months | Pilot | Accept | [0046](../decisions/0046-tenancy-model.md) |
| DNS-Q3 | AWS WAF on the school distribution, with a rate rule on pupil sign-in. Not in the Pilot, which relies on the throttles in code (DAT-Q6) | Launch | Open: decide with the cost estimate, before Launch | — |
| DNS-Q4 | `support@`, `privacy@` and `billing@` go to the company's existing mailbox provider (OWN-10) | Pilot | Accept | — |
| DNS-Q5 | A small hosted status page at `status.`, not built by us | Launch | Accept | — |

## 4. Identity and access ([04 §11](04-identity-and-access.md#11-decisions-for-the-owner))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| AUTH-Q1 | Pilot staff sign-in on our own screens at the school's address, one `staff-web` client | Pilot | Accept | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| AUTH-Q2 | Federation wiring: option A after the spike, B as the fallback | Launch | Open: the federation spike (AUTH-20) | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| AUTH-Q3 | Staff MFA by authenticator app (TOTP) or email code; no SMS; passkeys Later | Pilot | Accept | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| AUTH-Q4 | The pupil pool on the Cognito Essentials plan (Lite only if the cost per active user matters) | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| AUTH-Q5 | Picture password: 3 of 9 pictures in order, no repeats, fixed positions; a typed password is a word plus 2 digits | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| AUTH-Q6 | The lockout numbers in §6.4 | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| AUTH-Q7 | Teachers can view pupils' secrets (an encrypted copy, every view audited), not only reset them | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| AUTH-Q8 | Tokens: staff 30 min / 12 h / 60 min idle; pupils 60 min / 12 h / 20 min idle | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md), [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| AUTH-Q9 | Support access is granted by the school: 24 hours by default, 7 days at most | Pilot | Accept | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| AUTH-Q10 | An origin-verify header between CloudFront and the API | Pilot | Accept | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| AUTH-Q11 | Federated sign-in needs an invitation first; no joining by email domain | Launch | Accept | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |

## 5. Platform console ([05 §14](05-platform-console.md#14-decisions-for-the-owner))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| CON-Q1 | GIAS loaded daily from its CSV into a compact lookup file; never head teachers' names or phone numbers | Pilot | Accept | — |
| CON-Q2 | Slugs: 3–30 characters, letters, digits and hyphens, a letter first, the reserved list. A deleted school's slug is never reused (DAT-Q8), replacing "held for 12 months" | Pilot | Accept | [0046](../decisions/0046-tenancy-model.md) |
| CON-Q3 | A school moves from Pending to Trial only when its first Admin accepts the terms and DPA | Pilot | Accept | — |
| CON-Q4 | The owner sees staff names and emails, never pupils' or classes' outside support access | Pilot | Accept | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| CON-Q5 | Support access needs the school's grant; without it only for an incident or legal duty, read-only, school told | Pilot | Accept | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| CON-Q6 | A lost last Admin is replaced only after calling the school back on its public GIAS number | Pilot | Accept | — |
| CON-Q7 | Price changes take effect on a billing date after one full billing period's notice (BIL-Q12), which always meets this row's 60 days | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| CON-Q8 | The console's trusted-browser window is 12 hours, not ADR-0042's 30 days | Pilot | Accept | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| CON-Q9 | Preview versions go to tester schools (the demo school, and the pilot school if it agrees) | Pilot | Accept | — |
| CON-Q10 | AI question drafting: up to 10 drafts a request, daily and monthly caps, never published automatically | Pilot | Accept | — |
| CON-Q11 | Ended schools are deleted 90 days after ending (PQ-15) unless the owner places a hold, with a reason | Pilot | Accept | — |
| CON-Q12 | Announcements reach pupils only for platform-wide outages | Pilot | Accept | — |

## 6. School portal ([06 §17](06-school-portal.md#17-decisions-for-the-owner))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| SCH-Q1 | CSV files are read in the browser; only first name, last initial, year group, class and reference are sent | Pilot | Accept | — |
| SCH-Q2 | CSV limits: 1 MB; 60 rows for Teachers, 500 for Admins; classes of up to 60 pupils | Pilot | Accept | — |
| SCH-Q3 | UPN and any column we don't recognise is ignored and never sent | Pilot | Accept | — |
| SCH-Q4 | Teachers are told enrolling adds to the bill, without prices; Admins see the estimate | Launch | Accept | — |
| SCH-Q5 | Un-enrolled pupils' data is deleted after 90 days and can be restored until then; Admins can delete at once | Pilot | Accept | — |
| SCH-Q6 | A new six-consonant class code each time class sign-in opens | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| SCH-Q7 | Admins and the class's Teacher can show a pupil's password for 30 seconds; every showing is audited | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| SCH-Q8 | With home play off, QR cards work only within the school's hours | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| SCH-Q9 | Removed staff stay in the audit log, with name and email, for 2 years | Pilot | Accept | — |
| SCH-Q10 | Staff invitations expire after 7 days | Pilot | Accept | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |
| SCH-Q11 | The new-year wizard un-enrols Year 4 leavers when confirmed, before the September invoice | Launch | Accept | — |
| SCH-Q12 | After a new terms or DPA version takes effect, Admins accept it before continuing; other staff are not stopped | Pilot | Accept | — |
| SCH-Q13 | Pause stops new games at once and running games within about a minute; signing in still works | Pilot | Accept | — |
| SCH-Q14 | Read-only staff see the staff list (names and roles), not emails or staff actions | Pilot | Accept | [0048](../decisions/0048-staff-sign-in-and-access-control.md) |

## 7. Pupil experience ([07 §16](07-pupil-experience.md#16-decisions-for-the-owner))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| PUP-Q1 | Picture password as AUTH-Q5: three of nine pictures in order, no repeats, a fixed grid | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| PUP-Q2 | 5 wrong in a row: a 5-minute wait; 10 wrong in 24 hours: the teacher unlocks | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| PUP-Q3 | Class sign-in stays open 60 minutes by default; the teacher can close or extend it | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| PUP-Q4 | Idle sign-out after 20 minutes; class sign-in in `sessionStorage`; QR sign-in at home kept up to 12 hours | Pilot | Accept | [0047](../decisions/0047-pupil-identity-and-sign-in.md) |
| PUP-Q5 | Phones work but are not a design target | Pilot | Accept | — |
| PUP-Q6 | A class pause takes effect within 60 seconds, through the lease renewal | Pilot | Accept | — |
| PUP-Q7 | Pupils cannot reset their own progress; teachers can | Pilot | Accept | — |
| PUP-Q8 | Avatars come from the published aliens; a pupil can change theirs at any time | Pilot | Accept | — |

## 8. Learning content ([08 §11](08-learning-content.md#11-decisions-for-the-owner))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| LRN-Q1 | Content level is the school year (1–4), with the family edition's ages mapped to years | Pilot | Accept | — |
| LRN-Q2 | Each activity has a difficulty step from 1 to 3 within its year | Pilot | Accept | — |
| LRN-Q3 | The owner publishes topic sets per year; a teacher picks a set or 1–5 topics, plus an optional map, end date and timer | Pilot | Accept | — |
| LRN-Q4 | The school campaign runs plan slots in blocks of 10 waves | Pilot | Accept | — |
| LRN-Q5 | 70% this week's work, 30% review favouring topics still being practised | Pilot | Accept | — |
| LRN-Q6 | No FIXED activity repeats for a pupil within 14 days, across runs | Pilot | Accept | — |
| LRN-Q7 | The Secure, Practising and "needs help" rules as written | Pilot | Accept | — |
| LRN-Q8 | Which AI drafts questions in the console. Reuse the existing OpenAI integration (`picture_gen`'s pattern, an EU endpoint), or Claude on Amazon Bedrock, which keeps traffic inside AWS [UNVERIFIED: model availability in `eu-west-2` or an EU inference profile]. Neither receives pupil data ([11](11-privacy-security-and-assurance.md)). No recommendation: Claude, which writes these documents, is one of the options | Pilot | Open: the owner's choice, before PS9 | — |
| LRN-Q9 | No item statistics across schools unless the DPA permits them | Launch | Open: the solicitor (OWN-6); none until then | — |
| LRN-Q10 | Statutory-check practice: "real or alien word", hear-and-choose; times tables with an optional 6-second timer, off by default | Pilot | Accept | — |
| LRN-Q11 | Out of scope: comprehension beyond single sentences, composition, handwriting, spoken language | Pilot | Accept | — |
| LRN-Q12 | A topic is offered to teachers only once it has enough content (§9) | Pilot | Accept | — |
| LRN-Q13 | Versioned curriculum references, with both NC14 and NC28 references through 2027–28 | Pilot | Accept | — |

## 9. Billing ([09 §18](09-billing.md#18-decisions-for-the-owner))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| BIL-Q1 | The price per pupil (P), the minimum (M), and a lower minimum for very small schools | Launch | Open: the owner sets the figures (OWN-14, by PS13), after looking at what schools pay for similar products | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q2 | Payment terms: 30 days from issue | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q3 | A school enrolled under 30 days before a billing date: a 30-day trial, then a part-period invoice | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q4 | No credit for pupils who leave mid-period; they drop off the next invoice | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q5 | Reinstatement after suspension is automatic once nothing is past due; the owner is told | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q6 | VAT: a manual 20% rate, not Stripe Tax, once registration is confirmed | Launch | Open: the accountant (OWN-6) | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q7 | No yearly invoice at Launch; later, a yearly price or a prepayment held as credit | Later | Accept | — |
| BIL-Q8 | Refunds only for mistakes; the free trial is the evaluation | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q9 | At most one quantity update per school per minute; a 24-hour draft window before Stripe finalises | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q10 | The overdue timeline in §10.1; suspension reviewed from 45 days | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q11 | EventBridge Scheduler for the timed billing jobs, at Launch | Launch | Confirmed 2026-11-22 (PLAN-Q4) | [0052](../decisions/0052-eventbridge-scheduler-at-launch.md) |
| BIL-Q12 | One full billing period's notice of a price change (also settles CON-Q7) | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q13 | Only Admins can end the licence, before the billing date | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q14 | Stripe sends invoices to one billing email per school; we tell other Billing admins ourselves | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q15 | Pay by Bank later, once Stripe confirms it for invoices | Later | Accept | — |
| BIL-Q16 | A wrong PO on a paid invoice is noted on our record, not reissued | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| BIL-Q17 | Stripe emails come from our domain: `spacecolonydefence.com` verified in Stripe | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |

## 10. Data and API ([10 §9](10-data-and-api.md#9-decisions-for-the-owner))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| DAT-Q1 | A new `tenancy` table with one overloaded GSI (ADR-0004 revisited for this table only); access decisions on base-table reads | Pilot | Accept | [0046](../decisions/0046-tenancy-model.md) |
| DAT-Q2 | School pupils' `game` partitions keyed by pupilId (the Cognito username), not `sub` | Pilot | Accept | [0046](../decisions/0046-tenancy-model.md) |
| DAT-Q3 | Billing routes are served by `billing` itself: the one holder of the Stripe key | Launch | Accept | [0051](../decisions/0051-billing-on-stripe.md) |
| DAT-Q4 | Deletion by DynamoDB TTL, set when a pupil is archived or a school ends; no scheduler needed for it | Pilot | Accept | [0052](../decisions/0052-eventbridge-scheduler-at-launch.md) |
| DAT-Q5 | Whole-school exports as a ZIP in an exports bucket: 7-day expiry, 15-minute links | Pilot | Accept | — |
| DAT-Q6 | The throttles in §3.4, with fairness per pupil and school in code; WAF rules per IP come with DNS-Q3, at Launch | Pilot | Accept | — |
| DAT-Q7 | New routes numbered from R63 in `contracts/routes.json`, each with a `permission` field | Pilot | Accept | — |
| DAT-Q8 | A deleted school's slug is never reused (a tombstone with no school data), so old QR cards can't reach a new school | Pilot | Accept | [0046](../decisions/0046-tenancy-model.md) |
| DAT-Q9 | Archived pupils are deleted 90 days after archiving | Pilot | Accept | — |
| DAT-Q10 | Teachers' own questions stored as school data in `tenancy` | Later | Open: decided when that work starts | — |

## 11. Privacy, security and assurance ([11 §19](11-privacy-security-and-assurance.md#19-decisions-for-the-owner))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| PRV-Q1 | Affected schools are told within 24 hours of a confirmed breach | Pilot | Accept | — |
| PRV-Q2 | Support on school days, 08:00–16:00 UK time, with the reply times in the row | Pilot | Accept | — |
| PRV-Q3 | Archived pupils deleted after 90 days (as DAT-Q9 and PQ-15) | Pilot | Accept | — |
| PRV-Q4 | Our own DPIA before the pilot, used to pre-fill the schools' DPIA | Pilot | Accept | — |
| PRV-Q5 | Cyber Essentials before Launch; Plus later if schools or trusts ask (OWN-12) | Launch | Accept | — |
| PRV-Q6 | An independent penetration test before Launch, then yearly and after major changes (OWN-13) | Launch | Accept | — |
| PRV-Q7 | The status page is hosted outside the platform's AWS accounts (as DNS-Q5) | Launch | Accept | — |
| PRV-Q8 | 30 days' notice of sub-processor changes, with a right to object | Pilot | Accept | — |
| PRV-Q9 | Application logs kept 90 days; lockout counters 24 hours | Pilot | Accept | — |
| PRV-Q10 | AWS WAF with rate rules on the school and console distributions, decided with DNS-Q3 | Launch | Open: with DNS-Q3 | — |

## 12. Marketing and sales ([12 §11](12-marketing-and-sales.md#11-decisions-for-the-owner))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| MKT-Q1 | The prices published on the site | Launch | Open: follows BIL-Q1 | — |
| MKT-Q2 | Demo requests kept for 12 months | Launch | Accept | — |
| MKT-Q3 | The marketing site is static, with its source in `web/marketing/` | Launch | Accept | — |
| MKT-Q4 | Guided demos only at first; no demo logins for prospects | Launch | Accept | — |
| MKT-Q5 | Teachers sign up for trials themselves later, each approved by the owner | Later | Accept | — |
| MKT-Q6 | Search the UK IPO register for "Space Colony Defence" and decide whether to file | Launch | Open: the owner | — |
| MKT-Q7 | Reseller terms, once a reseller is interested | Later | Open: when one is | — |
| MKT-Q8 | The pilot's success measures (§9) | Pilot | Accept | — |
| MKT-Q9 | The pilot runs for one term, free. It is a "Not billed" school (PLAN-Q3), not a 100% coupon, while billing does not exist | Pilot | Accept | [0051](../decisions/0051-billing-on-stripe.md) |

## 13. Delivery plan ([13 §5](13-delivery-plan.md#5-decisions-still-open))

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| PLAN-Q1 | The family edition is frozen and stays separate; whether it ever becomes a tenant is decided after the pilot | Later | Confirmed in part 2026-11-21 | [0045](../decisions/0045-family-edition-frozen.md) |
| PLAN-Q2 | The platform is active now | Pilot | Confirmed 2026-11-21 | [0044](../decisions/0044-branches-family-dev-main.md) |
| PLAN-Q3 | The pilot runs free as a "Not billed" school; billing is built while it runs | Pilot | Confirmed 2026-11-22 | [0051](../decisions/0051-billing-on-stripe.md) |
| PLAN-Q4 | EventBridge Scheduler at Launch; banners and owner-pressed buttons until then | Launch | Confirmed 2026-11-22 | [0052](../decisions/0052-eventbridge-scheduler-at-launch.md) |

## 14. New owner decisions during PS0

The owner's design notes of 2026-11-22, and what follows from them. New stories, all in the Pilot: CON-31 and SCH-40
(the professional look), LRN-26 (curriculum references for every year) and LRN-27 (many more question types). PS9, the
content phase, grows with PD-24 and PD-25; its size is estimated again when it starts.

| ID | Decision in brief | Release | State | ADR |
|---|---|---|---|---|
| PD-23 | The console and the staff portal look like professional SaaS software, in the same brand but without the pupils' fonts; the game keeps its look | Pilot | Confirmed 2026-11-22 | [0053](../decisions/0053-professional-look-for-staff-and-console.md) |
| PD-24 | Many more question types, generated with AI from the owner's console (drafts the owner reviews) | Pilot | Confirmed 2026-11-22 | — |
| PD-25 | Every year, 1 to 4, aligned to the national curriculum | Pilot | Confirmed 2026-11-22 | — |
| PS0-1 | The professional look's font is Inter, bundled and served from our own domain; each look is a set of design tokens | Pilot | Accept | [0053](../decisions/0053-professional-look-for-staff-and-console.md) |
| PS0-2 | Move LRN-17, LRN-18 and LRN-19 (AI drafting, its review, no pupil data to AI) from Launch to the Pilot, matching PS9 and PD-24 | Pilot | Accept | — |
| PS0-3 | Move LRN-11 (Year 3 and 4 maths topics) from Launch to the Pilot, so the pilot's Years 3 and 4 have aligned maths (PD-25) | Pilot | Accept | — |
