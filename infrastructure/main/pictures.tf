# Pictures (Phases 42a and 42b; ADR-0026 as amended, ADR-0031). Prefixes and role ARNs are in locals.tf.
#
# 42a: one private bucket. admin-api writes the master copy of each picture under store/ and, on approval, a served
#      copy under pictures/v1/, which both sites serve at /pictures/* through their existing Origin Access Control.
# 42b: picture-gen, the fifth function. admin-api queues a job on SQS (R38); picture-gen calls the model and writes
#      the result under jobs/; admin-api reads it when the page polls (R39). No function invokes another (ADR-0003),
#      and picture-gen never touches DynamoDB. The model is OpenAI's (var.picture_provider = "openai", owner decision
#      2026-11-16: the account cannot use any Anthropic model on Bedrock), with the key in Secrets Manager; Claude on
#      Bedrock (EU inference profile) is the other setting, and its IAM stays so switching back is a variable.
#
# Cost controls, in order of strength: the daily and monthly caps that admin-api counts in DynamoDB (variables.tf), the
# function's reserved concurrency (2) and the event source mapping's maximum concurrency (2), the output-token limit
# per call, the hourly output-token alarm below, and the budgets: AWS Budgets (modules/monitoring) for AWS spend, and
# the owner's budget in the OpenAI project for OpenAI spend, which AWS Budgets cannot see (ADR-0031).

# ---------------------------------------------------------------------------
# Bucket (42a). The root writes the policy: it names both distributions and both writer roles.
# ---------------------------------------------------------------------------

module "pictures_bucket" {
  source = "../modules/private_bucket"

  bucket_name     = local.pictures_bucket_name
  manage_policy   = false # aws_s3_bucket_policy.pictures below
  expire_prefixes = { (local.picture_job_prefix) = 14 }
  # No CORS: the browser never talks to this bucket. Uploads go through the API (R34); pictures are same-origin.
}

locals {
  # The second S3 origin of both distributions (modules/static_site extra_s3_origin).
  pictures_origin = {
    origin_id    = "s3-pictures"
    domain_name  = module.pictures_bucket.bucket_regional_domain_name
    path_pattern = "/pictures/*"
  }

  # Every action that changes an object or one of its versions. The bucket is versioned, so a Deny on PutObject and
  # DeleteObject alone would still let a principal with broad S3 IAM remove a delete marker (DeleteObjectVersion) and
  # bring a deleted picture back. On object ARNs these wildcards match object actions only, never bucket settings.
  # Lifecycle expiry is not a principal, so the bucket's own expiry rules still run.
  picture_object_write_actions = ["s3:Put*", "s3:Delete*", "s3:Replicate*", "s3:RestoreObject"]

  # Written with jsonencode, as the site buckets' policies are (modules/static_site): no phantom rewrite in the plan.
  # Explicit Deny statements make each prefix single-writer whatever IAM a principal holds (the CI role included).
  # CloudFront gets no ListBucket, so a missing or draft ID under /pictures/v1/ is 403.
  pictures_bucket_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.pictures_bucket_arn, "${local.pictures_bucket_arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      # Only approved pictures, only through the two distributions. Drafts under store/ are never readable at the edge.
      {
        Sid       = "AllowCloudFrontReadApproved"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${local.pictures_bucket_arn}/${local.picture_served_prefix}*"
        Condition = {
          StringEquals = { "AWS:SourceArn" = [module.player_site.distribution_arn, module.admin_site.distribution_arn] }
        }
      },
      {
        Sid       = "DenyPictureWritesExceptAdminApi"
        Effect    = "Deny"
        Principal = "*"
        Action    = local.picture_object_write_actions
        Resource = [
          "${local.pictures_bucket_arn}/${local.picture_served_prefix}*",
          "${local.pictures_bucket_arn}/${local.picture_store_prefix}*",
        ]
        Condition = { StringNotEquals = { "aws:PrincipalArn" = local.admin_api_role_arn } }
      },
      {
        Sid       = "DenyJobWritesExceptPictureGen"
        Effect    = "Deny"
        Principal = "*"
        Action    = local.picture_object_write_actions
        Resource  = "${local.pictures_bucket_arn}/${local.picture_job_prefix}*"
        Condition = { StringNotEquals = { "aws:PrincipalArn" = local.picture_gen_role_arn } }
      },
    ]
  })
}

resource "aws_s3_bucket_policy" "pictures" {
  bucket = module.pictures_bucket.bucket_name
  policy = local.pictures_bucket_policy

  # After the module's public access block, as the other buckets' policies are (never a window with neither).
  depends_on = [module.pictures_bucket]
}

# ---------------------------------------------------------------------------
# Job queue (42b). One message per started job, from admin-api only. A delivery that fails (only an S3 write error
# fails picture-gen; every Bedrock outcome is written as error.json and succeeds) is not retried: it goes to the DLQ,
# which alarms, so a paid call is never repeated by the queue.
# ---------------------------------------------------------------------------

resource "aws_sqs_queue" "picture_jobs_dlq" {
  name                      = "${local.name_prefix}-picture-jobs-dlq"
  message_retention_seconds = 345600 # 4 days to look at a failed delivery
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "picture_jobs" {
  name                    = "${local.name_prefix}-picture-jobs"
  sqs_managed_sse_enabled = true

  # Above the function's 840 s timeout (Lambda requires at least that), so a message is never delivered again while
  # its first delivery may still be running. [PROPOSAL] 900 rather than the design's 3600: with retention at 3600, a
  # failed delivery becomes visible again after 900 s and so reaches the DLQ (receive count 2) before it expires.
  visibility_timeout_seconds = 900
  # An hour, so a failed delivery lives long enough to reach the DLQ. A message is stale long before that: picture-gen
  # answers any job older than 15 minutes (from its start) with error.json timed_out without calling Bedrock, and
  # admin-api fails a job nobody has claimed 17 minutes after its start (api/shared/pictures.py QUEUE_MAX_AGE and
  # JOB_TIMEOUT; Gate P2 raised both by 2 minutes so a job queued behind a whole 840 s run is still drawn). A claimed
  # job is timed out only 15 minutes after its claim (DRAW_TIMEOUT, past the 840 s function timeout), so a background
  # that takes 12 minutes is not given up on.
  message_retention_seconds = 3600
}

resource "aws_sqs_queue_redrive_policy" "picture_jobs" {
  queue_url = aws_sqs_queue.picture_jobs.id
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.picture_jobs_dlq.arn
    maxReceiveCount     = 1
  })
}

resource "aws_sqs_queue_redrive_allow_policy" "picture_jobs_dlq" {
  queue_url = aws_sqs_queue.picture_jobs_dlq.id
  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.picture_jobs.arn]
  })
}

resource "aws_sqs_queue_policy" "picture_jobs" {
  queue_url = aws_sqs_queue.picture_jobs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "sqs:*"
        Resource  = aws_sqs_queue.picture_jobs.arn
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      # Every started job is counted against the caps by admin-api first; nothing else may queue one.
      {
        Sid       = "DenySendExceptAdminApi"
        Effect    = "Deny"
        Principal = "*"
        Action    = "sqs:SendMessage"
        Resource  = aws_sqs_queue.picture_jobs.arn
        Condition = { StringNotEquals = { "aws:PrincipalArn" = local.admin_api_role_arn } }
      },
    ]
  })
}

resource "aws_sqs_queue_policy" "picture_jobs_dlq" {
  queue_url = aws_sqs_queue.picture_jobs_dlq.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "sqs:*"
        Resource  = aws_sqs_queue.picture_jobs_dlq.arn
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

resource "aws_cloudwatch_metric_alarm" "picture_jobs_dlq" {
  alarm_name          = "${local.name_prefix}-picture-jobs-dlq"
  alarm_description   = "picture-gen: a job message reached the dead-letter queue (an S3 write failed; the job shows as failed)."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.picture_jobs_dlq.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = [module.monitoring.alerts_topic_arn]
  ok_actions          = [module.monitoring.alerts_topic_arn]
}

# ---------------------------------------------------------------------------
# picture-gen (42b): the fifth function (ADR-0031). Invoked only by its queue, so it may run past the 29 s API limit.
# ---------------------------------------------------------------------------

locals {
  # The EU cross-Region inference profile (owner decision 2026-11-16) and the foundation model it routes to.
  # [VERIFIED] `aws bedrock get-inference-profile --inference-profile-identifier eu.anthropic.claude-opus-5-5`
  # (2026-11-16): ACTIVE, this ARN, routing to anthropic.claude-opus-5-5 in seven EU Regions.
  bedrock_profile_arn = "arn:aws:bedrock:${var.region}:${var.aws_account_id}:inference-profile/${var.bedrock_model_id}"
  bedrock_model_name  = join(".", slice(split(".", var.bedrock_model_id), 1, length(split(".", var.bedrock_model_id))))
}

# The OpenAI API key (owner decision 2026-11-16). Terraform creates the secret only, never a version: the key never
# enters the state or the plan. The owner stores it once with put-secret-value (docs/runbooks/openai-key.md; a local
# write listed in docs/build-phases.md). Encrypted with the AWS managed key aws/secretsmanager (no kms_key_id): only
# picture-gen's role is granted GetSecretValue, and the managed key's policy allows decryption through Secrets
# Manager for principals of this account that may read the secret, so no key policy to maintain. Default 30-day
# recovery window on delete.
resource "aws_secretsmanager_secret" "openai_api_key" {
  name        = "${local.name_prefix}-openai-api-key"
  description = "OpenAI API key for picture-gen (Europe data residency project). Value set by the owner, never by Terraform."
}

data "aws_iam_policy_document" "picture_gen" {
  statement {
    sid = "PictureJobsQueue"
    actions = [
      "sqs:ReceiveMessage",
      "sqs:DeleteMessage",
      "sqs:GetQueueAttributes",
      "sqs:ChangeMessageVisibility",
    ]
    resources = [aws_sqs_queue.picture_jobs.arn]
  }

  # Its own exchange files only: claim (If-None-Match), progress.json, result.json, error.json, and the previous job's
  # result.json for Try again. The bucket policy denies job writes to every other principal.
  statement {
    sid       = "PictureJobsReadWrite"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${local.pictures_bucket_arn}/${local.picture_job_prefix}*"]
  }

  # So a missing previous result is 404, not 403.
  statement {
    sid       = "PictureJobsList"
    actions   = ["s3:ListBucket"]
    resources = [local.pictures_bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${local.picture_job_prefix}*"]
    }
  }

  # The OpenAI key: this one secret only (read once per container). Kept whichever provider is chosen, like the
  # Bedrock statements below, so switching is a variable and nothing else.
  statement {
    sid       = "OpenAIKeySecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.openai_api_key.arn]
  }

  # Bedrock (picture_provider = "bedrock"). The inference profile itself (streaming, as the handler calls it).
  statement {
    sid       = "BedrockProfile"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = [local.bedrock_profile_arn]
  }

  # The profile routes each call to the model in any of its EU Regions, and Bedrock authorises that hop on the
  # foundation-model ARN too. The Region is a wildcard (the profile may add Regions); the condition limits this to
  # calls made through the one profile, so the model cannot be called directly or through another profile.
  statement {
    sid       = "BedrockModelViaProfile"
    actions   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
    resources = ["arn:aws:bedrock:*::foundation-model/${local.bedrock_model_name}"]

    condition {
      test     = "StringEquals"
      variable = "bedrock:InferenceProfileArn"
      values   = [local.bedrock_profile_arn]
    }
  }
}

module "picture_gen" {
  source = "../modules/lambda_function"

  function_name = local.lambda_names["picture-gen"]
  description   = "Draws a picture with the configured model (OpenAI or Bedrock) for a queued job; writes the result to S3"
  role_name     = "${local.name_prefix}-picture-gen-role"
  policy_json   = data.aws_iam_policy_document.picture_gen.json

  memory_size = 512
  # Gate P2: covers the longest kind. A background takes 7-12 minutes (one SDK attempt); every other kind two attempts
  # of 280 s (580 s with connects). The SDK's read timeout limits only each gap in the stream, so picture-gen stops its
  # own call 780 s after the run starts (handler CALL_SECONDS: this timeout less 60 s for writing the outcome). 840
  # stays under the queue's 900 s visibility timeout and Lambda's 900 s, and under admin-api's 15-minute claim deadline
  # (api/shared/pictures.py WORKER_TIMEOUT and DRAW_TIMEOUT; an api test reads this value).
  timeout              = 840
  max_timeout          = 900                          # no API route invokes it, so the 29 s API ceiling does not apply
  duration_alarm_ratio = 0.9                          # alarm at 756 s: past a 12-minute background, before the timeout
  reserved_concurrency = 2                            # at most two paid calls at once, whatever the queue holds
  log_retention_days   = var.audit_log_retention_days # the usage lines are the cost history

  s3_bucket              = data.aws_s3_bucket.artifacts.id
  s3_key                 = var.lambda_artifacts["picture-gen"].s3_key
  source_code_sha256_b64 = var.lambda_artifacts["picture-gen"].sha256_b64

  alarm_name_prefix = "${local.name_prefix}-lambda-picture-gen"
  alarm_topic_arn   = module.monitoring.alerts_topic_arn

  environment = {
    POWERTOOLS_SERVICE_NAME = "picture-gen"
    PICTURES_BUCKET         = local.pictures_bucket_name
    PICTURE_JOB_PREFIX      = local.picture_job_prefix
    PICTURE_PROVIDER        = var.picture_provider
    OPENAI_MODEL_ID         = var.openai_model_id
    OPENAI_BASE_URL         = var.openai_base_url
    OPENAI_SECRET_ARN       = aws_secretsmanager_secret.openai_api_key.arn # the ARN only; the key is read at run time
    BEDROCK_MODEL_ID        = var.bedrock_model_id
    BEDROCK_MAX_TOKENS      = tostring(var.bedrock_max_tokens)
  }
}

resource "aws_lambda_event_source_mapping" "picture_gen" {
  event_source_arn = aws_sqs_queue.picture_jobs.arn
  function_name    = module.picture_gen.arn
  batch_size       = 1

  scaling_config {
    maximum_concurrency = 2 # the minimum SQS allows; matches the reserved concurrency
  }
}

# ---------------------------------------------------------------------------
# Hourly output-token alarm (42b). picture-gen logs one {"metric": "picture_usage", "outputTokens": N, ...} line per
# job with its token counts (api/shared/log.py allow-list; never the prompt or the SVG). 150,000 output tokens in an
# hour is roughly nine 256-kind jobs at max_tokens (16,000) or four backgrounds at theirs (32,000; Gate P2), above
# normal use. With OpenAI the per-call limits are 24,000 and 48,000 (reasoning headroom), so it is about six 256-kind
# jobs or three backgrounds at their limits; OpenAI's outputTokens includes reasoning, as Claude's includes thinking. A breach means something is looping or the caps are wrong, or an unusually busy hour of backgrounds:
# check the picture_usage lines' `kind` before treating it as a fault. [PROPOSAL] threshold unchanged; owner to
# confirm at the gate.
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_metric_filter" "picture_output_tokens" {
  name           = "${local.name_prefix}-picture-output-tokens"
  log_group_name = module.picture_gen.log_group_name
  pattern        = "{ $.metric = \"picture_usage\" }"

  metric_transformation {
    namespace = "SpaceTowerDefence/Pictures"
    name      = "OutputTokens"
    value     = "$.outputTokens"
    unit      = "Count"
  }
}

resource "aws_cloudwatch_metric_alarm" "picture_output_tokens" {
  alarm_name          = "${local.name_prefix}-picture-gen-tokens-hourly"
  alarm_description   = "picture-gen: output tokens in the last hour (Sum >= 150000). Check the caps and the picture-gen log."
  namespace           = "SpaceTowerDefence/Pictures"
  metric_name         = "OutputTokens"
  statistic           = "Sum"
  period              = 3600
  evaluation_periods  = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 150000
  treat_missing_data  = "notBreaching"
  alarm_actions       = [module.monitoring.alerts_topic_arn]
  ok_actions          = [module.monitoring.alerts_topic_arn]

  depends_on = [aws_cloudwatch_log_metric_filter.picture_output_tokens]
}
