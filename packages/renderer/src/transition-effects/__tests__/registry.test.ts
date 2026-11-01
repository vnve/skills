import { describe, expect, it } from 'vitest';
import { transitionRegistry } from '../registry';

describe('transitionRegistry', () => {
  const expectedEffects = [
    'dissolve',
    'fade-black', 'fade-white',
  ];

  it.each(expectedEffects)('has a factory for "%s"', (name) => {
    expect(transitionRegistry.has(name)).toBe(true);
    const factory = transitionRegistry.get(name)!;
    const effect = factory();
    expect(typeof effect.setup).toBe('function');
    expect(typeof effect.update).toBe('function');
    expect(typeof effect.teardown).toBe('function');
    expect(typeof effect.needsSnapshot).toBe('boolean');
  });

  it('uses snapshots only for dissolve', () => {
    expect(transitionRegistry.get('dissolve')!().needsSnapshot).toBe(true);
    expect(transitionRegistry.get('fade-black')!().needsSnapshot).toBe(false);
    expect(transitionRegistry.get('fade-white')!().needsSnapshot).toBe(false);
  });
});
