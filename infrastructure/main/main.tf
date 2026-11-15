# Module wiring (plan H.3.5). Phase 2: the certificate. Phase 3: the two static sites. Phase 8: tables, audio bucket,
# Cognito pools and the four functions.

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

# ---------------------------------------------------------------------------
# Data (plan H.4.6, F §12.1). Protection on from the first apply (spine S11.3).
# ---------------------------------------------------------------------------

module "game_table" {
  source = "../modules/dynamodb_table"

  name          = local.managed_table_names.game
  ttl_attribute = "ttl" # only SYS#SIGNUPS items carry it (spine S1.2)
}

module "content_table" {
  source = "../modules/dynamodb_table"

  name = local.managed_table_names.content
}

# Speech clips, tts/v1/<clipKey>.mp3, fetched by both sites' scripts through presigned URLs (plan E.9).
module "audio_bucket" {
  source = "../modules/private_bucket"

  bucket_name          = local.audio_bucket_name
  cors_allowed_origins = local.origins
}

# ---------------------------------------------------------------------------
# Functions (plan H.4.4, E.6.4). One role each; code from the artefacts bucket by content hash (H.9.1).
# Every role also writes to its own log group (added by the module). No reserved concurrency (account limit 10, U-020).
# ---------------------------------------------------------------------------

# player-api: every player route except speech. game items under U#<sub> only; content read-only; bounds files.
data "aws_iam_policy_document" "player_api" {
  statement {
    sid = "GameOwnPlayerItems"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:ConditionCheckItem",
      "dynamodb:BatchWriteItem",
    ]
    resources = [local.table_arns.game]

    # Never SYS#* keys. Transactions are authorised per contained action (E.6.4 notes).
    condition {
      test     = "ForAllValues:StringLike"
      variable = "dynamodb:LeadingKeys"
      values   = ["U#*"]
    }
  }

  statement {
    sid       = "ContentRead"
    actions   = ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:BatchGetItem"]
    resources = [local.table_arns.content]
  }

  statement {
    sid       = "GameDataBoundsRead"
    actions   = ["s3:GetObject"]
    resources = ["${module.player_site.bucket_arn}/${local.game_data_prefix}*"]
  }
}

module "player_api" {
  source = "../modules/lambda_function"

  function_name = local.lambda_names["player-api"]
  description   = "Player routes: profile, runs, session, ops, packs, resets"
  role_name     = "${local.name_prefix}-player-api-role"
  policy_json   = data.aws_iam_policy_document.player_api.json

  memory_size        = 512
  timeout            = 25 # under the 30 s HTTP API limit; bounds the WHOLE_PROFILE reset (spine S8.2)
  log_retention_days = var.log_retention_days

  s3_bucket              = data.aws_s3_bucket.artifacts.id
  s3_key                 = var.lambda_artifacts["player-api"].s3_key
  source_code_sha256_b64 = var.lambda_artifacts["player-api"].sha256_b64

  environment = {
    POWERTOOLS_SERVICE_NAME = "player-api"
    GAME_TABLE_NAME         = local.table_names.game
    CONTENT_TABLE_NAME      = local.table_names.content
    GAME_DATA_BUCKET        = module.player_site.bucket_name
    GAME_DATA_PREFIX        = local.game_data_prefix
  }
}

# admin-api: content administration and speech approval. Never game, never Polly, never PutObject.
data "aws_iam_policy_document" "admin_api" {
  statement {
    sid = "ContentReadWrite"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:ConditionCheckItem",
    ]
    resources = [local.table_arns.content]
  }

  statement {
    sid       = "ClipRead"
    actions   = ["s3:GetObject"]
    resources = ["${local.audio_bucket_arn}/${local.clip_prefix}*"]
  }

  # So HeadObject on a missing clip is 404, not 403 (E.6.4 notes).
  statement {
    sid       = "ClipPrefixList"
    actions   = ["s3:ListBucket"]
    resources = [local.audio_bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${local.clip_prefix}*"]
    }
  }
}

module "admin_api" {
  source = "../modules/lambda_function"

  function_name = local.lambda_names["admin-api"]
  description   = "Operator routes: content administration and speech approval"
  role_name     = "${local.name_prefix}-admin-api-role"
  policy_json   = data.aws_iam_policy_document.admin_api.json

  memory_size        = 256
  timeout            = 15
  log_retention_days = var.audit_log_retention_days # audit lines outlive a week (spine S8.3)

  s3_bucket              = data.aws_s3_bucket.artifacts.id
  s3_key                 = var.lambda_artifacts["admin-api"].s3_key
  source_code_sha256_b64 = var.lambda_artifacts["admin-api"].sha256_b64

  environment = {
    POWERTOOLS_SERVICE_NAME = "admin-api"
    CONTENT_TABLE_NAME      = local.table_names.content
    AUDIO_BUCKET            = local.audio_bucket_name
    CLIP_PREFIX             = local.clip_prefix
    TTS_VOICE_ID            = var.tts_voice_id # recomputes the clip key at approval (E.4.1a)
    TTS_ENGINE              = var.tts_engine
    TTS_PHONEME_ENGINE      = var.tts_phoneme_engine
  }
}

# tts: the dedicated speech service. One GetItem on the caller's slot; no content access; never writes DynamoDB.
data "aws_iam_policy_document" "tts" {
  statement {
    sid       = "GamePlayerSlotRead"
    actions   = ["dynamodb:GetItem"]
    resources = [local.table_arns.game]

    condition {
      test     = "ForAllValues:StringLike"
      variable = "dynamodb:LeadingKeys"
      values   = ["U#*"]
    }
  }

  statement {
    sid       = "ClipReadWrite" # no DeleteObject: clips are never removed
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${local.audio_bucket_arn}/${local.clip_prefix}*"]
  }

  # So HeadObject on a missing clip is 404, not 403 (E.6.4 notes).
  statement {
    sid       = "ClipPrefixList"
    actions   = ["s3:ListBucket"]
    resources = [local.audio_bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${local.clip_prefix}*"]
    }
  }

  # IAM cannot restrict the voice or engine; the allow-list is in code (E.4.1a).
  statement {
    sid       = "PollySynthesise"
    actions   = ["polly:SynthesizeSpeech"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.region]
    }
  }
}

module "tts" {
  source = "../modules/lambda_function"

  function_name = local.lambda_names["tts"]
  description   = "Speech: player Play (never synthesises) and operator preview"
  role_name     = "${local.name_prefix}-tts-role"
  policy_json   = data.aws_iam_policy_document.tts.json

  memory_size        = 512
  timeout            = 15
  log_retention_days = var.log_retention_days

  s3_bucket              = data.aws_s3_bucket.artifacts.id
  s3_key                 = var.lambda_artifacts["tts"].s3_key
  source_code_sha256_b64 = var.lambda_artifacts["tts"].sha256_b64

  environment = {
    POWERTOOLS_SERVICE_NAME = "tts"
    GAME_TABLE_NAME         = local.table_names.game
    AUDIO_BUCKET            = local.audio_bucket_name
    CLIP_PREFIX             = local.clip_prefix
    TTS_VOICE_ID            = var.tts_voice_id
    TTS_ENGINE              = var.tts_engine
    TTS_PHONEME_ENGINE      = var.tts_phoneme_engine
    TTS_OUTPUT_FORMAT       = "mp3"
  }
}

# cognito-presignup: one conditional UpdateItem on SYS#SIGNUPS. No Cognito permissions.
data "aws_iam_policy_document" "cognito_presignup" {
  statement {
    sid       = "SignUpCounter"
    actions   = ["dynamodb:UpdateItem"]
    resources = [local.table_arns.game]

    condition {
      test     = "ForAllValues:StringEquals"
      variable = "dynamodb:LeadingKeys"
      values   = ["SYS#SIGNUPS"]
    }
  }
}

module "cognito_presignup" {
  source = "../modules/lambda_function"

  function_name = local.lambda_names["cognito-presignup"]
  description   = "Player pool pre sign-up: auto-confirm within the daily cap"
  role_name     = "${local.name_prefix}-cognito-presignup-role"
  policy_json   = data.aws_iam_policy_document.cognito_presignup.json

  memory_size        = 128
  timeout            = 5 # Cognito waits at most 5 s for a trigger
  log_retention_days = var.log_retention_days

  s3_bucket              = data.aws_s3_bucket.artifacts.id
  s3_key                 = var.lambda_artifacts["cognito-presignup"].s3_key
  source_code_sha256_b64 = var.lambda_artifacts["cognito-presignup"].sha256_b64

  environment = {
    POWERTOOLS_SERVICE_NAME = "cognito-presignup"
    GAME_TABLE_NAME         = local.table_names.game
    SIGNUP_DAILY_CAP        = tostring(var.signup_daily_cap)
  }
}

# ---------------------------------------------------------------------------
# Sign-in (plan H.4.5, E.7.1; shapes proved by the auth spike, ADR-0012).
# ---------------------------------------------------------------------------

module "player_pool" {
  source = "../modules/cognito_pool"

  name                         = "${local.name_prefix}-players"
  allow_admin_create_user_only = var.player_signup_closed # kill switch, changed only through a release (spine S1.2)
  mfa_required                 = false
  pre_sign_up_lambda_arn       = module.cognito_presignup.arn

  # Children: eight characters, lower case required, nothing else (sources/05 §1.5).
  password_policy = {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = false
    require_numbers   = false
    require_symbols   = false
  }

  domain_prefix     = var.player_auth_domain_prefix
  scope             = var.player_route_scope
  scope_description = "Player routes"

  client_name   = "${local.name_prefix}-player"
  callback_urls = ["${local.player_origin}/auth/callback"]
  logout_urls   = ["${local.player_origin}/"]

  # Rotation off for players (E.7.1): a lost refresh response would force a sign-in with progress unsynchronised.
  explicit_auth_flows         = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]
  refresh_token_validity_days = 90
  refresh_token_rotation      = false
}

# Cognito invokes the trigger only from the player pool.
resource "aws_lambda_permission" "presignup_from_player_pool" {
  statement_id   = "AllowPlayerPoolPreSignUp"
  action         = "lambda:InvokeFunction"
  function_name  = module.cognito_presignup.function_name
  principal      = "cognito-idp.amazonaws.com"
  source_arn     = module.player_pool.user_pool_arn
  source_account = var.aws_account_id
}

module "operator_pool" {
  source = "../modules/cognito_pool"

  name                         = "${local.name_prefix}-operators"
  allow_admin_create_user_only = true # AdminCreateUser only (docs/runbooks/operator-accounts.md)
  mfa_required                 = true # TOTP, enrolled at first sign-in

  password_policy = {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = true
  }

  domain_prefix     = var.operator_auth_domain_prefix
  scope             = var.operator_route_scope
  scope_description = "Operator content routes"

  client_name   = "${local.name_prefix}-admin"
  callback_urls = ["${local.admin_origin}/auth/callback"]
  logout_urls   = ["${local.admin_origin}/"]

  # Rotation on for operators (E.7.1). [UNVERIFIED] (U-058, ADR-0012 check 13): that Cognito refuses
  # ALLOW_REFRESH_TOKEN_AUTH with rotation on, and that managed login needs nothing beyond SRP here; refresh goes through
  # the token endpoint or GetTokensFromRefreshToken. Settled at the Phase 8 gate.
  explicit_auth_flows         = ["ALLOW_USER_SRP_AUTH"]
  refresh_token_validity_days = 1
  refresh_token_rotation      = true

  # Operator status = exact membership of "admin", checked in code too (E.7.3). Membership is a runbook step.
  groups = {
    admin = "Operators: content administration and speech approval"
  }
}
