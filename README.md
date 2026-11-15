# space-tower-defence

Space Colony Defence is a browser tower-defence game for children aged 5 to 7. Astronauts defend a moon colony from
cartoon aliens. Between waves the child does one short, untimed maths, phonics or spelling activity to earn extra credits.
It will run as two static web apps (player and admin) on AWS, with a small Python API (being built; see
[docs/build-phases.md](docs/build-phases.md)).

## Where to start

- [docs/README.md](docs/README.md): index of all documentation.
- [docs/build-phases.md](docs/build-phases.md): the build order, phase by phase. Start at Phase 0.
- [CLAUDE.md](CLAUDE.md): working rules for the AI assistant that builds the code (and a short summary of the toolchain).

## How deploys work

Only through GitHub Actions, by manual workflow dispatch on `main`. Nothing is applied from a laptop, except the bootstrap root
([infrastructure/bootstrap](infrastructure/bootstrap/)), which creates the CI role's trust and is applied by the owner. A
release is two dispatches: [release.yml](.github/workflows/release.yml) (checks, build and a saved plan), then
[apply.yml](.github/workflows/apply.yml) with that run's ID (apply the saved plan, publish, smoke checks, record). Releases are
listed in [docs/releases/](docs/releases/). The interim workflow [tf-apply-destroy-env.yml](https://github.com/jacklavelle286/space-tower-defence/blob/61160df0788cabc79f387f68e6713af878c172e3/.github/workflows/tf-apply-destroy-env.yml) was deleted in Phase 4.

## Repository layout

| Path | What |
|---|---|
| [docs/](docs/) | Plan, design overview, build phases, decisions, art catalogue |
| [art/](art/) | Hand-drawn SVG art sources and the drawing style guide |
| [tools/](tools/) | Art render scripts and the balance simulator |
| [infrastructure/](infrastructure/) | Terraform: `bootstrap/`, `main/`, `envs/` |
| [.github/workflows/](.github/workflows/) | GitHub Actions workflows |
| [web/player/public/assets/](web/player/public/assets/) | Rendered game images |

The web apps, API and the rest are still to be built; [CLAUDE.md](CLAUDE.md#repository-layout) lists what is planned.
