# Module wiring (plan H.3.5). Phase 2: the certificate. Phase 3: the two static sites. Phase 8: tables, audio bucket,
# Cognito pools and the four functions. Phase 9: the HTTP API at /api/* on both sites, and monitoring.
# Phases 42a/42b: the pictures bucket at /pictures/* on both sites, and the picture-gen function (pictures.tf).

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
  csp_connect_sources = [
    "'self'",
    "https://${module.player_pool.auth_domain}",
    "https://${module.operator_pool.auth_domain}",
    # Cognito's user-pool API: the browser library refreshes tokens there (GetTokensFromRefreshToken) and revokes
    # the refresh token on sign-out, not on the managed-login domain (read from aws-amplify 6.22.2, Phase 21).
    "https://cognito-idp.${var.region}.amazonaws.com",
    # The audio bucket's regional virtual-hosted endpoint (E.9): the player fetches clip bytes from presigned URLs to
    # check their sha256 and keep them (Phase 22).
    local.audio_bucket_origin,
  ]

  # Presigned clip URLs name the bucket on its regional endpoint (api/shared/audio.py s3_client).
  audio_bucket_origin = "https://${local.audio_bucket_name}.s3.${var.region}.amazonaws.com"

  # Content Security Policy (plan H.4.2, E.10.3; outline in sources/08-aws-data-ops.md section c.4).
  # Shipped as Content-Security-Policy-Report-Only until M1 ends; then the header name changes to enforce it.
  # No report-uri/report-to yet (no endpoint exists): the M1 proof is a manual DevTools console check on both sites
  # (player game flow, admin), recorded before the switch to enforcing. Backlog B-2 adds a same-origin report route.
  # connect-src: 'self' (same-origin /api, config.json, Phaser's loader) plus both managed-login hosts, which the apps
  # call with fetch for the token exchange and refresh (E.7). One policy serves both sites, so each site also allows
  # the other pool's host: harmless while Report-Only. The audio bucket host is in connect-src (the player downloads
  # clip bytes) and media-src (the admin plays previews straight from the presigned URL). Splitting the policy into a
  # player and an admin variant (E.10.3) is left for the switch to enforcing.
  csp_directives = [
    "default-src 'self'",
    "script-src 'self'", # no inline or eval: Vite emits only external module scripts
    # 'unsafe-inline' is only for the one inline <style> in each built index.html. React style={{}} and Phaser set
    # element.style through the CSSOM, which CSP does not govern. Before enforcing: move those rules into the apps'
    # CSS (or use a 'sha256-...' source) so this becomes 'self' only.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",                          # Phaser loads textures through blob: URLs and builds data: images
    "media-src 'self' blob: ${local.audio_bucket_origin}", # stored bytes (player, E.9); previews (admin)
    "font-src 'self'",                                     # self-hosted woff2 in /assets
    "connect-src ${join(" ", local.csp_connect_sources)}",
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
# Static sites (plan H.4.2), each with the HTTP API at /api/* (plan E.2.1).
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

  api_origin_domain            = module.api.endpoint_domain
  api_cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
  api_origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host_header.id

  extra_s3_origin = local.pictures_origin # approved pictures at /pictures/* (Phase 42a, pictures.tf)
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

  api_origin_domain            = module.api.endpoint_domain
  api_cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
  api_origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host_header.id

  extra_s3_origin = local.pictures_origin # the editor's picker shows approved pictures (Phase 42a)
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
# Every role also writes to its own log group (added by the module). No reserved concurrency for these four (U-020:
# the account limit is 1000); picture-gen (pictures.tf) reserves 2.
# Each call passes alarm_topic_arn: the module adds the errors, throttles and duration alarms (H.14, gate G-5).
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

  alarm_name_prefix = "${local.name_prefix}-lambda-player-api"
  alarm_topic_arn   = module.monitoring.alerts_topic_arn

  environment = {
    POWERTOOLS_SERVICE_NAME = "player-api"
    GAME_TABLE_NAME         = local.table_names.game
    CONTENT_TABLE_NAME      = local.table_names.content
    GAME_DATA_BUCKET        = module.player_site.bucket_name
    GAME_DATA_PREFIX        = local.game_data_prefix
  }
}

# admin-api: content administration, speech approval and pictures. Never game, never Polly, never Bedrock. Never
# PutObject on clips; picture prefixes only (store/, pictures/v1/ in the pictures bucket, Phase 42a). Reads the released
# game data (read-only) for bank status.
data "aws_iam_policy_document" "admin_api" {
  statement {
    sid = "ContentReadWrite"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:BatchGetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem", # R31 activity and R32 speech delete (ADR-0029)
      "dynamodb:ConditionCheckItem",
    ]
    resources = [local.table_arns.content]
  }

  statement {
    sid       = "ClipRead"
    actions   = ["s3:GetObject"]
    resources = ["${local.audio_bucket_arn}/${local.clip_prefix}*"]
  }

  # Bank status (R30) reads the released game data (current.json, the planet document, the bounds file) to judge
  # whether new games can start on the released wave sets: the same read-only files player-api reads.
  statement {
    sid       = "GameDataRead"
    actions   = ["s3:GetObject"]
    resources = ["${module.player_site.bucket_arn}/${local.game_data_prefix}*"]
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

  # Pictures (Phase 42a). The master copy of every picture, draft or approved, under store/ (R34 upload, R35 read,
  # R37 delete). The bucket policy denies these writes to every other principal.
  statement {
    sid       = "PicturesStore"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.pictures_bucket_arn}/${local.picture_store_prefix}*"]
  }

  # The served copy of approved pictures: R36 approve copies store/ -> pictures/v1/ (CopyObject is GetObject on the
  # source plus PutObject here); R37 deletes an unused approved picture.
  statement {
    sid       = "PicturesServe"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.pictures_bucket_arn}/${local.picture_served_prefix}*"]
  }

  # R39 reads what picture-gen wrote (claim, progress.json, result.json, error.json); never writes there (Phase 42b).
  statement {
    sid       = "PictureJobsRead"
    actions   = ["s3:GetObject"]
    resources = ["${local.pictures_bucket_arn}/${local.picture_job_prefix}*"]
  }

  # So HeadObject or GetObject on a missing picture or job file is 404, not 403.
  statement {
    sid       = "PicturesList"
    actions   = ["s3:ListBucket"]
    resources = [local.pictures_bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${local.picture_store_prefix}*", "${local.picture_served_prefix}*", "${local.picture_job_prefix}*"]
    }
  }

  # R38 queues a generation job (Phase 42b). The queue policy denies SendMessage to every other principal.
  statement {
    sid       = "PictureJobsSend"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.picture_jobs.arn]
  }

  # R37 removes a deleted approved picture from both sites' edge caches (objects are cached for a year).
  statement {
    sid       = "PicturesInvalidate"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [module.player_site.distribution_arn, module.admin_site.distribution_arn]
  }
}

module "admin_api" {
  source = "../modules/lambda_function"

  function_name = local.lambda_names["admin-api"]
  description   = "Operator routes: content administration, speech approval and pictures"
  role_name     = "${local.name_prefix}-admin-api-role"
  policy_json   = data.aws_iam_policy_document.admin_api.json

  # One full vCPU for the pure-Python PNG canonicaliser (R34): a 1920 x 1056 background photo took 1.4 s on a laptop,
  # an estimated 2-3 s here at 1769 MB and 9-13 s at 512 MB, too close to the timeout (Gate P2 measurement,
  # 2026-11-16; [UNVERIFIED] until the first background upload's REPORT line). Billed only per request.
  memory_size        = 1769
  timeout            = 20                           # margin over the worst background upload; still under the 30 s HTTP API limit
  log_retention_days = var.audit_log_retention_days # audit lines outlive a week (spine S8.3)

  s3_bucket              = data.aws_s3_bucket.artifacts.id
  s3_key                 = var.lambda_artifacts["admin-api"].s3_key
  source_code_sha256_b64 = var.lambda_artifacts["admin-api"].sha256_b64

  alarm_name_prefix = "${local.name_prefix}-lambda-admin-api"
  alarm_topic_arn   = module.monitoring.alerts_topic_arn

  environment = {
    POWERTOOLS_SERVICE_NAME = "admin-api"
    CONTENT_TABLE_NAME      = local.table_names.content
    AUDIO_BUCKET            = local.audio_bucket_name
    CLIP_PREFIX             = local.clip_prefix
    TTS_VOICE_ID            = var.tts_voice_id # recomputes the clip key at approval (E.4.1a)
    TTS_ENGINE              = var.tts_engine
    TTS_PHONEME_ENGINE      = var.tts_phoneme_engine
    GAME_DATA_BUCKET        = module.player_site.bucket_name # bank status (R30) reads the released wave sets
    GAME_DATA_PREFIX        = local.game_data_prefix

    # Pictures (Phases 42a, 42b): the bucket, both distributions (R37 invalidation), the job queue (R38) and the caps.
    PICTURES_BUCKET          = local.pictures_bucket_name
    PICTURE_DISTRIBUTION_IDS = join(",", [module.player_site.distribution_id, module.admin_site.distribution_id])
    PICTURE_JOBS_QUEUE_URL   = aws_sqs_queue.picture_jobs.url
    PICTURE_DAILY_CAP        = tostring(var.picture_daily_cap)
    PICTURE_MONTHLY_CAP      = tostring(var.picture_monthly_cap)
    PICTURE_JOB_PREFIX       = local.picture_job_prefix # the same prefix picture-gen writes under (R39 reads it)
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

  # Bank status (R30) reads the released game data (current.json, the planet document, the bounds file) to judge
  # whether new games can start on the released wave sets: the same read-only files player-api reads.
  statement {
    sid       = "GameDataRead"
    actions   = ["s3:GetObject"]
    resources = ["${module.player_site.bucket_arn}/${local.game_data_prefix}*"]
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

  alarm_name_prefix = "${local.name_prefix}-lambda-tts"
  alarm_topic_arn   = module.monitoring.alerts_topic_arn

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

  alarm_name_prefix = "${local.name_prefix}-lambda-cognito-presignup"
  alarm_topic_arn   = module.monitoring.alerts_topic_arn

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

# ---------------------------------------------------------------------------
# HTTP API (plan H.4.3, E.2.1, E.6). Routes come straight from contracts/routes.json (locals.tf), so the deployed
# route keys and the catalogue cannot drift; gate G-12 checks the plan against the same file.
# ---------------------------------------------------------------------------

module "api" {
  source = "../modules/http_api"

  name               = "${local.name_prefix}-api"
  routes             = local.api_routes
  log_retention_days = var.log_retention_days

  functions = {
    "player-api" = { function_name = module.player_api.function_name, invoke_arn = module.player_api.invoke_arn }
    "admin-api"  = { function_name = module.admin_api.function_name, invoke_arn = module.admin_api.invoke_arn }
    "tts"        = { function_name = module.tts.function_name, invoke_arn = module.tts.invoke_arn }
  }

  # Each pool's tokens are accepted only on its own routes: issuer = pool, audience = its one app client (E.7.3).
  authorisers = {
    player = {
      issuer   = module.player_pool.issuer
      audience = [module.player_pool.client_id]
      scope    = module.player_pool.scope
    }
    operator = {
      issuer   = module.operator_pool.issuer
      audience = [module.operator_pool.client_id]
      scope    = module.operator_pool.scope
    }
  }

  # Spine S9.5 [ASSUMPTION]: stage 20 rps / burst 40; every route without an entry below gets that, set explicitly.
  default_throttle = { rate_limit = 20, burst_limit = 40 }
  route_throttles = {
    "POST /api/runs"                 = { rate_limit = 1, burst_limit = 5 }
    "POST /api/speech"               = { rate_limit = 20, burst_limit = 40 }
    "POST /api/admin/speech/preview" = { rate_limit = 2, burst_limit = 5 }
    "POST /api/admin/pictures"       = { rate_limit = 2, burst_limit = 5 } # R34 upload, up to 768 KiB body (42a)
    "POST /api/admin/picture-jobs"   = { rate_limit = 1, burst_limit = 2 } # R38 starts a paid generation (42b)
  }
}

# ---------------------------------------------------------------------------
# Monitoring (plan H.14). Topics in eu-west-2 and a us-east-1 mirror for the CloudFront alarms. The Lambda alarms are
# in each lambda_function call above.
# ---------------------------------------------------------------------------

module "monitoring" {
  source = "../modules/monitoring"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  name_prefix        = local.name_prefix
  notification_email = var.notification_email

  api_id    = module.api.api_id
  api_stage = module.api.stage_name

  ops_log_group_name    = module.player_api.log_group_name
  speech_log_group_name = module.tts.log_group_name

  # The managed tables, not table_name_overrides: a restored table gets its alarm when it becomes managed (H.13.3).
  table_names = local.managed_table_names

  monthly_budget_usd = var.monthly_budget_usd

  distribution_ids = {
    player = module.player_site.distribution_id
    admin  = module.admin_site.distribution_id
  }
}
