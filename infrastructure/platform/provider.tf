terraform {
  # The same constraints as infrastructure/main. S3 native locking (use_lockfile) needs 1.11; platform-release.yml
  # installs the exact terraform_version from the env files.
  required_version = ">= 1.11, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.73, < 7.0"
    }
  }

  # Filled in by platform-release.yml with -backend-config:
  # bucket = <environment>-state-bucket-<project> (made by the owner's bootstrap), key = platform/terraform.tfstate,
  # region, use_lockfile = true (S3 native locking, no DynamoDB lock table), encrypt = true.
  backend "s3" {}
}

provider "aws" {
  region = var.region

  # A plan or apply fails unless the credentials are for the account the env file names.
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = local.default_tags
  }
}
