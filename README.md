# space-tower-defence

Space Colony Defence is a browser tower-defence game for children aged 5 to 7. Astronauts defend a moon colony from
cartoon aliens. Between waves the child does one short, untimed maths, phonics or spelling activity to earn extra
credits. Two static web apps (the game, and the admin portal where content, levels, planets and aliens are made) on
AWS, with a small Python API, all deployed through GitHub Actions.

## Where to start

- [docs/README.md](docs/README.md): index of all documentation.
- [docs/build-phases.md](docs/build-phases.md): the build order, phase by phase, and the gate log.
- [CLAUDE.md](CLAUDE.md): working rules for the AI assistant that builds the code.

## Local setup

| Tool | Version | How |
|---|---|---|
| Node | 24 | `nvm use` (reads [.nvmrc](.nvmrc)) |
| Python | 3.12 locally (3.14 in CI and Lambda) | `python3 -m venv api/.venv && api/.venv/bin/pip install -r api/requirements-dev.txt` |
| Terraform | 1.17.2 | for `fmt`, `validate` and tests only; never `apply` on `infrastructure/main` from a laptop |
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
see `LocalSlice.tsx`), `/routes-preview.html` (routes in every direction), `/panel-preview.html` (the learning panel).

## Build and test

```sh
cd web && npm run lint && npm run typecheck && npm test && npm run build
api/.venv/bin/ruff check --config api/pyproject.toml api && api/.venv/bin/python -m pytest api
api/.venv/bin/python -m pytest scripts/tests
terraform fmt -check -recursive infrastructure/
cd web/player && npx playwright test -c playwright.local.config.ts   # keyboard-only play and axe scans (Phase 68)
python3 scripts/gamedata_lock_check.py --advisory                    # G-8: released game data only ever added to
```

Push to `main` runs [ci.yml](.github/workflows/ci.yml): the same checks, no AWS access. Art: `python3
tools/art/render.py` (SVG → PNG), `python3 tools/art/gallery.py` (docs/art/gallery.html).

## Release (deploy)

Only through GitHub Actions, by manual dispatch, after review. One run of [release.yml](.github/workflows/release.yml):
checks, build, a saved plan, then it waits for the owner's approval on the `prod-apply` environment, then applies,
publishes, runs the smoke checks and records the release in [docs/releases/](docs/releases/) with a `release-<id>`
tag. Leave `reseed_current` unticked unless you mean to point new games back at the repository's game data. Nothing
is applied from a laptop except the bootstrap root ([infrastructure/bootstrap](infrastructure/bootstrap/)), which the
owner applies.

Game data published from the admin portal (levels, planets, aliens) goes live without a release, through the
game-data publisher ([ADR-0037](docs/decisions/0037-game-data-publisher.md)).

## Runbooks

[docs/runbooks/](docs/runbooks/): restore from backup, operator and test accounts (including password resets), the
sign-up kill switch, rollback, a wrong speech clip, the DNS hand-off, the OpenAI key.

## Repository layout

| Path | What |
|---|---|
| [web/](web/) | `game-core` (the rules and simulation, no browser or Node), `shared`, `player`, `admin`, `game-data-check` |
| [api/](api/) | The Python Lambdas and their shared modules and tests |
| [game-data/](game-data/) | Released rulesets, planet documents and asset manifests (create-only once released: G-8) |
| [contracts/](contracts/) | Routes, limits, schemas, fixtures and golden scenarios shared by the web and the API |
| [infrastructure/](infrastructure/) | Terraform: `bootstrap/`, `main/`, `envs/` |
| [scripts/](scripts/) | Release tooling and checks, with tests |
| [art/](art/), [tools/](tools/) | Hand-drawn SVG art, its style guide, the art tools and the balance simulator |
| [docs/](docs/) | Plan, build phases, decisions, runbooks, releases, validation evidence |
