import type { DialogueBoxImageFit, DialogueBoxImageSlice, TextDisplayMode } from '@vnve/core';

export interface DialogueThemeConfig {
  id: string;
  name: string;
  boxFill: string;
  boxGradient?: { top: string; middle: string; bottom: string } | null;
  boxBottomGap?: number;
  boxDecoration?: 'none' | 'rule' | 'corners' | 'double-rule' | 'side';
  boxAccent?: string;
  boxStroke: string;
  textColor: string;
  nameColor: string;
  cornerRadius: number;
  nameplateFill: string;
  nameplateVisible: boolean;
  fontFamily: string;
  nameFontFamily: string;
  fontSize: number;
  nameFontSize: number;
  paddingX: number;
  paddingY: number;
  boxHeight: number;
  boxWidthPercent: number;
  dialogueX: number;
  dialogueY: number;
  lineHeight: number;
  defaultDisplayMode: TextDisplayMode;
  /** Percent values relative to dialogue box width/height (0-100). */
  nameplateX: number;
  nameplateY: number;
  nameplateWidth: number;
  nameplateHeight: number;
  /** Horizontal padding inside nameplate background (px, before render scale). */
  nameplatePaddingX: number;
  /** Vertical padding inside nameplate background (px, before render scale). */
  nameplatePaddingY: number;
  bodyX: number;
  bodyY: number;
  bodyWidth: number;
  bodyHeight: number;
  boxImageAssetId?: string;
  boxImageUrl?: string;
  boxImageFit?: DialogueBoxImageFit;
  boxImageOpacity?: number;
  boxImageSlice?: DialogueBoxImageSlice;
}

export interface CustomThemeEntry {
  id: string;
  name: string;
  baseThemeId?: string;
  data: Record<string, unknown>;
}

/** Custom themes do not inherit Classic's black fill, hairline stroke, or rounded corners. */
export const CUSTOM_THEME_BOX_CHROME = {
  boxFill: 'rgba(0, 0, 0, 0)',
  boxStroke: 'rgba(0, 0, 0, 0)',
  cornerRadius: 0,
  boxGradient: null,
  boxDecoration: 'none',
} as const;

/** Reference canvas and shared framed ADV geometry. Classic uses a full-width fade. */
export const GALGAME_CANVAS_WIDTH = 1920;
export const GALGAME_CANVAS_HEIGHT = 1080;
export const GALGAME_DIALOGUE_BOX_WIDTH = 1600;
export const GALGAME_DIALOGUE_BOX_HEIGHT = 230;
export const GALGAME_DIALOGUE_BOX_LEFT = 160;
export const GALGAME_DIALOGUE_BOX_TOP = 780;
export const GALGAME_DIALOGUE_BOX_BOTTOM = 70;

const SANS_FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif';
const SERIF_FONT = 'Georgia, "Noto Serif SC", "Source Han Serif SC", "STSong", serif';

/**
 * Shared ADV / Galgame dialogue layout for a 1920×1080 canvas:
 * 1600×230 box, left 160px, top 780px (70px from the bottom).
 */
export const GALGAME_DIALOGUE_LAYOUT = {
  cornerRadius: 0,
  fontSize: 36,
  nameFontSize: 33,
  paddingX: 60,
  paddingY: 28,
  boxHeight: GALGAME_DIALOGUE_BOX_HEIGHT,
  boxWidthPercent: (GALGAME_DIALOGUE_BOX_WIDTH / GALGAME_CANVAS_WIDTH) * 100,
  dialogueX: 50,
  dialogueY: ((GALGAME_DIALOGUE_BOX_TOP + GALGAME_DIALOGUE_BOX_HEIGHT / 2) / GALGAME_CANVAS_HEIGHT) * 100,
  lineHeight: 1.5,
  defaultDisplayMode: 'typewriter' as TextDisplayMode,
  nameplateX: (55 / GALGAME_DIALOGUE_BOX_WIDTH) * 100,
  nameplateY: (24 / GALGAME_DIALOGUE_BOX_HEIGHT) * 100,
  nameplateWidth: 42,
  nameplateHeight: (40 / GALGAME_DIALOGUE_BOX_HEIGHT) * 100,
  nameplatePaddingX: 0,
  nameplatePaddingY: 0,
  bodyX: (55 / GALGAME_DIALOGUE_BOX_WIDTH) * 100,
  bodyY: (78 / GALGAME_DIALOGUE_BOX_HEIGHT) * 100,
  bodyWidth: (1480 / GALGAME_DIALOGUE_BOX_WIDTH) * 100,
  bodyHeight: (126 / GALGAME_DIALOGUE_BOX_HEIGHT) * 100,
} as const;

export interface DialogueBoxPixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

const LEGACY_STOCK_DIALOGUE_Y = [84, 85, 86, 90];

function isStockDialogueY(dialogueY: number): boolean {
  if (!Number.isFinite(dialogueY)) return true;
  if (Math.abs(dialogueY - GALGAME_DIALOGUE_LAYOUT.dialogueY) < 0.6) return true;
  return LEGACY_STOCK_DIALOGUE_Y.some((value) => Math.abs(dialogueY - value) < 0.6);
}

export function getDialogueBottomGap(canvasHeight: number): number {
  return canvasHeight * (GALGAME_DIALOGUE_BOX_BOTTOM / GALGAME_CANVAS_HEIGHT);
}

/**
 * Place the dialogue box on a canvas. Stock / legacy default Y values are
 * bottom-anchored using boxBottomGap, or a 70px gap on 1080p when unspecified.
 * A user-dragged Y is honored as a center percentage.
 */
export function computeDialogueBoxPlacement(
  theme: Pick<DialogueThemeConfig, 'boxWidthPercent' | 'boxHeight' | 'dialogueX' | 'dialogueY' | 'boxBottomGap'>,
  canvasWidth = GALGAME_CANVAS_WIDTH,
  canvasHeight = GALGAME_CANVAS_HEIGHT,
): DialogueBoxPixelRect {
  const width = canvasWidth * (theme.boxWidthPercent / 100);
  const height = theme.boxHeight;
  const centerX = (theme.dialogueX / 100) * canvasWidth;
  const bottomGap = theme.boxBottomGap ?? getDialogueBottomGap(canvasHeight);
  const centerY = isStockDialogueY(theme.dialogueY)
    ? canvasHeight - height / 2 - bottomGap
    : (theme.dialogueY / 100) * canvasHeight;
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    centerX,
    centerY,
  };
}

export function getDialogueBoxPixelRect(
  theme: Pick<DialogueThemeConfig, 'boxWidthPercent' | 'boxHeight' | 'dialogueX' | 'dialogueY' | 'boxBottomGap'>,
  canvasWidth = GALGAME_CANVAS_WIDTH,
  canvasHeight = GALGAME_CANVAS_HEIGHT,
): DialogueBoxPixelRect {
  return computeDialogueBoxPlacement(theme, canvasWidth, canvasHeight);
}

export function isDialogueStrokeVisible(stroke: string | undefined): boolean {
  if (!stroke) return false;
  const value = stroke.trim().toLowerCase();
  if (!value || value === 'none' || value === 'transparent') return false;
  const rgba = value.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+(?:\s*,\s*([\d.]+))?\s*\)/);
  if (rgba) {
    const alpha = rgba[1] === undefined ? 1 : Number(rgba[1]);
    return Number.isFinite(alpha) && alpha > 0.01;
  }
  return true;
}

function galgameTheme(
  partial: Pick<DialogueThemeConfig, 'id' | 'name' | 'boxFill' | 'boxStroke' | 'textColor' | 'nameColor'>
    & Partial<DialogueThemeConfig>,
): DialogueThemeConfig {
  return {
    ...GALGAME_DIALOGUE_LAYOUT,
    fontFamily: SANS_FONT,
    nameFontFamily: SANS_FONT,
    nameplateVisible: false,
    nameplateFill: 'rgba(0, 0, 0, 0)',
    ...partial,
  };
}

export const DEFAULT_DIALOGUE_THEME_ID = 'classic';

/** Older preset ids still stored on projects. */
const DIALOGUE_THEME_ID_ALIASES: Record<string, string> = {
  cinematic: 'scifi',
  vintage: 'detective',
};

export function canonicalDialogueThemeId(themeId?: string): string {
  if (!themeId) return DEFAULT_DIALOGUE_THEME_ID;
  return DIALOGUE_THEME_ID_ALIASES[themeId] ?? themeId;
}

/** Geometry follows the actual image's name tab and quiet reading area. */
function frameLayout(width: number, height: number, name: [number, number, number, number], body: [number, number, number, number]) {
  return {
    boxWidthPercent: width / GALGAME_CANVAS_WIDTH * 100, boxHeight: height,
    nameplateX: name[0] / width * 100, nameplateY: name[1] / height * 100,
    nameplateWidth: name[2] / width * 100, nameplateHeight: name[3] / height * 100,
    bodyX: body[0] / width * 100, bodyY: body[1] / height * 100,
    bodyWidth: body[2] / width * 100, bodyHeight: body[3] / height * 100,
  };
}

/** Reading areas stay quiet; the surface supplies only the theme's visual accent. */
export const DIALOGUE_THEMES: DialogueThemeConfig[] = [
  galgameTheme({
    id: 'classic', name: 'Classic',
    boxFill: 'rgba(8, 11, 16, 0.9)', boxStroke: 'transparent',
    boxGradient: { top: 'rgba(8,11,16,0)', middle: 'rgba(8,11,16,0.78)', bottom: 'rgba(8,11,16,0.94)' },
    textColor: '#f2f3f5', nameColor: '#d2dbe6',
    boxHeight: 300, boxWidthPercent: 100, boxBottomGap: 0,
    nameplateX: 11, nameplateY: 22, nameplateWidth: 75, nameplateHeight: 14,
    bodyX: 11, bodyY: 42, bodyWidth: 78, bodyHeight: 54,
  }),
  galgameTheme({
    id: 'scifi', name: 'Sci-Fi',
    boxFill: 'rgba(10,21,32,0.94)', boxStroke: 'transparent',
    textColor: '#edf5f8', nameColor: '#a9d9e8',
    boxImageUrl: '/dialogue-themes/scifi-v2.webp',
    ...frameLayout(1600, 300, [88,12,610,58], [88,98,1424,162]),
  }),
  galgameTheme({
    id: 'elegant', name: 'Elegant',
    boxFill: 'rgba(31,25,24,0.95)', boxStroke: 'transparent',
    textColor: '#f1e9dc', nameColor: '#dbc399',
    fontFamily: SERIF_FONT, nameFontFamily: SERIF_FONT,
    boxImageUrl: '/dialogue-themes/elegant-v2.webp',
    ...frameLayout(1600, 300, [88,9,535,58], [88,100,1424,162]),
  }),
  galgameTheme({
    id: 'mystery', name: 'Mystery',
    boxFill: 'rgba(26,25,24,0.97)', boxStroke: 'transparent',
    textColor: '#eeeae5', nameColor: '#d7d2c7',
    boxImageUrl: '/dialogue-themes/mystery-v2.webp',
    ...frameLayout(1600, 300, [140,16,600,46], [140,100,1380,162]),
  }),
  galgameTheme({
    id: 'detective', name: 'Detective',
    boxFill: 'rgba(31,26,22,0.95)', boxStroke: 'transparent',
    textColor: '#efe7d9', nameColor: '#ddc8a1',
    fontFamily: SERIF_FONT, nameFontFamily: SERIF_FONT,
    boxImageUrl: '/dialogue-themes/detective-v2.png',
    ...frameLayout(1600, 300, [100,26,650,44], [100,96,1400,162]),
  }),
  galgameTheme({
    id: 'daily', name: 'Daily',
    boxFill: 'rgba(245,248,250,0.96)', boxStroke: 'transparent',
    textColor: '#283744', nameColor: '#36677a',
    boxImageUrl: '/dialogue-themes/daily-v2.png',
    ...frameLayout(1600, 300, [80,28,650,44], [80,96,1400,162]),
  }),
  galgameTheme({
    id: 'xianxia', name: 'Xianxia',
    boxFill: 'rgba(228,237,229,0.96)', boxStroke: 'transparent',
    textColor: '#293e35', nameColor: '#416b55',
    fontFamily: SERIF_FONT, nameFontFamily: SERIF_FONT,
    boxImageUrl: '/dialogue-themes/xianxia-v2.png',
    ...frameLayout(1600, 310, [150,28,650,44], [150,100,1300,162]),
  }),
  galgameTheme({
    id: 'wasteland', name: 'Wasteland',
    boxFill: 'rgba(28,28,24,0.96)', boxStroke: 'transparent',
    textColor: '#e9e4d5', nameColor: '#d4bf87',
    boxImageUrl: '/dialogue-themes/wasteland-v2.png',
    ...frameLayout(1600, 300, [90,28,650,44], [90,96,1420,162]),
  }),
];

/**
 * Adjusts a dialogue theme for portrait canvas.
 * Portrait canvases are taller, so boxHeight needs to increase proportionally,
 * and boxWidthPercent should fill more of the narrower width.
 */
export function scaleDialogueThemeForPortrait(
  theme: DialogueThemeConfig,
  canvasWidth: number,
  canvasHeight: number,
): DialogueThemeConfig {
  if (canvasHeight <= canvasWidth) return theme;

  // Portrait: scale boxHeight proportionally to maintain similar visual ratio
  // Keep the preset surface height ratio on taller canvases.
  const heightFactor = canvasHeight / 1080;
  const scaledBoxHeight = Math.round(theme.boxHeight * heightFactor);
  const bottomGap = theme.boxBottomGap === undefined ? getDialogueBottomGap(canvasHeight) : theme.boxBottomGap * heightFactor;
  const centerY = canvasHeight - scaledBoxHeight / 2 - bottomGap;

  return {
    ...theme,
    boxHeight: scaledBoxHeight,
    ...(theme.boxBottomGap !== undefined ? { boxBottomGap: bottomGap } : {}),
    boxWidthPercent: Math.max(theme.boxWidthPercent, 95),
    dialogueY: isStockDialogueY(theme.dialogueY)
      ? (centerY / canvasHeight) * 100
      : theme.dialogueY,
  };
}

export function resolveDialogueTheme(
  themeId?: string,
  overrides?: Partial<Omit<DialogueThemeConfig, 'id' | 'name'>>,
  customThemes?: CustomThemeEntry[],
): DialogueThemeConfig {
  // Strip undefined values so they don't override base preset defaults
  const stripUndefined = <T extends Record<string, unknown>>(obj: T): Partial<T> => {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) result[k] = v;
    }
    return result as Partial<T>;
  };

  // A user-authored solid fill takes precedence over the preset's gradient.
  const paintOverrides = (data: Record<string, unknown>) => ({
    ...stripUndefined(data),
    ...(data.boxFill !== undefined && data.boxGradient === undefined ? { boxGradient: null } : {}),
  });

  // Try custom theme first
  if (themeId && customThemes) {
    const custom = customThemes.find((t) => t.id === themeId);
    if (custom) {
      const basePreset = custom.baseThemeId
        ? (DIALOGUE_THEMES.find((t) => t.id === canonicalDialogueThemeId(custom.baseThemeId)) ?? DIALOGUE_THEMES[0])
        : DIALOGUE_THEMES[0];
      const merged: DialogueThemeConfig = {
        ...basePreset,
        id: custom.id,
        name: custom.name,
        ...paintOverrides(custom.data as Record<string, unknown>),
      };
      const result = !overrides ? merged : { ...merged, ...paintOverrides(overrides as Record<string, unknown>) };
      // Fallback nameFontFamily to fontFamily when not explicitly set
      if (!result.nameFontFamily) result.nameFontFamily = result.fontFamily;
      return result;
    }
  }

  // Predefined theme
  const base = themeId
    ? (DIALOGUE_THEMES.find((theme) => theme.id === canonicalDialogueThemeId(themeId)) ?? DIALOGUE_THEMES[0])
    : DIALOGUE_THEMES[0];
  if (!overrides) return base;
  const result = { ...base, ...paintOverrides(overrides as Record<string, unknown>) };
  if (!result.nameFontFamily) result.nameFontFamily = result.fontFamily;
  return result;
}

/** Resolve stock landscape presets against their 1080p reference, preserving authored pixel overrides. */
export function resolveDialogueThemeForCanvas(
  themeId: string | undefined,
  overrides: Partial<Omit<DialogueThemeConfig, 'id' | 'name'>> | undefined,
  customThemes: CustomThemeEntry[] | undefined,
  width: number,
  height: number,
): DialogueThemeConfig {
  const theme = resolveDialogueTheme(themeId, overrides, customThemes);
  if (height > width) return scaleDialogueThemeForPortrait(theme, width, height);
  if (customThemes?.some((entry) => entry.id === themeId)) return theme;
  const factor = height / GALGAME_CANVAS_HEIGHT;
  const result = { ...theme };
  for (const key of ['boxBottomGap', 'boxHeight', 'fontSize', 'nameFontSize', 'paddingX', 'paddingY', 'cornerRadius', 'nameplatePaddingX', 'nameplatePaddingY'] as const) {
    if (overrides?.[key] === undefined && theme[key] !== undefined) result[key] = theme[key]! * factor;
  }
  return result;
}
