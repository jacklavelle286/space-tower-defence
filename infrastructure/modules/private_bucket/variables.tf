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

variable "manage_policy" {
  description = "true: the module attaches a TLS-only bucket policy. false: the caller writes the whole policy (the pictures bucket, whose policy names CloudFront distributions and roles) and must include DenyInsecureTransport."
  type        = bool
  default     = true
}

variable "expire_prefixes" {
  description = "Key prefix (ending in /) -> days after which current objects under it expire. Empty for buckets whose objects are kept."
  type        = map(number)
  default     = {}

  validation {
    condition     = alltrue([for p, d in var.expire_prefixes : can(regex("^[a-z0-9-]+/$", p)) && d >= 1 && floor(d) == d])
    error_message = "expire_prefixes keys must be one lowercase path segment ending in / and values whole days >= 1."
  }
}

variable "noncurrent_version_expiration_days" {
  description = "Days a noncurrent object version is kept before it expires."
  type        = number
  default     = 30
}
