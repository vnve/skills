import { describe, expect, it } from 'vitest';
import { scaleDialogueThemeForRender } from '../konva-renderer';
import { resolveDialogueTheme } from '../themes';

describe('scaleDialogueThemeForRender', () => {
  it('scales pixel-based dialogue theme fields linearly', () => {
    const base = resolveDialogueTheme('classic');

    const half = scaleDialogueThemeForRender(base, 0.5);
    const double = scaleDialogueThemeForRender(base, 2);

    expect(half.boxHeight).toBeCloseTo(base.boxHeight * 0.5);
    expect(half.paddingX).toBeCloseTo(base.paddingX * 0.5);
    expect(half.paddingY).toBeCloseTo(base.paddingY * 0.5);
    expect(half.fontSize).toBeCloseTo(base.fontSize * 0.5);
    expect(half.nameFontSize).toBeCloseTo(base.nameFontSize * 0.5);
    expect(half.cornerRadius).toBeCloseTo(base.cornerRadius * 0.5);

    expect(double.boxHeight).toBeCloseTo(base.boxHeight * 2);
    expect(double.paddingX).toBeCloseTo(base.paddingX * 2);
    expect(double.paddingY).toBeCloseTo(base.paddingY * 2);
    expect(double.fontSize).toBeCloseTo(base.fontSize * 2);
    expect(double.nameFontSize).toBeCloseTo(base.nameFontSize * 2);
    expect(double.cornerRadius).toBeCloseTo(base.cornerRadius * 2);
  });

  it('does not scale percentage positioning fields', () => {
    const base = resolveDialogueTheme('classic');
    const scaled = scaleDialogueThemeForRender(base, 0.5);

    expect(scaled.dialogueX).toBe(base.dialogueX);
    expect(scaled.dialogueY).toBe(base.dialogueY);
    expect(scaled.boxWidthPercent).toBe(base.boxWidthPercent);
    expect(scaled.nameplateX).toBe(base.nameplateX);
    expect(scaled.nameplateY).toBe(base.nameplateY);
    expect(scaled.nameplateWidth).toBe(base.nameplateWidth);
    expect(scaled.bodyX).toBe(base.bodyX);
    expect(scaled.bodyWidth).toBe(base.bodyWidth);
    expect(scaled.lineHeight).toBe(base.lineHeight);
  });
});
