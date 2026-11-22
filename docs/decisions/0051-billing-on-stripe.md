# 0051. Billing runs on Stripe: one subscription per school, invoiced on 1 September, 1 January and 1 May
Status: Proposed · Date: 2026-11-22

Context: schools pay termly, in advance, per pupil enrolled when the invoice is made, invoiced automatically; one plan,
a price per pupil with a minimum; bank transfer, card or Direct Debit; PO numbers [CONFIRMED by owner 2026-11-21,
PD-12]. Stripe sends no warning before a `send_invoice` renewal, so counts must stay current (13 §6, risk 3).

Decision: billing runs on Stripe from the Launch release, as [09](../platform/09-billing.md) and its §18 recommend:
- **One subscription per school** (PQ-12): a Stripe customer per paying school, with one subscription to the plan
  version's Price (GBP, every four months, per seat); invoices due 30 days after issue (BIL-Q2). A new school is free
  until the next billing date and for at least 30 days, with no card (PQ-13; nearer a billing date, BIL-Q3).
- **Billing dates**: 1 September, 1 January and 1 May, 00:00 UTC, each invoice covering the next four months in advance.
  A new price starts on a billing date after one full period's notice (BIL-Q12; CON-Q7).
- **Quantity** `Q = max(N, M)`, `N` the enrolled pupils and `M` the minimum. `billing` updates it after each enrolment
  change with `proration_behavior=none`, so pupils added mid-period are free until the next billing date [CONFIRMED by
  owner 2026-11-21], and recounts each draft on `invoice.created` (BIL-Q9).
- **Paying** (PD-12): Stripe emails each invoice. Schools pay on Stripe's hosted pages only: bank transfer to an account
  number unique to the school, card or Bacs Direct Debit. A needed PO is given in advance, or the draft waits for it.
- **Overdue** (PQ-14): Stripe's reminders, and banners for Admins and Billing admins only (BIL-Q10); Stripe never
  cancels. Only the owner suspends a school, with an audited reason: pupils can't play, staff can still pay and export.
- **One holder of the Stripe key** (DAT-Q3): only `billing` reads it. Billing routes and `/api/hooks/stripe` go straight
  to `billing`; `school_api` calls it only asynchronously. No pupil data goes to Stripe.
- **The pilot is "Not billed"** [CONFIRMED by owner 2026-11-22, PLAN-Q3]: no Stripe customer (BIL-1). Billing (PS13,
  PS14) is built while it runs; PS13 needs the Stripe account (owner action OWN-5) and the price and minimum (OWN-14).

Alternatives: Stripe meters (they bill in arrears; the owner chose in advance); Stripe's default prorations (they would
bill pupils added mid-period); term dates (they differ between authorities and trusts); automatic suspension (PQ-14);
billing routes in `school_api` and `platform_api` (more holders of the key). No other provider was compared.

Consequences: MKT-Q9 and 12 §9 make the pilot free "through a 100% coupon", and PQ-13 gives it "a 100% discount for
agreed terms"; PLAN-Q3 makes it "Not billed". Settled: "Not billed" during the Pilot; a 100% coupon only if the pilot
school stays on once billing exists (09 §5.4). MKT-Q9, 12 §9, PQ-13 and MKT-13 (SCD-251, a Pilot story) need rewording.
Billing goes to prod during the pilot, so after PD-22's "one big release" (02 §2: "deployed once"): the register
recommends that the big release is the Pilot's, and Launch follows it the same way (PS0-13). Open: price and minimum
(BIL-Q1, OWN-14) and VAT (BIL-Q6, the accountant, OWN-6); 09's [UNVERIFIED] Stripe points await the sandbox (BIL-29).
Timed jobs: [0052](0052-eventbridge-scheduler-at-launch.md).

Evidence: [09](../platform/09-billing.md) §3–§16 and [§18](../platform/09-billing.md#18-decisions-for-the-owner);
[10 §9](../platform/10-data-and-api.md#9-decisions-for-the-owner);
[README §3](../platform/README.md#3-decisions-so-far); [13 §3.2–§6](../platform/13-delivery-plan.md#32-launch);
[12 §9](../platform/12-marketing-and-sales.md#9-the-pilot); the owner's answers of 2026-11-22, commit cbfbddb.
