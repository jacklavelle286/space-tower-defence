# 0048. Staff and operator sign-in, and access checked by our API on every request
Status: Accepted · Date: 2026-11-22

Context: staff sign in at `/staff` on their school's address, the owner at `admin.` (PQ-1, PD-5). PD-7 sets the roles;
PD-9 puts email, password and MFA first, Microsoft and Google next. Cognito callback URLs match exactly, 100 per client
at most; the DfE standard asks for MFA on staff accounts; rule R1 and CON-Q4 limit what the owner may see.

Decision: a **staff** user pool joins the operator pool in each account (PQ-6); pupils are in
[0047](0047-pupil-identity-and-sign-in.md).
- **Staff sign-in, Pilot** (AUTH-Q1): our own screens at `/staff` call Cognito's user-pool API through Amplify, with one
  client, `staff-web`, for every school. MFA is required: TOTP or email codes, no SMS, passkeys Later (AUTH-Q3). Staff
  join only by invitation, from an Admin (or the owner, for a first or replacement Admin), valid 7 days (SCH-Q10).
- **Staff sessions** (AUTH-Q8): tokens 30 min; refresh 12 h, rotated, in `sessionStorage`; signed out after 60 min idle.
- **Microsoft and Google, Launch** (PQ-7, AUTH-Q2): federation app clients of up to 100 school callbacks each, after the
  AUTH-20 spike; a central sign-in origin as fallback. Invited staff only (AUTH-Q11), using their school's MFA.
- **Access** (PQ-8, PD-7): tokens prove identity; our API decides access. Every staff request needs an active membership
  of the host's school, read strongly consistent, and the route's permission (`contracts/routes.json`, DAT-Q7) in the
  role's bundle. Code checks permissions, never role names; Teachers reach only their classes; Read-only sees staff
  names and roles only (SCH-Q14). Calls lacking CloudFront's secret origin-verify header fail (AUTH-Q10).
- **The owner** sees school details, staff names and emails, billing and counts (CON-Q4); pupils, classes and progress
  only via **support access**, from Launch (AUTH-Q9, CON-Q5): an Admin's grant with a reason, for 24 hours by default,
  72 hours or 7 days, audited for the school, revocable. Without consent only if the DPA allows it (CON-Q5, open).
- **Operators** sign in as today (TOTP, PKCE) and hold named console permissions through the group `owner` (04 §7); a
  trusted browser lasts 12 hours instead of 30 days, amending ADR-0042 for the platform (CON-Q8).

Alternatives: managed login for Pilot staff (a callback per school address); federation by token exchange (no refresh
token; the per-address problem moves to Microsoft and Google); Cognito groups for school roles (pool-wide, stale until
refresh); passwordless codes (no required MFA then); 30 days for the console (it enrols schools and moves money).

Consequences: we build sign-in, MFA and reset screens; password handling moves into our code (ADR-0012). ADR-0002
allowed an in-app form instead of PKCE (`prompt.md:777`) only with the owner's approval (N-8): accepting this ADR gives
it for staff. Option A serves about 4,900 schools (2,000 if each client needs a branding style, UNCONFIRMED). Origin
verify is in the Pilot; DNS-6 moves from Launch ([0049](0049-domains-dns-and-edge.md)). The
[register](../platform/14-decision-register.md) settles where the documents disagree: support access lengths (AUTH-Q9;
05 §9.1 and 06 §12 capped it at 72 hours) and the console's 12 hours (CON-Q8; 04 §2 and §7 kept 30 days). Access
without the school's consent waits for the solicitor's DPA wording, as 11 §2 and PRV-19 allow only the school's
request (CON-Q5, OWN-6). PS4 designs how the console's 30-minute idle sign-out (05 §2) treats a trusted browser. The
spike in sca-dev before PS5 (PS0-11) checks that API sign-in tokens get `school/staff` from pre token generation v2.

Evidence: [04 §11](../platform/04-identity-and-access.md#11-decisions-for-the-owner); [0002](0002-two-cognito-pools.md);
[README](../platform/README.md#3-decisions-so-far); [03 §11](../platform/03-domains-edge-and-email.md#11-user-stories);
[05 §14](../platform/05-platform-console.md#14-decisions-for-the-owner); [0042](0042-admin-trusted-browser.md);
[06 §17](../platform/06-school-portal.md#17-decisions-for-the-owner); [10 §3](../platform/10-data-and-api.md#3-api);
[11 §2](../platform/11-privacy-security-and-assurance.md#2-who-is-responsible-for-what); [0012](0012-auth-spike.md).
