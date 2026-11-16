# One Python Lambda function with its log group and its own role (plan H.4.4, E.6.4). Called five times (picture-gen from
# Phase 42b, ADR-0031).
# The code is a content-addressed zip in the artefacts bucket: the release build uploads lambda/<key>/<sha256>.zip and
# Terraform points the function at it (H.9.1), so the plan shows exactly which functions get new bytes.
# Tags come from the provider's default_tags.
#
# Deliberately absent:
# - reserved_concurrent_executions by default: only a caller that sets reserved_concurrency gets it (picture-gen: 2, a
#   hard ceiling on parallel paid Bedrock calls). The account's concurrency limit is 1000 (U-020 settled: [VERIFIED]
#   `aws lambda get-account-settings`, ConcurrentExecutions 1000, 2026-11-16), so reserving 2 starves nothing.
# - publish / aliases: API Gateway and Cognito invoke $LATEST; rollback is an earlier zip through a release (H.12).
# - logs:CreateLogGroup: the group is created here, before the function.
#
# Alarms (plan H.14, spine S11.5) live here, so every function has them by construction (gate G-5 checks each call
# passes alarm_topic_arn). Shape: one 5-minute period, notBreaching, alarm and OK actions to the same topic.

# Created before the function, so Lambda never creates an unmanaged group with no retention.
resource "aws_cloudwatch_log_group" "this" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days
}

data "aws_iam_policy_document" "assume" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "this" {
  name               = var.role_name
  assume_role_policy = data.aws_iam_policy_document.assume.json
}

data "aws_region" "current" {}

data "aws_caller_identity" "current" {}

locals {
  # Built from the name rather than read from the log group, so the policy is known (and reviewable) at plan time.
  log_group_arn = "arn:aws:logs:${data.aws_region.current.region}:${data.aws_caller_identity.current.account_id}:log-group:${aws_cloudwatch_log_group.this.name}"
}

# Write to its own log group only (the auth spike's proven shape: the group ARN plus ":*").
data "aws_iam_policy_document" "logs" {
  statement {
    sid       = "WriteOwnLogGroup"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${local.log_group_arn}:*"]
  }
}

resource "aws_iam_role_policy" "logs" {
  name   = "logs"
  role   = aws_iam_role.this.id
  policy = data.aws_iam_policy_document.logs.json
}

# Everything else the function may do (E.6.4), written by the caller.
resource "aws_iam_role_policy" "access" {
  name   = "access"
  role   = aws_iam_role.this.id
  policy = var.policy_json
}

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  description   = var.description
  role          = aws_iam_role.this.arn

  runtime       = "python3.14"
  architectures = ["arm64"]
  handler       = "handler.handler"
  memory_size   = var.memory_size
  timeout       = var.timeout

  # null (every function but picture-gen) leaves the function on the unreserved pool, as before.
  reserved_concurrent_executions = var.reserved_concurrency

  s3_bucket        = var.s3_bucket
  s3_key           = var.s3_key
  source_code_hash = var.source_code_sha256_b64

  logging_config {
    log_format = "JSON"
    log_group  = aws_cloudwatch_log_group.this.name
  }

  environment {
    variables = var.environment
  }

  # The role must be able to write logs before the first invocation.
  depends_on = [
    aws_iam_role_policy.logs,
    aws_iam_role_policy.access,
  ]
}

# ---------------------------------------------------------------------------
# Alarms (H.14): <alarm_name_prefix>-errors, -throttles, -duration.
# ---------------------------------------------------------------------------

locals {
  alarm_dimensions = { FunctionName = aws_lambda_function.this.function_name }

  # Duration near the timeout: a function that takes this long is about to time out (and API callers see a 5xx).
  duration_alarm_ms = floor(var.timeout * 1000 * var.duration_alarm_ratio)
}

# Unhandled errors, including the pre-sign-up function's cap refusals (it raises by design).
resource "aws_cloudwatch_metric_alarm" "errors" {
  alarm_name          = "${var.alarm_name_prefix}-errors"
  alarm_description   = "${var.function_name}: unhandled errors (Sum >= 1 in 5 min)."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = local.alarm_dimensions
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
}

# Concurrency refusals: the unreserved pool is shared by the functions; picture-gen is capped by its reservation.
resource "aws_cloudwatch_metric_alarm" "throttles" {
  alarm_name          = "${var.alarm_name_prefix}-throttles"
  alarm_description   = "${var.function_name}: throttled invocations (Sum >= 1 in 5 min)."
  namespace           = "AWS/Lambda"
  metric_name         = "Throttles"
  dimensions          = local.alarm_dimensions
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
}

# Beyond H.14's list [PROPOSAL]: a timeout is reported as an error only once it happens; this warns while it is close.
resource "aws_cloudwatch_metric_alarm" "duration" {
  alarm_name          = "${var.alarm_name_prefix}-duration"
  alarm_description   = "${var.function_name}: an invocation took >= ${local.duration_alarm_ms} ms of its ${var.timeout} s timeout (Maximum in 5 min)."
  namespace           = "AWS/Lambda"
  metric_name         = "Duration"
  dimensions          = local.alarm_dimensions
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = local.duration_alarm_ms
  treat_missing_data  = "notBreaching"
  alarm_actions       = [var.alarm_topic_arn]
  ok_actions          = [var.alarm_topic_arn]
}
