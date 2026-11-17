# Phase 66: the new-alien card (owner ask, 2026-11-17)

When an alien type comes onto the route for the first time in a run, the battle waits and a card shows its picture,
its name and what it does; **Got it!** (it has the focus: Enter or Space, or a click) goes on. Bosses get a card too.
"For the first time in a run" is worked out from the wave set: the types the earlier waves schedule and what those
aliens release, so a run resumed later announces only what is new to it, with nothing stored. Auto-play (the local
slice's `?auto=`, the admin preview's Watch) reads on by itself.

[phase-66/new-alien-card.png](phase-66/new-alien-card.png): the Bubble Guard's card in the local slice.

**Words** [PROPOSAL; for ages 5 to 7, owner to approve like other child-facing copy] (`COPY.newAlien`,
`web/player/src/copy/en-GB.ts`): one line per trait (C6.1).

| Alien | Line |
|---|---|
| Moon Blob | It walks to the colony. |
| Meteor Mite | It is very quick. |
| Shellback | Its hard shell stops small zaps. Big zaps work best. |
| Bubble Swarm | Lots of them come together. |
| Orbit Flutter | It flies over the path. |
| Bubble Guard | It hides inside bubbles. Pop them all! |
| Patchling | It makes its friends better. Zap it first! |
| Split Slime, Alien Craft | Pop it and little ones come out. |
| Every boss | It is big and strong. It changes when it gets hurt. |
| A made alien (AM1) | by its speed: quick, slow but tough, or "It walks to the colony." |

**Not done: reading it aloud.** Speech today is a clip signed for one activity slot of one run (R13); a card needs
approved clips that belong to no slot. Proposed follow-up: speech definitions `ui-alien-<type>` approved in the admin's
Speech page like any other, and a player route that returns the signed URL of an approved UI clip; the card then gets
the Play button the learning panel has. Owner to decide whether it is wanted before launch.

Tests: `GameBridge.test.ts` (the battle waits on the card, once per type, nothing for a resumed run's earlier types),
`NewAlienCard.test.ts` (the line for every alien and boss of r4); Chrome on the local slice (the card, its focus,
Enter goes on).

# Phase 66: combat sounds, app icons, font

**Sounds (D10.10).** The 25 sounds are made in the browser from recipes (`web/player/src/sound/recipes.ts`: a few
tones and a little filtered noise each, every one under a second), not recorded files: nothing to license or
download, and their loudness balanced in one table [PROPOSAL: the owner judges them by ear and may ask for recorded
ones instead]. They play for placing, upgrading and sending home; each class's attack (Mira's on her shield pulse;
Sol never fires, so his has no moment yet); an armour clonk, a bubble pop, the star pop and a leak; wave start and
clear; a boss arriving and changing phase; the three powers; and in the learning panel a chime and the reward for a
right answer and a soft "not quite" otherwise; the badge when the campaign completes. A sound played again within
its own length is dropped, so 16 astronauts firing never make a din. Settings → Sound: on or off and a volume, kept
on this computer only (they are not progress); the spoken words in activities are not changed. Sound starts after
the first key or tap (browser rules). Checked: unit tests (`sound.test.ts`); a local battle with powers plays them
with no page error. **Not checked: how they sound (owner, by ear).**

**App icons.** `app-icon-512.png`, `app-icon-192.png` and `apple-touch-icon.png` (180 px): the on-dark logo on the
game's night blue, made by `tools/art/app_icons.py`; the player page names them. The admin site's tab now shows the
logo too.

**Font.** Unkempt, chosen by the owner on 2026-11-15 and self-hosted (`web/player/src/global.css`): nothing to do.

**Still open in Phase 66:** D10.9's remaining age 6-7 noun pictures and the demonstration card art (they come with
content, through the picture library); reading the new-alien card aloud (above).
