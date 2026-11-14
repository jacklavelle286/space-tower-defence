# THROWAWAY pipeline test (Phase 0): proves plan, apply and destroy work through GitHub Actions.
# Destroy it with the workflow (action = destroy) and delete this resource before Phase 1 adds real modules.
resource "aws_s3_bucket" "test" {
  bucket        = "testing-bucket-9489424594"
  force_destroy = true
}
