# Space Colony Defence

A browser tower-defence game with short learning activities for young children. Astronauts defend a space colony from
cartoon aliens; between waves the child does one short, untimed maths, phonics or spelling activity to earn extra
credits. Static web apps on AWS with a small Python API, built with Terraform and deployed only through GitHub
Actions.

This repository holds two editions of it.

| | Family edition | Schools platform |
|---|---|---|
| What | The proof of concept: the game for the owner's children, aged 5 to 7 | A paid version for state primary schools in England, Years 1 to 4, licensed per enrolled pupil |
| Where | `aliens.jackgl.com` | `spacecolonydefence.com`: `<school>.spacecolonydefence.com` for each school, `admin.spacecolonydefence.com` for the owner |
| State | Live, and **frozen** since 2026-11-21 ([ADR-0045](docs/decisions/0045-family-edition-frozen.md)): no more changes | Being built, phase by phase, towards a Pilot ([delivery plan](docs/platform/13-delivery-plan.md)) |
| Branch | `family` | `dev`, then `main` at each release, the Pilot first |
| AWS | Its own account; Terraform root [infrastructure/main](infrastructure/main/) | Accounts `sca-dev` and `sca-prod`; Terraform root [infrastructure/platform](infrastructure/platform/) |
| Deploys | [release.yml](.github/workflows/release.yml), dispatched by the owner; no more releases | [platform-release.yml](.github/workflows/platform-release.yml): every merge into `dev` deploys to sca-dev; sca-prod from `main`, with the owner's approval |

The code under `web/` and `api/` is the family edition's, inherited by the platform when `dev` was cut. The platform
changes it story by story, and will end up entirely different.

## Where to start

- [docs/platform/README.md](docs/platform/README.md): what the platform is, the owner's decisions, and one document per
  layer.
- [docs/platform/13-delivery-plan.md](docs/platform/13-delivery-plan.md): releases, epics, phases and the gate log.
- Jira project **SCD**: the source of truth for the platform's stories
  ([docs/platform §6](docs/platform/README.md#6-user-stories-and-jira)). Branches, commits and pull requests carry the
  ticket key, which links them to the ticket.
- [docs/README.md](docs/README.md): index of all documentation, including the family edition's plan and build phases.
- [CLAUDE.md](CLAUDE.md): working rules for the AI assistant that builds the code.

## Branches

| Branch | Holds | Changes arrive by |
|---|---|---|
| `dev` | The schools platform; every merge deploys to sca-dev | Pull requests from `SCD-<n>-<short-name>` branches, squash-merged once the four CI checks pass |
| `main` | The family edition as it was when the branches split (292f4bc), until the Pilot release; then the platform's releases | One pull request from `dev` at each release ([ADR-0055](docs/decisions/0055-prod-release-per-release.md)) |
| `family` | The family edition, frozen | Nothing |

The day-to-day steps are in the [branches runbook](docs/runbooks/branches.md).

## Local setup

| Tool | Version | How |
|---|---|---|
| Node | 24 | `nvm use` (reads [.nvmrc](.nvmrc)) |
| Python | 3.12 locally (3.14 in CI and Lambda) | `python3 -m venv api/.venv && api/.venv/bin/pip install -r api/requirements-dev.txt` |
| Terraform | 1.17.2 | for `fmt`, `validate` and tests only; never `apply` from a laptop |
| Chrome | installed | the art tools and the local Playwright journeys use it |

```sh
cd web && npm ci            # all web workspaces: game-core, shared, player, admin, game-data-check
```

## Run locally (no AWS, no account)

```sh
cd web/player && npm run dev     # the game on http://localhost:5173 with a fake sign-in and an in-memory API
cd web/admin && npm run dev      # the admin portal on http://localhost:5174 (its pages need sign-in: use the dev pages)
```

Development pages (never published): admin `/level-preview.html` (the level editor), `/aliens-preview.html` (the
alien maker), `/editor-preview.html` (the activity editor); player `/play/local` (a practice battle with `?` options,
see `web/player/src/battlefield/LocalSlice.tsx`), `/routes-preview.html` (routes in every direction),
`/panel-preview.html` (the learning panel).

## Build and test

```sh
cd web && npm run lint && npm run typecheck && npm test && npm run build
api/.venv/bin/ruff check --config api/pyproject.toml api && api/.venv/bin/python -m pytest api
api/.venv/bin/python -m pytest scripts/tests
terraform fmt -check -recursive infrastructure/
terraform -chdir=infrastructure/platform init -backend=false -lockfile=readonly && terraform -chdir=infrastructure/platform test
cd web/player && npx playwright test -c playwright.local.config.ts   # keyboard-only play and axe scans
python3 scripts/gamedata_lock_check.py --advisory                    # G-8: released game data only ever added to
```

Pull requests into `dev`, and pushes to `main`, `family` and `dev`, run [ci.yml](.github/workflows/ci.yml): the same
checks in four jobs (web, api, repo, scripts), with no AWS access. Art: `python3 tools/art/render.py` (SVG → PNG),
`python3 tools/art/gallery.py` (docs/art/gallery.html).

## Deploy

Only through GitHub Actions. Nothing is applied from a laptop except each account's bootstrap, which the owner runs.

- **sca-dev**: every merge into `dev` runs [platform-release.yml](.github/workflows/platform-release.yml): checks, a
  plan saved create-only in the account's artefacts bucket, an apply of exactly that plan (skipped when nothing
  changes), then smoke checks. No approval. What to do when a run fails:
  [platform release runbook](docs/runbooks/platform-release.md).
- **sca-prod**: only from a release on `main`, the Pilot first. The owner dispatches the same workflow on `main`, reads
  the plan in the run summary and approves the `sca-prod-apply` deployment.
- **Family edition**: frozen. Its [release.yml](.github/workflows/release.yml) and
  [apply.yml](.github/workflows/apply.yml) stay in the repository, accept only `family`, and are not run any more.

## Runbooks

[docs/runbooks/](docs/runbooks/): [branches](docs/runbooks/branches.md) and the
[platform release](docs/runbooks/platform-release.md); for the family edition, restore from backup, operator and test
accounts (including password resets), the sign-up kill switch, rollback, a wrong speech clip, the DNS hand-off and the
OpenAI key.

## Repository layout

| Path | What |
|---|---|
| [web/](web/) | `game-core` (the rules and simulation, no browser or Node), `shared`, `player`, `admin`, `game-data-check` |
| [api/](api/) | The Python Lambdas and their shared modules and tests |
| [game-data/](game-data/) | Released rulesets, planet documents and asset manifests (create-only once released: G-8) |
| [contracts/](contracts/) | Routes, limits, schemas, fixtures and golden scenarios shared by the web and the API |
| [infrastructure/](infrastructure/) | Terraform: `bootstrap/` and `main/` (the family edition), `platform/` (the platform), `modules/`, `envs/` (variables per environment) |
| [scripts/](scripts/) | Release tooling and checks, with tests |
| [art/](art/), [tools/](tools/) | Hand-drawn SVG art, its style guide, the art tools and the balance simulator |
| [docs/](docs/) | The platform's scope ([docs/platform/](docs/platform/)), the family edition's plan and build phases, decisions, runbooks, releases, validation evidence |
