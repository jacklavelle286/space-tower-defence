# 0052. EventBridge Scheduler runs the timed billing jobs, from Launch
Status: Accepted · Date: 2026-11-22

Context: some billing work ([0051](0051-billing-on-stripe.md)) falls due at a time, not on a request or a Stripe event:
Stripe sends nothing before a `send_invoice` renewal, held drafts need chasing, and our copy of Stripe's data can drift
(09 §8.2, §10.1, §12.3). Today's architecture, kept by PD-4, has no scheduler. The owner accepted PLAN-Q4 and BIL-Q11 as
recommended: add one at Launch, with banners and owner-pressed buttons until then [CONFIRMED by owner 2026-11-22].

Decision: EventBridge Scheduler is added to the platform in the Launch release.
- **Its jobs** (BIL-Q11, story BIL-31): notices 14 days before each billing date, and the email to Admins 7 days after
  an invoice falls due (09 §10.1); trial-ending emails (09 §5.3: Stripe's own `trial_will_end` comes only three days
  before the end); PO chasers 7 and 14 days after a draft is held, and the owner's alert at 7 days (09 §8.2, §14); a
  nightly "Sync from Stripe" for every school, which writes nothing to Stripe (09 §12.3).
- **Until Launch**, banners and owner-pressed buttons do these jobs, and they stay afterwards: the trial and
  billing-date banners from 14 days before, the console's list of held drafts, and Sync (BIL-22).
- **Not retention**: DynamoDB TTL, set when a pupil is archived or a school ends, deletes the data (DAT-Q4, 10 §6).

Alternatives: no scheduler (every notice, chaser and check would wait for the owner); Stripe's events alone (none before
a `send_invoice` renewal); retention deletions on the scheduler, as PLAN-Q4's list had them (TTL needs no scheduler).

Consequences: amends PD-4 by one AWS service. The nightly sync needs the Stripe key, so its schedule invokes `billing`
(DAT-Q3), which sends billing emails through SES (03 §8.1), a grant not yet in 10 §4. No phase in 13 §3.2 names the
scheduler; PS14, with the reminders, fits [PROPOSAL]. 02 §1 and PLAN-Q4 list retention deletions as a scheduler job, and
11 §7 a "deletion job": they are to follow DAT-Q4. DAT-Q4's TTL also amends [0004](0004-two-dynamodb-tables.md) ("no
TTL except the sign-up counter") for the platform's tables. TTL removes table items, not Cognito users: 10 §6 deletes an
ended school's staff users at once, but 05 §5.6 and 09 §5.5 let its Admins export for 90 days. The register recommends
that its Admins keep sign-in until day 90, when a scheduler job deletes them (PS0-12).

Evidence: BIL-Q11 in [09 §18](../platform/09-billing.md#18-decisions-for-the-owner); PLAN-Q4 in
[13 §5](../platform/13-delivery-plan.md#5-decisions-still-open); DAT-Q4 in
[10 §6](../platform/10-data-and-api.md#6-retention-and-deletion) and §9; PD-4 in
[README §3.1](../platform/README.md#31-confirmed-by-the-owner); commit cbfbddb (2026-11-22).
