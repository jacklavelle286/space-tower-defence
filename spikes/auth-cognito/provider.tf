# Throwaway Terraform root for the M0-10 auth spike (build Phase 5). Applied and destroyed only by
# .github/workflows/spike.yml; never by hand. Delete this folder in Phase 6 once its state is empty.
terraform {
  # Same pins as infrastructure/main (plan H.17). CI installs the exact terraform_version from the env files.
  required_version = ">= 1.11, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.73, < 7.0"
    }
    # Zips the two Lambda handlers at plan time.
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.7, < 3.0"
    }
    # The operator's one-time temporary password (operator.tf).
    random = {
      source  = "hashicorp/random"
      version = ">= 3.7, < 4.0"
    }
  }

  # Filled in by spike.yml with -backend-config: bucket = prod-state-bucket-space-tower-defence,
  # key = spikes/auth-cognito/terraform.tfstate (never main/), region, use_lockfile = true.
  backend "s3" {}
}

provider "aws" {
  region              = var.region
  allowed_account_ids = [var.aws_account_id]

  default_tags {
    tags = local.default_tags
  }
}
