# CLAUDE.md

Instructions for an AI coding assistant working in this repository. Space Colony Defence is a browser tower-defence game with
short learning activities for children aged 5 to 7. The owner, jacklavelle286, is an experienced AWS and Terraform architect who
is learning application development: explain application code when asked; do not explain AWS basics.

Read first: [docs/README.md](docs/README.md) (index), then [docs/build-phases.md](docs/build-phases.md) (the working order).

## Way of working (agreed by the owner, 2026-11-14)

Source: O-4 in [B §B6.1](docs/plan/B-scope-and-decisions.md#b61-decisions-you-took-in-chat-on-2026-11-14-confirmed-by-owner-2026-11-14)
and [spine S0.1](docs/plan/00-spine.md#s01-way-of-working-confirmed-by-owner-2026-11-14).

- **Phases and gates.** Build one phase at a time, in the order of [build-phases.md](docs/build-phases.md). Follow
  [the loop for every phase](docs/build-phases.md#the-loop-for-every-phase): read the phase entry and its J tasks, build, run every
  local check, write the gate summary and gate-log row, then **stop** for the owner's review. Do not start the next phase until the
  owner approves the gate.
- **Git and branches ([ADR-0044](docs/decisions/0044-branches-family-dev-main.md),
  [ADR-0045](docs/decisions/0045-family-edition-frozen.md), owner 2026-11-21).**
  - **`family`** is the family edition (`aliens.jackgl.com`), **frozen as the proof of concept** from 2026-11-21:
    no commits, no family releases and no merges into `dev`, unless the owner says otherwise.
  - **`dev`** is the schools platform's integration branch. Work on short-lived feature branches named after the Jira
    ticket, `SCD-<n>-<short-name>`, merged into `dev` by pull request once CI passes. Commit messages start with the
    ticket key (`SCD-<n> <area>: <summary>`). Claude may merge its own pull requests into `dev` once CI passes (owner,
    2026-11-21; [branches runbook](docs/runbooks/branches.md)). The SCD tickets in Jira are the source of truth for the platform's stories
    ([docs/platform §6](docs/platform/README.md#6-user-stories-and-jira) on `dev`). Bugs in code inherited from the
    family edition are fixed on `dev` too, through an `SCD-<n>` branch.
  - **`main`** is the platform's release branch ([ADR-0055](docs/decisions/0055-prod-release-per-release.md)): at
    each release, the Pilot first, `dev` merges into it and prod deploys from it. Nothing else goes onto `main`.
- **Deployment only through GitHub Actions**, by manual workflow dispatch in the GitHub UI. Never deploy from the laptop, except
  the owner's bootstrap apply (below).
- **The owner dispatches every deploying workflow** (`release.yml`, `apply.yml`, spike runs, the platform's prod release)
  after approving the gate, and approves every `prod-apply` and `sca-prod-apply` deployment. Claude does neither, even if
  `gh` is authenticated. The one exception (ADR-0044): a merge into `dev` deploys to the sca-dev account automatically,
  once the platform's pipeline exists.
- **Never run `terraform apply` locally on [infrastructure/main](infrastructure/main/).** Fine locally: `terraform fmt`,
  `validate`, `init -backend=false`, `plan` with read-only credentials, and read-only AWS calls (`describe-*`, `get-*`,
  `head-bucket`, …).
- **The bootstrap root ([infrastructure/bootstrap](infrastructure/bootstrap/)) is the only local apply, and the owner runs it**
  with their own bootstrap script. Claude edits it and reviews the plan output; Claude does not apply it. Never create a
  replacement bootstrap ([H §H.5](docs/plan/H-infrastructure-and-delivery.md#h5-bootstrap-changes-you-make-no-replacement-bootstrap)).
- **Local AWS writes.** Claude makes only read-only AWS calls. The non-deployment writes in
  [Local AWS writes that are not deployments](docs/build-phases.md#local-aws-writes-that-are-not-deployments) are run by the
  owner, not Claude. The list is a proposal until the owner confirms it at the Phase 0 gate. Any new write needs a new row and the
  owner's approval at a gate.
- **AWS profiles.** Claude's AWS calls use only the `-readonly` CLI profiles: `space-tower-defence-readonly`,
  `productivity-prod-readonly`, `dns-readonly`, `sca-dev-readonly`, `sca-prod-readonly` and `cumulus-main-readonly`
  (the management account). They use the IAM Identity Center permission set `ReadOnlyAccess`, assigned in every account
  (owner, 2026-11-21), so a write fails with AccessDenied. The profiles without `-readonly` have AdministratorAccess and
  are the owner's. ReadOnlyAccess can still read S3 objects and DynamoDB items: the no-personal-data rule still applies.
- **Secrets.** Never print, log or commit OIDC tokens, credentials or secrets. Print a token's claim, never the token. Never
  commit `.terraform*` folders, state, plan files or clip audio.
- **No personal data.** No email addresses, dates of birth or real names in commits, docs, code, test data or requests to
  external services. The children's dates of birth stay private.
- **Decisions** are ADRs in [docs/decisions/](docs/decisions/), one screen each, in the
  [J §J.6.2 template](docs/plan/J-execution-backlog.md#j62-template). A new ADR is `Proposed` until its gate is approved, then
  `Accepted`. The ADR goes in the same commit as the change it records.
- **Do not invent facts.** If something is unknown, say so, label it, and say who settles it.

## Evidence labels

Use the plan's labels ([spine](docs/plan/00-spine.md), "Labels"):

| Label | Meaning |
|---|---|
| **[CONFIRMED]** | fixed by the spec, [prompt.md](prompt.md) |
| **[CONFIRMED by owner]** | decided by the owner in chat (date given) |
| **[PROPOSAL]** | planner recommendation; the owner may change it |
| **[ASSUMPTION]** | routine detail chosen without asking; cheap to change |
| **[VERIFIED]** | checked directly (source given) |
| **[UNVERIFIED]** | not yet checked (how to check it is given) |

## Repository layout

Exists now:

| Path | What |
|---|---|
| [docs/plan/](docs/plan/) | The plan: spine and sections A–J, plus research [sources](docs/plan/sources/) |
| [docs/art/](docs/art/) | Asset catalogue and gallery |
| [docs/decisions/](docs/decisions/) | ADRs |
| [art/svg/](art/svg/) | Hand-drawn SVG art sources, in the style of [art/STYLE.md](art/STYLE.md) |
| [tools/art/](tools/art/) | Render, gallery and preview scripts |
| [tools/sim/](tools/sim/) | Balance simulator |
| [infrastructure/](infrastructure/) | `bootstrap/` (owner-applied), `main/` (pipeline-applied), `envs/` (tfvars JSON) |
| [.github/workflows/](.github/workflows/) | `ci.yml` (push checks), `release.yml` (one release run: plan, owner approval on `prod-apply`, then it calls `apply.yml`; ADR-0019), `apply.yml` (also dispatchable for a chosen plan), `plan.yml` (drift check), `oidc-smoke.yml`. The interim `tf-apply-destroy-env.yml` was deleted in Phase 4 |
| [scripts/](scripts/) | Release tooling (manifest, plan guard, asset scan, apply guard, publish, smoke) and its tests in `scripts/tests/` |
| [docs/runbooks/](docs/runbooks/), [docs/releases/](docs/releases/) | Runbooks (DNS hand-off); one entry per production release |
| [web/player/public/assets/](web/player/public/assets/) | Rendered game PNGs. Do not overwrite when scaffolding `web/` |

Planned (not yet created; see [E §E.5.1](docs/plan/E-architecture.md#e51-workspace-layout-all-to-create) and
[H §H.2](docs/plan/H-infrastructure-and-delivery.md#h2-repository-layout-after-this-plan)): `web/{game-core,player,admin,shared}`,
`contracts/`, `api/`, `game-data/`, `content/`, `spikes/`, more `infrastructure/modules/`, `docs/validation/`.

## Toolchain

| Tool | Version | Notes |
|---|---|---|
| Node | 24 via nvm | [.nvmrc](.nvmrc); `nvm use` |
| Python | 3.12 locally; 3.14 in CI and Lambda | [.python-version](.python-version) is read by CI. CI is the authority ([toolchain table](docs/build-phases.md#local-toolchain-and-how-tests-run-on-your-machine)) |
| Terraform | 1.17.2 exact | `terraform_version` in [common.auto.tfvars.json](infrastructure/envs/common.auto.tfvars.json) |

Commands that work today:

```sh
python3 -B tools/sim/selftest.py   # simulator self-checks
python3 tools/art/render.py        # SVG -> PNG into web/player/public/assets (--family <name> for one family)
python3 tools/art/gallery.py       # rebuild docs/art/gallery.html
python3 tools/art/previews.py      # preview sheets into docs/art/previews/ (git-ignored)
terraform fmt -check -recursive infrastructure/
```

Art is hand-drawn SVG in `art/svg/`, following [art/STYLE.md](art/STYLE.md), and rendered to `web/player/public/assets/`. The
catalogue [docs/art/asset-catalogue.json](docs/art/asset-catalogue.json) lists every asset. Generated previews
(`docs/art/previews/`) and review sheets (`art/review/`) are git-ignored.
