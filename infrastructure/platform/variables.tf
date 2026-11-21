# Values come from infrastructure/envs/common.auto.tfvars.json and infrastructure/envs/<environment>.tfvars.json, the
# files the owner's bootstrap reads too (docs/platform/02 §4).

variable "project" {
  description = "Project name, used in resource names and tags"
  type        = string
}

variable "region" {
  description = "The platform's home Region"
  type        = string
}

variable "environment" {
  description = "The platform account this plan is for"
  type        = string

  validation {
    condition     = contains(["sca-dev", "sca-prod"], var.environment)
    error_message = "environment must be sca-dev or sca-prod: this root deploys only the schools platform."
  }
}

variable "aws_account_id" {
  description = "The account the environment lives in; the provider refuses any other"
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}$", var.aws_account_id))
    error_message = "aws_account_id must be a 12-digit AWS account ID."
  }
}

variable "notification_email" {
  description = "Where the alerts topic sends email (the owner). AWS asks for confirmation after the first apply"
  type        = string

  validation {
    condition     = can(regex("^[^@ ]+@[^@ ]+\\.[^@ ]+$", var.notification_email))
    error_message = "notification_email must be an email address."
  }
}

# Values in the shared env files that this root does not use, declared so -var-file does not warn.

variable "terraform_version" {
  description = "Pipeline only (setup-terraform); declared so the shared env files do not warn"
  type        = string
  default     = null
}

variable "trusted_subs" {
  description = "Bootstrap only; declared so the shared env files do not warn"
  type        = list(string)
  default     = []
}

variable "role_policy_arns" {
  description = "Bootstrap only; declared so the shared env files do not warn"
  type        = list(string)
  default     = []
}
