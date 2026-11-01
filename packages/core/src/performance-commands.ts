import { SCENE_TRANSITION_TYPES } from "./scene-transitions";
import { z } from "zod/v3";
const ref = z.string().trim().min(1);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const common = {
  enabled: z.boolean().optional(),
  dur: z.number().finite().min(0.2).max(30).optional(),
  await: z.boolean().optional(),
};
const direction = z.enum(["left", "right"]).optional();
const motion = {
  moveX: z.number().finite().min(-15).max(15).optional(),
  moveY: z.number().finite().min(-10).max(10).optional(),
  zoom: z.number().finite().min(1).max(1.2).optional(),
};
export const performanceCommandParamsSchemas = {
  transition: z
    .object({
      ...common,
      nextScene: ref,
      effect: z.enum(SCENE_TRANSITION_TYPES),
    })
    .strict(),
  parallax: z
    .object({
      ...common,
      ...motion,
      backgroundDepth: z.number().finite().min(0).max(1).optional(),
      actorDepth: z.number().finite().min(0).max(1).optional(),
      foregroundDepth: z.number().finite().min(0).max(1).optional(),
      foreground: ref.optional(),
    })
    .strict(),
  rackfocus: z
    .object({
      ...common,
      ...motion,
      fromTarget: ref.optional(),
      toTarget: ref,
      blur: z.number().finite().min(0).max(30).optional(),
    })
    .strict()
    .refine((p) => (p.fromTarget ?? "$background") !== p.toTarget, {
      message: "Focus targets must differ",
      path: ["toTarget"],
    }),
  comic: z
    .object({
      ...common,
      actor: ref,
      text: z.string().max(120).optional(),
      direction,
      accent: color.optional(),
    })
    .strict(),
  duel: z
    .object({
      ...common,
      actor: ref,
      other: ref,
      text: z.string().max(120).optional(),
      reply: z.string().max(120).optional(),
      split: z.number().min(0.3).max(0.7).optional(),
      pressure: z.number().min(-0.25).max(0.25).optional(),
      accent: color.optional(),
    })
    .strict()
    .refine((p) => p.actor !== p.other, {
      message: "duel requires two different actors",
      path: ["other"],
    }),
  introduce: z
    .object({
      ...common,
      actor: ref,
      title: ref.max(60),
      subtitle: z.string().max(160).optional(),
      direction,
      accent: color.optional(),
    })
    .strict(),
  memory: z
    .object({
      ...common,
      images: z
        .array(ref)
        .min(1)
        .max(6)
        .refine((v) => new Set(v).size === v.length, "Duplicate memory image"),
      caption: z.string().max(160).optional(),
    })
    .strict(),
  awake: z
    .object({
      ...common,
      actor: ref.optional(),
      blur: z.number().finite().min(0).max(30).optional(),
      blinks: z.number().int().min(1).max(2).optional(),
    })
    .strict(),
  wipe: z.object({ ...common, nextScene: ref, direction }).strict(),
} as const;
export type PerformanceCommandName =
  keyof typeof performanceCommandParamsSchemas;
export const performanceCommands = {
  transition: {
    label: "场景转场",
    english: "Scene transition",
    description: "以精选方式切换到紧邻下一场",
    dur: 0.8,
    defaults: { effect: "dissolve", nextScene: "" },
    placement: "scene-end",
  },
  parallax: {
    label: "多层视差",
    english: "Parallax",
    description: "背景、人物与可选透明前景的纵深运镜",
    dur: 6,
    defaults: {
      moveX: 3,
      moveY: 0,
      zoom: 1.04,
      backgroundDepth: 0.2,
      actorDepth: 0.6,
      foregroundDepth: 1,
    },
    placement: "inline",
  },
  rackfocus: {
    label: "景深拉焦",
    english: "Rack focus",
    description: "背景与人物之间连续转移清晰焦点",
    dur: 4,
    defaults: {
      fromTarget: "$background",
      toTarget: "",
      blur: 12,
      moveX: 0,
      moveY: 0,
      zoom: 1,
    },
    placement: "inline",
  },
  comic: {
    label: "漫画切入",
    english: "Comic cut-in",
    description: "斜切人物特写与强调文字",
    dur: 3,
    defaults: { actor: "", text: "", direction: "left", accent: "#a44a42" },
    placement: "inline",
  },
  duel: {
    label: "双人对峙",
    english: "Duel split",
    description: "双人分屏与构图压力变化",
    dur: 4,
    defaults: {
      actor: "",
      other: "",
      split: 0.5,
      pressure: 0,
      accent: "#a44a42",
    },
    placement: "inline",
  },
  introduce: {
    label: "人物介绍",
    english: "Character introduction",
    description: "人物与图形化姓名介绍",
    dur: 4,
    defaults: {
      actor: "",
      title: "",
      subtitle: "",
      direction: "left",
      accent: "#a44a42",
    },
    placement: "inline",
  },
  memory: {
    label: "记忆碎片",
    english: "Memory fragments",
    description: "图片依次浮现并合拢",
    dur: 5,
    defaults: { images: [] as string[], caption: "" },
    placement: "inline",
  },
  awake: {
    label: "主观苏醒",
    english: "Awakening",
    description: "睁闭眼与场景整体恢复清晰",
    dur: 6,
    defaults: { blur: 18, blinks: 2 },
    placement: "inline",
  },
  wipe: {
    label: "擦镜换场",
    english: "Foreground wipe",
    description: "在场尾遮挡中切换到紧邻下一场",
    dur: 1,
    defaults: { nextScene: "", direction: "left" },
    placement: "scene-end",
  },
} as const;
export function isPerformanceCommand(
  name: string,
): name is PerformanceCommandName {
  return Object.hasOwn(performanceCommandParamsSchemas, name);
}
