# Read by the owner (DNS hand-off) and later by the workflows with `terraform output -json` (plan H.3.6).

output "acm_validation_records" {
  description = "Validation CNAMEs the owner creates in jackgl.com and keeps forever (docs/runbooks/dns-hand-off.md)."
  value       = module.certificate.validation_records
}

output "certificate_arn" {
  description = "ARN of the us-east-1 certificate, taken from the validation resource so it is only known once ISSUED."
  value       = module.certificate.certificate_arn
}

output "acm_certificate_status" {
  description = "Certificate status as of the last refresh. The first apply records PENDING_VALIDATION; the next plan shows ISSUED. aws acm describe-certificate is the authority."
  value       = module.certificate.certificate_status
}

# Static sites (plan H.3.6). Bucket and distribution IDs feed the publish step (Phase 4); the domains and the zone ID
# are for the owner's A and AAAA alias records (docs/runbooks/dns-hand-off.md).

output "player_bucket" {
  description = "Player site bucket (publish target)."
  value       = module.player_site.bucket_name
}

output "admin_bucket" {
  description = "Admin site bucket (publish target)."
  value       = module.admin_site.bucket_name
}

output "player_distribution_id" {
  description = "Player distribution ID (publish: wait and invalidate; smoke)."
  value       = module.player_site.distribution_id
}

output "admin_distribution_id" {
  description = "Admin distribution ID (publish: wait and invalidate; smoke)."
  value       = module.admin_site.distribution_id
}

output "player_distribution_domain" {
  description = "Player *.cloudfront.net name: alias target for aliens.jackgl.com."
  value       = module.player_site.distribution_domain_name
}

output "admin_distribution_domain" {
  description = "Admin *.cloudfront.net name: alias target for admin.aliens.jackgl.com."
  value       = module.admin_site.distribution_domain_name
}

output "cloudfront_hosted_zone_id" {
  description = "Hosted zone ID to use in the alias records (CloudFront's fixed zone, Z2FDTNDATAQYW2)."
  value       = module.player_site.distribution_hosted_zone_id
}

output "artifacts_bucket" {
  description = "Artefacts bucket (bootstrap-owned), passed through from the data source for runbooks and the manifest cross-check."
  value       = data.aws_s3_bucket.artifacts.id
}

# Phase 8: data, sign-in and functions (plan H.3.6). Identifiers only; Cognito public clients have no secret.

# config.json per site (H.8.5 f): identifiers only, no secrets. The publish step adds releaseId.
output "player_config" {
  description = "Player site config.json values: API base and sign-in settings."
  value = {
    apiBase    = "/api" # same-origin through the /api/* behaviour; route keys keep the prefix (ADR-0001)
    region     = var.region
    userPoolId = module.player_pool.user_pool_id
    clientId   = module.player_pool.client_id
    authDomain = module.player_pool.auth_domain
    scope      = module.player_pool.scope
  }
}

output "admin_config" {
  description = "Admin site config.json values: API base and operator sign-in settings."
  value = {
    apiBase    = "/api"
    region     = var.region
    userPoolId = module.operator_pool.user_pool_id
    clientId   = module.operator_pool.client_id
    authDomain = module.operator_pool.auth_domain
    scope      = module.operator_pool.scope
  }
}

output "audio_bucket" {
  description = "Audio clip bucket (clips under tts/v1/)."
  value       = module.audio_bucket.bucket_name
}

output "lambda_function_names" {
  description = "Function name per key (smoke: CodeSha256 against the manifest)."
  value = {
    "player-api"        = module.player_api.function_name
    "admin-api"         = module.admin_api.function_name
    "tts"               = module.tts.function_name
    "cognito-presignup" = module.cognito_presignup.function_name
    "picture-gen"       = module.picture_gen.function_name
    "game-data-publish" = module.game_data_publish.function_name
    "game-data-check"   = module.game_data_check.function_name
  }
}

output "game_table_name" {
  description = "game table the functions use (runbooks)."
  value       = local.table_names.game
}

output "content_table_name" {
  description = "content table the functions use (runbooks)."
  value       = local.table_names.content
}

# Phase 9: the API and monitoring (plan H.3.6).

output "api_endpoint" {
  description = "HTTP API default endpoint (smoke: optional direct check; the sites reach it at /api/*)."
  value       = module.api.api_endpoint
}

output "api_id" {
  description = "HTTP API ID (runbooks, alarm dimension)."
  value       = module.api.api_id
}

output "api_route_keys" {
  description = "Route keys deployed (equal to the routes of local.api_functions in contracts/routes.json; G-12 checks the plan)."
  value       = module.api.route_keys
}

output "alerts_topic_arn" {
  description = "eu-west-2 alarm topic (runbook: test alarm with aws cloudwatch set-alarm-state)."
  value       = module.monitoring.alerts_topic_arn
}

output "alerts_topic_use1_arn" {
  description = "us-east-1 mirror alarm topic (CloudFront alarms)."
  value       = module.monitoring.alerts_topic_use1_arn
}

output "alarm_names" {
  description = "Every alarm this stack owns (runbooks, the test alarm)."
  value = concat(
    module.player_api.alarm_names,
    module.admin_api.alarm_names,
    module.tts.alarm_names,
    module.cognito_presignup.alarm_names,
    module.monitoring.alarm_names,
  )
}
