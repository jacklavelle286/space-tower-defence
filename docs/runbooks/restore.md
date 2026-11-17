# Runbook: backups and restores of the game data

What is backed up, how to check it, and the four restore procedures (A–D) from
[H §H.13](../plan/H-infrastructure-and-delivery.md#h13-daily-backup-and-restore-runbook-spine-s84). First draft (Phase 33,
M2-11); the drill that proves it is Phase 70 (AC-39).

The restore calls in A–C are **operator data procedures, not deployments**: you run them from your machine with the
`space-tower-defence` profile. Each one is a local AWS write, so before its first use it needs a row in
[Local AWS writes that are not deployments](../build-phases.md#local-aws-writes-that-are-not-deployments) and your approval
at a gate. Every Terraform change still goes through a release. The one exception is the state edit in B.3, which is
break-glass and gets an ADR.

## What exists

| What | Where | Label |
|---|---|---|
| Daily backup | AWS Backup plan `space-tower-defence-prod-daily`: one snapshot per table per day at 02:00 UTC, each kept 7 days, in vault `space-tower-defence-prod-vault` | **[PROPOSAL]** [modules/backup](../../infrastructure/modules/backup/main.tf) |
| What it covers | Selection `space-tower-defence-prod-tables`, by table ARN: `space-tower-defence-prod-game` and `space-tower-defence-prod-content`. Gate G-5 fails a release that drops either | **[PROPOSAL]** [main/backup.tf](../../infrastructure/main/backup.tf), [check_invariants.py](../../scripts/check_invariants.py) |
| Point-in-time recovery | PITR on both tables: any second from about 5 minutes ago back 35 days. The right tool for undoing a bad write | **[VERIFIED]** [dynamodb_table module](../../infrastructure/modules/dynamodb_table/main.tf) |
| Failure alarm | `space-tower-defence-prod-backup-job-failed` (`AWS/Backup NumberOfBackupJobsFailed`) to the alerts topic. Its dimensions are **[UNVERIFIED]**: see "After the first backup" | **[PROPOSAL]** |
| Audio clips | The audio bucket, versioned, keys never reused. Not in AWS Backup (procedure D) | **[VERIFIED]** H.4.6 |

**Neither backup is wave-level recovery.** A restore loses everything since its restore point, which can be more than
one wave (`prompt.md:1026`). **[CONFIRMED]**

## After the first backup (read-only checks)

Two days after the release that creates the plan, check and record the result in the Phase 33 row of the
[gate log](../build-phases.md#gate-log) (at the latest at Phase 34's gate):

```sh
P="--profile space-tower-defence --region eu-west-2"
aws backup list-recovery-points-by-backup-vault $P --backup-vault-name space-tower-defence-prod-vault \
  --query 'RecoveryPoints[].[ResourceArn,CreationDate,Status]' --output table   # two per day, both tables, COMPLETED
aws backup list-backup-jobs $P --by-backup-vault-name space-tower-defence-prod-vault --by-state FAILED   # empty
aws cloudwatch list-metrics $P --namespace AWS/Backup --metric-name NumberOfBackupJobsFailed
```

The last command shows the dimensions AWS publishes the metric with. If they are not exactly `BackupVaultName` and
`ResourceType`, the alarm can never fire: tell Claude, and the module's `dimensions` are changed in the next release.
A first job that fails with an access error means the backup role's trust (`backup.amazonaws.com`) is wrong: the
module's other open point (plan risk M2-11).

## A. `game` table: selective recovery (the default)

For one account's data, or a bad batch of writes.

1. Choose the source: a PITR timestamp (a bad write in the last 35 days) or a vault recovery point.
2. Restore to a scratch table `space-tower-defence-prod-game-restore-<yyyymmdd>`:
   - PITR: `aws dynamodb restore-table-to-point-in-time --source-table-name space-tower-defence-prod-game
     --target-table-name <scratch> --restore-date-time <ISO time> $P`
   - Vault: `aws backup start-restore-job --recovery-point-arn <arn> --iam-role-arn
     arn:aws:iam::263185198757:role/space-tower-defence-prod-backup --metadata targetTableName=<scratch> $P`
3. Verify: the table is ACTIVE; its item count is explained by the restore time; the canary profile and run read back
   field by field (`get-item`).
4. Copy the chosen `U#<sub>` items back with `scripts/restore_copy.py` (**to create before the Phase 70 drill**; dry run
   by default, `--apply` to write). It uses conditional writes and **never lowers `SESSION.generation`**: the SESSION
   item it writes carries the live generation + 1, so a browser still holding the old lease is fenced and cannot write
   over the restored data ([spine S3.4](../plan/00-spine.md#s34-play-session-account-wide-lease-with-fencing-token)).
5. Delete the scratch table once satisfied (restored tables have deletion protection off).

## B. `game` table: whole-table cut-over

Only if the live table is lost or damaged beyond selective repair. Writes between the restore point and the cut-over are
lost; offline devices sync their queued ops later and may diverge.

1. Stop writers: ask the family to stop playing and sign out. There is no maintenance mode in v1; closing sign-up
   (`player_signup_closed`) only stops new accounts.
2. Restore to a new name as in A.2, and verify as in A.3.
3. **Break-glass, you, locally:** `terraform state rm 'module.game_table.aws_dynamodb_table.this'` in
   `infrastructure/main`. This edits state only and changes no AWS resource; the old table stays, untracked and
   deletion-protected, for forensics. Record it as an ADR.
4. Commit `table_name_overrides = { game = "<restored name>" }` and an `import` block for the restored table in
   `infrastructure/main/imports.tf` (removed again afterwards).
5. **Before the release:** `scripts/restore_copy.py --bump-generations` (to create; dry run by default) sets every
   restored `SESSION.generation` to the old table's value + 1, read from the old table, or `ADD generation 1000` where
   the old value cannot be read. **This is the fencing step:** a restored generation could otherwise equal one a device
   already used, and that device's old queue would be accepted. After the bump every pre-restore branch fails the fence
   and goes through the divergence dialog ([F §12.9](../plan/F-state-and-data.md#129-backup-and-restore--data-aspects-operations-in-h),
   spine S8.4).
6. Normal release. The plan shows the import and in-place updates: tags, PITR, deletion protection, TTL, the functions'
   table name, **the backup selection** (local.table_arns follows the override) and the alarm dimensions. Review, approve
   `prod-apply`.
7. Smoke checks, then tell the family they can play again. Record the event in [docs/releases/](../releases/).

## C. `content` table

Never rolled back behind `game` ([spine S1](../plan/00-spine.md#s1-system-shape)): runs pin activity versions, so the
content table only ever gets missing items back.

1. Restore to a scratch table as in A.2.
2. Copy back only the missing or damaged items, with create-only conditional writes. Versions are immutable, so a copy
   never overwrites a published version.
3. Verify that every `activityId@version` pinned by an IN_PROGRESS run's slots resolves in the live table, with
   `scripts/verify_pins.py` (to create before the drill; read-only).

## D. Audio clips

The audio bucket is versioned and clip keys are never reused. Restore a deleted clip from its previous version
(`aws s3api list-object-versions`, then copy that version back). Re-synthesising does not reliably give the same bytes,
and clients check a downloaded clip against the `sha256` on its approved speech version, so a restored object must be the
exact approved bytes. Reviewed clips are never expired.

## Drill log (Phase 70, then quarterly)

| Date | Table | Recovery point | Minutes to ACTIVE | Item counts match | Canary read back | Pins verified (content) | By |
|---|---|---|---|---|---|---|---|
| | | | | | | | |
