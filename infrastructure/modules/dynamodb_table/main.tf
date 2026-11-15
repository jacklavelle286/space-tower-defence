# One DynamoDB table with string keys pk/sk (plan H.4.6, F §12.1, spine S8). Called twice: game and content.
# Tags come from the provider's default_tags.
#
# Protection is on from the first apply (spine S11.3): native deletion protection covers a deleted resource block and
# console accidents; prevent_destroy stops a replacement at plan time. PITR gives the 35-day restore window.
#
# Deliberately absent:
# - GSIs and LSIs (F §12.7).
# - server_side_encryption: the default (AWS owned key) is what the plan asks for; a customer key adds cost and a
#   key policy to manage for no gain here.
# - on_demand_throughput maxima: optional cost ceiling, left unset in M1 (H.4.6).
# - Any aws_dynamodb_table_item: Terraform never writes items (H.4.6).

resource "aws_dynamodb_table" "this" {
  name         = var.name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  deletion_protection_enabled = true

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  # TTL is per table, by attribute name. Only items that carry the attribute expire: in game that is the SYS#SIGNUPS
  # counter alone (spine S1.2). content passes null and gets no TTL block.
  dynamic "ttl" {
    for_each = var.ttl_attribute == null ? [] : [var.ttl_attribute]

    content {
      enabled        = true
      attribute_name = ttl.value
    }
  }

  lifecycle {
    # Lifting it is a reviewed commit, never a workflow input (H.11.2).
    prevent_destroy = true
  }
}
