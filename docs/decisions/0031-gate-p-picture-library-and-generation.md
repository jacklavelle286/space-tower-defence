# 0031. Gate P: picture library, browser conversion, and a fifth Lambda for model drawings
Status: Accepted · Date: 2026-11-16

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
- **Picture kinds (Gate P2, folded into Gate P [CONFIRMED by owner, 2026-11-16]).**
  - `contracts/limits.json` `picture.kinds` is the one list (id, label, consumer), read by admin-api, picture-gen and the admin
    app: activity object (the default, and what every row without `kind` reads as), activity scene, profile avatar, alien,
    astronaut, map decoration, planet, badge. All are drawn and stored at 256×256, so the sanitiser and PNG checks are unchanged.
  - R38 requires `kind` (refused before the caps are counted); the job, the picture header and every view carry it; the SQS
    message carries it unless it is `activity-object`, so a pre-kinds picture-gen keeps working while a release updates
    admin-api first; a redraw keeps its job's kind; R33 filters by it. Publish refuses a picture whose kind is not for activities
    (`picture_not_for_activities`).
  - picture-gen's system prompt is three fixed blocks: kind-neutral rules, STYLE.md (cache breakpoint 1), then the kind block,
    `kinds/<kind>.md` plus 1–3 house SVGs (breakpoint 2). Each kind block carries the safety line; avatar and astronaut carry
    the cast rule.
  - Not offered until Gate M: route tiles (192 px and must tile edge to edge) and bosses (768 px). The battle backdrop
    was on this list; it is now the background kind below.
- **Background kind (Gate P2, [CONFIRMED by owner, 2026-11-16]).** Library only: consumer `later`, so publish refuses it
  and the activity picker hides it; the game's battle backdrop stays wired in code until Gate M.
  - Each `picture.kinds` entry now carries its sizes: `width`, `height`, `svgMaxBytes`, `maxBytes`, `bodyMaxBytes`, and
    optionally `maxTokens` and `capWeight`. The eight 256 kinds keep 256×256, 65,536, 524,288 and 786,432 and BEDROCK_MAX_TOKENS, so
    their bytes and IDs are unchanged (a test pins a picture's sha256). `picture.side` and `picture.maxBytes` are
    gone; `bodyMaxBytes.adminPicture` is the largest kind's body (5,600,000), the route's first guard.
  - Background: 1920×1056, the game's logical canvas. SVG cap 196,608 (luna-backdrop.svg is 84,328; about 2.3× room).
    Stored PNG at most 4 MiB, so R35's base64 draft (5.59 MB) fits Lambda's 6 MB response; R34 body at most 5,600,000.
    A rewritten PNG over 4 MiB is refused `too_detailed` (about 3 in 43 busy photos in the measurement). max_tokens
    32,000, never above the 64,000 Terraform ceiling.
  - The sanitiser takes the kind's canvas. 256 kinds still force `0 0 256 256`. A background's viewBox must be
    `0 0 1920 1056` or `0 0 3840 2112`, else `unusable`. png_canon checks the kind's width and height, and its unfilter
    is now about 1.5 to 2.3 times faster with byte-identical output.
  - Prompt: `kinds/background.md` (full-bleed, opaque, ground composition, calm centre, no route, no characters,
    at most about 40,000 characters so the drawing and its thinking fit 32,000 tokens) plus luna-backdrop.svg as the
    one example. The kind block says it replaces the rules' 256 root; the shared rules (block 1) are byte-for-byte as
    committed, so the eight 256 kinds' prompts and caches are unchanged. The kind block is about 21,700 tokens.
    **[PROPOSAL]** keep the full example: a cache write costs about $0.14 and a read about $0.01, at $5/MTok
    input-equivalent.
  - Time: one SDK attempt with a 720 s read timeout (other kinds keep 2 × 280 s). The read timeout limits only each
    gap in the stream, so picture-gen stops the call itself 780 s after the run starts (60 s before the timeout): a
    check on every stream event, and a SIGALRM timer that breaks a blocked read. Past it the job ends `timed_out` with
    its usage logged. picture-gen's timeout rises from 600 s to 840 s, under the 900 s visibility timeout. Its
    duration alarm moves to 0.9 (756 s). DRAW_TIMEOUT (15 min from the claim) stays 60 s past the function timeout.
    QUEUE_MAX_AGE rises from 13 to 15 minutes and JOB_TIMEOUT from 15 to 17, so a job queued behind a whole run is
    still drawn. **[UNVERIFIED]** that Lambda runs the handler on the main thread (the timer needs it; without it
    only the per-event check applies): the first background's log settles it.
  - admin-api memory rises from 512 MB to 1769 MB (one vCPU) and its timeout from 15 s to 20 s. A worst 1920 photo
    takes about 1.4 s to check on a laptop, an estimated 2–3 s on Lambda at 1769 MB, and 9–13 s at 512 MB.
    **[UNVERIFIED]** until the first background upload's REPORT line.
  - Cost: a background's worst case is about $0.97 (32,000 output tokens, about $0.80, plus a cold 27,000-token
    prompt cache write) against about $0.40 for the other kinds. **[PROPOSAL]** it takes 3 places in the daily and
    monthly caps (`capWeight` in limits.json; a refund gives 3 back), so the monthly cap still bounds the month's cost
    at about 150 × $0.40. The admin page says a background counts as 3. The hourly output-token alarm stays at 150,000
    (about 4 backgrounds at max_tokens); **owner to confirm** the threshold at the gate.
- **Provider: OpenAI (owner, 2026-11-16) [CONFIRMED by owner, 2026-11-16].** The account cannot use any Anthropic
  model on Bedrock ("not available for this account", verified 2026-11-16), so picture-gen draws with OpenAI on the
  owner's own API key. The provider is switchable: `picture_provider` (`openai`, the default, or `bedrock`) sets
  `PICTURE_PROVIDER`; the Bedrock path, its tests and its IAM stay, so going back is that variable and a release.
  - Model `gpt-6.1-sol` through the Responses API (`client.responses.stream`), official `openai` SDK 3.48.0. Europe
    data residency: base URL `https://eu.api.openai.com/v1` and a key from a Europe-residency project (the owner
    creates it; the region cannot be changed later). `store=false`; effort `medium` (the model's default, stated so a
    default change cannot move cost or time); `prompt_cache_key` `picture-gen:<kind>:v1`.
  - Same prompt for both providers: `instructions` is the three system texts (RULES, STYLE.md, the kind block) joined
    in order; the user message is unchanged. Same claim, kinds, sanitiser, deadline (780 s), progress writes and codes.
    `max_output_tokens` (it includes reasoning) is the kind's max_tokens plus half: 24,000 for a 256 kind, 48,000 for
    a background. SDK limits as Bedrock's: 256 kinds 2 × 280 s read timeout (1 retry, before a stream starts only),
    background one attempt of 720 s; connect 10 s.
  - Outcomes: refusal part or incomplete `content_filter` → `declined`; incomplete `max_output_tokens` → `too_long`;
    `response.failed`, an `error` event or another status → `bedrock_error`, which now means "provider error" (name
    kept for compatibility); 429 → `throttled`; SDK timeout or the deadline → `timed_out`; new `not_set_up` when the
    secret has no value or OpenAI answers 401 or 403 (admin page: "Drawing isn't set up yet: the API key is missing.").
    Usage: `inputTokens` is OpenAI's input_tokens (it includes cached and written tokens, unlike Anthropic's),
    `cacheReadTokens` cached_tokens, `cacheWriteTokens` cache_write_tokens, `outputTokens` includes reasoning. The usage
    line gains `provider`. A broken OpenAI stream logs zero tokens (OpenAI reports usage only at the end).
  - The key lives in Secrets Manager, `space-tower-defence-prod-openai-api-key`, created by Terraform without a value
    (the key never enters state or a plan), encrypted with the AWS managed key `aws/secretsmanager`. Of the application
    roles, only picture-gen's is granted `GetSecretValue`, on that ARN; account admin principals (the owner's admin
    profiles and the GitHub OIDC CI role, which has AdministratorAccess) can read it too, as there is no resource policy.
    **[PROPOSAL]** a later hardening: an `aws_secretsmanager_secret_policy` denying `GetSecretValue` to every principal
    except the picture-gen role (owner decides; not built). The owner stores and rotates it (docs/runbooks/openai-key.md); picture-gen
    reads it once per container and drops it after a 401/403, so a new key needs no release. Never logged.
  - Cost (per 1M tokens, Standard: input $2, cached input $0.10, cache write (30 min) $2.50, output $10; EU residency
    +10% **[inference: the docs list no release dates, but the knowledge cutoffs put the model after 2026-03-05]**).
    Worst case per call (whole prompt written to the cache, a redraw's previous SVG at its byte cap, every output token
    used), with the uplift: a 256 kind about $0.34 (24,000 output $0.24 + about 10,600 written $0.03 + about 21,800
    previous-drawing tokens $0.04); a background about $0.77 (48,000 output $0.48 + about 36,000 written $0.09 + about
    65,500 previous-drawing tokens $0.13). Month under the caps (150 places, background weight 3): 150 × $0.34 ≈ $51,
    or 50 backgrounds × $0.77 ≈ $39, so about **$51 a month at worst** (Claude's was about $60). A typical cached 256
    drawing is about $0.05 **[UNVERIFIED]** until the first usage lines.
  - Budget: AWS Budgets does not see OpenAI spend. **Owner action:** set a monthly budget (and a hard limit if the
    console offers one) in the OpenAI project; the caps above are the primary control.
  - Data (OpenAI docs, 2026-11-16): API data is not used for training unless opted in; with `store=false` no
    application state is kept (the default is 30 days); abuse-monitoring logs are kept up to 30 days (zero data
    retention needs OpenAI's approval and is not requested); the prompt cache keeps encrypted state up to 24 h, not
    shared across organisations or residency regions; Europe residency stores and processes `/v1/responses` in the
    region, but not "system data". Only the owner's description, change note and earlier drawing are sent; no child
    data. OpenAI's under-18 guidance applies because the pictures are shown to children: the sanitiser and the owner's
    approval are the content controls. **[UNVERIFIED]** that this admin-only flow meets that guidance; the owner settles.
  - **[UNVERIFIED]** gpt-6.1-sol's output speed: 48,000 tokens must fit 780 s for a background at its limit. The first
    backgrounds' `durationMs` settle it; if they time out, lower the effort or the headroom.
- **Limits.**
  - Caps: 100 drawings a day and 150 a month **[PROPOSAL: the monthly cap keeps the worst case near £47]**. A job that fails to
    start is refunded.
  - Jobs time out 15 minutes after they start, or after a worker claims them. A queued job older than 13 minutes is never drawn.
    (Gate P2: 17 minutes unclaimed, 15 after a claim; a queued job older than 15 minutes is never drawn.)
  - An hourly token alarm is in place, plus AWS Budgets at USD 65 a month **[ASSUMPTION: the account bills in USD; £50 is about USD
    65]**, alerting at 50% and 80% actual and 100% forecast.
- **Lifecycle.** A picture goes draft → approved. Delete is refused while any activity uses the picture. Deleting removes the S3
  object and invalidates CloudFront.
- **Activities.** Publish checks accept approved `lib-*` pictures alongside the 72 repo pictures, and the player loads them from
  `/pictures/v1/`.
- **Supply chain.** picture-gen installs from a hash-pinned lock, `api/requirements-picture-gen.txt` (backlog B-4 for this
  function). boto3 and botocore are bundled, and httpx2 and httpcore2 are held at 2.16.0, not the release published that day.
  `openai==3.48.0` (published 2026-11-09, the newest at least 7 days old) adds one pure-Python wheel; its other
  dependencies were already locked for anthropic (jiter 0.19.0 and pydantic-core 2.50.4 as cp314 manylinux aarch64).

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
  first drawing settles it, and any IAM gap shows up in CloudTrail. (Settled 2026-11-16: not available to the account;
  hence the OpenAI provider above.)
- **OpenAI release.** Adds the secret (1 add) and changes picture-gen's function (environment, description) and its
  role policy in place. Drawing answers `not_set_up` until the owner stores the key.
- **Browser.** Browser conversion assumes a Chromium-based admin browser.
- **What the cleaner can't catch.** The sanitiser cannot catch letters drawn as shapes or unsuitable imagery. The owner's approval is
  that control.

Evidence: Gate P design and review workflows (2026-11-16); read-only `terraform plan` (34 add, 5 change, 0 destroy); api pytest 1513
passed, web 239+756+129+275, terraform tests 9 passed; Bedrock model `AUTHORIZED` (read-only check, 2026-11-16).
