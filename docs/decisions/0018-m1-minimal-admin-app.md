# 0018. The M1 clip goes through a minimal admin app on admin.aliens.jackgl.com
Status: Accepted · Date: 2026-11-15

Context: M1's one clip must take the real preview → approve path ([D §D9](../plan/D-ux-and-content-operations.md#d9-phonics-preview-review-and-the-quality-gate),
spine S5.2), and the one activity must be published through the real gate. The operator app client's callback URLs are on
the admin hostname, so a CLI or `localhost` route would need a second client or a weaker auth flow. Choice J-3 in
[J, M1](../plan/J-execution-backlog.md#m1--thin-vertical-slice-one-planet-two-waves-one-activity-with-play-cloud-save).

Decision: M1 ships the first slice of the M3 admin app on `admin.aliens.jackgl.com`: operator sign-in (TOTP, group
`admin`), a Speech page (Preview / Play / Approve) and an Activity page (Validate / Publish for seeded drafts), backed by
`admin-api` (R17–R27; R28–R30 still 501). The drafts arrive through `scripts/seed_content.py` (dry run by default,
create-only). So the admin alias record moved from M3 to M1 (done in Phase 4). Sign-in is hand-written PKCE code, not
Amplify ([ADR-0023](0023-admin-sign-in-without-amplify.md)).

Alternatives: approving the clip from a CLI or a local page (needs another app client or a weaker flow); waiting for M3
(M1 would then play an unreviewed clip, which the spec forbids).

Consequences: these pages are kept and grown in M3 (Phases 35–40), not thrown away. The admin bundle must stay free of
Phaser (lint rule and `no-phaser.test.ts`). The approved speech version records the same `clipKey` as the preview.

Evidence: **[VERIFIED]** the admin hostname passes the release smoke checks from `20261115T0955Z-0d9918d` on
([docs/releases/](../releases/)). **[VERIFIED]** in code and tests (Phase 20): `api/tests/unit/test_admin_api.py`,
`api/tests/unit/test_seed_content.py`, `web/admin/src/*.test.ts`. **[VERIFIED]** read-only on 2026-11-15: the content table
holds 0 items, so the seed and the approval have not happened on production yet. **[UNVERIFIED]** until the owner, after
the Gate D release, runs the seed and then on `admin.aliens.jackgl.com` previews, plays and approves `phoneme-sh` and
validates and publishes `ph-0102`; check: the approved version shows the same `clipKey` as the preview, and running the
seed a second time reports "skipped, exists".
