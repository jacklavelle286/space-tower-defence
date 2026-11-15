locals {
  # space-tower-defence-prod; regional resource names start with this (spine S1.1).
  name_prefix = "${var.project}-${var.environment}"

  # Applied once by both providers; modules do not repeat tags.
  default_tags = merge(
    {
      project     = var.project
      environment = var.environment
      managed_by  = "terraform"
    },
    var.extra_tags,
  )
}
