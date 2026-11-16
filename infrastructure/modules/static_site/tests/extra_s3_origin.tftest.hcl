# The optional second bucket origin (the pictures at /pictures/*, Phase 42a). Offline: a mock provider ("apply" creates
# nothing; the mock only fills computed values), so nothing reaches AWS.
# Run from infrastructure/modules/static_site: terraform init -backend=false && terraform test (CI repo job).

mock_provider "aws" {}

variables {
  name                         = "space-tower-defence-prod-player"
  bucket_name                  = "123456789012-eu-west-2-prod-player-spa-bucket"
  hostname                     = "aliens.example.com"
  certificate_arn              = "arn:aws:acm:us-east-1:123456789012:certificate/abc"
  cache_policy_id              = "optimized"
  response_headers_policy_id   = "headers"
  viewer_request_function_arn  = "arn:aws:cloudfront::123456789012:function/spa"
  api_origin_domain            = "abc123.execute-api.eu-west-2.amazonaws.com"
  api_cache_policy_id          = "disabled"
  api_origin_request_policy_id = "allviewer"
}

run "without_an_extra_origin_nothing_changes" {
  command = apply

  assert {
    condition     = length(aws_cloudfront_distribution.this.origin) == 2 && length(aws_cloudfront_distribution.this.ordered_cache_behavior) == 1
    error_message = "no extra origin: the site and the API only"
  }
}

run "pictures_origin_and_behaviour" {
  command = apply

  variables {
    extra_s3_origin = {
      origin_id    = "s3-pictures"
      domain_name  = "123456789012-eu-west-2-prod-pictures-bucket.s3.eu-west-2.amazonaws.com"
      path_pattern = "/pictures/*"
    }
  }

  assert {
    condition = (
      length(aws_cloudfront_distribution.this.origin) == 3 &&
      length([for o in aws_cloudfront_distribution.this.origin : o if o.origin_id == "s3-pictures" && o.domain_name == "123456789012-eu-west-2-prod-pictures-bucket.s3.eu-west-2.amazonaws.com"]) == 1
    )
    error_message = "the pictures bucket is a third origin"
  }

  # /api/* stays first; /pictures/* is GET/HEAD only, HTTPS, cached, with the security headers and no SPA function.
  assert {
    condition = (
      aws_cloudfront_distribution.this.ordered_cache_behavior[0].path_pattern == "/api/*" &&
      aws_cloudfront_distribution.this.ordered_cache_behavior[1].path_pattern == "/pictures/*" &&
      aws_cloudfront_distribution.this.ordered_cache_behavior[1].target_origin_id == "s3-pictures" &&
      toset(aws_cloudfront_distribution.this.ordered_cache_behavior[1].allowed_methods) == toset(["GET", "HEAD"]) &&
      aws_cloudfront_distribution.this.ordered_cache_behavior[1].viewer_protocol_policy == "redirect-to-https" &&
      aws_cloudfront_distribution.this.ordered_cache_behavior[1].cache_policy_id == "optimized" &&
      aws_cloudfront_distribution.this.ordered_cache_behavior[1].response_headers_policy_id == "headers" &&
      length(aws_cloudfront_distribution.this.ordered_cache_behavior[1].function_association) == 0
    )
    error_message = "/pictures/* must be read-only, cached, keep the security headers, and never run the SPA fallback"
  }
}

run "the_extra_origin_cannot_take_the_api_path" {
  command = plan

  variables {
    extra_s3_origin = {
      origin_id    = "s3-pictures"
      domain_name  = "123456789012-eu-west-2-prod-pictures-bucket.s3.eu-west-2.amazonaws.com"
      path_pattern = "/api/*"
    }
  }

  expect_failures = [var.extra_s3_origin]
}
