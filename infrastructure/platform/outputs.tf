output "alerts_topic_arn" {
  description = "The platform's alerts topic; later alarms in this account notify it"
  value       = aws_sns_topic.alerts.arn
}
