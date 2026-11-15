# Single-conversation sequence — every ChatGPT image in one conversation

> **Superseded (2026-11-15).** The ChatGPT route is no longer used. Every image in the [asset catalogue](asset-catalogue.json) is
> now drawn as SVG in `art/svg/` (house style `art/STYLE.md`) and rendered by [tools/art/render.py](../../tools/art/render.py);
> see the [gallery](gallery.html). This file is kept for reference only.
> **Cast changed (2026-11-15):** every human character is now a white European man; see `art/STYLE.md` section 6.

**Status:** paste-ready running order for making every ChatGPT-generated image in **one** ChatGPT conversation, in order.
**Source of truth:** [`chatgpt-asset-prompts.md`](chatgpt-asset-prompts.md) (the pack). Each step below is a pack card in a shorter
form: it relies on the STYLE BIBLE you have already pasted, but keeps every specific requirement of the card (subject, pose and
view, canvas, background, outline, framing, what to avoid). If a step and the pack ever disagree, the pack wins.
**File list:** [`asset-catalogue.json`](asset-catalogue.json) gives every file's `rawPath`, sizes and anchor; the "Save as" lines here
follow it.

## How to use this

1. **The style bible is already in the conversation.** You have pasted the whole pack (including section 2, the STYLE BIBLE) into
   this conversation, so every prompt starts "Following the STYLE BIBLE above." If you ever use a step somewhere else, paste the
   STYLE BIBLE first.
2. **Paste the steps in order, one image per step.** Copy the code block of a step, paste it, wait for the image. Do not paste two
   steps at once.
3. **Accept or fix.** Check the image against the step's **Accept if** line (and, for anything that ships, look at it shrunk to game
   size). If it fails, reply with a short fix instead of re-pasting, changing one thing at a time, for example:
   - "Same image, but remove all text and symbols."
   - "Same character and pose; make the outline thicker and match the style anchor from step 1."
   - "Keep the design; turn it to face three-quarter towards the viewer's right."
   - "Light should come from the top-left, like the style anchor. Fix the shading only."
   - "The background is a painted checkerboard. Regenerate with a truly transparent background, nothing behind the subject."
     If that fails twice: "Regenerate on a flat pure green #00FF00 background, no gradient, no shadow" (use magenta #FF00FF for
     green or lime subjects; the Mira, slime, frog and similar steps already say so).
   - "Start a new image; do not edit the previous one." (if ChatGPT edits the last picture when the step says *New image*)

   If three fixes have not worked, paste the step's full prompt again.
4. **Save every accepted image** at the full size ChatGPT gives you, as a PNG, with the exact name on the **Save as** line, into
   `art/source/<family>/` (create the folders the first time: `astronauts`, `aliens`, `trait-icons`, `bosses`, `effects`, `powers`,
   `map`, `planets`, `screens`, `badges`, `avatars`, `activity`; the style anchor goes straight into `art/source/`). Tick the step in
   the [progress checklist](#progress-checklist) and add a row to `docs/art/provenance.csv` (pack section 6).
5. **Animations: one key image per step.** ChatGPT makes the key pose; the "Save as" frame number (`-01`, `-02`, `-03`, `-04`) is
   where that key pose sits in the animation. You make the other frames yourself in your editor (pack 3.2, method A), or with this
   follow-up in the same conversation (method B):
   ```text
   Attached is frame <NN> of an animation. Make frame <MM> of <TOTAL>: <pose from pack 3.2>. Keep EXACTLY the same character,
   colours, outline, size, scale and camera angle. The feet stay at the same spot at the bottom-centre of the canvas so the frames
   line up. Change only the pose described. Same background and canvas as frame <NN>. No text, letters or numbers.
   ```
   The frame numbers for one-shot effects are a suggestion (the fullest moment sits in the middle); renumber if your animation reads
   better another way, as long as every frame exists in the end.
6. **Never skip the anchor, sheet and reference steps** (style anchor, the six character sheets, the alien line-up, each L1 sprite,
   the first badge, avatar and picture of a set, the Glorp base, the Mothership states). Later prompts refer to them by step number
   ("the style anchor from step 1", "Nova's sheet from step 2"), and L2 and L3 sprites are edits of the L1 sprite before them.
   Steps marked **(optional)** can be skipped; no later step depends on them.
7. **Belt and braces: re-attach the reference.** ChatGPT can see earlier images in the same conversation, but in a long one it
   loses track. When a step says **Attach:**, attach that saved file from `art/source/` with your message as well.
8. **The height guide is yours to make.** After step 3 (Nova's L1 sprite), fill a copy of it with flat night blue #23295E and save it
   as `art/source/astronauts/height-guide.png`. Steps 4 to 8 attach it so the other five astronauts match Nova's height and build
   without copying her face. (This is why Nova's L1 sprite comes before the other five sheets.)

### If it gets slow or the style drifts

- **Re-anchor steps** are built in after every 12 images. Paste them as they come; they cost no image.
- If one image drifts (thinner outline, different light, painterly look), reject it, paste the most recent re-anchor block again,
  attach the style anchor, and then paste the step again.
- If drift continues for two or three steps, or the conversation becomes very slow, **open a new conversation**: paste the STYLE
  BIBLE (pack section 2), attach `art/source/style-anchor.png` and the relevant sheet or reference for the current family (for
  example the character sheet and L1 sprite, the alien line-up, or the first badge), then continue from the current step. Because
  the new conversation has not seen the earlier steps, attach every image a prompt names by step number.

### What the steps cover

Part 1 makes the style anchor and the six character sheets (with Nova's L1 sprite in between for the height guide). Part 2 is
everything ChatGPT makes for the **first playable build** (Milestone 1 in the catalogue): Nova's L1 sprites and shop card, the alien
line-up and Moon Blob, the backdrop, route, portal, the colony with its worried and very worried states, pad, Nova's beam, the
pop-stars, leak, reward-credits and correct-sparkle effects, and the twelve profile avatars. (The one Milestone 1 activity has no
picture, so the counting objects wait for Part 13.) Parts 3 to 13 follow with the remaining astronauts (each class L1, L2, L3 in
order), aliens, trait icons, bosses, effects, meteor powers, the colony shield, pads and decorations, planets, screens, badges and
activity pictures (with the counting objects). A few cards make more than one image (for example the three
Captain Clank states and the four Mothership states); each of those images is its own step. Everything drawn as SVG, in code or as
an edit you make yourself is listed at the end under [Not generated in ChatGPT](#not-generated-in-chatgpt).


## Part 1 — Style anchor and character sheets

### Step 1 — style-anchor (master reference, pack 3.3)

```text
Following the STYLE BIBLE above.
New image: a STYLE ANCHOR reference image for this game. Landscape 1536x1024, opaque.
Scene: a small patch of purple moon ground (regolith lavender and purple, a few soft round craters) seen in the three-quarter
top-down view. On it, left of centre, a round metal build pad with soft glowing rim lights (an ellipse 4 wide : 3 tall). Standing
on the pad is a friendly generic astronaut with an opaque mirrored orange visor (face not visible), white suit with orange
#FF8A2A panels, holding a small toy-like gadget with a round lens out in one hand like a torch. Right of centre, walking along a
smooth glowing moon-dust path towards the right, a wide, flat-bottomed dome-shaped blue jelly alien (#5AA9F0), clearly wider than
tall, with two short stubby round-ended bobble antennae, three lighter crater-like spots on its back, big eyes and a cheeky grin.
Light from the top-left. Uniform thick dark plum #2A1E3D outline on everything, about 10 px thick.
Plain deep space (#141633) sky band along the top edge with a few stars.
No text, no letters, no numbers anywhere.
```

**Save as:** `art/source/style-anchor.png`  
**Attach:** nothing  
**Accept if:** outline thick and even, light clearly from the top-left, camera clearly from above (you see the top of the pad), palette colours, no writing, not painterly or side-on, alien cheeky not scary.

> This image is the reference for every later step. Do not move on until you are happy with it.

### Step 2 — nova-sheet (Nova character sheet, master reference, not shipped)

```text
Following the STYLE BIBLE above.
New image: character reference sheet for this game's Laser Scout astronaut, Nova. Landscape 1536x1024, plain light background.
Show the same character three times side by side at the same size: front view, three-quarter view facing the viewer's right,
and back view. Use the style anchor from step 1 ONLY for style, outline, angle and height; the astronaut in it is a
generic stand-in, and this character has the face, skin and hair described here.
The character: enthusiastic young explorer; young woman with fair skin and rosy cheeks, black curly hair in two puffs, big grin, inside a
round glass bubble helmet with a bright orange visor rim. White spacesuit with orange #FF8A2A panels on the knees and boots, a
bold diagonal orange chevron stripe across the chest, small backpack. She holds a compact, toy-like laser gadget out in ONE hand
like a torch, the other hand free: a short rounded orange and white body with a small round glowing lens at the front, like a
science gadget, clearly not a gun.
Chunky toy proportions, about 2.5 heads tall. Thick dark plum outline (about 10 px, as in the style anchor), light from the top-left.
No text, letters or numbers anywhere, including on the suit.
```

**Save as:** `art/source/astronauts/nova-sheet.png`  
**Attach:** style anchor (step 1)  
**Accept if:** same face and hair in all three views, laser held in one hand like a torch (not a gun), chevron stripe present, no writing on the suit.

### Step 3 — class.nova.l1.idle

```text
Following the STYLE BIBLE above.
New image: using Nova's character sheet from step 2, draw Nova as a single game sprite. Square 1024x1024,
transparent background (PNG with alpha).
Level 1 Nova: exactly as on the sheet. Plain suit with no badges. Small round lens on the laser.
Pose: relaxed ready stance, standing, feet together at the bottom-centre of the canvas, the laser gadget held in one hand at
waist height, lens pointing slightly up and to the viewer's right, the other hand relaxed. Three-quarter top-down view, facing
three-quarter towards the viewer's right.
Full body visible, filling about 80% of the canvas height. Outline about 16 px thick on this 1024 px image.
No ground, no shadow, no text.
```

**Save as:** `art/source/astronauts/nova-l1-idle-01.png` (frames 02-04 in your editor, pack 3.2 method A)  
**Attach:** Nova sheet (step 2)  
**Accept if:** three-quarter (not side-on) view, feet not cut off, laser not pointing at the viewer, face matches the sheet.

> **Before step 4:** make `art/source/astronauts/height-guide.png` yourself: fill this sprite with flat night blue #23295E (lock transparency, fill). The next five sheets attach that plain silhouette for height, never Nova's sheet.

### Step 4 — pip-sheet (Pip character sheet, master reference, not shipped)

```text
Following the STYLE BIBLE above.
New image: character reference sheet for this game's Frost Explorer astronaut, Pip. Landscape 1536x1024, plain light background.
Use the style anchor from step 1 and the attached plain night-blue silhouette ONLY for style, outline, angle and height
(the silhouette shows the height and build to match). This is a DIFFERENT person: do NOT copy Nova's face, skin, hair, colours or
gadget from earlier in this conversation; use the face, skin and hair described here.
Show the same character three times at the same size: front view, three-quarter view facing the viewer's right, back view.
The character: playful ice researcher; young man with pale skin, freckles, tufty ginger hair and round cheeks, inside a round
glass bubble helmet with an ice-blue rim. Pale ice-blue #8ED8FF suit with white panels and simple six-point snowflake emblems on
the chest and knees. On his back, two ROUND cooling canisters like big frosted bubbles, joined to a small pack. He holds a short
frost wand with a snowflake-shaped crystal tip.
Chunky toy proportions, about 2.5 heads tall. Thick dark plum outline (about 10 px, as in the style anchor), light from the top-left.
No text, letters or numbers anywhere.
```

**Save as:** `art/source/astronauts/pip-sheet.png`  
**Attach:** style anchor (step 1) + `height-guide.png` (made by you after step 3); never Nova's sheet  
**Accept if:** same face in all three views and clearly a different person from Nova; the canisters look like round frosted bubbles (not gas cylinders or weapons) and change the silhouette, so Pip is not Nova recoloured.

### Step 5 — juno-sheet (Juno character sheet, master reference, not shipped)

```text
Following the STYLE BIBLE above.
New image: character reference sheet for this game's Comet Engineer astronaut, Juno. Landscape 1536x1024, plain light background.
Use the style anchor from step 1 and the attached plain night-blue silhouette ONLY for style, outline, angle and height
(the silhouette shows the height and build to match). This is a DIFFERENT person: do NOT copy Nova's face, skin, hair, colours or
gadget from earlier in this conversation; use the face, skin and hair described here.
Show the same character three times at the same size: front view, three-quarter view facing the viewer's right, back view.
The character: inventive engineer; young woman with light-brown skin and a straight black bob, confident smile, inside a round
glass bubble helmet with round engineer's GOGGLES pushed up on top of the helmet. Sunshine-yellow #FFD23F suit with white panels
and a tool belt. A chunky round toy COMET POPPER is mounted on her backpack: a short fat yellow-and-white funnel pointing straight
UP over her shoulder, with three round fins and little painted stars, that lobs comets high in the air. She works it with a big
round button on a small hand controller held at her waist. Like a toy from a play set; nothing rests on her shoulder or is aimed.
Chunky toy proportions, about 2.5 heads tall. Thick dark plum outline (about 10 px, as in the style anchor), light from the top-left.
No text, letters or numbers anywhere.
```

**Save as:** `art/source/astronauts/juno-sheet.png`  
**Attach:** style anchor (step 1) + `height-guide.png` (made by you after step 3); never Nova's sheet  
**Accept if:** same face in all three views and clearly a different person from Nova; goggles present, popper funnel points straight up from the backpack and nothing is held or braced like a gun, bazooka or rifle.

### Step 6 — orion-sheet (Orion character sheet, master reference, not shipped)

```text
Following the STYLE BIBLE above.
New image: character reference sheet for this game's Orbit Ranger astronaut, Orion. Landscape 1536x1024, plain light background.
Use the style anchor from step 1 and the attached plain night-blue silhouette ONLY for style, outline, angle and height
(the silhouette shows the height and build to match). This is a DIFFERENT person: do NOT copy Nova's face, skin, hair, colours or
gadget from earlier in this conversation; use the face, skin and hair described here.
Show the same character three times at the same size: front view, three-quarter view facing the viewer's right, back view.
The character: observant navigator; young man with olive skin and wavy dark hair, thoughtful friendly expression, a small
bright hearing aid, inside a round glass bubble helmet with a navy rim. Navy #2E4A9E suit with a pattern of small gold #FFD86B
four-point stars. He carries a LONG telescope in one hand: a slim brass-and-navy tube with a round lens at the front and a small
eyepiece, longer than his arm, held like a stargazer's telescope, tilted upward, never shouldered or aimed level. Clearly an
explorer's telescope. The stars are simple shapes.
Chunky toy proportions, about 2.5 heads tall. Thick dark plum outline (about 10 px, as in the style anchor), light from the top-left.
No text, letters or numbers anywhere.
```

**Save as:** `art/source/astronauts/orion-sheet.png`  
**Attach:** style anchor (step 1) + `height-guide.png` (made by you after step 3); never Nova's sheet  
**Accept if:** same face in all three views and clearly a different person from Nova; the telescope reads as a stargazer's telescope (no stock, trigger or magazine), held tilted up, and the stars are plain shapes, not letters.

### Step 7 — mira-sheet (Mira character sheet, master reference, not shipped)

```text
Following the STYLE BIBLE above.
New image: character reference sheet for this game's Shield Specialist astronaut, Mira. Landscape 1536x1024, plain light background.
Use the style anchor from step 1 and the attached plain night-blue silhouette ONLY for style, outline, angle and height
(the silhouette shows the height and build to match). This is a DIFFERENT person: do NOT copy Nova's face, skin, hair, colours or
gadget from earlier in this conversation; use the face, skin and hair described here.
Show the same character three times at the same size: front view, three-quarter view facing the viewer's right, back view.
The character: calm colony technician; woman with medium-brown skin, dark hair in a neat bun, round glasses, calm kind smile,
inside a round glass bubble helmet with a green rim. White suit with leaf-green #3DBE6E panels. A LARGE, obvious rounded shield
emblem covers most of her chest (a plain green-and-white shield shape with no symbols inside). She holds a small handheld dish
emitter, like a mini satellite dish on a short handle, with a cyan #5BE0F0 centre.
Chunky toy proportions, about 2.5 heads tall. Thick dark plum outline (about 10 px, as in the style anchor), light from the top-left.
No text, letters or numbers anywhere.
```

**Save as:** `art/source/astronauts/mira-sheet.png`  
**Attach:** style anchor (step 1) + `height-guide.png` (made by you after step 3); never Nova's sheet  
**Accept if:** same face in all three views and clearly a different person from Nova; the chest shield is large and plain (no cross, letter or logo) and the dish does not look like a weapon.

### Step 8 — sol-sheet (Sol character sheet, master reference, not shipped)

```text
Following the STYLE BIBLE above.
New image: character reference sheet for this game's Beacon Commander astronaut, Sol. Landscape 1536x1024, plain light background.
Use the style anchor from step 1 and the attached plain night-blue silhouette ONLY for style, outline, angle and height
(the silhouette shows the height and build to match). This is a DIFFERENT person: do NOT copy Nova's face, skin, hair, colours or
gadget from earlier in this conversation; use the face, skin and hair described here.
Show the same character three times at the same size: front view, three-quarter view facing the viewer's right, back view.
The character: encouraging communications specialist; older man with dark-brown skin, a short grey beard and a warm grin,
inside a round glass bubble helmet with a gold rim. Red #E2403A suit with gold #F5B700 panels. A TALL thin antenna rises from
his backpack, taller than his helmet, topped by a round glowing gold beacon bulb (the antenna adds height). One hand is raised in
a friendly thumbs-up.
Chunky toy proportions, about 2.5 heads tall. Thick dark plum outline (about 10 px, as in the style anchor), light from the top-left.
No text, letters or numbers anywhere.
```

**Save as:** `art/source/astronauts/sol-sheet.png`  
**Attach:** style anchor (step 1) + `height-guide.png` (made by you after step 3); never Nova's sheet  
**Accept if:** same face in all three views and clearly a different person from Nova; the antenna is tall and clearly visible above the helmet, and the raised hand is a thumbs-up, not a salute or stop sign.


## Part 2 — First playable build (Milestone 1)

### Step 9 — class.nova.l1.attack

```text
Following the STYLE BIBLE above.
Edit the Nova level 1 sprite from step 3: same Nova, same size and position on the canvas, feet in the same place.
Pose (key frame, "zap"): Nova holds the laser gadget out in ONE hand like a torch, arm forward towards the viewer's right and
slightly away, the other hand free, lens glowing with a small soft orange-white light, a small happy bounce in her stance. Do NOT
draw the beam itself. Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/nova-l1-attack-02.png` (key frame "zap"; frames 01, 03, 04 by pack 3.2)  
**Attach:** Nova L1 idle (step 3)  
**Accept if:** no beam or explosion, same size and spot on the canvas, glow is light (not fire), gadget held like a torch, not braced like a gun.

### Step 10 — class.nova.portrait

```text
Following the STYLE BIBLE above.
New image: head-and-shoulders portrait of Nova (level 1 look, from her sheet in step 2), facing the viewer, friendly
big grin, helmet on, laser lens just visible at the bottom edge. Centred, filling about 85% of the canvas. Square 1024x1024,
transparent background, outline about 16 px. No text, no frame, no border.
```

**Save as:** `art/source/astronauts/nova-card.png`  
**Attach:** Nova sheet (step 2)  
**Accept if:** no frame, card border or name, and the face matches the sheet.

### Step 11 — alien-lineup (alien line-up, reference for 4.2, not shipped)

```text
Following the STYLE BIBLE above.
New image: reference line-up of the game's aliens, side by side on a plain light background, landscape 1536x1024, all facing
three-quarter towards the viewer's right, shown at their relative game sizes: a wide, flat-bottomed dome-shaped blue jelly blob,
clearly wider than tall, with two short stubby round-ended bobble antennae and three lighter crater-like spots on its back
(medium); a tiny pointed orange rock creature with little legs (small); a wide teal domed shell creature with stubby legs
(medium); a tiny cyan bubble with a face (very small); a lilac winged disc creature (medium); a little peach alien inside nested
soap bubbles (medium); a little patch-cream (#F7F0E0) alien with a lilac-pink cheek blush carrying a BIG flag with a
sticking-plaster shape (medium); a lime two-lobed slime with a seam (medium); a toy flying saucer with portholes (large).
All cute, cheeky, big-eyed, rounded, not scary. Outline about 10 px, as in the style anchor. No text.
```

**Save as:** `art/source/aliens/alien-lineup.png`  
**Attach:** style anchor (step 1)  
**Accept if:** all nine aliens present, cute and cheeky, sizes in the right order, blob is a wide dome with two bobble antennae, no text.

### Step 12 — alien.blob.walk

```text
Following the STYLE BIBLE above.
New image: game sprite of a MOON BLOB alien (the blue blob from the line-up in step 11). Square 1024x1024,
transparent background.
A wobbly, translucent-looking blue (#5AA9F0) jelly alien: a wide, flat-bottomed dome shape, clearly wider than tall, with
two short stubby round-ended bobble antennae and three lighter crater-like spots on its back, a lighter belly, two big shiny
eyes and a cheeky lopsided grin. It has no legs; it moves by squashing and stretching.
Pose (frame 01, "contact"): leaning forward towards the viewer's right, slightly stretched. Three-quarter top-down view.
Bottom of the blob at the bottom-centre of the canvas, filling about 75% of the canvas. Outline about 16 px.
No ground, no shadow, no text.
```

**Save as:** `art/source/aliens/alien-blob-walk-01.png` (frames 02-06 by squash and stretch in your editor)  
**Attach:** alien line-up (step 11)  
**Accept if:** a wide dome with two bobble antennae (a teardrop with a pointed tip is an automatic reject), cheeky not angry, not gooey or gross.

### Re-anchor 1 (after step 12)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 13 — map.luna.backdrop

```text
Following the STYLE BIBLE above.
New image: background painting for the game battlefield. Landscape 1536x1024, OPAQUE (no transparency).
A colourful cartoon moon surface seen from the three-quarter top-down angle: gently rolling regolith in lavender (#9C8FD6) and
purple (#6B5CA5) with soft teal (#3FB8AF) patches, a few shallow round craters and small pebbles scattered thinly near the
edges. The moon ground fills the WHOLE image from edge to edge: no sky, no horizon. The middle of the image must be fairly calm
and even, with NO path, NO road, NO buildings, NO landing pads and NO characters, because the game draws those on top.
Light from the top-left. No text.
```

**Save as:** `art/source/map/luna-backdrop.png` (later: crop to 1536x845, upscale 2.5x, export WebP; see the pack card)  
**Attach:** style anchor (step 1)  
**Accept if:** no path, buildings or pads painted in, calm centre, no sky at the top edge, no writing.

### Step 14 — map.luna.route.straight

```text
Following the STYLE BIBLE above.
New image: a seamless, tileable game texture seen from directly above: a smooth glowing moon-dust track, pale cream-lavender
(#E6DDF7) with a soft teal (#3FB8AF) glowing border along the top and bottom edges, and a faint repeating pattern of soft
chevron arrows pointing to the RIGHT along the middle. The left and right edges must match exactly so it repeats sideways.
Landscape 1536x1024, the track running edge to edge horizontally across the middle third. Transparent above and below the
track. Outline about 16 px on the track edges. No text.
```

**Save as:** `art/source/map/route-straight-h.png` (then crop one seamless repeat to 192x192 yourself; see the pack card)  
**Attach:** style anchor (step 1)  
**Accept if:** arrows evenly spaced (they must not jump at tile joins) and the borders straight, not wobbly.

### Step 15 — map.luna.route.portal-end

```text
Following the STYLE BIBLE above.
New image: using the route texture from step 14, the START of the same track, seen from directly above. The
track enters from the LEFT edge as a soft glowing fan that narrows into the normal track width, continuing to the right edge
exactly like the texture from step 14. Square 1024x1024, track in the middle band, transparent elsewhere.
Outline about 16 px. No text.
```

**Save as:** `art/source/map/route-portal-end.png` (trim to 192x192 and match the right edge by hand)  
**Attach:** route texture (step 14)  
**Accept if:** the right edge lines up with the straight tile.

### Step 16 — map.luna.route.colony-end

```text
Following the STYLE BIBLE above.
New image: using the route texture from step 14, the END of the same track, seen from directly above. The track
enters from the LEFT edge at the normal width and ends at the right in a rounded doorstep pad with a soft glowing gate line (a
plain bar of light, no symbols). Square 1024x1024, track in the middle band, transparent elsewhere. Outline about 16 px. No text.
```

**Save as:** `art/source/map/route-colony-end.png` (trim to 192x192)  
**Attach:** route texture (step 14)  
**Accept if:** the left edge lines up with the straight tile and the gate line has no symbols.

### Step 17 — map.luna.portal.idle

```text
Following the STYLE BIBLE above.
New image: game sprite of a friendly cartoon arrival portal on the moon surface, seen from the three-quarter top-down angle: a
flat, round swirling pool of magenta (#E05FD0) and lime (#9BE564) light lying ON the moon ground (an ellipse exactly 4 wide :
3 tall), edged with a low ring of rounded pebbles, with a few sparkles and small floating moon rocks bobbing just above it.
Nothing stands upright. Inviting and playful, not dark or scary. Square 1024x1024, centred low, filling about 85% of the width.
Transparent background. Outline about 8 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/map/portal-idle-01.png` (frames 02-06: rotate the swirl about 10 degrees each in your editor)  
**Attach:** style anchor (step 1)  
**Accept if:** a flat pool on the ground (not an upright ring, gate or arch), playful not a black hole, not like a known game or film portal.

### Step 18 — map.luna.colony.healthy

```text
Following the STYLE BIBLE above.
New image: game sprite of a cheerful moon RESEARCH COLONY, seen from the three-quarter top-down angle, toy-like proportions: a
cluster of three white domed buildings with round windows glowing warm cream, joined by short tubes, a small greenhouse dome with
plants, two antennas with gold tips, and a row of blue solar panels. A round doorway faces left towards where the path arrives.
Friendly and safe-looking, like a toy play set. Same outline and light as the characters. Square 1024x1024, base at the
bottom-centre, filling about 85%. Transparent background. Outline about 6 px thick on this 1024 px image.
No text, no flags, no logos on any building.
```

**Save as:** `art/source/map/colony-healthy.png`  
**Attach:** style anchor (step 1)  
**Accept if:** toy-like and friendly, nothing like a real space-agency base or brand, no signs, numbers or letters on any building.

### Step 19 — map.luna.colony.worried

```text
Following the STYLE BIBLE above.
Edit the colony from step 18. Keep EXACTLY the same buildings, silhouette, size and position. Change only: two
windows flicker (one dark, one half-lit), one antenna wobbles at a slight angle, two small WHITE steam puffs shaped like little
clouds rise from a tube joint, and a cartoon sweat drop appears beside the main dome. Playful, no damage, no cracks, no smoke.
Transparent background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/map/colony-worried.png`  
**Attach:** colony healthy (step 18)  
**Accept if:** same silhouette (it swaps in place), nothing broken or on fire.

### Step 20 — map.luna.colony.very-worried

```text
Following the STYLE BIBLE above.
Edit the colony from step 18. Keep EXACTLY the same buildings, silhouette, size and position. Change only: more
windows flicker, both antennas droop like tired flowers, and a round amber alert light on top of the main dome glows with a
cartoon sweat-drop shape beside it. Still friendly and intact, not destroyed. Transparent background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/map/colony-very-worried.png`  
**Attach:** colony healthy (step 18)  
**Accept if:** intact and friendly, alert light has no "!" or symbol.

### Step 21 — map.luna.pad.open

```text
Following the STYLE BIBLE above.
New image: game sprite of a round metal BUILD PAD seen from the three-quarter top-down angle (so its top is an ellipse exactly
4 wide : 3 tall), matching the pad in the style anchor from step 1: a low circular platform in metal grey (#A7B0C8)
with a raised rim, soft cream glowing rim lights spaced evenly around it, and a plain flat top for a character to stand on. No
symbols on the top. Square 1024x1024, centred, filling about 85% of the width. Transparent background. Outline about 16 px.
No text.
```

**Save as:** `art/source/map/pad-empty.png`  
**Attach:** style anchor (step 1)  
**Accept if:** same angle as the style anchor's pad, plain top with no logo or "H".

### Step 22 — fx.nova.beam (level 1)

```text
Following the STYLE BIBLE above.
New image: game effect texture, a short HORIZONTAL segment of a friendly cartoon laser beam, running edge to edge across the
canvas, with a bright cream-white core and a soft orange (#FF8A2A) glow on both sides, rounded and smooth. It must be able to
stretch sideways. Landscape 1536x1024; the beam is a band about one third of the canvas height through the middle.
On a flat pure black #000000 background (it is a glow; I will convert black to alpha). No text.
```

**Save as:** `art/source/effects/fx-nova-beam-l1-01.png` (frames 02-03: small brightness changes in your editor)  
**Attach:** nothing  
**Accept if:** soft friendly light, not a weapon blast, with edges straight enough to stretch.

### Step 23 — fx.pop-stars

```text
Following the STYLE BIBLE above.
New image: game effect, a playful round burst of colourful cartoon stars (blue, lime, magenta, gold, cyan, lilac) and little
round confetti dots flying outward from the centre, with a soft cream flash in the middle. Happy and celebratory, no debris, no
smoke. Square 1024x1024, centred, filling about 90%. Transparent background. Outline about 16 px. No text.
```

**Save as:** `art/source/effects/fx-pop-stars-04.png` (key frame of 8; the most-seen effect, make it delightful)  
**Attach:** nothing  
**Accept if:** celebratory stars, not an explosion, nothing hurt.

### Step 24 — fx.leak

```text
Following the STYLE BIBLE above.
New image: game effect, a springy bounce puff, a round soft lilac cloud puff with a coiled swoosh line above it and two small
stars, cheeky rather than alarming. Square 1024x1024, centred, filling about 70%. Transparent background. Outline about 16 px.
No text, no letters.
```

**Save as:** `art/source/effects/fx-leak-03.png` (key frame)  
**Attach:** nothing  
**Accept if:** cheeky, not damage or an explosion, no word.

### Re-anchor 2 (after step 24)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 25 — fx.reward-credits

```text
Following the STYLE BIBLE above.
New image: game effect, a handful of shiny gold star-coins (round gold coins with a plain embossed five-point star, no numbers)
flying up and to the right in an arc, with sparkles. Square 1024x1024, filling about 85%. Transparent background. Outline about 16 px.
No text, no numbers.
```

**Save as:** `art/source/effects/fx-reward-credits-04.png` (key frame of 8; or skip if you do it in CSS)  
**Attach:** nothing  
**Accept if:** coins carry no numbers, letters or currency symbol.

### Step 26 — fx.correct-sparkle

```text
Following the STYLE BIBLE above.
New image: game effect, a joyful round sparkle burst of gold and cream four-point stars with a few small lime and cyan dots,
radiating from the centre. Square 1024x1024, centred, filling about 85%. Transparent background. Outline about 16 px. No text, no tick mark.
```

**Save as:** `art/source/effects/fx-correct-sparkle-04.png` (key frame of 8; or skip if you do it in CSS)  
**Attach:** nothing  
**Accept if:** no tick mark, and not too busy to sit behind text.

### Step 27 — avatar (01)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a big rocket badge on the chest and a rocket-shaped fin on the helmet. The child has deep brown skin, short black hair, with a simple generic face.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-01.png`  
**Attach:** nothing  
**Accept if:** clean circle and rim you are happy to reuse for all 12, no lettering, not like any of the six game astronauts at 64 px.

### Step 28 — avatar (02)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a large yellow star on the helmet top. The child has light skin, straight blond hair, with a simple generic face.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
Match the circle, rim and style of the avatar from step 27 exactly.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-02.png`  
**Attach:** first avatar (step 27)  
**Accept if:** same circle and rim as the others, no lettering, unlike the other avatars and the six game astronauts at 64 px.

### Step 29 — avatar (03)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a crescent moon shape on the helmet. The child has medium-brown skin, long dark braids, with a simple generic face.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
Match the circle, rim and style of the avatar from step 27 exactly.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-03.png`  
**Attach:** first avatar (step 27)  
**Accept if:** same circle and rim as the others, no lettering, unlike the other avatars and the six game astronauts at 64 px.

### Step 30 — avatar (04)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a comet with a sparkly tail across the helmet. The child has pale skin, red curly hair, with a simple generic face.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
Match the circle, rim and style of the avatar from step 27 exactly.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-04.png`  
**Attach:** first avatar (step 27)  
**Accept if:** same circle and rim as the others, no lettering, unlike the other avatars and the six game astronauts at 64 px.

### Step 31 — avatar (05)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a small ringed planet floating beside the helmet. The child has olive skin, short wavy brown hair, with a simple generic face.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
Match the circle, rim and style of the avatar from step 27 exactly.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-05.png`  
**Attach:** first avatar (step 27)  
**Accept if:** same circle and rim as the others, no lettering, unlike the other avatars and the six game astronauts at 64 px.

### Step 32 — avatar (06)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a friendly round robot face inside the helmet instead of a human face, with two antennae.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
Match the circle, rim and style of the avatar from step 27 exactly.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-06.png`  
**Attach:** first avatar (step 27)  
**Accept if:** same circle and rim as the others, no lettering, unlike the other avatars and the six game astronauts at 64 px.

### Step 33 — avatar (07)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a lilac friendly alien with two big eyes and two curly antennae inside the helmet.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
Match the circle, rim and style of the avatar from step 27 exactly.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-07.png`  
**Attach:** first avatar (step 27)  
**Accept if:** same circle and rim as the others, no lettering, unlike the other avatars and the six game astronauts at 64 px.

### Step 34 — avatar (08)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a small telescope held up beside the helmet. The child has dark-brown skin, close-cropped hair, with a simple generic face.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
Match the circle, rim and style of the avatar from step 27 exactly.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-08.png`  
**Attach:** first avatar (step 27)  
**Accept if:** same circle and rim as the others, no lettering, unlike the other avatars and the six game astronauts at 64 px.

### Step 35 — avatar (09)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a little satellite orbiting the helmet. The child has light-brown skin, black hair in a ponytail, with a simple generic face.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
Match the circle, rim and style of the avatar from step 27 exactly.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-09.png`  
**Attach:** first avatar (step 27)  
**Accept if:** same circle and rim as the others, no lettering, unlike the other avatars and the six game astronauts at 64 px.

### Step 36 — avatar (10)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a big smiling sun shape behind the helmet, its rays poking out around the helmet edge. The child has tan skin, short straight black hair, with a simple generic face.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
Match the circle, rim and style of the avatar from step 27 exactly.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-10.png`  
**Attach:** first avatar (step 27)  
**Accept if:** same circle and rim as the others, no lettering, unlike the other avatars and the six game astronauts at 64 px.

### Re-anchor 3 (after step 36)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 37 — avatar (11)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a small round meteor with a short tail on the chest. The child has warm beige skin, brown curly hair, with a simple generic face.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
Match the circle, rim and style of the avatar from step 27 exactly.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-11.png`  
**Attach:** first avatar (step 27)  
**Accept if:** same circle and rim as the others, no lettering, unlike the other avatars and the six game astronauts at 64 px.

### Step 38 — avatar (12)

```text
Following the STYLE BIBLE above.
New image: a round profile AVATAR for a children's space game. Square 1024x1024, transparent background outside the circle.
A circle filled with night blue (#23295E) and a few tiny stars, with a thin gold rim. Inside: a cute, friendly, simple character
wearing a round glass astronaut helmet, head and shoulders, facing the viewer, with a big clear shape motif: a cat in a round helmet with ears inside the glass.
Do NOT make it look like any of the six game astronauts from earlier in this conversation. Bold shapes readable at 64 px.
Outline about 16 px.
Match the circle, rim and style of the avatar from step 27 exactly.
No face of any real person, no text, no letters, no numbers.
```

**Save as:** `art/source/avatars/avatar-12.png`  
**Attach:** first avatar (step 27)  
**Accept if:** same circle and rim as the others, no lettering, unlike the other avatars and the six game astronauts at 64 px.


## Part 3 — Astronauts (each class L1 → L2 → L3)

### Step 39 — class.nova.l2.idle

```text
Following the STYLE BIBLE above.
Edit the Nova level 1 sprite from step 3 into LEVEL 2. Keep the same character, face, pose, size and position.
Change only: the laser's lens is noticeably larger (about 1.5 times) with a brighter orange rim, and a simple gold five-point
star patch appears on her chest panel. The silhouette must read as an upgrade.
Square 1024x1024, transparent background, outline about 16 px. No text, no letters on the patch.
```

**Save as:** `art/source/astronauts/nova-l2-idle-01.png`  
**Attach:** Nova L1 idle (step 3)  
**Accept if:** patch has no letter or number, pose unchanged, upgrade visible at 128 px.

### Step 40 — class.nova.l2.attack

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Nova sprite from step 39 (larger lens, gold star patch). Same size and feet position.
Pose (key frame, "zap"): laser gadget held out in ONE hand like a torch towards the viewer's right, lens glowing orange-white,
a small happy bounce. Do not draw the beam. Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/nova-l2-attack-02.png`  
**Attach:** Nova L2 idle (step 39)  
**Accept if:** lens size and star patch kept, no beam, gadget held like a torch, not a gun.

### Step 41 — class.nova.l3.idle

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Nova sprite from step 39 into LEVEL 3. Keep the same character, face, pose, size and position.
Change only: the lens is the largest yet (about twice the level 1 size) with a glowing orange ring; add two orange shoulder
stripes and a round gold badge shape on the upper arm (plain, no symbols); add a small rounded orange fin on top of the backpack.
Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/nova-l3-idle-01.png`  
**Attach:** Nova L2 idle (step 39)  
**Accept if:** still the same person, insignia have no letters or numbers, the fin does not look like a weapon.

### Step 42 — class.nova.l3.attack

```text
Following the STYLE BIBLE above.
Edit the LEVEL 3 Nova sprite from step 41 (largest lens, shoulder stripes, arm badge, backpack fin). Same size and
feet position. Pose (key frame, "zap"): laser gadget held out in ONE hand like a torch towards the viewer's right, a BIGGER soft
glow than before around the lens, a small happy bounce. Do not draw the beam. Square 1024x1024, transparent background,
outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/nova-l3-attack-02.png`  
**Attach:** Nova L3 idle (step 41)  
**Accept if:** glow is soft light (not fire or an explosion), L3 details kept, gadget not held like a gun.

### Step 43 — class.pip.l1.idle

```text
Following the STYLE BIBLE above.
New image: using Pip's sheet from step 4, draw Pip as a single game sprite. Square 1024x1024, transparent background.
Level 1 Pip: as on the sheet; two small round canisters, small snowflake wand.
Pose: playful ready stance, feet together at the bottom-centre, wand held up beside him, the canisters clearly visible behind
his shoulders. Three-quarter top-down view, facing three-quarter towards the viewer's right. Full body, about 80% of the
canvas height. Outline about 16 px. No ground, no shadow, no text.
```

**Save as:** `art/source/astronauts/pip-l1-idle-01.png`  
**Attach:** Pip sheet (step 4)  
**Accept if:** canisters visible, snowflake has no letters or odd symbols, three-quarter view (not side-on).

### Step 44 — class.pip.l1.attack

```text
Following the STYLE BIBLE above.
Edit the level 1 Pip sprite from step 43: same size and feet position.
Pose (key frame, "zap"): Pip points the wand forward to the viewer's right with a little hop, cheeks puffed, a small soft
frosty sparkle (#CFF6FF) at the wand tip. Do NOT draw the projectile. Square 1024x1024, transparent background,
outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/pip-l1-attack-02.png`  
**Attach:** Pip L1 idle (step 43)  
**Accept if:** no projectile or big blast, feet stay in place.

### Step 45 — class.pip.l2.idle

```text
Following the STYLE BIBLE above.
Edit the level 1 Pip sprite from step 43 into LEVEL 2. Same character, face, pose, size and position.
Change only: the two back canisters are about 1.5 times bigger and glow faintly icy blue; add a snowflake emblem on each
shoulder; the wand tip crystal is a little larger. Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/pip-l2-idle-01.png`  
**Attach:** Pip L1 idle (step 43)  
**Accept if:** same character, upgrade visible at 128 px.

### Step 46 — class.pip.l2.attack

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Pip sprite from step 45 (bigger glowing canisters, shoulder snowflakes). Same size and feet
position. Pose (key frame, "zap"): wand pointed forward to the viewer's right, frosty sparkle at the tip. No projectile.
Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/pip-l2-attack-02.png`  
**Attach:** Pip L2 idle (step 45)  
**Accept if:** L2 details kept.

### Step 47 — class.pip.l3.idle

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Pip sprite from step 45 into LEVEL 3. Same character, face, pose, size and position.
Change only: the canisters are the biggest yet, frosted with little icicles; add a thin flat ring of frost crystals on the
ground around his feet (an ellipse exactly 4 wide : 3 tall, pale #CFF6FF, staying inside the canvas); add a small ice-blue star
badge shape on the chest (plain, no symbols). Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/pip-l3-idle-01.png`  
**Attach:** Pip L2 idle (step 45)  
**Accept if:** aura ring inside the canvas and not hiding the feet, no letters anywhere.

### Step 48 — class.pip.l3.attack

```text
Following the STYLE BIBLE above.
Edit the LEVEL 3 Pip sprite from step 47 (largest canisters, frost aura ring, chest badge). Same size and feet
position. Pose (key frame, "zap"): wand pointed forward with a WIDER soft frosty puff at the tip (a small cloud of sparkles,
not a blast). Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/pip-l3-attack-02.png`  
**Attach:** Pip L3 idle (step 47)  
**Accept if:** the puff reads as sparkles, not smoke or an explosion.

### Re-anchor 4 (after step 48)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 49 — class.pip.portrait

```text
Following the STYLE BIBLE above.
New image: head-and-shoulders portrait of Pip (level 1 look, from his sheet in step 4), facing the viewer, playful
grin, helmet on, the tops of the two round canisters visible behind his shoulders. Centred, about 85% of the canvas. Square
1024x1024, transparent background, outline about 16 px. No text, no frame.
```

**Save as:** `art/source/astronauts/pip-card.png`  
**Attach:** Pip sheet (step 4)  
**Accept if:** both canisters visible (they make the silhouette distinct from Nova's).

### Step 50 — class.juno.l1.idle

```text
Following the STYLE BIBLE above.
New image: using Juno's sheet from step 5, draw Juno as a single game sprite. Square 1024x1024, transparent background.
Level 1 Juno: as on the sheet; small comet popper on her backpack, its funnel pointing straight up over her shoulder; hand
controller held at her waist.
Pose: confident stance, feet at the bottom-centre. Three-quarter top-down view, facing three-quarter towards the viewer's right.
Full body filling only about 65% of the canvas height, leaving empty space above and at the top-right for the bigger popper at
later levels. Outline about 16 px. No ground, no shadow, no text.
```

**Save as:** `art/source/astronauts/juno-l1-idle-01.png`  
**Attach:** Juno sheet (step 5)  
**Accept if:** funnel points straight up (not forwards or at the viewer), goggles present, figure no more than about 70% of the height.

### Step 51 — class.juno.l1.attack

```text
Following the STYLE BIBLE above.
Edit the level 1 Juno sprite from step 50: same size and feet position, same framing (figure about 65% of the
canvas height).
Pose (key frame, "launch"): Juno presses the big round button on her hand controller with a happy grin; the funnel on her
backpack bounces and puffs a soft gold sparkle puff (#FFC94A) out of its top opening, straight up. Do NOT draw the comet.
Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/juno-l1-attack-04.png` (key frame "launch"; frames 01-03, 05-06 by pack 3.2)  
**Attach:** Juno L1 idle (step 50)  
**Accept if:** no flames, smoke or explosion, no comet, nothing held or braced like a gun, bazooka or rifle.

### Step 52 — class.juno.l2.idle

```text
Following the STYLE BIBLE above.
Edit the level 1 Juno sprite from step 50 into LEVEL 2. Same character, face, pose, size and position; the figure
still fills about 65% of the canvas height. Change only: the backpack comet popper is chunkier (about 1.4 times thicker) with a
bright orange band around the funnel, and a gold star patch appears on her chest (plain, no letters). Square 1024x1024,
transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/juno-l2-idle-01.png`  
**Attach:** Juno L1 idle (step 50)  
**Accept if:** the change is easy to see at 128 px.

### Step 53 — class.juno.l2.attack

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Juno sprite from step 52 (chunkier popper with orange band, star patch). Same size, framing and
feet position. Pose (key frame, "launch"): she presses the button on her hand controller, the funnel bounces and puffs a gold
sparkle puff straight up out of its top opening. No comet. Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/juno-l2-attack-04.png`  
**Attach:** Juno L2 idle (step 52)  
**Accept if:** L2 details kept.

### Step 54 — class.juno.l3.idle

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Juno sprite from step 52 into LEVEL 3. Same character, face, pose, size and position; the figure
still fills about 65% of the canvas height and the bigger popper uses the empty space above her. Change only: the popper is the
biggest yet, with a soft glowing gold ring inside the top opening of the funnel and two bands; add yellow shoulder stripes; the
goggles now have a small gold light. Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/juno-l3-idle-01.png`  
**Attach:** Juno L2 idle (step 52)  
**Accept if:** still reads as a person (not mostly popper) and nothing is cropped.

### Step 55 — class.juno.l3.attack

```text
Following the STYLE BIBLE above.
Edit the LEVEL 3 Juno sprite from step 54 (biggest glowing popper, shoulder stripes). Same size, framing and feet
position. Pose (key frame, "launch"): she presses the button on her hand controller, the funnel bounces and a bright gold
sparkle flash with little stars puffs straight up out of the tube opening. No comet. Square 1024x1024, transparent background,
outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/juno-l3-attack-04.png`  
**Attach:** Juno L3 idle (step 54)  
**Accept if:** the flash is sparkles, not fire or an explosion.

### Step 56 — class.juno.portrait

```text
Following the STYLE BIBLE above.
New image: head-and-shoulders portrait of Juno (level 1 look, from her sheet in step 5), facing the viewer,
confident smile, goggles on the helmet, the funnel of the backpack comet popper rising straight up over one shoulder. Centred,
about 85% of the canvas. Square 1024x1024, transparent background, outline about 16 px. No text, no frame.
```

**Save as:** `art/source/astronauts/juno-card.png`  
**Attach:** Juno sheet (step 5)  
**Accept if:** goggles and upward funnel both visible.

### Step 57 — class.orion.l1.idle

```text
Following the STYLE BIBLE above.
New image: using Orion's sheet from step 6, draw Orion as a single game sprite. Square 1024x1024, transparent
background.
Level 1 Orion: as on the sheet; telescope held upright beside him in one hand, tilted up to the viewer's right.
Pose: calm watchful stance, feet at the bottom-centre, free hand shading his visor as if looking far away. Three-quarter
top-down view, facing three-quarter towards the viewer's right. The whole instrument must fit inside the canvas.
Full body filling only about 65% of the canvas height, leaving empty space above and at the top-right for the longer telescope
at later levels. Outline about 16 px. No ground, no shadow, no text.
```

**Save as:** `art/source/astronauts/orion-l1-idle-01.png`  
**Attach:** Orion sheet (step 6)  
**Accept if:** telescope not cropped, not gun-like, not on his shoulder; figure no more than about 70% of the height.

### Step 58 — class.orion.l1.attack

```text
Following the STYLE BIBLE above.
Edit the level 1 Orion sprite from step 57: same size, framing and feet position.
Pose (key frame, "zap"): Orion holds the telescope tilted UP at about 30 degrees with one hand, as if star-gazing, and POINTS
with the other hand towards the viewer's right; his eye is away from the eyepiece, a cheerful "found it" look; a small gold
star-shaped glint at the front lens. Do NOT draw the tracer. The whole instrument fits in the canvas.
Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/orion-l1-attack-04.png` (key frame "zap"; frames 01-03, 05-06 by pack 3.2)  
**Attach:** Orion L1 idle (step 57)  
**Accept if:** telescope tilted up (not level, at his eye or on his shoulder) and nothing looks like aiming a rifle.

### Step 59 — class.orion.l2.idle

```text
Following the STYLE BIBLE above.
Edit the level 1 Orion sprite from step 57 into LEVEL 2. Same character, face, pose, size and position; the
figure still fills about 65% of the canvas height and the longer telescope uses the empty space above him. Change only: the
telescope is about 1.3 times longer with an extra extending section and a larger front lens; add a gold star patch on the
chest. Keep the whole instrument inside the canvas. Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/orion-l2-idle-01.png`  
**Attach:** Orion L1 idle (step 57)  
**Accept if:** the longer telescope is not cropped.

### Step 60 — class.orion.l2.attack

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Orion sprite from step 59 (longer telescope, chest star patch). Same size, framing and feet
position. Pose (key frame, "zap"): telescope tilted UP at about 30 degrees in one hand as if star-gazing, the other hand
POINTING towards the viewer's right, eye away from the eyepiece, gold star glint at the lens. No tracer. Square 1024x1024,
transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/orion-l2-attack-04.png`  
**Attach:** Orion L2 idle (step 59)  
**Accept if:** L2 details kept, telescope tilted up and away from his eye.

### Re-anchor 5 (after step 60)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 61 — class.orion.l3.idle

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Orion sprite from step 59 into LEVEL 3. Same character, face, pose, size and position; the
figure still fills about 65% of the canvas height. Change only: the telescope is the longest yet with a glowing gold ring at
the front; his helmet visor now shows a faint pattern of dots joined by thin lines like a star chart (no letters, no numbers);
add navy-and-gold shoulder stripes. Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/orion-l3-idle-01.png`  
**Attach:** Orion L2 idle (step 59)  
**Accept if:** the visor pattern has nothing that reads as writing or numbers.

### Step 62 — class.orion.l3.attack

```text
Following the STYLE BIBLE above.
Edit the LEVEL 3 Orion sprite from step 61 (longest telescope, star-chart visor, shoulder stripes). Same size,
framing and feet position. Pose (key frame, "zap"): telescope tilted UP at about 30 degrees in one hand as if star-gazing, the
other hand POINTING towards the viewer's right, eye away from the eyepiece, a stronger gold star flash at the lens. No tracer.
Square 1024x1024, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/orion-l3-attack-04.png`  
**Attach:** Orion L3 idle (step 61)  
**Accept if:** the flash is a star glint (not gunfire) and the telescope is tilted up, away from his eye.

### Step 63 — class.orion.portrait

```text
Following the STYLE BIBLE above.
New image: head-and-shoulders portrait of Orion (level 1 look, from his sheet in step 6), facing the viewer,
thoughtful friendly smile, the telescope rising diagonally behind one shoulder. Centred, about 85% of the canvas. Square
1024x1024, transparent background, outline about 16 px. No text, no frame.
```

**Save as:** `art/source/astronauts/orion-card.png`  
**Attach:** Orion sheet (step 6)  
**Accept if:** the telescope is visible (it is Orion's silhouette).

### Step 64 — class.mira.l1.idle

```text
Following the STYLE BIBLE above.
New image: using Mira's sheet from step 7, draw Mira as a single game sprite. Square 1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green).
Level 1 Mira: as on the sheet; small dish emitter held at waist height. The chest shield emblem must be big and clear.
Pose: calm upright stance, feet at the bottom-centre. Three-quarter top-down view, facing three-quarter towards the viewer's
right. Full body, about 80% of the canvas height. Outline about 16 px. No ground, no shadow, no text.
```

**Save as:** `art/source/astronauts/mira-l1-idle-01.png`  
**Attach:** Mira sheet (step 7)  
**Accept if:** the shield emblem is easy to see at 128 px.

### Step 65 — class.mira.l1.emit

```text
Following the STYLE BIBLE above.
Edit the level 1 Mira sprite from step 64: same size and feet position.
Pose (key frame): Mira raises the dish emitter above her shoulder, pointing up and to the viewer's right, the dish centre
glowing soft cyan #5BE0F0. Do NOT draw the pulse travelling away. Square 1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green), outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/mira-l1-emit-03.png` (key frame; frames 01, 02, 04 by pack 3.2)  
**Attach:** Mira L1 idle (step 64)  
**Accept if:** no beam or ring leaving the dish.

### Step 66 — class.mira.l2.idle

```text
Following the STYLE BIBLE above.
Edit the level 1 Mira sprite from step 64 into LEVEL 2. Same character, face, pose, size and position.
Change only: the dish emitter is about 1.5 times larger with a second cyan ring; add a small green star patch on her upper arm
(plain, no letters). Square 1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green), outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/mira-l2-idle-01.png`  
**Attach:** Mira L1 idle (step 64)  
**Accept if:** the change is visible at 128 px.

### Step 67 — class.mira.l2.emit

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Mira sprite from step 66 (larger dish, arm star patch). Same size and feet position.
Pose (key frame): dish raised above her shoulder towards the viewer's right, dish centre glowing cyan. No pulse drawn.
Square 1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green), outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/mira-l2-emit-03.png`  
**Attach:** Mira L2 idle (step 66)  
**Accept if:** L2 details kept.

### Step 68 — class.mira.l3.idle

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Mira sprite from step 66 into LEVEL 3. Same character, face, pose, size and position.
Change only: the dish is the largest yet with a glowing cyan rim; a chunky friendly cartoon wrench (rounded, green handle)
hangs from her belt; add green shoulder stripes. Square 1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green), outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/mira-l3-idle-01.png`  
**Attach:** Mira L2 idle (step 66)  
**Accept if:** the wrench is friendly, visible and not weapon-like.

### Step 69 — class.mira.l3.emit

```text
Following the STYLE BIBLE above.
Edit the LEVEL 3 Mira sprite from step 68 (largest dish, belt wrench, shoulder stripes). Same size and feet
position. Pose (key frame): dish raised towards the viewer's right, glowing brightly cyan. No pulse drawn.
Square 1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green), outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/mira-l3-emit-03.png`  
**Attach:** Mira L3 idle (step 68)  
**Accept if:** L3 details kept.

### Step 70 — class.mira.portrait

```text
Following the STYLE BIBLE above.
New image: head-and-shoulders portrait of Mira (level 1 look, from her sheet in step 7), facing the viewer, calm
kind smile, round glasses, the top of the big chest shield emblem clearly visible. Centred, about 85% of the canvas. Square
1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green), outline about 16 px. No text, no frame.
```

**Save as:** `art/source/astronauts/mira-card.png`  
**Attach:** Mira sheet (step 7)  
**Accept if:** the shield emblem is visible.

### Step 71 — class.sol.l1.idle

```text
Following the STYLE BIBLE above.
New image: using Sol's sheet from step 8, draw Sol as a single game sprite. Portrait 1024x1536 (tall canvas), transparent
background.
Level 1 Sol: as on the sheet; antenna with a small gold beacon bulb, gently lit.
Pose: encouraging stance, feet at the bottom-centre, one hand giving a thumbs-up. Three-quarter top-down view, facing
three-quarter towards the viewer's right. The body fills about 55% of the canvas height at the bottom; the whole antenna fits
inside the canvas with empty space above it. Outline about 16 px. No ground, no shadow, no text.
```

**Save as:** `art/source/astronauts/sol-l1-idle-01.png`  
**Attach:** Sol sheet (step 8)  
**Accept if:** antenna not cropped, and Sol does not look like Mira in another colour. Keep 1024x1536 for every Sol step.

### Step 72 — class.sol.l1.pulse

```text
Following the STYLE BIBLE above.
Edit the level 1 Sol sprite from step 71: same size and feet position.
Pose (key frame): Sol raises one arm high with an open hand, the beacon bulb at full bright gold glow with a soft halo just
around the bulb. Do NOT draw the expanding ring. Portrait 1024x1536, same framing as the idle sprite, transparent background,
outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/sol-l1-pulse-03.png` (key frame; frames 01, 02, 04 by pack 3.2)  
**Attach:** Sol L1 idle (step 71)  
**Accept if:** no large ring or rays filling the canvas.

### Re-anchor 6 (after step 72)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 73 — class.sol.l2.idle

```text
Following the STYLE BIBLE above.
Edit the level 1 Sol sprite from step 71 into LEVEL 2. Same character, face, pose, size and position.
Change only: the antenna is about 1.3 times taller with a second small cross-bar, and the beacon bulb is larger; add a gold
star patch on the chest (plain). Keep everything inside the canvas. Portrait 1024x1536, same framing (body about 55% of the height),
transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/sol-l2-idle-01.png`  
**Attach:** Sol L1 idle (step 71)  
**Accept if:** the taller antenna is not cropped.

### Step 74 — class.sol.l2.pulse

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Sol sprite from step 73 (taller antenna with cross-bar, star patch). Same size and feet position.
Pose (key frame): arm raised, beacon at full gold glow with a small halo. No ring.
Portrait 1024x1536, same framing, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/sol-l2-pulse-03.png`  
**Attach:** Sol L2 idle (step 73)  
**Accept if:** L2 details kept.

### Step 75 — class.sol.l3.idle

```text
Following the STYLE BIBLE above.
Edit the LEVEL 2 Sol sprite from step 73 into LEVEL 3. Same character, face, pose, size and position.
Change only: the antenna is the tallest yet and carries two small round dishes facing left and right below the beacon bulb;
the bulb has a gold ring around it; add red-and-gold shoulder stripes. Everything fits inside the canvas. Portrait 1024x1536, same framing
(body about 55% of the height), transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/sol-l3-idle-01.png`  
**Attach:** Sol L2 idle (step 73)  
**Accept if:** the dishes sit on the antenna (not held like Mira's emitter).

### Step 76 — class.sol.l3.pulse

```text
Following the STYLE BIBLE above.
Edit the LEVEL 3 Sol sprite from step 75 (tallest antenna, double dish, shoulder stripes). Same size and feet
position. Pose (key frame): arm raised, beacon and both dishes glowing gold. No ring.
Portrait 1024x1536, same canvas and framing as the idle sprite, transparent background, outline about 16 px. No text.
```

**Save as:** `art/source/astronauts/sol-l3-pulse-03.png`  
**Attach:** Sol L3 idle (step 75)  
**Accept if:** L3 details kept.

### Step 77 — class.sol.portrait

```text
Following the STYLE BIBLE above.
New image: head-and-shoulders portrait of Sol (level 1 look, from his sheet in step 8), facing the viewer, warm
grin, grey beard, the antenna and gold beacon bulb rising clearly above the helmet. Centred, about 85% of the canvas with the
bulb inside the top edge. Square 1024x1024 (square, unlike his sprites), transparent background, outline about 16 px.
No text, no frame.
```

**Save as:** `art/source/astronauts/sol-card.png`  
**Attach:** Sol sheet (step 8)  
**Accept if:** the antenna is not cropped off the top.


## Part 4 — Aliens, carrier and descendants

### Step 78 — alien.mite.walk

```text
Following the STYLE BIBLE above.
New image: game sprite of a METEOR MITE alien (the small orange rock creature from the line-up in step 11).
Square 1024x1024, transparent background.
A small, pointed, chunky rock creature (rock orange #D08A55 with darker speckles) shaped like a little meteor, with four short
stubby legs, two big curious eyes and a mischievous grin. Behind it, a small puff of moon dust and two or three short speed
lines to show it is fast.
Pose (frame 01): legs in a clear mid-scurry stride towards the viewer's right, with small speed lines behind (no blur).
Three-quarter top-down view. Feet at the bottom-centre, filling about 70% of the canvas. Simple enough to read at 64 px.
Outline: about 32 px thick on this 1024 px image (very thick, bold outline). No text.
```

**Save as:** `art/source/aliens/alien-mite-walk-01.png`  
**Attach:** alien line-up (step 11)  
**Accept if:** no insect detail (antennae, many legs, mandibles) and simple enough for 64 px.

### Step 79 — alien.shellback.walk

```text
Following the STYLE BIBLE above.
New image: game sprite of a SHELLBACK alien (the teal shell creature from the line-up in step 11). Square
1024x1024, transparent background.
A wide, low creature under a big domed shell made of a few large rounded teal (#2FA39A) plates with lighter rims, like a
friendly armoured turtle-bug. A round sleepy-but-determined face peeks out under the front of the shell; four short stubby legs.
Pose (frame 01): slow heavy plod towards the viewer's right, one front foot raised. Three-quarter top-down view.
Feet at the bottom-centre, filling about 80% of the canvas width. Outline about 16 px. No text.
```

**Save as:** `art/source/aliens/alien-shell-walk-01.png`  
**Attach:** alien line-up (step 11)  
**Accept if:** not a real tortoise or beetle, not angry, shell plates big enough to read as armour.

### Step 80 — alien.swarm.bob

```text
Following the STYLE BIBLE above.
New image: game sprite of ONE tiny BUBBLE SWARM alien. Square 1024x1024, transparent background.
A small round see-through bubble (bubble cyan #9FF3FF) with a bright highlight in the top-left, two dot eyes and a tiny happy
mouth. Extremely simple shape, so it still reads at 32 px.
Pose (frame 01): squashed slightly at the bottom as if it just landed from a hop. Centred low on the canvas, filling about 70%.
Outline: about 56 px thick on this 1024 px image (very thick, bold outline). No text.
```

**Save as:** `art/source/aliens/alien-swarm-bob-01.png`  
**Attach:** alien line-up (step 11)  
**Accept if:** exactly one bubble, and the face still reads when shrunk to 32 px.

### Step 81 — alien.flutter.fly

```text
Following the STYLE BIBLE above.
New image: game sprite of an ORBIT FLUTTER alien (the lilac winged disc from the line-up in step 11). Square
1024x1024, transparent background.
A round flat disc-shaped lilac (#B98AF0) creature like a little living saucer, with two big rounded fluttery wings (like a
moth's, but soft and cartoony), big friendly eyes on the front edge and a small smile.
Pose (frame 01): wings up, flying towards the viewer's right. Three-quarter top-down view. Place it in the upper-middle of the
canvas (it hovers above the ground; leave empty space below it). Outline about 16 px. No shadow, no text.
```

**Save as:** `art/source/aliens/alien-flutter-fly-01.png`  
**Attach:** alien line-up (step 11)  
**Accept if:** no insect legs or stinger, wings thick enough to read.

### Step 82 — alien.guard.walk

```text
Following the STYLE BIBLE above.
New image: game sprite of a BUBBLE GUARD alien, drawn WITHOUT any bubbles around it. Square 1024x1024, transparent background.
A small round peach (#FFB38A) alien with a little bubble-blowing wand ring on its head like an antenna, big eyes and a proud
little smile, short legs.
Pose (frame 01): marching towards the viewer's right, chest puffed out. Three-quarter top-down view. Feet at the bottom-centre,
filling about 55% of the canvas (leave room around it, because the bubble layers are drawn on top later). Outline about 16 px.
No text.
```

**Save as:** `art/source/aliens/alien-guard-walk-01.png`  
**Attach:** alien line-up (step 11)  
**Accept if:** no bubbles drawn around it and it fills only about half the canvas.

### Step 83 — alien.guard.bubble-pop

```text
Following the STYLE BIBLE above.
New image: game effect, a soap bubble POPPING. Square 1024x1024, on a flat pure black #000000 background (it is translucent;
I will convert black to alpha).
A round translucent cyan (#9FF3FF) bubble ring breaking apart into a few curved fragments and tiny round droplets flying
outward, with two small white sparkles. Cheerful and light. Centred, filling about 80% of the canvas. Outline about 16 px.
No alien inside, no text.
```

**Save as:** `art/source/aliens/alien-guard-pop-02.png` (key frame; frames 01, 03, 04 in your editor)  
**Attach:** nothing  
**Accept if:** curved, soft fragments (not sharp glass shards).

### Step 84 — alien.patchling.walk

```text
Following the STYLE BIBLE above.
New image: game sprite of a PATCHLING alien. Square 1024x1024, transparent background.
A friendly little round alien in patch cream (#F7F0E0) with a lilac-pink cheek blush, big kind eyes and a helpful smile. It
carries a BIG flag on a pole, the flag about a third of the sprite's height; the flag is a plain soft-tan sticking-plaster shape
(a rounded rectangle with a lighter square pad in the middle and a few dots), with no cross, no letters and no symbol.
The alien itself is NOT green.
Pose (frame 01): walking towards the viewer's right, waving the flag. Three-quarter top-down view. Feet at the bottom-centre,
filling about 75% of the canvas. Outline about 16 px. No text.
```

**Save as:** `art/source/aliens/alien-patch-walk-01.png`  
**Attach:** alien line-up (step 11)  
**Accept if:** no red cross or symbol on the flag, body cream (not green), flag big, not like a medic character from another game.

### Re-anchor 7 (after step 84)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 85 — alien.patchling.heal-pulse

```text
Following the STYLE BIBLE above.
New image: game effect seen from above at the three-quarter angle: a flat ring of soft healing-green (#7BEA8C) sparkles and
little plus-shaped twinkles lying on the ground, an ellipse exactly 4 wide : 3 tall. Empty centre. Square 1024x1024, on a flat
pure black #000000 background, ring filling about 90% of the canvas.
Outline: about 8 px thick on this 1024 px image. No text, no cross symbols.
```

**Save as:** `art/source/aliens/alien-patch-heal-03.png` (key frame; build the others by scaling; squash to exactly 4:3 if needed)  
**Attach:** nothing  
**Accept if:** an open ring (not a full disc) and the plus shapes do not look like red crosses or medical logos.

### Step 86 — alien.slime.walk

```text
Following the STYLE BIBLE above.
New image: game sprite of a SPLIT SLIME alien (the lime two-lobed slime from the line-up in step 11). Square
1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green).
A lime-green (#9BE564) slime made of TWO round lobes joined side by side, with a clear zigzag seam running down between them.
Each lobe has one big eye; one wide shared grin across the seam. Glossy highlight top-left. Not drippy.
Pose (frame 01): stretched forward as it oozes towards the viewer's right. Three-quarter top-down view. Bottom at the
bottom-centre, filling about 75% of the canvas. Outline about 16 px. No text.
```

**Save as:** `art/source/aliens/alien-slime-walk-01.png`  
**Attach:** alien line-up (step 11)  
**Accept if:** the seam is obvious and it does not drip or look gross.

### Step 87 — alien.slime.split

```text
Following the STYLE BIBLE above.
Using the Split Slime from step 86: key frame of it SPLITTING. The two lobes spring apart along the zigzag seam,
each becoming its own small one-eyed slime, with a burst of small colourful stars between them. Both halves surprised and happy.
Square 1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green), outline about 16 px. No text.
```

**Save as:** `art/source/aliens/alien-slime-split-03.png` (key frame; others in your editor)  
**Attach:** Split Slime (step 86)  
**Accept if:** a bouncy, happy pop, nothing looks torn or hurt.

### Step 88 — alien.slimelet.hop

```text
Following the STYLE BIBLE above.
New image: game sprite of a SLIMELET: one half of the Split Slime from step 86, now a small single round lime
(#9BE564) slime lobe with ONE big eye and a small grin, no seam. Pose (frame 01): squashed, about to hop towards the viewer's
right. Three-quarter top-down view. Bottom at the bottom-centre, filling about 70% of the canvas. Simple enough to read at
64 px. Square 1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green).
Outline: about 32 px thick on this 1024 px image (very thick, bold outline). No text.
```

**Save as:** `art/source/aliens/alien-slimelet-hop-01.png`  
**Attach:** Split Slime (step 86)  
**Accept if:** no seam (so it does not look like it splits again).

### Step 89 — alien.craft.hover

```text
Following the STYLE BIBLE above.
New image: game sprite of an ALIEN CRAFT (the toy saucer from the line-up in step 11). Square 1024x1024,
transparent background.
A toy-like round flying saucer with a silver-lilac hull (#C9D1E3 with lilac shading), a clear glass dome on top, and a row of
four round portholes around the rim; in each porthole a little blue Moon Blob face peeks out, grinning. Small magenta (#E05FD0)
lights around the bottom edge. Clearly a fun toy, not a warship.
Pose (frame 01): hovering, tilted slightly towards the viewer's right. Three-quarter top-down view. Place it a little above
the canvas centre (it hovers low over the path). Outline: about 8 px thick on this 1024 px image. No beam, no shadow, no text.
```

**Save as:** `art/source/aliens/alien-craft-hover-01.png`  
**Attach:** alien line-up (step 11) + Moon Blob (step 12)  
**Accept if:** no weapons, guns or tractor beam, not like a famous film saucer, portholes contain only blob faces.

### Step 90 — alien.craft.release

```text
Following the STYLE BIBLE above.
Using the Alien Craft from step 89: key frame of its RELEASE. A hatch underneath has dropped open and four little
blue Moon Blobs tumble out happily, while the saucer starts to pop into a burst of colourful stars. Playful, no damage, no
debris. Square 1024x1024, transparent background. Outline: about 8 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/aliens/alien-craft-release-03.png` (key frame; others in your editor)  
**Attach:** Alien Craft (step 89)  
**Accept if:** not a crash or explosion, and the blobs look happy, not scared or hurt.


## Part 5 — Trait icons

### Step 91 — icon.trait.armour

```text
Following the STYLE BIBLE above.
New image: a simple flat game ICON of a chunky rounded dome-shaped shell plate with three big round bolts across it, like a slice of the Shellback's shell, teal #2FA39A; NOT a shield outline. Bold rounded shape, at most two colours plus a very thick dark plum outline
(about 56 px on this 1024 px image), no gradients, no tiny details, readable at 32 pixels. Centred, filling about 80% of the
canvas. Square 1024x1024, transparent background.
No text, no letters, no numbers.
```

**Save as:** `art/source/trait-icons/icon-armour.png`  
**Attach:** nothing  
**Accept if:** no shield or crest outline and not like a brand logo.

### Step 92 — icon.trait.flying

```text
Following the STYLE BIBLE above.
New image: a simple flat game ICON of a single soft rounded wing, lilac #B98AF0. Bold rounded shape, at most two colours plus a very thick dark plum outline
(about 56 px on this 1024 px image), no gradients, no tiny details, readable at 32 pixels. Centred, filling about 80% of the
canvas. Square 1024x1024, transparent background.
Match the style and outline of the armour icon from step 91.
No text, no letters, no numbers.
```

**Save as:** `art/source/trait-icons/icon-flying.png`  
**Attach:** armour icon (step 91)  
**Accept if:** not a bird and not like a known logo.

### Step 93 — icon.trait.bubbles

```text
Following the STYLE BIBLE above.
New image: a simple flat game ICON of three nested concentric bubble rings, cyan #9FF3FF. Bold rounded shape, at most two colours plus a very thick dark plum outline
(about 56 px on this 1024 px image), no gradients, no tiny details, readable at 32 pixels. Centred, filling about 80% of the
canvas. Square 1024x1024, transparent background.
Match the style and outline of the armour icon from step 91.
No text, no letters, no numbers.
```

**Save as:** `art/source/trait-icons/icon-bubbles.png`  
**Attach:** armour icon (step 91)  
**Accept if:** the three rings are clearly separate.

### Step 94 — icon.trait.healer

```text
Following the STYLE BIBLE above.
New image: a simple flat game ICON of a cream sticking plaster with a darker centre pad, set at a slant, no cross. Bold rounded shape, at most two colours plus a very thick dark plum outline
(about 56 px on this 1024 px image), no gradients, no tiny details, readable at 32 pixels. Centred, filling about 80% of the
canvas. Square 1024x1024, transparent background.
Match the style and outline of the armour icon from step 91.
No text, no letters, no numbers.
```

**Save as:** `art/source/trait-icons/icon-healer.png`  
**Attach:** armour icon (step 91)  
**Accept if:** no cross or red-cross symbol.

### Step 95 — icon.trait.splitter

```text
Following the STYLE BIBLE above.
New image: a simple flat game ICON of one lime blob splitting into two smaller blobs with a small arrow-free gap. Bold rounded shape, at most two colours plus a very thick dark plum outline
(about 56 px on this 1024 px image), no gradients, no tiny details, readable at 32 pixels. Centred, filling about 80% of the
canvas. Square 1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green).
Match the style and outline of the armour icon from step 91.
No text, no letters, no numbers.
```

**Save as:** `art/source/trait-icons/icon-splitter.png`  
**Attach:** armour icon (step 91)  
**Accept if:** it makes sense without an arrow or symbol.

### Step 96 — icon.trait.carrier

```text
Following the STYLE BIBLE above.
New image: a simple flat game ICON of a small flying saucer with three tiny round faces in its portholes. Bold rounded shape, at most two colours plus a very thick dark plum outline
(about 56 px on this 1024 px image), no gradients, no tiny details, readable at 32 pixels. Centred, filling about 80% of the
canvas. Square 1024x1024, transparent background.
Match the style and outline of the armour icon from step 91.
No text, no letters, no numbers.
```

**Save as:** `art/source/trait-icons/icon-carrier.png`  
**Attach:** armour icon (step 91)  
**Accept if:** still readable at 32 px.

### Re-anchor 8 (after step 96)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 97 — icon.lock

```text
Following the STYLE BIBLE above.
New image: a simple flat game ICON of a friendly rounded padlock, gold #F5B700 body, metal grey shackle, round keyhole. Bold rounded shape, at most two colours plus a very thick dark plum outline
(about 56 px on this 1024 px image), no gradients, no tiny details, readable at 32 pixels. Centred, filling about 80% of the
canvas. Square 1024x1024, transparent background.
Match the style and outline of the armour icon from step 91.
No text, no letters, no numbers.
```

**Save as:** `art/source/trait-icons/icon-lock.png`  
**Attach:** armour icon (step 91)  
**Accept if:** no number or letter on the keyhole or body (you may redraw it as SVG later, pack 4.3).


## Part 6 — Bosses and boss effects

### Step 98 — boss.wobble.walk

```text
Following the STYLE BIBLE above.
New image: game sprite of a BOSS, a GIANT version of the Moon Blob from step 12. Square 1024x1024, transparent
background.
A huge wide-domed wobbly blue (#5AA9F0) jelly king with the Moon Blob's bobble antennae, crater spots, big eyes and cheeky grin,
a pompous raised chin, and a simple yellow folded-paper crown sitting perfectly upright on top (three points, no jewels with
symbols).
Pose (frame 01): a slow royal stroll towards the viewer's right, body leaning forward and stretching. Three-quarter top-down
view. Bottom at the bottom-centre, filling about 85% of the canvas with the crown inside the top edge.
Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-wobble-walk-01.png`  
**Attach:** Moon Blob (step 12)  
**Accept if:** crown has no letters, numbers or symbols; the king is funny, not angry or scary.

### Step 99 — boss.wobble.dash

```text
Following the STYLE BIBLE above.
Edit the crowned jelly boss from step 98. Same character, size and position. Change only: his body turns bright
pink (#FF7FB8), two small white steam puffs rise from his head like a cartoon kettle, his paper crown is tilted to one side, and
his expression is flustered and determined (puffed cheeks, not angry). Square 1024x1024, transparent background.
Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-wobble-dash-01.png`  
**Attach:** King Wobble walk (step 98)  
**Accept if:** steam reads as kettle puffs (not fire smoke) and the body shape is unchanged.

### Step 100 — boss.wobble.phase-change

```text
Following the STYLE BIBLE above.
Key frame of the crowned jelly boss from steps 98 and 99 changing colour: his body half blue and half
pink in a swirl, a big burst of white cartoon steam puffs around his head, the crown popping up and tilting. Funny, surprised
expression. Same size and position. Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-wobble-phase-03.png` (key frame; or skip and crossfade walk into dash in your editor)  
**Attach:** King Wobble walk (step 98) + dash (step 99)  
**Accept if:** a funny colour change, not an explosion.

### Step 101 — boss.clank.walk (full plate)

```text
Following the STYLE BIBLE above.
New image: game sprite of a BOSS, a GIANT version of the Shellback from step 79. Square 1024x1024, transparent
background.
A huge teal shell creature wearing extra bolted-on rounded metal armour plates (metal grey #A7B0C8 with big round bolts) over
its shell, and a small navy captain's hat with a plain gold band (no badge, no emblem). Determined, slightly pompous face
peeking out under the front. Four stubby legs, no arms. Pose (frame 01): heavy plod towards the viewer's right. Three-quarter
top-down view. Feet at the bottom-centre, filling about 85% of the canvas. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-clank-full-walk-01.png`  
**Attach:** Shellback (step 79)  
**Accept if:** hat has no badge or letters, four stubby legs and no arms, pompous not menacing.

### Step 102 — boss.clank.walk (cracked shell)

```text
Following the STYLE BIBLE above.
Edit the shell boss from step 101. Same character, size and position. Change only: most bolted plates are gone; the
teal shell shows several cracks that glow soft gold from inside; the face looks surprised. Square 1024x1024, transparent
background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-clank-cracked-walk-01.png`  
**Attach:** Clank full plate (step 101)  
**Accept if:** cracks glow gold and read as cracked shell, not wounds.

### Step 103 — boss.clank.walk (shell off)

```text
Following the STYLE BIBLE above.
Edit the shell boss from step 102. Same character, size and position, hat still on. Change only: the shell is
completely off, showing his round body in funny spotty pants (big polka dots) on the same four stubby legs, scurrying in a comic
hurry with a sheepish grin. Legs drawn clearly in a scurry stride, no blur. No arms. Square 1024x1024, transparent background.
Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-clank-off-walk-01.png`  
**Attach:** Clank cracked (step 102)  
**Accept if:** silly, not frightened or surrendering; four stubby legs, no arms, no new body plan.

### Step 104 — boss.clank.plates-fall

```text
Following the STYLE BIBLE above.
Key frame of the shell boss from step 101 with his armour plates falling off: four or five rounded grey plates with
bolts tumbling outward and down from his shell, with small cartoon impact stars. Same size and position.
Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image. No text, no sound words.
```

**Save as:** `art/source/bosses/boss-clank-platesfall-03.png` (key frame; others in your editor)  
**Attach:** Clank full plate (step 101)  
**Accept if:** no sound word or letters anywhere.

### Step 105 — boss.bubbla.walk

```text
Following the STYLE BIBLE above.
New image: game sprite of a BOSS, a GIANT, grand version of the peach Bubble Guard from step 82, drawn WITHOUT any
bubble around her. Square 1024x1024, transparent background.
A large round peach (#FFB38A) alien with a crown made of three soap bubbles stuck together (no tiara, no gems), a grand, amused
smile, no eyelashes and no gown; she holds a chunky bubble-blowing hoop on a short stick.
Pose (frame 01): a grand slow walk towards the viewer's right. Three-quarter top-down view. Feet at the bottom-centre, filling
about 75% of the canvas (leave room for the bubble overlay). Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-bubbla-walk-01.png`  
**Attach:** Bubble Guard (step 82) + one accepted boss (step 98)  
**Accept if:** no witch, fairy or princess look (tiara, star wand, gown, long eyelashes), no bubble around her.

### Step 106 — boss.bubbla.wand

```text
Following the STYLE BIBLE above.
Key frame of the peach bubble boss from step 105 WAVING her bubble hoop in a big flourish over her head, a ring of
cyan sparkles and tiny bubbles spraying outward around her. Same size and position. Square 1024x1024, transparent background.
Keep a margin: sparkles do not reach the canvas edges. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-bubbla-wand-03.png` (key frame; others in your editor)  
**Attach:** Queen Bubbla walk (step 105)  
**Accept if:** sparkles keep a margin from the canvas edges.

### Step 107 — boss.mothership.hover (doors shut)

```text
Following the STYLE BIBLE above.
New image: game sprite of a BOSS, a GIANT, grander version of the Alien Craft from step 89. Square 1024x1024,
transparent background. A big round toy-like saucer with a glass dome on top where a tiny smug alien captain sits, silver-lilac
hull with rounded hull plating panels, and THREE large cargo doors along the front rim. Above each door is a row of round lights
showing a count with DOTS: one dot above the first door, two dots above the second, three dots above the third. Absolutely no
digits.
Pose (frame 01): hovering, tilted slightly towards the viewer's right. Three-quarter top-down view, a little above centre.
Outline: about 6 px thick on this 1024 px image. No beams, no weapons, no text, no numbers.
```

**Save as:** `art/source/bosses/boss-mothership-shut-hover-01.png`  
**Attach:** Alien Craft (step 89)  
**Accept if:** no digit anywhere (check the door lights closely), not a warship or a famous film ship.

### Step 108 — boss.mothership.hover (door 1 open)

```text
Following the STYLE BIBLE above.
Edit the saucer boss from step 107. Same size and position. Change only: the FIRST cargo door (one dot light above it)
hangs open like a ramp, the hold behind it empty, and its dot light is dark. The other two doors stay shut. Square 1024x1024,
transparent background. Outline: about 6 px thick on this 1024 px image. No text, no numbers.
```

**Save as:** `art/source/bosses/boss-mothership-door1open-hover-01.png`  
**Attach:** Mothership shut (step 107)  
**Accept if:** only door 1 open and empty, its light dark, no digits.

### Re-anchor 9 (after step 108)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 109 — boss.mothership.hover (doors 1 and 2 open)

```text
Following the STYLE BIBLE above.
Edit the saucer boss from step 108. Same size and position. Change only: the SECOND cargo door (two dot lights
above it) now also hangs open like a ramp, empty, and its dot lights are dark. The third door stays shut. Square 1024x1024,
transparent background. Outline: about 6 px thick on this 1024 px image. No text, no numbers.
```

**Save as:** `art/source/bosses/boss-mothership-door12open-hover-01.png`  
**Attach:** Mothership door 1 open (step 108)  
**Accept if:** doors 1 and 2 open and empty, door 3 shut, no digits.

### Step 110 — boss.mothership.hover (bare)

```text
Following the STYLE BIBLE above.
Edit the saucer boss from step 109. Same size and position. Change only: the rounded hull plating panels have
fallen away showing a simpler frame with cartoon pipes; the THIRD cargo door now also hangs open and empty with its dot lights
dark, so all three doors are open; it tilts forward as if hurrying. Keep the 1-, 2- and 3-dot light rows (all dark).
Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image. No text, no numbers.
```

**Save as:** `art/source/bosses/boss-mothership-bare-hover-01.png`  
**Attach:** Mothership doors 1+2 open (step 109)  
**Accept if:** all three doors open and empty, plating off, all lights dark, no digits.

### Step 111 — boss.mothership.door (door1)

```text
Following the STYLE BIBLE above.
Edit the saucer boss from step 108. Same size and position. Key frame: the first cargo door (the one with one dot
lights above it) has just dropped open like a ramp, its dot lights flashing, and four little rock-mite aliens scurry out happily. Doors that were already
open stay open and empty; doors not yet opened stay shut. Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image.
No text, no numbers.
```

**Save as:** `art/source/bosses/boss-mothership-door1-04.png` (key frame; frame 01 = the state before, 06 = the state after)  
**Attach:** Mothership door 1 open (step 108)  
**Accept if:** the right door opens, already-open doors stay open, no digits, the aliens look happy.

### Step 112 — boss.mothership.door (door2)

```text
Following the STYLE BIBLE above.
Edit the saucer boss from step 109. Same size and position. Key frame: the second cargo door (the one with two dot
lights above it) has just dropped open like a ramp, its dot lights flashing, and four lilac winged disc aliens flutter out happily. Doors that were already
open stay open and empty; doors not yet opened stay shut. Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image.
No text, no numbers.
```

**Save as:** `art/source/bosses/boss-mothership-door2-04.png` (key frame; frame 01 = the state before, 06 = the state after)  
**Attach:** Mothership doors 1+2 open (step 109)  
**Accept if:** the right door opens, already-open doors stay open, no digits, the aliens look happy.

### Step 113 — boss.mothership.door (door3)

```text
Following the STYLE BIBLE above.
Edit the saucer boss from step 110. Same size and position. Key frame: the third cargo door (the one with three dot
lights above it) has just dropped open like a ramp, its dot lights flashing, and two teal shell aliens march out happily. Doors that were already
open stay open and empty; doors not yet opened stay shut. Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image.
No text, no numbers.
```

**Save as:** `art/source/bosses/boss-mothership-door3-04.png` (key frame; frame 01 = the state before, 06 = the state after)  
**Attach:** Mothership bare (step 110)  
**Accept if:** the right door opens, already-open doors stay open, no digits, the aliens look happy.

### Step 114 — boss.mothership.release (optional)

*Optional: skip if you do not want this asset.*

```text
Following the STYLE BIBLE above.
Using the BARE saucer boss from step 110 (plating off, all doors open): key frame of its RELEASE. Four little blue jelly
aliens like the Moon Blob from step 12 tumble out of the open cargo doors happily, while the saucer starts to pop
into a big burst of colourful stars. Playful, no damage, no debris. Same size and position. Square 1024x1024, transparent
background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-mothership-release-03.png`  
**Attach:** Mothership bare (step 110) + Moon Blob (step 12)  
**Accept if:** not a crash or explosion, the blobs look happy.

### Step 115 — boss-glorp-base (base for boss.glorp.walk, not shipped)

```text
Following the STYLE BIBLE above.
New image: character design for the FINAL BOSS of the game: a huge, round, friendly-goofy mega alien in magenta (#E05FD0) and
lilac, with two huge eyes plus one small extra eye on a stalk, a wide toothless grin, two short arms, two stubby legs and a
round belly with a hatch door (a plain circle with a handle). It should look like the grand silly champion of all the other
aliens. Facing three-quarter towards the viewer's right, three-quarter top-down view, feet at the bottom-centre, about 85% of
the canvas. Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-glorp-base.png`  
**Attach:** King Wobble (step 98) + Captain Clank (step 101)  
**Accept if:** goofy and friendly, not menacing, belly hatch is a plain circle with a handle.

### Step 116 — boss.glorp.walk (armoured)

```text
Following the STYLE BIBLE above.
Edit the magenta final boss from step 115. Same size and position. Add the bolted-on rounded grey armour plates from Captain Clank (step 101) over his body and head.
Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-glorp-armoured-walk-01.png`  
**Attach:** Glorp base (step 115) + Clank full plate (step 101)  
**Accept if:** plates match Clank's and it is clearly the same character.

### Step 117 — boss.glorp.walk (bubbled)

```text
Following the STYLE BIBLE above.
Edit the magenta final boss from step 115. Same size and position. Remove the plates; he looks pleased and puffs his cheeks. NO bubble drawn (the bubble is a separate overlay).
Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-glorp-bubbled-walk-01.png`  
**Attach:** Glorp base (step 115)  
**Accept if:** no bubble drawn, same character.

### Step 118 — boss.glorp.walk (cargo)

```text
Following the STYLE BIBLE above.
Edit the magenta final boss from step 115. Same size and position. No bubble. His belly hatch hangs OPEN and EMPTY. Nothing comes out of it.
Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-glorp-cargo-walk-01.png`  
**Attach:** Glorp base (step 115)  
**Accept if:** hatch open and empty, no aliens spilling out.

### Step 119 — boss.glorp.walk (dash)

```text
Following the STYLE BIBLE above.
Edit the magenta final boss from step 115. Same size and position. Hatch closed. He has turned pink with white steam puffs rising from his head like King Wobble's dash (step 99), and is running in a determined comic rush.
Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-glorp-dash-walk-01.png`  
**Attach:** Glorp base (step 115) + Wobble dash (step 99)  
**Accept if:** comic rush, not angry; same character.

### Step 120 — boss.glorp.hatch

```text
Following the STYLE BIBLE above.
Edit the magenta boss in the cargo state from step 118 (hatch open). Same size and position. Key frame: two lime
two-lobed slimes and a few little rock-mite aliens tumble happily out of his open belly hatch, the boss looking surprised and
amused. Square 1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-glorp-hatch-04.png` (key frame; frame 01 = bubbled state, 06 = cargo state)  
**Attach:** Glorp cargo (step 118)  
**Accept if:** aliens look happy, boss keeps his shape and size.

### Re-anchor 10 (after step 120)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 121 — boss.glorp.phase-change

```text
Following the STYLE BIBLE above.
New image: game effect, a big round transition burst of colourful cartoon stars and swirls in magenta, lilac and gold, with an
empty-ish centre where the boss will be. Joyful, no debris, no fire. Centred, filling about 90% of the canvas. Square
1024x1024, transparent background. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/boss-glorp-phase-03.png` (key frame; others in your editor)  
**Attach:** nothing  
**Accept if:** stars and swirls, no smoke or fire.

### Step 122 — fx.boss.arrive

```text
Following the STYLE BIBLE above.
New image: game effect seen from the three-quarter top-down angle, a dramatic but friendly shockwave ring lying flat on the
ground (an ellipse exactly 4 wide : 3 tall), made of bright magenta and lime stars and a soft glowing edge, with a few stars
bouncing upward. Empty centre. Exciting, not frightening. Square 1024x1024, on a flat pure black #000000 background, filling
about 90%. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/fx-boss-arrive-04.png` (key frame of 8; squash to exactly 4:3 if needed)  
**Attach:** nothing  
**Accept if:** bright and friendly, not dark, smoky or threatening.

### Step 123 — fx.boss.phase

```text
Following the STYLE BIBLE above.
New image: game effect, a quick round flash of cream (#FFF4D6) light with four big soft star-shaped rays and a ring of small
gold sparkles, centred, empty middle so the boss stays visible. Square 1024x1024, on a flat pure black #000000 background,
filling about 85%. Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/bosses/fx-boss-phase-03.png` (key frame; others in your editor)  
**Attach:** nothing  
**Accept if:** the middle is empty (not a solid disc that would hide the boss).


## Part 7 — Effects

### Step 124 — fx.nova.beam (level 2)

```text
Following the STYLE BIBLE above.
Edit the laser beam texture from step 22 into LEVEL 2: make the core thicker and the glow brighter. Same canvas
(landscape 1536x1024), same horizontal band running edge to edge, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). No text.
```

**Save as:** `art/source/effects/fx-nova-beam-l2-01.png`  
**Attach:** beam L1 (step 22)  
**Accept if:** clearly thicker than level 1 and edges still straight enough to stretch.

### Step 125 — fx.nova.beam (level 3)

```text
Following the STYLE BIBLE above.
Edit the level 2 beam from step 124 into LEVEL 3: thicker again, with small star sparkles along the edges. Same canvas
(landscape 1536x1024), same horizontal band running edge to edge, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). No text.
```

**Save as:** `art/source/effects/fx-nova-beam-l3-01.png`  
**Attach:** beam L2 (step 124)  
**Accept if:** clearly thicker than level 2, friendly light (not a weapon blast).

### Step 126 — fx.pip.bolt

```text
Following the STYLE BIBLE above.
New image: game projectile, a small round icy puff ball, frost white and pale ice blue (#CFF6FF, #8ED8FF), with a little
snowflake at its front tip and a short trail of sparkles behind it, flying to the right. Simple enough to read at 64 px.
Square 1024x1024, centred, filling about 60% of the canvas. Transparent background. Outline: about 32 px thick on this 1024 px image (very thick, bold outline). No text.
```

**Save as:** `art/source/effects/fx-pip-bolt-01.png`  
**Attach:** nothing  
**Accept if:** a round puff ball, not a sharp icicle spear.

### Step 127 — fx.pip.slow-ring

```text
Following the STYLE BIBLE above.
New image: game effect seen from the three-quarter top-down angle, a flat ring of frost crystals and small snowflakes lying on
the ground (an ellipse exactly 4 wide : 3 tall), pale #CFF6FF with ice-blue edges, empty centre. Square 1024x1024, filling about
90%, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). Outline: about 10 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/effects/fx-pip-slow-ring-03.png` (key frame; squash to exactly 4:3 if needed)  
**Attach:** nothing  
**Accept if:** an open ring (not a solid disc) at the map's ground angle.

### Step 128 — fx.slowed (frame 01)

```text
Following the STYLE BIBLE above.
New image: game overlay, a frosty crust along the bottom edge with a few small rounded icicles hanging down and two tiny
snowflakes above, pale #CFF6FF and white with ice-blue shading, designed to sit at the feet of any creature. Empty above the
crust. Square 1024x1024, the crust spanning about 80% of the width in the lower third. Transparent background. Outline: about 32 px thick on this 1024 px image (very thick, bold outline). No text.
```

**Save as:** `art/source/effects/fx-slowed-01.png`  
**Attach:** nothing  
**Accept if:** only a crust at the bottom (not covering a whole creature) and rounded icicles, not sharp spikes.

### Step 129 — fx.slowed (frame 02)

```text
Following the STYLE BIBLE above.
Same image as step 128, but the snowflakes twinkle in a slightly different place. Everything else identical: crust,
icicles, size, position, outline. Transparent background. No text.
```

**Save as:** `art/source/effects/fx-slowed-02.png`  
**Attach:** slowed frame 01 (step 128)  
**Accept if:** only the snowflakes moved.

### Step 130 — fx.juno.comet

```text
Following the STYLE BIBLE above.
New image: game projectile, a small toy-like comet, a round golden (#FFC94A) ball with a cheerful shine, trailing a short
sparkly tail of little stars to the left as it flies to the right. Square 1024x1024, centred, filling about 70%. Transparent
background. Outline: about 32 px thick on this 1024 px image (very thick, bold outline). No text.
```

**Save as:** `art/source/effects/fx-juno-comet-01.png`  
**Attach:** nothing  
**Accept if:** sparkly star tail, no flames.

### Step 131 — fx.juno.blast (level 1; level 2 reuses it)

```text
Following the STYLE BIBLE above.
New image: game effect seen from the three-quarter top-down angle, a starry impact ring lying flat on the ground (an ellipse
exactly 4 wide : 3 tall), golden (#FFC94A) and cream stars bursting outward along the ring, with a soft gold glow, no smoke,
no debris. Square 1024x1024, filling about 90%, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). Outline: about 8 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/effects/fx-juno-blast-l1-03.png` (key frame; copy the finished L1 frames as fx-juno-blast-l2-*, only the code scale changes)  
**Attach:** nothing  
**Accept if:** a clean starry ellipse, not an explosion.

### Step 132 — fx.juno.blast (level 3)

```text
Following the STYLE BIBLE above.
Edit the impact ring from step 131: same ring, brighter and clearer, with bigger stars and a crisp bright edge, so
the impact is easier to see. Same canvas and ellipse, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). Outline about 8 px. No text.
```

**Save as:** `art/source/effects/fx-juno-blast-l3-03.png`  
**Attach:** Juno blast L1 (step 131)  
**Accept if:** same clean ellipse, visibly stronger, not an explosion.

### Re-anchor 11 (after step 132)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 133 — fx.mira.shield-pulse

```text
Following the STYLE BIBLE above.
New image: game effect, a soft cyan (#5BE0F0) ripple in the shape of Mira's rounded shield emblem (a plain shield outline, no
symbols inside), glowing, with a few small sparkles, as if travelling to the right. Square 1024x1024, centred, filling about
70%, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). Outline about 16 px. No text.
```

**Save as:** `art/source/effects/fx-mira-shield-pulse-03.png` (key frame; others in your editor)  
**Attach:** Mira sheet (step 7)  
**Accept if:** plain shield shape, no cross or symbol inside.

### Step 134 — fx.mira.repair

```text
Following the STYLE BIBLE above.
New image: game effect, a chunky friendly cartoon wrench with a green handle, tilted, surrounded by little healing-green
(#7BEA8C) and gold sparkles and two small plus-shaped twinkles. Square 1024x1024, centred, filling about 70%. transparent background (if it fails, use a flat pure magenta #FF00FF background, not green). Outline about 16 px.
No text.
```

**Save as:** `art/source/effects/fx-mira-repair-03.png` (key frame; others in your editor)  
**Attach:** Mira L3 idle (step 68)  
**Accept if:** plus shapes do not look like a red cross.

### Step 135 — fx.orion.shot

```text
Following the STYLE BIBLE above.
New image: game effect texture, a long thin HORIZONTAL gold (#FFD86B) light streak running edge to edge, with a small bright
four-point star at its right-hand tip and a faint navy-blue glow. Landscape 1536x1024, the streak a thin band through the
middle, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). No text.
```

**Save as:** `art/source/effects/fx-orion-shot-01.png` (frames 02-03: brightness changes in your editor)  
**Attach:** nothing  
**Accept if:** a starry light streak, not a bullet.

### Step 136 — fx.sol.beacon

```text
Following the STYLE BIBLE above.
New image: game effect seen from the three-quarter top-down angle, a soft golden (#F5B700) ring of light lying flat on the
ground (an ellipse exactly 4 wide : 3 tall), glowing, with a few tiny sparkles on it, empty centre. Square 1024x1024, filling
about 90%, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). Outline about 16 px. No text.
```

**Save as:** `art/source/effects/fx-sol-beacon-03.png` (key frame; squash to 4:3 if needed)  
**Attach:** nothing  
**Accept if:** soft enough to see astronauts through it.

### Step 137 — fx.sol.buffed

```text
Following the STYLE BIBLE above.
New image: a tiny game icon, one chunky upward-pointing chevron in gold (#F5B700) with a thick plum outline and a small sparkle
at its tip. Readable at 32 px. Square 1024x1024, centred, filling about 70%. Transparent background.
Outline: about 56 px thick on this 1024 px image (very thick, bold outline). No text.
```

**Save as:** `art/source/effects/fx-sol-buffed-01.png` (frame 02: move the sparkle in your editor; an SVG redraw is also fine)  
**Attach:** nothing  
**Accept if:** does not look like a letter "A" or "V".

### Step 138 — fx.upgrade

```text
Following the STYLE BIBLE above.
New image: game effect, an upward burst of sparkles and stars rising in a column from the bottom-centre, cream, gold and soft
cyan, with two or three upward chevron shapes among them. Joyful. Square 1024x1024, filling about 85%. Transparent background.
Outline about 16 px. No text.
```

**Save as:** `art/source/effects/fx-upgrade-04.png` (key frame of 8)  
**Attach:** nothing  
**Accept if:** chevrons do not read as letters.

### Step 139 — fx.place

```text
Following the STYLE BIBLE above.
New image: game effect seen from the three-quarter top-down angle, a soft landing puff of lavender moon dust spreading outward
along the ground in a flat ellipse exactly 4 wide : 3 tall, with round cartoon cloud puffs and a few small sparkles. Square
1024x1024, centred low, filling about 85% of the width. Transparent background. Outline about 16 px. No text.
```

**Save as:** `art/source/effects/fx-place-03.png` (key frame)  
**Attach:** nothing  
**Accept if:** soft dust puffs, not fire smoke.

### Step 140 — fx.sell

```text
Following the STYLE BIBLE above.
New image: game effect, a soft vertical teleport beam of cream and cyan light rising from a small glowing ellipse on the ground
at the bottom-centre up to the top edge, with little sparkles drifting upward inside it. Empty enough to see a character inside.
Square 1024x1024, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). No text.
```

**Save as:** `art/source/effects/fx-sell-03.png` (key frame)  
**Attach:** nothing  
**Accept if:** the beam is see-through, not opaque.

### Step 141 — fx.armour.clonk

```text
Following the STYLE BIBLE above.
New image: game effect, a small comic impact spark, a chunky five-point star burst in cream and metal grey with rounded points
and two tiny sparkles beside it. Square 1024x1024, centred, filling about 70%. Transparent background. Outline: about 32 px thick on this 1024 px image (very thick, bold outline).
No text, no letters, no sound words.
```

**Save as:** `art/source/effects/fx-armour-clonk-02.png` (key frame of 3)  
**Attach:** nothing  
**Accept if:** no word, sound word or letters.

### Step 142 — fx.heal.received

```text
Following the STYLE BIBLE above.
New image: game effect, a small cluster of healing-green (#7BEA8C) sparkles and two small rounded plus-shaped twinkles rising
upward. Readable at 64 px. Square 1024x1024, centred, filling about 70%. Transparent background. Outline: about 32 px thick on this 1024 px image (very thick, bold outline). No text.
```

**Save as:** `art/source/effects/fx-healed-02.png` (key frame of 4)  
**Attach:** nothing  
**Accept if:** no red cross or medical logo.


## Part 8 — Meteor powers

### Step 143 — power.frost-pulse.icon

```text
Following the STYLE BIBLE above.
New image: a bold game power ICON, one big six-point snowflake in pale ice blue and white (#CFF6FF, #8ED8FF) with a thick plum
outline, and a soft ripple ring spreading out behind it. Readable at 64 px. Square 1024x1024, centred, filling about 80%.
Transparent background. Outline about 16 px. No text.
```

**Save as:** `art/source/powers/power-frost-pulse-icon.png`  
**Attach:** nothing  
**Accept if:** the ripple ring is obvious, so it does not look like Pip's emblem at 64 px.

### Step 144 — power.frost-pulse.fx

```text
Following the STYLE BIBLE above.
New image: a full-screen game overlay, a wave of frost sweeping from left to right, made of a soft pale-blue glowing front edge
with snowflakes and frost crystals along it, and a very light frosty haze behind it. Most of the image must stay empty so the
battlefield shows through. Landscape 1536x1024, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). No text.
```

**Save as:** `art/source/powers/fx-frost-pulse-04.png` (key frame of 8; or skip if you draw it in code)  
**Attach:** nothing  
**Accept if:** the haze is light enough to see the battlefield through.

### Re-anchor 12 (after step 144)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 145 — power.comet-burst.icon

```text
Following the STYLE BIBLE above.
New image: a bold game power ICON, a big glowing golden comet diving down towards the bottom-left, a round bright head with a
sparkly gold tail of stars, thick plum outline. Readable at 64 px. Square 1024x1024, centred, filling about 80%. Transparent
background. Outline about 16 px. No text.
```

**Save as:** `art/source/powers/power-comet-burst-icon.png`  
**Attach:** nothing  
**Accept if:** no flames, not missile-like.

### Step 146 — power.comet-burst.impact

```text
Following the STYLE BIBLE above.
New image: game effect seen from the three-quarter top-down angle, a large comet impact made of a big burst of golden and
cream stars spreading in a flat ring on the ground (an ellipse exactly 4 wide : 3 tall), a bright soft centre glow and stars
bouncing upward. Exciting but friendly, no smoke, no fire, no debris. Square 1024x1024, filling about 90%, on a flat pure black #000000 background (it is a glow; I will convert black to alpha).
Outline: about 8 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/powers/fx-comet-impact-04.png` (key frame of 8)  
**Attach:** nothing  
**Accept if:** friendly starburst, not an explosion.

### Step 147 — power.colony-shield.icon

```text
Following the STYLE BIBLE above.
New image: a bold game power ICON, a small simple domed colony building under a bright cyan (#5BE0F0) hexagon-patterned shield
dome, with three sparkles. Thick plum outline, readable at 64 px. Square 1024x1024, centred, filling about 80%. Transparent
background. Outline about 16 px. No text.
```

**Save as:** `art/source/powers/power-colony-shield-icon.png`  
**Attach:** nothing  
**Accept if:** simple enough at 64 px and not like Mira's emblem.

### Step 148 — power.colony-shield.fx

```text
Following the STYLE BIBLE above.
New image: game effect, an extra-bright cyan shield dome flaring over an empty space where the colony will be, hexagon pattern
glowing, a ring of sparkles around its base and a burst of light at the top. Mostly see-through inside so the colony shows
through. Square 1024x1024, filling about 90%, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/powers/fx-colony-shield-boost-03.png` (key frame)  
**Attach:** colony healthy (step 18)  
**Accept if:** the dome is see-through, not opaque.

### Step 149 — meteor.offer.art

```text
Following the STYLE BIBLE above.
New image: exciting, friendly illustration, a big cheerful glowing meteor with a sparkly gold and cyan tail streaking
diagonally past a small purple moon, a few stars around. The meteor has no face. Square 1024x1024, filling about 85%.
Transparent background. Outline: about 8 px thick on this 1024 px image. No frame, no title, no text.
```

**Save as:** `art/source/powers/meteor-offer-art.png`  
**Attach:** nothing  
**Accept if:** the meteor streaks past (not about to hit the moon threateningly), no text.


## Part 9 — Colony states, pads and decorations

### Step 150 — map.luna.colony.shield

```text
Following the STYLE BIBLE above.
New image: game sprite of a translucent protective shield dome, seen from the three-quarter top-down angle: a rounded bubble
dome made of a soft hexagon pattern in cyan (#5BE0F0), very see-through in the middle, brighter along the rim and the hexagon
lines, with a white highlight top-left. Empty inside (it will sit over a building). Sized to cover the colony from step
18. Square 1024x1024, base at the bottom-centre, filling about 90%, on a flat pure black #000000 background (it is a glow; I will convert black to alpha). Outline: about 6 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/map/colony-shield-on-01.png` (shimmer frames 02-04, hit and break frames: make them in your editor)  
**Attach:** colony healthy (step 18)  
**Accept if:** see-through enough to see the colony through it.

### Step 151 — map.luna.pad.locked

```text
Following the STYLE BIBLE above.
Edit the pad from step 21. Same pad, same size and angle. Change only: the rim lights are off, the top is covered by two
closed metal shutter halves meeting in the middle, and the whole pad is dimmer and more grey-blue. Leave the centre clear for a
small padlock icon to be placed on top later. Transparent background. Outline about 16 px. No text.
```

**Save as:** `art/source/map/pad-closed.png` (then place icon-lock in the centre yourself)  
**Attach:** pad (step 21)  
**Accept if:** not so dark that it disappears on the backdrop.

### Step 152 — map.luna.deco.crater

```text
Following the STYLE BIBLE above.
New image: three separate small cartoon moon craters, seen from the three-quarter top-down angle, spaced well apart in a row on
a transparent background: one small, one medium, one larger. Each is a soft shallow bowl in regolith lavender and purple with a
lighter rim on the top-left and shade inside on the bottom-right. Landscape 1536x1024. Outline about 16 px. No text.
```

**Save as:** `art/source/map/deco-crater-sheet.png`, then cut into deco-crater-1.png, -2.png, -3.png  
**Attach:** backdrop (step 13)  
**Accept if:** the three craters do not touch, so they cut apart cleanly.

### Step 153 — map.luna.deco.rock

```text
Following the STYLE BIBLE above.
New image: three separate small cartoon moon rocks, spaced well apart in a row on a transparent background, three-quarter
top-down view: a round purple boulder, a cluster of two pebbles, and a small teal crystal formation with soft glowing facets.
Chunky and rounded. Landscape 1536x1024. Outline about 16 px. No text.
```

**Save as:** `art/source/map/deco-rock-sheet.png`, then cut into deco-rock-1.png, -2.png, -3.png  
**Attach:** backdrop (step 13)  
**Accept if:** they do not touch, and the crystal is rounded, not sharp or dangerous.

### Step 154 — map.luna.deco.antenna

```text
Following the STYLE BIBLE above.
New image: game sprite of a small satellite dish on a short three-legged stand with a gold-tipped antenna, white and metal grey,
seen from the three-quarter top-down angle. Square 1024x1024, base at the bottom-centre, filling about 80%. Transparent
background. Outline about 16 px. No text, no logos.
```

**Save as:** `art/source/map/deco-antenna.png`  
**Attach:** nothing  
**Accept if:** no logo and nothing like a real company's dish.

### Step 155 — map.luna.deco.lamp (on)

```text
Following the STYLE BIBLE above.
New image: game sprite of a small path-side beacon lamp, a short rounded metal post with a round glass lamp on top glowing soft
cream with a small halo, three-quarter top-down view. Square 1024x1024, base at the bottom-centre, filling about 70%.
Transparent background. Outline: about 32 px thick on this 1024 px image (very thick, bold outline). No text.
```

**Save as:** `art/source/map/deco-lamp-on.png`  
**Attach:** nothing  
**Accept if:** simple, chunky shape that reads at 64 px.

### Step 156 — map.luna.deco.lamp (off)

```text
Following the STYLE BIBLE above.
Edit the lamp from step 155: same lamp, light off; the glass is pale grey with no glow. Same shape, size and
position. Transparent background. Outline: about 32 px thick on this 1024 px image (very thick, bold outline). No text.
```

**Save as:** `art/source/map/deco-lamp-off.png`  
**Attach:** lamp on (step 155)  
**Accept if:** identical shape and position to the "on" lamp.

### Re-anchor 13 (after step 156)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 157 — map.luna.deco.flag

```text
Following the STYLE BIBLE above.
New image: game sprite of a small flag on a thin pole stuck in the ground, three-quarter top-down view. The flag is a single
plain colour (Nova orange #FF8A2A) with a lighter wavy fold. No emblem, no stripes, no stars, no letters, no national design
whatsoever. Square 1024x1024, base at the bottom-centre, filling about 75%. Transparent background. Outline: about 32 px thick on this 1024 px image (very thick, bold outline). No text.
```

**Save as:** `art/source/map/deco-flag-plain.png`  
**Attach:** nothing  
**Accept if:** nothing on the flag could be read as a real country's flag or a symbol.


## Part 10 — Planets

### Step 158 — planet.luna-1

```text
Following the STYLE BIBLE above.
New image: a round cartoon moon seen whole from space, purple and lavender with soft teal patches and a few round craters, a
glowing cyan rim of light on the top-left edge, and a tiny visible cluster of white domed colony buildings with warm windows on
its upper surface. Square 1024x1024, centred, filling about 85%. Transparent background.
Outline: about 8 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/planets/planet-luna-1.png`  
**Attach:** colony healthy (step 18)  
**Accept if:** a cartoon moon, not a photo of Earth's Moon; no text.


## Part 11 — Screens and illustrations

### Step 159 — screen.galaxy.background (optional)

*Optional: skip if you do not want this asset.*

```text
Following the STYLE BIBLE above.
New image: background for a galaxy map screen. Landscape 1536x1024, OPAQUE. A calm deep-space starfield (#141633 to #23295E)
with soft nebula clouds in violet (#5B3F99), magenta and teal near the edges, many small stars of varying brightness, and a
quiet, fairly empty middle area where planets will be placed on top. No planets, no ships, no text.
```

**Save as:** `art/source/screens/galaxy-background.png` (later: export WebP; see the pack card)  
**Attach:** nothing  
**Accept if:** calm middle, no planets painted in.

### Step 160 — brand.logo (emblem only)

```text
Following the STYLE BIBLE above.
New image: a game logo EMBLEM with no lettering: a small cheerful astronaut in a round helmet (generic, NOT one of the six game
astronauts from earlier in this conversation) standing on a curved purple moon, with a white domed colony behind and a big gold
star rising above, all inside a rounded badge shape with a gold rim. Bold and simple so it reads at 64 px. Square 1024x1024, the
emblem alone, centred with even padding on all sides, transparent background. Outline about 8 px.
Absolutely no text, letters or numbers, no banner and no ribbon.
```

**Save as:** `art/source/screens/logo.png` (set the title yourself as text/SVG; make the on-dark variant yourself)  
**Attach:** style anchor (step 1)  
**Accept if:** no lettering, fake writing, banner or ribbon, and nothing like an existing game logo.

### Step 161 — screen.landing.hero (optional)

*Optional: skip if you do not want this asset.*

```text
Following the STYLE BIBLE above.
New image: a wide hero illustration, landscape 1536x1024, OPAQUE. The six astronauts from the character sheets in steps
2, 4, 5, 6, 7 and 8 standing proudly in a friendly
group on the purple moon in front of the domed colony from step 18: Nova with her laser, Pip with his round
canisters, Juno with the comet popper on her backpack, Orion with his long telescope, Mira with her shield emblem and dish, Sol
with his tall beacon antenna. In the background on the left, a swirling magenta-and-lime portal with a few cheeky aliens (a blue
blob, a little rock mite, a bubble) peeking out. Starry sky above. Leave calm space at the top-centre for a logo. No text.
```

**Save as:** `art/source/screens/landing-hero.png` (later: export WebP; see the pack card)  
**Attach:** all six sheets (steps 2, 4, 5, 6, 7, 8) + colony (step 18)  
**Accept if:** every astronaut on-model compared with their sheet, aliens cheeky not scary.

### Step 162 — screen.complete.illustration (optional)

*Optional: skip if you do not want this asset.*

```text
Following the STYLE BIBLE above.
New image: celebration illustration, square 1024x1024, transparent background. The six astronauts from the character sheets
(steps 2 to 8) cheering on the roof of the white domed colony under fireworks made of colourful stars,
while a few cheeky aliens (blue blob, bubble, lilac flutter) wave goodbye from a toy saucer flying away. Joyful.
Outline: about 4 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/screens/complete-illustration.png`  
**Attach:** all six sheets (steps 2 to 8)  
**Accept if:** aliens look cheerful about leaving, not defeated or sad.

### Step 163 — screen.defeat.illustration (optional)

*Optional: skip if you do not want this asset.*

```text
Following the STYLE BIBLE above.
New image: gentle, funny illustration, square 1024x1024, transparent background. Cheeky cartoon aliens (blue blobs, a bubble, a
little rock mite) doing a silly happy dance in a circle around the intact domed colony, while the six astronauts from the
character sheets (steps 2 to 8) shrug with smiles, roll up their sleeves and get ready to try again.
Nothing broken, nobody sad or hurt. Outline: about 4 px thick on this 1024 px image. No text.
```

**Save as:** `art/source/screens/defeat-illustration.png`  
**Attach:** all six sheets (steps 2 to 8)  
**Accept if:** colony intact, nobody upset or frightened.

### Step 164 — challenge.card.art (blob-parade, optional)

*Optional: skip if you do not want this asset.*

```text
Following the STYLE BIBLE above.
New image: small square picture for a challenge card, 1024x1024, transparent background, bold and readable at 128 px:
three blue Moon Blobs like the sprite from step 12 marching in a line, the front one wearing a marching-band hat. Outline about 16 px. No text.
```

**Save as:** `art/source/screens/challenge-blob-parade.png`  
**Attach:** Moon Blob (step 12)  
**Accept if:** no text and it matches the in-game sprites.

### Step 165 — challenge.card.art (wobble-rematch, optional)

*Optional: skip if you do not want this asset.*

```text
Following the STYLE BIBLE above.
New image: small square picture for a challenge card, 1024x1024, transparent background, bold and readable at 128 px:
the crowned blue jelly boss from step 98 grinning with his crown, one eyebrow raised in a cheeky, playful challenge. Outline about 16 px. No text.
```

**Save as:** `art/source/screens/challenge-wobble-rematch.png`  
**Attach:** King Wobble (step 98)  
**Accept if:** no text and it matches the in-game sprites.

### Step 166 — challenge.card.art (bubble-trouble, optional)

*Optional: skip if you do not want this asset.*

```text
Following the STYLE BIBLE above.
New image: small square picture for a challenge card, 1024x1024, transparent background, bold and readable at 128 px:
a big tumbling cluster of small cyan Bubble Swarm bubbles with faces (as in step 80), with one Bubble Guard (as in step 82) in the middle. Outline about 16 px. No text.
```

**Save as:** `art/source/screens/challenge-bubble-trouble.png`  
**Attach:** Bubble Swarm (step 80) + Bubble Guard (step 82)  
**Accept if:** no text and it matches the in-game sprites.


## Part 12 — Badges

### Step 167 — badge.first-steps

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in lavender.
The centre is a night-blue (#23295E) disc with a picture of: a single small boot print pressed into purple moon dust.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-first-steps.png`  
**Attach:** nothing  
**Accept if:** no letter, number or word (check rim and ribbon), a clean medal frame you are happy to reuse for all 18 badges, not like a real military or sports medal.

### Step 168 — badge.boss-1

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in blob blue. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: a yellow folded-paper crown with three points.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-boss-1.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Re-anchor 14 (after step 168)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 169 — badge.boss-2

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in shell teal. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: a rounded grey armour plate with bolts and a zigzag crack glowing gold.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-boss-2.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 170 — badge.boss-3

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in bubble cyan. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: a bubble wand with a bubble popping into droplets.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-boss-3.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 171 — badge.boss-4

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in lilac. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: a big toy saucer flying away into the distance with a little star trail.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-boss-4.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 172 — badge.campaign-luna-1

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in gold. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: a grand star shape behind the white domed colony, with small rays (make this rim grander: a double gold rim with tiny stars).
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-campaign-luna-1.png` (keep a 512 px copy too)  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 173 — badge.endless-60

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in night blue. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: a ringed planet with a long dotted orbit path looping around it and three small stars along the path (no rocket).
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-endless-60.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 174 — badge.safe-and-sound

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in shield cyan. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: the white domed colony under a cyan hexagon shield dome.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-safe-and-sound.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 175 — badge.full-crew

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in rainbow of the six class colours. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: six little round astronaut helmets in a ring, rims in orange, ice blue, yellow, navy, green and red.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-full-crew.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 176 — badge.top-team

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in Nova orange. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: one astronaut helmet with three stacked upward chevrons above it.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-top-team.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 177 — badge.meteor-catcher

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in comet gold. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: a glowing meteor caught in a soft net.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-meteor-catcher.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 178 — badge.keep-trying

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green).
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in leaf green. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: a small rocket that wobbled and is now launching upward again; its big curly wobble trail is the defining shape.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-keep-trying.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 179 — badge.bright-spark-10

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in cream. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: ONE single big bright four-point spark.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-bright-spark-10.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 180 — badge.bright-spark-50

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in gold. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: a CLUSTER of five sparks of different sizes in a burst (clearly more than a single spark by shape, not only colour).
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-bright-spark-50.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Re-anchor 15 (after step 180)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 181 — badge.all-rounder

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in three bands: gold, cyan, orange. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: three small motifs together: a row of counting beads, an ear with sound waves, and a pencil (no letters or numbers).
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-all-rounder.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 182 — badge.challenge-blob-parade

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in blob blue. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: a blue Moon Blob wearing a tall marching-band hat with a plume.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-challenge-blob-parade.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 183 — badge.challenge-bubble-trouble

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in bubble cyan. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: three bubbles caught in a looped lasso rope.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-challenge-bubble-trouble.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.

### Step 184 — badge.challenge-wobble-rematch

```text
Following the STYLE BIBLE above.
New image: a round game BADGE (medal) for a children's space game. Square 1024x1024, transparent background.
The medal: a thick round gold (#F5B700) rim with a cream inner ring and a small ribbon tab at the bottom in pink. Use EXACTLY the same medal frame (rim, inner ring, ribbon tab shape) as the badge from step 167.
The centre is a night-blue (#23295E) disc with a picture of: a crowned, wide-domed blue jelly blob with bobble antennae giving a friendly wave.
Bold, simple, readable at 128 px. Centred, filling about 85%. Outline about 16 px.
No text, no letters, no numbers, no stars arranged to look like writing.
```

**Save as:** `art/source/badges/badge-challenge-wobble-rematch.png`  
**Attach:** first badge (step 167)  
**Accept if:** no letter, number or word (check rim and ribbon), frame identical to the first badge, unlike any other badge at 128 px, not like a real military or sports medal.


## Part 13 — Activity pictures

### Step 185 — activity.pic.age5-nouns (cat)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a cat, sitting, whole body for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-cat.png`  
**Attach:** nothing  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 186 — activity.pic.age5-nouns (dog)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a dog, standing, whole body for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-dog.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 187 — activity.pic.age5-nouns (sun)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of the sun: a yellow circle with simple rays, no face for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: no face.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-sun.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; no face.

### Step 188 — activity.pic.age5-nouns (moon)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a crescent moon for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: must not look like a banana.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-moon.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; must not look like a banana.

### Step 189 — activity.pic.age5-nouns (pin)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a sewing pin with a round coloured head for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: must not look like a nail or a needle.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-pin.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; must not look like a nail or a needle.

### Step 190 — activity.pic.age5-nouns (pan)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a frying pan seen from the side at an angle, no lid for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: must not look like a pot.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-pan.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; must not look like a pot.

### Step 191 — activity.pic.age5-nouns (pen)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a ballpoint pen with its cap off for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: must not look like a pencil (no sharpened wood tip).
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-pen.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; must not look like a pencil (no sharpened wood tip).

### Step 192 — activity.pic.age5-nouns (pig)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a pink pig, whole body for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-pig.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Re-anchor 16 (after step 192)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 193 — activity.pic.age5-nouns (hat)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a simple sun hat or bobble hat for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: not a crown or helmet.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-hat.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; not a crown or helmet.

### Step 194 — activity.pic.age5-nouns (bed)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a single bed with pillow and blanket for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-bed.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 195 — activity.pic.age5-nouns (cup)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a cup with a handle on a saucer for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: no writing or letter-like pattern; must not look like a mug.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-cup.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; no writing or letter-like pattern; must not look like a mug.

### Step 196 — activity.pic.age5-nouns (map)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a folded paper treasure-style map with a dotted path ending in a small star for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: NO letters, compass letters, place names or real country shapes.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-map.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; NO letters, compass letters, place names or real country shapes.

### Step 197 — activity.pic.age5-nouns (net)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a fishing net on a pole (a hand net) for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-net.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 198 — activity.pic.age5-nouns (van)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a small delivery van, side view for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: no logo, no number plate characters.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-van.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; no logo, no number plate characters.

### Step 199 — activity.pic.age5-nouns (jam)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a jar of red jam with a cloth lid for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: no label writing (a plain label shape is fine).
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-jam.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; no label writing (a plain label shape is fine).

### Step 200 — activity.pic.age5-nouns (box)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a closed cardboard box with tape for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: no printed words, arrows or recycling symbols.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-box.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; no printed words, arrows or recycling symbols.

### Step 201 — activity.pic.age5-nouns (fox)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of an orange fox, whole body for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-fox.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 202 — activity.pic.age5-nouns (bus)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a single-deck bus, side view for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: no route number, destination sign or logo.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-bus.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; no route number, destination sign or logo.

### Step 203 — activity.pic.age5-nouns (web)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a spider's web (no spider, or a tiny friendly one) for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: not scary.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-web.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; not scary.

### Step 204 — activity.pic.age5-nouns (zip)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a zip (zipper) half open for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-zip.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Re-anchor 17 (after step 204)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 205 — activity.pic.age5-nouns (mug)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a tall mug with a handle, no saucer for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: no writing; taller than the cup and no saucer.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-mug.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; no writing; taller than the cup and no saucer.

### Step 206 — activity.pic.age5-nouns (peg)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a wooden clothes peg for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-peg.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 207 — activity.pic.age5-nouns (log)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a cut wooden log with rings at the end for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-log.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 208 — activity.pic.age5-nouns (ship)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a big ship with a funnel, on no water for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: no flags with designs, no name on the hull; must differ from the boat.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-ship.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; no flags with designs, no name on the hull; must differ from the boat.

### Step 209 — activity.pic.age5-nouns (shop)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a small shop front with an awning and a window for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: NO sign writing; a plain blank sign board is fine.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-shop.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; NO sign writing; a plain blank sign board is fine.

### Step 210 — activity.pic.age5-nouns (chip)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of golden potato chips (British chips, thick fried potato sticks), a small pile of three for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: must not read as crisps.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-chip.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; must not read as crisps.

### Step 211 — activity.pic.age5-nouns (fish)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a fish, side view for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-fish.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 212 — activity.pic.age5-nouns (ring)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a gold ring with one round gem for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-ring.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 213 — activity.pic.age5-nouns (rain)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a grey cloud with falling raindrops for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: no lightning.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-rain.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; no lightning.

### Step 214 — activity.pic.age5-nouns (boat)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a small rowing boat or sailing dinghy, on no water for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: small and no funnel, so it differs from the ship.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-boat.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; small and no funnel, so it differs from the ship.

### Step 215 — activity.pic.age5-nouns (frog)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a green frog, sitting for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background (if it fails, use a flat pure magenta #FF00FF background, not green), no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-frog.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 216 — activity.pic.age5-nouns (flag)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a plain flag on a pole in one colour with a single wavy fold for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: NO national design, stripes, stars, emblem or letters.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-flag.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; NO national design, stripes, stars, emblem or letters.

### Re-anchor 18 (after step 216)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 217 — activity.pic.age5-nouns (bell)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a hand bell or a classic bell shape with a clapper for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-bell.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 218 — activity.pic.age5-nouns (sock)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a single striped sock for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-sock.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 219 — activity.pic.age5-nouns (duck)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a yellow duck (a real duckling or duck, not a bath toy brand) for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-duck.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 220 — activity.pic.age67-nouns (knight)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a friendly cartoon knight in armour holding a plain shield with no emblem, no sword for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: no weapon, no heraldry.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-knight.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; no weapon, no heraldry.

### Step 221 — activity.pic.age67-nouns (night-sky)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a dark blue rounded square of night sky with a crescent moon and stars (this one may have that background shape) for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-night-sky.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 222 — activity.pic.age67-nouns (kite)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a diamond kite with a bow tail for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-kite.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 223 — activity.pic.age67-nouns (knot)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a thick rope tied in a simple knot for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-knot.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 224 — activity.pic.age67-nouns (football)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a classic black-and-white football for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: no brand marks.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-football.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; no brand marks.

### Step 225 — activity.pic.age67-nouns (bird)

```text
Following the STYLE BIBLE above.
New image: a single clear picture of a small garden bird, side view for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. One object only, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-bird.png`  
**Attach:** cat picture (step 185)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols.

### Step 226 — activity.pic.age67-nouns (foxes, optional)

*Optional: skip if you do not want this asset.*

```text
Following the STYLE BIBLE above.
New image: a single clear picture of TWO orange foxes side by side, exactly two, the same fox as in step 201 for a children's reading game, the plain everyday version that a five-year-old
recognises instantly. Only the two foxes, nothing else, centred, filling about 80%, seen from its most recognisable angle (side or three-quarter
view is fine here; it does not need the battlefield's top-down angle). Simple bold shapes, readable at 128 px. Square
1024x1024, transparent background, no ground, no scene. Outline about 16 px. Watch out: exactly two, same fox as pic-fox.
Match the style, outline and framing of the cat picture from step 185.
Absolutely no text, letters, numbers, logos or symbols on the object.
```

**Save as:** `art/source/activity/pic-foxes.png`  
**Attach:** cat picture (step 185) + fox (step 201)  
**Accept if:** a five-year-old would name it at once at 128 px, no text or symbols; exactly two, same fox as pic-fox.

### Step 227 — activity.obj.counting (star)

```text
Following the STYLE BIBLE above.
New image: a single counting object for a maths game: a chunky gold five-point star. One object only, centred, filling about 80%, very simple bold shape
with no small details, so that ten copies in a row are easy to count. Square 1024x1024, transparent background.
Outline about 16 px.
No text, no numbers, no face.
```

**Save as:** `art/source/activity/obj-star.png`  
**Attach:** nothing  
**Accept if:** one simple object with no face, and it cannot be confused with the other counting objects at 64 px.

### Step 228 — activity.obj.counting (moon-rock)

```text
Following the STYLE BIBLE above.
New image: a single counting object for a maths game: a round lumpy purple moon rock. One object only, centred, filling about 80%, very simple bold shape
with no small details, so that ten copies in a row are easy to count. Square 1024x1024, transparent background.
Outline about 16 px.
Match the style, outline and size of the counting star from step 227.
No text, no numbers, no face.
```

**Save as:** `art/source/activity/obj-moon-rock.png`  
**Attach:** counting star (step 227)  
**Accept if:** one simple object with no face, and it cannot be confused with the other counting objects at 64 px.

### Re-anchor 19 (after step 228)

```text
Re-anchor before the next image. Look again at the style anchor from step 1 and match it in every image from now on:
1. NO text: no letters, numbers, logos, signatures or writing-like symbols anywhere.
2. Uniform dark plum #2A1E3D outline on every object, at the thickness each prompt states; thinner inner lines in the same plum.
3. Three-quarter top-down view, camera about 50 degrees down; anything flat on the ground is an ellipse 4 wide : 3 tall.
4. Characters and aliens face three-quarter towards the viewer's RIGHT.
5. One light from the TOP-LEFT, shade on the bottom-right, no ground shadows unless asked.
6. Cel-shaded flat colour (one base, one soft shade, one highlight); no texture, grain, painterly look, blur or lens flare.
7. Palette: deep space #141633, night blue #23295E, regolith lavender #9C8FD6 and purple #6B5CA5, teal #3FB8AF, suit white
   #F4F1EA, cream #FFF4D6; Nova #FF8A2A, Pip #8ED8FF, Juno #FFD23F, Mira #3DBE6E, Orion #2E4A9E with #FFD86B, Sol #E2403A with #F5B700.
8. Friendly, never scary or violent: rounded, big eyes, cheeky smiles; no weapons, fire, smoke, fangs, claws or angry brows.
9. Chunky toy shapes and big clear silhouettes that still read at 64-128 px; few small details.
10. One subject per image, centred, nothing cropped; transparent background unless the prompt says black, opaque or plain.
Do not make an image for this message. Reply only "OK, re-anchored".
```

**Attach:** style anchor (`art/source/style-anchor.png`)

### Step 229 — activity.obj.counting (rocket)

```text
Following the STYLE BIBLE above.
New image: a single counting object for a maths game: a small upright white-and-orange rocket with round window and fins. One object only, centred, filling about 80%, very simple bold shape
with no small details, so that ten copies in a row are easy to count. Square 1024x1024, transparent background.
Outline about 16 px.
Match the style, outline and size of the counting star from step 227.
No text, no numbers, no face.
```

**Save as:** `art/source/activity/obj-rocket.png`  
**Attach:** counting star (step 227)  
**Accept if:** one simple object with no face, and it cannot be confused with the other counting objects at 64 px.

### Step 230 — activity.obj.counting (alien-egg)

```text
Following the STYLE BIBLE above.
New image: a single counting object for a maths game: an oval lime-green egg with darker spots. One object only, centred, filling about 80%, very simple bold shape
with no small details, so that ten copies in a row are easy to count. Square 1024x1024, transparent background.
Outline about 16 px.
Match the style, outline and size of the counting star from step 227.
No text, no numbers, no face.
```

**Save as:** `art/source/activity/obj-alien-egg.png`  
**Attach:** counting star (step 227)  
**Accept if:** one simple object with no face, and it cannot be confused with the other counting objects at 64 px.

### Step 231 — activity.obj.counting (planet)

```text
Following the STYLE BIBLE above.
New image: a single counting object for a maths game: a small blue planet with a single ring. One object only, centred, filling about 80%, very simple bold shape
with no small details, so that ten copies in a row are easy to count. Square 1024x1024, transparent background.
Outline about 16 px.
Match the style, outline and size of the counting star from step 227.
No text, no numbers, no face.
```

**Save as:** `art/source/activity/obj-planet.png`  
**Attach:** counting star (step 227)  
**Accept if:** one simple object with no face, and it cannot be confused with the other counting objects at 64 px.

### Step 232 — activity.obj.counting (comet)

```text
Following the STYLE BIBLE above.
New image: a single counting object for a maths game: a round gold comet with a short tail to the left. One object only, centred, filling about 80%, very simple bold shape
with no small details, so that ten copies in a row are easy to count. Square 1024x1024, transparent background.
Outline about 16 px.
Match the style, outline and size of the counting star from step 227.
No text, no numbers, no face.
```

**Save as:** `art/source/activity/obj-comet.png`  
**Attach:** counting star (step 227)  
**Accept if:** one simple object with no face, and it cannot be confused with the other counting objects at 64 px.

### Step 233 — activity.obj.alien (optional)

*Optional: skip if you do not want this asset.*

```text
Following the STYLE BIBLE above.
New image: a single small friendly blue Moon Blob alien (as in step 12) facing the viewer, sitting still, simple bold
shape, readable at 64 px, so ten copies in a row are easy to count. Square 1024x1024, centred, transparent background. Outline about 16 px.
No text, no numbers.
```

**Save as:** `art/source/activity/obj-alien.png` (or reuse Moon Blob frame 01)  
**Attach:** Moon Blob (step 12)  
**Accept if:** clearly the Moon Blob, simple enough to count ten in a row.

### Step 234 — activity.shape.3d (cube)

```text
Following the STYLE BIBLE above.
New image: a single geometrically correct 3-D cube (all edges equal), cel-shaded with clear light from the top-left so its faces and curves are
obvious, in a plain soft colour with the thick plum outline, seen from slightly above. No pattern, no texture, no shadow on the
ground. Square 1024x1024, centred, filling about 75%. Transparent background. Outline about 16 px. No text.
```

**Save as:** `art/source/activity/shape-cube.png`  
**Attach:** nothing  
**Accept if:** straight edges and geometrically correct (cube vs cuboid clearly different; pyramid has a square base).

### Step 235 — activity.shape.3d (cuboid)

```text
Following the STYLE BIBLE above.
New image: a single geometrically correct 3-D cuboid (clearly longer than it is tall and deep), cel-shaded with clear light from the top-left so its faces and curves are
obvious, in a plain soft colour with the thick plum outline, seen from slightly above. No pattern, no texture, no shadow on the
ground. Square 1024x1024, centred, filling about 75%. Transparent background. Outline about 16 px.
Match the style, colour treatment and size of the cube from step 234. No text.
```

**Save as:** `art/source/activity/shape-cuboid.png`  
**Attach:** cube (step 234)  
**Accept if:** straight edges and geometrically correct (cube vs cuboid clearly different; pyramid has a square base).

### Step 236 — activity.shape.3d (sphere)

```text
Following the STYLE BIBLE above.
New image: a single geometrically correct 3-D sphere, cel-shaded with clear light from the top-left so its faces and curves are
obvious, in a plain soft colour with the thick plum outline, seen from slightly above. No pattern, no texture, no shadow on the
ground. Square 1024x1024, centred, filling about 75%. Transparent background. Outline about 16 px.
Match the style, colour treatment and size of the cube from step 234. No text.
```

**Save as:** `art/source/activity/shape-sphere.png`  
**Attach:** cube (step 234)  
**Accept if:** straight edges and geometrically correct (cube vs cuboid clearly different; pyramid has a square base).

### Step 237 — activity.shape.3d (cylinder)

```text
Following the STYLE BIBLE above.
New image: a single geometrically correct 3-D cylinder, cel-shaded with clear light from the top-left so its faces and curves are
obvious, in a plain soft colour with the thick plum outline, seen from slightly above. No pattern, no texture, no shadow on the
ground. Square 1024x1024, centred, filling about 75%. Transparent background. Outline about 16 px.
Match the style, colour treatment and size of the cube from step 234. No text.
```

**Save as:** `art/source/activity/shape-cylinder.png`  
**Attach:** cube (step 234)  
**Accept if:** straight edges and geometrically correct (cube vs cuboid clearly different; pyramid has a square base).

### Step 238 — activity.shape.3d (cone)

```text
Following the STYLE BIBLE above.
New image: a single geometrically correct 3-D cone, cel-shaded with clear light from the top-left so its faces and curves are
obvious, in a plain soft colour with the thick plum outline, seen from slightly above. No pattern, no texture, no shadow on the
ground. Square 1024x1024, centred, filling about 75%. Transparent background. Outline about 16 px.
Match the style, colour treatment and size of the cube from step 234. No text.
```

**Save as:** `art/source/activity/shape-cone.png`  
**Attach:** cube (step 234)  
**Accept if:** straight edges and geometrically correct (cube vs cuboid clearly different; pyramid has a square base).

### Step 239 — activity.shape.3d (pyramid)

```text
Following the STYLE BIBLE above.
New image: a single geometrically correct 3-D square-based pyramid, cel-shaded with clear light from the top-left so its faces and curves are
obvious, in a plain soft colour with the thick plum outline, seen from slightly above. No pattern, no texture, no shadow on the
ground. Square 1024x1024, centred, filling about 75%. Transparent background. Outline about 16 px.
Match the style, colour treatment and size of the cube from step 234. No text.
```

**Save as:** `art/source/activity/shape-pyramid.png`  
**Attach:** cube (step 234)  
**Accept if:** straight edges and geometrically correct (cube vs cuboid clearly different; pyramid has a square base).

### Step 240 — activity.demo.cards (template: repeat per concept)

```text
Following the STYLE BIBLE above.
New image: a simple teaching picture for young children showing <EXAMPLE> using the counting objects / pictures from earlier in
this conversation (steps 227 to 232 and the noun pictures). Clear layout, plenty of space, objects in tidy rows or
groups. Square 1024x1024, transparent background. Outline: about 8 px thick on this 1024 px image.
No text, no numbers, no symbols such as plus or equals signs (the app adds words).
```

**Save as:** `art/source/activity/demo-<conceptId>-<nn>.png` (proposed name)  
**Attach:** the counting objects or pictures it uses  
**Accept if:** it does not show the answer to the activity it introduces, and has no numeral or letter.

> Replace `<EXAMPLE>` per concept, for example "two groups of three stars being pushed together into one group of six" or "a cat and a cup shown side by side to compare their first sounds". Repeat this step once per concept when the concepts are authored (about 20). The about 8 further age 6-7 nouns are added the same way as the `pic-` steps above when chosen.

## Not generated in ChatGPT

These inventory items are drawn as SVG, in code or CSS, or made by you from an accepted image. Do not ask ChatGPT for them (pack
cards marked "SVG / code — not ChatGPT", "Not ChatGPT" or "owner-made"). Paths are under `art/source/`, as in the catalogue.

| Item | File(s) | How |
|---|---|---|
| `class.all.selected` | none (runtime) | outline and tick drawn by the game |
| height guide | `astronauts/height-guide.png` | your edit of step 3: flat #23295E fill of Nova's L1 sprite |
| locked shop cards | `astronauts/nova-card-locked.png`, `astronauts/pip-card-locked.png`, `astronauts/juno-card-locked.png`, `astronauts/orion-card-locked.png`, `astronauts/mira-card-locked.png`, `astronauts/sol-card-locked.png` | your edit: flat #23295E fill of each portrait plus a plum outline |
| alien.flutter.shadow | `aliens/alien-flutter-shadow.svg` | SVG / code ellipse, #4A3F7A at about 40% |
| alien.guard.bubble-layers | `aliens/alien-guard-layers-4.svg`, `aliens/alien-guard-layers-3.svg`, `aliens/alien-guard-layers-2.svg`, `aliens/alien-guard-layers-1.svg` | SVG / code concentric translucent rings |
| boss.bubbla.bubble | `bosses/boss-bubbla-bubble-full.svg`, `bosses/boss-bubbla-bubble-thin.svg`, `bosses/boss-bubbla-bubble-none.svg` | SVG / code bubble overlay (also Glorp's phase-2 bubble) |
| fx.juno.blast level 2 | `effects/fx-juno-blast-l2-{nn}.png` | copy of the level 1 frames from step 131 (code changes the scale) |
| power icons, used state | `powers/power-frost-pulse-icon-used.png`, `powers/power-comet-burst-icon-used.png`, `powers/power-colony-shield-icon-used.png` | your edit of each ready icon: desaturate, lighten to about 40%, dashed outline |
| power.comet-burst.target | `powers/fx-comet-target-{nn}.svg` | SVG / code through the map projection |
| route tile, vertical and up | `map/route-straight-v.png`, `map/route-straight-up.png` | your 90 and 270 degree rotations of the straight tile from step 14 |
| map.luna.route.corner | `map/route-corner-right-down.png`, `map/route-corner-down-right.png`, `map/route-corner-right-up.png`, `map/route-corner-up-right.png` | you draw one bend from the straight tile, then rotate or mirror it |
| colony shield hit and break | `map/colony-shield-hit.png`, `map/colony-shield-break-{nn}.png` | your edits of the shield image from step 150 (or a runtime tint) |
| pad hover, valid target, selected | `map/pad-hover.svg`, `map/pad-valid-target.svg`, `map/pad-selected.svg` | SVG / code rings and tick |
| decoration craters | `map/deco-crater-1.png`, `map/deco-crater-2.png`, `map/deco-crater-3.png` | cut from the crater sheet (step 152) |
| decoration rocks | `map/deco-rock-1.png`, `map/deco-rock-2.png`, `map/deco-rock-3.png` | cut from the rock sheet (step 153) |
| planet.coming-later | `planets/planet-silhouette.svg` | SVG dotted circle |
| UI icons (pack 4.9) | `ui-icons/icon-credits.svg`, `ui-icons/icon-health.svg`, `ui-icons/icon-shield.svg`, `ui-icons/icon-wave.svg`, `ui-icons/icon-pause.svg`, `ui-icons/icon-play.svg`, `ui-icons/icon-speed-1.svg`, `ui-icons/icon-speed-2.svg`, `ui-icons/icon-menu.svg`, `ui-icons/icon-target-front.svg`, `ui-icons/icon-target-fast.svg`, `ui-icons/icon-target-crowd.svg`, `ui-icons/icon-target-strong.svg`, `ui-icons/icon-cap-token-available.svg`, `ui-icons/icon-cap-token-used.svg`, `ui-icons/icon-maths.svg`, `ui-icons/icon-phonics.svg`, `ui-icons/icon-spelling.svg`, `ui-icons/icon-sound-play.svg`, `ui-icons/icon-sound-loading.svg`, `ui-icons/icon-sound-stop.svg`, `ui-icons/icon-sound-replay.svg`, `ui-icons/icon-sound-retry.svg`, `ui-icons/icon-sound-small.svg`, `ui-icons/icon-sync-saved.svg`, `ui-icons/icon-sync-saving.svg`, `ui-icons/icon-sync-device.svg`, `ui-icons/icon-sync-retrying.svg`, `ui-icons/icon-sync-signin.svg`, `ui-icons/icon-sync-warning.svg`, `ui-icons/icon-sync-reload.svg`, `ui-icons/icon-offline-ready.svg`, `ui-icons/icon-offline-preparing.svg`, `ui-icons/icon-offline-missing.svg`, `ui-icons/icon-try-left.svg`, `ui-icons/icon-try-used.svg`, `ui-icons/icon-tick.svg`, `ui-icons/icon-tried.svg` | owner SVG; the 4.9 template is only for optional idea sketches |
| badge outlines | `badges/badge-first-steps-outline.png`, `badges/badge-boss-1-outline.png`, `badges/badge-boss-2-outline.png`, `badges/badge-boss-3-outline.png`, `badges/badge-boss-4-outline.png`, `badges/badge-campaign-luna-1-outline.png`, `badges/badge-endless-60-outline.png`, `badges/badge-safe-and-sound-outline.png`, `badges/badge-full-crew-outline.png`, `badges/badge-top-team-outline.png`, `badges/badge-meteor-catcher-outline.png`, `badges/badge-keep-trying-outline.png`, `badges/badge-bright-spark-10-outline.png`, `badges/badge-bright-spark-50-outline.png`, `badges/badge-all-rounder-outline.png`, `badges/badge-challenge-blob-parade-outline.png`, `badges/badge-challenge-bubble-trouble-outline.png`, `badges/badge-challenge-wobble-rematch-outline.png` | your edit of each earned badge (pack 4.10) |
| brand.logo title and on-dark variant | `screens/logo.svg`, `screens/logo-on-dark.png`, `screens/logo-on-dark.svg` | you set the title as text/SVG beside the emblem from step 160 and add a cream outer stroke for on-dark |
| activity.shape.2d | `activity/shape-circle.svg`, `activity/shape-triangle.svg`, `activity/shape-square.svg`, `activity/shape-rectangle.svg`, `activity/shape-pentagon.svg`, `activity/shape-hexagon.svg` | SVG with exact geometry |
| activity.number.frames | `activity/ten-frame.svg`, `activity/dice-1.svg`, `activity/dice-2.svg`, `activity/dice-3.svg`, `activity/dice-4.svg`, `activity/dice-5.svg`, `activity/dice-6.svg`, `activity/group-frame.svg` | SVG (dice show pips, no numerals) |
| activity.sort.containers | `activity/bin-plain.svg`, `activity/zone-plain.svg`, `activity/tray.svg` | SVG / CSS |
| `map.range-circle` | none (runtime) | drawn through the map projection |

## Progress checklist

Tick a step when its file (or, for an animation, every frame) is saved in `art/source`. The catalogue
[`asset-catalogue.json`](asset-catalogue.json) is the full file-by-file list (with frame counts, sizes and the Milestone 1 set);
the art build tool will read it to report what is still missing.

| Step | File | Done? |
|---|---|---|
| 1 | `art/source/style-anchor.png` | [ ] |
| 2 | `art/source/astronauts/nova-sheet.png` | [ ] |
| 3 | `art/source/astronauts/nova-l1-idle-01.png` | [ ] |
| 4 | `art/source/astronauts/pip-sheet.png` | [ ] |
| 5 | `art/source/astronauts/juno-sheet.png` | [ ] |
| 6 | `art/source/astronauts/orion-sheet.png` | [ ] |
| 7 | `art/source/astronauts/mira-sheet.png` | [ ] |
| 8 | `art/source/astronauts/sol-sheet.png` | [ ] |
| 9 | `art/source/astronauts/nova-l1-attack-02.png` | [ ] |
| 10 | `art/source/astronauts/nova-card.png` | [ ] |
| 11 | `art/source/aliens/alien-lineup.png` | [ ] |
| 12 | `art/source/aliens/alien-blob-walk-01.png` | [ ] |
| 13 | `art/source/map/luna-backdrop.png` | [ ] |
| 14 | `art/source/map/route-straight-h.png` | [ ] |
| 15 | `art/source/map/route-portal-end.png` | [ ] |
| 16 | `art/source/map/route-colony-end.png` | [ ] |
| 17 | `art/source/map/portal-idle-01.png` | [ ] |
| 18 | `art/source/map/colony-healthy.png` | [ ] |
| 19 | `art/source/map/colony-worried.png` | [ ] |
| 20 | `art/source/map/colony-very-worried.png` | [ ] |
| 21 | `art/source/map/pad-empty.png` | [ ] |
| 22 | `art/source/effects/fx-nova-beam-l1-01.png` | [ ] |
| 23 | `art/source/effects/fx-pop-stars-04.png` | [ ] |
| 24 | `art/source/effects/fx-leak-03.png` | [ ] |
| 25 | `art/source/effects/fx-reward-credits-04.png` | [ ] |
| 26 | `art/source/effects/fx-correct-sparkle-04.png` | [ ] |
| 27 | `art/source/avatars/avatar-01.png` | [ ] |
| 28 | `art/source/avatars/avatar-02.png` | [ ] |
| 29 | `art/source/avatars/avatar-03.png` | [ ] |
| 30 | `art/source/avatars/avatar-04.png` | [ ] |
| 31 | `art/source/avatars/avatar-05.png` | [ ] |
| 32 | `art/source/avatars/avatar-06.png` | [ ] |
| 33 | `art/source/avatars/avatar-07.png` | [ ] |
| 34 | `art/source/avatars/avatar-08.png` | [ ] |
| 35 | `art/source/avatars/avatar-09.png` | [ ] |
| 36 | `art/source/avatars/avatar-10.png` | [ ] |
| 37 | `art/source/avatars/avatar-11.png` | [ ] |
| 38 | `art/source/avatars/avatar-12.png` | [ ] |
| 39 | `art/source/astronauts/nova-l2-idle-01.png` | [ ] |
| 40 | `art/source/astronauts/nova-l2-attack-02.png` | [ ] |
| 41 | `art/source/astronauts/nova-l3-idle-01.png` | [ ] |
| 42 | `art/source/astronauts/nova-l3-attack-02.png` | [ ] |
| 43 | `art/source/astronauts/pip-l1-idle-01.png` | [ ] |
| 44 | `art/source/astronauts/pip-l1-attack-02.png` | [ ] |
| 45 | `art/source/astronauts/pip-l2-idle-01.png` | [ ] |
| 46 | `art/source/astronauts/pip-l2-attack-02.png` | [ ] |
| 47 | `art/source/astronauts/pip-l3-idle-01.png` | [ ] |
| 48 | `art/source/astronauts/pip-l3-attack-02.png` | [ ] |
| 49 | `art/source/astronauts/pip-card.png` | [ ] |
| 50 | `art/source/astronauts/juno-l1-idle-01.png` | [ ] |
| 51 | `art/source/astronauts/juno-l1-attack-04.png` | [ ] |
| 52 | `art/source/astronauts/juno-l2-idle-01.png` | [ ] |
| 53 | `art/source/astronauts/juno-l2-attack-04.png` | [ ] |
| 54 | `art/source/astronauts/juno-l3-idle-01.png` | [ ] |
| 55 | `art/source/astronauts/juno-l3-attack-04.png` | [ ] |
| 56 | `art/source/astronauts/juno-card.png` | [ ] |
| 57 | `art/source/astronauts/orion-l1-idle-01.png` | [ ] |
| 58 | `art/source/astronauts/orion-l1-attack-04.png` | [ ] |
| 59 | `art/source/astronauts/orion-l2-idle-01.png` | [ ] |
| 60 | `art/source/astronauts/orion-l2-attack-04.png` | [ ] |
| 61 | `art/source/astronauts/orion-l3-idle-01.png` | [ ] |
| 62 | `art/source/astronauts/orion-l3-attack-04.png` | [ ] |
| 63 | `art/source/astronauts/orion-card.png` | [ ] |
| 64 | `art/source/astronauts/mira-l1-idle-01.png` | [ ] |
| 65 | `art/source/astronauts/mira-l1-emit-03.png` | [ ] |
| 66 | `art/source/astronauts/mira-l2-idle-01.png` | [ ] |
| 67 | `art/source/astronauts/mira-l2-emit-03.png` | [ ] |
| 68 | `art/source/astronauts/mira-l3-idle-01.png` | [ ] |
| 69 | `art/source/astronauts/mira-l3-emit-03.png` | [ ] |
| 70 | `art/source/astronauts/mira-card.png` | [ ] |
| 71 | `art/source/astronauts/sol-l1-idle-01.png` | [ ] |
| 72 | `art/source/astronauts/sol-l1-pulse-03.png` | [ ] |
| 73 | `art/source/astronauts/sol-l2-idle-01.png` | [ ] |
| 74 | `art/source/astronauts/sol-l2-pulse-03.png` | [ ] |
| 75 | `art/source/astronauts/sol-l3-idle-01.png` | [ ] |
| 76 | `art/source/astronauts/sol-l3-pulse-03.png` | [ ] |
| 77 | `art/source/astronauts/sol-card.png` | [ ] |
| 78 | `art/source/aliens/alien-mite-walk-01.png` | [ ] |
| 79 | `art/source/aliens/alien-shell-walk-01.png` | [ ] |
| 80 | `art/source/aliens/alien-swarm-bob-01.png` | [ ] |
| 81 | `art/source/aliens/alien-flutter-fly-01.png` | [ ] |
| 82 | `art/source/aliens/alien-guard-walk-01.png` | [ ] |
| 83 | `art/source/aliens/alien-guard-pop-02.png` | [ ] |
| 84 | `art/source/aliens/alien-patch-walk-01.png` | [ ] |
| 85 | `art/source/aliens/alien-patch-heal-03.png` | [ ] |
| 86 | `art/source/aliens/alien-slime-walk-01.png` | [ ] |
| 87 | `art/source/aliens/alien-slime-split-03.png` | [ ] |
| 88 | `art/source/aliens/alien-slimelet-hop-01.png` | [ ] |
| 89 | `art/source/aliens/alien-craft-hover-01.png` | [ ] |
| 90 | `art/source/aliens/alien-craft-release-03.png` | [ ] |
| 91 | `art/source/trait-icons/icon-armour.png` | [ ] |
| 92 | `art/source/trait-icons/icon-flying.png` | [ ] |
| 93 | `art/source/trait-icons/icon-bubbles.png` | [ ] |
| 94 | `art/source/trait-icons/icon-healer.png` | [ ] |
| 95 | `art/source/trait-icons/icon-splitter.png` | [ ] |
| 96 | `art/source/trait-icons/icon-carrier.png` | [ ] |
| 97 | `art/source/trait-icons/icon-lock.png` | [ ] |
| 98 | `art/source/bosses/boss-wobble-walk-01.png` | [ ] |
| 99 | `art/source/bosses/boss-wobble-dash-01.png` | [ ] |
| 100 | `art/source/bosses/boss-wobble-phase-03.png` | [ ] |
| 101 | `art/source/bosses/boss-clank-full-walk-01.png` | [ ] |
| 102 | `art/source/bosses/boss-clank-cracked-walk-01.png` | [ ] |
| 103 | `art/source/bosses/boss-clank-off-walk-01.png` | [ ] |
| 104 | `art/source/bosses/boss-clank-platesfall-03.png` | [ ] |
| 105 | `art/source/bosses/boss-bubbla-walk-01.png` | [ ] |
| 106 | `art/source/bosses/boss-bubbla-wand-03.png` | [ ] |
| 107 | `art/source/bosses/boss-mothership-shut-hover-01.png` | [ ] |
| 108 | `art/source/bosses/boss-mothership-door1open-hover-01.png` | [ ] |
| 109 | `art/source/bosses/boss-mothership-door12open-hover-01.png` | [ ] |
| 110 | `art/source/bosses/boss-mothership-bare-hover-01.png` | [ ] |
| 111 | `art/source/bosses/boss-mothership-door1-04.png` | [ ] |
| 112 | `art/source/bosses/boss-mothership-door2-04.png` | [ ] |
| 113 | `art/source/bosses/boss-mothership-door3-04.png` | [ ] |
| 114 | `art/source/bosses/boss-mothership-release-03.png` (optional) | [ ] |
| 115 | `art/source/bosses/boss-glorp-base.png` | [ ] |
| 116 | `art/source/bosses/boss-glorp-armoured-walk-01.png` | [ ] |
| 117 | `art/source/bosses/boss-glorp-bubbled-walk-01.png` | [ ] |
| 118 | `art/source/bosses/boss-glorp-cargo-walk-01.png` | [ ] |
| 119 | `art/source/bosses/boss-glorp-dash-walk-01.png` | [ ] |
| 120 | `art/source/bosses/boss-glorp-hatch-04.png` | [ ] |
| 121 | `art/source/bosses/boss-glorp-phase-03.png` | [ ] |
| 122 | `art/source/bosses/fx-boss-arrive-04.png` | [ ] |
| 123 | `art/source/bosses/fx-boss-phase-03.png` | [ ] |
| 124 | `art/source/effects/fx-nova-beam-l2-01.png` | [ ] |
| 125 | `art/source/effects/fx-nova-beam-l3-01.png` | [ ] |
| 126 | `art/source/effects/fx-pip-bolt-01.png` | [ ] |
| 127 | `art/source/effects/fx-pip-slow-ring-03.png` | [ ] |
| 128 | `art/source/effects/fx-slowed-01.png` | [ ] |
| 129 | `art/source/effects/fx-slowed-02.png` | [ ] |
| 130 | `art/source/effects/fx-juno-comet-01.png` | [ ] |
| 131 | `art/source/effects/fx-juno-blast-l1-03.png` | [ ] |
| 132 | `art/source/effects/fx-juno-blast-l3-03.png` | [ ] |
| 133 | `art/source/effects/fx-mira-shield-pulse-03.png` | [ ] |
| 134 | `art/source/effects/fx-mira-repair-03.png` | [ ] |
| 135 | `art/source/effects/fx-orion-shot-01.png` | [ ] |
| 136 | `art/source/effects/fx-sol-beacon-03.png` | [ ] |
| 137 | `art/source/effects/fx-sol-buffed-01.png` | [ ] |
| 138 | `art/source/effects/fx-upgrade-04.png` | [ ] |
| 139 | `art/source/effects/fx-place-03.png` | [ ] |
| 140 | `art/source/effects/fx-sell-03.png` | [ ] |
| 141 | `art/source/effects/fx-armour-clonk-02.png` | [ ] |
| 142 | `art/source/effects/fx-healed-02.png` | [ ] |
| 143 | `art/source/powers/power-frost-pulse-icon.png` | [ ] |
| 144 | `art/source/powers/fx-frost-pulse-04.png` | [ ] |
| 145 | `art/source/powers/power-comet-burst-icon.png` | [ ] |
| 146 | `art/source/powers/fx-comet-impact-04.png` | [ ] |
| 147 | `art/source/powers/power-colony-shield-icon.png` | [ ] |
| 148 | `art/source/powers/fx-colony-shield-boost-03.png` | [ ] |
| 149 | `art/source/powers/meteor-offer-art.png` | [ ] |
| 150 | `art/source/map/colony-shield-on-01.png` | [ ] |
| 151 | `art/source/map/pad-closed.png` | [ ] |
| 152 | `art/source/map/deco-crater-sheet.png` | [ ] |
| 153 | `art/source/map/deco-rock-sheet.png` | [ ] |
| 154 | `art/source/map/deco-antenna.png` | [ ] |
| 155 | `art/source/map/deco-lamp-on.png` | [ ] |
| 156 | `art/source/map/deco-lamp-off.png` | [ ] |
| 157 | `art/source/map/deco-flag-plain.png` | [ ] |
| 158 | `art/source/planets/planet-luna-1.png` | [ ] |
| 159 | `art/source/screens/galaxy-background.png` (optional) | [ ] |
| 160 | `art/source/screens/logo.png` | [ ] |
| 161 | `art/source/screens/landing-hero.png` (optional) | [ ] |
| 162 | `art/source/screens/complete-illustration.png` (optional) | [ ] |
| 163 | `art/source/screens/defeat-illustration.png` (optional) | [ ] |
| 164 | `art/source/screens/challenge-blob-parade.png` (optional) | [ ] |
| 165 | `art/source/screens/challenge-wobble-rematch.png` (optional) | [ ] |
| 166 | `art/source/screens/challenge-bubble-trouble.png` (optional) | [ ] |
| 167 | `art/source/badges/badge-first-steps.png` | [ ] |
| 168 | `art/source/badges/badge-boss-1.png` | [ ] |
| 169 | `art/source/badges/badge-boss-2.png` | [ ] |
| 170 | `art/source/badges/badge-boss-3.png` | [ ] |
| 171 | `art/source/badges/badge-boss-4.png` | [ ] |
| 172 | `art/source/badges/badge-campaign-luna-1.png` | [ ] |
| 173 | `art/source/badges/badge-endless-60.png` | [ ] |
| 174 | `art/source/badges/badge-safe-and-sound.png` | [ ] |
| 175 | `art/source/badges/badge-full-crew.png` | [ ] |
| 176 | `art/source/badges/badge-top-team.png` | [ ] |
| 177 | `art/source/badges/badge-meteor-catcher.png` | [ ] |
| 178 | `art/source/badges/badge-keep-trying.png` | [ ] |
| 179 | `art/source/badges/badge-bright-spark-10.png` | [ ] |
| 180 | `art/source/badges/badge-bright-spark-50.png` | [ ] |
| 181 | `art/source/badges/badge-all-rounder.png` | [ ] |
| 182 | `art/source/badges/badge-challenge-blob-parade.png` | [ ] |
| 183 | `art/source/badges/badge-challenge-bubble-trouble.png` | [ ] |
| 184 | `art/source/badges/badge-challenge-wobble-rematch.png` | [ ] |
| 185 | `art/source/activity/pic-cat.png` | [ ] |
| 186 | `art/source/activity/pic-dog.png` | [ ] |
| 187 | `art/source/activity/pic-sun.png` | [ ] |
| 188 | `art/source/activity/pic-moon.png` | [ ] |
| 189 | `art/source/activity/pic-pin.png` | [ ] |
| 190 | `art/source/activity/pic-pan.png` | [ ] |
| 191 | `art/source/activity/pic-pen.png` | [ ] |
| 192 | `art/source/activity/pic-pig.png` | [ ] |
| 193 | `art/source/activity/pic-hat.png` | [ ] |
| 194 | `art/source/activity/pic-bed.png` | [ ] |
| 195 | `art/source/activity/pic-cup.png` | [ ] |
| 196 | `art/source/activity/pic-map.png` | [ ] |
| 197 | `art/source/activity/pic-net.png` | [ ] |
| 198 | `art/source/activity/pic-van.png` | [ ] |
| 199 | `art/source/activity/pic-jam.png` | [ ] |
| 200 | `art/source/activity/pic-box.png` | [ ] |
| 201 | `art/source/activity/pic-fox.png` | [ ] |
| 202 | `art/source/activity/pic-bus.png` | [ ] |
| 203 | `art/source/activity/pic-web.png` | [ ] |
| 204 | `art/source/activity/pic-zip.png` | [ ] |
| 205 | `art/source/activity/pic-mug.png` | [ ] |
| 206 | `art/source/activity/pic-peg.png` | [ ] |
| 207 | `art/source/activity/pic-log.png` | [ ] |
| 208 | `art/source/activity/pic-ship.png` | [ ] |
| 209 | `art/source/activity/pic-shop.png` | [ ] |
| 210 | `art/source/activity/pic-chip.png` | [ ] |
| 211 | `art/source/activity/pic-fish.png` | [ ] |
| 212 | `art/source/activity/pic-ring.png` | [ ] |
| 213 | `art/source/activity/pic-rain.png` | [ ] |
| 214 | `art/source/activity/pic-boat.png` | [ ] |
| 215 | `art/source/activity/pic-frog.png` | [ ] |
| 216 | `art/source/activity/pic-flag.png` | [ ] |
| 217 | `art/source/activity/pic-bell.png` | [ ] |
| 218 | `art/source/activity/pic-sock.png` | [ ] |
| 219 | `art/source/activity/pic-duck.png` | [ ] |
| 220 | `art/source/activity/pic-knight.png` | [ ] |
| 221 | `art/source/activity/pic-night-sky.png` | [ ] |
| 222 | `art/source/activity/pic-kite.png` | [ ] |
| 223 | `art/source/activity/pic-knot.png` | [ ] |
| 224 | `art/source/activity/pic-football.png` | [ ] |
| 225 | `art/source/activity/pic-bird.png` | [ ] |
| 226 | `art/source/activity/pic-foxes.png` (optional) | [ ] |
| 227 | `art/source/activity/obj-star.png` | [ ] |
| 228 | `art/source/activity/obj-moon-rock.png` | [ ] |
| 229 | `art/source/activity/obj-rocket.png` | [ ] |
| 230 | `art/source/activity/obj-alien-egg.png` | [ ] |
| 231 | `art/source/activity/obj-planet.png` | [ ] |
| 232 | `art/source/activity/obj-comet.png` | [ ] |
| 233 | `art/source/activity/obj-alien.png` (optional) | [ ] |
| 234 | `art/source/activity/shape-cube.png` | [ ] |
| 235 | `art/source/activity/shape-cuboid.png` | [ ] |
| 236 | `art/source/activity/shape-sphere.png` | [ ] |
| 237 | `art/source/activity/shape-cylinder.png` | [ ] |
| 238 | `art/source/activity/shape-cone.png` | [ ] |
| 239 | `art/source/activity/shape-pyramid.png` | [ ] |
| 240 | `art/source/activity/demo-<conceptId>-<nn>.png` | [ ] |
