// Make the whole level for me (Gate M, LD18; owner 2026-11-18): one number makes a map (LD14), the 50 campaign waves
// (LD15, tuned with the test player when asked) and the challenges (game-core makeChallenge), each from the same
// number, so the same number and choices make the same level. Everything else is a sensible default drawn from the
// number: how much the route turns (gentle to twisty), 13 to 15 pads, 6 to 10 Moon decorations.
//
// A level with the campaign becomes the planet's campaign map when it is published (the Make the waves panel says the
// same). A level without it still gets waves made and tuned on its own map, but only as its challenges' own waves.
import { generateMap, generateWaves, planChallenges, TWISTS, type MarginPreset, type Twist } from "@scd/game-core";
import { DECORATIONS } from "@scd/shared/map";
import type { LevelFile, LevelWave } from "../../api";
import type { CurveWorker } from "../curves/measure";
import { tuneWaves, type TuneRun } from "../curves/tune";
import { campaignCard, currentRuleset, newLevel, padId, routeTiles } from "../levelFile";
import { makeLevelChallenges, type ChallengeRun, type ChallengeWorker } from "./challenges";

export interface WholeLevelOptions {
  readonly levelId: string;
  readonly name: string;
  readonly seed: number;
  /** Give the level the 50 campaign waves (this map becomes the planet's campaign map when published). */
  readonly ownsCampaign: boolean;
  /** 0 to 4. */
  readonly challenges: number;
  readonly preset: MarginPreset;
  readonly tune: boolean;
}

export interface WholeLevelResult {
  readonly level: LevelFile;
  /** What was made, one sentence each, for the editor's first message. */
  readonly notes: readonly string[];
}

export interface WholeLevelRun {
  readonly done: Promise<WholeLevelResult>;
  cancel(): void;
}

export interface WholeLevelWorkers {
  readonly curve?: () => CurveWorker;
  readonly challenge?: () => ChallengeWorker;
}

const MAP_TRIES = 10;

/** The map's choices, drawn from the number: the same number, the same map. */
export function mapChoices(seed: number): { twist: Twist; pads: number; decorationCount: number } {
  const twists = Object.keys(TWISTS) as Twist[];
  return { twist: twists[seed % twists.length] as Twist, pads: 13 + (Math.floor(seed / 7) % 3), decorationCount: 6 + (Math.floor(seed / 3) % 5) };
}

/** The level with a generated map (the next numbers are tried when one makes no map), or why there is none. */
function withMap(options: WholeLevelOptions): { level: LevelFile; mapSeed: number } | { reason: string } {
  const start = newLevel(options.levelId, options.name, "blank");
  for (let k = 0; k < MAP_TRIES; k += 1) {
    const mapSeed = options.seed + k;
    const result = generateMap({ seed: mapSeed, from: "any", to: "any", decorations: Object.keys(DECORATIONS), ...mapChoices(mapSeed) });
    if ("reason" in result) continue;
    const { route, pads, decorations } = result.map;
    const level: LevelFile = {
      ...start,
      map: {
        ...start.map,
        route: route.map(([x, y]): [number, number] => [x, y]),
        pads: pads.map((p, i) => ({ ...p, id: padId(options.levelId, i + 1) })), // already in route order
        art: { ...start.map.art, decorations: decorations.map((d) => ({ ...d })) },
      },
    };
    return { level, mapSeed };
  }
  return { reason: "No map could be made from that number. Try another." };
}

/**
 * Makes the level. `onProgress` hears a line for each step. Cancelling stops the tuning or the challenges and rejects
 * `done` with "cancelled".
 */
export function makeWholeLevel(options: WholeLevelOptions, onProgress: (text: string) => void, workers: WholeLevelWorkers = {}): WholeLevelRun {
  let tuning: TuneRun | null = null;
  let challenging: ChallengeRun | null = null;
  let cancelled = false;
  const stop = (): void => {
    if (cancelled) throw new Error("cancelled");
  };

  const done = (async (): Promise<WholeLevelResult> => {
    onProgress("Making the map…");
    const mapped = withMap(options);
    if ("reason" in mapped) throw new Error(mapped.reason);
    const notes = [`Map ${mapped.mapSeed}: ${mapped.level.map.pads.length} pads, ${mapped.level.map.art.decorations.length} decorations.`];

    onProgress("Making the 50 waves…");
    const made = generateWaves({ seed: options.seed, ruleset: currentRuleset(), routeTiles: routeTiles(mapped.level), preset: options.preset });
    if ("reason" in made) throw new Error(made.reason);
    let campaign: LevelFile = {
      ...mapped.level,
      waves: made.waves as unknown as LevelWave[],
      waveSets: { campaign: campaignCard(options.levelId) },
      design: { keyframes: [], overrides: [] },
    };
    if (options.tune) {
      tuning = tuneWaves(campaign, options.preset, (p) => onProgress(`Tuning the waves with the test player, pass ${p.pass}: ${p.measured} of ${p.total} measured…`), workers.curve);
      const tuned = await tuning.done;
      tuning = null;
      stop();
      campaign = { ...campaign, waves: tuned.waves };
      notes.push(`Waves ${options.seed}, tuned: ${tuned.waves.length - tuned.off.length} of ${tuned.waves.length} are within 15 % of the difficulty target.`);
    } else notes.push(`Waves ${options.seed}, health from the toughness curve (not tuned).`);
    stop();

    let challenges = { waveSets: {} as LevelFile["waveSets"], challengeWaves: {} as LevelFile["challengeWaves"], notes: [] as string[] };
    const plans = planChallenges(options.seed, options.challenges, { bosses: options.ownsCampaign });
    if (plans.length > 0) {
      onProgress(`Making ${plans.length} challenge${plans.length === 1 ? "" : "s"} with the test player…`);
      challenging = makeLevelChallenges(campaign, plans, { seed: options.seed, ownsCampaign: options.ownsCampaign }, (n, total) => onProgress(`Making the challenges with the test player: ${n} of ${total} done…`), workers.challenge);
      const result = await challenging.done;
      challenging = null;
      stop();
      challenges = {
        waveSets: result.waveSets as unknown as LevelFile["waveSets"],
        challengeWaves: result.challengeWaves as unknown as LevelFile["challengeWaves"],
        notes: result.notes,
      };
      const names = Object.values(challenges.waveSets).map((s) => s.name);
      if (names.length > 0) notes.push(`Challenges: ${names.join(", ")}.`);
      notes.push(...challenges.notes);
    }

    const level: LevelFile = options.ownsCampaign
      ? { ...campaign, waveSets: { ...campaign.waveSets, ...challenges.waveSets }, challengeWaves: challenges.challengeWaves }
      : { ...mapped.level, waveSets: challenges.waveSets, challengeWaves: challenges.challengeWaves };
    return { level, notes };
  })();

  return {
    done,
    cancel: () => {
      cancelled = true;
      tuning?.cancel();
      challenging?.cancel();
    },
  };
}
