# Module wiring (plan H.3.5). Phase 2: the certificate only.

# One certificate in us-east-1 (CloudFront requires it there) for both hostnames.
# Validation waits for the two CNAMEs the owner creates in the DNS account (docs/runbooks/dns-hand-off.md).
module "certificate" {
  source = "../modules/certificate"

  providers = {
    aws.us_east_1 = aws.us_east_1
  }

  primary_hostname      = var.player_hostname
  alternative_hostnames = [var.admin_hostname]
  validation_timeout    = "30m"
}
