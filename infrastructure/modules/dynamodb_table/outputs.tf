output "name" {
  description = "Table name."
  value       = aws_dynamodb_table.this.name
}

output "arn" {
  description = "Table ARN (backup selection, Phase 9 alarms)."
  value       = aws_dynamodb_table.this.arn
}
