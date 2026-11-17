variable "name_prefix" {
  description = "space-tower-defence-prod: names the vault, plan, selection, role and alarm"
  type        = string
}

variable "table_arns" {
  description = "The tables to back up, by name (game, content): selected by ARN (H.13). Both are required (G-5)."
  type        = map(string)

  validation {
    condition     = alltrue([for k in ["game", "content"] : contains(keys(var.table_arns), k)])
    error_message = "table_arns must name both the game and the content table (gate G-5)."
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
