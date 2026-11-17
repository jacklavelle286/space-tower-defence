# The game-data publisher (Gate M, LD6; publisher.tf): the bucket Deny on game-data/*, who may write and invoke what, the
# freeze switch and the no-retry asynchronous invoke. Offline: mock providers and a plan, nothing reaches AWS or the
# state bucket. Run from infrastructure/main: terraform init -backend=false && terraform test (CI repo job).
# The IAM policy documents are data sources a mock provider cannot evaluate: their statement blocks (the inputs) are
# checked here, their rendered JSON in the read-only plan.

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

run "bucket_deny_and_writers" {
  command = plan

  assert {
    condition = (
      length(local.game_data_bucket_statements) == 1 &&
      local.game_data_bucket_statements[0].Effect == "Deny" &&
      local.game_data_bucket_statements[0].Principal == "*" &&
      local.game_data_bucket_statements[0].Resource == "arn:aws:s3:::123456789012-eu-west-2-prod-player-spa-bucket/game-data/*" &&
      contains(local.game_data_bucket_statements[0].Action, "s3:Put*") &&
      contains(local.game_data_bucket_statements[0].Action, "s3:Delete*") &&
      toset(local.game_data_bucket_statements[0].Condition.StringNotEquals["aws:PrincipalArn"]) == toset([
        "arn:aws:iam::123456789012:role/space-tower-defence-prod-game-data-publish-role",
        "arn:aws:iam::123456789012:role/space-tower-defence-prod-github-oidc",
      ])
    )
    error_message = "game-data/* object writes are denied to everyone but the publisher's role and the release's CI role"
  }

  assert {
    condition = (
      toset(flatten([for s in data.aws_iam_policy_document.game_data_publish.statement : s.actions if s.sid == "GameDataWrite"])) == toset(["s3:PutObject"]) &&
      length([for r in flatten([for s in data.aws_iam_policy_document.game_data_publish.statement : s.resources if s.sid == "GameDataWrite"]) : r if strcontains(r, "ruleset")]) == 0 &&
      length(flatten([for s in data.aws_iam_policy_document.game_data_publish.statement : s.resources if s.sid == "GameDataWrite"])) == 4
    )
    error_message = "the publisher may PutObject on campaign/, bounds/, current.json and versions.json only: never ruleset/, never a delete"
  }

  assert {
    condition = (
      alltrue([for s in data.aws_iam_policy_document.game_data_check.statement : s.effect == "Deny"]) &&
      length(data.aws_iam_policy_document.game_data_check.statement) == 1
    )
    error_message = "game-data-check has no data access: its only statement is a Deny"
  }
}

run "freeze_switch_and_async_invoke" {
  command = plan

  assert {
    condition = (
      aws_ssm_parameter.game_data_freeze.value == "false" &&
      aws_ssm_parameter.game_data_freeze.name == "/space-tower-defence-prod/game-data-publish-frozen" &&
      aws_lambda_function_event_invoke_config.game_data_publish.maximum_retry_attempts == 0
    )
    error_message = "publishing is on by default, and a failed asynchronous publish is never retried by Lambda"
  }
}

run "frozen" {
  command = plan

  variables {
    game_data_publish_frozen = true
  }

  assert {
    condition     = aws_ssm_parameter.game_data_freeze.value == "true"
    error_message = "game_data_publish_frozen sets the switch the publisher reads"
  }
}
