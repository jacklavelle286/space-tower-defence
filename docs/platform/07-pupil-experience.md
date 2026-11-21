# 07. Pupil experience

Part of the [platform scope](README.md). Status: scope, parked.

---

## 1. Summary

A school pupil plays the same game as a child on the family edition. Signing in, choosing what to play and finishing
are different. A pupil never types an email or a birthday:

- **At school**, the teacher opens class sign-in. The pupil types the class code, taps their own name and taps their
  three pictures.
- **At home**, a parent scans the QR card glued into the homework book. The pupil taps their pictures.

Home shows **This week** first (the map and topics the teacher set), then the other maps the class allows. Activities
between waves match the pupil's year group and This week's topics. **Finish** saves, signs out and leaves the device
ready for the next child.

This document covers what the pupil sees and does. How sign-in works underneath (Cognito pools, tokens, lock-out
counters) is in [04](04-identity-and-access.md). The content and how it is chosen are in
[08](08-learning-content.md). The teacher's side of each screen is in [06](06-school-portal.md).

---

## 2. What a child does today (family edition)

These facts come from the code map of `main` at 292f4bc, read 2026-11-21 [VERIFIED; file references given].

| Area | Today | Source |
|---|---|---|
| Routes | `/` (Sign in, I'm new), `/auth/callback`, `/setup`, `/home`, `/games`, `/progress`, `/settings`, `/play/:runId` | `web/player/src/shell/Shell.tsx:261-345` |
| Sign-in | Cognito managed login, code flow with PKCE, `prompt=LOGIN`; tokens in `localStorage` (Amplify default) | `web/player/src/auth/amplifyAuth.ts:24-66` |
| First run | `GET /api/me` 404 → `/setup`: nickname, avatar, **birthday** (three pickers) → `PUT /api/me/profile` | `Shell.tsx`; `api/shared/profile.py:44-58` |
| Age band | Completed years in Europe/London; band 5, 6 or 7; otherwise null, and creating a run is refused with `AGE_OUT_OF_RANGE` | `profile.py:44-58`; `api/functions/player_api/handler.py:496-498` |
| Home | Continue, then one card per released map: a drawing of the map, Play (the 50-wave campaign), small challenge buttons; every map open | `web/player/src/shell/Home.tsx:49-71`; `player_api/handler.py:365-370` |
| Starting a run | `POST /api/runs` plans **every** activity slot of the run at once: 49 normal slots and 5 meteor slots | `api/shared/selection/plan.py:1-20` |
| Activities | One after each wave; meteor activities after waves 9, 19, 29, 39 and 49; subjects rotate maths, phonics, spelling | `web/game-core/src/data/game-data.ts:62`; `plan.py` |
| Endless | Blocks of 10 intervals planned on the server; never a repeat, and "You have done every activity we have for now" when the bank runs out | `api/shared/selection/endless.py:1-14` |
| Talking to the server | One serial ops queue sends at once, in batches of up to 25 ops or 64 KiB, with backoff: `START_WAVE`, `COMPLETE_WAVE` (with the checkpoint), `SUBMIT_ATTEMPT` (server judges, up to 3 tries), `DISMISS_SLOT`, `DEFEAT`, `SAVE_PREP`, `ABANDON`, `FINISH_RUN` | `web/player/src/sync/queue.ts:152-166, 334-345`; `web/player/src/run/syncedRun.ts:86-139` |
| One playing tab | A play-session lease: 180 s, renewed every 60 s while the page is visible and the child did something in the last 5 minutes; released on leaving the run | `web/player/src/run/lease.ts:1-21, 135-147, 180` |
| Speech | Clips fetched by `POST /api/speech` (a presigned GET; children never trigger synthesis), checked by hash and kept in IndexedDB | code map §5; `api/functions/tts/handler.py` |
| Progress | Counts from the `SUM#<subject>#<topicId>` learning summaries | `api/shared/ops.py:335-339` |
| Settings | Three resets (the child can wipe their own progress) | code map §5 |

---

## 3. What changes for school pupils

| Today | School pupil [PROPOSAL unless marked] |
|---|---|
| Username and password on Cognito's sign-in page | Class code or QR card, then picture password (or typed password), on the school's own address [CONFIRMED by owner, PD-13] |
| "I'm new" self sign-up | None: a teacher enrols every pupil ([06](06-school-portal.md)) |
| Birthday sets the age band | **No birthday.** The year group (Year 1 to Year 4) on the pupil record sets the content level [CONFIRMED by owner, PD-10]; a teacher can set a "working at" year ([08 §4.5](08-learning-content.md#45-working-at-override)) |
| Nickname typed by the child | The name the teacher entered: first name and last initial (rule R2) |
| Avatar chosen at `/setup` | Avatar (an alien) chosen at first sign-in, changeable later |
| Home: Continue, then every released map | **This week** first, then the maps the class allows [CONFIRMED by owner, PD-14] |
| Activities by age band, round-robin by subject | By year group, weighted to This week's topics ([08 §4.4](08-learning-content.md#44-choosing-activities)) |
| The child can reset their progress | Only a teacher can reset a pupil's progress (the teacher's practice records must not vanish) |
| Signs out when the child chooses | **Finish** button, idle sign-out, nothing left behind on a shared device |
| — | New status screens: class sign-in closed, class paused, school resting (suspended), locked out, school not found |

The game itself does not change: towers, waves, rewards and maps are the same for every pupil (rule R7).

---

## 4. Signing in

### 4.1 At school: class sign-in

The teacher opens **class sign-in** in the portal ([06](06-school-portal.md)) and shows the board view. That view has the
class code in large letters and a QR code that opens the class sign-in page directly [CONFIRMED by owner, PD-13;
window PQ-11].

| Step | Screen | What the pupil does | Notes [PROPOSAL] |
|---|---|---|---|
| 1 | `https://<school>.spacecolonydefence.com/` | Sees the school's name and badge and a big **"I'm at school"** button. The device may have it as a home-screen icon | No list of classes or pupils is ever shown before a code |
| 2 | **Class code** | Types six letters on a big on-screen keyboard, or scans the board's QR with the device camera | Letters only, no look-alikes (no I, L, O). Typing is case-blind. A speaker button reads the letters back |
| 3 | **Who are you?** | Taps their own tile: avatar, first name, last initial | Shown only while class sign-in is open. Sorted by first name; two "Amelia S"s are told apart by avatar, or by the teacher editing the display name |
| 4 | **Your pictures** | Taps three pictures in order from a grid of nine (or types their password if the class uses typed passwords, §4.3) | Dots show how many pictures have been tapped; a "start again" button clears them |
| 5 | First time only: **Pick your alien** | Chooses an avatar from the published aliens | Can change it in Settings |
| 6 | **Home** | Sees This week | §5 |

Error and edge cases:

| Case | What the pupil sees | Why |
|---|---|---|
| Wrong code | "That code doesn't match. Check the board." Code box clears | Codes are checked by the server; a wrong code reveals nothing |
| Right code, class sign-in closed | "Class sign-in is closed. Ask your teacher to open it." | The class list is hidden outside the window (PQ-11) |
| Too many wrong codes from one device | Slows down: "Wait a moment, then try again" | Stops guessing codes ([04](04-identity-and-access.md)) |
| Wrong pictures | Pictures shake; "Not quite. Try again." | No hint about which picture was wrong |
| Locked out (§4.4) | "Your teacher needs to unlock you. Show them this screen." with the pupil's avatar | The teacher unlocks in one tap ([06](06-school-portal.md)) |
| Already playing on another device | "You're playing somewhere else. Play here instead?" | The existing one-tab lease ([§2](#2-what-a-child-does-today-family-edition)) extends to devices |
| No network | "We can't reach the game. Check the Wi-Fi or ask your teacher." with a Try again button | Sign-in always needs the network |

### 4.2 At home: the QR card

Each pupil's printed card ([06](06-school-portal.md)) carries a QR code for
`https://<school>.spacecolonydefence.com/q/<handle>`. The handle is a long random value that identifies one pupil. It is
**not a secret** (the pictures are), but it cannot be guessed, so names cannot be listed by trying handles
[CONFIRMED by owner, PD-13; design PROPOSAL].

| Step | Screen | Notes |
|---|---|---|
| 1 | A parent scans the card with the phone or tablet camera; the browser opens the link | No app to install |
| 2 | **Is this you?** The pupil's avatar and first name only | Never the class list, never other pupils |
| 3 | **Your pictures** (or typed password) | Same as §4.1 step 4 |
| 4 | Home | The pupil can play at any time, at home or at school [CONFIRMED by owner 2026-11-21: home use through the school login] |

| Case | What the pupil sees |
|---|---|
| The card was reissued (lost card) | "This card has been replaced. Ask your teacher for your new card." Nothing about the pupil is shown |
| The pupil has left the school (archived) | The same message as an unknown card: "We can't find this card." |
| The school is suspended | The "resting" screen (§8) |

Using the QR card at school works too: some teachers will prefer cards to codes for younger classes.

### 4.3 The picture password and the typed password

| | Picture password (default for every class) | Typed password (teacher's choice per class) |
|---|---|---|
| Who | Years 1 to 4 by default | Meant for Years 3 and 4 when ready [CONFIRMED by owner, PD-13] |
| What | Three pictures in order from a fixed grid of nine (rockets, planets, aliens) [PROPOSAL; PUP-Q1] | A word and two digits from a child-friendly list, e.g. `comet42` [PROPOSAL] |
| Speech | Each picture has a name the pupil can hear ("rocket"), from pre-rendered clips | None |
| Set by | The teacher, at enrolment or on reset; shown on the teacher's password sheet, never printed on the QR card | The same |
| Combinations | 504 with no repeated picture (9 × 8 × 7) | Far more |

Neither is strong on its own. Strength comes from the lock-out (§4.4), the class-sign-in window, and how little a pupil
account holds (a pupil can see only their own play) [ASSUMPTION; recorded in the DPIA, [11](11-privacy-security-and-assurance.md)].
DfE's cyber security standard expects schools to give pupils "other means of logging on, other than passwords – for
example, using a PIN code" [VERIFIED https://www.gov.uk/guidance/meeting-digital-and-technology-standards-in-schools-and-colleges/cyber-security-core-standard].

The grid's order is **fixed**, not shuffled [PROPOSAL; PUP-Q1]. Five-year-olds remember positions as much as pictures.
Shuffling would stop a classmate learning a pattern by watching, but it costs more failed sign-ins than it saves.

### 4.4 Lock-out

The same DfE standard says to "protect all passwords – for example, by allowing no more than 10 guesses in 5 minutes"
[VERIFIED, same page]. Proposed rule [PROPOSAL; PUP-Q2]:

| Wrong tries for one pupil | Result |
|---|---|
| 1–4 in a row | Try again at once |
| 5 in a row | Wait 5 minutes (a friendly countdown with a rocket); the teacher can unlock sooner |
| 10 within 24 hours | **Locked**: the teacher unlocks from the class page or the pupil page |
| A correct sign-in | Counts reset |

A pupil's lock-out never affects classmates. Class-wide and per-device limits against guessing codes and names are in
[04](04-identity-and-access.md).

### 4.5 Help at the sign-in screens

Every screen has a **"Help me"** button. It never links out; it says "Ask your teacher" or, on QR sign-in, "Ask a grown-up
to check the card with your teacher" (rule R4).

---

## 5. Home

Home has three parts, top to bottom [CONFIRMED by owner, PD-14; layout PROPOSAL]:

| Part | Shows | Button |
|---|---|---|
| **This week** card | The teacher's chosen map (its drawing) and the topics being practised, in child words ("Adding to 20", "The 3 times table", "ai, ee, igh") with small pictures, and "until Friday" if the teacher set an end date | **Play**, or **Carry on** when this map's run is in progress |
| **More maps** | The other maps the class allows, as today's map cards (drawing, Play, challenge buttons) | Play / challenge |
| **My stuff** | Progress, Settings, **Finish** | — |

| Case | Home shows |
|---|---|
| The teacher set no This week | More maps only, like today's Home |
| The teacher turned all other maps off | This week only |
| This week's end date has passed | The card disappears; Home shows More maps until the teacher sets a new week |
| The class is paused | The paused screen (§8) instead of Home |

Topics set in This week shape the activities in **any** map the pupil plays, not only the This week map
([08 §4.4](08-learning-content.md#44-choosing-activities)).

---

## 6. Playing

The game is unchanged: building towers, waves, the shop, rewards, challenges, endless mode. Today's ops queue, lease,
checkpoint and speech caching all carry over (§2). What changes:

| Change | Detail |
|---|---|
| Content level | The run pins the pupil's **year group** (or working-at year) where the family edition pins the age band ([08 §4.1](08-learning-content.md#41-year-groups-replace-age-bands)) |
| Activity choice | Weighted to This week's topics. School campaign runs plan activity slots in **blocks of 10 waves**, as endless mode already does, so a new This week reaches a run within at most 10 waves [PROPOSAL; LRN-Q4 in 08] |
| Pause | When the teacher pauses the class, the next lease renewal (at most 60 seconds later) returns "paused". The game stops at once, the current wave's progress is kept to the last checkpoint, and the paused screen shows [PROPOSAL; PUP-Q6] |
| Suspended school | The same mechanism, with the "resting" screen (§8) |
| Learning attempts | Recorded as today (`SUBMIT_ATTEMPT`, up to 3 tries), plus what teachers need: first-try correctness and the day ([08 §5](08-learning-content.md#5-progress-measures-for-teachers)) |

A run belongs to the pupil, not the device: a pupil can start at school and carry on at home.

---

## 7. Finishing

| Way | What happens [PROPOSAL; PUP-Q4] |
|---|---|
| **Finish** button (Home, and the in-game menu) | Flushes the ops queue (waits up to a few seconds, with a spinner), releases the lease, revokes the session ([04](04-identity-and-access.md)), clears everything the pupil left on the device (tokens, cached run state), then returns to the school's start page |
| **Idle sign-out** | After 20 minutes with no touch, click or key: a 60-second "Still there?" countdown, then the same as Finish |
| **Closing the tab** | On class sign-in, tokens live in `sessionStorage` and are gone when the tab closes. On QR sign-in at home, they stay for the session's lifetime so a reload carries on (sessions end within 12 hours, [04](04-identity-and-access.md)) |
| **Back button after Finish** | Shows the start page, never the previous pupil's Home |

What stays on a shared device after Finish: cached game files and speech clips. They are content, not personal data,
and keeping them saves school bandwidth. Nothing identifying a pupil stays.

---

## 8. Status screens

Each is a full screen with a calm picture, one sentence a five-year-old can follow (also spoken), and one button.

| Screen | When | Text [PROPOSAL] | Button |
|---|---|---|---|
| **School not found** | An address with no school (unknown or deleted slug) | "We can't find this school. Check the address with your teacher." | None |
| **Class sign-in closed** | Right class code, window closed | "Class sign-in is closed. Ask your teacher to open it." | Back |
| **Paused** | The teacher paused the class | "Your teacher has paused the game. Your game is saved." | Finish |
| **Resting** | The owner suspended the school ([09](09-billing.md)) | "Space Colony Defence is resting at your school today. Ask your teacher." | Finish |
| **Locked** | §4.4 | "Your teacher needs to unlock you." | Back |
| **Card replaced or not found** | §4.2 | "We can't find this card. Ask your teacher." | None |
| **Everything done** | Endless content used up (today's D-6) | "You have done every activity we have for now." (unchanged) | Home |

Money, invoices or the word "suspended" are never shown to a pupil (rule R6).

---

## 9. The pupil's own progress

| Shows | Does not show [PROPOSAL] |
|---|---|
| Stars per map and how far through the campaign they are | Any other pupil's progress |
| Badges (today's badges on the profile) | Percentages, scores, "Secure" or "Practising" labels (those are for teachers, [08 §5](08-learning-content.md#5-progress-measures-for-teachers)) |
| "Things I've practised": topic names in child words, each with stars for how often it was practised | Rankings, leaderboards, class comparisons (rule R8) |
| Times-tables practice: how many facts they've answered, as a growing rocket | Timings that look like test results |

**Settings** for a school pupil: change avatar, sound on or off, speech on or off, reduced motion, Finish. There are
**no resets**: resetting a pupil's progress is a teacher's action ([06](06-school-portal.md)) [PROPOSAL; PUP-Q7].

---

## 10. Safety (rules R3 and R4)

| Rule | In the pupil app |
|---|---|
| No chat, no messages | No feature lets a pupil send anything to another person |
| Nothing a pupil makes is shown to others | Typed answers go only to the server for judging |
| No links out | No external links anywhere in the pupil app; help says "ask your teacher" |
| No adverts, no tracking | No analytics or third-party scripts; logs follow today's allow-list ([11](11-privacy-security-and-assurance.md)) |
| No AI | Nothing in the pupil app calls or shows generative AI [CONFIRMED by owner, PD-11] |
| Names | Pupils see other pupils' first names and initials only on the "Who are you?" grid while class sign-in is open |
| Content Security Policy | **Enforced** on the platform. Today it ships Report-Only and is shared between the two family sites [VERIFIED `infrastructure/main/main.tf:34-77`]; the platform enforces a strict per-app policy |

---

## 11. Accessibility

Target: WCAG 2.2 AA, which GOV.UK names as the standard for public sector websites and apps [VERIFIED
https://www.gov.uk/guidance/accessibility-requirements-for-public-sector-websites-and-apps]. DfE's digital accessibility
standard tells schools to ask suppliers for "their products and services accessibility statements" [VERIFIED
https://www.gov.uk/guidance/meeting-digital-and-technology-standards-in-schools-and-colleges/digital-accessibility].

| Need | Design [PROPOSAL] |
|---|---|
| Small hands, imprecise taps | Sign-in tiles and keys at least 64 × 64 CSS pixels, well above WCAG 2.2's 24 × 24 minimum |
| Pre-readers | Every instruction on sign-in, status and activity screens can be heard; pictures have spoken names |
| Keyboard and switch access | Every sign-in step works by Tab, Enter and Space in a logical order, so switch devices that act as keys work too; visible focus |
| Screen readers | Tiles labelled with the pupil's name; picture buttons with the picture's name; dots announced as "2 of 3 pictures chosen" |
| Reduced motion | Honours the system setting and the in-app switch (no shaking on wrong pictures, no countdown animation) |
| Time limits | None on sign-in. The times-tables practice timer is optional and can be turned off ([08 §3.3](08-learning-content.md#33-statutory-checks)) |
| Colour | Contrast at least AA; nothing relies on colour alone |

The pupil app and portal get an accessibility audit before Launch ([11](11-privacy-security-and-assurance.md)).

---

## 12. Patchy Wi-Fi

| Situation | Behaviour |
|---|---|
| Sign-in | Needs the network; clear retry message (§4.1) |
| During a wave | Combat runs in the browser; ops wait in the queue and retry with backoff (today's queue) |
| Longer drop | If the lease is not renewed for 180 s it lapses; on reconnection the client claims it again. Whether today's client does that without help is [UNVERIFIED: test by cutting the network for 4 minutes mid-wave] |
| Game files, speech | Cached by the browser and in IndexedDB, so a reload in a poor connection is quick |
| Full offline play | Not in the platform's first releases; the family plan's offline gate (Gate K) would serve schools well later |

School networks put a whole class behind one public IP address. No rate limit or WAF rule may treat 30 devices on one
address as an attack ([10](10-data-and-api.md)).

---

## 13. Devices

| Device | Notes |
|---|---|
| Windows laptops and PCs | The most common in primaries: 93% of primary IT leads report "Any windows" [VERIFIED DfE Technology in Schools survey 2024–25, Table 5.3, https://assets.publishing.service.gov.uk/media/692834a6ce50d215cae9610e/Technology_in_schools_survey_2024_to_2025_research_report.pdf] |
| Chromebooks | 27% report Chrome OS (same table) |
| iPads (Safari) | Common in KS1 classrooms [UNVERIFIED: the survey table does not give an iPadOS share]. Managed iPads get a home-screen web clip to the school's address; the iPad app comes Later (PD-18) |
| Interactive whiteboard | For the class code and QR (teacher's board view). A pupil signing in on the whiteboard works like any touch screen |
| Phones (at home) | The QR card is scanned by a phone; the game is designed for tablet and laptop screens, so a phone shows "best on a tablet or computer" but still works [PROPOSAL] |

Minimum supported versions follow the family edition's browser list ([D](../plan/D-ux-and-content-operations.md)),
re-checked against a pilot school's devices.

---

## 14. Performance

| Moment | Target [PROPOSAL] | Risk today |
|---|---|---|
| First load of the start page on a school connection | Under 3 s to the "I'm at school" button | Bundle size: staff code must stay out of the pupil bundle ([02 §5](02-environments-and-delivery.md#5-code-on-the-dev-branch)) |
| Sign-in (code → grid → pictures → Home) | Each step under 1 s at the server | Cognito custom auth triggers must answer within 5 s ([04](04-identity-and-access.md)) |
| **A class pressing Play together** | 30 runs started within 20 s, none refused | Today `POST /api/runs` is throttled at 1 request per second, burst 5, **for all callers together** [VERIFIED `infrastructure/main/main.tf:672-688`]. Thirty pupils would be refused. The platform needs higher, per-school limits ([10](10-data-and-api.md)) |
| Five classes at 9:05 | No errors; sign-in and run creation within the targets above | A load test is a Launch exit criterion ([11](11-privacy-security-and-assurance.md)) |

---

## 15. What changes in `web/player`

| Area | Change [PROPOSAL] |
|---|---|
| Routing | New routes: `/` (school start), `/class` (code and grid), `/q/:handle` (QR card), `/pictures`, `/avatar`, status pages. `/setup` and `/auth/callback` are not used by the schools edition |
| Auth | Replace managed-login redirect with calls to the pupil sign-in API ([04](04-identity-and-access.md)); session storage per sign-in route (§7); Finish revokes |
| Edition | An `edition` setting (`family` or `schools`) picks routes, sign-in and Home ([02 §5](02-environments-and-delivery.md#5-code-on-the-dev-branch)) |
| School branding | The start page shows the school's name and badge from a public, cacheable school profile (name and badge only) |
| Home | This week card; filter maps by the class's allowed list; Continue merged into the This week card |
| Play | Handle "paused" and "resting" answers from lease renewal and run ops; school runs use block planning |
| Progress, Settings | Child-friendly topic list; no resets; reduced-motion switch |
| Tests | Unit tests per screen; e2e: class sign-in, QR sign-in, lock-out, Finish on a shared device, pause mid-wave; axe scans on every new screen |

---

## 16. Decisions for the owner

| ID | Proposal |
|---|---|
| PUP-Q1 | Picture password: three of nine pictures in order, no repeats, grid in a fixed order |
| PUP-Q2 | Lock-out: 5 wrong in a row → 5-minute wait; 10 wrong in 24 hours → the teacher unlocks (the numbers in [04](04-identity-and-access.md)) |
| PUP-Q3 | Class sign-in stays open 60 minutes by default (the teacher can close or extend it) |
| PUP-Q4 | Idle sign-out after 20 minutes; `sessionStorage` for class sign-in, kept for up to 12 hours for QR sign-in at home |
| PUP-Q5 | Phones work but are not a design target |
| PUP-Q6 | A class pause takes effect within 60 seconds, through the lease renewal |
| PUP-Q7 | Pupils cannot reset their own progress; teachers can |
| PUP-Q8 | Avatars come from the published aliens; a pupil can change theirs at any time |

---

## 17. User stories

*Snapshot of 2026-11-21. The source of truth for these stories is now Jira (project SCD); see
[README §6](README.md#6-user-stories-and-jira). Edit the tickets, not this table.*

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| PUP-1 | As a pupil, I want to open my school's page and press "I'm at school", so that I can start signing in | `<school>.spacecolonydefence.com/` shows the school name and badge and the button; no class or pupil names appear | Pilot |
| PUP-2 | As a pupil, I want to type the code on the board, so that I can find my class | Six-letter code, big keyboard, speaker read-back; a right code while sign-in is open shows the class grid; a wrong code shows the retry message and reveals nothing | Pilot |
| PUP-3 | As a pupil, I want to scan the class QR on the board, so that I don't have to type | The board QR opens the grid directly while sign-in is open, and the closed screen otherwise | Pilot |
| PUP-4 | As a pupil, I want to tap my own name and alien, so that I sign in as me | Grid shows first name, last initial and avatar, sorted by first name; works by touch, mouse and keyboard | Pilot |
| PUP-5 | As a pupil, I want to tap my three pictures, so that only I can sign in as me | Three of nine in order; dots and "start again"; correct → Home (or avatar picker first time); wrong → shake and retry with no hint | Pilot |
| PUP-6 | As a Year 4 pupil whose class uses typed passwords, I want to type my password, so that I sign in like older children | When the class setting is typed, the password box replaces the pictures; case-blind; same lock-out | Pilot |
| PUP-7 | As a pupil at home, I want my grown-up to scan my card, so that I can play homework | `/q/<handle>` shows only my avatar and first name, then my pictures; a replaced or unknown card shows the "can't find this card" screen with no names | Pilot |
| PUP-8 | As a pupil, I want to pick my alien the first time, so that I can find my tile next time | Avatar picker on first sign-in; choice saved; changeable in Settings | Pilot |
| PUP-9 | As a teacher, I want a pupil who keeps getting their pictures wrong to be stopped, so that classmates can't guess their way in | 5 wrong → 5-minute wait; 10 in 24 hours → locked screen; the teacher unlocks from the portal; a correct sign-in resets counts | Pilot |
| PUP-10 | As a pupil, I want This week at the top of Home, so that I play what my teacher set | This week card with map drawing, child-word topics, end date and Play or Carry on; absent when nothing is set or the end date has passed | Pilot |
| PUP-11 | As a pupil, I want to see only the maps my class can play, so that I'm not confused | More maps lists only the maps the class allows | Pilot |
| PUP-12 | As a pupil, I want the questions to match my year and what we're learning, so that it helps in class | Runs pin the pupil's year group (or working-at year); activities follow [08 §4.4](08-learning-content.md#44-choosing-activities); a This week change reaches a running campaign within 10 waves | Pilot |
| PUP-13 | As a pupil, I want to press Finish, so that the next child can use the iPad | Ops flushed, lease released, session revoked, local pupil data cleared; back button shows the start page | Pilot |
| PUP-14 | As a teacher, I want idle pupils signed out, so that a pupil left on a device isn't used by someone else | 20 minutes idle → 60-second warning → sign-out as Finish | Pilot |
| PUP-15 | As a pupil, I want to be told kindly when the teacher pauses the game, so that I stop without losing anything | Paused screen within 60 s of the teacher's pause; game saved to the last checkpoint; Finish button | Pilot |
| PUP-16 | As a pupil, I want to see my stars and badges, so that I can see what I've done | Progress shows maps, stars, badges and practised topics in child words; no percentages, statuses or other pupils | Pilot |
| PUP-17 | As a teacher, I want pupils unable to reset their own progress, so that my records stay complete | School pupils' Settings has no resets; the API refuses pupil resets in the schools edition | Pilot |
| PUP-18 | As a pupil, I want to be told kindly when my school's game is resting, so that I know to ask my teacher | Suspended school → resting screen at sign-in and within 60 s during play; no money words | Launch |
| PUP-19 | As a pupil who can't read yet, I want to hear every instruction, so that I can sign in and play on my own | Speaker buttons on every sign-in and status screen; pictures have spoken names; clips pre-rendered and cached | Pilot |
| PUP-20 | As a pupil who uses a switch or keyboard, I want to sign in without touching the screen, so that I can play like everyone else | Every sign-in step works with Tab, Enter and Space in order; axe scan clean; manual test with a switch | Launch |
| PUP-21 | As a pupil sensitive to motion, I want animations off, so that the game is comfortable | System reduced-motion respected; in-app switch; no shake or countdown animation when on | Pilot |
| PUP-22 | As a teacher, I want a whole class to start playing at once, so that the lesson isn't lost to errors | 30 pupils from one IP sign in and start runs within 20 s with no refusals; load-test evidence | Launch |
| PUP-23 | As a pupil playing on another device, I want to choose to carry on here, so that I'm not stuck | Second device offers "Play here instead?"; taking over ends the first device's play cleanly | Pilot |
| PUP-24 | As a pupil with a flaky connection, I want my game to keep going and save when the Wi-Fi comes back, so that I don't lose my wave | Ops queue retries; a 4-minute drop mid-wave recovers without data loss (test) | Launch |
| PUP-25 | As a parent at home on a phone, I want the card link to work, so that my child can play homework | QR link works on phone browsers; "best on a tablet or computer" note; sign-in and play function | Launch |
| PUP-26 | As the owner, I want the pupil app free of tracking and outside links, so that schools can trust it | CSP enforced; no third-party script or external link in the bundle (checked in CI) | Pilot |
