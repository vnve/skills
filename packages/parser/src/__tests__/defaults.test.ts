import { describe, expect, it } from 'vitest';

import {
  DEFAULT_READING_PACE,
  MIN_TEXT_DURATION,
  estimateTextDuration,
  estimateTextRevealDuration,
} from '../defaults';
import { parse } from '../index';

describe('text duration defaults', () => {
  it('uses minimum duration for empty or extremely short text', () => {
    const empty = parse({ nodes: [{ type: 'text', text: '' }] });
    expect(empty.events).toHaveLength(0);

    const short = parse({ nodes: [{ type: 'text', text: 'a' }] });
    expect(short.events[0]?.dur).toBe(MIN_TEXT_DURATION);
  });

  it('uses reading pace multiplier when estimating narration duration', () => {
    const text = '你好，欢迎来到视觉小说。';
    const normal = parse({ nodes: [{ type: 'text', text }] }, { readingPace: DEFAULT_READING_PACE });
    const fast = parse({ nodes: [{ type: 'text', text }] }, { readingPace: 1.4 });
    const slow = parse({ nodes: [{ type: 'text', text }] }, { readingPace: 0.75 });

    expect(normal.events[0]?.dur).toBeGreaterThan(MIN_TEXT_DURATION);
    expect(fast.events[0]?.dur).toBeLessThan(normal.events[0]?.dur ?? 0);
    expect(slow.events[0]?.dur).toBeGreaterThan(normal.events[0]?.dur ?? 0);
  });

  it('applies reading pace to command-style narrate events too', () => {
    const doc = { nodes: [{
      type: 'text' as const,
      text: '请慢慢阅读这句话。',
    }] };
    const normal = parse(doc, { readingPace: DEFAULT_READING_PACE });
    const fast = parse(doc, { readingPace: 1.3 });
    expect(fast.events[0]?.dur).toBeLessThan(normal.events[0]?.dur ?? 0);
  });

  it('treats string-like empty values as minimum duration', () => {
    expect(estimateTextDuration(new String('') as unknown as string)).toBe(MIN_TEXT_DURATION);
  });

  it('adds explicit punctuation hold in visual-novel pacing', () => {
    const noStop = estimateTextDuration('你好你好你好你好');
    const withStop = estimateTextDuration('你好你好你好你好。');

    // Strong punctuation should add a meaningful hold, not only one extra glyph.
    expect(withStop - noStop).toBeGreaterThan(0.15);
  });

  it('keeps reveal duration shorter than total hold when punctuation exists', () => {
    const text = '谢谢你，明天见。';
    const reveal = estimateTextRevealDuration(text);
    const total = estimateTextDuration(text);
    expect(total).toBeGreaterThan(reveal);
  });
});
