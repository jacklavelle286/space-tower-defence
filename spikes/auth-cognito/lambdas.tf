# Two tiny Python 3.14 arm64 functions, each with its own role and log group (1-day retention).
locals {
  functions = {
    presignup = {
      timeout     = 5
      environment = { CAP = tostring(var.spike_signup_cap) }
    }
    api = {
      timeout     = 10
      environment = {}
    }
  }
}

data "archive_file" "function" {
  for_each = local.functions

  type        = "zip"
  source_file = "${path.module}/functions/${each.key}/handler.py"
  output_path = "${path.module}/build/${each.key}.zip"
}

resource "aws_cloudwatch_log_group" "function" {
  for_each = local.functions

  name              = "${local.name}-${each.key}"
  retention_in_days = 1
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "function" {
  for_each = local.functions

  name               = "${local.name}-${each.key}"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

# Logs only, to the function's own group. Neither function calls any AWS API.
data "aws_iam_policy_document" "function_logs" {
  for_each = local.functions

  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.function[each.key].arn}:*"]
  }
}

resource "aws_iam_role_policy" "function_logs" {
  for_each = local.functions

  name   = "logs"
  role   = aws_iam_role.function[each.key].id
  policy = data.aws_iam_policy_document.function_logs[each.key].json
}

resource "aws_lambda_function" "function" {
  for_each = local.functions

  function_name    = "${local.name}-${each.key}"
  role             = aws_iam_role.function[each.key].arn
  runtime          = "python3.14"
  architectures    = ["arm64"]
  handler          = "handler.handler"
  filename         = data.archive_file.function[each.key].output_path
  source_code_hash = data.archive_file.function[each.key].output_base64sha256
  memory_size      = 128
  timeout          = each.value.timeout

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.function[each.key].name
  }

  dynamic "environment" {
    for_each = length(each.value.environment) > 0 ? [each.value.environment] : []
    content {
      variables = environment.value
    }
  }

  depends_on = [aws_iam_role_policy.function_logs]
}

# Names used by the pool and the API, so those files read plainly.
locals {
  presignup_function = aws_lambda_function.function["presignup"]
  api_function       = aws_lambda_function.function["api"]
}

resource "aws_lambda_permission" "presignup_from_cognito" {
  statement_id  = "AllowPlayerPoolPreSignUp"
  action        = "lambda:InvokeFunction"
  function_name = local.presignup_function.function_name
  principal     = "cognito-idp.amazonaws.com"
  source_arn    = aws_cognito_user_pool.player.arn
}
