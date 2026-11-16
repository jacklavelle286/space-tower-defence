# Scope: asset-type presets and admin makers

Status: **[PROPOSAL]**, awaiting the owner's decisions (section 6). Written 2026-11-16 after Gate P shipped. Labels follow
CLAUDE.md. File references are repo-relative.

## 1. Summary

- **What.** (a) A "What kind of picture?" menu in Draw with Claude. Each kind adds its own style rules and example SVGs to the
  prompt, so "an alien with 3 eyes" + Avatar comes back as an avatar. (b) Admin makers for levels, aliens, towers and others, so
  new game content is published from the portal.
- **Recommended order.** [PROPOSAL] Approve Gate P, then a small Gate P2 (kind presets, about 2 phases), then I -> E -> F (+ avatar
  library) -> J -> new Gate M (makers) -> L -> K.
- **Rough size.** P2 is S-M (2 phases). The avatar library is S (1 phase). Gate M is L (about 8-10 phases).
- **Architecture.** [PROPOSAL] Runtime publish (Design A) with release-grade checks borrowed from Design B. See section 4.
- **Hard limit.** A maker can only set numbers and art for behaviour game-core already has. New behaviour (flying, armour,
  bosses, powers) stays a code release [VERIFIED web/game-core/src/data/game-data.ts:16,314-315,341-342].

## 2. Part 1: Asset-type presets for Draw with Claude

### 2.1 What happens today

- One textarea, no type field [VERIFIED web/admin/src/pictures/DrawPicture.tsx:127-144].
- One fixed system prompt: RULES + all of art/STYLE.md + four activity SVGs (pic-cat, pic-boat, obj-rocket, pic-fish)
  [VERIFIED api/functions/picture_gen/handler.py:73-79,91-113,184-190].
- RULES hard-code "256x256, one object, centred, no background" [VERIFIED handler.py:95,103]. So every request comes back as
  a loose activity object.
- Your typed prompt is stored on the PICJOB DynamoDB item and in the SQS message. It is never logged
  [VERIFIED handler.py:22-23]. Your first two drawings (2026-11-16) asked for "a new avatar for profiles which is an alien with
  big eyes and a cute expression" [VERIFIED read-only get-item on the two PICJOB items]. With one fixed prompt that comes back as a
  loose activity object, not an avatar disc. That is the case the kind menu fixes.

### 2.2 The type menu

Usable now (P2 ships these):

| Kind | Who uses it | Notes |
|---|---|---|
| Activity object | Learning activities | Today's behaviour. Default for old rows |
| Activity scene | Learning activities | Fills the square, background allowed (like pic-night-sky, pic-rain) |
| Avatar | Nobody until the avatar library (F) | Prompt ships in P2 so you can build up avatars now |

After makers (listed greyed out, or hidden, until Gate M): Alien, Astronaut (tower), Map decoration, Route tile, Planet, Badge,
Boss (concept still only), UI icon.

Not offered: battle backdrop and full screens. The backdrop SVG is drawn at 3840x2112 (viewBox of
art/svg/map/luna-backdrop.svg; "3840 backdrops", STYLE.md:76) for a 1920x1056 logical canvas
[VERIFIED web/player/src/game/layout.ts:7-8, assets.ts:41]. At 84,328 bytes it is over the 65,536-byte sanitiser cap
[VERIFIED api/shared/svg_sanitise.py:45] and needs more output than the 16,000 max_tokens. (The handler reads
`BEDROCK_MAX_TOKENS` [VERIFIED handler.py:130], set from `var.bedrock_max_tokens` [VERIFIED infrastructure/main/pictures.tf:292];
16000 is the value in the handler docstring, handler.py:37.) [PROPOSAL] The level maker composes backdrops from a ground colour,
tiles and decorations instead.

### 2.3 Per-kind spec

Every kind inherits the global STYLE.md rules: file rules (viewBox, no text, real alpha, top comment, `<g id>`, no gradients)
[VERIFIED art/STYLE.md:22-29]; one shade and one highlight [:33]; plum `#2A1E3D` [:37] round-joined outline [:56-57]; light from
the top-left [:88-93]. Palette is STYLE.md for all kinds; it only drives a warning [VERIFIED svg_sanitise.py:32,52].

**Safety line in every kind block** [PROPOSAL]: "friendly, never frightening, for ages 5-7; no weapons, blood or gore; no
letters, numbers or letter-like shapes". STYLE.md has no "friendly, not frightening" rule today [VERIFIED grep of art/STYLE.md],
so the kind blocks must state it. The human cast rule (cheerful boys, light skin, short hair) [VERIFIED STYLE.md:141,152] goes into
the Avatar and Astronaut blocks. The approval screen shows a short per-kind checklist (on-style, friendly, framing right, no
letters) and records the ticks on the audit row.

| Kind | Canvas | Framing and anchor | Outline | Examples (bytes) |
|---|---|---|---|---|
| Activity object | 256 | One centred object, ~80%, even padding, transparent | 7 (8 big blobs) | pic-cat 3,100, pic-boat 1,761, obj-rocket 1,857, pic-fish 1,973 |
| Activity scene | 256 | Full square, background allowed | 7 | pic-moon 1,321 + 2 scene SVGs from art/svg/activity (you pick) |
| Avatar | 256 | Night-blue `#23295E` disc r116 at (128,128), transparent outside; head and shoulders in a round glass helmet, facing the viewer, clipped to the disc; torso from bottom edge; a few cream/cyan sparkles; gold rim r117 `#FFD86B` 4.5 [VERIFIED art/svg/avatars/avatar-02.svg:2-5,64-66] | 7 | avatar-02 4,668 (human), avatar-07 4,943 (friendly alien) |
| Alien *(after makers)* | 256 | Feet on y250, anchor [0.5,1], body 70-75% height, three-quarter right, STYLE §7 face, STYLE §9 group ids required | 8 | alien-blob-walk-01 2,909, alien-slime-walk-01 2,708 |
| Astronaut frame 01 *(after makers)* | 256 | Boots on y250, helmet (126,94) r50, three-quarter right, gadget in front mitten (STYLE §6) | 7 | nova-l1-idle-01 6,614, nova-card 4,789 |
| Map decoration *(after makers)* | 256 | Rock: feet anchor. Crater: centre, 4:3 ellipse | 7 | deco-rock-1 1,557, deco-crater-1 1,338 |
| Route tile *(after makers)* | 192 | Centre; open edges identical so tiles join | 6 | route-straight-h 1,343, route-corner-right-down 1,447 |
| Planet *(after makers)* | 512 | Disc (256,272) r196 clipped, plum outline 12, cyan rim light top-left, colony domes on top [VERIFIED planet-luna-1.svg:7,9] | 12 (file) vs 11 (STYLE.md:72) | planet-luna-1 6,264 |
| Badge *(after makers)* | 256 | Medal: ribbon, gold rim r96, cream ring r80, blue disc r70, emblem; outline twin derived in code | 7/5/4 | badge-first-steps 3,809 |
| Boss still *(after makers)* | 768 | Feet on y762 | 10 (files) vs 14 (STYLE.md), decision 9 | boss-wobble-walk-01 3,935 |

Planet notes: planet-silhouette.svg is a dotted grey `#A7B0C8` circle (r176, stroke 14, 50% opacity, no fill), the locked
placeholder, not a planet model. planet-luna-1.svg's top comment says "centre 256,282, r 178 ... Outline 11", which disagrees with
its own geometry; fix the comment (or the geometry) before using it as a prompt example (decision 9 covers widths).

### 2.4 What changes

**Contract.** `contracts/limits.json` gains `picture.kinds: {<kind>: {width, height, background, fit, consumer}}`. It replaces
the single `picture.side: 256` [VERIFIED limits.json:53-62]. Python and TypeScript read the same list.

**admin-api** (`api/shared/picture_admin.py`, `pictures.py`, `content.py`)
- Add `kind` to the R38 fields (:550), the PICJOB item, the SQS message (:641-645), the R34 UPLOAD body (:253-257), the PIC
  header (beside `width`/`height`, pictures.py:206-207), picture_view and R33 rows. For a generated picture R34 takes the kind
  from the job and refuses a mismatch.
- Rows without `kind` read as `activity-object`. No migration.
- New guard: content.py (:508,925,1049) refuses a picture whose kind's consumer is not `activity`. Today it would accept an
  avatar inside an activity [VERIFIED by reading].
- R33 takes `?kind=`.

**picture-gen** (`api/functions/picture_gen/handler.py`)
- Split RULES into a kind-neutral core (safety, allow-list, `<request>` rule, `<svg-refused/>`) and one block per kind
  (canvas, framing, background rule, outline, safety line, 2-4 example SVGs). Where the blocks live is decision 13: code files
  `api/functions/picture_gen/kinds/<kind>.md`, or an editable, versioned `KINDPROMPT#<kind>` item.
- System blocks: [core + STYLE.md] with cache breakpoint 1, then [kind block] with breakpoint 2. Two of four breakpoints.
- Bundle code kind files via `scripts/build_lambdas.py:90-95`.
- Allow `kind` in the message keys (:492). `previous()` (def at :404) gains a kind argument, passed at its call site (:325).

**Sizes.** All three P2 kinds are 256, so the sanitiser and png_canon need no change in P2. The size parameter
(`sanitise(..., canvas=(w,h))`, png_canon size in place of `SIDE`) arrives with the first non-256 kind in Gate M, together with
a per-kind alpha bounding-box check in png_canon (for example Alien: body fills 65-80% of the height, feet touch y≈250).

**Admin UI**
- Required kind `<select>` beside the textarea in DrawPicture, no default. Same select on Upload.
- Kind filter on the Pictures page.
- Activity PicturePicker shows only activity kinds (`web/admin/src/editor/library.tsx:31-32`).
- `fitBox` (`web/admin/src/pictures/normalise.ts:~109`) uses contain for objects, cover for scenes.

**Storage and infra.** Keep `lib-<32hex>` ids and the `store/` and `pictures/v1/` prefixes; record kind as an attribute.
[VERIFIED infrastructure/main/pictures.tf has nothing per type] So no IAM, bucket-policy or CloudFront change in P2.

**Release.** admin-api and picture-gen must ship in the same release. An old worker rejects a `kind` key after the cap was
charged and writes no error.json, so the cap is not refunded [VERIFIED handler.py:308,492].

### 2.5 Prompt-cache cost and the drawing cap

- Core + STYLE.md about 5-6k tokens; each kind block about 1.5-4k [ASSUMPTION, 4 chars per token].
- First-party Opus 5.5 rates [VERIFIED claude-api skill; Bedrock EU price UNVERIFIED]: kind block cache write about $0.015,
  cache read about $0.0006, output up to 16k tokens about $0.32.
- Output dominates. Kinds add about one cent per drawing. Each kind has its own cache entry (5 min TTL).
- [UNVERIFIED] Bedrock's minimum cacheable prefix for this model, and exact tokens per kind. Check with count_tokens in 42c.
- **The monthly cap binds first.** 150 drawings a month (worst case about £47) [VERIFIED docs/decisions/0031-*.md:35-39], not
  100 a day. With derived animation, expected Claude drawings per entity, including retries [ASSUMPTION, 2-3 tries each]:

| Entity | Claude drawings | With retries |
|---|---|---|
| Avatar, decoration, badge | 1 | 2-3 |
| Alien (frame 01; walk derived) | 1 | 2-3 |
| Tower (frame 01 + card per level; idle, attack, beam and locked card derived) | 3-6 | 8-15 |
| Map art set (2-3 decorations + any new route tile) | 3-5 | 8-15 |

  Hand-drawing every tower frame would be 3 levels x (4 idle + 4 attack) + 3 beams x 3 = 33 frames
  [VERIFIED web/player/src/game/assets.ts:59-67]; that is why derivation matters. Decision 14: makers share the 150 cap or get a
  sub-cap. Every maker shows the remaining monthly count.

### 2.6 Proposed Gate P2 (amends Gate P) [PROPOSAL]

ADR-0026 and ADR-0031 are still `Proposed` [VERIFIED docs/decisions/0031-...md:2], so amend them rather than write a new ADR.

| Phase | Builds | Checks |
|---|---|---|
| 42c Kinds in the API and worker | limits.json kinds; kind on R38/R34/PICJOB/SQS/PIC/R33; worker core + kind blocks (with safety line) for activity-object, activity-scene, avatar; content.py guard; ADR-0031 and ADR-0026 amended | pytest: old rows read as activity-object; unknown kind refused; avatar refused in an activity; worker system blocks are fixed bytes per kind; count_tokens per kind block recorded; routes.json and schemas updated |
| 42d Kinds in the admin UI | Kind select on Draw and Upload; library filter; picker shows activity kinds only; contain vs cover; approval checklist | vitest for select, filter, picker and checklist; admin build; after release you draw one picture per kind and approve it |

Option: fold 42c-42d into Gate P before you approve it (decision 1).

## 3. Part 2: Makers

### 3.0 Shared foundation (needed by every maker)

**Drafts and checks**
- **Drafts** in DynamoDB (content table, `GDDRAFT#<kind>#<id>`), editable, audited, never served. Editors autosave using the
  existing `web/admin/src/editor/unsaved.ts` pattern.
- **Browser checks.** admin-web imports game-core (it has no imports [VERIFIED game-data.ts:12]) and runs parseRuleset,
  parsePlanet, G-15 and a headless test play on every edit. [UNVERIFIED] game-core bundles cleanly into admin-web, which is
  deliberately Phaser-free (`web/admin/src/no-phaser.test.ts`); check with an admin build.
- **Names.** Alien, level and avatar names reach child screens. `contracts/limits.json` gains a name rule (length, allowed
  characters, reading level as for activity text), enforced by admin-api and again by the publisher.
- **Slider bounds.** Every numeric field has a min and max in limits.json, taken from the roster's range. Runs pin `ageBand`
  [VERIFIED runs.py:12]; [UNVERIFIED] whether difficulty varies by age band (check `contracts.generated.ts` and C §C15). If it
  does, the balance check runs once per band.
- **Visual preview.** [PROPOSAL, decision 15] "Test play" is headless (numbers only). For how a draft looks, add an admin-only
  player route that loads a draft bundle, like PreviewSolve [VERIFIED web/admin/src/editor/ActivityEditor.tsx:16,290]. It never
  creates a run, bounds or rewards (AC-04).

**Publisher**
- New Node.js 24 Lambda `game-data-publish`, its own role (admin-api keeps ADR-0003 and cannot write `game-data/`). It re-runs
  the parsers, the new invariants, G-15, buildBounds and the headless balance check. If all pass it writes `ruleset/`,
  `campaign/`, `bounds/` and `asset-manifest/` files create-only (If-None-Match), then moves `current.json`. Bounds come only
  from here, never from the browser, because player-api trusts them (spine S6, ADR-0005).
- **Blocking checks before current.json moves:** (1) the R30 question-bank readiness check on the new wave sets, so new games
  can still start [VERIFIED bank status reads released game data, infrastructure/main/main.tf:277-278]; the publisher role gets
  the same content-table read. (2) Every manifest picture exists, is approved and has the right kind. (3) Names and slider
  bounds. (4) Every pad has a stable keyboard focus order and a visible label, so AC-41 keyboard placement still works
  [CONFIRMED prompt.md:271,1257].
- **Versions.** Admin versions are `a<n>` (`luna-1-a3`, `r1-a2`), allocated from a conditional DynamoDB counter so two
  publishes never claim the same number.
- **current.json.** Today it holds only `rulesetVersion` and `campaignVersion` [VERIFIED api/shared/game_data.py:157-171] and
  runs store `assetManifestVersion: None` [VERIFIED runs.py:116]. Add `assetManifestVersion` (game-core `parseCurrent`,
  game_data.py, the run-create pin). The publisher writes all three pins in one object with a conditional If-Match on the ETag,
  so concurrent publishes cannot overwrite each other. After the repo seed the publisher owns it; the release writes it only
  when absent or on an explicit reseed flag [VERIFIED today it always overwrites: scripts/publish_static.py:249].
- **Time to go live** = max(edge TTL, `CURRENT_TTL_SECONDS`): `GameDataReader.current()` caches per warm Lambda
  [VERIFIED game_data.py:159-160], so a CloudFront invalidation alone is not enough. [UNVERIFIED] Edge TTL on
  `/game-data/current.json`; check the `cache_policy_id` passed to `infrastructure/modules/static_site/main.tf:202,213`.
- **Audit and backup.** Every publish writes an immutable `GDPUBLISH#` row with a diff summary. Admin data never enters git, so
  an "export to repo" archive becomes a Gate L backup-and-restore requirement (prompt.md:1286).
- **Kill switch.** An SSM flag stops publishing. It is set as part of the Phase 74 freeze release, and G-8 checks it
  [VERIFIED docs/build-phases.md:102,105].

**Retire and recover** [PROPOSAL; in the new ADR]
- Rollback = point current.json back; files stay immutable and saved runs keep their pins (`playable()`, runs.py:171).
- The spec also asks to stop a broken item being chosen again, handle runs already using it, and tell normal retirement from
  recovery from invalid content [CONFIRMED prompt.md:556]. Add `retired` and `invalid` states to admin versions. Retired:
  runs resume as normal, no new runs. Invalid: resume ends the run gracefully, keeps the child's progress and never counts it
  as a loss.

**Asset manifest (pulled forward from Phase 64)**
- Art is bound by entity id in `asset-manifest/<v>.json`, pinned per run. Entries point at `/pictures/v1/` or `/assets/`; both
  same-origin, so no CSP change [VERIFIED main.tf:66].
- **Frame sets.** A library picture is one PNG with one id, but the renderer wants frame sets with a count, anchor and display
  size [VERIFIED assets.ts:13,28-31]. Entry shape: `{frames:[lib-…], anchor, size, fps}`. The library gets a "frame set" view;
  derived animation is stored as a set.
- **No hitboxes in v1.** game-core has no hit radius or footprint [VERIFIED grep of web/game-core/src], and every alien is drawn
  at 128x128 with a feet anchor [VERIFIED assets.ts:68]. Sprite framing is the only control, hence the png_canon bbox check.
- **De-hard-code:** nova-only `astronautArt` (`assets.ts:96-101`), blob for every alien (`BattleScene.ts:234-237`), nova-only pad
  panel (`PadPanel.tsx:21-26`), fixed backdrop (`assets.ts:19,41`), static preload list (`BattleScene.ts:73`, `allFrames`).
  Preload becomes manifest-driven, with a fallback to the repo sprite for the entity type if a URL fails.
- **Migration.** The release seeds repo manifest `m1` from today's ART table. A null `assetManifestVersion` reads as `m1`. Test:
  a run saved before Gate M resumes.
- **Delete guard.** `picture_users` scans only activity drafts and versions [VERIFIED pictures.py:272-296]. R37 must also scan
  `GDDRAFT#*`, profiles (3.4) and every published `asset-manifest/<v>.json`. A reference from a published manifest holds the
  picture for good.
- **Offline (Gate K).** The pinned manifest is the precache list, with a byte cap per manifest so prep stays under the
  browser's storage quota [UNVERIFIED quota; check in the K spike].

**Headless balance check.** Auto-play each wave set with three placements (none, baseline, strong). Block publish if baseline
loses waves 1-3 or strong cannot win. The Python simulator stays the authority for repo files and is advisory for admin data.
[UNVERIFIED] Whether a placement bot gives a meaningful signal; spike it.

Size: L, 2-3 phases (publisher + infra + ADR; manifest, migration and de-hard-coding).

### 3.1 Map / level maker (L, 2 phases)

- **UX.** 20x11 grid over the backdrop. Click to lay the route (snaps to horizontal or vertical). Click to drop pads with an
  "opens after wave N" stepper. Keyboard too: arrow keys move a grid cursor, Enter lays a route tile or pad (laptop with
  keyboard and mouse [CONFIRMED prompt.md:113]; tablets out of scope, prompt.md:145). Undo/redo stack; no drag. Wave table:
  rows of {alien, count, at, gap} plus hpMult and speedMult, grouped into wave sets (mode, meteorAfter, startCredits, classes,
  presetPlacements). "Test play" shows leaks, credits and colony health per wave. Submit -> approve -> Publish.
- **Data.** The existing campaign document (`game-data/campaign/luna-1-c1.json`); no schema change for planet 1 variants.
  Art (composed ground, decorations, route-tile set) goes in the manifest.
- **Validation.** Existing parser checks: straight segments, unique pads, an open pad, aliens exist, waves 1-50
  [VERIFIED game-data.ts:34,566-579,606]. New: grid exactly 20x11 (renderer fixed, `layout.ts:1-8`); no pad on a route tile
  (not checked today); no leftward straight segment until a left tile exists (`layout.ts:28`); one clearly marked route per map
  (prompt.md:115); pad focus order and labels. G-15, the bank readiness check and the balance check.
- **Delivery.** Publisher writes files and moves current.json. A second planet needs current.json to become a list, touching
  `parseCurrent` (game-data.ts:296), `released_planets` (`api/shared/game_data.py:185-187`), Home `firstChoice`
  (`Home.tsx:16-26`) and unlocks (`player_api/handler.py:350-361`). Extra wave sets on planet 1 need none of that.
- **Scope.** Planet-1 wave sets and challenges fit "one playable planet" [CONFIRMED prompt.md:115]. New planets are later
  scope [CONFIRMED prompt.md:143] and need your dated scope change.
- **Cut first.** Generated backdrops, other grid sizes, decoration placement, replay preview.

The wave-set / challenge maker is a filtered view of this (S once 3.1 exists). It is the most valuable maker inside v1 scope.
Maker-published maps join the Gate L accessibility pass.

### 3.2 Alien maker (M, 1 phase + animation spike); bosses deferred

- **UX.** Name and bounded sliders (hp, speed, leak, bounty). Draw with Claude, Alien kind. Preview of the derived walk cycle.
  The alien appears in the wave table.
- **Data.** New ruleset version `r1-a<n>` that adds `aliens.<id>`. Art stays in the manifest, because `parseAlien` rejects
  unknown keys [VERIFIED game-data.ts:340-342].
- **Animation.** [PROPOSAL; spike needed] Claude returns frame 01 with STYLE §9 group ids (`body`, `face`, `antennae`, `feet`).
  A shared TypeScript animator applies the STYLE §11 transform table to make 6 walk frames. No extra Claude calls. Fallback: whole
  sprite bob. Quality [UNVERIFIED]; spike on alien-blob-walk-01 against the hand-drawn frames. The spike lists, per kind, every
  state the renderer requests (aliens: walk only today [VERIFIED assets.ts:68]; towers: idle, attack and beam per level
  [VERIFIED assets.ts:59-67]) and shows the animator makes each one or a fallback exists.
- **Validation.** Mechanics 1 only: plain alien, no traits [VERIFIED game-data.ts:341-342]. Balance re-run for every wave set
  using it. Owner approval of the art with the kind checklist.
- **Bosses.** Multi-state behaviour (phases, plates, bubbles) is code (Phase 27), 6 frames per state at 768. [PROPOSAL] No boss
  maker. At most a re-skin of a boss Gate E built, after launch.

### 3.3 Tower / astronaut maker (M-L, 1-2 phases) [PROPOSAL: defer past launch]

- **UX.** Name, role, unlockAfterWave, deployCap, targeting, and per level L1-L3 damage, range, rate, cost. Art: Astronaut kind
  frame 01 and a card; locked silhouette derived (flat `#23295E` + plum rim).
- **Data.** New ruleset version with `classes.<id>`, exactly 3 levels, attack `single` [VERIFIED game-data.ts:29,315]. Manifest
  holds idle/attack frame sets per level, beam, card, locked card (33 frames today, assets.ts:59-67).
- **Risk.** Derived frames will look simpler than hand-drawn ones. Six classes are already drawn, so the need is low. Phase 24
  (E) wires the roster.

### 3.4 Avatar library (S, 1 phase, Gate F with the profile work)

- **UX.** Draw with the Avatar kind (P2), name it, approve it, tick "show to players".
- **Data.** Profile accepts `avatar-01..12` or an approved `kind=avatar` lib id. Changes `contracts/limits.json:37-40`,
  `api/shared/profile.py:32,133` and the profile route contract. Names move from `COPY.avatars` (`en-GB.ts:126`) to library
  names, under the limits.json name rule.
- **Player.** `ProfileSetup.tsx:111-120` and `Home.tsx:114` load a published avatar list and resolve URLs with
  `libraryPictureUrl` (`web/shared/src/pictures.ts:15`).
- **Validation.** `picture_users` (`pictures.py:272-296`) also scans profiles, so R37 cannot delete an avatar in use.
- **Delivery.** Runtime, through the existing `/pictures/v1/`. No game data involved.

### 3.5 Others

- **Badge maker** (S-M, after Phase 52). Badge kind art, outline twin derived in code. Rules are picked from the rule types Phase
  52 builds; the maker cannot invent rules.
- **Powers / meteor offers.** Effects are code. Cut, apart from re-skinning icons.
- **Decoration placer.** Part of the map maker, later.

### 3.6 Gate M test matrix [PROPOSAL]

| Check | Where |
|---|---|
| Parity: the same input through the publisher Lambda and the repo release gives byte-identical bounds (build-bounds.ts) | vitest + CI |
| Contract tests: current.json (three pins) and the manifest schema, in TypeScript and Python | vitest, pytest |
| IAM: admin-api cannot write `game-data/`; publisher cannot write `pictures/` store | policy tests / plan review |
| Concurrency: two publishes; one wins, the other gets a clean conflict | pytest with moto |
| Migration: a run saved before Gate M (null manifest pin) resumes on `m1` | pytest + player test |
| Delete guard: a picture in a draft or published manifest cannot be deleted | pytest |
| Fallback: a manifest URL that 404s loads the repo sprite | player test |
| End to end (after release, you run it): draft -> publish -> new run pinned -> rollback -> old run resumes on its pins; mark a version invalid -> resume ends gracefully | release smoke |

## 4. Architecture choice

A = runtime publish (portal -> publisher Lambda -> S3, live in minutes). B = portal exports a bundle -> git PR -> CI ->
owner-dispatched release.

| Criterion | A: runtime publish | B: repo PR + release | Winner |
|---|---|---|---|
| Owner speed, fewest clicks | Draft, test, approve, publish. All in the portal | Portal, then merge, then dispatch release, then approve prod-apply. Not "entirely from the portal" | A |
| Child safety (5-7) | Owner art approval with checklist + parsers + G-15 + bank readiness + headless sim at publish | Same checks + a PR diff review | Tie on checks; B adds a second look |
| Fit with ADRs | Amends spine S5.1, B §B5.3 D-T10, ADR-0010 / H §H.8.5, G-8 and the data freeze | Small amendment: only the authoring tool changes; G-8, freeze, rollback inherited | B |
| Effort | Node publisher Lambda, IAM, invalidation, current.json ownership, retire states (L) | Importer + PR CI trigger (S-M); ci.yml has no `pull_request` today [VERIFIED ci.yml:6-8] | B |
| Rollback | New current.json pointing at earlier versions: live within max(edge TTL, CURRENT_TTL_SECONDS); files immutable, saved runs keep pins | git revert + release, or rollback by release_id | A |
| History | GDPUBLISH audit rows + export archive | git | B |
| Offline Gate K | Same-origin immutable files, pinned per run: fine | Same: fine | Tie |

**Recommendation: A, with B's guardrails** [PROPOSAL].
- You asked for "entirely from my admin portal" and you prefer speed. Only A delivers that.
- B's real advantages are checks and history, not the PR. A copies them: the same game-core parsers and G-15, bounds only from
  the publisher, create-only files in an `a<n>` namespace, conditional writes, a publish audit row, an export archive for
  backup, an SSM kill switch for the freeze, and the release never clobbering current.json.
- The ADR cost is paid once, in one new ADR that amends S5.1, D-T10, ADR-0010 and the G-8/freeze rules, and defines retire and
  invalid handling.
- Pictures (Part 1 and the avatar library) are runtime under either choice.

## 5. Proposed gate plan [PROPOSAL; you settle placement]

| Order | Gate | Adds |
|---|---|---|
| 1 | P (approve) + P2 | 42c-42d kind presets (or fold into P before approval) |
| 2 | I (45-48) | Content, unchanged |
| 3 | E (24-28) | Unchanged. Its roster and per-alien art work removes some hard-codes the makers need |
| 4 | F (29-34, 43-44) | + avatar library (1 phase) |
| 5 | J (50-56) | Unchanged. Spike the headless balance bot here (Phase 50 reruns the sim anyway) |
| 6 | **M (new, makers)** | M1 publisher + infra + ADR (current.json pins, conditional writes, readiness gate, retire states, audit); M2 asset manifest, frame sets, `m1` migration, de-hard-coding, extended delete guard (Phase 64 shrinks to atlas and performance); M3 map editor; M4 wave-set / challenge editor with test play and preview route; M5 alien maker (after animation spike). Checks in 3.6 |
| 7 | L (64-74) | Kill switch set in the Phase 74 freeze; G-8/G-9 check it; Phase 71 rollback rehearsal includes an admin-data rollback; backup/restore of admin data; maker maps in the accessibility pass |
| 8 | K (57-63) | Precache list = pinned manifest + admin game data, under a per-manifest byte cap |

Why M after J: the ruleset and campaign schemas keep growing through E and J; a maker built earlier chases them. Why before L:
L's freeze, G-8/G-9 and rollback must cover admin data. Alternative: M after launch, beside K.

Defer past launch: tower maker, boss re-skins, badge maker (unless Phase 52 is done in time), new planets and multi-planet
current.json (later scope), generated or composed backdrops, non-20x11 grids.

## 6. Decisions you need to make

1. **Fold P2 into Gate P before approval?** Recommend yes; ADR-0026 and ADR-0031 are still Proposed.
2. **Architecture for makers.** Recommend A with B's guardrails (section 4).
3. **Scope change.** Makers go beyond "content administration only" (B §B1.2) and authoring automation is later scope
   (B §B2.2). Recommend recording it as [CONFIRMED by owner, date], limited to operator-only tools (never child-facing,
   B §B2.1).
4. **What makers feed in v1.** Recommend planet-1 wave sets and challenges only; new planets after launch (prompt.md:143).
5. **Balance gate.** Recommend the headless game-core sim at publish, blocking (per age band if difficulty varies by band);
   Python sim advisory for admin data.
6. **Source of truth for game data.** Recommend: repo seeds (including manifest `m1`), then the portal owns `a<n>` versions and
   current.json (now three pins); the release stops overwriting current.json.
7. **Grid.** Recommend fixed 20x11.
8. **Leftward route segments.** Recommend draw a `route-straight-l` tile (cheap mirror of route-straight-h) rather than forbid.
9. **Outline widths that disagree with STYLE.md.** Bosses: STYLE.md says 14, files use 10/8/5. Planet: STYLE.md:72 says 11,
   planet-luna-1 uses 12 and its comment says 11. Recommend the files win and STYLE.md and the planet comment are corrected.
10. **Animation for maker characters.** Recommend derived transforms, after a 1-day spike that covers every renderer state.
11. **Gate M placement.** Recommend after J, before L.
12. **Generation orchestration for makers.** The single picture-gen Lambda stays for one-picture jobs
    [CONFIRMED by owner, 2026-11-16]. If a maker needs multi-step generation (frame 01, then matching frames in parallel, an
    automatic check, a wait of days for your approval, then publish), use Step Functions for that pipeline (fan-out and
    human-wait are what it does well), with the Lambda as a step. Recommend deciding at the M5 animation spike: if frames are
    derived in code (decision 10), no state machine is needed.
13. **Where kind prompts live.** (a) Code files: every style tweak is a release, reviewed at a gate. (b) An editable, versioned
    `KINDPROMPT#<kind>` item in the portal: the worker reads it, pins the version on PICJOB, each change writes an audit row and
    changes the cache key. Recommend (b) for the style text and examples, with the core safety rules and the per-kind safety
    line kept in code so they cannot be edited away.
14. **Drawing cap for makers.** Recommend makers share the 150/month cap, with the remaining count shown in every maker; revisit
    a sub-cap or a higher cap (ADR-0031 amendment) if Gate M use runs short.
15. **Visual preview of drafts.** Headless test play only, or also an admin-only player preview route (no run, bounds or
    rewards; AC-04). Recommend the preview route in M4.
16. **Retire and invalid handling.** Recommend: retired versions keep resuming; invalid versions end resumed runs gracefully,
    keep progress and never count as a loss. Recorded in the new ADR.

## 7. Risks and unknowns

Risks
- **Balance bypass.** Admin data skips the Python simulator and code review (I §I.5). Headless sim + approval is weaker than
  today [PROPOSAL mitigation].
- **Bounds trust.** Bounds must come only from the publisher, never the browser (spine S6, ADR-0005).
- **Release collision.** Repo and admin versions could collide, and the release overwrites current.json today
  [VERIFIED publish_static.py:249]. Mitigation: `a<n>` namespace, conditional counter, If-Match and write-if-absent.
- **Bank shortfall.** A wave set with more learning moments could stop new games starting. Mitigation: readiness check blocks
  publish.
- **Broken pictures.** Deleting a picture used by a manifest would break pinned and offline runs. Mitigation: extended delete
  guard and runtime sprite fallback.
- **Expectation gap.** "Character maker" cannot add behaviour. The UI must show only what the current mechanics support.
- **Off-style or unsuitable art.** Kind examples, the safety line and mandatory owner approval with a checklist; the sanitiser
  cannot catch drawn letters or unsuitable imagery [VERIFIED ADR-0031].
- **Cap exhaustion.** Makers can use the 150/month cap in a few entities. Mitigation: derived frames, visible count, decision 14.
- **Mixed release.** admin-api and picture-gen out of step loses cap charges [VERIFIED handler.py:308,492].
- **Schema churn.** Building makers before E and J finish means rework.

Unknowns
- [UNVERIFIED] Bedrock minimum cacheable prefix and tokens per kind block. Check: count_tokens in 42c.
- [UNVERIFIED] Bedrock EU Opus 5.5 pricing. Check: AWS pricing page.
- [UNVERIFIED] Quality of derived animation frames. Check: 1-day spike.
- [UNVERIFIED] Whether a placement bot gives a useful "winnable" signal. Check: spike during J.
- [UNVERIFIED] CloudFront TTL on `/game-data/current.json`. Check: cache policy passed to the static_site module.
- [UNVERIFIED] game-core bundles cleanly into admin-web. Check: admin build with an import.
- [UNVERIFIED] Whether difficulty varies by age band. Check: `contracts.generated.ts` and C §C15.
- [UNVERIFIED] Browser storage quota for offline prep with maker art. Check: Gate K spike.
- [UNVERIFIED] Feasibility and cost of one generated full backdrop. Check: one test drawing after the size parameter exists.
- [UNVERIFIED] Which activity SVGs are scenes for the activity-scene examples. You pick.
