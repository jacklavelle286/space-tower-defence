# 0024. Content before game systems; offline play after launch
Status: Accepted · Date: 2026-11-15

Context: [Gate bundles](../build-phases.md#gate-bundles-owner-decision-2026-11-15) ran D → E (game systems) → F (run lifecycle)
→ G, H (admin, speech, selection) → I (content) → J (campaign) → K (offline) → L (polish, launch). Real learning content
arrived only at Gate I, and offline play (AC-30..34, [B §B1.5](../plan/B-scope-and-decisions.md#b15-speech-saves-offline-and-concurrency))
was a launch requirement. On 2026-11-15 the owner chose "move content earlier and push offline after launch"
**[CONFIRMED by owner, 2026-11-15]**.

Decision: the gate order becomes **D → G → H1 → I → E → F → J → L (launch) → K (after launch)**:
- G (35–39) and H1 (40–42: speech lifecycle, templates, selection) go first, because content phases 45–48 depend on
  39, 40, 41 and 42. H2 (43–44: learning summaries, withdrawal) depend on Phase 29, so they join F.
- I (45–48) follows. Phase 49 (spreadsheet import, optional) is done only if the owner asks.
- E, F (+43, 44) and J are unchanged inside.
- L launches without offline. Phase 69 (scoped CI role) and Phase 71 (rollback rehearsal and game-data lock) drop their
  dependencies on 63 and 62. 71 relies on run pinning and per-version bounds (`CONTENT_VERSION_UNSUPPORTED`) instead.
- K (57–63) is built after launch, as its own gate and release.

Alternatives: keep the planned order (content last, with offline at launch); move content before the admin app by seeding every
activity through `scripts/seed_content.py` (rejected: the content phases need the editor's validate and preview-solve, and
selection).

Consequences: the launch is **online only**. AC-30..34 are not met at launch, and B §B3.2's offline column moves to the K
release. While offline, the player keeps the honest `RETRYING` and `AUTH_REQUIRED` states, and a lost connection stops play;
nothing is queued. Phase 73's acceptance pass (P4) excludes AC-30..34, and they are accepted at K. The real-table check of
DynamoDB cancellation shapes (U-060, Phase 63) also moves after launch, so it is covered meanwhile only by DynamoDB Local in CI
(G-13). Phase 47 (phonics) needs the owner to re-judge the pending sounds first (th, ch, ng, a, i, letter name S;
[ADR-0014](0014-listening-bake-off.md)).

Evidence: owner instruction 2026-11-15; dependency rows of Phases 35–74 in [build-phases.md](../build-phases.md).
