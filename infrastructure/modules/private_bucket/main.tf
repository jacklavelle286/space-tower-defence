# A private S3 bucket that nothing serves publicly (plan H.4.1, H.4.6). Called twice: the audio clips, and the pictures
# (Phase 42a). The artefacts bucket is in the bootstrap root (H.5 B-6). Readers use presigned URLs (audio), IAM roles,
# or, for the pictures bucket, CloudFront through a policy the root writes (manage_policy = false).
# Tags come from the provider's default_tags.
#
# Deliberately absent:
# - force_destroy: approved clips and pictures are referenced by content versions and must outlive any release (H.11.1).
# - Any expiry on current objects, except the prefixes a caller lists in expire_prefixes (picture job exchange files):
#   clip and picture keys are content-addressed and never overwritten (H.4.6). Otherwise only noncurrent versions and
#   abandoned multipart uploads expire.

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
  count = var.manage_policy ? 1 : 0

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
  count = var.manage_policy ? 1 : 0

  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.tls_only[0].json

  # Apply the policy after public access is blocked, so there is never a window with neither.
  depends_on = [aws_s3_bucket_public_access_block.this]
}

# The policy gained a count in Phase 42a; the audio bucket's existing policy keeps its state, no destroy and create.
moved {
  from = aws_s3_bucket_policy.this
  to   = aws_s3_bucket_policy.this[0]
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

  # Short-lived exchange files under a prefix (the picture jobs/ prefix, 14 days). None for the audio bucket.
  dynamic "rule" {
    for_each = var.expire_prefixes

    content {
      id     = "expire-${trimsuffix(rule.key, "/")}"
      status = "Enabled"

      filter {
        prefix = rule.key
      }

      expiration {
        days = rule.value
      }
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}
