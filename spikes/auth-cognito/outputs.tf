# check.py reads check_config; the rest are for reading in the spike.yml summary. Nothing here is secret.
output "check_config" {
  description = "Everything check.py needs (save as spikes/auth-cognito/outputs.json)."
  value = {
    region       = var.region
    api_url      = trimsuffix(aws_apigatewayv2_stage.default.invoke_url, "/")
    redirect_uri = local.callback_url
    logout_uri   = local.logout_url
    clients = {
      player = {
        domain      = "https://${aws_cognito_user_pool_domain.player.domain}.auth.${var.region}.amazoncognito.com"
        client_id   = aws_cognito_user_pool_client.player.id
        scopes      = "openid ${local.player_scope}"
        own_route   = "/spike/player"
        other_route = "/spike/admin"
      }
      operator = {
        domain      = "https://${aws_cognito_user_pool_domain.operator.domain}.auth.${var.region}.amazoncognito.com"
        client_id   = aws_cognito_user_pool_client.operator["admin"].id
        scopes      = "openid ${local.admin_scope}"
        own_route   = "/spike/admin"
        other_route = "/spike/player"
      }
      operator-noscope = {
        domain      = "https://${aws_cognito_user_pool_domain.operator.domain}.auth.${var.region}.amazoncognito.com"
        client_id   = aws_cognito_user_pool_client.operator["noscope"].id
        scopes      = "openid"
        own_route   = "/spike/admin"
        other_route = "/spike/player"
      }
    }
  }
}

output "player_pool_id" {
  value = aws_cognito_user_pool.player.id
}

output "operator_pool_id" {
  value = aws_cognito_user_pool.operator.id
}

output "player_signup_url" {
  description = "Managed-login sign-up page for the player client (open it, or run check.py --client player --signup)."
  value = format(
    "https://%s.auth.%s.amazoncognito.com/signup?client_id=%s&response_type=code&scope=%s&redirect_uri=%s",
    aws_cognito_user_pool_domain.player.domain, var.region, aws_cognito_user_pool_client.player.id,
    urlencode("openid ${local.player_scope}"), urlencode(local.callback_url),
  )
}

output "operator_temporary_password_parameter" {
  description = "SSM SecureString holding spike-operator's one-time temporary password (read it with get-parameter --with-decryption)."
  value       = aws_ssm_parameter.operator_temporary_password.name
}
