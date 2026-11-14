# 09 — Learning-content design proposal

Curriculum mapping, content bank for ages 5, 6 and 7, activity and speech schemas, the six interaction types, deterministic selection, templates, learning summaries, worked examples, authoring plan and invalid-content recovery.

Prepared 2026-11-14 as source material for the implementation plan (plan sections C, D, F, G and I). This is not the final plan and contains no application code, only illustrative data fragments.

**Web access:** available. Every curriculum, AWS and W3C claim marked [V] was fetched or read today; the URL (or local path and line) is given beside it.

**Claim labels used throughout**

| Label | Meaning |
|---|---|
| **[V]** | VERIFIED today: read in a file (path:line) or on a fetched page (URL). Spec rules are cited as `prompt.md:<line>`. |
| **[P]** | PROPOSAL: my design recommendation. The owner or lead may change it. |
| **[U]** | UNVERIFIED: from memory or an estimate I could not confirm today. |

Names used here follow the team's design spine (`scratchpad/spine.md`, v0.1 draft): slot IDs `N-001`…/`M-009`…, slot statuses `LOCKED → OPEN → SUCCEEDED | FAILED | DECLINED | VOIDED`, content-table entities `ACT#`, `BANK#`, `SPEECH#`, error codes `INVALID_ANSWER_FORMAT`, `DUPLICATE_ANSWER`, `CONTENT_UNAVAILABLE`, `CONTENT_WITHDRAWN`. Where I recommend a change to the spine I say so.

Local copies of the PDFs I read (extracted text, for anyone who wants to re-check a quotation):
`/tmp/claude-1000/-home-jack-Documents-Projects-space-tower-defence/21e4d7b3-740a-407a-9ce4-b4a3156f1b6c/scratchpad/research/dl09-out/` — `appendix1-spelling.txt`, `eyfs-2026.txt`, `letters-and-sounds-2007.txt`, `reading-framework.txt`.

---

## 0. The decisions that matter most

1. **[P] Age bank = "the lower of the two school years the child could be in, stretching into the upper one."** Band 5 is anchored on the end-of-Reception early learning goals plus early Year 1; band 6 on the Year 1 programme of study; band 7 on the Year 2 programme of study. A child of birthday-age N can be in either of two school years, so age is a curated proxy, never a statement of attainment (section 2).
2. **[P] One interaction grammar: select, then press Check.** An attempt is consumed only by an explicit Check on a complete answer. Selecting, moving, typing, listening, waiting, refreshing and network trouble never consume one. Drag is optional sugar on top of click-then-click (section 4).
3. **[P] Single-choice activities need at least four options.** Because a repeated wrong answer does not consume an attempt (spine proposal, which I endorse), a three-option question could never be failed. Four to six options keeps "three incorrect = no reward" a real outcome.
4. **[P] Judging is always "normalise, then exact match against a small accepted set".** No fuzzy matching, tolerance or regular expressions in version one. The TypeScript (offline) and Python (authoritative) judges are kept identical by one shared file of test vectors.
5. **[P] The correct answer is shown after the activity resolves, never before.** It is the same for every child, happens when no reward is at stake, and changes nothing about later selection, so it is feedback and not adaptive help (section 4.3).
6. **[P] Rewards are never in the content.** An activity only says `NORMAL` or `METEOR`. The amount or power comes from the pinned ruleset by slot, which makes "identical reward opportunity at every age" a property you can unit-test.
7. **[P] Maths is multiplied by templates; phonics and spelling are hand-authored.** A template is an ordinary activity whose definition names a generator kind (code) and a bounded parameter domain (data). Instances are materialised by the server when the run is created and stored in the slot, so the browser never runs a generator and the answer cannot drift.
8. **[P] Phonics audio in three risk tiers.** Whole words (tier A) are safe; isolated continuant and vowel sounds (tier B) need a listening check; isolated stops, glides and a few other consonants (tier C) are the risky ones — DfE's own guidance says /b/, /d/, /g/ and /j/ "cannot be heard clearly in isolation, unless small schwa is added" [V]. The bank is designed so that version one works even if tier C fails the listening check.
9. **[P] Selection is seeded, round-robin by topic within a fixed subject rotation, with no repeats in a run.** 49 normal slots (17 maths, 16 phonics, 16 spelling) and 5 meteor slots, all pinned at run creation. A band is eligible only if every slot can be filled *and* the bank is at least twice the per-run need.
10. **[P] Invalid content: void the slot, grant its reward once, tell the child honestly, never replace it and never count it.** This resolves the spine's pending question on reward treatment (section 12).
11. **[P] Version-one bank: about 240 authored records** (roughly 36 maths template rows, 32 fixed maths items, 80 phonics, 80 spelling and 12 hand-authored meteor items), about 200 reviewed clips and about 80 activity pictures to make all three ages eligible; the first playable milestone needs exactly one activity and one clip (section 11).
12. **[V]** The 2013–14 national curriculum is still the published statutory text today, but a revised curriculum is on the way (first teaching September 2028). Every curriculum reference therefore carries a framework identifier so the bank can be re-mapped later (section 1.7).

---

## 1. Curriculum sources checked

### 1.1 Source list

| # | Source | What it is | Status and date seen today | URL |
|---|---|---|---|---|
| S1 | National curriculum in England: mathematics programmes of study | Statutory programmes of study; set out year by year for years 1 and 2 | [V] "Updated 28 September 2021" | https://www.gov.uk/government/publications/national-curriculum-in-england-mathematics-programmes-of-study/national-curriculum-in-england-mathematics-programmes-of-study |
| S2 | National curriculum in England: English programmes of study | Statutory; word reading and spelling for years 1 and 2 | [V] published 11 September 2013, last updated 16 July 2014 | https://www.gov.uk/government/publications/national-curriculum-in-england-english-programmes-of-study/national-curriculum-in-england-english-programmes-of-study |
| S3 | English Appendix 1: Spelling (PDF, 26 pages) | Left column statutory; rules and example words non-statutory | [V] © Crown copyright 2013; linked from the S2 publication page | https://assets.publishing.service.gov.uk/media/5a7ccc06ed915d63cc65ce61/English_Appendix_1_-_Spelling.pdf |
| S4 | EYFS statutory framework for group and school-based providers (PDF, 56 pages) | Statutory; contains the early learning goals used at the end of Reception | [V] "Dated: 13 July 2026 / Effective: 01 September 2026" | https://assets.publishing.service.gov.uk/media/6a5f8e4fb00f3323bf1a23a1/EYFS_group_and_school_based_from_September_2026.pdf (listed at https://www.gov.uk/government/publications/early-years-foundation-stage-framework--2) |
| S5 | Development Matters | Non-statutory curriculum guidance for the EYFS; has "children in reception will be learning to" statements | [V] updated 4 September 2023 | https://www.gov.uk/government/publications/development-matters--2/development-matters |
| S6 | The national curriculum (overview guide) | Age, year group, key stage and assessment table | [V] | https://www.gov.uk/national-curriculum |
| S7 | School admissions: school starting age | When children start Reception; compulsory school age | [V] | https://www.gov.uk/schools-admissions/school-starting-age |
| S8 | Choosing a phonics teaching programme | DfE list of validated systematic synthetic phonics (SSP) programmes | [V] "Updated 11 November 2026"; 45 programmes | https://www.gov.uk/government/publications/choosing-a-phonics-teaching-programme/list-of-phonics-teaching-programmes |
| S9 | Validation of SSP programmes: supporting documentation | The 16 essential core criteria and explanatory notes | [V] updated 10 March 2023 | https://www.gov.uk/government/publications/phonics-teaching-materials-core-criteria-and-self-assessment/validation-of-systematic-synthetic-phonics-programmes-supporting-documentation |
| S10 | Letters and Sounds: principles and practice of high quality phonics (DfES-00281-2007, 214 pages) | A 2007 government handbook (guidance, not a curriculum); six phases; several validated programmes carry its name | [V] published 1 April 2007 | https://www.gov.uk/government/publications/letters-and-sounds |
| S11 | The reading framework (PDF, 171 pages) | DfE guidance; Appendix 5 alphabetic code chart, Appendix 6 pronouncing phonemes | [V] published 10 July 2021, last updated 22 September 2023 | https://www.gov.uk/government/publications/the-reading-framework-teaching-the-foundations-of-literacy |
| S12 | 2027 phonics screening check: assessment and reporting arrangements | The arrangements for the year 1 phonics check | [V] "Updated 12 October 2026" | https://www.gov.uk/government/publications/phonics-screening-check-assessment-and-reporting-arrangements-ara/2027-phonics-screening-check-assessment-and-reporting-arrangements |

### 1.2 Age, school year and key stage

[V] The GOV.UK overview (S6) gives this table:

| Child's age during the school year | Year group | Stage | Assessment listed |
|---|---|---|---|
| 4 to 5 | Reception | Early years foundation stage | Reception baseline (first 6 weeks); EYFS profile (April to June) |
| 5 to 6 | Year 1 | Key stage 1 | Phonics screening check |
| 6 to 7 | Year 2 | Key stage 1 | Optional tests and teacher assessments |
| 7 to 8 | Year 3 | Key stage 2 | — |

[V] S7: "Most children start reception full-time in September after their fourth birthday"; compulsory school age "is on 31 December, 31 March or 31 August following their fifth birthday - whichever comes first"; a child who starts the September after turning 5 goes into year 1.
[V] S6: "Other types of school, like academies and private schools, do not have to follow the national curriculum."

**Inference (mine, from the table above):** each year group contains children of two birthday-ages, so each birthday-age spans two year groups:

| Birthday age | Could be in | Extremes |
|---|---|---|
| 5 | Reception (after the 5th birthday) or Year 1 (before the 6th) | A September-born child is 5 for almost all of Reception. An August-born child is 5 for all of Year 1. |
| 6 | Year 1 or Year 2 | First day of Year 1 to last day of Year 2 |
| 7 | Year 2 or Year 3 | First day of Year 2 to last day of Year 3 |

This is the factual basis for the spec's caveat that the age mapping "is a curated product decision, not a claim that birthday age alone identifies a child's school year or attainment" [V prompt.md:475].

### 1.3 Reception: the early learning goals (statutory, S4)

[V] Read directly from the PDF text (`dl09-out/eyfs-2026.txt:544-575`). The ELGs describe "the level of development children should be expected to have reached by the end of the EYFS" (para 1.7) and "should not be used as a curriculum" (para 1.8) — so they are a reference for pitch, not a syllabus.

| Code [P] | Early learning goal text [V] |
|---|---|
| `EYFS26.ELG.WordReading-1` | Say a sound for each letter in the alphabet and at least 10 digraphs. |
| `EYFS26.ELG.WordReading-2` | Read words consistent with their phonic knowledge by sound-blending. |
| `EYFS26.ELG.WordReading-3` | Read aloud simple sentences and books that are consistent with their phonic knowledge, including some common exception words. |
| `EYFS26.ELG.Writing-1` | Write recognisable letters, most of which are correctly formed. |
| `EYFS26.ELG.Writing-2` | Spell words by identifying sounds in them and representing the sounds with a letter or letters. |
| `EYFS26.ELG.Writing-3` | Write simple phrases and sentences that can be read by others. |
| `EYFS26.ELG.Number-1` | Have a deep understanding of numbers to 10, including the composition of each number. |
| `EYFS26.ELG.Number-2` | Subitise (recognise quantities without counting) up to 5. |
| `EYFS26.ELG.Number-3` | Automatically recall (without reference to rhymes, counting or other aids) number bonds up to 5 (including subtraction facts) and some number bonds to 10, including double facts. |
| `EYFS26.ELG.NumPat-1` | Verbally count beyond 20, recognising the pattern of the counting system. |
| `EYFS26.ELG.NumPat-2` | Compare quantities up to 10 in different contexts, recognising when one quantity is greater than, less than or the same as the other quantity. |
| `EYFS26.ELG.NumPat-3` | Explore and represent patterns within numbers up to 10, including evens and odds, double facts and how quantities can be distributed equally. |

[V] The ELGs say nothing about shape; the statutory educational programme for mathematics does ("rich opportunities for children to develop their spatial reasoning skills across all areas of mathematics including shape, space and measures", `eyfs-2026.txt:408-420`).
[V] Development Matters (S5, non-statutory) adds reception statements that are useful as topic references — code prefix `DM23.R`: "count objects, actions and sounds"; "subitise"; "link the number symbol (numeral) with its cardinal number value"; "count beyond 10"; "compare numbers"; "understand the 'one more than or one less than' relationship between consecutive numbers"; "explore the composition of numbers to 10"; "automatically recall number bonds for numbers 0 to 5 and some to 10"; "select, rotate and manipulate shapes to develop spatial reasoning skills"; "continue, copy and create repeating patterns"; "read individual letters by saying the sounds for them"; "blend sounds into words…"; "read some letter groups that each represent one sound…"; "read a few common exception words matched to the school's phonic programme"; "spell words by identifying the sounds and then writing the sound with letters".

### 1.4 Mathematics, key stage 1 (statutory, S1)

[V] Principal focus of key stage 1: pupils "develop confidence and mental fluency with whole numbers, counting and place value", working with "numerals, words and the 4 operations".

The national curriculum does not number its bullets. The codes below are **[P] our own convention**: framework, subject, year, strand, bullet in page order. Wording is as returned from the HTML page today; copy the exact text from S1 when quoting it in content records.

| Code [P] | Year 1 statutory statement [V] |
|---|---|
| `NC14.Ma.Y1.NPV-1` | count to and across 100, forwards and backwards, beginning with 0 or 1, or from any given number |
| `NC14.Ma.Y1.NPV-2` | count, read and write numbers to 100 in numerals; count in multiples of 2s, 5s and 10s |
| `NC14.Ma.Y1.NPV-3` | given a number, identify 1 more and 1 less |
| `NC14.Ma.Y1.NPV-4` | identify and represent numbers using objects and pictorial representations including the number line, and use the language of: equal to, more than, less than (fewer), most, least |
| `NC14.Ma.Y1.NPV-5` | read and write numbers from 1 to 20 in numerals and words |
| `NC14.Ma.Y1.AS-1` | read, write and interpret mathematical statements involving addition (+), subtraction (−) and equals (=) signs |
| `NC14.Ma.Y1.AS-2` | represent and use number bonds and related subtraction facts within 20 |
| `NC14.Ma.Y1.AS-3` | add and subtract one-digit and two-digit numbers to 20, including 0 |
| `NC14.Ma.Y1.AS-4` | solve one-step problems that involve addition and subtraction, using concrete objects and pictorial representations, and missing number problems such as 7 = ? − 9 |
| `NC14.Ma.Y1.MD-1` | solve one-step problems involving multiplication and division, by calculating the answer using concrete objects, pictorial representations and arrays with the support of the teacher |
| `NC14.Ma.Y1.F-1`, `F-2` | recognise, find and name a half as 1 of 2 equal parts / a quarter as 1 of 4 equal parts of an object, shape or quantity |
| `NC14.Ma.Y1.G-1` | recognise and name common 2-D and 3-D shapes, including rectangles (including squares), circles and triangles; cuboids (including cubes), pyramids and spheres |

[V] Year 1 non-statutory notes worth citing: "They recognise and create repeating patterns with objects and with shapes"; "Pupils memorise and reason with number bonds to 10 and 20 in several forms (for example, 9 + 7 = 16; 16 − 7 = 9; 7 = 16 − 9)"; doubling "numbers and quantities"; "connections between arrays, number patterns, and counting in 2s, 5s and 10s". Code prefix `NC14.Ma.Y1.Notes`.

| Code [P] | Year 2 statutory statement [V] |
|---|---|
| `NC14.Ma.Y2.NPV-1` | count in steps of 2, 3, and 5 from 0, and in 10s from any number, forward and backward |
| `NC14.Ma.Y2.NPV-2` | recognise the place value of each digit in a two-digit number (10s, 1s) |
| `NC14.Ma.Y2.NPV-4` | compare and order numbers from 0 up to 100; use <, > and = signs |
| `NC14.Ma.Y2.NPV-5` | read and write numbers to at least 100 in numerals and in words |
| `NC14.Ma.Y2.AS-2` | recall and use addition and subtraction facts to 20 fluently, and derive and use related facts up to 100 |
| `NC14.Ma.Y2.AS-3` | add and subtract numbers using concrete objects, pictorial representations, and mentally, including: a two-digit number and 1s; a two-digit number and 10s; 2 two-digit numbers; adding 3 one-digit numbers |
| `NC14.Ma.Y2.AS-5` | recognise and use the inverse relationship between addition and subtraction and use this to check calculations and solve missing number problems |
| `NC14.Ma.Y2.MD-1` | recall and use multiplication and division facts for the 2, 5 and 10 multiplication tables, including recognising odd and even numbers |
| `NC14.Ma.Y2.MD-2` | calculate mathematical statements for multiplication and division within the multiplication tables and write them using the multiplication (×), division (÷) and equals (=) signs |
| `NC14.Ma.Y2.G-1` | identify and describe the properties of 2-D shapes, including the number of sides, and line symmetry in a vertical line |
| `NC14.Ma.Y2.G-2` | identify and describe the properties of 3-D shapes, including the number of edges, vertices and faces |
| `NC14.Ma.Y2.G-4` | compare and sort common 2-D and 3-D shapes and everyday objects |
| `NC14.Ma.Y2.PD-1` | order and arrange combinations of mathematical objects in patterns and sequences |

[V] Year 2 non-statutory notes: partition numbers in different ways ("23 = 20 + 3 and 23 = 10 + 13"); use "3 + 7 = 10 … to calculate 30 + 70 = 100"; "become fluent in the 2, 5 and 10 multiplication tables". [V] Year 3 (for the upper boundary): "recall and use multiplication and division facts for the 3, 4 and 8 multiplication tables" — so "age-appropriate times tables" [V prompt.md:479] means 2, 5 and 10 for band 7, and counting in 2s, 5s and 10s for band 6.

Fractions, measurement, money, time and statistics are statutory in key stage 1 but are **not** in the spec's subject list [V prompt.md:479]; I leave them out of version one and list them as later candidates.

### 1.5 English, key stage 1: word reading and spelling (statutory, S2 and S3)

| Code [P] | Year 1 statement [V] |
|---|---|
| `NC14.En.Y1.WR-1` | apply phonic knowledge and skills as the route to decode words |
| `NC14.En.Y1.WR-2` | respond speedily with the correct sound to graphemes (letters or groups of letters) for all 40+ phonemes, including, where applicable, alternative sounds for graphemes |
| `NC14.En.Y1.WR-3` | read accurately by blending sounds in unfamiliar words containing GPCs that have been taught |
| `NC14.En.Y1.WR-4` | read common exception words, noting unusual correspondences between spelling and sound and where these occur in the word |
| `NC14.En.Y1.WR-5` | read words containing taught GPCs and –s, –es, –ing, –ed, –er and –est endings |
| `NC14.En.Y1.WR-6` | read other words of more than one syllable that contain taught GPCs |
| `NC14.En.Y1.WR-7` | read words with contractions [for example, I'm, I'll, we'll] |
| `NC14.En.Y1.Sp-1` | spell: (a) words containing each of the 40+ phonemes already taught; (b) common exception words; (c) the days of the week |
| `NC14.En.Y1.Sp-2` | name the letters of the alphabet: (a) in order; (b) using letter names to distinguish between alternative spellings of the same sound |
| `NC14.En.Y1.Sp-3` | add prefixes and suffixes: (a) –s or –es; (b) the prefix un–; (c) –ing, –ed, –er and –est where no change is needed in the spelling of root words |
| `NC14.En.Y1.Sp-4` | apply simple spelling rules and guidance, as listed in English appendix 1 |

| Code [P] | Year 2 statement [V] |
|---|---|
| `NC14.En.Y2.WR-1` | continue to apply phonic knowledge and skills as the route to decode words until automatic decoding has become embedded and reading is fluent |
| `NC14.En.Y2.WR-2` | read accurately by blending the sounds in words that contain the graphemes taught so far, especially recognising alternative sounds for graphemes |
| `NC14.En.Y2.WR-3` | read accurately words of two or more syllables that contain the same graphemes as above |
| `NC14.En.Y2.WR-4` | read words containing common suffixes |
| `NC14.En.Y2.WR-5` | read further common exception words |
| `NC14.En.Y2.Sp-1` | spell by: (a) segmenting spoken words into phonemes and representing these by graphemes; (b) learning new ways of spelling phonemes for which 1 or more spellings are already known, including a few common homophones; (c) common exception words; (d) contracted forms; (e) the possessive apostrophe (singular); (f) distinguishing between homophones and near-homophones |
| `NC14.En.Y2.Sp-2` | add suffixes to spell longer words including –ment, –ness, –ful, –less, –ly |
| `NC14.En.Y2.Sp-3` | apply spelling rules and guidance, as listed in English appendix 1 |

**English Appendix 1 (S3)** — read directly from the PDF text. Code prefix `NC14.EnApp1.Y1` / `.Y2` plus a short row name. "In this spelling appendix, the left-hand column is statutory; the middle and right-hand columns are non-statutory guidance" [V `dl09-out/appendix1-spelling.txt:43-44`]. The example words are therefore a safe, official starting word list for authors.

Year 1 rows [V `appendix1-spelling.txt:55-242`]:

| Row (statutory heading) | Example words from the appendix (non-statutory) |
|---|---|
| Revision of reception work | all letters and their common sounds; taught consonant and vowel digraphs; segmenting spoken words; words with adjacent consonants |
| /f/, /l/, /s/, /z/, /k/ spelt ff, ll, ss, zz, ck | off, well, miss, buzz, back |
| /ŋ/ spelt n before k | bank, think, honk, sunk |
| Division of words into syllables | pocket, rabbit, carrot, thunder, sunset |
| –tch | catch, fetch, kitchen, notch, hutch |
| /v/ at the end of words | have, live, give |
| Adding s and es | cats, dogs, spends, rocks, thanks, catches |
| Adding –ing, –ed, –er to verbs (no change to root) | hunting, hunted, hunter, buzzing, buzzed, buzzer, jumping, jumped, jumper |
| Adding –er and –est to adjectives (no change) | grander, grandest, fresher, freshest, quicker, quickest |
| Vowel digraphs and trigraphs | ai (rain, wait, train, paid, afraid); oi (oil, join, coin, point, soil); ay (day, play, say, way, stay); oy (boy, toy, enjoy, annoy); a–e (made, came, same, take, safe); e–e (these, theme, complete); i–e (five, ride, like, time, side); o–e (home, those, woke, hope, hole); u–e (June, rule, rude, use, tube, tune); ar (car, start, park, arm, garden); ee (see, tree, green, meet, week); ea /iː/ (sea, dream, meat, each); ea /ɛ/ (head, bread, meant, instead); er (her, term, verb, person; better, under, summer, winter, sister); ir (girl, bird, shirt, first, third); ur (turn, hurt, church, burst, Thursday); oo /uː/ (food, pool, moon, zoo, soon); oo /ʊ/ (book, took, foot, wood, good); oa (boat, coat, road, coach, goal); oe (toe, goes); ou (out, about, mouth, around, sound); ow /aʊ/ (now, how, brown, down, town); ow /əʊ/ (own, blow, snow, grow, show); ue (blue, clue, true, rescue, Tuesday); ew (new, few, grew, flew, drew, threw); ie /aɪ/ (lie, tie, pie, cried, tried, dried); ie /iː/ (chief, field, thief); igh (high, night, light, bright, right); or (for, short, born, horse, morning); ore (more, score, before, wore, shore); aw (saw, draw, yawn, crawl); au (author, August, dinosaur, astronaut); air (air, fair, pair, hair, chair); ear (dear, hear, beard, near, year); ear /ɛə/ (bear, pear, wear); are /ɛə/ (bare, dare, care, share, scared) |
| Words ending –y | very, happy, funny, party, family |
| New consonant spellings ph and wh | dolphin, alphabet, phonics, elephant; when, where, which, wheel, while |
| Using k for the /k/ sound | Kent, sketch, kit, skin, frisky |
| Adding the prefix un– | unhappy, undo, unload, unfair, unlock |
| Compound words | football, playground, farmyard, bedroom, blackberry |
| Common exception words | the, a, do, to, today, of, said, says, are, were, was, is, his, has, I, you, your, they, be, he, me, she, we, no, go, so, by, my, here, there, where, love, come, some, one, once, ask, friend, school, put, push, pull, full, house, our |

Year 2 rows [V `appendix1-spelling.txt:251-427`]:

| Row (statutory heading) | Example words from the appendix (non-statutory) |
|---|---|
| /dʒ/ spelt ge and dge at the end of words, and g before e, i, y | badge, edge, bridge, dodge, fudge; age, huge, change, charge, bulge, village; gem, giant, magic, giraffe, energy; jacket, jar, jog, join, adjust |
| /s/ spelt c before e, i and y | race, ice, cell, city, fancy |
| /n/ spelt kn and gn at the beginning of words | knock, know, knee, gnat, gnaw |
| /r/ spelt wr at the beginning of words | write, written, wrote, wrong, wrap |
| /l/ or /əl/ spelt –le, –el, –al; words ending –il | table, apple, bottle, little, middle; camel, tunnel, squirrel, travel, towel, tinsel; metal, pedal, capital, hospital, animal; pencil, fossil, nostril |
| /aɪ/ spelt –y at the end of words | cry, fly, dry, try, reply, July |
| Adding –es to nouns and verbs ending in –y | flies, tries, replies, copies, babies, carries |
| Adding –ed, –ing, –er, –est to a root ending in consonant + y | copied, copier, happier, happiest, cried, replied; but copying, crying, replying |
| Adding endings to words ending in –e with a consonant before it | hiking, hiked, hiker, nicer, nicest, shiny |
| Adding endings to one-syllable words ending in a single consonant after a single vowel | patting, patted, humming, hummed, dropping, dropped, sadder, saddest, fatter, fattest, runner, runny |
| /ɔː/ spelt a before l and ll | all, ball, call, walk, talk, always |
| /ʌ/ spelt o | other, mother, brother, nothing, Monday |
| /iː/ spelt –ey | key, donkey, monkey, chimney, valley |
| /ɒ/ spelt a after w and qu | want, watch, wander, quantity, squash |
| /ɜː/ spelt or after w; /ɔː/ spelt ar after w | word, work, worm, world, worth; war, warm, towards |
| /ʒ/ spelt s | television, treasure, usual |
| Suffixes –ment, –ness, –ful, –less, –ly | enjoyment, sadness, careful, playful, hopeless, plainness, badly; merriment, happiness, plentiful, penniless, happily |
| Contractions | can't, didn't, hasn't, couldn't, it's, I'll |
| The possessive apostrophe (singular nouns) | Megan's, Ravi's, the girl's, the child's, the man's |
| Words ending in –tion | station, fiction, motion, national, section |
| Homophones and near-homophones | there/their/they're, here/hear, quite/quiet, see/sea, bare/bear, one/won, sun/son, to/too/two, be/bee, blue/blew, night/knight |
| Common exception words | door, floor, poor, because, find, kind, mind, behind, child, children, wild, climb, most, only, both, old, cold, gold, hold, told, every, everybody, even, great, break, steak, pretty, beautiful, after, fast, last, past, father, class, grass, pass, plant, path, bath, hour, move, prove, improve, sure, sugar, eye, could, should, would, who, whole, any, many, clothes, busy, people, water, again, half, money, Mr, Mrs, parents, Christmas |

[V] The appendix itself warns that accent matters: "past, last, fast, path and bath are not exceptions in accents where the a in these words is pronounced /æ/" (`appendix1-spelling.txt:398-403`) and that its IPA table is "based on Received Pronunciation and could be significantly different in other accents" (`:1015-1020`). **Consequence [P]:** do not author sound-discrimination items that depend on the bath/trap split or on u-in-but versus oo-in-foot; a single synthetic southern-British voice will mark some children's home accent as "wrong".

### 1.6 Phonics progression as commonly taught

- [V] S8: 45 programmes are on the DfE's validated list; "There is no statutory requirement for schools to choose one of the SSP programmes on the validated list"; the validation process "has now been completed". Many validated programmes carry "Letters and Sounds" in their name (for example "Little Wandle Letters and Sounds Revised", "Essential Letters and Sounds", "Unlocking Letters and Sounds").
- [V] S9 core criteria: a programme must "enable children to start learning phonic knowledge and skills early in reception", "provide a structured route for most children to meet or exceed the expected standard in the year one phonics screening check", "progress from simple to more complex phonic knowledge and skills", teach blending "from left to right" for reading and "segmenting spoken words into their constituent phonemes for spelling", and teach "common-exception words (sometimes called 'tricky' words)".
- [V] S10 (Letters and Sounds 2007) gives a concrete, government-published progression. Phase timings confirmed from the rendered appendix pages (PDF pages 173, 203, 204):

| Phase | When (per the 2007 handbook) | Content [V `dl09-out/letters-and-sounds-2007.txt:2268-2277, 3526-3545, 6334-6344, 9365-9425`] |
|---|---|---|
| Two | "up to 6 weeks" (Reception) | Letter sets, one per week: (1) s a t p; (2) i n m d; (3) g o c k; (4) ck e u r; (5) h b f,ff l,ll ss. Read tricky words the, to, I, no, go. Blend and segment VC and CVC words. |
| Three | "up to 12 weeks" (Reception) | Set 6: j v w x; set 7: y z,zz qu. Then ch, sh, th, ng, ai, ee, igh, oa, oo, ar, or, ur, ow, oi, ear, air, ure, er. Letter names are learned in this phase. Read he, she, we, me, be, was, my, you, her, they, all, are; spell the, to, I, no, go. |
| Four | "4–6 weeks" | Consolidation: "reading and spelling words containing adjacent consonants and polysyllabic words" (`:5049-5050`). Read some, one, said, come, do, so, were, when, have, there, out, like, little, what. |
| Five | "throughout Year 1" | New graphemes for reading: ay, ou, ie, ea, oy, ir, ue, aw, wh, ph, ew, oe, au, a-e, e-e, i-e, o-e, u-e; alternative pronunciations; the phoneme /zh/. |
| Six | "throughout Year 2" | Fluency; past tense; suffixes; spelling longer words. |

- [U] Individual validated programmes teach graphemes in somewhat different orders and group them differently (I did not verify any vendor's own progression today; only school-hosted copies were reachable). Because of this, and because no programme is statutory, the game must not assume a child's school sequence. This is another reason the bank is pitched conservatively.
- [V] S12: the year 1 check "consists of 20 real words and 20 pseudo-words that pupils read aloud to the check administrator"; it is taken by pupils who "will have reached the age of 6 and completed the first year of the KS1 English programme of study", and by year 2 pupils who have not met the standard. Pseudo-words are therefore a legitimate, familiar format for ages 5–7 — and "alien names" suit this game.
- [V] S11 Appendix 6 (`dl09-out/reading-framework.txt:6047-6126`): "Teachers should enunciate phonemes clearly, and avoid adding schwa"; /p/ /t/ /k/ /ch/ /f/ /th/ /s/ /sh/ /h/ are unvoiced; /b/ /d/ /g/ /j/ "cannot be heard clearly in isolation, unless small schwa is added"; /w/ and /y/ "cannot be pronounced clearly in isolation, unless they are pronounced as vowel sounds (/oo/ and /ee/) or a small schwa is added". This drives the audio tier policy in section 6.4.

### 1.7 Curriculum change watch

- [V] DfE Education Hub, 5 November 2025: "The final curriculum will be published in spring 2027, and schools will start teaching it from September 2028." https://educationhub.blog.gov.uk/2025/11/what-you-need-to-know-about-the-changes-to-the-national-curriculum/
- [V] GOV.UK news story dated 8 November 2026 says the new national curriculum is "due to be published in full later this year". https://www.gov.uk/government/news/curriculum-overhaul-to-re-engage-pupils-in-vital-early-secondary-years
- [V] As of today the programme-of-study pages S1 and S2 are unchanged (last updated 2021 and 2014).
- [U] I found no published key stage 1 detail of the revised curriculum today.
- **[P] Design consequence:** every `curriculumReference` carries a framework identifier (`NC14`, `EYFS26`, `DM23`, `LS07`). When the revised curriculum is published, add a new framework identifier and re-map topic by topic; nothing in a pinned run changes.

---

## 2. Age to content-bank mapping

### 2.1 The rule

- [V prompt.md:219, 221] The bank is derived from date of birth; the age band and content versions are pinned when the run is created; a birthday affects new runs only.
- [P] `ageBand` = age in completed years on the run-creation date (Europe/London, per the spine), accepted only if it is 5, 6 or 7.
- [P] Bank for band N = every published, selectable activity with `minAge ≤ N ≤ maxAge`.
- [P] **An activity may span at most two adjacent ages** (`maxAge − minAge ≤ 1`). Shared 5–6 and 6–7 items give continuity and cut authoring cost; forbidding 5–7 keeps "questions differ by age" obviously true and AC-06/AC-13 easy to demonstrate.

### 2.2 The curated mapping

| Band | Could be in school year [V §1.2] | Anchor for the bank [P] | Mix realised through the topic list [P] | Phonics stage reference [V §1.6] |
|---|---|---|---|---|
| 5 | Reception or Year 1 | End-of-Reception early learning goals, plus the first part of Year 1 | about three quarters Reception-stage topics, one quarter early Year 1 | Letters and Sounds phases 2–4; no phase 5 graphemes required |
| 6 | Year 1 or Year 2 | The Year 1 programme of study, complete | about one fifth consolidation from band 5, most of the rest Year 1, a little early Year 2 | Phase 5 ("throughout Year 1"); pseudo-words as in the year 1 check |
| 7 | Year 2 or Year 3 | The Year 2 programme of study, complete | about one quarter Year 1 consolidation, three quarters Year 2; no Year 3 content | Phase 6 ("throughout Year 2") and the Year 2 spelling appendix |

### 2.3 Why pitch towards the lower school year

1. [V prompt.md:165, 501] There is no adaptive difficulty and no parent override, so nothing can rescue a child from a bank that is too hard.
2. [V prompt.md:451, 513-515] The cost of a too-hard item is real (no reward after three attempts); the cost of a too-easy item is only a little less stretch.
3. [V §1.4] Fluent recall is itself a curriculum aim ("confidence and mental fluency"), so practice at or slightly below the child's teaching level is still on-curriculum.
4. [U] Within a year group, autumn-born children tend to attain more highly than summer-born children. If so, age is a slightly better proxy than the two-year spread suggests: the Reception children in band 5 are the oldest in their class and the Year 1 children in band 5 are the youngest in theirs. I did not verify a source for this today, so treat it as a plausible softener, not a justification.

### 2.4 The caveat to print in the plan and the operator notes

> The age bank is a curated product decision. A birthday does not tell us a child's school year, the phonics programme their school uses, or what they can do. Some children will find their bank easy and some will find it hard. The game never changes difficulty in response, never labels content with a school year, and never shows the child a level.

Practical consequences [P]:

- The UI never shows "Year 1" or "easy/hard" labels. Curriculum references are operator-facing metadata only.
- **Boundary ages.** A child aged 4 or 8 has no bank: the honest `CONTENT_UNAVAILABLE` message applies [V prompt.md:219]. Note the *eighth-birthday cliff*: a run in progress continues, but a new run cannot be started the day a child turns 8. If the owner wants to avoid that, the only legitimate route is an explicit operator decision to publish band-7 content with `maxAge = 8` (curation, not silent fallback). Flagged as owner decision D-3 in section 13.
- 29 February birthdays need a stated rule (for example "birthday falls on 1 March in non-leap years") [U — the legal convention was not checked today]; whichever rule is chosen must be the same in the profile code and the tests.
- [V prompt.md:219] Date of birth never appears in content, speech requests, audio keys or logs. Only `ageBand` (5, 6 or 7) is stored on the run and used in logs.

---

## 3. Topic tables by age and subject

Everything in this section is **[P]** except the curriculum statements the codes point to, which are [V] in section 1.

**How to read the tables**

- `topicId` is the stable key used by selection, by the learning summary and by the admin filter. Format `<subject>.<area>.<specific>`, lower case, at most 40 characters. **Topic IDs are append-only: never renamed, never reused.** The child-facing title can change; the ID cannot, because learning summaries are keyed on it.
- [P] The topic registry (ID, child-facing title, subject, stage, bands, curriculum references) lives in the repository as one versioned JSON file shipped to both apps and both API Lambdas. Adding a topic is a normal release. This avoids typo-topics and gives the admin a dropdown instead of free text.
- **Types:** PS picture selection · NS number selection · OM moving/counting/sorting objects · AR arranging letters or ordered items · MC multiple choice · TY typed numeric or word answer (definitions in section 4).
- **Audio:** *None* = no clip needed to answer. *Optional* = a clip helps but a picture or text also identifies the target. *Required* = the answer depends on hearing; the activity is not shown as ready until the clip bytes are available. Tiers A/B/C are explained in section 6.4 (A = whole word, B = isolated continuant or vowel sound, C = isolated stop consonant).
- **Source:** T = template (generator kind named, section 8) · H = hand-authored fixed item.
- Examples illustrate the format. Every real item still goes through the review checklist in section 5.3 (homophones, real-word distractors, accent, picture clarity).

### 3.1 Age 5 — maths (13 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `maths.count.objects-to10` | Counts up to 10 pictured objects and gives the numeral; or counts out a number of objects | EYFS26.ELG.Number-1; DM23.R "count objects…", "link the number symbol…"; NC14.Ma.Y1.NPV-4 | NS, PS, OM, TY | None | T `COUNT_OBJECTS`, `COUNT_OUT` | 8 stars → choose 8 on a 0–10 number track |
| `maths.count.subitise-to5` | Recognises dice and five-frame patterns up to 5 | EYFS26.ELG.Number-2 | NS, PS | None | T `COUNT_OBJECTS` (dice layouts) | dice face of 4 → choose 4. Untimed, so it cannot force true subitising; it still practises the patterns |
| `maths.count.objects-to20` | Counts 11–20 objects set out in ten-frames or rows | EYFS26.ELG.NumPat-1; DM23.R "count beyond 10"; NC14.Ma.Y1.NPV-2 | NS, TY | None | T `COUNT_OBJECTS` | a full ten-frame and 4 more → 14 |
| `maths.compare.to10` | Finds the most, the fewest or the same; orders three or four numbers | EYFS26.ELG.NumPat-2; NC14.Ma.Y1.NPV-4 | PS, MC, AR | None | T `PICK_EXTREME`, `ORDER_NUMBERS` | four plates of stars (3, 6, 4, 8): "Which has the most?" |
| `maths.number.one-more-less-to10` | One more or one less than a number to 10 | DM23.R "one more than or one less than"; NC14.Ma.Y1.NPV-3 | NS, TY, MC | None | T `ONE_MORE_LESS` | "One more than 6?" → 7 |
| `maths.bonds.to5` | Parts that make 5, with take-away facts | EYFS26.ELG.Number-3 | NS, MC, OM | None | T `BOND_TO` | five-frame with 3 filled: "How many more to make 5?" → 2 |
| `maths.bonds.to10` | Parts that make 10 on a ten-frame | EYFS26.ELG.Number-3; NC14.Ma.Y1.AS-2 | NS, MC, OM | None | T `BOND_TO` | ten-frame with 7 filled → 3 |
| `maths.add.within10` | Combines two pictured groups, total up to 10 | EYFS26.ELG.Number-1; NC14.Ma.Y1.AS-3 | NS, TY, OM | None | T `ADD_WITHIN` | 4 rockets and 3 rockets → 7 |
| `maths.subtract.within10` | Takes away with pictures, starting from up to 10 | EYFS26.ELG.Number-3; NC14.Ma.Y1.AS-3 | NS, TY | None | T `SUB_WITHIN` | 8 aliens, 3 fade away → 5 |
| `maths.double-halve.to10` | Doubles to 5 + 5; halves an even number to 10 | EYFS26.ELG.Number-3, NumPat-3 | NS, OM | None | T `DOUBLE_HALVE` | "Double 4" → 8 |
| `maths.share.equal-groups` | Shares objects equally between two | EYFS26.ELG.NumPat-3 | OM, MC | None | T `SHARE_EQUALLY` | share 6 stars between Nova and Pip → 3 each |
| `maths.pattern.repeating` (5–6) | Continues an AB, AAB, ABB or ABC pattern of shapes | DM23.R "continue, copy and create repeating patterns"; NC14.Ma.Y1.Notes | PS, AR | None | T `PATTERN_NEXT`, some H | circle, triangle, circle, triangle, ? → circle |
| `maths.shape.name-2d` | Recognises and names circle, triangle, square, rectangle | NC14.Ma.Y1.G-1; EYFS maths programme (shape) | PS, MC, OM | None | H | "Which one is a triangle?" from four shapes |

### 3.2 Age 5 — phonics (9 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `phonics.gpc.letters-set-a` | Hears a sound (or a word) and chooses its letter: s a t p i n m d g o c k | EYFS26.ELG.WordReading-1; LS07 phase 2 sets 1–3 | MC, PS | Required. Tier B for s, a, i, n, m, o; tier C for t, p, d, g, c, k | H | hear /s/ → s from s, a, t, p |
| `phonics.gpc.letters-set-b` | Same for e u r h b f l j v w x y z qu, and ck ff ll ss zz | EYFS26.ELG.WordReading-1; LS07 phase 2 sets 4–5, phase 3 sets 6–7 | MC, PS | Required. Tier B for e, u, f, l, v, z, x; tier C for r, h, b, j, w, y, qu | H | hear "van": "Which letter does it start with?" → v from v, f, w, n |
| `phonics.initial-sounds` | Picks the picture that begins with the sound heard | EYFS26.ELG.WordReading-1; LS07 phase 2 | PS | Required (sound) | H | hear /m/ → moon from moon, sun, cat, dog |
| `phonics.gpc.consonant-digraphs` (5–6) | Hears the sound, chooses ch, sh, th or ng | EYFS26.ELG.WordReading-1 ("at least 10 digraphs"); LS07 phase 3 | MC | Required. Tier B (sh, ch); tier C (th, ng) | H | hear /sh/ → sh from s, sh, ch, th |
| `phonics.gpc.vowel-digraphs` (5–6) | Hears the sound, chooses ai, ee, igh, oa, oo, ar, or, ur, ow, oi, ear, air, er | EYFS26.ELG.WordReading-1; LS07 phase 3 | MC | Required, tier B | H | hear /ee/ → ee from ee, ai, oa, oo |
| `phonics.blend.cvc` | Reads a CVC word and chooses its picture; or hears a word and chooses it in writing | EYFS26.ELG.WordReading-2; DM23.R "blend sounds into words" | PS, MC | Tier A, or none when the child reads | H | read "pin" → the pin from pin, pan, pen, pig |
| `phonics.blend.digraph-words` | The same with phase 3 graphemes | EYFS26.ELG.WordReading-2 | PS, MC | Tier A, or none | H | hear "ship" → ship from ship, shop, chip, sheep |
| `phonics.blend.adjacent-consonants` (5–6) | Words with adjacent consonants (CVCC, CCVC) | NC14.EnApp1.Y1 revision "words with adjacent consonants"; LS07 phase 4 | PS, MC | Tier A, or none | H | hear "frog" → frog from frog, fog, from, flag |
| `phonics.tricky.read-set1` | Hears a common exception word and chooses it in writing | EYFS26.ELG.WordReading-3; LS07 phase 2–3 tricky words | MC | Required, tier A | H | hear "she" → she from she, he, we, me |

### 3.3 Age 5 — spelling (8 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `spelling.cvc.build` | Builds a CVC word from letter tiles (picture and word cue) | EYFS26.ELG.Writing-2; NC14.EnApp1.Y1 revision | AR | Optional word clip, tier A | H | tiles c, a, t, o, n → "cat" |
| `spelling.cvc.missing-letter` | Chooses the missing first, middle or last letter | EYFS26.ELG.Writing-2 | MC | Optional | H | d _ g with a dog picture → o from o, i, u, a |
| `spelling.sounds.count` | Counts the sounds in a spoken word (segmenting before spelling) | EYFS26.ELG.Writing-2; NC14.EnApp1.Y1 revision "segmenting spoken words into sounds" | NS | Required, tier A | H | hear "ship" → 3 |
| `spelling.digraph.build` | Builds words with sh, ch, th, ng, ai, ee, oa, oo from grapheme tiles | EYFS26.ELG.Writing-2; NC14.EnApp1.Y1 revision | AR | Optional, tier A | H | tiles sh, i, p, ch, o → "ship" |
| `spelling.double-letters` (5–6) | ff, ll, ss, zz, ck after a short vowel | NC14.EnApp1.Y1 "ff, ll, ss, zz and ck" | MC, AR | Optional | H | bell picture → bell from bel, bell, bal, ball |
| `spelling.adjacent-consonants.build` | Builds CVCC and CCVC words | NC14.EnApp1.Y1 revision "words with adjacent consonants" | AR | Optional, tier A | H | tiles f, r, o, g, l → "frog" |
| `spelling.tricky.set1` | Spells the, to, I, no, go, he, she, we, me, be | LS07 phases 3–4 (tricky words to spell); EYFS26.ELG.WordReading-3 | MC, AR | Required, tier A (no picture is possible) | H | hear "the" → the from the, thu, tha, teh |
| `spelling.alphabet.upper-lower` (5–6) | Matches capital and lower-case letters (also helps with keyboard keycaps) | NC14.En.Y1.Sp-2 (weaker link: letter knowledge) | MC, PS | Optional letter-name clip | H | "Which is the little letter for G?" → g from g, q, j, y |

Typed *word* answers are deliberately absent at age 5 (owner decision D-7): keycaps show capitals while early readers learn lower-case letters, so tiles are kinder. Typed *numbers* are fine.

### 3.4 Age 6 — maths (14 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `maths.count.to100` | Says what comes next or before; fills a gap on a number track or hundred square | NC14.Ma.Y1.NPV-1, NPV-2 | NS, TY, AR | None | T `SEQUENCE_GAP` | 47, 48, ?, 50 → 49 |
| `maths.count.steps-2-5-10` | Continues counting in 2s, 5s and 10s | NC14.Ma.Y1.NPV-2 | TY, NS, MC | None | T `SKIP_COUNT` | 5, 10, 15, ? → 20 |
| `maths.compare.to100` | More than, less than, most, least; orders numbers | NC14.Ma.Y1.NPV-4 | MC, PS, AR | None | T `PICK_EXTREME`, `ORDER_NUMBERS` | "Which is the least?" 31, 13, 30, 23 → 13 |
| `maths.number.one-more-less-to100` | One more or one less than any number to 100 | NC14.Ma.Y1.NPV-3 | TY, NS | None | T `ONE_MORE_LESS` | "One less than 60?" → 59 |
| `maths.number.words-to20` | Matches numerals and number words 1–20 | NC14.Ma.Y1.NPV-5 | MC, TY | None | T `NUMBER_WORD` | "twelve" → 12 |
| `maths.bonds.to10` (5–6) | Recalls bonds to 10 as number sentences | NC14.Ma.Y1.AS-2 | NS, TY, MC | None | T `BOND_TO` | 6 + ? = 10 → 4 |
| `maths.bonds.to20` (6–7) | Bonds and related subtraction facts within 20 | NC14.Ma.Y1.AS-2 | NS, TY | None | T `BOND_TO` | 13 + ? = 20 → 7 |
| `maths.add.within20` | Adds one-digit and two-digit numbers to 20, including 0 | NC14.Ma.Y1.AS-1, AS-3 | TY, NS, MC | None | T `ADD_WITHIN` | 9 + 7 = ? → 16 |
| `maths.subtract.within20` | Subtracts within 20 | NC14.Ma.Y1.AS-1, AS-3 | TY, NS, MC | None | T `SUB_WITHIN` | 16 − 7 = ? → 9 |
| `maths.missing-number.within20` | Finds a missing number in any position | NC14.Ma.Y1.AS-4 | TY, NS | None | T `MISSING_NUMBER` | 7 = ? − 9 → 16 |
| `maths.double-halve.to20` | Doubles numbers to 10; halves even numbers to 20 | NC14.Ma.Y1.Notes (doubling); NC14.Ma.Y1.F-1 | NS, TY, OM | None | T `DOUBLE_HALVE` | "Half of 14" → 7 |
| `maths.multiply.groups-arrays` | Counts equal groups and simple arrays | NC14.Ma.Y1.MD-1 | NS, TY, PS | None | T `EQUAL_GROUPS` | 3 rockets with 2 astronauts each → 6 |
| `maths.pattern.repeating` (5–6) | Longer and two-attribute repeating patterns | NC14.Ma.Y1.Notes | PS, AR | None | T `PATTERN_NEXT`, some H | square, square, circle, square, square, ? → circle |
| `maths.shape.name-2d-3d` | Names rectangles, squares, circles, triangles, cuboids, cubes, pyramids, spheres; sorts flat from solid | NC14.Ma.Y1.G-1 | PS, MC, OM | None | H | sort six shapes into "flat" and "solid" |

### 3.5 Age 6 — phonics (9 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `phonics.gpc.consonant-digraphs` (5–6) | Consolidation of ch, sh, th, ng | NC14.En.Y1.WR-2 | MC | Required, tier B/C | H | as age 5 |
| `phonics.gpc.vowel-digraphs` (5–6) | Consolidation of the phase 3 vowel graphemes | NC14.En.Y1.WR-2 | MC | Required, tier B | H | hear /oa/ → oa from oa, ow, oo, ai |
| `phonics.blend.adjacent-consonants` (5–6) | CCVCC and CCCVC words | NC14.En.Y1.WR-3; LS07 phase 4 | MC, PS | Tier A | H | hear "stamp" → stamp from stamp, stomp, stump, tramp |
| `phonics.gpc.phase5-graphemes` | Chooses the word or grapheme for ay, ou, ie, ea, oy, ir, ue, aw, wh, ph, ew, oe, au | NC14.En.Y1.WR-2; LS07 phase 5 | MC, PS | Required, tier A or B | H | hear "cloud" → cloud from cloud, clown, could, cold |
| `phonics.gpc.split-digraphs` | a–e, e–e, i–e, o–e, u–e minimal pairs | NC14.EnApp1.Y1 rows a–e to u–e | MC | Required, tier A | H | hear "kite" → kite from kit, kite, cut, cute |
| `phonics.alt-pronunciation` (6–7) | Same grapheme, different sound: ow, ea, oo, ie | NC14.En.Y1.WR-2 | MC, OM | Tier A (key words) | H | "Which word has the same ow sound as snow?" → grow from grow, down, town, brown |
| `phonics.pseudo-words` (6–7) | "Alien names": hears a made-up word and chooses its spelling | NC14.En.Y1.WR-3; year 1 check format (S12) | MC, PS | Required; SSML phonemes | H | hear "chom" → chom from chom, shom, chon, chob |
| `phonics.endings.read` | Reads words with –s, –es, –ing, –ed, –er, –est; two-syllable words | NC14.En.Y1.WR-5, WR-6 | MC, NS | Tier A | H | hear "jumping" → jumping from jumped, jumping, jumper, jumps |
| `phonics.tricky.read-y1` | Year 1 common exception words | NC14.En.Y1.WR-4; NC14.EnApp1.Y1 common exception words | MC | Required, tier A | H | hear "said" → said from said, sad, side, says |

### 3.6 Age 6 — spelling (12 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `spelling.double-letters` (5–6) | ff, ll, ss, zz, ck | NC14.EnApp1.Y1 | MC, AR, TY | Optional | H | off, well, miss, buzz, back |
| `spelling.alphabet.upper-lower` (5–6) | Capital and lower-case pairs | NC14.En.Y1.Sp-2 | MC | Optional | H | as age 5 |
| `spelling.y1.nk-tch-ve` | /ŋ/ before k; –tch; /v/ at the end of words | NC14.EnApp1.Y1 rows | MC, AR, TY | Tier A or picture | H | hear "catch" → catch from cach, catch, katch, cotch |
| `spelling.y1.vowel-digraphs-1` | ai/ay/a–e, ee/ea/e–e, igh/ie/i–e, oa/ow/oe/o–e, oo/ue/ew/u–e | NC14.EnApp1.Y1 vowel digraph rows | AR, MC, TY | Tier A plus picture | H | tiles r, ai, n, ay, a → "rain" |
| `spelling.y1.vowel-digraphs-2` | ar, or/ore/aw/au, air/ear/are, er/ir/ur, ou/ow, oi/oy | NC14.EnApp1.Y1 vowel digraph rows | AR, MC, TY | Tier A plus picture | H | hear "bird" → bird from berd, bird, burd, bid |
| `spelling.y1.plurals-s-es` | Adds –s or –es | NC14.En.Y1.Sp-3a | MC, TY | None | H | "one fox, two …" → foxes from foxs, foxes, foxis, foxez |
| `spelling.y1.endings-ing-ed-er-est` | Adds endings with no change to the root | NC14.En.Y1.Sp-3c | TY, MC, AR | None | H | "jump + ed" → jumped |
| `spelling.y1.prefix-un` | Adds un– | NC14.En.Y1.Sp-3b | AR, TY | None | H | "un + lock" → unlock |
| `spelling.y1.compound-words` | Joins two words | NC14.EnApp1.Y1 compound words | AR | Optional | H | tiles foot, ball, bed, room with a football picture → "football" |
| `spelling.y1.y-ph-wh-k` | –y endings; ph and wh; k before e, i, y | NC14.EnApp1.Y1 rows | MC, TY | Tier A | H | hear "happy" → happy from happy, happi, hapy, happee |
| `spelling.y1.exception-words` (6–7) | Year 1 common exception words | NC14.En.Y1.Sp-1b | MC, TY, AR | Required, tier A | H | hear "said" → said from sed, said, siad, sayd |
| `spelling.y1.days-and-alphabet` | Orders and spells the days of the week; puts letters in alphabetical order | NC14.En.Y1.Sp-1c, Sp-2a | AR, MC, TY | Optional | H | order d, b, e, c → b, c, d, e |

### 3.7 Age 7 — maths (14 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `maths.count.steps-2-3-5-10` | Counts in 2s, 3s, 5s from 0 and in 10s from any number, forwards and backwards | NC14.Ma.Y2.NPV-1 | TY, NS, AR | None | T `SKIP_COUNT` | 37, 47, 57, ? → 67 |
| `maths.placevalue.tens-ones` | Tens and ones in a two-digit number; partitions | NC14.Ma.Y2.NPV-2 | MC, TY, NS | None | T `PLACE_VALUE` | "Which number has 4 tens and 7 ones?" → 47 |
| `maths.compare.symbols-to100` | Compares and orders to 100; uses <, > and = | NC14.Ma.Y2.NPV-4 | AR, MC, NS | None | T `ORDER_NUMBERS`, `COMPARE_FILL` | order 38, 83, 30, 80 → 30, 38, 80, 83 |
| `maths.number.words-to100` | Matches numerals and words to 100 | NC14.Ma.Y2.NPV-5 | MC, TY | None | T `NUMBER_WORD` | "sixty-four" → 64 |
| `maths.bonds.to20` (6–7) | Fluent recall of facts to 20 | NC14.Ma.Y2.AS-2 | NS, TY | None | T `BOND_TO` | 14 + ? = 20 → 6 |
| `maths.bonds.tens-to100` | Related facts to 100 with multiples of 10 | NC14.Ma.Y2.AS-2 | TY, NS, MC | None | T `BOND_TO` | 30 + ? = 100 → 70 |
| `maths.add.two-digit` | Two-digit plus ones, plus tens, plus two-digit; three one-digit numbers | NC14.Ma.Y2.AS-3 | TY, MC | None | T `ADD_WITHIN` | 34 + 20 = ? → 54 |
| `maths.subtract.two-digit` | Two-digit minus ones, tens, two-digit | NC14.Ma.Y2.AS-3 | TY, MC | None | T `SUB_WITHIN` | 58 − 6 = ? → 52 |
| `maths.missing-number.inverse-to100` | Uses the inverse to find a missing number | NC14.Ma.Y2.AS-5 | TY, NS | None | T `MISSING_NUMBER` | ? − 20 = 35 → 55 |
| `maths.times-tables.2-5-10` | Multiplication facts for 2, 5 and 10 | NC14.Ma.Y2.MD-1, MD-2 | TY, NS, MC | None | T `TIMES_TABLE` | 5 × 6 = ? → 30 |
| `maths.divide.2-5-10` | Division facts for 2, 5 and 10 | NC14.Ma.Y2.MD-1, MD-2 | TY, NS, MC | None | T `TIMES_TABLE` | 40 ÷ 5 = ? → 8 |
| `maths.odd-even.to100` | Recognises odd and even numbers | NC14.Ma.Y2.MD-1 | OM, MC | None | T `ODD_EVEN_SORT` | sort 7, 12, 15, 18, 21, 30 |
| `maths.pattern.sequences` | Shape patterns in different orientations; number sequences | NC14.Ma.Y2.PD-1 | PS, AR, TY | None | T `SKIP_COUNT`, some H | 3, 6, 9, ?, 15 → 12 |
| `maths.shape.properties` | Sides, vertices, edges, faces; vertical line symmetry; sorts shapes | NC14.Ma.Y2.G-1, G-2, G-4 | PS, NS, OM, MC | None | H | "How many vertices does a square-based pyramid have?" → 5 |

### 3.8 Age 7 — phonics (8 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `phonics.alt-pronunciation` (6–7) | Sorts words by the sound a shared grapheme makes | NC14.En.Y2.WR-2 | OM, MC | Tier A (key words) | H | sort sea, dream, meat / head, bread, instead by the sound of "ea" |
| `phonics.alt-spellings` | Finds words that share a sound spelt differently | NC14.En.Y2.Sp-1b; NC14.En.Y2.WR-2 | MC, OM | Tier A | H | "Which word has the same vowel sound as rain?" → play from play, plan, pull, pile |
| `phonics.gpc.y2-consonant-spellings` | dge/ge/g, soft c, kn/gn, wr | NC14.EnApp1.Y2 rows | MC | Tier A | H | hear "knee" → knee from knee, need, neat, knit |
| `phonics.gpc.y2-vowel-patterns` | a before l and ll, o as /ʌ/, –ey, a after w and qu, or and ar after w, –y as /aɪ/ | NC14.EnApp1.Y2 rows | MC, OM | Tier A | H | hear "walk" → walk from walk, work, woke, wake |
| `phonics.syllables.multi` | Two- and three-syllable words; counts the beats | NC14.En.Y2.WR-3 | MC, NS | Tier A | H | "How many beats in hospital?" → 3 |
| `phonics.suffix-words.read` | Words with –ment, –ness, –ful, –less, –ly, –tion | NC14.En.Y2.WR-4 | MC | Tier A | H | hear "careful" → careful from careful, careless, carefully, cared |
| `phonics.tricky.read-y2` | Year 2 common exception words | NC14.En.Y2.WR-5; NC14.EnApp1.Y2 | MC | Required, tier A | H | hear "because" → because from because, became, before, behind |
| `phonics.pseudo-words` (6–7) | Harder alien names (phase 5 graphemes, adjacent consonants) | NC14.En.Y2.WR-1 | MC, PS | Required; SSML phonemes | H | hear "jound" → jound from jound, jond, joond, jund |

### 3.9 Age 7 — spelling (12 topics)

| topicId | What the child does | Curriculum reference | Types | Audio | Source | Example |
|---|---|---|---|---|---|---|
| `spelling.y1.exception-words` (6–7) | Consolidation of year 1 exception words | NC14.En.Y1.Sp-1b | TY, MC | Required, tier A | H | hear "friend" → type friend |
| `spelling.y2.dge-ge-j` | /dʒ/ spelt dge, ge, g, j | NC14.EnApp1.Y2 | MC, TY | Tier A | H | hear "bridge" → bridge from brige, bridge, bridj, brigde |
| `spelling.y2.soft-c-kn-gn-wr` | /s/ spelt c; kn, gn; wr | NC14.EnApp1.Y2 | MC, TY, AR | Tier A | H | hear "wrong" → wrong from rong, wrong, wong, wronge |
| `spelling.y2.le-el-al-il` | Endings –le, –el, –al, –il | NC14.EnApp1.Y2 | MC, TY | Tier A | H | hear "camel" → camel from camle, camel, camal, camil |
| `spelling.y2.y-endings` | –y as /aɪ/; y to i before –es, –ed, –er, –est; –ey | NC14.EnApp1.Y2 | MC, TY | None, or tier A | H | "one baby, two …" → babies from babys, babies, babyes, babbies |
| `spelling.y2.suffix-rules` | Drops the e; doubles the consonant | NC14.EnApp1.Y2 | TY, MC | None | H | "hop + ing" → hopping |
| `spelling.y2.vowel-oddities` | a before l and ll; o as /ʌ/; a after w and qu; or and ar after w; s as /ʒ/ | NC14.EnApp1.Y2 | MC, TY | Tier A | H | hear "walk" → walk from wolk, walk, wawk, warlk |
| `spelling.y2.suffixes` | –ment, –ness, –ful, –less, –ly | NC14.En.Y2.Sp-2 | MC, TY, AR | None | H | "care + ful" → careful from careful, carefull, carful, carefel |
| `spelling.y2.contractions` | can't, didn't, hasn't, couldn't, it's, I'll | NC14.En.Y2.Sp-1d | MC, TY, AR | None | H | "did not" → didn't from didnt, did'nt, didn't, din't |
| `spelling.y2.tion` | Words ending –tion | NC14.EnApp1.Y2 | MC, TY | Tier A | H | hear "station" → station from stashun, station, stasion, staytion |
| `spelling.y2.homophones` | Chooses the right word or picture for a homophone | NC14.En.Y2.Sp-1f; NC14.EnApp1.Y2 homophones | PS, MC | None — audio cannot tell homophones apart | H | read "knight" → the picture of the knight, not the night sky |
| `spelling.y2.exception-words` | Year 2 common exception words | NC14.En.Y2.Sp-1c | MC, TY | Required, tier A | H | hear "because" → because from becos, because, becuase, becaus |

### 3.10 Coverage check against the spec

| Spec requirement [V prompt.md:479-483] | Where it is covered |
|---|---|
| Maths: counting | `maths.count.*` at every age |
| Maths: comparing numbers | `maths.compare.*` at every age |
| Maths: addition, subtraction | `maths.add.*`, `maths.subtract.*`, `maths.missing-number.*` |
| Maths: shapes | `maths.shape.name-2d` (5), `.name-2d-3d` (6), `.properties` (7) |
| Maths: patterns | `maths.pattern.repeating` (5, 6), `.sequences` (7) |
| Maths: number bonds | `maths.bonds.to5`, `.to10`, `.to20`, `.tens-to100` |
| Maths: age-appropriate times tables | counting in 2s, 5s, 10s (6); `maths.times-tables.2-5-10` and `maths.divide.2-5-10` (7). None at 5, by design |
| Phonics: grapheme/sound | `phonics.gpc.*`, `phonics.alt-*` |
| Phonics: blending | `phonics.blend.*`, `phonics.pseudo-words`, `phonics.endings.read`, `phonics.syllables.multi` |
| Spelling: arranging letters | every AR row in the spelling tables |
| Spelling: completing words | `spelling.cvc.missing-letter`, MC "which is spelt correctly" rows |
| Spelling: typing words | TY rows at ages 6 and 7 |

---

## 4. The six interaction types

The six types are fixed by the spec [V prompt.md:485-497]: picture selection, number selection, moving/counting/sorting objects, arranging letters or ordered items, multiple choice, typed numeric or word answers. The spec also requires keyboard equivalents "including selecting/reordering where drag and drop is shown" and normalisation "separately by type" [V prompt.md:499]. Everything else in this section is **[P]**.

Enum values: `PICTURE_SELECT`, `NUMBER_SELECT`, `OBJECT_MOVE`, `ARRANGE`, `MULTIPLE_CHOICE`, `TYPED`.

### 4.1 One panel layout and one grammar for every type

The learning panel is a React component (not Phaser), modal while the run is in the `ACTIVITY` or `METEOR` phase. Visual order = DOM order = focus order:

| # | Element | Focus behaviour |
|---|---|---|
| 1 | Prompt (heading) | Receives programmatic focus when the panel opens, so a screen reader announces it. Not a tab stop afterwards. |
| 2 | Play control(s), when the activity has audio | Tab stop. States Play, Loading, Stop/Replay, Retry [V prompt.md:587]. |
| 3 | "Show me" (concept demonstration), when present | Tab stop. |
| 4 | Stimulus (picture, equation, word) | Not focusable; has a text alternative. |
| 5 | Answer area | **One** tab stop; arrow keys move inside it (roving focus). |
| 6 | Check button | Tab stop. Uses `aria-disabled` (not `disabled`) while the answer is incomplete, so it stays in the focus order and can explain itself. |
| 7 | Tries indicator and message line | Not focusable. A polite live region, so messages are announced. |
| 8 | Save and exit | Tab stop. |

Grammar: **select (or place, or type), then press Check.** Nothing is submitted by selecting. This costs one extra click, and buys three things: a slip of the mouse never costs an attempt; arrow-key navigation can follow the standard radio pattern, where moving focus also selects [V https://www.w3.org/WAI/ARIA/apg/patterns/radio/]; and mouse and keyboard flows are the same shape.

Other common conventions:

- **Click-then-click is the primary way to move things; drag is optional.** This matches the spec's battlefield rule ("Click an astronaut then a pad… Dragging can be supported but cannot be required") [V prompt.md:271] and WCAG 2.2 success criterion 2.5.7 Dragging Movements (AA): "All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging" [V https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html]. That criterion does not cover the keyboard; 2.1.1 Keyboard (A) does [V https://www.w3.org/TR/WCAG22/].
- **Battlefield shortcuts are off while the panel is open** [V prompt.md:273]. Inside the panel, single-character shortcuts (digits to pick an option, letters to place a tile) work only while the answer area has focus and never while a text field has focus — the condition WCAG 2.1.4 Character Key Shortcuts (A) allows [V https://www.w3.org/TR/WCAG22/].
- **Escape** only cancels a "lifted" object or tile. It never closes the activity and never submits.
- **Nothing depends on timing**: no double-click, no long-press, no type-ahead timeout, no auto-advance.
- **Targets:** WCAG 2.5.8 (AA) asks for at least 24 by 24 CSS pixels and 2.5.5 (AAA) for 44 by 44 [V https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html]. For five-year-olds with a mouse or trackpad I propose at least 64 CSS pixels for options, tiles and objects, with 12 pixels between them.
- **State is never shown by colour alone** (WCAG 1.4.1 Use of Color, A) [V]: selected = thick outline plus a tick badge; tried = dimmed plus a "tried" label.
- **Audio never autoplays.** The child presses Play [V prompt.md:567]. Any number of replays is free [V prompt.md:587].
- **Order of options and tiles is shuffled once, when the run is created, and stored with the slot.** The correct answer moves between runs but never between refreshes.

### 4.2 Exactly what one attempt is

> **One attempt = one press of Check on a complete answer for the whole activity, recorded under a new attempt ID, whose normalised answer is different from every earlier recorded attempt on that slot.**

- The attempt is written to the local operation log before any feedback is shown, then sent (spine S4). Attempts are numbered 1 to 3.
- A correct attempt resolves the slot as `SUCCEEDED` and grants the reward once. A third incorrect attempt resolves it as `FAILED` with no reward [V prompt.md:513-515].
- The same attempt ID delivered twice (double-click, retry, reconnect batch) is the same attempt and returns the original result [V prompt.md:685-689].

**What never consumes an attempt**

| Event | Why | Mechanism |
|---|---|---|
| Opening, reading, waiting, leaving, refreshing, signing out and back in | Untimed; attempts persist independently [V prompt.md:503, 523] | Attempts live on the slot, not in the panel |
| Viewing or skipping the demonstration | Teaching, not answering [V prompt.md:275] | No operation is recorded |
| Play, replay, stop, loading, audio failure, retry | [V prompt.md:587, 615; AC-22] | Speech calls never touch the slot |
| Selecting, deselecting, moving, reordering, typing, deleting | Not a submission | Only Check submits |
| Pressing Check on an incomplete answer | Empty submission | Blocked in the client with a nudge; if one ever reaches the server it is `INVALID_ANSWER_FORMAT` and nothing is recorded |
| Submitting an answer identical (after normalisation) to an earlier wrong attempt | A child should not burn tries repeating a slip | Client says "You've tried that one"; server returns `DUPLICATE_ANSWER` and records nothing (spine proposal, endorsed) |
| A network failure during submission | The failure is not an answer [V prompt.md:615] | The attempt already exists locally under its ID and is retried; however many times the request is sent it is one attempt. If it could not be recorded anywhere (local write failed and no network), nothing is consumed and the child is asked to press Check again |
| Pressing Check on an audio-required activity before Play has ever been pressed | Kindness: stops a confused child guessing blind | Client-only nudge "Press Play to listen first" |
| Content withdrawn as invalid | Not the child's fault [V prompt.md:556] | Section 12 |

**Consequence of the duplicate rule — at least four options.** With three options, two different wrong answers leave only the right one, so the third try could not fail. Publish-time validation therefore requires **4 to 6 options** on `PICTURE_SELECT` and `MULTIPLE_CHOICE`. Naturally two- or three-way questions ("which is more?", "<, > or =") are recast as "pick the largest of four", an ordering task, or a sort.

### 4.3 Feedback wording

Same words for every age and every subject. Neutral, short, never "Wrong!", never a red cross.

| Situation | Message | Attempt consumed |
|---|---|---|
| Check with nothing chosen / spaces empty / nothing moved / nothing typed | "Choose an answer first." · "Fill every space first." · "Move them first." · "Type your answer first." | No |
| Audio-required, Play not yet pressed | "Press Play to listen first." | No |
| Same as an earlier wrong try | "You've tried that one. Have another go." | No |
| Incorrect, tries remain | "Not quite. Have another go." The tries indicator drops to 2, then 1 (icons plus the words "Tries left: 2"). | Yes |
| Correct | "You got it!" plus the reward line from the ruleset, for example "+30 space credits" or "Comet Burst is ready". | Yes (resolves) |
| Third incorrect | "Good try. No credits this time — you can keep playing." then "The answer was …" and a Continue button. | Yes (resolves) |
| Clip loading | "Getting the sound ready…" (answer area hidden) | No |
| Clip failed | "We couldn't get the sound." with a Try again button | No |
| Answer could not be saved anywhere | "That didn't save. Press Check again." | No |
| Slot voided (section 12) | "This one had a mistake, so we took it away. You still get your reward." | — |
| Meteor offer | "Meteor challenge! Win a power for the boss." with Have a go and No thanks | — |

After an incorrect attempt nothing is explained and nothing is hinted. On choice types the option just tried is marked "tried" and cannot be chosen again (that is the child's own history, shown so they need not remember it). On `ARRANGE`, `OBJECT_MOVE` and `TYPED` the child's answer stays exactly as they left it, with no per-letter or per-object marking, and a small "Tried:" line lists earlier answers where that is short enough to show.

**Decision: show the correct answer once the activity has resolved — yes.** Justification:

1. The owner "asked for teaching as well as practice" [V prompt.md:275]. Ending three failed tries with no answer teaches nothing and feels like a dead end.
2. It is not adaptive and not a hint. It is identical for every child, appears only after resolution when no reward is at stake, and has no effect on what is selected later. The spec rules out performance-adaptive difficulty, remedial routing and failure-triggered hint sequences [V prompt.md:165, 275, 501]; it does not rule out telling a child the answer afterwards.
3. It cannot be farmed. A resolved slot cannot be retried, an activity instance never repeats within a run, and the answer data is already in the local pack under the accepted trust model [V prompt.md:757].
4. It is how a family operator notices a wrong answer key. Section 12 depends on mistakes being visible.
5. For phonics it lets the child hear the sound again next to the right grapheme, which is the modelling a teacher would give.

It must never appear after attempt 1 or 2. Form by type: the correct option or number is highlighted; the correct word or order is shown assembled; a sort or share is shown completed; a typed answer shows the first accepted spelling. [U] I believe the wider research on feedback supports giving the correct answer over a bare right/wrong, but I did not check a source today.

### 4.4 Type-by-type definitions

In each table: *Payload* and *Answer specification* are what the operator authors; *Submitted answer* is what the browser sends; *Normalisation* is applied identically in the browser (offline check) and the backend (authoritative).

#### PICTURE_SELECT — choose one picture

| Aspect | Definition |
|---|---|
| Payload | `options[]`, 4–6 of `{id, assetId, alt, caption?}`; `layout` (`GRID` by default); optional `stimulus` |
| Answer specification | `{correctOptionId}` |
| Submitted answer | `{optionId}` |
| Normalisation | `optionId` must be exactly one of the option IDs, else `INVALID_ANSWER_FORMAT` |
| Complete when | one option is selected |
| Correct when | `optionId == correctOptionId` |
| Publish-time validation | 4–6 options; IDs unique, from `a`–`f`; every `assetId` exists in the asset manifest, is distinct and is flagged text-free (bitmap art must not carry question text [V prompt.md:1090]); `alt` 1–60 characters and unique; exactly one correct option; captions are UI text and only allowed where they do not give the answer away |
| Mouse | Click a picture card to select it (outline and tick). Click another to change. Click Check. |
| Keyboard | Tab into the group: focus lands on the selected card, or the first. Right/Down = next, Left/Up = previous, wrapping; the focused card becomes the selection. Digits 1–6 select by badge. Space or Enter also selects. Tab to Check, then Enter or Space. |
| After an incorrect attempt | The card is marked "tried" and skipped by the arrow keys. Focus returns to the first available card. |

#### NUMBER_SELECT — choose a number from a fixed number control

Differs from multiple choice in that there are no authored distractors: the child picks from a number track or grid, so guessing is harder and templates need no distractor logic.

| Aspect | Definition |
|---|---|
| Payload | `numberSet`: `{kind: "RANGE", min, max, step}` or `{kind: "LIST", values[]}`; `display`: `TRACK` (up to 21 numbers) or `GRID` (hundred square); `stimulus` |
| Answer specification | `{value}` (integer) |
| Submitted answer | `{value}` |
| Normalisation | Must be a JSON integer and a member of the number set, else `INVALID_ANSWER_FORMAT` |
| Complete when | one number is selected |
| Correct when | `value` equals the specified value |
| Publish-time validation | set size 5–101; all values integers from 0 to 100; `value` is in the set; a `RANGE` divides evenly by its step |
| Mouse | Click a number tile, then Check |
| Keyboard | As a radio group: Left/Right move one tile, Up/Down move one row (ten in a hundred square), Home/End jump to the ends; selection follows focus. Tab to Check. |
| After an incorrect attempt | The number tried is marked "tried" |

#### OBJECT_MOVE — moving, counting, sorting

Two modes. `DISTRIBUTE`: identical objects go from a tray into one to three zones and only the **count in each zone** matters. `SORT`: different objects go into two or three bins and **which bin each object is in** matters.

| Aspect | `DISTRIBUTE` | `SORT` |
|---|---|---|
| Payload | `objectAssetId`, `objectAlt`, `sourceCount` (2–12), `zones[]` of `{id, label, assetId?}`, `requireAllPlaced` | `objects[]`, 4–8 of `{id, text or assetId, alt}`; `bins[]`, 2–3 of `{id, label}` |
| Answer specification | `{zoneCounts: {zoneId: n}}` | `{binOf: {objectId: binId}}` |
| Submitted answer | `{zoneCounts}` | `{placements: {objectId: binId}}` |
| Normalisation | every zone present with an integer ≥ 0; total ≤ `sourceCount` (equal to it when `requireAllPlaced`); keys sorted | every object present exactly once; every bin ID valid; keys sorted |
| Complete when | at least one object placed (all of them when `requireAllPlaced`) | every object is in a bin |
| Correct when | the two maps are equal | the two maps are equal |
| Publish-time validation | single zone: target between 1 and `sourceCount − 2`, so "move everything" is never right by accident; sharing: counts consistent with the question | every bin receives at least one object; no object could reasonably belong in two bins (reviewer); 4–8 objects |
| Mouse | Single zone: click an object in the tray and it hops into the zone; click one in the zone and it hops back. Several zones: click an object to lift it, click a zone to drop it. Drag also works. | Click an object to lift it, click a bin to drop it. Click a placed object to lift it again. Drag also works. |
| Keyboard | Tab to a zone. `+` or Enter moves one object in; `−` or Backspace moves one back. Tab to the next zone. | Tab to the object list; arrows move; Enter or Space lifts; arrows choose a bin; Enter or Space drops; Escape cancels. Shortcut: digits 1–3 send the focused object to that bin, 0 returns it to the tray. |
| After an incorrect attempt | Objects stay where the child put them; no per-object marking | Same |

Counting note: in `DISTRIBUTE` the zone shows no running numeral — that would turn counting into numeral matching. A screen-reader user does hear the count after each move, because there is no other way to perceive it. That is a deliberate accessibility trade-off.

#### ARRANGE — arranging letters or ordered items

Two modes. `LETTERS`: build a word from letter or grapheme tiles, possibly with up to three distractor tiles. `SEQUENCE`: put three to six items in order.

| Aspect | Definition |
|---|---|
| Payload | `mode`; `tiles[]` of `{id, value, text or assetId, alt?}`; `slots` (number of tiles to place); `cue` (`{assetId, alt}` and/or a prompt clip and/or rule text); `orderLabel` for `SEQUENCE` ("smallest first") |
| Answer specification | `LETTERS`: `{accepted: ["cat"]}`. `SEQUENCE`: `{accepted: [["30","38","80","83"]]}` |
| Submitted answer | `{order: [tileId, …]}` with exactly `slots` entries |
| Normalisation — this is the "meaningful order" rule | IDs valid and distinct, count equals `slots`. Replace each ID by its tile **value**. `LETTERS`: join the values into one string and compare with the accepted words. `SEQUENCE`: compare the list of values with the accepted lists. Because values are compared, not tile identities, the two "o" tiles in "moon" are interchangeable, and `sh`+`i`+`p` equals `s`+`h`+`i`+`p`. |
| Complete when | every slot is filled |
| Correct when | the result equals any accepted entry |
| Publish-time validation | `LETTERS`: values are lower-case letters or an apostrophe, 1–4 characters; 2–8 slots; between `slots` and `slots + 3` tiles; every accepted word can be built with exactly `slots` tiles; a cue is mandatory; the stored shuffle must not already spell the answer. `SEQUENCE`: 3–6 tiles, all placed, values distinct, one accepted order unless the reviewer records why there are more. |
| Mouse | Click a tile in the tray: it goes to the first empty slot. Click a placed tile: it goes back to the tray. Dragging to a particular slot is optional. |
| Keyboard | Tab to the tray; arrows move; Enter or Space places the tile. In `LETTERS`, pressing a letter key places the first free tile that starts with that letter, and Backspace removes the last placed tile. Tab to the row of slots: arrows move; Enter or Space lifts a placed tile, Left/Right move it, Enter or Space drops it, Escape cancels. Every change is announced ("c placed in space 1 of 3"). |
| After an incorrect attempt | The arrangement stays as it is; no tile is marked right or wrong (no position hints) |

"Missing letter" and "what comes next" tasks are authored as `MULTIPLE_CHOICE` or `PICTURE_SELECT`, so version one needs no third arrange mode.

#### MULTIPLE_CHOICE — choose one text option

| Aspect | Definition |
|---|---|
| Payload | `options[]`, 4–6 of `{id, text}`; `optionStyle` (`TEXT`, `GRAPHEME`, `WORD`, `NUMERAL`); optional `stimulus` |
| Answer specification | `{correctOptionId}` |
| Submitted answer | `{optionId}` |
| Normalisation | as `PICTURE_SELECT` |
| Complete / correct when | as `PICTURE_SELECT` |
| Publish-time validation | 4–6 options; text 1–24 characters, unique after trimming and case-folding; graphemes and words in lower case unless a capital is the point; exactly one correct. For "which is spelt correctly?" items no distractor may be a real word that sounds the same as the target (reviewer check). |
| Mouse and keyboard | as `PICTURE_SELECT` |

#### TYPED — numeric or word answer

| Aspect | `NUMERIC` | `WORD` |
|---|---|---|
| Payload | `stimulus`, `maxLength` 1–3, on-screen keypad of digits | `cue` (picture, clip or rule text such as "hop + ing"), `maxLength` 2–12, on-screen keypad of a–z and apostrophe |
| Answer specification | `{value}` (integer 0–999) | `{accepted: ["hopping"], caseSensitive: false}` |
| Submitted answer | `{text}` — the raw string, at most 20 characters | same |
| Normalisation | Remove whitespace, defined as an explicit set (space, tab, CR, LF, no-break space); the result must match `^[0-9]{1,3}$` (ASCII digits only); read as an integer and compare integers, so "08" equals 8. Number words are not accepted in version one (a reserved flag `acceptNumberWords` exists for later). | Trim the same explicit whitespace set; collapse runs of spaces to one; map curly apostrophes (U+2018, U+2019, U+02BC) to `'` and the Unicode hyphens and dashes (U+2010 to U+2014) to `-`; lower-case by the explicit mapping A–Z to a–z unless `caseSensitive`; the result must match `^[a-z' -]{1,maxLength}$` (capitals are also allowed when `caseSensitive`); compare with each accepted entry, which is stored already normalised at publish. Internal spaces are kept: "foot ball" is not "football". |
| If the text does not match the pattern | `INVALID_ANSWER_FORMAT`, no attempt. Unreachable in normal use because the field filters input to the allowed characters. | same |
| Complete when | at least one digit | at least one letter |
| Correct when | the integer equals `value` | the string equals an accepted entry |
| Publish-time validation | `value` has at most `maxLength` digits | a cue is mandatory; accepted entries use British spelling, are unique and fit `maxLength`; more than one accepted entry needs a reviewer note |
| Mouse | Click keypad digits, then Check | Click keypad letters, then Check |
| Keyboard | Type; Backspace edits; **Enter in the field presses Check** | same |

Two implementation musts for `WORD`: the field must have spellcheck, autocorrect, autocomplete and autocapitalise switched off, or the browser gives the spelling away; and the keypad shows lower-case letters. The on-screen keypad is what makes `TYPED` operable by mouse alone, which AC-41 requires of "each learning interaction" [V prompt.md:1257].

### 4.5 Multi-step activities: how sub-steps make one attempt

The spec requires this to be defined so that sub-steps do not multiply the reward [V prompt.md:521].

- An activity has one primary step (`interactionType`, `activityPayload`, `answerSpecification`) and optionally `additionalSteps[]`, each with the same three fields. Version-one validation allows at most one additional step.
- All steps are visible on one panel with **one Check button**. Check is complete only when every step is complete.
- **One Check = one attempt for the whole activity.** The attempt is correct only if every step is correct. There are three attempts in total, one reward, one slot, one summary update.
- After an incorrect attempt, steps that were right are kept and locked with a tick; steps that were wrong show "Try this part again". This is the same information a single-step activity gives.
- The duplicate rule compares the whole normalised answer (all steps).
- The attempt record stores the per-step results so a refresh shows the same locked parts.

### 4.6 One set of test vectors for both judges

Answers are judged in the browser when offline and authoritatively in the backend [V prompt.md:749-751]. To keep the two implementations identical, keep one JSON file of vectors in the repository and run it in both the TypeScript and the Python test suites. Illustrative rows:

| Type / mode | Answer specification | Submitted | Normalised | Result |
|---|---|---|---|---|
| TYPED / NUMERIC | value 8 | `" 08 "` | 8 | correct |
| TYPED / NUMERIC | value 8 | `"８"` (full-width digit) | — | invalid format, no attempt |
| TYPED / NUMERIC | value 8 | `"eight"` | — | invalid format, no attempt |
| TYPED / WORD | accepted hopping | `"Hopping "` | hopping | correct |
| TYPED / WORD | accepted hopping | `"hoping"` | hoping | incorrect |
| TYPED / WORD | accepted didn't | `"didn’t"` (curly) | didn't | correct |
| TYPED / WORD | accepted football | `"foot ball"` | foot ball | incorrect |
| ARRANGE / LETTERS | accepted moon | tiles m, o(2), o(1), n | moon | correct |
| ARRANGE / LETTERS | accepted ship | tiles sh, i, p | ship | correct |
| ARRANGE / SEQUENCE | accepted 30, 38, 80, 83 | 30, 80, 38, 83 | 30, 80, 38, 83 | incorrect |
| OBJECT_MOVE / DISTRIBUTE | z1 3, z2 3 | z2 3, z1 3 | z1 3, z2 3 | correct |
| MULTIPLE_CHOICE | correct b | option `g` | — | invalid format, no attempt |

These rules deliberately avoid language built-ins (`int()`, `Number()`, `trim()`, `lower()`, Unicode normalisation), which behave differently in Python and JavaScript on unusual input; the frontend report (`research/07-frontend-stack.md`, section h) demonstrates the differences and proposes the same shared-vector approach, with normalisation expressed as a short list of named primitive steps. The backend stores the normalised answer on the attempt (it is small). Typed text is never written to application logs: a child may type anything, including a name.

### 4.7 Accessibility references used

[V https://www.w3.org/TR/WCAG22/ — W3C Recommendation, 12 December 2024] 1.1.1 Non-text Content (A); 1.4.1 Use of Color (A); 2.1.1 Keyboard (A); 2.1.2 No Keyboard Trap (A); 2.1.4 Character Key Shortcuts (A); 2.4.3 Focus Order (A); 2.4.7 Focus Visible (AA); 2.5.7 Dragging Movements (AA); 2.5.8 Target Size (Minimum) (AA); 3.2.2 On Input (A: "Changing the setting of any user interface component does not automatically cause a change of context") — which is another reason selecting never submits; 3.3.2 Labels or Instructions (A); 4.1.3 Status Messages (AA). The spec does not name a conformance target; I use these as design references, not as a compliance claim.

---

## 5. Activity definition schema, validation and lifecycle

Fixed points from the spec: the suggested field list [V prompt.md:548]; drafts, validation, immutable published versions, retirement that preserves versions used by existing runs [V prompt.md:531-545, 552]; players can never submit content, set rewards or send text to speech [V prompt.md:550]; human review before anything reaches the published bank [V prompt.md:525]. The concrete schema below is **[P]**.

### 5.1 Fields

The spec's suggested names are kept. Additions are marked "(added)".

| Field | Type | Rules |
|---|---|---|
| `schemaVersion` (added) | integer | 1 |
| `activityId` | string | Assigned by the admin API when the draft is created. Pattern `MA-`, `PH-` or `SP-` plus at least four digits (`MA-0101`). Immutable, never reused. Carries no age, topic or reward information. |
| `version` | integer ≥ 1 | Assigned at publish. The pair `activityId@version` is immutable. |
| `status` | enum | `DRAFT`, `PUBLISHED`, `RETIRED`, `WITHDRAWN` (5.4) |
| `subject` | enum | `maths`, `phonics`, `spelling`. Identity-level: cannot change between versions. |
| `topic` | string (`topicId`) | Must exist in the topic registry under the same subject. Identity-level. |
| `minAge`, `maxAge` | integer | 5–7 in version one; `minAge ≤ maxAge`; `maxAge − minAge ≤ 1` |
| `curriculumReference` | array of 1–4 strings | Codes from section 1 (`NC14.Ma.Y2.AS-2`, `EYFS26.ELG.Number-1`…). The framework prefix is mandatory. Optional free-text `curriculumNote`. |
| `interactionType` | enum | Type of the primary step (section 4) |
| `prompt` | `{text}` | 3–120 characters of plain text; British spelling; no markup, no placeholders in fixed items, no names or personal data. Guide: at most 8 words at age 5, 14 at age 7. |
| `visualAssetReferences` | array of asset IDs | Every asset used by the prompt, payload or demonstration. Each must exist in the asset manifest, have alt text and be flagged text-free [V prompt.md:1090]. |
| `activityPayload` | object | Per type, section 4.4. Absent for template activities. |
| `answerSpecification` | object | Per type, section 4.4. Absent for template activities. |
| `additionalSteps` (added) | array, 0–1 items | Each `{interactionType, prompt?, activityPayload, answerSpecification}` (section 4.5) |
| `authoringMode` (added) | enum | `FIXED` or `TEMPLATE`. Identity-level. |
| `template` (added) | object | Required for `TEMPLATE`: `{generatorKind, generatorVersion, domain, presentation}` (section 8) |
| `introductionContent` | object | Optional concept demonstration (5.6) |
| `speechDefinitionReferences` | map | Variant name → `{speechId, speechVersion}` (section 6.6) |
| `audioRequirement` (added) | enum | `NONE`, `OPTIONAL`, `REQUIRED` |
| `rewardCategory` | enum | `NORMAL` or `METEOR` (5.5). Identity-level. |
| `source` (added) | enum | `HANDWRITTEN`, `TEMPLATE`, `IMPORT`, `AI_ASSISTED` — provenance for the audit trail only |
| author metadata | `{createdBy, createdAt, updatedBy, updatedAt}` | Set by the server from the caller's token, never from the request body |
| review metadata | `{reviewedBy, reviewedAt, checklist, previewSolvedDraftRevision, notes}` | Set by the server at publish |
| `definitionHash` (added) | SHA-256 | Computed at publish over the canonical definition; proves immutability |
| `draftRevision` (added) | integer | Drafts only; optimistic concurrency for edits |

A published definition is capped at 8 kB of JSON, which keeps packs and DynamoDB items small.

### 5.2 Publish-time validation common to every type

Publishing fails, with a per-field error list, unless all of these hold (the per-type rules of section 4.4 apply as well):

1. The document matches the schema; unknown fields are rejected.
2. Topic exists and belongs to the subject; ages are in range and at most one year apart.
3. Identity-level fields are unchanged from the previous version.
4. Every asset reference exists in the current asset manifest with alt text.
5. Every speech reference uses a valid variant name and points at an `APPROVED` speech version that has a stored clip. `audioRequirement = REQUIRED` needs at least a `prompt` clip (or bin/option clips where those carry the sound).
6. **Every phonics activity has at least one clip** (`prompt` or `instruction`), so that "Phonics gets a visible Play control" [V prompt.md:271] is true of every phonics item.
7. The answer lies inside the payload (correct option exists, value is in the number set, word is buildable from the tiles…).
8. Demonstration content, if present, is valid (5.6).
9. Template activities pass the exhaustive domain check (section 8.3).
10. The review checklist (5.3) is complete and the preview-solve gate has been passed for this exact draft revision.

### 5.3 Human review, recorded

One operator may author and review their own item — this is a family product — but the review is a separate, recorded act. `reviewedBy` is the caller's identity from the token. Checklist (all must be ticked):

1. I worked the answer out myself and it matches the answer specification.
2. There is exactly one right answer; nothing else on screen could reasonably be accepted.
3. The wording suits the youngest age in the range and uses British spelling.
4. Pictures are unambiguous at the size shown, and alt text neither adds nor hides information.
5. I listened to every clip in this draft and each says the intended sound or word.
6. No homophone, heteronym ("read", "wind") or accent-dependent trap (section 1.5).
7. Nothing personal, branded or frightening.

**Preview-solve gate.** Publish is enabled only after the operator has solved the preview of this exact draft revision correctly (three sampled instances for a template). A wrong answer key is the most damaging content error and this catches it for the price of one click. The same checklist and gate apply to imported and AI-drafted items; `source` records where a draft came from but never relaxes review.

### 5.4 Version and status lifecycle

| Status | Editable | In the bank for new runs | Served to runs that already pinned it |
|---|---|---|---|
| `DRAFT` | Yes (one working copy per activity) | No | — |
| `PUBLISHED` | No | Yes, for each age from `minAge` to `maxAge` | Yes |
| `RETIRED` | No | No | **Yes, exactly as before** — attempts, rewards and summaries behave normally |
| `WITHDRAWN` (exceptional) | No | No | **No** — pinned slots are voided and compensated (section 12) |

| Transition | Trigger | Notes |
|---|---|---|
| (new) → `DRAFT` | Create, import, or "copy version n to a draft" | |
| `DRAFT` → `PUBLISHED` | Validate, review, publish | Creates version n+1. The previous published version becomes `RETIRED` with reason `SUPERSEDED`, so one version per activity is selectable at a time. |
| `PUBLISHED` → `RETIRED` | Operator retires | Reason `OPERATOR`. Ordinary housekeeping: stale, dull, replaced. |
| `PUBLISHED` or `RETIRED` → `WITHDRAWN` | Operator withdraws with a written reason | Irreversible. For content that is *wrong*. |
| `DRAFT` deleted | Operator | Only if the activity has never been published. |

- Nothing published is ever physically deleted [V prompt.md:545].
- No resurrection: to bring a retired activity back, copy it to a draft and publish a new version.
- "Immutable" means the definition. Status and timestamps sit beside it and do change; `definitionHash` proves the definition did not.
- An edit to a published activity is always a new draft and a new version [V prompt.md:552]; a run keeps the version it pinned [AC-23].

### 5.5 Reward category

- `NORMAL` activities fill normal slots (`N-…`); `METEOR` activities fill meteor slots (`M-…`). One value per activity.
- **The activity never contains an amount, a power or a multiplier.** A slot's reward is looked up in the pinned ruleset by slot: credits for that interval, or the power for that boss. So nobody can set a reward through content [V prompt.md:550], and reward opportunity cannot vary by age [V prompt.md:449; AC-13].
- Authoring guidance for `METEOR`: the same age pitch as normal items, never harder curriculum content; prefer the richer formats (sorting, arranging, a two-step activity) so it feels like a challenge.
- A test worth having: for two runs with the same ruleset and campaign versions and different age bands, the list of `(slotId, rewardCategory, reward)` is identical.

### 5.6 Concept demonstration (`introductionContent`)

The spec allows "a short educational demonstration before a new concept" and insists it "is not an adaptive hint sequence triggered by failure" [V prompt.md:275].

Structure: `{conceptId, cards[]}` — one to three static cards, each `{text (at most 120 characters), assetId?, alt?, speechVariant?}`. `conceptId` defaults to the `topicId`. No interaction beyond Next, Start and Skip.

When it is shown:

1. **Automatically, once per concept per run, at that concept's first appearance.** Decided when the run is created and stored on the slot (`intro: "AUTO"`): in slot order, the first slot of each `conceptId` whose activity carries a demonstration. It appears before the answer area is enabled the first time the slot is opened. It can be skipped.
2. **On request at any time**, on any slot whose activity carries one (`intro: "ON_REQUEST"`): a "Show me" button that looks and behaves the same before and after an incorrect attempt.
3. **Never opened by the system because of an incorrect attempt, and never after resolution.**
4. Optional refinement: if, when the run is created, the child's learning summary already shows three or more *completed* activities in that topic, use `ON_REQUEST` instead of `AUTO`. This depends on exposure, not on success, so it is not performance-adaptive.
5. Viewing or skipping never consumes an attempt and is never timed.

Content rule: the demonstration works a *different* example from the activity's own question and must not contain its answer. For templates the generator excludes the demonstration's example values from the domain.

Rule 2 is the one an owner might read differently: a "Show me" button that is still available after a wrong try could be seen as a hint. My view is that it is child-initiated, static, identical for everyone and not triggered by failure, so it is within the spec. If the owner disagrees, disable the button once the first attempt is recorded (owner decision D-2).

---

## 6. Speech definitions

### 6.1 Fixed points

- [V prompt.md:561, 571-579] Play calls an authenticated endpoint; a dedicated Python Lambda resolves the approved speech definition, uses a versioned private cache, calls Polly on a miss and returns metadata plus a short-lived signed URL.
- [V prompt.md:589] "API input must identify approved content. The player endpoint is not an unrestricted text/SSML synthesiser." Operator preview is separately authorised and validated.
- [V prompt.md:591] Cache identity includes canonical text/SSML, locale, voice, engine, output settings and content/generation version; account names and date of birth are never in the text or the key.
- [V prompt.md:595-611] A letter name and a phoneme are different outputs; listen before publishing; avoid an extra vowel; "A syntactically valid synthesis is not proof of a correct educational sound"; if a sound cannot be rendered adequately the activity stays unpublished; no browser speech synthesis and no substituted sound.
- [V prompt.md:563] Choose the exact en-GB voice by listening, not by assumption.

### 6.2 What Amazon Polly offers (checked today)

| Fact | Source |
|---|---|
| en-GB voices: Amy (female; generative, neural, standard), Emma (female; neural, standard), Brian (male; generative, neural, standard), Arthur (male; neural only) | [V] https://docs.aws.amazon.com/polly/latest/dg/available-voices.html |
| Neural voices are supported in Europe (London) eu-west-2 | [V] https://docs.aws.amazon.com/polly/latest/dg/neural-voices.html |
| `<phoneme>` is fully available for neural voices and only partially for generative voices; alphabets `ipa` and `x-sampa` | [V] https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html and https://docs.aws.amazon.com/polly/latest/dg/phoneme-tag.html |
| The en-GB phoneme table lists the usable symbols (for example ʃ = X-SAMPA `S` "ship"; t͡ʃ = `tS` "chart"; ŋ = `N` "thing"; ɒ = `Q` "lot"; æ = `{` "trap") | [V] https://docs.aws.amazon.com/polly/latest/dg/ph-table-english-uk.html |
| Neural voices support `<prosody>` volume and rate but not pitch; rate may be 20–200% | [V] https://docs.aws.amazon.com/polly/latest/dg/prosody-tag.html |
| `<emphasis>` is not available for neural voices | [V] supportedtags page |
| `<say-as interpret-as="characters">` "is not currently supported for neural voices… the affected sentence will be synthesized using the related standard voice" | [V] https://docs.aws.amazon.com/polly/latest/dg/say-as-tag.html |
| "For certain voices, Amazon Polly might automatically switch to the Standard engine when accuracy is critical. For example, this can happen during letter-by-letter spelling." | [V] neural-voices page |
| `SynthesizeSpeech`: `Engine` standard, neural, long-form or generative; `OutputFormat` includes mp3, ogg_vorbis, ogg_opus, pcm; mp3 sample rates 8000–48000 with 24000 the neural default; `TextType` ssml or text; input limit 6,000 characters of which at most 3,000 billed; SSML tags are not billed | [V] https://docs.aws.amazon.com/polly/latest/APIReference/API_SynthesizeSpeech.html |
| The MP3 bit rate Polly uses | [U] not stated on the pages I checked; measure in the Milestone 0 spike |
| How good an isolated single phoneme sounds on each en-GB neural voice | [U] nobody can know this without listening; it is the purpose of the Milestone 0 spike [V prompt.md:1268] |

Two consequences for letter names: do not build them with `say-as characters` on the neural engine (the voice would change), and note that Arthur has no standard engine to fall back to. Author letter names as reviewed text or a reviewed `<phoneme>` and listen.

### 6.3 Speech definition schema [P]

| Field | Type | Rules |
|---|---|---|
| `speechId` | string | Meaningful and stable: `<kind>.<slug>` — `phoneme.sh`, `letter-name.s`, `word.ship`, `pseudo.chom`, `instruction.listen-which-letters`. Lower-case letters, digits, hyphens. Never reused. |
| `version` | integer ≥ 1 | Assigned at approval; `speechId@version` is immutable |
| `status` | enum | `DRAFT`, `APPROVED`, `RETIRED`, `WITHDRAWN` |
| `kind` | enum | `PHONEME`, `LETTER_NAME`, `WORD`, `INSTRUCTION` |
| `wordKind` | enum | For `WORD`: `REAL` or `PSEUDO` |
| `displayLabel` | string | Operator-facing: "/sh/ as in ship", "letter name S", "word: ship" |
| `textType` | enum | `text` or `ssml`. The speech-service report (06, section 12) recommends sending SSML always, so that every definition has one shape; if that is adopted, plain words are simply wrapped in `<speak>` and this field is constant. |
| `text` | string | Exactly what is sent to Polly. Canonicalised once, when the definition is saved (Unicode NFC, line breaks replaced by a space, runs of spaces collapsed, trimmed); that exact string is what is hashed and what is sent (report 06, section 9.2). At most 200 billed characters. |
| `locale` | string | `en-GB` only in version one |
| `voiceId` | string | From a server-side allow-list; in version one the single voice chosen in Milestone 0 |
| `engine` | string | `neural` in version one |
| `output` | object | `{format: "mp3", sampleRate: "24000"}` |
| `generationVersion` | integer | Raise it to force a fresh render from identical inputs |
| `cacheKey` | SHA-256 | Over the canonical JSON of `textType`, `text`, `locale`, `voiceId`, `engine`, `output` and `generationVersion` — the cache identity the spec requires. The exact recipe (which also adds a key-schema number, a provider name and a lexicon list) is in report 06, section 9. The S3 object key is derived from it, so it contains nothing about any player. |
| `clip` | object | `{s3Key, bytes, durationMs, audioSha256, renderedAt, requestCharacters}` — written at approval |
| `review` | object | **Who listened and when:** `{listenedBy, listenedAt, audioSha256, checklist, notes}`. `listenedBy` comes from the token. `audioSha256` ties the review to the exact bytes heard. |

Validation by kind (applied to operator preview and again at approval):

| Kind | Allowed input | Review checklist |
|---|---|---|
| `PHONEME` | SSML only: `<speak>`, optional leading and trailing `<break>`, optionally one `<prosody rate>` wrapper, and exactly one `<phoneme alphabet="ipa" or "x-sampa" ph="…">` whose symbols all come from Polly's en-GB table. The element text is the grapheme or a reviewed stand-in word ("eye" for /igh/). The frozen SSML template set that comes out of the Milestone 0 spike is the source of truth. | Says the intended sound · no added vowel ("sss", not "suh") · is not the letter name · clean start and end |
| `LETTER_NAME` | Plain text or one `<phoneme>`; **not** `say-as characters` | Says the letter *name* · not the sound · matches the other letter names in voice quality |
| `WORD` | One word as plain text (letters, apostrophe, hyphen; at most 20 characters), or one `<phoneme>` for a pseudo-word or a word the engine gets wrong | The intended word, British pronunciation · not a homophone trap for the activities that use it |
| `INSTRUCTION` | Plain text of at most 120 characters, or SSML limited to `<speak>`, `<s>`, `<break>`, `<prosody rate>` | Clear, unhurried, no names, no values that change between activities |

Tags outside the speech-service allow-list (`speak`, `phoneme`, `break`, `prosody` rate and volume, `s`, `p`, `sub`, `w` — report 06, section 12) are rejected. Storing phonemes in X-SAMPA keeps the canonical text pure ASCII (no invisible Unicode differences in the cache key) at the cost of awkward characters such as `{` and `"`; IPA is easier to read. Either works if the canonical form is enforced; the admin should offer a picker built from Polly's table so the operator never types symbols.

### 6.4 Audio risk tiers and the Milestone 0 listening check [P]

| Tier | What the clip is | Risk | Policy |
|---|---|---|---|
| A | A whole word or sentence ("ship", an instruction) | Low | Default wherever the learning point allows it: "Which letters start this word?" |
| B | An isolated sound predicted to be low or medium risk: vowels and diphthongs, and the continuants /s/ /m/ /n/ /f/ /l/ /v/ /z/ /sh/, plus /ch/ and /ks/ | Medium | Allowed after that exact clip passes the listening check |
| C | An isolated sound predicted to be high risk: the stops /p/ /t/ /k/ /b/ /d/ /g/, and /j/ /w/ /y/ /h/ /r/, both /th/ sounds, /ng/, /zh/, /kw/ and /ure/ | High — DfE says /b/ /d/ /g/ /j/ "cannot be heard clearly in isolation, unless small schwa is added", and likewise /w/ and /y/ [V S11 Appendix 6] | Use only if a clip genuinely passes (possibly with a deliberately small schwa); otherwise these sounds are always presented inside words. The age-5 letter topics are written to work either way. |

Which sound sits in which tier is a **prediction** until someone listens; the per-phoneme predictions and suggested SSML are in the speech-service report (`research/06-polly-tts.md`, section 5.5), and the membership above follows it. That report proposes the full listening spike (all 47 sounds, 26 letter names, words and sound-talk; its section 5.8). From the content side, the minimum that must be answered before authoring phonics is this subset — each clip rendered on each of the four en-GB neural voices and scored on "intended sound", "no added vowel", "clean edges":

| Group | Clips |
|---|---|
| Tier B consonants | /s/, /m/, /f/, /sh/, /th/ (thin), /ng/ |
| Tier B vowels | /a/ (cat), /i/ (hit), /ee/, /igh/, /oa/ |
| Tier C | /b/, /t/, /g/, /ch/, /w/, /h/ |
| Letter names | "S", "A" (must not come out as the word "a") |
| Words | "ship", "the", "said" |
| Pseudo-word | "chom" via `<phoneme>` |
| Instruction | "Listen to the sound. Which letters make this sound?" at normal rate and at 90% |

Outputs: the chosen voice; a per-sound verdict (publishable, publishable with a small schwa, or word-only); and the rule that word-only sounds appear only inside words. This is AC-21 in practice [V prompt.md:1233].

### 6.5 Approval binds to the bytes that were heard [P]

1. The operator previews a draft through the same speech service (admin-only route).
2. Approval records the review against **the bytes that were previewed** and pins them (same `audioSha256`). It does not synthesise again: a second synthesis might not be byte-identical, and then nobody would have listened to what children hear. The speech-service report achieves this by having preview write straight to the final content-addressed key and approval record its SHA-256 (06, section 9.4); either mechanism satisfies the rule.
3. Activities may only reference `APPROVED` versions with a stored clip (5.2 rule 5).
4. The spec's "synthesise on a cache miss" path [V prompt.md:577] still exists, but for approved content a miss should be near-impossible. If it happens, the service should re-synthesise as the spec says, compare the new hash with the reviewed one, and raise an alarm if they differ so the operator listens again. (For the speech-service section owner to settle.)
5. Withdrawing a speech version (wrong sound discovered later) lists every published activity version that uses it and requires the operator to retire or withdraw those in the same action.

### 6.6 How activities reference clips [P]

`speechDefinitionReferences` maps a **variant name** to one approved speech version:

| Variant | Meaning | Control in the player |
|---|---|---|
| `prompt` | The stimulus: the sound or word the question is about | The large Play button |
| `instruction` | The on-screen instruction read aloud; usually a shared stem reused by many activities | A small speaker button beside the prompt text |
| `option-<optionId>` | A clip for one option ("tap to hear this word") | A speaker badge on that option |
| `bin-<binId>` | A clip for a sorting bin's key sound or key word | A speaker badge on the bin |
| `intro-1` … `intro-3` | Demonstration cards | A speaker button on the card |
| `answer` | Played from the "The answer was…" line | A speaker button there |

Variant names must match `^(prompt|instruction|answer|option-[a-f]|bin-[a-z0-9]{1,8}|intro-[1-3])$`. One clip per variant in version one. (Later, an ordered list of two or three approved clips per variant, played in sequence by the browser, would allow sound-talk such as "s – a – t … sat" and would let a finite set of number clips read templated maths prompts aloud; the speech-service report describes the same idea as client-side sequencing.)

**Scope note (owner decision D-1).** The spec describes the speech service for phonics and says the game has "phonics audio" and no "spoken character dialogue" [V prompt.md:1064]. The schema above lets any activity reference a clip, and I recommend using that for two things beyond phonics stimuli: (a) dictating spelling words that cannot be pictured ("said", "because"), and (b) a small library of shared instruction stems, because a five-year-old may not be able to read "Which letter is missing?". Both use the same approved-clip pipeline and the same offline cache. If the owner prefers to keep audio strictly to phonics, spelling still works through pictures and "which is spelt correctly?" items, and the age-5 prompts rely on icons and an adult nearby.

### 6.7 What the player-facing speech API may accept: identifiers only

- Request body: `{runId, slotId, activityId, activityVersion, variant}` — the fields the spec lists [V prompt.md:569] plus the slot. Each is pattern-checked; unknown fields are rejected.
- **Never accepted from a player:** text, SSML, a voice, an engine, a locale, a rate, or even a `speechId`. The service derives the speech version itself: owner → run → slot → pinned `activityId@version` → variant → `speechId@version` → clip.
- Rejected: a run the caller does not own; a slot not in that run; an `activityId@version` that is not what the slot pinned; a variant that activity version does not define.
- Any variant of any slot in the caller's own run may be fetched at any time, because the offline pack has to prefetch them all. Under the family trust model that is acceptable.
- Response: clip metadata and a short-lived URL — `{cacheKey, sha256, contentType, byteLength, url, expiresAt}` in the speech-service report (06, section 13), whose field names should win where mine differ. The browser stores the **bytes** keyed by `cacheKey` in the account-scoped local store and checks the hash; the URL is never the cache [V prompt.md:583, 699].
- De-duplicate by `cacheKey`: many slots share instruction stems, so a pack should download each distinct clip once. A batch form of the request (about 20 `{slotId, variant}` pairs) is a possible later optimisation; the speech-service report advises against building it until pack preparation is measured (06, section 11.3).
- The operator preview route is separate, admin-only, takes text or SSML and applies the 6.3 validation, length limits and voice/engine allow-list [V prompt.md:589].

---

## 7. Deterministic selection when a run is created

### 7.1 Fixed points

- [V prompt.md:505-519] One normal activity in each interval between waves; none before wave 1; none on the wave-50 completion screen; one before wave 51 if the player continues into endless.
- [V prompt.md:439] Optional meteor activities after waves 9, 19, 29, 39 and 49, additional to the normal one.
- [V prompt.md:501] Subjects rotate automatically; topic and activity come from the run's age bank "with enough variation that fresh runs differ"; no performance-based adjustment.
- [V prompt.md:523] Every activity has a stable identifier within the run; reloading must not select a new question; normal and meteor activities have separate IDs.
- [V prompt.md:221] Age band and content versions are pinned when the run is created.
- [V prompt.md:721] Endless uses a finite prepared buffer; activities are not silently repeated for extra rewards.

Everything below is **[P]**.

### 7.2 The slot plan

| Slots | Rule | Result for the campaign |
|---|---|---|
| Normal `N-001` … `N-049` | Slot `N-k` follows wave k. Subject = rotation[(k − 1) mod 3] with rotation = maths, phonics, spelling | 17 maths, 16 phonics, 16 spelling. After waves 1–6: maths, phonics, spelling, maths, phonics, spelling |
| Meteor `M-009`, `M-019`, `M-029`, `M-039`, `M-049` | Meteor j (j = 1…5) follows wave 10j − 1. Subject = rotation[(j − 1) mod 3] | maths, phonics, spelling, maths, phonics |
| Endless, block b ≥ 1 | Normal `N-(40+10b)` … `N-(49+10b)` and meteor `M-(49+10b)`; same two formulas | Block 1 = `N-050`…`N-059` (4 phonics, 3 spelling, 3 maths) plus `M-059` (spelling) |

The rotation start is fixed, not seeded, so it is predictable and testable. A useful property, checked by arithmetic for the first 60 bosses: **the meteor subject is never the same as the normal subject in the same interval** (before boss 1 the child gets spelling then a maths meteor; before boss 2, maths then phonics; and so on).

### 7.3 Inputs

- `ageBand` (5, 6 or 7).
- `seed`: 64 random bits generated by the server with a cryptographic source, stored on the run as a hex string. Tests inject a seed. A retried "create run" request returns the stored run, never a re-selection.
- The bank as read at that moment: for each subject and reward category, the `BANK#<age>#<subject>` entries (spine pattern C1), each giving `activityId`, published `version`, `topicId`, `authoringMode` and, for templates, the domain size.

### 7.4 The algorithm

For each of the six groups (three subjects × `NORMAL`/`METEOR`), independently:

1. **Units.** A fixed activity is one unit. A template activity is up to two units in the campaign (two different instances), so no single template dominates a run.
2. **Group by topic.** Shuffle the topic list with the seed. Shuffle the units inside each topic with the seed; a template's second instance goes to the back of its topic's queue.
3. **Fill the group's slots in slot order by round-robin over topics:** take the next unit from topic 1, then topic 2, and so on, skipping topics that have run out. This gives the widest possible **topic spread** — with 14 maths topics and 17 maths slots every topic appears once and three appear twice — and the same topic never appears in consecutive slots of a subject while another topic still has units.
4. **No repeats.** A fixed activity is used at most once in a run. A template instance (`activityId` plus parameters) is used at most once in a run.
5. **If the queues run dry before the slots are full, stop: the run is not created** (`CONTENT_UNAVAILABLE`). Slots are never left empty and never filled from another age.

Then, for the chosen units:

6. **Template instances:** draw parameters from the domain with the seed, re-drawing on a collision within the run; materialise prompt, payload and answer specification (section 8).
7. **Presentation:** shuffle option order and tile order with the seed and store them on the slot. A tile shuffle that happens to spell the answer is re-drawn.
8. **Demonstration flags:** walking all slots in play order, the first slot of each concept whose activity has a demonstration gets `intro: "AUTO"`; later ones get `"ON_REQUEST"` (section 5.6).
9. **Persist** every slot as `LOCKED` with its pinned reference, and return the pack manifest.

### 7.5 Making the draws deterministic

Use labelled, hash-based draws rather than a library random generator:

```
draw(seed, label, i)  = first 8 bytes of SHA-256("<seed>|<label>|<i>") read as an unsigned integer
shuffle(list, seed, label) = Fisher–Yates, choosing index  draw(seed, label, i) mod (i + 1)
labels: "topics:NORMAL:maths", "units:maths.bonds.to10", "params:N-001", "order:N-002", "endless:3:…"
```

Why: each decision has its own labelled stream, so adding a new decision later does not disturb the others; the result is identical on any Python version; and it is trivial to reproduce in a test. [V] Python's own documentation warns that "Most of the random module's algorithms and seeding functions are subject to change across Python versions" (only `random()` itself is guaranteed stable), and that the module "should not be used for security purposes" — https://docs.python.org/3/library/random.html. The stored slot list is always the authority; the seed exists for tests, audit and extending the selection in endless mode.

### 7.6 How the pinned selection is represented

Run level: `selection = {algorithmVersion, seed, ageBand, bankReadAt, topicRegistryVersion, packId}` where `packId` is a hash of the ordered slot references. Slot level (one item per slot in the spine's design), illustrated for two slots:

```json
[
  { "slotId": "N-001", "kind": "NORMAL", "afterWave": 1,
    "subject": "maths", "topicId": "maths.count.objects-to10",
    "activityId": "MA-0101", "activityVersion": 1,
    "templateParams": { "count": 8, "objectAsset": "obj.star", "arrangement": "SCATTER" },
    "resolved": { "prompt": { "text": "How many stars?" },
                  "activityPayload": { "stimulus": { "kind": "OBJECT_GROUP", "assetId": "obj.star", "count": 8, "arrangement": "SCATTER" },
                                       "numberSet": { "kind": "RANGE", "min": 0, "max": 10, "step": 1 }, "display": "TRACK" },
                  "answerSpecification": { "value": 8 } },
    "presentation": {}, "intro": "AUTO", "clips": [] },

  { "slotId": "N-002", "kind": "NORMAL", "afterWave": 2,
    "subject": "phonics", "topicId": "phonics.gpc.consonant-digraphs",
    "activityId": "PH-0102", "activityVersion": 1,
    "templateParams": null, "resolved": null,
    "presentation": { "optionOrder": ["c", "b", "a", "d"] }, "intro": "ON_REQUEST",
    "clips": [ { "variant": "prompt", "speechId": "phoneme.sh", "speechVersion": 1, "cacheKey": "…" },
               { "variant": "instruction", "speechId": "instruction.listen-which-letters", "speechVersion": 1, "cacheKey": "…" } ] }
]
```

The slot's `rewardCategory` and `reward` are added from the ruleset as the spine already describes. For a fixed activity the definition is read from the immutable `ACT#…/V#…` record; for a template the `resolved` snapshot on the slot is the definition. Either way the pack endpoint hands the browser a complete, ordinary activity definition per slot.

### 7.7 Endless: a finite buffer, honestly

- Choosing to continue creates block 1 (ten normal slots and one meteor slot). While online, opening the first slot of block b creates block b + 1, so there are always 10–20 intervals in hand; the browser downloads the new block's definitions and clips in the background and shows "Ready offline up to wave N".
- Each block is selected by the same algorithm with the label `endless:<b>`, from the **bank as published at that moment**, for the **age band pinned on the run**, excluding everything already used in the run. Each template may contribute up to two new instances per block.
- **Offline with the buffer used up:** the run pauses at the preparation boundary — "Reconnect to get more activities" — and nothing is repeated or invented [V prompt.md:721; AC-34].
- **Online with a subject's bank used up:** that interval falls back to the next subject that still has unused content, in the order maths, phonics, spelling. The maths templates of a band together offer several hundred instances (a condition of eligibility, 7.8), so in practice an activity is available for hundreds of endless waves. With hand-authored banks at the minimum size the first fallback happens after wave 98 (worked out from the thresholds below). If every group is finally used up, the interval simply has no activity and says so ("You have done every activity we have for now") — still never a repeat.
- This keeps one simple invariant — **a run never shows the same activity instance twice** — at the price of deep endless play drifting towards maths. The alternative, a deliberate second cycle through phonics and spelling once exhausted, keeps the rotation pure but repeats content. I recommend the strict rule; it is owner decision D-6.

### 7.8 Minimum bank sizes: when is an age band "eligible"?

A band is eligible when **both** conditions hold:

1. **Feasibility (hard):** the selection algorithm can fill all 49 normal and 5 meteor slots.
2. **Variety (policy):** each group holds at least twice what one run uses, spread over enough topics.

| Group | One campaign uses | Hard minimum (units) | Eligibility threshold, version one | Comfortable target |
|---|---|---|---|---|
| Maths, normal | 17 | 17 | 34 | 60 or more (templates make this easy) |
| Phonics, normal | 16 | 16 | 32 | 48 |
| Spelling, normal | 16 | 16 | 32 | 48 |
| Maths, meteor | 2 | 2 | 4 | 6 |
| Phonics, meteor | 2 | 2 | 4 | 6 |
| Spelling, meteor | 1 | 1 | 2 | 4 |

Additional conditions: at least five topics per subject with two or more units each; and the band's `NORMAL` maths templates together offer at least 500 instances and its `METEOR` maths templates at least 50, so that the endless fallback has hundreds of waves in hand at every age — which keeps reward opportunity the same across ages deep into endless. (Age-5 domains are small per template; object assets and arrangements are what multiply them.)

Counting rule: a fixed activity counts 1; a template counts 2 if its domain has at least 20 instances, otherwise 1.

What the threshold buys: with a bank of B and n drawn per run, two fresh runs share about n²/B items. At the threshold (16 from 32) that is about half a run's phonics items in common with the previous run; at the target (16 from 48) about a third. The thresholds are constants in the server configuration, visible on the admin bank-status view (spine route `GET /admin/bank-status`), and must never be set below the hard minimums.

### 7.9 Content unavailable — the honest behaviour

[V prompt.md:219] "If no eligible bank exists, show an honest content-unavailable message rather than silently serving a different age or inventing questions."

| Situation | Reason code | Child sees |
|---|---|---|
| Age from date of birth is under 5 or over 7 | `AGE_OUT_OF_RANGE` | "We don't have activities for your age yet." |
| Band is 5–7 but the bank is below a threshold or cannot fill the slots | `BANK_NOT_READY` | "Activities for your age are still being made. Please come back soon." |

- Checked when the planet list is shown (so the Start button is honest before it is pressed) and again inside run creation.
- The account, profile, progress screen and any existing runs remain usable; only *new* runs are blocked.
- No nearest-age fallback, no partial run, no template-only run that ignores phonics.
- The response and the logs carry `ageBand` or the reason code, never the date of birth.
- The operator sees exactly which group is short on the bank-status view.

### 7.10 Pack size estimate

| Part | Count | Size | Confidence |
|---|---|---|---|
| Activity definitions, campaign | 54 slots | about 1.0–1.5 kB each as JSON → 55–80 kB, perhaps 15–25 kB compressed | [U] estimate from the example records in section 10 |
| Distinct clips, campaign | roughly 55–65: about 27 phonics stimulus, option and bin clips; about 10 spelling word clips; 12–15 shared instruction stems; 8–10 demonstration clips. Plan for up to 90. | — | [U] estimate |
| Clip bytes | — | If Polly's MP3 is about 48 kbit/s, that is 6 kB per second: a sound 3–5 kB, a word 4–6 kB, an instruction 12–24 kB. About 0.4–0.8 MB per campaign pack. **Budget 2 MB.** | [U] bit rate not confirmed; measure in Milestone 0 |
| One endless block | 11 definitions, 10–18 clips | about 15 kB plus 100–200 kB | [U] |

Pictures used by activities are not in the per-run pack; they belong to the versioned asset manifest. The offline-readiness check must still confirm that every asset the run's slots reference is cached, or the run is not "ready" [V prompt.md:701].

### 7.11 Properties worth testing

1. Same seed and same bank → identical slot list.
2. Different seeds → different slot lists (fresh runs differ).
3. No `activityId` (fixed) and no `(activityId, parameters)` (template) appears twice in a run.
4. Subject of `N-k` and `M-…` follows the two formulas; counts are 17/16/16 and 2/2/1.
5. Every topic with enough units appears before any topic appears a third time.
6. The reward list is identical for age 5, 6 and 7.
7. A bank one unit short of feasibility produces `CONTENT_UNAVAILABLE`, not a partial run.
8. Publishing, retiring or superseding content after creation changes nothing in the run.
9. Reloading the run returns the same slots, options in the same order.

---

## 8. Templates

[V prompt.md:525] "Content may originate from handwritten material, deterministic templates, imports or AI-assisted drafting. Human review is required before it reaches the published bank." Everything below is **[P]**.

### 8.1 The model

- **A template is an ordinary activity** (`authoringMode = TEMPLATE`): same ID space, same lifecycle, same bank, same review. In place of a payload and answer it carries `template = {generatorKind, generatorVersion, domain, presentation}`.
- **A generator kind is code**: a pure function from `(domain, parameters)` to `{prompt, activityPayload, answerSpecification}`, with two companions — `enumerate(domain)` and `check(instance)`. It lives in one shared Python module used by the admin API (preview, validation) and the player API (run creation). **The browser never runs a generator.**
- **`generatorVersion` freezes behaviour**: once released, a `(kind, version)` pair never changes its output. A change is a new version, in the same spirit as the spine's `mechanics` number.
- **Instances are materialised when the run is created and stored on the slot** (`templateParams` plus the `resolved` snapshot). Judging and the offline pack use the snapshot, so a later code change cannot alter a question that is already pinned — the spec's "cannot change its answer midway" [V prompt.md:552] holds for templates too.
- **Operators create templates without code** by choosing a kind and filling in bounds. Adding a new *kind* is a developer task with tests.

Alternative considered: expand each template into hundreds of fixed activities at authoring time. That makes the runtime even simpler, but floods the bank and the admin list and needs batch-review tooling. Rejected for version one. Note for the spine: under this model the separate `TPL#` entity is unnecessary — a template is an `ACT#` record — so I suggest dropping it or keeping it only as a read-only list of generator kinds.

### 8.2 Proposed generator kinds

| Kind | Parameters and bounds | Typical output | Bands |
|---|---|---|---|
| `COUNT_OBJECTS` | count in a range (1–10 or 11–20); object asset from a set; arrangement scatter, row, ten-frame or dice | NS, TY | 5 |
| `COUNT_OUT` | target 2–10; tray holds target + 2 or 3, never more than 12 | OM distribute, one zone | 5 |
| `PICK_EXTREME` | four distinct values in a range; ask most/fewest or largest/smallest | PS, MC | 5, 6 |
| `ORDER_NUMBERS` | three to five distinct values in a range; ascending or descending; optional reversed-digit pair | AR sequence | 5, 6, 7 |
| `ONE_MORE_LESS` | n in a range; plus or minus 1 (plus or minus 10 for band 7); result stays in range | NS, TY, MC | 5, 6 |
| `BOND_TO` | total 5, 10, 20 or 100 (tens only); one part; four sentence forms; frame or sentence | NS, TY, MC | 5, 6, 7 |
| `ADD_WITHIN` | a + b with sum ≤ N; flags for crossing ten and for operand shape (two-digit + ones, + tens, + two-digit, three one-digit) | TY, NS, MC | 5, 6, 7 |
| `SUB_WITHIN` | a − b with b ≤ a ≤ N; same flags | TY, NS, MC | 5, 6, 7 |
| `MISSING_NUMBER` | six sentence forms including "a = ? − b"; within N | TY, NS | 6, 7 |
| `DOUBLE_HALVE` | n up to a maximum; double, or halve an even number | NS, TY | 5, 6 |
| `SHARE_EQUALLY` | total from 4, 6, 8, 10, 12 shared between 2 or 3 where it divides exactly | OM distribute, all placed | 5, 6 |
| `EQUAL_GROUPS` | 2–5 groups of 2, 5 or 10, pictured as groups or an array | NS, TY | 6 |
| `SKIP_COUNT` | step from a set (2, 5, 10; plus 3 for band 7); start; direction; next term or a gap | TY, NS, MC | 6, 7 |
| `SEQUENCE_GAP` | consecutive numbers within 0–100 with one gap; forwards or backwards | NS, TY | 6 |
| `NUMBER_WORD` | n in 1–20 or 20–100; word to numeral or numeral to word, from one reviewed British word list ("forty", "twenty-one") | MC, TY | 6, 7 |
| `PLACE_VALUE` | n in 10–99; tens digit, ones digit, or "t tens and o ones" | MC, TY, NS | 7 |
| `COMPARE_FILL` | "a < ?" or "? > b" with four candidate numbers of which exactly one works | MC | 7 |
| `TIMES_TABLE` | table 2, 5 or 10; multiplier 1–12; four forms including division | TY, NS, MC | 7 |
| `ODD_EVEN_SORT` | six distinct numbers in a range, at least two odd and two even | OM sort | 7 |
| `PATTERN_NEXT` | unit AB, AAB, ABB or ABC; shapes that differ in shape, not only colour; two or three repeats shown | PS | 5, 6 |

Distractors for multiple-choice outputs come deterministically from a fixed near-miss list (answer ± 1, ± 2, ± 10, digits reversed, the other operand), de-duplicated, kept in range and never equal to the answer. An instance that cannot supply three is removed from the domain.

A first release does not need all twenty. Eight (`COUNT_OBJECTS`, `ORDER_NUMBERS`, `ONE_MORE_LESS`, `BOND_TO`, `ADD_WITHIN`, `SUB_WITHIN`, `SKIP_COUNT`, `TIMES_TABLE`) already cover most maths topics at all three ages.

### 8.3 What makes this safe

1. **Bounded domain.** Every parameter has explicit bounds; the full domain is capped (I suggest 5,000 instances).
2. **Exhaustive machine check at publish.** Every instance in the domain is generated and checked: numbers in range, never negative, exactly one correct answer, the answer inside the payload, options distinct, prompt within length. One failure blocks publication.
3. **Human review of what a machine cannot judge.** The operator reviews the wording, the bounds and the representation on a rendered sample that must include the smallest, the largest and a few middle instances, then passes the preview-solve gate on three instances.
4. **Deterministic.** Same template version and parameters, same instance, always.
5. **No free text.** A generator only produces numbers, fixed stems and asset references.

Illustrative template record (a data fragment, not code):

```json
{ "activityId": "MA-0301", "authoringMode": "TEMPLATE", "subject": "maths", "topic": "maths.bonds.to20",
  "minAge": 6, "maxAge": 7, "rewardCategory": "NORMAL", "interactionType": "NUMBER_SELECT",
  "curriculumReference": ["NC14.Ma.Y1.AS-2", "NC14.Ma.Y2.AS-2"],
  "template": { "generatorKind": "BOND_TO", "generatorVersion": 1,
                "domain": { "total": [20], "part": { "min": 1, "max": 19 }, "forms": ["a + ? = T", "? + a = T"] },
                "presentation": { "numberSet": { "kind": "RANGE", "min": 0, "max": 20, "step": 1 }, "display": "TRACK" } } }
```

Domain size: 19 parts × 2 forms = 38 instances.

### 8.4 Which topics suit templates

| Suits templates | Needs hand-authoring |
|---|---|
| Counting, comparing, ordering, one more/less, bonds, addition, subtraction, missing numbers, doubling and halving, skip counting, times tables, place value, odd/even, number words, simple repeating patterns | Shape naming and shape properties (tied to specific art and to facts such as "a square-based pyramid has 5 vertices"); any picture comparison with real-world objects; anything with sentences or context ("word problems"); all phonics; all spelling |

### 8.5 Why phonics (and spelling) are hand-authored against a finite approved clip set

1. **Every sound has to be listened to by a person.** "A syntactically valid synthesis is not proof of a correct educational sound" [V prompt.md:609]. A template that composed arbitrary phoneme strings would put unheard audio in front of children.
2. **The clip set is finite and reviewed by design.** An activity may only reference approved clips (section 5.2), so the bank can only ever be as large as the reviewed library — which is the point.
3. **Word choice needs judgement a generator does not have:** homophones (night/knight), heteronyms (read/read), accent (bath, but), whether a distractor is accidentally a real word, whether a picture is unambiguous, and whether a grapheme has even been taught under the child's school programme.
4. **English spelling is not regular enough** for rule-based generation of misspellings that are plausible but definitely wrong.

What *is* reasonable for phonics and spelling is help at authoring time: a spreadsheet or import that turns a reviewed word list into draft items, each still reviewed and listened to individually (section 11.4).

---

## 9. Learning summary model

### 9.1 Fixed points

- [V prompt.md:527] Summaries are "completed activities, successes within three attempts, failures and counts by subject/topic across sessions" — "not an independent/supported/mastered scoring system".
- [V prompt.md:469] "Learning summaries reflect completed activities even if the run is later lost. An interrupted/incomplete activity is not automatically a failed activity."
- [V prompt.md:165] No adaptive use of results.

### 9.2 What is stored, and when [P]

One counter record per player per topic (the spine's `SUM#<subject>#<topicId>` item): `completed`, `succeeded`, `failed`, `lastResolvedAt`. The invariant `completed = succeeded + failed` always holds. Subject totals are sums over that subject's topics.

| Event | Effect on the summary |
|---|---|
| Activity opened, demonstration viewed, audio played | None |
| Attempt 1 or 2 incorrect | None — the attempt is recorded on the slot only |
| Correct on any attempt → `SUCCEEDED` | `completed + 1`, `succeeded + 1`, in the same transaction that resolves the slot and grants the reward (so exactly once; AC-18) |
| Third incorrect → `FAILED` | `completed + 1`, `failed + 1`, same transaction |
| Activity left unfinished (refresh, save and exit, run abandoned or lost with the slot still open) | None. An interrupted activity is not a failure. |
| Meteor declined → `DECLINED` | None |
| Slot voided → `VOIDED` | None; and if that slot had already been counted as failed, the failure is taken back (section 12) |
| Run later defeated, abandoned or completed | None — what was counted stays counted |
| Player resets learning history | The topic records are deleted; nothing else is touched |

- Meteor activities count like any other (they have a subject and a topic). Flagged as owner decision D-5; the alternative is to keep meteor results out of the summary.
- The summary holds **no attempt numbers** (no "got it first time"), no times, no answers and no age band. Attempt detail exists only on slots, for enforcement [V prompt.md:527].
- Nothing reads the summary to choose content. The single permitted reader besides the progress screen is the optional demonstration refinement in section 5.6, which looks only at how many activities were *completed*.

### 9.3 What the child sees on the progress screen [P]

- Three subject cards — Maths, Phonics, Spelling — each with "Activities done: 23" and "Stars: 19" (one star per success).
- Opening a card lists that subject's topics by their child-friendly titles ("Counting to 10", "Sounds: sh, ch, th") with the same two numbers. Topics never attempted are simply absent.
- The failed count is in the data and may be shown in neutral words — "Still practising: 4" — or left implicit as the difference. No percentages, grades, levels, red marks, streaks, timers, rankings or comparisons with anyone (sibling comparison is excluded [V prompt.md:155]).
- No school-year labels and no age band.

---

## 10. Worked examples

All content in this section is **[P]**: illustrative items in the proposed schema, not reviewed published content. Asset IDs and speech IDs are invented for the examples. Seven examples for age 5, three for age 6 and seven for age 7 cover all six interaction types and all three subjects; five are phonics items with their speech definitions (10.4). Records are abbreviated: author and review metadata, `schemaVersion` and `definitionHash` are omitted.

### 10.1 Age 5

**E5-1 · maths · NUMBER_SELECT · template** — the spec's own example of counting eight stars [V prompt.md:1116].

```json
{ "activityId": "MA-0101", "version": 1, "subject": "maths", "topic": "maths.count.objects-to10",
  "minAge": 5, "maxAge": 5, "rewardCategory": "NORMAL", "authoringMode": "TEMPLATE", "interactionType": "NUMBER_SELECT",
  "curriculumReference": ["EYFS26.ELG.Number-1", "NC14.Ma.Y1.NPV-4"], "audioRequirement": "NONE",
  "template": { "generatorKind": "COUNT_OBJECTS", "generatorVersion": 1,
    "domain": { "count": { "min": 3, "max": 10 }, "objectAsset": ["obj.star", "obj.moonrock", "obj.rocket", "obj.crystal"],
                "arrangement": ["SCATTER", "ROW"] },
    "presentation": { "numberSet": { "kind": "RANGE", "min": 0, "max": 10, "step": 1 }, "display": "TRACK" } },
  "introductionContent": { "conceptId": "maths.count.objects-to10",
    "cards": [ { "text": "Touch each one as you count. The last number you say is how many.", "assetId": "demo.count-five" } ] } }
```

- Instance pinned in the run: `{count: 8, objectAsset: "obj.star", arrangement: "SCATTER"}` → prompt "How many stars?", answer `{value: 8}`. Domain 8 × 4 × 2 = 64 instances.
- Flow: the child selects 7 and presses Check → "Not quite. Have another go.", tries left 2, the 7 is marked tried. Selects 8, Check → "You got it!" and the interval's credits.

**E5-2 · phonics · MULTIPLE_CHOICE · fixed** — the spec's Example B: identify a sound among displayed graphemes [V prompt.md:1128].

```json
{ "activityId": "PH-0102", "version": 1, "subject": "phonics", "topic": "phonics.gpc.consonant-digraphs",
  "minAge": 5, "maxAge": 6, "rewardCategory": "NORMAL", "authoringMode": "FIXED", "interactionType": "MULTIPLE_CHOICE",
  "curriculumReference": ["EYFS26.ELG.WordReading-1", "LS07.Phase3"], "audioRequirement": "REQUIRED",
  "prompt": { "text": "Listen. Which letters make this sound?" },
  "activityPayload": { "optionStyle": "GRAPHEME",
    "options": [ { "id": "a", "text": "s" }, { "id": "b", "text": "sh" }, { "id": "c", "text": "ch" }, { "id": "d", "text": "th" } ] },
  "answerSpecification": { "correctOptionId": "b" },
  "speechDefinitionReferences": { "prompt": { "speechId": "phoneme.sh", "speechVersion": 1 },
                                  "instruction": { "speechId": "instruction.listen-which-letters", "speechVersion": 1 } } }
```

- The answer area stays hidden until the `phoneme.sh` clip bytes are in the local store. Play can be pressed any number of times.
- If the isolated /sh/ fails the listening check, the same learning point is authored as tier A instead: "Listen. Which letters start this word?" with the clip `word.ship`.

**E5-3 · spelling · ARRANGE (letters) · fixed**

```json
{ "activityId": "SP-0103", "version": 1, "subject": "spelling", "topic": "spelling.cvc.build",
  "minAge": 5, "maxAge": 5, "rewardCategory": "NORMAL", "authoringMode": "FIXED", "interactionType": "ARRANGE",
  "curriculumReference": ["EYFS26.ELG.Writing-2"], "audioRequirement": "OPTIONAL",
  "prompt": { "text": "Make the word." }, "visualAssetReferences": ["pic.cat"],
  "activityPayload": { "mode": "LETTERS", "slots": 3, "cue": { "assetId": "pic.cat", "alt": "a cat" },
    "tiles": [ { "id": "t1", "value": "c" }, { "id": "t2", "value": "a" }, { "id": "t3", "value": "t" },
               { "id": "t4", "value": "o" }, { "id": "t5", "value": "n" } ] },
  "answerSpecification": { "accepted": ["cat"] },
  "speechDefinitionReferences": { "prompt": { "speechId": "word.cat", "speechVersion": 1 } } }
```

- Submitted `{order: ["t1","t2","t3"]}` → values c, a, t → "cat" → correct.
- c-o-t makes "cot": a real word, but not the cued one, so incorrect. The reviewer accepted this because the picture and the clip make the target unambiguous.
- Keyboard: with the tile tray focused, pressing C, A, T places the tiles; Backspace takes the last one back.

**E5-4 · maths · OBJECT_MOVE (distribute) · template**

```json
{ "activityId": "MA-0104", "version": 1, "subject": "maths", "topic": "maths.share.equal-groups",
  "minAge": 5, "maxAge": 5, "rewardCategory": "NORMAL", "authoringMode": "TEMPLATE", "interactionType": "OBJECT_MOVE",
  "curriculumReference": ["EYFS26.ELG.NumPat-3"], "audioRequirement": "NONE",
  "template": { "generatorKind": "SHARE_EQUALLY", "generatorVersion": 1,
    "domain": { "total": [4, 6, 8, 10], "zones": [2], "objectAsset": ["obj.star", "obj.moonrock", "obj.crystal"] },
    "presentation": { "zoneLabels": ["Nova", "Pip"] } } }
```

- Instance `{total: 6, zones: 2, objectAsset: "obj.star"}` → prompt "Share the stars fairly.", payload `{mode: "DISTRIBUTE", sourceCount: 6, zones: [z1 "Nova", z2 "Pip"], requireAllPlaced: true}`, answer `{zoneCounts: {z1: 3, z2: 3}}`.
- 4 and 2 is one incorrect attempt; pressing Check again without moving anything is "You've tried that one" and costs nothing.
- Domain 4 × 1 × 3 = 12 instances, so this template counts as one unit for eligibility.

**E5-5 · phonics · PICTURE_SELECT · fixed**

```json
{ "activityId": "PH-0105", "version": 1, "subject": "phonics", "topic": "phonics.initial-sounds",
  "minAge": 5, "maxAge": 5, "rewardCategory": "NORMAL", "authoringMode": "FIXED", "interactionType": "PICTURE_SELECT",
  "curriculumReference": ["EYFS26.ELG.WordReading-1", "LS07.Phase2"], "audioRequirement": "REQUIRED",
  "prompt": { "text": "Listen. Which picture starts with this sound?" },
  "visualAssetReferences": ["pic.moon", "pic.sun", "pic.cat", "pic.dog"],
  "activityPayload": { "layout": "GRID", "options": [
      { "id": "a", "assetId": "pic.moon", "alt": "moon" }, { "id": "b", "assetId": "pic.sun", "alt": "sun" },
      { "id": "c", "assetId": "pic.cat", "alt": "cat" },   { "id": "d", "assetId": "pic.dog", "alt": "dog" } ] },
  "answerSpecification": { "correctOptionId": "a" },
  "speechDefinitionReferences": { "prompt": { "speechId": "phoneme.m", "speechVersion": 1 },
                                  "instruction": { "speechId": "instruction.listen-which-picture", "speechVersion": 1 } } }
```

- No captions under the pictures: a written "moon" would let the child match the letter instead of the sound.

**E5-6 · spelling · MULTIPLE_CHOICE · fixed**

```json
{ "activityId": "SP-0106", "version": 1, "subject": "spelling", "topic": "spelling.cvc.missing-letter",
  "minAge": 5, "maxAge": 5, "rewardCategory": "NORMAL", "authoringMode": "FIXED", "interactionType": "MULTIPLE_CHOICE",
  "curriculumReference": ["EYFS26.ELG.Writing-2"], "audioRequirement": "NONE",
  "prompt": { "text": "Which letter is missing?" }, "visualAssetReferences": ["pic.dog"],
  "activityPayload": { "optionStyle": "GRAPHEME",
    "stimulus": { "kind": "WORD_GAP", "assetId": "pic.dog", "alt": "a dog", "text": "d _ g" },
    "options": [ { "id": "a", "text": "o" }, { "id": "b", "text": "i" }, { "id": "c", "text": "u" }, { "id": "d", "text": "a" } ] },
  "answerSpecification": { "correctOptionId": "a" } }
```

- "dig" and "dug" are real words; the picture decides. The reviewer rejected "s _ n" with a sun picture because "son" sounds identical to "sun".

**E5-7 · maths · TYPED (numeric) · template · METEOR** — a candidate for `M-009`.

```json
{ "activityId": "MA-0107", "version": 1, "subject": "maths", "topic": "maths.number.one-more-less-to10",
  "minAge": 5, "maxAge": 5, "rewardCategory": "METEOR", "authoringMode": "TEMPLATE", "interactionType": "TYPED",
  "curriculumReference": ["DM23.R.one-more-one-less", "NC14.Ma.Y1.NPV-3"], "audioRequirement": "NONE",
  "template": { "generatorKind": "ONE_MORE_LESS", "generatorVersion": 1,
    "domain": { "n": { "min": 1, "max": 9 }, "delta": [1, -1] },
    "presentation": { "mode": "NUMERIC", "maxLength": 2 } } }
```

- Instance `{n: 6, delta: 1}` → "What is one more than 6?" → `{value: 7}`. " 7" and "07" normalise to 7.
- The child can answer with the on-screen keypad or the keyboard. Success grants the boss power defined by the ruleset; declining or failing changes nothing else [V prompt.md:439].

### 10.2 Age 6

**E6-1 · maths · TYPED (numeric) · template** — the national curriculum's own example, "7 = ? − 9" [V S1].

```json
{ "activityId": "MA-0201", "version": 1, "subject": "maths", "topic": "maths.missing-number.within20",
  "minAge": 6, "maxAge": 6, "rewardCategory": "NORMAL", "authoringMode": "TEMPLATE", "interactionType": "TYPED",
  "curriculumReference": ["NC14.Ma.Y1.AS-4"], "audioRequirement": "NONE",
  "template": { "generatorKind": "MISSING_NUMBER", "generatorVersion": 1,
    "domain": { "max": 20, "operandMin": 1, "forms": ["a + ? = c", "? + b = c", "c − ? = a", "? − b = a", "a = ? − b"] },
    "presentation": { "mode": "NUMERIC", "maxLength": 2 } } }
```

- Instance `{form: "a = ? − b", a: 7, b: 9}` → "7 = ? − 9" → `{value: 16}`.

**E6-2 · phonics · MULTIPLE_CHOICE · fixed** — an "alien name" pseudo-word, in the spirit of the year 1 check.

```json
{ "activityId": "PH-0202", "version": 1, "subject": "phonics", "topic": "phonics.pseudo-words",
  "minAge": 6, "maxAge": 7, "rewardCategory": "NORMAL", "authoringMode": "FIXED", "interactionType": "MULTIPLE_CHOICE",
  "curriculumReference": ["NC14.En.Y1.WR-3"], "audioRequirement": "REQUIRED",
  "prompt": { "text": "Listen to the alien's name. Which name tag is right?" },
  "visualAssetReferences": ["alien.moonblob.portrait"],
  "activityPayload": { "optionStyle": "WORD",
    "stimulus": { "kind": "IMAGE", "assetId": "alien.moonblob.portrait", "alt": "a friendly round alien" },
    "options": [ { "id": "a", "text": "chom" }, { "id": "b", "text": "shom" }, { "id": "c", "text": "chon" }, { "id": "d", "text": "chob" } ] },
  "answerSpecification": { "correctOptionId": "a" },
  "speechDefinitionReferences": { "prompt": { "speechId": "pseudo.chom", "speechVersion": 1 } } }
```

- A text-to-speech engine will guess at a non-word, so the clip must be an explicit phoneme string and must be listened to.

**E6-3 · spelling · ARRANGE (letters, grapheme tiles) · fixed**

```json
{ "activityId": "SP-0203", "version": 1, "subject": "spelling", "topic": "spelling.y1.vowel-digraphs-1",
  "minAge": 6, "maxAge": 6, "rewardCategory": "NORMAL", "authoringMode": "FIXED", "interactionType": "ARRANGE",
  "curriculumReference": ["NC14.EnApp1.Y1.ai-oi", "NC14.EnApp1.Y1.ay-oy"], "audioRequirement": "OPTIONAL",
  "prompt": { "text": "Make the word." }, "visualAssetReferences": ["pic.rain"],
  "activityPayload": { "mode": "LETTERS", "slots": 3, "cue": { "assetId": "pic.rain", "alt": "rain falling from a cloud" },
    "tiles": [ { "id": "t1", "value": "r" }, { "id": "t2", "value": "ai" }, { "id": "t3", "value": "n" },
               { "id": "t4", "value": "ay" }, { "id": "t5", "value": "a" } ] },
  "answerSpecification": { "accepted": ["rain"] },
  "speechDefinitionReferences": { "prompt": { "speechId": "word.rain", "speechVersion": 1 } } }
```

- r + ai + n = "rain" (correct); r + ay + n = "rayn" and r + a + n = "ran" are incorrect. The item tests exactly the appendix's guidance that ai is "virtually never used at the end of English words" while ay is used at the end [V `appendix1-spelling.txt:140-145`].

### 10.3 Age 7

**E7-1 · maths · NUMBER_SELECT · template** — the spec's example, "14 + ? = 20" [V prompt.md:1118]. The template record is the one shown in section 8.3 (`MA-0301`, `BOND_TO`).

- Instance `{total: 20, part: 14, form: "a + ? = T"}` → prompt "14 + ? = 20", number track 0–20, answer `{value: 6}`.
- Keyboard: Tab to the track, Right Arrow to 6 (selection follows focus), Tab to Check, Enter.

**E7-2 · phonics · OBJECT_MOVE (sort) · fixed**

```json
{ "activityId": "PH-0302", "version": 1, "subject": "phonics", "topic": "phonics.alt-pronunciation",
  "minAge": 6, "maxAge": 7, "rewardCategory": "NORMAL", "authoringMode": "FIXED", "interactionType": "OBJECT_MOVE",
  "curriculumReference": ["NC14.En.Y2.WR-2", "NC14.EnApp1.Y1.ea"], "audioRequirement": "OPTIONAL",
  "prompt": { "text": "Read each word. Which sound does ea make?" },
  "activityPayload": { "mode": "SORT",
    "bins": [ { "id": "ee", "label": "like tree" }, { "id": "e", "label": "like bed" } ],
    "objects": [ { "id": "o1", "text": "sea" }, { "id": "o2", "text": "head" }, { "id": "o3", "text": "dream" },
                 { "id": "o4", "text": "bread" }, { "id": "o5", "text": "meat" }, { "id": "o6", "text": "instead" } ] },
  "answerSpecification": { "binOf": { "o1": "ee", "o2": "e", "o3": "ee", "o4": "e", "o5": "ee", "o6": "e" } },
  "speechDefinitionReferences": { "bin-ee": { "speechId": "word.tree", "speechVersion": 1 },
                                  "bin-e": { "speechId": "word.bed", "speechVersion": 1 },
                                  "instruction": { "speechId": "instruction.sort-by-sound", "speechVersion": 1 } } }
```

- All six words are example words from the two "ea" rows of Appendix 1 [V `appendix1-spelling.txt:154-157`]. "read" is deliberately left out: it belongs in both bins.
- Keyboard: focus "sea", press 1 to send it to the first bin; and so on. Check is complete only when all six are placed. One Check = one attempt, however many cards were moved.

**E7-3 · spelling · TYPED (word) · fixed**

```json
{ "activityId": "SP-0303", "version": 1, "subject": "spelling", "topic": "spelling.y2.suffix-rules",
  "minAge": 7, "maxAge": 7, "rewardCategory": "NORMAL", "authoringMode": "FIXED", "interactionType": "TYPED",
  "curriculumReference": ["NC14.EnApp1.Y2.double-consonant"], "audioRequirement": "NONE",
  "prompt": { "text": "Add ing. Type the new word." },
  "activityPayload": { "mode": "WORD", "maxLength": 10, "cue": { "ruleText": "hop + ing" } },
  "answerSpecification": { "accepted": ["hopping"], "caseSensitive": false } }
```

- "Hopping " → "hopping" → correct. "hoping" is a real word and an incorrect attempt. "hop ing" is incorrect. The field has spellcheck and autocorrect off.

**E7-4 · maths · ARRANGE (sequence) · template**

```json
{ "activityId": "MA-0304", "version": 1, "subject": "maths", "topic": "maths.compare.symbols-to100",
  "minAge": 7, "maxAge": 7, "rewardCategory": "NORMAL", "authoringMode": "TEMPLATE", "interactionType": "ARRANGE",
  "curriculumReference": ["NC14.Ma.Y2.NPV-4"], "audioRequirement": "NONE",
  "template": { "generatorKind": "ORDER_NUMBERS", "generatorVersion": 1,
    "domain": { "shape": "REVERSED_PAIR_WITH_TENS", "digitLow": { "min": 1, "max": 8 }, "digitHigh": { "min": 2, "max": 9 }, "direction": ["ASC", "DESC"] },
    "presentation": { "mode": "SEQUENCE" } } }
```

- Instance `{digitLow: 3, digitHigh: 8, direction: "ASC"}` → numbers 38, 83, 30, 80 → prompt "Put the numbers in order, smallest first." → `{accepted: [["30","38","80","83"]]}`.
- The domain is defined tightly on purpose: 36 digit pairs × 2 directions = 72 instances. "Any four two-digit numbers" would be millions of instances and would fail the 5,000 cap — the cap forces templates to say what they are really testing (here, tens before ones).

**E7-5 · phonics · MULTIPLE_CHOICE · fixed**

```json
{ "activityId": "PH-0305", "version": 1, "subject": "phonics", "topic": "phonics.gpc.y2-consonant-spellings",
  "minAge": 7, "maxAge": 7, "rewardCategory": "NORMAL", "authoringMode": "FIXED", "interactionType": "MULTIPLE_CHOICE",
  "curriculumReference": ["NC14.En.Y2.WR-2", "NC14.EnApp1.Y2.kn-gn"], "audioRequirement": "REQUIRED",
  "prompt": { "text": "Listen. Which word did you hear?" },
  "activityPayload": { "optionStyle": "WORD",
    "options": [ { "id": "a", "text": "need" }, { "id": "b", "text": "knit" }, { "id": "c", "text": "knee" }, { "id": "d", "text": "neat" } ] },
  "answerSpecification": { "correctOptionId": "c" },
  "speechDefinitionReferences": { "prompt": { "speechId": "word.knee", "speechVersion": 1 },
                                  "instruction": { "speechId": "instruction.listen-which-word", "speechVersion": 1 } } }
```

- Tier A audio (a whole word). The child has to decode kn and tell the vowel and ending apart.

**E7-6 · spelling · PICTURE_SELECT · fixed**

```json
{ "activityId": "SP-0306", "version": 1, "subject": "spelling", "topic": "spelling.y2.homophones",
  "minAge": 7, "maxAge": 7, "rewardCategory": "NORMAL", "authoringMode": "FIXED", "interactionType": "PICTURE_SELECT",
  "curriculumReference": ["NC14.En.Y2.Sp-1", "NC14.EnApp1.Y2.homophones"], "audioRequirement": "NONE",
  "prompt": { "text": "Read the word. Which picture matches?" },
  "visualAssetReferences": ["pic.night-sky", "pic.knight", "pic.kite", "pic.knot"],
  "activityPayload": { "layout": "GRID", "stimulus": { "kind": "TEXT", "text": "knight" }, "options": [
      { "id": "a", "assetId": "pic.night-sky", "alt": "a dark sky with a moon and stars" },
      { "id": "b", "assetId": "pic.knight", "alt": "a person in armour" },
      { "id": "c", "assetId": "pic.kite", "alt": "a kite" }, { "id": "d", "assetId": "pic.knot", "alt": "a knot in a rope" } ] },
  "answerSpecification": { "correctOptionId": "b" } }
```

- night/knight is on the appendix's homophone list [V `appendix1-spelling.txt:392-397`]. No clip is attached on purpose: the two words sound the same, so audio could not help and would mislead.

**E7-7 · maths · two steps (MULTIPLE_CHOICE then TYPED) · fixed · METEOR** — shows how sub-steps make one attempt.

```json
{ "activityId": "MA-0307", "version": 1, "subject": "maths", "topic": "maths.times-tables.2-5-10",
  "minAge": 7, "maxAge": 7, "rewardCategory": "METEOR", "authoringMode": "FIXED", "interactionType": "MULTIPLE_CHOICE",
  "curriculumReference": ["NC14.Ma.Y2.MD-1", "NC14.Ma.Y2.MD-2"], "audioRequirement": "NONE",
  "prompt": { "text": "Two parts. Do both, then press Check." },
  "activityPayload": { "partPrompt": "Which number is in the 5 times table?", "optionStyle": "NUMERAL",
    "options": [ { "id": "a", "text": "12" }, { "id": "b", "text": "18" }, { "id": "c", "text": "25" }, { "id": "d", "text": "32" } ] },
  "answerSpecification": { "correctOptionId": "c" },
  "additionalSteps": [ { "interactionType": "TYPED", "prompt": { "text": "5 × 6 = ?" },
      "activityPayload": { "mode": "NUMERIC", "maxLength": 2 }, "answerSpecification": { "value": 30 } } ] }
```

- Attempt 1: 25 and 35 → part one right, part two wrong → the attempt is incorrect; part one is kept with a tick, part two says "Try this part again"; tries left 2.
- Attempt 2: 25 and 30 → success → **one** reward (the boss power from the ruleset), one summary update.
- Check does nothing (and costs nothing) while either part is empty.

### 10.4 Speech definitions used by the examples

Common to all rows: `locale: "en-GB"`, `engine: "neural"`, `output: {format: "mp3", sampleRate: "24000"}`, `voiceId`: the voice chosen in Milestone 0, `generationVersion: 1`, and a review record such as `{listenedBy: "<operator>", listenedAt: "2026-11-20T10:14:00Z", audioSha256: "…", checklist: {intendedSound: true, noAddedVowel: true, notLetterName: true, cleanEdges: true}}`.

| speechId@version | kind | textType | text sent to Polly | Tier | Used by |
|---|---|---|---|---|---|
| `phoneme.sh@1` | PHONEME | ssml | `<speak><phoneme alphabet="ipa" ph="ʃ">sh</phoneme></speak>` (X-SAMPA equivalent `ph="S"`) | B | E5-2 `prompt` |
| `phoneme.m@1` | PHONEME | ssml | `<speak><phoneme alphabet="ipa" ph="m">m</phoneme></speak>` | B | E5-5 `prompt` |
| `instruction.listen-which-letters@1` | INSTRUCTION | text | `Listen to the sound. Which letters make this sound?` | A | E5-2 `instruction` and every similar item |
| `instruction.listen-which-picture@1` | INSTRUCTION | text | `Listen to the sound. Which picture starts with this sound?` | A | E5-5 `instruction` |
| `word.cat@1` | WORD (real) | text | `cat` | A | E5-3 `prompt` |
| `pseudo.chom@1` | WORD (pseudo) | ssml | `<speak><phoneme alphabet="x-sampa" ph="tSQm">chom</phoneme></speak>` (IPA t͡ʃɒm) | B | E6-2 `prompt` |
| `word.rain@1` | WORD (real) | text | `rain` | A | E6-3 `prompt` |
| `word.tree@1`, `word.bed@1` | WORD (real) | text | `tree`, `bed` | A | E7-2 `bin-ee`, `bin-e` |
| `instruction.sort-by-sound@1` | INSTRUCTION | text | `Read each word. Put it with the word that has the same sound.` | A | E7-2 `instruction` |
| `word.knee@1` | WORD (real) | text | `knee` | A | E7-5 `prompt` |
| `instruction.listen-which-word@1` | INSTRUCTION | text | `Listen. Which word did you hear?` | A | E7-5 `instruction` |

The phoneme symbols are taken from Polly's en-GB table [V https://docs.aws.amazon.com/polly/latest/dg/ph-table-english-uk.html]. The texts show the idea only: the real wrapper (leading and trailing breaks, a slower rate for continuants, X-SAMPA as the stored alphabet, always SSML) will be the frozen template from the Milestone 0 spike described in the speech-service report (06, sections 5.5, 5.8 and 12). Whether these clips *sound* right is [U] until someone listens — which is exactly what the review record is for.

### 10.5 Same interval, different age: after waves 1 to 6

Both children are on the same planet with the same ruleset, the same starting allowance and the same wave schedule [V prompt.md:1112-1124]. The slot IDs, the subject in each interval and the reward are identical; only the pinned activity differs.

| After wave | Slot | Subject | Age 5 child | Age 7 child |
|---|---|---|---|---|
| 1 | `N-001` | maths | E5-1: count 8 stars and choose 8 (number selection) | E7-1: 14 + ? = 20, choose 6 (number selection) |
| 2 | `N-002` | phonics | E5-2: hear /sh/, choose "sh" (multiple choice) | E7-2: sort six "ea" words by sound (sorting objects) |
| 3 | `N-003` | spelling | E5-3: build "cat" from tiles (arranging letters) | E7-3: type "hopping" for hop + ing (typed word) |
| 4 | `N-004` | maths | E5-4: share 6 stars between Nova and Pip (moving objects) | E7-4: order 38, 83, 30, 80 (arranging items) |
| 5 | `N-005` | phonics | E5-5: hear /m/, choose the moon (picture selection) | E7-5: hear "knee", choose the written word (multiple choice) |
| 6 | `N-006` | spelling | E5-6: d _ g, choose "o" (multiple choice) | E7-6: read "knight", choose the picture (picture selection) |

**The same for both in every row:** the reward for that interval comes from the ruleset by slot, so a success pays the same credits to each child; up to three attempts; no timer; no penalty for an incorrect answer; an unresolved activity waits across refreshes with its attempts intact; the next wave starts only when Ready is pressed; the next wave's aliens are the same.

Before the first boss both children also see `N-009` (spelling) and then the optional `M-009` meteor in maths — E5-7 for the five-year-old, E7-7 for the seven-year-old — with separate slot IDs and separate reward markers [V prompt.md:1156-1166].

A six-year-old in the same intervals would meet, for example, E6-1 at `N-001` or `N-004`, E6-2 (or the shared E5-2 or E7-2) at a phonics interval and E6-3 at a spelling interval.

---

## 11. Initial bank sizing and authoring plan

Everything here is **[P]**; counts and hours are estimates **[U]** until someone has authored a first batch.

### 11.1 How much content version one needs

To make all three bands eligible at the section 7.8 thresholds:

| Group | Per band | Shared with a neighbouring band | Distinct records to author |
|---|---|---|---|
| Maths, normal | 34 units = about 11 templates (22 units) + 12 fixed items | a few (bonds to 10, bonds to 20, repeating patterns) | about 30 templates + 32 fixed |
| Phonics, normal | 32 fixed | 8 shared 5–6, 8 shared 6–7 | 80 |
| Spelling, normal | 32 fixed | 8 shared 5–6, 8 shared 6–7 | 80 |
| Maths, meteor | 4 units = 2 templates | none | 6 templates |
| Phonics, meteor | 4 fixed | 2 + 2 | 8 |
| Spelling, meteor | 2 fixed | 1 + 1 | 4 |
| **Total** | | | **about 240 records, of which about 36 are template rows** |

Supporting material:

| Material | At the eligibility threshold | At the comfortable target (48 per group) |
|---|---|---|
| Approved clips | about 200: roughly 80 phonics stimuli, 50 spelling words, 25 instruction stems, 20 demonstration clips, 25 others | about 450, including 26 letter names and per-option word clips |
| Activity pictures | about 80: 35–40 nouns for age 5, 15 for ages 6–7, 6 counting objects, 12 shapes, frames and dice faces | about 150 |

Pictures are the hidden dependency. Age-5 phonics and spelling lean on unambiguous noun pictures, and the art plan must include them ("activity objects" are already in the spec's asset inventory [V prompt.md:1084]). A starter set of 35 nouns that covers the age-5 topics: cat, dog, sun, moon, pin, pan, pen, pig, hat, bed, cup, map, net, van, jam, box, fox, bus, web, zip, mug, peg, log, ship, shop, chip, fish, ring, rain, boat, frog, flag, bell, sock, duck. Each must be recognisable at about 128 pixels, carry no text, and have alt text. Using word clips instead of pictures at ages 6 and 7 keeps the art load down.

### 11.2 A realistic phased sequence

| Phase | Plan milestone | What is authored | Size | Done when |
|---|---|---|---|---|
| A | Milestone 0 (spikes) | The listening matrix of section 6.4 as speech **drafts**. Nothing is published. | about 24 texts × 4 voices | A voice is chosen; there is a written list of sounds approved for isolated use; "poor pronunciation is resolved before scaling the bank" [V prompt.md:1268] |
| B | Milestone 1 (first playable) | **One activity and one clip** [V prompt.md:1271]. Recommended: E5-2 ("Which letters make this sound?") with `phoneme.sh` if it passed phase A, otherwise its tier A twin with `word.ship`. | 1 + 1 | The clip plays through the real speech service, three attempts and one reward work, a refresh keeps the attempts. The milestone build declares exactly one activity interval and sets the eligibility thresholds to 1 — labelled as milestone configuration, not the product rule. |
| C | Start of Milestone 3 | The 17 worked examples of section 10 as a vertical-slice bank | 17 activities, 12 clips, about 12 pictures | Every interaction type, both object modes, both arrange modes, both typed modes and the two-step composite work with mouse alone and keyboard alone; the shared test vectors pass in both languages |
| D | Milestone 3 | Maths generators — the first eight kinds — and their template rows for all three ages | about 30 template rows | Maths groups reach threshold in every band. No audio needed, so this is the fastest route to a large, safe bank. |
| E | Milestone 3 | Phonics library and items, age 5 first (it depends most on isolated sounds), then 6, then 7 | 80 items, about 100 clips | Each phonics group at threshold; every clip has a review record |
| F | Milestone 3 | Spelling items, age 5 (tiles and pictures), then 6, then 7 | 80 items, about 50 clips | Each spelling group at threshold |
| G | Milestones 3–4 | Meteor pool; one demonstration card for the first topic or two of each subject and age, then the rest | about 18 meteor records; 20+ demonstrations | Bank-status shows every band eligible. This is the "content complete for version one" gate. |
| H | After release | Top up to the comfortable targets; add generator kinds | — | Two consecutive runs share about a third of their hand-authored items, not half |
| I | Later scope | Import of drafts; AI-assisted drafting outside the product (11.4) | — | — |

### 11.3 Spreadsheet columns to start authoring today

One row per record. These columns map one-to-one onto the schema, so a later import needs no interpretation.

**Sheet "activities" (fixed items)**
`activityId` (blank for new) · `subject` · `topic` · `minAge` · `maxAge` · `rewardCategory` · `interactionType` · `mode` · `promptText` · `stimulusKind` · `stimulusText` · `stimulusAsset` · `stimulusAlt` · `optA` … `optF` (text or asset ID) · `altA` … `altF` (pictures only) · `correct` (option letter, number, or word) · `tiles` (comma-separated values) · `slots` · `accepted` (semicolon-separated) · `bins` (id=label pairs) · `objects` (text=bin pairs) · `clipPrompt` · `clipInstruction` · `clipOther` (variant=speechId pairs) · `audioRequirement` · `introText` · `introAsset` · `curriculumReference` (semicolon-separated codes) · `source` · `notes`

**Sheet "speech"**
`speechId` · `kind` · `wordKind` · `displayLabel` · `textType` · `text` · `tier` · `notes`

**Sheet "templates"**
`activityId` · `subject` · `topic` · `minAge` · `maxAge` · `rewardCategory` · `interactionType` · `generatorKind` · one column per bound (`min`, `max`, `total`, `forms`, `assets`…) · `presentation` · `notes`

**A first afternoon:**

1. Fill the speech sheet with the Milestone 0 listening matrix.
2. Write ten age-5 phonics rows of the tier A kind ("Listen. Which letter starts this word?") from the phase 2 letter sets and the starter nouns.
3. Write ten age-5 spelling rows for `spelling.cvc.build` from the same nouns (three letter tiles plus two distractors).
4. Write the template rows for `COUNT_OBJECTS`, `BOND_TO` and `ADD_WITHIN` for each age.
5. Copy ten year 1 and ten year 2 common exception words from section 1.5 into "hear the word, choose the spelling" rows, each with three plausible misspellings that are not real words.

### 11.4 Import and AI-assisted drafting — later, and never around review

[V prompt.md:525, 554] Imports and AI-assisted preparation are content *sources*; manual entry and approved templates are enough to begin with; human review is always required. [V prompt.md:173] Live, unreviewed AI questions are excluded.

- **Import (phase I).** An admin-only upload of the sheets above that creates **drafts only**. Each row is validated and errors are reported per row. Import never publishes, never approves a clip, and never changes a published version; a row whose `activityId` already exists only replaces that activity's draft, guarded by `draftRevision`. That also honours "Content seeding must not overwrite operator-authored questions" [V prompt.md:1002].
- **AI-assisted drafting.** Done by the operator outside the product, into the same spreadsheet; the product itself calls no generative model, at run time or in the admin. Rows carry `source = AI_ASSISTED`. They pass through exactly the same checklist, preview-solve gate and listening check as hand-written rows.
- **Where AI drafting helps most:** plausible misspellings for spelling distractors, near-neighbour word sets for phonics, alt text, demonstration wording, first drafts of topic word lists.
- **Where it must not be trusted:** answer keys (a person works every answer), pronunciation (a person listens to every clip), curriculum claims, and British spelling. Typical faults to look for: a distractor that is a real word or a homophone, American spellings, more than one defensible answer.

### 11.5 Rough effort [U]

Fixed phonics or spelling row, including preview-solve: 3–5 minutes. Clip, including render, listen and approve: about a minute, longer for problem sounds. Template row, including bounds review and sample: 20–30 minutes. The threshold bank (about 240 records and 200 clips) is therefore in the region of 20–25 hours of operator time, spread over phases D to G. Treat that as an order of magnitude.

---

## 12. Invalid-content recovery

### 12.1 Fixed points

[V prompt.md:556] "When a critical content error is discovered, the admin must be able to prevent future selection. Existing-run handling must be deliberate and preserve progress; do not silently replace a saved activity or charge it as a failed answer. Claude should distinguish ordinary version retirement from exceptional invalid-content recovery."

### 12.2 Two different operations

| | Retirement (ordinary) | Withdrawal (exceptional) |
|---|---|---|
| When | The item is fine but no longer wanted: superseded by a better version, dull, replaced | The item is **wrong**: wrong answer key, two right answers, a clip that says the wrong sound, a misleading picture |
| Future selection | Removed from the bank | Removed from the bank |
| Runs that already pinned it | **Unaffected.** The activity is presented, attempted, rewarded and counted exactly as before. | **The slot is voided and compensated** (12.4). The activity is never presented again. |
| Version record and clips | Kept | Kept (for audit) |
| Reversible | No, but a new version can be published | No |
| Needs | One click | A written reason, and a confirmation screen that shows the effect on bank thresholds |

### 12.3 Options for runs that already hold the faulty activity

| Option | Verdict |
|---|---|
| A. Leave it, as for retirement | Rejected. Children keep being marked wrong for right answers. |
| B. Swap in another activity quietly | Rejected. Forbidden by the spec. |
| C. Void the slot, no reward | Honest and simple, but the child loses a reward opportunity because of our mistake, and affected runs no longer have the same reward opportunity as others. |
| **D. Void the slot and grant its reward once** | **Recommended.** |
| E. Openly re-pin the slot to the corrected version, with a notice, resetting attempts | The child gets a real activity, but it changes a pinned pack (new definition, new clips, offline readiness lost), needs attempt-reset rules and extra states, and for a slot with recorded attempts is still "replacing a saved activity". Not worth it for an event that touches at most one slot per run. |
| F. Let the child skip it | Rejected. It pushes an operator error onto a five-year-old, and a skip is a lost reward. |

### 12.4 Recommended behaviour: void, grant once, say so, count nothing

This answers the spine's pending question on reward treatment.

| Slot state when the withdrawal reaches the run | What happens |
|---|---|
| `LOCKED` (interval not reached yet) | Nothing yet. When its interval arrives the slot becomes `VOIDED` instead of `OPEN`, its reward is granted, and the child sees the message below and continues. |
| `OPEN` with 0, 1 or 2 attempts | → `VOIDED`. Recorded attempts are kept for audit and ignored. Reward granted. No summary change. |
| `FAILED`, run still in progress | → `VOIDED`. Reward granted as compensation. Summary corrected: `failed − 1`, `completed − 1`. |
| `SUCCEEDED` | Unchanged. The reward was already granted and the reward marker prevents a second grant. No claw-back. |
| `DECLINED` (meteor) | Unchanged. |
| Any slot of a finished run | No reward is relevant. If it was `FAILED` on the withdrawn version and the slot record still exists, the summary is corrected in the same way. |

- **Reward:** exactly the slot's normal reward (credits, or the meteor power), granted through the same `(runId, slotId)` reward marker as a success, so it can never be granted twice.
- **Summary:** a voided slot is neither a success nor a failure.
- **Message to the child:** "This one had a mistake, so we took it away. You still get your reward." If the correction lands after the fact (for example after offline play): "An activity you did had a mistake. We've given you its reward."
- **Nothing is replaced.** The corrected item, if there is one, is published as the next version and enters the bank for *future* selections only.

Mechanics, for the state and API sections to refine:

1. Withdrawing writes, in one transaction: status `WITHDRAWN` on the version, removal of its bank entries, an audit record, and an entry on a small "withdrawals" list.
2. **Every path that reads or changes a slot checks the pinned version.** An attempt submitted against a withdrawn version is not judged; the effect of that operation is void-and-grant, returned as `CONTENT_WITHDRAWN` with the updated run. Opening an interval whose slot is withdrawn voids it in the same operation that would have opened it. This keeps the run's revision order coherent, because the change happens inside the run's own operation path.
3. **Offline play is covered by the same rule.** A browser that is offline still holds the faulty activity in its pack and may present it. When its queued attempts arrive, rule 2 applies: they are not counted, the slot is voided and the reward granted once, whatever the browser decided locally.
4. **Already-failed slots are found per player, lazily:** on the player's next dashboard or run load, the server compares the withdrawals list with a marker on the profile and, for each new entry, queries that player's own slot records and applies the table above. No table scan and no extra index are needed. Slot records of finished runs that have already been garbage-collected cannot be corrected; that limit should be documented.
5. The pack endpoint reports the slot as voided so a connected browser stops presenting it.

### 12.5 Operator runbook

1. Withdraw the version and write the reason. The confirmation screen warns if this drops any band below its threshold — in which case new runs for that band are honestly blocked until the bank is topped up.
2. If it can be fixed: "copy to draft", correct it, review, pass the preview-solve gate, publish as the next version.
3. If the fault is in a clip: withdraw the speech version; the admin lists every published activity that uses it and requires each to be retired or withdrawn in the same action.
4. Check the bank-status view.
5. Record what went wrong in the decision log, and add a line to the review checklist if the fault was of a new kind.

---

## 13. Cross-checks, open decisions and what is not verified

### 13.1 Guard-rails against the explicit exclusions

| Exclusion in the spec | How this design respects it |
|---|---|
| No performance-adaptive difficulty or remedial paths [V prompt.md:165] | Selection uses only age band, seed and bank. Results are never read to choose content. No difficulty field exists. |
| No penalties for wrong answers [V prompt.md:167, 451] | An activity can only add a reward or add nothing. |
| No timers [V prompt.md:503] | No time field in any schema; no timing-dependent input; nothing auto-advances. |
| No parent accounts or difficulty overrides [V prompt.md:163] | The band comes from date of birth only; there is no setting. |
| No live, unreviewed AI questions [V prompt.md:173] | Children only ever see published versions; templates are deterministic code with bounded domains; AI is a drafting aid outside the product. |
| No browser speech synthesis [V prompt.md:171] | Audio is only approved clips from the speech service; a missing clip blocks the activity instead of falling back. |
| No sibling comparison or rankings [V prompt.md:155] | The progress screen shows only the child's own counts. |
| No gameplay tutorial [V prompt.md:161, 275] | Demonstrations are about curriculum concepts, are skippable and are attached to activities, not to game controls. |

### 13.2 Acceptance-criteria trace for the learning design

| Criterion | Design element | A check that would demonstrate it |
|---|---|---|
| AC-06 | Band from date of birth at creation; pinned slots | Create a run at band 6; change the date of birth so the band is 7; the old run is unchanged and a new run draws band-7 content |
| AC-13 | Same slot plan and ruleset rewards for every band; a run is created only if every slot is filled | Compare the reward lists of runs at 5, 6 and 7 |
| AC-15 | One `N` slot per interval; separate `M` slots; nothing timed | Leave an activity open for ten minutes and play its audio ten times: attempts unchanged |
| AC-16 | Attempt definition (4.2) | Three incorrect answers → no credits, and Ready still works |
| AC-17 | Attempts and presentation order live on the slot | Two incorrect, refresh: same question, same option order, "tried" marks, one try left |
| AC-18 | Attempt IDs; duplicate-answer rule; summary updated in the resolving transaction | Send the same attempt twice; send the same wrong answer under a new ID |
| AC-19 | Play sends identifiers to the speech service | Network trace shows the call; the bundle contains no use of the browser speech-synthesis API |
| AC-20 | Identifier-only request with a strict schema | A request carrying text, SSML or a `speechId` is rejected |
| AC-21 | Review record bound to the audio hash; tier policy; publish gate | An activity that references an unapproved clip cannot be published |
| AC-22 | "What never consumes an attempt" (4.2) | Make the speech call fail, press Try again: attempts and credits unchanged |
| AC-23 | Immutable versions; slots keep `activityId@version` and their clips | Publish version 2 of a pinned activity; the run still shows version 1 with its audio |
| AC-34 | Finite endless buffer (7.7) | Go offline in endless and use up the buffer: the run pauses with a clear message |
| AC-41 | Mouse and keyboard flow for every type; on-screen keypad for typed answers | Complete one activity of each type with the keyboard only, then with the mouse only |

### 13.3 Decisions for the owner

| # | Decision | My recommendation |
|---|---|---|
| D-1 | May clips be used beyond phonics stimuli — for dictating spelling words and for a small set of read-aloud instruction stems? | Yes. Same approved pipeline, about 75 extra clips, and it makes age-5 prompts usable by non-readers. |
| D-2 | Is "Show me" still available after an incorrect attempt? | Yes: child-initiated, static, identical for all. |
| D-3 | What happens on the eighth birthday (no bank for age 8)? | Accept for version one and document it; revisit before the first child approaches 8. The only legitimate fix is curated content with `maxAge = 8`. |
| D-4 | Show the correct answer after the activity resolves? | Yes (4.3). |
| D-5 | Do meteor activities count in the learning summary? | Yes. |
| D-6 | Endless when a subject's bank is used up: fall back to another subject, or deliberately start a second cycle? | Fall back; never repeat within a run. |
| D-7 | Typed *word* answers at age 5? | No; tiles instead. Typed numbers are fine. |
| D-8 | At least four options on choice activities, together with "a repeated wrong answer is free"? | Adopt both together. |

### 13.4 Notes for the spine and for other section owners

1. Resolve the pending reward treatment for voided slots as "void and grant once" (section 12).
2. Under "a template is an activity", the `TPL#` entity is not needed.
3. The slot record gains `resolved` (template snapshot), `presentation` (pinned option and tile order), `intro` and `clips`.
4. `CONTENT_UNAVAILABLE` should carry a reason: `AGE_OUT_OF_RANGE` or `BANK_NOT_READY`.
5. A bank entry should carry `authoringMode` and the template domain size, so eligibility is computed from bank entries alone.
6. Speech: variant names include `bin-…`; a batch fetch for pack preparation; approval promotes the previewed bytes.
7. Withdrawal needs a small "withdrawals" list item and a per-player "applied" marker.
8. Eligibility thresholds are server configuration, shown on the bank-status view.
9. Art inventory: add the activity pictures of section 11.1, all text-free with alt text. Graphemes and words shown to early readers need a clear typeface with a single-storey "a" and "g" [U — not researched today].
10. The economy should be viable with zero learning rewards [V prompt.md:451]. For modelling, note that a pure guesser succeeds on a four-option activity three times in four, and cannot guess a typed answer.

### 13.5 What I could not verify

| Item | Effect | How to close it |
|---|---|---|
| How isolated phonemes sound on Polly's en-GB neural voices | Decides tier B and C policy and the shape of the age-5 phonics bank | The Milestone 0 listening matrix (6.4) |
| The MP3 bit rate Polly produces | Pack byte estimates in 7.10 | Measure a rendered clip in Milestone 0 |
| The exact grapheme order of individual validated phonics programmes | None on the design; supports the conservative pitch | Check the programme used by the family's school, if useful |
| Relative-age effect within a school year (2.3 item 4) | A softener only | Not needed |
| Research support for showing the correct answer (4.3) | The decision rests on the other four reasons | Not needed |
| Rule for 29 February birthdays | An edge case in age derivation | Pick a rule and test it |
| Definition, clip, picture and effort estimates (7.10, 11.1, 11.5) | Planning numbers only | Re-measure after phase C |
| Key stage 1 content of the revised national curriculum | Future re-mapping | Watch GOV.UK; first teaching is September 2028 [V] |
| Wording of the national curriculum bullets in 1.4 and 1.5 | They were returned by a page-extraction tool, sometimes in fragments, and I rejoined them. The PDF-based material (EYFS goals, Appendix 1, Letters and Sounds, the reading framework) was read directly. | Copy the exact sentence from GOV.UK when a content record quotes it |

