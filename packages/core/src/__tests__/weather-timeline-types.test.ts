import { describe, expect, it } from 'vitest';
import type { WeatherStartEvent, WeatherStopEvent, TimelineEvent } from '../types/timeline';

describe('weather timeline event types', () => {
  it('WeatherStartEvent has correct shape', () => {
    const event: WeatherStartEvent = {
      type: 'weather-start',
      at: 0,
      dur: 1,
      params: { weather: 'rain', intensity: 'normal' },
    };
    expect(event.type).toBe('weather-start');
    expect(event.params.weather).toBe('rain');
    expect(event.params.intensity).toBe('normal');
  });

  it('WeatherStopEvent has correct shape', () => {
    const event: WeatherStopEvent = {
      type: 'weather-stop',
      at: 5,
      dur: 2,
      params: { weather: 'snow' },
    };
    expect(event.type).toBe('weather-stop');
    expect(event.params.weather).toBe('snow');
  });

  it('TimelineEvent union includes weather events', () => {
    const events: TimelineEvent[] = [
      { type: 'weather-start', at: 0, dur: 1, params: { weather: 'rain', intensity: 'heavy' } },
      { type: 'weather-stop', at: 5, dur: 1, params: { weather: 'rain' } },
    ];
    expect(events).toHaveLength(2);
  });
});
