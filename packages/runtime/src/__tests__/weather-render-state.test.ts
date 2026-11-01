import { describe, expect, it } from 'vitest';
import type { RenderState, WeatherRenderState } from '../types';

describe('WeatherRenderState', () => {
  it('can be assigned to RenderState.weather', () => {
    const weather: WeatherRenderState = {
      type: 'rain',
      intensity: 'normal',
      opacity: 0.5,
    };
    const state = { weather } as Pick<RenderState, 'weather'>;
    expect(state.weather).toBeDefined();
    expect(state.weather!.type).toBe('rain');
    expect(state.weather!.opacity).toBe(0.5);
  });

  it('weather can be null on RenderState', () => {
    const state = { weather: null } as Pick<RenderState, 'weather'>;
    expect(state.weather).toBeNull();
  });
});
