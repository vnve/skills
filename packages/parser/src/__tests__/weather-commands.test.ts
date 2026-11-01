import { describe, expect, it } from 'vitest';
import type { ScriptDoc, WeatherStartEvent, WeatherStopEvent } from '@vnve/core';
import { parse } from '../index';

describe('parse weather commands', () => {
  it('emits weather-start event for /rain', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'rain', params: {} }] },
      ],
    };
    const result = parse(doc);
    expect(result.diagnostics).toEqual([]);
    expect(result.events).toHaveLength(1);
    const event = result.events[0] as WeatherStartEvent;
    expect(event.type).toBe('weather-start');
    expect(event.params.weather).toBe('rain');
    expect(event.params.intensity).toBe('normal');
    expect(event.dur).toBeGreaterThan(0);
  });

  it('emits weather-start with intensity=heavy', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'rain', params: { intensity: 'heavy' } }] },
      ],
    };
    const result = parse(doc);
    expect(result.diagnostics).toEqual([]);
    const event = result.events[0] as WeatherStartEvent;
    expect(event.params.intensity).toBe('heavy');
  });

  it('emits weather-stop event for /rain stop', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'rain', params: { stop: true } }] },
      ],
    };
    const result = parse(doc);
    expect(result.diagnostics).toEqual([]);
    expect(result.events).toHaveLength(1);
    const event = result.events[0] as WeatherStopEvent;
    expect(event.type).toBe('weather-stop');
    expect(event.params.weather).toBe('rain');
  });

  it('emits weather-start for /snow with custom dur', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'snow', params: { dur: 3 } }] },
      ],
    };
    const result = parse(doc);
    expect(result.diagnostics).toEqual([]);
    const event = result.events[0] as WeatherStartEvent;
    expect(event.type).toBe('weather-start');
    expect(event.params.weather).toBe('snow');
    expect(event.dur).toBe(3);
  });

  it('emits weather-stop for /snow stop with dur', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'snow', params: { stop: true, dur: 2 } }] },
      ],
    };
    const result = parse(doc);
    const event = result.events[0] as WeatherStopEvent;
    expect(event.type).toBe('weather-stop');
    expect(event.dur).toBe(2);
  });

  it('rain command does not advance timeline (non-blocking)', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'rain', params: {} }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'flash', params: { dur: 0.3 } }] },
      ],
    };
    const result = parse(doc);
    expect(result.events).toHaveLength(2);
    expect(result.events[0].at).toBe(result.events[1].at);
  });
});
