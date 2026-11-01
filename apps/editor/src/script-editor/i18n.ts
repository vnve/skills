import { commonEffectLabels } from "@vnve/core";
import { performanceCommands, isPerformanceCommand } from "@vnve/core";
import type { ExtendedSlotName } from "../core/stage-utils";

type TranslateFn = (key: string, options?: Record<string, unknown>) => unknown;

const COMMAND_LABEL_KEYS: Record<string, string> = {
  animation: "editor.script.cmdAnimation",
  show: "editor.script.cmdShow",
  hide: "editor.script.cmdHide",
  move: "editor.script.cmdMove",
  shake: "editor.script.cmdShake",
  hop: "editor.script.cmdHop",
  set: "editor.script.cmdSet",
  say: "editor.script.cmdSay",
  narrate: "editor.script.cmdNarrate",
  wait: "editor.script.cmdWait",
  bgm: "editor.script.cmdBgm",
  sfx: "editor.script.cmdSfx",
  dim: "editor.script.cmdDim",
  blur: "editor.script.cmdBlur",
  filter: "editor.script.cmdFilter",
  flash: "editor.script.cmdFlash",
  vibrate: "editor.script.cmdVibrate",
  rain: "editor.script.cmdRain",
  snow: "editor.script.cmdSnow",
  tint: "editor.script.cmdTint",
  rotate: "editor.script.cmdRotate",
  zoom: "editor.script.cmdZoom",
  camera: "editor.script.cmdCameraName",
  interjection: "editor.script.cmdInterjection",
};

const SLOT_LABEL_KEYS: Record<ExtendedSlotName, string> = {
  center: "editor.canvas.center",
  left: "editor.canvas.left",
  right: "editor.canvas.right",
  "support-left": "editor.canvas.farLeft",
  "support-right": "editor.canvas.farRight",
  "off-left": "editor.script.offStageLeft",
  "off-right": "editor.script.offStageRight",
};

const SLOT_SHORT_LABEL_KEYS: Record<ExtendedSlotName, string> = {
  center: "editor.script.slotShort.center",
  left: "editor.script.slotShort.left",
  right: "editor.script.slotShort.right",
  "support-left": "editor.script.slotShort.supportLeft",
  "support-right": "editor.script.slotShort.supportRight",
  "off-left": "editor.script.slotShort.offLeft",
  "off-right": "editor.script.slotShort.offRight",
};

const PARAM_LABEL_KEYS: Record<string, string> = {
  clipId: "editor.script.param.clipId",
  enabled: "editor.script.param.enabled",
  weight: "editor.script.param.weight",
  actor: "editor.script.param.actor",
  target: "editor.script.param.target",
  variant: "editor.script.param.variant",
  with: "editor.script.param.with",
  text: "editor.script.param.text",
  to: "editor.script.param.to",
  toX: "editor.script.param.toX",
  toY: "editor.script.param.toY",
  x: "editor.script.param.x",
  y: "editor.script.param.y",
  action: "editor.script.param.action",
  asset: "editor.script.param.asset",
  volume: "editor.script.param.volume",
  fade: "editor.script.param.fade",
  loop: "editor.script.param.loop",
  duck: "editor.script.param.duck",
  amp: "editor.script.param.amp",
  dur: "editor.script.param.duration",
  ease: "editor.script.param.ease",
  brightness: "editor.script.param.brightness",
  blur: "editor.script.param.blur",
  color: "editor.script.param.color",
  opacity: "editor.script.param.opacity",
  angle: "editor.script.param.angle",
  scale: "editor.script.param.scale",
  zoom: "editor.script.param.zoom",
  seconds: "editor.script.param.seconds",
  intensity: "editor.script.param.intensity",
  stop: "editor.script.param.stop",
};

const OPTION_LABEL_KEYS: Record<string, string> = {
  play: "editor.script.option.play",
  stop: "editor.script.option.stop",
  pause: "editor.script.option.pause",
  resume: "editor.script.option.resume",
  focus: "editor.script.option.focus",
  reset: "editor.script.option.reset",
  actor: "editor.script.option.actor",
  point: "editor.script.option.point",
  linear: "editor.script.option.linear",
  easeIn: "editor.script.option.easeIn",
  easeOut: "editor.script.option.easeOut",
  easeInOut: "editor.script.option.easeInOut",
  fade: "editor.script.option.fade",
  cut: "editor.script.option.cut",
  "slide-left": "editor.script.option.slideLeft",
  "slide-right": "editor.script.option.slideRight",
  "slide-up": "editor.script.option.slideUp",
  "slide-down": "editor.script.option.slideDown",
  none: "editor.script.option.none",
  white: "editor.script.option.white",
  "#ffffff": "editor.script.option.white",
  red: "editor.script.option.red",
  "#ff0000": "editor.script.option.red",
  yellow: "editor.script.option.yellow",
  "#ffff00": "editor.script.option.yellow",
  black: "editor.script.option.black",
  "#000000": "editor.script.option.black",
  blue: "editor.script.option.blue",
  "#0000ff": "editor.script.option.blue",
  green: "editor.script.option.green",
  "#00ff00": "editor.script.option.green",
  true: "editor.script.option.true",
  false: "editor.script.option.false",
  center: "editor.canvas.center",
  left: "editor.canvas.left",
  right: "editor.canvas.right",
  "support-left": "editor.canvas.farLeft",
  "support-right": "editor.canvas.farRight",
  "off-left": "editor.script.offStageLeft",
  "off-right": "editor.script.offStageRight",
  laughs: "editor.script.option.laughs",
  chuckle: "editor.script.option.chuckle",
  coughs: "editor.script.option.coughs",
  "clear-throat": "editor.script.option.clearThroat",
  groans: "editor.script.option.groans",
  breath: "editor.script.option.breath",
  pant: "editor.script.option.pant",
  inhale: "editor.script.option.inhale",
  exhale: "editor.script.option.exhale",
  gasps: "editor.script.option.gasps",
  sniffs: "editor.script.option.sniffs",
  sighs: "editor.script.option.sighs",
  snorts: "editor.script.option.snorts",
  burps: "editor.script.option.burps",
  "lip-smacking": "editor.script.option.lipSmacking",
  humming: "editor.script.option.humming",
  hissing: "editor.script.option.hissing",
  emm: "editor.script.option.emm",
  sneezes: "editor.script.option.sneezes",
  light: "editor.script.option.light",
  normal: "editor.script.option.normal",
  heavy: "editor.script.option.heavy",
};

export function getCommandLabel(t: TranslateFn, commandName: string): string {
  if (Object.hasOwn(commonEffectLabels, commandName))
    return commonEffectLabels[commandName as keyof typeof commonEffectLabels];
  if (isPerformanceCommand(commandName))
    return performanceCommands[commandName].label;
  const key = COMMAND_LABEL_KEYS[commandName];
  return key ? String(t(key)) : commandName;
}

export function getSlotLabel(
  t: TranslateFn,
  slotName: ExtendedSlotName,
): string {
  return String(t(SLOT_LABEL_KEYS[slotName]));
}

export function getSlotShortLabel(
  t: TranslateFn,
  slotName: ExtendedSlotName,
): string {
  return String(t(SLOT_SHORT_LABEL_KEYS[slotName]));
}

export function getScriptParamLabel(t: TranslateFn, paramKey: string): string {
  const extra: Record<string, string> = {
    moveX: "水平移动（画幅%）",
    moveY: "垂直移动（画幅%）",
    zoom: "推进倍率",
    backgroundDepth: "背景深度",
    actorDepth: "人物深度",
    foregroundDepth: "前景深度",
    foreground: "透明前景",
    fromTarget: "起始焦点",
    toTarget: "结束焦点",
    other: "另一人物",
    images: "记忆图片（按顺序）",
    caption: "说明文字",
    nextScene: "下一场景",
    title: "姓名／标题",
    subtitle: "身份／描述",
    accent: "强调色",
    direction: "方向",
    split: "初始分屏比例",
    pressure: "分界线推进",
    reply: "回应文字",
    blinks: "睁眼次数",
  };
  if (extra[paramKey]) return extra[paramKey];
  const key = PARAM_LABEL_KEYS[paramKey];
  return key ? String(t(key)) : paramKey;
}

export function getScriptOptionLabel(
  t: TranslateFn,
  optionValue: string,
  fallbackLabel: string,
): string {
  const key = OPTION_LABEL_KEYS[optionValue];
  return key ? String(t(key)) : fallbackLabel;
}
