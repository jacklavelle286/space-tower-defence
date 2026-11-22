# Offline (mock provider): every table is on demand with string keys pk and sk, deletion protection, PITR and
# prevent_destroy; TTL only when asked; GSIs only when passed, keyed by key_schema and projecting ALL (ADR-0046).
mock_provider "aws" {}

variables {
  name = "space-tower-defence-sca-dev-test"
}

run "no_gsi_and_no_ttl_by_default" {
  command = plan

  assert {
    condition     = aws_dynamodb_table.this.billing_mode == "PAY_PER_REQUEST" && aws_dynamodb_table.this.hash_key == "pk" && aws_dynamodb_table.this.range_key == "sk"
    error_message = "On demand, keyed by pk and sk."
  }
  assert {
    condition     = aws_dynamodb_table.this.deletion_protection_enabled && aws_dynamodb_table.this.point_in_time_recovery[0].enabled
    error_message = "Deletion protection and PITR are always on."
  }
  assert {
    condition     = length(aws_dynamodb_table.this.global_secondary_index) == 0 && length(aws_dynamodb_table.this.ttl) == 0
    error_message = "No GSI and no TTL unless the caller asks (game and content, ADR-0004)."
  }
  assert {
    condition     = toset([for a in aws_dynamodb_table.this.attribute : a.name]) == toset(["pk", "sk"])
    error_message = "Only pk and sk are declared without a GSI."
  }
}

run "the_tenancy_shape" {
  command = plan

  variables {
    ttl_attribute            = "ttl"
    global_secondary_indexes = [{ name = "gsi1", hash_key = "gsi1pk", range_key = "gsi1sk" }]
  }

  assert {
    condition     = toset([for a in aws_dynamodb_table.this.attribute : a.name]) == toset(["pk", "sk", "gsi1pk", "gsi1sk"])
    error_message = "The GSI's keys are declared as string attributes beside pk and sk."
  }
  assert {
    condition = anytrue([
      for g in aws_dynamodb_table.this.global_secondary_index :
      g.name == "gsi1" && g.projection_type == "ALL" &&
      toset([for k in g.key_schema : "${k.attribute_name}:${k.key_type}"]) == toset(["gsi1pk:HASH", "gsi1sk:RANGE"])
    ])
    error_message = "gsi1 is keyed gsi1pk (HASH) and gsi1sk (RANGE) and projects ALL."
  }
  assert {
    condition     = one(aws_dynamodb_table.this.ttl).attribute_name == "ttl" && one(aws_dynamodb_table.this.ttl).enabled
    error_message = "TTL on the ttl attribute."
  }
}

run "gsi_keys_cannot_be_pk_or_sk" {
  command = plan
  variables {
    global_secondary_indexes = [{ name = "gsi1", hash_key = "pk", range_key = "gsi1sk" }]
  }
  expect_failures = [var.global_secondary_indexes]
}

run "gsi_names_are_unique" {
  command = plan
  variables {
    global_secondary_indexes = [
      { name = "gsi1", hash_key = "a", range_key = "b" },
      { name = "gsi1", hash_key = "c", range_key = "d" },
    ]
  }
  expect_failures = [var.global_secondary_indexes]
}
