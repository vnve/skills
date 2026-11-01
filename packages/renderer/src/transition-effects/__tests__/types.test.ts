import { describe, expect, it } from 'vitest';
import type { TransitionEffect, TransitionContext } from '../types';

describe('TransitionEffect interface', () => {
  it('can be implemented as a class with required methods', () => {
    class TestEffect implements TransitionEffect {
      needsSnapshot = false;
      setup(_ctx: TransitionContext) {}
      update(_progress: number) {}
      teardown() {}
    }

    const effect = new TestEffect();
    expect(effect.needsSnapshot).toBe(false);
    expect(typeof effect.setup).toBe('function');
    expect(typeof effect.update).toBe('function');
    expect(typeof effect.teardown).toBe('function');
  });

  it('can declare needsSnapshot as true', () => {
    class SnapshotEffect implements TransitionEffect {
      needsSnapshot = true;
      setup(_ctx: TransitionContext) {}
      update(_progress: number) {}
      teardown() {}
    }

    expect(new SnapshotEffect().needsSnapshot).toBe(true);
  });
});
