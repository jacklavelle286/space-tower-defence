# Scope: the level designer (admin portal)

Status: **accepted by the owner, 2026-11-16** ("go with the recommendations"): every recommendation in section 7 is
**[CONFIRMED by owner, 2026-11-16]**; recorded in [ADR-0032](../decisions/0032-admin-level-designer-gate-m.md) (Proposed until
its gate). **Changed the same day:** the owner wants multiple planets designable and every tier fully built before the game is
playable, so tiers 2 and 3 join tier 1 in Gate M (decision 1 below) **[CONFIRMED by owner, 2026-11-16]**. Date: 2026-11-16.
Builds on [scope-asset-kinds-and-makers.md §3](scope-asset-kinds-and-makers.md#3-part-2-makers) (Gate M, Design A runtime
publish) and replaces its §3.1 "Map / level maker" with a fuller design. Paths are relative to the repo root. Labels follow
CLAUDE.md. A `file:line` cited without a fresh check comes from the read-only findings and fact-check passes of 2026-11-16.
Line numbers marked "working tree" point at uncommitted files (P2 and Background work in progress) and may move.

## 1. Summary

**What "complete" means here.** From the admin portal, with no code release, you can design a map (route, pads, backdrop,
decorations), write its waves, build the campaign and challenge wave sets, test them, try them with a real child, publish,
roll back and retire. The designer works only with behaviours the game already has. New alien behaviours, bosses, powers and
campaign shapes (50 waves, meteors after 9/19/29/39/49) still need code [CONFIRMED prompt.md:119,439; VERIFIED
game-data.ts:33-35].

**Recommended path, in tiers** [PROPOSAL]:

| Tier | What it gives | Phases | Where |
|---|---|---|---|
| 1 | Complete levels on planet 1: several maps (campaign map plus challenge maps), pads, waves, wave sets, backdrop and decorations, headless test play, tester preview, publish, rollback | 8 | Gate M, after J and before L |
| 2 | New planets: planet art, tile sets, own campaign, unlocks, a planet choice on Home | 3 | Gate M, after tier 1 (owner moved it before launch, 2026-11-16; amends prompt.md:141-143) |
| 3 | Flexible routes (turns in any direction, portal and colony on any edge), real-renderer test play window, difficulty-curve tools | 3 | Gate M, after tier 2 (owner: every tier built before the game is playable, 2026-11-16) |

Tier 1 alone is about **8 phases**. All three tiers come to about 14. The alien maker (scope doc §3.2) adds 1-2. So Gate M with
tier 1 plus the alien maker is about 10, close to the 8-10 in the earlier answer. With every tier it is about 16.

**What you will be able to do (tier 1).** Open Admin → Levels. Copy Moonbeam's map or start from a template. Draw a route by
clicking cells, drop 12-16 pads on the cells the coverage overlay lights up, pick a Background picture you drew with Claude, and
place a few rocks. Build a challenge such as "Blob Rush" on that map, using campaign waves or new challenge-only waves. Press
Run checks to see, per wave, whether each test player wins at 0%, 60% and 100% learning success, how much health the colony
keeps, and the peak alien count. Fix anything the problems panel lists. Mark it **Preview** so a tester profile can play it.
Press Publish, and new games use it within about a minute. Runs already started keep their version. Make live on an older
version rolls back.

Note: today luna-1-c1 holds the Moonbeam map but only 2 waves and one wave set, `first-contact` (CHALLENGE, waves [1,2]); it
has no `campaign` set [VERIFIED game-data/campaign/luna-1-c1.json]. "Copy Moonbeam" copies the map. Wave templates stay hollow
until Phase 50 writes the 50 campaign waves.

## 2. What the game assumes today

"Change?" says which tier must change it. "-" means keep it.

| Assumption | Where | T1 | T2 | T3 |
|---|---|---|---|---|
| One `map` per planet document; every wave set shares it | game-data.ts:148-160,564 [VERIFIED] | Yes (`maps{}`) | - | - |
| `current.json` names one campaignVersion, so one planet | game-data.ts:162-165,296-302; api/shared/game_data.py:157-187 [VERIFIED] | - | Yes (list) | - |
| Client sends `current.campaignVersion` whatever planet is chosen | web/player/src/run/newGame.ts:65-70 [VERIFIED] | - | Yes | - |
| Home picks the first unlocked planet | web/player/src/shell/Home.tsx:22-29 [VERIFIED] | - | Yes | - |
| Authored wave numbers 1..50 only | game-data.ts:615 [VERIFIED] | Yes (`challengeWaves`, string ids) | - | - |
| `finalWave` and bounds `maxBounty` count by position in the set, not wave number | game-data.ts:177-178,488,669,679; sim/config.ts:81 [VERIFIED] | - | - | - |
| Campaign = 50 waves, meteors 9/19/29/39/49, id `campaign` | game-data.ts:33-35,507-514 [VERIFIED] | - | - | - (spec) |
| Grid parsed as 1-100, but the renderer is fixed 20x11, 96 px, 1920x1056 | game-data.ts:566-567; layout.ts:6-8 [VERIFIED] | Parser: exactly 20x11 | - | - |
| Route art: straights right/up/down; corners right-down, down-right, right-up, up-right; others throw | layout.ts:28-34,64,68 [VERIFIED] | Parser refuses the rest | - | Yes (draw tiles) |
| Portal cap and colony cap always "enter left, exit right" | layout.ts:60,70 [VERIFIED] | Parser rule | - | Yes |
| Portal drawn half a tile left of route[0]; colony offsets fixed for the last column | BattleScene.ts:26-30,94,99-101 [VERIFIED] | Parser rule | - | Yes |
| Leak puff fixed offset | BattleScene.ts:258-259 [VERIFIED] | - | - | Yes |
| One fixed backdrop `luna-backdrop.webp` | assets.ts:19,41 [VERIFIED] | Yes | Yes (per planet) | - |
| Decorations exist only as SVG/PNG (`deco-rock-1..3` etc.) and in asset-catalogue.json; not in the ART table, never placed | web/player/src/game/assets.ts:40-84 (no `deco` anywhere in web/player/src) [VERIFIED] | Yes (new ART entries) | - | - |
| Static preload list | BattleScene.ts:73; assets.ts:87-93 [VERIFIED] | Add doc pictures | Manifest-driven | - |
| Pad array order = attack order | config.ts:77; battle.ts:129-134 [VERIFIED] | Canonicalise for new maps | - | - |
| Pads open once per run, not in stages | config.ts:170-171 [VERIFIED] | - (Gate F/J) | - | - |
| No parser check for pad on route, crossing, pad distance, start/end edge | game-data.ts:572-597 [VERIFIED] | Yes | - | - |
| Parsers stop at the first error, as a string | game-data.ts:200-213 [VERIFIED] | Collect-all checker | - | - |
| Map drawing logic lives in the player app | web/player/src/game/layout.ts:11-13 (`tileToPx`), 47-71 (`routeTiles`) [VERIFIED] | Move to `@scd/shared/map` | - | - |
| Admin has no game-core dependency; no Phaser allowed | web/admin/package.json; no-phaser.test.ts [VERIFIED] | Add game-core | - | Keep no-Phaser |
| Python simulator's Competent bot is Moonbeam-only | tools/sim/sim.py:957-962; selftest.py:86 [VERIFIED] | TS bots in game-core | - | - |
| No Lambda can write `game-data/`; release always overwrites current.json | main.tf:218-222,278-283; publish_static.py:249 [VERIFIED] | Publisher + ownership | - | - |
| create-run accepts any loadable (ruleset, campaign) pair | player_api/handler.py:466-489 [VERIFIED] | Allow-list per wave set | - | - |
| Background and Decoration picture kinds exist, consumer `later` | contracts/limits.json:72,78-80 [VERIFIED working tree] | Consumer `level` | - | - |
| One route only; axis-aligned segments; integer tiles | route.ts:27-33,53-55 [VERIFIED]; prompt.md:115,281,301,403,405 [CONFIRMED] | - | - | - (rejected) |

## 3. The designer, tier by tier

### 3.1 Tier 1: complete levels on planet 1

**What you can do**
- Several maps in the planet-1 document: the campaign map plus up to 4 challenge maps. New maps are mostly challenge maps, so
  you are not forced to re-tune all 50 campaign waves every time you try a new route.
- Replace the campaign map too (a new campaign version), with a full balance re-check.
- Write all 50 campaign waves, and challenge-only waves with their own string ids (not wave numbers, see below).
- Build wave sets: the fixed-shape campaign plus any number of challenges (credits, classes, pads open, presets).
- Pick a Background picture per map and place decorations.
- Headless test play with the C17.1 test players; a **Preview** state that only tester profiles can play.
- Publish, make an older version live (rollback), retire or mark invalid one wave set, import and export level files.

**Admin UX walkthrough** (laptop width ≥1280 px; a phone gets a read-only list; tablets are out of scope [CONFIRMED
prompt.md:145])
1. Admin → **Levels** (new nav section, routes.ts:63-68 pattern). The page lists maps and wave sets for luna-1, with the live
   version starred, draft status and this month's drawing spend per level.
2. **New map** → template (Copy Moonbeam map, U-bends, Zigzag, Long snake, Blank) → name → **Create**. This opens
   `#/level/<id>/map`. **Upload level file** creates a draft from an exported file, with the same checks.
3. **Map tab.** The canvas is the 20x11 grid over the backdrop. Toolbar: Route | Pads | Decorations | Backdrop | Overlays.
   - Route: click a left-edge cell (portal), then turn points. Each click snaps straight. Cells that would break a rule go grey
     with the reason, for example "Turns left: no tile art yet". Click a right-edge cell to finish at the colony.
   - Keyboard: arrows move a cursor, Enter places, Backspace removes the last point, Esc ends. No dragging needed anywhere
     [PROPOSAL; prompt.md:271 only says children's UI may support dragging but cannot require it].
   - Status strip: "Route 38 tiles (Moonbeam 40), 7 turns, 9 of 16 waypoints, 0 problems".
4. **Pads.** Turn on **Coverage**: each empty cell glows by how much route a pad there would reach. Click 12-16 cells. Set
   "Opens after wave" (0/5/10/15/20/25) in the side panel. Pads are numbered in route order, which is also the attack order and
   the Tab order.
5. **Backdrop.** Keep "Moonbeam ground" or pick an approved Background picture. **Decorations**: choose a rock or an approved
   Decoration picture (drawn at one 96 px tile), click cells.
6. **Problems panel** (right) updates on every edit. Click a problem to jump to its cell.
7. **Save** (Ctrl+S). Unsaved edits survive a reload, as in the activity editor (unsaved.ts:1-48, sessionStorage, no autosave).
   One undo/redo history covers map, waves and sets (Ctrl+Z / Ctrl+Shift+Z). Opening the same level in a second tab warns
   (BroadcastChannel). On DRAFT_CONFLICT a per-section diff offers "reload theirs" or "keep mine".
8. **Waves tab.** 50 campaign rows plus challenge waves (named, for example `blob-burst`). Group chips {alien, count, at,
   gap}, hpMult, speedMult. Helpers: copy wave, scale counts by x% over a range, "introduce alien X" (small solo group). Derived
   columns: total aliens, total HP, estimated duration, peak live aliens.
9. **Wave sets tab.** The Campaign card has a fixed shape. **Add challenge**: name, map, 2-8 waves, credits, classes, pads open
   as for wave N, presets placed on a mini map. Sliders use friendly ranges from limits.json, not the parser's (startCredits
   0-100000 today, game-data.ts:549-550). Badge: "no badge" in v1 (see §5).
10. **Test tab.** **Run checks** in a Web Worker. A table shows each wave and test player in green, amber or red, with a
    verdict such as "Minimal player clears 1-5: yes. Competent at 0% learning clears all. Plays itself: no. Peak 44/48."
11. **Preview.** **Send to testers** builds a `preview` version that never enters current.json; only profiles you mark as
    testers see it on Home. You watch a real child before publishing.
12. **Publish tab.** Diff against live ("new map Zigzag; new wave set Blob Rush"). Auto-ticks come from server validate. You
    tick by hand: route reads clearly, backdrop has no painted path, nothing looks like an alien, pad or path, warnings read.
    **Publish** → "luna-1-a4 is live for new games in about 1 minute".
13. Versions list: **Make live** (rollback), and per wave set **Retire** (no new runs; old runs resume) and **Mark invalid**
    (resume ends gracefully, never counted as a loss [CONFIRMED prompt.md:556]). One broken challenge never ends campaign runs.
14. **Delete:** only drafts never published. Published levels can only be retired. A map cannot be deleted while a wave set
    uses it.

**Data model: planet document schema 2** [PROPOSAL]. The parser keeps reading schema 1 (an absent `schema` means 1, and `map`
reads as the campaign map), so luna-1-c1 and every pinned run still load.

```json
{
  "kind": "campaign", "schema": 2, "version": "luna-1-a4", "planetId": "luna-1", "name": "Moonbeam",
  "maps": {
    "moonbeam-loop": {
      "name": "Moonbeam Loop", "grid": {"cols": 20, "rows": 11},
      "route": [[0,2],[4,2],[4,8],[8,8],[8,3],[12,3],[12,8],[16,8],[16,3],[19,3]],
      "pads": [{"id": "p01", "x": 6, "y": 3, "opensAfterWave": 0}],
      "art": {"backdrop": null, "decorations": [{"art": "deco-rock-1", "x": 1, "y": 9}]}
    },
    "zigzag": {"name": "Zigzag", "...": "same shape; art.backdrop: \"lib-<32hex>\""}
  },
  "waves": [
    {"wave": 1, "groups": [{"type": "blob", "count": 6, "at": 0, "gap": 1.5}], "hpMult": 1, "speedMult": 1}
  ],
  "challengeWaves": {
    "blob-burst": {"groups": [{"type": "blob", "count": 12, "at": 0, "gap": 0.8}], "hpMult": 1.2, "speedMult": 1}
  },
  "waveSets": {
    "campaign":  {"mode": "CAMPAIGN",  "mapId": "moonbeam-loop", "waves": [1, "...", 50], "meteorAfter": [9,19,29,39,49], "...": "as today"},
    "blob-rush": {"mode": "CHALLENGE", "mapId": "zigzag", "waves": [3, "blob-burst"], "badge": null, "...": "as today"}
  }
}
```

Rules: pad ids unique across the whole document (so the bounds `pads.<id>` map stays flat); challenge wave ids are strings,
used only in CHALLENGE sets, so no authored wave takes a number ≥51, which C11.1 gives to endless waves (a pure function of
the number) and which badges and summaries read [VERIFIED C-game-and-learning-design.md:762-764]. This needs a C13 amendment:
challenge `waves[]` may then hold campaign wave numbers or challenge wave ids, not only campaign references
[VERIFIED C:876]. `backdrop` null means the repo Moonbeam ground; decoration `art` is a repo deco id (`deco-rock-1..3` and the
other catalogued decorations) or an approved `lib-` Decoration picture; at most 24 decorations; at most 4 maps. Bounds are
already per position in the set, so a 2-wave challenge `[3, "blob-burst"]` has `finalWave` 2 and `maxBounty[0..1]`.

**Why art goes in the planet document, not the asset manifest** [PROPOSAL]. The campaign version is already pinned per run, so
the art is pinned for free. Tier 1 then does not wait for the §3.0 asset manifest. The manifest stays the dependency of the
alien maker and tier 2 (tile sets, planet icons). Gate K (offline) reads `map.art` from the pinned planet document to precache
map pictures.

**Admin drafts** (content table; audit rows built with `audit_item`, api/shared/content.py:917, written in one
`DynamoTable.transact_write`, api/shared/data.py:271, as for activities):

```
pk LEVEL            sk <levelId>          {name, status, createdAt, owns: {maps:[], challengeWaves:[], waveSets:[]}}
pk LEVEL#<levelId>  sk DRAFT              {doc, draftRevision, review:{testPlayedDraftRevision, ticks}, sourceVersion}
pk LEVEL#<levelId>  sk V#<ts>             {campaignVersion, sha256, by}                                    (immutable)
pk GDCOUNTER        sk campaign#luna-1    {next}                       (a<n> allocator, conditional increment)
pk GDPUBLISH        sk <ts>               {campaignVersion, prev, diffSummary, by}
```

**Publish unit** [PROPOSAL]. The published unit is the whole luna-1 document, so two level drafts must not overwrite each
other. Each level **owns** named sections (its maps, challenge waves and wave sets; the campaign level owns `campaign` and
waves 1-50). Publish merges only the owned sections onto the live document and is refused (STALE_SOURCE) when the draft's
`sourceVersion` is not the live version. **Update from live** rebases the draft: it takes every section it does not own from
live. Two levels cannot own the same section id.

Draft byte cap: 64 KB, the same as the existing admin activity draft body cap (contracts/limits.json:6 `adminActivityDraft`
65536); 8 KB is the cap on a published activity definition (content.py:108), not on drafts [ASSUMPTION that 64 KB fits 50
waves; measure when Phase 50 lands]. Bounds files gain `waveSets.<id>.pads: [ids]` so player-api refuses a pad from another
map.

**Game-core, renderer and simulator changes**
- game-core: new collect-all `planetProblems(doc, ruleset) -> {field, rule, severity}[]`. `parsePlanet` becomes "throw if any
  hard problem", so the player behaves as before. New pure modules: `map/rules.ts`, `map/coverage.ts` (route length in range,
  integer units), `map/order.ts` (pad order by route progress, D5.2 arrow neighbours), `bot/` (the C17.1 policies: none,
  presets-only, minimal, naive, competent, each with a learning-success rate). Bots use only the wave set's classes.
  `compileBattleConfig` picks the wave set's map (config.ts:170-180). `buildBounds` emits per-set pads.
- Shared: move `tileToPx`, `routeTiles` and the map part of the ART table from web/player/src/game/layout.ts and assets.ts to
  `@scd/shared/map`, art ids as strings, and **add** ART entries for the catalogued decorations (none exist today). Same
  precedent as `@scd/shared/learning`. Editor and game then draw from one source.
- Player: backdrop from `map.art.backdrop` via same-origin `/pictures/v1/`, falling back to luna-backdrop.webp; decorations at
  depth 10 + y/1000, skipped if they fail to load; add the document's pictures to the preload list. Moonbeam must render
  pixel-identical (Playwright screenshot). Tester profiles see `preview` versions on Home.
- The player release with the schema-2 parser must ship **before** any published data uses schema 2, because unknown keys are
  refused (game-data.ts:215-224).
- Simulator (tools/sim): unchanged. It stays the authority for repo files; the TS bots judge admin levels.

**Admin-api, publisher and infra changes**
- admin-api: LEVEL routes (list, create, get, `PUT draft` with DRAFT_CONFLICT, import, validate, testplay record, preview,
  delete, versions, publish, make-live, retire, invalid) in ROUTES and contracts/routes.json. Validate calls the publisher in
  dry-run mode so the JavaScript rules exist once. Extend `picture_users` (api/shared/pictures.py:347-371, working tree; it
  scans only the activity partition today) to level drafts, versions and published documents. Background and Decoration kinds
  get `consumer: "level"` in limits.json.
- Publisher: the scope doc §3.0 Node 24 Lambda, narrowed. Steps: freeze switch → load draft at its revision → STALE_SOURCE
  check and merge of owned sections → parse and `planetProblems` → pictures approved and of the right kind (`background` for
  backdrops, `decoration` for decorations) → bots → R30 bank readiness → `buildBounds` → backdrop converted to WebP under a
  byte cap → create-only `campaign/luna-1-a<n>.json` and `bounds/r1__luna-1-a<n>.json` → current.json with If-Match → V#,
  GDPUBLISH and AUDIT rows in one transaction. A retry with the same revision is a replay. It also writes `versions.json`:
  states per (version, wave-set id) — `preview`, `published`, `retired`, `invalid` — plus the tester list, which player-api
  create-run and resume read.
- Release: publish_static.py writes current.json only if absent or with a reseed flag; `artefacts_from` rollback must not
  overwrite it either.
- Infra: publisher role (PutObject on `game-data/{campaign,bounds}/*`, `current.json`, `versions.json`; content-table
  read/write; SSM read of the freeze flag); site bucket Deny on `game-data/*` writes except publisher and CI roles (there is
  no write-deny today, modules/static_site/main.tf:66-100); low throttle on publish and make-live; Lambda timeout set from the
  LD0 run-time measurement.
- One ADR, Proposed in the publisher commit, amending spine S5.1, D-T10, ADR-0010, G-8 and C13.

**AI drawing cost** [ASSUMPTION estimates]. The monthly picture cap is 150, sized for about GBP 47
(infrastructure/main/variables.tf:177-181). A Background allows maxTokens 32000 (limits.json:78-80, working tree) yet counts
as 1, like a 256 px picture. Estimate 4-10 drawings per map (backdrop retries plus decorations): five maps is 20-50, or 13-33%
of a month's cap. So: show drawing spend per level, count a Background as several cap units or give it a sub-cap, and offer
reuse of approved backdrops first.

**Phases (tier 1)**

| Phase | Builds | Checks | Size |
|---|---|---|---|
| LD0 Spikes | TS C17.1 bots vs Python Competent on Moonbeam; admin build with game-core (bundle size); check run time | Waves reached within an agreed tolerance; gzip delta recorded; no-phaser test; full check run time measured (policies × 3 learning rates × 20 naive seeds × 50 waves [UNVERIFIED]) sets the Worker budget and Lambda timeout | S |
| LD1 Rules + shared map | `planetProblems`, hard parser rules, coverage/order modules, `@scd/shared/map` with decoration ART entries | luna-1-c1 passes; one known-bad fixture per rule; property test: any doc with no hard problems runs through `routeTiles` and builds bounds; layout tests moved; sim-agreement green | M |
| LD2 Schema 2 + player art | `maps{}`, `mapId`, `challengeWaves`, `map.art`, per-set pads in bounds, Python passthrough, backdrop and deco rendering with skip-on-fail | v1 and v2 parse; old runs replay identically; bounds contract tests; publisher bounds byte-identical to build-bounds.ts (scope doc §3.6); Moonbeam pixel-identical | L |
| LD3 Map editor | Levels routes and pages, SVG canvas, route/pad/deco/backdrop tools, keyboard cursor, shared undo, live problems, LEVEL draft lifecycle, delete rules, conflict screen, **Download** and **Upload level file** | Reducer and undo tests; keyboard-only Playwright run; pytest on moto; routes contract; ddblocal race | L |
| LD4 Waves + wave sets | Wave table and helpers, challenge waves, wave-set and challenge editor, friendly ranges, mini-map presets, impact warnings | Model tests; TS/Python contract fixtures; G-15 errors land on cells | L |
| LD5 Test play | Worker runner, C17.1 bots at 0/60/100% learning, presets-only board, results table, `testPlayedDraftRevision` | Same revision gives the same table twice; known-bad levels (unwinnable, plays itself, too long) each raise their rule; time budget from LD0 | M |
| LD6 Publisher | Lambda, IAM, bucket Deny, counter, section merge, current.json ownership, versions.json per wave set, create-run allow-list, freeze flag, WebP conversion, ADR | terraform fmt/validate/plan (read-only); moto and ddblocal tests; player-api retire/invalid/resume tests per wave set; stale-source refusal test | L |
| LD7 Publish UX + preview | Diff, checklist, tester profiles and preview versions, Make live, Retire, Invalid, version history | End to end in a non-prod env after you dispatch the release; rollback test; preview never reaches a non-tester (test) | M |

From LD3 the designer is already useful: Download level file, commit, normal release. That needs no ADR change. LD6 makes it
portal-only. Upload level file also serves the restore drill and repo-to-portal moves.

### 3.2 Tier 2: new planets

**What you can do.** Add a planet with its name, Planet-kind icon, tile set and default backdrop; build its maps and 50-wave
campaign; release it. It joins the end of the unlock order and opens for a child who reached wave 20 on the planet before
[CONFIRMED prompt.md:437; VERIFIED handler.py:350-361].

**Admin UX.** Levels → **Planets** → **Add planet** → name, icon (library), tile set (Moon only until more are drawn), default
backdrop → build maps and campaign as in tier 1 → **Release** (disabled until the campaign has 50 published waves and every
check passes). Released planets cannot be reordered or removed.

**Data model**

```json
{"schema": 2, "rulesetVersion": "r1", "assetManifestVersion": "m2",
 "planets": [{"planetId": "luna-1", "campaignVersion": "luna-1-a4"},
             {"planetId": "mars-1", "campaignVersion": "mars-1-a1"}],
 "campaignVersion": "luna-1-a4"}
```

The top-level `campaignVersion` (= planets[0]) stays for one release so old clients keep working. The asset manifest (scope doc
§3.0) carries `artSets`, `planets.<id>.icon` and per-planet defaults. One global ruleset [PROPOSAL]; a new ruleset version
means the publisher rebuilds bounds for every listed planet.

**Changes.** `parseCurrent`, `released_planets()`, build-bounds (one bounds file per listed pair), GET /api/planets returns
`campaignVersion`, newGame.ts sends the chosen planet's version, Home planet choice (galaxy map P6/P7, prompt.md:245),
manifest-driven preload and tile sets, per-planet badge ids, endless reads the planet's own waves 41-50 (Phase 54). R30 demand
grows with each planet.

**Phases (tier 2)**

| Phase | Builds | Checks | Size |
|---|---|---|---|
| LD8 Asset manifest + art sets | Scope doc §3.0 manifest, `m1` seed from ART, manifest preload, tile-set keys | Old runs resume; Moonbeam pixel-identical | M-L |
| LD9 Multi-planet pointer | current.json v2, readers in TS and Python, bounds per pair, newGame fix, planet choice UI | Old-client contract tests; unlock tests; "never show unreleased as playable" test | L |
| LD10 Planets page | Add planet, release toggle, append-only order, badge ids | pytest lifecycle; release refused without 50 waves | M |

Scope change taken: the owner wants multiple planets designable before launch [CONFIRMED by owner, 2026-11-16], amending
"new planets are later scope" (prompt.md:141-143). A planet that should not look like the Moon also needs its own route-tile
set: a Route tile kind (192 px, tiles must join) is added to Draw with Claude in LD8, alongside Background, Decoration and
Planet, which exist already.

### 3.3 Tier 3: flexible routes and advanced authoring

**What you can do.** Routes that turn left and enter or leave on any edge; watch or play a draft in the real game renderer;
shape difficulty with curve tools.

**Not offered, even here:** several spawn points, branching or multiple paths, diagonal segments. The spec requires one route
in five places [CONFIRMED prompt.md:115,281,301,403,405; AC-11 prompt.md:1221], and diagonals need square roots, which breaks
integer determinism (route.ts:53-55). Longer routes are possible within a length band (§5).

**Admin UX.** The route tool stops greying out left turns and non-edge caps. Test tab gains **Watch wave N** and **Play it
yourself**, which open the real battle in a new tab at 1x/2x/4x. Waves tab gains a curve panel: toughness against the C8.1
anchors, simulated margin against the C8.3 sawtooth (4 → 1.10), duration against the 25 s and 40-100 s bands, and "set hpMult
from curve" over a range. Endless preview for waves 51-60 once Phase 54 exists.

**Changes**
- Art: `route-straight-l`, 4 left corners, 3 more portal caps and 3 more colony caps: 11 SVGs in art/svg/map, drawn rather than
  mirrored (mirroring puts the light top-right, against STYLE.md:90).
- Renderer: caps chosen by first and last direction (layout.ts:60,70); portal, colony and leak offsets by direction
  (BattleScene.ts:26-30,94,99,258-259). Colony near the top edge needs inward framing [ASSUMPTION; prove with screenshots].
- Parser loosens its direction rules only after the player release with the art ships.
- Preview: second build entry of web/player, `battle-preview.html`, published into the admin site under `/preview/` (§4).
  BattleScene takes its config and pictures by injection.

**Phases (tier 3)**

| Phase | Builds | Checks | Size |
|---|---|---|---|
| LD11 Any-direction routes | 11 tiles, cap choice, offsets, parser loosening | Layout tests for all 12 tile cases; screenshots of 4 fixture maps (one per entry edge); Moonbeam pixel-identical; STYLE review | M |
| LD12 Real-renderer preview | `battle-preview.html`, same-origin handoff, bot/self play, jump to wave, speed | No network writes (Playwright request log); AC-04 test; release manifest allows the entry | M |
| LD13 Curve tools | Curve panel, curve presets, endless preview | Model tests | S-M |

## 4. Test play options

| Option | How | Verdict |
|---|---|---|
| A. Headless numbers | game-core `createBattle`/`step` in a Web Worker on the saved revision, C17.1 bots (web/game-core/src/sim/index.ts:2-40) | **Tier 1. Recommended.** No Phaser, no network, deterministic; the publisher re-runs it as the blocking check |
| B. Player preview route in an iframe | Admin frames a player-site route and passes the draft by postMessage | Not now. Both sites send `frame-ancestors 'none'` and X-Frame-Options DENY (main.tf:74,95-98), so it needs a CSP change on the children's site and ships preview code to children's browsers |
| C. Second player build entry on the admin origin | `battle-preview.html` built from web/player (Phaser stays in the player package), published to the admin bucket under `/preview/`, opened in a new tab, draft passed by same-origin BroadcastChannel | **Tier 3. Recommended for visual checks.** No CSP change, never touches S3 or the API, so no run, bounds or rewards (AC-04). Precedent: web/player/panel-preview.html. Inline later needs a `/preview/*` behaviour with `frame-ancestors 'self'` (S, infra) |
| D. Bundle Phaser into admin | - | Rejected. Breaks the no-Phaser rule (no-phaser.test.ts, web/.oxlintrc.json:85-108) and adds about 1 MB |
| E. Tester preview version | A `preview` version in versions.json, playable only by tester profiles in the real player | **Tier 1 (LD7).** The only check with a real child, which C17.6 names as the biggest unknown |

The bots are the unproven part. The Python Competent bot cannot judge new maps, and game-core has no bot yet. LD0 spikes the
C17.1 policies in TS against Competent on Moonbeam [UNVERIFIED: whether they give a meaningful signal].

## 5. Automatic design rules

Where enforced: **H** = hard rule in `parsePlanet` (player load, build-bounds, publisher). **P** = `planetProblems`, live in
the editor and again in the publisher (Block or Warn). **S** = headless sim/bots in the publisher (and the Test tab). **T** =
human tick in the publish checklist. Labels are [PROPOSAL] unless marked.

**Readability for ages 5-7 (map)**
| Rule | Where | Source |
|---|---|---|
| Grid exactly 20x11 | H | layout.ts:6-8 [VERIFIED] |
| Integer waypoints in the grid, axis-aligned, non-empty segments | H | game-data.ts:568-578 [VERIFIED] |
| No 180° reversal, no cell visited twice | H | no crossing tile exists |
| Every straight, turn and cap has art (tier 1: start x=0 heading right, end x=19 heading right, no left heading) | H | layout.ts:28-34,60,70; BattleScene.ts:26-30,94 [VERIFIED] |
| Non-consecutive stretches never orthogonally adjacent (Block); exactly 2 apart (Warn) | P | "one clearly marked route" [CONFIRMED prompt.md:115] |
| Route length 30-50 tiles (Block); outside 36-44 (Warn) | P | waves tuned on 40 (C §C3.1, §C8) |
| Turns ≤12 (Block), >9 (Warn) | P | "keep the route predictable" [CONFIRMED prompt.md:405] |
| Portal and colony footprints clear of pads, decorations and other route | P | BattleScene.ts:26-30 |
| At least 2 bends with a pad covering 3+ stretches | P Warn | C §C3.1 "first tactical lesson" |
| Backdrop is an approved Background picture, opaque, no text | P | limits.json background kind; prompt.md:1090 [CONFIRMED] |
| Backdrop has no painted path; calm centre | T | luna-backdrop.svg:2 [VERIFIED]; prompt.md:115; the Background prompt already says "No route" (api/functions/picture_gen/kinds/background.md:16 [VERIFIED working tree]) |
| Backdrop WebP after conversion within a byte cap; counted in AC-42 load time | publisher | a Background PNG may be 4 MiB (limits.json) |
| Route-to-backdrop contrast | P Warn | metric [UNVERIFIED; prototype on luna-backdrop] |
| Decorations off route, pad, footprint and route-adjacent cells; ≤24; each one 96 px tile | P | D §D10.2 |
| Nothing looks like an alien, pad or path | T | readability for ages 5-7 |

**Accessibility (pads)**
| Rule | Where | Source |
|---|---|---|
| No pad on a route cell | H | prompt.md:281, AC-07 [CONFIRMED] |
| 12-16 pads | P | astronaut budget 16 (C14); selftest.py:20 [VERIFIED] |
| Pads at least 2 apart (Chebyshev), so targets stay ≥64 CSS px with gaps | P | D1 rule 8 |
| Every pad 1-2 tiles from the route; route in range 2.5 > 0; start pads ≥5.5 tiles in range (Warn) | P | C §C3.2-3.3 |
| ≥1 pad open at start (Block, already checked); <6 (Warn) | H / P | game-data.ts:597 [VERIFIED]; C3.3 |
| opensAfterWave in {0,5,10,15,20,25}; each unlock opens ≥1 pad | P | C §C3.3 [PROPOSAL] (C:187-200); same timing as class unlocks, prompt.md:357 |
| Pad order = route-progress order (Block for new maps, Warn for Moonbeam copies) | P | D5.1; config.ts:77 |
| Every pad reachable by arrow-key neighbours | P | D5.2 [ASSUMPTION in D] |
| Generated labels "Pad N", "Opens after wave M" | derived | D5.2; AC-41 [CONFIRMED prompt.md:271,1257] |

**Balance.** One check per wave set, because every age gets the same combat [CONFIRMED prompt.md:31,99]. This settles the
scope doc's open question on age bands. Test players are the C17.1 policies (minimal: 3 Novas on the weakest pads; naive: 20
seeds; competent), each at 0%, 60% and 100% learning success (C9.6, C17.2), using only the set's classes.
| Rule | Where | Source |
|---|---|---|
| Existing wave bounds, G-15, campaign shape, presets on open pads, reward blocks | H | game-data.ts:463-626 [VERIFIED] |
| Bosses only on 10/20/30/40/50, one each | H (once bosses exist) | AC-11; G-2 (I §257) |
| Challenge wave ids only in CHALLENGE sets; challenge 2-8 waves (an activity follows every wave) | H / P | prompt.md:97,125 [CONFIRMED]; numbers [PROPOSAL] |
| Campaign colonyHealth = maxHealth; challenge colonyHealth ≥10; credits within limits.json friendly ranges | P | parser allows 1..max (game-data.ts:549-550 [VERIFIED]) |
| Minimal player clears waves 1-5; competent at 0% learning clears the whole set | S Block | C:691,1098 [VERIFIED]; C9.6, C17.2 |
| Minimal clears 1-9; naive (20 seeds) median and spread; "None" board loses | S Warn | C §C17.1, §C8.3 |
| Presets-only board (never buys) loses or leaks before the last wave, else "this challenge plays itself" | S Warn | this design |
| Nova-only clears; any one class removed still clears; no meteor power used; checked against the set's classes | S | prompt.md:301,439 [CONFIRMED]; C17.4 |
| Challenge without Nova in `classes` (Block unless presets cover it); C6.5 per wave set | P | C §C6.5 |
| Margin <1.05, or >15% off the 4 → 1.10 curve; boss not slightly below neighbours | S Warn | C §C8.3, §C17.6 |
| Challenge: first-wave margin <2, or margins rise sharply partway through | S Warn | this design |
| New alien's first wave not solo and small | P Warn | prompt.md:385 [CONFIRMED]; C8.3 |
| Campaign speedMult >1.25; toughness >25% off C8.1 anchors | P Warn | C §C8.1 |
| Ordinary wave <25 s or >90 s; boss wave outside 40-100 s; total campaign combat far from 40 min; challenge combat >10 min | S Warn | C §C17.5-17.7 (longest today 83 s); 90 s and 10 min [PROPOSAL] |
| Editing waves a challenge uses, or waves 41-49 and bosses (endless) | P Warn | C §C11.1, §C13 |
| R30 bank readiness for every age band | publisher | admin handler.py:1072-1091 [VERIFIED] |
| Badge: v1 offers "no badge" only; a generic "complete challenge X" rule type is decided at Gate J (Phase 52 rule types; badge maker deferred) | P | C §C12-13 |

**Performance**
| Rule | Where | Source |
|---|---|---|
| Waypoints ≤16 (targeting cost = towers × aliens × segments) | H | battle.ts:257-274 [VERIFIED] |
| Peak live aliens ≤48 (Warn ≥44); descendants ≤24; depth ≤2 | S | C §C6.4 |
| Busiest wave busier than wave 37 becomes the AC-42 measurement wave | S Warn | C §C14; AC-42 |

**Lifecycle and scope**
| Rule | Where | Source |
|---|---|---|
| luna-1 only (until tier 2); CAMPAIGN/CHALLENGE only; ruleset aliens and classes only; no random fields | H / P | prompt.md:115,143,409,443 [CONFIRMED] |
| Immutable a<n> versions; current.json moves only after every check; refused while the freeze flag is set | publisher | spine S11.4; H G-8 (H:703) [PROPOSAL] |
| Publish refused when `sourceVersion` is not live; only owned sections merge | publisher | this design |
| Retired and invalid apply per (version, wave set); `preview` never in current.json | publisher, player-api | this design |
| Only approved pictures of the right kind | publisher | limits.json kinds |
| Names follow the limits.json name rule; no personal data | P | CLAUDE.md |

## 6. Relationship to the existing scope

- **Replaces** scope doc §3.1 (map/level maker, "L, 2 phases") and the separate wave-set/challenge maker. Its "no schema change
  for planet 1 variants" holds only for new wave sets on the Moonbeam map. New maps need schema 2 (`maps{}`) or they replace
  the campaign map.
- **Narrows §3.0 for tier 1.** The publisher (scope doc M1) is still needed (LD6). The asset manifest (scope doc M2) is not on
  the tier 1 path, because map art lives in the planet document. It moves to tier 2 (LD8) and the alien maker.
- **Corrects two first-pass points.** The activity editor has no autosave: it keeps unsaved edits per tab and saves by button
  (unsaved.ts:1-48). Admin does not import game-core today; that is a new dependency.
- **Design A runtime publish.** Unchanged in shape: the publisher writes create-only `a<n>` files and owns current.json. Added:
  `versions.json` so create-run refuses retired wave sets (handler.py:466-489 accepts any loadable pair today), section merge
  with a stale-source check, and the release stops overwriting current.json (publish_static.py:249) before the first admin
  publish.
- **Data freeze and G-8.** G-8 diffs git against the last release tag, so it cannot see admin `a<n>` files. The substitutes:
  create-only IAM, the site bucket Deny, the SSM freeze flag that the Phase 74 release sets, GDPUBLISH audit rows, and admin
  data in the Gate L backup and restore drill (which uses Upload level file). Golden scenarios still run because the designer
  cannot change `mechanics`. The ADR must say this.
- **C13 amendment.** Challenge `waves[]` may hold challenge wave ids as well as campaign wave numbers (decision 3).
- **Gate order.** Gate M (tier 1, plus the alien maker) stays after J and before L, as proposed. LD0 can run inside Gate J,
  where Phase 50 re-runs the sim anyway. Tier 2 goes after launch beside K unless you change scope. Tier 3 phases can follow
  tier 1 or move after launch. Gate K must precache map pictures named in the pinned document.
- **Before Gate M, earlier gates should not build on** today's once-per-run pad opening or the fixed backdrop; Gate F/J and
  LD2 change them.

## 7. Decisions for you

1. **Scope change.** A level designer goes beyond "content administration only" (B §B1.2). *Recommend:* yes to tier 1, dated;
   tier 2 after launch; tier 3 decided after tier 1. **Owner, 2026-11-16: all three tiers in Gate M, fully built before the game
   is playable.**
2. **Maps per planet.** Schema 2 with challenge maps, or one map per planet (each new map replaces Moonbeam)? *Recommend:*
   schema 2, so new routes do not force re-tuning all 50 campaign waves.
3. **Challenge-only waves.** Allowed, as `challengeWaves` with string ids (not numbers 51-99, which C11.1 gives to endless),
   with a C13 amendment? *Recommend:* yes. Without them challenges can only remix campaign waves once Phase 50 lands.
4. **Runtime publish or export only.** *Recommend:* build Download and Upload level file first (LD3), runtime publish in LD6.
   If you want zero infra and ADR risk, stop at export.
5. **Art location.** Planet document (`map.art`) or asset manifest? *Recommend:* planet document for tier 1; manifest in tier 2.
6. **Route length.** Hard band 30-50 with a warning outside 36-44, or exactly 40? *Recommend:* the band.
7. **Pad order.** Canonicalise by route progress on new maps; keep Moonbeam's authored order on copies. *Recommend:* yes.
8. **Balance gate.** Which bot results block publish? *Recommend:* "minimal clears 1-5" and "competent at 0% learning clears
   the set" block from the start (they are C targets); everything else warns until the LD0 spike proves the bots.
9. **Publish unit.** Per-level drafts that own sections, merged at publish with a stale-source refusal, or one planet-wide
   draft? *Recommend:* owned sections.
10. **Retire granularity.** Retire and invalid per (version, wave set) rather than per version. *Recommend:* yes.
11. **Tester preview.** A `preview` state playable only by profiles you mark as testers. *Recommend:* yes, in LD7.
12. **Drawing cost.** Count a Background as several cap units, or give Backgrounds a monthly sub-cap? *Recommend:* sub-cap,
    with spend shown per level.
13. **Route art for tier 3.** Draw 11 tiles or mirror? *Recommend:* draw; mirroring breaks the top-left light.
14. **Preview window (tier 3).** New-tab `battle-preview.html` on the admin origin, or inline with a framing change?
    *Recommend:* new tab.
15. **Background resolution.** The kind is 1920x1056 (1x); the hand-drawn backdrop is 3840x2112. *Recommend:* accept 1x for
    now and judge it on your laptop after the Background release.
16. **Ruleset (tier 2).** One global ruleset or one per planet? *Recommend:* global.

## 8. Risks and unknowns

| # | Risk or unknown | Label | Mitigation or how to check |
|---|---|---|---|
| 1 | Bots may pass levels a 6-year-old cannot play, or fail fine ones | [UNVERIFIED] | LD0 spike against Competent on Moonbeam; tester preview; warn-only beyond the two C targets; J balance playtests still cover the campaign |
| 2 | Release or `artefacts_from` rollback silently reverts an admin publish | [VERIFIED publish_static.py:249] | Fix in LD6 before the first runtime publish |
| 3 | Admin data bypasses git review and G-8 | [VERIFIED H G-8 is git-only] | Create-only IAM, bucket Deny, freeze flag, audit rows, backup |
| 4 | Tightening `parsePlanet` strands old pinned documents (AC-35) | [PROPOSAL] | Hard rules only where the renderer would throw; design rules live in `planetProblems`; after the freeze the parser only loosens. luna-1-c1's map passes every tier-1 hard rule (starts x=0 heading right, ends (19,3) heading right, no pad on a route cell) [VERIFIED by reading; prove in LD1 tests] |
| 5 | Schema churn if built before E and J land | [ASSUMPTION] | Keep Gate M after J |
| 6 | Admin bundle grows with game-core (today 474 kB, 139 kB gzip) | [UNVERIFIED] | Measure in LD0; lazy-load the Levels pages |
| 7 | Pad keyboard model (AC-41) is not built yet, so the designer encodes D5 rules the player must honour later | [VERIFIED no pad buttons in web/player/src] | Re-run the pad rules when Gate F/J ships them |
| 8 | Draft size for a 50-wave document | [ASSUMPTION 64 KB, same as the activity draft cap] | Measure when Phase 50 lands |
| 9 | Full check run time (policies × 3 learning rates × 20 seeds × 50 waves) may exceed a Worker or Lambda budget | [UNVERIFIED] | Measure in LD0; set the budget and timeout from it |
| 10 | Generated backgrounds paint a path, reading as a second route | [ASSUMPTION] | The Background prompt already forbids a route (background.md:16, working tree); plus the checklist tick |
| 11 | 1x Background looks soft on HiDPI screens | [ASSUMPTION] | Judge after the Background release (decision 15) |
| 12 | Colony framing near the top or bottom edge (tier 3) | [ASSUMPTION] | Screenshot fixture maps in LD11; cut option: right-edge gate only |
| 13 | More wave sets raise R30 question demand and can block publish | [VERIFIED readiness gate exists] | Show the shortfall in the Publish tab |
| 14 | Stray GameDataRead grant on the tts role (unrelated) | [VERIFIED main.tf:412-418; copied from admin_api main.tf:277-283 is an inference] | Owner decides whether to remove it in a separate commit |
| 15 | Edge cache age of current.json under CachingOptimized with origin `no-cache` | [UNVERIFIED ~1 s] | `curl -sI https://<player-host>/game-data/current.json` twice; read Age and X-Cache. Go-live is dominated by the 60 s Lambda cache (game_data.py:34) |
| 16 | Expectation gap: the designer cannot add behaviours, bosses, powers or campaign shapes | [PROPOSAL: design consequence, since the parser refuses unknown keys and non-ruleset aliens] | The UI offers only what the ruleset supports |
| 17 | AI drawing spend: 20-50 drawings for five maps is 13-33% of the monthly cap of 150 | [ASSUMPTION estimate] | Decision 12; backdrop reuse |
| 18 | `finalWave` and `maxBounty` key by position, so a set mixing campaign and challenge waves counts correctly | [VERIFIED game-data.ts:177-178,488,669,679] | Bounds contract test in LD2 |

**Cut order if time is short** (first cut first): tier 2 → real-renderer preview → curve tools → any-direction routes →
decorations → Background backdrops → schema 2 challenge maps (back to one map per planet) → runtime publisher (export and
release only). Never cut: the hard rules and `planetProblems`, the pad order and focus rules, the object caps, bank readiness,
the two blocking C targets, per-wave-set retire.
