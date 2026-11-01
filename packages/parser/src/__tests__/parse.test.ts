import { describe, it, expect } from 'vitest';
import type { ScriptDoc } from '@vnve/core';
import { DEFAULT_LINE_GAP, parse } from '../index';

describe('parse - happy path', () => {
  it('parses a complete script with all 8 commands', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'alice', x: 100, y: 500 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'say', params: { actor: 'alice', text: 'Hello there!' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'wait', params: { seconds: 1 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'move', params: { actor: 'alice', toX: 400, toY: 500, dur: 0.8 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'shake', params: { actor: 'alice', amp: 10 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'set', params: { target: 'alice', variant: 'happy' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'narrate', params: { text: 'The scene was peaceful.' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'hide', params: { actor: 'alice' } }] },
      ],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(8);
    expect(result.events).toMatchSnapshot();
  });

  it('parses TextNodes with actorId as SayEvent', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Greetings!', actorId: 'bob' }],
    };
    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('say');
    expect(result.events[0].targetId).toBe('bob');
  });

  it('parses TextNodes without actorId as NarrateEvent', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'A narrator speaks.' }],
    };
    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('narrate');
    expect(result.events[0].targetId).toBeUndefined();
  });

  it('skips empty TextNodes', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '' },
        { type: 'text', text: '   ' },
        { type: 'text', text: 'Valid text' },
      ],
    };
    const result = parse(doc);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('narrate');
  });

  it('does not crash when a malformed TextNode without text follows dialogue', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: 'Recovered line' },
        { type: 'text' } as any,
      ],
    };

    const result = parse(doc);

    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('narrate');
    expect((result.events[0] as any).params.text).toBe('Recovered line');
  });

  it('builds correct eventSourceMap', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a' } }] },
        { type: 'text', text: 'Hello' },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'hide', params: { actor: 'a' } }] },
      ],
    };
    const result = parse(doc);
    expect(result.eventSourceMap).toEqual([0, 1, 2]);
  });
});

describe('parse - time progression', () => {
  it('starts at time 0', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a' } }] }],
    };
    const result = parse(doc);
    expect(result.events[0].at).toBe(0);
  });

  it('advances time through show (default 0.5s)', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'hide', params: { actor: 'a' } }] },
      ],
    };
    const result = parse(doc);
    expect(result.events[0].at).toBe(0);
    expect(result.events[0].dur).toBe(0.5);
    expect(result.events[1].at).toBe(0.5);
  });

  it('advances time through wait', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'wait', params: { seconds: 2 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'hide', params: { actor: 'a' } }] },
      ],
    };
    const result = parse(doc);
    expect(result.events[0].at).toBe(0);
    expect(result.events[1].at).toBe(0.5);
    expect(result.events[2].at).toBe(2.5);
  });

  it('advances time through say/narrate using text estimation', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'say', params: { actor: 'a', text: 'A short line' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'hide', params: { actor: 'a' } }] },
      ],
    };
    const result = parse(doc);
    const sayDur = result.events[0].dur;
    expect(sayDur).toBeGreaterThan(0);
    expect(result.events[1].at).toBe(sayDur);
  });

  it('uses explicit dur when provided for say', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'say', params: { actor: 'a', text: 'Hello', dur: 3 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'hide', params: { actor: 'a' } }] },
      ],
    };
    const result = parse(doc);
    expect(result.events[0].dur).toBe(3);
    expect(result.events[1].at).toBe(3);
  });

  it('set command has zero duration (instant)', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'set', params: { target: 'a', variant: 'angry' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a' } }] },
      ],
    };
    const result = parse(doc);
    expect(result.events[0].at).toBe(0);
    expect(result.events[0].dur).toBe(0);
    expect(result.events[1].at).toBe(0);
  });

  it('uses explicit dur for show when provided', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a', dur: 1.5 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'hide', params: { actor: 'a' } }] },
      ],
    };
    const result = parse(doc);
    expect(result.events[0].dur).toBe(1.5);
    expect(result.events[1].at).toBe(1.5);
  });

  it('advances time through TextNode text estimation', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: 'Narrator text here.' },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a' } }] },
      ],
    };
    const result = parse(doc);
    expect(result.events[0].at).toBe(0);
    expect(result.events[1].at).toBe(result.events[0].dur);
  });

  it('inserts default line gap between consecutive dialogue lines', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: 'Hi' },
        { type: 'text', text: 'There' },
      ],
    };
    const result = parse(doc);
    expect(result.events).toHaveLength(2);
    expect(result.events[1].at).toBeCloseTo(result.events[0].dur + DEFAULT_LINE_GAP, 5);
  });

  it('supports overriding and disabling line gap', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: 'Hi' },
        { type: 'text', text: 'There' },
      ],
    };

    const customGap = parse(doc, { lineGap: 0.3 });
    expect(customGap.events[1].at).toBeCloseTo(customGap.events[0].dur + 0.3, 5);

    const zeroGap = parse(doc, { lineGap: 0 });
    expect(zeroGap.events[1].at).toBeCloseTo(zeroGap.events[0].dur, 5);
  });
});

describe('parse - error diagnostics', () => {
  it('reports unknown command', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'fly' as any, params: {} }] }],
    };
    const result = parse(doc);
    expect(result.events).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('UNKNOWN_COMMAND');
    expect(result.diagnostics[0].level).toBe('error');
    expect(result.diagnostics[0].location?.index).toBe(0);
  });

  it('reports missing move target (requires `to` or `toX/toY`)', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'move', params: { actor: 'a' } }] }],
    };
    const result = parse(doc);
    const missing = result.diagnostics.filter((d) => d.code === 'MISSING_PARAM');
    expect(missing).toHaveLength(1);
    expect(missing[0]?.location?.field).toBe('to');
  });

  it('reports missing actor param', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: {} }] }],
    };
    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('MISSING_PARAM');
    expect(result.diagnostics[0].location?.field).toBe('actor');
  });

  it('reports wrong param type', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'shake', params: { actor: 'a', amp: 'strong' } }] }],
    };
    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('INVALID_PARAM_TYPE');
    expect(result.diagnostics[0].location?.field).toBe('amp');
  });

  it('reports unrecognized params', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a', position: 'left' } }] }],
    };
    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('INVALID_PARAM_TYPE');
    expect(result.diagnostics[0].location?.field).toBe('position');
  });

  it('does not emit event when required params are missing', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'move', params: {} }] }],
    };
    const result = parse(doc);
    expect(result.events).toHaveLength(0);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('reports negative wait duration', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'wait', params: { seconds: -1 } }] }],
    };
    const result = parse(doc);
    expect(result.diagnostics.some((d) => d.code === 'NEGATIVE_DURATION')).toBe(true);
    expect(result.events).toHaveLength(0);
  });

  it('rejects empty text in say command', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'say', params: { actor: 'a', text: '   ' } }] }],
    };
    const result = parse(doc);
    const errors = result.diagnostics.filter((d) => d.level === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe('INVALID_PARAM_TYPE');
    expect(errors[0].location?.field).toBe('text');
    expect(result.events).toHaveLength(0);
  });

  it('collects multiple diagnostics across nodes', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: {} }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'blah' as any, params: {} }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'shake', params: { actor: 'a' } }] },
      ],
    };
    const result = parse(doc);
    expect(result.diagnostics.length).toBe(3);
    expect(result.diagnostics[0].location?.index).toBe(0);
    expect(result.diagnostics[1].location?.index).toBe(1);
    expect(result.diagnostics[2].location?.index).toBe(2);
  });

  it('still advances time when errors occur', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: {} }] }, // error, but time still advances by default 0.5
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a' } }] },
      ],
    };
    const result = parse(doc);
    // First show errors out (no event), but time advances 0.5s
    // Second show succeeds at t=0.5
    expect(result.events).toHaveLength(1);
    expect(result.events[0].at).toBe(0.5);
  });
});

describe('parse - edge cases', () => {
  it('handles empty document', () => {
    const doc: ScriptDoc = { nodes: [] };
    const result = parse(doc);
    expect(result.events).toHaveLength(0);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.eventSourceMap).toHaveLength(0);
  });

  it('handles mixed valid and invalid nodes', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'move', params: {} }] }, // all params missing
        { type: 'text', text: '', content: [{ type: 'tag', name: 'hide', params: { actor: 'a' } }] },
      ],
    };
    const result = parse(doc);
    expect(result.events).toHaveLength(2); // show + hide
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
