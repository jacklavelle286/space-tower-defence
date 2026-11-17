# 0041. Aliens made in the portal: the publisher writes rulesets and asset manifests
Status: Proposed · Date: 2026-11-17

Context: AM1 (scope-asset-kinds-and-makers.md §3.2) lets the operator make a plain alien that waves can use. An alien
is a ruleset entry (`aliens.<id>`, which waves name) and art (frames in the asset manifest, LD8). ADR-0037 kept
rulesets release-only: the publisher could write `campaign/` and `bounds/` but never `ruleset/`. The owner chose the
portal route over exporting a file for a release (chat, 2026-11-17).

Decision:
- **Drafts.** A made alien is an `ALIEN` item in the content table: ID, name, hp, speed, leak, bounty (inside
  limits.json `alienMaker`, the plain aliens' range in r4), and six approved Alien pictures, its walk. No traits
  (mechanics 1 stats only, scope §3.2). Editable until published; a published alien is fixed.
- **Frames from one drawing.** The portal draws one frame (Alien kind) and makes the walk with the shared animator
  (AM0, owner verdict "good enough with the fixes", 2026-11-17): body lean and squash, antennae, face, and now legs
  (`leg-front`/`leg-back`), with the drawing shrunk about its base when a pose would leave the canvas (measured row
  by row). The browser renders the six PNGs; frame 1 is saved as the drawing, frames 2-6 as uploads, all approved
  with the Alien checklist.
- **Publish alien** (publisher `publishAlien`, asynchronous like a level publish): a new ruleset `<base>-a<n>`
  (`r4-a1`; base = the live ruleset's release version) = the live ruleset plus the alien; a new asset manifest `m<n>`
  = the live manifest plus `alien-<id>-walk`; bounds for the new ruleset and every playable planet version (each
  released planet's live version, each unreleased planet's newest, every version with a preview or published wave
  set); then current.json moves `rulesetVersion` and `assetManifestVersion` together (If-Match). Files are
  create-only; the publisher role may now write `ruleset/*` and `asset-manifest/*`.
- **Missing bounds are built on demand**: Make live and Release build the bounds for the live ruleset when a version
  has none (a version published while an alien publish was running).
- **Saved runs keep their ruleset and manifest** (both pinned per run); a made alien only reaches new games.
- The player draws a made alien through the manifest (`alien-<id>-walk`), and as a Moon Blob if that fails.

Alternatives: export the alien as a file and release it (release-only rulesets, ADR-0037 unchanged; rejected by the
owner); one drawing call per frame (cost and consistency; AM0); stats in the manifest (waves could not name it).

Consequences:
- A ruleset file per made alien, and the bounds of every playable version rebuilt each time (one check call each).
- **A repository ruleset after made aliens** (a release with a new `r5`) must carry them over, or waves naming them
  stop parsing: a release that changes the ruleset needs a merge step first [UNVERIFIED need; settle before any r5].
- Testers' preview runs of a version published during an alien publish can be refused until its bounds exist (Make
  live builds them) [ASSUMPTION: rare].
- The admin editor checks levels against the live ruleset from R46, no longer the build's copy.

Evidence: api test_alien_admin.py (R57-R61), test_gd_publish.py (publishAlien, bounds on demand); game-data-check
`rebuild`; shared animator tests (legs, fit); admin AliensPage tests; player assets tests (made alien art).
