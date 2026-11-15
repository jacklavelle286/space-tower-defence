# Module wiring (plan H.3.5). Phase 2: the certificate. Phase 3: the two static sites.

# One certificate in us-east-1 (CloudFront requires it there) for both hostnames.
# Validation waits for the two CNAMEs the owner creates in the DNS account (docs/runbooks/dns-hand-off.md).
module "certificate" {
  source = "../modules/certificate"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  primary_hostname      = var.player_hostname
  alternative_hostnames = [var.admin_hostname]
  validation_timeout    = "30m"
}

# ---------------------------------------------------------------------------
# Shared by both sites: one CloudFront Function and one response headers policy.
# CloudFront resources are global; the default provider creates them.
# ---------------------------------------------------------------------------

# SPA deep-link fallback (plan E.2.2): extension-less paths outside /api/ become /index.html.
# Attached to each site's default behaviour only. Tested by scripts/tests/test_spa_fallback.py (node).
resource "aws_cloudfront_function" "spa_fallback" {
  name    = "${local.name_prefix}-spa-fallback"
  runtime = "cloudfront-js-2.0"
  comment = "SPA deep-link fallback: extension-less paths outside /api/ -> /index.html"
  code    = file("${path.module}/functions/spa-fallback.js")
  publish = true
}

locals {
  # Content Security Policy (plan H.4.2, E.10.3; outline in sources/08-aws-data-ops.md section c.4).
  # Shipped as Content-Security-Policy-Report-Only until M1 ends; then the header name changes to enforce it.
  # No report-uri/report-to yet (no endpoint exists): the M1 proof is a manual DevTools console check on both sites
  # (player game flow, admin), recorded before the switch to enforcing. Backlog B-2 adds a same-origin report route.
  # connect-src is 'self' only for now: the API is same-origin, and the Cognito and audio-bucket hosts do not exist
  # yet. When they arrive (Phase 8) the admin site needs the audio host too, and this policy splits into two.
  csp_directives = [
    "default-src 'self'",
    "script-src 'self'", # no inline or eval: Vite emits only external module scripts
    # 'unsafe-inline' is only for the one inline <style> in each built index.html. React style={{}} and Phaser set
    # element.style through the CSSOM, which CSP does not govern. Before enforcing: move those rules into the apps'
    # CSS (or use a 'sha256-...' source) so this becomes 'self' only.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:", # Phaser loads textures through blob: URLs and builds data: images
    "media-src 'self' blob:",     # audio played from locally stored bytes (plan E.9)
    "font-src 'self'",            # self-hosted woff2 in /assets
    "connect-src 'self'",         # same-origin /api, config.json and Phaser's XHR loader
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]
  content_security_policy = join("; ", local.csp_directives)
}

resource "aws_cloudfront_response_headers_policy" "security_headers" {
  name    = "${local.name_prefix}-security-headers"
  comment = "HSTS, nosniff, frame denial, no-referrer, CSP report-only (plan H.4.2, E.10.3)"

  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }
  }

  # Report-only first (plan H.4.2). It is a custom header because security_headers_config can only send the
  # enforcing Content-Security-Policy. When the CSP is enforced, this moves to security_headers_config.
  custom_headers_config {
    items {
      header   = "Content-Security-Policy-Report-Only"
      value    = local.content_security_policy
      override = true
    }
  }
}

# ---------------------------------------------------------------------------
# Static sites (plan H.4.2). The /api/* behaviour joins both in Phase 9.
# ---------------------------------------------------------------------------

module "player_site" {
  source = "../modules/static_site"

  name                        = "${local.name_prefix}-player"
  bucket_name                 = "${local.bucket_prefix}-player-spa-bucket"
  hostname                    = var.player_hostname
  certificate_arn             = module.certificate.certificate_arn
  cache_policy_id             = data.aws_cloudfront_cache_policy.caching_optimized.id
  response_headers_policy_id  = aws_cloudfront_response_headers_policy.security_headers.id
  viewer_request_function_arn = aws_cloudfront_function.spa_fallback.arn
}

module "admin_site" {
  source = "../modules/static_site"

  name                        = "${local.name_prefix}-admin"
  bucket_name                 = "${local.bucket_prefix}-admin-spa-bucket"
  hostname                    = var.admin_hostname
  certificate_arn             = module.certificate.certificate_arn
  cache_policy_id             = data.aws_cloudfront_cache_policy.caching_optimized.id
  response_headers_policy_id  = aws_cloudfront_response_headers_policy.security_headers.id
  viewer_request_function_arn = aws_cloudfront_function.spa_fallback.arn
}
