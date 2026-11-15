# Player pool: the shape production will use (spine S1, E §E.7.1), minus deletion protection.
resource "aws_cognito_user_pool" "player" {
  name           = "${local.name}-player"
  user_pool_tier = "ESSENTIALS" # managed login needs Essentials or Plus

  # Username + password only: no username_attributes or alias_attributes, no required e-mail or phone, nothing verified.
  auto_verified_attributes = []

  username_configuration {
    case_sensitive = false
  }

  admin_create_user_config {
    allow_admin_create_user_only = false # self sign-up on
  }

  # No self-service recovery: the owner resets passwords (E §E.7.1). Check: no "Forgot your password?" link.
  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  # sources/05 §1.5 proposal for children.
  password_policy {
    minimum_length                   = 8
    require_lowercase                = true
    require_uppercase                = false
    require_numbers                  = false
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  lambda_config {
    pre_sign_up = local.presignup_function.arn
  }

  deletion_protection = "INACTIVE" # throwaway
}

resource "aws_cognito_resource_server" "player" {
  user_pool_id = aws_cognito_user_pool.player.id
  identifier   = local.scope_server
  name         = "${local.name}-player-api"

  scope {
    scope_name        = "play"
    scope_description = "Spike player routes"
  }
}

resource "aws_cognito_user_pool_client" "player" {
  name         = "${local.name}-player"
  user_pool_id = aws_cognito_user_pool.player.id

  generate_secret                      = false # public client: a browser cannot keep a secret
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"] # authorisation code (+ PKCE, sent by the client)
  # openid alone is allowed too, so check.py --scopes openid can get a player token without the route scope.
  allowed_oauth_scopes         = concat(["openid"], tolist(aws_cognito_resource_server.player.scope_identifiers))
  supported_identity_providers = ["COGNITO"]
  callback_urls                = [local.callback_url]
  logout_urls                  = [local.logout_url]

  explicit_auth_flows           = var.spike_explicit_auth_flows
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 1
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}

resource "aws_cognito_user_pool_domain" "player" {
  domain                = var.player_domain_prefix
  user_pool_id          = aws_cognito_user_pool.player.id
  managed_login_version = 2 # managed login, not the classic hosted UI
}

# A client created by API has no managed-login style until one exists (sources/05 §2.2); the default look is enough.
resource "aws_cognito_managed_login_branding" "player" {
  user_pool_id                = aws_cognito_user_pool.player.id
  client_id                   = aws_cognito_user_pool_client.player.id
  use_cognito_provided_values = true
}
