locals {
  # space-tower-defence-prod; regional resource names start with this (spine S1.1).
  name_prefix = "${var.project}-${var.environment}"

  # Bucket names are <bucket_prefix>-<purpose>-bucket (spine S1, plan H.3.3).
  bucket_prefix = "${var.aws_account_id}-${var.region}-${var.environment}"

  # Created by the bootstrap root (plan H.5 B-6); the main stack only looks it up.
  artifacts_bucket_name = "${local.bucket_prefix}-artifacts-bucket"

  # Applied once by both providers; modules do not repeat tags.
  default_tags = merge(
    {
      project     = var.project
      environment = var.environment
      managed_by  = "terraform"
    },
    var.extra_tags,
  )
}
