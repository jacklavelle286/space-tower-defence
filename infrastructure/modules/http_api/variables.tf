variable "name" {
  description = "API name, also used for the access log group (space-tower-defence-prod-api)."
  type        = string
}

variable "routes" {
  description = "Route catalogue keyed by route key (\"GET /api/me\"; the /api prefix stays, ADR-0001). Built in the root from contracts/routes.json, so Terraform and the catalogue cannot drift (gate G-12)."
  type = map(object({
    id         = string # R1..R30, for readers of the plan
    function   = string # key in var.functions
    authoriser = string # key in var.authorisers; there is no unauthenticated route
    scope      = string # the one scope the route requires
  }))

  validation {
    condition     = alltrue([for k in keys(var.routes) : can(regex("^(GET|POST|PUT|PATCH|DELETE) /api(/[A-Za-z0-9{}_-]+)+$", k))])
    error_message = "Every route key must be \"<METHOD> /api/<path>\" (no $default route, no ANY, no greedy path)."
  }

  validation {
    condition     = alltrue([for r in values(var.routes) : contains(keys(var.authorisers), r.authoriser)])
    error_message = "Every route needs an authoriser named in var.authorisers (player or operator); there is no unauthenticated route."
  }

  validation {
    condition     = alltrue([for r in values(var.routes) : contains(keys(var.functions), r.function)])
    error_message = "Every route must target a function named in var.functions."
  }

  # The catalogue's scope must be the one the authoriser's pool actually issues, or every call would be 403.
  validation {
    condition     = alltrue([for r in values(var.routes) : r.scope == try(var.authorisers[r.authoriser].scope, "")])
    error_message = "Every route's scope must equal its authoriser's scope (contracts/routes.json against the pools)."
  }
}

variable "functions" {
  description = "Integration targets keyed by function key (player-api, admin-api, tts): the function name (invoke permission) and invoke ARN."
  type = map(object({
    function_name = string
    invoke_arn    = string
  }))
}

variable "authorisers" {
  description = "JWT authorisers keyed by name (player, operator): issuer = the pool, audience = its app client IDs, scope = the pool's route scope that every route on this authoriser must require."
  type = map(object({
    issuer   = string
    audience = list(string)
    scope    = string
  }))

  validation {
    condition     = alltrue([for a in values(var.authorisers) : startswith(a.issuer, "https://cognito-idp.") && length(a.audience) > 0])
    error_message = "Each authoriser needs a Cognito issuer URL and at least one audience (client ID)."
  }
}

variable "default_throttle" {
  description = "Throttle for every route that has no entry in route_throttles (spine S9.5: rate 20, burst 40). Both numbers are always set: a bare block may mean 0."
  type = object({
    rate_limit  = number
    burst_limit = number
  })

  validation {
    condition     = var.default_throttle.rate_limit > 0 && var.default_throttle.burst_limit > 0
    error_message = "default_throttle needs a rate and a burst above 0."
  }
}

variable "route_throttles" {
  description = "Per-route throttles keyed by route key (spine S9.5). Each key must be a route in var.routes."
  type = map(object({
    rate_limit  = number
    burst_limit = number
  }))
  default = {}

  validation {
    condition     = alltrue([for t in values(var.route_throttles) : t.rate_limit > 0 && t.burst_limit > 0])
    error_message = "Every route throttle needs a rate and a burst above 0."
  }

  validation {
    condition     = length(setsubtract(keys(var.route_throttles), keys(var.routes))) == 0
    error_message = "route_throttles names a route key that is not in routes."
  }
}

variable "log_retention_days" {
  description = "Access log retention in days."
  type        = number
}
