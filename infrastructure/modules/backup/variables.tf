variable "name_prefix" {
  description = "space-tower-defence-prod: names the vault, plan, selection, role and alarm"
  type        = string
}

variable "table_arns" {
  description = "The tables to back up, by name, selected by ARN (H.13). It must name every table in required_tables."
  type        = map(string)

  validation {
    condition     = alltrue([for k in var.required_tables : contains(keys(var.table_arns), k)])
    error_message = "table_arns must name every table in required_tables (for the family edition, game and content: gate G-5)."
  }
}

variable "required_tables" {
  description = "Table names that table_arns must include. The default is the family edition's gate G-5 (game and content); the platform root passes its own list (ADR-0050)."
  type        = list(string)
  default     = ["game", "content"]

  validation {
    condition     = length(var.required_tables) > 0
    error_message = "required_tables must name at least one table."
  }
}

variable "alarm_topic_arn" {
  description = "SNS topic for the backup-job-failed alarm (the eu-west-2 alerts topic, H.14)"
  type        = string
}

variable "schedule" {
  description = "When the daily job runs (UTC cron). 02:00 UTC is after bedtime and before school in the UK."
  type        = string
  default     = "cron(0 2 * * ? *)"
}

variable "retention_days" {
  description = "How long each daily recovery point is kept: seven points (spine S8.4)"
  type        = number
  default     = 7
}
