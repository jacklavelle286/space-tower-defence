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
# Sign-in, functions and (notification_email) monitoring.
# ---------------------------------------------------------------------------

variable "notification_email" {
  description = "Alarm e-mail address subscribed to both SNS topics (monitoring). The owner confirms each within 48 h."
  type        = string
  sensitive   = true # keeps the address out of plan text, which the run summary shows (H.7 W-4)

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
# Not in the env files: defaults, or generated per release (spine S1.3, plan H.3.2).
# ---------------------------------------------------------------------------

variable "lambda_artifacts" {
  description = "Function code per key: s3_key (lambda/<key>/<sha256-hex>.zip in the artefacts bucket) and sha256_b64. Generated per release as release.tfvars.json from the build manifest (plan H.8.2); never committed."
  type = map(object({
    s3_key     = string
    sha256_b64 = string
  }))

  validation {
    condition     = toset(keys(var.lambda_artifacts)) == toset(["player-api", "admin-api", "tts", "cognito-presignup"])
    error_message = "lambda_artifacts must have exactly the keys player-api, admin-api, tts and cognito-presignup."
  }

  validation {
    condition     = alltrue([for k, a in var.lambda_artifacts : can(regex("^lambda/${k}/[0-9a-f]{64}\\.zip$", a.s3_key))])
    error_message = "Each lambda_artifacts s3_key must be lambda/<its own key>/<64 lowercase hex digits>.zip."
  }

  validation {
    condition     = alltrue([for a in values(var.lambda_artifacts) : can(regex("^[A-Za-z0-9+/]{43}=$", a.sha256_b64))])
    error_message = "Each lambda_artifacts sha256_b64 must be a base64-encoded SHA-256 (44 characters ending in =)."
  }
}

variable "player_route_scope" {
  description = "Resource-server scope the player client carries and every player route requires (<server>/<scope>)."
  type        = string
  default     = "game/play"
}

variable "operator_route_scope" {
  description = "Resource-server scope the admin client carries and every /api/admin route requires (<server>/<scope>)."
  type        = string
  default     = "ops/content"

  validation {
    condition     = split("/", var.operator_route_scope)[0] != split("/", var.player_route_scope)[0]
    error_message = "operator_route_scope and player_route_scope must use different resource servers."
  }
}

variable "table_name_overrides" {
  description = "Restore cut-over only (plan H.13.3): point the functions at a restored table, e.g. { game = \"...\" }. The managed tables are unchanged."
  type        = map(string)
  default     = {}

  validation {
    condition     = length(setsubtract(keys(var.table_name_overrides), ["game", "content"])) == 0
    error_message = "table_name_overrides may only have the keys game and content."
  }
}

variable "log_retention_days" {
  description = "Retention of the function log groups (spine S1)."
  type        = number
  default     = 7

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.log_retention_days)
    error_message = "log_retention_days must be a CloudWatch Logs retention value (1, 3, 5, 7, 14, 30, 60, 90, ...)."
  }
}

variable "audit_log_retention_days" {
  description = "Retention of the admin-api log group, which holds the publication audit lines (spine S8.3)."
  type        = number
  default     = 90

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1096, 1827, 2192, 2557, 2922, 3288, 3653], var.audit_log_retention_days)
    error_message = "audit_log_retention_days must be a CloudWatch Logs retention value (1, 3, 5, 7, 14, 30, 60, 90, ...)."
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
