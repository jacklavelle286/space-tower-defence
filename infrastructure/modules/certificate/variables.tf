variable "primary_hostname" {
  description = "Certificate domain name (the player hostname)."
  type        = string
}

variable "alternative_hostnames" {
  description = "Subject alternative names (the admin hostname)."
  type        = list(string)
  default     = []
}

variable "validation_timeout" {
  description = "How long the apply waits for ACM to see the owner's validation CNAMEs. Keep it inside the pipeline job and role session (plan H.15.2)."
  type        = string
  default     = "30m"
}
