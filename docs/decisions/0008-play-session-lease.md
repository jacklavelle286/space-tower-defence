# 0008. Account-wide play-session lease with a fencing generation
Status: Accepted · Date: 2026-11-14

Context: The spec requires one accepted account-wide game, a second device blocked while the first is valid, deliberate recovery
after a crash, and a generation token (`prompt.md:725-741`). A lease alone depends on clocks, and a sleeping or offline laptop still
believes it holds one. Spine [S3.4](../plan/00-spine.md#s34-play-session-account-wide-lease-with-fencing-token); detail in
[F §5](../plan/F-state-and-data.md#5-play-session-state-machine-account-wide-lease-with-fencing-token).

Decision:
- One `SESSION` item per account, never deleted, with `generation` (only increases), `sessionId`, `leaseExpiresAt`, `released`,
  `deviceLabel` and `runId` (display only).
- `PUT /api/session` claims or renews; `DELETE /api/session` releases. `generation` goes up only when a different tenure begins
  (another browser, a takeover, a reset). A failed renew never falls back to a claim.
- The fence: every op transaction checks `sessionId = :s AND generation = :g`, and nothing else. Clocks only decide when another
  browser may claim; correctness never depends on them.
- Each queued op stores the generation current when it was queued and is sent with it; a batch never mixes generations.
- A lease that lapsed without release needs an explicit "Play here instead?" (`takeover: true`); the same rule applies to
  `POST /api/runs`. One playing tab per browser profile via the Web Lock `scd-play`.
- Lease 180 s, renewed every 60 s only while the page is visible and recently used (timings are an assumption, tuned in playtest).

Alternatives:
- Per-run locks: the requirement is one accepted game per account, not per run (R-08).
- `runId` in the fence: caused a false "continued somewhere else" when a child moved from an offline run to another run
  ([F §5.4](../plan/F-state-and-data.md#54-the-fence-and-why-runid-is-not-in-it)).
- Lease time alone, or TTL expiry: correctness would depend on clocks or TTL timing (N-4).
- Silent takeover: a crashed device may hold unsynced progress (R-10).
- Allow a second tab and rely on the fence: two tabs would race the same queue (R-11).

Consequences:
- An offline browser cannot be stopped, only fenced: the guarantee is one **accepted** writer (`prompt.md:741`).
- Stale ops fail the fence and go to the divergence procedure, never a silent merge
  ([F §5.5](../plan/F-state-and-data.md#55-generation-stamping-why-each-op-stores-its-generation)).
- From Milestone 1 the server needs the item, claim/renew/release and the fence; the client must stamp generations from day one.
- Every restore cut-over of the `game` table bumps every generation.

Evidence: [B5.4 R-08..R-11](../plan/B-scope-and-decisions.md#b54-run-state-saving-and-concurrency);
[G §7](../plan/G-api-contracts.md#7-session-lease--r13-put-apisession-r14-delete-apisession);
[F §11.3 offline laptop scenario](../plan/F-state-and-data.md#113-offline-laptop-a-vs-online-laptop-b-same-account-ac-28-ac-29-ac-32).
