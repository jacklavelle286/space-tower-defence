# Pictures wiring (Phases 42a, 42b): the pictures bucket policy, the job queue and its policy, picture-gen's function
# settings and the admin-api additions. Offline: mock providers and a plan, nothing reaches AWS or the state bucket.
# Run from infrastructure/main: terraform init -backend=false && terraform test (CI repo job).
# The IAM policy documents are data sources, which a mock provider cannot evaluate: their rendered JSON is reviewed in
# a read-only plan (gate summary), and their statement blocks (the inputs) are checked here where it matters (the
# OpenAI key secret, 2026-11-16). The secret and the provider switch: run "openai_provider_and_key_secret" and after.

mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
}

mock_provider "aws" {
  alias = "us_east_1"
}

mock_provider "random" {}

variables {
  project                     = "space-tower-defence"
  environment                 = "prod"
  region                      = "eu-west-2"
  aws_account_id              = "123456789012"
  domain_name                 = "example.com"
  player_hostname             = "aliens.example.com"
  admin_hostname              = "admin.aliens.example.com"
  notification_email          = "alerts@example.com"
  operator_email              = "owner@example.com"
  operator_username           = "owner"
  player_auth_domain_prefix   = "test-play"
  operator_auth_domain_prefix = "test-admin"
  lambda_artifacts = {
    "player-api"        = { s3_key = "lambda/player-api/${join("", [for i in range(64) : "a"])}.zip", sha256_b64 = "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo=" }
    "admin-api"         = { s3_key = "lambda/admin-api/${join("", [for i in range(64) : "b"])}.zip", sha256_b64 = "u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7s=" }
    "tts"               = { s3_key = "lambda/tts/${join("", [for i in range(64) : "c"])}.zip", sha256_b64 = "zMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMzMw=" }
    "cognito-presignup" = { s3_key = "lambda/cognito-presignup/${join("", [for i in range(64) : "d"])}.zip", sha256_b64 = "3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d0=" }
    "picture-gen"       = { s3_key = "lambda/picture-gen/${join("", [for i in range(64) : "e"])}.zip", sha256_b64 = "7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u4=" }
    "game-data-publish" = { s3_key = "lambda/game-data-publish/${join("", [for i in range(64) : "f"])}.zip", sha256_b64 = "//////////////////////////////////////////8=" }
    "game-data-check"   = { s3_key = "lambda/game-data-check/${join("", [for i in range(64) : "0"])}.zip", sha256_b64 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" }
  }
}

# Known values at plan time for what the checks read: both distributions, and the queues' ARNs and URLs.
override_module {
  target = module.player_site
  outputs = {
    bucket_name                 = "player-spa-bucket"
    bucket_arn                  = "arn:aws:s3:::player-spa-bucket"
    distribution_id             = "E1PLAYER"
    distribution_arn            = "arn:aws:cloudfront::123456789012:distribution/E1PLAYER"
    distribution_domain_name    = "d1.cloudfront.net"
    distribution_hosted_zone_id = "Z2FDTNDATAQYW2"
  }
}

override_module {
  target = module.admin_site
  outputs = {
    bucket_name                 = "admin-spa-bucket"
    bucket_arn                  = "arn:aws:s3:::admin-spa-bucket"
    distribution_id             = "E2ADMIN"
    distribution_arn            = "arn:aws:cloudfront::123456789012:distribution/E2ADMIN"
    distribution_domain_name    = "d2.cloudfront.net"
    distribution_hosted_zone_id = "Z2FDTNDATAQYW2"
  }
}

override_resource {
  target          = aws_sqs_queue.picture_jobs
  override_during = plan
  values = {
    arn = "arn:aws:sqs:eu-west-2:123456789012:space-tower-defence-prod-picture-jobs"
    id  = "https://sqs.eu-west-2.amazonaws.com/123456789012/space-tower-defence-prod-picture-jobs"
    url = "https://sqs.eu-west-2.amazonaws.com/123456789012/space-tower-defence-prod-picture-jobs"
  }
}

override_resource {
  target          = aws_sqs_queue.picture_jobs_dlq
  override_during = plan
  values = {
    arn  = "arn:aws:sqs:eu-west-2:123456789012:space-tower-defence-prod-picture-jobs-dlq"
    id   = "https://sqs.eu-west-2.amazonaws.com/123456789012/space-tower-defence-prod-picture-jobs-dlq"
    name = "space-tower-defence-prod-picture-jobs-dlq"
  }
}

# The secret's ARN is known at plan time here (AWS adds a random suffix), so the policy statement and the environment
# can be checked against it.
override_resource {
  target          = aws_secretsmanager_secret.openai_api_key
  override_during = plan
  values = {
    arn = "arn:aws:secretsmanager:eu-west-2:123456789012:secret:space-tower-defence-prod-openai-api-key-AbCdEf"
    id  = "arn:aws:secretsmanager:eu-west-2:123456789012:secret:space-tower-defence-prod-openai-api-key-AbCdEf"
  }
}

run "pictures_bucket_policy" {
  command = plan

  assert {
    condition = toset([for s in jsondecode(aws_s3_bucket_policy.pictures.policy).Statement : s.Sid]) == toset([
      "DenyInsecureTransport", "AllowCloudFrontReadApproved", "DenyPictureWritesExceptAdminApi", "DenyJobWritesExceptPictureGen",
    ])
    error_message = "the pictures bucket policy has exactly its four statements"
  }

  # The only Allow: CloudFront reads pictures/v1/* through the two distributions. Never store/ (drafts) or jobs/.
  assert {
    condition = (
      length([for s in jsondecode(aws_s3_bucket_policy.pictures.policy).Statement : s if s.Effect == "Allow"]) == 1 &&
      [for s in jsondecode(aws_s3_bucket_policy.pictures.policy).Statement : s if s.Effect == "Allow"][0].Principal.Service == "cloudfront.amazonaws.com" &&
      [for s in jsondecode(aws_s3_bucket_policy.pictures.policy).Statement : s if s.Effect == "Allow"][0].Action == "s3:GetObject" &&
      [for s in jsondecode(aws_s3_bucket_policy.pictures.policy).Statement : s if s.Effect == "Allow"][0].Resource == "arn:aws:s3:::123456789012-eu-west-2-prod-pictures-bucket/pictures/v1/*" &&
      toset([for s in jsondecode(aws_s3_bucket_policy.pictures.policy).Statement : s if s.Effect == "Allow"][0].Condition.StringEquals["AWS:SourceArn"]) == toset([
        "arn:aws:cloudfront::123456789012:distribution/E1PLAYER", "arn:aws:cloudfront::123456789012:distribution/E2ADMIN",
      ])
    )
    error_message = "CloudFront may read only pictures/v1/*, and only through the player and admin distributions"
  }

  assert {
    condition = (
      [for s in jsondecode(aws_s3_bucket_policy.pictures.policy).Statement : s if s.Sid == "DenyPictureWritesExceptAdminApi"][0].Condition.StringNotEquals["aws:PrincipalArn"] == "arn:aws:iam::123456789012:role/space-tower-defence-prod-admin-api-role" &&
      toset([for s in jsondecode(aws_s3_bucket_policy.pictures.policy).Statement : s if s.Sid == "DenyPictureWritesExceptAdminApi"][0].Resource) == toset([
        "arn:aws:s3:::123456789012-eu-west-2-prod-pictures-bucket/pictures/v1/*", "arn:aws:s3:::123456789012-eu-west-2-prod-pictures-bucket/store/*",
      ]) &&
      [for s in jsondecode(aws_s3_bucket_policy.pictures.policy).Statement : s if s.Sid == "DenyJobWritesExceptPictureGen"][0].Condition.StringNotEquals["aws:PrincipalArn"] == "arn:aws:iam::123456789012:role/space-tower-defence-prod-picture-gen-role" &&
      [for s in jsondecode(aws_s3_bucket_policy.pictures.policy).Statement : s if s.Sid == "DenyJobWritesExceptPictureGen"][0].Resource == "arn:aws:s3:::123456789012-eu-west-2-prod-pictures-bucket/jobs/*"
    )
    error_message = "store/ and pictures/v1/ are writable only by admin-api, jobs/ only by picture-gen"
  }

  # Both single-writer Denies cover version-level writes too: on a versioned bucket, removing a delete marker
  # (s3:DeleteObjectVersion) would otherwise bring a deleted picture back.
  assert {
    condition = alltrue([
      for sid in ["DenyPictureWritesExceptAdminApi", "DenyJobWritesExceptPictureGen"] :
      toset([for s in jsondecode(aws_s3_bucket_policy.pictures.policy).Statement : s if s.Sid == sid][0].Action) == toset([
        "s3:Put*", "s3:Delete*", "s3:Replicate*", "s3:RestoreObject",
      ])
    ])
    error_message = "the single-writer Denies cover every object and object-version write (Put*, Delete*, Replicate*, RestoreObject)"
  }
}

run "job_queue" {
  command = plan

  assert {
    condition = (
      aws_sqs_queue.picture_jobs.sqs_managed_sse_enabled &&
      aws_sqs_queue.picture_jobs.visibility_timeout_seconds > 840 &&
      aws_sqs_queue.picture_jobs.message_retention_seconds > aws_sqs_queue.picture_jobs.visibility_timeout_seconds &&
      aws_sqs_queue.picture_jobs_dlq.sqs_managed_sse_enabled
    )
    error_message = "the job queue is encrypted, outlasts the 840 s function timeout (Gate P2 background), and a failed delivery reaches the DLQ before it expires"
  }

  assert {
    condition = (
      jsondecode(aws_sqs_queue_redrive_policy.picture_jobs.redrive_policy).maxReceiveCount == 1 &&
      jsondecode(aws_sqs_queue_redrive_policy.picture_jobs.redrive_policy).deadLetterTargetArn == "arn:aws:sqs:eu-west-2:123456789012:space-tower-defence-prod-picture-jobs-dlq"
    )
    error_message = "a failed delivery goes straight to the DLQ: a paid call is never retried by the queue"
  }

  assert {
    condition = (
      [for s in jsondecode(aws_sqs_queue_policy.picture_jobs.policy).Statement : s if s.Sid == "DenySendExceptAdminApi"][0].Effect == "Deny" &&
      [for s in jsondecode(aws_sqs_queue_policy.picture_jobs.policy).Statement : s if s.Sid == "DenySendExceptAdminApi"][0].Action == "sqs:SendMessage" &&
      [for s in jsondecode(aws_sqs_queue_policy.picture_jobs.policy).Statement : s if s.Sid == "DenySendExceptAdminApi"][0].Condition.StringNotEquals["aws:PrincipalArn"] == "arn:aws:iam::123456789012:role/space-tower-defence-prod-admin-api-role" &&
      alltrue([for s in jsondecode(aws_sqs_queue_policy.picture_jobs.policy).Statement : s.Effect == "Deny"])
    )
    error_message = "only admin-api may queue a job, and the queue policy grants nothing"
  }

  assert {
    condition = (
      aws_lambda_event_source_mapping.picture_gen.batch_size == 1 &&
      aws_lambda_event_source_mapping.picture_gen.scaling_config[0].maximum_concurrency == 2 &&
      aws_lambda_event_source_mapping.picture_gen.event_source_arn == "arn:aws:sqs:eu-west-2:123456789012:space-tower-defence-prod-picture-jobs"
    )
    error_message = "picture-gen takes one job at a time, at most two in parallel"
  }

  assert {
    condition = (
      aws_cloudwatch_metric_alarm.picture_jobs_dlq.dimensions.QueueName == "space-tower-defence-prod-picture-jobs-dlq" &&
      aws_cloudwatch_metric_alarm.picture_output_tokens.threshold == 150000 &&
      aws_cloudwatch_metric_alarm.picture_output_tokens.period == 3600 &&
      aws_cloudwatch_log_metric_filter.picture_output_tokens.metric_transformation[0].value == "$.outputTokens"
    )
    error_message = "the DLQ alarm watches the DLQ, and the hourly token alarm sums outputTokens over an hour"
  }
}

run "function_settings_and_caps" {
  command = plan

  assert {
    condition     = length(output.lambda_function_names) == 7 && contains(keys(output.lambda_function_names), "picture-gen")
    error_message = "picture-gen is one of the seven functions (the apply workflow checks each one's code against the manifest)"
  }

  assert {
    condition     = var.picture_daily_cap == 100 && var.picture_monthly_cap == 150 && var.monthly_budget_usd == 65
    error_message = "owner decisions 2026-11-16: daily cap 100, monthly cap 150, budget USD 65"
  }

  assert {
    condition     = var.bedrock_model_id == "eu.anthropic.claude-opus-5-5" && var.bedrock_max_tokens == 16000
    error_message = "the EU inference profile for Claude Opus 5.5, max_tokens 16000"
  }
}

# Owner decision 2026-11-16: OpenAI draws, with the key in Secrets Manager; Bedrock stays a variable away.
run "openai_provider_and_key_secret" {
  command = plan

  assert {
    condition = (
      var.picture_provider == "openai" &&
      var.openai_model_id == "gpt-6.1-sol" &&
      var.openai_base_url == "https://eu.api.openai.com/v1"
    )
    error_message = "owner decisions 2026-11-16: OpenAI, gpt-6.1-sol, Europe data residency"
  }

  assert {
    condition = (
      aws_secretsmanager_secret.openai_api_key.name == "space-tower-defence-prod-openai-api-key" &&
      aws_secretsmanager_secret.openai_api_key.kms_key_id == null
    )
    error_message = "one secret, <name_prefix>-openai-api-key, encrypted with the AWS managed key aws/secretsmanager"
  }

  # GetSecretValue on exactly that secret, in picture-gen's policy only, and nothing else on Secrets Manager.
  assert {
    condition = (
      length([
        for s in data.aws_iam_policy_document.picture_gen.statement : s
        if length([for a in s.actions : a if startswith(a, "secretsmanager:")]) > 0
      ]) == 1 &&
      [for s in data.aws_iam_policy_document.picture_gen.statement : s if s.sid == "OpenAIKeySecret"][0].actions == toset(["secretsmanager:GetSecretValue"]) &&
      [for s in data.aws_iam_policy_document.picture_gen.statement : s if s.sid == "OpenAIKeySecret"][0].resources == toset([
        "arn:aws:secretsmanager:eu-west-2:123456789012:secret:space-tower-defence-prod-openai-api-key-AbCdEf",
      ])
    )
    error_message = "picture-gen may GetSecretValue on the OpenAI key secret and nothing else in Secrets Manager"
  }

  assert {
    condition = alltrue([
      for s in data.aws_iam_policy_document.admin_api.statement :
      length([for a in s.actions : a if startswith(a, "secretsmanager:")]) == 0
    ])
    error_message = "admin-api gets no Secrets Manager access"
  }

  # The Bedrock statements stay, so switching back is the variable and a release.
  assert {
    condition = toset([for s in data.aws_iam_policy_document.picture_gen.statement : s.sid]) == toset([
      "PictureJobsQueue", "PictureJobsReadWrite", "PictureJobsList", "OpenAIKeySecret", "BedrockProfile", "BedrockModelViaProfile",
    ])
    error_message = "picture-gen's statements: queue, jobs/ read and write, jobs/ list, the key secret, and Bedrock"
  }
}

run "bedrock_is_a_variable_away" {
  command = plan

  variables {
    picture_provider = "bedrock"
  }

  assert {
    condition     = var.picture_provider == "bedrock"
    error_message = "bedrock is an accepted provider"
  }
}

run "an_unknown_provider_is_refused" {
  command = plan

  variables {
    picture_provider = "gemini"
  }

  expect_failures = [var.picture_provider]
}

run "an_http_base_url_is_refused" {
  command = plan

  variables {
    openai_base_url = "http://eu.api.openai.com/v1"
  }

  expect_failures = [var.openai_base_url]
}

run "a_function_behind_the_api_still_cannot_exceed_29_seconds" {
  command = plan

  module {
    source = "../modules/lambda_function"
  }

  variables {
    function_name          = "x"
    role_name              = "x-role"
    policy_json            = "{}"
    memory_size            = 128
    timeout                = 30
    s3_bucket              = "artifacts"
    s3_key                 = "lambda/x/${join("", [for i in range(64) : "a"])}.zip"
    source_code_sha256_b64 = "qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqo="
    environment            = {}
    log_retention_days     = 7
    alarm_name_prefix      = "x"
    alarm_topic_arn        = "arn:aws:sns:eu-west-2:123456789012:alerts"
  }

  expect_failures = [var.timeout]
}
