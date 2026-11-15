# 0007. One write path: ordered op batches through a shared pure reducer
Status: Accepted · Date: 2026-11-14

Context: The browser must keep playing offline and later send what happened; networks lose responses, and duplicate delivery,
double-clicks and reconnect batches must produce one logical effect (`prompt.md:689`). Browser and server must agree on the effect
of every action. Spine [S7](../plan/00-spine.md#s7-operation-log-revisions-idempotency-proposal); detail in
[F §8](../plan/F-state-and-data.md#8-attempt-and-reward-idempotency) and
[G §5](../plan/G-api-contracts.md#5-the-ops-batch--post-apirunsrunidops-r11).

Decision:
- Every queueable run change is an op sent to `POST /api/runs/{runId}/ops`: an ordered batch of 1–25 ops, at most 64 KB,
  each op `{opId, expectedRevision, type, payload}`. `CREATE_RUN` (`POST /api/runs`) and `CHOOSE_ENDLESS`
  (`POST /api/runs/{runId}/endless`, R12, same envelope with exactly one op;
  [G §6](../plan/G-api-contracts.md#6-post-apirunsrunidendless-r12-choose_endless--online-only)) are online only and never queued.
- The run's `revision` goes up by one per applied op; `expectedRevision` must match or the op is `REJECTED STALE_REVISION`.
- Idempotency: the run keeps its last 32 `{opId, revision}` in `recentOps` (attempts also keep `attemptId` on the slot). A resend
  returns `ALREADY_APPLIED` with the original logical result and writes nothing. This check runs first.
- Ops are created only by a pure reducer: TypeScript in `game-core`, mirrored in Python, both run against one set of shared JSON
  fixtures in `contracts/`. A refused action creates no op, so a server `REJECTED` always means divergence and is never retried.
- Answers are canonicalised once, in TypeScript (`web/shared`). Published versions store canonical answers; both judges compare by
  exact equality; Python checks only the shape.

Alternatives:
- Separate REST endpoints per action: two write paths (online and offline) instead of one (R-04).
- Server-side idempotency table: the bounded `recentOps` list on the run is enough, given one batch in flight and ≤ 25 ops per batch
  (R-05, [F §8.4](../plan/F-state-and-data.md#84-why-32-recent-opids-are-enough)).
- A second answer normaliser in Python: two normalisers could disagree
  ([C §C20.1](../plan/C-game-and-learning-design.md#c201-canonical-answers-one-normaliser-exact-equality)).
- A server rule against identical repeat answers: the client-only guard covers it; the server counts every attempt it receives (D-8).

Consequences:
- Every rule change touches both reducers and the shared fixtures in the same commit; a disagreement fails a test, not a save.
- The client must keep one batch in flight per account and commit the local trim before sending the next.
- Rejections need one handling path (the divergence procedure, spine S7.5) and an alarm on `result=REJECTED`.

Evidence: [B5.4 R-04..R-06](../plan/B-scope-and-decisions.md#b54-run-state-saving-and-concurrency);
[F §8.1 per-op processing order](../plan/F-state-and-data.md#81-per-op-processing-order-server); M1 fixtures run by Vitest and pytest
(J tasks M1-13 and M1-14).
