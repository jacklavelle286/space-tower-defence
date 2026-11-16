output "bucket_name" {
  description = "Bucket name."
  value       = aws_s3_bucket.this.id
}

output "bucket_regional_domain_name" {
  description = "Regional endpoint host name (<bucket>.s3.<region>.amazonaws.com): a CloudFront S3 origin's domain_name."
  value       = aws_s3_bucket.this.bucket_regional_domain_name
}

output "bucket_arn" {
  description = "Bucket ARN, for IAM statements."
  value       = aws_s3_bucket.this.arn
}
