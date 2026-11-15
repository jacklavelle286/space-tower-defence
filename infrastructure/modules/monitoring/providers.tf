terraform {
  required_version = ">= 1.11, < 2.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.73, < 7.0"
      # CloudFront metrics are published in us-east-1, so their alarms and the mirror topic live there (plan H.14).
      configuration_aliases = [aws.us_east_1]
    }
  }
}
