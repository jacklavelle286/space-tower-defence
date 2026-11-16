# 0030. Gate H1: speech contract, templates, and starter rules until an age is ready
Status: Proposed · Date: 2026-11-16

Context: Gate H1 builds Phases 40–42: the speech lifecycle, templates (C25) and selection with real thresholds (C24). Two facts
shaped it:
- **The bank is shallow.** The live bank is the starter pack: 85 FIXED activities once the 21 phonics clips are approved, mostly
  one per topic and mostly `BOTH` (ADR-0027, ADR-0028). It meets none of the C24.7 thresholds, so switching them on as written
  would refuse every new game with `BANK_NOT_READY`.
- **The panel has limits.** It cannot show a question made of several pictures, and the plain-text rule refuses `<` and `>`.

Decision:
- **Speech (Phase 40).**
  - Approve (R21) must name the `clipKey` the operator played, and is refused with `clip_mismatch` otherwise. Approve stays
    disabled until that clip has played to the end.
  - The verdict rule (ADR-0028: refuse only `word-only`) also runs at create (R18) and save (R20).
  - A `PHONEME` speech ID must start with `phoneme-` (rule `phoneme_prefix`).
  - New speech: choose the kind and type the word, sound, letter or sentence. The ID follows the existing conventions. R18 fills
    the first draft from the body sent, or from the bake-off form for that ID.
  - The speech list has search and filters.
- **Templates (Phase 41).**
  - `api/shared/generators/` holds 17 pure version-1 kinds. Snapshot files per `(kind, version)` are never edited, so a change of
    behaviour is a new version.
  - Publish checks every instance with the same checks as a FIXED activity. More than 5,000 instances is refused with
    `domain_too_large`, and so is listing more than 50,000 combinations. Domains are never sampled.
  - A template may carry only an instruction clip, and `audioRequirement: REQUIRED` is refused.
  - At run creation, a template slot is turned into one concrete question, chosen from the run's seed and the slot, and pinned so
    a reload shows the same question.
  - PATTERN_NEXT, EQUAL_GROUPS, COMPARE_FILL and non-dice COUNT_OBJECTS are deferred (`not_supported_yet`).
  - For now templates are seed files. An admin form for authoring them is a follow-up.
- **Selection (Phase 42).**
  - `PLAN_CONFIG` holds the C24.7 values **[PROPOSAL]**. An age is *eligible* when every group meets its threshold, 5 or more topics
    per subject hold 2 or more units, the maths template totals are met, and the selector can fill a full campaign without the
    subject fallback.
  - The live configuration adds `starter_until_eligible`. An age that is not yet eligible plays under the starter rules
    (thresholds of 1, subject fallback on) instead of being refused. Each age moves to the plan rules on its own once eligible.
  - Bank status (R30) and the selector use one counting function, `group_units`. R30 reports READY, STARTER or BLOCKED per age,
    with what is missing. It judges the released wave sets, so admin-api gains read-only `s3:GetObject` on `game-data/*`.
  - `ALGORITHM_VERSION` stays 1 **[ASSUMPTION]**: a bank with no templates plans byte for byte as before.

Alternatives:
- Switch the C24.7 thresholds on now (rejected: every new game would be refused today).
- Sample large template domains (rejected: C25.3 requires every instance to be checked).

Consequences:
- **C24.4 rule 5 and C24.8 relaxed.** Until an age is eligible, its runs may use the subject fallback, as in Milestone 1, so a
  departure from C24.4 rule 5 and C24.8 is in place. Before `starter_until_eligible` is switched off, `GET /api/planets` must run the
  same eligibility check.
- **Release together.** admin-api, player-api and the admin web must be released together, because of the new R21 `clipKey`, the
  R30 fields and the S3 read.
- **Content still needed** to reach READY, from the committed pack. Each age needs about 20 more maths, 28–32 more phonics and
  22–24 more spelling activities, at least 5 topics with 2 or more activities per subject, and 500 normal and 50 meteor
  maths-template questions. This is Gate I's work.
- **Amended by reference:** G R18, R21 and R30, and C25.5 (now uses `totals`). ADR-0028's counts are superseded: the pack is 85
  activities, and its 21 phonics items have 20 speech drafts for the owner to approve.

Evidence: Gate H1 workflow review (12 findings fixed); `api/tests/unit/test_generators.py`, `test_selection_eligibility.py`,
`test_selection_bank_status.py`, `test_template_runs.py`; snapshot files in `api/tests/snapshots/generators/`.
