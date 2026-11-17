# Phase 68: keyboard and accessibility pass

Date: 2026-11-17. [build-phases.md Phase 68](../build-phases.md#phase-68--keyboard-and-accessibility-pass).

## Run it

```sh
cd web/player && npx playwright test -c playwright.local.config.ts
```

It starts the player and admin development servers (fake sign-in, in-memory API; no account, no AWS) and uses the
installed Chrome. Not part of `npm test` or CI yet [PROPOSAL: add to CI once it has run green a few times].

## What it proves

| Journey or scan | Result (2026-11-17) |
|---|---|
| **Keyboard only**, a new player (`e2e/local/keyboard.spec.ts`): name, picture and birthday by keys; Home → New game; N chooses Nova and goes to the first empty pad, Enter places, R starts; the new-alien card has the focus and Enter goes on; F for 2x; in the learning panel Tab never leaves it (12 presses), Play, a choice by its number, Tab to Check, Enter; Continue has the focus; wave 2; the end screen's Home has the focus; My progress and Settings by Tab and Enter | Pass |
| **axe** (WCAG 2.0/2.1 A and AA; serious and critical fail) on the player's profile setup, Home, battlefield, new-alien card, learning panel, end screen, My progress and Settings | Pass, after one fix: the meteor power buttons' names now hold their visible "1 · 0" (label-content-name-mismatch, WCAG 2.5.3) |
| **axe** on the admin's level editor (every tab), Levels → Aliens and the activity editor (`e2e/local/admin.spec.ts`, through the development pages) | Pass |

## Changes in this phase

- Tab stays inside every open dialog (learning panel, meteor offer, completion offer, new-alien card, takeover,
  sign-out, reset, end game); the battlefield's own dialogs and the admin's native `<dialog>`s already did.
- A keys line under each learning answer area (`COPY.keys` [PROPOSAL]).
- A pad holding an astronaut shows its focus as a ring round its base, not over the astronaut (owner report).
- The meteor power buttons' accessible names (above).
- The player dev server serves `/game-data/asset-manifest/` too, so development runs draw through the manifest.

## Not covered here

- Admin screens behind sign-in (pictures, speech, activities list, versions, planets) are not scanned: the development
  pages cover the editors. [PROPOSAL: a dev shell for the admin app with the fake API, then scan every route.]
- Keyboard-only play of the other learning types (picture select, number track and grid, share, sort, arrange,
  typed): their keys have unit tests (`web/shared/src/learning/*Types.test.tsx`); the journey answers one choice.
- Screen reader listening (NVDA, VoiceOver): by hand, owner.
