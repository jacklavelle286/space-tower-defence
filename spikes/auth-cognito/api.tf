# A tiny HTTP API with one JWT authoriser per pool and one scoped route each, both to the "api" function, which echoes
# the authoriser context it received (claims and scopes, never the raw token).
resource "aws_apigatewayv2_api" "spike" {
  name          = "${local.name}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_authorizer" "player" {
  api_id           = aws_apigatewayv2_api.spike.id
  name             = "${local.name}-player"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = "https://${aws_cognito_user_pool.player.endpoint}"
    audience = [aws_cognito_user_pool_client.player.id]
  }
}

resource "aws_apigatewayv2_authorizer" "operator" {
  api_id           = aws_apigatewayv2_api.spike.id
  name             = "${local.name}-operator"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer = "https://${aws_cognito_user_pool.operator.endpoint}"
    # Both operator clients, so the no-scope client's token fails on scope alone.
    audience = [for c in aws_cognito_user_pool_client.operator : c.id]
  }
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.spike.id
  integration_type       = "AWS_PROXY"
  integration_uri        = local.api_function.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "player" {
  api_id               = aws_apigatewayv2_api.spike.id
  route_key            = "GET /spike/player"
  target               = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.player.id
  authorization_scopes = [local.player_scope]
}

resource "aws_apigatewayv2_route" "admin" {
  api_id               = aws_apigatewayv2_api.spike.id
  route_key            = "GET /spike/admin"
  target               = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.operator.id
  authorization_scopes = [local.admin_scope]
}

resource "aws_cloudwatch_log_group" "api_access" {
  name              = "${local.name}-api-access"
  retention_in_days = 1
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.spike.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 10
    throttling_rate_limit  = 5
  }

  # authorizerError says why a token was refused. No source IP or user agent.
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access.arn
    format = jsonencode({
      requestId       = "$context.requestId"
      routeKey        = "$context.routeKey"
      status          = "$context.status"
      authorizerError = "$context.authorizer.error"
      integrationErr  = "$context.integrationErrorMessage"
    })
  }
}

resource "aws_lambda_permission" "api_from_gateway" {
  statement_id  = "AllowSpikeHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = local.api_function.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.spike.execution_arn}/*/*"
}
