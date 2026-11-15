output "function_name" {
  description = "Function name."
  value       = aws_lambda_function.this.function_name
}

output "arn" {
  description = "Function ARN (Cognito trigger, invoke permissions)."
  value       = aws_lambda_function.this.arn
}

output "invoke_arn" {
  description = "Invoke ARN for the HTTP API integration."
  value       = aws_lambda_function.this.invoke_arn
}

output "role_name" {
  description = "Execution role name."
  value       = aws_iam_role.this.name
}

output "log_group_name" {
  description = "Log group name (monitoring metric filters)."
  value       = aws_cloudwatch_log_group.this.name
}

output "alarm_names" {
  description = "The function's alarm names (errors, throttles, duration)."
  value = [
    aws_cloudwatch_metric_alarm.errors.alarm_name,
    aws_cloudwatch_metric_alarm.throttles.alarm_name,
    aws_cloudwatch_metric_alarm.duration.alarm_name,
  ]
}
