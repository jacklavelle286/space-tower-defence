# 0040. Planets made in the portal, and planet release
Status: Proposed · Date: 2026-11-17

Context: tier 2 (ADR-0032; scope-level-designer.md §3.2) lets the operator add a planet, build its campaign and
release it from the portal. ADR-0039 gave current.json a list of released planets; LD10 needs somewhere for a planet
to live before it is released, a way to build its first version, and the release itself.

Decision:
- **Registry.** Unreleased planets are `PLANET` items in the content table: name, icon (an approved Planet picture),
  art set, default backdrop (an approved Background), newest version. luna-1 has none: it came from the repository.
- **Levels belong to a planet** (the LEVEL header's `planetId`; absent is luna-1). A planet's **head** is what its
  levels are merged into and published from: its live version once released, else its newest version, else
  `<planetId>-new`, an empty starting document. A new planet's first version must come from a level that owns the
  50-wave campaign (a planet document needs at least one wave) [PROPOSAL].
- **Look in the planet document.** Schema 2 documents may carry `look: {icon, artSet}`, pinned per run with the rest
  of the document, instead of in the asset manifest the scope first named [PROPOSAL: the same reason map art lives in
  the document (scope §3.1); the manifest keeps the art sets themselves].
- **Previews until release.** An unreleased planet's versions are previews: its testers see its newest preview on Home
  and may play it; R8 refuses everyone else.
- **Release** (R56, publisher `releasePlanet`) checks the newest version has the full 50-wave campaign, bounds for the
  current ruleset and a question bank that fills its wave sets; publishes its previews; and appends it to current.json,
  naming schema 1's entry, so this is the first schema 2 write (ADR-0039). Order is the order of release: append-only,
  no reorder or removal route. A released planet's registry entry is fixed.

Alternatives: one planet-wide draft per planet (no levels); release by editing current.json in a release (not portal
only, which ADR-0032 asked for); the look in the asset manifest (a manifest version per icon change).

Consequences:
- The first planet release makes current.json schema 2: player pages loaded before the LD9 release must have been
  reloaded by then (ADR-0039).
- Each released planet adds R30 demand, playtesting, accessibility and acceptance work in Gate L (ADR-0032).
- Badge IDs need nothing new (`campaign-<planetId>`); a new planet's badge uses the Moon's trophy art until it has its
  own (Phase 66).
- Two publishes onto one unreleased planet at once both succeed; the later one becomes its newest [ASSUMPTION: rare].

Evidence: api test_gd_publish.py (new planet from `-new`, NEEDS_CAMPAIGN, release appends, NOT_READY),
test_planet_admin.py (R53-R56, a level's planet, R46 ?planet=), test_current.py (tester preview of an unreleased
planet); admin PlanetsPage, LevelListPage, levelFile and PublishTab tests; game-core parses `look`.
