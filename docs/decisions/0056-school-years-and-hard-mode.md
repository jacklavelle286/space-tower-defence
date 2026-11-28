# 0056. School years and Hard mode instead of ages
Status: Proposed · Date: 2026-11-28

Context: questions were chosen by age, from the child's date of birth, and only ages 5 to 7 (EYFS to National Curriculum
Year 2) had questions. The owner, 2026-11-28: "make a module for year 4s and years 2s ... when you choose a game mode you
can do easy / hard mode and hard mode does the year above in terms of the curriculum" [CONFIRMED by owner 2026-11-28].
Chosen in chat: a School year setting on each profile (not the age from the date of birth), Easy or Hard chosen for each
game at Play, grammar and punctuation as the third subject for Years 3 to 5, and new questions drafted with AI in the
admin. The family branch, frozen as the proof of concept on 2026-11-21 (ADR-0045 on `dev`), takes this work; it is
still never merged into `dev`.

Decision: a profile holds `schoolYear` (0 Reception ... 5 Year 5; `contracts/limits.json` `schoolYears`). The question
bands keep their numbers, so no published activity changes: band = school year + 5, so Reception, Year 1 and Year 2 are
bands 5, 6 and 7 (the bands that were ages 5, 6 and 7; their curriculum codes fit), Year 3 is 8, up to Year 6 at 11.
`ageBands` becomes 5 to 11. A new game carries `difficulty` (`EASY`, the default, or `HARD`): Easy plays the school
year's band, Hard the band above; the run pins both. A profile made before this has only a date of birth: its age, when
5 to 7, stays its band until a school year is set, and a PUT that carries a school year removes the stored date of birth.
New profiles are never asked for one. Home shows the school year with Change, and Play asks "How hard?" when there is a
band above. A band with no questions refuses a new game with BANK_NOT_READY, as before; publishing skips empty bands.

Alternatives: keep ages and add 8 to 10 (no way to place a child above or below their age, and a date of birth is
personal data we no longer need); rename the bands to years in the content items (every stored activity and the admin's
saved drafts would change, for no visible gain).

Consequences: the API keeps the field names `ageBand`, `minAge` and `maxAge`; they now hold band numbers, which the
player and the admin show as school years (`web/shared/src/schoolYears.ts`). Years 3 to 6 have no questions until YG2
(topics) and YG3 (drafting) and the owner's drafting (YG4); until then Hard for Year 2, and Year 4 at all, answer
"still being made". The date of birth is no longer collected (a privacy gain); `age` in GET /api/me is null without one.

Evidence: `api/tests/unit/test_school_years.py`; `web/player/src/shell/Home.test.tsx` (YG1 block),
`web/player/src/shell/Shell.test.tsx`, `web/player/e2e/local/keyboard.spec.ts`; admin tests named in build-phases.md YG1.
