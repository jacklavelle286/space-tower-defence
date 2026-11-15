output "bucket_name" {
  description = "Site bucket name (publish step target)."
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "Site bucket ARN."
  value       = aws_s3_bucket.this.arn
}

output "distribution_id" {
  description = "Distribution ID (publish: wait and invalidate; smoke)."
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  description = "Distribution ARN (the only SourceArn the bucket policy allows)."
  value       = aws_cloudfront_distribution.this.arn
}

output "distribution_domain_name" {
  description = "The *.cloudfront.net name: target of the owner's A and AAAA alias records."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "distribution_hosted_zone_id" {
  description = "CloudFront's Route 53 hosted zone ID for alias records (the same for every distribution)."
  value       = aws_cloudfront_distribution.this.hosted_zone_id
}
