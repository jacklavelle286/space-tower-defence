# Speech latency (first measurement, M1)

Procedure: [I §I.2.9](../../plan/I-validation.md#i29-manual-and-operational-tests) "Speech latency". On the deployed speech
path (`https://aliens.jackgl.com`), 10 presses per browser, on the laptop the children use. Any target written from these
numbers is a **measured engineering goal, not a service guarantee** [PROPOSAL].

Status: **template, not yet measured**. Every number below is **[UNVERIFIED]** until the owner records it.

## The three cases

| Case | What is timed | When it happens |
|---|---|---|
| (a) time-to-audio, not stored | Play press → audio starts, when the clip is **not** in the browser yet (request, download, length/type/sha256 check, store, play) | Rare in M1: the run screen fetches the clip when the run opens, so Play normally finds it stored |
| (b) cached replay | Play press → audio starts, when the clip **is** stored (plays at once from local bytes) | Every normal press |
| (c) concurrent `POST /api/speech` | round trip of the request sent with each press in (b), which the child does not wait for (AC-19) | Every online press |

## How to measure

**(b) and (c), automated.** With the passwords in your shell ([e2e README](../../../web/player/e2e/deployed/README.md)):

```sh
cd web/player
E2E_BROWSER=chrome E2E_EXTRA_PLAY_PRESSES=9 npx playwright test e2e/deployed/journey.spec.ts
```

The journey prints one line per press: `press N: audio <b> ms, POST /api/speech 200 in <c> ms` (press → the audio
element's `playing` event, and Playwright's request timing). The first 10 lines are the 10 presses; the press after the
refresh is an eleventh, also case (b) after a reload.

**(a), by hand** [UNVERIFIED method: check it works the first time]: open the run at the learning panel, then DevTools →
Application → IndexedDB → `scd-<sub>` → `audio` → delete the entry, and reload the page (the panel comes back and fetches
again). Use DevTools → Performance, record, press Play, stop when you hear it; read the time from the click to the first
audio. Repeat 10 times. If the reload's prefetch stores the clip before you can press Play, block the audio host in
DevTools → Network → request blocking during the reload, unblock, then press Play, and note that you did.

**Safari** (no Playwright): DevTools → Network, timeline: press Play 10 times; record the `POST /api/speech` time (c) and
whether audio started at once (b, by ear: "at once" / "noticeable wait").

## Results

| Date | Release ID | Laptop | Browser and version | Case | Presses | Median (ms) | Worst of 10 (ms) | Notes |
|---|---|---|---|---|---|---|---|---|
| | | | | (a) | 10 | | | |
| | | | | (b) | 10 | | | |
| | | | | (c) | 10 | | | |

## Target (to write after the first measurement)

Not set. After the rows above exist, write the target here and in [C §C14](../../plan/C-game-and-learning-design.md),
labelled "measured engineering goal, not a service guarantee". M6 re-measures (Phase 67).
