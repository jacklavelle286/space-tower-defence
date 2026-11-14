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

# The keys below are shared with the bootstrap root through infrastructure/envs/*.json.
# They are declared here only so the shared env files load without warnings; the main stack does not use them.

variable "trusted_subs" {
  description = "Bootstrap only: GitHub OIDC subjects trusted by the CI role."
  type        = list(string)
  default     = []
}

variable "role_policy_arns" {
  description = "Bootstrap only: managed policies attached to the CI role."
  type        = list(string)
  default     = []
}

variable "terraform_version" {
  description = "Pipeline only: Terraform CLI version installed by the workflows."
  type        = string
  default     = ""
}
