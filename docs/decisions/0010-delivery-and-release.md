# 0010. Delivery: one manual release, pipelines only
Status: Accepted · Date: 2026-11-14

Context: The stack will hold children's saves, so every change must be reviewed before it reaches AWS and nothing may be deleted by
accident (`prompt.md:980-1004`). At planning (2026-11-14) the copied workflows pointed at another product and one offered `destroy`. Required reviewers
on GitHub environments depend on repository visibility. Spine [S11](../plan/00-spine.md#s11-delivery-proposal) and
[S0.1](../plan/00-spine.md#s01-way-of-working-confirmed-by-owner-2026-11-14); detail in
[H §H.8](../plan/H-infrastructure-and-delivery.md#h8-the-manual-release-spine-s111) and
[H §H.9](../plan/H-infrastructure-and-delivery.md#h9-artefact-ownership).

Decision:
- Way of working (O-4): Claude builds in sequential phases and the owner reviews the code at each gate. Deployment happens only
  through GitHub Actions. Local `fmt`/`validate`/`plan` and read-only AWS calls are fine; the bootstrap root is the only local apply.
- One manual `release.yml` (inputs `ref`, optional `artefacts_from`): checks → build → saved plan → approval → apply that plan →
  publish static → smoke checks → tag `release-<release_id>`.
- Approval by default is two dispatches: `release.yml` stops after the plan; the owner dispatches `apply.yml` with the plan run ID.
  A `prod-apply` environment with reviewers is used only if reviewers are available (D-13).
- Terraform owns all infrastructure and Lambda code (`s3_key` + hash); the workflow owns static files and `config.json`.
- The artefacts bucket lives in the bootstrap root; zips, manifests and saved plans (`plans/<run_id>/`) are stored there.
- Rollback: re-dispatch `release.yml` with `artefacts_from=<release_id>` (current Terraform, that release's artefacts, nothing
  rebuilt). A Terraform rollback is a forward commit. Player data is never rolled back by a release.
- No destroy workflow. Protection flags are on from the first apply; the plan guard enforces from the data-freeze point, the first
  release whose saves the children keep (recommended no earlier than the end of M5; the owner names it, M6-10).

Alternatives:
- Separate infrastructure and app pipelines: H-01 chose one release path.
- `-auto-approve`, as in the removed copied `deploy.yml`: no human look at the plan (H-02).
- Workflow calls `update-function-code`, or Lambda aliases: a second owner or second rollback mechanism (H.9.1).
- Rebuild old commits to roll back: `artefacts_from` reuses the exact archived bytes (H-08).
- Artefacts bucket in the main stack: chicken-and-egg needing a `-target` apply (S11.1).
- Saved plan as a GitHub artefact: could be public and holds the configuration (W-4).
- Keep a `destroy` action: conflicts with `prompt.md:1002` once real data exists (N-5).

Consequences:
- Every release needs the owner twice (plan review, apply dispatch) unless `prod-apply` exists.
- The bootstrap root (trust, artefacts bucket) is applied by the owner from a laptop; ADR-0011 records the OIDC outcome.
- Static files are never deleted, so old hashed assets stay for rollback.

Evidence: [H §H.7.1](../plan/H-infrastructure-and-delivery.md#h71-decisions);
[H §H.12.1](../plan/H-infrastructure-and-delivery.md#h121-mechanism);
[H §H.11.3](../plan/H-infrastructure-and-delivery.md#h113-data-freeze-point-spine-s114);
[B5.8 H-01..H-14](../plan/B-scope-and-decisions.md#b58-delivery-and-operations).
