variable "project" {
  description = "The project name"
  type        = string
}

variable "region" {
  description = "The AWS region to deploy resources in"
  type        = string
}

variable "environment" {
  description = "The environment to deploy resources in"
  type        = string
}

# Only read by bootstrap.sh (account safety check); declared so Terraform
# doesn't warn about it.
variable "aws_account_id" {
  description = "AWS account this environment must be applied to"
  type        = string
  default     = null
}

variable "extra_tags" {
  description = "Extra tags to apply to resources"
  type        = map(string)
  default     = {}
}

variable "trusted_subs" {
  description = "GitHub OIDC subject patterns allowed to assume the CI role"
  type        = list(string)
}

variable "role_policy_arns" {
  description = "Managed policy ARNs to attach to the CI role"
  type        = list(string)
  default     = []
}

variable "ecr_repos" {
  description = "ECR repositories to create (leave empty for none)"
  type = list(object({
    repo_name = string
  }))
  default = []
}


# ---------------------------------------------------------------------------
# Main-only keys (plan H.5 B-5, H.6). bootstrap.sh passes both env files to this
# root, so every key in them must be declared here too. None is used here.
# ---------------------------------------------------------------------------

variable "terraform_version" {
  description = "Pipeline only (CI setup-terraform); declared so bootstrap.sh's -var-file does not warn"
  type        = string
  default     = null
}

variable "domain_name" {
  description = "Main-only; declared so bootstrap.sh's -var-file does not warn"
  type        = string
  default     = null
}

variable "player_hostname" {
  description = "Main-only; declared so bootstrap.sh's -var-file does not warn"
  type        = string
  default     = null
}

variable "admin_hostname" {
  description = "Main-only; declared so bootstrap.sh's -var-file does not warn"
  type        = string
  default     = null
}

variable "notification_email" {
  description = "Main-only; declared so bootstrap.sh's -var-file does not warn"
  type        = string
  default     = null
}

variable "signup_daily_cap" {
  description = "Main-only; declared so bootstrap.sh's -var-file does not warn"
  type        = number
  default     = null
}

variable "player_signup_closed" {
  description = "Main-only; declared so bootstrap.sh's -var-file does not warn"
  type        = bool
  default     = null
}

variable "player_auth_domain_prefix" {
  description = "Main-only; declared so bootstrap.sh's -var-file does not warn"
  type        = string
  default     = null
}

variable "operator_auth_domain_prefix" {
  description = "Main-only; declared so bootstrap.sh's -var-file does not warn"
  type        = string
  default     = null
}

variable "tts_voice_id" {
  description = "Main-only; declared so bootstrap.sh's -var-file does not warn"
  type        = string
  default     = null
}

variable "tts_engine" {
  description = "Main-only; declared so bootstrap.sh's -var-file does not warn"
  type        = string
  default     = null
}

variable "tts_phoneme_engine" {
  description = "Main-only; declared so bootstrap.sh's -var-file does not warn"
  type        = string
  default     = null
}
