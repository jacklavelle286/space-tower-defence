# Offline (mock provider): the plan keeps seven daily points, the selection names both tables by ARN, the role trusts
# AWS Backup, and the alarm goes to the given topic.
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

variables {
  name_prefix     = "space-tower-defence-prod"
  alarm_topic_arn = "arn:aws:sns:eu-west-2:111111111111:space-tower-defence-prod-alerts"
  table_arns = {
    game    = "arn:aws:dynamodb:eu-west-2:111111111111:table/space-tower-defence-prod-game"
    content = "arn:aws:dynamodb:eu-west-2:111111111111:table/space-tower-defence-prod-content"
  }
}

run "daily_seven_points_both_tables" {
  command = plan

  assert {
    condition     = one(aws_backup_plan.this.rule).lifecycle[0].delete_after == 7
    error_message = "seven daily recovery points"
  }
  assert {
    condition     = one(aws_backup_plan.this.rule).schedule == "cron(0 2 * * ? *)"
    error_message = "a daily schedule"
  }
  assert {
    condition     = toset(aws_backup_selection.tables.resources) == toset(values(var.table_arns))
    error_message = "the selection is both tables, by ARN"
  }
  assert {
    condition     = contains(aws_cloudwatch_metric_alarm.backup_job_failed.alarm_actions, var.alarm_topic_arn)
    error_message = "the alarm goes to the alerts topic"
  }
  assert {
    condition     = length(aws_iam_role_policy_attachment.backup) == 2
    error_message = "the backup and restore service policies"
  }
}

run "both_tables_are_required" {
  command = plan
  variables {
    table_arns = { game = "arn:aws:dynamodb:eu-west-2:111111111111:table/space-tower-defence-prod-game" }
  }
  expect_failures = [var.table_arns]
}

# The platform root backs up its own tables (ADR-0050): required_tables replaces the family edition's game and content.
run "a_root_names_its_own_required_tables" {
  command = plan
  variables {
    name_prefix     = "space-tower-defence-sca-dev"
    required_tables = ["tenancy"]
    table_arns      = { tenancy = "arn:aws:dynamodb:eu-west-2:111111111111:table/space-tower-defence-sca-dev-tenancy" }
  }
  assert {
    condition     = toset(aws_backup_selection.tables.resources) == toset(values(var.table_arns))
    error_message = "The selection backs up exactly the tables the root names."
  }
}

run "a_required_table_must_be_given" {
  command = plan
  variables {
    required_tables = ["tenancy"]
    table_arns      = { game = "arn:aws:dynamodb:eu-west-2:111111111111:table/space-tower-defence-prod-game" }
  }
  expect_failures = [var.table_arns]
}
