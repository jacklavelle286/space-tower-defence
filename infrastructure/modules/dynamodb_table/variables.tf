variable "name" {
  description = "Table name (space-tower-defence-prod-game or -content, spine S1.1)."
  type        = string
}

variable "global_secondary_indexes" {
  description = "Overloaded GSIs, each keyed by two new string attributes and projecting ALL. game and content pass none (ADR-0004); the platform's tenancy table has one, gsi1, for lists only (ADR-0046)."
  type = list(object({
    name      = string
    hash_key  = string
    range_key = string
  }))
  default = []

  validation {
    condition     = length(distinct([for g in var.global_secondary_indexes : g.name])) == length(var.global_secondary_indexes)
    error_message = "Each global secondary index needs its own name."
  }

  validation {
    condition = alltrue([
      for g in var.global_secondary_indexes :
      !contains(["pk", "sk"], g.hash_key) && !contains(["pk", "sk"], g.range_key) && g.hash_key != g.range_key
    ])
    error_message = "A global secondary index is keyed by two different attributes, neither of them pk or sk."
  }
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
