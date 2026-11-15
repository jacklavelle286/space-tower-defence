# ---------------------------------------------------------------------------
# Spike settings. Change them in spike.auto.tfvars.json (committed), then run spike.yml plan and apply.
# ---------------------------------------------------------------------------

variable "spike_signup_cap" {
  description = "Spike stand-in for the daily sign-up cap: 0 makes the pre sign-up trigger refuse every self sign-up (to screenshot the message); any other value lets every sign-up through. The spike does not count sign-ups (README, 'Choices')."
  type        = number
  default     = 5

  validation {
    condition     = var.spike_signup_cap >= 0 && floor(var.spike_signup_cap) == var.spike_signup_cap
    error_message = "spike_signup_cap must be a whole number >= 0."
  }
}

variable "spike_explicit_auth_flows" {
  description = "explicit_auth_flows on every spike app client. Starts at the plan's proposal (sources/05 §4.2); narrow it to find the smallest set managed login still works with."
  type        = list(string)
  default     = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

  validation {
    condition     = length(setsubtract(var.spike_explicit_auth_flows, ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_AUTH"])) == 0
    error_message = "Only ALLOW_USER_SRP_AUTH, ALLOW_REFRESH_TOKEN_AUTH and ALLOW_USER_AUTH are allowed (never USER_PASSWORD, ADMIN_USER_PASSWORD or CUSTOM; sources/05 §4.2)."
  }
}

variable "player_domain_prefix" {
  description = "Managed-login prefix domain for the spike player pool. Globally unique per region; must not contain aws, amazon or cognito."
  type        = string
  default     = "space-tower-defence-spike-play"

  validation {
    condition     = startswith(var.player_domain_prefix, "space-tower-defence-spike-") && can(regex("^[a-z0-9-]{1,63}$", var.player_domain_prefix)) && !can(regex("aws|amazon|cognito", var.player_domain_prefix))
    error_message = "player_domain_prefix must start with space-tower-defence-spike-, use lowercase letters, digits and hyphens (max 63), and not contain aws, amazon or cognito."
  }
}

variable "operator_domain_prefix" {
  description = "Managed-login prefix domain for the spike operator pool."
  type        = string
  default     = "space-tower-defence-spike-admin"

  validation {
    condition     = startswith(var.operator_domain_prefix, "space-tower-defence-spike-") && can(regex("^[a-z0-9-]{1,63}$", var.operator_domain_prefix)) && !can(regex("aws|amazon|cognito", var.operator_domain_prefix))
    error_message = "operator_domain_prefix must start with space-tower-defence-spike-, use lowercase letters, digits and hyphens (max 63), and not contain aws, amazon or cognito."
  }
}

# ---------------------------------------------------------------------------
# Keys from infrastructure/envs/common.auto.tfvars.json and prod.tfvars.json, which spike.yml passes as var files.
# Same declaration pattern as infrastructure/main/variables.tf. Only project, environment, region, aws_account_id and
# extra_tags are used; the rest are declared to stop "undeclared variable" warnings.
# ---------------------------------------------------------------------------

variable "project" {
  description = "Project name, used in tags."
  type        = string
}

variable "environment" {
  description = "Deployment environment of the account (prod). Used in tags only."
  type        = string
}

variable "region" {
  description = "AWS region for the spike stack."
  type        = string
}

variable "aws_account_id" {
  description = "Workload account ID; the provider refuses to run against any other account."
  type        = string
}

variable "extra_tags" {
  description = "Extra tags merged into default_tags."
  type        = map(string)
  default     = {}
}

variable "domain_name" {
  description = "Unused here."
  type        = string
  default     = null
}

variable "player_hostname" {
  description = "Unused here."
  type        = string
  default     = null
}

variable "admin_hostname" {
  description = "Unused here."
  type        = string
  default     = null
}

variable "notification_email" {
  description = "Unused here."
  type        = string
  default     = null
}

variable "signup_daily_cap" {
  description = "Unused here: the production cap. The spike uses spike_signup_cap."
  type        = number
  default     = null
}

variable "player_signup_closed" {
  description = "Unused here."
  type        = bool
  default     = null
}

variable "player_auth_domain_prefix" {
  description = "Unused here: the production prefix. The spike uses player_domain_prefix."
  type        = string
  default     = null
}

variable "operator_auth_domain_prefix" {
  description = "Unused here: the production prefix. The spike uses operator_domain_prefix."
  type        = string
  default     = null
}

variable "tts_voice_id" {
  description = "Unused here."
  type        = string
  default     = null
}

variable "tts_engine" {
  description = "Unused here."
  type        = string
  default     = null
}

variable "tts_phoneme_engine" {
  description = "Unused here."
  type        = string
  default     = null
}

variable "trusted_subs" {
  description = "Bootstrap only. Unused here."
  type        = list(string)
  default     = []
}

variable "role_policy_arns" {
  description = "Bootstrap only. Unused here."
  type        = list(string)
  default     = []
}

variable "terraform_version" {
  description = "Pipeline only. Unused here."
  type        = string
  default     = null
}
