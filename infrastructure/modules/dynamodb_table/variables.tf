variable "name" {
  description = "Table name (space-tower-defence-prod-game or -content, spine S1.1)."
  type        = string
}

variable "ttl_attribute" {
  description = "Attribute that holds the expiry time (epoch seconds), or null for no TTL. Only game sets it (\"ttl\")."
  type        = string
  default     = null

  validation {
    condition     = var.ttl_attribute == null || can(regex("^[A-Za-z0-9_.-]{1,255}$", var.ttl_attribute))
    error_message = "ttl_attribute must be null or a plain attribute name."
  }
}
