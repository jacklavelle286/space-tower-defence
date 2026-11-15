# 0019. One release run with a manual approval
Status: Proposed · Date: 2026-11-15

Context: Phase 4 shipped the two-dispatch default ([H §H.7.1](../plan/H-infrastructure-and-delivery.md#h71-decisions) W-4,
ADR-0010, ADR-0011 branch 1b): `release.yml` stops after the plan and the owner dispatches `apply.yml` with the plan's run ID.
It works (release run 43700031098, apply run 43700299368), but it needs two dispatches and a copied ID. The owner wants branch 1a
instead (backlog [B-3](../backlog.md)): the GitHub environment `prod-apply` now exists (deployment branch `main`, the owner as
required reviewer) and the CI role trusts its subject. W-5 already describes this variant.

Decision:
- `apply.yml` has both `workflow_dispatch` and `workflow_call` (input `plan_run_id`). `release.yml` ends with a `deploy` job that
  calls it with `plan_run_id = github.run_id` once `plan` has succeeded. One dispatch does config → checks → build → upload → plan
  → approval → apply → publish → smoke → record.
- **Only the `apply` job uses `prod-apply`.** GitHub holds a job on an environment with required reviewers before it starts, so no
  runner, OIDC token or role session exists until the owner approves. `publish` and `record` stay on `prod` (they need `apply` to
  succeed first), so the owner approves exactly once per release; each further job on `prod-apply` would be a further approval.
  Rejecting fails `apply`; nothing is applied and the later jobs are skipped.
- `apply.yml`'s `config` job tells the two ways in apart by `GITHUB_WORKFLOW_REF` (a called workflow sees the caller's `github`
  context). Called: the run must be `release.yml` on `main`, `plan_run_id` must equal this run's ID, and the run must be in
  progress at this commit. Dispatched: unchanged strict check (a finished, successful `release.yml` run whose commit is on `main`).
  Anything else is refused.
- Concurrency: `release.yml` keeps `terraform-prod` for the whole run, approval wait included. `apply.yml` takes `terraform-prod`
  only when it is the top-level workflow; when called it takes `terraform-prod-called-<run_id>`, because a called workflow in its
  caller's group makes GitHub cancel the run.
- The calling job grants `actions: read`, `contents: write`, `id-token: write` (the union apply.yml's jobs need; a caller caps the
  called token). Each called job still narrows to its own list; only `record` has `contents: write`.

Alternatives:
- Keep two dispatches (W-4): works, but two dispatches and an ID to copy per release.
- `prod-apply` on apply, publish and record: three approvals per release.
- Approval as a job before apply (e.g. an "approve" job on `prod-apply` that does nothing): same single approval, one more job,
  and apply itself would no longer be the job the reviewer sees.
- Inline the apply jobs into `release.yml`: duplicates `apply.yml`, which must stay dispatchable for a chosen plan.

Consequences:
- Supersedes in part ADR-0010 ("approval by default is two dispatches") and ADR-0011 decision 2 ("branch 1b, no `prod-apply`"),
  once accepted. Everything else in both stands.
- A release now holds `terraform-prod` while it waits for approval (GitHub fails a job after 30 days of waiting **[UNVERIFIED]**,
  GitHub's environments docs); another release or apply dispatched meanwhile waits, and a newer one replaces an older waiting one.
- `prod-apply` must keep "Prevent self-review" off: the owner both dispatches and approves.
- A rejected run ends as failed: "Re-run failed jobs" asks for approval again, or dispatch `release.yml` again. `apply.yml`'s
  dispatch path also asks for approval; the stale-plan guard runs after it.
- Both subjects are trusted by the same role, so `prod-apply` is a workflow gate, not an IAM boundary.

Evidence: [release.yml](../../.github/workflows/release.yml), [apply.yml](../../.github/workflows/apply.yml); actionlint clean;
GitHub docs "Reusable workflows" (the `github` context is the caller's; a calling job takes `if`, `needs`, `permissions`, `with`,
not `environment`; caller permissions can only be reduced) **[VERIFIED]** 2026-11-15. `prod-apply` (GitHub API read,
2026-11-15): required reviewer the owner, `prevent_self_review: false`, deployment branches custom, only `main` **[VERIFIED]**. First one-run release: **[UNVERIFIED]**
until the owner dispatches it.
