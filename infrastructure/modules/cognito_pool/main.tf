# One Cognito user pool with managed login, one resource server and scope, one public app client (code + PKCE) and
# optional groups (plan H.4.5, E.7.1, sources/05 §9 and §11). Called twice: players and operators. The resource shapes
# are the ones the auth spike proved (ADR-0012); production adds deletion protection, the real scopes and URLs.
# Tags come from the provider's default_tags.
#
# Change the pools only through Terraform: Cognito's update APIs reset any setting they are not given (sources/05 §9).
#
# Deliberately absent:
# - username_attributes, alias_attributes, auto-verified attributes, schema: username + password only. Profile data is
#   never a Cognito attribute (it would reach the ID token, E.7.1).
# - aws_cognito_user / aws_cognito_user_in_group: people and group membership are owner runbook steps (H.9.1).
# - A client secret: a browser cannot keep one.
#
# Client attributes are narrowed to one harmless standard attribute (sources/05 §4.5; ADR-0012 "Phase 8"). An omitted
# or empty list means ALL attributes, and ALLOW_USER_SRP_AUTH lets anyone holding the public client ID sign in through
# the SDK and get an access token WITH the aws.cognito.signin.user.admin scope (UpdateUserAttributes, DeleteUser). So
# narrowing matters: that token can then write only zoneinfo, and the ID token can carry only zoneinfo. [UNVERIFIED]
# that managed-login sign-up and sign-in work unchanged with this narrowing: checked live at the Phase 8 gate
# (docs/runbooks/operator-accounts.md, "Checks to record").

locals {
  # "game/play" -> resource server "game", scope "play".
  scope_parts       = split("/", var.scope)
  scope_server      = local.scope_parts[0]
  scope_name        = local.scope_parts[1]
  mfa_configuration = var.mfa_required ? "ON" : "OFF"

  # Not "none" (no such form): the smallest non-empty list, an attribute this design never uses.
  client_attributes = ["zoneinfo"]
}

resource "aws_cognito_user_pool" "this" {
  name           = var.name
  user_pool_tier = "ESSENTIALS" # managed login needs Essentials or Plus

  deletion_protection = "ACTIVE"

  # Immutable: a change here means a new pool and every account lost.
  username_configuration {
    case_sensitive = false
  }

  auto_verified_attributes = []

  admin_create_user_config {
    allow_admin_create_user_only = var.allow_admin_create_user_only
  }

  # No self-service recovery (no contact attributes): the owner resets passwords (E.7.1, ADR-0012 check 3).
  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  password_policy {
    minimum_length                   = var.password_policy.minimum_length
    require_lowercase                = var.password_policy.require_lowercase
    require_uppercase                = var.password_policy.require_uppercase
    require_numbers                  = var.password_policy.require_numbers
    require_symbols                  = var.password_policy.require_symbols
    temporary_password_validity_days = 7
  }

  # TOTP only: the pool has no phone or e-mail for SMS or e-mail MFA. With MFA "ON", managed login makes each new
  # operator enrol an authenticator app at first sign-in.
  mfa_configuration = local.mfa_configuration

  dynamic "software_token_mfa_configuration" {
    for_each = var.mfa_required ? [1] : []

    content {
      enabled = true
    }
  }

  dynamic "lambda_config" {
    for_each = var.pre_sign_up_lambda_arn == null ? [] : [var.pre_sign_up_lambda_arn]

    content {
      pre_sign_up = lambda_config.value
    }
  }

  lifecycle {
    # Replacing a pool loses every account. Lifting this is a reviewed commit (H.11.2).
    prevent_destroy = true
  }
}

# Managed-login prefix domain: <prefix>.auth.<region>.amazoncognito.com.
resource "aws_cognito_user_pool_domain" "this" {
  domain                = var.domain_prefix
  user_pool_id          = aws_cognito_user_pool.this.id
  managed_login_version = 2 # managed login, not the classic hosted UI
}

resource "aws_cognito_resource_server" "this" {
  user_pool_id = aws_cognito_user_pool.this.id
  identifier   = local.scope_server
  name         = "${var.name}-api"

  scope {
    scope_name        = local.scope_name
    scope_description = var.scope_description
  }
}

resource "aws_cognito_user_pool_client" "this" {
  name         = var.client_name
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret                      = false # public client
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"] # authorisation code; the library always sends PKCE (S256)
  allowed_oauth_scopes                 = concat(["openid"], tolist(aws_cognito_resource_server.this.scope_identifiers))
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls

  explicit_auth_flows           = var.explicit_auth_flows
  read_attributes               = local.client_attributes
  write_attributes              = local.client_attributes
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  # E.7.1: access and ID 60 minutes (not below one hour with managed login, sources/05 §3.5).
  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = var.refresh_token_validity_days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # Set explicitly either way, so the plan shows the choice (E.7.1: off for players, on for operators).
  refresh_token_rotation {
    feature = var.refresh_token_rotation ? "ENABLED" : "DISABLED"
    # 0 when off: AWS returns 0, and null makes provider 6.73 fail with "inconsistent result after apply".
    retry_grace_period_seconds = var.refresh_token_rotation ? var.refresh_token_rotation_grace_seconds : 0
  }
}

# A Terraform-created client has no managed-login style until one exists (sources/05 §2.2). Cognito's default look.
resource "aws_cognito_managed_login_branding" "this" {
  user_pool_id                = aws_cognito_user_pool.this.id
  client_id                   = aws_cognito_user_pool_client.this.id
  use_cognito_provided_values = true
}

resource "aws_cognito_user_group" "this" {
  for_each = var.groups

  user_pool_id = aws_cognito_user_pool.this.id
  name         = each.key
  description  = each.value
}
