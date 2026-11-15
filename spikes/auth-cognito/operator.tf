# Operator pool: AdminCreateUser only, TOTP MFA required, group "admin" (spine S1, E §E.7.1), plus "admin-extra".
resource "aws_cognito_user_pool" "operator" {
  name           = "${local.name}-operator"
  user_pool_tier = "ESSENTIALS"

  auto_verified_attributes = []

  username_configuration {
    case_sensitive = false
  }

  admin_create_user_config {
    allow_admin_create_user_only = true # no self sign-up
  }

  mfa_configuration = "ON"
  software_token_mfa_configuration {
    enabled = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "admin_only"
      priority = 1
    }
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  deletion_protection = "INACTIVE" # throwaway
}

resource "aws_cognito_user_group" "admin" {
  user_pool_id = aws_cognito_user_pool.operator.id
  name         = "admin"
  description  = "Operators (spike)"
}

# A second group, so the captured event shows how cognito:groups is serialised with more than one group (separator,
# brackets), and a name that starts with "admin" tests whole-name matching in the Phase 7 group helper (E §E.7.3).
resource "aws_cognito_user_group" "admin_extra" {
  user_pool_id = aws_cognito_user_pool.operator.id
  name         = "admin-extra"
  description  = "Second group for the serialisation check (spike)"
}

resource "aws_cognito_resource_server" "operator" {
  user_pool_id = aws_cognito_user_pool.operator.id
  identifier   = local.scope_server
  name         = "${local.name}-operator-api"

  scope {
    scope_name        = "admin"
    scope_description = "Spike operator routes"
  }
}

locals {
  operator_clients = {
    # The admin app's client: may ask for the admin scope.
    admin = concat(["openid"], tolist(aws_cognito_resource_server.operator.scope_identifiers))
    # Same pool, but never gets the admin scope: its access token reaches the authoriser (issuer and audience match)
    # and is refused only for the missing scope, which answers "401 or 403?" (E §E.7.3).
    noscope = ["openid"]
  }
}

resource "aws_cognito_user_pool_client" "operator" {
  for_each = local.operator_clients

  name         = "${local.name}-operator-${each.key}"
  user_pool_id = aws_cognito_user_pool.operator.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = each.value
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = [local.callback_url]
  logout_urls                          = [local.logout_url]

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

resource "aws_cognito_user_pool_domain" "operator" {
  domain                = var.operator_domain_prefix
  user_pool_id          = aws_cognito_user_pool.operator.id
  managed_login_version = 2
}

resource "aws_cognito_managed_login_branding" "operator" {
  for_each = aws_cognito_user_pool_client.operator

  user_pool_id                = aws_cognito_user_pool.operator.id
  client_id                   = each.value.id
  use_cognito_provided_values = true
}

# The test operator. Created here rather than by a local admin-create-user (no local-writes row exists for Phase 5):
# the temporary password is random, single-use (managed login forces a change and TOTP enrolment at first sign-in),
# kept out of logs and outputs, and handed to the owner through an SSM SecureString read with a read-only CLI call.
# It does sit in the spike state (encrypted bucket) until destroy; acceptable for a throwaway pool.
resource "random_password" "operator_temporary" {
  length           = 24
  min_upper        = 2
  min_lower        = 2
  min_numeric      = 2
  min_special      = 2
  override_special = "!#%*-_=+" # all in Cognito's allowed symbol set
}

resource "aws_cognito_user" "operator" {
  user_pool_id       = aws_cognito_user_pool.operator.id
  username           = "spike-operator"
  temporary_password = random_password.operator_temporary.result
  message_action     = "SUPPRESS" # no e-mail or SMS; the pool has no contact attributes
}

resource "aws_cognito_user_in_group" "operator_admin" {
  user_pool_id = aws_cognito_user_pool.operator.id
  group_name   = aws_cognito_user_group.admin.name
  username     = aws_cognito_user.operator.username
}

resource "aws_cognito_user_in_group" "operator_admin_extra" {
  user_pool_id = aws_cognito_user_pool.operator.id
  group_name   = aws_cognito_user_group.admin_extra.name
  username     = aws_cognito_user.operator.username
}

resource "aws_ssm_parameter" "operator_temporary_password" {
  name        = "${local.name}-operator-temporary-password"
  description = "One-time temporary password of spike-operator (auth spike). Destroyed with the stack."
  type        = "SecureString" # aws/ssm key
  value       = random_password.operator_temporary.result
}
