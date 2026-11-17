# 0037. The game-data publisher: admin game data without a release
Status: Proposed · Date: 2026-11-17

Context: ADR-0032 makes the level designer publish from the admin portal (Gate M, LD6). Until now game data came only from a
release ([spine S5.1](../plan/00-spine.md#s51-pins-and-game-data), [B D-T10](../plan/B-scope-and-decisions.md), ADR-0010), every
release overwrote `current.json`, and no Lambda called another (ADR-0003). Bounds must stay server-built, because player-api trusts them
(spine S6, ADR-0005). Scope: [scope-level-designer.md §3.1](../plan/scope-level-designer.md) and
[scope-asset-kinds-and-makers.md §3.0](../plan/scope-asset-kinds-and-makers.md).

Decision:
- **Two functions.** `game-data-publish` (Python) does every read and write and reuses the Python DynamoDB, audit, picture and
  bank-status (R30) code. `game-data-check` (Node 24, one rolldown bundle of game-core) runs the JavaScript rules: merge, parse,
  `planetProblems`, the two blocking bot checks, `buildBounds`. It has no AWS access, so each rule exists once
  [PROPOSAL; the scope had one Node function, which would have needed R30 ported to JavaScript].
- **Writers.** Only the publisher's role and the release's CI role may write `game-data/*`: a bucket-policy Deny. The publisher may
  PutObject on `campaign/`, `bounds/`, `current.json` and `versions.json` only, and never delete. Admin-api may invoke the publisher
  (LD7); the publisher may invoke the checker. Both have reserved concurrency 2.
- **Order.** Freeze → draft at revision → STALE_SOURCE → check with bots → pictures → bank → allocate `<planet>-a<n>` → stamp →
  `versions.json` preview → create-only files → (live) published, then `current.json` with If-Match → V#, GDPUBLISH and AUDIT rows.
  A retry of the same revision replays. Publish runs asynchronously; quick actions run synchronously.
- **current.json.** The publisher owns it. A release writes it only when absent, or with `reseed_current` (recorded in the
  manifest); a rollback never does.
- **States** per (version, wave set) in `versions.json`: preview (tester accounts only), published, retired (resume only),
  invalid (End only, recorded as ABANDONED, never a loss). Anything not listed is published.
- **Backdrops** are served as the approved PNG under a 1 MiB cap. WebP conversion is deferred [PROPOSAL: it needs a second served
  URL and a player change; revisit on the first measured Background].

Alternatives: one Node function (R30 and the DynamoDB helpers rewritten in JavaScript); the browser builds bounds (player-api
would trust operator-supplied numbers); a pull request per publish (no portal-only path, which ADR-0032 asked for).

Consequences:
- **Amends** spine S5.1 and D-T10: game data also comes from the publisher. ADR-0010: a release no longer moves
  `current.json`. ADR-0003: two Lambda-to-Lambda calls. C13: as ADR-0032.
- **G-8 does not see admin game data:** it is never in git. The freeze must set `game_data_publish_frozen` (G-8 checks
  it), and Gate L's backup and restore must cover the admin versions.
- A rollback release can no longer reuse a build from before LD6 (seven Lambda keys).
- The first publish measures the checker's Lambda time against the 300 s timeout [UNVERIFIED].

Evidence: web/game-data-check tests (bounds parity with build-bounds.ts); api tests test_gd_publish.py and test_versions.py;
terraform tests publisher.tftest.hcl; read-only plan 18 add, 4 change, 0 destroy (2026-11-17).
