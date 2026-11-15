output "validation_records" {
  description = "One CNAME per distinct validation record name: name, type and value to create in the DNS zone."
  value = distinct([
    for dvo in aws_acm_certificate.this.domain_validation_options : {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  ])
}

output "certificate_arn" {
  description = "Certificate ARN from the validation resource, so consumers (distributions) wait until it is ISSUED."
  value       = aws_acm_certificate_validation.this.certificate_arn
}

output "certificate_request_arn" {
  description = "Certificate ARN as soon as it is requested (before validation). For describe-certificate while the apply waits."
  value       = aws_acm_certificate.this.arn
}

output "certificate_status" {
  description = "Certificate status as recorded at the last refresh (PENDING_VALIDATION right after the first apply)."
  value       = aws_acm_certificate.this.status
}
