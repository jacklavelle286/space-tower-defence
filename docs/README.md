# Documentation index

**Start here for the build:** [build-phases.md](build-phases.md). It sets the order of work, the owner actions and the review gates.
Rules for an AI assistant are in [CLAUDE.md](../CLAUDE.md). The original specification is [prompt.md](../prompt.md).

## Overview

| Document | What it is |
|---|---|
| [design.md](design.md) | Design overview: the plan distilled into one document for validating it |
| [build-phases.md](build-phases.md) | Build phases, owner actions, review guides and the gate log |

## Plan (v0.3, accepted 2026-11-14)

| Section | What it covers |
|---|---|
| [00-spine.md](plan/00-spine.md) | Design spine: the decisions every other section follows, and the evidence labels |
| [A-repository-findings.md](plan/A-repository-findings.md) | What existed when planning started, what is reused, and what must be built or wired |
| [B-scope-and-decisions.md](plan/B-scope-and-decisions.md) | Confirmed scope, milestones, owner decisions (D-1…D-13, O-1…O-4) and blockers |
| [C-game-and-learning-design.md](plan/C-game-and-learning-design.md) | Combat, economy, campaign and the learning content bank |
| [D-ux-and-content-operations.md](plan/D-ux-and-content-operations.md) | Screens and journeys for children and the content operator; art and audio inventory |
| [E-architecture.md](plan/E-architecture.md) | Architecture and service boundaries, trust model, workspace layout |
| [F-state-and-data.md](plan/F-state-and-data.md) | Run, activity and play-session state; checkpoints; DynamoDB design |
| [G-api-contracts.md](plan/G-api-contracts.md) | Every HTTP route: callers, inputs, outputs, errors |
| [H-infrastructure-and-delivery.md](plan/H-infrastructure-and-delivery.md) | Terraform and GitHub Actions: bootstrap changes, modules, release, backups, alarms |
| [I-validation.md](plan/I-validation.md) | Tests, acceptance criteria, playtests and evidence |
| [J-execution-backlog.md](plan/J-execution-backlog.md) | Ordered task backlog and the ADR practice |

### Plan sources

Research reports the plan draws on. Source material, not the plan.

| File | Topic |
|---|---|
| [05-cognito-auth.md](plan/sources/05-cognito-auth.md) | Cognito user pools and HTTP API JWT authorisers |
| [06-polly-tts.md](plan/sources/06-polly-tts.md) | Polly for UK-English phonics audio, presigned delivery, browser playback |
| [08-aws-data-ops.md](plan/sources/08-aws-data-ops.md) | AWS data, delivery and operations facts |
| [09-learning-design.md](plan/sources/09-learning-design.md) | Learning-content design |
| [10-game-design.md](plan/sources/10-game-design.md) | Game design and simulator evidence |
| [11-voice-engine.md](plan/sources/11-voice-engine.md) | Whether Nova 2 Sonic can replace Polly for phonics clips |

## Decisions

[decisions/](decisions/): architecture decision records (ADRs), one screen each, in the
[J §J.6.2 template](plan/J-execution-backlog.md#j62-template).

## Art

The art is hand-drawn SVG made in this repository, rendered to PNG by [tools/art/](../tools/art/).

| File | What it is |
|---|---|
| [art/STYLE.md](../art/STYLE.md) | The SVG drawing rules every asset follows |
| [art/asset-catalogue.json](art/asset-catalogue.json) | Every asset: id, sizes, frames, paths |
| [art/gallery.html](art/gallery.html) | Browsable gallery of the rendered assets (open locally) |
| [art/chatgpt-asset-prompts.md](art/chatgpt-asset-prompts.md) | **Historical.** The ChatGPT prompt pack, not used: the art was drawn in-repo instead. STYLE.md still builds on its style bible (section 2) |
| [art/single-conversation-sequence.md](art/single-conversation-sequence.md) | **Historical.** Running order for the ChatGPT route, not used |

## Planned folders (to create)

| Folder | For |
|---|---|
| `runbooks/` | Restore, rollback, DNS hand-off and operator procedures |
| `releases/` | One short entry per production release |
| `validation/` | Playtests, performance, acceptance evidence, browser matrix |
