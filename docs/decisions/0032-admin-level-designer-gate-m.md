# 0032. An admin level and planet designer, built as Gate M after J
Status: Proposed · Date: 2026-11-16

Context: The owner asked for "a complete level designer … so I can create new maps etc entirely from my admin portal". The plan
limits v1 to "content administration only" (B §B1.2), with one playable planet (prompt.md:115) and new planets as later scope
(prompt.md:141-143). Today every map, wave and wave set is a repo file that ships only with a release. The scope is in
[scope-level-designer.md](../plan/scope-level-designer.md), built on
[scope-asset-kinds-and-makers.md](../plan/scope-asset-kinds-and-makers.md). The owner accepted every recommendation in its
section 7 ("go with the recommendations") **[CONFIRMED by owner, 2026-11-16]**.

Decision:
- **Scope change.** v1 gains an operator-only level designer, never child-facing: levels on planet 1 (tier 1) **and new planets**
  with their own art, tile sets, campaign, unlock and a planet choice on Home (tier 2). The owner moved tier 2 before launch the
  same day ("I'd like to be able to design multiple planets also") **[CONFIRMED by owner, 2026-11-16]**. Tier 3 (flexible routes,
  entry and colony on any edge, a real-graphics test-play window, difficulty-curve tools) is in too: the owner wants every tier
  fully built before the game is playable **[CONFIRMED by owner, 2026-11-16]**.
- **Placement.** It is a new **Gate M**, after J and before L: tier 1 (LD0-LD7, about 8 phases), tier 2 (LD8-LD10, about 3,
  including the asset manifest and a Route tile picture kind), tier 3 (LD11-LD13, about 3) and the alien maker (1-2 phases),
  about 16 in all. Launch (Gate L) waits for all of it.
- **Shape.** The schema allows several maps per planet, and challenge-only waves go in `challengeWaves` with string IDs (a C13
  amendment). The art lives in the planet document for tier 1 and moves to the asset manifest in tier 2. Route length is a hard band of 30-50 cells, with a warning outside
  36-44. Pads are canonicalised by route progress on new maps.
- **Waves at design time.** Keyframes with fill-in and a seeded Vary button, both in tier 1; published waves are fixed, with no
  randomness per play (prompt.md:409 holds). **Planet versions:** named drafts are built and tester-previewed beside the live
  version; Make live switches one planet; older versions stay for pinned runs and rollback **[CONFIRMED by owner, 2026-11-16]**.
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
- **More planets, more work per planet.** Each released planet needs a 50-wave campaign that passes the checks, more questions in
  the bank (R30 demand grows per planet), and coverage in Gate L's playtests, accessibility pass and acceptance evidence. Gate K's
  offline precache grows with each planet's art.
- **Amends** prompt.md:141-143 (new planets were later scope) by owner decision.
- **Not covered.** New alien behaviours, bosses, powers and campaign shapes still need code.

Evidence: scope-level-designer.md (read-only scoping workflow, 2026-11-16: four readers, two designs, judge, fact-check and critic
passes); owner's reply in chat, 2026-11-16.
