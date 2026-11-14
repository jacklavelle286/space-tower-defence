terraform {
  required_version = ">= 1.11.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0, < 7.0"
    }
  }

  # Filled in by the pipeline with -backend-config:
  # bucket = <environment>-state-bucket-<project>, key = main/terraform.tfstate,
  # region, use_lockfile = true (S3 native locking, no DynamoDB lock table).
  backend "s3" {}
}

provider "aws" {
  region              = var.region
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = {
      project     = var.project
      environment = var.environment
      managed_by  = "terraform"
    }
  }
}
