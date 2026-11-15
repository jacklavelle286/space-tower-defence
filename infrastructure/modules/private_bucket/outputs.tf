output "bucket_name" {
  description = "Bucket name."
  value       = aws_s3_bucket.this.id
}

output "bucket_arn" {
  description = "Bucket ARN, for IAM statements."
  value       = aws_s3_bucket.this.arn
}
