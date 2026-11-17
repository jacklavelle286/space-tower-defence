# Daily AWS Backup of both DynamoDB tables (plan H.13, spine S8.4; Phase 33, M2-11): one vault, one plan (a snapshot a
# day, seven kept), one selection by table ARN (not by tag: a tag can be dropped by a console edit, an ARN cannot), and
# a failed-job alarm on the alerts topic (H.14). PITR on each table (dynamodb_table module) covers the last 35 days to
# the second; these daily points are the second, separate copy.
#
# A restore creates a NEW table that this plan does not cover (H.13.2): the runbook (docs/runbooks/restore.md) ends with
# a release that points table_name_overrides at it, which moves this selection to the restored table's ARN.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

resource "aws_backup_vault" "this" {
  name = "${var.name_prefix}-vault"
  # Encrypted with the AWS-managed aws/backup key (the default). Protected like the tables (H.13): no replacement at plan
  # time. A vault holding recovery points cannot be deleted anyway.
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_backup_plan" "this" {
  name = "${var.name_prefix}-daily"

  rule {
    rule_name         = "daily"
    target_vault_name = aws_backup_vault.this.name
    schedule          = var.schedule
    start_window      = 60  # minutes after the scheduled time a job may start
    completion_window = 180 # minutes it may run

    lifecycle {
      delete_after = var.retention_days
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

# The role AWS Backup assumes to take and restore the snapshots. Trust principal backup.amazonaws.com
# [UNVERIFIED in this repo: plan risk M2-11; check the first job succeeds, docs/runbooks/restore.md "After the first
# backup"]; the two AWS-managed policies are the service's own for backup and restore.
data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "${var.name_prefix}-backup"
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

resource "aws_iam_role_policy_attachment" "backup" {
  for_each = toset([
    "AWSBackupServiceRolePolicyForBackup",
    "AWSBackupServiceRolePolicyForRestores",
  ])
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/${each.value}" # one partition, as the root's ARNs (locals.tf)
}

resource "aws_backup_selection" "tables" {
  name         = "${var.name_prefix}-tables"
  plan_id      = aws_backup_plan.this.id
  iam_role_arn = aws_iam_role.backup.arn
  resources    = values(var.table_arns)
}

# Any failed backup job in this vault (H.14 backup-job-failed). The metric's dimensions are [UNVERIFIED] (the plan says
# so too): after the first daily job, `aws cloudwatch list-metrics --namespace AWS/Backup` (read-only) shows whether
# NumberOfBackupJobsFailed is published with exactly these two; the runbook records the check.
resource "aws_cloudwatch_metric_alarm" "backup_job_failed" {
  alarm_name          = "${var.name_prefix}-backup-job-failed"
  alarm_description   = "AWS Backup: a backup job of the tables failed (Sum >= 1 in 5 min). See docs/runbooks/restore.md."
  namespace           = "AWS/Backup"
  metric_name         = "NumberOfBackupJobsFailed"
  dimensions          = { BackupVaultName = aws_backup_vault.this.name, ResourceType = "DynamoDB" }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
}
