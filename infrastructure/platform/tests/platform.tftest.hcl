# The platform root (ENV-4, PS1). Offline: a mock provider and plans, so nothing reaches AWS or the state bucket.
# Run from infrastructure/platform: terraform init -backend=false && terraform test (CI repo job).

# The backup module builds its role's trust policy with aws_iam_policy_document; the mock returns a valid empty policy
# (as modules/backup's own tests do), since a random string is not JSON.
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }
}

variables {
  project            = "space-tower-defence"
  region             = "eu-west-2"
  environment        = "sca-dev"
  aws_account_id     = "123456789012"
  notification_email = "alerts@example.com"
}

run "alerts_topic_emails_the_owner" {
  command = plan

  assert {
    condition     = aws_sns_topic.alerts.name == "space-tower-defence-sca-dev-alerts"
    error_message = "The alerts topic is named <project>-<environment>-alerts."
  }

  assert {
    condition     = aws_sns_topic_subscription.alerts_email.protocol == "email"
    error_message = "The alerts reach the owner by email."
  }

  assert {
    condition     = aws_sns_topic_subscription.alerts_email.endpoint == "alerts@example.com"
    error_message = "The email subscription goes to notification_email."
  }
}

run "tags_mark_the_platform_edition" {
  command = plan

  assert {
    condition = local.default_tags == {
      project     = "space-tower-defence"
      environment = "sca-dev"
      edition     = "platform"
      managed_by  = "terraform"
    }
    error_message = "Every resource is tagged with the project, the environment, edition = platform and managed_by."
  }
}

run "prod_plans_too" {
  command = plan

  variables {
    environment = "sca-prod"
  }

  assert {
    condition     = aws_sns_topic.alerts.name == "space-tower-defence-sca-prod-alerts"
    error_message = "sca-prod gets its own alerts topic."
  }
}

run "refuses_the_family_environment" {
  command = plan

  variables {
    environment = "prod"
  }

  expect_failures = [var.environment]
}

run "refuses_a_malformed_account_id" {
  command = plan

  variables {
    aws_account_id = "8141554546"
  }

  expect_failures = [var.aws_account_id]
}

run "refuses_a_malformed_email" {
  command = plan

  variables {
    notification_email = "not-an-email"
  }

  expect_failures = [var.notification_email]
}

run "tenancy_table_and_its_daily_backup" {
  command = plan

  assert {
    condition     = output.tenancy_table_name == "space-tower-defence-sca-dev-tenancy"
    error_message = "The tenancy table is named <project>-<environment>-tenancy."
  }

  assert {
    condition     = output.backup_vault_name == "space-tower-defence-sca-dev-vault"
    error_message = "The platform has its own backup vault, named from the environment."
  }
}

run "prod_names_its_tenancy_table" {
  command = plan

  variables {
    environment = "sca-prod"
  }

  assert {
    condition     = output.tenancy_table_name == "space-tower-defence-sca-prod-tenancy"
    error_message = "Each account gets its own tenancy table."
  }
}
