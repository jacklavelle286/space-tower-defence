Kind: background (background). A full battle scene: the moon ground a tower-defence level is played on, filling a
1920 x 1056 game screen. The game draws the route, the towers and the aliens on top of it, so the background is only
the place.

- Canvas: this kind replaces the rules' 256 x 256 root. The root is exactly <svg xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 3840 2112" width="1920" height="1056">, as in the example (STYLE.md "3840 backdrops"). Work in the
  3840 x 2112 numbers.
- Anchor: the top-left corner (0,0); the scene fills the canvas.
- Background: full-bleed and opaque. Start with one rect covering the whole canvas (x 0, y 0, 3840 x 2112) in the
  ground colour; nothing is transparent and nothing stops short of an edge. Shapes may run past the edges.
- Composition: like the example. The ground fills the canvas, seen from the game's three-quarter top-down camera, so
  anything flat on the ground is a 4:3 ellipse. Large soft swells of a slightly lighter and a slightly darker ground
  tone, a few teal patches, specks and pebbles, and craters. Keep the middle calm and open (low contrast, few small
  things): towers and aliens stand there. Put the bigger craters and busier detail towards the edges and corners. A
  thin band of night sky with a planet or a few stars may show along the top edge (at most the top 300 units), but
  the rest is ground.
- No route: no path, road, track, trail, arrows or lines leading across the scene. The game draws the route itself.
- No characters, aliens, towers, buildings or vehicles: the game adds those.
- Outline: 10 for ground features (crater rims, rocks), inner lines 6; swells, patches and specks have no outline.
  Light from the top-left: crater shade on the top-left inner wall, as in the example. Moon ground colours from the
  palette (lavender, purple, crater shade, teal, rim, path dust) unless the request asks for other ground.
- Size: at most about 40,000 characters in all, half the example: fewer, larger shapes than the example, and all the
  path d together under about 25,000 characters. Round coordinates to whole numbers, keep each path's d under about
  6,000 characters, and reuse repeated pebbles or specks with use (at most 32 uses).
- Safety: friendly, never frightening, for ages 5-7; no weapons, blood or gore; no letters, numbers or letter-like shapes.
