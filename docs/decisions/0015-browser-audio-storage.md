# 0015. Browser audio storage and the Play rule in code
Status: Accepted · Date: 2026-11-15

Context: The Play rule is fixed by the owner (O-2, 2026-11-14; [spine S5.2](../plan/00-spine.md#s52-activities-templates-speech),
[E §E.9](../plan/E-architecture.md#e9-audio-caching-and-playback)). The browser-audio spike (M0-12) that was to settle storage,
persistence, quota and autoplay was skipped ([ADR-0021](0021-skip-remaining-spikes.md)), so Phase 22 (M1-22) decides them in code.
The `sha256` source was settled in Phase 19: tts returns the hex SHA-256 from the S3 checksum or, failing that, object metadata.

Decision:
- Clip bytes live in the `audio` store of the per-account IndexedDB database `scd-<sub>` (version 1: stores `audio`, keyed by
  `clipKey`, and `meta`), one record `{clipKey, sha256, contentType, byteLength, bytes}` per clip, raw IndexedDB API, no library.
  When IndexedDB is missing or refused (private window), a memory store is used for that page load.
- A downloaded clip is kept only after its length, `Content-Type` and `sha256` match the R15 response; a mismatch is logged and
  never stored or played. An S3 403 gets one fresh URL. The URL is never stored, logged or put in React state.
- Stored clip: playback starts first, then `POST /api/speech` is sent (one in flight per slot and variant: rapid replays do not
  multiply calls). Not stored: Loading, then request, download, verify, store, play. A different `clipKey` is logged, stored and
  used from the next Play. Offline: stored bytes only. No failure touches attempts.
- One shared `HTMLAudioElement` per page, fed from a Blob URL that is revoked on end, stop and replacement; primed synchronously
  in the click handler; `NotAllowedError` returns the button to Play (the next press plays at once).
- `navigator.storage.persist()` is not requested yet: clips are re-fetchable, and the op log (Phase 57) is what needs it.

Alternatives: the `idb` wrapper (one more dependency for four calls); Cache Storage (needs a `Request` per clip and offers no
gain over IndexedDB here); Web Audio playback (only if Safari refuses `play()` after an await, which is still unverified).

Consequences: Play is immediate after the first fetch, across reloads, while every online Play still reaches the service (AC-19).
Phase 57 raises the database version to add the op log. Still to check on real browsers (Phase 23, I.2.9): Safari `play()` after
an awaited fetch, private-window behaviour, quota errors.

Evidence: `web/shared/src/audio/clipPlayer.test.ts` (order: `start` before `request`; sha256, size, 403, mismatch, offline,
NotAllowedError), `clipStore.test.ts` (fake-indexeddb, survives a reopen), `web/player/src/run/ActivityPanel.test.tsx`
(refresh keeps attempts; Play after refresh sounds before the response).
