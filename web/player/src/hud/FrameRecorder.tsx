// The frame-time recorder (Phase 34, C14 / I.3 AC-42; /play/local?perf=1): times every rendered frame while a wave is
// running (not paused, not aiming), and when the wave ends shows the frame rates for that wave with a Copy button that
// puts the record (figures, device details, scenario) on the clipboard for docs/validation/performance/. It measures
// the browser's frames (requestAnimationFrame), which is what the child sees; the simulation's ticks are fixed (C2.1).
import { useEffect, useRef, useState } from "react";
import type { HudState } from "../game/GameBridge";
import { frameStats, type FrameStats } from "./frameStats";

interface Result {
  readonly wave: number;
  readonly outcome: string;
  readonly speed: number;
  readonly stats: FrameStats;
}

export function FrameRecorder({ hud }: { hud: HudState }) {
  const deltas = useRef<number[]>([]);
  const running = useRef(false);
  // The wave being recorded, taken when it starts: once it is cleared the run has already moved on to the next wave.
  const recordingWave = useRef<number | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [copied, setCopied] = useState(false);
  const latest = useRef(hud);
  useEffect(() => {
    latest.current = hud;
  });

  // One rAF loop for the page's life: it records only while a wave is running.
  useEffect(() => {
    let last: number | null = null;
    let handle = 0;
    const tick = (now: number) => {
      if (running.current && last !== null) deltas.current.push(now - last);
      last = now;
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, []);

  useEffect(() => {
    const live = hud.battle === "IN_WAVE" && !hud.paused && hud.aiming === null;
    running.current = live;
    if (live && recordingWave.current === null) recordingWave.current = latest.current.wave;
    if (hud.battle === "CLEARED" || hud.battle === "DEFEATED") {
      const stats = frameStats(deltas.current);
      deltas.current = [];
      const wave = recordingWave.current ?? latest.current.wave;
      recordingWave.current = null;
      if (stats !== null) {
        const { speed, battle } = latest.current;
        setResults((old) => [...old, { wave, outcome: battle ?? "", speed, stats }]);
      }
    }
  }, [hud.battle, hud.paused, hud.aiming]);

  const recording = hud.battle === "IN_WAVE" && !hud.paused && hud.aiming === null;
  const copy = async () => {
    const record = {
      when: new Date().toISOString(),
      page: window.location.pathname + window.location.search,
      userAgent: navigator.userAgent,
      cpuThreads: navigator.hardwareConcurrency,
      devicePixelRatio: window.devicePixelRatio,
      window: `${window.innerWidth}x${window.innerHeight}`,
      canvas: (() => {
        const c = document.querySelector("canvas");
        return c === null ? null : `${Math.round(c.getBoundingClientRect().width)}x${Math.round(c.getBoundingClientRect().height)}`;
      })(),
      results,
    };
    await navigator.clipboard.writeText(JSON.stringify(record, null, 2));
    setCopied(true);
  };

  return (
    <div className="bf-perf" aria-live="polite">
      <strong>Frame recorder</strong> {recording ? "recording…" : "waiting for a wave"}
      {results.map((r, i) => (
        <div key={i}>
          Wave {r.wave} ({r.outcome}, {r.speed}x): min {r.stats.minimumFps} fps · 1% low {r.stats.onePercentLowFps} · avg{" "}
          {r.stats.averageFps} · slowest {r.stats.slowestFrameMs} ms · {r.stats.frames} frames / {r.stats.seconds} s
        </div>
      ))}
      {results.length > 0 && (
        <button type="button" className="bf-small" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy the record"}
        </button>
      )}
    </div>
  );
}
