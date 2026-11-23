output "alerts_topic_arn" {
  description = "The platform's alerts topic; later alarms in this account notify it"
  value       = aws_sns_topic.alerts.arn
}

output "tenancy_table_name" {
  description = "The tenancy table (DAT-1): every school's data, under SCH#<schoolId>"
  value       = module.tenancy_table.name
}

output "tenancy_table_arn" {
  description = "The tenancy table's ARN, for the functions' IAM policies (LeadingKeys per function, 10 §4)"
  value       = module.tenancy_table.arn
}

output "backup_vault_name" {
  description = "The platform's backup vault: daily recovery points of the tenancy table"
  value       = module.backup.vault_name
}
