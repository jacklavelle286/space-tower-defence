# Daily AWS Backup of both tables, seven recovery points, selected by ARN (plan H.13, spine S8.4; Phase 33, M2-11).
# local.table_arns follows table_name_overrides, so after a restore cut-over (docs/runbooks/restore.md, procedure B) the
# next release moves the selection to the restored table. G-5 (scripts/check_invariants.py) checks both are here.
module "backup" {
  source = "../modules/backup"

  name_prefix     = local.name_prefix
  table_arns      = { game = local.table_arns.game, content = local.table_arns.content }
  alarm_topic_arn = module.monitoring.alerts_topic_arn
}
