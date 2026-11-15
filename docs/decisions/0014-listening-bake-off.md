# 0014. Listening bake-off: phoneme engine, per-sound verdicts, SSML templates
Status: Proposed (results pending owner listening) · Date: 2026-11-15

Context: Phonemes and letter names use `tts_phoneme_engine` (default `neural`) because AWS documentation contradicts itself on
`<phoneme>` in the generative engine ([ADR-0009](0009-speech-render-path-and-voice.md), U-048). Which isolated sounds Polly says
acceptably is a prediction (U-049, [D §D9.2](../plan/D-ux-and-content-operations.md#d92-risk-tiers)). Phase 19 hard-codes the
templates and the engine rule, so the M0 bake-off ([D §D9.1](../plan/D-ux-and-content-operations.md#d91-milestone-0-listening-spike-before-any-phonics-authoring), M0-11) settles both first.

Decision (proposed; the parts marked *pending* are filled in after listening):
- Canonical input and clip key, frozen for Phase 19: SHA-256 (lower-case hex) of the sorted-key, compact, UTF-8 JSON of
  `{keySchema 1, provider "polly", engine, voiceId, languageCode "en-GB", textType "ssml", text, outputFormat "mp3",
  sampleRate "24000", lexicons [], generation 1}`. `text` is NFC with whitespace runs collapsed, done when a draft is saved;
  the key hashes exactly the string sent. Object key flat, `tts/v1/<key>.mp3` ([H §H.4.6](../plan/H-infrastructure-and-delivery.md#h46-dynamodb_table-called-twice-and-private_bucket-called-twice)):
  the player route knows only the pinned clipKey and `tts` cannot read content, so the key alone must give the object.
  Reference code [spikes/polly-listening/canonical.py](../../spikes/polly-listening/canonical.py); vectors
  [contracts/fixtures/clipkey/vectors.json](../../contracts/fixtures/clipkey/vectors.json), which `api/shared/clipkey.py` must pass.
- SSML templates, frozen for Phase 19: wrapper `<speak><break time="150ms"/>BODY<break time="250ms"/></speak>`; bodies
  `PH.`, `<prosody rate="70%">PH</prosody>.`, `<prosody rate="130%">PH</prosody>.` (small schwa: `ph="b@"`), plain `TEXT`,
  `<prosody rate="90%">TEXT</prosody>`, where PH is `<phoneme alphabet="x-sampa" ph="…">grapheme</phoneme>`. *Pending:* which
  body each sound uses.
- `tts_phoneme_engine`: *pending* (`neural` unless generative passes for phonemes and letter names; if `generative`, Phase 19
  changes [prod.tfvars.json](../../infrastructure/envs/prod.tfvars.json) and widens the generative SSML allow-list in G R16).
- Amy suits every speech kind: *pending*. Per-sound verdicts: *pending*, in
  [content/listening-verdicts.json](../../content/listening-verdicts.json) (G-14 reads `sounds.<id>.verdict`; missing, `pending`
  or `word-only` refuses a PHONEME definition).
- Listening: *pending*: who (roles, no names), devices (laptop speakers, headphones), and the child's shortlist session.

Alternatives:
- The full set (47 sounds, 26 letter names) now: listening fatigue; D9.1's minimum (24 items) answers the engine question first.
- Fallback voices (Emma, Brian, Arthur) for every item: only where Amy fails on both engines (D9.1); `render.py --voice`.
- `say-as characters` for letter names: neural switches to the standard engine ([sources/06](../plan/sources/06-polly-tts.md) §3.3).

Consequences:
- Phase 19 uses these inputs byte for byte, so the clips approved later are the ones heard here, re-rendered through preview,
  with one limit: G R16's generative allow-list has no `<phoneme>`. So a generative PHONEME or LETTER_NAME render is
  previewable only if `tts_phoneme_engine` becomes `generative` and the list is widened, and a WORD, INSTRUCTION or
  DICTATION body using `<phoneme>` (the `word-chom` main variant) is refused on `tts_engine` (generative) whatever is
  chosen here. *Pending owner:* widen the list for those kinds, or author pseudo-words as plain text (the `word-chom`
  `plain` variant is rendered to judge that).
- Sounds judged `word-only` are taught inside words only, or wait for a human recording (the owner's fallback).

Evidence: render run 2026-11-15, `spikes/polly-listening/render.py`, Amy, eu-west-2: 24 items, 41 SSML variants, 82 renders on
`generative` and `neural`, **82 succeeded, 0 refused**. Second run 2026-11-15 after review, adding the D9.1 step 2 forms
(bare, slower, faster, and small schwa for each medium/high-risk consonant) and `word-chom` as plain text: 24 items,
68 variants, 136 renders, **136 succeeded, 0 refused** (54 new, 82 from the cache).
So the generative engine accepts `<phoneme>` and `<prosody>` around a
one-sound fragment without error [VERIFIED by the run]; whether it *honours* them is for the ear (U-048 stays open until then).
Byte-identical MP3s (same sha256) [VERIFIED], for the ear to explain: `i` (`I`) and `ee` (`i`) on both engines; `g`
main, slow and fast on neural (the rate had no effect); `sh` main and `shh` on neural.
`describe-voices` (en-GB, eu-west-2): Amy and Brian offer generative and neural, Emma neural, Arthur neural only [VERIFIED].
