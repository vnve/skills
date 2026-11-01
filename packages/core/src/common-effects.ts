import { performanceCommands } from "./performance-commands";
/** Common creative entry points; low-level tags remain editable but are not suggestions. */
export const COMMON_VISUAL_COMMANDS = [
  "presence",
  "move",
  "set",
  "reaction",
  "camera",
  "vibrate",
  "flash",
  "weather",
  "interjection",
  "comic",
  "duel",
  "introduce",
  "memory",
  "awake",
  "transition",
  "animation",
] as const;
export const commonEffectLabels = {
  presence: "出场／退场",
  reaction: "动作强调",
  weather: "雨／雪",
  camera: "镜头构图",
  transition: "场景转场",
} as const;

export function depthCameraMode(tag: import("./types/script").InlineTag) {
  if (tag.name === "rackfocus" || tag.name === "parallax") return tag.name;
  if (
    tag.name === "camera" &&
    (tag.params.action === "rackfocus" || tag.params.action === "parallax")
  )
    return tag.params.action;
  return null;
}
export function cameraActionDefaults(action: string): Record<string, unknown> {
  if (action === "rackfocus" || action === "parallax") {
    const command = performanceCommands[action];
    return { action, ...command.defaults, dur: command.dur };
  }
  const values: Record<string, Record<string, unknown>> = {
    push: { zoom: 1.08, dur: 0.8 },
    pull: { zoom: 1, dur: 0.8 },
    focus: { target: "actor", zoom: 1.5, dur: 0.6 },
    duo: { dur: 0.8 },
    reset: { dur: 0.6 },
  };
  return { action, ...values[action] };
}
