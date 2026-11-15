# 0022. Operator and test accounts in Terraform
Status: Accepted · Date: 2026-11-15

Context: The Phase 8 plan made every Cognito user and group membership an owner runbook step
([H §H.9.1](../plan/H-infrastructure-and-delivery.md#h91-one-owner-per-artefact); `AdminCreateUser` rows in
[Local AWS writes](../build-phases.md#local-aws-writes-that-are-not-deployments)), so "no users in Terraform". That keeps
passwords out of state and children's accounts away from a plan that could delete them, but it means four laptop writes for
accounts that never change. On 2026-11-15 the owner chose Terraform for the operator login and the test accounts
**[CONFIRMED by owner, 2026-11-15]**.

Decision: [infrastructure/main/accounts.tf](../../infrastructure/main/accounts.tf) creates the owner's operator login
(username = env key `operator_username`, in group `admin`, `prevent_destroy`), `test-operator` (operator pool, **not** in
`admin`) and `test-player-1`, `test-player-2` (player pool), the test accounts of
[I §I.2.10](../plan/I-validation.md#i210-test-accounts-and-test-data). The owner's login is an **e-mail invitation** (owner,
2026-11-15): it carries the grown-up's e-mail (`operator_email`), no password is set by Terraform, and Cognito e-mails the
username and a temporary password using the pool's invitation template (default Cognito sender); managed login then forces a
new password and TOTP enrolment. Another grown-up admin is one more such resource. The three test accounts get a
`random_password` (24 characters, every class) in an SSM SecureString `/space-tower-defence/prod/accounts/<username>`:
`test-operator` as a one-time password (`SUPPRESS`), the test players as a permanent password. `ignore_changes` on passwords and
`enabled`, so runbook resets and disables are neither drift nor undone. Outputs carry names only. `aws_cognito_user` and
`aws_cognito_user_in_group` join the plan guard's protected types. Children's accounts are **never** in Terraform and never
have an e-mail. Password, MFA and session resets, disable and delete stay runbook commands; confirming the alarm e-mail stays
manual.

Alternatives: keep the runbook (rejected by the owner: four laptop writes, against "everything through pipelines"); passwords
typed into a GitHub secret or variable (a secret the pipeline must hold and rotate, still in state); write-only SSM `value_wo`
(no gain: `random_password.result` and the Cognito user's password are in state anyway).

Consequences: the owner's password is never in state or SSM (Cognito generates and e-mails it; the e-mail address is in the
public env file by the owner's choice). The test passwords sit in Terraform state (encrypted S3, admin-only), in SSM, and in every saved
plan (`plan.tar.gz` under `plans/` in the artefacts bucket, 30-day expiry); the CI role reads them through state. The
`test-operator` value is useless after its first sign-in; the test players' values stay live, so I §I.2.10's "Passwords" row
changes for them: SSM, not only your local environment. They are still never given to the tests as a CI secret. A user
deleted by runbook should be recreated by the next release with the SSM password **[UNVERIFIED]**. `operator_username` is fixed
once applied (a rename replaces the user and needs `prevent_destroy` lifted). The `hashicorp/random` provider is added to
`infrastructure/main`. Supersedes, for these four accounts only, the "no users in Terraform" rule and the "Cognito users and
`admin` group membership" row of H §H.9.1, I §I.2.10's "Passwords" row, and the `cognito_pool` module note, all amended by
reference only; the creation rows in the local-writes table are withdrawn. Follow-up: reword the comments at
`infrastructure/modules/cognito_pool/main.tf` (deliberately-absent list) and `infrastructure/main/main.tf` (operator pool
"AdminCreateUser only", "Membership is a runbook step") once Phase 9 has landed.

Evidence: owner instruction 2026-11-15; local read-only plan 2026-11-15 (4 `random_password`, 4 `aws_cognito_user`, 1
`aws_cognito_user_in_group`, 4 `aws_ssm_parameter` to add, plan guard clean); `PreSignUp_AdminCreateUser` passes uncounted
([handler](../../api/functions/cognito_presignup/handler.py)); [runbook](../runbooks/operator-accounts.md).
