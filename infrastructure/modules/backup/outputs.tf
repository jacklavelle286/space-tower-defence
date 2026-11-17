output "vault_name" {
  value = aws_backup_vault.this.name
}

output "plan_id" {
  value = aws_backup_plan.this.id
}

output "selection_id" {
  value = aws_backup_selection.tables.id
}
