# The tenancy table (PS3, DAT-1, ADR-0046): every school's data, kept apart by key (SCH#<schoolId>) and checked by the
# API on every request. Deletion protection, PITR and prevent_destroy come from the module. TTL deletes archived pupils
# and expired lookups (DAT-Q4). One overloaded GSI, gsi1, serves lists only; anything that decides access reads the base
# table, strongly consistent (docs/platform/10-data-and-api.md §2.4).

module "tenancy_table" {
  source = "../modules/dynamodb_table"

  name          = "${local.name_prefix}-tenancy"
  ttl_attribute = "ttl"

  global_secondary_indexes = [
    { name = "gsi1", hash_key = "gsi1pk", range_key = "gsi1sk" },
  ]
}

# The platform's daily backup (DAT-1: "in the backup plan"): the family edition's module, seven daily recovery points,
# and a failed-job alarm to the alerts topic. The platform's own game and content tables join required_tables when they
# are built.
module "backup" {
  source = "../modules/backup"

  name_prefix     = local.name_prefix
  alarm_topic_arn = aws_sns_topic.alerts.arn
  required_tables = ["tenancy"]
  table_arns = {
    tenancy = module.tenancy_table.arn
  }
}
