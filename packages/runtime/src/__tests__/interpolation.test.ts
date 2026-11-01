import { describe, it, expect } from 'vitest';
import { lerp, clamp01, easeInOutCubic, progress } from '../interpolation';

describe('clamp01', () => {
  it('clamps negative values to 0', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(-100)).toBe(0);
  });

  it('clamps values above 1 to 1', () => {
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(100)).toBe(1);
  });

  it('returns values in [0,1] unchanged', () => {
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1)).toBe(1);
  });
});

describe('lerp', () => {
  it('returns a when t=0', () => {
    expect(lerp(0, 10, 0)).toBe(0);
  });

  it('returns b when t=1', () => {
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('returns midpoint when t=0.5', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('works with negative ranges', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });

  it('clamps t to [0,1]', () => {
    expect(lerp(0, 10, -1)).toBe(0);
    expect(lerp(0, 10, 2)).toBe(10);
  });
});

describe('easeInOutCubic', () => {
  it('returns 0 at t=0', () => {
    expect(easeInOutCubic(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('returns 0.5 at t=0.5', () => {
    expect(easeInOutCubic(0.5)).toBe(0.5);
  });

  it('is less than linear in first quarter', () => {
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
  });

  it('is greater than linear in third quarter', () => {
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
  });
});

describe('progress', () => {
  it('returns 0 when time equals at', () => {
    expect(progress(1, 1, 2)).toBe(0);
  });

  it('returns 1 when time equals at + dur', () => {
    expect(progress(3, 1, 2)).toBe(1);
  });

  it('returns 0.5 at midpoint', () => {
    expect(progress(2, 1, 2)).toBe(0.5);
  });

  it('clamps to 0 for time before at', () => {
    expect(progress(0, 1, 2)).toBe(0);
  });

  it('clamps to 1 for time after at + dur', () => {
    expect(progress(10, 1, 2)).toBe(1);
  });

  it('returns 1 when dur is 0', () => {
    expect(progress(1, 1, 0)).toBe(1);
  });

  it('returns 1 when dur is negative', () => {
    expect(progress(1, 1, -1)).toBe(1);
  });
});
