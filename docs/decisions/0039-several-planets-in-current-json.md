# 0039. Several planets in current.json (schema 2)
Status: Proposed · Date: 2026-11-17

Context: tier 2 planets (ADR-0032; scope-level-designer.md §3.2) need current.json to name more than one released
planet before a second can be released (LD10). Every reader so far (game-core parseCurrent, the Python reader, the
publisher) knew one `campaignVersion`, and the player's parser refuses unknown keys.

Decision:
- **Schema 2.** `{"schema": 2, "rulesetVersion", "assetManifestVersion"?, "planets": [{"planetId", "campaignVersion"}],
  "campaignVersion"}`: planets in unlock order, at most 20, each once; the top-level `campaignVersion` must equal
  planets[0]'s. Schema 1 (no `schema`) stays valid and means one planet, named by its document. Both languages read
  the same fixtures (`contracts/fixtures/current/cases.json`).
- **Expand, then write.** LD9 ships readers of both schemas. Nothing writes schema 2 yet: the repository's file stays
  schema 1, and the publisher writes schema 1 back while every entry is schema 1's. The first writer of schema 2 is
  LD10's planet release [PROPOSAL].
- **Per planet.** The game-data build checks every listed planet and writes a bounds file per pair. The publisher's
  make-live and live publish change only that planet's entry (`NOT_RELEASED` for a planet not listed). A new game uses
  its planet's live version from current.json; GET /api/planets carries each planet's version; R8 refuses a planet
  that is not listed. Unlock stays the server's rule: the next planet once the one before reaches wave 20.
- **Unchanged:** badge IDs were already per planet (`campaign-<planetId>`), endless builds from the run's own planet.

Alternatives: a separate `planets.json` beside current.json (two files moved without one atomic write); dropping
schema 1 at once (a breaking change for every pinned reader).

Consequences:
- **Old clients.** A player page loaded before the LD9 release refuses schema 2 (its parser is strict): starting a
  new game there fails until the page is reloaded. So schema 2 must not be written until LD9 is live and old pages
  have aged out; LD10 holds that line. The top-level campaignVersion keeps any reader that only knows schema 1's keys
  and ignores the rest pointed at the first planet. Removing it is the "contract" step, after LD10.
- **R30 demand** grows with each planet: every released planet's wave sets must be fillable from the question bank.
- The level designer's drafts still belong to luna-1; LD10 gives a draft its planet.

Evidence: game-core game-data.test.ts (fixtures, two-planet build), api test_current.py (fixtures, write-back,
two-planet listing, an unlisted planet refused), test_gd_publish.py (per-planet make-live and publish), player
run.test.ts and Home.test.tsx (planet choice).
