variable "bucket_name" {
  description = "Bucket name (<account>-<region>-<env>-<purpose>-bucket, spine S1)."
  type        = string
}

variable "cors_allowed_origins" {
  description = "Exact origins allowed to GET/HEAD objects from script (https://host, no path). Empty means no CORS configuration."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for o in var.cors_allowed_origins : can(regex("^https://[a-z0-9.-]+$", o))])
    error_message = "Each CORS origin must be an exact https://<host> origin: no wildcard, path or trailing slash."
  }
}

variable "cors_max_age_seconds" {
  description = "How long a browser may cache the CORS preflight answer."
  type        = number
  default     = 3600
}

variable "noncurrent_version_expiration_days" {
  description = "Days a noncurrent object version is kept before it expires."
  type        = number
  default     = 30
}
