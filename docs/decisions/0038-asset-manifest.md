# 0038. The asset manifest: art bound by ID, pinned per run
Status: Proposed · Date: 2026-11-17

Context: Gate M's planets and alien maker need art that is data, not code (ADR-0032; scope-asset-kinds-and-makers.md §3.0,
scope-level-designer.md §3.2). The battlefield loaded every sprite by a hard-coded path (web/player/src/game/assets.ts),
and runs pinned `assetManifestVersion: null` waiting for this. Phase 64 had the manifest; LD8 pulls it forward.

Decision:
- **File.** `game-data/asset-manifest/<v>.json`, create-only like other game data: per catalogue ID (or library ID) its
  frame URLs, anchor and display size; plus **art sets** binding the map's pieces (MAP_ART's 18 roles: backdrop, route
  tiles, portal, pads, colony) to assets, with a required `moon` set. URLs are same-origin only (`/assets/`,
  `/pictures/v1/lib-…`), so the CSP is unchanged. One strict parser per language, both held to
  `contracts/fixtures/asset-manifest/cases.json`.
- **m1 = the repo art**, generated from the code's art tables and checked equal to them; it may never change once
  released. Art that changes shape needs a new version.
- **Pinning.** `current.json` may name `assetManifestVersion` (absent: m1). R8 pins it on new runs; a run saved before
  has null, read as m1. The publisher carries it over when it moves current.json.
- **Drawing.** The scene resolves every sprite through the run's manifest; an entry the code cannot play (a still for
  an animation, or the reverse) is ignored. A file that fails loads the repo file under the same texture key; a
  manifest that fails to load is the repo art. A battle never fails for art [PROPOSAL].
- **Scope.** Battlefield sprites only; HUD pictures stay paths until Phase 66. Which art set a map uses arrives with
  planets (LD10); today every map uses `moon` [PROPOSAL].
- **Pictures.** A library picture a published manifest uses is held for good (R37, fails closed). New picture kind
  Route tile (192 px, edges fixed so pieces join).

Alternatives: art in each planet document (no sharing between planets, no alien art); hitboxes and frame rates in the
manifest (game-core has no hitboxes; one frame rate today), deferred.

Consequences: one more request per run (m1 is 37 KB, 3 KB gzipped; AC-42). Phase 64's manifest task becomes atlas and
performance work on top of this. Gate K precaches the pinned manifest's files.

Evidence: shared manifest.test.ts and api test_asset_manifest.py (same fixtures); player manifestSeed.test.ts (m1 equals
the art tables; every frame exists; every repo asset resolves to the same files) and manifestLoad.test.ts; a local
browser check of the 404 fallback (2026-11-17).
