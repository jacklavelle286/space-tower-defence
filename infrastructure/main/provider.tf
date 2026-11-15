terraform {
  # S3 native locking (use_lockfile) is GA from 1.11. CI installs the exact terraform_version from the env files.
  required_version = ">= 1.11, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.73, < 7.0"
    }
    # One-time and test-account passwords (accounts.tf, ADR-0022).
    random = {
      source  = "hashicorp/random"
      version = "~> 3.9.1"
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
    tags = local.default_tags
  }
}

# us-east-1: the CloudFront viewer certificate, the CloudFront alarms and their SNS mirror topic (plan H.14).
provider "aws" {
  alias               = "us_east_1"
  region              = "us-east-1"
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = local.default_tags
  }
}

# No DNS-account provider: this stack writes no DNS records (plan H.15, docs/runbooks/dns-hand-off.md).
