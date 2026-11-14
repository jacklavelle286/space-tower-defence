terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0, < 7.0"
    }
  }

  backend "s3" {}
}

provider "aws" {
  region = var.region
}

module "bootstrap" {
  source = "git::ssh://git@github.com/jacklavelle286/terraform-bootstrap.git//modules/bootstrap?ref=v1.0.0"

  project          = var.project
  environment      = var.environment
  tags             = var.extra_tags
  trusted_subs     = var.trusted_subs
  role_policy_arns = var.role_policy_arns
  ecr_repos        = var.ecr_repos
  # Bucket for infrastructure/main's state (not this stack's own state).
  state_bucket_name = local.state_bucket

}
