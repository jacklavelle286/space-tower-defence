# 0025. Speech takes: the draft's take is the clip key's generation
Status: Accepted · Date: 2026-11-15

Context: Polly's generative engine is not deterministic. The same canonical input for `phoneme-sh` (clip key `14cf642b…`)
gave the owner's bake-off MP3 (6956 bytes, sha256 `9016a3dc…`) and, rendered again by production preview, a different MP3
(7100 bytes, sha256 `71e4a084…`) that says "esh" **[VERIFIED 2026-11-15, production: same key, different bytes]**. Clips are
content-addressed and create-only (`PutObject If-None-Match: *`, [ADR-0009](0009-speech-render-path-and-voice.md)), so a bad
take holds its key for ever and the operator could re-roll only by editing the SSML.

Decision: a speech draft carries a `take`, and the take is the canonical input's `generation`
([ADR-0009](0009-speech-render-path-and-voice.md) already hashes a generation number):
- `take` is an integer 1..50 (`speechTake` in `contracts/limits.json`); absent = 1, for drafts and versions saved before takes
  existed. Take 1 is generation 1, so every existing key and the Phase 18 vectors are unchanged.
- R16 preview and R20 save accept an optional `take`; R20 without `take` keeps the draft's take. Out of range or not an
  integer: `400 VALIDATION_FAILED`, field `take`, rule `type`, `minimum` or `maximum`.
- The admin's "Try another take" saves the same body with `take + 1` (R20), then previews (R16).
- Approval (R21) recomputes the key from the **saved** draft's take; a preview of another take counts as `not_previewed`. The
  version records its `take`.
- The bake-off ([ADR-0014](0014-listening-bake-off.md)) chooses the SSML form and the engine; the admin preview chooses the
  take. The approved bytes, not the bake-off files, are what children hear.

Alternatives: overwrite the clip on re-preview (rejected: breaks create-only storage and C7, approved bytes could change);
a random nonce per preview (rejected: approval could not recompute the key from the saved draft); edit the SSML to get a new
key (rejected: changes what is said, and the operator has no neutral edit to make).

Consequences: G R16, R19, R20, R21 and the limits table gain `take`; `shared/clipkey.py` validates it; the admin Speech page
shows the take and a "Try another take" button. Abandoned takes stay in the audio bucket (at most 50 per input). A
determinism check of the generative engine across regions or voices is not done (**[UNVERIFIED]**; it does not change this
decision).

Evidence: production preview 2026-11-15 (object sizes and sha256 above); `contracts/fixtures/clipkey/vectors.json` (generation
1, unchanged); unit tests in `api/tests/unit/test_clipkey.py`, `test_tts.py`, `test_admin_api.py` and
`web/admin/src/pages/SpeechPage.test.tsx`.
