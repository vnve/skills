import { z } from 'zod/v3';

export const BUILTIN_DIALOGUE_THEME_IDS = ['classic', 'scifi', 'elegant', 'mystery', 'detective', 'daily', 'xianxia', 'wasteland'] as const;
const finite = z.number().finite();
const percent = finite.min(0).max(100);
const size = finite.min(0).max(4096);
const color = z.string().trim().min(1).max(200);
const font = z.string().trim().min(1).max(500);
export const dialogueDisplayModeSchema = z.enum(['typewriter', 'line', 'instant']);
/** Geometry is in reference-canvas pixels, except the documented percent fields. */
export const dialogueThemeDataSchema = z.object({
  boxGradient: z.object({ top: color, middle: color, bottom: color }).strict().nullable().optional(),
  boxBottomGap: size.optional(),
  boxDecoration: z.enum(['none', 'rule', 'corners', 'double-rule', 'side']).optional(),
  boxAccent: color.optional(),
  boxFill: color.optional(), boxStroke: color.optional(), textColor: color.optional(), nameColor: color.optional(),
  cornerRadius: size.optional(), nameplateFill: color.optional(), nameplateVisible: z.boolean().optional(),
  fontFamily: font.optional(), nameFontFamily: font.optional(),
  fontSize: finite.min(8).max(512).optional(), nameFontSize: finite.min(8).max(512).optional(),
  paddingX: size.optional(), paddingY: size.optional(), boxHeight: finite.positive().max(8192).optional(),
  boxWidthPercent: percent.positive().optional(), dialogueX: percent.optional(), dialogueY: percent.optional(),
  lineHeight: finite.min(0.5).max(5).optional(), defaultDisplayMode: dialogueDisplayModeSchema.optional(),
  nameplateX: percent.optional(), nameplateY: percent.optional(), nameplateWidth: percent.optional(), nameplateHeight: percent.optional(),
  nameplatePaddingX: size.optional(), nameplatePaddingY: size.optional(),
  bodyX: percent.optional(), bodyY: percent.optional(), bodyWidth: percent.positive().optional(), bodyHeight: percent.positive().optional(),
  boxImageAssetId: z.string().min(1).max(200).optional(),
  boxImageUrl: z.string().regex(/^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp|avif)$/i).max(1000).optional(),
  boxImageFit: z.enum(['stretch', 'contain', 'cover']).optional(), boxImageOpacity: finite.min(0).max(1).optional(),
  boxImageSlice: z.object({ top: size, right: size, bottom: size, left: size }).strict().optional(),
}).strict().superRefine((data, context) => {
  if (data.boxImageAssetId && !data.boxImageUrl) context.addIssue({ code: z.ZodIssueCode.custom, path: ['boxImageUrl'], message: 'A frame asset requires its imported local URL' });
  for (const [position, extent] of [['bodyX', 'bodyWidth'], ['bodyY', 'bodyHeight'], ['nameplateX', 'nameplateWidth'], ['nameplateY', 'nameplateHeight']] as const) {
    if (data[position] !== undefined && data[extent] !== undefined && data[position]! + data[extent]! > 100) context.addIssue({ code: z.ZodIssueCode.custom, path: [extent], message: 'The text area must fit inside the dialogue box' });
  }
});
export const dialogueThemeSchema = z.object({
  id: z.string().trim().min(1).max(200), name: z.string().trim().min(1).max(200),
  baseThemeId: z.enum(BUILTIN_DIALOGUE_THEME_IDS).default('classic'), data: dialogueThemeDataSchema,
}).strict();
