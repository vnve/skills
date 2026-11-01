import { describe, expect, it } from 'vitest';
import { FadeEffect } from '../fade-effect';

describe('FadeEffect', () => {
  it('does not use a snapshot because fade-black/fade-white are pure color masks', () => {
    expect(new FadeEffect('#000000').needsSnapshot).toBe(false);
  });

  it('setup/update/teardown lifecycle does not throw', () => {
    const effect = new FadeEffect('#000000');
    const ctx = {
      layer: { add: () => {} },
      bgLayer: {},
      width: 800,
      height: 600,
      snapshot: {} as CanvasImageSource,
    } as any;
    expect(() => effect.setup(ctx)).not.toThrow();
    expect(() => effect.update(0)).not.toThrow();
    expect(() => effect.update(0.5)).not.toThrow();
    expect(() => effect.update(1)).not.toThrow();
    expect(() => effect.teardown()).not.toThrow();
  });

  it('teardown before setup does not throw', () => {
    expect(() => new FadeEffect('#000000').teardown()).not.toThrow();
  });
});
