# 0047. Pupil identity: a pupil pool, sign-in through our API, picture or typed passwords
Status: Accepted · Date: 2026-11-22

Context: pupils in Years 1 to 4 have no email and share classroom devices. PD-13 (owner, 2026-11-21): a class code and a
picture password, or a QR card in the homework book; typed passwords per class at the teacher's choice (meant for Years
3 and 4). The family edition's player pool ([0002](0002-two-cognito-pools.md)) has self sign-up and managed login, whose
hosted pages cannot run custom auth. The DfE standard suggests "no more than 10 guesses in 5 minutes".

Decision: a pupil pool in each environment, beside operators and staff; pupils sign in through our API (PQ-6).
- **Pool** (AUTH-Q4): username = pupilId; no attributes, MFA, recovery or self sign-up; Essentials. One client,
  `pupil-web`, used server-side, no password flow. A Cognito user is made at first sign-in and deleted on archiving.
- **Sign-in** (PQ-11): `pupil_auth` (no authoriser) checks the host's school, the lockouts, and either the class code (a
  new six-consonant code each time class sign-in opens, SCH-Q6), which works and shows the class list only while class
  sign-in is open (60 minutes by default, PUP-Q3), or the QR card's unguessable handle at `/q/<handle>`, which works any
  time (in school hours only if the class's home play is off, SCH-Q8). Then `CUSTOM_AUTH`
  runs in the same request: the Verify trigger checks the answer against the stored hash, and Cognito issues the tokens.
- **Secrets** (AUTH-Q5, PUP-Q1): 3 of 9 pictures in order, no repeats (504), fixed grid; or, per class, a generated word
  plus two digits (`comet42`). Stored as an HMAC hash for that check and a KMS-encrypted copy only `school_api`
  decrypts, which Admins and the class's Teacher can show for 30 seconds or print, always audited (AUTH-Q7, SCH-Q7).
-  **Lockouts** (AUTH-Q6, PUP-Q2): 5 wrong in a row (a correct sign-in resets the count) lock a pupil out for 5 minutes,
  10 in 24 hours until a teacher unlocks; 30 in a class in 5 minutes close its sign-in; 200 in a school in 5 minutes
  alert the owner.
- **Sessions** (AUTH-Q8, PUP-Q4): access and ID tokens 60 minutes, refresh 12 hours, rotated; kept in `sessionStorage`
  after class sign-in, up to 12 hours after QR sign-in; idle sign-out at 20 minutes (60-second warning). Finish revokes
  the session; Sign everyone out refuses tokens older than the class's `signedOutAt`.
- **Record** (PQ-9): first name, last initial, display name, year group, class, optional school reference, avatar,
  secret, QR handle, status; no date of birth, full surname, email, photo, UPN or other sensitive data.

Alternatives: one pool for staff and pupils (usernames, MFA and recovery differ; AUTH-1 keeps adults and children
apart); managed login (no custom auth on hosted pages; an exact callback per school address); Lite (cheaper, if the
`game/play` scope and rotation can go); reset-only secrets (children forget; teachers need the sheet); a shuffled grid
(more failed sign-ins than it saves); Cognito users at enrolment (a CSV would hit the quota of 50 creations a second).

Consequences: Cognito still issues, refreshes and revokes tokens, so `player_api` keeps a JWT authoriser, reading the
pupilId from the access token's `username` claim, not `sub`; DAT-Q2 keys pupils' play by it, so play survives a
recreated Cognito user ([0046](0046-tenancy-model.md) owns keying). Harder: our own sign-in code, triggers (5-second
limit), KMS key and pepper. Pupil sign-in replaces the PKCE flow of `prompt.md:777`, a change N-8 reserves to the owner:
accepting this ADR approves it. 504 combinations are weak offline, so the online limits are the protection. Open, for a
spike in sca-dev before PS5 (register PS0-11, AUTH-26): the `username` claim; custom auth for a user with an unused
password; pre token generation adding `game/play`. 04 §6.4's per-IP WAF rule waits for DNS-Q3 (Launch). Where the
documents disagree, the [register](../platform/14-decision-register.md) settles it: the class code is new at each
opening (PS0-8; 04 §6.5 kept it until renewed), cards use `/q/` (PS0-9; 04 §6.1 said `/c/`), and home play is a class
setting that limits cards to school hours (PS0-10; 04 §6.1 made it a school setting that stops cards).

Evidence: PD-13, PQ-6, PQ-9, PQ-11 ([README §3](../platform/README.md#3-decisions-so-far)); AUTH-Q4 to AUTH-Q8
([04 §6](../platform/04-identity-and-access.md#6-pupil-sign-in), §11); PUP-Q1 to PUP-Q4 and SCH-Q6 to SCH-Q8
([07 §4](../platform/07-pupil-experience.md#4-signing-in); [06 §8](../platform/06-school-portal.md#8-sign-in-tools));
DAT-Q2 ([10 §2.2](../platform/10-data-and-api.md#22-changes-to-game)).
