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
