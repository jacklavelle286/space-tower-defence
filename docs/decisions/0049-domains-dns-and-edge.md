# 0049. Domains, DNS and the edge: the zone stays in the DNS account, every school on one wildcard distribution
Status: Proposed · Date: 2026-11-22

Context: the platform serves everything under `spacecolonydefence.com` (PD-2): the console at `admin.` (PD-5), one
address per school (PD-6), the demo school as a tenant in prod (PD-15), and email to staff. The zone is in the owner's
DNS account, the platform in sca-dev and sca-prod. The family edition's DNS hand-off needs the owner at the console for
each new host or certificate, and its API never sees which host was called ([0001](0001-same-origin-api.md)).

Decision:
- **DNS** [CONFIRMED by owner 2026-11-22, DNS-Q1]: the zone stays in the DNS account. A role there (OWN-3) may change
  records in that zone only, limited by record name and type; the prod pipeline's Terraform assumes it through a second
  provider, so records and certificate validation follow the code. Only the prod pipeline may assume it (register
  PS0-4). `dev.spacecolonydefence.com` is a zone in sca-dev, delegated by an NS record in the parent zone that the owner
  or the prod-side role creates once; dev's pipeline manages its own records there.
- **Hosts**: four distributions per environment, each serving its API paths on the same host (0001): Marketing (the
  apex and `www.`), Console (`admin.`), School (`*.`, every school and `demo.`) and Hooks (`hooks.`, Stripe, Launch).
  Also `login.` (staff Cognito domain, Launch), `mail.` (SES), `status.` (hosted, Launch). Dev has the web names under
  `dev.`, no demo school, and its own certificate (a wildcard covers one level). Certificates: us-east-1, DNS-validated.
- **School edge**: pupils at `/`, the staff portal (its own app) at `/staff` (PQ-1). A CloudFront Function answers 404
  to a malformed school host and, on `/api/*`, sets `x-scd-host` to the slug, overwriting what the browser sent; the
  other distributions set `admin`, `hooks` or `www`. The API maps the slug to a school ([0046](0046-tenancy-model.md))
  and checks a secret origin-verify header from CloudFront, from the Pilot (AUTH-Q10,
  [0048](0048-staff-sign-in-and-access-control.md), register PS0-5); the token and membership check, not the header,
  guard a school's data. The CSP, Report-Only today, is enforced: one policy per site, no third-party scripts.
- **Email**: SES in sca-prod sends from `no-reply@` with DKIM, MAIL FROM `mail.` and DMARC; the owner requests
  production access (OWN-4) and dev stays in the sandbox. No email contains pupil data. `support@`, `privacy@` and
  `billing@` reach the company's own mailbox through apex MX, not SES (DNS-Q4).

Alternatives: the hand-off, as for `aliens.jackgl.com` (each new certificate or host needs the owner at the console);
moving the zone into sca-prod (breaks the owner's central DNS account); the portal on its own `teach.` host (one place
per school is simpler for staff); schools' own domains (Later); a separate demo environment (replaced by PD-15).

Consequences: a new school needs no DNS or certificate work, and a release no DNS hand steps (DNS-1). The DNS account
trusts one more role; PS2 waits for OWN-3 and OWN-4. For the platform this amends 0001: a function runs on `/api/*` and
CloudFront adds an origin-verify header (0001: none). Three [UNVERIFIED] facts in 03 are checked before building:
Route 53 condition keys, CloudFront wildcard precedence and S3 wildcard CORS. The
[decision register](../platform/14-decision-register.md) recommends PQ-1, PQ-2, DNS-Q2, DNS-Q4 and DNS-Q5 for acceptance
at the PS0 gate; DNS-Q3 (WAF) waits for its cost. It also settles two places where the documents disagree: only prod's
pipeline assumes the DNS role (03 §3 option A and DNS-1 also name dev, which its delegated zone makes unnecessary;
PS0-4), and the origin-verify header comes in the Pilot (AUTH-19, DAT-6), so DNS-6 moves from Launch (PS0-5).

Evidence: [03 §3–§11](../platform/03-domains-edge-and-email.md#3-who-changes-dns-records-pq-3) (DNS-Q1 to DNS-Q5,
DNS-1 to DNS-14); [README §3](../platform/README.md#3-decisions-so-far) (PD-2, PD-5, PD-6, PD-15, PQ-1 to PQ-3);
[13 §3.1, §4](../platform/13-delivery-plan.md#4-owner-actions-epic-e12) (PS2, OWN-3, OWN-4); 04 AUTH-Q10; 10 DAT-6;
[scope-schools §5.2–§8](../plan/scope-schools.md#52-requests-know-their-school) (the `/api/*` function, `teach.`).
