# 0028. In-app listening is the verdict; the starter pack is auto-published
Status: Proposed · Date: 2026-11-16

Context:
- **Phonemes.** Approving a `PHONEME` speech definition needed a `publishable` verdict for its sound in
  `content/listening-verdicts.json`, which records the bake-off ([ADR-0014](0014-listening-bake-off.md); G-14; spine S5.2). The
  check failed closed: a sound that was missing or pending was refused with `phoneme_no_verdict`, so the owner could not approve any
  new sound in the app. Approve already requires the operator to preview and listen to that exact clip (D §D9.3), and the owner is
  the only listener.
- **Content.** The owner asked for many pre-built activities now, auto-published rather than previewed one by one
  **[CONFIRMED by owner, 2026-11-16]**. They were told that this skips their own preview-solve of each activity.

Decision:
- **Listening verdict.** The operator's in-app Approve is the listening verdict. `phoneme_refusal` refuses only a sound whose
  recorded verdict is `word-only` (rule `phoneme_word_only`). A missing or pending verdict, and a speech ID without the `phoneme-`
  prefix, are allowed. `scripts/check_speech_defs.py` applies the same rule to repository seeds.
- **Starter pack.** 64 activities in `content/seed/activities/`: 36 maths, 4 phonics and 24 spelling (`ma-1001…`, `ph-1008`,
  `ph-1009`, `ph-1012`, `sp-1001…`). 63 are `BOTH` and 1 is `NORMAL`. The only audio is the approved `phoneme-sh`. Twenty-one
  more phonics items wait in `content/seed-held/phonics-needs-clip/`. Every phonics activity needs a clip (C22.2 rule 6,
  **[CONFIRMED]**), so they ship once their word clips are approved in the app. `scripts/seed_content.py --apply --publish`
  creates and publishes the pack, using the same checks and item builders as admin-api publish (R27).
- **Seeded review record.** The version's review records `seeded: true`, every checklist key and the note "Starter pack,
  auto-published by seed_content.py (ADR-0028)".
- **Checks instead of the owner's preview.** Each activity passes the full publish validation. An independent reviewer worked
  every answer out and looked at every picture, and found 18 problems across 6 batches; all were fixed or answered.
- **Running the seed.** The seed is create-only and never overwrites. It is a local write the owner runs, after the release that
  makes `BOTH` selectable.

Alternatives:
- Keep the bake-off file as the only verdict source (rejected: every new sound would need a commit and a release).
- Seed drafts only, for the owner to preview and publish (offered and declined).
- Wait for templates (H1) (declined: the owner wants content now).

Consequences:
- G-14's fail-closed property becomes "refuse what was judged word-only".
- A sound's quality now rests on one in-app listen, recorded on the version (`review.listenedBy`, `listenedAt`).
- A child may meet a seeded activity no grown-up has solved in the app. Withdraw (R29) removes a bad one, and the owner should
  play through the pack early.
- Amends ADR-0014's "Consequences" (verdict file as gate) and C22.3's per-activity preview-solve, for seeded activities only, by
  reference.

Evidence: owner messages 2026-11-16; the reviewer findings and fixes recorded in the commit; seed tests.
