import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIALOGUE_THEME_ID,
  DIALOGUE_THEMES,
  GALGAME_CANVAS_HEIGHT,
  GALGAME_CANVAS_WIDTH,
  GALGAME_DIALOGUE_BOX_BOTTOM,
  GALGAME_DIALOGUE_BOX_HEIGHT,
  GALGAME_DIALOGUE_BOX_WIDTH,
  GALGAME_DIALOGUE_LAYOUT,
  canonicalDialogueThemeId,
  getDialogueBoxPixelRect,
  computeDialogueBoxPlacement,
  isDialogueStrokeVisible,
  resolveDialogueTheme,
  resolveDialogueThemeForCanvas,
  scaleDialogueThemeForPortrait,
} from '../themes';

describe('dialogue themes', () => {
  it('resolves default theme when no theme id is provided', () => {
    const theme = resolveDialogueTheme();
    expect(theme.id).toBe(DEFAULT_DIALOGUE_THEME_ID);
  });

  it('resolves explicit theme id', () => {
    const theme = resolveDialogueTheme('scifi');
    expect(theme.id).toBe('scifi');
    expect(theme.boxImageUrl).toBe('/dialogue-themes/scifi-v2.webp');
    expect(theme.nameColor).toBe('#a9d9e8');
  });

  it('maps legacy cinematic and vintage ids onto scifi and detective', () => {
    expect(canonicalDialogueThemeId('cinematic')).toBe('scifi');
    expect(canonicalDialogueThemeId('vintage')).toBe('detective');
    expect(resolveDialogueTheme('cinematic').id).toBe('scifi');
    expect(resolveDialogueTheme('vintage').id).toBe('detective');
    expect(resolveDialogueTheme('cinematic').boxImageUrl).toBe('/dialogue-themes/scifi-v2.webp');
    expect(resolveDialogueTheme('vintage').boxImageUrl).toBe('/dialogue-themes/detective-v2.png');
  });

  it('falls back to default theme for unknown theme id', () => {
    const theme = resolveDialogueTheme('unknown-theme');
    expect(theme.id).toBe(DEFAULT_DIALOGUE_THEME_ID);
  });

  it('strips undefined values from custom data so base preset defaults persist', () => {
    const customThemes = [
      {
        id: 'custom-1',
        name: 'Custom',
        baseThemeId: 'classic',
        data: { boxStroke: undefined, nameplateVisible: undefined },
      },
    ];
    const result = resolveDialogueTheme('custom-1', undefined, customThemes);
    // boxStroke should fall back to base preset, not be undefined
    expect(result.boxStroke).toBeDefined();
    expect(typeof result.boxStroke).toBe('string');
    expect(result.boxStroke.length).toBeGreaterThan(0);
  });

  it('all themes have required paint properties and keep a bottom gap', () => {
    expect(DIALOGUE_THEMES.map((theme) => theme.id)).toEqual([
      'classic',
      'scifi',
      'elegant',
      'mystery',
      'detective',
      'daily',
      'xianxia',
      'wasteland',
    ]);

    for (const theme of DIALOGUE_THEMES) {
      expect(theme.boxFill.length).toBeGreaterThan(0);
      expect(theme.boxStroke.length).toBeGreaterThan(0);
      expect(theme.textColor.length).toBeGreaterThan(0);
      expect(theme.nameColor.length).toBeGreaterThan(0);
      expect(theme.cornerRadius).toBeGreaterThanOrEqual(0);
      expect(theme.dialogueX).toBe(GALGAME_DIALOGUE_LAYOUT.dialogueX);
      expect(theme.fontSize).toBe(36);
      expect(theme.nameFontSize).toBe(33);
      expect(theme.lineHeight).toBe(1.5);
      expect(theme.nameplateVisible).toBe(false);
      // Three full lines and a readable single-line name must fit the safe areas.
      expect(theme.boxHeight * theme.bodyHeight / 100).toBeGreaterThanOrEqual(theme.fontSize * theme.lineHeight * 3 - 0.01);
      expect(theme.boxHeight * (theme.bodyY + theme.bodyHeight) / 100).toBeLessThanOrEqual(theme.boxHeight - 10);
      expect(GALGAME_CANVAS_WIDTH * theme.boxWidthPercent / 100 * theme.nameplateWidth / 100).toBeGreaterThanOrEqual(theme.nameFontSize * 12);
      expect(isDialogueStrokeVisible(theme.boxStroke)).toBe(false);
      const rect = getDialogueBoxPixelRect(theme);
      expect(GALGAME_CANVAS_HEIGHT - (rect.y + rect.height)).toBeCloseTo(theme.boxBottomGap ?? GALGAME_DIALOGUE_BOX_BOTTOM);
    }

    const classic = resolveDialogueTheme('classic');
    expect(classic.boxImageUrl).toBeUndefined();

    for (const theme of DIALOGUE_THEMES.filter((item) => item.id !== 'classic')) {
      expect(theme.boxImageUrl).toMatch(/^\/dialogue-themes\/[a-z-]+(?:-v2)?\.(webp|png)$/);
    }
  });

  it('uses a translucent slate box with distinct name and body colors', () => {
    const theme = resolveDialogueTheme('classic');
    expect(theme.boxImageUrl).toBeUndefined();
    expect(theme.boxGradient?.top).toBe('rgba(8,11,16,0)');
    expect(theme.textColor).toBe('#f2f3f5');
    expect(theme.nameColor).toBe('#d2dbe6');
    expect(theme.nameplateVisible).toBe(false);
    expect(isDialogueStrokeVisible(theme.boxStroke)).toBe(false);
  });

  it('extends the classic gradient to both sides and the bottom edge', () => {
    const theme = resolveDialogueTheme('classic');
    const rect = getDialogueBoxPixelRect(theme);
    expect(rect.width).toBeCloseTo(GALGAME_CANVAS_WIDTH);
    expect(rect.height).toBe(300);
    expect(GALGAME_CANVAS_HEIGHT - (rect.y + rect.height)).toBeCloseTo(theme.boxBottomGap ?? GALGAME_DIALOGUE_BOX_BOTTOM);
    expect(GALGAME_CANVAS_WIDTH).toBe(1920);
  });

  it('aligns names and body text and reserves a clear gap in every theme', () => {
    const scifi = resolveDialogueTheme('scifi');
    const elegant = resolveDialogueTheme('elegant');
    const mystery = resolveDialogueTheme('mystery');
    const detective = resolveDialogueTheme('detective');

    const classic = resolveDialogueTheme('classic');
    const daily = resolveDialogueTheme('daily');
    const xianxia = resolveDialogueTheme('xianxia');
    const wasteland = resolveDialogueTheme('wasteland');
    for (const theme of [classic, scifi, elegant, mystery, detective, daily, xianxia, wasteland]) {
      expect(theme.bodyX).toBeCloseTo(theme.nameplateX, 5);
    }

    for (const theme of [scifi, elegant, mystery, detective, daily, xianxia, wasteland]) {
      const nameTop = (theme.nameplateY / 100) * theme.boxHeight;
      const nameBottom = nameTop + (theme.nameplateHeight / 100) * theme.boxHeight;
      const bodyTop = (theme.bodyY / 100) * theme.boxHeight;
      expect(nameTop).toBeGreaterThan(8);
      expect(bodyTop).toBeGreaterThan(nameBottom);
    }
  });

  it('anchors a full-width classic surface to the bottom with stock Y values', () => {
    const theme = resolveDialogueTheme('classic', { dialogueY: 85 });
    const rect = computeDialogueBoxPlacement(theme);
    expect(GALGAME_CANVAS_HEIGHT - (rect.y + rect.height)).toBeCloseTo(theme.boxBottomGap ?? GALGAME_DIALOGUE_BOX_BOTTOM);
  });

  it('keeps the speaker name inside the nameplate tab rather than as a floating tag', () => {
    const theme = resolveDialogueTheme('classic');
    const boxW = GALGAME_CANVAS_WIDTH * (theme.boxWidthPercent / 100);
    const nameLeft = (theme.nameplateX / 100) * boxW;
    const nameTop = (theme.nameplateY / 100) * theme.boxHeight;
    const bodyTop = (theme.bodyY / 100) * theme.boxHeight;

    expect(nameLeft).toBeGreaterThan(0);
    expect(nameTop).toBeGreaterThan(0);
    expect(bodyTop).toBeGreaterThan(nameTop);
    expect(theme.bodyY).toBeGreaterThan(theme.nameplateY + theme.nameplateHeight);
  });

  it('honors solid fills and explicit gradient removal on custom themes', () => {
    expect(resolveDialogueTheme('classic', { boxFill: '#123456' }).boxGradient).toBeNull();
    expect(resolveDialogueTheme('classic', { boxGradient: null }).boxGradient).toBeNull();
    expect(resolveDialogueTheme('custom', undefined, [{ id: 'custom', name: 'Custom', data: { boxFill: '#123456' } }]).boxGradient).toBeNull();
  });

  it('falls back nameFontFamily for predefined theme overrides', () => {
    const theme = resolveDialogueTheme('classic', {
      fontFamily: 'Custom Sans',
      nameFontFamily: '',
    });

    expect(theme.fontFamily).toBe('Custom Sans');
    expect(theme.nameFontFamily).toBe('Custom Sans');
  });
});

describe('scaleDialogueThemeForPortrait', () => {
  it('returns original theme for landscape aspect', () => {
    const theme = resolveDialogueTheme('classic');
    const scaled = scaleDialogueThemeForPortrait(theme, 1920, 1080);
    expect(scaled.boxHeight).toBe(theme.boxHeight);
    expect(scaled.boxWidthPercent).toBe(theme.boxWidthPercent);
  });

  it('increases boxHeight proportionally for portrait aspect', () => {
    const theme = resolveDialogueTheme('classic');
    const scaled = scaleDialogueThemeForPortrait(theme, 1080, 1920);
    // heightFactor = 1920/1080 ≈ 1.778, so boxHeight should be roughly 260 * 1.778 ≈ 462
    expect(scaled.boxHeight).toBeGreaterThan(theme.boxHeight);
    expect(scaled.boxHeight).toBe(Math.round(theme.boxHeight * (1920 / 1080)));
    const rect = getDialogueBoxPixelRect(scaled, 1080, 1920);
    expect(1920 - (rect.y + rect.height)).toBeCloseTo(0);
  });

  it('ensures boxWidthPercent is at least 95 for portrait', () => {
    const theme = resolveDialogueTheme('classic');
    const scaled = scaleDialogueThemeForPortrait(theme, 1080, 1920);
    expect(scaled.boxWidthPercent).toBeGreaterThanOrEqual(95);
  });

  it('preserves a manually positioned dialogue box in portrait', () => {
    const theme = resolveDialogueTheme('classic', { dialogueY: 55 });
    const scaled = scaleDialogueThemeForPortrait(theme, 1080, 1920);
    expect(scaled.dialogueY).toBe(55);
    expect(getDialogueBoxPixelRect(scaled, 1080, 1920).centerY).toBe(1920 * 0.55);
  });

  it('returns original for square canvas', () => {
    const theme = resolveDialogueTheme('classic');
    const scaled = scaleDialogueThemeForPortrait(theme, 1080, 1080);
    expect(scaled.boxHeight).toBe(theme.boxHeight);
  });
});

describe('stock dialogue proportions across canvas resolutions', () => {
  it('keeps the 1080p dialogue height ratio on a 720p landscape canvas', () => {
    const theme = resolveDialogueThemeForCanvas('classic', undefined, undefined, 1280, 720);
    expect(theme.boxHeight / 720).toBeCloseTo(300 / 1080);
    expect(theme.fontSize).toBeCloseTo(24);
    expect(theme.nameFontSize).toBeCloseTo(22);
    const textWidth = 1280 * theme.boxWidthPercent / 100 * theme.bodyWidth / 100;
    expect(textWidth / theme.fontSize).toBeGreaterThan(40);
    expect(textWidth / theme.fontSize).toBeLessThan(42);
    const bodyHeight = theme.boxHeight * theme.bodyHeight / 100;
    expect(theme.fontSize * (1 + theme.lineHeight)).toBeLessThan(bodyHeight);
    expect(theme.nameFontSize).toBeLessThan(theme.boxHeight * theme.nameplateHeight / 100);
  });
  it('preserves authored height and font overrides', () => {
    const theme = resolveDialogueThemeForCanvas('classic', { boxHeight: 210, fontSize: 38 }, undefined, 1280, 720);
    expect(theme.boxHeight).toBe(210);
    expect(theme.fontSize).toBe(38);
  });
  it('preserves custom theme pixel geometry', () => {
    const theme = resolveDialogueThemeForCanvas('custom', undefined, [{ id: 'custom', name: 'Custom', data: { boxHeight: 300 } }], 1280, 720);
    expect(theme.boxHeight).toBe(300);
  });
});
