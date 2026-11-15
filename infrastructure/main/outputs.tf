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
