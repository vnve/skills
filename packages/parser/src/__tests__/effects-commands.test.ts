import { describe, expect, it } from 'vitest';
import type { ScriptDoc } from '@vnve/core';

import { parse } from '../index';

describe('parse effects and audio commands', () => {
  it('emits events for extended effect commands with normalized params', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'bgm', params: { action: 'play', asset: 'main', volume: 0.5, fade: 1, loop: true, duck: 0.2 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'sfx', params: { asset: 'click', volume: 0.8 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'filter', params: { actor: 'alice', brightness: 0.6, blur: 2 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'dim', params: { actor: 'alice', brightness: 0.3 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'hop', params: { actor: 'alice' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'blur', params: { actor: 'alice', blur: 4 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'flash', params: { color: '#fff', dur: 0.2 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'vibrate', params: { amp: 10, dur: 0.3 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'tint', params: { actor: 'alice', color: '#f00', opacity: 0.4 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'rotate', params: { actor: 'alice', angle: 15, dur: 0.5 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'zoom', params: { actor: 'alice', scale: 1.2, dur: 0.5 } }] },
      ],
    };

    const result = parse(doc);
    expect(result.diagnostics).toEqual([]);
    expect(result.events.map((e) => e.type)).toEqual([
      'bgm',
      'sfx',
      'filter',
      'filter',
      'hop',
      'filter',
      'flash',
      'vibrate',
      'tint',
      'rotate',
      'zoom',
    ]);

    const bgm = result.events[0];
    expect(bgm.type).toBe('bgm');
    expect((bgm as any).params).toMatchObject({ action: 'play', asset: 'main', volume: 0.5, fade: 1, loop: true, duck: 0.2 });

    const hop = result.events[4];
    expect(hop.type).toBe('hop');
    expect((hop as any).params.amp).toBe(20); // default amp
  });

  it('reports validation diagnostics for invalid bgm params', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'bgm', params: { action: 'invalid', asset: '', volume: 1.5, duck: -0.1, fade: -1 } as any }] },
      ],
    };

    const result = parse(doc);
    expect(result.events).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.location?.field === 'action')).toBe(true);
    expect(result.diagnostics.some((d) => d.location?.field === 'volume')).toBe(true);
    expect(result.diagnostics.some((d) => d.location?.field === 'duck')).toBe(true);
    expect(result.diagnostics.some((d) => d.location?.field === 'fade')).toBe(true);
  });

  it('validates set command target and transition mode', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'set', params: { target: '', variant: 'happy', with: 'slide' } as any }] },
      ],
    };

    const result = parse(doc);
    expect(result.events).toHaveLength(0);
    expect(result.diagnostics.some((d) => d.location?.field === 'target')).toBe(true);
    expect(result.diagnostics.some((d) => d.location?.field === 'with')).toBe(true);
  });

  it('resolves move slot positions into coordinates', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'move', params: { actor: 'alice', to: 'right' } }] },
      ],
    };

    const result = parse(doc);
    expect(result.diagnostics).toEqual([]);
    expect(result.events).toHaveLength(1);
    expect((result.events[0] as any).params).toMatchObject({ toX: 75, toY: 100 });
  });

  it('applies line gap after command say when next node is dialogue', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'say', params: { actor: 'alice', text: 'Hi', dur: 1 } }] },
        { type: 'text', text: 'Next line' },
      ],
    };

    const result = parse(doc, { lineGap: 0.2 });
    expect(result.events).toHaveLength(2);
    expect(result.events[1].at).toBeCloseTo(1.2, 5);
  });

  it('uses TextNode audioDuration when present', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', actorId: 'alice', text: 'hello', audioDuration: 3, audioUrl: 'https://cdn.example.com/a.wav' },
      ],
    };

    const result = parse(doc);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].dur).toBe(3);
    expect((result.events[0] as any).params.audioUrl).toBe('https://cdn.example.com/a.wav');
  });
});
