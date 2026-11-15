# The one HTTP API behind both distributions at /api/* (plan H.4.3, E.2.1, E.6). Payload format 2.0, the $default
# stage with auto-deploy, an allow-listed access log, two JWT authorisers, every catalogued route with its authoriser
# and scope, explicit throttles on every route, and one invoke permission per function.
# Tags come from the provider's default_tags.
#
# Deliberately absent:
# - cors_configuration: the API is same-origin through CloudFront (E.2.1); local development uses a Vite proxy.
# - A $default route (or ANY / greedy routes): an unknown path gets the gateway's own 404, and every route that exists
#   has an authoriser. A route with authoriser "none" fails the routes variable's validation.
# - disable_execute_api_endpoint: CloudFront's /api/* origin IS the default endpoint (no custom domain).
# - Detailed (per-route) metrics: the api-5xx alarm uses the API-level metric, which is free.

resource "aws_apigatewayv2_api" "this" {
  name          = var.name
  protocol_type = "HTTP"
  description   = "Same-origin /api/* for both sites (routes from contracts/routes.json)"
}

# ---------------------------------------------------------------------------
# Authorisers: the first layer of authorisation (E.7.3). The functions re-check route, token_use and groups.
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_authorizer" "this" {
  for_each = var.authorisers

  api_id           = aws_apigatewayv2_api.this.id
  name             = each.key
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    # Cognito access tokens carry no aud; the gateway checks client_id against this list instead (ADR-0012 check 5).
    issuer   = each.value.issuer
    audience = each.value.audience
  }
}

# ---------------------------------------------------------------------------
# Integrations: one per function, Lambda proxy, payload 2.0 set explicitly (the provider default is 1.0).
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_integration" "this" {
  for_each = var.functions

  api_id                 = aws_apigatewayv2_api.this.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = each.value.invoke_arn
  payload_format_version = "2.0"
}

# ---------------------------------------------------------------------------
# Routes: exactly the catalogue. Every route is JWT with its one scope.
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_route" "this" {
  for_each = var.routes

  api_id               = aws_apigatewayv2_api.this.id
  route_key            = each.key
  target               = "integrations/${aws_apigatewayv2_integration.this[each.value.function].id}"
  authorization_type   = "JWT"
  authorizer_id        = aws_apigatewayv2_authorizer.this[each.value.authoriser].id
  authorization_scopes = [each.value.scope]

}

# ---------------------------------------------------------------------------
# Stage and access log
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "access" {
  name              = "/aws/apigateway/${var.name}"
  retention_in_days = var.log_retention_days
}

locals {
  # Allow-list only (G §15, H.4.3): no path, query string, IP, user agent, headers or bodies. status is a string here.
  access_log_format = jsonencode({
    requestId          = "$context.requestId"
    routeKey           = "$context.routeKey"
    status             = "$context.status"
    durationMs         = "$context.responseLatency"
    integrationLatency = "$context.integrationLatency"
    integrationError   = "$context.integrationErrorMessage"
    authorizerError    = "$context.authorizer.error"
    sub                = "$context.authorizer.claims.sub"
  })

  # Every route gets explicit numbers, so nothing depends on how the service reads default_route_settings.
  route_throttles = {
    for key in keys(var.routes) : key => lookup(var.route_throttles, key, var.default_throttle)
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.this.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format          = local.access_log_format
  }

  # Stage-wide numbers, both set (a bare block may mean 0; sources/08 §d.3, [UNVERIFIED]).
  default_route_settings {
    throttling_rate_limit    = var.default_throttle.rate_limit
    throttling_burst_limit   = var.default_throttle.burst_limit
    detailed_metrics_enabled = false
  }

  dynamic "route_settings" {
    for_each = local.route_throttles

    content {
      route_key                = route_settings.key
      throttling_rate_limit    = route_settings.value.rate_limit
      throttling_burst_limit   = route_settings.value.burst_limit
      detailed_metrics_enabled = false
    }
  }

  # route_settings may only name routes that already exist.
  depends_on = [aws_apigatewayv2_route.this]
}

# ---------------------------------------------------------------------------
# Invoke permissions: one per function, scoped to this API (any stage, any route).
# ---------------------------------------------------------------------------

resource "aws_lambda_permission" "invoke" {
  for_each = var.functions

  statement_id  = "AllowHttpApiInvoke"
  action        = "lambda:InvokeFunction"
  function_name = each.value.function_name
  principal     = "apigateway.amazonaws.com"
  # arn:aws:execute-api:<region>:<account>:<api id>/<stage>/<method>/<path>; ArnLike's * spans the slashes.
  source_arn = "${aws_apigatewayv2_api.this.execution_arn}/*/*"
}
