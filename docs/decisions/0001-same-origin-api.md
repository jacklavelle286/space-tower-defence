# 0001. Same-origin API through CloudFront
Status: Accepted · Date: 2026-11-14

Context: Two single-page apps (player and admin) call one HTTP API. The browser has to reach the API somehow, and the reference
project already serves `/api/*` from its CloudFront distribution. The SPA deep-link fallback in the reference uses
distribution-wide custom error responses, which would also rewrite API errors.
See [spine S1](../plan/00-spine.md#s1-system-shape) and [E §E.2](../plan/E-architecture.md#e2-same-origin-api-through-cloudfront).

Decision:
- Each distribution has a `/api/*` behaviour whose origin is the HTTP API's default `execute-api` endpoint: `CachingDisabled`,
  `AllViewerExceptHostHeader` (forwards `Authorization`), all methods.
- HTTP API route keys keep the `/api` prefix, so there is no path rewrite.
- No API hostname, no API certificate, no CORS, no `x-origin-verify` header.
- SPA deep links are handled by a CloudFront Function on the default behaviour only; no `custom_error_response` on either distribution.

Alternatives:
- `execute-api` URL called directly with CORS: adds CORS and puts an environment value in the build.
- Custom API hostname: needs its own certificate and DNS record for no gain; the spec says it is not required.
- Lambda Function URL origin with a prefix-stripping CloudFront Function (the reference): a second place to keep in step with routes.
- Distribution-wide custom error responses (reference pattern): would turn API 403 into `200 index.html` and API 5xx into the maintenance page.

Consequences:
- Easier: no CORS; builds hold no environment values (`apiBase` is always `/api`); CSP `connect-src 'self'` covers API calls.
- Harder: the `execute-api` endpoint stays reachable directly. Accepted: every route needs a valid access token with the right
  scope, and HTTP APIs support neither WAF nor resource policies.
- Must be true: forwarding `Authorization` through `AllViewerExceptHostHeader` works against API Gateway in this account
  (unverified; the release smoke check and the first Milestone 1 authenticated call settle it).

Evidence: [B §B5.1](../plan/B-scope-and-decisions.md#b51-hosting-api-and-compute) E-02, E-03;
[E §E.2.2](../plan/E-architecture.md#e22-why-custom-error-responses-must-not-be-distribution-wide).
