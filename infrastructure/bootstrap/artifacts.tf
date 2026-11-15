# Release artefacts bucket (plan H.5 B-6, spine S11.1).
# Lives beside the module call, not inside the external terraform-bootstrap module, so the module's
# resources are untouched. Holds content-addressed Lambda zips (lambda/), static archives, release
# manifests (releases/) and saved plans (plans/<run_id>/). Created by the owner's local bootstrap apply,
# so it exists before the first release; the main stack only refers to it by name.

data "aws_caller_identity" "current" {}

locals {
  artifacts_bucket = "${data.aws_caller_identity.current.account_id}-${var.region}-${var.environment}-artifacts-bucket"
}

resource "aws_s3_bucket" "artifacts" {
  bucket = local.artifacts_bucket

  # Release history and rollback (artefacts_from) depend on this bucket. No force_destroy.
  lifecycle {
    prevent_destroy = true

    # bootstrap.sh passes aws_account_id from the env file; refuse to name a bucket in the wrong account.
    precondition {
      condition     = var.aws_account_id == null || var.aws_account_id == data.aws_caller_identity.current.account_id
      error_message = "The credentials are for a different AWS account than aws_account_id in the env file."
    }
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    object_ownership = "BucketOwnerEnforced" # ACLs disabled
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256" # SSE-S3
    }
  }
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_iam_policy_document" "artifacts_tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id
  policy = data.aws_iam_policy_document.artifacts_tls_only.json

  # Apply the policy after public access is blocked, so there is never a window with neither.
  depends_on = [aws_s3_bucket_public_access_block.artifacts]
}

resource "aws_s3_bucket_lifecycle_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  # Saved plans are only needed between the plan and apply dispatches. Nothing else expires.
  rule {
    id     = "expire-saved-plans"
    status = "Enabled"

    filter {
      prefix = "plans/"
    }

    expiration {
      days = 30
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }

  # Removes the delete markers left once a saved plan's versions have expired. Must be its own rule:
  # expired_object_delete_marker cannot be combined with days in one expiration block.
  rule {
    id     = "remove-expired-plan-markers"
    status = "Enabled"

    filter {
      prefix = "plans/"
    }

    expiration {
      expired_object_delete_marker = true
    }
  }

  depends_on = [aws_s3_bucket_versioning.artifacts]
}
