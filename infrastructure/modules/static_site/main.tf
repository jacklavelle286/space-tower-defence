# One static single-page app: private S3 bucket behind a CloudFront distribution through Origin Access Control (plan H.4.2),
# plus the HTTP API as a second origin at /api/* (plan E.2.1).
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

# Written with jsonencode, not an aws_iam_policy_document data source: the data source is read only at apply time
# whenever the distribution has pending changes, which made every distribution change show a phantom policy rewrite.
# Here the distribution ARN comes from state, so the plan shows a policy change only when the policy really changes.
locals {
  bucket_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # TLS only, for every principal.
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.this.arn, "${aws_s3_bucket.this.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      # Read through this distribution only (OAC signs as the CloudFront service principal; SourceArn pins the
      # distribution).
      {
        Sid       = "AllowCloudFrontReadThisDistribution"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.this.arn}/*"
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.this.arn } }
      },
      # Beyond H.4.2's read-only policy, on purpose: without ListBucket, S3 answers a missing key with 403, not 404, and
      # the H.8.6 smoke check needs a real 404 for /missing.js. Not reachable as a listing: the SPA function rewrites
      # "/" and extension-less paths to /index.html, and CachingOptimized forwards no query string to the origin.
      {
        Sid       = "AllowCloudFrontListThisDistribution"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:ListBucket"
        Resource  = aws_s3_bucket.this.arn
        Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.this.arn } }
      },
    ]
  })
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = local.bucket_policy

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
  s3_origin_id  = "s3-${var.bucket_name}"
  api_origin_id = "api"
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

  # The HTTP API's default endpoint, same-origin at /api/* (plan E.2.1). HTTPS only, TLS 1.2. The read timeout stays at
  # 30 s, the HTTP API integration limit, so the gateway (not CloudFront) answers a slow function.
  origin {
    origin_id   = local.api_origin_id
    domain_name = var.api_origin_domain

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "https-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }
  }

  # /api/* (plan H.4.2, E.2.1): all methods, nothing cached, every viewer header (Authorization included) except Host
  # forwarded, so the gateway sees its own host name. NO function association: the SPA fallback must never rewrite an
  # API path, and API errors keep their real status and JSON body. The security headers policy applies here too:
  # HSTS, nosniff, frame denial and no-referrer are right for JSON, and a CSP on a JSON response is inert.
  # https-only rather than redirect-to-https: a redirected POST would lose its body, so plain HTTP gets a 403.
  ordered_cache_behavior {
    path_pattern               = "/api/*"
    target_origin_id           = local.api_origin_id
    viewer_protocol_policy     = "https-only"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    compress                   = false # CachingDisabled turns compression off anyway
    cache_policy_id            = var.api_cache_policy_id
    origin_request_policy_id   = var.api_origin_request_policy_id
    response_headers_policy_id = var.response_headers_policy_id
  }

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
