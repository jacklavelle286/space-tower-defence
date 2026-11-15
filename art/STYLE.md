# Moonbeam Colony — SVG drawing system

The exact house style for every hand-written SVG in `art/svg/`. It turns the pack's STYLE BIBLE
(`docs/art/chatgpt-asset-prompts.md` section 2) into SVG numbers. When this file and a card disagree on a
drawing detail, this file wins. The card wins on what to draw.

Reference drawings (copy from these, do not start from a blank file):

| What | File |
|---|---|
| Whole-game style anchor (scene) | `art/svg/reference/style-anchor.svg` |
| Astronaut construction (Nova L1 idle, 4 frames) | `art/svg/astronauts/nova-l1-idle-01.svg` … `-04.svg` |
| Alien construction (Moon Blob walk, 6 frames) | `art/svg/aliens/alien-blob-walk-01.svg` … `-06.svg` |

Check your work: `python3 tools/art/render.py --family <f>` then
`python3 tools/art/contact_sheet.py --family <f>` at `--scale 1` (real size) **and** `--scale 2`, and look at the PNG.

---

## 1. File rules

- `viewBox="0 0 W H"` with `width="W" height="H"` = the entry's `authorSize`. Nothing is drawn outside it.
- Self-contained: no `<image>`, no external files, no web fonts, no `<text>`, nothing that looks like a letter,
  number or logo.
- Real transparency only. Never paint a key colour (green, magenta, black) behind the subject, whatever the
  catalogue's `transparency` field says. Glows and dark "screens" are drawn with `opacity` / `fill-opacity`.
- One comment at the top: the asset, frame number and pose, and the anchor.
- Group parts with `<g id="...">` (section 9) so frames can be made by transforming groups.
- Gradients and filters: avoid. Flat cel colour only. (Allowed: `clipPath` to keep shade or stripes inside a shape.)

## 2. Palette

Use these hexes exactly. Each base colour has one shade (bottom-right) and one highlight (top-left).

| Role | Base | Shade | Highlight |
|---|---|---|---|
| Outline plum | `#2A1E3D` | — | — |
| Suit white | `#F4F1EA` | `#D8D2C4` (or plum at 13% opacity over stripes) | `#FFFFFF` |
| Metal grey | `#A7B0C8` | `#7F89A6` | `#C9D0E2` |
| Highlight cream | `#FFF4D6` | — | `#FFFFFF` |
| Nova orange | `#FF8A2A` | `#D9661A` | `#FFC08A` |
| Pip ice blue | `#8ED8FF` | `#5FB4E6` | `#D2F0FF` |
| Juno yellow | `#FFD23F` | `#E0AE1F` | `#FFEA99` |
| Mira green | `#3DBE6E` | `#2A9653` | `#8FE0AA` |
| Orion navy / star gold | `#2E4A9E` / `#FFD86B` | `#22377A` | `#5C78C8` |
| Sol red / gold | `#E2403A` / `#F5B700` | `#B52D28` | `#F28480` |
| Blob blue | `#5AA9F0` | `#3F86CF` | `#BFE3FF` (belly / spots `#8CC7F6`) |
| Other aliens | lime `#9BE564`, magenta `#E05FD0`, bubble cyan `#9FF3FF`, lilac `#B98AF0`, peach `#FFB38A`, rock orange `#D08A55`, shell teal `#2FA39A`, patch cream `#F7F0E0` | darken base ~15-20% | lighten base ~25-35% |
| Space | deep space `#141633`, night blue `#23295E`, nebula violet `#5B3F99` | | |
| Moon ground | lavender `#9C8FD6`, purple `#6B5CA5`, crater shade `#4A3F7A`, teal `#3FB8AF` | | rim `#B3A8E3`, path dust `#C9C0F0` |
| Effects | frost `#CFF6FF`, comet gold `#FFC94A`, shield cyan `#5BE0F0`, healing green `#7BEA8C`, glow `#FFE79A` | | |
| Skin and hair | see section 6 | | |

## 3. Outline and line widths

All outlines are plum `#2A1E3D`, `stroke-linejoin="round"` and `stroke-linecap="round"`. Set them once on the
top group (`<g stroke="#2A1E3D" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">`) and
override per part.

The owner-approved samples use a **7 px outer outline at 256 px author size** (about 3.5 px at the 128 px
display size, which is what the bible's "about 4 px once shrunk" asks for). Inner lines are ~4 px, fine details
~3 px. Scale proportionally with author size, clamped so small icons stay readable and huge art does not get
cartoonishly heavy:

| authorSize (short side) | displaySize | Outer outline | Inner lines | Fine detail (catchlight rings, spots) |
|---|---|---|---|---|
| 64 | 32 | 3.5 | 2.5 | 2 |
| 128 | 64 | 5 | 3 | 2.5 |
| 192 | 96 | 6 | 3.5 | 2.5 |
| 256 (most sprites, icons) | 128 | **7** (8 for big simple blobs) | **4** | **3** |
| 384 | 192 | 9 | 5 | 3.5 |
| 512 / 538 / 576 | 256-288 | 11 | 6 | 4 |
| 768 (bosses) | 384 | 14 | 8 | 5 |
| 1024 | 512 | 16 | 9 | 6 |
| 1536x1024 (reference scenes) | 768x512 | 10 for ground objects; characters keep their sprite outline scaled with them (x1.6-1.8 ≈ 11-13) | 5 | 4 |
| 3840 backdrops | 1920 | 10 (ground features only; distant things may drop the outline) | 6 | — |

Rule of thumb: outline ≈ authorSize ÷ 36, never below 3.5.

**Outlined bands** (sleeves, antennae, visor rim): draw the path twice, plum underneath at `W`, colour on top
at `W − 2×outline`:

```svg
<path d="M158 148 Q180 156 188 174" fill="none" stroke="#2A1E3D" stroke-width="26"/>
<path d="M158 148 Q180 156 188 174" fill="none" stroke="#F4F1EA" stroke-width="12"/>
```

## 4. Light, shade and highlight

- One light from the **top-left**. No gradients, no cast shadows (the game adds ground shadows).
- **Shade** = one darker tone on the bottom-right of each form, a crescent or strip kept inside the shape with
  a `clipPath`, no outline. Draw it after the fill, before the outline (or redraw the outline on top).
- **Highlight** = one lighter, short, round-capped stroke (or small dot) near the top-left edge, no outline.
- Glass (helmet bubble): fill `#CFE9FF` at `fill-opacity="0.6"`, a white highlight arc top-left (stroke 7,
  opacity 0.9) plus a small dot, then the outline circle on top.

```svg
<!-- shade inside a shape -->
<clipPath id="torso-clip"><path d="...same as torso..."/></clipPath>
<path clip-path="url(#torso-clip)" d="M156 132 H170 V214 H140 Q158 186 156 132 Z" fill="#2A1E3D" opacity="0.13" stroke="none"/>
<!-- highlight -->
<path d="M95 168 V152 Q95 143 103 141" fill="none" stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round"/>
```

## 5. Camera and the ground plane

- Three-quarter top-down view (~50°). Characters and aliens face three-quarter to the **viewer's right**: the face
  features sit right of the head centre, the backpack shows on the left, the "doing" hand is on the right.
  The game mirrors for left.
- **Anything flat on the ground is an ellipse exactly 4 wide : 3 tall** (`ry = rx × 0.75`): pads, rings, auras,
  shadows, dust puffs, craters, splats.

```svg
<!-- ground ring / aura / shadow, rx 80 -> ry 60 -->
<ellipse cx="128" cy="200" rx="80" ry="60" fill="#5BE0F0" opacity="0.35"/>
<!-- crater: lit rim, dark bowl with the shade on the TOP-LEFT inner wall (light from top-left) -->
<ellipse cx="0" cy="0" rx="80" ry="60" fill="#B3A8E3" stroke="#2A1E3D" stroke-width="8"/>
<clipPath id="bowl"><ellipse cx="5" cy="5" rx="58" ry="43.5"/></clipPath>
<ellipse cx="5" cy="5" rx="58" ry="43.5" fill="#4A3F7A"/>
<ellipse clip-path="url(#bowl)" cx="13" cy="13" rx="58" ry="43.5" fill="#6B5CA5"/>
<ellipse cx="5" cy="5" rx="58" ry="43.5" fill="none" stroke="#2A1E3D" stroke-width="5"/>
```

## 6. Building an astronaut (256 x 256)

About 2.5 heads tall when you count the helmet as the head; chunky toy proportions.

| Part | Construction (Nova coordinates) |
|---|---|
| Boots | two orange rounded boots, flat soles on **y = 250**, toes pointing right; darker sole strip (`#D9661A`), small highlight stroke top-left. Boots span x ≈ 93-166 so the pair is centred on x ≈ 128. |
| Legs | short white rounded rects (y 190-232) mostly hidden by the torso; class-colour knee panels (stroke 4) |
| Torso | rounded rectangle x 86-166, y 132-205 (`rx` ≈ 18). Class mark on the chest (Nova: diagonal orange band, clipped to the torso) |
| Backpack | metal-grey rounded rect behind the torso on the viewer's left |
| Arms | outlined bands (26 / 12). Back arm hangs at the side; front arm holds the class gadget at waist height on the right, pointing slightly up-right, never at the viewer |
| Mittens | class-colour circle r 10.5 plus a small thumb ellipse (stroke 4). No fingers. |
| Collar | metal-grey ellipse at the helmet base (rx 33, ry 9, stroke 6) |
| Helmet | big circle, centre (126,94), r 50: glass fill → head → visor rim → highlight → outline (7) |
| Visor rim | the class-colour tinted band along the lower glass: outlined band 16 / 9, `M83 121 Q126 152 169 121` |
| Head | face circle r 29 at (128,98), inner line 4, inside the glass; skin shade crescent clipped bottom-right |

Skin tones (base / shade / cheek blush): Nova fair `#FCE0CF` / `#F2C3AA` / `#F48A9A` at 75%. Other cast members
(cast sheet 3.1): pale with freckles `#FBE4D5` / `#EFC6AE`, light-brown `#D9A27A` / `#BC855F`, olive `#D6AE84` /
`#B88F66`, medium-brown `#A9714B` / `#8A5A3A`, dark-brown `#6E4630` / `#553424`. Hair: black `#1E1A24`, ginger
`#E07A3C`, grey `#B9B4C4`, dark brown `#3B2A24`.

Curly hair puffs are bumpy circles (7 bumps); a scalloped fringe sits over the top of the face:

```svg
<!-- puff: circle of r 11 drawn as 7 arcs -->
<path d="M110.0 76.4 A6.1 6.1 0 0 1 103.2 83.7 A6.1 6.1 0 0 1 93.2 83.0 A6.1 6.1 0 0 1 87.6 74.7 A6.1 6.1 0 0 1 90.6 65.2 A6.1 6.1 0 0 1 99.9 61.5 A6.1 6.1 0 0 1 108.5 66.5 A6.1 6.1 0 0 1 110.0 76.4 Z" fill="#1E1A24" stroke-width="4"/>
<!-- scalloped fringe -->
<path d="M99 93 Q98 68 128 67 Q158 68 157 91 Q153 83 147 85 Q142 77 134 82 Q127 75 120 82 Q111 77 99 93 Z" fill="#1E1A24" stroke-width="4"/>
```

### Astronaut face (copy, then move it with the head group)

```svg
<g id="face-features" stroke="none">
  <!-- eyes: tall plum ovals, white catchlight up-right; the far eye (right) sits 1 px higher -->
  <ellipse cx="120" cy="101" rx="4.6" ry="6" fill="#2A1E3D"/>
  <ellipse cx="142" cy="100" rx="4.6" ry="6" fill="#2A1E3D"/>
  <circle cx="121.6" cy="98.3" r="1.9" fill="#FFFFFF"/>
  <circle cx="143.6" cy="97.3" r="1.9" fill="#FFFFFF"/>
  <!-- rosy cheeks, near cheek larger -->
  <ellipse cx="111" cy="110" rx="6.5" ry="4.2" fill="#F48A9A" opacity="0.75"/>
  <ellipse cx="152" cy="109" rx="5" ry="3.8" fill="#F48A9A" opacity="0.75"/>
</g>
<!-- big open grin: white D shape + pink tongue -->
<path d="M122 109 H146 Q144 122 134 122 Q124 122 122 109 Z" fill="#FFFFFF" stroke="#2A1E3D" stroke-width="3.5"/>
<path d="M127 118 Q134 114 141 118 Q138 121.5 134 121.5 Q130 121.5 127 118 Z" fill="#F27C8C"/>
```

Other expressions: calm smile = `M124 112 Q134 120 144 111` stroke 3.5, no fill; thoughtful = shorter, flatter
curve. Never eyebrows that frown. A generic / faceless astronaut (reference scenes, locked silhouettes) swaps the
glass and head for a white shell and an opaque class-colour visor with two cream reflection strokes (see the
style anchor).

## 7. Building an alien (256 x 256)

- A simple chunky body shape (dome, ball, disc, shell), flat or round bottom touching **y = 250**, outline 8 for
  big simple shapes.
- Shade crescent bottom-right (clipped), lighter belly ellipse low on the body, highlight arc top-left plus a dot.
- Face shifted a little right of centre (three-quarter turn). Eyes big, never narrowed or angry.
- Antennae/limbs: short, round-ended, outlined; stalk stroke 7, bobble r 11 with stroke 6 and a white dot.

### Alien eyes and grin (copy)

```svg
<g id="eyes">
  <ellipse cx="112" cy="174" rx="17" ry="20" fill="#FFFFFF" stroke="#2A1E3D" stroke-width="5"/>
  <ellipse cx="158" cy="173" rx="16" ry="19" fill="#FFFFFF" stroke="#2A1E3D" stroke-width="5"/>
  <!-- pupils look to the right / down-right, big catchlight top-right -->
  <circle cx="117" cy="178" r="9" fill="#2A1E3D"/>
  <circle cx="163" cy="177" r="8.5" fill="#2A1E3D"/>
  <circle cx="120" cy="174" r="3.5" fill="#FFFFFF"/>
  <circle cx="166" cy="173" r="3.3" fill="#FFFFFF"/>
</g>
<!-- cheeky lopsided grin: curve + a little tick at the high end -->
<g id="mouth" fill="none" stroke="#2A1E3D" stroke-width="6" stroke-linecap="round">
  <path d="M116 207 Q138 223 162 203"/>
  <path d="M156 201 L166 199" stroke-width="5"/>
</g>
```

Scale the eyes with the body (tiny aliens: one big eye or two eyes with r ≈ 0.18 × body width). No teeth, fangs,
claws, drips or angry brows.

## 8. The star-burst "pop"

Defeated aliens pop into stars. Build: a white/cream puff circle in the centre, 5-8 rounded five-point stars in
palette colours around it, plus 2-4 dots. Stars are outlined (plum, inner-line width) with `stroke-linejoin="round"`
so the points are soft.

```svg
<!-- one star, outer r 20 / inner r 9, centred on 0,0: place with transform -->
<path id="star" d="M0.0 -20.0 L5.3 -7.3 L19.0 -6.2 L8.6 2.8 L11.8 16.2 L0.0 9.0 L-11.8 16.2 L-8.6 2.8 L-19.0 -6.2 L-5.3 -7.3 Z"
      fill="#FFD23F" stroke="#2A1E3D" stroke-width="4" stroke-linejoin="round"/>

<g id="pop" transform="translate(128 128)">
  <circle r="30" fill="#FFF4D6" stroke="#2A1E3D" stroke-width="4"/>
  <g stroke="#2A1E3D" stroke-width="4" stroke-linejoin="round">
    <path d="M0 -20 L5.3 -7.3 L19 -6.2 L8.6 2.8 L11.8 16.2 L0 9 L-11.8 16.2 L-8.6 2.8 L-19 -6.2 L-5.3 -7.3 Z" fill="#FFD23F" transform="translate(0 -62) rotate(-8)"/>
    <path d="M0 -20 L5.3 -7.3 L19 -6.2 L8.6 2.8 L11.8 16.2 L0 9 L-11.8 16.2 L-8.6 2.8 L-19 -6.2 L-5.3 -7.3 Z" fill="#9FF3FF" transform="translate(58 -20) rotate(12) scale(0.8)"/>
    <path d="M0 -20 L5.3 -7.3 L19 -6.2 L8.6 2.8 L11.8 16.2 L0 9 L-11.8 16.2 L-8.6 2.8 L-19 -6.2 L-5.3 -7.3 Z" fill="#E05FD0" transform="translate(38 50) rotate(-14) scale(0.9)"/>
    <path d="M0 -20 L5.3 -7.3 L19 -6.2 L8.6 2.8 L11.8 16.2 L0 9 L-11.8 16.2 L-8.6 2.8 L-19 -6.2 L-5.3 -7.3 Z" fill="#9BE564" transform="translate(-42 46) rotate(10) scale(0.85)"/>
    <path d="M0 -20 L5.3 -7.3 L19 -6.2 L8.6 2.8 L11.8 16.2 L0 9 L-11.8 16.2 L-8.6 2.8 L-19 -6.2 L-5.3 -7.3 Z" fill="#FF8A2A" transform="translate(-60 -14) rotate(-18) scale(0.75)"/>
  </g>
  <circle cx="30" cy="-52" r="5" fill="#FFF4D6"/><circle cx="-34" cy="-44" r="4" fill="#FFF4D6"/>
</g>
```

Sparkle (4-point, for stars in the sky, glints, magic): `M0 -r Q k -k r 0 Q k k 0 r Q -k k -r 0 Q -k -k 0 -r Z`
with `k = 0.28r`, fill cream or bubble cyan, no outline.

Effect burst frames (guide 3.2): 01 tiny spark (scale ~0.2) → full size at the middle frame → last frames: stars
drift outward (+10-20% radius), shrink and fade (`opacity` 1 → 0.2), the centre puff goes first; the last frame is
nearly empty.

## 9. Group names (use these ids)

`<g id="<subject>">` on the top group, then as relevant:

- Astronauts: `body-back` (backpack, legs), `backpack`, `legs`, `boots`, `body`, `arm-back`, `mitten-back`, `torso`,
  `chevron`/`emblem`, `collar`, `arm-front`, `gadget` (`lens`, `lens-glow`), `mitten-front`, `helmet` (`glass`,
  `head`, `hair-puffs`, `face`, `fringe`, `face-features`, `mouth`, `visor-rim`, `helmet-highlight`, `helmet-outline`).
- Aliens: `body` (`dome`/shape, `*-shade`, `belly`, `*-highlight`, spots, `*-outline`), `antennae`
  (`antenna-back`, `antenna-front`), `limbs`, `face` (`eyes`, `mouth`), `wings`.
- Effects: `burst`, `ring`, `glow`, `stars`.

Draw order: things behind (backpack, back limbs) → legs → boots → torso and its marks → front arm and gadget →
helmet/head. The `boots` group (or the alien's base) is the only thing that never moves.

## 10. Anchor, size and padding

- Standing sprites (anchor `[0.5, 1.0]`): soles / flat base on **y = H − 6** (250 at 256), outline reaching
  ~H − 2. Feet pair centred on x = W/2. Body may extend right for the gadget; keep ≥ 10 px padding on the sides.
- The subject fills about **80% of the canvas height** (Nova: y 40-254), leaving top headroom for bobs and
  stretches. Aliens: ~70-75% (they are wide, not tall).
- Centred sprites (anchor `[0.5, 0.5]`: icons, effects, badges): centred, ~80% of the canvas, even padding.
- Flyers keep the bottom-centre anchor: draw the body high, leave the lower part empty for the game's shadow.
- Never crop. Check every frame's extreme pose stays inside the canvas.

## 11. Animation

Every frame is its own SVG: copy frame 01 and change only transforms (and the odd opacity / radius). Same
character, same size, anchor fixed. Pivot = the anchor (bottom-centre) unless a part rotates about its own joint.
Keep it subtle at 256 px: 2-5 px moves, 2-8% squash, 4-10° tilts. Loops must return smoothly to frame 01.

```svg
<!-- squash about the boot tops (x 129, y 228): knees bend, boots stay -->
<g id="body" transform="translate(129 228) scale(1.015 0.972) translate(-129 -228)"> ... </g>
<!-- alien lean + squash about the base (x 128, y 250); negative skewX leans the top to the right -->
<g id="blob" transform="translate(128 250) skewX(-8) scale(1 1.04) translate(-128 -250)"> ... </g>
<!-- part about its own root: antenna follow-through -->
<g id="antenna-front" transform="rotate(-8 158 130)"> ... </g>
```

| Animation | Frames | What moves (256 px) |
|---|---|---|
| Idle (astronauts) | 4 | 01 neutral · 02 `body-back`+`body` squash scaleY 0.972, scaleX 1.015 about the boot tops (~5 px lower) · 03 neutral, `lens-glow` grows (r 12 → 15, opacity 0.6 → 0.8) · 04 rise scaleY 1.012 (~2 px up), `head` translate(3 −1) to look along the path |
| Attack (4) | 4 | 01 `arm-front` rotate −10° about the shoulder (wind-up) · 02 `lens-glow` big (r 22) + cream beam stub · 03 whole body small bounce (−3 px), glow fading · 04 back to frame 01 pose |
| Attack (6) | 6 | ready · lift (part rotate 8-12°) · knees bend (scaleY 0.97) · launch glow/puff · bounce −3 px · recover |
| Emit / Pulse | 4 | emitter or beacon raised by rotation about the hand/shoulder; glow circle opacity 0.2 → 0.6 → 0.9 → 0.4 |
| Walk (aliens) | 6 | about the base: 01 skewX −8, scale(1, 1.04) · 02 scale(1.08, 0.91) · 03 skewX −3 neutral · 04 scale(0.95, 1.07) · 05 skewX −7, scale(1.03, 1.01) · 06 scale(1.02, 0.97). Antennae rotate opposite (±4-9°, lagging); `face` drifts 1-2 px with the squash |
| Bob / hop | 4 | low scale(1.08, 0.92) · rising translate(0 −6) scale(0.97, 1.04) · top translate(0 −12) scale(0.94, 1.07) · falling translate(0 −6) |
| Fly / hover | 6 | body translate y 0, −3, −5, −3, 0, +2; wings rotate ±15° about the wing root |
| Effect burst | 6-8 | see section 8 |

## 12. Do / Don't

Do
- Big simple shapes; check at `--scale 1` that you can tell what it is from the silhouette alone.
- Use the class's unique silhouette part (cast sheet 3.1): Nova torch gadget + chest band, Pip twin canisters,
  Juno upward funnel + goggles, Orion long telescope, Mira chest shield, Sol tall antenna.
- Keep the same outline width across one family; redraw an outline on top after clipped shading.
- Round every corner and line end. Hands are mittens.
- Make frames differ visibly but subtly; anchor fixed.

Don't
- Text, numbers, letter-like marks, logos, flags.
- Anything gun-like held at shoulder or pointed at the viewer; sharp teeth, claws, angry brows, drips, skulls, fire.
- Gradients, blur filters, textures, hairline (< 2 px) details, more than one shade per colour area.
- Key-colour backgrounds or ground under the sprite (no cast shadows; the game adds them).
- Resemblance to known characters (e.g. no teardrop slime with a pointed tip).
- Rely on red vs green alone to tell things apart.
