# 09. Billing

Part of the [platform scope](README.md). Status: scope, parked.

---

## 1. Summary

Every paying school is a Stripe **customer** with one **subscription**. The subscription charges `P` (the price per
pupil per term) times `Q`, where `Q = max(N, M)`: `N` is the number of enrolled pupils and `M` the plan's minimum.
Stripe makes an invoice on each **billing date** (1 September, 1 January, 1 May), in advance for the four months that
follow, and emails it to the school. Schools pay on Stripe's hosted invoice page by bank transfer (to an account number
unique to the school) or card, or by Direct Debit once they have set up a mandate. A purchase order (PO) number can be
given before the invoice is made, and a school that needs one can have its invoice held until it arrives. Our `billing`
function keeps the subscription's quantity in step with enrolments and checks every draft invoice the moment Stripe
creates it, so each invoice counts the pupils enrolled at that moment. Overdue invoices bring Stripe reminders and
banners for the school's billing people; only the owner can suspend a school. No pupil data goes to Stripe.

| Point | Status |
|---|---|
| Per enrolled pupil, termly, in advance, invoiced automatically; counted when the invoice is made; one plan, a price per pupil and a minimum; bank transfer, card and Direct Debit; PO numbers | [CONFIRMED by owner 2026-11-21, PD-12] |
| Billing admins pay through the platform; Admins can too; the owner runs billing in the console | [CONFIRMED by owner 2026-11-21, PD-5, PD-7] |
| Pupils added after an invoice is made are free until the next billing date | [CONFIRMED by owner 2026-11-21, the termly option as asked] |
| Stripe; one subscription per school; a four-monthly cycle on 1 Sep, 1 Jan, 1 May; quantity = `max(N, M)` | [PROPOSAL, PQ-12] |
| Free until the next billing date (at least 30 days); the pilot school gets a 100% coupon for agreed terms | [PROPOSAL, PQ-13] |
| Reminders and banners; suspension only by the owner; suspended pupils can't play, staff can pay and export | [PROPOSAL, PQ-14] |
| Invoices kept 6 years | [PROPOSAL, PQ-15] |

**Release.** The pilot runs without Stripe (§5.4). Everything else here is in the **Launch** release.

---

## 2. Words and sources

### 2.1 Words

| Word | Meaning |
|---|---|
| `P` | Price per pupil per term, excluding VAT. Not yet set (BIL-Q1) |
| `M` | Minimum pupils charged per school per term. Not yet set (BIL-Q1); the owner can set a lower one for a school |
| `N` | Enrolled pupils: in a class or unassigned, not archived (§4) |
| `Q` | Billed quantity, `max(N, M)` |
| Billing date | 1 September, 1 January or 1 May; Stripe makes an invoice on each |
| Billing period | The four months from a billing date: Sep–Dec, Jan–Apr, May–Aug |
| Plan version | `P`, `M` and the Stripe Price behind them (§3) |
| Customer | Stripe's record of a school as a payer: legal name, address, billing email |
| Subscription | Stripe's record of the school's licence: price, quantity, dates, how it pays |
| Invoice states | **draft** (editable), **open** (issued, unpaid), **paid**, **void** (cancelled), **uncollectible** (written off) |
| Draft window | Time between Stripe creating a renewal invoice and finalising it (§6.3) |
| Finalise | Turn a draft into an issued invoice with a number. After this its PO and footer can't change |
| Hosted invoice page | Stripe's web page for one invoice: pay it, download the PDF |
| Virtual account number | Bank details unique to one school, printed on its invoices; money paid in is matched automatically |
| Mandate | A school's Direct Debit authority, set up once |
| Collection method | `send_invoice` (the school pays each invoice) or `charge_automatically` (Stripe collects by Direct Debit) |
| Credit note | A document that reduces an open or paid invoice |
| Coupon | A discount for a number of billing periods |
| Billing email | The one address Stripe sends a school's invoices to (BIL-Q14) |
| Licence state | Our view of where a school stands (§5.5) |

### 2.2 Sources

All read on 2026-11-21. Cited below as [VERIFIED key].

| Key | Source |
|---|---|
| ST-SUB | https://docs.stripe.com/api/subscriptions/update |
| ST-PRO | https://docs.stripe.com/billing/subscriptions/prorations |
| ST-PRICE | https://docs.stripe.com/api/prices/create |
| ST-CYCLE | https://docs.stripe.com/billing/subscriptions/billing-cycle |
| ST-ANCHOR | https://docs.stripe.com/changelog/endive/2026-09-30/polymorphic-billing-cycle-anchor |
| ST-CHANGE | https://docs.stripe.com/changelog |
| ST-VER | https://docs.stripe.com/api/versioning (current version "2026-11-18.endive") |
| ST-SCHED | https://docs.stripe.com/billing/subscriptions/subscription-schedules |
| ST-METER | https://docs.stripe.com/api/billing/meter/create, https://docs.stripe.com/billing/subscriptions/usage-based/how-it-works |
| ST-USAGE | https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-legacy-usage-based-billing |
| ST-SUBHOOK | https://docs.stripe.com/billing/subscriptions/webhooks |
| ST-EVENTS | https://docs.stripe.com/api/events/types |
| ST-DRAFT | https://docs.stripe.com/billing/invoices/subscription |
| ST-GRACE | https://docs.stripe.com/billing/subscriptions/usage-based/configure-grace-period |
| ST-HOOKS | https://docs.stripe.com/webhooks |
| ST-COLLECT | https://docs.stripe.com/billing/collection-method |
| ST-HOSTED | https://docs.stripe.com/invoicing/hosted-invoice-page |
| ST-EMAIL | https://docs.stripe.com/invoicing/send-email, https://docs.stripe.com/billing/revenue-recovery/customer-emails |
| ST-BACS | https://docs.stripe.com/payments/bacs-debit |
| ST-TRANSFER | https://docs.stripe.com/invoicing/bank-transfer, https://docs.stripe.com/payments/bank-transfers |
| ST-PBB | https://docs.stripe.com/payments/pay-by-bank, https://docs.stripe.com/invoicing/payment-methods |
| ST-PMSUP | https://docs.stripe.com/payments/payment-methods/payment-method-support |
| ST-INV | https://docs.stripe.com/api/invoices/create |
| ST-CUSTOM | https://docs.stripe.com/invoicing/customize, https://docs.stripe.com/invoicing |
| ST-TAXID | https://docs.stripe.com/invoicing/taxes/account-tax-ids, https://docs.stripe.com/invoicing/customer/tax-ids |
| ST-PAY | https://docs.stripe.com/api/invoices/pay |
| ST-TAX | https://docs.stripe.com/tax/supported-countries, https://docs.stripe.com/billing/taxes/tax-rates |
| ST-PORTAL | https://docs.stripe.com/customer-management/configure-portal, https://docs.stripe.com/customer-management/integrate-customer-portal |
| ST-TEST | https://docs.stripe.com/sandboxes, https://docs.stripe.com/testing-use-cases, https://docs.stripe.com/billing/testing/test-clocks/api-advanced-usage |
| ST-KEYS | https://docs.stripe.com/keys |
| ST-FEES | https://stripe.com/gb/pricing, https://stripe.com/gb/billing/pricing, https://stripe.com/gb/pricing/local-payment-methods, https://stripe.com/gb/invoicing/pricing, https://stripe.com/gb/tax/pricing, https://support.stripe.com/questions/stripe-invoicing-pricing |
| ST-DPA | https://stripe.com/gb/legal/dpa, https://stripe.com/gb/legal/dta, https://stripe.com/legal/service-providers |
| UK-FY | https://explore-education-statistics.service.gov.uk/methodology/la-and-school-expenditure; Academy Trust Handbook 2026 §4.3, https://www.gov.uk/government/publications/academy-trust-handbook/academy-trust-handbook-2026-effective-from-1-october-2026 |
| UK-VAT | https://www.gov.uk/guidance/zero-rate-of-vat-for-electronic-publications; https://www.gov.uk/hmrc-internal-manuals/vat-books/vbooks8515; https://www.gov.uk/guidance/vat-on-education-and-vocational-training-notice-70130; *Generic Maths Ltd v HMRC* [2025] UKFTT 460 (TC), https://caselaw.nationalarchives.gov.uk/ukftt/tc/2025/460 |
| UK-S33 | https://www.gov.uk/hmrc-internal-manuals/vat-education-manual/vatedu65750 (maintained schools); https://www.gov.uk/hmrc-internal-manuals/vat-education-manual/vatedu70000 (academies, s.33B) |
| UK-PAY | https://www.legislation.gov.uk/ukpga/2023/54/section/68; https://www.gov.uk/late-commercial-payments-interest-debt-recovery; https://www.gov.uk/guidance/buying-procedures-and-procurement-law-for-schools |
| UK-GIAS | https://get-information-schools.service.gov.uk/Downloads |

---

## 3. The plan catalogue

### 3.1 One plan, kept as versions

The catalogue holds plans, and each plan has versions. A version is `P`, `M`, currency GBP, VAT exclusive, the Stripe
Price behind it, and the date from which new subscriptions use it. At launch there is one plan, "School licence"
[CONFIRMED by owner 2026-11-21, PD-12]. More plans need no code change [PROPOSAL].

### 3.2 How it maps to Stripe [PROPOSAL]

| Ours | Stripe | Settings |
|---|---|---|
| The product | One Product, "Space Colony Defence school licence" | — |
| A plan version | One Price | `unit_amount` = `P` in pence; `currency` gbp; `recurring.interval` month, `interval_count` 4; `usage_type` licensed; `tax_behavior` exclusive. Intervals may be up to three years, so four months is allowed [VERIFIED ST-PRICE] |
| The minimum | Not a Stripe object | We compute `Q = max(N, M)` and send it as the quantity; the invoice memo says when the minimum applied (§6.4) |

**Why per seat, not metered.** Stripe's Billing Meters can take the last value in a period (`last`), but meters
aggregate "at the end of the billing period before generating an invoice", so they bill in arrears [VERIFIED ST-METER].
The owner chose in advance. Stripe's legacy usage records are deprecated anyway [VERIFIED ST-USAGE].

### 3.3 Changing the price [PROPOSAL]

- A new price is a new plan version and a new Stripe Price. Existing Prices are not edited [ASSUMPTION: Stripe Prices
  can't change their amount; check when building].
- Schools are told at least one full billing period ahead (BIL-Q12). Each subscription moves at a billing date with no
  proration, using a subscription schedule phase ("Starting a subscription on a future date"; up to 10 phases)
  [VERIFIED ST-SCHED].
- The owner can keep a school on an older version (a promise made in a sale).

### 3.4 Discounts and special terms [PROPOSAL]

- **Coupons** for a number of billing periods: the pilot school's 100% (PQ-13), early adopters, goodwill
  [ASSUMPTION: Stripe coupons support percent off for a set number of periods; check the coupons docs].
- **A school's own minimum**: the owner can set `M` lower for a very small school; the quantity sync uses it.

---

## 4. Who is counted

| Pupil | Counted in `N`? | Note |
|---|---|---|
| Enrolled, in a class | Yes | |
| Enrolled, unassigned (no class) | Yes | A teacher's "remove from class" leaves the pupil enrolled (PQ-10). The Billing page shows how many, so Admins can tidy up |
| Archived (left the school) | No | From the moment they are archived |
| Deleted | No | |
| In the demo school | Never | The demo school has no Stripe customer (§5.4) |
| In a school on trial | For the estimate only | Nothing is charged until the trial ends |
| In the pilot school before billing launches | No | §5.4 |

Rules:

- `N` is taken **when Stripe makes the invoice** (§6.3) [CONFIRMED by owner 2026-11-21, PD-12]. `Q = max(N, M)`.
- Pupils enrolled after that are free until the next billing date [CONFIRMED by owner 2026-11-21]. Pupils archived
  after it get no refund (BIL-Q4) [PROPOSAL].
- **A snapshot can be gamed**: a school could archive pupils just before a billing date and restore them after. The
  owner accepted the snapshot rule. Mitigation [PROPOSAL]: the terms say the licence covers every pupil who uses the
  platform during the period. The console flags schools whose pupils archived in the 7 days before a billing date are
  restored within 30 days after it, and the owner can raise a one-off invoice.
- **Enrolment limit** ([06](06-school-portal.md)): an Admin can set one. Above it only Admins can enrol. It controls who
  adds to the bill, not the bill itself. Anyone enrolling is told that it adds to the school's bill.
- **What schools see**: the Billing page (§13) shows `N`, the unassigned part of it, `Q`, the next billing date and the
  estimate. Read-only staff and billing-only staff see the counts as numbers only ([01](01-product-and-roles.md)).

---

## 5. The billing calendar

### 5.1 Billing dates and periods [PROPOSAL, PQ-12]

| Billing date | Period covered | Usual school terms in it |
|---|---|---|
| 1 September | 1 Sep – 31 Dec | Autumn term and Christmas holiday |
| 1 January | 1 Jan – 30 Apr | Spring term and Easter holiday |
| 1 May | 1 May – 31 Aug | Most of the summer term and the summer holiday |

Term dates differ between local authorities and trusts [ASSUMPTION], so the periods are calendar thirds of the year,
not terms. A licence covers the holidays, and pupils can play at home.

**Fit with school budgets.** A maintained school's financial year runs April to March; an academy trust's ends on 31
August [VERIFIED UK-FY]. The September and January invoices fall in the same maintained-school year and the May invoice
opens its next one. All three fall in one academy year.

### 5.2 Making Stripe hit those dates

- The Price repeats every four months (§3.2). Each subscription is created with its billing cycle anchor at the next
  billing date, 00:00 UTC (01:00 UK summer time, so still the 1st) [PROPOSAL]. On multi-month subscriptions,
  `billing_cycle_anchor_config` can also set the month of year [VERIFIED ST-CYCLE].
- **Pin the Stripe API version.** Since 2026-09-30.endive the update parameter for the anchor "now requires an object
  with a `type` field" [VERIFIED ST-ANCHOR]. Since 2025-09-30.clover new subscriptions default to "flexible" billing
  mode [VERIFIED ST-CHANGE]. The current version is 2026-11-18.endive [VERIFIED ST-VER].
- Check with a test clock that four-month cycles anchored on 1 September keep landing on the 1st [UNVERIFIED; §16].
- Before the anchor, Stripe would bill a part-period pro rata unless `proration_behavior=none` is set [VERIFIED
  ST-CYCLE]. A trial covers that part-period instead (§5.3).

### 5.3 Joining part-way, and the trial [PROPOSAL, PQ-13]

| A school is enrolled… | Trial ends | First invoice |
|---|---|---|
| 30 days or more before the next billing date | On that billing date | On that billing date, for the full period |
| Fewer than 30 days before it | 30 days after enrolment | BIL-Q3: (a) a part-period invoice for the rest of that period [recommended], or (b) trial extended to the following billing date |

- No card is needed. Invoices are sent, not charged, so at trial end the subscription just starts invoicing
  [ASSUMPTION: `send_invoice` needs no stored payment method; it needs `days_until_due` or `due_date`,
  VERIFIED ST-COLLECT].
- Stripe sends `customer.subscription.trial_will_end` "three days before a subscription's trial period is scheduled to
  end" [VERIFIED ST-EVENTS]. The portal shows a trial banner from 14 days before. Emails need a scheduler (BIL-Q11).
- The owner can extend a trial in the console.
- How Stripe bills the part-period after a trial that ends before the anchor is [UNVERIFIED; test clock, §16].

### 5.4 The pilot school and the demo school [PROPOSAL]

- **Before billing is built**, the pilot school's state is **Not billed**. It has no Stripe customer, and its Billing
  page says the pilot is free until an agreed date.
- **When billing goes live**, the pilot school gets a customer and a subscription with a 100% coupon for the agreed
  periods (PQ-13). Its staff see real £0 invoices before the first charged one [ASSUMPTION: Stripe marks £0 invoices
  paid automatically; check in the sandbox].
- **The demo school** never has a Stripe customer. Its Billing page shows made-up example invoices from the demo
  fixtures ([12](12-marketing-and-sales.md)).

### 5.5 Licence states [PROPOSAL]

| State | Meaning | Stripe | Pupils | Staff |
|---|---|---|---|---|
| Not billed | Pilot before billing, or the demo school | No customer | Play | Everything |
| Trial | Free until the trial ends | Subscription `trialing` | Play | Everything; trial banner for Admins and Billing admins |
| Active | Paid, or within payment terms | `active` | Play | Everything |
| Overdue | An invoice is past its due date | `past_due` | Play | Banner for Admins and Billing admins only |
| Suspended | The owner suspended the school (§10.2) | Usually `past_due` | Can't play | Sign in, pay, export; no other changes |
| Ending | The licence won't renew | `cancel_at_period_end` set | Play | Banner with the end date |
| Ended | The period is over; 90 days to export (PQ-15) | `canceled` | Can't sign in | Admins export; Billing admins see invoices |
| Deleted | School data removed after the 90 days | Customer kept for records | — | — |

Overdue is worked out from invoices. Only the owner sets Suspended.

---

## 6. How an invoice is made

### 6.1 Stripe objects per school [PROPOSAL]

| Object | Holds |
|---|---|
| Customer | The school's legal name as invoiced; invoice address; billing email (BIL-Q14); metadata `schoolId`, `slug`, `urn`; the URN as a customer-level invoice custom field; the school's VAT number as a `gb_vat` tax ID if it has one [VERIFIED ST-TAXID] |
| Subscription | One item: the plan version's Price × `Q`; `collection_method=send_invoice`; `days_until_due=30` (BIL-Q2); VAT as the default tax rate (§9); anchor; trial end; coupon; metadata `schoolId`; the PO in `invoice_settings.custom_fields` when one is given (subscription-level custom fields exist since API 2026-06-24.dahlia [VERIFIED ST-INV]) |
| Invoices | Made by Stripe on each billing date. Also one-off replacements (§8.4) |
| Payment methods | None stored for invoice-paying schools; a Bacs Direct Debit method for Direct Debit schools (§7.2) |

Every write to Stripe carries an idempotency key, e.g. `sub-create:<schoolId>` or `qty:<schoolId>:<Q>:<seq>`, so a
retried call never doubles anything [PROPOSAL].

### 6.2 Keeping the quantity in step

**Why it must be continuous.** For a `send_invoice` subscription, "Stripe doesn't send an `invoice.upcoming` event"
[VERIFIED ST-SUBHOOK]. The first we hear of a renewal is `invoice.created`. So the subscription's quantity is kept
current all the time, and the draft is checked when it appears (§6.3).

Steps [PROPOSAL]:

1. A committed enrolment change updates the school's live count in our table, in the same transaction as the change
   ([10](10-data-and-api.md)). Changes include: a pupil added; a list or CSV import committed; a pupil archived,
   restored or deleted; the school's minimum changed.
2. `school_api` then invokes `billing` asynchronously (Lambda `InvocationType=Event`) with the school ID only. A bulk
   action sends one invoke per batch, not one per pupil.
3. `billing` reads the live count, computes `Q` and compares it with the quantity last sent to Stripe. Equal: stop.
   Different: update the subscription item's quantity with `proration_behavior=none`. Send that **on every update**:
   the setting applies only to its own request ("No parameter turns off all future prorations for a subscription"),
   and the default is `create_prorations` [VERIFIED ST-PRO, ST-SUB]. Forgetting it would bill mid-term additions; a
   test guards it (§16).
4. **Coalescing**: at most one quantity update per school per minute (BIL-Q9). "Updating the quantity on a subscription
   many times in an hour may result in rate limiting" [VERIFIED ST-SUB]. Inside that minute, or after a rate-limit
   answer, `billing` marks the school `quantityDirty` and stops. The next change or the draft check catches up.
5. The console shows, per school, the live `Q` beside the quantity in Stripe (§14).

Not used: `pending_invoice_item_interval`, which bills pending invoice items on a schedule [VERIFIED ST-SUB]. We create
no pending items.

### 6.3 The draft check

A subscription invoice stays a draft "for about an hour", and "during that delay, the invoice is a draft and is
editable" [VERIFIED ST-DRAFT]. The window can be set up to 72 hours [VERIFIED ST-GRACE]. That page sits in Stripe's
usage-based section, so whether the setting covers licensed subscriptions too is [UNVERIFIED; check in the sandbox].
Proposed window: 24 hours (BIL-Q9). If our endpoint doesn't acknowledge `invoice.created`, finalising "is delayed for
up to 72 hours" [VERIFIED ST-DRAFT]. So the check runs **before** we acknowledge: on failure we return 5xx, Stripe
retries, and the invoice waits.

On every `invoice.created` for a subscription invoice, `billing` [PROPOSAL]:

1. Verifies and de-duplicates the event (§12.1); fetches the invoice and the school.
2. Recounts `N` and computes `Q`. This is the count "when the invoice is made" [CONFIRMED by owner, PD-12].
3. If the licence line's quantity differs from `Q`, corrects it. Whether a subscription line's quantity can be edited
   on a draft is [UNVERIFIED; test in the sandbox]. If it can't, adds an adjustment line, `(Q − q) × P`, "Change in
   enrolled pupils since <date>". Either way, updates the subscription to `Q` (no proration) for the future.
4. Sets the memo and the custom fields (§6.4).
5. **PO**: if the school gave a PO for this invoice, sets it. If the school needs a PO and has given none, sets
   `auto_advance=false` so the draft is held, and tells the school (§8.2).
6. Records the draft in our copy and returns 200. Stripe finalises at the end of the window.

The same check runs for the first invoice after a trial and for any other subscription invoice.

### 6.4 What an invoice says [PROPOSAL]

| Part | Content |
|---|---|
| Header | Company name and address; the company's VAT number as an account tax ID, shown in the header [VERIFIED ST-TAXID] |
| Customer | School legal name and invoice address; the school's VAT number if any [VERIFIED ST-TAXID] |
| Number | One sequence across the account ("the United Kingdom typically require account level sequencing") [VERIFIED ST-CUSTOM] |
| Lines | "Space Colony Defence licence, <period>", `Q × P`; an adjustment line if any; a discount if any; VAT |
| Custom fields | "PO number", "School URN", "Licence period", "Pupils enrolled". Stripe allows "up to 4", names up to 40 characters, values up to 140 [VERIFIED ST-INV] |
| Memo | "<N> pupils enrolled at 01:00 on 1 January 2027." When the minimum applies, add: "The minimum of <M> pupils applies." |
| Footer | Companies House number (Stripe suggests the footer for it [VERIFIED ST-CUSTOM]), registered office, payment terms, remittance email |
| How to pay | The school's virtual account details, on the PDF and the hosted page [VERIFIED ST-TRANSFER] |
| Due date | 30 days after the invoice is issued (BIL-Q2) |

Custom fields and the footer can't change once an invoice is finalised [VERIFIED ST-INV, ST-CUSTOM], which is why the
PO flow (§8) works on drafts. Whether this layout meets HMRC's rules for a VAT invoice is for the accountant
[UNVERIFIED].

### 6.5 A renewal from start to finish (1 January)

1. Up to 31 December, enrolments change and `billing` keeps `Q` in step (§6.2). The Billing page shows the estimate.
2. 1 January, 00:00 UTC: Stripe creates the draft for 1 January to 30 April and sends `invoice.created`.
3. The draft check (§6.3) counts, corrects, writes the memo, and sets or waits for the PO.
4. At the end of the window Stripe finalises the invoice, emails it to the billing email and sends
   `invoice.finalized`. The portal shows "Unpaid, due 31 January".
5. The school pays (§7). `invoice.paid` arrives and the portal shows "Paid".
6. If it isn't paid, §10 applies.

---

## 7. Paying

### 7.1 Ways to pay [CONFIRMED by owner 2026-11-21, PD-12]

| Method | How | Stripe facts | Fee (§17) |
|---|---|---|---|
| **Bank transfer** (the default) | The school's finance team pays to the account details on the invoice | Needs `send_invoice` [VERIFIED ST-COLLECT]. "Stripe creates a unique virtual bank account number and displays it on the invoice PDF and the hosted invoice page"; it matches payments by reference, then amount; "Invoices won't be partially funded" (money waits in the customer's balance); money unmatched after 75 days goes back to the payer [VERIFIED ST-TRANSFER] | 0.5%, capped at £5 |
| **Card** | Pay on the hosted invoice page | Customers can "Pay the invoice using any of the enabled payment methods" and "Download PDF copies of the invoice and receipt" [VERIFIED ST-HOSTED] | 1.5% + 20p standard UK cards; 2.8% + 20p premium. School purchasing cards are probably premium [ASSUMPTION] |
| **Direct Debit** | Set up once (§7.2), then collected automatically | Bacs: "4 business days to confirm … when a mandate is already in place, or up to 7 business days when collecting a new mandate"; £10,000 per payment, and £10,000 a week for new Stripe users; payers can dispute at any time and there is no evidence route [VERIFIED ST-BACS] | 1%, at least 20p, capped at £4; £5 per dispute |
| Pay by Bank | Not offered at first | Whether invoices can use it is [UNCONFIRMED ST-PBB] (BIL-Q15) | — |

- **Who pays**: Billing admins and Admins [CONFIRMED by owner, PD-7]. "Pay" opens Stripe's page in a new tab. Nothing
  of Stripe's runs inside our pages (§15).
- **Links expire.** The hosted invoice page link expires 30 days after the due date and never later than 120 days
  [VERIFIED ST-HOSTED]. So the Billing page asks `billing` for the invoice's current link when "Pay" is pressed rather
  than storing it [PROPOSAL]. Whether Stripe gives a fresh link once one has expired is [UNVERIFIED].

### 7.2 Switching a school to Direct Debit [PROPOSAL]

1. A Billing admin presses "Set up Direct Debit". `billing` creates a Stripe Checkout session in setup mode for Bacs,
   and the browser goes to Stripe. Checkout is required because "The Payment Element can't create Bacs Direct Debit
   SetupIntents" [VERIFIED ST-BACS].
2. Stripe sends the Direct Debit scheme's notification emails [VERIFIED ST-BACS].
3. When the session completes (webhook, §12.2), `billing` makes the new payment method the customer's default and
   switches the subscription to `charge_automatically` from the next invoice.
4. The Billing page shows "Direct Debit active" and the mandate reference.
5. **Cancelling**: through Stripe's customer portal (§7.4) or the school's bank. `billing` switches the school back to
   `send_invoice` when the mandate stops being active. [UNVERIFIED: the event that reports that.]

A school that needs a PO still has its draft held until the PO arrives (§8); collection follows finalising. If a
collection fails, `invoice.payment_failed` arrives [VERIFIED ST-EVENTS]. The school then gets a banner and an email, and
the invoice stays open to pay on the hosted page. [UNVERIFIED: which methods that page offers for an invoice set to be
charged automatically.]

### 7.3 Payments made outside Stripe

Some payments bypass Stripe: money sent to the company's main bank account, a cheque, or a local authority's payment
run. The owner marks the invoice paid out of band. That "will result in no charge being made" and also sends
`invoice.paid` [VERIFIED ST-PAY]. Remittance advice goes to the remittance email in the footer. Stripe Billing's 0.7%
still applies, because it "Includes Billing transactions processed on and off Stripe" [VERIFIED ST-FEES].

### 7.4 Stripe's customer portal [PROPOSAL]

Each school gets a portal session with a configuration made through the API (configurations other than the default are
"only" managed that way) [VERIFIED ST-PORTAL]. It shows invoice history, payment methods (card, Bacs) and billing
details. Cancellation and plan or quantity changes are switched off; the portal allows that [VERIFIED ST-PORTAL]. Bank
transfers aren't in the portal [VERIFIED ST-PMSUP]; they are on every invoice.

---

## 8. Purchase orders

PO numbers on invoices are [CONFIRMED by owner 2026-11-21, PD-12]; the flow below is [PROPOSAL].

### 8.1 Giving a PO

A Billing admin or Admin enters "PO for the next invoice" (up to 140 characters [VERIFIED ST-INV]) on the Billing
page. `billing` stores it and sets it on the subscription's `invoice_settings.custom_fields`; the draft check sets it on
the draft as well. Once that invoice is finalised, the PO is cleared from the subscription so it doesn't carry into the
next period.

### 8.2 "We need a PO before you invoice us"

A school setting, changeable by Admins and Billing admins.

1. `invoice.created` arrives with no PO, so the draft is held (`auto_advance=false`).
2. The billing email, Admins and Billing admins get an email: "Your <period> invoice for <Q> pupils (<estimate> + VAT)
   is ready. Add your purchase order number to receive it." They also see a banner.
3. When the PO is entered, `billing` sets it on the draft and finalises the invoice, and Stripe emails it. The due date
   runs from finalising [ASSUMPTION; `days_until_due` counts from finalisation].
4. While the draft is held the school is not overdue, and pupils play.
5. The owner's console lists held drafts with their age. Chaser emails at 7 and 14 days need a scheduler (BIL-Q11). The
   owner can **issue without a PO**, giving a reason; the action is audited.

### 8.3 Changing a PO on an issued invoice

A finalised invoice's custom fields can't change [VERIFIED ST-INV].

- **Unpaid**: the owner voids it (only open or uncollectible invoices can be voided, and voiding can't be undone
  [VERIFIED ST-CUSTOM]) and issues a one-off replacement with the same lines and the right PO. The school sees both;
  the void one is marked "Replaced by <number>". One-off invoices are charged under Stripe Invoicing (0.4% Starter or
  0.5% Plus "Per paid invoice") rather than Billing [VERIFIED ST-FEES].
- **Paid**: by default there is no reissue; the PO is noted on our record (BIL-Q16).

---

## 9. VAT

- **The licence is standard-rated**, subject to the accountant [UNVERIFIED for this exact product]. Supporting points:
  - HMRC: software used to reach e-publications "is not in itself an e-publication. Therefore, supplies of such
    software are standard rated".
  - "video games are specifically excluded from the zero rate".
  - A profit-making provider is "unlikely to be an eligible body" for the education exemption.
  - In *Generic Maths Ltd* an online maths subscription was held standard-rated.

  [VERIFIED UK-VAT]
- **Schools can usually recover it.** A maintained school's local authority recovers VAT on purchases from the
  delegated budget (s.33). Academies use the s.33B refund scheme for non-business spending [VERIFIED UK-S33]. Prices
  are quoted excluding VAT [PROPOSAL].
- **Registration.** Charging VAT needs the company to be VAT-registered. Whether it is, is for the owner and accountant
  [UNVERIFIED].
- **How** (BIL-Q6) [PROPOSAL]: a manual Stripe tax rate, "VAT 20%", exclusive, as each subscription's default. It is
  free and enough for one country and one rate. A rate's percentage can't change once created [VERIFIED ST-TAX], so a
  change of rate means a new tax rate on every subscription.
  - The alternative, Stripe Tax, supports UK VAT and costs 0.5% per transaction on its Basic plan through Billing
    [VERIFIED ST-TAX, ST-FEES].
  - Stripe Tax won't finalise an invoice when it can't find a recognised location for the customer [VERIFIED
    ST-SUBHOOK].
  - England-only sales don't need it.
- **On the invoice**: the company's VAT number as an account tax ID. A school's own VAT number (some trusts have one)
  goes in as a `gb_vat` customer tax ID, which Stripe checks "with the United Kingdom's Revenue & Customs (HMRC)"
  [VERIFIED ST-TAXID].
- **VAT returns**: the console exports invoices and credit notes by VAT quarter (§14).

---

## 10. Reminders, overdue and suspension

### 10.1 Timeline for invoice-paying schools (D = due date) [values PROPOSAL, BIL-Q10]

| When | Stripe | Our platform |
|---|---|---|
| Issued | Emails the invoice and PDF to the billing email, from our own domain once it is verified in Stripe [VERIFIED ST-EMAIL] | Portal: "Unpaid, due <D>" for Admins and Billing admins |
| D − 10 days | Reminder 1. Stripe allows "up to three reminders, starting at 10 days before the due date and ending at 60 days after" [VERIFIED ST-COLLECT] | Banner "Due in 10 days" |
| D | The subscription "becomes `past_due`" [VERIFIED ST-SUBHOOK] | State Overdue (§5.5); "Overdue" banner |
| D + 7 | Reminder 2 | Email to Admins as well [PROPOSAL; needs the scheduler, BIL-Q11] |
| D + 14 | `invoice.overdue` (sent "X number of days after an invoice becomes due—where X is determined by Automations") [VERIFIED ST-EVENTS] | Owner alert; the console's overdue list |
| D + 30 | Reminder 3 | The owner contacts the school personally |
| D + 45 or later | — | The owner may suspend (§10.2). **Never automatic** [PQ-14] |

- Stripe sends no renewal reminder before a `send_invoice` subscription renews [VERIFIED ST-EMAIL]. The Billing page
  banner from 14 days before a billing date does that job, plus an email if the scheduler exists (BIL-Q11).
- Teachers, Read-only staff and pupils never see payment messages (rule R6, [01](01-product-and-roles.md)).
- Stripe's own overdue settings must not cancel or pause subscriptions; our licence states decide [PROPOSAL; the
  Dashboard setting names are UNVERIFIED].
- Direct Debit schools: `invoice.payment_failed` brings a banner and an email, then the same timeline.
- **Payment terms.** The Procurement Act's implied 30-day terms exclude "a contract awarded by a school" [VERIFIED
  UK-PAY], so the 30 days come from our terms. Under the late payment rules, without an agreed date payment is late after
  30 days [VERIFIED UK-PAY].

### 10.2 Suspension [PROPOSAL, PQ-14]

- **Who and how.** Only the owner suspends a school, giving a reason that goes in the audit log.
- **Pupils.** Pupils can't sign in. They see: "Space Colony Defence is paused for your school. Your teacher can tell
  you more."
- **Staff.**
  - Staff can still sign in.
  - Admins and Billing admins can pay and export.
  - Teachers see a banner and a read-only portal.
  - Enrolment changes are blocked.
- **Data and reminders.** Nothing is deleted, and Stripe keeps sending its reminders.

### 10.3 Reinstatement [PROPOSAL, BIL-Q5]

A school is reinstated automatically when no invoice is past due any more (on `invoice.paid`), and the owner is told.
The owner can also reinstate by hand, for example on a promise to pay.

### 10.4 Writing off

The owner marks the invoice uncollectible, which sends `invoice.marked_uncollectible` [VERIFIED ST-EVENTS], and
usually ends the licence (§11). Recovering the debt happens outside the platform.

---

## 11. Changes during the year

[PROPOSAL unless marked.]

| Change | What happens |
|---|---|
| Price change | §3.3: a new version, notice, a move at a billing date; the owner can keep a school on its old price |
| A school's own minimum | The owner sets `M` for that school; the quantity sync uses it |
| Discount | A coupon for a number of periods (§3.4) |
| Wrong invoice | A credit note, which can "decrease the amount of an `open` or `paid` invoice" [VERIFIED ST-CUSTOM]. The credit goes to the school's balance (used on the next invoice) or back as a refund [ASSUMPTION: refund routes per payment method; check] |
| Refund | Owner only, under the refund policy (BIL-Q8) |
| Pupils leave mid-period | No credit (BIL-Q4) |
| A school wants to stop | An Admin presses "End our licence" before the next billing date (BIL-Q13), which sets `cancel_at_period_end`. The state is Ending. At the period end `customer.subscription.deleted` arrives ("whenever a customer's subscription ends" [VERIFIED ST-EVENTS]), the state becomes Ended, the 90-day export window runs, then the data is deleted (PQ-15) |
| Asks to stop after the invoice was made | That period is due. The owner may void or credit at their discretion |
| The owner ends a licence | Breach or write-off: cancel now; void or write off open invoices |
| School closes or merges | As "wants to stop". Later, the console flags schools whose GIAS status changes; GIAS publishes `EstablishmentStatus` and `CloseDate` daily [VERIFIED UK-GIAS] |
| Academy conversion | A new legal entity [ASSUMPTION]. The owner updates the customer's legal name, address and URN for future invoices; past invoices stay as issued; the school's data stays; the new trust accepts the terms and DPA ([11](11-privacy-security-and-assurance.md); solicitor) |
| Wants one invoice a year | BIL-Q7 |
| A trust with several schools | Later ([01](01-product-and-roles.md)) |
| Invoice to Direct Debit, or back | §7.2 |

---

## 12. Webhooks and keeping in step with Stripe

### 12.1 Endpoint and checks [PROPOSAL]

- **Route**: `https://hooks.spacecolonydefence.com/api/hooks/stripe` → CloudFront → an API route with no authoriser → `billing`.
  The host is in [03](03-domains-edge-and-email.md), the route catalogue in [10](10-data-and-api.md).
- **Signature.** Stripe signs each event with HMAC-SHA256 in the `Stripe-Signature` header, computed over the raw body.
  Its libraries reject events older than "a default tolerance of 5 minutes" [VERIFIED ST-HOOKS]. The function must
  check the exact bytes the API received, decoding base64 when API Gateway flags it [ASSUMPTION].
- **Secrets.** The signing secret is in Secrets Manager. Dev (sandbox) and prod (live) each have their own endpoint and
  secret.
- **Duplicates and order.** "Stripe doesn't guarantee the delivery of events in the order that they're generated", and
  an event can arrive twice [VERIFIED ST-HOOKS]. So `billing`:
  - writes `STRIPEEVT#<eventId>` conditionally (TTL 30 days), and if it already exists, returns 200;
  - re-fetches the object from Stripe and updates our copy from what Stripe says **now**, never from the event payload
    alone.
- **Retries.** Live mode retries "for up to three days with an exponential back off"; a sandbox retries three times over
  a few hours [VERIFIED ST-HOOKS]. An alarm fires on any 5xx from the endpoint (ENV-11 in
  [02](02-environments-and-delivery.md)).

### 12.2 Events

| Event | Stripe's meaning [VERIFIED ST-EVENTS] | `billing` does [PROPOSAL] |
|---|---|---|
| `customer.subscription.updated` | "whenever a subscription changes" (renewals included) | Update the subscription copy; work out the licence state |
| `customer.subscription.trial_will_end` | "three days before a subscription's trial period is scheduled to end" | Email and banner |
| `customer.subscription.deleted` | "whenever a customer's subscription ends" | State Ended; start the 90-day export window |
| `invoice.created` | A draft is created | The draft check (§6.3) |
| `invoice.finalized` | "a draft invoice is finalized and updated to be an open invoice" | Record number, totals and due date; clear the used PO; portal notice |
| `invoice.paid` | "an invoice payment attempt succeeds or an invoice is marked as paid out-of-band" | Record it; reinstate if suspended and nothing is past due |
| `invoice.payment_failed` | "a declined payment, including soft decline, or … the lack of a stored payment method" | Banner and email |
| `invoice.overdue` | "X number of days after an invoice becomes due" | Owner alert |
| `invoice.marked_uncollectible` | "whenever an invoice is marked uncollectible" | Record it; the owner decides about the licence |
| Voids, credit notes, completed Checkout setup sessions, mandate changes, cash balance changes, disputes | [UNVERIFIED event names; check the event types list] | Record them; switch to Direct Debit (§7.2); owner alert on disputes |

### 12.3 Sync from Stripe [PROPOSAL]

A console button, per school and for all schools, that:

- re-fetches the customer, subscription, the last 24 invoices and the credit notes;
- rebuilds our copy;
- reports differences (quantity against the live `Q`, invoices missing from our copy);
- writes nothing to Stripe.

A nightly automatic run would need a scheduler (EventBridge Scheduler), which today's architecture doesn't have
(BIL-Q11).

### 12.4 What we keep [PROPOSAL; key names in [10](10-data-and-api.md)]

| Item | Holds |
|---|---|
| A school's billing record | Customer and subscription IDs, licence state, plan version, minimum override, "PO required", next PO, quantity sent, `quantityDirty`, billing email |
| Invoice copy (one per invoice) | Number, state, period, `Q`, `N`, amounts, due date, PO, held flag, "replaced by" |
| Credit note copy | Number, invoice, amount, reason |
| Event log | Event ID, type, received, processed (TTL 30 days) |

The copy lets the portal show invoices without calling Stripe, and keeps reports working if Stripe is slow.

---

## 13. The school's Billing page

Admins and Billing admins only ([01 §3.1](01-product-and-roles.md#31-school-roles-confirmed-by-owner-2026-11-21-pd-7-and-pd-8-details-proposal)).
Read-only and billing-only staff see the enrolled counts elsewhere as numbers; teachers and pupils see nothing of
billing. [PROPOSAL; placement in [06](06-school-portal.md).]

| Panel | Shows | Actions |
|---|---|---|
| **Licence** | State (§5.5); plan; `P` per pupil per term + VAT; minimum `M`; next billing date; enrolled `N` and how many of them are unassigned; estimate `max(N, M) × P` + VAT | "See pupils without a class" (Admins) |
| **Invoices** | Number, date, period, pupils, total including VAT, state (Held for PO, Unpaid, Overdue, Paid, Void, Replaced, Credited), due date, PO; credit notes under their invoice | Pay (opens Stripe), PDF, Add PO (held drafts) |
| **Purchase orders** | The next PO; "We need a PO before you invoice us" | Save, clear |
| **How we pay** | "Bank transfer or card on each invoice", or "Direct Debit active" with the mandate reference | Set up Direct Debit (§7.2); Manage cards and Direct Debit (Stripe portal, §7.4) |
| **Billing details** | Legal name for invoices, invoice address, billing email, the school's VAT number (optional), URN (read-only) | Edit; changes apply to future invoices |
| **Our supplier details** | Company name and number, VAT number, registered office, remittance email: what a school's new-supplier form asks for | Download |
| **End our licence** | The date the licence would end | Admins only; asks for confirmation |

- **Banners** (Admins and Billing admins only): trial ending; invoice held for PO; due soon; overdue; Direct Debit failed;
  suspended; ending.
- **Where amounts come from.** They come from our copy (§12.4). Pay links are fetched when pressed (§7.1). No Stripe code
  runs on the page (§15).
- **Demo and accessibility.** The demo school shows example invoices (§5.4). The page meets rule R10.

Routes [PROPOSAL; served by `billing`, because only it holds the Stripe key, with the shared access check of
[04 §5](04-identity-and-access.md#5-access-control-rbac); the catalogue is in [10](10-data-and-api.md)]:

| Route | Who | Does |
|---|---|---|
| `GET /api/school/billing` | Admin, Billing admin | Licence panel and invoices |
| `PUT /api/school/billing/details` | Admin, Billing admin | Update the customer's details |
| `PUT /api/school/billing/po` | Admin, Billing admin | Next PO; the "PO required" setting |
| `POST /api/school/billing/invoices/{id}/po` | Admin, Billing admin | Add a PO to a held draft and issue it |
| `POST /api/school/billing/invoices/{id}/pay-link` | Admin, Billing admin | The current hosted invoice page link |
| `POST /api/school/billing/portal-session` | Admin, Billing admin | A Stripe customer portal link |
| `POST /api/school/billing/direct-debit` | Admin, Billing admin | A Checkout setup link |
| `POST /api/school/billing/end-licence` | Admin | Cancel at the period end |

---

## 14. The owner's billing tools

In the console ([05](05-platform-console.md)), for the Owner role (a Finance role later). [PROPOSAL]

| Page | Shows | Actions |
|---|---|---|
| **Plans and prices** | Plan versions: `P`, `M`, Stripe Price, valid from, the schools on each | New version (creates the Stripe Price); schedule a move at a billing date, with notices; retire |
| **Billing overview** | Forecast for the next billing date (Σ `Q × P`, excluding VAT); invoices by state; overdue schools with days and amounts; drafts held for a PO; failed Direct Debits; trials ending within 30 days; quantity mismatches; webhook errors | Open a school; export |
| **A school's Billing tab** | Licence state; customer; subscription; live `Q` beside the quantity in Stripe; trial end; coupon; collection method; "PO required"; invoices and credit notes; event history | Start billing (create customer and subscription); set or extend the trial; apply a coupon; set the school's minimum; issue a held draft without a PO; void and reissue; credit note; refund; mark paid outside Stripe; resend the invoice email; switch collection method; end the licence (at period end or now); suspend; reinstate; Sync from Stripe; open in the Stripe Dashboard |
| **Exports** | Invoices, payments, credit notes, and VAT by quarter, as CSV for the accountant | Download |

**Alerts to the owner:**

- webhook endpoint errors;
- `invoice.overdue`;
- failed Direct Debits and disputes;
- drafts held for more than 7 days;
- sync errors;
- any draft check that changed a quantity.

Every action is audited with the owner's identity and a reason. The Stripe Dashboard stays available for anything the
console doesn't cover. Routes are `/api/platform/billing/…` → `billing`, behind the operator authoriser ([10](10-data-and-api.md)).

**Setting Stripe up (the owner, once per account):**

1. Create the company's Stripe account; pass its checks.
2. Turn on card, Bacs Direct Debit and UK bank transfers.
3. Add the company VAT number as an account tax ID, the invoice footer and the branding.
4. Verify `spacecolonydefence.com` as the email domain, with DNS records in the DNS account
   ([03](03-domains-edge-and-email.md)).
5. Set the reminders (§10.1), the `invoice.overdue` days, the finalisation window (§6.3), and subscriptions that stay
   `past_due` rather than cancel.
6. Create the customer portal configuration and the webhook endpoints (a sandbox for dev, live for prod).
7. Put the restricted keys and signing secrets into Secrets Manager ([02](02-environments-and-delivery.md)).

---

## 15. Data, security and records

- **What goes to Stripe** [PROPOSAL]:
  - the school's legal name, address, URN and billing email;
  - the names and emails of billing contacts (adults);
  - PO numbers, pupil **counts** and amounts.

  **Never** a pupil's name or any pupil record (rule R2). A test inspects every Stripe request the test suite makes for
  pupil fields.
- **Stripe's role.** Stripe acts as a processor "on behalf of User, the Data Controller". It is a controller in its own
  right for fraud prevention, anti-money-laundering and know-your-customer checks, and legal compliance. Data goes to
  Stripe, LLC in the US under the Data Privacy Framework and the UK International Data Transfer Addendum. Stripe gives
  30 days' notice of new sub-processors to those who subscribe, and notifies breaches of UK GDPR data within 48 hours
  [VERIFIED ST-DPA]. For billing data we are the controller (our own customer relationship), not a school's processor
  [ASSUMPTION; see [11](11-privacy-security-and-assurance.md)].
- **Keys.** A restricted key ("API key with permissions you control") [VERIFIED ST-KEYS], limited to [PROPOSAL; exact
  permission names set when building]:
  - customers, subscriptions, invoices, invoice items and credit notes;
  - Checkout and customer portal sessions;
  - prices and products, tax rates, and reading payment methods and events.

  A sandbox key in dev, a live key in prod, both in Secrets Manager, read only by `billing` and never logged
  (CLAUDE.md). Stripe's access policies can tie a key to known servers [VERIFIED ST-KEYS]. Lambda has no fixed address
  without a NAT, so that isn't used [ASSUMPTION].
- **Hosted pages only.** No Stripe.js and no Stripe frames in our pages. Payments happen only on Stripe-hosted pages
  (hosted invoice page, Checkout, customer portal), reached by links, so the CSP stays strict
  ([03](03-domains-edge-and-email.md)). Card-data (PCI) scope should then be the smallest self-assessment, SAQ A
  [UNVERIFIED; confirm with Stripe's PCI guide].
- **Stability.** The API version is pinned in code and on the webhook endpoints; upgrades are deliberate, after a
  sandbox run. Every write carries an idempotency key (§6.1).
- **Records.** Invoices, credit notes and payments are kept 6 years, in Stripe and in our copy, even after a school's
  data is deleted; they hold no pupil data [PQ-15; legal basis UNVERIFIED, for the accountant]. Every billing action by
  staff or the owner goes in the audit log ([10](10-data-and-api.md)).

---

## 16. Testing

- **Environment.**
  - Dev uses a Stripe sandbox. "For new integrations, use general sandboxes instead of your test mode sandbox"; an
    account can have up to five [VERIFIED ST-TEST].
  - "By default, Stripe doesn't email customers in sandboxes" [VERIFIED ST-TEST].
  - **Test clocks** simulate renewals: they advance up to two billing periods at a time, take up to three customers
    each, and are deleted after 30 days [VERIFIED ST-TEST].
- **Unit tests** (no network):
  - `Q` and its coalescing;
  - the draft check's decisions;
  - the PO hold;
  - the licence states;
  - signature checking;
  - duplicated and shuffled event sequences;
  - `proration_behavior=none` on every quantity update.
- **Sandbox scenarios**, each with a test clock, with results recorded in `docs/validation/`:

| # | Scenario | Expect |
|---|---|---|
| 1 | School enrolled 10 October | Trial to 1 January; first invoice on 1 January for `Q` |
| 2 | School enrolled 10 December | The BIL-Q3 behaviour |
| 3 | 28 pupils enrolled by CSV | Quantity in Stripe = 28 (or `M`) within a minute |
| 4 | 60 single enrolments in 5 minutes | No more than one update a minute; the draft is still right |
| 5 | 10 pupils archived at 23:50 on 31 December | The 1 January invoice leaves them out |
| 6 | `N` below `M` | `Q = M`; the memo says so |
| 7 | "PO required" and no PO | Draft held; PO added → issued with the PO; owner can issue without a PO |
| 8 | Wrong PO on an unpaid invoice | Voided and replaced; both visible |
| 9 | Bank transfer: exact, short and over | Exact → paid; short → open with a balance; over → balance used next time |
| 10 | Card on the hosted page | Paid; the portal updates within a minute |
| 11 | Direct Debit set up, collected, then failed | Automatic collection; failure banner and email |
| 12 | Overdue timeline | Reminders; `invoice.overdue`; owner suspends; pays → reinstated |
| 13 | Duplicated and out-of-order webhooks | Our copy ends up the same as Stripe's |
| 14 | Endpoint down when `invoice.created` fires | Finalising waits; the retried check corrects it |
| 15 | End licence at the period end | Ending → `deleted` → Ended → 90-day window |
| 16 | Price change at a billing date | New price from that date; schools kept on the old price stay |
| 17 | Pilot 100% coupon | £0 invoices, marked paid |
| 18 | Academy conversion details | The next invoice has the new name; old invoices unchanged |
| 19 | Demo school | Never a Stripe customer |
| 20 | Credit note and card refund | Shown under the invoice; refund recorded |

- **Live check** before the first real invoice [PROPOSAL]: a school record for the owner's own company in prod, one small
  real invoice paid by card, then refunded.

---

## 17. Costs

Let `G` be an invoice's total including VAT (whether fees are charged on the VAT-inclusive total is [UNVERIFIED]).
Published fees [VERIFIED ST-FEES]:

| Item | Cost |
|---|---|
| Stripe Billing | 0.7% of billing volume, "Excludes one-off invoices", includes payments made off Stripe |
| Bank transfer | 0.5%, capped at £5 |
| Card | 1.5% + 20p standard UK; 2.8% + 20p premium UK; 2.5% + 20p EEA; +2% if currency is converted |
| Bacs Direct Debit | 1%, at least 20p, capped at £4; £5 per dispute |
| Stripe Tax (if chosen) | 0.5% per transaction on Basic through Billing |
| One-off invoices (replacements) | 0.4% (Starter) or 0.5% (Plus) per paid invoice, instead of Billing; nothing for invoices unpaid, voided, written off or marked paid |

"Stripe Payments pricing will apply" on top of the Billing, Invoicing and Tax fees [VERIFIED ST-FEES]. So per invoice:

`cost ≈ 0.007 × G + payment fee`, where the payment fee is `min(0.005 × G, £5)` by transfer,
`0.015 × G + £0.20` by standard card, or `min(max(0.01 × G, £0.20), £4)` by Direct Debit.

**Illustration.** Take an invoice total of £1,000. That is an example amount, not a price. Bank transfer costs £12
(1.2%), a standard card £22.20, a premium card £35.20, and Direct Debit £11. Three invoices a year per school. The AWS
cost of billing (Lambda, DynamoDB) is small [ASSUMPTION].

---

## 18. Decisions for the owner

| ID | Decision | Recommendation |
|---|---|---|
| BIL-Q1 | `P`, `M`, and whether very small schools get a lower minimum | Look at what schools pay for similar products first; allow a per-school minimum |
| BIL-Q2 | Payment terms | 30 days from issue, in the terms of service |
| BIL-Q3 | Schools enrolled fewer than 30 days before a billing date | A 30-day trial, then a part-period invoice |
| BIL-Q4 | Credit for pupils who leave mid-period | None; they drop off the next invoice |
| BIL-Q5 | Reinstatement after suspension | Automatic when nothing is past due; the owner is told |
| BIL-Q6 | VAT: registration status and mechanism | Accountant confirms registration; a manual 20% rate, not Stripe Tax |
| BIL-Q7 | One invoice a year for schools that ask | Not at launch. Later: a yearly Price variant, or a one-off prepayment held as credit |
| BIL-Q8 | Refund policy | Refunds only for mistakes; the free trial is the evaluation |
| BIL-Q9 | Timings | No more than one quantity update per school per minute; a 24-hour draft window; Stripe finalises at its end |
| BIL-Q10 | Overdue timeline | §10.1 as written; suspension reviewed from D + 45 |
| BIL-Q11 | A scheduler (EventBridge Scheduler, new to the architecture) for: pre-billing notices 14 days before each billing date, trial-ending emails, PO chasers, a nightly reconciliation | Add it at Launch; until then banners only and a manual Sync |
| BIL-Q12 | Notice of a price change | One full billing period |
| BIL-Q13 | Who can end the licence, and by when | Admins only; before the billing date |
| BIL-Q14 | Where Stripe sends invoices | One billing email per school (ideally the school's finance mailbox); we notify other Billing admins ourselves |
| BIL-Q15 | Pay by Bank | Later, once Stripe confirms it for invoices |
| BIL-Q16 | Wrong PO on a paid invoice | No reissue; note it on our record |
| BIL-Q17 | Stripe emails from our domain | Yes: verify `spacecolonydefence.com` in Stripe |

---

## 19. User stories

*Snapshot of 2026-11-21. The source of truth for these stories is now Jira (project SCD); see
[README §6](README.md#6-user-stories-and-jira). Edit the tickets, not this table.*

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| BIL-1 | As the owner, I want a school to be "Not billed", so that the pilot runs before billing exists | The school has no Stripe customer; its Billing page says the pilot is free until the agreed date; enrolled counts are shown | Pilot |
| BIL-2 | As an Admin, I want to see how many pupils are enrolled, so that I know what the school will pay for | `N` and the unassigned share are shown and match the pupil list; archived pupils are left out | Pilot |
| BIL-3 | As the owner, I want plan versions with `P` and `M` mirrored to Stripe, so that invoices use the right price | A new version creates a Stripe Price (gbp, 4-monthly, licensed, VAT exclusive); retired versions can't be given to new schools | Launch |
| BIL-4 | As the owner, I want starting billing for a school to create its customer and subscription, so that invoicing is automatic | Customer with legal name, address, URN and metadata; subscription with the plan price, `Q`, `send_invoice`, 30 days, anchor at the next billing date, trial per §5.3; repeating the call creates nothing twice | Launch |
| BIL-5 | As the owner, I want invoices on 1 September, 1 January and 1 May, so that each school gets one per term | A test clock shows invoices on those dates for two years, covering Sep–Dec, Jan–Apr and May–Aug | Launch |
| BIL-6 | As the platform, I want the subscription quantity kept at `max(N, M)`, so that the next invoice is right | After a committed enrolment change Stripe has the new quantity within a minute; no more than one update a minute per school; every update sends `proration_behavior=none`; not-billed and demo schools are skipped | Launch |
| BIL-7 | As the platform, I want each draft checked when Stripe creates it, so that the invoice counts the pupils enrolled at that moment | `N` recounted on `invoice.created`; a difference is corrected (line or adjustment); memo and custom fields set before acknowledging; scenario 5 passes | Launch |
| BIL-8 | As a Billing admin, I want the invoice to say what it covers, so that our finance team can check it | `Q × P` line; memo with `N`, the count time and the minimum; PO, URN, period and pupils fields; company VAT and Companies House numbers; VAT line | Launch |
| BIL-9 | As a Billing admin, I want to pay by bank transfer to details on the invoice, so that payment is matched without letters | The school's virtual account details are on the PDF and hosted page; an exact transfer marks the invoice paid with no owner action; a short payment leaves it open and visible to the owner | Launch |
| BIL-10 | As a Billing admin, I want to pay by card from our Billing page, so that small invoices are quick | Pay opens the current hosted page in a new tab; payment shows as Paid in the portal within a minute; no Stripe script loads in the portal | Launch |
| BIL-11 | As a Billing admin, I want to set up Direct Debit, so that we don't have to pay each invoice | Set up opens Stripe Checkout in setup mode; afterwards the subscription collects automatically by Bacs; the page shows "Direct Debit active"; the next invoice is collected | Launch |
| BIL-12 | As a Billing admin, I want Stripe's portal for cards, Direct Debit and invoice history, so that we manage payment details ourselves | A per-school portal session with invoice history, payment methods and billing details; cancellation and plan changes are off | Launch |
| BIL-13 | As a Billing admin, I want to give a PO for the next invoice, so that it is printed on it | A PO saved before the billing date appears on the next invoice and is cleared afterwards; longer than 140 characters is refused | Launch |
| BIL-14 | As a Billing admin, I want "we need a PO before you invoice us", so that no invoice arrives without one | With the setting on and no PO the draft is held; billing people get a banner (and an email if BIL-Q11); entering the PO issues the invoice with it; the due date counts from issue | Launch |
| BIL-15 | As the owner, I want to see drafts held for a PO and issue one without, so that held invoices don't wait for ever | The console lists held drafts with their age; "Issue without PO" needs a reason and is audited | Launch |
| BIL-16 | As the owner, I want to correct a PO on an unpaid invoice, so that the school's finance system accepts it | The old invoice is voided and a replacement with the same lines and the new PO is issued; the school sees both, linked | Launch |
| BIL-17 | As the owner, I want VAT on every invoice with our VAT number, so that invoices are valid VAT invoices | The 20% exclusive rate applies; the account tax ID shows; totals are right to the penny; the accountant has approved a sample | Launch |
| BIL-18 | As an Admin, I want payment reminders to reach billing people only, so that teachers and pupils aren't involved | Stripe reminders set per §10.1; banners for Admins and Billing admins only; teachers, Read-only staff and pupils see nothing | Launch |
| BIL-19 | As the owner, I want overdue alerts and an overdue list, so that I can chase schools | `invoice.overdue` raises an alert; the list shows school, invoice, amount and days overdue | Launch |
| BIL-20 | As the owner, I want to suspend and reinstate a school, so that non-payment is handled by a decision, not automatically | Suspend needs a reason; pupils see the paused message and can't sign in; staff can sign in, pay and export; paying everything overdue reinstates the school and tells the owner; both are audited | Launch |
| BIL-21 | As the platform, I want Stripe webhooks checked and processed once in any order, so that our copy is always right | Bad signatures get 400; repeated event IDs are ignored; every event re-fetches its object; shuffled and duplicated sequences in tests end in Stripe's state | Launch |
| BIL-22 | As the owner, I want "Sync from Stripe", so that I can repair our copy | Per school and for all: re-fetches and rebuilds, lists differences, writes nothing to Stripe | Launch |
| BIL-23 | As the owner, I want trials and coupons managed in the console, so that pilots and offers need no Stripe Dashboard work | Set and extend trial end; apply a 100% coupon for N periods; £0 invoices are marked paid; trial-ending banner from 14 days | Launch |
| BIL-24 | As an Admin, I want to end our licence at the end of the paid period, so that we can leave cleanly | Before the billing date this sets cancel at period end; a banner shows the end date; at the end the state is Ended and the 90-day export window starts; the owner is told | Launch |
| BIL-25 | As the owner, I want credit notes and refunds, so that mistakes can be put right | Credit note against an open or paid invoice with a reason; credit to balance or refund; shown to the school under the invoice; audited | Launch |
| BIL-26 | As the owner, I want to change the price with notice, so that schools aren't surprised | A new version with a start billing date; notices to Admins and Billing admins one period ahead; subscriptions move on that date; kept schools stay on the old price | Launch |
| BIL-27 | As the owner, I want a billing overview and exports, so that I can run the business and do VAT returns | Forecast `Σ Q × P` for the next billing date; lists match Stripe; CSV of invoices, payments, credit notes and VAT by quarter | Launch |
| BIL-28 | As a Billing admin, I want our supplier's details in one place, so that I can set up the company in our finance system | A downloadable sheet with company name and number, VAT number, registered office and remittance email | Launch |
| BIL-29 | As the owner, I want billing proved in a sandbox, so that the first real invoice is right | The §16 scenarios pass with test clocks and are recorded in `docs/validation/` | Launch |
| BIL-30 | As the platform, I want no pupil data sent to Stripe, so that billing stays outside pupil data protection | A test checks every Stripe request in the suite; only school, contact, count and amount fields are present | Launch |
| BIL-31 | As the owner, I want scheduled notices and a nightly reconciliation, so that schools are warned before invoices and drift is caught | If BIL-Q11 is accepted: notices 14 days before billing dates; trial-ending and PO chaser emails; nightly sync report | Launch |
| BIL-32 | As the owner, I want to update billing details after an academy conversion, so that invoices go to the right legal entity | New legal name, address and URN for future invoices; past invoices unchanged; DPA re-acceptance prompted; audited | Later |
| BIL-33 | As a school, we want one invoice a year, so that it matches how we budget | Built per the BIL-Q7 decision | Later |
| BIL-34 | As a trust, we want one invoice for several schools, so that our central finance team pays once | Built with the trust model in [01](01-product-and-roles.md) | Later |
| BIL-35 | As a Billing admin, I want to pay by Pay by Bank, so that payment is instant | Offered once Stripe confirms it for invoices (BIL-Q15) | Later |
