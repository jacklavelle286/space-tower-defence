locals {
  # Every resource name starts with this literal prefix (J M0, build Phase 5 review check 2). Hard-coded on purpose, so a
  # grep finds it and no variable can rename a spike resource into the production namespace.
  name = "space-tower-defence-spike"

  # Where check.py listens on the owner's laptop. Cognito allows http only for localhost.
  callback_url = "http://localhost:8765/callback"
  logout_url   = "http://localhost:8765/logged-out"

  # Resource-server identifier (same string in both pools; each pool has its own) and the route scopes.
  scope_server = "scd-spike"
  player_scope = "${local.scope_server}/play"
  admin_scope  = "${local.scope_server}/admin"

  default_tags = merge(
    {
      project     = var.project
      environment = var.environment
      managed_by  = "terraform"
      spike       = "auth-cognito"
      lifecycle   = "throwaway"
    },
    var.extra_tags,
  )
}
