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
  description = "Response headers policy (security headers and CSP) for the default behaviour. Owned by the root (plan H.4.2)."
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
