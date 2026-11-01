import { describe, it, expect } from 'vitest';
import type { ScriptDoc, TextNode, RichContent } from '@vnve/core';
import { DEFAULT_LINE_GAP, estimateTextDuration, estimateTextRevealDuration, parse } from '../index';

describe('parse - inline tags in TextNode', () => {
  it('parses TextNode with single inline bgm tag in middle of text', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Hello world',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'tag', name: 'bgm', params: { asset: 'music.mp3' } },
          { type: 'text', text: 'world' },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(2); // Narrate event + bgm event

    // Primary narrate event
    expect(result.events[0].type).toBe('narrate');
    expect(result.events[0].at).toBe(0);
    expect(result.events[0].params.text).toBe('Hello world');

    // Inline bgm tag event
    expect(result.events[1].type).toBe('bgm');
    expect(result.events[1].params.asset).toBe('music.mp3');

    // Tag should trigger after "Hello " (6 chars out of 11 total)
    const textDuration = estimateTextRevealDuration('Hello world');
    const expectedTagTime = (6 / 11) * textDuration;
    expect(result.events[1].at).toBeCloseTo(expectedTagTime, 5);
  });

  it('parses TextNode with inline sfx tag', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Click here',
        content: [
          { type: 'text', text: 'Click ' },
          { type: 'tag', name: 'sfx', params: { asset: 'click.wav' } },
          { type: 'text', text: 'here' },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(2);

    expect(result.events[0].type).toBe('narrate');
    expect(result.events[1].type).toBe('sfx');
    expect(result.events[1].params.asset).toBe('click.wav');
  });

  it('parses TextNode with actor as SayEvent with inline tag', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Hello there',
        actorId: 'alice',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'tag', name: 'sfx', params: { asset: 'wave.wav' } },
          { type: 'text', text: 'there' },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(2);

    expect(result.events[0].type).toBe('say');
    expect(result.events[0].targetId).toBe('alice');
    expect(result.events[1].type).toBe('sfx');
  });

  it('parses TextNode with multiple inline tags', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'ABC',
        content: [
          { type: 'text', text: 'A' },
          { type: 'tag', name: 'bgm', params: { asset: 'intro.mp3' } },
          { type: 'text', text: 'B' },
          { type: 'tag', name: 'sfx', params: { asset: 'beep.wav' } },
          { type: 'text', text: 'C' },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(3); // Narrate + 2 tags

    expect(result.events[0].type).toBe('narrate');
    expect(result.events[1].type).toBe('bgm');
    expect(result.events[2].type).toBe('sfx');

    const textDuration = estimateTextRevealDuration('ABC');

    // First tag after "A" (1/3 of text)
    expect(result.events[1].at).toBeCloseTo((1 / 3) * textDuration, 5);

    // Second tag after "AB" (2/3 of text)
    expect(result.events[2].at).toBeCloseTo((2 / 3) * textDuration, 5);
  });

  it('treats consecutive inline tags as parallel by default', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'AB',
        content: [
          { type: 'text', text: 'A' },
          { type: 'tag', name: 'bgm', params: { asset: 'intro.mp3', await: false } },
          { type: 'tag', name: 'sfx', params: { asset: 'beep.wav', await: false } },
          { type: 'text', text: 'B' },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(3);

    const narrate = result.events[0];
    const bgm = result.events[1];
    const sfx = result.events[2];

    expect(narrate.type).toBe('narrate');
    expect(bgm.type).toBe('bgm');
    expect(sfx.type).toBe('sfx');
    expect(bgm.at).toBeCloseTo(sfx.at, 5);
    expect(narrate.dur).toBe(estimateTextDuration('AB'));
  });

  it('supports sequential inline tags via await=true', () => {
    const doc: ScriptDoc = {
      nodes: [
        {
          type: 'text',
          text: 'AB',
          content: [
            { type: 'text', text: 'A' },
            { type: 'tag', name: 'show', params: { actor: 'alice', dur: 0.5, await: true } },
            { type: 'tag', name: 'sfx', params: { asset: 'beep.wav', await: false } },
            { type: 'text', text: 'B' },
          ],
        },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'wait', params: { seconds: 1 } }] },
      ],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(4);

    const narrate = result.events[0];
    const show = result.events[1];
    const sfx = result.events[2];
    const wait = result.events[3];

    expect(narrate.type).toBe('narrate');
    expect(show.type).toBe('show');
    expect(sfx.type).toBe('sfx');
    expect(wait.type).toBe('wait');

    const baseTextDuration = estimateTextDuration('AB');
    // Total line duration includes the inserted sequential pause window.
    expect(narrate.dur).toBeCloseTo(baseTextDuration + 0.5, 5);

    // Both tags are placed after "A" (50% of base text duration),
    // but the second tag is shifted by the sequential first tag's blocking time.
    expect(show.at).toBeCloseTo(estimateTextRevealDuration('AB') * 0.5, 5);
    expect(sfx.at).toBeCloseTo(estimateTextRevealDuration('AB') * 0.5 + 0.5, 5);

    // Following nodes start after the extended timeline progression.
    expect(wait.at).toBeCloseTo(baseTextDuration + 0.5, 5);
  });

  it('supports inline wait pause between text segments', () => {
    const doc: ScriptDoc = {
      nodes: [
        {
          type: 'text',
          text: '123456',
          content: [
            { type: 'text', text: '123' },
            { type: 'tag', name: 'wait', params: { seconds: 1 } },
            { type: 'text', text: '456' },
          ],
        },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'alice' } }] },
      ],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(3);

    const narrate = result.events[0];
    const wait = result.events[1];
    const show = result.events[2];

    expect(narrate.type).toBe('narrate');
    expect(wait.type).toBe('wait');
    expect(show.type).toBe('show');

    const baseTextDuration = estimateTextDuration('123456');
    expect(narrate.dur).toBeCloseTo(baseTextDuration + 1, 5);
    expect(wait.at).toBeCloseTo(estimateTextRevealDuration('123456') * 0.5, 5);
    expect(show.at).toBeCloseTo(baseTextDuration + 1, 5);
    expect(narrate.params.inlinePauses).toEqual([{ ratio: 0.5, dur: 1, at: estimateTextRevealDuration('123456') * 0.5 }]);
  });

  it('parses inline tag at start of text (offset 0)', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Hello',
        content: [
          { type: 'tag', name: 'bgm', params: { asset: 'start.mp3' } },
          { type: 'text', text: 'Hello' },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(2);

    expect(result.events[0].type).toBe('narrate');
    expect(result.events[1].type).toBe('bgm');

    // Tag at start should trigger at time 0
    expect(result.events[1].at).toBe(0);
  });

  it('parses inline tag at end of text', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Hello',
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'tag', name: 'bgm', params: { asset: 'end.mp3' } },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(2);

    expect(result.events[0].type).toBe('narrate');
    expect(result.events[1].type).toBe('bgm');

    const textDuration = estimateTextRevealDuration('Hello');

    // Tag at end should trigger at the end of text duration
    expect(result.events[1].at).toBeCloseTo(textDuration, 5);
  });

  it('parses TextNode with only inline tags (no text)', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: '',
        content: [
          { type: 'tag', name: 'bgm', params: { asset: 'ambient.mp3' } },
          { type: 'tag', name: 'sfx', params: { asset: 'whoosh.wav' } },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(2); // Only tag events, no text event

    expect(result.events[0].type).toBe('bgm');
    expect(result.events[1].type).toBe('sfx');

    // Both tags should trigger at time 0 since there's no text
    expect(result.events[0].at).toBe(0);
    expect(result.events[1].at).toBe(0);
  });

  it('handles TextNode with content but no tags (backward compatibility)', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Hello world',
        content: [
          { type: 'text', text: 'Hello ' },
          { type: 'text', text: 'world' },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(1);

    expect(result.events[0].type).toBe('narrate');
    expect(result.events[0].params.text).toBe('Hello world');
  });

  it('handles legacy TextNode without content field (backward compatibility)', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: 'Plain old text' }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(1);

    expect(result.events[0].type).toBe('narrate');
    expect(result.events[0].params.text).toBe('Plain old text');
  });

  it('reports diagnostics and skips inline bgm tag with invalid params', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Test',
        content: [
          { type: 'text', text: 'Test' },
          { type: 'tag', name: 'bgm', params: {} }, // Missing required 'asset' param
        ],
      }],
    };

    const result = parse(doc);

    expect(result.diagnostics).toHaveLength(2);

    // Text event should still be emitted
    expect(result.events.some((e) => e.type === 'narrate')).toBe(true);

    // Invalid inline tag should not emit an event
    expect(result.events.some((e) => e.type === 'bgm')).toBe(false);
  });

  it('reports diagnostics and skips inline sfx tag with invalid params', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Test',
        content: [
          { type: 'text', text: 'Test' },
          { type: 'tag', name: 'sfx', params: {} }, // Missing required 'asset' param
        ],
      }],
    };

    const result = parse(doc);

    expect(result.diagnostics).toHaveLength(1);

    // Invalid inline tag should not emit an event
    expect(result.events.some((e) => e.type === 'sfx')).toBe(false);
  });

  it('emits valid inline tag event even with optional params', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Music',
        content: [
          { type: 'text', text: 'Music' },
          { type: 'tag', name: 'bgm', params: { asset: 'theme.mp3', volume: 0.5, fade: 2 } },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(2);

    expect(result.events[1].type).toBe('bgm');
    expect(result.events[1].params).toMatchObject({ action: 'play', asset: 'theme.mp3', volume: 0.5, fade: 2 });
  });

  it('correctly maps eventSourceMap for inline tag events', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Test',
        content: [
          { type: 'text', text: 'Test' },
          { type: 'tag', name: 'bgm', params: { asset: 'music.mp3' } },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.eventSourceMap).toHaveLength(2);
    expect(result.eventSourceMap[0]).toBe(0); // Narrate event from node 0
    expect(result.eventSourceMap[1]).toBe(0); // Inline tag event also from node 0
  });

  it('advances time correctly after TextNode with inline tags', () => {
    const doc: ScriptDoc = {
      nodes: [
        {
          type: 'text',
          text: 'First',
          content: [
            { type: 'text', text: 'First' },
            { type: 'tag', name: 'bgm', params: { asset: 'music.mp3' } },
          ],
        },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a' } }] },
      ],
    };

    const result = parse(doc);
    const narrateDur = result.events[0].dur;

    // Show command should start after the narrate event completes
    const showEvent = result.events.find((e) => e.type === 'show');
    expect(showEvent?.at).toBe(narrateDur);
  });

  it('calculates tag time ratio correctly for various positions', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: '0123456789', // 10 characters
        content: [
          { type: 'text', text: '012' }, // 3 chars
          { type: 'tag', name: 'bgm', params: { asset: 'a.mp3' } }, // Should be at 3/10
          { type: 'text', text: '34567' }, // 5 chars
          { type: 'tag', name: 'sfx', params: { asset: 'b.wav' } }, // Should be at 8/10
          { type: 'text', text: '89' }, // 2 chars
        ],
      }],
    };

    const result = parse(doc);
    expect(result.events).toHaveLength(3);

    const textDuration = estimateTextRevealDuration('0123456789');

    expect(result.events[1].type).toBe('bgm');
    expect(result.events[1].at).toBeCloseTo((3 / 10) * textDuration, 5);

    expect(result.events[2].type).toBe('sfx');
    expect(result.events[2].at).toBeCloseTo((8 / 10) * textDuration, 5);
  });

  it('handles inline tags in multiple consecutive TextNodes', () => {
    const doc: ScriptDoc = {
      nodes: [
        {
          type: 'text',
          text: 'First',
          content: [
            { type: 'text', text: 'First' },
            { type: 'tag', name: 'bgm', params: { asset: 'intro.mp3' } },
          ],
        },
        {
          type: 'text',
          text: 'Second',
          content: [
            { type: 'text', text: 'Second' },
            { type: 'tag', name: 'sfx', params: { asset: 'beep.wav' } },
          ],
        },
      ],
    };

    const result = parse(doc);
    expect(result.events).toHaveLength(4); // 2 narrate + 2 inline tags

    const firstDur = result.events[0].dur;

    // Second narrate should start after first completes, plus default line gap.
    expect(result.events[2].type).toBe('narrate');
    expect(result.events[2].at).toBeCloseTo(firstDur + DEFAULT_LINE_GAP, 5);

    // Second inline tag should be relative to second narrate's start time
    expect(result.events[3].type).toBe('sfx');
    expect(result.events[3].at).toBeGreaterThan(firstDur);
  });

  it('bgm event has zero duration (instant)', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Music starts',
        content: [
          { type: 'text', text: 'Music starts' },
          { type: 'tag', name: 'bgm', params: { asset: 'theme.mp3' } },
        ],
      }],
    };

    const result = parse(doc);
    const bgmEvent = result.events.find((e) => e.type === 'bgm');
    expect(bgmEvent?.dur).toBe(0);
  });

  it('sfx event has zero duration (instant)', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Sound plays',
        content: [
          { type: 'text', text: 'Sound plays' },
          { type: 'tag', name: 'sfx', params: { asset: 'ding.wav' } },
        ],
      }],
    };

    const result = parse(doc);
    const sfxEvent = result.events.find((e) => e.type === 'sfx');
    expect(sfxEvent?.dur).toBe(0);
  });

  it('handles edge case with single character text and tag', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'X',
        content: [
          { type: 'text', text: 'X' },
          { type: 'tag', name: 'bgm', params: { asset: 'music.mp3' } },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(2);

    // Tag should trigger at the end of single-character text
    const textDuration = estimateTextRevealDuration('X');
    expect(result.events[1].at).toBeCloseTo(textDuration, 5);
  });

  it('handles tag between empty text segments', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'AB',
        content: [
          { type: 'text', text: 'A' },
          { type: 'text', text: '' }, // Empty segment
          { type: 'tag', name: 'bgm', params: { asset: 'music.mp3' } },
          { type: 'text', text: '' }, // Empty segment
          { type: 'text', text: 'B' },
        ],
      }],
    };

    const result = parse(doc);
    expect(result.events).toHaveLength(2);

    const textDuration = estimateTextRevealDuration('AB');

    // Tag should be at 1/2 position (after "A")
    expect(result.events[1].at).toBeCloseTo((1 / 2) * textDuration, 5);
  });

  it('handles unknown inline tag command gracefully', () => {
    const doc: ScriptDoc = {
      nodes: [{
        type: 'text',
        text: 'Test',
        content: [
          { type: 'text', text: 'Test' },
          { type: 'tag', name: 'unknown' as any, params: {} },
        ],
      }],
    };

    const result = parse(doc);

    // Should still emit the text event
    expect(result.events.some((e) => e.type === 'narrate')).toBe(true);

    // Unknown tag should be ignored (no event emitted for it)
    expect(result.events).toHaveLength(1);
  });
});

describe('parse - tag-only bgm and sfx lines', () => {
  it('parses a tag-only bgm line', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'bgm', params: { asset: 'theme.mp3' } }] }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(1);

    expect(result.events[0].type).toBe('bgm');
    expect(result.events[0].at).toBe(0);
    expect(result.events[0].dur).toBe(0);
    expect(result.events[0].params.asset).toBe('theme.mp3');
  });

  it('parses a tag-only sfx line', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'sfx', params: { asset: 'beep.wav' } }] }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(1);

    expect(result.events[0].type).toBe('sfx');
    expect(result.events[0].at).toBe(0);
    expect(result.events[0].dur).toBe(0);
    expect(result.events[0].params.asset).toBe('beep.wav');
  });

  it('parses bgm with optional volume and fade params', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'bgm', params: { asset: 'epic.mp3', volume: 0.8, fade: 2.5 } }] },
      ],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events[0].params).toMatchObject({ action: 'play', asset: 'epic.mp3', volume: 0.8, fade: 2.5 });
  });

  it('parses bgm stop/pause/resume actions', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'bgm', params: { action: 'play', asset: 'theme.mp3' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'bgm', params: { action: 'pause', fade: 0.4 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'bgm', params: { action: 'resume', fade: 0.2 } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'bgm', params: { action: 'stop', fade: 0.5 } }] },
      ],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(4);
    expect(result.events[1].params).toMatchObject({ action: 'pause', fade: 0.4 });
    expect(result.events[2].params).toMatchObject({ action: 'resume', fade: 0.2 });
    expect(result.events[3].params).toMatchObject({ action: 'stop', fade: 0.5 });
  });

  it('parses sfx with optional volume param', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'sfx', params: { asset: 'explosion.wav', volume: 1.0 } }] }],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events[0].params).toEqual({ asset: 'explosion.wav', volume: 1.0 });
  });

  it('validates bgm requires asset param', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'bgm', params: {} }] }],
    };

    const result = parse(doc);
    expect(result.diagnostics.length).toBeGreaterThan(0);

    const missingParam = result.diagnostics.find((d) => d.code === 'MISSING_PARAM');
    expect(missingParam).toBeDefined();
    expect(missingParam?.location?.field).toBe('asset');
  });

  it('validates sfx requires asset param', () => {
    const doc: ScriptDoc = {
      nodes: [{ type: 'text', text: '', content: [{ type: 'tag', name: 'sfx', params: {} }] }],
    };

    const result = parse(doc);
    expect(result.diagnostics.length).toBeGreaterThan(0);

    const missingParam = result.diagnostics.find((d) => d.code === 'MISSING_PARAM');
    expect(missingParam).toBeDefined();
    expect(missingParam?.location?.field).toBe('asset');
  });

  it('does not advance time for bgm command', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'bgm', params: { asset: 'theme.mp3' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a' } }] },
      ],
    };

    const result = parse(doc);
    expect(result.events[0].type).toBe('bgm');
    expect(result.events[0].at).toBe(0);

    // Show should still be at time 0 since bgm has zero duration
    expect(result.events[1].type).toBe('show');
    expect(result.events[1].at).toBe(0);
  });

  it('does not advance time for sfx command', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'sfx', params: { asset: 'beep.wav' } }] },
        { type: 'text', text: '', content: [{ type: 'tag', name: 'show', params: { actor: 'a' } }] },
      ],
    };

    const result = parse(doc);
    expect(result.events[0].type).toBe('sfx');
    expect(result.events[0].at).toBe(0);

    expect(result.events[1].type).toBe('show');
    expect(result.events[1].at).toBe(0);
  });

  it('accepts interjection tag without emitting an event or diagnostic', () => {
    const doc: ScriptDoc = {
      nodes: [
        {
          type: 'text',
          text: 'Ha ha',
          content: [
            { type: 'tag', name: 'interjection', params: { kind: 'laughs' } },
            { type: 'text', text: 'Ha ha' },
          ],
        },
      ],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    // interjection produces no timeline event — only the primary narrate event remains
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('narrate');
    // It must not advance time either
    expect(result.events[0].at).toBe(0);
  });

  it('reports diagnostics for invalid interjection kind', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'interjection', params: { kind: 'nope' } }] },
      ],
    };

    const result = parse(doc);
    expect(result.events).toHaveLength(0);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('emits no event for a pure-action line containing only interjection', () => {
    const doc: ScriptDoc = {
      nodes: [
        { type: 'text', text: '', content: [{ type: 'tag', name: 'interjection', params: { kind: 'sighs' } }] },
      ],
    };

    const result = parse(doc);
    expect(result.diagnostics).toHaveLength(0);
    expect(result.events).toHaveLength(0);
  });
});
