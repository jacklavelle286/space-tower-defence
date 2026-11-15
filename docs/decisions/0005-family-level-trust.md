# 0005. Family-level trust with per-op plausibility bounds
Status: Accepted · Date: 2026-11-14

Context: Combat runs in the browser and answers are checked locally when offline, so the server cannot prove a battle happened.
The spec asks for family-level trust, not anti-cheat. The server still has to protect accounts, attempts and rewards.
See [spine S2](../plan/00-spine.md#s2-trust-model-confirmed-family-level-trust-mechanisms-proposal),
[spine S6](../plan/00-spine.md#s6-plausibility-bounds-proposal-per-op-against-the-stored-snapshot) and
[E §E.10](../plan/E-architecture.md#e10-family-level-trust-model).

Decision:
- The browser simulates combat. The server owns identity, ownership, accepted run state, recorded attempts, reward accounting
  and permanent progress.
- Every `game` key comes from the token `sub`; no request field names an owner.
- The server derives badges, unlocks, slot rewards and summary keys; never from payloads.
- Each op is checked against the stored snapshot for plausibility (credits, per-wave bounty ceiling, health, powers, placements).
  A violation rejects that op with `CHECKPOINT_OUT_OF_BOUNDS`.
- Accepted tampering gains are stated: a modified client can report maximum bounty and full health, answer from pack data and
  drop wrong attempts before sync, all within its own account. There is no leaderboard.
- Logs are allow-list only ([spine S2](../plan/00-spine.md#s2-trust-model-confirmed-family-level-trust-mechanisms-proposal)):
  never raw events, bodies, `Authorization`, presigned URLs, answers, nicknames or date of birth.

Alternatives:
- Server-side combat simulation or elaborate anti-cheat: excluded by the spec (`prompt.md:759`).
- Deny-list log redaction instead of an allow-list: easier to leak date of birth, answers or nicknames.

Consequences:
- Easier: no game rules run on the server; Python reads numbers from a bounds file built from TypeScript.
- Harder: nobody should read the bounds as anti-cheat; they are anti-nonsense, not anti-cheat.
- Must be true: a modified client cannot touch another account, skip a phase, receive a reward twice, record a fourth attempt
  or exceed per-wave income ceilings.

Evidence: [B §B5.2](../plan/B-scope-and-decisions.md#b52-identity-and-privacy) I-10, I-11;
[E §E.10.2](../plan/E-architecture.md#e102-accepted-tampering-gains);
[B §B5.3](../plan/B-scope-and-decisions.md#b53-data-and-storage) D-T11.
