output "function_name" {
  description = "Function name."
  value       = aws_lambda_function.this.function_name
}

output "arn" {
  description = "Function ARN (Cognito trigger, invoke permissions)."
  value       = aws_lambda_function.this.arn
}

output "invoke_arn" {
  description = "Invoke ARN for an API Gateway integration (Phase 9)."
  value       = aws_lambda_function.this.invoke_arn
}

output "role_name" {
  description = "Execution role name."
  value       = aws_iam_role.this.name
}

output "log_group_name" {
  description = "Log group name (Phase 9 metric filters)."
  value       = aws_cloudwatch_log_group.this.name
}
