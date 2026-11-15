# Read by the owner (DNS hand-off) and later by the workflows with `terraform output -json` (plan H.3.6).

output "acm_validation_records" {
  description = "Validation CNAMEs the owner creates in jackgl.com and keeps forever (docs/runbooks/dns-hand-off.md)."
  value       = module.certificate.validation_records
}

output "certificate_arn" {
  description = "ARN of the us-east-1 certificate, taken from the validation resource so it is only known once ISSUED."
  value       = module.certificate.certificate_arn
}

output "acm_certificate_status" {
  description = "Certificate status as of the last refresh. The first apply records PENDING_VALIDATION; the next plan shows ISSUED. aws acm describe-certificate is the authority."
  value       = module.certificate.certificate_status
}

# Static sites (plan H.3.6). Bucket and distribution IDs feed the publish step (Phase 4); the domains and the zone ID
# are for the owner's A and AAAA alias records (docs/runbooks/dns-hand-off.md).

output "player_bucket" {
  description = "Player site bucket (publish target)."
  value       = module.player_site.bucket_name
}

output "admin_bucket" {
  description = "Admin site bucket (publish target)."
  value       = module.admin_site.bucket_name
}

output "player_distribution_id" {
  description = "Player distribution ID (publish: wait and invalidate; smoke)."
  value       = module.player_site.distribution_id
}

output "admin_distribution_id" {
  description = "Admin distribution ID (publish: wait and invalidate; smoke)."
  value       = module.admin_site.distribution_id
}

output "player_distribution_domain" {
  description = "Player *.cloudfront.net name: alias target for aliens.jackgl.com."
  value       = module.player_site.distribution_domain_name
}

output "admin_distribution_domain" {
  description = "Admin *.cloudfront.net name: alias target for admin.aliens.jackgl.com."
  value       = module.admin_site.distribution_domain_name
}

output "cloudfront_hosted_zone_id" {
  description = "Hosted zone ID to use in the alias records (CloudFront's fixed zone, Z2FDTNDATAQYW2)."
  value       = module.player_site.distribution_hosted_zone_id
}

output "artifacts_bucket" {
  description = "Artefacts bucket (bootstrap-owned), passed through from the data source for runbooks and the manifest cross-check."
  value       = data.aws_s3_bucket.artifacts.id
}
