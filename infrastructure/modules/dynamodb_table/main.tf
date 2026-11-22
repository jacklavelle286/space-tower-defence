# One DynamoDB table with string keys pk/sk (plan H.4.6, F §12.1, spine S8). The family edition calls it for game and
# content; the platform for tenancy (ADR-0046). Tags come from the provider's default_tags.
#
# Protection is on from the first apply (spine S11.3): native deletion protection covers a deleted resource block and
# console accidents; prevent_destroy stops a replacement at plan time. PITR gives the 35-day restore window.
#
# GSIs only when a caller passes them: game and content pass none (F §12.7, ADR-0004); tenancy passes gsi1, an
# overloaded index used only for lists, never for access decisions (ADR-0046). Each GSI projects ALL.
#
# Deliberately absent:
# - LSIs.
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

  # A GSI's keys must be declared as attributes; pk and sk are already above (the variable refuses them as GSI keys).
  dynamic "attribute" {
    for_each = toset(flatten([for g in var.global_secondary_indexes : [g.hash_key, g.range_key]]))

    content {
      name = attribute.value
      type = "S"
    }
  }

  # key_schema blocks, not the deprecated hash_key and range_key arguments (hashicorp/aws 6.73.0).
  dynamic "global_secondary_index" {
    for_each = var.global_secondary_indexes

    content {
      name            = global_secondary_index.value.name
      projection_type = "ALL"

      key_schema {
        attribute_name = global_secondary_index.value.hash_key
        key_type       = "HASH"
      }

      key_schema {
        attribute_name = global_secondary_index.value.range_key
        key_type       = "RANGE"
      }
    }
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
