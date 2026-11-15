# A private S3 bucket that nothing serves publicly (plan H.4.1, H.4.6). Called once, for the audio clips; the artefacts
# bucket is in the bootstrap root (H.5 B-6). Readers use presigned URLs (audio) or IAM roles; there is no CloudFront.
# Tags come from the provider's default_tags.
#
# Deliberately absent:
# - force_destroy: approved clips are referenced by content versions and must outlive any release (H.11.1).
# - Any expiry on current objects: clip keys are content-addressed and never overwritten (H.4.6). Only noncurrent
#   versions and abandoned multipart uploads expire.

resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name

  lifecycle {
    # Protection on from the first apply (spine S11.3).
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ACLs disabled; the account owns every object whoever uploads it.
resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# SSE-S3: presigned GETs work without any KMS grant.
resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_iam_policy_document" "tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.this.arn,
      "${aws_s3_bucket.this.arn}/*",
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

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.tls_only.json

  # Apply the policy after public access is blocked, so there is never a window with neither.
  depends_on = [aws_s3_bucket_public_access_block.this]
}

# Script on the two sites reads the bytes (fetch), so the browser needs CORS even though <audio src> would not
# (plan E.9). Simple GET/HEAD requests only: no allowed headers.
resource "aws_s3_bucket_cors_configuration" "this" {
  count = length(var.cors_allowed_origins) > 0 ? 1 : 0

  bucket = aws_s3_bucket.this.id

  cors_rule {
    allowed_origins = var.cors_allowed_origins
    allowed_methods = ["GET", "HEAD"]
    expose_headers  = ["ETag", "Content-Length", "Content-Type"]
    max_age_seconds = var.cors_max_age_seconds
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  # Objects are never overwritten (If-None-Match: *), so a noncurrent version only appears after a delete by hand.
  # Thirty days to undo that, then it goes.
  rule {
    id     = "expire-noncurrent-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}
