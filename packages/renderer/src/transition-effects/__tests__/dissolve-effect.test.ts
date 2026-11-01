import { describe, expect, it } from 'vitest';
import { buildSceneTransitionPlan } from '../../scene-transition-compositor';
import { DissolveEffect } from '../dissolve-effect';

describe('DissolveEffect', () => {
  it('requires a snapshot', () => {
    expect(new DissolveEffect().needsSnapshot).toBe(true);
  });

  it('setup/update/teardown lifecycle does not throw for dissolve-style outgoing snapshots', () => {
    const effect = new DissolveEffect();
    const ctx = {
      layer: { add: () => {} }, bgLayer: {},
      width: 800, height: 600,
      outgoingSurface: {} as CanvasImageSource,
    } as any;
    expect(() => effect.setup(ctx)).not.toThrow();
    expect(() => effect.update(0, buildSceneTransitionPlan({
      effect: 'dissolve',
      progress: 0,
      outgoing: { sceneId: 'a' },
      incoming: { sceneId: 'b' },
    }))).not.toThrow();
    expect(() => effect.update(0.5, buildSceneTransitionPlan({
      effect: 'dissolve',
      progress: 0.5,
      outgoing: { sceneId: 'a' },
      incoming: { sceneId: 'b' },
    }))).not.toThrow();
    expect(() => effect.update(1, buildSceneTransitionPlan({
      effect: 'dissolve',
      progress: 1,
      outgoing: { sceneId: 'a' },
      incoming: { sceneId: 'b' },
    }))).not.toThrow();
    expect(() => effect.teardown()).not.toThrow();
  });

  it('teardown before setup does not throw', () => {
    expect(() => new DissolveEffect().teardown()).not.toThrow();
  });
});
