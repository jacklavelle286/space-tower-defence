# The game-data publisher (Gate M, LD6; ADR-0037): the only writer of the player site's game-data/ besides the release.
#
#   game-data-publish (Python)  reads the level draft, current.json and the source planet; refuses or writes the new
#                               campaign and bounds files (create-only), versions.json and current.json (If-Match); the
#                               V#, GDPUBLISH and AUDIT rows. Invoked by admin-api only (LD7's routes): publish
#                               asynchronously (no retries), the other actions synchronously.
#   game-data-check (Node 24)   the JavaScript rules: merge, parse, planetProblems, the blocking bot checks, buildBounds.
#                               No AWS access at all; invoked by game-data-publish only.
#   freeze switch (SSM)         "true" stops every publisher write (G-8 checks it at the Phase 74 freeze).
#   bucket Deny                 every game-data/* object write on the player site bucket is denied to every principal but
#                               the publisher's role and the release's CI role (whatever IAM they hold).

locals {
  game_data_publish_role_arn = "arn:aws:iam::${var.aws_account_id}:role/${local.name_prefix}-game-data-publish-role"
  # The release's role (bootstrap; release.yml names it the same way). It uploads game data create-only and writes
  # current.json only when it is absent or on reseed_current (scripts/publish_static.py).
  ci_role_arn = "arn:aws:iam::${var.aws_account_id}:role/${local.name_prefix}-github-oidc"

  player_site_bucket_arn = "arn:aws:s3:::${local.bucket_prefix}-player-spa-bucket" # module.player_site's bucket

  # Every action that changes an object or one of its versions (as pictures.tf, which explains the list).
  game_data_write_actions = ["s3:Put*", "s3:Delete*", "s3:Replicate*", "s3:RestoreObject"]

  game_data_bucket_statements = [
    {
      Sid       = "DenyGameDataWritesExceptPublisherAndRelease"
      Effect    = "Deny"
      Principal = "*"
      Action    = local.game_data_write_actions
      Resource  = "${local.player_site_bucket_arn}/${local.game_data_prefix}*"
      Condition = { StringNotEquals = { "aws:PrincipalArn" = [local.game_data_publish_role_arn, local.ci_role_arn] } }
    },
  ]
}

resource "aws_ssm_parameter" "game_data_freeze" {
  name        = "/${local.name_prefix}/game-data-publish-frozen"
  description = "true stops the game-data publisher's writes (Gate M, LD6; set by the freeze release, Phase 74)."
  type        = "String"
  value       = tostring(var.game_data_publish_frozen)
}

# --- game-data-check ------------------------------------------------------------------------------------------------

# No data access: an explicit Deny on S3 states it (the module's logs policy is its only Allow).
data "aws_iam_policy_document" "game_data_check" {
  statement {
    sid       = "NoDataAccess"
    effect    = "Deny"
    actions   = ["s3:*", "dynamodb:*"]
    resources = ["*"]
  }
}

module "game_data_check" {
  source = "../modules/lambda_function"

  function_name = local.lambda_names["game-data-check"]
  description   = "Game-data rules, blocking bot checks and bounds for the publisher (Node 24, no AWS access)"
  role_name     = "${local.name_prefix}-game-data-check-role"
  policy_json   = data.aws_iam_policy_document.game_data_check.json

  runtime = "nodejs24.x"
  handler = "index.handler"
  # About one vCPU (Lambda gives one full vCPU at 1769 MB). The blocking checks of a 50-wave campaign take 27 s on one
  # laptop core (LD0, LD6); [UNVERIFIED] how much slower a Lambda vCPU is: measure on the first publish.
  memory_size          = 1769
  timeout              = 300
  max_timeout          = 900 # no API route invokes it
  reserved_concurrency = 2   # the publisher's own reservation; a stray caller cannot take more
  log_retention_days   = var.log_retention_days

  s3_bucket              = data.aws_s3_bucket.artifacts.id
  s3_key                 = var.lambda_artifacts["game-data-check"].s3_key
  source_code_sha256_b64 = var.lambda_artifacts["game-data-check"].sha256_b64

  alarm_name_prefix = "${local.name_prefix}-lambda-game-data-check"
  alarm_topic_arn   = module.monitoring.alerts_topic_arn

  environment = {}
}

# --- game-data-publish ----------------------------------------------------------------------------------------------

data "aws_iam_policy_document" "game_data_publish" {
  statement {
    sid = "ContentReadWrite" # level drafts, pictures, the bank (R30), the counter, PUB#, V#, GDPUBLISH and AUDIT items
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
    sid       = "GameDataRead"
    actions   = ["s3:GetObject"]
    resources = ["${module.player_site.bucket_arn}/${local.game_data_prefix}*"]
  }

  # So a missing versions.json or bounds file is 404, not 403.
  statement {
    sid       = "GameDataPrefixList"
    actions   = ["s3:ListBucket"]
    resources = [module.player_site.bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${local.game_data_prefix}*"]
    }
  }

  # New versions (create-only in code: If-None-Match) and the two pointers (If-Match). No DeleteObject: published
  # files are never removed. Never ruleset/: a new ruleset still comes only through a release.
  statement {
    sid     = "GameDataWrite"
    actions = ["s3:PutObject"]
    resources = [
      "${module.player_site.bucket_arn}/${local.game_data_prefix}campaign/*",
      "${module.player_site.bucket_arn}/${local.game_data_prefix}bounds/*",
      "${module.player_site.bucket_arn}/${local.game_data_prefix}current.json",
      "${module.player_site.bucket_arn}/${local.game_data_prefix}versions.json",
    ]
  }

  statement {
    sid       = "InvokeCheck"
    actions   = ["lambda:InvokeFunction"]
    resources = [module.game_data_check.arn]
  }

  statement {
    sid       = "ReadFreezeSwitch"
    actions   = ["ssm:GetParameter"]
    resources = [aws_ssm_parameter.game_data_freeze.arn]
  }
}

module "game_data_publish" {
  source = "../modules/lambda_function"

  function_name = local.lambda_names["game-data-publish"]
  description   = "Publishes level drafts as game-data versions; moves current.json and versions.json (Gate M)"
  role_name     = "${local.name_prefix}-game-data-publish-role"
  policy_json   = data.aws_iam_policy_document.game_data_publish.json

  memory_size          = 512
  timeout              = 600 # one check with bots (up to its 300 s), one without, and the writes
  max_timeout          = 900 # invoked by admin-api, never by an API route directly
  reserved_concurrency = 2   # two publishes at once at most: If-Match lets one win, the other gets a clean answer
  log_retention_days   = var.audit_log_retention_days

  s3_bucket              = data.aws_s3_bucket.artifacts.id
  s3_key                 = var.lambda_artifacts["game-data-publish"].s3_key
  source_code_sha256_b64 = var.lambda_artifacts["game-data-publish"].sha256_b64

  alarm_name_prefix = "${local.name_prefix}-lambda-game-data-publish"
  alarm_topic_arn   = module.monitoring.alerts_topic_arn

  environment = {
    POWERTOOLS_SERVICE_NAME = "game-data-publish"
    CONTENT_TABLE_NAME      = local.table_names.content
    GAME_DATA_BUCKET        = module.player_site.bucket_name
    GAME_DATA_PREFIX        = local.game_data_prefix
    CHECK_FUNCTION_NAME     = module.game_data_check.function_name
    FREEZE_PARAMETER        = aws_ssm_parameter.game_data_freeze.name
  }
}

# A failed asynchronous publish is not retried by Lambda: its outcome is on the PUB# item, and a retry is the
# operator's (a replay of the same revision finishes what is missing).
resource "aws_lambda_function_event_invoke_config" "game_data_publish" {
  function_name                = module.game_data_publish.function_name
  maximum_retry_attempts       = 0
  maximum_event_age_in_seconds = 300
}
