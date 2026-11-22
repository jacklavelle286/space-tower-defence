# 03. Domains, edge and email

Part of the [platform scope](README.md). Status: active on `dev` from 2026-11-21.

---

## 1. Summary

Everything the platform serves sits under `spacecolonydefence.com`. Each school is a subdomain served by one wildcard
CloudFront distribution. A CloudFront Function tells the API which school a request came from, from the host name. Email
(staff invitations, MFA codes, notices) goes out through SES from the same domain. The zone stays in the owner's DNS
account; the pipelines change its records through a narrow cross-account role (PQ-3).

---

## 2. The domain

| Fact | Value | Source |
|---|---|---|
| Registered | 2026-11-21 08:57 UTC, Amazon Registrar (Route 53 Domains), expires 2027-11-21 | [VERIFIED RDAP and `route53domains get-domain-detail`, 2026-11-21] |
| Account | DNS account 521764600394, CLI profile `dns` | [VERIFIED 2026-11-21] |
| Hosted zone | `Z05584941EODCDVG5OXIT`, public, 2 records (NS and SOA) at the time of reading | [VERIFIED `route53 list-hosted-zones-by-name`] |
| Auto-renew, privacy | Both on | [VERIFIED] |
| Name servers | `ns-1264.awsdns-30.org`, `ns-1698.awsdns-20.co.uk`, `ns-220.awsdns-27.com`, `ns-769.awsdns-32.net` | [VERIFIED `dig NS`] |

The family edition's domain, `jackgl.com`, is in another account (060421969689) and is not touched.

---

## 3. Who changes DNS records (PQ-3)

| Option | How | For | Against |
|---|---|---|---|
| **A. Cross-account role** [PROPOSAL] | A role in the DNS account that the prod and dev pipeline roles may assume. It may change records in zone `Z05584941EODCDVG5OXIT` only, limited further by Route 53's condition keys on record names and types. Terraform in `infrastructure/platform` uses it through a second provider | Records follow the code, including certificate validation; no hand steps per release | One more trust relationship; the owner creates the role (DNS account bootstrap) |
| B. Hand-off, as today | The owner creates records from Terraform outputs, as for `aliens.jackgl.com` ([docs/runbooks/dns-hand-off.md](../runbooks/dns-hand-off.md)) | No cross-account access | Every new certificate or host needs the owner at the console |
| C. Move the zone | Point the registration at a zone in the prod account | Prod owns everything | Breaks the owner's "central DNS account" pattern |

Dev gets a **delegated zone**, `dev.spacecolonydefence.com`, in the dev account, with an NS record in the parent zone
(created once, by the owner or the prod-side role). The dev pipeline then manages its own records without touching the
parent zone [PROPOSAL].

Condition keys for restricting record changes by name and type exist in Route 53's IAM support [UNVERIFIED: confirm the
current key names in the Route 53 IAM reference before writing the policy].

---

## 4. Hostnames

### 4.1 Prod

| Name | Record | Points at | Purpose | Release |
|---|---|---|---|---|
| `spacecolonydefence.com`, `www.` | A/AAAA alias | Marketing distribution | Marketing site ([12](12-marketing-and-sales.md)); `www` redirects to the apex | Launch (a holding page in Pilot) |
| `admin.` | A/AAAA alias | Console distribution | The owner's console ([05](05-platform-console.md)) | Pilot |
| `*.` (wildcard) | A/AAAA alias | School distribution | Every school, including `demo` | Pilot |
| `hooks.` | A/AAAA alias | Hooks distribution | Stripe webhooks only ([09](09-billing.md)) | Launch |
| `login.` | A alias | Cognito custom domain (staff pool) | Managed login for Microsoft and Google sign-in ([04](04-identity-and-access.md)) | Launch |
| `mail.` | MX, TXT (SPF) | SES | Custom MAIL FROM | Pilot |
| `<token>._domainkey.` ×3 | CNAME | SES Easy DKIM | Email signing | Pilot |
| `_dmarc.` | TXT | — | DMARC policy (start `p=none`, move to `quarantine`) | Pilot |
| Apex MX | MX | The owner's business mailbox provider | Receiving `support@`, `privacy@`, `billing@` (DNS-Q4) | Pilot |
| Stripe email domain | CNAMEs given by Stripe | Stripe | Invoice emails from our domain ([09](09-billing.md)) | Launch |
| `status.` | CNAME | A hosted status page (DNS-Q5) | Incidents | Launch |

Explicit names (`admin`, `www`, `hooks`, `login`, `mail`, `status`) win over the wildcard in DNS. In CloudFront, a
distribution with `*.spacecolonydefence.com` can coexist with others holding more specific names, and requests go to the
most specific match [UNVERIFIED: confirm in the CloudFront "alternate domain names" documentation before building].

### 4.2 Dev

The same shape under the delegated zone: `dev.spacecolonydefence.com` (marketing preview), `admin.dev.`, `*.dev.`
(schools), `hooks.dev.`, `login.dev.`. The prod wildcard `*.spacecolonydefence.com` does not cover the two-level names,
so dev has its own certificate in the dev account.

---

## 5. School addresses (slugs) (PQ-2)

**Rules** [PROPOSAL]:

- 3 to 30 characters, lower-case letters, digits and single hyphens, starting with a letter and not ending with a hyphen.
- Chosen by the owner at enrolment ([05](05-platform-console.md)), usually from the school's name, with the town added
  when names collide (England has many schools with the same name; GIAS gives the town).
- Unique, and **never reused**, even after a school's data is deleted. Old QR cards and bookmarks must never open another
  school.
- A slug can be changed by the owner (a school is renamed or merges). The old slug becomes an alias that redirects for
  12 months, then stops resolving to the school [PROPOSAL].

**Reserved**, never a school: `www`, `admin`, `api`, `app`, `auth`, `login`, `sso`, `id`, `hooks`, `mail`, `smtp`,
`status`, `help`, `support`, `docs`, `blog`, `billing`, `pay`, `portal`, `staff`, `school`, `schools`, `teacher`,
`teachers`, `pupil`, `pupils`, `parent`, `parents`, `account`, `accounts`, `static`, `assets`, `cdn`, `media`, `dev`,
`staging`, `test`, `demo` (held by the demo tenant), and anything starting with `xn--` or containing `--`. The list lives
in the console settings ([05](05-platform-console.md)) and in the slug validator's tests.

---

## 6. CloudFront

### 6.1 Distributions per environment

| Distribution | Names | Origins and behaviours |
|---|---|---|
| Marketing | apex, `www` | S3 (static site); `www` redirect in a viewer-request function; `/api/public/*` to the HTTP API (the Book a demo form, [12](12-marketing-and-sales.md)) |
| Console | `admin.` | S3 (console SPA) for `/`; `/api/*` to the HTTP API; `/pictures/*` to the pictures bucket (as today's admin site) |
| **School** | `*.` | S3 (pupil SPA) for `/`; S3 (portal SPA, PQ-1) for `/staff*`; `/game-data/*` (S3, cached, as today); `/pictures/*`; `/api/*` to the HTTP API (no caching) |
| Hooks | `hooks.` | `/api/hooks/*` to the HTTP API; everything else returns 404 |

Each follows today's settings unless stated: S3 through Origin Access Control, TLS 1.2 (2021 policy), PriceClass_100,
`/api/*` with no caching and the `AllViewerExceptHostHeader` origin request policy [VERIFIED for today's sites,
infrastructure/modules/static_site/main.tf:129-234, from the code map].

### 6.2 How a request knows its school

Today one CloudFront Function, `spa-fallback`, runs on viewer requests, and the Host header is not forwarded to the API
[VERIFIED infrastructure/main/main.tf:26-32; static_site/main.tf]. On the school distribution [PROPOSAL], a viewer-request
function:

1. Reads the Host and checks it is `<slug>.spacecolonydefence.com` with a slug that passes §5's pattern. Anything else
   gets a 404.
2. On `/api/*`, sets `x-scd-host: <slug>`, **overwriting** any value the browser sent. The origin request policy forwards
   viewer headers, including this one.
3. On other paths, does today's SPA fallback for `/` and `/staff`.

The other distributions run the same kind of function on `/api/*` and set `x-scd-host` to their own kind: `admin`
(console), `hooks` or `www` (marketing), so every route can refuse the wrong kind of host
([10 §3](10-data-and-api.md)). The API maps a slug to a school through the `tenancy` table, cached briefly
([10](10-data-and-api.md)). An unknown slug
gets "School not found" from the app, not from the edge. A CloudFront KeyValueStore of live slugs could give edge 404s
later [PROPOSAL, Later].

**The header is not the security boundary.** A caller could reach the API's execute-api URL directly and send any header.
What protects a school's data is the token plus the membership check: a staff token from school A, sent with school B's
slug, has no membership in B and is refused ([04](04-identity-and-access.md)). Even so, CloudFront adds a secret
origin-verify header that the API checks, so the edge's protections can't be bypassed [PROPOSAL].

### 6.3 Headers and CSP

- Today's security headers stay (HSTS for a year including subdomains, nosniff, frame DENY, no-referrer) [VERIFIED
  infrastructure/main/main.tf:79-115]. HSTS preload can follow once every subdomain is HTTPS-only [PROPOSAL, Launch].
- **The CSP is enforced** on the platform, with one policy per site (pupil app, portal, console, marketing). Today's CSP
  is Report-Only and shared by both sites [VERIFIED main.tf:34-77, from the code map]. Pupil and portal policies allow
  `'self'`, the Cognito endpoint (`cognito-idp.eu-west-2.amazonaws.com`), `login.` (Launch) and the audio bucket. No
  third-party scripts anywhere. Billing pages link out to Stripe-hosted pages in a new tab; Stripe.js is never loaded
  ([09](09-billing.md)).
- The audio bucket's CORS allows `https://*.spacecolonydefence.com` [UNVERIFIED that S3 CORS accepts this wildcard form;
  check the S3 CORS documentation].

### 6.4 Rate limiting and WAF

HTTP API stages cannot take AWS WAF ([E §E.2](../plan/E-architecture.md)); CloudFront can. [PROPOSAL, Launch] AWS WAF on
the school distribution with a rate-based rule on `/api/pupil-auth/*` (sign-in guessing) and AWS managed rule groups on
the portal, plus the per-pupil lockouts in [04](04-identity-and-access.md). WAF has a monthly cost per web ACL and rule;
the owner decides (DNS-Q3).

---

## 7. Certificates

| Certificate | Region | Covers | Validation |
|---|---|---|---|
| Prod edge | us-east-1 | `spacecolonydefence.com`, `*.spacecolonydefence.com` | DNS, through the cross-account role (§3) |
| Prod `login.` | us-east-1 (Cognito custom domains need it there) | `login.spacecolonydefence.com` (or the wildcard) | DNS |
| Dev edge | us-east-1, dev account | `dev.spacecolonydefence.com`, `*.dev.spacecolonydefence.com` | DNS in the delegated zone |

A wildcard covers one level only, which is why dev's names need their own certificate.

---

## 8. Email

### 8.1 Sending (SES, prod account, eu-west-2)

| Item | Setting [PROPOSAL] |
|---|---|
| Identity | Domain `spacecolonydefence.com`, Easy DKIM |
| MAIL FROM | `mail.spacecolonydefence.com` (MX and SPF) so SPF aligns for DMARC |
| DMARC | `p=none` with reports to the owner's mailbox; `quarantine` after a month of clean reports |
| From addresses | `no-reply@` for invitations, MFA codes, password resets and notices |
| Production access | The owner requests it (SES starts in the sandbox) |
| Bounces and complaints | A configuration set publishing to SNS; addresses that bounce go on the suppression list and the portal shows "this invitation could not be delivered" |
| Dev | Stays in the SES sandbox; only verified or simulator addresses |

What sends email:

| Email | Sent by | To |
|---|---|---|
| Staff invitation, password reset code, email MFA code | Cognito (staff pool) through SES | Staff |
| Invitation reminder, role change, removed from school | `school_api` through SES | Staff |
| Billing notices (PO needed, overdue banner equivalents) | `billing` through SES | Billing admins and Admins |
| Invoices, receipts, payment reminders | **Stripe** ([09](09-billing.md)) | Billing contacts |
| Book a demo | Marketing form through SES | The owner |

**No email ever contains pupil data.** Staff emails contain the school's name, the staff member's name and links
[PROPOSAL; rule R2].

### 8.2 Receiving

Schools need real addresses: `support@`, `privacy@` (data protection requests and the DPO contact in the DPA) and
`billing@`. These belong in the owner's business mailbox (the limited company's existing email provider) through MX
records on the apex, not in SES inbound (DNS-Q4).

---

## 9. What school IT needs from us

Schools' filtering must let these through on pupil and staff devices ([11](11-privacy-security-and-assurance.md) has the
full assurance pack):

| Allow | Why |
|---|---|
| `*.spacecolonydefence.com` | The school's own address, the portal and the console's hosts |
| `cognito-idp.eu-west-2.amazonaws.com` | Pupil and staff sign-in calls |
| The audio bucket's regional S3 host | Speech clips |
| `login.spacecolonydefence.com` (Launch) | Microsoft and Google sign-in |
| `checkout.stripe.com`, `invoice.stripe.com`, `billing.stripe.com` | Billing staff paying invoices [UNVERIFIED exact Stripe hosts; take them from Stripe's current documentation] |

---

## 10. Decisions for the owner

| ID | Question | Recommendation |
|---|---|---|
| DNS-Q1 | Who changes records in the DNS account (§3)? | **Answered** [CONFIRMED by owner 2026-11-22]: A, a cross-account role limited to the zone, plus a delegated dev zone |
| DNS-Q2 | May the owner rename a school's slug, with a 12-month redirect (§5)? | Yes |
| DNS-Q3 | AWS WAF on the school distribution at Launch (§6.4)? | Yes, a rate-based rule on pupil sign-in; decide after seeing the cost |
| DNS-Q4 | Which mailbox provider receives `support@`, `privacy@`, `billing@` (§8.2)? | The company's existing provider |
| DNS-Q5 | A hosted status page at `status.` (Launch)? | Yes, a small hosted service, not built by us |

---

## 11. User stories

*Snapshot of 2026-11-21. The source of truth for these stories is now Jira (project SCD); see
[README §6](README.md#6-user-stories-and-jira). Edit the tickets, not this table.*

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| DNS-1 | As the owner, I want the pipelines to manage records in my DNS account's zone without broader access, so that releases need no hand steps | A role in the DNS account allows record changes in `Z05584941EODCDVG5OXIT` only (names and types restricted); prod and dev pipeline roles can assume it; a test change outside the zone is refused | Pilot |
| DNS-2 | As a developer, I want `dev.spacecolonydefence.com` delegated to the dev account, so that dev manages its own records | NS record in the parent zone; dev zone in the dev account; `dig` resolves a dev test record | Pilot |
| DNS-3 | As the owner, I want edge certificates for prod and dev, so that every host is HTTPS | Certificates issued and validated by DNS; renewals automatic; `*.spacecolonydefence.com` and the apex covered | Pilot |
| DNS-4 | As a pupil, I want my school's address to open my school's sign-in, so that I see my class and not another school's | `stjosephs.<domain>` and `oakfield.<domain>` (made-up slugs) each show their own school's name; an unknown slug shows "School not found" | Pilot |
| DNS-5 | As the platform, I want every API request from a school host to carry that school's slug set at the edge, so that the API never trusts the browser for it | The function overwrites a client-supplied `x-scd-host`; a request with a forged header still reaches the API with the host's slug; tests cover malformed hosts | Pilot |
| DNS-6 | As the platform, I want the API to accept only requests that came through CloudFront, so that edge protections can't be bypassed | Requests to the execute-api URL without the origin-verify secret get 403; the secret rotates without downtime | Launch |
| DNS-7 | As the owner, I want slugs validated against the rules and the reserved list, so that no school takes `admin` or a confusing name | Validator tests cover pattern, length, reserved names and reuse of a deleted slug | Pilot |
| DNS-8 | As the owner, I want to rename a school's slug with a redirect, so that a renamed school keeps working | Old slug redirects for 12 months to the new one; QR cards made before the change still work during that time | Later |
| DNS-9 | As a pupil, I want the pages to load only our own code, so that nothing tracks me | Enforced CSP per site with no third-party script sources; a CSP report-only canary shows no violations in normal use | Pilot |
| DNS-10 | As a staff member, I want invitations and codes to arrive from our domain, so that they aren't junked | SES domain verified with DKIM and custom MAIL FROM; DMARC published; a test email passes SPF, DKIM and DMARC | Pilot |
| DNS-11 | As the owner, I want bounced invitations to show in the portal, so that an Admin can fix a mistyped address | Bounce events mark the invitation "could not be delivered"; the address is suppressed until corrected | Launch |
| DNS-12 | As the owner, I want rate limiting at the edge on pupil sign-in, so that guessing is slowed before it reaches Lambda | WAF rate-based rule on `/api/pupil-auth/*` (if DNS-Q3 is yes); a load test above the limit gets 429s while normal classes are unaffected | Launch |
| DNS-13 | As school IT, I want a published list of domains to allow, so that the game works through our filter | The list in §9 is in the privacy pack and the help pages, and matches the CSP | Pilot |
| DNS-14 | As the owner, I want the marketing apex and `www` served, so that schools can find us | A holding page in Pilot; `www` redirects to the apex; full site at Launch ([12](12-marketing-and-sales.md)) | Pilot |
