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

