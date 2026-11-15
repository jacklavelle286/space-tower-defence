variable "name_prefix" {
  description = "Name prefix for topics, alarms and metric filters (space-tower-defence-prod)."
  type        = string
}

variable "notification_email" {
  description = "E-mail address subscribed to both topics. The owner confirms each subscription within 48 h (H.14)."
  type        = string
  sensitive   = true
}

variable "api_id" {
  description = "HTTP API ID (api-5xx alarm)."
  type        = string
}

variable "api_stage" {
  description = "HTTP API stage name for the api-5xx alarm's Stage dimension."
  type        = string
  default     = "$default"
}

variable "ops_log_group_name" {
  description = "player-api log group: the ops-rejected metric filter ({ $.result = \"REJECTED\" })."
  type        = string
}

variable "speech_log_group_name" {
  description = "tts log group: the speech-unavailable metric filter ({ $.code = \"SPEECH_UNAVAILABLE\" })."
  type        = string
}

variable "table_names" {
  description = "DynamoDB tables keyed by short name (game, content): one throttle alarm each."
  type        = map(string)
}

variable "distribution_ids" {
  description = "CloudFront distributions keyed by site (player, admin): one 5xx-rate alarm each, in us-east-1."
  type        = map(string)
}

variable "cloudfront_5xx_rate_threshold" {
  description = "CloudFront 5xxErrorRate (percent, 5-minute Average) above which the site alarm fires (H.14: 5)."
  type        = number
  default     = 5
}

variable "metric_namespace" {
  description = "Namespace of the log-derived metrics (H.14: SpaceTowerDefence)."
  type        = string
  default     = "SpaceTowerDefence"
}
