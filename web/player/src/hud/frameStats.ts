// Frame-time statistics for the AC-42 measurement (Phase 34, C14, I.3 AC-42): from the time between rendered frames,
// the average frame rate, the minimum (the single slowest frame) and the 1%-low (the average of the slowest 1% of
// frames, at least one), plus the slowest frame in milliseconds. Pure, so the arithmetic is tested.
export interface FrameStats {
  readonly frames: number;
  readonly seconds: number;
  readonly averageFps: number;
  readonly minimumFps: number;
  readonly onePercentLowFps: number;
  readonly slowestFrameMs: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function frameStats(deltasMs: readonly number[]): FrameStats | null {
  const deltas = deltasMs.filter((d) => Number.isFinite(d) && d > 0);
  if (deltas.length === 0) return null;
  const total = deltas.reduce((a, b) => a + b, 0);
  const slowest = [...deltas].sort((a, b) => b - a);
  const worst = slowest.slice(0, Math.max(1, Math.floor(deltas.length / 100)));
  const worstMean = worst.reduce((a, b) => a + b, 0) / worst.length;
  return {
    frames: deltas.length,
    seconds: round1(total / 1000),
    averageFps: round1((1000 * deltas.length) / total),
    minimumFps: round1(1000 / (slowest[0] ?? 1)),
    onePercentLowFps: round1(1000 / worstMean),
    slowestFrameMs: round1(slowest[0] ?? 0),
  };
}
