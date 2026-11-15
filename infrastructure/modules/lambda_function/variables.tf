variable "function_name" {
  description = "Function name (space-tower-defence-prod-eu-west-2-<key>, spine S1.1)."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_-]{1,64}$", var.function_name))
    error_message = "function_name must be 1-64 letters, digits, hyphens or underscores."
  }
}

variable "description" {
  description = "Function description."
  type        = string
  default     = ""
}

variable "role_name" {
  description = "Execution role name (space-tower-defence-prod-<key>-role, spine S1.1)."
  type        = string

  validation {
    condition     = length(var.role_name) <= 64
    error_message = "role_name must be at most 64 characters."
  }
}

variable "policy_json" {
  description = "Inline policy with the function's data and service permissions (E.6.4). Log permissions are added here."
  type        = string
}

variable "memory_size" {
  description = "Memory in MB."
  type        = number
}

variable "timeout" {
  description = "Timeout in seconds. API functions stay under the 30 s HTTP API integration limit (E.6.2)."
  type        = number

  validation {
    condition     = var.timeout >= 1 && var.timeout <= 29
    error_message = "timeout must be 1 to 29 seconds (below the 30 s HTTP API integration limit)."
  }
}

variable "s3_bucket" {
  description = "Artefacts bucket that holds the zip (bootstrap-owned)."
  type        = string
}

variable "s3_key" {
  description = "Zip key, lambda/<key>/<sha256-hex>.zip, from var.lambda_artifacts in the root."
  type        = string

  validation {
    condition     = can(regex("^lambda/[a-z0-9-]+/[0-9a-f]{64}\\.zip$", var.s3_key))
    error_message = "s3_key must be lambda/<key>/<64 hex digits>.zip."
  }
}

variable "source_code_sha256_b64" {
  description = "Base64 SHA-256 of the zip. A change updates the code even if the key were reused."
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9+/]{43}=$", var.source_code_sha256_b64))
    error_message = "source_code_sha256_b64 must be a base64-encoded SHA-256 (44 characters ending in =)."
  }
}

variable "environment" {
  description = "Environment variables. Never secrets, never release_id (H.4.4)."
  type        = map(string)
}

variable "log_retention_days" {
  description = "Log group retention in days."
  type        = number
}

variable "alarm_name_prefix" {
  description = "Alarm name prefix; the module appends -errors, -throttles and -duration (space-tower-defence-prod-lambda-<key>, plan H.14)."
  type        = string
}

variable "alarm_topic_arn" {
  description = "SNS topic (eu-west-2) for the alarm and OK actions. Required: every function has alarms (gate G-5)."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:sns:[a-z0-9-]+:[0-9]{12}:[A-Za-z0-9_-]+$", var.alarm_topic_arn))
    error_message = "alarm_topic_arn must be an SNS topic ARN."
  }
}

variable "duration_alarm_ratio" {
  description = "Fraction of the timeout at which the duration alarm fires (Maximum Duration)."
  type        = number
  default     = 0.8

  validation {
    condition     = var.duration_alarm_ratio > 0 && var.duration_alarm_ratio < 1
    error_message = "duration_alarm_ratio must be between 0 and 1."
  }
}
