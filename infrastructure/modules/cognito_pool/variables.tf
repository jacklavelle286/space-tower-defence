variable "name" {
  description = "Pool name (space-tower-defence-prod-players or -operators, spine S1.1)."
  type        = string
}

variable "allow_admin_create_user_only" {
  description = "true: no self sign-up (operators always; players when the kill switch player_signup_closed is set)."
  type        = bool
}

variable "mfa_required" {
  description = "true: TOTP MFA required (operators). false: MFA off (players)."
  type        = bool
}

variable "password_policy" {
  description = "Password rules (sources/05 §1.5, §11)."
  type = object({
    minimum_length    = number
    require_lowercase = bool
    require_uppercase = bool
    require_numbers   = bool
    require_symbols   = bool
  })
}

variable "pre_sign_up_lambda_arn" {
  description = "Pre sign-up trigger function ARN, or null for none. The caller adds the cognito-idp invoke permission."
  type        = string
  default     = null
}

variable "domain_prefix" {
  description = "Managed-login prefix domain. Must not contain aws, amazon or cognito."
  type        = string
}

variable "scope" {
  description = "The one resource-server scope the app client may request, as <server>/<scope> (game/play, ops/content)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]+/[a-z0-9-]+$", var.scope))
    error_message = "scope must be <resource server>/<scope name>, lowercase letters, digits and hyphens."
  }
}

variable "scope_description" {
  description = "Description of the scope, shown in the Cognito console."
  type        = string
}

variable "client_name" {
  description = "App client name."
  type        = string
}

variable "callback_urls" {
  description = "Exact OAuth callback URLs (https://<host>/auth/callback)."
  type        = list(string)

  validation {
    condition     = length(var.callback_urls) > 0 && alltrue([for u in var.callback_urls : startswith(u, "https://")])
    error_message = "callback_urls must be a non-empty list of https URLs."
  }
}

variable "logout_urls" {
  description = "Exact sign-out URLs (https://<host>/)."
  type        = list(string)

  validation {
    condition     = length(var.logout_urls) > 0 && alltrue([for u in var.logout_urls : startswith(u, "https://")])
    error_message = "logout_urls must be a non-empty list of https URLs."
  }
}

variable "explicit_auth_flows" {
  description = "Auth flows the client allows. Never USER_PASSWORD, ADMIN_USER_PASSWORD or CUSTOM (sources/05 §4.2)."
  type        = list(string)

  validation {
    condition     = length(var.explicit_auth_flows) > 0 && length(setsubtract(var.explicit_auth_flows, ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_AUTH"])) == 0
    error_message = "explicit_auth_flows may contain only ALLOW_USER_SRP_AUTH, ALLOW_REFRESH_TOKEN_AUTH and ALLOW_USER_AUTH."
  }
}

variable "refresh_token_validity_days" {
  description = "Refresh-token lifetime in days (E.7.1: 90 players; operators 30, ADR-0042)."
  type        = number

  validation {
    condition     = var.refresh_token_validity_days >= 1 && var.refresh_token_validity_days <= 3650 && floor(var.refresh_token_validity_days) == var.refresh_token_validity_days
    error_message = "refresh_token_validity_days must be a whole number from 1 to 3650."
  }
}

variable "refresh_token_rotation" {
  description = "Refresh-token rotation (E.7.1: off for players, on for operators). Not compatible with ALLOW_REFRESH_TOKEN_AUTH."
  type        = bool
}

variable "refresh_token_rotation_grace_seconds" {
  description = "With rotation on: seconds the previous refresh token still works, so a lost response does not sign the user out."
  type        = number
  default     = 10

  validation {
    condition     = var.refresh_token_rotation_grace_seconds >= 0 && var.refresh_token_rotation_grace_seconds <= 60
    error_message = "refresh_token_rotation_grace_seconds must be 0 to 60."
  }
}

variable "groups" {
  description = "Groups to create, name => description. Membership is never managed here."
  type        = map(string)
  default     = {}
}
