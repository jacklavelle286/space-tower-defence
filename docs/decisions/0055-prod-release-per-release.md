# 0055. Prod gets a release at each platform release, the Pilot first
Status: Accepted · Date: 2026-11-22

Context: [0044](0044-branches-family-dev-main.md) kept `main` untouched until "one big release to prod at the end"
[CONFIRMED by owner 2026-11-21, PD-22]. On 2026-11-22 the owner confirmed that the pilot runs free, as a "Not billed"
school, while billing is built (PLAN-Q3). So the pilot runs in prod before Launch's billing exists, and prod needs more
than one release. The decision register raised this as PS0-13; the owner accepted it with the PS0 gate on 2026-11-22.

Decision:
- `main` is the platform's release branch. At each release (the Pilot first, then Launch, then Later), one pull request
  merges `dev` into `main` (**Create a merge commit**). The owner then dispatches `platform-release.yml` on `main` and
  approves `sca-prod-apply`.
- The "big release" of 0044 and PD-22 is the Pilot release. Nothing goes onto `main` before it, and only these release
  merges after it.
- The rest of 0044 stands: feature branches into `dev`, automatic deploys to sca-dev, and the owner's dispatch and
  approval for prod.

Alternatives: one release at the end (the pilot would wait for billing, against PLAN-Q3, or run in sca-dev with real
pupils' data); prod released from `dev` (prod would get whatever is on the integration branch); a release branch per
release (more branches to track, when `main` already plays that part).

Consequences: amends 0044 and PD-22. CLAUDE.md, the branches and platform release runbooks, 02 §2, §5 and §6, and the
README now say "each release". Open: whether a fix needed in prod between releases may go out as a small release of
its own. The owner decides when the first one is needed.

Evidence: PS0-13 in the [decision register](../platform/14-decision-register.md#14-new-owner-decisions-during-ps0);
PLAN-Q3 ([13 §5](../platform/13-delivery-plan.md#5-decisions-still-open)); PD-22
([README §3.1](../platform/README.md#31-confirmed-by-the-owner)); the PS0 gate
([13 §8](../platform/13-delivery-plan.md#8-gate-log)).
