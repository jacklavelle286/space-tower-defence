# Runbook: the OpenAI API key for picture-gen

picture-gen draws with OpenAI (`gpt-6.1-sol`, Europe data residency) on your own API key
([ADR-0031](../decisions/0031-gate-p-picture-library-and-generation.md) "Provider: OpenAI", owner decision 2026-11-16). The
release creates an empty Secrets Manager secret; **you** store the key in it. Terraform never holds the value, so the key is in
no state file, plan or log. Storing it is a row of
[Local AWS writes that are not deployments](../build-phases.md#local-aws-writes-that-are-not-deployments) (for approval at the
Gate P review). Until it is stored, every drawing fails with "Drawing isn't set up yet: the API key is missing." (`not_set_up`),
and nothing is paid.

The commands assume **bash** (`read -s`, `set +o history`); in zsh, start `bash` first.

## Where things are

| What | Value | Label |
|---|---|---|
| Account, profile, region | `263185198757`, `--profile space-tower-defence`, `eu-west-2` | **[VERIFIED]** env files |
| Secret | `space-tower-defence-prod-openai-api-key` (AWS managed key `aws/secretsmanager`); only picture-gen's role is granted read access; account admin principals, including the CI role (AdministratorAccess), can also read it | **[PROPOSAL]** [pictures.tf](../../infrastructure/main/pictures.tf) |
| Function and log group | `space-tower-defence-prod-eu-west-2-picture-gen`, `/aws/lambda/space-tower-defence-prod-eu-west-2-picture-gen` | **[PROPOSAL]** locals.tf naming |
| Provider settings | Terraform variables `picture_provider` (`openai`), `openai_model_id` (`gpt-6.1-sol`), `openai_base_url` (`https://eu.api.openai.com/v1`) in [variables.tf](../../infrastructure/main/variables.tf) | **[CONFIRMED by owner, 2026-11-16]** |

## Rules

- **The key never appears in git, chat, a ticket, the screen or shell history.** It is typed (pasted) at a hidden `read -rs`
  prompt into a shell variable and unset afterwards. While the one `aws` command runs, the value is an argument of that process
  (visible to `ps` on your own laptop for a second); the same trade-off as the operator-accounts runbook **[ASSUMPTION]**.
- **The key must come from a Europe data residency project.** A key from a project without Europe residency is refused at
  `eu.api.openai.com` (expected 401 `not_set_up`) **[UNVERIFIED]** until tried. The project's region cannot be changed later.
- **Set a budget in the OpenAI project** (Settings, Limits) when you create it. AWS Budgets does not see OpenAI spend; the
  drawing caps (100 a day, 150 a month) are the main control, and the worst month under them is about USD 51 (ADR-0031).

## 1. Create the key (OpenAI console, once)

1. Create a project with **Data and inference residency: Europe**.
2. Set the project's monthly budget.
3. Create a secret key in that project, restricted to the project. Keep the console tab open; you paste it once below.

## 2. Store or rotate the key

Run after the release that creates the secret has been applied. Rotation is the same steps with the new key; picture-gen picks
up the new value on its next job after OpenAI refuses the old one (or on its next cold start), with no release.

```sh
set +o history                                  # this shell's commands are not written to history
read -rs -p "OpenAI API key: " KEY; echo         # paste the key; nothing is echoed
aws secretsmanager put-secret-value --profile space-tower-defence --region eu-west-2 \
  --secret-id space-tower-defence-prod-openai-api-key --secret-string "$KEY" \
  --query VersionId --output text               # prints only the new version ID
unset KEY
set -o history
```

Then revoke the old key in the OpenAI console (rotation only). Check that the value is there without printing it:

```sh
aws secretsmanager describe-secret --profile space-tower-defence --region eu-west-2 \
  --secret-id space-tower-defence-prod-openai-api-key \
  --query '{changed: LastChangedDate, versions: keys(VersionIdsToStages)}'
```

Never run `get-secret-value` for this secret: it prints the key.

## 3. Verify

1. In the admin site, Pictures, draw one small picture (a 256 kind, for example "a friendly yellow sun"). It counts against the
   caps like any drawing.
2. Read its usage line (read-only):

   ```sh
   aws logs filter-log-events --profile space-tower-defence --region eu-west-2 \
     --log-group-name /aws/lambda/space-tower-defence-prod-eu-west-2-picture-gen \
     --filter-pattern '{ $.metric = "picture_usage" }' --start-time $(( ($(date +%s) - 900) * 1000 )) \
     --query 'events[].message' --output text
   ```

   Expect `"provider": "openai"`, `"model": "gpt-6.1-sol"`, `"result": "OK"` and token counts. A second drawing of the same kind
   within a few minutes should show `cacheReadTokens` above 0.
3. If it failed, the line's `code`, `upstreamStatus` and `upstreamError` say why: `not_set_up` with no `upstreamStatus` means
   the secret has no value (step 2); `not_set_up` with 401 means OpenAI refused the key (wrong key, or not a Europe-residency
   project); `throttled` with `insufficient_quota` means the project has no credit or hit its budget.

## 4. Switch provider

The provider is a Terraform variable, so a switch is a reviewed commit and a release (never a local apply):

1. Set `default = "bedrock"` (or back to `"openai"`) on `picture_provider` in
   [variables.tf](../../infrastructure/main/variables.tf), and update the assertion in
   [pictures.tftest.hcl](../../infrastructure/main/tests/pictures.tftest.hcl) run `openai_provider_and_key_secret`.
2. Commit, then dispatch the release as usual. The plan shows one in-place change to picture-gen (`PICTURE_PROVIDER`).
3. Verify with step 3: the usage line's `provider` and `model` change. The Bedrock IAM and the secret both stay, so either
   direction needs nothing else. Bedrock needs the account to have access to the Anthropic model first (not available on
   2026-11-16).
