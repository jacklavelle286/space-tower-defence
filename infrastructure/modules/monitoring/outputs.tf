output "alerts_topic_arn" {
  description = "eu-west-2 alarm topic (Lambda, API, DynamoDB and log alarms; runbook test alarm)."
  value       = aws_sns_topic.alerts.arn
}

output "alerts_topic_use1_arn" {
  description = "us-east-1 mirror topic (CloudFront alarms)."
  value       = aws_sns_topic.alerts_use1.arn
}

output "alarm_names" {
  description = "Alarms created here (the Lambda alarms are in each lambda_function call)."
  value = concat(
    [aws_cloudwatch_metric_alarm.api_5xx.alarm_name],
    [for a in aws_cloudwatch_metric_alarm.log : a.alarm_name],
    [for a in aws_cloudwatch_metric_alarm.ddb_throttled : a.alarm_name],
    [for a in aws_cloudwatch_metric_alarm.cloudfront_5xx_rate : a.alarm_name],
  )
}
