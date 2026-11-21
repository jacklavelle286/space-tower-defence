# 01. Product, people and roles

Part of the [platform scope](README.md). Status: scope, parked.

---

## 1. The product in one paragraph

Schools in England buy Space Colony Defence for pupils in Years 1 to 4. A school's staff sign in at
`<school>.spacecolonydefence.com/staff`, invite colleagues, create classes, enrol pupils (one at a time or from a CSV)
and print sign-in cards. Pupils sign in on the same address with a class code or their QR card and a picture password,
then play the same tower-defence game as today. The learning activities between waves match their year group and what
their teacher set this week. Teachers see each pupil's practice by topic. Every term the school is invoiced automatically
for its enrolled pupils and pays by bank transfer, card or Direct Debit. The owner enrols schools, runs billing and makes
all content at `admin.spacecolonydefence.com`, with AI help for drafting questions and art that the owner reviews before
anything reaches a child [CONFIRMED by owner 2026-11-21: PD-5 to PD-14].

---

## 2. People

| Who | Account | Where | Typical person |
|---|---|---|---|
| **Owner** | Operator pool, MFA required | Console | You |
| **School Admin** | Staff pool | Portal | Head teacher, deputy, computing lead, school business manager |
| **Teacher** | Staff pool | Portal | Class teacher; possibly a teaching assistant given a class |
| **Read-only** | Staff pool | Portal | Head teacher who wants to look, subject lead, SENCo |
| **Billing admin** | Staff pool (a flag, alone or with an access level) | Portal, Billing page | School business manager, finance officer |
| **Pupil** | Pupil pool, no email | School address `/` | Year 1 to Year 4, ages 5 to 9 |
| Parent or carer | **None** | Plays at home with the pupil's QR card | — |
| School data protection officer, school IT | None | Reads the privacy pack; allow-lists our domains | — |
| Prospective school | None | Marketing site, demo school | — |

A staff member belongs to **one school** in the first releases. The data model allows several (trust staff, supply
teachers) later [PROPOSAL].

---

## 3. Roles

### 3.1 School roles [CONFIRMED by owner 2026-11-21, PD-7 and PD-8; details PROPOSAL]

A staff member has **one access level** (Admin, Teacher, Read-only, or none) and, separately, may be a **Billing
admin**. Admins can always do billing. A billing-only person (access level none) sees only the Billing page.

| Can… | Admin | Teacher | Read-only | Billing admin (only) |
|---|---|---|---|---|
| See all classes, pupils and progress | ✔ | own classes | ✔ | — |
| Create a class | ✔ | ✔ (becomes its teacher) | — | — |
| Edit a class's name, year groups, settings | ✔ | own | — | — |
| Change a class's teacher, archive a class | ✔ | — | — | — |
| Enrol pupils (one, list, CSV) | ✔ (any class) | ✔ (into own classes) | — | — |
| Remove a pupil from a class (stays enrolled) | ✔ | own classes | — | — |
| Move a pupil between classes | ✔ | — | — | — |
| Un-enrol (archive) or delete a pupil | ✔ | — | — | — |
| Reset sign-in, see a pupil's password, reissue a QR card, unlock | ✔ | own classes | — | — |
| Open class sign-in, print cards | ✔ | own classes | — | — |
| Set This week, turn maps on or off, pause a class | ✔ | own classes | — | — |
| Export progress (CSV) | ✔ | own classes | ✔ | — |
| Invite, remove staff; change roles | ✔ | — | — | — |
| School settings (name, badge, sign-in methods, defaults) | ✔ | — | — | — |
| Data export of everything; request deletion | ✔ | — | — | — |
| Audit log; grant support access | ✔ | — | — | — |
| Billing: invoices, pay, payment method, Direct Debit, PO numbers, billing contacts | ✔ | — | — | ✔ |
| See enrolled-pupil counts (numbers only) | ✔ | — | ✔ | ✔ |

The permission names behind each tick, and how they are checked, are in
[04 §5](04-identity-and-access.md#5-access-control-rbac). Rules that keep a school working:

- A school always has at least one active Admin. The last Admin cannot be removed or demoted; only the owner can
  replace them, after checking with the school (support process, [05](05-platform-console.md)).
- A class has exactly one teacher [CONFIRMED by owner, PD-8]. When a teacher leaves, an Admin gives their classes to
  someone else before or when removing them. Removing a teacher who still has classes asks who takes each class.
- Teachers enrolling pupils add to the school's bill. The portal says so at the point of enrolling, and Admins can set
  an optional **enrolment limit** above which only Admins can enrol ([06](06-school-portal.md), [09](09-billing.md)).

### 3.2 Platform roles

| Role | Can | First release? |
|---|---|---|
| **Owner** | Everything in the console | Yes, the only role |
| Support | See school details and staff, request support access, help with sign-in | Later |
| Content editor | Content only (levels, maps, aliens, questions, speech, publishing) | Later |
| Finance | Plans, invoices, payments, reports | Later |

The console checks named permissions, not "is the owner", so these roles can be added without rewriting it
[PROPOSAL].

### 3.3 Pupil

A pupil can play, see their own progress, choose an avatar and sign out. A pupil never sees another pupil's progress,
any adult's details or anything about billing.

---

## 4. Rules that shape every layer [PROPOSAL unless marked]

| # | Rule | Why |
|---|---|---|
| R1 | A school's data is visible only to that school's staff, and to the owner only through audited, time-limited **support access** the school can see | Schools are the data controllers; we stay their processor ([11](11-privacy-security-and-assurance.md)) |
| R2 | Pupil data is minimal: first name, last initial, year group, class, an optional school reference, sign-in secret, avatar, play and practice records | Data minimisation; no date of birth, email, photo or full surname |
| R3 | **No AI in the pupil or staff experience.** AI only helps the owner draft content, which the owner reviews before publishing [CONFIRMED by owner, PD-11] | Safety, cost, and a simpler DPIA |
| R4 | No pupil-to-pupil messaging, no public content, no adverts, no tracking, no third-party scripts in pupils' pages | Safeguarding and the Children's code |
| R5 | Anything a teacher does to one pupil can be done to a whole class (bulk enrol, bulk print, bulk reset) | Thirty children, one adult |
| R6 | Money problems never surprise a child. Reminders go to adults; only the owner can suspend a school | Fairness, reputation |
| R7 | Every pupil plays the same game. What adapts is the learning content (year group, teacher's topics) | Matches today's game rules (prompt.md:99) |
| R8 | Teacher reports are **practice records, not assessments**. No grades, no rankings, nothing shown to pupils about others | The game cannot measure attainment |
| R9 | Works on school devices: iPad Safari, Chromebooks, Windows laptops, interactive whiteboards; touch, mouse and keyboard | That is what classrooms have |
| R10 | Accessible to WCAG 2.2 AA in both the pupil app and the portal | Schools must meet accessibility duties |

---

## 5. The main journeys

| # | Journey | Steps | Detail |
|---|---|---|---|
| J1 | **Enrol a school** (owner) | Details and URN, slug, plan and trial, first Admin's email → the school's address works and the Admin is invited | [05](05-platform-console.md) |
| J2 | **First Admin sets up** | Accepts the invite, sets a password and MFA, accepts the terms and DPA, invites teachers, checks billing details | [06](06-school-portal.md), [04](04-identity-and-access.md) |
| J3 | **Teacher sets up a class** | Signs in, creates "Year 2 Oak", uploads a CSV of 28 pupils, reviews the preview, confirms, prints QR cards and the password sheet | [06](06-school-portal.md) |
| J4 | **First lesson** | Teacher opens class sign-in; pupils enter the code, tap their name, tap their pictures, choose an avatar, play This week | [07](07-pupil-experience.md) |
| J5 | **Homework** | At home a parent scans the QR card in the homework book; the pupil taps their pictures and plays | [07](07-pupil-experience.md) |
| J6 | **Teacher checks progress and sets This week** | Class grid shows who is practising what; teacher picks next week's topics and map | [06](06-school-portal.md), [08](08-learning-content.md) |
| J7 | **Termly invoice** | Stripe makes the invoice on the billing date for the enrolled count; the Billing admin adds the PO and pays by bank transfer | [09](09-billing.md) |
| J8 | **New school year** | Admin runs the new-year wizard: classes move up, Year 4 leaves, new Year 1 is enrolled by CSV | [06](06-school-portal.md) |
| J9 | **A school leaves** | Renewal turned off → the licence ends → 90 days to export → data deleted; invoices kept | [09](09-billing.md), [11](11-privacy-security-and-assurance.md) |

---

## 6. Releases

| Release | Goal | Contents (epics in [13](13-delivery-plan.md)) |
|---|---|---|
| **Pilot** | One school (the owner's children's school), free, one or two terms | Dev and prod accounts; domains; console: schools and content; staff email, password and MFA; roles; classes; pupils (one at a time and CSV); QR cards, class codes, picture and typed passwords; Years 1–4 content (first set); This week; progress basics; demo school; DPA, DPIA and privacy pack drafts |
| **Launch** | Paying schools | Billing (Stripe, termly invoices, all payment methods, PO numbers, overdue handling); Microsoft and Google sign-in; new school year; data export and deletion tools; support access; marketing site and sales kit; penetration test, Cyber Essentials, accessibility audit; load test |
| **Later** | Growth | iPad app; trusts (several schools, one contract); teachers' own questions; MIS roster sync; family subscription; schools' own domains; more year groups or subjects |

---

## 7. Not in scope

- Reception, Years 5 and 6, and schools outside England [CONFIRMED by owner, PD-10, PD-16].
- Parent accounts, until the family subscription (Later) [CONFIRMED by owner, PD-18].
- Teacher-made maps (the map editor stays the owner's) [CONFIRMED by owner 2026-11-21, earlier answer].
- Chat, friends, leaderboards between pupils or schools, user-generated public content.
- AI tutors or any generative AI that pupils or teachers interact with [CONFIRMED by owner, PD-11].
- Changes to the family edition at `aliens.jackgl.com` [CONFIRMED by owner, PD-1].
