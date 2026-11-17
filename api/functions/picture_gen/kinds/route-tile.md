Kind: route tile (route-tile). One square piece of the path the aliens walk along on a battle map (Gate M, LD8): the
game lays pieces edge to edge, so a new planet's route can look different from the moon's. The request says which
piece: a straight piece (left to right, or top to bottom), a corner (which two edges it joins), the start piece (the
portal end) or the last piece (the colony end).

- Canvas: this kind replaces the rules' 256 x 256 root. The root is exactly <svg xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 192 192" width="192" height="192">, as in the examples. One tile is 192 x 192.
- Anchor: the centre (96,96).
- The pieces must join. Every open edge is exactly the examples' edge: a track centred on the edge's midpoint (y 96
  on the left and right edges, x 96 on the top and bottom edges), built from layered strokes of the examples' widths
  (164 glow, 146 outline, 134 border, 124 light border, 112 inner line, 106 dust), running straight out to the edge
  and cut square there (stroke-linecap butt). A corner turns with a centre-line radius of 96, as in the example. The
  colours may change with the request (other ground, other dust), but the widths and the edges never do.
- One arrow in the middle of the track pointing the way the aliens walk, as in the examples. Nothing else on the
  track but a few specks.
- Background: transparent outside the track. No ground fill, no shadow, nothing past the track's glow.
- Outline: as the examples (the outline stroke is the track's edge). Light from the top-left.
- Safety: friendly, never frightening, for ages 5-7; no weapons, blood or gore; no letters, numbers or letter-like shapes.
