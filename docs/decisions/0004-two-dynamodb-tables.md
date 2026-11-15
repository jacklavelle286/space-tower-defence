# 0004. Two DynamoDB tables, no GSI, almost no TTL
Status: Accepted · Date: 2026-11-14

Context: Player data (profiles, runs, slots, summaries, sessions) and operator content (activities, speech definitions, versions)
have different owners, writers and restore needs. The spec asks for access patterns before table choice.
See [spine S1](../plan/00-spine.md#s1-system-shape), [spine S8](../plan/00-spine.md#s8-dynamodb-proposal) and
[F §12](../plan/F-state-and-data.md#12-dynamodb-design).

Decision:
- Two tables, on-demand, with deletion protection, PITR and `prevent_destroy`:
  - `game`: player-owned items under `U#<sub>`, plus one system partition `SYS#SIGNUPS`.
  - `content`: operator-owned activities and speech.
- No GSI or LSI on either table.
- No TTL, except to tidy the `SYS#SIGNUPS` sign-up counter.

Alternatives:
- Single table: loses table-level IAM blast radius and independent restore; nothing queries across the two.
- GSI by subject or age: a few hundred activity headers are read whole and filtered in code; a GSI adds eventual consistency
  where read-after-write matters.
- TTL on sessions or other items: never rely on TTL timing.

Consequences:
- Easier: `admin-api` never gets `game`, `player-api` only reads `content`, `tts` only `GetItem`s `game`.
- Easier: `game` can be restored alone, because content versions are never deleted, so every pin still resolves.
- Harder: lists are sorted and filtered in handler code; growth must be bounded by rule (≤ 50 kept terminal runs, RUN ≤ ~8 KB).
- Revisit when the activity header partition exceeds a few thousand items or run creation latency becomes noticeable.

Evidence: [B §B5.3](../plan/B-scope-and-decisions.md#b53-data-and-storage) D-T1 to D-T4;
[F §12.1](../plan/F-state-and-data.md#121-tables-and-why-two);
[F §12.7](../plan/F-state-and-data.md#127-why-no-gsi-either-table).
