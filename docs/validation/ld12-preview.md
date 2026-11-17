# LD12: the battle preview (Gate M)

Phase LD12 ([build-phases.md](../build-phases.md#phase-ld12--real-renderer-preview);
[scope-level-designer.md §4 option C](../plan/scope-level-designer.md#4-test-play-options)). Date: 2026-11-17.

**What it is.** Levels → a level → Test tab → **See it in the game**: choose a wave set, a starting wave and 1x, 2x or
4x, then **Watch wave N** (the competent test player's towers for that wave, Ready pressed by itself, the learning
skipped) or **Play it yourself** (from the same credits and towers, with the learning placeholder between waves). It
opens the real battlefield in a new tab on the admin site, `/preview/battle-preview.html`, and hands it the editor's
level (saved or not, merged into the live planet) and the live ruleset over a same-origin BroadcastChannel.

**How it is built.** A second build entry of web/player (`vite.preview.config.ts`), run by the admin build into the
admin's `dist/preview/`; the battle art (common, luna-1, ui: about 34 MB) is copied to the admin's root `assets/` so
every art path stays as the game has it. The release sorts the preview's files (`scripts/release_manifest.py`): its
page no-cache, its bundles immutable, the art as public copies. Phaser stays in web/player; the admin's own bundle
still never imports it.

| Check | Result |
|---|---|
| A draft plays with no API call | Chrome, the built admin site served locally: watch from wave 12 at 4x and play from wave 1, about 1,030 requests each, every one a GET of a same-origin file or a Phaser `blob:` texture; none to `/api/` or `/game-data/`; no page errors. [ld12/watch-wave-12.png](ld12/watch-wave-12.png) |
| AC-04 (a preview never creates a run, bounds or reward) | The preview code imports nothing that talks to the server (`web/player/src/preview/start.test.ts`); it plays on a LocalRun |
| The release manifest allows the entry | `scripts/tests/test_release_manifest.py`: the preview's files are classified, anything else under `preview/` stops the build; the real admin build classifies |
| Jump to wave | `previewStart` plays the test player up to the wave (game-core `playUpTo`), tests in web/player and game-core |

Limits [ASSUMPTION]: in watch mode the test player's moves during a wave are not replayed (its towers are built at the
start of the wave); a made alien (AM1) is drawn as a Moon Blob, as the preview uses the repo art, not the live asset
manifest.
