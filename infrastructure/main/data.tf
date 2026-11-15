# AWS-managed CloudFront policies, looked up by name rather than hard-coded IDs (plan H.3.4).
# CachingOptimized serves each site's default behaviour; CachingDisabled and AllViewerExceptHostHeader serve /api/*.
# Nothing here reads the DNS account.

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host_header" {
  name = "Managed-AllViewerExceptHostHeader"
}

# The artefacts bucket belongs to the bootstrap root (plan H.5 B-6). Looked up so the plan fails loudly if it is missing.
data "aws_s3_bucket" "artifacts" {
  bucket = local.artifacts_bucket_name
}
