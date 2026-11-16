variable "name" {
  description = "Site name: the distribution comment and the OAC name (space-tower-defence-prod-player or -admin)."
  type        = string
}

variable "bucket_name" {
  description = "Site bucket name (<account>-<region>-<env>-<site>-spa-bucket, spine S1)."
  type        = string
}

variable "hostname" {
  description = "The one alternate domain name served by this distribution. Must be on the certificate."
  type        = string
}

variable "certificate_arn" {
  description = "us-east-1 ACM certificate ARN, taken from the validation resource so it is ISSUED before use."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:acm:us-east-1:[0-9]{12}:certificate/", var.certificate_arn))
    error_message = "certificate_arn must be an ACM certificate in us-east-1 (CloudFront only accepts those)."
  }
}

variable "cache_policy_id" {
  description = "Cache policy for the default behaviour (the managed CachingOptimized policy, looked up in the root)."
  type        = string
}

variable "response_headers_policy_id" {
  description = "Response headers policy (security headers and CSP) for the default and /api/* behaviours. Owned by the root (plan H.4.2)."
  type        = string
}

variable "viewer_request_function_arn" {
  description = "CloudFront Function (cloudfront-js-2.0) for SPA deep-link fallback, attached to the default behaviour only."
  type        = string
}

variable "price_class" {
  description = "CloudFront price class (plan H.4.2: PriceClass_100)."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "price_class must be PriceClass_100, PriceClass_200 or PriceClass_All."
  }
}

variable "api_origin_domain" {
  description = "HTTP API default endpoint host name (<id>.execute-api.<region>.amazonaws.com, no scheme): the /api/* origin."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9]+\\.execute-api\\.[a-z0-9-]+\\.amazonaws\\.com$", var.api_origin_domain))
    error_message = "api_origin_domain must be an execute-api host name without https://."
  }
}

variable "api_cache_policy_id" {
  description = "Cache policy for /api/* (the managed CachingDisabled policy, looked up in the root)."
  type        = string
}

variable "api_origin_request_policy_id" {
  description = "Origin request policy for /api/* (the managed AllViewerExceptHostHeader policy: forwards Authorization)."
  type        = string
}

variable "extra_s3_origin" {
  description = "Optional second private bucket served at one path pattern through this site's OAC (the pictures bucket at /pictures/*, Phase 42a). null: none. The bucket's policy, written by the caller, must allow this distribution's ARN."
  type = object({
    origin_id    = string
    domain_name  = string
    path_pattern = string
  })
  default = null

  validation {
    condition = var.extra_s3_origin == null ? true : (
      can(regex("^[a-z0-9.-]+\\.s3\\.[a-z0-9-]+\\.amazonaws\\.com$", var.extra_s3_origin.domain_name)) &&
      can(regex("^/[a-z0-9-]+/\\*$", var.extra_s3_origin.path_pattern)) &&
      !contains(["/api/*"], var.extra_s3_origin.path_pattern) &&
      var.extra_s3_origin.origin_id != "api"
    )
    error_message = "extra_s3_origin needs a regional S3 host name (<bucket>.s3.<region>.amazonaws.com), a /<segment>/* path pattern other than /api/*, and an origin_id other than api."
  }
}
