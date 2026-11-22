# 0046. Tenancy model: one deployment for every school, the school taken from its address, kept apart by the API
Status: Accepted · Date: 2026-11-22

Context: the platform serves many schools, each at `<slug>.spacecolonydefence.com` [CONFIRMED by owner 2026-11-21,
PD-6], on today's architecture (PD-4). A school is the tenant; one school seeing another's data is risk 1 in
[13 §6](../platform/13-delivery-plan.md#6-risks). [0004](0004-two-dynamodb-tables.md) has no table for school data.

Decision: in each environment (PD-3), one wildcard school distribution, one HTTP API and one `tenancy` table serve every
school; a new school needs no DNS or certificate work. The demo school is a tenant in prod (PD-15).
- **The address names the school.** The school distribution's viewer-request function returns 404 for a host without a
  valid slug and, on `/api/*`, sets `x-scd-host: <slug>`, replacing any value sent; the other distributions set
  `admin`, `hooks` or `www` (DNS-5, DAT-6). The API maps the slug to a `schoolId` through `SLUG#<slug>`, cached 60 s
  ([03 §6.2](../platform/03-domains-edge-and-email.md#62-how-a-request-knows-its-school)).
- **The API keeps schools apart, not the header.** Staff routes go through one module, `api/shared/tenancy_auth.py`,
  the only path to data (DAT-8). It requires an active `MEMBER#<sub>` in the host's school, read strongly consistent on
  every request. A pupil's token must name a pupil of the host's school. IAM `dynamodb:LeadingKeys` limits each
  function; only `platform_api` and `billing` read across schools
  ([04 §5.3](../platform/04-identity-and-access.md#53-enforcement-on-every-request)).
- **The `tenancy` table** ([10 §2.4](../platform/10-data-and-api.md#24-the-new-tenancy-table), DAT-Q1) is set up like
  `game`, plus one overloaded GSI, `gsi1`, for lists only. A school's items sit under `pk = SCH#<schoolId>` (except
  lookup, audit and rate-counter items), so another school's IDs are not found. Access decisions read the base table,
  strongly consistent; uniqueness uses conditional puts. Pupils' play stays in `game` under `U#<pupilId>` (DAT-Q2).
- **Slugs** ([03 §5](../platform/03-domains-edge-and-email.md#5-school-addresses-slugs-pq-2), PQ-2, CON-Q2): picked by
  the owner at enrolment; 3–30 lower-case letters, digits and single hyphens, a letter first and no hyphen last, not on
  the reserved list (one list, read by the console and the API: register PS0-6). Never reused: a deleted school's
  `SLUG#` item stays as a tombstone with no school data, so an old QR card can't open another school (DAT-Q8). The owner
  may rename a slug; the old one redirects for 12 months (DNS-Q2).

Alternatives: a stack or user pool per school (isolation, but cost, releases and automation per school, shared quotas;
[scope-schools §5.1](../plan/scope-schools.md#51-tenancy-model)); the school or role in the token (stale until refresh;
a membership read per request makes removal immediate); `game` keyed by `sub` (archiving deletes a pupil's Cognito
user; the next has a new `sub`); no GSI (teachers need rosters quickly, DAT-4); reusing a slug after 12 months.

Consequences: amends [0004](0004-two-dynamodb-tables.md) for the `tenancy` table only; `game` keeps no GSI. The edge
(which amends 0001) is in [0049](0049-domains-dns-and-edge.md); staff access and origin verify (AUTH-Q10) are in
[0048](0048-staff-sign-in-and-access-control.md). Harder: every check is ours, so the route × role matrix (AUTH-8) and
the isolation suite (DAT-14) run in CI, the suite also against dev; schools share one API stage, so throttles are sized
for whole classes, with fairness per pupil and school in code (DAT-Q6, load test DAT-19). A deleted school's audit
items, outside `SCH#`, are kept 2 years (PQ-15, register PS0-7). A deleted slug is never reused (DAT-Q8), as 05 and
10 now say ([register](../platform/14-decision-register.md), CON-Q2). Open: pupils' `username` claim is UNVERIFIED
(10 §2.2), so the spike in sca-dev before PS5 checks it (PS0-11, AUTH-26).

Evidence: [README §3](../platform/README.md#3-decisions-so-far); DNS-Q2 (03 §10); CON-Q2
([05 §14](../platform/05-platform-console.md#14-decisions-for-the-owner)), 05 §5.4; DAT-Q1, DAT-Q2, DAT-Q6, DAT-Q8
([10 §9](../platform/10-data-and-api.md#9-decisions-for-the-owner)), 10 §2.2, §3.1, §3.4, §5; 04 §5.4, §10.
