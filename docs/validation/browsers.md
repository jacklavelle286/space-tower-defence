# Browser check: one clip per browser (M1)

Procedure: [I §I.2.9](../plan/I-validation.md#i29-manual-and-operational-tests) "Browser matrix", M1 part: one clip per
browser the family actually uses. Safari's `play()` after an await is checked first
([E §E.9](../plan/E-architecture.md#e9-audio-caching-and-playback), [ADR-0015](../decisions/0015-browser-audio-storage.md)).
The full matrix is M6.

Status: **template, not yet run**. Which browsers is **[UNVERIFIED]** until the owner lists the family's laptops (fill the
first table first).

## The family's laptops

| Laptop (no owner names: "laptop 1") | Operating system and version | Browsers used by the children | Main one? |
|---|---|---|---|
| laptop 1 | | | |
| laptop 2 | | | |

## What one check is

On `https://aliens.jackgl.com`, signed in as `test-player-1` (never a child's account):

1. New game, place Novas, Ready!, clear wave 1; the learning panel opens.
2. Press **Play** once: the /sh/ clip is heard. The button shows Stop while it plays and goes back to Play again.
3. Press Play again: it starts at once (stored bytes).
4. Reload the page at the panel and press Play: it still plays at once (the clip survived the reload: IndexedDB).
5. In a private window, steps 1–3 again (IndexedDB may be refused there: the memory store must still play).

Automated where Playwright drives the browser:

```sh
cd web/player
E2E_BROWSER=chrome npx playwright test e2e/deployed/journey.spec.ts   # or msedge; firefox and webkit after npx playwright install
```

The journey passes only if audio actually started (`playing` event) from a `blob:` URL and every `POST /api/speech`
answered 200, with zero `speechSynthesis` calls. Playwright's WebKit is not Safari: check Safari by hand (steps 1–5).

## Results

| Date | Release ID | Laptop | Browser and version | How (Playwright / by hand) | Heard /sh/ | Replay at once | After reload at once | Private window plays | Problems (e.g. `NotAllowedError`, had to press twice) |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |
