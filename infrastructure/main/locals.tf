locals {
  # space-tower-defence-prod; regional resource names start with this (spine S1.1).
  name_prefix = "${var.project}-${var.environment}"

  # Bucket names are <bucket_prefix>-<purpose>-bucket (spine S1, plan H.3.3).
  bucket_prefix = "${var.aws_account_id}-${var.region}-${var.environment}"

  # Created by the bootstrap root (plan H.5 B-6); the main stack only looks it up.
  artifacts_bucket_name = "${local.bucket_prefix}-artifacts-bucket"

  # The two site origins: audio-bucket CORS and the Cognito callback and sign-out URLs (plan H.3.3).
  player_origin = "https://${var.player_hostname}"
  admin_origin  = "https://${var.admin_hostname}"
  origins       = [local.player_origin, local.admin_origin]

  # Function names are <project>-<env>-<region>-<key> (spine S1.1); keys match var.lambda_artifacts.
  lambda_names = {
    for key in ["player-api", "admin-api", "tts", "cognito-presignup", "picture-gen"] :
    key => "${var.project}-${var.environment}-${var.region}-${key}"
  }

  # The managed tables are always <name_prefix>-<name>. The functions use these names, which a restore cut-over can
  # point at a restored table (plan H.13.3); IAM follows the same names.
  managed_table_names = {
    game    = "${local.name_prefix}-game"
    content = "${local.name_prefix}-content"
  }
  table_names = merge(local.managed_table_names, var.table_name_overrides)
  table_arns  = { for k, name in local.table_names : k => "arn:aws:dynamodb:${var.region}:${var.aws_account_id}:table/${name}" }

  # Name and ARN built here (not read from the module) so the tts and admin-api policies are readable in the plan.
  audio_bucket_name = "${local.bucket_prefix}-audio-bucket"
  audio_bucket_arn  = "arn:aws:s3:::${local.audio_bucket_name}"

  # Clip objects live flat under one prefix: tts/v1/<clipKey>.mp3 (plan H.4.6). IAM, CORS and the environment use it.
  clip_prefix = "tts/v1/"

  # The pictures bucket (Phases 42a, 42b; pictures.tf). Name and ARN built here, like the audio bucket's, so the IAM and
  # bucket policies are readable in the plan. Three prefixes, each with one writer (admin-api or picture-gen):
  #   store/<pictureId>.png        master copy, draft or approved          admin-api writes and reads
  #   pictures/v1/<pictureId>.png  approved only, served at /pictures/*    admin-api writes, CloudFront reads
  #   jobs/<jobId>/...             generation exchange, expires in 14 days picture-gen writes, admin-api reads
  pictures_bucket_name  = "${local.bucket_prefix}-pictures-bucket"
  pictures_bucket_arn   = "arn:aws:s3:::${local.pictures_bucket_name}"
  picture_store_prefix  = "store/"
  picture_served_prefix = "pictures/v1/"
  picture_job_prefix    = "jobs/"

  # The two execution roles the pictures bucket and job queue policies name (the lambda_function module creates them).
  admin_api_role_arn   = "arn:aws:iam::${var.aws_account_id}:role/${local.name_prefix}-admin-api-role"
  picture_gen_role_arn = "arn:aws:iam::${var.aws_account_id}:role/${local.name_prefix}-picture-gen-role"

  # Bounds files in the player site bucket that player-api reads (spine S5.1, plan H.4.4).
  game_data_prefix = "game-data/"

  # Applied once by both providers; modules do not repeat tags.
  default_tags = merge(
    {
      project     = var.project
      environment = var.environment
      managed_by  = "terraform"
    },
    var.extra_tags,
  )

  # The route catalogue (G §2; ADR-0001: keys keep /api). Keyed by route key, "GET /api/me". A duplicate key fails here.
  route_catalogue = jsondecode(file("${path.module}/../../contracts/routes.json"))
  api_routes = {
    for r in local.route_catalogue.routes : "${r.method} ${r.path}" => {
      id         = r.id
      function   = r.function
      authoriser = r.authoriser
      scope      = r.scope
    }
  }
}
