# One ACM certificate in us-east-1 for both hostnames, DNS-validated.
# Deliberately no Route 53 resources: DNS is owner-owned and lives in another account. The owner creates the
# validation CNAMEs by hand (docs/runbooks/dns-hand-off.md). Tags come from the provider's default_tags.

resource "aws_acm_certificate" "this" {
  provider = aws.us_east_1

  domain_name               = var.primary_hostname
  subject_alternative_names = var.alternative_hostnames
  validation_method         = "DNS"

  lifecycle {
    # A hostname change requests a new certificate before the old one is released, so a distribution
    # never points at a deleted certificate.
    create_before_destroy = true
  }
}

# Creates nothing in AWS: it waits until ACM reports ISSUED, which happens once the owner's CNAMEs resolve.
# No validation_record_fqdns (plan H.4.1): there are no record resources here to list.
resource "aws_acm_certificate_validation" "this" {
  provider = aws.us_east_1

  certificate_arn = aws_acm_certificate.this.arn

  timeouts {
    create = var.validation_timeout
  }
}
