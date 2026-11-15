# 0011. OIDC trust, GitHub environments and the artefacts bucket
Status: Accepted · Date: 2026-11-15

Context: Nothing can deploy until the CI role trusts the OIDC subject GitHub actually sends (blocker BL-1,
[B §B7](../plan/B-scope-and-decisions.md#b7-genuine-blockers)). The plan expected the immutable subject format but could not check it
([H §H.5](../plan/H-infrastructure-and-delivery.md#h5-bootstrap-changes-you-make-no-replacement-bootstrap) B-1 to B-3). Releases
also need a bucket for Lambda zips, manifests and saved plans that exists before the first release (B-6). Phase 0,
[J §J.4.2](../plan/J-execution-backlog.md#j42-the-first-build-phase-hygiene-oidc-trust-and-the-bootstrap).

Decision:
1. Subject: the repository uses GitHub's immutable subject format. The CI role trusts exactly
   `repo:jacklavelle286@78485499/space-tower-defence@1457706183:environment:prod`
   (`trusted_subs` in [common.auto.tfvars.json](../../infrastructure/envs/common.auto.tfvars.json)). No wildcard.
2. Environment: every job that assumes the role declares the GitHub environment `prod`, whose deployment branches must be
   "selected: `main`". Branch **1b**: `prod` only, two-dispatch approval (H.7.1 W-4); no `prod-apply` for now (owner, 2026-11-15).
   Branch 1c (no environments, `ref` subject, B-3) is not taken.
3. Artefacts bucket: `263185198757-eu-west-2-prod-artifacts-bucket`, in
   [infrastructure/bootstrap/artifacts.tf](../../infrastructure/bootstrap/artifacts.tf) beside the module call, not inside it.
   Public access blocked, BucketOwnerEnforced, SSE-S3, versioning, TLS-only policy, `prevent_destroy`, no `force_destroy`;
   incomplete multipart uploads aborted after 1 day; `plans/` expires after 30 days. Output: `artifacts_bucket_name`.
4. No destroy path: the interim [tf-apply-destroy-env.yml](https://github.com/jacklavelle286/space-tower-defence/blob/61160df0788cabc79f387f68e6713af878c172e3/.github/workflows/tf-apply-destroy-env.yml) offers only `plan` and `apply`. (It was deleted in
   Phase 4; `release.yml` and `apply.yml`, which replace it, have no destroy path either.)

Alternatives:
- Classic subject `repo:jacklavelle286/space-tower-defence:environment:prod`: not what GitHub sends for this repository.
- `ref:refs/heads/main` subject with no environment (B-3): weaker, and only needed if environments were unavailable.
- Artefacts bucket in `infrastructure/main`: the first release would need a `-target` apply to create it.
- Artefacts bucket inside the external bootstrap module, or a replacement bootstrap: changes shared code; ruled out by H.5.

Consequences:
- The `prod` deployment-branch rule is part of the trust: without it any branch can claim `prod`, match the subject and assume the
  CI role. Setting it is a required owner action, not a confirmation.
- Renaming or transferring the repository, or renaming the environment, changes the subject and locks CI out until
  `trusted_subs` is updated and the bootstrap re-applied (recoverable from the owner's laptop).
- The bucket outlives any single release; deleting it needs a deliberate code change to remove `prevent_destroy`.

Evidence:
- [oidc-smoke.yml](../../.github/workflows/oidc-smoke.yml) run 43646841683 on `main` (owner dispatch, after the bootstrap re-apply
  with this subject): printed `sub` equal to `trusted_subs` and assumed
  `arn:aws:sts::263185198757:assumed-role/space-tower-defence-prod-github-oidc/GitHubActions`; the log contains no `eyJ`. **[VERIFIED]**
- Repository visibility `public` (`gh api repos/jacklavelle286/space-tower-defence --jq .visibility`, 2026-11-15). **[VERIFIED]**
  Whether required reviewers can be added: **[UNVERIFIED]**; the owner checks Settings → Environments.
- `prod` deployment branches: custom policy allowing only `main` (GitHub API read after the owner set it, 2026-11-15). **[VERIFIED]**
- Test-bucket resource removed from code in commit `f88439c`; `head-bucket` returns 404 (2026-11-15). **[VERIFIED]**
- Deferred by the owner at the Phase 0 gate (2026-11-15), not blocking: the negative test from a throwaway branch, and a
  smoke re-run. Still due **before Phase 3** (the first release uploads to it): the owner's bootstrap plan and apply, then
  `head-bucket` on `263185198757-eu-west-2-prod-artifacts-bucket` (absent on 2026-11-15).
