import { describe, expect, it } from 'vitest';
import {
  textNeedsShadow,
  buildStyledTextRenderPlan,
  computeTextLayout,
  renderStyledText,
  renderStyledTextPlan,
  sliceSegmentsByCharRange,
  truncateSegments,
} from '../styled-text';

function createMockCtx(): CanvasRenderingContext2D {
  return {
    font: '',
    measureText: (text: string) => ({ width: text.length * 10 } as TextMetrics),
  } as CanvasRenderingContext2D;
}

function createRecordingCtx() {
  const calls: Array<{ text: string; alpha: number }> = [];
  const fonts: string[] = [];
  const alphaStack: number[] = [];
  const ctx: any = {
    font: '',
    fillStyle: '#fff',
    globalAlpha: 1,
    measureText: (text: string) => ({ width: text.length * 10 } as TextMetrics),
    fillText: (text: string) => {
      calls.push({ text, alpha: ctx.globalAlpha });
      fonts.push(ctx.font);
    },
    save: () => {
      alphaStack.push(ctx.globalAlpha);
    },
    restore: () => {
      ctx.globalAlpha = alphaStack.pop() ?? 1;
    },
  };
  return { ctx: ctx as CanvasRenderingContext2D, calls, fonts };
}

describe('styled-text newline layout', () => {
  it('keeps explicit newline as hard line break', () => {
    const ctx = createMockCtx();
    const lines = computeTextLayout(ctx, [{ text: 'A\nB' }], {
      width: 1000,
      fontSize: 24,
      fontFamily: 'sans-serif',
    });

    expect(lines).toHaveLength(2);
    expect(lines[0]?.charEnd).toBe(1);
    expect(lines[1]?.charEnd).toBe(3);
  });

  it('keeps empty line when text ends with newline', () => {
    const ctx = createMockCtx();
    const lines = computeTextLayout(ctx, [{ text: 'A\n' }], {
      width: 1000,
      fontSize: 24,
      fontFamily: 'sans-serif',
    });

    expect(lines).toHaveLength(2);
    expect(lines[0]?.charEnd).toBe(1);
    expect(lines[1]?.charStart).toBe(2);
    expect(lines[1]?.charEnd).toBe(2);
  });

  it('returns a zero-length line when there is no renderable text', () => {
    const ctx = createMockCtx();
    const lines = computeTextLayout(ctx, [{ text: '' }], {
      width: 1000,
      fontSize: 24,
      fontFamily: 'sans-serif',
    });

    expect(lines).toEqual([{ charStart: 0, charEnd: 0 }]);
  });

  it('wraps mixed CJK text with smart quotes and ascii punctuation across more than two lines', () => {
    const ctx = createMockCtx();
    const text = '林默撑着一把黑伞，脚步停在“时计堂”的木.前铜制门环上还干的雨珠，门楣上的木质招牌刻着褪色的花纹，透着老城区独有的厚重感。';
    const lines = computeTextLayout(ctx, [{ text }], {
      width: 150,
      fontSize: 24,
      fontFamily: 'sans-serif',
    });

    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((line) => line.charEnd - line.charStart <= 15)).toBe(true);
    expect(lines.at(-1)?.charEnd).toBe(text.length);
  });
});

describe('styled-text typewriter fade', () => {
  it('fades only the newest character when lastCharOpacity is set', () => {
    const { ctx, calls } = createRecordingCtx();
    renderStyledText(
      ctx,
      [{ text: 'ABC' }],
      {
        x: 0,
        y: 0,
        width: 1000,
        fontSize: 24,
        fontFamily: 'sans-serif',
        defaultColor: '#fff',
        lineHeight: 32,
        lastCharOpacity: 0.4,
        lastCharEnd: 3,
      },
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual({ text: 'AB', alpha: 1 });
    expect(calls[1]).toEqual({ text: 'C', alpha: 0.4 });
  });

  it('draws unmarked body text at weight 400 and bold marks at 700', () => {
    const { ctx, fonts } = createRecordingCtx();
    renderStyledText(
      ctx,
      [{ text: 'plain' }, { text: 'heavy', bold: true }],
      {
        x: 0,
        y: 0,
        width: 1000,
        fontSize: 34,
        fontFamily: 'sans-serif',
        defaultColor: '#fff',
        lineHeight: 56,
      },
    );

    expect(fonts[0]).toContain('400');
    expect(fonts[0]).not.toContain('700');
    expect(fonts[1]).toContain('700');
  });

  it('truncates segments at character boundaries', () => {
    expect(truncateSegments([{ text: 'Hello' }, { text: 'World' }], 7)).toEqual([
      { text: 'Hello' },
      { text: 'Wo' },
    ]);
  });

  it('can slice a wrapped line from the full text without reflowing earlier content', () => {
    const ctx = createMockCtx();
    const segments = [{ text: 'Hello brave world' }];
    const lines = computeTextLayout(ctx, segments, {
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
    });

    expect(lines[0]).toEqual({ charStart: 0, charEnd: 6 });
    expect(sliceSegmentsByCharRange(segments, 0, 6)).toEqual([{ text: 'Hello ' }]);
    expect(sliceSegmentsByCharRange(segments, 6, 11)).toEqual([{ text: 'brave' }]);
  });

  it('supports centered line fades without character fade', () => {
    const { ctx, calls } = createRecordingCtx();
    const height = renderStyledText(
      ctx,
      [{ text: 'Line one\nLine two' }],
      {
        x: 0,
        y: 0,
        width: 200,
        fontSize: 20,
        fontFamily: 'sans-serif',
        defaultColor: '#fff',
        lineHeight: 24,
        align: 'center',
        lastLineOpacity: 0.5,
      },
    );

    expect(height).toBeGreaterThan(0);
    expect(calls.at(-1)?.alpha).toBe(0.5);
  });
});

describe('styled-text render plan', () => {
  it('uses the same wrapped layout across instant, line, and typewriter modes', () => {
    const ctx = createMockCtx();
    const segments = [{ text: 'Hello brave world' }];

    const instantPlan = buildStyledTextRenderPlan(ctx, segments, {
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
      displayMode: 'instant',
      progress: 1,
    });
    const linePlan = buildStyledTextRenderPlan(ctx, segments, {
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
      displayMode: 'line',
      progress: 0.5,
    });
    const typewriterPlan = buildStyledTextRenderPlan(ctx, segments, {
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
      displayMode: 'typewriter',
      progress: 0.4,
    });

    expect(instantPlan.layout.lines.map((line) => [line.charStart, line.charEnd])).toEqual([
      [0, 6],
      [6, 12],
      [12, 17],
    ]);
    expect(linePlan.layout.lines).toEqual(instantPlan.layout.lines);
    expect(typewriterPlan.layout.lines).toEqual(instantPlan.layout.lines);
  });

  it('builds a stable line reveal plan with only the newest line fading', () => {
    const ctx = createMockCtx();
    const plan = buildStyledTextRenderPlan(ctx, [{ text: 'Hello brave world' }], {
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
      displayMode: 'line',
      progress: 0.5,
    });

    expect(plan.lines).toEqual([
      { segments: [{ text: 'Hello ' }] },
      { segments: [{ text: 'brave ' }], lastLineOpacity: 0.75 },
    ]);
  });

  it('keeps the next line hidden until the current line finishes its 0.5s fade', () => {
    const ctx = createMockCtx();
    // At t=0.35s:
    // Line 0: fadeElapsed=0.35, fadeProgress=0.7, opacity=1-(1-0.7)^2=0.91
    // Line 1: still hidden because line 0 has not finished fading yet
    const plan = buildStyledTextRenderPlan(ctx, [{ text: 'Hello brave world' }], {
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
      displayMode: 'line',
      progress: 0.44,
      elapsedSeconds: 0.35,
      revealDurationSeconds: 1.7,
    });

    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]?.segments).toEqual([{ text: 'Hello ' }]);
    expect(plan.lines[0]?.lastLineOpacity).toBeCloseTo(0.91, 3);
  });

  it('keeps the next line hidden during the extra 0.15s pause after a line finishes', () => {
    const ctx = createMockCtx();
    // At t=0.60s:
    // Line 0 finished fading at 0.50s
    // Line 1 starts at 0.65s because of the extra 0.15s pause
    const plan = buildStyledTextRenderPlan(ctx, [{ text: 'Hello brave world' }], {
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
      displayMode: 'line',
      progress: 0.36,
      elapsedSeconds: 0.60,
      revealDurationSeconds: 1.7,
    });

    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]).toEqual({ segments: [{ text: 'Hello ' }] });
  });

  it('fades in the first line instead of showing it fully immediately', () => {
    const ctx = createMockCtx();
    // At t=0.15s: Line 0 fadeProgress=0.3, opacity=1-(1-0.3)^2=0.51
    const plan = buildStyledTextRenderPlan(ctx, [{ text: 'Hello brave world' }], {
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
      displayMode: 'line',
      progress: 0.08,
      elapsedSeconds: 0.15,
      revealDurationSeconds: 1.7,
    });

    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0]?.segments).toEqual([{ text: 'Hello ' }]);
    expect(plan.lines[0]?.lastLineOpacity).toBeCloseTo(0.51, 6);
  });

  it('starts the next line after the 0.15s extra pause once the previous line has finished', () => {
    const ctx = createMockCtx();
    // At t=0.70s:
    // Line 0: fully visible after 0.5s
    // Line 1: started at 0.65s, fadeElapsed=0.05, fadeProgress=0.1, opacity=0.19
    const plan = buildStyledTextRenderPlan(ctx, [{ text: 'Hello brave world' }], {
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
      displayMode: 'line',
      progress: 0.33,
      elapsedSeconds: 0.70,
      revealDurationSeconds: 3.4,
    });

    expect(plan.lines).toHaveLength(2);
    expect(plan.lines[0]).toEqual({ segments: [{ text: 'Hello ' }] });
    expect(plan.lines[1]?.segments).toEqual([{ text: 'brave ' }]);
    expect(plan.lines[1]?.lastLineOpacity).toBeCloseTo(0.19, 3);
  });

  it('builds a stable typewriter reveal plan without reflowing earlier lines', () => {
    const ctx = createMockCtx();
    const plan = buildStyledTextRenderPlan(ctx, [{ text: 'Hello brave world' }], {
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
      displayMode: 'typewriter',
      progress: 0.4,
    });

    expect(plan.lines).toEqual([
      { segments: [{ text: 'Hello ' }] },
      { segments: [{ text: 'b' }], lastCharOpacity: 0.9600000000000003, lastCharEnd: 1 },
    ]);
  });

  it('renders a reveal plan line-by-line using the precomputed opacity rules', () => {
    const { ctx, calls } = createRecordingCtx();
    const plan = buildStyledTextRenderPlan(ctx, [{ text: 'Hello brave world' }], {
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
      displayMode: 'line',
      progress: 0.5,
    });

    renderStyledTextPlan(ctx, plan, {
      x: 0,
      y: 0,
      width: 60,
      fontSize: 24,
      fontFamily: 'sans-serif',
      defaultColor: '#fff',
      lineHeight: 32,
    });

    expect(calls).toEqual([
      { text: 'Hello', alpha: 1 },
      { text: ' ', alpha: 1 },
      { text: 'brave', alpha: 0.75 },
      { text: ' ', alpha: 0.75 },
    ]);
  });
});

it('keeps dark ink crisp and only shadows light text across hex and RGB theme colors', () => {
  for (const color of ['#283744', '#333', 'rgb(40,55,68)', 'rgba(40,55,68,0.9)']) expect(textNeedsShadow(color)).toBe(false);
  for (const color of ['#edf5f8', '#fff', 'rgba(245,248,250,0.95)']) expect(textNeedsShadow(color)).toBe(true);
});

it('keeps closing Chinese punctuation off the beginning of a wrapped line', () => {
  const text = '甲乙丙丁，戊己。';
  const segments = [{ text }];
  const lines = computeTextLayout(createMockCtx(), segments, { width: 40, fontSize: 24, fontFamily: 'sans-serif' });
  expect(lines.map((line) => text.slice(line.charStart, line.charEnd))).toEqual(['甲乙丙', '丁，戊', '己。']);
  const plan = buildStyledTextRenderPlan(createMockCtx(), segments, { width: 40, fontSize: 24, fontFamily: 'sans-serif', displayMode: 'instant' });
  expect(plan.lines.map((line) => line.segments.map((segment) => segment.text).join(''))).toEqual(['甲乙丙', '丁，戊', '己。']);
});
