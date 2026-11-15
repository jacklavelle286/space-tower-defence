# One static single-page app: private S3 bucket behind a CloudFront distribution through Origin Access Control (plan H.4.2).
# Called twice (player, admin). The CloudFront Function and the response headers policy are shared by both sites, so the
# root creates them once and passes them in. Tags come from the provider's default_tags.
#
# Deliberately absent:
# - custom_error_response: it applies to the whole distribution and would rewrite /api/* errors into index.html
#   (plan E.2.2). Deep links are handled by the viewer-request function on the default behaviour instead.
# - force_destroy: the bucket holds game-data versions that pinned runs need (plan H.11.1).

# ---------------------------------------------------------------------------
# Bucket
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name

  lifecycle {
    # Protection on from the first apply (spine S11.3). Lifting it is a reviewed commit, never a workflow input.
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

# SSE-S3. OAC can read it without any KMS grant.
resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Versioning keeps an overwritten index.html or config.json recoverable (plan H.11.1).
resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

data "aws_iam_policy_document" "bucket" {
  # TLS only, for every principal.
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

  # Read through this distribution only (OAC signs as the CloudFront service principal; SourceArn pins the distribution).
  # s3:ListBucket makes a missing key return 404 instead of 403, which the release smoke check relies on
  # (/missing.js must be a real 404, plan H.8.6). It lists nothing to viewers: "/" is served as index.html.
  statement {
    sid       = "AllowCloudFrontReadThisDistribution"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.this.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }

  # Beyond H.4.2's read-only policy, on purpose: without ListBucket, S3 answers a missing key with 403, not 404, and
  # the H.8.6 smoke check needs a real 404 for /missing.js. Not reachable as a listing: the SPA function rewrites "/"
  # and extension-less paths to /index.html, and CachingOptimized forwards no query string to the origin.
  statement {
    sid       = "AllowCloudFrontListThisDistribution"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.this.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.bucket.json

  # The public access block must exist first, or S3 may evaluate the policy before the block is in place.
  depends_on = [aws_s3_bucket_public_access_block.this]
}

# ---------------------------------------------------------------------------
# CloudFront
# ---------------------------------------------------------------------------

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = var.name
  description                       = "OAC for ${var.bucket_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

locals {
  s3_origin_id = "s3-${var.bucket_name}"
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  comment             = var.name
  aliases             = [var.hostname]
  default_root_object = "index.html"
  http_version        = "http2and3"
  is_ipv6_enabled     = true
  price_class         = var.price_class

  origin {
    origin_id                = local.s3_origin_id
    domain_name              = aws_s3_bucket.this.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  # Seam for Phase 9 (M1-07 part 2): the HTTP API endpoint becomes a second origin and an ordered_cache_behavior
  # "/api/*" goes here, with all methods, the managed CachingDisabled and AllViewerExceptHostHeader policies
  # (already looked up in the root's data.tf) and NO function association (plan E.2.1).

  default_cache_behavior {
    target_origin_id           = local.s3_origin_id
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = true
    cache_policy_id            = var.cache_policy_id
    response_headers_policy_id = var.response_headers_policy_id

    # SPA deep-link fallback on the default behaviour only (plan E.2.2).
    function_association {
      event_type   = "viewer-request"
      function_arn = var.viewer_request_function_arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}
