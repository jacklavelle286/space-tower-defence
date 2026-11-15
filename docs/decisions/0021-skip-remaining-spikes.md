# 0021. Skip the DynamoDB and browser-audio spikes
Status: Accepted · Date: 2026-11-15

Context: [Phase 6](../build-phases.md#phase-6--dynamodb-and-browser-audio-spikes-spike-tooling-removed) planned two more
throwaway spikes, each run by hand by the owner: M0-13 (capture real `TransactWriteItems` cancellations as fixtures and compare
moto) and M0-12 (browser audio storage, offline playback and the `sha256` source; ADR-0015). The auth spike
([ADR-0012](0012-auth-spike.md)) answered the main risk. On 2026-11-15 the owner asked to "just get it built"
**[CONFIRMED by owner, 2026-11-15]**.

Decision: M0-12 and M0-13 are not run. Phase 6 shrinks to deleting the spike tooling (`spike.yml`, `spikes/`) and adding gate
G-5's first rules (`scripts/check_invariants.py`). Each question is answered where its code is written:

| Question | Answered in |
|---|---|
| `CancellationReasons` per failure (session fence, revision, slot status) and their order | Phase 16 (G7 create-run) and Phase 17 (G5 ops): DynamoDB Local integration tests in CI (G-13, service container); moto locally |
| `ReturnValuesOnConditionCheckFailure`, nested-map `SET` after `planets = {}` (U-039), reserved words (U-038), LSI limit (U-040) | Phase 17, the same tests (U-040 by reading the limits page) |
| The `sha256` source: `HeadObject` with `ChecksumMode=ENABLED`, or the hash stored as metadata (U-036) | Phase 19, `tts` and its tests, checked on the real audio bucket |
| IndexedDB storage, `navigator.storage.persist()`, quota errors, Safari `play()` after an awaited fetch (U-035), the family's browsers (U-037) | Phase 22, the audio module, opened by the owner in each browser |

Alternatives: run both spikes as planned (two more owner-run sessions and a destroy workflow kept longer, for answers the real
code needs to prove anyway); run only the DynamoDB spike (its fixtures are the most useful, but DynamoDB Local in CI gives
repeatable evidence without a laptop write).

Consequences: Phase 7's data-access helper and router are written against the documented response shapes and moto, not captured
fixtures; `api/tests/fixtures/ddb/` starts in Phase 16 (shapes recorded by the G7 `ddblocal` tests). DynamoDB Local's and moto's
cancellation shapes may differ from the real service (new register row U-060; the real-table check is Phase 63). ADR-0015 is written in Phase 22, not Phase 6. Phase 6's local
write (`capture.py`) never happens. Risk accepted by the owner: a wrong assumption is found later, in the phase that relies on it.

Evidence: owner instruction 2026-11-15; [register](unverified.md) rows U-035 to U-040 re-phased, U-060 added; [build-phases.md](../build-phases.md)
Phase 6 and Phase 7 updated.
