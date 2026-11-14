# ChatGPT asset prompt pack — Moonbeam Colony (working title "Space Colony Defence")

**Status:** prompts for the owner to paste into ChatGPT image generation. Nothing in this pack has been generated yet.
**Sources:** `prompt.md` (ASTRONAUT ROSTER, ALIENS, CARRIERS AND BOSSES, CAMPAIGN, ART AND AUDIO ASSET PLAN, screens, exclusions),
plan section D10 (`docs/plan/D-ux-and-content-operations.md`) and plan section C (`docs/plan/C-game-and-learning-design.md`: map, classes,
aliens, bosses, meteor powers, badges, challenges).
**Scope:** every image asset in the inventory, including the ones that should be drawn as SVG or in code. Those are marked so you do not spend
time asking ChatGPT for something it does badly. Sounds and phonics clips are not covered here.

Contents

1. How to use this pack
2. The STYLE BIBLE (paste at the start of every conversation)
3. Shared guides: frame poses, edit follow-ups and the master reference images
4. Prompt cards
   - 4.1 Astronauts (Nova, Pip, Juno, Orion, Mira, Sol)
   - 4.2 Aliens, carrier and descendants
   - 4.3 Trait icons
   - 4.4 Bosses
   - 4.5 Effects (class effects, shared effects, feedback)
   - 4.6 Meteor powers
   - 4.7 Map, pads, colony and decorations
   - 4.8 Planets
   - 4.9 UI icons (mostly SVG)
   - 4.10 Badges
   - 4.11 Avatars
   - 4.12 Screens and illustrations
   - 4.13 Activity pictures
5. Post-processing checklist
6. Licensing, usage and provenance
7. Coverage index (every inventory id)

---

## 1. How to use this pack

### 1.1 The workflow in one paragraph

Open a **new ChatGPT conversation for each asset family** (one per astronaut class, one for aliens, one for bosses, and so on; section 1.3
lists them). Paste the **STYLE BIBLE** (section 2) as the first message, then attach the **style anchor** image (section 3.3) and ask for
the family's **master reference** (for example Nova's character sheet). After that, paste the cards in this pack one at a time, **one
asset per image**, attaching the master reference each time. Download each image you accept, name it after the asset (section 1.6) and
note the date and prompt (section 6).

### 1.2 Rules that save the most time

| Rule | Why |
|---|---|
| **One asset, one image.** Do not ask for sprite sheets, frame grids or "four poses in one picture". | Image models do not keep characters, sizes and spacing identical across a grid. You get four slightly different characters that will not line up. The only exceptions are reference sheets (never shipped) and the decoration sheets in 4.7 that you cut up. |
| **Attach the reference image every time.** | ChatGPT keeps a conversation's style better when it can see the reference, and long conversations drift. |
| **Change one thing per follow-up.** | "Make the lens bigger" works, but "make the lens bigger, change the pose and add a badge" usually redraws the whole character. |
| **Ask for a transparent background, then check it.** | Sometimes the model paints a grey-and-white checkerboard instead of real transparency. See 1.5. |
| **Generate big, then shrink.** | Draw at 1024 px or more and downscale to the sizes in each card. Never upscale small sprites. |
| **Reject anything with letters, numbers or logos.** | Rule 1 of the style bible. AI likes adding fake writing to flags, maps, shops, boxes, buses, mugs, screens and badges. |
| **Start a new conversation when it drifts.** | After about 15 to 20 images the style often wanders. Start fresh: STYLE BIBLE, then the style anchor and the master reference. |

### 1.3 One conversation per asset family

| # | Conversation | Attach | Cards |
|---|---|---|---|
| 0 | Style anchor | nothing | 3.3 |
| 1 | Nova | style anchor | 4.1 Nova |
| 2 | Pip | style anchor + height guide | 4.1 Pip |
| 3 | Juno | style anchor + height guide | 4.1 Juno |
| 4 | Orion | style anchor + height guide | 4.1 Orion |
| 5 | Mira | style anchor + height guide | 4.1 Mira |
| 6 | Sol | style anchor + height guide | 4.1 Sol |
| 7a | Aliens, part 1 | style anchor | 4.2 line-up, then Moon Blob to Bubble Guard (with bubble layers and bubble pop) |
| 7b | Aliens, part 2 | style anchor + accepted line-up | 4.2 Patchling to Alien Craft release |
| 7c | Trait icons | style anchor + accepted line-up | 4.3 |
| 8a | Bosses: King Wobble and Captain Clank | style anchor + the matching alien | 4.4 Wobble and Clank cards |
| 8b | Bosses: Queen Bubbla and The Mothership | style anchor + the matching alien + one accepted boss from 8a | 4.4 Bubbla and Mothership cards |
| 8c | Bosses: The Great Glorp and boss effects | style anchor + accepted Wobble and Clank sprites | 4.4 Glorp cards, `fx.boss.arrive`, `fx.boss.phase` |
| 9a | Class effects | style anchor | 4.5 `fx.nova.beam` to `fx.sol.buffed` |
| 9b | Shared and feedback effects | style anchor + one accepted 9a effect | 4.5 `fx.upgrade` to `fx.correct-sparkle` |
| 10 | Meteor powers | style anchor | 4.6 |
| 11 | Map, colony, pads and decorations | style anchor | 4.7 |
| 12 | Planets, screens, logo emblem | style anchor + astronaut sheets | 4.8, 4.12 |
| 13 | Badges | style anchor + the badge template result | 4.10 |
| 14 | Avatars | style anchor + the first avatar | 4.11 |
| 15 to 17 | Activity pictures (split into batches of about 15) | the first accepted picture | 4.13 |

The large families are split (7a to 7c, 8a to 8c, 9a and 9b) so that no conversation goes much past 15 to 20 images. Every split
conversation starts the same way: the STYLE BIBLE, the style anchor, and the family's accepted references (the alien line-up, the previous
boss, an accepted effect).

**Height guide** (for conversations 2 to 6): once Nova's L1 sprite is accepted, make `art/source/astronauts/height-guide.png` by filling
her three-quarter sprite with flat night blue #23295E (as for the locked cards). Attach that plain silhouette for scale, **never Nova's
sheet**: ChatGPT copies faces and hair from attached people, and the other five would drift towards Nova.

Order of work: 0, then 11 (map and colony, so you can test the look on the battlefield), then 1 (Nova) and 7a (Moon Blob). That is enough to
replace the Milestone 1 placeholders for the first waves. Everything else can follow when needed (the spec says art must not block the
first playable slice).

### 1.4 Canvas sizes to ask for

ChatGPT image generation offers three canvas shapes. Ask for one of these in every prompt (the cards already do):

| Canvas | Use for |
|---|---|
| **1024 x 1024** (square) | characters, aliens, bosses, icons, badges, avatars, activity pictures, most effects |
| **1536 x 1024** (landscape) | backdrop, galaxy background, landing hero, wide effects (beams, tracers), reference sheets |
| **1024 x 1536** (portrait) | **every Sol sprite** (all levels and frames; display frame 128x192, author 256x384), tall effects |

Then downscale to the **author size** (2x the display size) given on each card, for example 1024 → 256 for a 128 px sprite. The backdrop is the
one exception: see its card (4.7) for how to reach 3840 x 2112.

**Fix the canvas before level 1 and never change it within a chain.** An L2 or L3 edit on a different canvas rescales the character and
breaks "same size and position". Sol uses 1024x1536 from L1 onwards. Juno and Orion are drawn at L1 with the figure filling only about
65% of the canvas height, so their L2 and L3 equipment has room to grow at the top-right without cropping or shrinking the body.

**Outline weight by author size.** The outline must end up about 4 px thick at the final author size, the same for every family (D10.1).
Each card states the thickness to draw at 1024 px:

| Author size | Examples | Outline to ask for on a 1024 px image |
|---|---|---|
| 768 | bosses, colony, colony shield, boss effects | about 6 px |
| 512 to 576 | Alien Craft, portal, planet, meteor offer art, large effect rings | about 8 px |
| 256 | astronauts, medium aliens, pads, badges, avatars, power icons, activity pictures, most effects | about 16 px |
| 128 | Meteor Mite, Slimelet, small effects, lamp and flag | about 32 px ("very thick, bold outline") |
| 64 | Bubble Swarm bubble, trait icons, buffed chevron | about 48-64 px, or redraw as SVG |

### 1.5 Transparent backgrounds

1. Every card that needs transparency says "transparent background (PNG with alpha)". Download as PNG.
2. Open it in an editor (GIMP, Krita or Photopea are all free) and check the background really is empty, not a painted checkerboard.
3. If it is painted, reply: *"The background is a painted checkerboard. Regenerate with a truly transparent background, nothing behind the
   subject."* If that still fails, use a key background instead of grey (a pale grey would eat suit white #F4F1EA, frost #CFF6FF, the
   cream route and cream glows):
   - **Opaque subjects** (characters, aliens, pads, buildings, icons): ask for *"a flat pure green #00FF00 background, no gradient, no
     shadow"* (use *"flat pure magenta #FF00FF"* for green or lime subjects such as Mira, the Split Slime or the Slimelet). Neither colour
     is in the palette. The thick plum outline makes a flood-select of everything outside it reliable.
   - **Glows and translucent effects** (shield dome, bubbles, teleport beam, frost haze, laser glow, halos, sparkle rings): keying a flat
     colour cannot recover see-through areas. Generate them *"on a flat pure black #000000 background"* and either render them in the game
     with additive or "screen" blending, or convert black to alpha in the editor ("colour to alpha" in GIMP or Krita).
4. Look closely at the edges against both a black and a white background. Remove any grey or green halo (5.1).

### 1.6 File names and folders

The inventory ids use dots (`class.nova.l1.idle`), but the asset manifest pattern (D10.1, spine S9.5) is `^[a-z0-9-]{1,40}$` with no dots,
and D10's own ids use hyphens. **Name files with the hyphenated D10 id that each card gives on its "File" line.** Animation frames follow
D10.1: `<assetId>-<anim>-<nn>.png`, for example `nova-l2-attack-03.png`.

Where D10 does not name an asset (it is marked "proposed name" on the card), the hyphen name on the card is a suggestion. Add it to D10 when
you adopt it.

Suggested folders (none exist yet; create them when the player app is scaffolded):

| Folder | What goes in it |
|---|---|
| `art/source/<family>/` | the full-size originals straight from ChatGPT, plus the edited masters. Decide whether these go in git (they are large) or in private storage. |
| `web/player/public/assets/luna-1/` | Moonbeam Colony map, colony, pads, decorations (later packed into `atlas-luna-1`) |
| `web/player/public/assets/common/` | astronauts, aliens, bosses, effects, powers (later packed into `atlas-common`) |
| `web/player/public/assets/ui/` | icons, badges, avatars, logo, planets, screen art |
| `web/player/public/assets/activity/` | activity pictures, counting objects, shapes |
| `docs/art/provenance.csv` | one row per accepted image (section 6) |

These paths are a proposal. Section E (architecture) owns the final layout and the asset manifest.

### 1.6a Getting your images into the app

**Your only job:** save every image you accept, at the full size ChatGPT gave you, as `art/source/<family>/<file>`. The exact path for
each image is the `rawPath` in the catalogue (below). For animations, save each frame (`-01`, `-02`, …) next to frame 01. You do not need
to trim, resize or export anything by hand once the build tool exists. (Until then, section 5 is the manual route.)

**The catalogue** [`docs/art/asset-catalogue.json`](asset-catalogue.json) is the single list that the game and the tools read. It has one
entry per image file you produce (an animation is one entry with a frame count), and for each one: the card it comes from, the
ChatGPT conversation and canvas, the author and display size, the anchor point, how its background is removed, which atlas it goes in and
whether it is in the first group to replace (`"required": "M1"`: art the Milestone 1 slice shows on screen; M1 itself ships with
labelled placeholders, so this means "replace these placeholders first", not "blocks Milestone 1"). Its `rules` block explains every field. If you rename a file or add an
asset, change the catalogue in the same commit.

**The build tool** (`tools/art`, to be built in a later build phase) reads the catalogue and, for each file it finds in `art/source`:

1. trims it and removes the background where the catalogue says so (green or magenta key, or black-to-alpha for glows). Where the
   subject has both lime and magenta (`"transparency": "alpha-required"`), it does not key: it reports the file if it has no real
   transparency, and you regenerate it or cut it out by hand;
2. resizes it to `authorSize` (the 2x master the game ships);
3. packs the sprites into `atlas-common` and `atlas-luna-1` and copies the rest into `web/player/public/assets/…`;
4. writes the game's `asset-manifest.json`.

**Art never blocks building.** Until an image exists, the game draws a labelled placeholder (a coloured shape with the id on it) of the
same size and anchor, so the code works the same before and after the real art arrives.

**Ticking progress:** an image is done when its file is in `art/source` (for an animation, every frame). The tool can list what is still
missing; there is no separate checklist to keep up to date. Record each accepted image in `docs/art/provenance.csv` as well (section 6).

**Git and `art/source`:** the originals are large (full-size PNGs, several hundred files with all the animation frames). Two options:

| Option | Good | Cost |
|---|---|---|
| Commit with **Git LFS** | Originals versioned with the catalogue; a fresh clone can rebuild every asset | LFS storage and bandwidth quotas; **if the repo is public, every original becomes public**, including rejected-but-kept edits and reference sheets |
| **Keep out of git** (add `art/source/` to `.gitignore`, back it up privately, for example to a private S3 bucket) | Nothing large or unreleased is published | A fresh clone cannot rebuild the art; the built files in `web/player/public/assets/` must then be committed or restored from the backup |

The shipped (built) images are public anyway once the site is live. If the repo is or will be public, prefer keeping `art/source` out of
git; otherwise Git LFS is the simpler choice.

### 1.7 Keeping characters consistent

1. **Master reference first.** For each astronaut, generate the character sheet (front, three-quarter and back views on one image) before
   any game sprite. This is the one place where a multi-view image is fine, because it is never shipped. Pick the best one and keep it.
2. **Level 1 first, then edit up.** Level 2 and level 3 are image edits of the accepted level 1 sprite: "same character, change only X". Do
   not prompt them from scratch.
3. **Key pose first, then frames.** Each animation card asks for one key pose. The other frames are either small edits of that pose made in
   ChatGPT (section 3.2) or, usually quicker and more consistent, nudges you make yourself in the editor (move, squash, rotate a part).
4. **Use ChatGPT's edit tool** (select an area of the image and describe the change) when only part of a picture should change, such as
   the lens, a patch or a door.
5. **Compare at game size.** Shrink every candidate to its display size (128 px for an astronaut) next to the others before accepting it.
   If you cannot tell the classes apart at that size, reject it.

### 1.8 Iterating with short follow-ups

Short follow-up messages work better than rewriting the whole prompt. Useful ones:

- "Same image, but remove all text and symbols from the flag."
- "Same character and pose; make the outline thicker and match the reference."
- "Keep everything; make the alien's expression cheekier and less grumpy."
- "Too detailed for 128 px. Simplify: fewer small parts, bigger shapes."
- "Keep the design; turn it to face three-quarter towards the viewer's right, like the reference."
- "Light should come from the top-left, like the reference. Fix the shading only."
- "The background is not transparent. Regenerate with a transparent background."

If three follow-ups have not fixed it, start again from the card's full prompt.

---

## 2. The STYLE BIBLE

Paste this whole block as the **first message of every new conversation**. In the cards, the line `[STYLE BIBLE]` means: "follow the
style bible from the start of this conversation". If you use a card in a conversation that does not have it yet, paste the block in place
of that line.

```text
STYLE BIBLE — follow this for every image in this conversation.

PROJECT
Original 2D cartoon art for a children's educational tower-defence game (players aged 5 to 7). Six friendly astronauts protect a
cheerful research colony on a purple moon from silly, mischievous, harmless aliens. Nothing is ever hurt: defeated aliens "pop" into
a burst of stars.

LOOK
- Bright, cheerful, rounded, chunky, toy-like. Characters are about 2.5 heads tall with big heads, big friendly eyes and simple hands.
- Big clear silhouettes that still read when shrunk to 64-128 pixels. Few small details; no tiny patterns, no fine texture.
- Cel-shaded flat colour: one base colour, one soft shade and one highlight per area. No photorealism, no grain, no painterly texture,
  no lens flare, no motion blur, no depth of field.
- Uniform thick outline in dark plum #2A1E3D on every object, so that it is about 4 px thick once the image is shrunk to its final
  size; thinner inner lines in the same colour. Each prompt states the thickness to draw on the 1024 px image; if it does not, draw
  about 16 px.

VIEW AND LIGHT
- Three-quarter top-down view: the camera looks down at about 50 degrees, the same angle for characters, pads, the colony and the map.
- GROUND PLANE: anything lying flat on the ground (pads, rings, auras, shadows, dust puffs) is drawn as an ellipse exactly 4 wide : 3
  tall. Path tiles are flat squares seen from above.
- Characters and aliens face three-quarter towards the viewer, turned slightly to the viewer's RIGHT (the game mirrors them for left).
- One light from the TOP-LEFT. Shade on the bottom-right of every form. No cast shadows on the ground unless asked; the game adds them.

PALETTE (stay close to these)
- Space: deep space #141633, night blue #23295E, nebula violet #5B3F99.
- Moon ground: regolith lavender #9C8FD6, regolith purple #6B5CA5, crater shade #4A3F7A, teal accent #3FB8AF.
- Neutrals: suit white #F4F1EA, metal grey #A7B0C8, highlight cream #FFF4D6, outline plum #2A1E3D.
- Astronaut signature colours: Nova orange #FF8A2A; Pip ice blue #8ED8FF; Juno sunshine yellow #FFD23F; Mira leaf green #3DBE6E;
  Orion navy #2E4A9E with star gold #FFD86B; Sol red #E2403A with gold #F5B700.
- Aliens: blob blue #5AA9F0, lime #9BE564, magenta #E05FD0, bubble cyan #9FF3FF, lilac #B98AF0, peach #FFB38A,
  rock orange #D08A55, shell teal #2FA39A, patch cream #F7F0E0 (with a lilac-pink cheek blush).
- Effects: frost #CFF6FF, comet gold #FFC94A, shield cyan #5BE0F0, healing green #7BEA8C; star bursts use the palette colours.

RULES (never break these)
1. NO TEXT. No letters, words, numbers, digits, numerals, symbols that look like writing, logos, signatures, watermarks, captions,
   speech bubbles or user-interface elements anywhere in the image. Patches, flags, screens and signs are plain shapes and colours.
2. FRIENDLY, NOT VIOLENT. No realistic weapons, guns, swords, blood, wounds, skulls, fire, smoke clouds of destruction or debris.
   Astronaut equipment is toy-like science gear; "lasers" are soft glowing beams of light. Nothing is pointed at the viewer, and
   nothing is held, shouldered or braced like a gun, rifle or bazooka.
3. NOTHING SCARY. Aliens are cheeky and silly: rounded, big eyes, small smiles or grins, no fangs, no claws, no angry eyebrows,
   no slime dripping in a gross way. Bosses are big and funny, not menacing.
4. ORIGINAL. No resemblance to any existing game, film, TV show, toy, mascot, brand, franchise or real person. No national flags,
   space-agency logos, real mission patches or real spacecraft.
5. INCLUSIVE. The astronauts differ in skin tone, hair, face shape and gender presentation, and all look capable and kind.
6. COLOUR-BLIND FRIENDLY. Every astronaut class and every alien is recognisable by silhouette and equipment shape first and by
   colour second. Never rely on red versus green alone.
7. OUTPUT. One subject per image unless asked, centred, filling about 80% of the canvas with even padding, nothing cropped.
   Transparent background (PNG with alpha) unless the prompt says otherwise. No ground, scenery, frame, border or vignette
   unless asked.
```

---

## 3. Shared guides

### 3.1 Cast sheet (who looks like what)

These descriptions are used word for word in the astronaut cards. They follow the spec's identities (prompt.md roster) and D10.3. The
appearances (skin, hair and so on) are proposals: change any of them before generating, then keep them fixed.

| Class | Signature colour | Silhouette and equipment (the thing you must see at 64 px) | Person (proposal) |
|---|---|---|---|
| **Nova** — Laser Scout | orange #FF8A2A on white | round bubble helmet with a big bright orange-tinted visor rim; compact toy laser gadget held out in **one hand like a torch**, with a **round lens** at the front; a **diagonal orange chevron stripe** across the chest | young woman, fair skin with rosy cheeks, black curly hair in two puffs inside the helmet, big grin |
| **Pip** — Frost Explorer | ice blue #8ED8FF | **two round cooling canisters** on the back like bubbles; snowflake emblems; short frost wand with a **snowflake tip** | young man, pale skin with freckles, tufty ginger hair, round cheeks |
| **Juno** — Comet Engineer | sunshine yellow #FFD23F | **goggles** on top of the helmet; a chunky round toy **comet popper mounted on her backpack**, a short fat **funnel pointing straight up** over her shoulder that lobs comets in a high arc; she presses a big round button on a hand controller | young woman, light-brown skin, straight black bob, confident smile |
| **Orion** — Orbit Ranger | navy #2E4A9E with gold stars | **long telescope**, much longer than any other kit, held like a stargazer's telescope (tilted up, never shouldered or aimed level); star pattern on the suit | young man, olive skin, wavy dark hair, thoughtful look, small bright hearing aid |
| **Mira** — Shield Specialist | leaf green #3DBE6E on white | **large shield emblem across the chest**; small handheld **dish emitter** like a mini satellite dish | woman, medium-brown skin, dark hair in a neat bun, round glasses, calm smile |
| **Sol** — Beacon Commander | red #E2403A and gold #F5B700 | **tall antenna with a glowing beacon bulb rising from the backpack**, taller than the helmet; one hand raised in encouragement | older man, dark-brown skin, short grey beard, warm grin |

Under red-green colour blindness (deuteranopia) Nova, Juno, Mira and Sol all turn mustard or khaki (Nova #FF8A2A → about #C8B328,
Juno #FFD23F → #F5DC48, Mira #3DBE6E → #AEA373, Sol #E2403A → #988934). Each must therefore be identified by a unique silhouette
element: **Nova** the single torch-like gadget plus the diagonal chevron stripe on the chest; **Juno** the upward funnel on the backpack
plus the goggles; **Mira** the chest-wide shield; **Sol** the tall antenna. Nova and Mira (colour panels on a white suit, small gadget
in front) are the closest pair, so check them side by side (5.2).

### 3.2 Frame poses

ChatGPT makes one image at a time, so each animation card asks for **one key pose** (frame 01 or the "action" frame). Make the other frames
by one of these two methods:

- **Method A (recommended for idles, bobs and simple loops): edit in your image editor.** Duplicate frame 01 and nudge it: move the body
  down 2-3 px (at 256 px), squash 3%, tilt a part. This keeps the character identical, which an AI redraw will not.
- **Method B (for poses that genuinely change): ChatGPT edit.** Attach the accepted key pose and send:

```text
[STYLE BIBLE]
Attached is frame 01 of an animation. Make frame <NN> of <TOTAL>: <pose from the table below>.
Keep EXACTLY the same character, colours, outline, size, scale and camera angle. The feet stay at the same spot at the
bottom-centre of the canvas so the frames line up. Change only the pose described. Transparent background, same canvas
as frame 01. No text, letters or numbers.
```

Then line up the frames in your editor using the feet (bottom-centre pivot) as the anchor.

| Animation | Frames | Pose for each frame (12 fps) |
|---|---|---|
| **Idle** (astronauts) | 4 | 01 neutral standing · 02 breathe in: body 2% lower, knees softly bent · 03 neutral · 04 small rise, head turns a touch to look along the path |
| **Attack, 4 frames** (Nova, Pip) | 4 | 01 wind-up: tool lifted · 02 zap: bright glow at the tip · 03 a small happy bounce, glow fading · 04 recover to ready |
| **Attack, 6 frames** (Juno, Orion) | 6 | 01 ready · 02 lift (Juno reaches for the button; Orion tilts the telescope up) · 03 knees bend a little · 04 zap / launch (glow at the lens or puff from the funnel) · 05 a small happy bounce · 06 recover |
| **Emit** (Mira) | 4 | 01 emitter lowered · 02 emitter raised towards the colony · 03 dish glows cyan · 04 lower again |
| **Pulse** (Sol) | 4 | 01 beacon dim · 02 beacon brightening, hand raised · 03 beacon at full glow · 04 dimming |
| **Walk** (aliens) | 6 | 01 contact (stretched forward) · 02 down (squashed) · 03 passing (neutral) · 04 up (stretched tall) · 05 contact (the other side) · 06 passing |
| **Bob / hop** (Bubble Swarm, Slimelet) | 4 | 01 low (squashed) · 02 rising · 03 top (stretched) · 04 falling |
| **Fly / hover** | 6 | wings or body move through 6 even steps of one flap or bob: up, up-mid, mid, down-mid, down, back to mid |
| **Effect bursts** | 6 or 8 | grow from a tiny spark (01) to full size around the middle frame, then fade and break up into small stars (last frame nearly empty) |

For effects, the easiest route is one ChatGPT image at **full size**, then build the frames in the editor by scaling up (early frames) and
fading out (late frames). Many effects can also be drawn in code; the cards say when.

### 3.3 Master reference: the style anchor (conversation 0)

**Purpose:** one image that fixes the outline weight, palette, light direction and camera angle for the whole game. Attach it to every
other conversation. It is not shipped.
**File:** `art/source/style-anchor.png`

```text
[STYLE BIBLE]
Make a STYLE ANCHOR reference image for this game. Landscape 1536x1024.
Scene: a small patch of purple moon ground (regolith lavender and purple, a few soft round craters) seen in the three-quarter
top-down view. On it, left of centre, a round metal build pad with soft glowing rim lights (an ellipse 4 wide : 3 tall). Standing
on the pad is a friendly generic astronaut with an opaque mirrored orange visor (face not visible), white suit with orange
#FF8A2A panels, holding a small toy-like gadget with a round lens out in one hand like a torch. Right of centre, walking along a
smooth glowing moon-dust path towards the right, a wide, flat-bottomed dome-shaped blue jelly alien (#5AA9F0), clearly wider than
tall, with two short stubby round-ended bobble antennae, three lighter crater-like spots on its back, big eyes and a cheeky grin.
Light from the top-left. Uniform thick dark plum outline on everything, about 10 px thick.
Plain deep space (#141633) sky band along the top edge with a few stars.
No text, no letters, no numbers anywhere.
```

**Accept when:** the outline is thick and even, light clearly comes from the top-left, the camera angle is clearly from above (you can see
the top of the pad), colours are close to the palette, nothing has writing on it.
**Reject if:** realistic or painterly rendering, a side-on (platformer) view, a scary alien, any letters or numbers, a recognisable
existing character.

---

## 4. Prompt cards

Each card gives: the inventory **id**, the **file** name (hyphenated D10 id), size and transparency, the **purpose**, the **prompt** to
paste, and **Reject if** (what to send back). Sizes are display size, then author size (2x) in brackets. Pivot is bottom-centre for
characters and aliens and centre for effects and icons (D10.1).

Cards marked **SVG / code — not ChatGPT** are listed so the inventory is complete. Their "prompt" is only an optional reference sketch to
copy; the shipped version should be drawn as vector or in code because exact geometry or alignment matters.

---

### 4.1 Astronauts

Six classes, each with three levels. Every level must **look upgraded at 128 px**: the equipment grows and gains parts, and the suit gains
insignia. Faster attacks are shown by animation timing, not art.

Order in this section follows the unlock order in plan C5.9 (Nova at the start, then Pip after wave 5, Juno 10, Orion 15, Mira 20, Sol 25).
Size for every astronaut sprite: **128 px frame, about 96 px footprint (author 256)**, transparent, pivot bottom-centre (Sol: a taller 128x192
frame, author 256x384; see his section).

The upgrade pattern is the same for every class:

| Level | Equipment | Suit | Extra |
|---|---|---|---|
| L1 | small, simple | plain suit in the signature colour | — |
| L2 | clearly bigger, one added part | one insignia (a simple star patch, no letters) | — |
| L3 | biggest, glowing accent | more insignia (shoulder stripes and a badge shape) | the class's L3 extra (fin, aura, wrench, visor, dish) |

---

#### Nova — Laser Scout (conversation 1)

##### Master reference: Nova character sheet (not shipped)

**File:** `art/source/astronauts/nova-sheet.png` · 1536x1024 · plain background is fine

```text
[STYLE BIBLE]
Character reference sheet for this game's Laser Scout astronaut. Landscape 1536x1024, plain light background.
Show the same character three times side by side at the same size: front view, three-quarter view facing the viewer's right,
and back view. Use the attached style anchor ONLY for style, outline, angle and height; the astronaut in it is a generic
stand-in, and this character has the face, skin and hair described here.
The character: enthusiastic young explorer; young woman with fair skin and rosy cheeks, black curly hair in two puffs, big grin, inside a
round glass bubble helmet with a bright orange visor rim. White spacesuit with orange #FF8A2A panels on the knees and boots, a
bold diagonal orange chevron stripe across the chest, small backpack. She holds a compact, toy-like laser gadget out in ONE hand
like a torch, the other hand free: a short rounded orange and white body with a small round glowing lens at the front, like a
science gadget, clearly not a gun.
Chunky toy proportions, about 2.5 heads tall. Thick dark plum outline, light from the top-left.
No text, letters or numbers anywhere, including on the suit.
```

Reject if: the laser looks like a real gun or is held in both hands like one, the chevron stripe is missing, the face or hair changes
between views, any writing or logo appears on the suit.

##### `class.nova.l1.idle` — Nova L1 idle

**File:** `nova-l1-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames (guide 3.2, Idle, method A)
**Purpose:** Nova deployed on a pad at level 1.

```text
[STYLE BIBLE]
Using the attached Nova character sheet, draw Nova as a single game sprite. Square 1024x1024, transparent background.
Level 1 Nova: exactly as on the sheet. Plain suit with no badges. Small round lens on the laser.
Pose: relaxed ready stance, standing, feet together at the bottom-centre of the canvas, the laser gadget held in one hand at
waist height, lens pointing slightly up and to the viewer's right, the other hand relaxed. Three-quarter top-down view, facing
three-quarter towards the viewer's right.
Full body visible, filling about 80% of the canvas height. No ground, no shadow, no text.
```

Reject if: the view is side-on, the feet are cut off, the laser points at the viewer, the face differs from the sheet.

##### `class.nova.l1.attack` — Nova L1 attack

**File:** `nova-l1-attack-01.png` … `-04.png` · 128 (256) · transparent · 4 frames (guide 3.2, Attack 4, method B for 02 and 03)
**Purpose:** Nova firing at level 1. The beam itself is `fx.nova.beam` (separate).

```text
[STYLE BIBLE]
Same Nova as the attached level 1 sprite, same size and position on the canvas, feet in the same place.
Pose (key frame, "zap"): Nova holds the laser gadget out in ONE hand like a torch, arm forward towards the viewer's right and
slightly away, the other hand free, lens glowing with a small soft orange-white light, a small happy bounce in her stance. Do NOT
draw the beam itself. Square 1024x1024, transparent background, no text.
```

Reject if: a beam or explosion is drawn, the character changes size or shifts on the canvas, the glow looks like fire, the gadget is
held or braced like a gun, bazooka or rifle.

##### `class.nova.l2.idle` — Nova L2 idle

**File:** `nova-l2-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames (method A)
**Purpose:** level 2: improved firing speed. Shown by a larger lens and one insignia.

```text
[STYLE BIBLE]
Edit the attached level 1 Nova sprite into LEVEL 2. Keep the same character, face, pose, size and position.
Change only: the laser's lens is noticeably larger (about 1.5 times) with a brighter orange rim, and a simple gold five-point
star patch appears on her chest panel. The silhouette must read as an upgrade.
Square 1024x1024, transparent background, no text, no letters on the patch.
```

Reject if: the patch contains any letter or number, the pose changes, the upgrade is invisible at 128 px.

##### `class.nova.l2.attack` — Nova L2 attack

**File:** `nova-l2-attack-01.png` … `-04.png` · 128 (256) · transparent · 4 frames

```text
[STYLE BIBLE]
Same LEVEL 2 Nova as the attached sprite (larger lens, gold star patch). Same size and feet position.
Pose (key frame, "zap"): laser gadget held out in ONE hand like a torch towards the viewer's right, lens glowing orange-white,
a small happy bounce. Do not draw the beam. Square 1024x1024, transparent background, no text.
```

Reject if: the L2 details (lens size, star patch) are lost, a beam is drawn, the gadget is held or braced like a gun.

##### `class.nova.l3.idle` — Nova L3 idle

**File:** `nova-l3-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames (method A)
**Purpose:** level 3: improved range and damage. Largest lens, more insignia, small backpack fin.

```text
[STYLE BIBLE]
Edit the attached level 2 Nova sprite into LEVEL 3. Keep the same character, face, pose, size and position.
Change only: the lens is the largest yet (about twice the level 1 size) with a glowing orange ring; add two orange shoulder
stripes and a round gold badge shape on the upper arm (plain, no symbols); add a small rounded orange fin on top of the backpack.
Square 1024x1024, transparent background, no text.
```

Reject if: it no longer looks like the same person, any insignia contains letters or numbers, the fin looks like a weapon.

##### `class.nova.l3.attack` — Nova L3 attack

**File:** `nova-l3-attack-01.png` … `-04.png` · 128 (256) · transparent · 4 frames

```text
[STYLE BIBLE]
Same LEVEL 3 Nova as the attached sprite (largest lens, shoulder stripes, arm badge, backpack fin). Same size and feet position.
Pose (key frame, "zap"): laser gadget held out in ONE hand like a torch towards the viewer's right, a BIGGER soft glow than
before around the lens, a small happy bounce. Do not draw the beam. Square 1024x1024, transparent background, no text.
```

Reject if: the glow looks like fire or an explosion, L3 details are missing, the gadget is held or braced like a gun.

##### `class.nova.portrait` — Nova shop portrait

**File:** `nova-card.png` · 128 (256) · transparent
**Purpose:** Nova's class card in the shop (always the L1 look).

```text
[STYLE BIBLE]
Head-and-shoulders portrait of Nova (level 1 look, from the attached sheet), facing the viewer, friendly big grin, helmet on,
laser lens just visible at the bottom edge. Centred, filling about 85% of the canvas. Square 1024x1024, transparent background.
No text, no frame, no border.
```

Reject if: a frame, card border or name appears, the face does not match the sheet.

##### `class.nova.locked` — Nova locked silhouette

**File:** `nova-card-locked.png` (proposed name) · 128 (256) · transparent
**Not ChatGPT.** Open `nova-card.png`, lock the transparency, fill every pixel with one colour (night blue #23295E), add a 4 px plum outline.
Nova is never locked in the current design; the file exists for consistency.
Reject if: any detail of the face shows through (it must be a single flat shape).

---

#### Pip — Frost Explorer (conversation 2)

##### Master reference: Pip character sheet (not shipped)

**File:** `art/source/astronauts/pip-sheet.png` · 1536x1024

```text
[STYLE BIBLE]
Character reference sheet for this game's Frost Explorer astronaut. Landscape 1536x1024, plain light background. Use the
attached images ONLY for style, outline, angle and height (the plain silhouette shows the height and build to match); this is a
DIFFERENT person with the face, skin and hair described here.
Show the same character three times at the same size: front view, three-quarter view facing the viewer's right, back view.
The character: playful ice researcher; young man with pale skin, freckles, tufty ginger hair and round cheeks, inside a round glass bubble
helmet with an ice-blue rim. Pale ice-blue #8ED8FF suit with white panels and simple six-point snowflake emblems on the chest
and knees. On his back, two ROUND cooling canisters like big frosted bubbles, joined to a small pack. He holds a short frost wand
with a snowflake-shaped crystal tip.
No text, letters or numbers anywhere.
```

Reject if: the canisters look like gas cylinders or weapons, Pip looks like Nova recoloured (the round back canisters must change the
silhouette).

##### `class.pip.l1.idle` — Pip L1 idle

**File:** `pip-l1-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames (method A)

```text
[STYLE BIBLE]
Using the attached Pip sheet, draw Pip as a single game sprite. Square 1024x1024, transparent background.
Level 1 Pip: as on the sheet; two small round canisters, small snowflake wand.
Pose: playful ready stance, feet together at the bottom-centre, wand held up beside him, the canisters clearly visible behind
his shoulders. Three-quarter top-down view, facing three-quarter towards the viewer's right. Full body, about 80% of the
canvas height. No ground, no shadow, no text.
```

Reject if: the canisters are hidden, the snowflake has letters or odd symbols, the view is side-on.

##### `class.pip.l1.attack` — Pip L1 attack

**File:** `pip-l1-attack-01.png` … `-04.png` · 128 (256) · transparent · 4 frames (Attack 4)
**Purpose:** Pip puffs a frost shot; the shot is `fx.pip.bolt`.

```text
[STYLE BIBLE]
Same level 1 Pip as the attached sprite, same size and feet position.
Pose (key frame, "zap"): Pip points the wand forward to the viewer's right with a little hop, cheeks puffed, a small soft
frosty sparkle (#CFF6FF) at the wand tip. Do NOT draw the projectile. Square 1024x1024, transparent background, no text.
```

Reject if: a projectile or big blast is drawn, the pose shifts the feet.

##### `class.pip.l2.idle` — Pip L2 idle

**File:** `pip-l2-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames
**Purpose:** level 2: stronger or longer slow. Bigger canisters, more snowflake kit.

```text
[STYLE BIBLE]
Edit the attached level 1 Pip sprite into LEVEL 2. Same character, face, pose, size and position.
Change only: the two back canisters are about 1.5 times bigger and glow faintly icy blue; add a snowflake emblem on each
shoulder; the wand tip crystal is a little larger. Square 1024x1024, transparent background, no text.
```

Reject if: the upgrade is not visible at 128 px, the character changes.

##### `class.pip.l2.attack` — Pip L2 attack

**File:** `pip-l2-attack-01.png` … `-04.png` · 128 (256) · transparent · 4 frames

```text
[STYLE BIBLE]
Same LEVEL 2 Pip as the attached sprite (bigger glowing canisters, shoulder snowflakes). Same size and feet position.
Pose (key frame, "zap"): wand pointed forward to the viewer's right, frosty sparkle at the tip. No projectile.
Square 1024x1024, transparent background, no text.
```

Reject if: L2 details are lost.

##### `class.pip.l3.idle` — Pip L3 idle

**File:** `pip-l3-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames
**Purpose:** level 3: small-area slowing. Largest canisters plus a frost aura ring at his feet.

```text
[STYLE BIBLE]
Edit the attached level 2 Pip sprite into LEVEL 3. Same character, face, pose, size and position.
Change only: the canisters are the biggest yet, frosted with little icicles; add a thin flat ring of frost crystals on the
ground around his feet (an ellipse exactly 4 wide : 3 tall, pale #CFF6FF, staying inside the canvas); add a small ice-blue star badge
shape on the chest (plain, no symbols). Square 1024x1024, transparent background, no text.
```

Reject if: the aura ring is cut off by the canvas edge, the ring hides the feet, any letter appears.

##### `class.pip.l3.attack` — Pip L3 attack

**File:** `pip-l3-attack-01.png` … `-04.png` · 128 (256) · transparent · 4 frames

```text
[STYLE BIBLE]
Same LEVEL 3 Pip as the attached sprite (largest canisters, frost aura ring, chest badge). Same size and feet position.
Pose (key frame, "zap"): wand pointed forward with a WIDER soft frosty puff at the tip (a small cloud of sparkles, not a blast).
Square 1024x1024, transparent background, no text.
```

Reject if: the puff looks like smoke or an explosion.

##### `class.pip.portrait` — Pip shop portrait

**File:** `pip-card.png` · 128 (256) · transparent

```text
[STYLE BIBLE]
Head-and-shoulders portrait of Pip (level 1 look, from the attached sheet), facing the viewer, playful grin, helmet on, the tops
of the two round canisters visible behind his shoulders. Centred, about 85% of the canvas. Square 1024x1024, transparent
background. No text, no frame.
```

Reject if: the canisters are not visible (they make the silhouette distinct from Nova's).

##### `class.pip.locked` — Pip locked silhouette

**File:** `pip-card-locked.png` (proposed name) · 128 (256) · transparent
**Not ChatGPT.** Fill `pip-card.png` with night blue #23295E and add a plum outline (as for Nova). The shop card shows "Unlocks after wave 5"
as DOM text.
Reject if: the silhouette is not recognisably different from the other five.

---

#### Juno — Comet Engineer (conversation 3)

##### Master reference: Juno character sheet (not shipped)

**File:** `art/source/astronauts/juno-sheet.png` · 1536x1024

```text
[STYLE BIBLE]
Character reference sheet for this game's Comet Engineer astronaut. Landscape 1536x1024, plain light background. Use the
attached images ONLY for style, outline, angle and height (the plain silhouette shows the height and build to match); this is a
DIFFERENT person with the face, skin and hair described here.
Show the same character three times at the same size: front view, three-quarter view facing the viewer's right, back view.
The character: inventive engineer; young woman with light-brown skin and a straight black bob, confident smile, inside a round
glass bubble helmet with round engineer's GOGGLES pushed up on top of the helmet. Sunshine-yellow #FFD23F suit with white panels
and a tool belt. A chunky round toy COMET POPPER is mounted on her backpack: a short fat yellow-and-white funnel pointing straight
UP over her shoulder, with three round fins and little painted stars, that lobs comets high in the air. She works it with a big
round button on a small hand controller held at her waist. Like a toy from a play set; nothing rests on her shoulder or is aimed.
No text, letters or numbers anywhere.
```

Reject if: the popper is held or braced like a gun, bazooka or rifle, or points forwards instead of straight up; the goggles are missing.

##### `class.juno.l1.idle` — Juno L1 idle

**File:** `juno-l1-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames (method A)

```text
[STYLE BIBLE]
Using the attached Juno sheet, draw Juno as a single game sprite. Square 1024x1024, transparent background.
Level 1 Juno: as on the sheet; small comet popper on her backpack, its funnel pointing straight up over her shoulder; hand
controller held at her waist.
Pose: confident stance, feet at the bottom-centre. Three-quarter top-down view, facing three-quarter towards the viewer's right.
Full body filling only about 65% of the canvas height, leaving empty space above and at the top-right for the bigger popper at
later levels. No ground, no shadow, no text.
```

Reject if: the popper points at the viewer or forwards, the goggles are missing, the figure fills more than about 70% of the height.

##### `class.juno.l1.attack` — Juno L1 attack

**File:** `juno-l1-attack-01.png` … `-06.png` · 128 (256) · transparent · 6 frames (Attack 6)
**Purpose:** the popper bounces and lobs a comet in a high arc; the comet is `fx.juno.comet`.

```text
[STYLE BIBLE]
Same level 1 Juno as the attached sprite, same size and feet position, same framing (figure about 65% of the canvas height).
Pose (key frame, "launch"): Juno presses the big round button on her hand controller with a happy grin; the funnel on her
backpack bounces and puffs a soft gold sparkle puff (#FFC94A) out of its top opening, straight up. Do NOT draw the comet.
Square 1024x1024, transparent background, no text.
```

Reject if: flames, smoke clouds or an explosion appear, the comet is drawn, anything is held or braced like a gun, bazooka or rifle.

##### `class.juno.l2.idle` — Juno L2 idle

**File:** `juno-l2-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames
**Purpose:** level 2: increased blast area. Chunkier popper with a band around the funnel.

```text
[STYLE BIBLE]
Edit the attached level 1 Juno sprite into LEVEL 2. Same character, face, pose, size and position; the figure still fills about
65% of the canvas height. Change only: the backpack comet popper is chunkier (about 1.4 times thicker) with a bright orange band
around the funnel, and a gold star patch appears on her chest (plain, no letters). Square 1024x1024, transparent background,
no text.
```

Reject if: the change is too small to see at 128 px.

##### `class.juno.l2.attack` — Juno L2 attack

**File:** `juno-l2-attack-01.png` … `-06.png` · 128 (256) · transparent · 6 frames

```text
[STYLE BIBLE]
Same LEVEL 2 Juno as the attached sprite (chunkier popper with orange band, star patch). Same size, framing and feet position.
Pose (key frame, "launch"): she presses the button on her hand controller, the funnel bounces and puffs a gold sparkle puff
straight up out of its top opening. No comet. Square 1024x1024, transparent background, no text.
```

Reject if: L2 details are lost.

##### `class.juno.l3.idle` — Juno L3 idle

**File:** `juno-l3-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames
**Purpose:** level 3: more area damage and a clearer impact. Biggest popper, glowing tube opening.

```text
[STYLE BIBLE]
Edit the attached level 2 Juno sprite into LEVEL 3. Same character, face, pose, size and position; the figure still fills about
65% of the canvas height and the bigger popper uses the empty space above her. Change only: the popper is the biggest yet, with
a soft glowing gold ring inside the top opening of the funnel and two bands; add yellow shoulder stripes; the goggles now have a
small gold light. Square 1024x1024, transparent background, no text.
```

Reject if: the popper now dwarfs her so much that the silhouette is mostly popper (it should still read as a person), it is cropped.

##### `class.juno.l3.attack` — Juno L3 attack

**File:** `juno-l3-attack-01.png` … `-06.png` · 128 (256) · transparent · 6 frames

```text
[STYLE BIBLE]
Same LEVEL 3 Juno as the attached sprite (biggest glowing popper, shoulder stripes). Same size, framing and feet position.
Pose (key frame, "launch"): she presses the button on her hand controller, the funnel bounces and a bright gold sparkle flash
with little stars puffs straight up out of the tube opening. No comet. Square 1024x1024, transparent background, no text.
```

Reject if: the flash looks like fire or an explosion.

##### `class.juno.portrait` — Juno shop portrait

**File:** `juno-card.png` · 128 (256) · transparent

```text
[STYLE BIBLE]
Head-and-shoulders portrait of Juno (level 1 look, from the attached sheet), facing the viewer, confident smile, goggles on the
helmet, the funnel of the backpack comet popper rising straight up over one shoulder. Centred, about 85% of the canvas. Square
1024x1024, transparent background. No text, no frame.
```

Reject if: goggles or the upward funnel are missing (they carry the silhouette).

##### `class.juno.locked` — Juno locked silhouette

**File:** `juno-card-locked.png` (proposed name) · 128 (256) · transparent
**Not ChatGPT.** Flat night-blue fill of `juno-card.png` plus plum outline. Card text "Unlocks after wave 10" is DOM.
Reject if: the goggles and the upward funnel do not show in the outline shape.

---

#### Orion — Orbit Ranger (conversation 4)

##### Master reference: Orion character sheet (not shipped)

**File:** `art/source/astronauts/orion-sheet.png` · 1536x1024

```text
[STYLE BIBLE]
Character reference sheet for this game's Orbit Ranger astronaut. Landscape 1536x1024, plain light background. Use the
attached images ONLY for style, outline, angle and height (the plain silhouette shows the height and build to match); this is a
DIFFERENT person with the face, skin and hair described here.
Show the same character three times at the same size: front view, three-quarter view facing the viewer's right, back view.
The character: observant navigator; young man with olive skin and wavy dark hair, thoughtful friendly expression, a small
bright hearing aid, inside a round glass bubble helmet with a navy rim. Navy #2E4A9E suit with a pattern of small gold #FFD86B
four-point stars. He carries a LONG telescope in one hand: a slim brass-and-navy tube with a round lens at the front and a small
eyepiece, longer than his arm, held like a stargazer's telescope, tilted upward, never shouldered or aimed level. Clearly an
explorer's telescope.
No text, letters or numbers anywhere; the stars are simple shapes.
```

Reject if: the instrument looks like a sniper rifle (no stock, no trigger, no magazine), the stars become letters or symbols.

##### `class.orion.l1.idle` — Orion L1 idle

**File:** `orion-l1-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames (method A)

```text
[STYLE BIBLE]
Using the attached Orion sheet, draw Orion as a single game sprite. Square 1024x1024, transparent background.
Level 1 Orion: as on the sheet; telescope held upright beside him in one hand, tilted up to the viewer's right.
Pose: calm watchful stance, feet at the bottom-centre, free hand shading his visor as if looking far away. Three-quarter
top-down view, facing three-quarter towards the viewer's right. The whole instrument must fit inside the canvas.
Full body filling only about 65% of the canvas height, leaving empty space above and at the top-right for the longer telescope
at later levels. No ground, no shadow, no text.
```

Reject if: the telescope is cropped, it looks like a gun, it rests on his shoulder, the figure fills more than about 70% of the height.

##### `class.orion.l1.attack` — Orion L1 attack

**File:** `orion-l1-attack-01.png` … `-06.png` · 128 (256) · transparent · 6 frames (Attack 6)
**Purpose:** spots the target and sends a long star tracer (`fx.orion.shot`). Slow shot, every 2.4 s.

```text
[STYLE BIBLE]
Same level 1 Orion as the attached sprite, same size, framing and feet position.
Pose (key frame, "zap"): Orion holds the telescope tilted UP at about 30 degrees with one hand, as if star-gazing, and POINTS
with the other hand towards the viewer's right; his eye is away from the eyepiece, a cheerful "found it" look; a small gold
star-shaped glint at the front lens. Do NOT draw the tracer. The whole instrument fits in the canvas.
Square 1024x1024, transparent background, no text.
```

Reject if: the telescope is level, at his eye or on his shoulder, or the pose looks like aiming a rifle; anything is held or braced like a
gun, bazooka or rifle.

##### `class.orion.l2.idle` — Orion L2 idle

**File:** `orion-l2-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames
**Purpose:** level 2: more range. Longer telescope sight.

```text
[STYLE BIBLE]
Edit the attached level 1 Orion sprite into LEVEL 2. Same character, face, pose, size and position; the figure still fills
about 65% of the canvas height and the longer telescope uses the empty space above him. Change only: the telescope is about 1.3 times longer with an extra extending section and a larger front lens; add a gold star
patch on the chest. Keep the whole instrument inside the canvas. Square 1024x1024, transparent background, no text.
```

Reject if: the longer instrument is cropped.

##### `class.orion.l2.attack` — Orion L2 attack

**File:** `orion-l2-attack-01.png` … `-06.png` · 128 (256) · transparent · 6 frames

```text
[STYLE BIBLE]
Same LEVEL 2 Orion as the attached sprite (longer telescope, chest star patch). Same size, framing and feet position.
Pose (key frame, "zap"): telescope tilted UP at about 30 degrees in one hand as if star-gazing, the other hand POINTING towards
the viewer's right, eye away from the eyepiece, gold star glint at the lens. No tracer. Square 1024x1024, transparent
background, no text.
```

Reject if: L2 details are lost, the telescope is level or at his eye.

##### `class.orion.l3.idle` — Orion L3 idle

**File:** `orion-l3-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames
**Purpose:** level 3: stronger attacks and the STRONG targeting option. Longest sight plus a star-chart visor.

```text
[STYLE BIBLE]
Edit the attached level 2 Orion sprite into LEVEL 3. Same character, face, pose, size and position; the figure still fills
about 65% of the canvas height. Change only: the telescope is the longest yet with a glowing gold ring at the front; his helmet visor now shows a faint pattern
of dots joined by thin lines like a star chart (no letters, no numbers); add navy-and-gold shoulder stripes.
Square 1024x1024, transparent background, no text.
```

Reject if: the visor pattern contains anything that reads as writing or numbers.

##### `class.orion.l3.attack` — Orion L3 attack

**File:** `orion-l3-attack-01.png` … `-06.png` · 128 (256) · transparent · 6 frames

```text
[STYLE BIBLE]
Same LEVEL 3 Orion as the attached sprite (longest telescope, star-chart visor, shoulder stripes). Same size, framing and feet
position. Pose (key frame, "zap"): telescope tilted UP at about 30 degrees in one hand as if star-gazing, the other hand
POINTING towards the viewer's right, eye away from the eyepiece, a stronger gold star flash at the lens. No tracer.
Square 1024x1024, transparent background, no text.
```

Reject if: the flash looks like gunfire, the telescope is level or at his eye.

##### `class.orion.portrait` — Orion shop portrait

**File:** `orion-card.png` · 128 (256) · transparent

```text
[STYLE BIBLE]
Head-and-shoulders portrait of Orion (level 1 look, from the attached sheet), facing the viewer, thoughtful friendly smile,
the telescope rising diagonally behind one shoulder. Centred, about 85% of the canvas. Square 1024x1024, transparent
background. No text, no frame.
```

Reject if: the telescope is missing (it is Orion's silhouette).

##### `class.orion.locked` — Orion locked silhouette

**File:** `orion-card-locked.png` (proposed name) · 128 (256) · transparent
**Not ChatGPT.** Flat night-blue fill of `orion-card.png` plus plum outline. Card text "Unlocks after wave 15" is DOM.
Reject if: the diagonal telescope is not visible in the shape.

---

#### Mira — Shield Specialist (conversation 5)

Mira does not attack. Her second animation is **emit** (a shield pulse sent to the colony).

##### Master reference: Mira character sheet (not shipped)

**File:** `art/source/astronauts/mira-sheet.png` · 1536x1024

```text
[STYLE BIBLE]
Character reference sheet for this game's Shield Specialist astronaut. Landscape 1536x1024, plain light background. Use the
attached images ONLY for style, outline, angle and height (the plain silhouette shows the height and build to match); this is a
DIFFERENT person with the face, skin and hair described here.
Show the same character three times at the same size: front view, three-quarter view facing the viewer's right, back view.
The character: calm colony technician; woman with medium-brown skin, dark hair in a neat bun, round glasses, calm kind smile, inside a
round glass bubble helmet with a green rim. White suit with leaf-green #3DBE6E panels. A LARGE, obvious rounded shield emblem
covers most of her chest (a plain green-and-white shield shape with no symbols inside). She holds a small handheld dish
emitter, like a mini satellite dish on a short handle, with a cyan #5BE0F0 centre.
No text, letters or numbers anywhere.
```

Reject if: the shield emblem is small or contains a cross, letter or logo, the dish looks like a weapon.

##### `class.mira.l1.idle` — Mira L1 idle

**File:** `mira-l1-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames (method A)

```text
[STYLE BIBLE]
Using the attached Mira sheet, draw Mira as a single game sprite. Square 1024x1024, transparent background.
Level 1 Mira: as on the sheet; small dish emitter held at waist height. The chest shield emblem must be big and clear.
Pose: calm upright stance, feet at the bottom-centre. Three-quarter top-down view, facing three-quarter towards the viewer's
right. Full body, about 80% of the canvas height. No ground, no shadow, no text.
```

Reject if: the shield emblem is hard to see at 128 px.

##### `class.mira.l1.emit` — Mira L1 emit

**File:** `mira-l1-emit-01.png` … `-04.png` · 128 (256) · transparent · 4 frames (guide 3.2, Emit)
**Purpose:** raises the emitter to send a shield pulse to the colony (`fx.mira.shield-pulse`), every 15 s at L1.

```text
[STYLE BIBLE]
Same level 1 Mira as the attached sprite, same size and feet position.
Pose (key frame): Mira raises the dish emitter above her shoulder, pointing up and to the viewer's right, the dish centre
glowing soft cyan #5BE0F0. Do NOT draw the pulse travelling away. Square 1024x1024, transparent background, no text.
```

Reject if: a beam or ring is drawn leaving the dish.

##### `class.mira.l2.idle` — Mira L2 idle

**File:** `mira-l2-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames
**Purpose:** level 2: stronger protection. Larger emitter dish.

```text
[STYLE BIBLE]
Edit the attached level 1 Mira sprite into LEVEL 2. Same character, face, pose, size and position.
Change only: the dish emitter is about 1.5 times larger with a second cyan ring; add a small green star patch on her upper arm
(plain, no letters). Square 1024x1024, transparent background, no text.
```

Reject if: the change is not visible at 128 px.

##### `class.mira.l2.emit` — Mira L2 emit

**File:** `mira-l2-emit-01.png` … `-04.png` · 128 (256) · transparent · 4 frames

```text
[STYLE BIBLE]
Same LEVEL 2 Mira as the attached sprite (larger dish, arm star patch). Same size and feet position.
Pose (key frame): dish raised above her shoulder towards the viewer's right, dish centre glowing cyan. No pulse drawn.
Square 1024x1024, transparent background, no text.
```

Reject if: L2 details are lost.

##### `class.mira.l3.idle` — Mira L3 idle

**File:** `mira-l3-idle-01.png` … `-04.png` · 128 (256) · transparent · 4 frames
**Purpose:** level 3: faster recharge and a small repair. Largest emitter plus a repair wrench on her belt.

```text
[STYLE BIBLE]
Edit the attached level 2 Mira sprite into LEVEL 3. Same character, face, pose, size and position.
Change only: the dish is the largest yet with a glowing cyan rim; a chunky friendly cartoon wrench (rounded, green handle)
hangs from her belt; add green shoulder stripes. Square 1024x1024, transparent background, no text.
```

Reject if: the wrench looks like a weapon or is too small to see.

##### `class.mira.l3.emit` — Mira L3 emit

**File:** `mira-l3-emit-01.png` … `-04.png` · 128 (256) · transparent · 4 frames

```text
[STYLE BIBLE]
Same LEVEL 3 Mira as the attached sprite (largest dish, belt wrench, shoulder stripes). Same size and feet position.
Pose (key frame): dish raised towards the viewer's right, glowing brightly cyan. No pulse drawn.
Square 1024x1024, transparent background, no text.
```

Reject if: L3 details are lost.

##### `class.mira.portrait` — Mira shop portrait

**File:** `mira-card.png` · 128 (256) · transparent

```text
[STYLE BIBLE]
Head-and-shoulders portrait of Mira (level 1 look, from the attached sheet), facing the viewer, calm kind smile, round
glasses, the top of the big chest shield emblem clearly visible. Centred, about 85% of the canvas. Square 1024x1024,
transparent background. No text, no frame.
```

Reject if: the shield emblem is not visible.

##### `class.mira.locked` — Mira locked silhouette

**File:** `mira-card-locked.png` (proposed name) · 128 (256) · transparent
**Not ChatGPT.** Flat night-blue fill of `mira-card.png` plus plum outline. Card text "Unlocks after wave 20" is DOM.
Reject if: indistinguishable from Nova's silhouette (crop the portrait lower so the shield's top edge shapes the outline, if needed).

---

#### Sol — Beacon Commander (conversation 6)

Sol supports nearby astronauts and does not attack. His second animation is **pulse**.

**Canvas (fixed before L1):** all Sol sprites, every level and frame, use **1024x1536 portrait** and a **128x192 display frame (author
256x384)**, pivot bottom-centre. The body fills about 55% of the canvas height at the bottom, leaving the top for the antenna as it grows.
Tell whoever builds the atlas that Sol's frames are taller than the other classes' 128 px squares. (The portrait and locked card stay square.)

##### Master reference: Sol character sheet (not shipped)

**File:** `art/source/astronauts/sol-sheet.png` · 1536x1024

```text
[STYLE BIBLE]
Character reference sheet for this game's Beacon Commander astronaut. Landscape 1536x1024, plain light background. Use the
attached images ONLY for style, outline, angle and height (the plain silhouette shows the height and build to match; the antenna
adds height); this is a DIFFERENT person with the face, skin and hair described here.
Show the same character three times at the same size: front view, three-quarter view facing the viewer's right, back view.
The character: encouraging communications specialist; older man with dark-brown skin, a short grey beard and a warm grin, inside a round
glass bubble helmet with a gold rim. Red #E2403A suit with gold #F5B700 panels. A TALL thin antenna rises from his backpack,
taller than his helmet, topped by a round glowing gold beacon bulb. One hand is raised in a friendly thumbs-up.
No text, letters or numbers anywhere.
```

Reject if: the antenna is short or hidden behind the helmet, the pose looks like a salute or a stop sign.

##### `class.sol.l1.idle` — Sol L1 idle

**File:** `sol-l1-idle-01.png` … `-04.png` · 128x192 frame (256x384) · transparent · 4 frames (method A)

```text
[STYLE BIBLE]
Using the attached Sol sheet, draw Sol as a single game sprite. Portrait 1024x1536, transparent background.
Level 1 Sol: as on the sheet; antenna with a small gold beacon bulb, gently lit.
Pose: encouraging stance, feet at the bottom-centre, one hand giving a thumbs-up. Three-quarter top-down view, facing
three-quarter towards the viewer's right. The body fills about 55% of the canvas height at the bottom; the whole antenna fits
inside the canvas with empty space above it. No ground, no shadow, no text.
```

Reject if: the antenna is cropped, Sol looks like Mira with a different colour.

##### `class.sol.l1.pulse` — Sol L1 pulse

**File:** `sol-l1-pulse-01.png` … `-04.png` · 128x192 frame (256x384) · transparent · 4 frames (guide 3.2, Pulse)
**Purpose:** the beacon lights up and sends a pulse (`fx.sol.beacon`).

```text
[STYLE BIBLE]
Same level 1 Sol as the attached sprite, same size and feet position.
Pose (key frame): Sol raises one arm high with an open hand, the beacon bulb at full bright gold glow with a soft halo just
around the bulb. Do NOT draw the expanding ring. Portrait 1024x1536, same framing as the idle sprite, transparent background,
no text.
```

Reject if: a large ring or rays fill the canvas.

##### `class.sol.l2.idle` — Sol L2 idle

**File:** `sol-l2-idle-01.png` … `-04.png` · 128x192 frame (256x384) · transparent · 4 frames
**Purpose:** level 2: improved support effect. Taller antenna.

```text
[STYLE BIBLE]
Edit the attached level 1 Sol sprite into LEVEL 2. Same character, face, pose, size and position.
Change only: the antenna is about 1.3 times taller with a second small cross-bar, and the beacon bulb is larger; add a gold
star patch on the chest (plain). Keep everything inside the canvas. Portrait 1024x1536, same framing (body about 55% of the
height), transparent background, no text.
```

Reject if: the taller antenna is cropped.

##### `class.sol.l2.pulse` — Sol L2 pulse

**File:** `sol-l2-pulse-01.png` … `-04.png` · 128x192 frame (256x384) · transparent · 4 frames

```text
[STYLE BIBLE]
Same LEVEL 2 Sol as the attached sprite (taller antenna with cross-bar, star patch). Same size and feet position.
Pose (key frame): arm raised, beacon at full gold glow with a small halo. No ring.
Portrait 1024x1536, same framing, transparent background, no text.
```

Reject if: L2 details are lost.

##### `class.sol.l3.idle` — Sol L3 idle

**File:** `sol-l3-idle-01.png` … `-04.png` · 128x192 frame (256x384) · transparent · 4 frames
**Purpose:** level 3: greater support radius. Tallest beacon with a double dish.

```text
[STYLE BIBLE]
Edit the attached level 2 Sol sprite into LEVEL 3. Same character, face, pose, size and position.
Change only: the antenna is the tallest yet and carries two small round dishes facing left and right below the beacon bulb;
the bulb has a gold ring around it; add red-and-gold shoulder stripes. Everything fits inside the canvas. Portrait 1024x1536,
same framing (body about 55% of the height), transparent background, no text.
```

Reject if: the dishes look like Mira's emitter held in the hand (they must be on the antenna).

##### `class.sol.l3.pulse` — Sol L3 pulse

**File:** `sol-l3-pulse-01.png` … `-04.png` · 128x192 frame (256x384) · transparent · 4 frames

```text
[STYLE BIBLE]
Same LEVEL 3 Sol as the attached sprite (tallest antenna, double dish, shoulder stripes). Same size and feet position.
Pose (key frame): arm raised, beacon and both dishes glowing gold. No ring.
Portrait 1024x1536, same canvas and framing as the idle sprite, transparent background, no text.
```

Reject if: L3 details are lost.

##### `class.sol.portrait` — Sol shop portrait

**File:** `sol-card.png` · 128 (256) · transparent

```text
[STYLE BIBLE]
Head-and-shoulders portrait of Sol (level 1 look, from the attached sheet), facing the viewer, warm grin, grey beard, the
antenna and gold beacon bulb rising clearly above the helmet. Centred, about 85% of the canvas with the bulb inside the top
edge. Square 1024x1024, transparent background. No text, no frame.
```

Reject if: the antenna is cropped off the top.

##### `class.sol.locked` — Sol locked silhouette

**File:** `sol-card-locked.png` (proposed name) · 128 (256) · transparent
**Not ChatGPT.** Flat night-blue fill of `sol-card.png` plus plum outline. Card text "Unlocks after wave 25" is DOM.
Reject if: the antenna does not show in the outline shape.

---

#### `class.all.selected` — selected astronaut highlight

**SVG / code — not ChatGPT.** D10.1 makes the selection glow a runtime tint and outline, so no frames are drawn. Whoever builds the
battlefield draws a thick high-contrast outline (cream #FFF4D6 outer, plum inner) around the selected sprite plus the tick badge used for
selected pads. Check: visible on every class and on every pad colour, and not shown by colour alone.

---

### 4.2 Aliens, carrier and descendants (conversations 7a and 7b)

Aliens walk along the route towards the colony. Draw them **facing three-quarter towards the viewer's right**; the game mirrors them. Each
must be recognisable by **shape and motion**, colour second (C6.1). They are mischievous, never frightening, and nothing about them
suggests injury.

Start the conversation with a quick **alien line-up reference** (not shipped) so sizes and style agree:

```text
[STYLE BIBLE]
Reference line-up of the game's aliens, side by side on a plain light background, landscape 1536x1024, all facing three-quarter
towards the viewer's right, shown at their relative game sizes: a wide, flat-bottomed dome-shaped blue jelly blob, clearly wider than tall, with two short
stubby round-ended bobble antennae and three lighter crater-like spots on its back (medium); a tiny pointed orange rock
creature with little legs (small); a wide teal domed shell creature with stubby legs (medium); a tiny cyan bubble with a face
(very small); a lilac winged disc creature (medium); a little peach alien inside nested soap bubbles (medium); a little
patch-cream (#F7F0E0) alien with a lilac-pink cheek blush carrying a BIG flag with a sticking-plaster shape (medium); a lime two-lobed slime with a seam (medium); a toy flying saucer
with portholes (large). All cute, cheeky, big-eyed, rounded, not scary. No text.
```

Then make each alien as its own image using the line-up as reference.

#### `alien.blob.walk` — Moon Blob walk

**File:** `alien-blob-walk-01.png` … `-06.png` · 128 (256) · transparent · 6 frames (Walk; method A works well: squash and stretch)
**Purpose:** the basic enemy from wave 1, and the Alien Craft's cargo.

```text
[STYLE BIBLE]
Game sprite of a MOON BLOB alien. Square 1024x1024, transparent background.
A wobbly, translucent-looking blue (#5AA9F0) jelly alien: a wide, flat-bottomed dome shape, clearly wider than tall, with
two short stubby round-ended bobble antennae and three lighter crater-like spots on its back, a lighter belly, two big shiny
eyes and a cheeky lopsided grin. It has no legs; it moves by squashing and stretching.
Pose (frame 01, "contact"): leaning forward towards the viewer's right, slightly stretched. Three-quarter top-down view.
Bottom of the blob at the bottom-centre of the canvas, filling about 75% of the canvas. No ground, no shadow, no text.
```

Reject if: it looks gooey or gross, the face is angry, it resembles a known game's slime mascot (a teardrop shape with a pointed tip is
an automatic reject; it must be a wide dome with two bobble antennae).

#### `alien.mite.walk` — Meteor Mite scurry

**File:** `alien-mite-walk-01.png` … `-06.png` · 64 (128) · transparent · 6 frames
**Purpose:** fast, fragile enemy from wave 3.

```text
[STYLE BIBLE]
Game sprite of a METEOR MITE alien. Square 1024x1024, transparent background.
A small, pointed, chunky rock creature (rock orange #D08A55 with darker speckles) shaped like a little meteor, with four short
stubby legs, two big curious eyes and a mischievous grin. Behind it, a small puff of moon dust and two or three short speed
lines to show it is fast.
Pose (frame 01): legs in a clear mid-scurry stride towards the viewer's right, with small speed lines behind (no blur).
Three-quarter top-down view.
Feet at the bottom-centre, filling about 70% of the canvas. Simple enough to read at 64 px. No text.
Outline: about 32 px thick on this 1024 px image (very thick, bold outline).
```

Reject if: it has insect detail (antennae, many legs, mandibles) that could frighten a child, too much detail for 64 px.

#### `alien.shellback.walk` — Shellback plod

**File:** `alien-shell-walk-01.png` … `-06.png` · 128 (256) · transparent · 6 frames
**Purpose:** armoured enemy from wave 6 (armour 4).

```text
[STYLE BIBLE]
Game sprite of a SHELLBACK alien. Square 1024x1024, transparent background.
A wide, low creature under a big domed shell made of a few large rounded teal (#2FA39A) plates with lighter rims, like a
friendly armoured turtle-bug. A round sleepy-but-determined face peeks out under the front of the shell; four short stubby legs.
Pose (frame 01): slow heavy plod towards the viewer's right, one front foot raised. Three-quarter top-down view.
Feet at the bottom-centre, filling about 80% of the canvas width. No text.
```

Reject if: it looks like a real tortoise or beetle, it looks angry, the shell plates are too small to read as armour.

#### `alien.swarm.bob` — Bubble Swarm bubble

**File:** `alien-swarm-bob-01.png` … `-04.png` · 32 (64) · transparent · 4 frames (Bob / hop; method A)
**Purpose:** one bubble of a swarm (from wave 8). The game spawns them in tight clusters.

```text
[STYLE BIBLE]
Game sprite of ONE tiny BUBBLE SWARM alien. Square 1024x1024, transparent background.
A small round see-through bubble (bubble cyan #9FF3FF) with a bright highlight in the top-left, two dot eyes and a tiny happy
mouth. Extremely simple shape, so it still reads at 32 px.
Pose (frame 01): squashed slightly at the bottom as if it just landed from a hop. Centred low on the canvas, filling about 70%.
No text.
Outline: about 56 px thick on this 1024 px image (very thick, bold outline).
```

Reject if: more than one bubble is drawn, too much detail for 32 px, the face is lost when shrunk.

#### `alien.flutter.fly` — Orbit Flutter fly

**File:** `alien-flutter-fly-01.png` … `-06.png` · 128 (256) · transparent · 6 frames (Fly)
**Purpose:** flying enemy from wave 12; follows the route above the path.

```text
[STYLE BIBLE]
Game sprite of an ORBIT FLUTTER alien. Square 1024x1024, transparent background.
A round flat disc-shaped lilac (#B98AF0) creature like a little living saucer, with two big rounded fluttery wings (like a
moth's, but soft and cartoony), big friendly eyes on the front edge and a small smile.
Pose (frame 01): wings up, flying towards the viewer's right. Three-quarter top-down view. Place it in the upper-middle of the
canvas (it hovers above the ground; leave empty space below it). No shadow, no text.
```

Reject if: it looks like an insect with legs or a stinger, the wings are too thin to read.

#### `alien.flutter.shadow` — Flutter ground shadow

**File:** `alien-flutter-shadow.png` · 64 wide · transparent
**SVG / code — not ChatGPT.** A soft ellipse in crater shade #4A3F7A at about 40% opacity, drawn under every Orbit Flutter on the path.
Check: it sits on the route line so the child can see which part of the path the flyer is over.

#### `alien.guard.walk` — Bubble Guard walk

**File:** `alien-guard-walk-01.png` … `-06.png` · 128 (256) · transparent · 6 frames
**Purpose:** shielded enemy from wave 14. Its bubble layers are a separate overlay (next card), so draw the alien **without** bubbles.

```text
[STYLE BIBLE]
Game sprite of a BUBBLE GUARD alien, drawn WITHOUT any bubbles around it. Square 1024x1024, transparent background.
A small round peach (#FFB38A) alien with a little bubble-blowing wand ring on its head like an antenna, big eyes and a proud
little smile, short legs.
Pose (frame 01): marching towards the viewer's right, chest puffed out. Three-quarter top-down view. Feet at the bottom-centre,
filling about 55% of the canvas (leave room around it, because the bubble layers are drawn on top later). No text.
```

Reject if: bubbles are drawn around it, it fills the whole canvas.

#### `alien.guard.bubble-layers` — Bubble layer overlay

**File:** `alien-guard-layers-4.png`, `-3`, `-2`, `-1` (proposed names) · 128 (256), scaled to each alien · transparent
**SVG / code — not ChatGPT.** Draw 4, 3, 2 or 1 concentric translucent soap-bubble rings (bubble cyan #9FF3FF at 25-35% opacity, a white
highlight top-left, thin plum outline at 50%). Each ring is clearly separate so the child can count them. The 1-layer version must
scale from 32 px (a Bubble Swarm bubble) to 256 px (an Alien Craft), because Queen Bubbla's "bubble gift" puts one layer on any non-boss
alien. Vector or code is the right tool; AI cannot keep the rings evenly spaced.
Optional reference sketch: `Four nested, evenly spaced translucent soap-bubble rings around an empty centre, flat cartoon style, transparent background, no text.`

#### `alien.guard.bubble-pop` — Bubble layer pop

**File:** `alien-guard-pop-01.png` … `-04.png` · 128 (256) · transparent · 4 frames (Effect burst)
**Purpose:** one layer popping on each hit.

```text
[STYLE BIBLE]
Game effect: a soap bubble POPPING. Square 1024x1024, transparent background.
A round translucent cyan (#9FF3FF) bubble ring breaking apart into a few curved fragments and tiny round droplets flying
outward, with two small white sparkles. Cheerful and light. Centred, filling about 80% of the canvas. No alien inside, no text.
```

Reject if: it looks like glass shattering (sharp shards).

#### `alien.patchling.walk` — Patchling walk

**File:** `alien-patch-walk-01.png` … `-06.png` · 128 (256) · transparent · 6 frames
**Purpose:** healer from wave 22.

```text
[STYLE BIBLE]
Game sprite of a PATCHLING alien. Square 1024x1024, transparent background.
A friendly little round alien in patch cream (#F7F0E0) with a lilac-pink cheek blush, big kind eyes and a helpful smile. It
carries a BIG flag on a pole, the flag about a third of the sprite's height; the flag is a plain soft-tan sticking-plaster shape
(a rounded rectangle with a lighter square pad in the middle and a few dots), with no cross, no letters and no symbol.
The alien itself is NOT green.
Pose (frame 01): walking towards the viewer's right, waving the flag. Three-quarter top-down view. Feet at the bottom-centre,
filling about 75% of the canvas. No text.
```

Reject if: the flag has a red cross (a protected emblem) or any symbol, it looks like a medic character from an existing game, the body
is green (it would be confused with the lime slimes under colour blindness; healing green is only for its effects), the flag is small.

#### `alien.patchling.heal-pulse` — Patchling heal pulse

**File:** `alien-patch-heal-01.png` … `-06.png` · 288 diameter (576) · transparent · 6 frames
**Purpose:** green sparkle ring spreading 1.5 tiles from the Patchling every 3 s.
**AI or code.** A code-drawn ring that expands to exactly 1.5 tiles is more accurate; use AI for the sparkle texture.

```text
[STYLE BIBLE]
Game effect seen from above at the three-quarter angle: a flat ring of soft healing-green (#7BEA8C) sparkles and little plus-
shaped twinkles lying on the ground, an ellipse exactly 4 wide : 3 tall. Empty centre. Square 1024x1024, transparent
background, ring filling about 90% of the canvas. No text, no cross symbols.
Outline: about 8 px thick on this 1024 px image.
```

Reject if: the plus shapes look like red crosses or medical logos, the ring is a full disc.

#### `alien.slime.walk` — Split Slime ooze

**File:** `alien-slime-walk-01.png` … `-06.png` · 128 (256) · transparent · 6 frames
**Purpose:** splitter from wave 24 (splits into two Slimelets).

```text
[STYLE BIBLE]
Game sprite of a SPLIT SLIME alien. Square 1024x1024, transparent background.
A lime-green (#9BE564) slime made of TWO round lobes joined side by side, with a clear zigzag seam running down between them.
Each lobe has one big eye; one wide shared grin across the seam. Glossy highlight top-left. Not drippy.
Pose (frame 01): stretched forward as it oozes towards the viewer's right. Three-quarter top-down view. Bottom at the
bottom-centre, filling about 75% of the canvas. No text.
```

Reject if: the seam is not obvious (it is the trait cue), it drips or looks gross.

#### `alien.slime.split` — Split Slime split

**File:** `alien-slime-split-01.png` … `-06.png` · 128 (256) · transparent · 6 frames
**Purpose:** the slime splits along its seam into two Slimelets with a star pop.

```text
[STYLE BIBLE]
Same Split Slime as the attached sprite. Key frame of it SPLITTING: the two lobes spring apart along the zigzag seam, each
becoming its own small one-eyed slime, with a burst of small colourful stars between them. Both halves surprised and happy.
Square 1024x1024, transparent background, no text.
```

Reject if: it looks like the slime is being torn or hurt (keep it a bouncy, happy pop).

#### `alien.slimelet.hop` — Slimelet hop

**File:** `alien-slimelet-hop-01.png` … `-04.png` · 64 (128) · transparent · 4 frames (Bob / hop)
**Purpose:** Split Slime's descendant.

```text
[STYLE BIBLE]
Game sprite of a SLIMELET: one half of the attached Split Slime, now a small single round lime (#9BE564) slime lobe with ONE
big eye and a small grin, no seam. Pose (frame 01): squashed, about to hop towards the viewer's right. Three-quarter top-down
view. Bottom at the bottom-centre, filling about 70% of the canvas. Simple enough to read at 64 px. No text.
Outline: about 32 px thick on this 1024 px image (very thick, bold outline).
```

Reject if: it still has a seam (that would make it look like it splits again).

#### `alien.craft.hover` — Alien Craft hover

**File:** `alien-craft-hover-01.png` … `-06.png` · 256 (512) · transparent · 6 frames (Fly / hover)
**Purpose:** carrier from wave 27; releases 4 Moon Blobs when defeated.

```text
[STYLE BIBLE]
Game sprite of an ALIEN CRAFT. Square 1024x1024, transparent background.
A toy-like round flying saucer with a silver-lilac hull (#C9D1E3 with lilac shading), a clear glass dome on top, and a row of
four round portholes around the rim; in each porthole a little blue Moon Blob face peeks out, grinning. Small magenta (#E05FD0)
lights around the bottom edge. Clearly a fun toy, not a warship.
Pose (frame 01): hovering, tilted slightly towards the viewer's right. Three-quarter top-down view. Place it a little above
the canvas centre (it hovers low over the path). No beam, no shadow, no text.
Outline: about 8 px thick on this 1024 px image.
```

Reject if: weapons, guns or a tractor beam appear, it resembles a famous film saucer, the portholes contain anything but blob faces.

#### `alien.craft.release` — Alien Craft doors-open release

**File:** `alien-craft-release-01.png` … `-06.png` · 256 (512) · transparent · 6 frames
**Purpose:** the craft pops into stars and its cargo tumbles out.

```text
[STYLE BIBLE]
Same Alien Craft as the attached sprite, key frame of its RELEASE: a hatch underneath has dropped open and four little blue
Moon Blobs tumble out happily, while the saucer starts to pop into a burst of colourful stars. Playful, no damage, no debris.
Square 1024x1024, transparent background, no text.
Outline: about 8 px thick on this 1024 px image.
```

Reject if: it looks like a crash or explosion, the blobs look scared or hurt.

---

### 4.3 Trait icons (conversation 7c)

Shown small (32 px, author 64) above aliens and on the alien info panel. ChatGPT can sketch them, but tiny icons are usually cleaner when
redrawn as SVG from the sketch (D10.8 lists them as "Generated"; the inventory allows either). Template:

```text
[STYLE BIBLE]
A simple flat game ICON of <SUBJECT>. Bold rounded shape, at most two colours plus a very thick dark plum outline (about
56 px on this 1024 px image), no gradients,
no tiny details, readable at 32 pixels. Centred, filling about 80% of the canvas. Square 1024x1024, transparent background.
No text, no letters, no numbers.
```

| Id | File | `<SUBJECT>` | Reject if |
|---|---|---|---|
| `icon.trait.armour` | `icon-armour.png` | a chunky rounded dome-shaped shell plate with three big round bolts across it, like a slice of the Shellback's shell, teal #2FA39A; NOT a shield outline | it has a shield or crest outline (shields mean colony protection elsewhere in the game), it looks like a brand logo |
| `icon.trait.flying` | `icon-flying.png` | a single soft rounded wing, lilac #B98AF0 | it looks like a bird or a known logo |
| `icon.trait.bubbles` | `icon-bubbles.png` | three nested concentric bubble rings, cyan #9FF3FF | rings are not clearly separate |
| `icon.trait.healer` | `icon-healer.png` | a cream sticking plaster with a darker centre pad, set at a slant, no cross | a cross or red-cross symbol appears |
| `icon.trait.splitter` | `icon-splitter.png` | one lime blob splitting into two smaller blobs with a small arrow-free gap | it needs an arrow or symbol to make sense |
| `icon.trait.carrier` | `icon-carrier.png` | a small flying saucer with three tiny round faces in its portholes | too detailed at 32 px |
| `icon.lock` | `icon-lock.png` | a friendly rounded padlock, gold #F5B700 body, metal grey shackle, round keyhole | the keyhole or body carries a number or letter |

`icon.lock` is listed as **Generated** in D10.8, with the trait icons. Because it is also used on closed pads and must stay crisp, this
pack recommends redrawing it as SVG from the sketch; if you do, record the change of source in D10.8.
---

### 4.4 Bosses (conversations 8a to 8c)

Bosses are **big and funny**, never menacing. They are 384 px (author 768): generate at 1024x1024 and downscale. Every phase change must be
readable from shape and motion (C7), not a number. Boss health bars, phase names and bubble-layer counts are DOM text, never in the art.
Attach the matching ordinary alien each time so the boss is clearly its "king" version.

The boss **names stay in the card headings only**. The prompt bodies describe the boss instead, because a proper name in the prompt
(Captain Clank in particular) can pull the model towards an existing character with a similar name.

#### `boss.wobble.walk` — King Wobble, phase 1 (Royal stroll)

**File:** `boss-wobble-walk-01.png` … `-06.png` · 384 (768) · transparent · 6 frames (Walk)
**Purpose:** wave 10 boss, 100% to 50% health.

```text
[STYLE BIBLE]
Game sprite of a BOSS: a GIANT version of the attached blue jelly alien. Square 1024x1024, transparent background.
A huge wide-domed wobbly blue (#5AA9F0) jelly king with the attached alien's bobble antennae, crater spots, big eyes and cheeky
grin, a pompous raised chin, and a
simple yellow folded-paper crown sitting perfectly upright on top (three points, no jewels with symbols).
Pose (frame 01): a slow royal stroll towards the viewer's right, body leaning forward and stretching. Three-quarter top-down
view. Bottom at the bottom-centre, filling about 85% of the canvas with the crown inside the top edge. No text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: the crown has letters, numbers or symbols, the king looks angry or scary.

#### `boss.wobble.dash` — King Wobble, phase 2 (Wobble dash)

**File:** `boss-wobble-dash-01.png` … `-06.png` · 384 (768) · transparent · 6 frames
**Purpose:** below 50% health: faster.

```text
[STYLE BIBLE]
Edit the attached boss sprite. Same character, size and position. Change only: his body turns bright pink (#FF7FB8),
two small white steam puffs rise from his head like a cartoon kettle, his paper crown is tilted to one side, and his
expression is flustered and determined (puffed cheeks, not angry). Square 1024x1024, transparent background, no text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: the steam looks like smoke from a fire, the shape changes.

#### `boss.wobble.phase-change` — King Wobble phase change

**File:** `boss-wobble-phase-01.png` … `-06.png` · 384 (768) · transparent · 6 frames
**Purpose:** the change from blue to pink when crossing 50%. Easiest made in the editor: crossfade the blue sprite into the pink one over
six frames and add the steam burst below.

```text
[STYLE BIBLE]
Key frame of the attached crowned jelly boss changing colour: his body half blue and half pink in a swirl, a big burst of white cartoon
steam puffs around his head, the crown popping up and tilting. Funny, surprised expression. Same size and position.
Square 1024x1024, transparent background, no text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: it reads as an explosion.

#### `boss.clank.walk` — Captain Clank (three plate states)

**Files:** `boss-clank-full-walk-01..06.png`, `boss-clank-cracked-walk-01..06.png`, `boss-clank-off-walk-01..06.png` · 384 (768) ·
transparent · 6 frames per state
**Purpose:** wave 20 boss; phases at 100%, 60% and 25% health. Make **full plate** first, then the other two states as edits of it.

Full plate (phase 1):

```text
[STYLE BIBLE]
Game sprite of a BOSS: a GIANT version of the attached shell alien. Square 1024x1024, transparent background.
A huge teal shell creature wearing extra bolted-on rounded metal armour plates (metal grey #A7B0C8 with big round bolts) over
its shell, and a small navy captain's hat with a plain gold band (no badge, no emblem). Determined, slightly pompous face
peeking out under the front. Pose (frame 01): heavy plod towards the viewer's right. Three-quarter top-down view. Feet at the
bottom-centre, filling about 85% of the canvas. No text.
Outline: about 6 px thick on this 1024 px image.
```

Cracked shell (phase 2), as an edit:

```text
[STYLE BIBLE]
Edit the attached shell boss. Same character, size and position. Change only: most bolted plates are gone; the teal shell
shows several cracks that glow soft gold from inside; the face looks surprised. No text.
Outline: about 6 px thick on this 1024 px image.
```

Shell off (phase 3), as an edit:

```text
[STYLE BIBLE]
Edit the attached shell boss. Same character, size and position, hat still on. Change only: the shell is completely off,
showing his round body in funny spotty pants (big polka dots) on the same four stubby legs, scurrying in a comic hurry with a
sheepish grin. Legs drawn clearly in a scurry stride, no blur. No arms. No text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: the hat has a badge or letters, the cracks look like wounds, the shell-off state is anything but silly, arms or a new body
plan appear (he has four stubby legs and no arms, like the Shellback), he looks frightened or as if surrendering.

#### `boss.clank.plates-fall` — Captain Clank plates fall

**File:** `boss-clank-platesfall-01.png` … `-06.png` · 384 (768) · transparent · 6 frames
**Purpose:** played at each phase change.

```text
[STYLE BIBLE]
Key frame of the attached shell boss's armour plates falling off: four or five rounded grey plates with bolts tumbling
outward and down from his shell, with small cartoon impact stars. Same size and position.
Square 1024x1024, transparent background, no text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: the effect contains a sound word or any letters.

#### `boss.bubbla.walk` — Queen Bubbla

**File:** `boss-bubbla-walk-01.png` … `-06.png` · 384 (768) · transparent · 6 frames
**Purpose:** wave 30 boss. Draw her **without** her big bubble (that is `boss.bubbla.bubble`).

```text
[STYLE BIBLE]
Game sprite of a BOSS: a GIANT, grand version of the attached peach bubble alien, drawn WITHOUT any bubble around her.
Square 1024x1024, transparent background.
A large round peach (#FFB38A) alien with a crown made of three soap bubbles stuck together (no tiara, no gems), a grand,
amused smile, no eyelashes and no gown; she holds a chunky bubble-blowing hoop on a short stick.
Pose (frame 01): a grand slow walk towards the viewer's right. Three-quarter top-down view. Feet at the bottom-centre, filling
about 75% of the canvas (leave room for the bubble overlay). No text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: she has a witch, fairy or princess look (tiara, wand with a star, gown, long eyelashes), she resembles a known queen or "good
witch" character, a bubble surrounds her.

#### `boss.bubbla.wand` — Queen Bubbla wand wave

**File:** `boss-bubbla-wand-01.png` … `-06.png` · 384 (768) · transparent · 6 frames
**Purpose:** phases 2 (66%) and 3 (33%): a new bubble forms on her and sparkles spread 2 tiles to give other aliens a bubble layer. The
game plays this faster in phase 3.

```text
[STYLE BIBLE]
Key frame of the attached peach bubble boss WAVING her bubble hoop in a big flourish over her head, a ring of cyan sparkles
and tiny bubbles spraying outward around her. Same size and position. Square 1024x1024, transparent background, no text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: the sparkles fill the canvas edges (keep a margin).

#### `boss.bubbla.bubble` — Queen Bubbla big bubble

**Files:** `boss-bubbla-bubble-full.png`, `-thin.png`, `-none.png` (proposed names) · 384 (768) · transparent
**SVG / code — not ChatGPT.** A large translucent bubble enclosure over the queen: "full" is a thick, bright bubble; "thin" is a fainter,
thinner one; "none" is empty (or simply not drawn). The layer count (8) is shown in the DOM.
**Shared with The Great Glorp:** the same overlay, scaled to fit, is Glorp's phase-2 bubble (10 layers). Draw it so it scales cleanly over
both bosses; full while many layers remain, thin when few remain, none when popped.
Optional reference sketch: `One big translucent soap bubble, cyan rim, white highlight top-left, empty inside, transparent background, no text.`

#### `boss.mothership.hover` — The Mothership

**Files:** `boss-mothership-shut-hover-01..06.png`, `boss-mothership-door1open-hover-01..06.png`,
`boss-mothership-door12open-hover-01..06.png`, `boss-mothership-bare-hover-01..06.png` · 384 (768) · transparent · 6 frames per state
(proposed names for the two door-open states; update the D10.6 frame list to match)
**Purpose:** wave 40 boss. Every phase must be readable from the boss's shape (C7), so a door that has opened **stays open** for the rest
of the fight:

| Phase | Hover state | What it shows |
|---|---|---|
| 1 (100% to 75%) | `shut` | all three doors shut, plating on |
| 2 (75% to 50%) | `door1open` | door 1 hanging open and empty, its dot light dark; plating on |
| 3 (50% to 25%) | `door12open` | doors 1 and 2 hanging open and empty, their dot lights dark; plating on |
| 4 (25% to 0) | `bare` | all three doors hanging open and empty, all dot lights dark, plating off, tilting forward (it hurries) |

Make `shut` first, then each later state as an edit of the one before it.

Doors shut (phase 1):

```text
[STYLE BIBLE]
Game sprite of a BOSS: a GIANT, grander version of the attached toy flying saucer. Square 1024x1024, transparent
background. A big round toy-like saucer with a glass dome on top where a tiny smug alien captain sits, silver-lilac hull with
rounded hull plating panels, and THREE large cargo doors along the front rim. Above each door is a row of round lights showing
a count with DOTS: one dot above the first door, two dots above the second, three dots above the third. Absolutely no digits.
Pose (frame 01): hovering, tilted slightly towards the viewer's right. Three-quarter top-down view, a little above centre.
No beams, no weapons, no text, no numbers.
Outline: about 6 px thick on this 1024 px image.
```

Door 1 open (phase 2), as an edit:

```text
[STYLE BIBLE]
Edit the attached saucer boss. Same size and position. Change only: the FIRST cargo door (one dot light above it) hangs open
like a ramp, the hold behind it empty, and its dot light is dark. The other two doors stay shut. No text, no numbers.
Outline: about 6 px thick on this 1024 px image.
```

Doors 1 and 2 open (phase 3), as an edit of the door-1-open sprite:

```text
[STYLE BIBLE]
Edit the attached saucer boss. Same size and position. Change only: the SECOND cargo door (two dot lights above it) now also
hangs open like a ramp, empty, and its dot lights are dark. The third door stays shut. No text, no numbers.
Outline: about 6 px thick on this 1024 px image.
```

Bare (phase 4), as an edit of the doors-1-and-2-open sprite:

```text
[STYLE BIBLE]
Edit the attached saucer boss. Same size and position. Change only: the rounded hull plating panels have fallen away showing a
simpler frame with cartoon pipes; the THIRD cargo door now also hangs open and empty with its dot lights dark, so all three
doors are open; it tilts forward as if hurrying. Keep the 1-, 2- and 3-dot light rows (all dark). No text, no numbers.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: any digit appears (check the door lights very carefully), it looks like a warship or a famous film ship, a state does not
match the table (wrong door open, a spent door shown shut).

#### `boss.mothership.door` — Mothership door open

**Files:** `boss-mothership-door1-01..06.png`, `-door2-…`, `-door3-…` · 384 (768) · transparent · 6 frames each
**Purpose:** at 75%, 50% and 25% one door drops open and aliens tumble out (door 1: Meteor Mites; door 2: Orbit Flutters; door 3:
Shellbacks). Each animation runs from the hover state **before** the opening (frame 01) to the hover state **after** it (frame 06): door 1
goes `shut` → `door1open`, door 2 goes `door1open` → `door12open`, door 3 goes `door12open` → `bare` (the plating falls away in the same
moment). The aliens that come out are separate sprites spawned by the game; the key frame only shows them leaving.

Key frame for each door, as an edit of the hover state AFTER that door has opened (`door1open` for door 1, `door12open` for door 2, the
BARE sprite for door 3):

```text
[STYLE BIBLE]
Edit the attached saucer boss. Same size and position. Key frame: the <first | second | third> cargo door (the one with
<one | two | three> dot lights above it) has just dropped open like a ramp, its dot lights flashing, and <four little rock-mite
aliens scurry | four lilac winged disc aliens flutter | two teal shell aliens march> out happily. Doors that were already open
stay open and empty; doors not yet opened stay shut. No text, no numbers.
Outline: about 6 px thick on this 1024 px image.
```

Make three images, choosing one option from each `< | >` group each time.
Reject if: the wrong door opens, a door that should already be open is drawn shut, digits appear, the aliens look frightened.

#### `boss.mothership.release` — Mothership defeat release (optional, proposed)

**File:** `boss-mothership-release-01..06.png` (proposed; not in D10) · 384 (768) · transparent · 6 frames
**Purpose:** C7's end phase: when The Mothership is defeated it releases 4 Moon Blobs. **No new art is required:** play `fx.pop-stars` at
boss scale (384) over the bare sprite and let the game spawn four `alien.blob.walk` Moon Blobs from the open cargo doors. Make this key
frame only if you want a dedicated moment, built like `alien.craft.release`:

```text
[STYLE BIBLE]
Same saucer boss as the attached BARE sprite (plating off, all doors open), key frame of its RELEASE: four little blue jelly
aliens (as in the second attachment) tumble out of the open cargo doors happily, while the saucer starts to pop into a big burst
of colourful stars. Playful, no damage, no debris. Same size and position. Square 1024x1024, transparent background, no text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: it looks like a crash or explosion, the blobs look scared or hurt.

#### `boss.glorp.walk` — The Great Glorp (four states)

**Files:** `boss-glorp-armoured-walk-01..06.png`, `-bubbled-…`, `-cargo-…`, `-dash-…` · 384 (768) · transparent · 6 frames per state
**Purpose:** wave 50 campaign boss that borrows one trick from each earlier boss. Make a **base Glorp** first (not shipped), then the four
states as edits. The walk states are **looping** sprites, so they never contain temporary events: the phase-2 bubble is the shared
`boss.bubbla.bubble` overlay (it pops layer by layer and disappears while Glorp stays in phase 2), and the phase-3 cargo spill is the
one-shot `boss.glorp.hatch` below (the released aliens are separate sprites spawned by the game).

Base (reference only):

```text
[STYLE BIBLE]
Character design for the FINAL BOSS of the game: a huge, round, friendly-goofy mega alien in magenta (#E05FD0) and lilac,
with two huge eyes plus one small extra eye on a stalk, a wide toothless grin, two short arms, two stubby legs and a round belly
with a hatch door (a plain circle with a handle). It should look like the grand silly champion of all the other aliens. Facing
three-quarter towards the viewer's right, three-quarter top-down view, feet at the bottom-centre, about 85% of the canvas.
Square 1024x1024, transparent background, no text.
Outline: about 6 px thick on this 1024 px image.
```

Then one edit per state (attach the base and the boss it borrows from):

| State | Edit prompt (after `[STYLE BIBLE]`) |
|---|---|
| armoured (phase 1) | `Edit the attached magenta boss. Same size and position. Add the bolted-on rounded grey armour plates from the second attachment over his body and head. No text.` |
| bubbled (phase 2) | `Edit the attached magenta boss. Same size and position. Remove the plates; he looks pleased and puffs his cheeks. NO bubble drawn (the bubble is a separate overlay). No text.` |
| cargo (phase 3) | `Edit the attached magenta boss. Same size and position, no bubble. His belly hatch hangs OPEN and EMPTY. Nothing comes out of it. No text.` |
| wobble-dash (phase 4) | `Edit the attached magenta boss. Same size and position, hatch closed. He has turned pink with white steam puffs rising from his head like the attached blue jelly boss's dash, and is running in a determined comic rush. No text.` |

Reject if: the four states do not look like the same character, the final rush looks angry, a bubble or spilling aliens are drawn into a
walk state.

#### `boss.glorp.hatch` — Great Glorp cargo hatch (proposed)

**File:** `boss-glorp-hatch-01..06.png` (proposed; not in D10) · 384 (768) · transparent · 6 frames, played **once** at the change to phase 3
**Purpose:** the moment the slimes and mites tumble out. Frame 01 is the bubbled-state body, frame 06 the cargo state (hatch open and
empty); the real released aliens then spawn as separate sprites.

```text
[STYLE BIBLE]
Edit the attached magenta boss (cargo state, hatch open). Same size and position. Key frame: two lime two-lobed slimes and a few
little rock-mite aliens tumble happily out of his open belly hatch, the boss looking surprised and amused. No text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: the aliens look frightened or hurt, the boss changes shape or size.

#### `boss.glorp.phase-change` — Great Glorp phase change

**File:** `boss-glorp-phase-01.png` … `-06.png` · 384 (768) · transparent · 6 frames
**Purpose:** transition burst at 70%, 40% and 15%. Where C7 says **a bubble swarm escapes** (6 Bubble Swarm released), the escaping
bubbles are ordinary `alien.swarm.bob` sprites spawned by the game around this burst; do not paint them into the burst.

```text
[STYLE BIBLE]
Game effect: a big round transition burst of colourful cartoon stars and swirls in magenta, lilac and gold, with an empty-ish
centre where the boss will be. Joyful, no debris, no fire. Centred, filling about 90% of the canvas. Square 1024x1024,
transparent background, no text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: it looks like an explosion with smoke or fire.

#### `fx.boss.arrive` — Boss entrance shockwave

**File:** `fx-boss-arrive-01.png` … `-08.png` · 384 (768) · transparent · 8 frames (Effect burst)
**Purpose:** played at the portal when a boss spawns.

```text
[STYLE BIBLE]
Game effect seen from the three-quarter top-down angle: a dramatic but friendly shockwave ring lying flat on the ground (an
ellipse exactly 4 wide : 3 tall), made of bright magenta and lime stars and a soft glowing edge, with a few stars bouncing upward. Empty centre.
Exciting, not frightening. Square 1024x1024, transparent background, filling about 90%. No text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: dark, smoky or threatening.

#### `fx.boss.phase` — Boss phase flash

**File:** `fx-boss-phase-01.png` … `-06.png` · 384 (768) · transparent · 6 frames
**Purpose:** generic flash used at any boss phase change (on top of the boss's own change art).

```text
[STYLE BIBLE]
Game effect: a quick round flash of cream (#FFF4D6) light with four big soft star-shaped rays and a ring of small gold sparkles,
centred, empty middle so the boss stays visible. Square 1024x1024, transparent background, filling about 85%. No text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: the flash is a solid disc that would hide the boss. (This can also be a code-drawn white flash.)

---

### 4.5 Effects (conversations 9a and 9b)

Effects are short animations. Generate **one image at the effect's fullest moment** and build the frames in the editor (scale up in early
frames, fade and break up in late frames; guide 3.2). Pivot is centre. Every effect is cheerful and non-violent: sparkles, stars, soft
light, frost; never fire, smoke, blood or debris.

All effect prompts share this ending, already included below: *"Centred, transparent background, no text."*

**Translucent effects need a black background, not transparency.** Glows, beams, rings, bubbles, frost haze and halos must stay see-through,
which neither a fake transparent background nor a keyed flat colour can give you (1.5). For these, replace *"transparent background"* with
*"on a flat pure black #000000 background"*, then render them in the game with additive or "screen" blending, or convert black to alpha in
the editor. Solid effects (the wrench, coins, chevrons, stars) can use transparency or the green key as usual.

**Rings lying on the ground** (slow ring, blast, heal pulse, beacon pulse, comet impact, place puff, boss arrival) are ellipses **exactly 4
wide : 3 tall**, the GROUND PLANE ratio in the style bible. AI rarely gets the ratio exact, so squash the accepted ring to 4:3 in the editor,
or draw the ring in code through the map projection so it lines up with `map.range-circle`.

#### `fx.nova.beam` — Nova laser beam (L1, L2, L3)

**Files:** `fx-nova-beam-l1-01..03.png`, `-l2-…`, `-l3-…` · 64 tall (128), stretched to length at runtime · transparent · 3 frames each
**AI or code.** A code-drawn line with a glow is easy and stretches perfectly; use this prompt if you want a hand-drawn texture.

```text
[STYLE BIBLE]
Game effect texture: a short HORIZONTAL segment of a friendly cartoon laser beam, running edge to edge across the canvas, with
a bright cream-white core and a soft orange (#FF8A2A) glow on both sides, rounded and smooth. It must be able to stretch
sideways. Landscape 1536x1024; the beam is a band about one third of the canvas height through the middle.
Transparent background, no text.
```

Then two edits: "Make the core thicker and the glow brighter (level 2)" and "Thicker again with small star sparkles along the edges
(level 3)". The three levels must be clearly different in thickness (the spec says "clearer beam" per level).
Reject if: it looks like a weapon blast, the edges are not straight enough to stretch.

#### `fx.pip.bolt` — Pip frost bolt

**File:** `fx-pip-bolt-01.png` … `-04.png` · 64 (128) · transparent · 4 frames

```text
[STYLE BIBLE]
Game projectile: a small round icy puff ball, frost white and pale ice blue (#CFF6FF, #8ED8FF), with a little snowflake at its
front tip and a short trail of sparkles behind it, flying to the right. Simple enough to read at 64 px. Square 1024x1024,
centred, filling about 60% of the canvas. Transparent background, no text.
Outline: about 32 px thick on this 1024 px image (very thick, bold outline).
```

Reject if: it looks like a sharp icicle spear.

#### `fx.pip.slow-ring` — Pip L3 area-slow ring

**File:** `fx-pip-slow-ring-01.png` … `-06.png` · 192 display diameter (author 384) · transparent · 6 frames
**Purpose:** frost ring spreading 1 tile around the target (scaled in code to exactly 1 tile).

```text
[STYLE BIBLE]
Game effect seen from the three-quarter top-down angle: a flat ring of frost crystals and small snowflakes lying on the ground
(an ellipse exactly 4 wide : 3 tall), pale #CFF6FF with ice-blue edges, empty centre. Square 1024x1024, filling about 90%.
Transparent background, no text.
Outline: about 10 px thick on this 1024 px image.
```

Reject if: it is a solid disc, the ellipse angle does not match the map.

#### `fx.slowed` — Slowed overlay

**File:** `fx-slowed-01.png`, `-02.png` · 64 (128), scaled to each alien · transparent · 2 frames
**Purpose:** shows slowing by **shape** (icicles and frost crust), not only a blue tint.

```text
[STYLE BIBLE]
Game overlay: a frosty crust along the bottom edge with a few small rounded icicles hanging down and two tiny snowflakes above,
pale #CFF6FF and white with ice-blue shading, designed to sit at the feet of any creature. Empty above the crust. Square
1024x1024, the crust spanning about 80% of the width in the lower third. Transparent background, no text.
Outline: about 32 px thick on this 1024 px image (very thick, bold outline).
```

For frame 02, ask: "Same image, the snowflakes twinkle in a slightly different place."
Reject if: it covers the whole creature, the icicles are sharp spikes.

#### `fx.juno.comet` — Juno comet projectile

**File:** `fx-juno-comet-01.png` … `-04.png` · 64 (128) · transparent · 4 frames

```text
[STYLE BIBLE]
Game projectile: a small toy-like comet, a round golden (#FFC94A) ball with a cheerful shine, trailing a short sparkly tail of
little stars to the left as it flies to the right. Square 1024x1024, centred, filling about 70%. Transparent background, no text.
Outline: about 32 px thick on this 1024 px image (very thick, bold outline).
```

Reject if: it has flames.

#### `fx.juno.blast` — Juno comet blast (L1, L2, L3)

**Files:** `fx-juno-blast-l1-01..06.png`, `-l2-…`, `-l3-…` · display diameter 192 / 269 / 269 (author 384 / 538 / 538) · transparent ·
6 frames each
**Purpose:** impact ring matching each level's radius (1, 1.4, 1.4 tiles). Scale to the exact radius in code so the preview is the truth.

```text
[STYLE BIBLE]
Game effect seen from the three-quarter top-down angle: a starry impact ring lying flat on the ground (an ellipse exactly 4
wide : 3 tall), golden
(#FFC94A) and cream stars bursting outward along the ring, with a soft gold glow, no smoke, no debris. Square 1024x1024,
filling about 90%. Transparent background, no text.
Outline: about 8 px thick on this 1024 px image.
```

L2: the same image (only the code scale changes). L3: edit "Same ring, brighter and clearer, with bigger stars and a crisp
bright edge, so the impact is easier to see."
Reject if: it looks like an explosion, the ring is not a clean ellipse (the edge shows the blast area).

#### `fx.mira.shield-pulse` — Mira shield pulse

**File:** `fx-mira-shield-pulse-01.png` … `-06.png` · 128 (256) · transparent · 6 frames

```text
[STYLE BIBLE]
Game effect: a soft cyan (#5BE0F0) ripple in the shape of Mira's rounded shield emblem (a plain shield outline, no symbols
inside), glowing, with a few small sparkles, as if travelling to the right. Square 1024x1024, centred, filling about 70%.
Transparent background, no text.
```

Reject if: the shield contains a cross or symbol.

#### `fx.mira.repair` — Mira repair sparkle

**File:** `fx-mira-repair-01.png` … `-06.png` · 128 (256) · transparent · 6 frames
**Purpose:** L3 Mira gives the colony +1 health when a wave is cleared.

```text
[STYLE BIBLE]
Game effect: a chunky friendly cartoon wrench with a green handle, tilted, surrounded by little healing-green (#7BEA8C) and
gold sparkles and two small plus-shaped twinkles. Square 1024x1024, centred, filling about 70%. Transparent background, no text.
```

Reject if: the plus shapes look like a red cross.

#### `fx.orion.shot` — Orion tracer

**File:** `fx-orion-shot-01.png` … `-03.png` · 64 tall (128), stretched · transparent · 3 frames
**AI or code.** A code line works well.

```text
[STYLE BIBLE]
Game effect texture: a long thin HORIZONTAL gold (#FFD86B) light streak running edge to edge, with a small bright four-point
star at its right-hand tip and a faint navy-blue glow. Landscape 1536x1024, the streak a thin band through the middle.
Transparent background, no text.
```

Reject if: it looks like a bullet.

#### `fx.sol.beacon` — Sol beacon pulse

**File:** `fx-sol-beacon-01.png` … `-06.png` · 128 (256), scaled · transparent · 6 frames
**AI or code.** The exact radius ring is `map.range-circle`; this is only the soft decorative pulse.

```text
[STYLE BIBLE]
Game effect seen from the three-quarter top-down angle: a soft golden (#F5B700) ring of light lying flat on the ground (an
ellipse exactly 4 wide : 3 tall), glowing, with a few tiny sparkles on it, empty centre. Square 1024x1024, filling about 90%. Transparent background,
no text.
```

Reject if: it is too bright to see the astronauts through.

#### `fx.sol.buffed` — Buffed chevron

**File:** `fx-sol-buffed-01.png`, `-02.png` · 32 (64) · transparent · 2 frames
**Vector or AI.** Tiny; an SVG is cleaner.

```text
[STYLE BIBLE]
A tiny game icon: one chunky upward-pointing chevron in gold (#F5B700) with a thick plum outline and a small sparkle at its
tip. Readable at 32 px. Square 1024x1024, centred, filling about 70%. Transparent background, no text.
Outline: about 56 px thick on this 1024 px image (very thick, bold outline).
```

Reject if: it looks like a letter "A" or "V".

#### `fx.upgrade` — Upgrade burst

**File:** `fx-upgrade-01.png` … `-08.png` · 128 (256) · transparent · 8 frames
**Purpose:** shared by all classes on any upgrade.

```text
[STYLE BIBLE]
Game effect: an upward burst of sparkles and stars rising in a column from the bottom-centre, cream, gold and soft cyan,
with two or three upward chevron shapes among them. Joyful. Square 1024x1024, filling about 85%. Transparent background, no text.
```

Reject if: the chevrons read as letters.

#### `fx.place` — Place puff

**File:** `fx-place-01.png` … `-06.png` · 128 (256) · transparent · 6 frames

```text
[STYLE BIBLE]
Game effect seen from the three-quarter top-down angle: a soft landing puff of lavender moon dust spreading outward along the
ground in a flat ellipse exactly 4 wide : 3 tall, with round cartoon cloud puffs and a few small sparkles. Square 1024x1024, centred low, filling
about 85% of the width. Transparent background, no text.
```

Reject if: it looks like smoke from a fire.

#### `fx.sell` — Send home beam-up

**File:** `fx-sell-01.png` … `-06.png` · 128 (256) · transparent · 6 frames
**Purpose:** "Send home": a teleport beam lifting the astronaut away.

```text
[STYLE BIBLE]
Game effect: a soft vertical teleport beam of cream and cyan light rising from a small glowing ellipse on the ground at the
bottom-centre up to the top edge, with little sparkles drifting upward inside it. Empty enough to see a character inside.
Square 1024x1024. Transparent background, no text.
```

Reject if: the beam is opaque.

#### `fx.armour.clonk` — Armour clonk spark

**File:** `fx-armour-clonk-01.png` … `-03.png` · 64 (128) · transparent · 3 frames
**Purpose:** when a hit loses damage to armour (Shellback, Captain Clank, armoured Mothership and Glorp).

```text
[STYLE BIBLE]
Game effect: a small comic impact spark, a chunky five-point star burst in cream and metal grey with rounded points and two
tiny sparkles beside it. Square 1024x1024, centred, filling about 70%. Transparent background, no text, no letters.
Outline: about 32 px thick on this 1024 px image (very thick, bold outline).
```

Reject if: any word, sound word or letters appear.

#### `fx.pop-stars` — Pop into stars

**File:** `fx-pop-stars-01.png` … `-08.png` · 128 (256); bosses scale to 384 · transparent · 8 frames
**Purpose:** every alien and boss defeat. The most-seen effect in the game; make it delightful.

```text
[STYLE BIBLE]
Game effect: a playful round burst of colourful cartoon stars (blue, lime, magenta, gold, cyan, lilac) and little round
confetti dots flying outward from the centre, with a soft cream flash in the middle. Happy and celebratory, no debris, no
smoke. Square 1024x1024, centred, filling about 90%. Transparent background, no text.
```

Reject if: it looks like an explosion or anything is hurt.

#### `fx.leak` — Leak boing puff

**File:** `fx-leak-01.png` … `-06.png` · 128 (256) · transparent · 6 frames
**Purpose:** an alien reaches the colony gate. Harmless, not alarming.

```text
[STYLE BIBLE]
Game effect: a springy bounce puff, a round soft lilac cloud puff with a coiled swoosh line above it and two small stars,
cheeky rather than alarming. Square 1024x1024, centred, filling about 70%. Transparent background, no text, no letters.
```

Reject if: it reads as damage or an explosion, any word appears.

#### `fx.heal.received` — Healed sparkle

**File:** `fx-healed-01.png` … `-04.png` (proposed name; not in D10) · 64 (128) · transparent · 4 frames
**Purpose:** small green sparkle on an alien healed by a Patchling.

```text
[STYLE BIBLE]
Game effect: a small cluster of healing-green (#7BEA8C) sparkles and two small rounded plus-shaped twinkles rising upward.
Readable at 64 px. Square 1024x1024, centred, filling about 70%. Transparent background, no text.
Outline: about 32 px thick on this 1024 px image (very thick, bold outline).
```

Reject if: a red cross or medical logo appears.

#### `fx.reward-credits` — Credits reward burst

**File:** `fx-reward-credits-01.png` … `-08.png` · 128 (256) · transparent · 8 frames
**AI or CSS animation.** For a CSS animation, you only need one coin image: use the `icon.hud.credits` star-coin.

```text
[STYLE BIBLE]
Game effect: a handful of shiny gold star-coins (round gold coins with a plain embossed five-point star, no numbers) flying up
and to the right in an arc, with sparkles. Square 1024x1024, filling about 85%. Transparent background, no text, no numbers.
```

Reject if: the coins carry numbers, letters or a currency symbol.

#### `fx.correct-sparkle` — Correct answer sparkle

**File:** `fx-correct-sparkle-01.png` … `-08.png` · 128 (256) · transparent · 8 frames
**AI or CSS.**

```text
[STYLE BIBLE]
Game effect: a joyful round sparkle burst of gold and cream four-point stars with a few small lime and cyan dots, radiating from
the centre. Square 1024x1024, centred, filling about 85%. Transparent background, no text, no tick mark.
```

Reject if: a tick mark appears (the tick is a separate SVG icon), it is too busy behind text.

---

### 4.6 Meteor powers (conversation 10)

Powers are earned in the optional meteor challenges and used on the battlefield. Translucent power effects (frost field, colony shield boost) follow
the black-background rule in 4.5. Icons need two states: **ready** (full colour) and
**used/empty** (make this yourself: desaturate, lighten to about 40% and add a dashed outline; do not regenerate).

#### `power.frost-pulse.icon` — Frost Pulse icon

**Files:** `power-frost-pulse-icon.png` (ready), `power-frost-pulse-icon-used.png` (used/empty, proposed name) · 128 (256); 64 in the tray

```text
[STYLE BIBLE]
A bold game power ICON: one big six-point snowflake in pale ice blue and white (#CFF6FF, #8ED8FF) with a thick plum outline,
and a soft ripple ring spreading out behind it. Readable at 64 px. Square 1024x1024, centred, filling about 80%. Transparent
background, no text.
```

Reject if: it looks too similar to Pip's emblem at 64 px (make the ripple ring obvious).

#### `power.frost-pulse.fx` — Frost Pulse field effect

**File:** `fx-frost-pulse-01.png` … `-08.png` · full canvas 1920x1056 overlay · transparent · 8 frames
**AI or code.** A code tint plus a moving frost edge is often better. If using AI, generate it on flat black and use screen
blending or "colour to alpha" (1.5), because the haze must stay see-through:

```text
[STYLE BIBLE]
A full-screen game overlay: a wave of frost sweeping from left to right across a transparent area, made of a soft pale-blue
glowing front edge with snowflakes and frost crystals along it, and a very light frosty haze behind it. Most of the image must
stay transparent so the battlefield shows through. Landscape 1536x1024. Transparent background, no text.
```

Reject if: the haze is too opaque to see the battlefield.

#### `power.comet-burst.icon` — Comet Burst icon

**Files:** `power-comet-burst-icon.png`, `power-comet-burst-icon-used.png` · 128 (256); 64 in the tray

```text
[STYLE BIBLE]
A bold game power ICON: a big glowing golden comet diving down towards the bottom-left, a round bright head with a sparkly
gold tail of stars, thick plum outline. Readable at 64 px. Square 1024x1024, centred, filling about 80%. Transparent background,
no text.
```

Reject if: it has flames or looks like a missile.

#### `power.comet-burst.target` — Comet Burst targeting ring

**File:** `fx-comet-target-01.png`, `-02.png` · 288 diameter (576) · transparent · 2 frames
**SVG / code — not ChatGPT.** A crosshair ring (gold dashed circle, four short inward ticks, a small centre dot) drawn through the map
projection at exactly 1.5 tiles and snapped to the route. Frame 02 rotates the dashes a little.
Optional reference sketch: `Flat gold dashed targeting ring with four short inward ticks and a centre dot, seen as an ellipse from above, transparent background, no text.`

#### `power.comet-burst.impact` — Comet Burst impact

**File:** `fx-comet-impact-01.png` … `-08.png` · 256 (512) · transparent · 8 frames

```text
[STYLE BIBLE]
Game effect seen from the three-quarter top-down angle: a large comet impact made of a big burst of golden and cream stars
spreading in a flat ring on the ground (an ellipse exactly 4 wide : 3 tall), a bright soft centre glow and stars bouncing upward. Exciting but friendly, no smoke,
no fire, no debris. Square 1024x1024, filling about 90%. Transparent background, no text.
Outline: about 8 px thick on this 1024 px image.
```

Reject if: it looks like an explosion.

#### `power.colony-shield.icon` — Colony Shield icon

**Files:** `power-colony-shield-icon.png`, `power-colony-shield-icon-used.png` · 128 (256); 64 in the tray

```text
[STYLE BIBLE]
A bold game power ICON: a small simple domed colony building under a bright cyan (#5BE0F0) hexagon-patterned shield dome,
with three sparkles. Thick plum outline, readable at 64 px. Square 1024x1024, centred, filling about 80%. Transparent
background, no text.
```

Reject if: it is too detailed at 64 px, it looks like Mira's emblem.

#### `power.colony-shield.fx` — Colony Shield boost

**File:** `fx-colony-shield-boost-01.png` … `-06.png` · 384 (768) · transparent · 6 frames

```text
[STYLE BIBLE]
Game effect: an extra-bright cyan shield dome flaring over an empty space where the colony will be, hexagon pattern glowing,
a ring of sparkles around its base and a burst of light at the top. Mostly transparent inside so the colony shows through.
Square 1024x1024, filling about 90%. Transparent background, no text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: the dome is opaque.

#### `meteor.offer.art` — Meteor challenge offer art

**File:** `meteor-offer-art.png` · 256 (512) · transparent

```text
[STYLE BIBLE]
Exciting, friendly illustration: a big cheerful glowing meteor with a sparkly gold and cyan tail streaking diagonally past a
small purple moon, a few stars around. The meteor has no face. Square 1024x1024, filling about 85%. Transparent background,
no frame, no title, no text.
Outline: about 8 px thick on this 1024 px image.
```

Reject if: the meteor is about to hit the moon in a threatening way, any text appears.

---

### 4.7 Map, pads, colony and decorations (conversation 11)

The battlefield is a **20 x 11 tile grid at 96 px per tile = 1920 x 1056** logical pixels (C3.1). The route, colony, portal, pads and
decorations are **separate layers** placed on the grid by code, so the backdrop must have **no path, no buildings and no pads painted in**.
Route: portal at tile (0, 2), colony gate at (19, 3), nine straight segments and eight bends, 40 tiles long. Pads sit at the 16 tiles
listed in C3.2.

**Projection:** route tiles are 96x96 squares seen from above; anything lying on the ground (pads, rings, shadows, auras, the range
circle) is an ellipse exactly 4 wide : 3 tall (style bible, GROUND PLANE). The 4:3 ratio is this pack's proposal: confirm it with
whoever writes the map code (sections C and E) before generating pads and rings, and change it here and in the style bible if the code
uses another ratio.

#### `map.luna.backdrop` — Moonbeam Colony lunar backdrop

**File:** `luna-backdrop.webp` (+ `luna-backdrop.png` fallback) · 1920x1056 display (author 3840x2112) · **opaque**
**Purpose:** bottom layer of the battlefield; can also be reused on the Landing and sign-in pages.

```text
[STYLE BIBLE]
Background painting for the game battlefield. Landscape 1536x1024, OPAQUE (no transparency).
A colourful cartoon moon surface seen from the three-quarter top-down angle: gently rolling regolith in lavender (#9C8FD6) and
purple (#6B5CA5) with soft teal (#3FB8AF) patches, a few shallow round craters and small pebbles scattered thinly near the
edges. The moon ground fills the WHOLE image from edge to edge: no sky, no horizon. The middle of the image must be fairly calm and even, with NO path, NO road, NO buildings, NO landing pads and NO characters,
because the game draws those on top. Light from the top-left. No text.
```

Getting to the target size: ChatGPT's widest canvas is 1536x1024 (ratio 1.5) and the game needs 1.82. Crop the top and bottom to
1536x845, then upscale 2.5x with a good upscaler to 3840x2112 (or accept a 1920x1056 author size at first). Export as WebP (quality about
85) and PNG.
The playable grid uses every row: build pads reach the top row (P01 at tile (2, 0); P07 and P15 are at y=1) and the route reaches y=2.
So the regolith must fill all 11 rows. If the model paints sky anyway, crop it off when you crop to 1536x845; if that leaves too little
image, regenerate.
Reject if: a path or structures are painted in, the centre is busy (it will fight the route and sprites), any sky shows behind row 0 (the
top 96 px of the 1056 px canvas), anything has writing on it.

#### `map.luna.route.straight` — Route tile, straight

**Files:** `route-straight-h.png`, `route-straight-v.png` (proposed variant names) · 96x96 display (192x192) · transparent
**Purpose:** the alien path, assembled along the 40-tile route. **AI for the texture, then you make the tile.** AI does not reliably
produce tiles that join seamlessly.

```text
[STYLE BIBLE]
A seamless, tileable game texture seen from directly above: a smooth glowing moon-dust track, pale cream-lavender (#E6DDF7)
with a soft teal (#3FB8AF) glowing border along the top and bottom edges, and a faint repeating pattern of soft chevron arrows
pointing to the RIGHT along the middle. The left and right edges must match exactly so it repeats sideways. Landscape
1536x1024, the track running edge to edge horizontally across the middle third. Transparent above and below the track.
No text.
```

Then in the editor: crop one square repeat of the track (the track should fill the tile's full width and about 70% of its height), check
it joins to a copy of itself left and right (use "offset" by half the width to see the seam and paint it out), and save as 192x192.
Rotate 90 degrees for the vertical version (arrows pointing down) and 270 degrees for up.
Reject if: the arrows are not evenly spaced (they will jump at tile joins), the border is wobbly.

#### `map.luna.route.corner` — Route tile, corner

**Files:** `route-corner-right-down.png`, `-down-right.png`, `-right-up.png`, `-up-right.png` · 96x96 (192x192) · transparent
**Owner-made from the straight tile, not ChatGPT.** Draw a 90-degree bend whose two open edges match the straight tile's edges exactly
(same width, same border), with the arrow pattern following the turn. Make one, then rotate or mirror for the four directions the route
uses (C3.1: right→down, down→right, right→up, up→right).
Reject if: a seam shows where a corner meets a straight.

#### `map.luna.route.portal-end` — Route start cap

**File:** `route-portal-end.png` · 96x96 (192x192) · transparent
**Purpose:** first tile, where the path leaves the portal at (0, 2).

```text
[STYLE BIBLE]
Using the attached route texture: the START of the same track, seen from directly above. The track enters from the LEFT edge
as a soft glowing fan that narrows into the normal track width, continuing to the right edge exactly like the attached
texture. Square 1024x1024, track in the middle band, transparent elsewhere. No text.
```

Then trim to 192x192 and match the right edge to the straight tile by hand.
Reject if: the right edge does not line up with the straight tile.

#### `map.luna.route.colony-end` — Route end cap

**File:** `route-colony-end.png` · 96x96 (192x192) · transparent
**Purpose:** last tile, at the colony gate (19, 3).

```text
[STYLE BIBLE]
Using the attached route texture: the END of the same track, seen from directly above. The track enters from the LEFT edge at
the normal width and ends at the right in a rounded doorstep pad with a soft glowing gate line (a plain bar of light, no
symbols). Square 1024x1024, track in the middle band, transparent elsewhere. No text.
```

Reject if: the left edge does not line up with the straight tile.

#### `map.luna.portal.idle` — Alien arrival portal

**File:** `portal-idle-01.png` … `-06.png` · 256 (512) · transparent · 6 frames
**Purpose:** where aliens arrive, at the route start. Frames: rotate the swirl about 10 degrees per frame in the editor.

```text
[STYLE BIBLE]
Game sprite of a friendly cartoon arrival portal on the moon surface, seen from the three-quarter top-down angle: a flat, round
swirling pool of magenta (#E05FD0) and lime (#9BE564) light lying ON the moon ground (an ellipse exactly 4 wide : 3 tall), edged
with a low ring of rounded pebbles, with a few sparkles and small floating moon rocks bobbing just above it. Nothing stands
upright. Inviting and playful, not dark or scary. Square 1024x1024, centred low, filling about 85% of the width. Transparent
background, no text.
Outline: about 8 px thick on this 1024 px image.
```

Reject if: it looks like a black hole or a horror gateway, it resembles a portal from a known game or film, it is an upright ring, gate
or arch (it would also hide the start of the route at tile (0, 2)).

#### `map.luna.colony.healthy` — Research colony, healthy

**File:** `colony-healthy.png` · 384 (768) · transparent
**Purpose:** the base the player protects (health above 50%). Make this first, then the two worried versions as **edits** of it.

```text
[STYLE BIBLE]
Game sprite of a cheerful moon RESEARCH COLONY, seen from the three-quarter top-down angle, toy-like proportions: a cluster of
three white domed buildings with round windows glowing warm cream, joined by short tubes, a small greenhouse dome with plants,
two antennas with gold tips, and a row of blue solar panels. A round doorway faces left towards where the path arrives.
Friendly and safe-looking, like a toy play set. Same outline and light as the characters. Square 1024x1024, base at the
bottom-centre, filling about 85%. Transparent background. No text, no flags, no logos on any building.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: anything resembles a real space agency base or brand, any building carries signs, numbers or letters.

#### `map.luna.colony.worried` — Research colony, worried

**File:** `colony-worried.png` · 384 (768) · transparent
**Purpose:** colony health 50% or below.

```text
[STYLE BIBLE]
Edit the attached colony. Keep EXACTLY the same buildings, silhouette, size and position. Change only: two windows flicker
(one dark, one half-lit), one antenna wobbles at a slight angle, two small WHITE steam puffs shaped like little clouds rise from
a tube joint, and a cartoon sweat drop appears beside the main dome. Playful, no damage, no cracks, no smoke. Transparent
background, no text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: the silhouette changes (the states swap in place), anything looks broken or on fire.

#### `map.luna.colony.very-worried` — Research colony, very worried

**File:** `colony-very-worried.png` · 384 (768) · transparent
**Purpose:** colony health 25% or below.

```text
[STYLE BIBLE]
Edit the attached colony. Keep EXACTLY the same buildings, silhouette, size and position. Change only: more windows flicker,
both antennas droop like tired flowers, and a round amber alert light on top of the main dome glows with a cartoon sweat-drop
shape beside it. Still friendly and intact, not destroyed. Transparent background, no text.
Outline: about 6 px thick on this 1024 px image.
```

Reject if: it looks destroyed or frightening, the alert light contains a symbol like "!".

#### `map.luna.colony.shield` — Colony shield bubble

**Files:** `colony-shield-on-01..04.png`, `colony-shield-hit.png`, `colony-shield-break-01..04.png` · 384 (768) · transparent
**AI base, then animate yourself; or draw in code.** The hit flash can be a runtime tint.
Translucent: generate on flat black and use screen blending or "colour to alpha" (1.5), replacing "Transparent background" in the prompt.

```text
[STYLE BIBLE]
Game sprite of a translucent protective shield dome, seen from the three-quarter top-down angle: a rounded bubble dome made of
a soft hexagon pattern in cyan (#5BE0F0), very see-through in the middle, brighter along the rim and the hexagon lines, with a
white highlight top-left. Empty inside (it will sit over a building). Sized to cover a 768 px building. Square 1024x1024, base
at the bottom-centre, filling about 90%. Transparent background, no text.
Outline: about 6 px thick on this 1024 px image.
```

Shimmer frames: shift a highlight along the hexagons. Break frames: fade the dome while hexagon pieces float up and vanish.
Reject if: the dome is too opaque to see the colony through.

#### `map.luna.pad.open` — Build pad, open and empty

**File:** `pad-empty.png` · 128 (256) · transparent
**Purpose:** the 16 pads where astronauts stand.

```text
[STYLE BIBLE]
Game sprite of a round metal BUILD PAD seen from the three-quarter top-down angle (so its top is an ellipse exactly 4 wide :
3 tall): a low
circular platform in metal grey (#A7B0C8) with a raised rim, soft cream glowing rim lights spaced evenly around it, and a plain
flat top for a character to stand on. No symbols on the top. Square 1024x1024, centred, filling about 85% of the width.
Transparent background, no text.
```

Reject if: the angle does not match the style anchor's pad, there is a logo or "H" on top.

#### `map.luna.pad.hover` — Build pad, hover/focus

**File:** `pad-hover.png` (proposed) · 128 (256) · transparent
**SVG / code — not ChatGPT.** A thick high-contrast focus ring (cream #FFF4D6 outer, plum inner, 4 px or more at display size) drawn around
the pad. Must be visible on every backdrop colour and for keyboard focus as well as mouse hover.

#### `map.luna.pad.valid-target` — Build pad, valid target

**File:** `pad-valid-target.png` (proposed) · 128 (256) · transparent
**SVG / code — not ChatGPT.** A pulsing dashed ring around the pad shown after a shop card is chosen. Different from hover by shape
(dashed and pulsing), not only colour.

#### `map.luna.pad.selected` — Build pad, selected

**File:** `pad-selected.png` (proposed) · 128 (256) · transparent
**SVG / code — not ChatGPT.** A thick outline plus a small round tick badge at the top-right (reuse `icon.activity` tick). State is never
shown by colour alone (D1 rule 7).

#### `map.luna.pad.locked` — Build pad, locked (opens later)

**File:** `pad-closed.png` · 128 (256) · transparent
**Purpose:** pads not yet opened by the staged schedule (C3.3). The DOM says "Opens after wave N".

```text
[STYLE BIBLE]
Edit the attached pad. Same pad, same size and angle. Change only: the rim lights are off, the top is covered by two closed
metal shutter halves meeting in the middle, and the whole pad is dimmer and more grey-blue. Leave the centre clear for a small
padlock icon to be placed on top later. Transparent background, no text.
```

Then place `icon-lock` in the centre yourself.
Reject if: it is so dark it disappears on the backdrop.

#### `map.luna.deco.crater` — Decoration craters

**Files:** `deco-crater-1.png`, `-2.png`, `-3.png` · 64-128 (2x) · transparent
**One sheet, cut up** (an allowed exception to "one asset per image", because they are separate simple objects).

```text
[STYLE BIBLE]
Three separate small cartoon moon craters, seen from the three-quarter top-down angle, spaced well apart in a row on a
transparent background: one small, one medium, one larger. Each is a soft shallow bowl in regolith lavender and purple with a
lighter rim on the top-left and shade inside on the bottom-right. Landscape 1536x1024. No text.
```

Reject if: the craters touch each other (they must be cut apart cleanly).

#### `map.luna.deco.rock` — Decoration rocks

**Files:** `deco-rock-1.png`, `-2.png`, `-3.png` · 64-128 (2x) · transparent

```text
[STYLE BIBLE]
Three separate small cartoon moon rocks, spaced well apart in a row on a transparent background, three-quarter top-down view:
a round purple boulder, a cluster of two pebbles, and a small teal crystal formation with soft glowing facets. Chunky and
rounded. Landscape 1536x1024. No text.
```

Reject if: they touch, the crystal looks sharp and dangerous.

#### `map.luna.deco.antenna` — Decoration antenna

**File:** `deco-antenna.png` · 64-128 display · transparent

```text
[STYLE BIBLE]
Game sprite of a small satellite dish on a short three-legged stand with a gold-tipped antenna, white and metal grey, seen from
the three-quarter top-down angle. Square 1024x1024, base at the bottom-centre, filling about 80%. Transparent background,
no text, no logos.
```

Reject if: it resembles a real company's dish or carries a logo.

#### `map.luna.deco.lamp` — Decoration lamp

**Files:** `deco-lamp-on.png`, `deco-lamp-off.png` · 64 display (128) · transparent · 2-frame blink

```text
[STYLE BIBLE]
Game sprite of a small path-side beacon lamp: a short rounded metal post with a round glass lamp on top glowing soft cream with
a small halo, three-quarter top-down view. Square 1024x1024, base at the bottom-centre, filling about 70%. Transparent
background, no text.
Outline: about 32 px thick on this 1024 px image (very thick, bold outline).
```

For "off", edit: "Same lamp, light off: the glass is pale grey with no glow."
Reject if: the on and off versions differ in shape or position.

#### `map.luna.deco.flag` — Decoration flag

**File:** `deco-flag-plain.png` · 64 display (128) · transparent

```text
[STYLE BIBLE]
Game sprite of a small flag on a thin pole stuck in the ground, three-quarter top-down view. The flag is a single plain colour
(Nova orange #FF8A2A) with a lighter wavy fold. No emblem, no stripes, no stars, no letters, no national design whatsoever.
Square 1024x1024, base at the bottom-centre, filling about 75%. Transparent background, no text.
Outline: about 32 px thick on this 1024 px image (very thick, bold outline).
```

Reject if: any pattern on the flag could be read as a real country's flag or as a symbol.

#### `map.range-circle` — Range and beacon preview circle

**Files:** none (runtime) · variants range, beacon, blast-preview
**SVG / code — not ChatGPT.** Drawn at runtime by passing the logical circle (2.5 to 6 tiles) through the same projection as the map, so the
preview is exactly the truth (C3.1). Suggested look: range = dashed cream ring with a faint fill; beacon = solid gold ring; blast-preview =
gold dotted ring. Each differs by line style, not only colour.

---

### 4.8 Planets (conversation 12)

#### `planet.luna-1` — Moonbeam Colony planet

**File:** `planet-luna-1.png` · 256 (512) · transparent
**Purpose:** galaxy map (P6), planet setup header (P7), progress view.

```text
[STYLE BIBLE]
A round cartoon moon seen whole from space, purple and lavender with soft teal patches and a few round craters, a glowing cyan
rim of light on the top-left edge, and a tiny visible cluster of white domed colony buildings with warm windows on its upper
surface. Square 1024x1024, centred, filling about 85%. Transparent background, no text.
Outline: about 8 px thick on this 1024 px image.
```

Reject if: it looks like Earth's real Moon photo, any text.

#### `planet.coming-later` — Coming-later planet outline

**File:** `planet-silhouette.png` · 256 (512) · transparent
**SVG — not ChatGPT.** A plain dotted circle outline (metal grey, 50% opacity), maybe with a faint ring, so it is clearly **not** playable
(the spec says unavailable places must not look playable). Alt text: "a planet coming later".

---

### 4.9 UI icons (mostly SVG)

D10.8 marks the HUD, sound, sync, offline and activity icons as **owner-created SVG**. Small interface icons must be pixel-crisp, the same
stroke weight and exactly aligned, which image generation does badly. Use ChatGPT only to explore ideas, then draw the SVG (or adapt an
openly licensed icon set and record its licence). Every one of these icons appears **with words** in the interface; the icon never carries
the meaning alone.

Optional idea-sketch template:

```text
[STYLE BIBLE]
A simple, bold, flat user-interface ICON of <SUBJECT>, one colour (<COLOUR>) with a thick rounded plum outline, no gradient,
no detail smaller than one tenth of the icon, readable at 32 pixels. Square 1024x1024, centred, filling about 75%.
Transparent background. No text, no letters, no numbers.
```

| Id | File(s) | `<SUBJECT>` | `<COLOUR>` | Notes |
|---|---|---|---|---|
| `icon.hud.credits` | `icon-credits.svg` | a round coin with an embossed five-point star | gold #F5B700 | also the coin for `fx.reward-credits`; no currency sign |
| `icon.hud.health` | `icon-health.svg` | a heart (or a small colony dome with a heart on it) | Sol red #E2403A | |
| `icon.hud.shield` | `icon-shield.svg` | a rounded shield shape | shield cyan #5BE0F0 | must differ from Mira's emblem enough not to confuse |
| `icon.hud.wave` | `icon-wave.svg` | three small round alien heads in a row, getting smaller | blob blue #5AA9F0 | |
| `icon.hud.pause` | `icon-pause.svg` | two rounded vertical bars | cream #FFF4D6 | |
| `icon.hud.play` | `icon-play.svg` | a rounded right-pointing triangle | cream #FFF4D6 | also the Ready button |
| `icon.hud.speed` | `icon-speed-1.svg`, `icon-speed-2.svg` | one chevron pointing right / two chevrons pointing right | cream #FFF4D6 | the button label carries "1x" / "2x" |
| `icon.hud.menu` | `icon-menu.svg` | three rounded horizontal lines | cream #FFF4D6 | |
| `icon.target.mode` | `icon-target-front.svg`, `-fast.svg`, `-crowd.svg`, `-strong.svg` (proposed; not in D10) | FRONT: an arrow pointing at the leading one of three alien heads · FAST: a small running alien with speed lines · CROWD: a tight group of four alien heads · STRONG: one big chunky alien with a flexed arm | one colour each, plum outline | picture buttons for the Aim control (C5.3); words beside them |
| `icon.shop.cap-token` | `icon-cap-token-available.svg`, `-used.svg` (proposed) | a small round token with a plain helmet shape; used = hollow outline | class colour | or a tiny crop of each class portrait; shows "three Orion badges, one left" (C5.8) |
| `icon.subject` | `icon-maths.svg`, `icon-phonics.svg`, `icon-spelling.svg` | maths: a row of five counting beads on a wire · phonics: an ear with three curved sound waves · spelling: a pencil beside three blank square tiles | gold / cyan / orange | **no numerals, no letters** (D10.8 allows "Generated"; the template works well here at 128 px) |
| `icon.sound` | `icon-sound-play.svg`, `-loading.svg`, `-stop.svg`, `-replay.svg`, `-retry.svg`, `icon-sound-small.svg` | speaker with a play triangle · speaker with three dots · speaker with a square · speaker with a curved replay arrow · speaker with a circular retry arrow · plain small speaker | cream on a cyan button | Phonics Play control states (D6.5) |
| `icon.sync` | `icon-sync-saved.svg`, `-saving.svg`, `-device.svg`, `-retrying.svg`, `-signin.svg`, `-warning.svg`, `-reload.svg` | cloud with a tick · cloud with a circular arrow · laptop · circular arrows with a small clock · key · rounded triangle with a dot inside (no "!") · single circular arrow | plum on cream | always shown with words (D7.1) |
| `icon.offline` | `icon-offline-ready.svg`, `-preparing.svg`, `-missing.svg` | box with a tick · box with a downward arrow · box with a gap (a missing piece) | plum on cream | ready / preparing / missing parts |
| `icon.activity` | `icon-try-left.svg`, `icon-try-used.svg`, `icon-tick.svg`, `icon-tried.svg` | filled round star · hollow round star · bold tick · small dot inside a circle | gold / grey / lime / grey | tries indicator, selected tick, tried mark |

Reject (for any sketch or SVG): letters, numbers or "!" marks; two icons that look alike at 32 px; meaning carried only by colour.

---

### 4.10 Badges (conversation 13)

Eighteen round medals (C12). Each has two versions: **earned** (full colour, from ChatGPT) and **outline** (not yet earned: make it yourself
from the earned version, see below). Display 128 px (author 256); the Colony Hero badge is also shown at 256 on the campaign-complete screen
(author 512, so generate it at 1024 and keep a 512 copy).

Make the **first badge from the template**, accept it, then attach it to every later badge prompt so the medal frame stays identical.

Template:

```text
[STYLE BIBLE]
A round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in <RIBBON COLOUR>, the
same frame as the attached badge if one is attached. The centre is a night-blue (#23295E) disc with a picture of: <MOTIF>.
Bold, simple, readable at 128 px. Centred, filling about 85%. No text, no letters, no numbers, no stars arranged to look like
writing.
```

**Outline version (owner):** duplicate the earned PNG, fill everything inside the silhouette with 15% white, keep the outer outline and the
motif's outline only, as a thin grey #A7B0C8 line (or trace it as an SVG). File: `badge-<badgeId>-outline.png`. The outline version
must still be recognisable by shape, so the child knows what they are aiming for.

| Inventory id | File (earned) | Name (DOM text) | `<MOTIF>` | `<RIBBON COLOUR>` |
|---|---|---|---|---|
| `badge.first-steps` | `badge-first-steps.png` | First Steps | a single small boot print pressed into purple moon dust | lavender |
| `badge.boss-1` | `badge-boss-1.png` | Wobble Stopper | a yellow folded-paper crown with three points | blob blue |
| `badge.boss-2` | `badge-boss-2.png` | Clank Cracker | a rounded grey armour plate with bolts and a zigzag crack glowing gold | shell teal |
| `badge.boss-3` | `badge-boss-3.png` | Bubble Popper | a bubble wand with a bubble popping into droplets | bubble cyan |
| `badge.boss-4` | `badge-boss-4.png` | Mothership Mover | a big toy saucer flying away into the distance with a little star trail | lilac |
| `badge.campaign-luna-1` | `badge-campaign-luna-1.png` (+ 512 copy) | Colony Hero | a grand star shape behind the white domed colony, with small rays (make this rim grander: a double gold rim with tiny stars) | gold |
| `badge.endless-60` | `badge-endless-60.png` | Star Voyager | a ringed planet with a long dotted orbit path looping around it and three small stars along the path (no rocket: the rocket belongs to Keep Trying) | night blue |
| `badge.safe-and-sound` | `badge-safe-and-sound.png` | Safe and Sound | the white domed colony under a cyan hexagon shield dome | shield cyan |
| `badge.full-crew` | `badge-full-crew.png` | Full Crew | six little round astronaut helmets in a ring, rims in orange, ice blue, yellow, navy, green and red | rainbow of the six class colours |
| `badge.top-team` | `badge-top-team.png` | Top Team | one astronaut helmet with three stacked upward chevrons above it | Nova orange |
| `badge.meteor-catcher` | `badge-meteor-catcher.png` | Meteor Catcher | a glowing meteor caught in a soft net | comet gold |
| `badge.keep-trying` | `badge-keep-trying.png` | Keep Trying | a small rocket that wobbled and is now launching upward again; its big curly wobble trail is the defining shape | leaf green |
| `badge.bright-spark-10` | `badge-bright-spark-10.png` | Bright Spark | ONE single big bright four-point spark | cream |
| `badge.bright-spark-50` | `badge-bright-spark-50.png` | Brilliant Spark | a CLUSTER of five sparks of different sizes in a burst (clearly more than Bright Spark by shape, not only colour) | gold |
| `badge.all-rounder` | `badge-all-rounder.png` | All-Rounder | three small motifs together: a row of counting beads, an ear with sound waves, and a pencil (no letters or numbers) | three bands: gold, cyan, orange |
| `badge.challenge-blob-parade` | `badge-challenge-blob-parade.png` | Parade Marshal | a blue Moon Blob wearing a tall marching-band hat with a plume | blob blue |
| `badge.challenge-bubble-trouble` | `badge-challenge-bubble-trouble.png` | Bubble Wrangler | three bubbles caught in a looped lasso rope | bubble cyan |
| `badge.challenge-wobble-rematch` | `badge-challenge-wobble-rematch.png` | Boss Buddy | a crowned, wide-domed blue jelly blob with bobble antennae giving a friendly wave | pink |

Reject if: any letter, number or word appears (check the rim and ribbon closely), two badges look alike at 128 px, the medal frame changes
between badges, a motif looks like a real military or sports medal.

---

### 4.11 Avatars (conversation 14)

#### `avatar` — Profile avatars (12)

**Files:** `avatar-01.png` … `avatar-12.png` · 128 (256) · transparent, circular crop
**Purpose:** the child picks one on Profile setup (P3); shown in the Home header and Settings.

The inventory suggests one sheet cut up, but separate images keep each avatar clean; make the first one, accept it, then attach it to the
rest so the frame and style match. Template:

```text
[STYLE BIBLE]
A round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: <MOTIF>.
Bold shapes readable at 64 px. No face of any real person, no text, no letters, no numbers.
Match the frame and style of the attached avatar if one is attached.
```

| File | Variant | `<MOTIF>` | Alt text (≤60 chars, DOM) |
|---|---|---|---|
| `avatar-01.png` | 01-rocket | a big rocket badge on the chest and a rocket-shaped fin on the helmet | astronaut with a rocket badge |
| `avatar-02.png` | 02-star | a large yellow star on the helmet top | astronaut with a star |
| `avatar-03.png` | 03-moon | a crescent moon shape on the helmet | astronaut with a crescent moon |
| `avatar-04.png` | 04-comet | a comet with a sparkly tail across the helmet | astronaut with a comet |
| `avatar-05.png` | 05-ringed-planet | a small ringed planet floating beside the helmet | astronaut with a ringed planet |
| `avatar-06.png` | 06-robot | a friendly round robot face inside the helmet instead of a human face, with two antennae | a friendly robot astronaut |
| `avatar-07.png` | 07-friendly-alien | a lilac friendly alien with two big eyes and two curly antennae inside the helmet | a friendly alien astronaut |
| `avatar-08.png` | 08-telescope | a small telescope held up beside the helmet | astronaut with a telescope |
| `avatar-09.png` | 09-satellite | a little satellite orbiting the helmet | astronaut with a satellite |
| `avatar-10.png` | 10-sun | a big smiling sun shape behind the helmet, its rays poking out around the helmet edge | astronaut with a sun |
| `avatar-11.png` | 11-meteor | a small round meteor with a short tail on the chest | astronaut with a meteor |
| `avatar-12.png` | 12-astro-cat | a cat in a round helmet with ears inside the glass | a cat astronaut |

Human-faced avatars should vary in skin tone and hair across the set (rocket, star, moon, comet, ringed planet, telescope, satellite, sun
and meteor), but keep faces simple and generic. Do not make an avatar look like any of the six game astronauts, so a child's avatar is
never confused with a class.
Reject if: two avatars look alike at 64 px, any lettering appears, the circle crop or rim differs between them.

---

### 4.12 Screens and illustrations (conversation 12)

#### `screen.galaxy.background` — Galaxy map background

**File:** `galaxy-background.webp` (proposed name; not in D10) · 1920x1080 (author 2x) · **opaque**

```text
[STYLE BIBLE]
Background for a galaxy map screen. Landscape 1536x1024, OPAQUE. A calm deep-space starfield (#141633 to #23295E) with soft
nebula clouds in violet (#5B3F99), magenta and teal near the edges, many small stars of varying brightness, and a quiet,
fairly empty middle area where planets will be placed on top. No planets, no ships, no text.
```

Upscale to 1920x1080 or more (as for the backdrop). Reject if: the middle is busy, planets are painted in.

#### `brand.logo` — Game logo

**Files:** `logo.svg` (preferred) + `logo.png`, variants default and on-dark · 256 tall (author 2x)
**Purpose:** Landing (P1) and the sign-in page branding. **Generate the emblem only.** AI lettering is unreliable and the working title
"Space Colony Defence" may change (prompt.md:91), so set the title yourself as text or SVG beside or under the emblem.

```text
[STYLE BIBLE]
A game logo EMBLEM with no lettering: a small cheerful astronaut in a round helmet (generic, not one of the six game astronauts)
standing on a curved purple moon, with a white domed colony behind and a big gold star rising above, all inside a rounded
badge shape with a gold rim. Bold and simple so it reads at 64 px. Square 1024x1024, the emblem alone, centred with even
padding on all sides, transparent background. Absolutely no text, letters or numbers, no banner and no ribbon.
```

Add the space for the title yourself: extend the canvas in the editor, or let the SVG layout set the title beside or under the emblem.

On-dark variant: same emblem with a cream outer stroke so it stands out on #141633.
Reject if: any lettering, fake writing, a banner or ribbon (they invite placeholder lettering), or a resemblance to an existing game logo.

#### `screen.landing.hero` — Landing hero art (optional)

**File:** `landing-hero.webp` (proposed; not in D10) · 1920x1080 (author 2x) · **opaque**
**Optional extra:** D10 uses only logo + backdrop on Landing. Attach all six character sheets and the colony.

```text
[STYLE BIBLE]
A wide hero illustration, landscape 1536x1024, OPAQUE. The six astronauts from the attached character sheets standing proudly
in a friendly group on the purple moon in front of the attached domed colony: Nova with her laser, Pip with his round canisters,
Juno with the comet popper on her backpack, Orion with his long telescope, Mira with her shield emblem and dish, Sol with his tall beacon
antenna. In the background on the left, a swirling magenta-and-lime portal with a few cheeky aliens (a blue blob, a little rock
mite, a bubble) peeking out. Starry sky above. Leave calm space at the top-centre for a logo. No text.
```

Reject if: any astronaut is off-model (compare to the sheets), the aliens look scary.

#### `screen.complete.illustration` — Campaign complete illustration (optional)

**File:** `complete-illustration.png` (proposed; not in D10) · 512 (author 1024) · transparent
**Optional:** P10 specifies the Colony Hero badge plus a star burst; add this only if you want it, and add it to D10.

```text
[STYLE BIBLE]
Celebration illustration, square 1024x1024, transparent background. The six astronauts from the attached sheets cheering on
the roof of the white domed colony under fireworks made of colourful stars, while a few cheeky aliens (blue blob, bubble, lilac
flutter) wave goodbye from a toy saucer flying away. Joyful, no text.
Outline: about 4 px thick on this 1024 px image.
```

Reject if: the aliens look defeated or sad in a hurtful way (they should look cheerful about leaving).

#### `screen.defeat.illustration` — Defeat illustration (optional)

**File:** `defeat-illustration.png` (proposed; not in D10) · 512 (author 1024) · transparent
**Optional:** P11 is text only in D. Keep it gentle: defeat should feel like "let's try again".

```text
[STYLE BIBLE]
Gentle, funny illustration, square 1024x1024, transparent background. Cheeky cartoon aliens (blue blobs, a bubble, a little
rock mite) doing a silly happy dance in a circle around the intact domed colony, while the six astronauts from the attached
sheets shrug with smiles, roll up their sleeves and get ready to try again. Nothing broken, nobody sad or hurt. No text.
Outline: about 4 px thick on this 1024 px image.
```

Reject if: the colony looks damaged, anyone looks upset or frightened.

#### `challenge.card.art` — Quick challenge card art

**Files:** `challenge-blob-parade.png`, `challenge-wobble-rematch.png`, `challenge-bubble-trouble.png` (proposed; not in D10) · 128 (256) ·
transparent
**Purpose:** pictures on the three challenge cards on Planet / run setup (P7). **Reuse existing sprites first** (a Moon Blob row, King
Wobble, a cluster of swarm bubbles); generate only if a composed picture is wanted.

```text
[STYLE BIBLE]
Small square picture for a challenge card, 1024x1024, transparent background, bold and readable at 128 px:
<blob-parade: three blue Moon Blobs from the attached sprite marching in a line, the front one wearing a marching-band hat |
wobble-rematch: the crowned blue jelly boss from the attached sprite grinning with his crown, one eyebrow raised in a cheeky,
playful challenge |
bubble-trouble: a big tumbling cluster of small cyan Bubble Swarm bubbles with faces, with one Bubble Guard in the middle>.
No text.
```

Make three images, one option each. Reject if: any text, the art differs from the in-game sprites.

---

### 4.13 Activity pictures (conversations 15 to 17)

These pictures carry the learning content, so they have the strictest rules (D10.1, D10.9):

- **Text-free** (`textFree: true`): no letters, numbers or symbols, including on objects that usually have them (map, flag, shop, bus, van,
  box, cup, mug, sign, book). Check every image at full size.
- **Recognisable at 128 px** by a five-year-old, as the plain everyday version of the object.
- **One object, plain, no background, no scene**, so the picture shows the word and nothing else. (The ship is just a ship; no sea scenery.)
- **Neutral**: no brand, no country, no religious symbol, no famous character.
- Display 128 px (author 256). Alt text (≤60 characters) is written in the manifest, not in the picture.

Generate in **batches of about 15 per conversation**, attaching the first accepted picture for consistency.

#### `activity.pic.age5-nouns` — Age-5 starter noun pictures (35)

**Files:** `pic-<word>.png` · 128 (256) · transparent

Template:

```text
[STYLE BIBLE]
A single clear picture of <THING> for a children's reading game, the plain everyday version that a five-year-old recognises
instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter view is
fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square 1024x1024,
transparent background, no ground, no scene. Absolutely no text, letters, numbers, logos or symbols on the object.
Match the style of the attached picture if one is attached.
```

| File | `<THING>` | Watch out for |
|---|---|---|
| `pic-cat.png` | a cat, sitting, whole body | |
| `pic-dog.png` | a dog, standing, whole body | |
| `pic-sun.png` | the sun: a yellow circle with simple rays | no face (it may be confused with a character); a gentle smile is fine only if all suns in the game match |
| `pic-moon.png` | a crescent moon | must not look like a banana |
| `pic-pin.png` | a sewing pin with a round coloured head | must not look like a nail or a needle |
| `pic-pan.png` | a frying pan seen from the side at an angle | must not look like a pot (no lid) |
| `pic-pen.png` | a ballpoint pen with its cap off | must not look like a pencil (no sharpened wood tip) |
| `pic-pig.png` | a pink pig, whole body | |
| `pic-hat.png` | a simple sun hat or bobble hat | not a crown or helmet |
| `pic-bed.png` | a single bed with pillow and blanket | |
| `pic-cup.png` | a cup with a handle on a saucer | no writing or pattern that looks like letters; must not look like the mug |
| `pic-map.png` | a folded paper treasure-style map with a dotted path ending in a small star | NO letters, compass letters, place names or real country shapes |
| `pic-net.png` | a fishing net on a pole (a hand net) | |
| `pic-van.png` | a small delivery van, side view | no logo, no number plate characters |
| `pic-jam.png` | a jar of red jam with a cloth lid | no label writing (a plain label shape is fine) |
| `pic-box.png` | a closed cardboard box with tape | no printed words, arrows or recycling symbols |
| `pic-fox.png` | an orange fox, whole body | |
| `pic-bus.png` | a single-deck bus, side view | no route number, destination sign or logo |
| `pic-web.png` | a spider's web (no spider, or a tiny friendly one) | not scary |
| `pic-zip.png` | a zip (zipper) half open | |
| `pic-mug.png` | a tall mug with a handle, no saucer | no writing; must differ from the cup (taller, no saucer) |
| `pic-peg.png` | a wooden clothes peg | |
| `pic-log.png` | a cut wooden log with rings at the end | |
| `pic-ship.png` | a big ship with a funnel, on no water | no flags with designs, no name on the hull; must differ from the boat |
| `pic-shop.png` | a small shop front with an awning and a window | NO sign writing; a plain blank sign board is fine |
| `pic-chip.png` | one golden potato chip (British chip, a thick fried potato stick) | must not read as a crisp; consider a small pile of three chips |
| `pic-fish.png` | a fish, side view | |
| `pic-ring.png` | a gold ring with one round gem | |
| `pic-rain.png` | a grey cloud with falling raindrops | no lightning |
| `pic-boat.png` | a small rowing boat or sailing dinghy, on no water | must differ from the ship (small, no funnel) |
| `pic-frog.png` | a green frog, sitting | |
| `pic-flag.png` | a plain flag on a pole in one colour with a single wavy fold | NO national design, stripes, stars, emblem or letters |
| `pic-bell.png` | a hand bell or a classic bell shape with a clapper | |
| `pic-sock.png` | a single striped sock | |
| `pic-duck.png` | a yellow duck (a real duckling or duck, not a bath toy brand) | |

#### `activity.pic.age67-nouns` — Age 6-7 noun pictures (~15)

**Files:** `pic-<word>.png` · 128 (256) · transparent · same template as above.
Named so far in plan C, except where the table says "proposed"; the rest are chosen while authoring the age 6-7 banks:

| File | `<THING>` | Watch out for |
|---|---|---|
| `pic-knight.png` | a friendly cartoon knight in armour holding a shield (plain shield, no emblem), no sword | no weapon, no heraldry |
| `pic-night-sky.png` | a dark blue rounded square of night sky with a crescent moon and stars | it is a picture of night, so this one may have a background shape |
| `pic-kite.png` | a diamond kite with a bow tail | |
| `pic-knot.png` | a thick rope tied in a simple knot | |
| `pic-football.png` | a classic black-and-white football | no brand marks |
| `pic-bird.png` | a small garden bird, side view | |
| `pic-foxes.png` (optional, proposed) | TWO orange foxes side by side (for the plural "two foxes") | exactly two, same fox as `pic-fox`. Not named in C: the C19 item `spelling-y1-plurals-s-es` has "None" in its picture column. Make it only if that item gains a picture. |
| (about 8 more) | to be decided when the banks are authored | add a row each time |

#### `activity.obj.counting` — Counting objects

**Files:** `obj-star.png`, `obj-moon-rock.png`, `obj-rocket.png`, `obj-alien-egg.png`, `obj-planet.png`, `obj-comet.png` · 64-128 (author 256) ·
transparent
**Purpose:** COUNT_OBJECTS, ADD_WITHIN ("4 rockets and 3 rockets"), OBJECT_MOVE and EQUAL_GROUPS. The app repeats the **same image**, so each
must be a single tidy object, and the six must differ **by shape**, not only colour.

```text
[STYLE BIBLE]
A single counting object for a maths game: <OBJECT>. One object only, centred, filling about 80%, very simple bold shape with
no small details, so that ten copies in a row are easy to count. Square 1024x1024, transparent background. No text, no
numbers, no face.
```

| File | `<OBJECT>` |
|---|---|
| `obj-star.png` | a chunky gold five-point star |
| `obj-moon-rock.png` | a round lumpy purple moon rock |
| `obj-rocket.png` | a small upright white-and-orange rocket with round window and fins |
| `obj-alien-egg.png` | an oval lime-green egg with darker spots |
| `obj-planet.png` | a small blue planet with a single ring |
| `obj-comet.png` | a round gold comet with a short tail to the left |

Reject if: two objects could be confused at 64 px, any object has a face (faces make counting harder to read).

#### `activity.obj.alien` — Counting alien

**File:** `obj-alien.png` (proposed; not in D10) · 64-128 (author 256) · transparent
**Purpose:** SUB_WITHIN pictures such as "8 aliens, 3 fade away". **Reuse the Moon Blob** (frame 01 of `alien.blob.walk`, facing the
viewer) first. If a separate picture is wanted:

```text
[STYLE BIBLE]
A single small friendly blue Moon Blob alien (as attached) facing the viewer, sitting still, simple bold shape, readable at
64 px, so ten copies in a row are easy to count. Square 1024x1024, centred, transparent background. No text, no numbers.
```

The "fade away" is done in code (opacity), not with extra art.

#### `activity.shape.2d` — 2-D shapes

**Files:** `shape-circle.svg`, `-triangle.svg`, `-square.svg`, `-rectangle.svg`, `-pentagon.svg`, `-hexagon.svg` · 128 · SVG
**SVG — not ChatGPT.** Geometry must be exact (regular pentagon and hexagon, a true square, a rectangle clearly longer than tall). Flat fill
plus the plum outline. Pattern activities must differ by shape, not only colour.

#### `activity.shape.3d` — 3-D shapes

**Files:** `shape-cube.png`, `-cuboid.png`, `-sphere.png`, `-cylinder.png`, `-cone.png`, `-pyramid.png` · 128 (256) · transparent
**AI then check, or vector (safer).**

```text
[STYLE BIBLE]
A single geometrically correct 3-D <SHAPE>, cel-shaded with clear light from the top-left so its faces and curves are obvious,
in a plain soft colour with the thick plum outline, seen from slightly above. No pattern, no texture, no shadow on the ground.
Square 1024x1024, centred, filling about 75%. Transparent background, no text.
```

`<SHAPE>`: cube (all edges equal) · cuboid (clearly longer than it is tall and deep) · sphere · cylinder · cone · square-based pyramid.
Reject if: edges are not straight, the cube looks like a cuboid or the other way round, the pyramid has a triangular base.

#### `activity.number.frames` — Number pictures

**Files:** `ten-frame.svg`, `dice-1.svg` … `dice-6.svg`, `group-frame.svg` · 128 · SVG
**SVG — not ChatGPT.** A ten-frame (2 rows of 5 boxes), dice faces showing 1 to 6 **pips in the standard layouts** (no numerals), and a plain
group frame. Exact spacing matters for counting.

#### `activity.sort.containers` — Sorting bins, zones and tray

**Files:** `bin-plain.svg`, `zone-plain.svg`, `tray.svg` · 128-256 · SVG / CSS
**SVG — not ChatGPT.** A plain bin, a plain drop zone and an object tray. Labels are DOM text.

#### `activity.demo.cards` — Concept demonstration card art (~20)

**Files:** `demo-<conceptId>-<nn>.png` (proposed) · 256 (512) · transparent
**Purpose:** the "Show me" cards (C22.6). Each shows a **different worked example** and **never the answer** to the question being asked,
and carries no text. Defined as concepts are authored; prefer composing from existing pictures and counting objects.

```text
[STYLE BIBLE]
A simple teaching picture for young children showing <EXAMPLE> using the attached counting objects / pictures. Clear layout,
plenty of space, objects in tidy rows or groups. Square 1024x1024, transparent background. No text, no numbers, no symbols
such as plus or equals signs (the app adds words).
Outline: about 8 px thick on this 1024 px image.
```

Example `<EXAMPLE>`: "two groups of three stars being pushed together into one group of six" or "a cat and a cup shown side by side to
compare their first sounds" (both pictures already exist in the age-5 list). Write one row in a list per concept when it is authored.
Reject if: it shows the answer to the activity it introduces, any numeral or letter appears.

---

## 5. Post-processing checklist

Do these for every accepted image before it goes into `web/player/public/assets/`:

### 5.1 Clean-up

- [ ] **Transparency is real.** Background is empty alpha, not a painted checkerboard or near-white.
- [ ] **Edges are clean.** Check on black and on white backgrounds: no grey or white halo, no stray semi-transparent pixels away from the
      subject. Defringe or erase as needed.
- [ ] **No text anywhere.** Zoom to 200% and look for fake letters, numbers, logos or signatures (especially on flags, shops, maps, vehicles,
      boxes, screens, badges and door lights).
- [ ] **Nothing scary or violent** at a glance; it still reads as friendly when tiny.

### 5.2 Size and alignment

- [ ] **Trim** empty space, then place the subject on a canvas of the **author size** on its card (2x display; for example 256x256 for a
      128 px sprite).
- [ ] **Pivot:** characters, aliens and bosses stand with their feet at the bottom-centre; effects and icons are centred; pads centred.
- [ ] **Same footprint per family:** all astronauts about 96 px wide at display size; all frames of one animation on identical canvases with
      the feet in the same spot.
- [ ] **Downscale** with a good filter (Lanczos or "bicubic sharper"); never upscale sprites. Look at the result at **display size** next to
      the others: classes distinguishable, levels visibly different, aliens recognisable by shape.
- [ ] **Colour-blind check:** view the set in greyscale (and, if you can, with a deuteranopia filter). Every class and alien should still be
      told apart by shape. Compare these pairs side by side, in greyscale **and** with the deuteranopia filter: **Nova / Mira**, **Nova /
      Juno**, **Nova / Sol**, **Pip / Orion**, and the aliens **Patchling / Split Slime / Bubble Guard**. The armour trait icon must not look
      like the colony shield icons.
- [ ] **Outline weight:** put one asset from each family (astronaut, alien, boss, pad, colony, effect, icon, badge) side by side at display
      size. The plum outline should look the same thickness on all of them (about 2 px at display size, 4 px at author size). If one family
      is thinner, regenerate it with the thicker outline from the table in 1.4 rather than painting over it.
- [ ] **Ground ellipses:** pads, rings and auras are 4 wide : 3 tall (measure the bounding box) and line up with `map.range-circle`.

### 5.3 Export and compress

- [ ] Sprites, effects, icons: **PNG-32** with alpha. Compress losslessly or near-losslessly (oxipng, pngquant at high quality, or Squoosh).
- [ ] Backdrop and full-screen backgrounds: **WebP** (quality about 85) plus a PNG fallback.
- [ ] UI icons, number pictures, 2-D shapes and bins: **SVG**, simplified (SVGO or similar), with no embedded bitmaps or fonts.
- [ ] File named with the hyphenated id from its card; frames as `<assetId>-<anim>-<nn>.png`.
- [ ] Note the size and frame count for the asset manifest (D10.1 fields: `assetId, kind, file/atlasFrame, sizeClass, frames, pivot, alt,
      textFree, source, status, provenance note`) and write the **alt text** (60 characters or fewer, plain words).
- [ ] Keep the full-size original in `art/source/…` so you can re-export later.

---

## 6. Licensing, usage and provenance

- **Check OpenAI's current terms before shipping.** At the time of writing, OpenAI's terms say the user owns the output they generate, subject
  to the terms and usage policies, but terms change. Read the current Terms of Use, Usage Policies and any image-generation-specific terms on
  the day you generate, and note the date you checked. Generated images may not be protectable by copyright in some countries, so others
  could reuse them; that is acceptable for a free family game but worth knowing.
- **Similarity is your responsibility.** The style bible forbids imitating existing games, brands and characters, but always look at the
  results with that in mind. If an image looks like something you have seen before, reject it.
- **Real people:** do not upload photos of real people (including your family) as references for characters or avatars.
- **Provenance record (D10.1 requires a provenance note in the manifest).** For every accepted image, add a row to `docs/art/provenance.csv`
  (to create) with: asset id, file name, date generated, tool and model as shown in ChatGPT, the exact prompt text (or the card reference
  plus any follow-up edits), reference images attached, who edited it afterwards and how, and the date the terms were checked. Keep the
  prompts in the repo alongside this pack so any asset can be regenerated or explained later.
- **Label status honestly.** In the manifest, keep `status: PLACEHOLDER` until the final image has passed section 5, then mark it `FINAL`
  with `source: Generated` or `source: Owner-created` as D10.1 defines.

---

## 7. Coverage index (every inventory id)

The file-by-file list (one entry per image file, with sizes, anchors, paths and the Milestone 1 set) is the catalogue
[`docs/art/asset-catalogue.json`](asset-catalogue.json); see 1.6a. This index lists the cards.

| Group | Inventory ids | Section |
|---|---|---|
| Map | `map.luna.backdrop`, `map.luna.route.straight`, `map.luna.route.corner`, `map.luna.route.portal-end`, `map.luna.route.colony-end`, `map.luna.portal.idle`, `map.luna.colony.healthy`, `map.luna.colony.worried`, `map.luna.colony.very-worried`, `map.luna.colony.shield`, `map.luna.pad.open`, `map.luna.pad.hover`, `map.luna.pad.valid-target`, `map.luna.pad.selected`, `map.luna.pad.locked`, `map.luna.deco.crater`, `map.luna.deco.rock`, `map.luna.deco.antenna`, `map.luna.deco.lamp`, `map.luna.deco.flag`, `map.range-circle` | 4.7 |
| Nova | `class.nova.l1.idle`, `class.nova.l1.attack`, `class.nova.l2.idle`, `class.nova.l2.attack`, `class.nova.l3.idle`, `class.nova.l3.attack`, `class.nova.portrait`, `class.nova.locked` | 4.1 |
| Pip | `class.pip.l1.idle`, `class.pip.l1.attack`, `class.pip.l2.idle`, `class.pip.l2.attack`, `class.pip.l3.idle`, `class.pip.l3.attack`, `class.pip.portrait`, `class.pip.locked` | 4.1 |
| Juno | `class.juno.l1.idle`, `class.juno.l1.attack`, `class.juno.l2.idle`, `class.juno.l2.attack`, `class.juno.l3.idle`, `class.juno.l3.attack`, `class.juno.portrait`, `class.juno.locked` | 4.1 |
| Orion | `class.orion.l1.idle`, `class.orion.l1.attack`, `class.orion.l2.idle`, `class.orion.l2.attack`, `class.orion.l3.idle`, `class.orion.l3.attack`, `class.orion.portrait`, `class.orion.locked` | 4.1 |
| Mira | `class.mira.l1.idle`, `class.mira.l1.emit`, `class.mira.l2.idle`, `class.mira.l2.emit`, `class.mira.l3.idle`, `class.mira.l3.emit`, `class.mira.portrait`, `class.mira.locked` | 4.1 |
| Sol | `class.sol.l1.idle`, `class.sol.l1.pulse`, `class.sol.l2.idle`, `class.sol.l2.pulse`, `class.sol.l3.idle`, `class.sol.l3.pulse`, `class.sol.portrait`, `class.sol.locked` | 4.1 |
| Shared astronaut | `class.all.selected` | 4.1 |
| Effects | `fx.nova.beam`, `fx.pip.bolt`, `fx.pip.slow-ring`, `fx.slowed`, `fx.juno.comet`, `fx.juno.blast`, `fx.mira.shield-pulse`, `fx.mira.repair`, `fx.orion.shot`, `fx.sol.beacon`, `fx.sol.buffed`, `fx.upgrade`, `fx.place`, `fx.sell`, `fx.armour.clonk`, `fx.pop-stars`, `fx.leak`, `fx.heal.received` | 4.5 |
| Aliens | `alien.blob.walk`, `alien.mite.walk`, `alien.shellback.walk`, `alien.swarm.bob`, `alien.flutter.fly`, `alien.flutter.shadow`, `alien.guard.walk`, `alien.guard.bubble-layers`, `alien.guard.bubble-pop`, `alien.patchling.walk`, `alien.patchling.heal-pulse`, `alien.slime.walk`, `alien.slime.split`, `alien.slimelet.hop`, `alien.craft.hover`, `alien.craft.release` | 4.2 |
| Trait icons | `icon.trait.armour`, `icon.trait.flying`, `icon.trait.bubbles`, `icon.trait.healer`, `icon.trait.splitter`, `icon.trait.carrier`, `icon.lock` | 4.3 |
| Bosses | `boss.wobble.walk`, `boss.wobble.dash`, `boss.wobble.phase-change`, `boss.clank.walk`, `boss.clank.plates-fall`, `boss.bubbla.walk`, `boss.bubbla.wand`, `boss.bubbla.bubble`, `boss.mothership.hover`, `boss.mothership.door`, `boss.glorp.walk`, `boss.glorp.phase-change`, `fx.boss.arrive`, `fx.boss.phase`; proposed extras (not in the inventory): `boss.mothership.release` (optional), `boss.glorp.hatch` | 4.4 |
| Meteor powers | `power.frost-pulse.icon`, `power.frost-pulse.fx`, `power.comet-burst.icon`, `power.comet-burst.target`, `power.comet-burst.impact`, `power.colony-shield.icon`, `power.colony-shield.fx`, `meteor.offer.art` | 4.6 |
| Planets | `planet.luna-1`, `planet.coming-later` | 4.8 |
| Screens | `screen.galaxy.background`, `brand.logo`, `screen.landing.hero`, `screen.complete.illustration`, `screen.defeat.illustration`, `challenge.card.art` | 4.12 |
| UI feedback | `fx.reward-credits`, `fx.correct-sparkle` | 4.5 |
| UI icons | `icon.hud.credits`, `icon.hud.health`, `icon.hud.shield`, `icon.hud.wave`, `icon.hud.pause`, `icon.hud.play`, `icon.hud.speed`, `icon.hud.menu`, `icon.target.mode`, `icon.shop.cap-token`, `icon.subject`, `icon.sound`, `icon.sync`, `icon.offline`, `icon.activity` | 4.9 |
| Avatars | `avatar` (12 variants) | 4.11 |
| Badges | `badge.first-steps`, `badge.boss-1`, `badge.boss-2`, `badge.boss-3`, `badge.boss-4`, `badge.campaign-luna-1`, `badge.endless-60`, `badge.safe-and-sound`, `badge.full-crew`, `badge.top-team`, `badge.meteor-catcher`, `badge.keep-trying`, `badge.bright-spark-10`, `badge.bright-spark-50`, `badge.all-rounder`, `badge.challenge-blob-parade`, `badge.challenge-bubble-trouble`, `badge.challenge-wobble-rematch` | 4.10 |
| Activity pictures | `activity.pic.age5-nouns`, `activity.pic.age67-nouns`, `activity.obj.counting`, `activity.obj.alien`, `activity.shape.2d`, `activity.shape.3d`, `activity.number.frames`, `activity.sort.containers`, `activity.demo.cards` | 4.13 |

### Open points for the owner

1. **Id style.** Files use the hyphenated D10 ids because the manifest pattern allows no dots. Names marked "proposed" are not yet in D10;
   add them there when you adopt them.
2. **Optional art.** The landing hero, campaign-complete and defeat illustrations, the galaxy background and the challenge card art are not
   in D10. Decide whether you want them, then add them to D10.
3. **Cast appearances** in 3.1 are proposals. Change them before generating the character sheets, not afterwards.
4. **Activity picture counts** (D10.9 about 100 to 150 against B L-16 / C26.2 about 80) and the remaining age 6-7 nouns and demo cards are
   still open; this pack covers every picture named so far.
5. **Ground projection ratio.** The pack fixes ground ellipses at 4 wide : 3 tall (about a 50-degree camera). Sections C and E must confirm
   the ratio the map code and `map.range-circle` use; if it differs, change the style bible's GROUND PLANE line and the ring cards.
6. **Changes to record in D10.** The Mothership now has four hover states (`shut`, `door1open`, `door12open`, `bare`), Glorp gains a
   one-shot `boss-glorp-hatch` animation and reuses the Bubbla bubble overlay, an optional `boss-mothership-release` exists, Sol's frames
   are 128x192, `icon.lock` may move from Generated to an owner SVG, and the Patchling's colour is patch cream #F7F0E0. Update the D10.6
   frame list and D10.8 to match.
7. **Design changes made for safety and originality.** Juno's launcher became a backpack comet popper, Orion star-gazes instead of
   aiming level, Nova holds her gadget in one hand, the Moon Blob is a wide dome with two bobble antennae, Queen Bubbla wears a bubble
   crown, the portal is a flat pool on the ground, and boss names are kept out of prompt bodies. Check these still match prompt.md and
   plan C's descriptions, and update those if needed.
