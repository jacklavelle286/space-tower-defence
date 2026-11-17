# LD11: routes in any direction (Gate M)

Phase LD11 ([build-phases.md](../build-phases.md#phase-ld11--routes-in-any-direction);
[scope-level-designer.md §3.3](../plan/scope-level-designer.md#33-tier-3-flexible-routes-and-advanced-authoring)).
Date: 2026-11-17. **Owner review of the art: pending.**

The phase ships in two steps, because a player page loaded before the art release could not draw such a map:

1. **Art and renderer** (done, in this release): eleven route tiles, route pieces chosen by direction, the portal,
   colony and leak puff placed for any edge (game-core `routeEnds`, which the footprint rule uses too), the editor's
   route tool and the parser's tier 3 rules written but off (`ANY_DIRECTION_ROUTES = false` in
   `web/game-core/src/map/rules.ts`).
2. **The switch** (after the owner has released step 1): one commit sets `ANY_DIRECTION_ROUTES = true`. Then the
   editor's route tool stops greying out left turns and other edges, and the publisher accepts such maps.

## The art

[ld11/route-tiles.png](ld11/route-tiles.png): every route tile, the eleven new ones among the nine before. Drawn, not
mirrored: the track bands are the existing tiles' (they have no light side); the arrows' highlight, the doorstep's
shade and highlight and the gate line's glint are drawn for each tile with the light from the top-left
(art/STYLE.md §4). Sources in `art/svg/map/`, catalogued in `docs/art/asset-catalogue.json`.

## The checks

| Check | Result |
|---|---|
| Layout tests for all twelve tile cases (4 straights, 8 corners) and the eight caps | Pass (`web/player/src/game/layout.test.ts`) |
| Screenshots of four fixture maps, one per entry edge | [ld11/four-maps.png](ld11/four-maps.png): from the left (top left), top (top right), right (bottom left), bottom (bottom right). Taken in Chrome from `web/player/routes-preview.html`, the real battlefield |
| Moonbeam pixel-identical | 0 pixels differ between Moonbeam drawn by the previous BattleScene and by this one (same preview page, ImageMagick `compare -metric AE`) |
| Manifests published before LD11 still parse | Pass: the new tiles are optional art set roles (shared contract fixtures, both parsers) |
| STYLE review | Owner, below |

What the screenshots show [Claude's reading; the owner judges]: each portal sits on its own edge with the fan opening
from it; each colony sits over the route's last stretch, kept inside the canvas; on a route ending at the top or
the left the colony stands beside the gate rather than over it, as the turned layout puts it
[ASSUMPTION: acceptable; a colony drawn for each side would be new art].

## Owner review

- [ ] The eleven tiles match the set (light, outline, arrows), or say which to redraw
- [ ] The portal and colony placement on the four maps reads clearly for ages 5-7

Notes:
