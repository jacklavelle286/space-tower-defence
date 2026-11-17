// Playing the combat sounds (D10.10; Phase 66). One AudioContext, made on the first key or tap (browsers allow sound
// only after a gesture). Volume and mute live on this device only (localStorage; D10.10 [PROPOSAL]): a sound setting
// is not progress, so it is not saved to the account. A sound played again within its own length is dropped, so 16
// astronauts firing at once never become a din.
import { lengthOf, RECIPES, type SoundId, type Voice } from "./recipes";

const KEY = "scd-sound";

export interface SoundSettings {
  /** 0..1 */
  readonly volume: number;
  readonly muted: boolean;
}

export const DEFAULT_SOUND: SoundSettings = { volume: 0.6, muted: false };

export function loadSettings(storage: Pick<Storage, "getItem"> | null = safeStorage()): SoundSettings {
  try {
    const raw = storage?.getItem(KEY);
    if (raw == null) return DEFAULT_SOUND;
    const v = JSON.parse(raw) as Partial<SoundSettings>;
    const volume = typeof v.volume === "number" && v.volume >= 0 && v.volume <= 1 ? v.volume : DEFAULT_SOUND.volume;
    return { volume, muted: v.muted === true };
  } catch {
    return DEFAULT_SOUND;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** The part of AudioContext this uses (tests pass a fake). */
export type AudioLike = Pick<AudioContext, "currentTime" | "destination" | "createOscillator" | "createGain" | "createBuffer" | "createBufferSource" | "createBiquadFilter" | "sampleRate" | "state" | "resume">;

export class SoundBoard {
  #settings: SoundSettings;
  #context: AudioLike | null = null;
  #noise: AudioBuffer | null = null;
  readonly #lastPlayed = new Map<SoundId, number>();
  readonly #make: () => AudioLike | null;
  readonly #listeners = new Set<(s: SoundSettings) => void>();

  constructor(make: () => AudioLike | null = browserContext, settings: SoundSettings = loadSettings()) {
    this.#make = make;
    this.#settings = settings;
  }

  get settings(): SoundSettings {
    return this.#settings;
  }

  /** Call from a key or pointer handler: the first call makes the context (and resumes a suspended one). */
  unlock(): void {
    if (this.#context === null) this.#context = this.#make();
    if (this.#context?.state === "suspended") void this.#context.resume();
  }

  set(settings: SoundSettings): void {
    this.#settings = settings;
    try {
      safeStorage()?.setItem(KEY, JSON.stringify(settings));
    } catch {
      // private window or storage off: the setting lasts for this page
    }
    for (const l of this.#listeners) l(settings);
  }

  onChange(listener: (s: SoundSettings) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Play a sound now; true when it was played (not muted, unlocked, not already sounding). */
  play(id: SoundId): boolean {
    const ctx = this.#context;
    if (ctx === null || this.#settings.muted || this.#settings.volume <= 0) return false;
    const now = ctx.currentTime;
    const last = this.#lastPlayed.get(id);
    if (last !== undefined && now - last < lengthOf(id)) return false;
    this.#lastPlayed.set(id, now);
    for (const v of RECIPES[id]) this.#voice(ctx, v, now);
    return true;
  }

  #voice(ctx: AudioLike, v: Voice, now: number): void {
    const start = now + v.at;
    const end = start + v.dur;
    const gain = ctx.createGain();
    const peak = v.gain * this.#settings.volume;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), start + Math.min(0.015, v.dur / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    gain.connect(ctx.destination);
    if (v.wave === "noise") {
      const source = ctx.createBufferSource();
      source.buffer = this.#noiseBuffer(ctx);
      const band = ctx.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.setValueAtTime(v.from, start);
      band.frequency.exponentialRampToValueAtTime(v.to, end);
      source.connect(band);
      band.connect(gain);
      source.start(start);
      source.stop(end);
      return;
    }
    const osc = ctx.createOscillator();
    osc.type = v.wave;
    osc.frequency.setValueAtTime(v.from, start);
    osc.frequency.exponentialRampToValueAtTime(v.to, end);
    osc.connect(gain);
    osc.start(start);
    osc.stop(end);
  }

  #noiseBuffer(ctx: AudioLike): AudioBuffer {
    if (this.#noise !== null) return this.#noise;
    const length = Math.floor(ctx.sampleRate * 1);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // A fixed pseudo-random fill: the same hiss every time (and no Math.random in the game).
    let s = 0x2f6b9a1d;
    for (let i = 0; i < length; i += 1) {
      s = (s * 1664525 + 1013904223) >>> 0;
      data[i] = s / 0x80000000 - 1;
    }
    this.#noise = buffer;
    return buffer;
  }
}

function browserContext(): AudioLike | null {
  const Ctor = typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  return Ctor === undefined ? null : new Ctor();
}

/** The page's one board (the battlefield, the learning panel and Settings share it). */
export const sounds = new SoundBoard();
