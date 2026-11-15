# 0009. One speech render path; Polly generative en-GB Amy
Status: Accepted · Date: 2026-11-14

Context: Children aged 5–7 must hear exactly the audio an adult reviewed. The spec's proposed flow synthesises on a cache miss at play
time (`prompt.md:577`), which could put unreviewed audio in front of a child. Every online Play must still reach the TTS service
(`prompt.md:587`, AC-19). Spine [S5.2](../plan/00-spine.md#s52-activities-templates-speech) and
[S1](../plan/00-spine.md#s1-system-shape); detail in [E §E.4](../plan/E-architecture.md#e4-the-dedicated-tts-service).

Decision:
- One render path. Clip key = SHA-256 of the canonical synthesis input (text/SSML, locale, voice, engine, format, generation number);
  objects under `tts/v1/`, written with `If-None-Match: *` and never overwritten. A clip is synthesised once ever.
- Only the operator's preview (`tts`) calls Polly. Approval (`admin-api`) binds the key of the bytes already heard, their `sha256` and
  the render date. Player `POST /api/speech` never synthesises; a missing clip is `503 SPEECH_UNAVAILABLE` and an alarm (D-12).
- Voice (O-1): Polly generative engine, en-GB, voice Amy, set by Terraform variables `tts_voice_id` (`Amy`), `tts_engine`
  (`generative`) and `tts_phoneme_engine` (`neural`). Phonemes and letter names use `tts_phoneme_engine`, because AWS documentation
  contradicts itself on `<phoneme>` support in generative; the M0 listening bake-off decides (ADR-0014). A variable change affects
  new previews only. The voice/engine allow-list is in code, as IAM has no Polly voice or engine condition keys. Human recordings are
  the fallback for a sound that fails the listening test.
- Play (O-2): the browser stores bytes once per `clipKey`. If the pinned clip is stored, it plays immediately while
  `POST /api/speech` runs concurrently; otherwise the browser waits, downloads, checks `sha256`, stores and plays. Offline uses local
  bytes only.

Alternatives:
- Synthesise on a child's cache miss (`prompt.md:577`): unreviewed audio could reach a child (D-12, N-1).
- Amazon Nova Sonic: conversational speech-to-speech that writes its own reply, no SSML, not in eu-west-2
  ([sources/11-voice-engine.md](../plan/sources/11-voice-engine.md)).
- Neural for everything: the owner chose the newest engine for the best voice (S-01).
- Version-numbered clip keys: content addressing gives cache identity and reuse without overwrites (S-02).
- Wait for the response on every Play: the child would wait for a sound the device already holds (S-04, N-11).

Consequences:
- Bytes the operator heard are byte-for-byte what children hear; no silent re-voicing.
- `tts` needs prefix-scoped S3 access and no `content` read; speech is resolved from the slot's pinned clips map.
- Speech definitions carry `kind`, `provider`, `engine` and `voiceId`; a `PHONEME` with a `word-only` verdict is refused.
- Which isolated sounds ship, and the final `tts_phoneme_engine`, are pending the M0 bake-off (owner listening sessions).

Evidence: [E §E.4.1a](../plan/E-architecture.md#e41a-voice-and-engine-configuration);
[B6.1 O-1, O-2](../plan/B-scope-and-decisions.md#b61-decisions-you-took-in-chat-on-2026-11-14-confirmed-by-owner-2026-11-14);
[B5.6](../plan/B-scope-and-decisions.md#b56-speech); [sources/06-polly-tts.md](../plan/sources/06-polly-tts.md).
