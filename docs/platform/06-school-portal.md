# 06. School portal

Part of the [platform scope](README.md). Status: scope, parked.

---

## 1. Summary

Each school's staff work at **`<slug>.spacecolonydefence.com/staff`** (PQ-1). It is a separate single-page app,
`web/portal` ([02 §5](02-environments-and-delivery.md#5-code-on-the-schools-branch)), on the same address as the
school's pupils, who use `/`. In the portal, staff:

- invite colleagues;
- create classes;
- enrol pupils, one at a time or **from a CSV** [CONFIRMED by owner 2026-11-21: "teacher can uploads csvs of students
  which enrolls them all in the platform"];
- print sign-in cards and open class sign-in;
- set This week;
- see progress;
- pay invoices.

Roles are exactly those of [01 §3.1](01-product-and-roles.md#31-school-roles-confirmed-by-owner-2026-11-21-pd-7-and-pd-8-details-proposal):

- **Admin**: everything at the school.
- **Teacher**: their own classes. One teacher per class [CONFIRMED by owner, PD-8].
- **Read-only**: sees all classes, pupils and progress.
- **Billing admin**: the Billing page; Admins can always do billing.

The API checks every action against the staff member's role on every request ([04 §5](04-identity-and-access.md#5-access-control-rbac));
hiding a button is a convenience, not the control.

Example names in this document ("Example Primary School", "Year 2 Oak", "Test Pupil") are made up.

---

## 2. Sign-in and first-time setup

### 2.1 Signing in

| Release | How staff sign in |
|---|---|
| **Pilot** | Email and password on the school's own sign-in page, then **MFA**: a code from an authenticator app, or a code sent by email [CONFIRMED by owner, PD-9]. The page shows the school's display name and badge. How it is wired is in [04](04-identity-and-access.md) |
| **Launch** | "Sign in with Microsoft" and "Sign in with Google" appear when the school's Admin turns them on (section 12). MFA then comes from the school's own Microsoft or Google settings: Cognito does not add its own MFA for federated users [VERIFIED docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html, read 2026-11-21] |

- MFA is required for every email-and-password account. The DfE cyber security standard says "MFA must be enabled for
  all … staff accounts with access to cloud services" [VERIFIED gov.uk, cyber security core standard, updated 16 Sep
  2026].
- Guess limits are at least as strict as the same standard's "no more than 10 guesses in 5 minutes" ([04](04-identity-and-access.md)).
- **Forgotten password**: a code by email, then a new password. MFA is still asked for.
- **Wrong school**: a staff member of another school, or one who was removed, sees "You don't have access to Example
  Primary School". The membership is checked on every request, so removal takes effect at once.
- **Idle**: the portal signs out after 60 minutes without input, with a warning 2 minutes before ([04](04-identity-and-access.md)).

### 2.2 Accepting an invitation

1. The invitation email (from `no-reply@spacecolonydefence.com`, [03](03-domains-edge-and-email.md)) names the school,
   who invited them and their role, and links to the school's sign-in page. **The link expires after 7 days**
   [PROPOSAL, SCH-Q10]; an Admin can resend it.
2. The new staff member sets a password and sets up MFA (Pilot), or signs in with Microsoft or Google when the school
   uses those (Launch).
3. They land on their dashboard (section 3).

### 2.3 Terms and data processing agreement

- The **first Admin** must accept the terms of service and the **data processing agreement (DPA)** before anything
  else. The page shows both documents with their version numbers. A tick reads "I am authorised to accept these on
  behalf of Example Primary School".
- The acceptance records the document versions, the staff member and the time [PROPOSAL].
- Until it is accepted the school stays **Pending**, and no classes or pupils can be created. No pupil data is processed
  before the DPA is in place (CON-Q3, [05 §5.6](05-platform-console.md#56-lifecycle)).
- When the owner publishes a new version ([05 §11.4](05-platform-console.md#114-settings)), Admins see a banner. After
  the version's effective date, an Admin must accept it before continuing. Other staff are not interrupted [PROPOSAL,
  SCH-Q12].

### 2.4 Setup checklist

The first Admin's dashboard shows a checklist until every item is done. Each item ticks itself and links to its page.

1. Accept the terms and DPA.
2. Check the school's details and add the badge.
3. Invite staff.
4. Create classes.
5. Enrol pupils (one at a time or by CSV).
6. Print sign-in cards.
7. Open class sign-in for the first lesson.

Teachers get a shorter checklist for their own class: create or check the class, enrol pupils, print cards, open class
sign-in.

---

## 3. Layout, navigation and dashboards

### 3.1 Navigation by role

Items a role cannot use are hidden, not greyed out.

| Item | Admin | Teacher | Read-only | Billing admin only |
|---|---|---|---|---|
| Dashboard | ✔ | ✔ | ✔ | (goes straight to Billing) |
| Classes | All | Own | All (read) | — |
| Pupils | All | Pupils in own classes | All (read) | — |
| Progress | All | Own classes | All | — |
| Staff | ✔ | — | List only (names and roles) [PROPOSAL] | — |
| Billing | ✔ | — | Counts only | ✔ |
| Settings | ✔ | — | — | — |
| Audit log | ✔ | — | — | — |
| Help | ✔ | ✔ | ✔ | ✔ |
| My account | ✔ | ✔ | ✔ | ✔ |

A staff member who is a Teacher **and** a Billing admin sees both sets.

### 3.2 Dashboards

| Role | Shows |
|---|---|
| Admin | Setup checklist (until done). Licence status: trial end or next billing date, enrolled pupils. Alerts: overdue invoice, unassigned pupils, locked pupils, pending invitations, documents to accept, support access requests. Pupils playing now (count). Quick links |
| Teacher | A card per class: pupils, playing now, This week, and an **Open class sign-in** button. A "Needs help" list: pupils locked out, and pupils still practising a This week topic after several sessions ([08](08-learning-content.md)). Recently enrolled |
| Read-only | Classes with counts and This week; a school-wide practice summary |
| Billing admin only | The Billing page |

Banners appear above every dashboard when they apply:

- announcements from the owner ([05 §9.4](05-platform-console.md#94-announcements));
- the licence ending;
- the school suspended;
- support access active.

**While the school is suspended** ([09 §10.2](09-billing.md#102-suspension-proposal-pq-14)): every staff member can
still sign in; Admins and Billing admins can pay and export; nothing else can be changed, so Teachers and Read-only see
the portal read-only; pupils can't sign in and see the "resting" screen ([07 §8](07-pupil-experience.md#8-status-screens)).
Only the owner suspends or reinstates a school.

---

## 4. Staff

Admins only, except My account (section 4.6).

### 4.1 Staff list

| Column | Notes |
|---|---|
| Name | As entered at invitation; the person can change it in My account |
| Email | Their sign-in address |
| Access | Admin, Teacher, Read-only or none |
| Billing admin | Yes or no |
| Sign-in | Email and password, Microsoft or Google |
| Status | Invited (with expiry), Active, Removed (kept for the audit log) |
| Classes | Classes they teach |
| Last sign-in | Date |

Filters: access level, status, Billing admin. Search by name or email.

### 4.2 Invite

- **Fields**:
  - email;
  - name;
  - access level (Admin, Teacher, Read-only, or none for a billing-only person);
  - Billing admin tick.

  Up to 20 people in one go by pasting a list of emails, all with the same access [PROPOSAL].
- **Checks**:
  - the email format;
  - the person is already a member ("already on your staff list");
  - an address on a common personal webmail domain gives a warning: "Is this a school address?" [PROPOSAL].
- **The email** names who invited them. The invitation expires in 7 days; it can be resent or cancelled.
- **Audit**: inviter, invitee and role are written to the audit log (section 13).

### 4.3 Change access

- Access level and Billing admin can be changed at any time; the change applies on the person's next request.
- Promoting to Admin asks for confirmation: "Admins can see every pupil, manage staff and pay invoices."
- **Demoting the last Admin is refused** (section 4.5).

### 4.4 Remove

1. If the person **teaches classes**, the dialog lists each class with a teacher picker. Every class must be given to
   another Teacher or Admin before the removal completes: a class always has one teacher [CONFIRMED by owner, PD-8].
2. Removal ends their membership, signs them out everywhere, and disables their email-and-password account
   ([04](04-identity-and-access.md)). Someone who signs in with Microsoft or Google loses access here even if their
   school account still works.
3. The person stays in the list as **Removed**, with name and email, so the audit log still makes sense. Their entry
   is deleted with the audit records after 2 years [PROPOSAL, SCH-Q9; PQ-15].

### 4.5 The last-Admin rule

- A school always has at least one active Admin. The portal refuses to remove or demote the last one, and tells them to
  promote someone else first.
- If the last Admin leaves anyway, only the owner can put in a new one, after calling the school back
  ([05 §9.2](05-platform-console.md#92-replacing-a-lost-last-admin)).

### 4.6 My account

Every staff member can:

- change their display name;
- change their password (email-and-password accounts);
- manage MFA: add an authenticator, switch to email codes, see when MFA was set up;
- **sign out everywhere**;
- see their access level and Billing admin flag (read-only).

---

## 5. Classes

### 5.1 Class list

| Column | Notes |
|---|---|
| Class | Name, e.g. "Year 2 Oak" |
| Year groups | One or more of Y1–Y4; mixed-age classes are common in small schools |
| Teacher | One teacher [CONFIRMED by owner, PD-8] |
| Pupils | Enrolled pupils in the class |
| Pupil sign-in | Picture or typed (PD-13) |
| This week | Topic sets and end date, or "Nothing set" |
| Playing now | Count |
| Status | Active or Archived |

Admins and Read-only see every class. Teachers see only their own [01 §3.1].

### 5.2 Create a class

| Field | Rules |
|---|---|
| Name | 1–40 characters; unique among the school's active classes |
| Year groups | At least one of Y1–Y4 |
| Teacher | An Admin picks any Teacher or Admin. A Teacher creating a class becomes its teacher [01 §3.1] |
| Pupil sign-in | Picture password (default) or typed password [CONFIRMED by owner, PD-13] |
| Home play | On (default) or off (section 9.3) |

Creating a class does not enrol anyone. The class page opens on its empty Pupils tab, with two buttons: **Add a pupil**
and **Upload a CSV**.

### 5.3 The class page

| Tab | Contents | Who |
|---|---|---|
| Pupils | The class roster, with bulk actions (section 6) | Admin; the class's Teacher; Read-only (read) |
| This week | Section 9.1 | Admin; Teacher (own); Read-only (read) |
| Progress | Section 10 | Admin; Teacher (own); Read-only |
| Sign-in | Open class sign-in, print cards, password sheet (section 8) | Admin; Teacher (own) |
| Settings | Name, year groups, pupil sign-in, home play, maps on or off, pause; teacher (Admin only) | Admin; Teacher (own, except teacher) |

### 5.4 Changing a class

- **Year groups**: pupils keep their own year group; a warning lists any pupil whose year group is no longer one of the
  class's.
- **Teacher** (Admin only): the old teacher loses access to the class at once and the new one gains it.
- **Pupil sign-in**: picture to typed or back. Every pupil in the class gets a new secret of the new kind, so the teacher
  must print a new password sheet. The portal says so before confirming (section 8.5).

### 5.5 Archive a class

Admin only.

- **Pupils**: they become **unassigned**, so they are still enrolled and still on the school's bill. A tick, "also
  un-enrol all its pupils", archives them instead (section 6.7).
- **Sign-in**: the class code stops working.
- **History**: the class stays visible as Archived, read-only, so its history makes sense. Pupils keep their progress
  wherever they go.

---

## 6. Pupils

### 6.1 What a pupil record holds

[PQ-9; rule R2]

| Held | Not held |
|---|---|
| First name; **last initial only**; display name (default "First L"); year group (Y1–Y4); class or unassigned; optional **school reference** (≤ 20 characters, the school's own number); avatar (chosen by the pupil); sign-in secret (picture or typed, [04](04-identity-and-access.md)); QR card handle; status; who enrolled them and when | Date of birth, full surname, email, photo, gender, address, **unique pupil number (UPN)**, special needs or any other sensitive data |

The **display name** is what pupils see on the sign-in grid and what teachers see everywhere. Staff can change it to
tell two pupils apart (e.g. "Test P" and "Test Pa"), but a warning appears if it looks like a full surname has been
typed [PROPOSAL].

### 6.2 Pupil list

- **Columns**: display name, year group, class, status (Enrolled, Unassigned, Archived, Locked), last played, reference
  (Admins only).
- **Search** by name or reference.
- **Filters**: class, year group, status.
- **Bulk actions** on selected pupils:
  - print cards;
  - reset sign-in;
  - remove from class;
  - move (Admin);
  - un-enrol (Admin).

| Role | Sees |
|---|---|
| Admin | Everyone, including **unassigned** and **archived** pupils |
| Teacher | Pupils in their own classes |
| Read-only | Everyone except archived pupils |

### 6.3 Add a pupil

A short form: first name, last initial, year group (pre-filled when the class has one), and reference (Admin).

- **Possible duplicate**: a pupil with the same display name already in the class gives a warning, with "Add anyway" or
  "Cancel".
- **Billing note**: shown on the form (section 7.6).
- **Enrolment limit**: checked for Teachers (section 6.8).

The new pupil gets a random picture password, or a typed one, according to the class setting, and a QR card handle.
"Print this pupil's card" is offered at once.

### 6.4 Edit a pupil

| Field | Who can change it |
|---|---|
| First name, last initial, display name, year group | Admins; the Teacher of the pupil's class |
| Reference | Admins |
| Avatar | Admins and the class's Teacher can reset it, so the pupil chooses again at the next sign-in |

Every change is audited.

### 6.5 Remove from a class

[PQ-10] Admins, and the Teacher of the class, can remove a pupil from a class.

- The pupil becomes **unassigned**: still enrolled, still able to sign in with their QR card, and **still counted on the
  school's invoices**.
- Admins see an **Unassigned** list with a count. When there are any, the Billing page says, e.g., "3 unassigned pupils
  are counted on your next invoice".
- From that list, an Admin moves each pupil to a class or un-enrols them.

### 6.6 Move

Admins only: to another class, or to unassigned.

- **Year group**: optionally updated in the same step.
- **QR card**: the pupil's card keeps working.
- **Sign-in method**: if the new class uses a different one, the pupil gets a new secret of that kind, and the move
  dialog says so.

### 6.7 Un-enrol, restore, delete

Admins only [01 §3.1].

| Action | Effect |
|---|---|
| **Un-enrol** (archive) | The pupil can no longer sign in, and their QR card stops working. They are **not counted on invoices made after this moment** (PD-12 counts pupils enrolled when the invoice is made). Their data is kept for 90 days, then deleted [PROPOSAL, SCH-Q5] |
| **Restore** | Within the 90 days: the pupil is enrolled again, with their progress; a new QR card is needed if the old one was printed |
| **Delete now** | Permanent: the pupil record, sign-in identity and game data are deleted at once. The Admin types the pupil's display name to confirm. The audit log keeps "pupil deleted" with the pupil's ID and initials only |

### 6.8 Enrolment limit

An Admin can set an optional **enrolment limit** in Settings (section 12). Above it only Admins can enrol
[01 §3.1]. Teachers then see "Your school allows enrolments up to 240 pupils; 236 are enrolled. Ask an Admin to enrol
more." The limit applies to single adds and CSV uploads alike; a CSV that would go over is refused as a whole, with the
numbers shown.

---

## 7. CSV enrolment

[CONFIRMED by owner 2026-11-21: teachers can upload a CSV that enrols every pupil in it. Details PROPOSAL.]

### 7.1 Who and where

| Role | Where | Into |
|---|---|---|
| Teacher | Class page → Pupils → **Upload a CSV** | That class only. A `class` column, if present, is ignored with a note |
| Admin | Pupils → **Upload a CSV**, or a class page | The chosen class, or per row from a `class` column (any class, or `unassigned`) |

### 7.2 Template and columns

**Download template** gives `pupils-template.csv`: a header row and two rows of made-up example data.

| Column | Required | Rules |
|---|---|---|
| `first_name` | Yes | 1–30 characters after trimming. Letters (any alphabet, accents allowed), spaces, hyphens, apostrophes |
| `last_name` | No | **Only its first letter is kept**, as the last initial; the rest never leaves the browser (section 7.4). A single letter is also accepted |
| `year_group` | Yes, unless the class has a single year group | `1`–`4`; `Y1`–`Y4` and `Year 1`–`Year 4` are accepted |
| `class` | Admin uploads only, optional | An existing class name (any case), or `unassigned`. Admins can tick "create classes that don't exist yet": each new class needs a year group and a teacher in the next step |
| `reference` | No | The school's own reference, ≤ 20 characters. Used to recognise a pupil already enrolled (section 7.9) |

Column mapping (section 7.4) also recognises the header names schools' MIS exports commonly use:

- `Forename`, `Legal forename`, `Preferred forename` → `first_name`;
- `Surname`, `Legal surname` → `last_name`;
- `Year`, `NC year`, `Year group` → `year_group`;
- `Reg group`, `Registration group`, `Class` → `class`;
- `Admission number`, `Adno` → `reference`.

**`UPN` and any other column are ignored and never sent** [PROPOSAL, SCH-Q3]. The list of header names to recognise is
checked against real exports during the pilot [ASSUMPTION].

### 7.3 File rules

| Rule | Value [PROPOSAL, SCH-Q2] |
|---|---|
| Type | `.csv`. Separator detected: comma, semicolon or tab |
| Encoding | UTF-8 with or without a byte-order mark. A file that is not valid UTF-8 is read as Windows-1252 (what Excel's plain "CSV" saves), with a warning to check accented names |
| Size | ≤ 1 MB |
| Rows | ≤ 60 for Teachers (one class); ≤ 500 for Admins |
| Header | The first row is a header unless "my file has no header row" is ticked; then columns are mapped by position |
| Blank lines | Ignored |
| Quotes | Standard CSV quoting, so names with commas or quotes work |
| Whitespace | Trimmed from every cell |

### 7.4 Steps

The file is **read in the browser**. Only the fields the platform keeps are sent to our servers:

- first name;
- last initial;
- year group;
- class;
- reference.

Surnames and any other columns never leave the staff member's computer [PROPOSAL, SCH-Q1]. The server checks
everything again; the browser checks are for speed, not trust.

1. **Upload.** Choose or drop the file. It is parsed at once, and a file that breaks the rules in 7.3 stops here with
   the reason.
2. **Map columns.** Each column is mapped to a field by its header, or the user picks from a list. The first five rows
   are shown as they will be read. Unmapped columns are shown as "ignored".
3. **Check.** A table of every row, each with a status and message (section 7.5):
   - **errors** must be fixed, either in the table or by uploading a corrected file;
   - **warnings** can be accepted one at a time or all together.
4. **Confirm.** A summary:
   - N new pupils into which classes;
   - M existing pupils updated (matched by reference);
   - K rows skipped;
   - the billing effect (section 7.6);
   - the enrolment limit check (section 6.8).

   Then **Enrol N pupils**.
5. **Result.** A summary and a downloadable result file (section 7.8), plus **Print cards for these pupils**.

### 7.5 Checks

| Level | Check |
|---|---|
| Error | Missing first name; first name too long or containing digits; year group missing or not 1–4; class not found (Admin) or the row is for a different class (Teacher); two rows with the same reference in the file; the row would take the class over 60 pupils [PROPOSAL] |
| Warning | Same display name as a pupil already in the class (possible duplicate): add anyway or skip |
| Warning | Same reference as an enrolled pupil: update that pupil or skip (section 7.9) |
| Warning | Year group not one of the class's year groups (normal in mixed-age classes) |
| Warning | First name looks like a full name ("Test Pupil" in `first_name`): "Is the surname in the first-name column?" |
| Warning | Same reference as an **archived** pupil: restore them instead of enrolling a new pupil |

### 7.6 Billing effect

Enrolling pupils adds to the school's bill. The school pays per pupil enrolled when each termly invoice is made
[CONFIRMED by owner, PD-12]. The confirm step says:

| Who | Message [PROPOSAL, SCH-Q4] |
|---|---|
| Admin | "After this upload Example Primary School will have 212 enrolled pupils. Your next invoice, on 1 January 2027, is estimated at £… + VAT (212 × £… per pupil)." During the trial: "Free until …; then …". The minimum applies ([09](09-billing.md)) |
| Teacher | "This enrols 28 pupils. Your school is charged for each enrolled pupil every term." No prices or school totals: Teachers do not see billing [01 §3.1] |

### 7.7 Processing

- The browser sends the confirmed rows in **chunks of 50**, with an **upload ID** made when the upload started and each
  row's number.
- The server treats **upload ID + row number** as an idempotency key, so a retried chunk never enrols a pupil twice.
- Each chunk is written in one transaction: per pupil, the pupil record and its QR handle ([10](10-data-and-api.md)).
- An **import record** keeps the upload's progress and counts. If the browser closes part-way, opening Pupils shows
  "An upload is unfinished: resume or discard". Resuming sends only the rows not yet done. The import record expires
  after 30 days.
- When the import finishes, the billing count is updated once, not per pupil ([09](09-billing.md)).
- The audit log gets one entry per upload (who, counts, classes), and each pupil records "enrolled by upload <ID>".

### 7.8 Result report

The result file has:

- the original row number;
- the outcome: created, updated, skipped or failed;
- the message;
- the pupil's display name, class and year group.

Surnames, UPNs and ignored columns are never in it. It can be downloaded for 24 hours.

### 7.9 Uploading again

The same file uploaded twice is safe: rows with a reference match the enrolled pupil and offer **update**, and rows
without one raise the duplicate warning.

**Update** changes first name, last initial, year group and class. Sign-in secrets and QR cards stay as they were.

### 7.10 CSVs we produce

Every CSV the portal exports is protected against formula injection: the pupil list, the progress export, the result
report and the audit log [PROPOSAL]. A cell starting with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading
`'`. Files are UTF-8 with a byte-order mark, so Excel opens accented names correctly.

---

## 8. Sign-in tools

How pupils sign in is in [07](07-pupil-experience.md); how secrets are protected is in [04](04-identity-and-access.md).

### 8.1 Class sign-in

**Open class sign-in** is on the class card on the dashboard and on the class page.

1. Choose a duration: 30, **60 (default)** or 120 minutes.
2. The class gets a **new class code** each time sign-in is opened [PROPOSAL, SCH-Q6]:
   - six letters from consonants only (no vowels, so no accidental words; no easily confused letters);
   - unique within the school while open;
   - the code from yesterday's whiteboard photo no longer works.
3. A full-screen **whiteboard view** shows:
   - the school's address;
   - the code in large, spaced letters;
   - a QR code that opens the class sign-in page with the code filled in;
   - a countdown;
   - **Close sign-in**.
4. While it is open, pupils who enter the code see their class's names and avatars (PQ-11). When it closes, the code
   stops working. Pupils already signed in carry on.

### 8.2 QR cards

- **Per pupil**:
  - display name;
  - school badge;
  - a QR code that opens `https://<slug>.spacecolonydefence.com/q/<handle>`;
  - the address as text;
  - the line "Ask a grown-up to scan this code".
- **Never on the card**: the password.
- **The handle** is random and unguessable, but not a secret (README). Anyone holding the card still needs the pupil's
  password.
- **Formats**:
  - A4 cards, 8 to a sheet, to cut out;
  - homework-book stickers, on common A4 label sheets of 14 or 21 labels [PROPOSAL].
- **Printing**: done from the browser; the card images are made in the page and nothing is sent to a print server.
- **Scope**: print for one pupil, a selection, a class, or the pupils just enrolled.

### 8.3 Password sheet

- **Layout**: an A4 list in class order, each pupil's display name with their pictures in order, or their typed
  password.
- **Footer**: "Keep this sheet in school. Don't send it home."
- **Use**: for the teacher's own use while children learn their passwords.
- **Audit**: printing it is recorded.

### 8.4 A pupil's sign-in

On the pupil's page, Sign-in section (Admins, and the Teacher of the pupil's class):

| Action | Effect |
|---|---|
| **Show password** | Shows the pictures or typed password for 30 seconds; **recorded in the audit log** [PROPOSAL, SCH-Q7] |
| **Reset password** | A new random secret, or the teacher picks the pictures with the child; the old one stops at once |
| **Unlock** | Clears a lock-out after too many wrong tries ([07](07-pupil-experience.md)); the lock reason and time are shown |
| **Reissue card** | A new QR handle; **the old card stops working at once**; print the new one |
| **Sign out everywhere** | Ends the pupil's sessions on every device, e.g. a forgotten classroom iPad |

### 8.5 Switching a class between picture and typed passwords

Class Settings → Pupil sign-in.

1. The dialog says: "Every pupil in Year 4 Example will get a new typed password. Their pictures will stop working.
   Print the new password sheet before the next lesson."
2. On confirm, new secrets are made for the whole class and the password sheet opens.

---

## 9. This week and class settings

### 9.1 This week

What pupils see first after signing in [CONFIRMED by owner, PD-14].

| Field | Rules |
|---|---|
| Map | One released map. Pupils see it as the big card on Home ([07](07-pupil-experience.md)) |
| Topic sets | One to three topic sets offered for the class's year groups ([05 §8.3](05-platform-console.md#83-topic-sets), [08](08-learning-content.md)), each showing how many questions it has |
| End date | Default: the coming Friday. After it, This week clears and pupils see the maps only |

- **Mixed-age classes**: each pupil's questions come from their own year group within the chosen topic sets
  ([08](08-learning-content.md)).
- **Set again**: a one-click "Same as last week" and "Set for next week" [PROPOSAL; next week's plan is Later].
- **Messages to pupils**: none in the first releases (rule R4).

### 9.2 Maps on or off

- The list of released maps, each with a switch. At least one must stay on.
- A class setting, **New maps**, decides whether maps the owner releases later appear for the class automatically.
  It is on by default [PROPOSAL].

### 9.3 Home play

| Setting | Effect |
|---|---|
| **On** (default) | QR cards work at any time, so pupils can play at home [CONFIRMED by owner 2026-11-21, home play through the school login] |
| **Off** | QR cards work only within the school's hours (section 12) [PROPOSAL, SCH-Q8]. Class sign-in works only while open, whatever this setting says (PQ-11) |

### 9.4 Pause

**Pause class** stops play for the whole class: until resumed, for 15 minutes, or until the end of the school day.

- Pupils see "Your teacher has paused the game".
- No new games can start.
- A game already running stops **at its next lease renewal**, within about a minute: the play lease lasts 180 seconds
  and is renewed every 60 seconds [VERIFIED web/player/src/run/lease.ts:1-21; PROPOSAL, SCH-Q13].
- Signing in still works.
- **Resume** lifts it at once.

---

## 10. Progress

### 10.1 What the words mean

Progress pages are **practice records, not assessments** (rule R8). There are no grades, scores or rankings, and nothing
about other pupils is ever shown to a pupil. Each topic has one of three statuses for each pupil: **Not started**,
**Practising** or **Secure**. Their definitions are in [08](08-learning-content.md). They are built from the learning
summaries the game already keeps per pupil and topic (`SUM#<subject>#<topicId>`) [VERIFIED code map].

### 10.2 Class grid

- **Layout**: rows are pupils; columns are topics, This week's first, then others practised recently. Each cell shows
  the status as text and colour, never colour alone.
- **Filters**: topic set, year group, "needs help".
- **Needs help**: pupils still practising a This week topic after several sessions [08].
- **Freshness**: updates as pupils play; the time of the latest data is shown ("updated 1 minute ago").

### 10.3 Pupil page

- **This week**: minutes played and maps played.
- **Topics**: each topic's status, with recent attempts ("correct first time in 7 of the last 10").
- **Badges**.
- **Practice minutes**, per week for the last six weeks.
- **Sign-in**: the section 8.4 tools, for those who may use them.

### 10.4 Topics view

For each topic, how many pupils in the class (or school, for Admins and Read-only) are Not started, Practising or
Secure. Common wrong answers per question are Later [PROPOSAL].

### 10.5 Who is playing now

Pupils of the class with an active play session, with the map and wave, refreshed every 30 seconds. Admins and
Read-only also see a school-wide count. It is based on the play lease the game already keeps [VERIFIED code map:
`U#<sub>`/`SESSION`].

### 10.6 Export

CSV of a class (Teacher, own classes) or of the school (Admin, Read-only):

- display name, year group, class;
- each topic's status;
- practice minutes.

Protected as in section 7.10; the file name carries the date.

---

## 11. Billing

The Billing page is specified in [09 §13](09-billing.md#13-the-schools-billing-page). In brief:

| Who | Sees and does |
|---|---|
| Admin, Billing admin | Plan; enrolled pupils now, including unassigned; next billing date and estimate; invoices with **Pay** (the Stripe-hosted invoice page) and PDF; the purchase order number for the next invoice and the "PO required" setting; billing contacts; payment method and Direct Debit set-up (Stripe-hosted); renewal on or off (off moves the school to Ending, [05 §5.6](05-platform-console.md#56-lifecycle)) |
| Read-only | Enrolled-pupil counts by year group, numbers only [01 §3.1] |
| Teacher | Nothing, apart from the billing note when enrolling (section 7.6) |

---

## 12. School settings

Admins only.

| Setting | What |
|---|---|
| School details | Display name (shown to pupils and staff), badge (PNG or SVG, square, ≤ 1 MB, shown on sign-in pages and cards), **school hours** (default 08:00–15:30, Monday to Friday, London time; used by home play, section 9.3). Invoice name and address are shown read-only; they change through Billing or support |
| Staff sign-in methods | Pilot: email, password and MFA, always on. Launch: **Connect Microsoft 365** and **Connect Google Workspace**. Each has steps for the school's IT (Microsoft needs the school's IT to grant consent; Google needs the school's domain), a test sign-in, then **Turn on**, and optionally "Require it for staff with an @school address". Details in [04](04-identity-and-access.md) |
| Pupil sign-in defaults | The default for new classes (picture or typed). The lock-out rule is shown for information ([07](07-pupil-experience.md)) |
| Enrolment limit | Optional number; above it only Admins can enrol (section 6.8) |
| Data | **Export everything**: a ZIP of CSV and JSON files (staff, classes, pupils without secrets, progress, settings, audit log), prepared in the background, with a download link valid 24 hours. The DfE cloud standard asks for exit data "in an open standard or neutral format" [VERIFIED gov.uk cloud solutions standard, updated 16 Sep 2026]. **Request deletion** of the school's data: goes to the owner to confirm ([05 §9.3](05-platform-console.md#93-data-requests)) |
| Terms and DPA | Accepted versions, who accepted, when; download each; accept a new version (section 2.3) |
| Support access | Grant now (24 or 72 hours, read-only or read-write); requests waiting; history; revoke ([05 §9.1](05-platform-console.md#91-support-access)) |

---

## 13. Audit log

Admins only. Each entry has the time, who did it (a staff member's name, "System", or "Space Colony Defence support"
during support access), the action, the target and details. Filters: person, action type, class, date range. Export as
CSV (section 7.10). Kept 2 years (PQ-15).

Recorded:

| Area | Events |
|---|---|
| Staff | Sign-ins and failed sign-ins; invitations; access changes; removals; MFA changes |
| Classes | Created, changed, teacher changed, archived; class sign-in opened and closed; This week changed; paused and resumed |
| Pupils | Enrolled (one, or by upload), edited, moved, removed from class, un-enrolled, restored, deleted |
| Sign-in | Password shown, reset, unlocked; card reissued; password sheet printed; sign out everywhere |
| Settings | Every change; sign-in method connected or turned on; enrolment limit |
| Billing | PO number entered, billing contact changed, payment method changed, renewal turned off or on |
| Data | Exports prepared and downloaded; deletion requested |
| Legal | Terms and DPA accepted (version, who, when) |
| Support | Access requested, granted, revoked, ended; every page viewed and change made during it |

---

## 14. New school year

Admins only. The wizard is open from 1 July to 31 October [PROPOSAL] and shows on the Admin dashboard in that window.
It moves the school into the next year in one reviewed step (J8, [01 §5](01-product-and-roles.md#5-the-main-journeys)).

1. **Year 4 leavers.** Every Year 4 pupil is listed, all ticked as **Leaving**. Untick any who stay (e.g. a pupil
   repeating a year).
2. **Move up.** Every other pupil's year group goes up by one (Y1→Y2, Y2→Y3, Y3→Y4).
3. **Classes.** For each class, choose:
   - **Keep and rename**, e.g. "Year 2 Oak" becomes "Year 3 Oak", with new year groups and perhaps a new teacher. The
     default: the class moves up with its pupils.
   - **Archive and spread its pupils** into new classes. A per-pupil view handles mixed-age classes that split.
4. **New classes.** Create the new Year 1 classes and any others.
5. **New Year 1 pupils.** Upload a CSV now (section 7), or skip and do it later.
6. **Review**:
   - every change, by class;
   - the number leaving;
   - enrolled pupils before and after;
   - the billing effect for the 1 September invoice (Admins, section 7.6).
7. **Confirm.** Changes apply at once.
   - Leavers are **un-enrolled immediately**, so they are never on the September invoice [PROPOSAL, SCH-Q11]. They can
     be restored for 90 days.
   - QR cards keep working.
   - Class codes are new.
   - "Print cards for new pupils" is offered.

There is no undo button. The review step lists everything first, every change is in the audit log, and leavers can be
restored for 90 days.

---

## 15. Help and support

| Item | What |
|---|---|
| Help pages | Getting started; the CSV guide with the template; sign-in cards and passwords; This week; reading progress; the new school year; billing questions; privacy and data |
| Contact support | A form that goes to the owner's support inbox. The form says "Please don't include pupils' full names" |
| For your IT team | The domains to allow through the school's web filter: `*.spacecolonydefence.com` and the others in [03](03-domains-edge-and-email.md); for Billing admins only, Stripe's hosted pages. Schools must run filtering and monitoring and review it at least once every academic year [VERIFIED KCSIE 2026, para 173]. The DfE standard does not mention allow-lists, so this list is given as help [UNVERIFIED that filters need it, from the 2026-11-21 research] |
| Status | Link to the platform's status page when it exists ([13](13-delivery-plan.md)) |
| Accessibility statement | Link ([11](11-privacy-security-and-assurance.md)) |

---

## 16. Accessibility

The portal meets WCAG 2.2 AA (rule R10). The 2018 public sector accessibility regulations exempt schools except for the
content of their websites or apps relating to essential online administrative functions. Whether a bought-in app falls
under that is not settled. Schools must still make reasonable adjustments under the Equality Act 2010 [VERIFIED
legislation.gov.uk SI 2018/952 reg 4; gov.uk accessibility requirements page]. The DfE's digital accessibility standard
tells schools to ask suppliers for their accessibility statements [VERIFIED gov.uk, digital accessibility standard].

Specific to the portal:

- Every action works by keyboard alone, with a visible focus.
- The progress grid gives text for every status, not colour alone, and works with screen readers as a proper table.
- Targets are at least 24 × 24 pixels.
- Pages reflow at 320 pixels wide.
- CSV errors are linked to their rows.
- Time limits can be extended: the idle sign-out warning offers "Stay signed in", and an open class sign-in can be made
  longer while it runs.
- The printed cards and sheets use large type and good contrast, and do not rely on colour.

---

## 17. Decisions for the owner

| ID | Proposal |
|---|---|
| SCH-Q1 | CSV files are read in the browser; only first name, last initial, year group, class and reference reach our servers. Surnames never leave the device |
| SCH-Q2 | File limits: ≤ 1 MB; ≤ 60 rows for Teachers and ≤ 500 for Admins; classes of up to 60 pupils |
| SCH-Q3 | UPN and any other unrecognised column is ignored and never sent |
| SCH-Q4 | Teachers are told that enrolling adds to the school's bill but see no prices or totals; Admins see the estimate |
| SCH-Q5 | Un-enrolled pupils' data is deleted 90 days after un-enrolment and can be restored until then; Admins can delete at once |
| SCH-Q6 | A new six-consonant class code each time class sign-in is opened |
| SCH-Q7 | Admins and the class's Teacher can show a pupil's password for 30 seconds; every showing is audited ([04](04-identity-and-access.md) protects the stored secret) |
| SCH-Q8 | With home play off, QR cards work only within the school's hours |
| SCH-Q9 | Removed staff stay in the audit log with name and email for 2 years |
| SCH-Q10 | Staff invitations expire after 7 days |
| SCH-Q11 | The new-year wizard un-enrols Year 4 leavers when confirmed, so they are never on the September invoice |
| SCH-Q12 | After a new terms or DPA version's effective date, Admins must accept it before continuing; other staff are not interrupted |
| SCH-Q13 | Pause stops new games at once and running games within about a minute; signing in still works |
| SCH-Q14 | Read-only staff see the staff list (names and roles), not emails or staff actions |

---

## 18. User stories

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| SCH-1 | As a staff member, I want to sign in on my school's own page with email, password and MFA, so that only I can use my account | Sign-in page at `/staff` shows the school's name and badge; MFA required for email-and-password accounts; guesses limited at least to 10 in 5 minutes; failed sign-ins audited | Pilot |
| SCH-2 | As an invited staff member, I want to set my password and MFA from the invitation, so that I can start in minutes | Link valid 7 days; expired link explains and offers to ask for a new one; lands on the role's dashboard | Pilot |
| SCH-3 | As the first Admin, I want to accept the terms and DPA for my school, so that the school can start | Versions shown; authority tick required; acceptance recorded with version, staff member and time; no classes or pupils possible before it | Pilot |
| SCH-4 | As the first Admin, I want a setup checklist, so that I know what to do next | Seven items as §2.4; each ticks itself; hidden when complete; Teachers get their shorter list | Pilot |
| SCH-5 | As an Admin, I want to invite staff with an access level and Billing admin flag, so that colleagues get the right access | Fields and checks as §4.2; up to 20 at once; resend and cancel; audited | Pilot |
| SCH-6 | As an Admin, I want to change a colleague's access, so that roles follow their job | Change applies on their next request (tested with a held token); promoting to Admin asks for confirmation; audited | Pilot |
| SCH-7 | As an Admin, I want to remove a member of staff and hand their classes to someone else, so that no class is left without a teacher | Removal blocked until every class has a new teacher; sessions ended; access refused at once even with a valid token; kept as Removed in the audit | Pilot |
| SCH-8 | As an Admin, I want the portal to stop me removing or demoting the last Admin, so that the school is never locked out | Both actions refused with an explanation; API refuses too | Pilot |
| SCH-9 | As a staff member, I want My account, so that I can manage my name, password, MFA and sessions | Actions as §4.6; "sign out everywhere" ends all sessions | Pilot |
| SCH-10 | As a Teacher, I want to create my class with its year groups and sign-in type, so that I can enrol my pupils | Fields as §5.2; I become its teacher; name unique among active classes | Pilot |
| SCH-11 | As an Admin, I want to change a class's teacher or archive it, so that classes follow staffing changes | Teacher change immediate both ways; archive makes pupils unassigned unless "also un-enrol" is ticked; class code stops | Pilot |
| SCH-12 | As a Teacher, I want to add one pupil to my class, so that a new child can play straight away | Fields as §6.3; duplicate warning; billing note; enrolment limit applied; card printable at once | Pilot |
| SCH-13 | As a Teacher, I want to upload a CSV of my class, so that I enrol everyone in one go | The whole of §7: template, mapping, checks, billing note, chunks of 50, idempotent retry, resume, result report; 28 pupils enrolled in under a minute | Pilot |
| SCH-14 | As an Admin, I want to upload a CSV for several classes, so that I can enrol the whole school | `class` column per row; "create missing classes" option; up to 500 rows; same checks as SCH-13 | Pilot |
| SCH-15 | As a staff member, I want surnames and UPNs never to reach the platform, so that we share only what is needed | Network capture of an upload shows only first name, initial, year, class and reference; the server rejects any other field | Pilot |
| SCH-16 | As an Admin, I want to re-upload a corrected file safely, so that I can fix mistakes without duplicates | Reference matches offer update; no duplicates when the same file is uploaded twice; sign-in secrets and cards unchanged by updates | Pilot |
| SCH-17 | As a Teacher, I want to remove a pupil from my class, so that my roster is right | Pupil becomes unassigned and stays enrolled; Admins see the Unassigned list and the billing note | Pilot |
| SCH-18 | As an Admin, I want to move, un-enrol, restore or delete pupils, so that the roll matches the school | Actions and effects as §6.6–6.7; un-enrolled pupils not on invoices made afterwards; restore within 90 days; delete needs the typed name | Pilot |
| SCH-19 | As an Admin, I want an optional enrolment limit for teachers, so that the bill can't grow without me | Limit as §6.8; single adds and uploads both checked; an upload over the limit refused as a whole | Launch |
| SCH-20 | As a Teacher, I want to open class sign-in with a fresh code on the whiteboard, so that my class can sign in at the start of a lesson | Durations as §8.1; new six-consonant code each time; QR on screen; countdown; closing stops the code; signed-in pupils unaffected | Pilot |
| SCH-21 | As a Teacher, I want to print QR cards and homework-book stickers, so that pupils can sign in at school and at home | Formats as §8.2; no password on the card; printed in the browser; for one, some, a class or just-enrolled pupils | Pilot |
| SCH-22 | As a Teacher, I want a password sheet, so that I can help children learn their pictures | Sheet as §8.3; printing audited | Pilot |
| SCH-23 | As a Teacher, I want to show, reset or unlock a pupil's password and reissue their card, so that no child is stuck | Actions as §8.4; showing lasts 30 s and is audited; a reissued card's old QR stops at once | Pilot |
| SCH-24 | As a Teacher, I want to switch my class between picture and typed passwords, so that older pupils can type | New secrets for the whole class on confirm; the password sheet opens; warning shown first | Pilot |
| SCH-25 | As a Teacher, I want to set This week's map and topic sets, so that practice matches my teaching | Fields as §9.1; only sets offered for the class's year groups; clears after the end date; "same as last week" works | Pilot |
| SCH-26 | As a Teacher, I want to turn maps on or off and choose home play, so that pupils play what suits my class | At least one map stays on; New maps setting respected; home play off limits QR cards to school hours | Pilot |
| SCH-27 | As a Teacher, I want to pause my class, so that I get their attention or end the lesson | No new games at once; running games stop within 90 seconds (lease renewal); resume immediate; sign-in unaffected | Pilot |
| SCH-28 | As a Teacher, I want a class progress grid, so that I see who is practising what | Grid as §10.2; text and colour; needs-help filter; data no older than a few minutes | Pilot |
| SCH-29 | As a Teacher, I want a pupil page and a list of who is playing now, so that I can follow one child | Contents as §10.3 and §10.5; refreshes every 30 s | Pilot |
| SCH-30 | As a Read-only member of staff, I want to see every class's progress and export it, so that I can report to leaders | Read-only sees all classes; no change actions visible or accepted by the API; CSV protected against formula injection | Pilot |
| SCH-31 | As an Admin or Billing admin, I want the Billing page, so that the school can pay and keep its records | As 09 §13; Read-only sees counts only; Teachers see no Billing page | Launch |
| SCH-32 | As an Admin, I want school settings, so that the school looks and works as we want | Settings as §12; badge shown on sign-in pages and cards; school hours used by home play | Pilot |
| SCH-33 | As an Admin, I want to connect Microsoft 365 or Google Workspace for staff sign-in, so that staff use their school accounts | Steps as §12 and 04; test sign-in before turning on; "require it" option; audited | Launch |
| SCH-34 | As an Admin, I want to export all our data, so that we can keep or move it | ZIP of CSV and JSON as §12; prepared in the background; link valid 24 h; audited | Launch |
| SCH-35 | As an Admin, I want an audit log, so that I can see who did what | Events as §13; filters; CSV export; support actions shown as support; kept 2 years | Pilot |
| SCH-36 | As an Admin, I want to grant and revoke support access, so that the platform's support can help us only when we agree | Grant 24 or 72 h, read-only or read-write; pending requests shown; revoke effective on the next request | Launch |
| SCH-37 | As an Admin, I want a new-school-year wizard, so that moving every class up takes minutes | Steps as §14; leavers un-enrolled on confirm and not on the September invoice; restore within 90 days; review shows the billing effect | Launch |
| SCH-38 | As a staff member, I want help pages and a support form, so that I can solve problems myself or ask | Pages and form as §15; IT allow-list page; form warns against pupils' full names | Pilot |
| SCH-39 | As a staff member who uses assistive technology, I want the portal to meet WCAG 2.2 AA, so that I can do my job | Automated checks in CI plus a manual audit before Launch ([11](11-privacy-security-and-assurance.md)); items in §16 tested | Launch |
