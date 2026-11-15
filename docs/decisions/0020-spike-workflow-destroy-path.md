# 0020. A separate spike workflow whose destroy reaches spike state only
Status: Proposed · Date: 2026-11-15

Context: The M0 spikes (M0-10, M0-12, M0-13) need throwaway AWS stacks, applied and destroyed through GitHub Actions only
(O-4, [spine S0.1](../plan/00-spine.md#s01-way-of-working-confirmed-by-owner-2026-11-14)). J M0 put them before any real
resource, and [H §H.7.1](../plan/H-infrastructure-and-delivery.md#h71-decisions) W-1 says no destroy workflow exists. The build
order runs them in Phases 5–6, after Phase 4: the certificate, both site buckets and both distributions are live under
`main/terraform.tfstate` while a workflow with a `destroy` action exists ([build-phases.md Phase 5](../build-phases.md#phase-5--spike-workflow-and-auth-spike), "Depends on").

Decision:
- A separate manual `spike.yml` ([.github/workflows/spike.yml](../../.github/workflows/spike.yml)): inputs `spike` (choice list)
  and `action` (`plan` | `apply` | `destroy`); `main` only; `environment: prod` for the existing OIDC trust; no approval
  environment; concurrency `spike-<spike>`, so it never blocks or is blocked by `terraform-prod`.
- It only touches root `spikes/<spike>/` and state key `spikes/<spike>/terraform.tfstate`, both built from the choice value
  alone. A guard step fails the job unless: the name matches `^[a-z0-9-]+$`; the directory is not a symlink, contains none, and
  its realpath is exactly `$GITHUB_WORKSPACE/spikes/<spike>`; the key starts `spikes/`; neither has a `main` path segment nor
  contains `infrastructure`; the root's `*.tf` files have no `import` or `removed` block, no `module` and no
  `terraform_remote_state`, and it has no `*.tf.json` (so no production ID can be imported into spike state and then
  destroyed); the spike's own `.terraform.lock.hcl` is committed. After `init`, the backend Terraform recorded
  must be `s3`, the state bucket, that exact key, default workspace.
- `apply` and `destroy` apply the saved plan from the same job (`destroy` = `plan -destroy` saved, then applied); after destroy
  `terraform state list` must be empty or the job fails. The plan goes to the run summary; outputs too, except sensitive ones.
- `spike.yml` and every `spikes/` root are deleted at Phase 6's gate, once each spike state is empty, before any table or user
  pool exists (Phase 8). From then on W-1's "no destroy workflow" holds again and G-5 enforces it.

Alternatives:
- Move the spikes before Phase 2: too late; the certificate, buckets and distributions already exist.
- Spike resources in `infrastructure/main` (no destroy needed): mixes throwaway resources into production state and plans.
- Destroy spikes from the laptop: violates O-4 (deployment only through GitHub Actions).

Consequences:
- Amends H §H.7 ("no destroy workflow", W-1) and J M0's order (spikes before any M1 resource) for Phases 5–6 only; the planner
  updates both to point here.
- The CI role has `AdministratorAccess`, so IAM does not stop a spike touching production resources; the guards above and code
  review of each spike root are the boundary. A spike root must name everything `space-tower-defence-spike-` and must not
  import or reference production resources.
- Adding a spike (Phase 6: `ddb-transactions`, `audio-idb`) is one more choice option plus its root with a lock file.
- A spike left applied blocks deleting the workflow (Phase 6 checks `spikes/` keys first).

Evidence: [spike.yml](../../.github/workflows/spike.yml); actionlint clean; the guard step run locally against `auth-cognito`
(passes) and a symlinked root, a root containing a symlink, `main`, `../infrastructure/main`, a missing root and a root without
a lock file, and roots with an `import` block, a `module` block, `terraform_remote_state` or a `.tf.json` file (each
refused) **[VERIFIED]** 2026-11-15. First dispatch: **[UNVERIFIED]** until the owner runs it.
