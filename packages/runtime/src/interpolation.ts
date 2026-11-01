export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

export function easeInOutCubic(t: number): number {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Compute normalized progress (0..1) of time within an event's [at, at+dur] range.
 * Returns 0 if time <= at, 1 if time >= at+dur.
 */
export function progress(time: number, at: number, dur: number): number {
  if (dur <= 0) return 1;
  return clamp01((time - at) / dur);
}
