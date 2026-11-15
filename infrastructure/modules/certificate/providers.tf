terraform {
  required_version = ">= 1.11, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.73, < 7.0"
      # CloudFront only accepts certificates from us-east-1, so the caller must pass that provider explicitly.
      configuration_aliases = [aws.us_east_1]
    }
  }
}
