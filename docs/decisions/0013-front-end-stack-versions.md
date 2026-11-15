# 0013. Front-end stack versions
Status: Accepted · Date: 2026-11-15

Context: The plan pins the front-end stack (Vite 8, React 19, TypeScript ~7.0.2, Phaser 4.2.1, Vitest 5) but marked the
combination **[UNVERIFIED]** until tried ([H §H.17](../plan/H-infrastructure-and-delivery.md#h17-version-pins),
[E §E.5.1](../plan/E-architecture.md#e51-workspace-layout-all-to-create)). Phase 1 (M0-08a, M0-08b) builds the workspace and tries it.

Decision: exact versions, no ranges, locked by `web/package-lock.json`:

| Package | Version | Package | Version |
|---|---|---|---|
| Node | 24 (`.nvmrc`; 24.22.3 locally) | `vite` | 8.3.8 |
| `typescript` | 7.0.2 | `@vitejs/plugin-react` | 6.3.0 |
| `react`, `react-dom` | 19.3.1 | `@types/react`, `@types/react-dom` | 19.3.0 |
| `phaser` | 4.2.1 | `vitest` | 5.1.0 |
| `oxlint` | 1.93.0 | `@types/node` | 24.19.2 |

Workspaces `game-core`, `shared`, `player`, `admin` under `web/`; packages import each other by name (`@scd/*`) straight from
TypeScript source, so there is no library build step. Type-checking is `tsc -p` per package (no project references needed yet).
Phaser is imported by name (`import { Game } from "phaser"`) and split into its own chunk (`build.rolldownOptions` with
`output.codeSplitting.groups`, not the deprecated `rollupOptions`/`manualChunks` aliases). Phaser's keyboard plugin is off
(`input: { keyboard: false }`); keys go through the React DOM (E.5.2).

Global font: Unkempt (owner's choice), self-hosted from `@fontsource/unkempt` 5.3.0 (Apache-2.0, Latin subset), never
loaded from Google, so no third-party request and a `font-src 'self'` CSP works.
Reading font: Andika (owner, 2026-11-15) for the letters and words children read in learning activities (single-storey
`a` and `g`, made for early readers), self-hosted the same way; Unkempt stays for titles, buttons and labels. Added in Phase 22.

Alternatives:
- TypeScript 5.x: the plan pins 7; 7.0.2 type-checks all four packages cleanly, so no reason to fall back.
- ESLint instead of oxlint: slower, more config; oxlint covers the import and globals rules needed now.
- Project references with `tsc -b`: adds composite/declaration settings for no gain while packages ship as source.

Consequences:
- Upgrades are deliberate: change `package.json`, run `npm install`, commit the lockfile; CI runs `npm ci`.
- `game-core` purity is enforced twice: oxlint (`no-restricted-imports`, `no-restricted-globals`) and `purity.test.ts`; `tsc` backs both, as `game-core` type-checks with no DOM and no Node types
  (tests alone use `tsconfig.test.json` with Node types).
- Open for Phase 4 (publish, H.8.5 c/d): Vite's hashed bundles and the unhashed art both live under `/assets/`; the
  planned cache rule (`assets/*` immutable, [H §H.8](../plan/H-infrastructure-and-delivery.md#h8-the-manual-release-spine-s111))
  must cover only Vite's hashed bundles (`assets/*-<hash>.js`). The art copied from `public/assets` gets `no-cache`
  (H.8.5 d) until Phase 64 hashes it.

Evidence: local run on 2026-11-15: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test` (3 passed), `npm run build`
(player: index 221 kB + phaser chunk 1.37 MB; admin 220 kB). An `import "phaser"` and a `window` use added to `game-core`
failed both the test and the lint rule, then were reverted. CI: [ci.yml](../../.github/workflows/ci.yml) run 43692712122 on `main` (commit `6ea00e4`): both jobs green.
