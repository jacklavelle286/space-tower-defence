# The platform's alerts topic (PS1). Later alarms in this account (ENV-11) notify it, and the owner gets each message by
# email. The subscription waits until the owner confirms the email AWS sends after the first apply.
#
# The topic keeps the default policy SNS gives a new topic, which lets CloudWatch alarms in this account publish. AWS
# Budgets would need a statement of its own (as modules/monitoring has); the budget is the owner's (ENV-1, OWN-1).

resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.notification_email
}
