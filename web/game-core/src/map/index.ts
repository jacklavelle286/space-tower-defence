// Map geometry, coverage, pad order and the automatic design rules (Gate M, LD1; scope-level-designer.md §5).
export { padReach, type PadReach } from "./coverage.ts";
export { generateMap, TWISTS, type GeneratedMap, type GenerateMapOptions, type MapEdge, type Twist } from "./generate.ts";
export { COLONY_PX, routeEnds, TILE_PX, tileCentrePx, type PxPoint, type RouteEnds } from "./ends.ts";
export { headingOf, mapGeometry, routeCells, type Heading, type MapGeometry, type MapPad, type RouteCell } from "./geometry.ts";
export { DIRECTIONS, nearestProgress, padInDirection, padOrder, padsUnreachableByArrows, type Direction } from "./order.ts";
export {
  ANY_DIRECTION_ROUTES,
  bossWaveProblems,
  entersFrom,
  leavesBy,
  GRID_COLS,
  GRID_ROWS,
  hardMapProblems,
  mapProblems,
  MAX_WAYPOINTS,
  PAD_OPEN_WAVES,
  planetProblems,
  routeDesignProblems,
  PROBLEM_TEXT,
  problemMessage,
  type PlanetProblem,
  type PlanetRuleOptions,
  type ProblemRule,
  type Severity,
} from "./rules.ts";
