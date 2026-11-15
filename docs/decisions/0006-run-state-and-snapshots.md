# 0006. Run state as status, stage and phase, with one snapshot
Status: Accepted · Date: 2026-11-14

Context: The spec suggests ten combined run states and requires that leaving or crashing mid-wave loses exactly the current wave
(`prompt.md:663-673`, AC-24..26). The run item needs a state model that both reducers can share and a save model that never has to
write during combat. Spine [S3](../plan/00-spine.md#s3-state-machines-proposal) and
[S4](../plan/00-spine.md#s4-snapshot-and-checkpoint-semantics-proposal); detail in
[F §3](../plan/F-state-and-data.md#3-run-state-machine) and [F §6](../plan/F-state-and-data.md#6-checkpoint-semantics).

Decision:
- A run is described by three fields: `status` (`IN_PROGRESS` | `DEFEATED` | `ABANDONED` | `COMPLETED`; the last three are terminal),
  `stage` (`AUTHORED` | `ENDLESS`) and, while in progress, `phase` (`ACTIVITY` | `METEOR` | `BUILD` | `IN_WAVE` | `COMPLETION_OFFER`).
  The spec's state names map onto these fields (table in spine S3.1).
- Each run holds exactly one `snapshot` `{credits, placements, colony, powers}`. Between waves it is the build state; in `IN_WAVE` it is
  the wave-start snapshot written by `START_WAVE`. `DEFEAT`, `ABANDON` and `FINISH_RUN` remove it.
- Nothing is persisted during combat, locally or in the cloud. Save-and-exit mid-wave and resume write nothing; a wave restarts from
  its start snapshot.
- Rule for the game design: no timer or cooldown crosses a wave boundary, and wave randomness derives from `(run seed, wave number)`.

Alternatives:
- One combined state enum (the spec's ten states): more combined states for the same transitions; the spec allows a simpler form
  (`prompt.md:681`, [B4 N-2](../plan/B-scope-and-decisions.md#b4-where-this-plan-narrows-or-reinterprets-the-spec)).
- Separate preparation and wave-start snapshots: one snapshot is enough for save-and-exit mid-wave and resume to write nothing (R-02).
- Snapshot carrying cooldown and RNG state: the wave-boundary rule keeps the snapshot small and resume deterministic (R-03).
- Checkpoints during a wave: the spec requires the current wave to restart from its start (`prompt.md:663-673`).

Consequences:
- Resume is a read only, in every phase ([F §6.6](../plan/F-state-and-data.md#66-resume-per-persisted-phase)).
- What is lost on each event is fixed and explainable ([F §6.5](../plan/F-state-and-data.md#65-exactly-what-is-lost-by-event)).
- The game design must keep the wave-boundary rule; if it cannot, the snapshot gains fields and the spine is amended by a new ADR.
- Plausibility bounds can compare each op against one stored snapshot (ADR-0005).

Evidence: [B5.4 R-01..R-03](../plan/B-scope-and-decisions.md#b54-run-state-saving-and-concurrency);
[F §3.5 phase × op matrix](../plan/F-state-and-data.md#35-full-phase--op-matrix); fixtures for every matrix cell are due in M2 (M2-06).
