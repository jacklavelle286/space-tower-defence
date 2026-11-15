# Alarm topics and the alarms that are not per function (plan H.14, spine S11.5). The Lambda Errors, Throttles and
# Duration alarms live in the lambda_function module and publish to this module's eu-west-2 topic.
# Tags come from the providers' default_tags.
#
# Shape (H.14): Sum >= 1 over one 5-minute period, treat_missing_data = notBreaching, alarm and OK actions to the same
# topic, unless noted. Thresholds are [ASSUMPTION].
#
# Deliberately absent:
# - Backup alarms: the backup module arrives in Phase 33.
# - Topic encryption: CloudWatch alarms cannot publish to a topic encrypted with the AWS-managed SNS key, and alarm
#   text carries no player data; a customer-managed key is not worth its cost here.
# - A dashboard (H.14: a cheap later addition).

# ---------------------------------------------------------------------------
# Topics: one per Region, one e-mail subscription each. Subscriptions stay "pending confirmation" until the owner
# clicks the link; SNS deletes unconfirmed ones after 48 h (H.14, H.15.2).
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${var.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

# us-east-1 mirror for the CloudFront alarms (alarm actions go to a topic in the alarm's own Region).
resource "aws_sns_topic" "alerts_use1" {
  provider = aws.us_east_1

  name = "${var.name_prefix}-alerts-use1"
}

resource "aws_sns_topic_subscription" "alerts_use1_email" {
  provider = aws.us_east_1

  topic_arn = aws_sns_topic.alerts_use1.arn
  protocol  = "email"
  endpoint  = var.notification_email
}

# ---------------------------------------------------------------------------
# API: the primary AC-40 signal. A handler that catches an error and returns 500 never raises Lambda Errors.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.name_prefix}-api-5xx"
  alarm_description   = "HTTP API: 5xx responses (Sum >= 1 in 5 min), including function crashes and timeouts."
  namespace           = "AWS/ApiGateway"
  metric_name         = "5xx"
  dimensions          = { ApiId = var.api_id, Stage = var.api_stage }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# ---------------------------------------------------------------------------
# Log-derived alarms. The functions log JSON (H.4.4) with the allow-listed result and code fields (G §15).
# No default_value: a quiet period has no data points, which notBreaching treats as OK.
# ---------------------------------------------------------------------------

locals {
  log_alarms = {
    "ops-rejected" = {
      log_group   = var.ops_log_group_name
      pattern     = "{ $.result = \"REJECTED\" }"
      metric_name = "OpsRejected"
      description = "player-api: an op was REJECTED (a rule mismatch or tampering, spine S7.5)."
    }
    "speech-unavailable" = {
      log_group   = var.speech_log_group_name
      pattern     = "{ $.code = \"SPEECH_UNAVAILABLE\" }"
      metric_name = "SpeechUnavailable"
      description = "tts: an approved clip is missing on the server (H.13.3 D)."
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "this" {
  for_each = local.log_alarms

  name           = "${var.name_prefix}-${each.key}"
  log_group_name = each.value.log_group
  pattern        = each.value.pattern

  metric_transformation {
    namespace = var.metric_namespace
    name      = each.value.metric_name
    value     = "1"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "log" {
  for_each = local.log_alarms

  alarm_name          = "${var.name_prefix}-${each.key}"
  alarm_description   = "${each.value.description} (Sum >= 1 in 5 min)"
  namespace           = var.metric_namespace
  metric_name         = each.value.metric_name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  # The metric only exists once the filter does.
  depends_on = [aws_cloudwatch_log_metric_filter.this]
}

# ---------------------------------------------------------------------------
# DynamoDB: throttled reads or writes per table (capacity or on_demand_throughput ceiling).
# ThrottledRequests is published per TableName AND Operation, so a TableName-only alarm on it would see no data
# [UNVERIFIED]; Read/WriteThrottleEvents are per TableName, so the alarm sums those two instead.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "ddb_throttled" {
  for_each = var.table_names

  alarm_name          = "${var.name_prefix}-ddb-${each.key}-throttled"
  alarm_description   = "DynamoDB ${each.value}: throttled reads or writes (Sum >= 1 in 5 min)."
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]

  metric_query {
    id          = "throttled"
    expression  = "FILL(reads, 0) + FILL(writes, 0)"
    label       = "Read + write throttle events"
    return_data = true
  }

  metric_query {
    id = "reads"

    metric {
      namespace   = "AWS/DynamoDB"
      metric_name = "ReadThrottleEvents"
      dimensions  = { TableName = each.value }
      stat        = "Sum"
      period      = 300
    }
  }

  metric_query {
    id = "writes"

    metric {
      namespace   = "AWS/DynamoDB"
      metric_name = "WriteThrottleEvents"
      dimensions  = { TableName = each.value }
      stat        = "Sum"
      period      = 300
    }
  }
}

# ---------------------------------------------------------------------------
# CloudFront (us-east-1, mirror topic): edge or origin failures as a rate, Average over 5 minutes.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "cloudfront_5xx_rate" {
  for_each = var.distribution_ids
  provider = aws.us_east_1

  alarm_name          = "${var.name_prefix}-cloudfront-${each.key}-5xx-rate"
  alarm_description   = "CloudFront ${each.key} site: 5xx error rate above ${var.cloudfront_5xx_rate_threshold}% (Average over 5 min)."
  namespace           = "AWS/CloudFront"
  metric_name         = "5xxErrorRate"
  dimensions          = { DistributionId = each.value, Region = "Global" }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = var.cloudfront_5xx_rate_threshold
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts_use1.arn]
  ok_actions          = [aws_sns_topic.alerts_use1.arn]
}
