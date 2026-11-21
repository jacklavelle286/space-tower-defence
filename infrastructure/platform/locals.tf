locals {
  # space-tower-defence-sca-dev or space-tower-defence-sca-prod
  name_prefix = "${var.project}-${var.environment}"

  # main's tags, plus edition, so the platform's resources are told apart from the family edition's in billing.
  default_tags = {
    project     = var.project
    environment = var.environment
    edition     = "platform"
    managed_by  = "terraform"
  }
}
