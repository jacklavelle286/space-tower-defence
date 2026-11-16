# 0031. Gate P: picture library, browser conversion, and a fifth Lambda for Claude drawings
Status: Proposed · Date: 2026-11-16

Context: [ADR-0026](0026-picture-library-generate-and-upload.md) chose upload plus generation with Claude on Bedrock. Building it
raised several problems:
- An Opus drawing takes 30–180 s, but HTTP API integrations stop at 30 s.
- Native image libraries (Pillow, resvg) add a CVE surface, and a cp314 aarch64 wheel risk, to Lambda.
- The site bucket is pipeline-owned (ADR-0010).
- ADR-0003 fixes four Lambdas.

Three independent designs were judged, and the result was refined by review (17 findings fixed). The owner set the limits on
2026-11-16 **[CONFIRMED by owner, 2026-11-16]**: 100 drawings a day, a £50-a-month budget, and EU routing.

Decision:
- **Storage and serving.**
  - A new private bucket, `…-prod-pictures-bucket`, is served at `/pictures/*` on both distributions through the existing OAC, as
    an in-place update. CSP `img-src 'self'` is unchanged.
  - Only approved PNGs are under `pictures/v1/`. Explicit-Deny statements leave admin-api the only writer of the served prefixes
    and picture-gen the only writer of `jobs/`, covering every object and object-version write.
- **Format and upload.**
  - Every library picture is a 256×256 transparent PNG, letterboxed and never cropped. Its ID is `lib-` plus 32 hex characters of
    the canonical PNG's sha256.
  - Upload accepts PNG or JPEG, up to 5 MB, and never SVG. The admin browser decodes the picture and draws it on a canvas. The PNG is
    sent through the API as base64, with no presigned URL and no CORS.
  - admin-api re-checks it with a standard-library PNG walker: strict chunks, bounded inflate, and a freshly encoded file. ADR-0026's
    presigned PUT and server re-encode are amended accordingly.
- **Generation.**
  - admin-api starts a job (R38) and puts it on SQS, which has a dead-letter queue and no retry of paid calls.
  - **picture-gen**, a fifth Lambda (amends ADR-0003), calls Claude Opus 5.5 through the official Anthropic SDK (`AnthropicBedrock`)
    on the EU inference profile `eu.anthropic.claude-opus-5-5`. The system prompt is fixed and cached: STYLE.md plus four house SVGs.
  - picture-gen sanitises the SVG with a fail-closed allow-list and writes it to `jobs/`. It has no database access.
  - The admin browser renders the SVG to PNG through `<img>` and a canvas, never inlining it, and the PNG goes through the upload
    path. Approval needs a "no letters, numbers or words" tick.
- **Limits.**
  - Caps: 100 drawings a day and 150 a month **[PROPOSAL: the monthly cap keeps the worst case near £47]**. A job that fails to
    start is refunded.
  - Jobs time out 15 minutes after they start, or after a worker claims them. A queued job older than 13 minutes is never drawn.
  - An hourly token alarm is in place, plus AWS Budgets at USD 65 a month **[ASSUMPTION: the account bills in USD; £50 is about USD
    65]**, alerting at 50% and 80% actual and 100% forecast.
- **Lifecycle.** A picture goes draft → approved. Delete is refused while any activity uses the picture. Deleting removes the S3
  object and invalidates CloudFront.
- **Activities.** Publish checks accept approved `lib-*` pictures alongside the 72 repo pictures, and the player loads them from
  `/pictures/v1/`.
- **Supply chain.** picture-gen installs from a hash-pinned lock, `api/requirements-picture-gen.txt` (backlog B-4 for this
  function). boto3 and botocore are bundled, and httpx2 and httpcore2 are held at 2.16.0, not the release published that day.

Alternatives:
- A presigned PUT to `uploads/` (needs CORS, a CSP change and bearer URLs).
- Pillow or resvg in Lambda (native attack surface, wheel risk).
- Global routing (about 10% cheaper, but routed worldwide).
- Writing into the site bucket (pipeline-owned).
- Worker writes to DynamoDB (more blast radius, asynchronous approval).

Consequences:
- **Release.** The release adds 34 resources and changes 5, including both distributions in place.
- **Rollback and drift.** Rollbacks with `artefacts_from` can only target releases that carry five zips, and `plan.yml` drift
  checks fail until the first Gate P release exists.
- **Bedrock checks.** The Bedrock agreement status read `NOT_AVAILABLE` while authorisation read `AUTHORIZED` **[UNVERIFIED]**. The
  first drawing settles it, and any IAM gap shows up in CloudTrail.
- **Browser.** Browser conversion assumes a Chromium-based admin browser.
- **What the cleaner can't catch.** The sanitiser cannot catch letters drawn as shapes or unsuitable imagery. The owner's approval is
  that control.

Evidence: Gate P design and review workflows (2026-11-16); read-only `terraform plan` (34 add, 5 change, 0 destroy); api pytest 1513
passed, web 239+756+129+275, terraform tests 9 passed; Bedrock model `AUTHORIZED` (read-only check, 2026-11-16).
