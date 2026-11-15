# Operator and test accounts (ADR-0022, owner decision 2026-11-15). Terraform creates the owner's operator login and the
# three test accounts of plan I.2.10; nothing else. The owner's login is invited by e-mail; the test accounts use
# random passwords in SSM. Children's accounts are NEVER created here: children sign up
# themselves through managed login, and their usernames must never reach code or state.
#
# Passwords: random_password per account, written to a SecureString SSM parameter (default aws/ssm key) for the owner or
# the tests to read. They also sit in state (encrypted S3, admin-only), which ADR-0022 accepts. The two operator-pool
# accounts get a one-time temporary password: managed login forces a new password and TOTP enrolment at first sign-in,
# after which the value in state and SSM is useless. The two test players get a permanent password (the tests sign in
# with it).
#
# Password resets, MFA resets, disable and delete stay runbook commands (docs/runbooks/operator-accounts.md, sections 5
# and 6). ignore_changes on the users keeps those from showing as drift or being undone by the next apply.
#
# Kept in this file (variable, locals, resources, outputs) so the accounts are one reviewable unit.

variable "operator_email" {
  description = "E-mail address on the owner's operator login. Cognito sends the invitation (username + temporary password) there. Grown-ups' admin accounts only; children's accounts never have an e-mail."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.operator_email))
    error_message = "operator_email must look like an e-mail address."
  }
}

variable "operator_username" {
  description = "Username of the owner's operator login (operator pool, group admin). Not a real name; lower case (usernames are case-insensitive). Fixed once applied: Cognito cannot rename a user, so a change replaces it (new sub, new TOTP enrolment, new SSM parameter) and needs a reviewed commit lifting prevent_destroy first."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,31}$", var.operator_username)) && !startswith(var.operator_username, "test-")
    error_message = "operator_username must be 3-32 characters of lowercase letters, digits and hyphens, start with a letter, and not start with test- (reserved for test accounts)."
  }
}

locals {
  # Cognito's allowed password symbols include these; kept to ones that need no quoting in a shell or a URL form.
  password_special = "!#%*+-=_"

  # pool: which pool; temporary: true = one-time password, forced change (and TOTP enrolment) at first sign-in.
  accounts = {
    "test-operator" = { username = "test-operator", pool = "operators", temporary = true }
    "test-player-1" = { username = "test-player-1", pool = "players", temporary = false }
    "test-player-2" = { username = "test-player-2", pool = "players", temporary = false }
  }

  pool_ids = {
    operators = module.operator_pool.user_pool_id
    players   = module.player_pool.user_pool_id
  }

  account_parameter_prefix = "/${var.project}/${var.environment}/accounts"

  # Created by module.operator_pool (groups map in main.tf); the module exposes no group output, hence depends_on below.
  operator_group = "admin"
}

# 24 characters with every class: meets both pools' policies (operators: 12+, upper, lower, digit, symbol; players: 8+,
# lower). Changing an argument here replaces the password resource and the SSM value, but not an existing user
# (ignore_changes below); a user created later gets the new value, which SSM then holds.
resource "random_password" "account" {
  for_each = local.accounts

  length           = 24
  special          = true
  override_special = local.password_special
  min_lower        = 2
  min_upper        = 2
  min_numeric      = 2
  min_special      = 2
}

# Owner's operator login, by e-mail invitation (owner decision 2026-11-15): Cognito generates the temporary password
# and e-mails it with the username (the pool's invite_message_template), so no password of this account is ever in
# state or SSM. Status FORCE_CHANGE_PASSWORD until the first managed-login sign-in (new password + TOTP). The temporary
# password expires after 7 days (pool setting): a late first sign-in needs the runbook's reset row (or RESEND).
# Another grown-up admin = another resource like this one with their username and e-mail.
resource "aws_cognito_user" "operator" {
  user_pool_id             = local.pool_ids.operators
  username                 = var.operator_username
  desired_delivery_mediums = ["EMAIL"]

  attributes = {
    email          = var.operator_email
    email_verified = "true"
  }

  lifecycle {
    # Deleting the operator user loses its sub (audit lines name it) and its TOTP enrolment. Lifting this is a
    # reviewed commit, as for the pools.
    prevent_destroy = true

    # Reset and disable are runbook actions; Terraform must not undo them.
    ignore_changes = [temporary_password, password, enabled]
  }
}

resource "aws_cognito_user_in_group" "operator_admin" {
  user_pool_id = local.pool_ids.operators
  username     = aws_cognito_user.operator.username
  group_name   = local.operator_group

  depends_on = [module.operator_pool]
}

# Test accounts (plan I.2.10). test-operator is deliberately NOT in admin: it gives the API tests a real operator-pool
# token that is not an operator (the 403 checks). The test players are created by AdminCreateUser, which the pre sign-up
# trigger passes through uncounted (PreSignUp_AdminCreateUser), so they never use a place in the daily sign-up cap.
resource "aws_cognito_user" "test" {
  for_each = { for key, account in local.accounts : key => account if key != "operator" }

  user_pool_id       = local.pool_ids[each.value.pool]
  username           = each.value.username
  temporary_password = each.value.temporary ? random_password.account[each.key].result : null
  password           = each.value.temporary ? null : random_password.account[each.key].result
  message_action     = "SUPPRESS"

  # AdminCreateUser on the player pool runs the pre sign-up trigger: on a fresh environment Cognito must already be
  # allowed to invoke it, or the create is refused.
  depends_on = [aws_lambda_permission.presignup_from_player_pool]

  lifecycle {
    # The AC-02 drill resets test-player-2's password by runbook; set it back to the SSM value afterwards.
    ignore_changes = [temporary_password, password, enabled]
  }
}

# One SecureString per account, holding the password Terraform set (and would set again on a recreate). Read with
# --with-decryption (runbook). A runbook reset changes the user, not this value, so after the first sign-in of an
# operator-pool account it is stale by design. No ignore_changes: it follows random_password, so SSM always matches what
# a recreated user would get.
resource "aws_ssm_parameter" "account_password" {
  for_each = local.accounts

  name        = "${local.account_parameter_prefix}/${each.value.username}"
  description = each.value.temporary ? "One-time password for ${each.value.username} (${each.value.pool} pool); useless after first sign-in" : "Password for test account ${each.value.username} (${each.value.pool} pool)"
  type        = "SecureString" # default aws/ssm key
  value       = random_password.account[each.key].result
}

# Names only: the release run prints outputs, so no password (and no sensitive output) is ever exported.
output "account_usernames" {
  description = "Terraform-managed accounts (ADR-0022): key => username."
  value       = merge({ operator = var.operator_username }, { for key, account in local.accounts : key => account.username })
}

output "account_password_parameters" {
  description = "SSM SecureString parameter holding each test account's initial password: key => parameter name (the owner's login has none: invited by e-mail)."
  value       = { for key, p in aws_ssm_parameter.account_password : key => p.name }
}
