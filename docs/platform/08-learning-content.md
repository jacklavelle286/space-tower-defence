# 08. Learning content, Years 1 to 4

Part of the [platform scope](README.md). Status: scope, parked.

---

## 1. Summary

Today's bank covers maths, phonics and spelling for ages 5 to 7, mapped to Years 1 and 2 of England's national
curriculum. The platform serves **Years 1 to 4** [CONFIRMED by owner 2026-11-21, PD-10], so Years 3 and 4 are almost
entirely new content. The model also changes in five ways:

- Activities carry **year groups** instead of ages.
- Teachers steer practice with **This week**, built from topics and **topic sets**.
- Activities are chosen in **blocks**, weighted to This week, so a teacher's choice reaches a pupil quickly.
- Teachers see **practice records per topic**.
- The owner gets **AI help to draft questions** in the console. Every item is reviewed before any child sees it, and no
  school or pupil data ever reaches an AI provider [CONFIRMED by owner, PD-11].

---

## 2. What exists today

From the code map of `main` at 292f4bc and counts taken 2026-11-21 [VERIFIED; sources given].

| Area | Today | Source |
|---|---|---|
| Subjects | Maths, phonics, spelling | `contracts/topics.json` |
| Topics | **88**: maths 38, phonics 21, spelling 29 | `contracts/topics.json`, counted |
| Ages | Each topic lists ages: [5] 23 topics, [5, 6] 7, [6] 24, [6, 7] 4, [7] 30. Each activity has `minAge` and `maxAge`; validation requires the topic to sit under the activity's subject and be taught at its ages | `contracts/topics.json`; `api/shared/content.py:43-51, 101-104` |
| Curriculum references | NC14 (national curriculum 2014) 87 references, EYFS26 23, LS07 9, DM23 5. The NC14 references cover **only Years 1 and 2**: maths Y1 22, maths Y2 14, English Y1 15 and Y2 11, spelling appendix Y1 14 and Y2 11. **None for Years 3 or 4** | `contracts/topics.json`, counted |
| Activity kinds | Six: MULTIPLE_CHOICE, PICTURE_SELECT, NUMBER_SELECT, TYPED (NUMERIC or WORD), ARRANGE (LETTERS or SEQUENCE), OBJECT_MOVE (DISTRIBUTE or SORT) | `api/shared/activity_types.py:61-66` |
| Authoring forms | FIXED or TEMPLATE; **17** version-1 template generators, all maths | `api/shared/generators/numbers.py:471-484`, `objects.py:230-236` |
| Seed content | **288** activities (253 FIXED, 35 TEMPLATE); **47** speech definitions | code map §7 |
| Rewards | `rewardCategory` NORMAL, METEOR or BOTH; the reward comes from the slot, never the activity | `api/shared/selection/plan.py:1-20` |
| Choosing | At `POST /api/runs` the whole campaign is planned: 49 normal slots rotating maths, phonics, spelling, plus meteor slots after waves 9, 19, 29, 39 and 49; round-robin over seeded, shuffled topics; an activity at most once per run; starter rules until a band's bank is eligible | `plan.py`; `api/shared/selection/eligibility.py:1-20` |
| Endless | Blocks of 10 intervals planned at each `COMPLETE_WAVE`; never a repeat; "You have done every activity we have for now" when the bank runs out (owner decision D-6) | `api/shared/selection/endless.py:1-14` |
| Learning records | `SUM#<subject>#<topicId>` counts each resolution once | `api/shared/ops.py:335-339` |
| Speech | The operator previews and approves takes through `tts` (Polly); a child's request returns a presigned GET valid 300 s and **never synthesises** | code map §3; `api/functions/tts/handler.py` |
| AI | **Only pictures**: `picture_gen` calls OpenAI's Responses API (EU endpoint) for an SVG of one of 10 kinds; caps of 100 a day and 150 a month; the operator approves each picture. **Nothing generates activities, questions or speech**; `AI_ASSISTED` is only a source label | `infrastructure/main/variables.tf:166-219`; `api/functions/picture_gen/handler.py:343-345`; `content.py:106` |
| Authoring tools | Activities editor with steps, templates, picture picker, preview-solve, a seven-line checklist; validate, publish, retire, withdraw, delete; Bank status page | code map §6 |

---

## 3. Years 1 to 4: what the content must cover

Assessment arrangements for 2026/27 are unchanged [VERIFIED https://www.gov.uk/guidance/primary-assessments-future-dates].

### 3.1 Maths

National curriculum headings per year [VERIFIED
https://www.gov.uk/government/publications/national-curriculum-in-england-mathematics-programmes-of-study/national-curriculum-in-england-mathematics-programmes-of-study]:

| Heading | Y1 | Y2 | Y3 | Y4 |
|---|---|---|---|---|
| Number – number and place value | ✔ | ✔ | ✔ | ✔ |
| Number – addition and subtraction | ✔ | ✔ | ✔ | ✔ |
| Number – multiplication and division | ✔ | ✔ | ✔ | ✔ |
| Number – fractions | ✔ | ✔ | ✔ | ✔ (including decimals) |
| Measurement | ✔ | ✔ | ✔ | ✔ |
| Geometry – properties of shapes | ✔ | ✔ | ✔ | ✔ |
| Geometry – position and direction | ✔ | ✔ | — | ✔ |
| Statistics | — | ✔ | ✔ | ✔ |

Game activities suit number, place value, the four operations, times tables, fractions, money and time well. Shape and
position work through PICTURE_SELECT and OBJECT_MOVE. Statistics needs simple pictograms and tables, which means new
picture work [PROPOSAL].

### 3.2 English

The national curriculum headings are the same for Year 1, Year 2 and Years 3–4 [VERIFIED
https://www.gov.uk/government/publications/national-curriculum-in-england-english-programmes-of-study/national-curriculum-in-england-english-programmes-of-study]:

| Heading | In the game? [PROPOSAL] |
|---|---|
| Reading – word reading (phonics sits here: "apply phonic knowledge and skills as the route to decode words") | **Yes**: sounds, blending (hear and choose), real or alien words, common exception words (Y1–Y2) |
| Reading – comprehension | Only single sentences matched to pictures; longer texts are out of scope |
| Writing – transcription: spelling (Appendix 1) | **Yes**: Y1–Y2 patterns and common exception words; **Y3–Y4 statutory list of 100 words**; prefixes, suffixes, homophones |
| Writing – transcription: handwriting | No |
| Writing – composition | No |
| Writing – vocabulary, grammar and punctuation (Appendix 2) | **Yes**, in small steps: capital letters and full stops, conjunctions, tense, apostrophes, fronted adverbials (Y4) |
| Spoken language | No |

"The word-lists for years 3 and 4 and years 5 and 6 are statutory", with "the 100 words in each list" [VERIFIED
https://assets.publishing.service.gov.uk/media/5a7ccc06ed915d63cc65ce61/English_Appendix_1_-_Spelling.pdf].

### 3.3 Statutory checks

| Check | Facts [VERIFIED] | What the game offers [PROPOSAL; LRN-Q10] |
|---|---|---|
| **Phonics screening check** | Year 1, plus Year 2 pupils who did not meet the 2026 standard; in the week from Monday 14 June 2027; "20 real words and 20 pseudo-words" (https://www.gov.uk/government/publications/phonics-screening-check-assessment-and-reporting-arrangements-ara/2027-phonics-screening-check-assessment-and-reporting-arrangements) | Decoding practice in its style: "real word or alien word?", hear a word and choose it, sounds to word. The real check is read aloud to a teacher, which the game cannot hear, so it is practice, never a mock score. Whether the check shows pseudo-words with an alien picture, as is commonly said, is [UNVERIFIED: read the 2027 framework] |
| **Multiplication tables check** | Statutory for all Year 4 pupils; the check period opens Monday 7 June 2027 for 2 weeks (https://www.gov.uk/government/publications/key-stage-2-assessment-and-reporting-arrangements-ara/2027-key-stage-2-assessment-and-reporting-arrangements); 25 questions, "6 seconds to answer each question", "a 3-second pause between each question" (https://www.gov.uk/government/publications/multiplication-tables-check-administration-guidance/multiplication-tables-check-administration-guidance); items drawn from "the 121 items that make up the 2 to 12 multiplication tables", with the 6, 7, 8, 9 and 12 tables emphasised (https://assets.publishing.service.gov.uk/media/62384958e90e0779a5e700c3/2018_MTC_assessment_framework_PDFA_updated_for_2022.pdf) | Times-tables practice for Years 2 to 4. A teacher can turn on an **optional 6-second timer** for a class or pupil (off by default, never shown as a score to pupils, removable for any pupil, WCAG 2.2.1). Selection leans towards the 6, 7, 8, 9 and 12 tables for Year 4 |
| **Key stage 1 tests** | Optional since 2023/24; recommended period May 2027 (https://www.gov.uk/guidance/key-stage-1-and-key-stage-2-test-dates) | Nothing specific |

### 3.4 Phonics programmes

"After 3 rounds of evaluation, 45 SSP programmes were validated", "there is no statutory requirement for schools to
choose one", and "Ofsted does not have a preferred programme or approach" [VERIFIED
https://www.gov.uk/government/publications/choosing-a-phonics-teaching-programme/list-of-phonics-teaching-programmes].
So [PROPOSAL]:

- Phonics content stays **general**: grapheme–phoneme correspondences and words, tagged by sound, not by any scheme's
  phase or order.
- **The teacher chooses the sounds** a class practises this week (§4.3), in their own scheme's order.
- Neither the game nor its marketing names any programme. Marketing says the content "supports" systematic phonics
  ([12](12-marketing-and-sales.md)).

### 3.5 The revised national curriculum

The government aims "to publish the final revised national curriculum by spring 2027", for first teaching from
September 2028 [VERIFIED
https://assets.publishing.service.gov.uk/media/690b2a4a14b040dfe82922ea/Government_response_to_the_Curriculum_and_Assessment_Review.pdf].
[PROPOSAL; LRN-Q13] Curriculum references stay **versioned** (today `NC14.…`). When the new programmes of study are
published, topics gain `NC28.…` references alongside the old ones during 2027–28. Teacher-facing topic names and the
curriculum mapping sheet ([12](12-marketing-and-sales.md)) switch over for September 2028. Budget a re-mapping pass in
spring and summer 2027.

### 3.6 Out of scope

Reading comprehension beyond single sentences, writing composition, handwriting and spoken language [PROPOSAL;
LRN-Q11]. They cannot be practised or checked fairly in a between-waves activity.

---

## 4. Model changes

### 4.1 Year groups replace age bands

| | Today | Platform [PROPOSAL; LRN-Q1] |
|---|---|---|
| On a topic | `ages` | `years` (1–4), derived first from the topic's NC14 year references. EYFS-only topics become early Year 1 content |
| On an activity | `minAge`, `maxAge` | `years`, defaulting to its topic's years; the owner can narrow it |
| On a pupil | Birthday → age band 5–7 | Year group from the pupil record, or the teacher's working-at year (§4.5) |
| On a run | Pins `ageBand` | Pins `contentYear` |

One bank serves both editions. The family edition maps its age band to years: **5 → Y1, 6 → Y1–Y2, 7 → Y2–Y3**. That
reflects who is that age during a school year, since Year 1 children turn 6 and Year 2 children turn 7. If the family
edition ever widens its ages, **band 8 → Y3–Y4** and **band 9 → Y4** need no new content model, only content
[PROPOSAL]. Migrating the 88 topics is a one-off console screen: the derived years are shown, and the owner confirms or
corrects each topic.

### 4.2 Topics, references and difficulty

| Change | Detail [PROPOSAL] |
|---|---|
| New topics | Years 3 and 4 maths (about 30 topics: place value to 1,000 and 10,000, the 3, 4, 8, then 6, 7, 9, 11 and 12 tables, written methods as steps, fractions and decimals, money, time, measures, Roman numerals to 100 in Y4) and English (about 20: list words in groups of ten, prefixes, suffixes, homophones, grammar steps) [ASSUMPTION: counts from the programmes of study, to be refined] |
| References | Each topic keeps its curriculum references; Year 3–4 topics get NC14 references for their statements |
| Difficulty | Each activity gets a **step**: 1 (early), 2 (core) or 3 (stretch) within its year (LRN-Q2). Selection moves a pupil up a topic's steps as first-try answers improve |
| Teacher-facing names | Each topic gets a teacher name ("Number bonds to 20") and a child name ("Adding to 20") |

### 4.3 Topic sets for This week

A **topic set** is a named group of topics the owner publishes for a year, e.g. "Y3 Autumn: the 3, 4 and 8 tables" or
"Sounds: ai, ee, igh, oa" (LRN-Q3).

| A teacher's This week [PROPOSAL] | Rule |
|---|---|
| Topics | A published topic set, or 1 to 5 topics chosen one by one from the class's years |
| Map | Optional: one of the maps the class allows |
| End date | Optional; This week disappears after it ([07 §5](07-pupil-experience.md#5-home)) |
| Timer | Optional times-tables timer (§3.3) |
| Availability | Only topics that meet the minimum volume (§9) are offered |

### 4.4 Choosing activities

[PROPOSAL; LRN-Q4 to LRN-Q6] For school runs:

| Step | Rule |
|---|---|
| Planning | Campaign runs plan activity slots in **blocks of 10 waves**, the way endless already does, rather than all at creation. A block is planned when the run starts and then at `COMPLETE_WAVE` so that 10–19 waves are always in hand. A new This week therefore reaches a running campaign within 10 waves. Slots, once planned, never change (today's pinning rule stays) |
| With This week | About **70%** of a block's normal slots come from This week's topics, round-robin; **30%** from review: the pupil's year-group topics, favouring topics marked Practising (§5) |
| Without This week | Today's rotation by subject over the pupil's year-group topics |
| Meteors | From This week's topics when meteor-eligible items exist; otherwise review |
| Difficulty | Within a topic, start at the pupil's current step; move up after 4 of the last 5 first tries are right, down after 3 of the last 5 are wrong |
| Repeats | A FIXED activity is not shown to the same pupil again within **14 days**, across runs (today: once per run). Templates give fresh instances |
| Running out | Template instances first, then FIXED items last seen more than 14 days ago, then review topics; never an empty slot in a campaign |
| Determinism | A block's plan is a pure function of the seed, the block number and a recorded snapshot of the inputs (year, This week, statuses, recent history), so a test can pin it as today's tests do |
| Family edition | Unchanged |

### 4.5 Working-at override

A teacher can set a pupil's **working-at year** (Year 1 to Year 4) when it differs from their year group. Examples are a
Year 3 pupil practising Year 2 content, or a Year 2 pupil ready for Year 3 tables. Selection uses the working-at year.
The teacher's progress view shows "working at Year 2" next to the pupil. Pupils never see it
([07 §9](07-pupil-experience.md#9-the-pupils-own-progress)) [PROPOSAL].

---

## 5. Progress measures for teachers

Practice records, not assessment (rule R8). Every report says so, shows no grades, and pupils never see the statuses
[PROPOSAL; LRN-Q7].

| Per pupil per topic | Meaning |
|---|---|
| Resolutions | Activities finished on this topic (today's `SUM#` count) |
| First-try correct | Of those, right first time |
| Last 10 | The last ten first-try results, kept in order |
| Days practised | Distinct days with a resolution |
| Last practised | Date |

| Status | Rule [PROPOSAL] |
|---|---|
| **Not started** | No resolutions |
| **Practising** | At least one resolution, not Secure |
| **Secure** | At least 8 of the last 10 first tries right, practised on at least 2 different days. Drops back to Practising if the last 10 fall below 6 right |
| Flag: **needs help** | At least 6 resolutions and no more than 3 of the last 10 first tries right |
| Flag: **not practised lately** | A topic from a past This week with no resolution in 21 days |
| Times tables (timer on) | Facts answered, and facts answered within 6 seconds |

Teachers see these as a class grid (pupils × This week topics), a topic view and a pupil view ([06](06-school-portal.md)).
The records extend today's `SUM#` items, written in the same transaction as the attempt's resolution
([10](10-data-and-api.md)) [ASSUMPTION].

---

## 6. AI-assisted authoring (console only)

[CONFIRMED by owner, PD-11: AI only in the owner's backend. Design PROPOSAL; LRN-Q8]

| Step | Design |
|---|---|
| Where | A **Draft questions** maker in the console's Activities page ([05](05-platform-console.md)). Nothing in the portal or the pupil app |
| Request | The owner picks a topic, year, step, activity kind and number (for example 10) |
| What the AI receives | The topic's description and curriculum statement, the activity kind's schema, a style guide (UK spelling, child-safe words, no real people, no brands, no names that could be a pupil's) and a few published examples. **Never school or pupil data**; the console's content tables hold none |
| How it runs | Like `picture_gen`: a queued job and a worker function with its own secret, daily and monthly caps, and a kill switch. Cost is logged per job |
| Checks before the owner sees it | The same validators as hand-made activities (activity kinds, limits); maths answers recomputed by code; spelling words checked against the statutory and owner word lists; duplicates against the bank; word-length checks for the year |
| Result | Each item lands as a **DRAFT** with provenance `AI_ASSISTED` and a generation record (prompt version, time, model; the model name is stored server-side and never shown in the UI) |
| Review | The owner opens each item in the existing editor, preview-solves it and ticks the checklist. **Publish needs a "Reviewed" tick on every AI-assisted item**; no bulk publish of unreviewed drafts |
| Speech | Never AI-generated. The owner makes speech definitions from the approved text; Polly renders them; the owner approves takes (§7) |
| Pictures | Today's Draw flow, with owner approval |
| UI wording | "Draft with help", "Drafted with help". No vendor or model names in the console (standing owner rule) |

The provider is open (LRN-Q8). One option reuses the existing OpenAI integration pattern. The other is Claude on
Amazon Bedrock, which keeps traffic inside AWS [UNVERIFIED: model availability in `eu-west-2` or an EU inference profile].
Either way the provider receives no personal data. It is a supplier for content creation, not a sub-processor of school
data ([11](11-privacy-security-and-assurance.md)).

---

## 7. Speech

| Today [VERIFIED code map] | For Years 1–4 [PROPOSAL] |
|---|---|
| Speech definitions; the operator previews through `tts` (Polly) and approves takes; clips under `tts/v1/` | Same workflow |
| Children fetch approved clips by presigned GET; never synthesis | Same |
| Topic audio notes include tiers A–C and SSML phonemes for pure sounds | Pure phonemes for every sound a teacher can choose (§3.4); quality checked against the owner's research in [sources/06-polly-tts.md](../plan/sources/06-polly-tts.md) and [sources/11-voice-engine.md](../plan/sources/11-voice-engine.md) |
| — | A clip for **each spelling word** (Y1–Y2 common exception words, the 100 Y3–Y4 list words), so "spell 'separate'" can be heard |
| — | Clips for instructions on new activity kinds and status screens ([07 §8](07-pupil-experience.md#8-status-screens)) |

---

## 8. Content QA and publishing

Today's flow stays: draft → validate → preview-solve → checklist → publish (versioned) → retire or withdraw. Runs pin
versions, so publishing never changes a run in progress. Publishing reaches every school at once (content is global,
rule R7). Additions [PROPOSAL]:

| Addition | What |
|---|---|
| Coverage by year | Bank status grows a year × topic view: items, templates, steps, speech, against the targets in §9 |
| Ready for schools | A topic appears in topic sets and the teacher's topic picker only once it meets the minimum volume |
| AI drafts queue | Drafts awaiting review, with their automatic check results |
| Word lists | Published lists (statutory words, sounds) that word-list templates draw from (§9) |
| Item signals (LRN-Q9) | Per-item first-try rates would show confusing questions. But using pupils' answers to improve content is processing for our own purposes, which makes us a **controller** for it (ICO: a provider that "processes children's personal information outside the school's instructions" is a controller for that processing, https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/the-children-s-code-and-education-technologies-edtech/). The ICO's 2026 audits found "almost 70% of providers were found to be the controller for some of their uses" (https://ico.org.uk/media2/13yfm55z/edtech-examined-key-findings-from-our-audits.pdf). Options: (a) signals only from the demo school and testing; (b) aggregated, de-identified item statistics allowed by the DPA and stated in the privacy notice. The owner and solicitor decide |
| Timing | Content releases outside school hours |

---

## 9. Content volume targets

Demand estimate [ASSUMPTION]: a pupil playing three sessions a week of about 10 waves meets about 30 activities a week.
With 70% on 3 to 5 This week topics, that is roughly 4 to 7 activities per topic per week, and a topic usually stays in
This week for 1 to 2 weeks. With the 14-day repeat rule (§4.4), a topic needs **at least 15 distinct items, or a template
plus 6 items**, to avoid repeats. Today's bank averages 3.3 activities per topic (288 / 88).

| | Today | Pilot target [PROPOSAL; LRN-Q12] | Launch target [PROPOSAL] |
|---|---|---|---|
| Years covered | Y1–Y2 (by NC14 references) | Y1–Y2 in full; Y3–Y4 maths core (place value, add and subtract, times tables) and the Y3–Y4 statutory spelling list | All four years: every maths heading the game suits (§3.1), word reading and phonics, spelling, grammar steps |
| Topics | 88 | about 110 | about 140 [ASSUMPTION] |
| Per topic | about 3.3 | ≥ 15 items, or a template + ≥ 6 items | ≥ 20 items, or a template + ≥ 8 items |
| Speech definitions | 47 | + all sounds and Y1–Y2 common exception words | + Y3–Y4 list words and grammar instructions |

**Word-list templates** [PROPOSAL] make spelling scale like maths templates. A new generator family draws from a
published word list: ARRANGE LETTERS ("make the word you hear"), TYPED WORD ("type the word you hear"), and
MULTIPLE_CHOICE "choose the right spelling" with owner-written wrong spellings per word, never generated. The owner reviews
each word list and its wrong spellings once, not every instance.

---

## 10. Teachers' own questions (Later)

[CONFIRMED by owner 2026-11-21: wanted later, PD-18; design PROPOSAL]

| Aspect | Design |
|---|---|
| Editor | A narrow editor in the portal: question, answer options, a picture from the published library; MULTIPLE_CHOICE, PICTURE_SELECT and TYPED only |
| Scope | Questions belong to the school (school data under the DPA). They are never visible outside the school and never enter the global bank |
| Use | Teachers add them to This week like topics; selection treats them as a This week topic |
| Review | The school is responsible; a school Admin can remove any. The owner does not review them. No AI |
| Safety | A word-list check for unsuitable words and a warning against pupils' names; reports from the school go to support |
| Speech | Open decision (scope-schools.md §10.5): no speech, or Polly at a capped cost per school |
| Progress | Counted per question set in the teacher's view, not in curriculum topic statuses |

---

## 11. Decisions for the owner

| ID | Proposal |
|---|---|
| LRN-Q1 | Content level is the school year (1–4) on topics and activities; the family edition maps 5 → Y1, 6 → Y1–Y2, 7 → Y2–Y3 (and later 8 → Y3–Y4, 9 → Y4) |
| LRN-Q2 | Each activity has a difficulty step 1–3 within its year |
| LRN-Q3 | The owner publishes topic sets per year; a teacher picks a set or 1–5 topics, plus an optional map, end date and timer |
| LRN-Q4 | School campaign runs plan slots in blocks of 10 waves, so This week reaches a run within 10 waves |
| LRN-Q5 | 70% This week, 30% review favouring Practising topics |
| LRN-Q6 | No FIXED activity repeats for a pupil within 14 days, across runs |
| LRN-Q7 | Status rules: Secure at 8 of the last 10 first tries on at least 2 days, back to Practising below 6; "needs help" at no more than 3 of 10 after 6 resolutions |
| LRN-Q8 | AI question drafting in the console only; provider to choose (the existing OpenAI pattern, or Claude on Bedrock); caps; every item reviewed |
| LRN-Q9 | Item statistics across schools: none, or only with DPA permission (with the solicitor) |
| LRN-Q10 | Statutory-check practice: "real or alien word" and hear-and-choose for phonics; times-tables practice with an optional 6-second timer, off by default |
| LRN-Q11 | Out of scope: comprehension beyond single sentences, composition, handwriting, spoken language |
| LRN-Q12 | A topic is offered to teachers only once it meets the volume minimum (§9) |
| LRN-Q13 | Versioned curriculum references; dual NC14 and NC28 references through 2027–28 |

---

## 12. User stories

*Snapshot of 2026-11-21. The source of truth for these stories is now Jira (project SCD); see
[README §6](README.md#6-user-stories-and-jira). Edit the tickets, not this table.*

| ID | Story | Acceptance criteria | Release |
|---|---|---|---|
| LRN-1 | As the owner, I want every topic and activity tagged with year groups, so that pupils get content for their year | `years` on topics and activities; validation rejects an activity outside its topic's years; migration screen shows derived years for all 88 topics for confirmation | Pilot |
| LRN-2 | As the owner, I want the family edition to keep working on ages, so that my children's game is unaffected | Family edition maps age bands to years as LRN-Q1; its selection results for a pinned seed are unchanged by the migration (golden test) | Pilot |
| LRN-3 | As a pupil, I want activities chosen for my year (or my working-at year), so that they're the right level | School runs pin `contentYear`; selection draws only activities whose years include it | Pilot |
| LRN-4 | As a teacher, I want to set a pupil's working-at year, so that a pupil who needs easier or harder work gets it | Working-at year on the pupil page; used by selection from the next block; shown in the teacher's views only | Pilot |
| LRN-5 | As a teacher, I want to choose This week's topics from published sets or one by one, so that practice follows my lessons | Picker shows topic sets and topics for the class's years that meet the volume minimum; 1–5 topics; optional map, end date, timer | Pilot |
| LRN-6 | As a pupil, I want most activities to be on what we're learning this week, so that the game helps in class | Blocks give about 70% This week and 30% review (test with a pinned seed); a This week change reaches a running campaign within 10 waves | Pilot |
| LRN-7 | As a pupil, I want questions that get a bit harder as I get them right, so that I keep improving | Steps 1–3 per topic; moves up after 4 of the last 5 right, down after 3 of the last 5 wrong | Launch |
| LRN-8 | As a pupil, I don't want the same question again and again, so that the game stays fresh | No FIXED item repeats for a pupil within 14 days across runs; fallback order as §4.4; never an empty campaign slot | Pilot |
| LRN-9 | As a teacher, I want each pupil's practice per topic, so that I know who needs help | Resolutions, first-try correct, last 10, days, last practised per pupil per topic; written with the attempt's resolution | Pilot |
| LRN-10 | As a teacher, I want Not started, Practising and Secure, plus a needs-help flag, so that I can see the class at a glance | Status rules as LRN-Q7; unit tests at each boundary; labelled "practice records, not assessment" | Pilot |
| LRN-11 | As the owner, I want Year 3 and 4 maths topics, so that older pupils have content | About 30 new topics with NC14 references and teacher and child names; each meets the Launch volume target | Launch |
| LRN-12 | As the owner, I want the Year 3–4 statutory spelling list in the game, so that schools see their curriculum | All 100 words in a published word list with clips; word-list templates generate ARRANGE, TYPED and MULTIPLE_CHOICE items | Pilot |
| LRN-13 | As the owner, I want word-list templates for spelling, so that I review a list once instead of hundreds of items | Generator family reading a published list and owner-written wrong spellings; instances validated; never generates wrong spellings itself | Pilot |
| LRN-14 | As a Year 4 teacher, I want times-tables practice with an optional 6-second timer, so that pupils get ready for the check without stress | Timer per class or pupil, off by default; leans to the 6, 7, 8, 9 and 12 tables for Year 4; teacher sees facts in time; pupils see no score | Launch |
| LRN-15 | As a Year 1 teacher, I want decoding practice in the style of the phonics check, so that pupils meet real and alien words | "Real or alien word" and hear-and-choose activities; sounds chosen by the teacher; no mock scores | Launch |
| LRN-16 | As a teacher, I want to choose which sounds my class practises, so that the game follows our phonics scheme | Sound-tagged topics; teacher picks sounds in This week; no programme names anywhere | Pilot |
| LRN-17 | As the owner, I want AI to draft questions for a topic, so that I can build the bank faster | Draft questions maker in the console; job queued with caps and kill switch; drafts validated and checked automatically; land as DRAFT with `AI_ASSISTED` provenance | Launch |
| LRN-18 | As the owner, I want every AI-assisted item reviewed before publishing, so that no unchecked question reaches a child | Publish refused for an AI-assisted item without a "Reviewed" tick; no bulk publish of unreviewed items; audit records who reviewed | Launch |
| LRN-19 | As a school, I want assurance that no pupil data goes to AI providers, so that my DPIA is simple | The drafting job's input is built only from content tables and the style guide; a test asserts no school or pupil table is read by the drafting function (IAM denies it) | Launch |
| LRN-20 | As the owner, I want a year × topic coverage view, so that I know where content is thin | Bank status shows items, templates, steps and speech per topic and year against targets | Pilot |
| LRN-21 | As the owner, I want topics hidden from teachers until they have enough content, so that pupils don't see repeats | Topic sets and the picker omit topics below the volume minimum | Pilot |
| LRN-22 | As a pupil who can't read yet, I want to hear spelling words and sounds, so that I can do the activity | Clips for every sound and spelling word in published lists; pure phonemes checked by the owner | Pilot |
| LRN-23 | As the owner, I want curriculum references versioned, so that I can move to the 2028 curriculum without losing the old mapping | References carry their version; topics can hold NC14 and NC28 references together; the mapping sheet export shows both | Later |
| LRN-24 | As a teacher, I want to write my own questions for my class, so that I can practise things the bank lacks | Narrow editor; school-only; Admin can remove; unsuitable-word check; usable in This week | Later |
| LRN-25 | As the owner, I want to know which published items confuse pupils, so that I can fix them | Only as decided in LRN-Q9; if allowed, aggregated de-identified first-try rates per item, never per school or pupil | Later |
