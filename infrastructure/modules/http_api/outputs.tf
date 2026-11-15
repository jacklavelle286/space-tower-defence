output "api_id" {
  description = "API ID (the api-5xx alarm's ApiId dimension)."
  value       = aws_apigatewayv2_api.this.id
}

output "api_endpoint" {
  description = "Default endpoint, https://<id>.execute-api.<region>.amazonaws.com (smoke: optional direct check)."
  value       = aws_apigatewayv2_api.this.api_endpoint
}

output "endpoint_domain" {
  description = "The default endpoint's host name alone: the /api/* custom origin of both distributions."
  value       = trimprefix(aws_apigatewayv2_api.this.api_endpoint, "https://")
}

output "stage_name" {
  description = "Stage name ($default)."
  value       = aws_apigatewayv2_stage.default.name
}

output "execution_arn" {
  description = "Execution ARN (the invoke permissions' source_arn prefix)."
  value       = aws_apigatewayv2_api.this.execution_arn
}

output "route_keys" {
  description = "Route keys created (G-12 reads the plan; this is for readers)."
  value       = sort(keys(aws_apigatewayv2_route.this))
}

output "access_log_group_name" {
  description = "Access log group name."
  value       = aws_cloudwatch_log_group.access.name
}
