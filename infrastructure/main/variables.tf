variable "project" {
  description = "Project name, used in resource names and tags."
  type        = string
}

variable "environment" {
  description = "Deployment environment (prod only for now)."
  type        = string
}

variable "region" {
  description = "Primary AWS region for the workload."
  type        = string
}

variable "aws_account_id" {
  description = "Workload account ID; the provider refuses to run against any other account."
  type        = string
}

variable "extra_tags" {
  description = "Extra tags merged into the providers' default_tags. Same key as the bootstrap root, so one env key serves both."
  type        = map(string)
  default     = {}
}

# ---------------------------------------------------------------------------
# Hostnames and DNS (plan H.6, H.15). DNS itself is owner-owned: this stack
# creates no Route 53 zone or record.
# ---------------------------------------------------------------------------

variable "domain_name" {
  description = "Parent domain (jackgl.com). Used only in validations, descriptions and outputs; the zone is not managed here."
  type        = string
}

variable "player_hostname" {
  description = "Player site hostname (aliens.jackgl.com). Primary name on the certificate."
  type        = string

  validation {
    condition     = endswith(var.player_hostname, ".${var.domain_name}")
    error_message = "player_hostname must be a subdomain of domain_name."
  }
}

variable "admin_hostname" {
  description = "Admin site hostname (admin.aliens.jackgl.com). Subject alternative name on the certificate."
  type        = string

  validation {
    condition     = endswith(var.admin_hostname, ".${var.domain_name}") && var.admin_hostname != var.player_hostname
    error_message = "admin_hostname must be a subdomain of domain_name and differ from player_hostname."
  }
}

# ---------------------------------------------------------------------------
# Keys used from later phases (declared now so the env files load cleanly).
# ---------------------------------------------------------------------------

variable "notification_email" {
  description = "Alarm e-mail address for the SNS subscriptions (monitoring, Phase 9)."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.notification_email))
    error_message = "notification_email must look like an e-mail address."
  }
}

variable "signup_daily_cap" {
  description = "Player self sign-ups allowed per UTC day, enforced by the pre-sign-up function (spine S1.2)."
  type        = number
  default     = 20

  validation {
    condition     = var.signup_daily_cap >= 0 && floor(var.signup_daily_cap) == var.signup_daily_cap
    error_message = "signup_daily_cap must be a whole number >= 0."
  }
}

variable "player_signup_closed" {
  description = "Kill switch: true sets allow_admin_create_user_only on the player pool. Changed only through a release (spine S1.2)."
  type        = bool
  default     = false
}

variable "player_auth_domain_prefix" {
  description = "Cognito managed-login prefix domain for the player pool (<prefix>.auth.<region>.amazoncognito.com)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", var.player_auth_domain_prefix)) && !can(regex("aws|amazon|cognito", var.player_auth_domain_prefix))
    error_message = "player_auth_domain_prefix must be lowercase letters, digits and hyphens (max 63) and must not contain aws, amazon or cognito."
  }
}

variable "operator_auth_domain_prefix" {
  description = "Cognito managed-login prefix domain for the operator pool (<prefix>.auth.<region>.amazoncognito.com)."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", var.operator_auth_domain_prefix)) && !can(regex("aws|amazon|cognito", var.operator_auth_domain_prefix)) && var.operator_auth_domain_prefix != var.player_auth_domain_prefix
    error_message = "operator_auth_domain_prefix must be lowercase letters, digits and hyphens (max 63), must not contain aws, amazon or cognito, and must differ from player_auth_domain_prefix."
  }
}

variable "tts_voice_id" {
  description = "Polly voice for new speech previews (passed to tts and admin-api). Changes affect new previews only."
  type        = string
  default     = "Amy"
}

variable "tts_engine" {
  description = "Polly engine for words, instructions and dictation."
  type        = string
  default     = "generative"

  validation {
    condition     = contains(["standard", "neural", "long-form", "generative"], var.tts_engine)
    error_message = "tts_engine must be one of standard, neural, long-form, generative."
  }
}

variable "tts_phoneme_engine" {
  description = "Polly engine for PHONEME and LETTER_NAME speech. neural until the M0 listening bake-off says generative is safe."
  type        = string
  default     = "neural"

  validation {
    condition     = contains(["neural", "generative"], var.tts_phoneme_engine)
    error_message = "tts_phoneme_engine must be neural or generative."
  }
}

# ---------------------------------------------------------------------------
# Bootstrap-only and pipeline-only keys. They sit in the shared env files, so
# they are declared here only to stop "undeclared variable" warnings. Unused.
# ---------------------------------------------------------------------------

variable "trusted_subs" {
  description = "Bootstrap only: GitHub OIDC subjects trusted by the CI role. Unused here."
  type        = list(string)
  default     = []
}

variable "role_policy_arns" {
  description = "Bootstrap only: managed policies attached to the CI role. Unused here."
  type        = list(string)
  default     = []
}

variable "terraform_version" {
  description = "Pipeline only: Terraform CLI version installed by the workflows. Unused here."
  type        = string
  default     = null
}
