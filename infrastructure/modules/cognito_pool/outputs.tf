output "user_pool_id" {
  description = "User pool ID (config.json, runbooks)."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "User pool ARN (the pre sign-up invoke permission's source_arn)."
  value       = aws_cognito_user_pool.this.arn
}

output "issuer" {
  description = "Token issuer URL, https://cognito-idp.<region>.amazonaws.com/<pool id> (Phase 9 JWT authoriser)."
  value       = "https://${aws_cognito_user_pool.this.endpoint}"
}

output "client_id" {
  description = "App client ID (config.json; the JWT authoriser's audience)."
  value       = aws_cognito_user_pool_client.this.id
}

output "auth_domain" {
  description = "Managed-login host name."
  value       = "${aws_cognito_user_pool_domain.this.domain}.auth.${aws_cognito_user_pool.this.region}.amazoncognito.com"
}

output "scope" {
  description = "The route scope tokens from this client carry (<server>/<scope>)."
  value       = "${aws_cognito_resource_server.this.identifier}/${local.scope_name}"
}
