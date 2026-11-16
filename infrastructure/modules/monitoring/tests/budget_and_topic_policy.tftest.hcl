# The alerts topic policy and the monthly budget (Phase 42b). Offline: mock providers ("apply" here creates nothing;
# the mocks only supply computed values such as the topic ARN), so nothing reaches AWS.
# Run from infrastructure/modules/monitoring: terraform init -backend=false && terraform test (CI repo job).

mock_provider "aws" {
  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:eu-west-2:123456789012:space-tower-defence-prod-alerts"
    }
  }

  mock_data "aws_caller_identity" {
    defaults = {
      account_id = "123456789012"
    }
  }
}

mock_provider "aws" {
  alias = "us_east_1"

  mock_resource "aws_sns_topic" {
    defaults = {
      arn = "arn:aws:sns:us-east-1:123456789012:space-tower-defence-prod-alerts-use1"
    }
  }
}

variables {
  name_prefix           = "space-tower-defence-prod"
  notification_email    = "alerts@example.com"
  api_id                = "abc123"
  ops_log_group_name    = "/aws/lambda/player-api"
  speech_log_group_name = "/aws/lambda/tts"
  table_names           = { game = "space-tower-defence-prod-game" }
  distribution_ids      = { player = "E1PLAYER" }
  monthly_budget_usd    = 65
}

run "topic_policy_keeps_the_default_statement_and_adds_budgets" {
  command = apply
  assert {
    condition     = length(jsondecode(aws_sns_topic_policy.alerts.policy).Statement) == 2
    error_message = "the alerts topic policy must hold exactly DefaultOwner and AllowBudgets"
  }

  assert {
    condition = (
      [for s in jsondecode(aws_sns_topic_policy.alerts.policy).Statement : s if s.Sid == "DefaultOwner"][0].Principal.AWS == "*" &&
      [for s in jsondecode(aws_sns_topic_policy.alerts.policy).Statement : s if s.Sid == "DefaultOwner"][0].Condition.StringEquals["AWS:SourceOwner"] == "123456789012" &&
      toset([for s in jsondecode(aws_sns_topic_policy.alerts.policy).Statement : s if s.Sid == "DefaultOwner"][0].Action) == toset([
        "SNS:GetTopicAttributes", "SNS:SetTopicAttributes", "SNS:AddPermission", "SNS:RemovePermission",
        "SNS:DeleteTopic", "SNS:Subscribe", "SNS:ListSubscriptionsByTopic", "SNS:Publish",
      ])
    )
    error_message = "DefaultOwner must reproduce SNS's default statement (same account, all eight actions), or CloudWatch alarms stop publishing"
  }

  assert {
    condition = (
      [for s in jsondecode(aws_sns_topic_policy.alerts.policy).Statement : s if s.Sid == "AllowBudgets"][0].Principal.Service == "budgets.amazonaws.com" &&
      [for s in jsondecode(aws_sns_topic_policy.alerts.policy).Statement : s if s.Sid == "AllowBudgets"][0].Action == "SNS:Publish" &&
      [for s in jsondecode(aws_sns_topic_policy.alerts.policy).Statement : s if s.Sid == "AllowBudgets"][0].Condition.StringEquals["aws:SourceAccount"] == "123456789012" &&
      [for s in jsondecode(aws_sns_topic_policy.alerts.policy).Statement : s if s.Sid == "AllowBudgets"][0].Condition.ArnLike["aws:SourceArn"] == "arn:aws:budgets::123456789012:*"
    )
    error_message = "AllowBudgets must let only this account's budgets publish, and only Publish"
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_sns_topic_policy.alerts.policy).Statement :
      s.Effect == "Allow" && s.Resource == "arn:aws:sns:eu-west-2:123456789012:space-tower-defence-prod-alerts"
    ])
    error_message = "the topic policy holds only the two Allow statements, each on this topic only"
  }
}

run "budget_is_monthly_usd_with_three_alerts" {
  command = plan

  assert {
    condition = (
      aws_budgets_budget.monthly.name == "space-tower-defence-prod-monthly" &&
      aws_budgets_budget.monthly.budget_type == "COST" &&
      aws_budgets_budget.monthly.time_unit == "MONTHLY" &&
      aws_budgets_budget.monthly.limit_unit == "USD" &&
      aws_budgets_budget.monthly.limit_amount == "65.00"
    )
    error_message = "the budget must be a monthly USD cost budget of 65.00"
  }

  assert {
    condition = toset([for n in aws_budgets_budget.monthly.notification : "${n.notification_type}:${n.threshold}:${n.threshold_type}:${n.comparison_operator}"]) == toset([
      "ACTUAL:50:PERCENTAGE:GREATER_THAN", "ACTUAL:80:PERCENTAGE:GREATER_THAN", "FORECASTED:100:PERCENTAGE:GREATER_THAN",
    ])
    error_message = "the budget alerts at 50% and 80% actual and 100% forecast"
  }

  assert {
    condition     = length(aws_budgets_budget.monthly.cost_filter) == 0
    error_message = "the budget covers the whole account (no cost filter)"
  }
}
