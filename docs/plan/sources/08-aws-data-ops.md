# 08 - AWS data, delivery and operations facts

Specialist report for the Space Colony Defence implementation plan. Source material only; not the plan.

- Date checked: **2026-11-14** (every URL below was fetched on this date).
- Web access: **available**. AWS documentation was read from the Markdown variant of each page (same URL with `.md` instead of `.html`); Terraform AWS provider docs from the GitHub tag `v6.73.0` (the version in `infrastructure/bootstrap/.terraform.lock.hcl`, per `00-verified-repo-facts.md` line 29); Terraform CLI docs from `hashicorp/web-unified-docs` (`v1.17.x`, matching the local CLI v1.17.2); GitHub docs from `docs.github.com`.
- No owner name, account ID, repository name or domain name was sent in any external request.
- Labels: **VERIFIED** = read on a fetched page or in a local file (URL or path given). **PROPOSAL** = my design recommendation. **UNVERIFIED** = from memory, not confirmed today.
- Short URL prefixes used below:
  - `DDB/` = `https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/`
  - `DDBAPI/` = `https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/`
  - `BK/` = `https://docs.aws.amazon.com/aws-backup/latest/devguide/`
  - `CF/` = `https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/`
  - `APIGW/` = `https://docs.aws.amazon.com/apigateway/latest/developerguide/`
  - `LAM/` = `https://docs.aws.amazon.com/lambda/latest/dg/`
  - `S3/` = `https://docs.aws.amazon.com/AmazonS3/latest/userguide/`
  - `CW/` = `https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/`
  - `TFP/` = `https://github.com/hashicorp/terraform-provider-aws/blob/v6.73.0/website/docs/` (same content as the Terraform Registry pages for 6.73.0)
  - `TF/` = `https://developer.hashicorp.com/terraform/`
  - `GH/` = `https://docs.github.com/en/`

---

## 0. Six findings that change the plan (read these first)

| # | Finding | Status | Why it matters |
|---|---|---|---|
| 0.1 | **GitHub changed the default OIDC `sub` format.** "Repositories created after July 15, 2026 now use an immutable default subject format that includes both the owner ID and repository ID": `repo:OWNER@OWNER-ID/REPO@REPO-ID:...`. Renames/transfers after that date also switch. | VERIFIED `GH/actions/reference/security/oidc#immutable-subject-claims` and `GH/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws` | The deployed trust policy is `StringLike sub = repo:<owner>/<repo>:*` (`00-verified-repo-facts.md` line 45). The local repo's only commit is dated 2026-11-14 11:57 (VERIFIED: `git log` in the repo), which strongly suggests the GitHub repository was created today. If so, the token's `sub` will be `repo:<owner>@<id>/<repo>@<id>:...`, which **does not match** the existing pattern, and `AssumeRoleWithWebIdentity` will be denied on the very first workflow run. The repository creation date and its OIDC setting are **UNVERIFIED** (I did not query GitHub). See section f.6 for the check and the fix. |
| 0.2 | **Environment "required reviewers" are plan-limited.** "If you are on a GitHub Free, GitHub Pro, or GitHub Team plan, required reviewers are only available for public repositories." | VERIFIED `GH/actions/reference/workflows-and-actions/deployments-and-environments#required-reviewers` | If the repository is private on a personal Free/Pro account, the approval gate the brief asks for ("Review the plan within the established manual production workflow") cannot be a GitHub Environment required-reviewer rule. Repository visibility and plan are **UNVERIFIED**. Section f.5 gives a fallback that needs no paid feature. |
| 0.3 | Terraform's `aws_apigatewayv2_integration.payload_format_version` **defaults to `1.0`**, not 2.0. | VERIFIED `TFP/r/apigatewayv2_integration.html.markdown` | Must be set to `"2.0"` explicitly or the Lambda event shape will not match the handler code. |
| 0.4 | CloudFront **custom error responses are distribution-wide**, not per cache behaviour (`custom_error_response` is a top-level argument of `aws_cloudfront_distribution`). | VERIFIED `TFP/r/cloudfront_distribution.html.markdown` (argument list), `CF/custom-error-pages-procedure.html` | If `/api/*` is routed through the site's distribution, a `403/404 -> /index.html 200` rule would also rewrite genuine API 403/404 responses into HTML with status 200. SPA deep links must then be handled by a CloudFront Function on the default behaviour instead. |
| 0.5 | `actions/upload-artifact` **ignores hidden files by default** (`include-hidden-files` defaults to `false`; hidden = any file or folder starting with `.`). | VERIFIED `https://github.com/actions/upload-artifact` README (current major `v7`) | Archiving the Terraform working directory for a later apply job silently drops `.terraform/` and `.terraform.lock.hcl` unless this is handled. |
| 0.6 | `lifecycle { prevent_destroy = true }` **does not protect a resource whose block is removed from configuration**. | VERIFIED `TF/language/meta-arguments/lifecycle` ("This rule doesn't prevent Terraform from destroying a resource if you remove its configuration") | Use API-level protection as well: DynamoDB `deletion_protection_enabled`, Cognito `deletion_protection = "ACTIVE"`, S3 `force_destroy = false`. |

---

## a. DynamoDB

### a.1 Transactions (`TransactWriteItems`)

| Fact | Status / source |
|---|---|
| Groups **up to 100** actions; actions may target different tables but only in the **same account and Region**. | VERIFIED `DDBAPI/API_TransactWriteItems.html` |
| **No two actions can target the same item** ("you cannot both `ConditionCheck` and `Update` the same item"). Violation cancels the transaction. | VERIFIED same page |
| Aggregate size of the items **cannot exceed 4 MB**; each item still limited to 400 KB. | VERIFIED same page |
| Four action types: `Put`, `Update`, `Delete`, `ConditionCheck`. `ConditionCheck` "applies a condition to an item that is not being modified by the transaction". | VERIFIED same page |
| All-or-nothing. Rejected if any condition fails, an ongoing operation is updating the same item, an item exceeds 400 KB, total exceeds 4 MB, or on user error. | VERIFIED same page |
| `ClientRequestToken` makes the call idempotent. Length 1-36 characters (a UUID fits). **Valid for 10 minutes after the first request that uses it completes**; after that it is treated as a new request. Same token with different parameters inside the window returns `IdempotentParameterMismatchException`. | VERIFIED same page; `DDB/transaction-apis.html` |
| A repeated call with the same token inside the window "return[s] successfully without making any changes". | VERIFIED `DDB/transaction-apis.html` |
| `ReturnValuesOnConditionCheckFailure` (`ALL_OLD` or `NONE`) is available on every action type, including `ConditionCheck`; it returns the existing item when that action's condition fails. | VERIFIED `DDBAPI/API_ConditionCheck.html`, `DDBAPI/API_Put.html` |
| On cancellation, `TransactionCanceledException.CancellationReasons` is an ordered list matching the request order; entries carry `Code` (`ConditionalCheckFailed`, `TransactionConflict`, `ValidationError`, `ThrottlingError`, ... or the literal string `"None"`) and optionally `Item`. | VERIFIED `DDBAPI/API_TransactWriteItems.html`, `DDBAPI/API_CancellationReason.html` |
| Capacity: DynamoDB "performs two underlying reads or writes of every item in the transaction" (prepare + commit), so a transactional write costs 2x; the capacity is consumed **even when the transaction is cancelled**. | VERIFIED `DDB/transaction-apis.html` (Capacity management) |
| Isolation: serialisable between a transaction and single-item `GetItem/PutItem/UpdateItem/DeleteItem`; **read-committed** versus `Query`, `Scan` and `BatchGetItem` as a unit. | VERIFIED `DDB/transaction-apis.html` (isolation table) |
| A plain `PutItem/UpdateItem/DeleteItem` that collides with an in-flight transaction on the same item fails with `TransactionConflictException`; a concurrent transaction fails with `TransactionCanceledException`. | VERIFIED same page |
| Single-item writes (`PutItem`, `UpdateItem`, `DeleteItem`) also accept `ReturnValuesOnConditionCheckFailure = ALL_OLD`; the failed item comes back on `ConditionalCheckFailedException.Item` and "no read capacity units are consumed". | VERIFIED `DDBAPI/API_UpdateItem.html` |

Design consequences (PROPOSAL):

- The 10-minute token is a **transport-retry** safety net only. Offline batches replayed hours or days later need a **persistent idempotency marker**: a `Put` of a marker item with `attribute_not_exists(PK)` inside the same transaction as the effect. The marker is the source of truth; `ClientRequestToken` is optional icing.
- Because an item can appear only once per transaction, a condition on an item that is also being written must be the `ConditionExpression` of that `Update`/`Put`, not a separate `ConditionCheck`. Use `ConditionCheck` only for items that are read-only in that transaction (for example the session lease when a checkpoint write only changes the run item).
- Set `ReturnValuesOnConditionCheckFailure = ALL_OLD` on the marker `Put` and on the lease/run conditions. The cancellation reasons then say **which** condition failed and return the stored item, so the handler can answer "already processed, here is the original result" or "stale generation" without a second read.
- A typical "resolve attempt + grant reward + update summary" transaction touches about 4-6 items; the 100-action and 4 MB limits are far away. Cap an offline reconcile batch so that one request never needs more than one transaction's worth of items, or process the batch as several ordered transactions.

### a.2 Item, key and expression limits

| Fact | Status / source |
|---|---|
| Maximum item size **400 KB**, counting attribute names (UTF-8 length) and values. | VERIFIED `DDB/Constraints.html` |
| Partition key value 1-2048 bytes; sort key value 1-1024 bytes. | VERIFIED same page |
| Nested attributes up to 32 levels. No limit on the number of values in a list, map or set other than the item size. | VERIFIED same page |
| Any expression string max 4 KB; substitution variables max 2 MB total; max 300 operators/functions per expression. | VERIFIED same page |
| 20 GSIs per table by default (adjustable), 5 LSIs (not adjustable). | VERIFIED `DDB/ServiceQuotas.html` |
| Sizes use binary units (1 KB = 1024 bytes). | VERIFIED `DDB/Constraints.html` |

Consequence (PROPOSAL): a run checkpoint (placements on a fixed set of pads, a few counters, the current activity state) is a few KB and must be designed to stay bounded. Endless-mode history must not be appended to the checkpoint item; keep events as separate items or drop them once summarised.

### a.3 Update expressions: sets and counters

| Fact | Status / source |
|---|---|
| `ADD` on a set: "if the attribute is a set, and the value you are adding is also a set, the value is appended to the existing set". If the attribute does not exist, `ADD` creates it. `ADD` supports only number and set types and only top-level use is shown. | VERIFIED `DDB/Expressions.UpdateExpressions.html`, `DDBAPI/API_UpdateItem.html` |
| "Each value within a set must be unique. The order of the values within a set is not preserved." DynamoDB does not support empty sets. | VERIFIED `DDB/HowItWorks.NamingRulesDataTypes.html` |
| Therefore adding a value that is already in a string set leaves the set unchanged, so `ADD badges :one_badge` is idempotent. | VERIFIED by inference from the two rows above (no single sentence in the docs says "no-op"); worth one unit test against DynamoDB Local or the real table. |
| `DELETE` removes elements from a set; removing the last element removes the attribute (no empty sets). | VERIFIED first half `DDB/Expressions.UpdateExpressions.html`; second half UNVERIFIED (follows from "no empty sets"). |
| Atomic counter: `SET n = n + :inc` or `ADD n :inc`. "With an atomic counter, the updates are not idempotent ... An atomic counter would not be appropriate where overcounting or undercounting can't be tolerated ... it is safer to use a conditional update." | VERIFIED `DDB/WorkingWithItems.html#WorkingWithItems.AtomicCounters` |
| `ADD` on a missing number attribute starts from 0. `if_not_exists(path, value)` is available in `SET`. | VERIFIED `DDBAPI/API_UpdateItem.html`, `DDB/Expressions.UpdateExpressions.html` |
| AWS's own note: "In general, we recommend using `SET` rather than `ADD` to ensure idempotent operations." (This is about numbers; set-`ADD` is the idempotent case.) | VERIFIED `DDB/Expressions.UpdateExpressions.html` |
| In one update expression every action is evaluated against the item **as it was before the update**. | VERIFIED same page |
| A nested map attribute cannot be updated if the parent map does not exist (`ValidationException`); initialise empty maps at item creation. | VERIFIED same page |

Consequence (PROPOSAL): badges and "milestones achieved" are string sets updated with `ADD` (safe to repeat). Learning-summary counters (`completed`, `succeeded`, `failed` per subject/topic) are numeric increments and are **only safe inside a transaction that also writes the unique attempt/reward marker**. Create summary items with their maps pre-initialised, or use one item per subject/topic with flat counters to avoid the "parent map missing" error.

### a.4 Read consistency, Query, BatchGetItem

| Fact | Status / source |
|---|---|
| Tables and LSIs support eventually consistent (default) and strongly consistent reads. "Strongly consistent reads from a global secondary index or a DynamoDB stream are not supported." Querying a GSI with `ConsistentRead=true` returns `ValidationException`. | VERIFIED `DDB/HowItWorks.ReadConsistency.html`, `DDBAPI/API_Query.html` |
| GSIs are updated asynchronously: "propagated ... within a fraction of a second, under normal conditions", longer in rare failure cases; applications must tolerate stale GSI results. | VERIFIED `DDB/GSI.html` |
| Eventually consistent reads cost half of strongly consistent reads. | VERIFIED `DDB/HowItWorks.ReadConsistency.html` |
| `Query`: result set limited to **1 MB per call**; paginate with `LastEvaluatedKey`. `Limit` is the number of items **evaluated**, applied before `FilterExpression`. A filter does not reduce consumed capacity. A page can be empty and still have `LastEvaluatedKey`. Results are sorted by sort key; `ScanIndexForward=false` reverses. | VERIFIED `DDBAPI/API_Query.html`, `DDB/Constraints.html` |
| `BatchGetItem`: max **100 items and 16 MB**; more than 100 keys is a `ValidationException`; may return partial results with `UnprocessedKeys` (retry with backoff); eventually consistent by default, `ConsistentRead` settable per table; **no ordering guarantee**; duplicate keys rejected. | VERIFIED `DDBAPI/API_BatchGetItem.html` |
| `BatchWriteItem`: max 25 put/delete requests, 16 MB. | VERIFIED `DDB/Constraints.html` |

Consequence (PROPOSAL): everything the game needs immediately after a write (profile, a run, the lease, "my saved runs") should be reachable from the **base table by the player's partition key** with `ConsistentRead=true`. Reserve GSIs for operator-side listing/filtering of content, where a fraction of a second of staleness is harmless. A 50-activity content pack fits in one `BatchGetItem` (100 keys) or one `Query` on a pack partition, provided the items are well under 1 MB in total per page.

### a.5 Capacity mode

| Fact | Status / source |
|---|---|
| On-demand (`PAY_PER_REQUEST`) bills per read/write request; "on-demand mode is the default and recommended throughput option". | VERIFIED `DDB/on-demand-capacity-mode.html` |
| New on-demand tables can sustain up to 4,000 writes/s and 12,000 reads/s and instantly accommodate up to double the previous peak. Default table quota 40,000 RRU / 40,000 WRU. | VERIFIED same page; `DDB/ServiceQuotas.html` |
| Optional per-table/per-GSI **maximum throughput** for on-demand tables; excess requests are throttled. | VERIFIED `DDB/on-demand-capacity-mode.html` |
| Terraform: `billing_mode` defaults to `PROVISIONED`, so `PAY_PER_REQUEST` must be written; `on_demand_throughput { max_read_request_units, max_write_request_units }`. | VERIFIED `TFP/r/dynamodb_table.html.markdown` |

PROPOSAL: on-demand for every table; consider a modest `on_demand_throughput` cap as a runaway-cost guard on a publicly reachable self-signup application (and add a throttling alarm if a cap is set).

### a.6 TTL

| Fact | Status / source |
|---|---|
| "DynamoDB automatically deletes expired items **within a few days** of their expiration time, without consuming write throughput." | VERIFIED `DDB/TTL.html` |
| Expired-but-not-yet-deleted items "continue to show in read and write operations until they are deleted by the background process"; use filter expressions on reads and condition expressions on writes. They can still be updated, including moving the TTL into the future. | VERIFIED `DDB/TTL.html`, `DDB/ttl-expired-items.html` |
| TTL attribute must be a **Number** holding **Unix epoch seconds**; other types are ignored. An item whose TTL is more than five years in the past is not deleted. | VERIFIED `DDB/TTL.html`, `DDB/time-to-live-ttl-before-you-start.html` |
| Enabling TTL takes about an hour to apply; `UpdateTimeToLive` is not idempotent and a second call within an hour is a `ValidationException`. | VERIFIED `DDB/time-to-live-ttl-how-to.html` |
| TTL deletes appear in Streams as service deletions and are removed from indexes like normal deletes. | VERIFIED `DDB/TTL.html` |
| TTL settings are **not** carried over by a restore (see b.5). | VERIFIED `DDB/PointInTimeRecovery.Tutorial.html`, `DDB/CreateBackup.html` |
| Terraform: `ttl { attribute_name, enabled }`. | VERIFIED `TFP/r/dynamodb_table.html.markdown` |

Consequence: this confirms the brief's rule "Never rely on DynamoDB TTL deletion timing to enforce a live lock or attempt limit" (prompt.md line 693). The lease must carry an explicit `expiresAt` that every claim/renew/save compares with the server clock in a condition expression; TTL is only housekeeping for leases and idempotency markers. PROPOSAL: use a different attribute for TTL (`ttl`, set well after logical expiry) from the logical expiry attribute, so that an item never disappears while it is still logically meaningful.

### a.7 Deletion protection and point-in-time recovery

| Fact | Status / source |
|---|---|
| Deletion protection is **off by default**, "includ[ing] global replicas, and tables restored from backups". When enabled the table "cannot be deleted by anyone" until it is turned off. Settable at `CreateTable` and via `UpdateTable`. | VERIFIED `DDB/WorkingWithTables.Basics.html#WorkingWithTables.Basics.DeletionProtection` |
| Terraform: `deletion_protection_enabled` (default `false`). | VERIFIED `TFP/r/dynamodb_table.html.markdown` |
| PITR: "up to 35 days of recovery points at a **per second granularity**". `RecoveryPeriodInDays` is configurable **1 to 35** (default 35). Shortening it does not reduce the price (priced on table + LSI size). | VERIFIED `DDB/Point-in-time-recovery.html`, `DDB/PointInTimeRecovery_Howitworks.html` |
| Restorable window is `EarliestRestorableDateTime` to `LatestRestorableDateTime`; the latter "is typically five minutes before the current time". | VERIFIED `DDB/PointInTimeRecovery_Howitworks.html` |
| "The point-in-time recovery process always restores to a new table." | VERIFIED same page |
| Disabling and re-enabling PITR resets the earliest restorable time. | VERIFIED `DDB/Point-in-time-recovery.html` |
| Deleting a table that has PITR enabled creates a system backup `<table>$DeletedTableBackup` kept 35 days at no extra cost. | VERIFIED `DDB/PointInTimeRecovery_Howitworks.html` |
| PITR is `DISABLED` by default on a new table. | VERIFIED same page |
| Terraform: `point_in_time_recovery { enabled = true, recovery_period_in_days = N }`; "can take 10 minutes to enable for new tables". | VERIFIED `TFP/r/dynamodb_table.html.markdown` |

---

## b. AWS Backup for DynamoDB

### b.1 Daily rule with 7-day retention

| Fact | Status / source |
|---|---|
| Snapshot retention "can range between 1 day and 100 years"; 7 days is valid. Continuous-backup retention is 1-35 days. | VERIFIED `BK/plan-options-and-configuration.html` |
| Retention is counted from the **creation date, which is the date the backup job started**, not when it finished. | VERIFIED same page |
| Cold storage: a backup moved to cold must stay there at least 90 days, so `DeleteAfterDays` must be at least 90 more than `MoveToColdStorageAfterDays`. **A 7-day retention therefore cannot use cold storage**; leave it out. | VERIFIED `BK/plan-options-and-configuration.html`, `BK/API_Lifecycle.html` |
| Schedule is a cron expression, UTC unless `ScheduleExpressionTimezone` is set; default if omitted is `cron(0 5 ? * * *)`. | VERIFIED `BK/API_BackupRuleInput.html` |
| `StartWindowMinutes`, if set, "must be at least 60 minutes to avoid errors". Console defaults: start within 8 hours, complete within 7 days. | VERIFIED `BK/API_BackupRuleInput.html`, `BK/plan-options-and-configuration.html` |
| "Unlike DynamoDB backups, backups made with AWS Backup are not instantaneous." | VERIFIED `DDB/UsageNotesAWS.html` |
| DynamoDB backups do not consume table throughput; they "do not guarantee causal consistency across items; however, the skew between updates in a backup is usually much less than a second". | VERIFIED `DDB/CreateBackup.html` |
| AWS Backup **continuous** backup (PITR through AWS Backup) is **not** listed for DynamoDB in the feature matrix; DynamoDB's PITR is the native table feature. | VERIFIED `BK/backup-feature-availability.html` (the "Continuous backup and point-in-time restore" column is blank for both DynamoDB rows) |

Note on "seven daily recovery points": one job per day with `delete_after = 7` gives seven restorable points in steady state; because expiry is asynchronous, the vault may briefly show seven or eight (exact deletion timing UNVERIFIED). State the acceptance criterion as "at least seven daily points, none older than about eight days".

### b.2 "Advanced features for DynamoDB backups"

| Fact | Status / source |
|---|---|
| Accounts that had **not created a backup vault before 21 November 2021** have advanced DynamoDB backup **enabled by default**. Backups created by a plan or on demand "automatically opt-in your account". | VERIFIED `BK/advanced-ddb-backup.html` |
| What changes when enabled: backup ARN namespace becomes `arn:aws:backup` (not `arn:aws:dynamodb`); backups are **encrypted with the vault's KMS key**, independently of the table's key; cold tiering, cross-Region and cross-account copy become available; backups inherit the source table's tags; charges appear under "Backup"; such backups can be deleted only through AWS Backup, not the DynamoDB console. | VERIFIED `BK/advanced-ddb-backup.html`, `DDB/UsageNotesAWS.html`, `DDB/backuprestore_HowItWorksAWS.html` |
| Feature matrix, "DynamoDB with AWS Backup advanced features": cross-Region, cross-account, Audit Manager, full management, lifecycle to cold storage, **restore testing**, logically air-gapped vault. Plain "Amazon DynamoDB" row has only Audit Manager and restore testing. | VERIFIED `BK/backup-feature-availability.html` |
| Check: `describe-region-settings` shows `"DynamoDB": true` under both `ResourceTypeOptInPreference` and `ResourceTypeManagementPreference` when advanced features are on. | VERIFIED `BK/advanced-ddb-backup.html` (the owner should run this once; I did not run any AWS command) |
| IAM: the role needs `dynamodb:StartAwsBackupJob` and `dynamodb:RestoreTableFromAwsBackup`; both are in the AWS managed policies below. | VERIFIED `DDB/UsageNotesAWS.html`, `BK/advanced-ddb-backup.html` |
| Terraform: `aws_backup_region_settings` with `resource_type_opt_in_preference` (**required** map of every service) and `resource_type_management_preference`. | VERIFIED `TFP/r/backup_region_settings.html.markdown` |

PROPOSAL: do **not** manage `aws_backup_region_settings` in Terraform at first. It is a Region-wide account setting whose required map covers every service, the new account should already have DynamoDB opted in, and a backup plan opts in automatically. Record a one-off verification step instead. Add the resource later only if the check shows `false`.

### b.3 Vault, role, selection

| Fact | Status / source |
|---|---|
| Vault: `aws_backup_vault` with `name`, optional `kms_key_arn`, `force_destroy` (default `false`), `tags`. | VERIFIED `TFP/r/backup_vault.html.markdown` |
| The role passed to AWS Backup "must also have AWS Backup listed as a trusted entity". The console-created default role is `AWSBackupDefaultServiceRole` with the managed policies `AWSBackupServiceRolePolicyForBackup` and `AWSBackupServiceRolePolicyForRestores`. | VERIFIED `BK/iam-service-roles.html` |
| The trust principal string is `backup.amazonaws.com`. | UNVERIFIED verbatim on the pages I fetched (standard value; confirm when writing the role). |
| Resource assignment: by explicit ARNs/patterns (`Resources`, `NotResources`), by tags (`ListOfTags`), or by `Conditions`. | VERIFIED `BK/assigning-resources.html`, `BK/assigning-resources-json.html` |
| Terraform: `aws_backup_selection` with `name`, `plan_id`, `iam_role_arn`, and `resources` (ARNs) and/or `selection_tag { type = "STRINGEQUALS", key, value }` and/or `condition { string_equals { key, value } }`; `not_resources`. | VERIFIED `TFP/r/backup_selection.html.markdown` |
| Terraform: `aws_backup_plan` with `name` and `rule { rule_name, target_vault_name, schedule, schedule_expression_timezone, start_window, completion_window, lifecycle { delete_after, cold_storage_after }, recovery_point_tags, enable_continuous_backup }`. | VERIFIED `TFP/r/backup_plan.html.markdown` |
| Monitoring: namespace `AWS/Backup`, metrics `NumberOfBackupJobsCompleted`, `NumberOfBackupJobsFailed`, `NumberOfRestoreJobsCompleted`, `NumberOfRestoreJobsFailed`, emitted every 5 minutes. Vault events can also go to SNS (standard topics, same account only) or EventBridge. | VERIFIED `BK/cloudwatch.html`, `BK/backup-notifications.html` |

PROPOSAL:

- One dedicated vault for the project; default (AWS-managed) vault encryption is enough for this scale (the default key behaviour when `kms_key_arn` is omitted is UNVERIFIED; check the console after the first apply).
- A dedicated IAM role created in Terraform (the default service role only exists if the console created it) with the two managed policies.
- Select tables by **explicit ARN list** built from the Terraform table resources. With one to three tables this is deterministic and reviewable in the plan; tag selection is only worth it when tables come and go.
- Rule: one daily job at a quiet hour (for example 03:00 `Europe/London`), `start_window = 60`, `completion_window` a few hours, `lifecycle { delete_after = 7 }`, no cold storage.
- One alarm on `NumberOfBackupJobsFailed >= 1` to the existing notification topic. Separately, a "no successful backup in 36 hours" check would catch a silently missing schedule (PROPOSAL; implement as an alarm on `NumberOfBackupJobsCompleted` with `treat_missing_data = breaching` over a 1-day period, and test it, because the exact dimensions of that metric were not verified).

### b.4 What a restore produces and what it does not restore

| Fact | Status / source |
|---|---|
| A restore always creates a **new table**: "You can only restore the entire table data to a new table from a backup"; "You can't overwrite an existing table during a restore operation." The AWS Backup console and `StartRestoreJob` take a `targetTableName`. | VERIFIED `DDB/CreateBackup.html`, `BK/restoring-dynamodb.html` |
| Restored: table data, GSIs, LSIs, billing mode / provisioned capacity as recorded at backup time, encryption settings (all of which can be overridden at restore time). | VERIFIED `DDB/CreateBackup.html`, `DDB/PointInTimeRecovery.Tutorial.html` |
| **Not restored; "You must manually set up the following on the restored table":** auto scaling policies, IAM policies, CloudWatch metrics and alarms, **tags**, **stream settings**, **TTL settings**, **deletion protection settings**, **PITR settings**. | VERIFIED `DDB/CreateBackup.html` (the PITR page gives the same list without deletion protection: `DDB/PointInTimeRecovery.Tutorial.html`) |
| Encryption on restore: for fully managed (`arn:aws:backup`) recovery points you choose AWS-owned (default), AWS-managed or customer-managed key via `encryptionType` / `kmsMasterKeyArn`. | VERIFIED `BK/restoring-dynamodb.html` |
| Restore metadata keys for DynamoDB: `targetTableName`, `encryptionType`, `kmsMasterKeyArn`, `aws:backup:request-id`. | VERIFIED `BK/restoring-dynamodb.html` |
| Restore duration depends on data size and number of indexes; no fixed time is guaranteed; the source table stays available. Service quota: AWS Backup supports up to 50 concurrent restores totalling 25 TB. | VERIFIED `DDB/PointInTimeRecovery.Tutorial.html`, `DDB/ServiceQuotas.html` |

Consequences (PROPOSAL):

- The restored table has a different name and is unknown to Terraform. The restore procedure must therefore say how production is pointed at recovered data. Two workable routes: (1) restore to `<table>-restore-<date>`, verify, then **copy the needed items back** into the Terraform-managed table with a small script (simplest for a selective recovery, no Terraform change); or (2) full cut-over: make the table name a Terraform variable, `terraform import` the restored table, and re-apply so Terraform re-adds tags, TTL, PITR, deletion protection and alarms. Route 2 needs Lambda functions to read table names from environment variables rather than hard-coding them.
- The restored table is **outside the backup plan** if selection is by ARN list, and has no deletion protection, TTL or PITR until someone sets them. Put this in the runbook as an explicit checklist.
- Because tags are not restored, tag-based IAM or tag-based backup selection would silently miss a restored table.

### b.5 Verifying a restore, and the restore-testing feature

Manual verification (PROPOSAL, built only from verified API behaviour): start a restore job from the latest recovery point to a scratch table name; wait for the job to complete and the table to be `ACTIVE`; confirm the key schema and every GSI exist; compare an item count (a `Scan` with `Select=COUNT` is fine at this size) with the live table and explain any difference by the backup time; read back two or three known items (a seeded canary profile and run are ideal) and compare field by field; then delete the scratch table. Record the elapsed restore time, as AWS suggests documenting restore times for RTO planning (VERIFIED `DDB/CreateBackup.html`).

Restore testing (managed feature):

| Fact | Status / source |
|---|---|
| A restore testing plan runs scheduled restore jobs, measures how long they take, optionally waits for a validation result, then **deletes the restored resource**. DynamoDB is a supported resource type. | VERIFIED `BK/restore-testing.html` |
| For DynamoDB the inferred restore metadata is `deletionProtection = false`, `encryptionType = Default`, `targetTableName` = random name starting `awsbackup-restore-test-`. DynamoDB does not support tag-on-restore, so clean-up is by that name prefix. | VERIFIED `BK/restore-testing-inferred-metadata.html`, `BK/restore-testing.html` |
| Backup plans ignore resources created by restore testing. | VERIFIED `BK/restore-testing.html` |
| Optional validation: an EventBridge rule on the restore job reaching `COMPLETED` triggers your own check (for example a Lambda), which reports with `PutRestoreValidationResult`; a retention window of 1-168 hours keeps the restored table for that check. | VERIFIED `BK/restore-testing-validation.html`, `BK/restore-testing.html` |
| "Restore testing has a cost per restore test", plus the restore itself. | VERIFIED `BK/restore-testing.html` (amounts not checked) |
| Terraform: `aws_backup_restore_testing_plan` (`name` - alphanumeric and underscores only, `schedule_expression`, `schedule_expression_timezone`, `start_window_hours`, `recovery_point_selection { algorithm = LATEST_WITHIN_WINDOW or RANDOM_WITHIN_WINDOW, include_vaults, recovery_point_types = ["SNAPSHOT"], selection_window_days }`) and `aws_backup_restore_testing_selection` (`name`, `restore_testing_plan_name`, `protected_resource_type = "DynamoDB"`, `iam_role_arn`, `protected_resource_arns` or `protected_resource_conditions`, `validation_window_hours`, `restore_metadata_overrides`). | VERIFIED `TFP/r/backup_restore_testing_plan.html.markdown`, `TFP/r/backup_restore_testing_selection.html.markdown` |

PROPOSAL: AC-39 ("a restore procedure is verified") is met by one documented manual restore drill performed and written up before release. A monthly restore testing plan without custom validation is a reasonable later addition (it proves that recovery points are restorable and reports duration); it is not needed for the first release.

### b.6 AWS Backup versus PITR in two sentences

AWS Backup takes **scheduled full snapshots** (here one per day, kept seven days) into a vault with its own lifecycle, encryption and access policy, so the worst-case loss after a disaster is everything since the last daily job. DynamoDB **PITR** is a continuous, per-second change log kept for 1-35 days on the table itself, which lets you restore a new table to any second up to about five minutes ago and is the right tool for undoing a bad deploy or accidental mass write.

PROPOSAL: enable both. The brief requires the daily backup; PITR is one Terraform block, is priced on table size (tiny here), and removes most of the "we lost a day" exposure. Keep the brief's honesty rule: neither gives wave-level recovery.

---

## c. CloudFront, private S3 origins, certificates and cross-account DNS

### c.1 Origin access control and bucket policy

| Fact | Status / source |
|---|---|
| OAC requires a **regular S3 bucket origin**, not a website endpoint. | VERIFIED `CF/private-content-restricting-access-to-s3.html` |
| Recommended signing behaviour is `always` ("Sign requests"), protocol `sigv4`. | VERIFIED same page |
| Bucket policy shape: `Effect: Allow`, `Principal: { Service: cloudfront.amazonaws.com }`, `Action: s3:GetObject`, `Resource: arn:aws:s3:::<bucket>/*`, `Condition: StringEquals { AWS:SourceArn: arn:aws:cloudfront::<account>:distribution/<id> }`. | VERIFIED same page (example policy) |
| With SSE-KMS objects the KMS key policy must also allow the CloudFront service principal for that distribution. (SSE-S3 needs nothing extra.) | VERIFIED same page |
| If the caller lacks `s3:ListBucket`, S3 returns **403** (not 404) for a missing object. With the read-only OAC policy above, a missing key therefore reaches CloudFront as 403. | VERIFIED `https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html` |
| Terraform: `aws_cloudfront_origin_access_control` (`origin_access_control_origin_type = "s3"`, `signing_behavior = "always"`, `signing_protocol = "sigv4"`); the origin block takes `origin_access_control_id`. | VERIFIED `TFP/r/cloudfront_origin_access_control.html.markdown`, `TFP/r/cloudfront_distribution.html.markdown` |

Because the bucket policy references the distribution ARN and the distribution references the bucket, write the policy as a separate `aws_s3_bucket_policy` resource that depends on both (PROPOSAL; there is no true cycle because the origin only needs the bucket's regional domain name).

### c.2 SPA deep links

| Option | How it works | Side-effects |
|---|---|---|
| A. Custom error responses | Map origin 403 (and 404) to `/index.html` with response code 200. | VERIFIED distribution-wide (0.4). Every 403/404 from **any** origin of the distribution is rewritten, including a missing hashed asset (the browser receives HTML with status 200 where it expected JavaScript, which is a confusing failure) and any API routed through the same distribution. Error responses are cached: default error caching TTL is 10 seconds; an S3 origin has a 1-second floor even if 0 is configured (VERIFIED `CF/custom-error-pages-expiration.html`). AWS also recommends keeping error pages in a different location from the main content, which this pattern ignores (VERIFIED `CF/custom-error-pages-procedure.html`). |
| B. CloudFront Function on viewer request | Rewrite the request URI to `/index.html` when the path has no file extension, on the **default behaviour only**. | Runs on every viewer request of that behaviour (small per-invocation charge; amount not checked). Real 403/404 for missing assets stay real. Functions cannot read the body or call the network, and have a size limit of about 10 KB and 2 MB memory (VERIFIED `CF/cloudfront-function-restrictions.html`, `CF/cloudfront-limits.html` - the size figure is truncated in my extract, treat "10 KB" as UNVERIFIED). Maximum two function associations per behaviour (VERIFIED `TFP/r/cloudfront_distribution.html.markdown`). |

Facts that apply to both:

- `default_root_object` returns the object only for the **root URL**; "an end-user request for a subdirectory of your distribution does not return the default root object". It must not start with `/`. (VERIFIED `CF/DefaultRootObject.html`)
- AWS's published example function appends `index.html` to the **same directory** (`/install/` -> `/install/index.html`), which is right for multi-page static sites but **not** for a single-page app; an SPA needs `request.uri = '/index.html'` for extensionless paths. (VERIFIED the example at `CF/example_cloudfront_functions_url_rewrite_single_page_apps_section.html`; the SPA variant is a PROPOSAL.)
- Terraform: `aws_cloudfront_function` (`runtime = "cloudfront-js-2.0"`, `publish = true`), attached with `function_association { event_type = "viewer-request", function_arn }`. (VERIFIED `TFP/r/cloudfront_function.html.markdown`)

PROPOSAL: option B with `default_root_object = "index.html"`. It is the only option that stays correct if `/api/*` shares the distribution, and it gives honest status codes for missing files. If hash-based client routing were used instead, neither option would be needed, but path routing is the normal React choice.

### c.3 Caching: hashed assets versus `index.html`

| Fact | Status / source |
|---|---|
| Managed policy `CachingOptimized` (`658327ea-f89d-4fab-a63d-7e88639e58f6`): min TTL 1 s, default 24 h, max 365 days. Because min TTL is above 0, CloudFront caches for at least that long even if the origin says `no-cache`/`no-store`/`private`. | VERIFIED `CF/using-managed-cache-policies.html` |
| Managed policy `CachingDisabled` (`4135ea2d-6df8-44a3-9df3-4b5a84be39ad`): all TTLs 0. | VERIFIED same page |
| Managed policy `UseOriginCacheControlHeaders`: min 0, default 0, max 365 days. | VERIFIED same page |
| Terraform `aws_s3_object` supports `cache_control` and `content_type`; change detection via `etag = filemd5(...)` or `source_hash`. | VERIFIED `TFP/r/s3_object.html.markdown` |

PROPOSAL (works with one behaviour and `CachingOptimized`):

- Vite-built files whose names contain a content hash (`/assets/*`): upload with `Cache-Control: public, max-age=31536000, immutable`. They are never invalidated; old ones are **kept** so that a tab still running the previous release can lazy-load its chunks, and so a rollback has its files.
- `index.html` (and any un-hashed manifest such as a release/asset manifest): upload with `Cache-Control: no-cache`. With `CachingOptimized` the edge still holds it for the 1-second minimum, then revalidates; browsers always revalidate.
- Release order: upload hashed assets first, upload `index.html` last, then invalidate `/index.html` (one path). This is the "safe entry-point update order" the brief asks for (prompt.md line 996). Uploading with the workflow (`aws s3 sync` or `cp` with explicit headers) rather than `aws_s3_object` keeps hundreds of build files out of Terraform state; that is an ownership decision for the delivery section of the plan.
- Game art and audio packs that are pinned by run version should also live under content-hashed or version-prefixed keys so that old runs keep resolving them.

### c.4 Response headers policy and a CSP outline

| Fact | Status / source |
|---|---|
| A response headers policy can add security headers (`Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`), CORS headers, custom headers and remove headers; each has an "origin override" switch. | VERIFIED `CF/understanding-response-headers-policies.html` |
| "The `Content-Security-Policy` header value is limited to **1783 characters**." | VERIFIED same page |
| Managed `SecurityHeadersPolicy` (`67f7725c-6f97-4210-82d7-5512b31e9d03`) exists but carries no CSP. | VERIFIED `CF/using-managed-response-headers-policies.html` (ID); contents summarised from the page headings, exact header list UNVERIFIED |
| Terraform: `aws_cloudfront_response_headers_policy` with `security_headers_config { content_security_policy { content_security_policy, override }, strict_transport_security { ... }, content_type_options { override }, frame_options { frame_option, override }, referrer_policy { referrer_policy, override } }`; attach with `response_headers_policy_id` on the behaviour. In provider v6 `etag` is computed-only. | VERIFIED `TFP/r/cloudfront_response_headers_policy.html.markdown`, `TFP/guides/version-6-upgrade.html.markdown` |

CSP outline for the player site (PROPOSAL; every directive must be proven with `Content-Security-Policy-Report-Only` during the first playable milestone, because the exact needs of Phaser, the chosen auth library and Vite's output are UNVERIFIED):

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob:;
font-src 'self';
connect-src 'self'
            https://<audio-bucket>.s3.eu-west-2.amazonaws.com
            https://cognito-idp.eu-west-2.amazonaws.com
            [https://<api-id>.execute-api.eu-west-2.amazonaws.com  only if the API is NOT same-origin]
            [https://<prefix>.auth.eu-west-2.amazoncognito.com     only if managed login / token endpoint is used];
worker-src 'self' blob:;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none'
```

Reasoning, with what is and is not verified:

- `media-src blob:` and `img-src blob: data:` cover an `<audio>` element or image created from locally cached bytes via `URL.createObjectURL`. If audio is decoded with the Web Audio API from an `ArrayBuffer`, the `fetch` is governed by `connect-src` and no `media-src` entry is needed for it. (General CSP behaviour; UNVERIFIED today.)
- The presigned S3 host must be in `connect-src`. Its exact form (regional virtual-hosted name versus the legacy global name) depends on how the Lambda's S3 client is configured; pin it to the regional endpoint in the TTS Lambda and confirm in the spike. (UNVERIFIED which host boto3 emits by default.)
- `style-src 'unsafe-inline'` is a pragmatic start for React inline styles; tighten later if nothing needs it. No `'unsafe-eval'` is proposed; whether the chosen Phaser build needs it is UNVERIFIED and is exactly what the report-only phase is for.
- The admin site gets its own policy (it additionally plays preview audio from the same bucket host). Two policies is another reason for two distributions.
- Also set HSTS, `X-Content-Type-Options: nosniff` and `Referrer-Policy: strict-origin-when-cross-origin` (or stricter); `frame-ancestors 'none'` supersedes `X-Frame-Options` in modern browsers but setting both is harmless.

### c.5 One distribution or two?

Verified constraints:

- "Only one certificate can be attached to a CloudFront distribution at a time", and it must be in the same account as the distribution. (VERIFIED `CF/CNAMEs.html`)
- The same alternate domain name cannot exist on two distributions. (VERIFIED `CF/CNAMEs.html`)
- A distribution can carry many alternate names (quota 100) and up to 75 cache behaviours. (VERIFIED `CF/cloudfront-limits.html`)
- Custom error responses, the web ACL and the default root object are per distribution. (VERIFIED `TFP/r/cloudfront_distribution.html.markdown`)

PROPOSAL: **two distributions, two private buckets, two OACs** (player and admin). One distribution serving two different apps from one default root would need host-based routing in a function and would force both apps to share error handling, CSP and any future WAF/IP rule. Two distributions keep the admin surface independently lockable and let either be invalidated or rolled back alone. They can share one certificate (c.6) or have one each. The admin hostname remains "an interface location, not the mechanism enforcing authorisation" (prompt.md line 229); the API enforces the admin group.

### c.6 Certificate: region and names

| Fact | Status / source |
|---|---|
| "To use an ACM certificate with a CloudFront distribution, make sure you request (or import) the certificate in the US East (N. Virginia) Region (`us-east-1`)." | **CONFIRMED / VERIFIED** `CF/cnames-and-https-requirements.html`; also `TFP/r/cloudfront_distribution.html.markdown` ("The ACM certificate must be in US-EAST-1") |
| The alternate domain name must be covered by the certificate's SAN: "an exact match ... or ... a wildcard at the same level". | VERIFIED `CF/cnames-and-https-requirements.html` |
| ACM wildcard: the asterisk "must be leftmost ... and protects only one subdomain level ... `*.example.com` protects only subdomains, not the bare or apex domain". | VERIFIED `https://docs.aws.amazon.com/acm/latest/userguide/acm-certificate-characteristics.html` |
| CloudFront says the same: with `*.example.com` "you can't add alternate domain names that are at levels higher or lower than the wildcard". | VERIFIED `CF/CNAMEs.html` |
| Provider v6: `aws_acm_certificate` and `aws_acm_certificate_validation` accept a per-resource `region` argument. CloudFront and Route 53 resources are global and have no `region`. | VERIFIED `TFP/r/acm_certificate.html.markdown`, `TFP/r/acm_certificate_validation.html.markdown`, `TFP/guides/enhanced-region-support.html.markdown` |
| `aws_acm_certificate_validation` create timeout defaults to 75 minutes. | VERIFIED `TFP/r/acm_certificate_validation.html.markdown` |

Name implication for a 3-label name (`aliens.<zone>`) plus a 4-label name beneath it (`admin.aliens.<zone>`):

| Certificate | Covers player name? | Covers admin name? | DNS validation records to exchange |
|---|---|---|---|
| Two SANs: the two exact names | yes | yes | **two** CNAMEs (one per name) |
| `aliens.<zone>` + `*.aliens.<zone>` | yes (exact) | yes (wildcard, one level) | **one** CNAME - ACM issues the same validation record for a wildcard and its base domain (VERIFIED `https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html`) |
| `*.aliens.<zone>` alone | **no** - a wildcard does not cover its parent | yes | one |
| `*.<zone>` alone | yes | **no** - only one level | one |
| Two separate certificates, one per distribution | yes | yes | two |

PROPOSAL: one certificate in us-east-1 with the **two exact names** as SANs, attached to both distributions. It grants nothing beyond the two hostnames, and the two validation CNAMEs are a one-off (see c.7). The "apex + wildcard" form is the alternative if the owner prefers a single validation record or expects more `*.aliens` hostnames later.

On the us-east-1 mechanism: the reference project uses an aliased provider `aws.us_east_1` passed to the module through `configuration_aliases` (`00-verified-repo-facts.md` lines 109-116). With provider 6.x the same result is available with `region = "us-east-1"` on the two ACM resources and no alias. PROPOSAL: either is valid ("Pre-v6.0.0 configurations that use provider blocks per Region remain valid ... and are not deprecated", VERIFIED `TFP/guides/enhanced-region-support.html.markdown`); following the reference convention costs nothing, and the per-resource argument is the smaller amount of code for a learner. Pick one and say why in the plan.

### c.7 Hosted zone in a different AWS account: integration points

Verified behaviour:

- DNS validation gives one CNAME per name ("a unique key-value pair"), "created specifically for your domain and your account". "The CNAME records must be added to your DNS database only once"; while they remain, ACM renews automatically and **further certificates for the same name can be issued without repeating validation**. (VERIFIED `https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html`)
- Terraform exposes them as `aws_acm_certificate.<x>.domain_validation_options` with `domain_name`, `resource_record_name`, `resource_record_type`, `resource_record_value`. (VERIFIED `TFP/r/acm_certificate.html.markdown`)
- A Route 53 alias to CloudFront uses the distribution's domain name and the fixed alias hosted zone ID `Z2FDTNDATAQYW2`; `EvaluateTargetHealth` must be false; the distribution must already list the record's name as an alternate domain name. If IPv6 is enabled on the distribution, create an `AAAA` alias as well as the `A` alias. Alias queries are free. (VERIFIED `https://docs.aws.amazon.com/Route53/latest/APIReference/API_AliasTarget.html`, `https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-to-cloudfront-distribution.html`; Terraform attribute `hosted_zone_id` on the distribution "is simply an alias for the zone ID `Z2FDTNDATAQYW2`", `TFP/r/cloudfront_distribution.html.markdown`)
- Nothing in the alias target ties it to the zone owner's account (it is a DNS name plus a fixed zone ID), so a zone in another account can alias to these distributions. (VERIFIED by the API shape above; no AWS sentence says "cross-account" explicitly.)

**What has to be exchanged between the workload account and the DNS account**

| # | Direction | Item | Value source |
|---|---|---|---|
| 1 | workload -> DNS | Certificate validation CNAME for the player name | `domain_validation_options` (name, type `CNAME`, value ending `.acm-validations.aws.`) |
| 2 | workload -> DNS | Certificate validation CNAME for the admin name | same |
| 3 | workload -> DNS | `A` alias (and `AAAA` if IPv6 is on) for the player hostname -> player distribution domain name (`dxxxx.cloudfront.net`), alias zone `Z2FDTNDATAQYW2`, evaluate target health = false | distribution outputs |
| 4 | workload -> DNS | Same for the admin hostname -> admin distribution | distribution outputs |
| 5 | DNS -> workload (only for method A below) | Hosted zone ID (or zone name for a lookup) and the ARN of a role in the DNS account that the deploy principal may assume | DNS account |
| - | none | No DNS record is needed for the API (default `execute-api` hostname) or for Cognito unless a custom auth domain is chosen later. | - |

Ordering constraint: the distributions cannot be created with those alternate names until the certificate is **issued**, which needs records 1-2 to exist. Records 3-4 can only be created after the distributions exist. If the zone has CAA records, they must permit Amazon's CAs (UNVERIFIED today; check the zone once).

**Two common Terraform ways**

| | A. Second `aws` provider that assumes a role in the DNS account | B. Records created out-of-band |
|---|---|---|
| Mechanism | `provider "aws" { alias = "dns"; assume_role { role_arn = ... } }` (VERIFIED `assume_role` block, `TFP/index.html.markdown`); `data "aws_route53_zone"` and `aws_route53_record` use `provider = aws.dns`; `aws_acm_certificate_validation` takes `validation_record_fqdns`. | Main stack outputs the four records; the owner creates them in the DNS account by their established method; the validation resource (without `validation_record_fqdns`) simply waits for ACM to see them. |
| Needs | A role in the DNS account trusting **both** the GitHub OIDC CI role and the owner's local principal, limited to `route53:ChangeResourceRecordSets`/`ListResourceRecordSets` on that one zone (it can be narrowed further to specific record names and types with the `route53:ChangeResourceRecordSetsNormalizedRecordNames` / `...RecordTypes` condition keys, VERIFIED `https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/specifying-conditions-route53.html`). | No cross-account trust at all. A first-release sequence with a pause: apply certificate -> add records 1-2 -> wait for issue -> apply the rest -> add records 3-4. |
| Day-two behaviour | One apply does everything; records are in state and are removed on destroy. | Validation CNAMEs are stable and reusable; alias records change only if a distribution is replaced. Drift is invisible to Terraform. |
| Risk | Production CI holds write access (however narrow) to the family's DNS zone. | A manual step can be forgotten; the 75-minute validation timeout can expire while waiting. |

The owner has said they will handle this integration, and the reference project's pattern is a **same-account** zone lookup by name (`00-verified-repo-facts.md` lines 111-112), which will not find the zone from the workload account without a second provider. The plan only needs to (1) list items 1-5, (2) isolate everything DNS-related behind one small Terraform boundary (a `dns` provider alias input, or a set of outputs), and (3) make the first-release ordering explicit. PROPOSAL: structure the edge module so that it works in **both** modes behind a flag (`manage_dns_records`), defaulting to whatever the owner's established approach turns out to be.

---

## d. API Gateway HTTP API

### d.1 Basics and limits

| Fact | Status / source |
|---|---|
| Default endpoint `https://{api_id}.execute-api.{region}.amazonaws.com`. It can be disabled (`disable_execute_api_endpoint`) "to require that clients use a custom domain name"; without a custom domain, disabling it leaves no way in. | VERIFIED `APIGW/http-api-disable-default-endpoint.html`, `TFP/r/apigatewayv2_api.html.markdown` |
| Payload size **10 MB**; request line + headers 10,240 bytes; maximum integration timeout **30 s**; 300 routes; 10 stages; 10 authorisers; access-log template 3 KB. | VERIFIED `APIGW/http-api-quotas.html` |
| Lambda synchronous invocation payload is **6 MB** each way, which is the effective limit behind the 10 MB. | VERIFIED `LAM/gettingstarted-limits.html` |
| Payload format 2.0: no `multiValueHeaders`; duplicate headers/query strings comma-joined; `rawPath`, `routeKey`, `cookies` array; header names lower-cased; with format 2.0 a Lambda may return a bare value and API Gateway infers the response. | VERIFIED `APIGW/http-api-develop-integrations-lambda.html` |
| When creating an integration by CLI, CloudFormation or SDK "you must specify a `payloadFormatVersion`"; **Terraform's default is `1.0`**. | VERIFIED same page; `TFP/r/apigatewayv2_integration.html.markdown` |
| HTTP APIs do **not** support AWS WAF, resource policies, API keys/usage plans, request validation, response caching, execution logs or X-Ray. They do support access logs to CloudWatch Logs. | VERIFIED `APIGW/http-api-vs-rest.html` |
| AWS WAF can be associated with CloudFront distributions, API Gateway **REST** APIs, ALBs, AppSync, **Cognito user pools**, App Runner, Verified Access, Amplify. HTTP APIs are not in the list. A CloudFront web ACL must be created in us-east-1. | VERIFIED `https://docs.aws.amazon.com/waf/latest/developerguide/how-aws-waf-works-resources.html` |

### d.2 CORS

| Fact | Status / source |
|---|---|
| With CORS configured on the API, "API Gateway automatically sends a response to preflight OPTIONS requests, even if there isn't an OPTIONS route", and it **ignores CORS headers returned from your backend integration**. | VERIFIED `APIGW/http-api-cors.html` |
| To get CORS headers the request must carry `Origin`; a preflight must also carry `Access-Control-Request-Method`. | VERIFIED same page |
| Special case: a `$default` catch-all route **with an authoriser** also catches `OPTIONS`; AWS says to add an unauthenticated `OPTIONS /{proxy+}` route in that design. | VERIFIED same page |
| Terraform: `cors_configuration { allow_origins, allow_methods, allow_headers, expose_headers, allow_credentials, max_age }` on `aws_apigatewayv2_api`. | VERIFIED `TFP/r/apigatewayv2_api.html.markdown` |
| Browser caps on `Access-Control-Max-Age`: Chromium 2 hours, Firefox 24 hours; default 5 seconds. | VERIFIED `https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Max-Age` |

### d.3 Throttling

| Fact | Status / source |
|---|---|
| Account-level default (per Region, across all API types): 10,000 requests/s with burst 5,000; London is not in the list of Regions with reduced defaults. | VERIFIED `APIGW/limits.html` |
| Stage-default and per-route throttling can be set; they cannot exceed the account limits; "throttles are applied on a best-effort basis and should be thought of as targets rather than guaranteed request ceilings"; throttled clients get `429`. | VERIFIED `APIGW/http-api-throttling.html` |
| Terraform: `default_route_settings { throttling_rate_limit, throttling_burst_limit, detailed_metrics_enabled }` and `route_settings { route_key, throttling_rate_limit, throttling_burst_limit, detailed_metrics_enabled }` on `aws_apigatewayv2_stage`. | VERIFIED `TFP/r/apigatewayv2_stage.html.markdown` |
| A route throttle is shared by **all** callers of that route; there is no per-user limit in an HTTP API (no usage plans). | VERIFIED by absence (`APIGW/http-api-vs-rest.html`) |
| Setting a `default_route_settings` block without throttling values may leave limits at 0 and throttle everything. | UNVERIFIED (remembered provider pitfall). Always set both numbers explicitly and smoke-test for `429`. |

PROPOSAL: a low stage default (for example rate 20/s, burst 40 for a family app) and a much lower explicit limit on the speech routes (for example rate 2/s, burst 5), plus reserved concurrency on the TTS Lambda (e.3) as the hard ceiling and any per-user rate limit implemented in the handler against DynamoDB. Numbers are starting values.

### d.4 JWT authoriser

| Fact | Status / source |
|---|---|
| Validates: token present in `identitySource` (optionally `Bearer`-prefixed); RSA signature via the issuer's `jwks_uri`; `kid`; `iss` equals the configured issuer; **`aud` or `client_id`** matches a configured audience ("validates `client_id` only if `aud` is not present"); `exp`, `nbf`, `iat`; and, if the route lists scopes, at least one of them in `scope`/`scp`. | VERIFIED `APIGW/http-api-jwt-authorizer.html` |
| Public keys are cached "for up to two hours on a best-effort basis". | VERIFIED same page |
| "There is no standard mechanism to differentiate JWT access tokens from other types of JWTs, such as OpenID Connect ID tokens ... we recommend that you configure your routes to require authorization scopes." | VERIFIED same page |
| For Cognito the issuer is `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`. | VERIFIED same page |
| Terraform: `aws_apigatewayv2_authorizer` with `authorizer_type = "JWT"`, `identity_sources = ["$request.header.Authorization"]`, `jwt_configuration { issuer, audience }`. | VERIFIED `TFP/r/apigatewayv2_authorizer.html.markdown` |
| Claims reach the Lambda at `requestContext.authorizer.jwt.claims`; array claims such as `cognito:groups` arrive as a single string, not a JSON array. | UNVERIFIED (remembered behaviour). Test it in the auth spike before writing the admin check. |

Consequences: the authoriser alone accepts **either** a Cognito access token or an ID token for the same app client. To honour "use intended access tokens" (prompt.md line 777) the handlers must check `token_use == "access"` (or routes must require a scope). The authoriser does not call Cognito, so a signed-out token stays valid until `exp`; keep access-token lifetime short. Details belong to the Cognito specialist (`05-cognito-auth.md`).

### d.5 Access logs

| Fact | Status / source |
|---|---|
| Configure a log group ARN and a single-line format on the stage; the deploying principal needs the log-delivery permissions (`logs:CreateLogDelivery`, `logs:PutResourcePolicy`, `logs:DescribeResourcePolicies`, ...). | VERIFIED `APIGW/http-api-logging.html` |
| Useful variables: `$context.requestId`, `$context.requestTime`/`requestTimeEpoch`, `$context.routeKey`, `$context.status`, `$context.responseLatency`, `$context.integrationLatency`, `$context.integrationStatus`, `$context.integration.error`, `$context.error.message`, `$context.authorizer.error`, `$context.authorizer.claims.<name>`, `$context.identity.sourceIp`, `$context.responseLength`, `$context.protocol`. | VERIFIED `APIGW/http-api-logging-variables.html` |
| Terraform: `access_log_settings { destination_arn, format }`. | VERIFIED `TFP/r/apigatewayv2_stage.html.markdown` |

PROPOSAL (illustrative fragment only): a JSON format such as `{"requestId":"$context.requestId","time":"$context.requestTime","routeKey":"$context.routeKey","status":"$context.status","latencyMs":"$context.responseLatency","integrationLatencyMs":"$context.integrationLatency","integrationError":"$context.integration.error","authError":"$context.authorizer.error","sub":"$context.authorizer.claims.sub"}`. Log the Cognito `sub` (a pseudonymous ID) but never usernames, nicknames or DOB; the route key rather than the raw path keeps run IDs and query strings (and therefore anything sensitive in them) out of the access log. Give the log group an explicit retention.

### d.6 Calling `execute-api` directly with CORS, or `/api/*` through the site's distribution

| Aspect | Direct to `execute-api` + CORS | `/api/*` behaviour on each site's CloudFront distribution |
|---|---|---|
| Browser view | Cross-origin. Every request carries `Authorization` and JSON, so it is "non-simple" and needs a preflight, cached per URL and method for at most 2 h (Chromium). Paths containing run IDs are distinct cache entries. | Same origin. **No CORS, no preflight.** CSP `connect-src 'self'`. |
| API Gateway config | `cors_configuration` listing both site origins exactly, methods, `authorization` and `content-type` (plus any idempotency header) in `allow_headers`, `max_age` up to 7200. API Gateway answers `OPTIONS` itself. | None needed for production. (Local development then needs either a dev-server proxy or a CORS entry for the localhost origin.) |
| CloudFront config | None. | An ordered behaviour `/api/*`, all seven methods, cache policy `CachingDisabled`, origin request policy `AllViewerExceptHostHeader` (`b689b0a8-53d0-40ab-baf2-68738e2966ac`), which AWS states "is intended for use with Amazon API Gateway" origins and replaces the viewer `Host` with the origin's (VERIFIED `CF/using-managed-origin-request-policies.html`). |
| `Authorization` header | Sent straight to API Gateway. | CloudFront strips `Authorization` from GET/HEAD by default; forwarding it needs a cache policy or origin request policy that includes it. An all-viewer policy does this. AWS warns: if it is forwarded but **not** in the cache key, "disable caching entirely for origins that require origin-side authorization" - hence `CachingDisabled`. (VERIFIED `CF/add-origin-custom-headers.html#add-origin-custom-headers-forward-authorization`, `CF/RequestAndResponseBehaviorCustomOrigin.html`) |
| Paths | Routes as written. | CloudFront forwards the path unchanged (an origin path can only be **prepended**, VERIFIED `CF/DownloadDistValuesOrigin.html`), so either the route keys include `/api/...` or a viewer-request function strips the prefix (the reference project does the latter, `02-ref-modules-edge.md`). |
| SPA routing interaction | Either option in c.2 works. | Custom error responses must **not** be used (0.4); use the CloudFront Function. |
| Exposure | Endpoint is public either way. | The `execute-api` endpoint is **still public** and bypasses CloudFront (it cannot be disabled without a custom domain, d.1; HTTP APIs have no resource policy or WAF). A WAF on the distribution therefore protects only callers who go through it. Security must rest on the JWT authoriser and handler checks in both designs. |
| Failure modes | CORS misconfiguration shows as opaque browser errors; easy to diagnose once understood. | CloudFront can replace origin errors (502/504 pages); one more layer in every trace. |
| Fit with "follow the existing repository pattern" | The reference project does **not** do this. | The reference project calls a same-origin `/api` path through CloudFront (VERIFIED by the edge specialist, `02-ref-modules-edge.md` lines 16, 110, 154-156). |

PROPOSAL: route `/api/*` through each site's distribution (same origin), because it matches the owner's existing pattern, removes preflights from a chatty save/attempt API, and keeps the CSP tight; adopt the three guard-rails it requires (CloudFront Function for SPA routing, `CachingDisabled` + `AllViewerExceptHostHeader`, one decision about the `/api` prefix). Keep `cors_configuration` on the API limited to the local-development origin, or use a dev proxy. If the team wants the fewest moving parts for milestone 1, direct + CORS is a legitimate temporary choice, but switching later changes the frontend's base URL, the CSP and the SPA-routing mechanism together, so decide once.

Note: the audio download is cross-origin in **both** designs (presigned S3 URL), so the audio bucket needs CORS regardless (section h).

---

## e. Lambda

### e.1 Python runtimes (table read on 2026-11-14)

| Runtime | Identifier | OS | Deprecation | Block create | Block update |
|---|---|---|---|---|---|
| Python 3.15 | `python3.15` | AL2023 | not scheduled - **public preview**, "should not be used for production workloads"; GA targeted November 2026 | - | - |
| Python 3.14 | `python3.14` | AL2023 | 30 Jun 2029 | 31 Jul 2029 | 31 Aug 2029 |
| Python 3.13 | `python3.13` | AL2023 | 30 Jun 2029 | 31 Jul 2029 | 31 Aug 2029 |
| Python 3.12 | `python3.12` | AL2023 | 31 Oct 2028 | 30 Nov 2028 | 10 Jan 2029 |
| Python 3.11 | `python3.11` | AL2 | 30 Jun 2027 | 29 Jul 2027 | 31 Aug 2027 |
| Python 3.10 | `python3.10` | AL2 | 31 Oct 2026 (already deprecated) | 29 Jul 2027 | 31 Aug 2027 |

VERIFIED `LAM/lambda-runtimes.html`, `LAM/lambda-python.html`. Other verified points: the runtime includes boto3 but AWS recommends bundling the SDK version you depend on; from Python 3.12 the runtime returns Unicode characters unescaped in JSON responses.

PROPOSAL: `python3.14` (or `python3.13` if the owner's local interpreter is 3.13; both have the same support horizon). Avoid 3.15 until it is GA. Run tests in CI on the same minor version as the runtime.

### e.2 Architecture and packaging

| Fact | Status / source |
|---|---|
| `architectures = ["arm64"]` (default is `x86_64`); arm64 functions "can achieve significantly better price and performance"; every third-party dependency must provide an arm64 build. arm64 is "available in most AWS Regions". | VERIFIED `LAM/foundation-arch.html`, `TFP/r/lambda_function.html.markdown`. Availability in eu-west-2 specifically: UNVERIFIED (expected yes). |
| Zip limits: 50 MB zipped through the API, 250 MB unzipped including layers; larger zips go via S3. Environment variables 4 KB total. Timeout up to 900 s. | VERIFIED `LAM/gettingstarted-limits.html` |
| Terraform package sources: `filename` (local file) **or** `s3_bucket` + `s3_key` (+ `s3_object_version`). | VERIFIED `TFP/r/lambda_function.html.markdown` |
| Change triggers: `code_sha256` ("Base64-encoded ... SHA-256 hash of the `.zip` file"; the provider's own example now uses this) and `source_code_hash` ("a synthetic argument tracked only by the AWS provider ... does not need to match the hashing algorithm used by Lambda"). | VERIFIED same page |

**S3 key + hash, versus `archive_file` at plan time**

| | `archive_file` data source / local `filename` | Build job uploads zip to S3; Terraform references `s3_bucket` + `s3_key` |
|---|---|---|
| Where the zip is made | On whichever machine runs `terraform plan`. | In the build job, once, before planning. |
| Dependencies | `archive_file` only zips a directory; `pip install --target` must already have run. | The build job owns dependency installation and can target arm64 wheels. |
| Saved-plan workflow | The plan refers to a **local path**; the apply job must have a byte-identical file at the same path, so the artefact passed between jobs must include it (and hidden files, see 0.5). | The plan refers only to an S3 location and a hash string; the apply job needs nothing but the plan and the working directory. |
| Reproducibility | Zip timestamps/ordering can change the hash and create noise diffs (UNVERIFIED how deterministic the current `archive` provider is). | Key contains the release ID or content hash, so "what is deployed" is readable in the plan and in the function configuration. |
| Rollback | Rebuild from the old commit. | Re-run the release with the previous release ID; the old zip is still in the bucket. |
| Ownership | Terraform. | Terraform (the workflow must **not** also call `update-function-code`; the copied reference workflow does exactly that for a container image, `00-verified-repo-facts.md` line 67, and that step must not be carried over). |

PROPOSAL: the S3-key approach, with immutable keys such as `lambda/<function>/<release-id>.zip`, the release ID and each zip's base64 SHA-256 passed to Terraform as variables (from a small release manifest), and `code_sha256` (or `source_code_hash`) set from the manifest so the plan shows a diff exactly when the bytes changed. One wrinkle to schedule: the artefact bucket must exist **before** the first main-stack plan can reference an object in it (create it in a first small apply, or in a tiny separate root); that sequencing belongs in the delivery section.

### e.3 Versions, aliases, concurrency

| Fact | Status / source |
|---|---|
| Publishing creates an immutable snapshot of code and most configuration; version numbers increase monotonically and are never reused; Lambda publishes a new version only if code or qualifying configuration changed. | VERIFIED `LAM/configuration-versions.html` |
| An alias is "a pointer to a function version that you can update"; it can also split traffic by weight. | VERIFIED `LAM/configuration-aliases.html` |
| Terraform: `publish = true` on the function; `aws_lambda_alias { name, function_name, function_version, routing_config }`; `aws_lambda_permission.qualifier` scopes an invoke permission to an alias or version. | VERIFIED `TFP/r/lambda_function.html.markdown`, `TFP/r/lambda_alias.html.markdown`, `TFP/r/lambda_permission.html.markdown` |
| Each published version consumes code storage. | VERIFIED `LAM/gettingstarted-limits.html` (quota figure truncated in my extract; the long-standing 75 GB is UNVERIFIED) |
| Reserved concurrency sets both the maximum and the guaranteed concurrency for a function; `0` throttles the function completely. "You can reserve up to the Unreserved account concurrency value minus 100." | VERIFIED `LAM/configuration-concurrency.html` |
| Default account concurrency is 1,000 per Region, but "new AWS accounts have reduced concurrency and memory quotas ... AWS raises these quotas automatically based on your usage". | VERIFIED `LAM/gettingstarted-limits.html` |
| Terraform: `reserved_concurrent_executions` (`-1` = no limit, `0` = disabled). | VERIFIED `TFP/r/lambda_function.html.markdown` |

PROPOSAL:

- `publish = true` and a `live` alias per function; API Gateway integrations and permissions target the **alias**. Normal rollback is "re-release the previous artefacts through the same workflow" (single owner, no drift). Document `update-alias` to the previous version number as a **break-glass** step and note that it creates drift which the next apply will revert.
- Reserved concurrency on the TTS function as a cost ceiling **only after checking the account's applied concurrency quota** in Service Quotas: this is a new workload account (nothing has ever run in it, `00-verified-repo-facts.md` lines 47-48), and if its limit is below about 110 the setting will be rejected. If so, rely on route throttling until the quota grows or is raised. The account's actual quota is UNVERIFIED.
- Published versions are immutable and old ones accumulate; a later housekeeping task can prune versions not referenced by an alias.

### e.4 Logs

| Fact | Status / source |
|---|---|
| By default Lambda creates `/aws/lambda/<function>` on first invocation. A function can instead be pointed at a named log group; several functions may share one. | VERIFIED `LAM/monitoring-cloudwatchlogs-loggroups.html` |
| Terraform: `aws_cloudwatch_log_group { name, retention_in_days, skip_destroy, deletion_protection_enabled, log_group_class }`; allowed retention values are 1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653, or 0 (never expire). | VERIFIED `TFP/r/cloudwatch_log_group.html.markdown` |
| Terraform: `logging_config { log_format = "Text" or "JSON", application_log_level, system_log_level, log_group }` on the function. | VERIFIED `TFP/r/lambda_function.html.markdown` |
| The default format for Python runtimes is plain text. With `JSON`, output from the standard `logging` module becomes JSON objects containing at least timestamp, level, message and `requestId`; `extra={...}` adds fields; `logging.exception` output is captured at level ERROR with the stack trace. **`print` output stays plain text.** The level filter (`application_log_level`) applies to JSON format. | VERIFIED `LAM/python-logging.html` |
| With plain-text format the default level for Python is WARN unless the code calls `setLevel`. | VERIFIED same page |
| Logs already emitted as JSON by a library such as Powertools for AWS Lambda are not double-encoded. | VERIFIED same page |

PROPOSAL: create each function's log group in Terraform **before** the function (so it never exists with "never expire"), with a retention such as 30 or 90 days, and give the execution role only `logs:CreateLogStream` and `logs:PutLogEvents` on that group. Use `log_format = "JSON"` with the standard `logging` module and a small helper that always attaches `run_id`, `activity_id`, `op` and the caller's `sub`, and that never logs request bodies, presigned URLs, tokens, nicknames or DOB. This needs no third-party library, which suits a learner; Powertools is a later convenience, not a prerequisite.

---

## f. Terraform and GitHub Actions

### f.1 S3 backend native locking

| Fact | Status / source |
|---|---|
| `use_lockfile` appeared in **Terraform 1.10** as *experimental* ("introduced as experimental in Terraform 1.10"); it is absent from the 1.9 docs. | VERIFIED `TF/language/backend/s3` for v1.10.x and v1.9.x (read from `hashicorp/web-unified-docs`); `https://github.com/hashicorp/terraform/blob/v1.10/CHANGELOG.md` |
| "S3 native state locking is now generally available" in **Terraform 1.11**, and the DynamoDB-related arguments were deprecated in the same release. | VERIFIED `https://github.com/hashicorp/terraform/blob/v1.11/CHANGELOG.md` |
| Current docs (1.17): "`use_lockfile` - (Optional) Whether to use a lockfile for locking the state file. Defaults to `false`." "**DynamoDB-based locking is deprecated** and will be removed in a future minor version." `dynamodb_table` is "(Optional, **Deprecated**)". Both can be set together for migration. | VERIFIED `TF/language/backend/s3` (v1.17.x) |
| Lock object is `<key>.tflock`; the principal needs `s3:GetObject`, `s3:PutObject` **and `s3:DeleteObject`** on it; `s3:DeleteObject` is not needed on the state object itself. | VERIFIED same page |

Consequences: the bootstrap root's `required_version = ">= 1.10.0"` (`00-verified-repo-facts.md` line 18) technically admits the experimental 1.10 implementation. PROPOSAL: the main stack should require `>= 1.11` (or simply pin the workflow to the local 1.17.x), drop `-backend-config="dynamodb_table=..."` from the copied workflows (they still pass it; lines 59-60 of the facts file) and pass `use_lockfile=true`. Any future least-privilege CI policy must include `DeleteObject` on `*.tflock`.

### f.2 AWS provider 6.x points that matter here

| Fact | Status / source |
|---|---|
| Most resources gained a top-level `region` argument (enhanced Region support); per-Region provider aliases still work and "are not deprecated". | VERIFIED `TFP/guides/enhanced-region-support.html.markdown` |
| Not Region-aware (global): all `aws_cloudfront_*`, `aws_route53_*`, `aws_iam_*`, WAF Classic, and others. `aws_acm_certificate` **is** Region-aware. | VERIFIED same guide; `TFP/r/acm_certificate.html.markdown` |
| `data.aws_region`: `name` is deprecated, use `region`. `data.aws_s3_bucket`: use `bucket_region` instead of `region`. | VERIFIED `TFP/guides/version-6-upgrade.html.markdown` |
| `aws_cloudfront_response_headers_policy.etag` is computed-only. `aws_cognito_user_in_group` ID is now `user_pool_id,group_name,username`. | VERIFIED same guide |
| `aws_cloudwatch_log_group` has `deletion_protection_enabled`. | VERIFIED `TFP/r/cloudwatch_log_group.html.markdown` |

Code copied from the reference project (written against an older in-repo bootstrap) should be checked against the v6 upgrade guide rather than assumed to apply cleanly.

### f.3 Protecting persistent resources

| Mechanism | Fact | Status / source |
|---|---|---|
| `lifecycle { prevent_destroy = true }` | Terraform "rejects plans that would destroy the infrastructure object" while the block is present; it "doesn't prevent Terraform from destroying a resource if you remove its configuration"; it also makes `terraform destroy` fail for that resource. Lifecycle arguments must be literal values. | VERIFIED `TF/language/meta-arguments/lifecycle` |
| DynamoDB `deletion_protection_enabled = true` | Table "cannot be deleted by anyone" until switched off. Default `false`. Not restored by backups. | VERIFIED a.7 |
| Cognito `deletion_protection = "ACTIVE"` | "prevents accidental deletion of your user pool"; must be deactivated first. Default `INACTIVE`. | VERIFIED `TFP/r/cognito_user_pool.html.markdown` |
| S3 `force_destroy = false` (default) and versioning | A non-empty bucket cannot be destroyed by Terraform. | VERIFIED for the backup vault's `force_destroy` (`TFP/r/backup_vault.html.markdown`); the S3 bucket default is UNVERIFIED today (standard behaviour) |

PROPOSAL: use both layers on every stateful resource (tables, user pool, audio bucket, artefact bucket, backup vault): `prevent_destroy` catches **replacement** (for example a renamed table or a changed key schema) at plan time, and the service-side flag catches block removal and console accidents. Note that `prevent_destroy` blocks an apply only when the plan includes a destroy/replace, so the plan-review step is where the owner will see it.

### f.4 Saved plan in one job, apply exactly that plan in a later job

Verified Terraform behaviour:

- `terraform plan -out=FILE` writes an opaque plan; `terraform apply FILE` "performs the operations in the saved plan without prompting"; `-auto-approve` is ignored because "passing the plan file [is] the approval"; no planning options can be added at apply time. (`TF/cli/commands/plan`, `TF/cli/commands/apply`)
- Sensitivity: the plan file "does contain your full configuration, all of the values associated with planned changes, and all of the plan options including the input variables. If your plan includes any sort of sensitive data, even if obscured in Terraform's terminal output, it will be saved in cleartext in the plan file ... treat any saved plan files as potentially-sensitive artifacts." `terraform show -json` prints sensitive values in plain text. (`TF/cli/commands/plan`, `TF/cli/commands/show`, `TF/language/manage-sensitive-data`)
- Staleness: applying a saved plan after the state has changed fails with **"Saved plan is stale ... the state was changed by another operation after the plan was created"** (serial/lineage check). (VERIFIED in source: `https://github.com/hashicorp/terraform/blob/main/internal/backend/local/backend_local.go`)
- Running plan and apply on different machines: "archive the entire working directory, including the `.terraform` subdirectory ... extract it at the same absolute path"; the plan "can contain absolute paths"; it must be applied on the same OS and CPU architecture; "an error will be produced if Terraform or any plugins are upgraded between creating and applying a plan"; credentials for plan and apply must point at the same account. (VERIFIED `TF/tutorials/automation/automate-terraform`)

Verified GitHub behaviour:

- Artefacts: default retention 90 days, `retention-days` 1-90; `include-hidden-files` defaults to false; zipping loses file permissions (directories 755, files 644) unless you tar first; outputs include `artifact-id` and `artifact-digest`. Current majors: `actions/upload-artifact@v7`, `actions/download-artifact@v8`. (`https://github.com/actions/upload-artifact`, `https://github.com/actions/download-artifact`)
- `download-artifact` by default reads only the **current run's** artefacts; another run needs `run-id` plus a `github-token` with `actions:read`. (same README)
- Downloading artefacts through the UI/API requires **read access** to the repository. (`GH/actions/how-tos/manage-workflow-runs/download-workflow-artifacts`) So in a public repository a plan artefact is readable by a very wide audience.
- A run may wait up to 30 days for an environment approval; a workflow run is cancelled after 35 days in total. (`GH/actions/reference/limits`)
- `workflow_dispatch` "will only trigger a workflow run if the workflow file exists on the default branch". (`GH/actions/reference/workflows-and-actions/events-that-trigger-workflows`)
- `concurrency` groups allow at most one running and (by default) one pending run; a newer pending run replaces an older pending one. (`GH/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency`)
- Current action majors seen in official docs/READMEs: `actions/checkout@v6`, `aws-actions/configure-aws-credentials@v6` (the copied workflows use `@v4`), `hashicorp/setup-terraform@v4`; role session default 1 hour. (`GH/.../oidc-in-aws`, `https://github.com/aws-actions/configure-aws-credentials`, `https://github.com/hashicorp/setup-terraform`)

PROPOSAL - shape of the release workflow (no code):

1. `build` job: checks, tests, build both frontends and the Lambda zips; upload zips to the artefact bucket under the release ID; write a release manifest.
2. `plan` job: assume the role, `init` with the real backend, `plan -out=tfplan -lock-timeout=...`, write `terraform show -no-color tfplan` to the job summary for review, then `tar` the Terraform root **including `.terraform/` and `.terraform.lock.hcl`** together with `tfplan` and upload it as one artefact with a short `retention-days` (1-3).
3. `apply` job: `needs: plan`, gated (f.5); same runner image, same pinned Terraform version; download and untar to the same path; `terraform apply tfplan`. If anything changed the state in between, the stale-plan error stops it and the answer is simply to re-run.
4. `publish` job: sync hashed assets, then `index.html`, then invalidate; smoke checks; record the manifest.
5. A single `concurrency` group for the whole workflow so two releases cannot interleave.

Sensitivity handling: the proposed stack has few true secrets (Cognito public clients have no client secret), but the plan still contains the whole configuration and state excerpts. Keep the repository private or do not publish the raw plan as an artefact in a public repository (alternatives: store the plan tarball in the private state/artefact S3 bucket keyed by run ID, or encrypt it before upload). Always post the **human-readable** plan to the job summary instead of expecting the reviewer to open the binary.

### f.5 The approval gate

- With required reviewers available (public repository, or a paid plan that includes them on private repositories): put `environment: prod` on the `apply` job. Up to six reviewers; one approval suffices; "prevent self-review" exists but makes a solo owner unable to approve their own run, so leave it off. Administrators can bypass protection rules by default; that can be disabled. (VERIFIED `GH/actions/reference/workflows-and-actions/deployments-and-environments`, `GH/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments`)
- **Without** required reviewers (private repository on Free/Pro/Team; see 0.2): PROPOSAL - split into two manually dispatched workflows. "Release: plan" does steps 1-2 and ends. The owner reads the plan summary. "Release: apply" takes the plan run's ID as an input, downloads that run's artefact (`run-id` + token with `actions:read`), verifies its digest, and performs steps 3-4. The second manual dispatch **is** the approval, the applied plan is exactly the reviewed one, and the stale-plan check still protects against drift between the two.
- Deployment-branch restrictions on an environment (limit to `main`) are available on private repositories for Pro/Team. (VERIFIED same reference page)

Which variant applies is a genuine open item for the owner: it depends on repository visibility and plan, which I did not look up.

### f.6 How a GitHub Environment changes the OIDC `sub`, and what that means for the trust policy

Verified:

- "The subject claim includes the environment name when the job references an environment": `repo:ORG/REPO:environment:NAME`. The branch form `repo:ORG/REPO:ref:refs/heads/BRANCH` is used "only if the job doesn't reference an environment" and the run is not a pull request; the pull-request form is `repo:ORG/REPO:pull_request`. A `:` inside a value is encoded as `%3A`. (`GH/actions/reference/security/oidc#example-subject-claims`)
- GitHub's AWS guide: "If you use a workflow with an environment, the `sub` field must reference the environment name". It shows `StringLike ... "repo:octo-org/octo-repo:*"` as the catch-all that allows "any branch, pull request merge branch, or environment". (`GH/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws`)
- **Immutable format** (0.1): for repositories created after 15 July 2026, or opted in, the `repo` segment is `OWNER@OWNER-ID/REPO@REPO-ID`; the IDs "are always included ... even when you customize claims"; "Update your trust policies to match the format your repository uses." The repository-level REST resource "customization template for an OIDC subject claim" exposes `use_default`, `include_claim_keys` and `use_immutable_subject`. (`GH/actions/reference/security/oidc#immutable-subject-claims`, `GH/rest/actions/oidc`)
- Other token claims available for conditions include `repository_id`, `repository_owner_id`, `environment`, `ref`, `job_workflow_ref`. (`GH/actions/reference/security/oidc`)

What this means for **this** repository:

1. Mixed jobs get different subjects. In one workflow run, a job **with** `environment: prod` presents `...:environment:prod`, and a job **without** an environment presents `...:ref:refs/heads/<branch>`. A trust policy narrowed to `...:environment:prod` therefore means **every job that assumes the AWS role must declare the environment** (build-and-upload, plan, apply, publish). With required reviewers on that environment, each such job would pause for approval. Practical patterns (PROPOSAL): either (a) two environments - `prod-plan` (no reviewers; used by build/plan/publish-style jobs that need AWS) and `prod` (reviewers; used by apply) - with the trust policy listing both subjects; or (b) keep one role but allow exactly `...:environment:prod` and `...:ref:refs/heads/main`.
2. The current pattern `repo:<owner>/<repo>:*` (name-based, any ref, any environment, any pull request) is both **too broad** for a role holding `AdministratorAccess` - the bootstrap README itself says so (`00-verified-repo-facts.md` lines 93-96) - and, if the repository uses the immutable format, **non-matching**. `StringLike` treats `*` and `?` as wildcards but `repo:<owner>/<repo>:*` cannot match `repo:<owner>@123/<repo>@456:...` because the character after the owner name differs.
3. Check before the first workflow run (owner action; one of): read the repository's Actions OIDC setting in the GitHub UI; or call the REST endpoint above and look at `use_immutable_subject`; or run a throwaway `workflow_dispatch` job that requests an OIDC token and prints its `sub` claim (never the token). The numeric owner and repository IDs are returned by the repository REST resource.
4. Fix path, fully inside existing conventions: `trusted_subs` is already a list variable in `infrastructure/envs/common.auto.tfvars.json` feeding the bootstrap module's `StringLike` condition (`00-verified-repo-facts.md` lines 13-14, 80-82). Replace the single wildcard entry with the exact subjects in whichever format the repository really uses, for example `repo:<owner>@<owner-id>/<repo>@<repo-id>:environment:prod` (and the plan environment), then re-run the bootstrap script. Because that is a bootstrap apply by the owner, it should be an early backlog task with the completion criterion "a no-op workflow run assumes the role and prints the expected account ID".
5. Because the role's maximum session is 3600 s (`00-verified-repo-facts.md` line 41) and each job assumes the role afresh, an approval wait of any length does not expire credentials; only a single job running longer than an hour would.

---

## g. Monitoring

### g.1 Metrics that exist

| Service | Namespace / metrics / dimensions | Status / source |
|---|---|---|
| HTTP API | `AWS/ApiGateway`: **`4xx`**, **`5xx`**, `Count`, `Latency`, `IntegrationLatency`, `DataProcessed`; dimensions `ApiId` or `ApiId, Stage`; per-route dimensions only with detailed metrics enabled. One-minute periods. (REST APIs use the different names `4XXError`/`5XXError`.) | VERIFIED `APIGW/http-api-metrics.html`, `CW/Best_Practice_Recommended_Alarms_AWS_Services.html` |
| Lambda | `AWS/Lambda`: `Invocations`, `Errors`, `Throttles`, `Duration` (supports percentiles; excludes cold-start init), `ConcurrentExecutions`; dimension `FunctionName` (also per alias/version). | VERIFIED `LAM/monitoring-metrics-types.html` |
| Lambda | `Errors` counts "exceptions that your code throws and exceptions that the Lambda runtime throws" including timeouts. Throttled requests count as neither `Invocations` nor `Errors`. | VERIFIED same page |
| DynamoDB | `AWS/DynamoDB`: `ThrottledRequests`, `ReadThrottleEvents`, `WriteThrottleEvents`, `SystemErrors` (HTTP 500), `UserErrors` (HTTP 400; account-level, no table dimension), `ConditionalCheckFailedRequests` (not included in `UserErrors`), `TransactionConflict`, `SuccessfulRequestLatency`. | VERIFIED `DDB/metrics-dimensions.html` |
| AWS Backup | `AWS/Backup`: `NumberOfBackupJobsFailed`, `NumberOfBackupJobsCompleted`, restore equivalents. | VERIFIED `BK/cloudwatch.html` |

Important inference: a handler that **catches** an error and returns HTTP 500 is a successful invocation, so `Errors` stays 0; conversely an unhandled exception becomes an API `5xx`. The API `5xx` alarm is therefore the primary "real API failure is visible" signal for AC-40, and Lambda `Errors` is the supporting one.

### g.2 AWS's recommended alarm shapes (for reference)

VERIFIED `CW/Best_Practice_Recommended_Alarms_AWS_Services.html`:

| Metric | Statistic | Threshold | Period | Datapoints / evaluation periods |
|---|---|---|---|---|
| HTTP API `5xx` | Average | > 0.05 | 60 s | 3 of 3 |
| HTTP API `4xx` | Average | > 0.05 | 60 s | 5 of 5 |
| HTTP API `Latency` | p90 | >= 2500 ms (starting point) | 60 s | 5 of 5 |
| Lambda `Errors` | Sum | "greater than zero", workload-dependent | 60 s | 3 of 3 |
| Lambda `Throttles` | Sum | workload-dependent | 60 s | 5 of 5 |
| Lambda `Duration` | p90 | below the function timeout | 60 s | 15 of 15 |
| DynamoDB `SystemErrors` | Sum | workload-dependent | 60 s | 15 of 15 |
| DynamoDB `Read/WriteThrottleEvents` | Sum | workload-dependent | 60 s | 5 of 5 |

These assume steady traffic. With two children playing occasionally, "three consecutive minutes above 5 %" will almost never happen even during a total outage, because most minutes have no requests at all.

### g.3 Missing data

| Fact | Status / source |
|---|---|
| `treat_missing_data` options: `notBreaching` (missing = good), `breaching` (missing = bad), `ignore` (keep current state), `missing` (**default**; all-missing leads to `INSUFFICIENT_DATA`). | VERIFIED `CW/alarms-and-missing-data.html`; Terraform default `missing`, `TFP/r/cloudwatch_metric_alarm.html.markdown` |
| AWS's guidance: "for a metric that generates data points only when an error occurs, such as `ThrottledRequests` in Amazon DynamoDB, you would want to treat missing data as `notBreaching`." Alarms on `AWS/DynamoDB` metrics default to ignoring missing data. | VERIFIED same page |
| CloudWatch looks at an **evaluation range** wider than the evaluation periods; if enough real data points exist in that range it uses the most recent real ones and only fills gaps with the missing-data treatment when there are too few. | VERIFIED same page |

PROPOSAL for a low-traffic system (starting values):

| Alarm | Metric and statistic | Condition | Missing data |
|---|---|---|---|
| API server errors | `5xx` Sum, `ApiId`+`Stage` | >= 1 in one 5-minute period (1 of 1) | `notBreaching` |
| API client-error burst | `4xx` Sum | >= 25 in 5 minutes (tune; catches a broken release or abuse without firing on normal 401/409s) | `notBreaching` |
| API latency | `Latency` p95 | > 3000 ms for 3 of 3 five-minute periods | `notBreaching` |
| Lambda errors (per function) | `Errors` Sum | >= 1 in 5 minutes | `notBreaching` |
| Lambda throttles (per function) | `Throttles` Sum | >= 1 in 5 minutes | `notBreaching` |
| Lambda duration (per function) | `Duration` Maximum | > about 80 % of the configured timeout, 1 of 1 | `notBreaching` |
| DynamoDB throttling (per table) | `ThrottledRequests` Sum (or read/write throttle events) | >= 1 in 5 minutes | `notBreaching` |
| DynamoDB system errors (per table) | `SystemErrors` Sum | >= 5 in 5 minutes (SDK retries hide singles) | `notBreaching` |
| Speech synthesis failures | custom metric (g.4) Sum | >= 1 in 5 minutes | `notBreaching` |
| Backup job failed | `NumberOfBackupJobsFailed` Sum | >= 1 | `notBreaching` |
| Backup missing | `NumberOfBackupJobsCompleted` Sum over 1 day | < 1 | `breaching` (test it; dimensions unverified) |

Behaviour to expect and document: with sparse data, after a single error the alarm can remain in `ALARM` until the breaching datapoint ages out of the evaluation range, and no `OK` notification is sent unless `ok_actions` is set. Do not use `breaching` for request-driven metrics: a quiet night would page. All alarm actions go to one SNS topic.

Terraform: `aws_cloudwatch_metric_alarm` with `namespace`, `metric_name`, `dimensions`, `statistic` or `extended_statistic`, `period`, `evaluation_periods`, `datapoints_to_alarm`, `comparison_operator`, `threshold`, `treat_missing_data`, `alarm_actions`, `ok_actions`; `metric_query` for metric maths. (VERIFIED `TFP/r/cloudwatch_metric_alarm.html.markdown`)

### g.4 A metric for speech-synthesis failures

| Option | Facts | Status / source |
|---|---|---|
| Metric filter on a structured log line | A filter pattern such as `{ $.event = "tts_synthesis_failed" }` on the TTS log group publishes a metric with a chosen name, namespace and value. "Filters do not retroactively filter data." `default_value` (for example 0 when a non-matching event arrives) cannot be combined with dimensions; up to 3 dimensions. | VERIFIED `https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/MonitoringLogData.html`, `.../logs/FilterAndPatternSyntax.html`, `TFP/r/cloudwatch_log_metric_filter.html.markdown` |
| Embedded metric format (EMF) | The function writes a specially shaped JSON log line and CloudWatch extracts the metric asynchronously; no API call from the handler. AWS now recommends OpenTelemetry metrics for most new workloads and describes EMF as best "when you need a metric and its originating log event to stay together". | VERIFIED `CW/CloudWatch_Embedded_Metric_Format.html` |
| `PutMetricData` from the handler | Synchronous API call, extra IAM permission and latency on the failure path. | UNVERIFIED today (well-known API) |

PROPOSAL: the **metric filter**. It needs only the JSON logging already proposed (e.4), is defined entirely in Terraform beside the alarm, and teaches a reusable pattern. Log one line per outcome with a stable `event` value and a coarse `reason` (`polly_error`, `s3_put_error`, `unknown_definition`, `validation`), never the text being synthesised if it could contain anything personal (it should not: speech text is approved content only). Count only server-side failures in the alarmed metric; a client asking for an unknown definition is a 4xx, not an incident. Browser-side playback failures cannot be seen by this metric; if they matter, the client can report them through an API call later.

### g.5 SNS e-mail subscriptions

| Fact | Status / source |
|---|---|
| An e-mail subscription must be confirmed by the recipient ("You must confirm the subscription before the email address can start to receive messages"). Confirmation tokens are valid for two days; SNS deletes unconfirmed subscriptions after 48 hours. | VERIFIED `https://docs.aws.amazon.com/sns/latest/dg/sns-email-notifications.html`, `https://docs.aws.amazon.com/sns/latest/api/API_Subscribe.html` |
| More than 10 messages per second to an e-mail endpoint suspends the subscription back to pending. A bounce suppresses the address for 7 days. | VERIFIED first URL |
| Terraform: `email`/`email-json` protocols are "partially supported"; an unconfirmed subscription cannot be deleted by Terraform (it is dropped from state and left pending); attribute `pending_confirmation`. | VERIFIED `TFP/r/sns_topic_subscription.html.markdown` |
| Every recipient's e-mail contains an unsubscribe link that removes the subscription unless authenticated unsubscribe is configured. | VERIFIED (pointer in the first URL; mechanism details not read) |

Consequences (PROPOSAL): keep the address in the environment tfvars as `notification_email`, mirroring the reference project (`00-verified-repo-facts.md` lines 117-118). Add a release-checklist item: "confirm the SNS e-mail within 48 hours of the first apply, then trigger a test alarm (`set-alarm-state`) and see the e-mail arrive" - that last step is the evidence for AC-40. If the confirmation is missed, the subscription disappears and must be re-created (how Terraform reports that drift is UNVERIFIED). Whether a CloudWatch alarm can publish to a topic encrypted with the AWS-managed SNS key is UNVERIFIED; leave the topic unencrypted or use a customer-managed key with the right policy.

---

## h. S3 for generated audio

| Topic | Facts | Status / source |
|---|---|---|
| Encryption | Every bucket has SSE-S3 (AES-256) by default; all new objects are encrypted "at no additional cost and with no impact on performance" (since 5 January 2023). | VERIFIED `S3/default-encryption-faq.html`, `S3/UsingServerSideEncryption.html` |
| Presigned URLs | Grant time-limited access using the **signer's** credentials and permissions. A URL signed with temporary (role) credentials "expires when the role session expires, even if you specify a longer expiration time". "Presigned URLs are bearer tokens." A bucket policy can deny requests whose signature is older than N seconds with the `s3:signatureAge` condition key. | VERIFIED `S3/using-presigned-url.html` |
| CORS | Up to 100 rules; each has `AllowedOrigins` (at most one `*` wildcard per origin string), `AllowedMethods`, `AllowedHeaders`, `ExposeHeaders`, `MaxAgeSeconds`. | VERIFIED `S3/ManageCorsUsing.html` |
| Versioning | With versioning on, an overwrite creates a new version and a delete adds a delete marker; a versioned bucket can never go back to unversioned, only suspended. | VERIFIED `S3/Versioning.html` |
| Lifecycle | `Expiration` on a versioned bucket only adds a delete marker to the current version; `NoncurrentVersionExpiration` permanently deletes old versions. Rules apply to **existing** objects as soon as they are added. Removal is asynchronous and may lag the expiry date. | VERIFIED `S3/lifecycle-expire-general-considerations.html` |
| Conditional writes | `PutObject` with `If-None-Match: *` fails if the key already exists (needs only `s3:PutObject`). | VERIFIED `S3/conditional-writes.html` |
| Keys | UTF-8, at most 1,024 bytes; case-sensitive; some characters need special handling. | VERIFIED `S3/object-keys.html` |
| Missing object without `s3:ListBucket` | S3 returns 403 rather than 404. | VERIFIED `https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html` |
| Terraform | `aws_s3_bucket_cors_configuration`, `aws_s3_bucket_versioning`, `aws_s3_bucket_lifecycle_configuration`, `aws_s3_bucket_server_side_encryption_configuration`, `aws_s3_bucket_public_access_block`, `aws_s3_bucket_ownership_controls`. | VERIFIED the first four pages under `TFP/r/`; the last two resource names UNVERIFIED today (the bootstrap module uses the same settings on the state bucket, `00-verified-repo-facts.md` lines 83-84) |

PROPOSAL for the audio bucket:

- **Private**: all four public-access-block settings on, bucket-owner-enforced ownership (no ACLs), TLS-only bucket policy, SSE-S3. No CloudFront in front of it; delivery is by presigned `GET` only, as the brief specifies.
- **Immutable, content-addressed keys** rather than relying on versioning for correctness. Key = a fixed prefix plus a hash of the cache identity the brief lists (canonical text/SSML, locale, voice, engine, output format/sample rate, generation version), for example `speech/v1/<sha256-hex>.mp3`. Write with `If-None-Match: *` so two concurrent cache misses cannot overwrite each other; a "precondition failed" response simply means the clip already exists. The same approved sound requested from two activities then shares one object, and a corrected pronunciation produces a new key, so pinned runs keep their original clip (AC-23).
- **No personal data in keys or metadata**: no Cognito `sub`, username, nickname, DOB, run ID or age. Keys end up in logs and URLs. Put admin preview clips under a separate prefix such as `preview/` (also hash-named).
- **Lifecycle**: no expiration rule on the published-speech prefix. An age-based rule would delete clips still referenced by long-lived saved runs, and lifecycle rules act on existing objects immediately. Storage is negligible (short MP3s). Rules that **are** safe: abort incomplete multipart uploads after a day, and expire the `preview/` prefix after a few days. Any future clean-up of published clips must be reference-driven (delete only hashes that no published content version and no non-terminal run points to), as an explicit operator job.
- **Versioning**: enable it as cheap protection against accidental deletion or overwrite, with `NoncurrentVersionExpiration` after, say, 30 days so mistakes are recoverable without unbounded growth. It is a safety net, not the mechanism that preserves old clips; immutable keys are.
- **CORS**: one rule, `AllowedOrigins` = the two site origins exactly (plus a localhost origin only if local development fetches real clips), `AllowedMethods` = `GET` and `HEAD`, `AllowedHeaders` = `*` or `range`, `ExposeHeaders` = `ETag`, `Content-Length`, `Content-Type`, `MaxAgeSeconds` about 3000. This is required because the browser fetches the bytes with `fetch()` in order to cache them (the brief: "Configure audio download CORS for the approved player/admin origins", prompt.md line 621). A plain `<audio src>` would not need CORS, but then the bytes could not be read into the offline cache.
- **Presigned URL lifetime**: short (for example 60-300 seconds); the client downloads immediately and stores bytes, never the URL. The Lambda's role credentials bound the lifetime anyway (exact Lambda credential lifetime UNVERIFIED). Optionally add a bucket-policy `s3:signatureAge` deny as a ceiling. Never log the URL (it is a bearer token).
- **Object metadata**: set `Content-Type: audio/mpeg` and `Cache-Control: private, max-age=31536000, immutable` on upload (the object never changes for a given key); the browser HTTP cache is a bonus, not the offline store.
- **IAM**: the TTS function's role gets `s3:GetObject` and `s3:PutObject` on the speech prefix only (plus `polly:SynthesizeSpeech`); no `s3:ListBucket` is needed if existence is checked with `HeadObject` and a 403/404 is treated as "miss" (note the 403-not-404 fact above), or keep the existence record in DynamoDB audio metadata instead.
- **Backups**: the audio bucket is a regenerable cache as long as the speech definitions (in DynamoDB) and the generation parameters are kept, so it does not need AWS Backup. One caveat to state honestly in the plan: regenerating with Polly at a later date is **not guaranteed** to produce byte-identical or even perceptually identical audio if the voice is updated (UNVERIFIED), which is another reason not to expire reviewed clips.

---

## Implications for the plan

1. **Check the GitHub OIDC `sub` format before anything else in CI.** Repositories created after 15 July 2026 use `repo:OWNER@ID/REPO@ID:...`; the deployed trust pattern `repo:<owner>/<repo>:*` would not match. Make "a no-op workflow assumes the role" the first delivery task, and tighten `trusted_subs` to exact environment subjects in the same bootstrap re-apply. (0.1, f.6)
2. **Decide the approval mechanism from the repository's visibility and plan.** Environment required reviewers need a public repository on Free/Pro/Team; otherwise use the two-dispatch "plan run, then apply-by-run-ID" design. (0.2, f.5)
3. **Every job that assumes the AWS role must present a subject the trust policy lists**; with an environment-scoped policy that means declaring an environment on build, plan, apply and publish jobs (use a reviewer-free plan environment plus the gated prod environment). (f.6)
4. **Apply exactly the reviewed plan**: `plan -out`, tar the working directory including `.terraform/` and the lock file (hidden files are skipped by default), same runner OS and Terraform version, short artefact retention, rely on the "Saved plan is stale" check, and treat the plan file as sensitive. (f.4)
5. **Backend init must use `use_lockfile=true`, not `dynamodb_table`** (DynamoDB locking is deprecated; native locking is GA from Terraform 1.11); CI needs `DeleteObject` on `*.tflock`. (f.1)
6. **Protect stateful resources twice**: `prevent_destroy` (does nothing if the block is deleted) plus DynamoDB `deletion_protection_enabled`, Cognito `deletion_protection = "ACTIVE"` and non-force-destroy buckets/vault. (0.6, f.3)
7. **Idempotency cannot rest on `ClientRequestToken`** (10-minute window): store a marker item written with `attribute_not_exists` in the same transaction as the reward/summary/checkpoint effect, and use `ReturnValuesOnConditionCheckFailure = ALL_OLD` to return the original result. (a.1)
8. **One action per item per transaction** (max 100 actions, 4 MB): design the run, lease, marker and summary as separate items and put conditions on the item being written. (a.1)
9. **Badges via string-set `ADD` are idempotent; numeric summary counters are not** and must be guarded by the marker transaction. (a.3)
10. **Read your own writes from the base table with `ConsistentRead`**; GSIs are eventually consistent and cannot be read consistently, so use them only for operator listing. (a.4)
11. **Leases and attempt limits need explicit expiry checks in condition expressions**; TTL deletes "within a few days" and expired items remain readable and writable. (a.6)
12. **Daily AWS Backup rule with `delete_after = 7`, no cold storage, start window >= 60 minutes, explicit table ARNs, a Terraform-created role with the two AWS managed policies; plus PITR on each table.** Verify once that advanced DynamoDB backup is enabled in the Region. (b.1-b.3, a.7, b.6)
13. **A restore creates a new table and drops tags, TTL, PITR, streams, deletion protection and alarms**: the runbook must include the re-configuration checklist and the cut-over method, and Lambda functions must take table names from configuration. One documented manual restore drill satisfies AC-39. (b.4, b.5)
14. **Two CloudFront distributions with private buckets and OAC; one us-east-1 certificate carrying both exact hostnames** (a single wildcard cannot cover both a name and its child); list the two validation CNAMEs and the two alias records as the DNS-account hand-off, and make the first-release ordering explicit. (c.5-c.7)
15. **Use a viewer-request CloudFront Function for SPA deep links, not custom error responses**, because error responses are distribution-wide and would corrupt `/api/*` and missing-asset responses. (0.4, c.2)
16. **Same-origin `/api/*` through each distribution matches the owner's existing pattern**: `CachingDisabled` + `AllViewerExceptHostHeader`, one decision on the `/api` prefix; remember the `execute-api` endpoint stays public and HTTP APIs cannot have WAF, so the JWT authoriser and handler checks carry the security. (d.1, d.6)
17. **Set `payload_format_version = "2.0"` explicitly; check `token_use` (or require scopes) because the JWT authoriser cannot tell access tokens from ID tokens; set stage and per-route throttles explicitly.** (0.3, d.3, d.4)
18. **Lambda: `python3.14` or `3.13` on `arm64`, zips uploaded to S3 under immutable release keys and referenced by Terraform (single owner; remove the copied `update-function-code` step), `publish = true` with a `live` alias, Terraform-created log groups with retention, JSON log format.** Check the new account's concurrency quota before setting reserved concurrency on the TTS function. (e.1-e.4)
19. **Alarms for a low-traffic system use `Sum >= 1` over 5 minutes with `treat_missing_data = notBreaching`** (HTTP API metric names are `5xx`/`4xx`); speech failures become a metric through a log metric filter on a structured log event; the SNS e-mail must be confirmed within 48 hours and a test alarm fired to evidence AC-40. (g.1-g.5)
20. **Audio bucket: private, SSE-S3, content-hashed immutable keys with no personal data, no expiry on published clips, CORS for the two site origins (GET/HEAD), short presigned URLs that are never logged.** (h)

---

## Things I could not verify (consolidated)

- Whether the GitHub repository was created after 15 July 2026 and which `sub` format it emits; its visibility and the owner's GitHub plan (not queried, by rule).
- The new workload account's applied Lambda concurrency quota, and whether advanced DynamoDB backup is enabled in its Region settings (no AWS commands run).
- Exact trust principal string for the AWS Backup role; default vault encryption key when `kms_key_arn` is omitted; dimensions of `AWS/Backup` metrics; restore-testing prices.
- How JWT array claims (`cognito:groups`) are serialised into the Lambda event; whether a bare `default_route_settings` block yields zero throttling limits.
- CSP needs of the specific Phaser build, auth library and Vite output; which S3 hostname boto3 puts in presigned URLs by default; the lifetime of Lambda execution-role credentials.
- CloudFront Function maximum size (believed 10 KB); CloudFront default origin response timeout; contents of the managed `SecurityHeadersPolicy`.
- arm64 availability in eu-west-2 (expected); Lambda code-storage quota figure; determinism of `archive_file` output.
- ACM/CAA interaction for the existing zone; how Terraform reports an expired unconfirmed SNS e-mail subscription; CloudWatch-to-encrypted-SNS-topic behaviour.
- Whether Polly regenerates identical audio for the same input over time.
