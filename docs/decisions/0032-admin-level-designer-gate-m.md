# 0032. An admin level designer, built as Gate M after J
Status: Proposed · Date: 2026-11-16

Context: The owner asked for "a complete level designer … so I can create new maps etc entirely from my admin portal". The plan
limits v1 to "content administration only" (B §B1.2), with one playable planet (prompt.md:115) and new planets as later scope
(prompt.md:141-143). Today every map, wave and wave set is a repo file that ships only with a release. The scope is in
[scope-level-designer.md](../plan/scope-level-designer.md), built on
[scope-asset-kinds-and-makers.md](../plan/scope-asset-kinds-and-makers.md). The owner accepted every recommendation in its
section 7 ("go with the recommendations") **[CONFIRMED by owner, 2026-11-16]**.

Decision:
- **Scope change.** v1 gains an operator-only level designer for planet 1 (tier 1), never child-facing. New planets (tier 2) come
  after launch. Flexible routes and real-renderer test play (tier 3) are decided after tier 1.
- **Placement.** It is a new **Gate M**, after J and before L, about 8 phases (LD0-LD7), plus the alien maker (1-2 phases) from the
  makers scope.
- **Shape.** The schema allows several maps per planet, and challenge-only waves go in `challengeWaves` with string IDs (a C13
  amendment). The art lives in the planet document for tier 1. Route length is a hard band of 30-50 cells, with a warning outside
  36-44. Pads are canonicalised by route progress on new maps.
- **Delivery.** Download and upload of a level file comes first (LD3). Runtime publish follows in LD6, with per-level drafts owning
  their sections, a stale-source refusal, and retire or invalid per (version, wave set).
- **Checks.** Two bot results block publish from the start: the minimal bot clears waves 1-5, and the competent bot at 0% learning
  clears the set (the C targets). Every other check warns until the LD0 spike proves the bots. A `preview` state is playable only
  by tester profiles.
- **Costs and art.** Backgrounds get a monthly drawing sub-cap, with spend shown per level. The Background kind stays at 1920x1056
  until the owner judges it on the laptop. Tier 3 route tiles are drawn, not mirrored. Tier 3 preview opens in a new tab. Tier 2
  keeps one global ruleset.

Alternatives: keep levels as repo files (no designer); a pull-request exporter only (scope-asset-kinds-and-makers.md §4, Design B);
build the designer before E and J (schemas still changing).

Consequences:
- **Release before LD6.** Before the first runtime publish, a release must stop overwriting `current.json`
  (scripts/publish_static.py) or it would silently revert admin publishes.
- **Freeze.** Admin game data bypasses git review and G-8. The freeze, G-8/G-9, rollback and backup in Gate L must cover it.
- **Amendments by reference.** B §B1.2 and §B2.2 (scope), C13 (challenge waves) and spine S5.1 (game data only from the
  release). Tier 1 also needs a new ADR for the publisher's IAM and current.json ownership, written in LD6.
- **Not covered.** New alien behaviours, bosses, powers and campaign shapes still need code.

Evidence: scope-level-designer.md (read-only scoping workflow, 2026-11-16: four readers, two designs, judge, fact-check and critic
passes); owner's reply in chat, 2026-11-16.
