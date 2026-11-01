import { describe, expect, it } from 'vitest';
import type { TimelineEvent } from '@vnve/core';
import { computeRenderState } from '../computeState';

describe('computeRenderState weather events', () => {
  it('weather is null when no weather events', () => {
    const events: TimelineEvent[] = [];
    const state = computeRenderState(events, 0);
    expect(state.weather).toBeNull();
  });

  it('produces weather state during weather-start fade-in', () => {
    const events: TimelineEvent[] = [
      { type: 'weather-start', at: 0, dur: 1, params: { weather: 'rain', intensity: 'normal' } },
    ];
    const state = computeRenderState(events, 0.5);
    expect(state.weather).not.toBeNull();
    expect(state.weather!.type).toBe('rain');
    expect(state.weather!.intensity).toBe('normal');
    expect(state.weather!.opacity).toBeCloseTo(0.5, 1);
  });

  it('weather opacity is 1 after weather-start completes', () => {
    const events: TimelineEvent[] = [
      { type: 'weather-start', at: 0, dur: 1, params: { weather: 'snow', intensity: 'heavy' } },
    ];
    const state = computeRenderState(events, 2);
    expect(state.weather).not.toBeNull();
    expect(state.weather!.type).toBe('snow');
    expect(state.weather!.intensity).toBe('heavy');
    expect(state.weather!.opacity).toBe(1);
  });

  it('weather-stop fades out opacity', () => {
    const events: TimelineEvent[] = [
      { type: 'weather-start', at: 0, dur: 0.5, params: { weather: 'rain', intensity: 'light' } },
      { type: 'weather-stop', at: 2, dur: 1, params: { weather: 'rain' } },
    ];
    const state = computeRenderState(events, 2.5);
    expect(state.weather).not.toBeNull();
    expect(state.weather!.opacity).toBeCloseTo(0.5, 1);
  });

  it('weather is null after weather-stop completes', () => {
    const events: TimelineEvent[] = [
      { type: 'weather-start', at: 0, dur: 0.5, params: { weather: 'rain', intensity: 'normal' } },
      { type: 'weather-stop', at: 2, dur: 1, params: { weather: 'rain' } },
    ];
    const state = computeRenderState(events, 4);
    expect(state.weather).toBeNull();
  });

});
