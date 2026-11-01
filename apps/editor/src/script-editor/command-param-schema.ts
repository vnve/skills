import { cameraActionDefaults, sceneTransitionOptions } from "@vnve/core";
import { performanceCommands } from "@vnve/core";
import {
  DEFAULT_BGM_DUCK,
  DEFAULT_BGM_FADE,
  DEFAULT_BGM_LOOP,
  DEFAULT_BGM_VOLUME,
  DEFAULT_SFX_VOLUME,
  commandParamsSchemas,
  type CommandName,
  type CommandParamsByName,
} from "@vnve/core";
import { DEFAULT_DURATIONS } from "@vnve/parser";
import { z } from "zod/v3";

export type ParamSchema =
  | {
      control: "image-list" | "scene-select" | "color" | "image-select";
      required: boolean;
    }
  | { control: "actor-select"; required: boolean }
  | { control: "set-target-select"; required: boolean }
  | { control: "set-variant-select"; required: boolean }
  | { control: "audio-select"; required: boolean; category: "bgm" | "sfx" }
  | {
      control: "enum-select";
      required: boolean;
      options: { value: string; label: string }[];
    }
  | { control: "toggle"; required: boolean }
  | { control: "text"; required: boolean; placeholder?: string }
  | {
      control: "number";
      required: boolean;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
    }
  | {
      control: "slider";
      required: boolean;
      min: number;
      max: number;
      step: number;
      unit?: string;
    }
  | { control: "textarea"; required: boolean; placeholder?: string }
  | {
      control: "position-picker";
      required: boolean;
      coordKey: "x" | "y";
      pairedKey: string;
      hideOffScreen?: boolean;
      hideSlots?: boolean;
    }
  | { control: "point-picker"; required: boolean };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
type ParamSchemaBase = DistributiveOmit<ParamSchema, "required">;

interface CoreParamSpec {
  required: boolean;
  type: "string" | "number" | "boolean" | "array";
  min?: number;
  max?: number;
  enumOptions?: { value: string; label: string }[];
}

const TRANSITION_OPTIONS = [
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "slide-up", label: "Slide Up" },
  { value: "slide-down", label: "Slide Down" },
  { value: "none", label: "None" },
];

const EASE_OPTIONS = [
  { value: "linear", label: "Linear" },
  { value: "easeIn", label: "Ease In" },
  { value: "easeOut", label: "Ease Out" },
  { value: "easeInOut", label: "Ease In/Out" },
];

const SLOT_OPTIONS = [
  { value: "center", label: "Center" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "support-left", label: "Support Left" },
  { value: "support-right", label: "Support Right" },
  { value: "off-left", label: "Off Left" },
  { value: "off-right", label: "Off Right" },
];

const BGM_ACTION_OPTIONS = [
  { value: "play", label: "Play" },
  { value: "stop", label: "Stop" },
  { value: "pause", label: "Pause" },
  { value: "resume", label: "Resume" },
];

const SET_WITH_OPTIONS = [
  { value: "cut", label: "Cut" },
  { value: "fade", label: "Fade" },
];

const TAG_PARAM_CONTROL_OVERRIDES: Partial<
  Record<CommandName, Record<string, ParamSchemaBase>>
> = {
  presence: {
    action: {
      control: "enum-select",
      options: [
        { value: "show", label: "出场" },
        { value: "hide", label: "退场" },
      ],
    },
    with: { control: "enum-select", options: TRANSITION_OPTIONS },
  },
  reaction: {
    action: {
      control: "enum-select",
      options: [
        { value: "shake", label: "轻抖" },
        { value: "hop", label: "跳动" },
      ],
    },
  },
  weather: {
    kind: {
      control: "enum-select",
      options: [
        { value: "rain", label: "雨" },
        { value: "snow", label: "雪" },
      ],
    },
  },
  transition: {
    effect: { control: "enum-select", options: [...sceneTransitionOptions] },
  },
  animation: {
    clipId: { control: "text" },
  },
  show: {
    actor: { control: "actor-select" },
    x: {
      control: "position-picker",
      coordKey: "x",
      pairedKey: "y",
      hideOffScreen: true,
    },
    y: {
      control: "position-picker",
      coordKey: "y",
      pairedKey: "x",
      hideOffScreen: true,
    },
    with: { control: "enum-select", options: TRANSITION_OPTIONS },
    dur: { control: "slider", min: 0, max: 5, step: 0.1, unit: "s" },
  },
  hide: {
    actor: { control: "actor-select" },
    with: { control: "enum-select", options: TRANSITION_OPTIONS },
    dur: { control: "slider", min: 0, max: 5, step: 0.1, unit: "s" },
  },
  move: {
    actor: { control: "actor-select" },
    to: { control: "enum-select", options: SLOT_OPTIONS },
    toX: { control: "position-picker", coordKey: "x", pairedKey: "toY" },
    toY: { control: "position-picker", coordKey: "y", pairedKey: "toX" },
    dur: { control: "slider", min: 0.1, max: 5, step: 0.1, unit: "s" },
    ease: { control: "enum-select", options: EASE_OPTIONS },
  },
  shake: {
    actor: { control: "actor-select" },
    amp: { control: "slider", min: 1, max: 20, step: 1 },
    dur: { control: "slider", min: 0.1, max: 3, step: 0.1, unit: "s" },
  },
  hop: {
    actor: { control: "actor-select" },
    amp: { control: "slider", min: 5, max: 50, step: 1, unit: "px" },
    dur: { control: "slider", min: 0.1, max: 2, step: 0.1, unit: "s" },
  },
  set: {
    target: { control: "set-target-select" },
    variant: { control: "set-variant-select" },
    with: { control: "enum-select", options: SET_WITH_OPTIONS },
    dur: { control: "slider", min: 0, max: 5, step: 0.1, unit: "s" },
  },
  say: {
    actor: { control: "actor-select" },
    text: { control: "textarea", placeholder: "Enter dialogue text..." },
  },
  narrate: {
    text: { control: "textarea", placeholder: "Enter narration text..." },
  },
  wait: {
    seconds: { control: "number", min: 0.1, step: 0.1, unit: "s" },
  },
  bgm: {
    action: { control: "enum-select", options: BGM_ACTION_OPTIONS },
    asset: { control: "audio-select", category: "bgm" },
    volume: { control: "slider", min: 0, max: 1, step: 0.05 },
    fade: { control: "slider", min: 0, max: 5, step: 0.1, unit: "s" },
    loop: { control: "toggle" },
    duck: { control: "slider", min: 0, max: 1, step: 0.05 },
  },
  sfx: {
    asset: { control: "audio-select", category: "sfx" },
  },
  dim: {
    actor: { control: "actor-select" },
    brightness: { control: "slider", min: 0, max: 1, step: 0.05 },
  },
  blur: {
    actor: { control: "actor-select" },
    blur: { control: "slider", min: 0, max: 30, step: 1 },
  },
  filter: {
    actor: { control: "actor-select" },
    brightness: { control: "slider", min: 0, max: 1, step: 0.05 },
    blur: { control: "slider", min: 0, max: 30, step: 1 },
  },
  flash: {
    color: {
      control: "enum-select",
      options: [
        { value: "white", label: "White" },
        { value: "#ff0000", label: "Red" },
        { value: "#ffff00", label: "Yellow" },
        { value: "#000000", label: "Black" },
      ],
    },
    dur: { control: "slider", min: 0, max: 3, step: 0.1, unit: "s" },
  },
  vibrate: {
    amp: { control: "slider", min: 1, max: 30, step: 1 },
    dur: { control: "slider", min: 0, max: 3, step: 0.1, unit: "s" },
  },
  tint: {
    actor: { control: "actor-select" },
    color: {
      control: "enum-select",
      options: [
        { value: "#ff0000", label: "Red" },
        { value: "#0000ff", label: "Blue" },
        { value: "#ffffff", label: "White" },
        { value: "#00ff00", label: "Green" },
        { value: "#ffff00", label: "Yellow" },
      ],
    },
    opacity: { control: "slider", min: 0, max: 1, step: 0.05 },
  },
  rotate: {
    actor: { control: "actor-select" },
    angle: { control: "slider", min: -180, max: 180, step: 1, unit: "°" },
    dur: { control: "slider", min: 0, max: 5, step: 0.1, unit: "s" },
  },
  zoom: {
    actor: { control: "actor-select" },
    scale: { control: "slider", min: 0.1, max: 3, step: 0.1, unit: "x" },
    dur: { control: "slider", min: 0, max: 5, step: 0.1, unit: "s" },
  },
  camera: {
    action: {
      control: "enum-select",
      options: [
        { value: "push", label: "轻推" },
        { value: "pull", label: "拉远" },
        { value: "focus", label: "单人／定点聚焦" },
        { value: "duo", label: "双人构图" },
        { value: "reset", label: "复位" },
        { value: "rackfocus", label: "拉焦增强" },
        { value: "parallax", label: "视差增强" },
      ],
    },
    target: {
      control: "enum-select",
      options: [
        { value: "actor", label: "Actor" },
        { value: "point", label: "Point (x,y)" },
      ],
    },
    actor: { control: "actor-select" },
    x: {
      control: "position-picker",
      coordKey: "x",
      pairedKey: "y",
      hideSlots: true,
      hideOffScreen: true,
    },
    y: {
      control: "position-picker",
      coordKey: "y",
      pairedKey: "x",
      hideSlots: true,
      hideOffScreen: true,
    },
    zoom: { control: "slider", min: 1, max: 3.0, step: 0.1, unit: "x" },
    dur: { control: "slider", min: 0.1, max: 5, step: 0.1, unit: "s" },
    ease: { control: "enum-select", options: EASE_OPTIONS },
  },
  rain: {
    intensity: {
      control: "enum-select",
      options: [
        { value: "light", label: "Light" },
        { value: "normal", label: "Normal" },
        { value: "heavy", label: "Heavy" },
      ],
    },
    stop: { control: "toggle" },
    dur: { control: "slider", min: 1, max: 5, step: 0.5, unit: "s" },
  },
  snow: {
    intensity: {
      control: "enum-select",
      options: [
        { value: "light", label: "Light" },
        { value: "normal", label: "Normal" },
        { value: "heavy", label: "Heavy" },
      ],
    },
    stop: { control: "toggle" },
    dur: { control: "slider", min: 1, max: 5, step: 0.5, unit: "s" },
  },
};

function unwrapEffects(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current: z.ZodTypeAny = schema;
  while (current instanceof z.ZodEffects) {
    const next =
      (current as unknown as { _def?: { schema?: z.ZodTypeAny } })._def
        ?.schema ??
      (
        current as unknown as { innerType?: () => z.ZodTypeAny }
      ).innerType?.() ??
      current;
    if (next === current) break;
    current = next;
  }
  return current;
}

function unwrapOptional(schema: z.ZodTypeAny): {
  base: z.ZodTypeAny;
  required: boolean;
} {
  let current = unwrapEffects(schema);
  const required = !current.safeParse(undefined).success;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodNullable
  ) {
    const next =
      (current as unknown as { _def?: { innerType?: z.ZodTypeAny } })._def
        ?.innerType ?? current;
    if (next === current) break;
    current = unwrapEffects(next);
  }
  return { base: current, required };
}

function objectShape(schema: z.ZodTypeAny): z.ZodRawShape {
  const unwrapped = unwrapEffects(schema);
  if (!(unwrapped instanceof z.ZodObject)) return {};
  return (unwrapped as z.ZodObject<z.ZodRawShape>).shape;
}

function inferCoreParamSpec(schema: z.ZodTypeAny): CoreParamSpec {
  const { base, required } = unwrapOptional(schema);
  if (base instanceof z.ZodBoolean) {
    return { required, type: "boolean" };
  }
  if (base instanceof z.ZodNumber) {
    return {
      required,
      type: "number",
      min: base.minValue ?? undefined,
      max: base.maxValue ?? undefined,
    };
  }
  if (base instanceof z.ZodArray) return { required, type: "array" };
  if (base instanceof z.ZodEnum) {
    const enumOptions = base.options.map((value: string) => ({
      value,
      label: value,
    }));
    return { required, type: "string", enumOptions };
  }
  return { required, type: "string" };
}

function defaultControl(
  paramKey: string,
  spec: CoreParamSpec,
): ParamSchemaBase {
  if (paramKey === "foreground") return { control: "image-select" };
  if (paramKey === "images" && spec.type === "array")
    return { control: "image-list" };
  if (paramKey === "fromTarget" || paramKey === "toTarget")
    return { control: "set-target-select" };
  if (paramKey === "nextScene") return { control: "scene-select" };
  if (paramKey === "accent") return { control: "color" };
  if (paramKey === "actor" || paramKey === "other")
    return { control: "actor-select" };
  if (spec.enumOptions && spec.enumOptions.length > 0) {
    return { control: "enum-select", options: spec.enumOptions };
  }
  if (spec.type === "boolean") {
    return { control: "toggle" };
  }
  if (spec.type === "number") {
    return {
      control: "number",
      min: spec.min,
      max: spec.max,
      step: paramKey === "blinks" ? 1 : 0.05,
    };
  }
  if (paramKey === "text") {
    return { control: "textarea", placeholder: "Enter text..." };
  }
  return { control: "text" };
}

function buildCoreParamSpecs(): Record<
  CommandName,
  Record<string, CoreParamSpec>
> {
  const result = {} as Record<CommandName, Record<string, CoreParamSpec>>;
  const commandNames = Object.keys(commandParamsSchemas) as CommandName[];

  for (const commandName of commandNames) {
    const shape = objectShape(commandParamsSchemas[commandName]);
    const specs: Record<string, CoreParamSpec> = {};
    for (const [paramKey, zodSchema] of Object.entries(shape)) {
      if (paramKey === "await") continue;
      specs[paramKey] = inferCoreParamSpec(zodSchema);
    }
    result[commandName] = specs;
  }

  return result;
}

export const CORE_COMMAND_PARAM_SPECS = buildCoreParamSpecs();

function buildTagParamSchemas(): Record<
  CommandName,
  Record<string, ParamSchema>
> {
  const result = {} as Record<CommandName, Record<string, ParamSchema>>;
  const commandNames = Object.keys(CORE_COMMAND_PARAM_SPECS) as CommandName[];

  for (const commandName of commandNames) {
    const coreSpecs = CORE_COMMAND_PARAM_SPECS[commandName];
    const overrides = TAG_PARAM_CONTROL_OVERRIDES[commandName] ?? {};
    const params: Record<string, ParamSchema> = {};

    for (const [paramKey, spec] of Object.entries(coreSpecs)) {
      const control = overrides[paramKey] ?? defaultControl(paramKey, spec);
      params[paramKey] = { ...control, required: spec.required } as ParamSchema;
    }

    result[commandName] = params;
  }

  return result;
}

export const TAG_PARAM_SCHEMAS = buildTagParamSchemas();

export const BGM_SIMPLIFIED_PARAM_KEYS = new Set(["action", "asset", "volume"]);

export function resolveBgmAction(
  params: Record<string, unknown>,
): "play" | "stop" | "pause" | "resume" {
  const action = params.action;
  if (
    action === "play" ||
    action === "stop" ||
    action === "pause" ||
    action === "resume"
  ) {
    return action;
  }
  return "play";
}

const DEFAULT_COMMAND_PARAM_OVERRIDES: {
  [K in CommandName]?: Partial<CommandParamsByName[K]>;
} = {
  ...Object.fromEntries(
    Object.entries(performanceCommands).map(([name, def]) => [
      name,
      { ...def.defaults, dur: def.dur, enabled: true, await: true },
    ]),
  ),
  presence: { action: "show", actor: "", with: "fade", dur: 0.4 },
  reaction: { action: "shake", actor: "", amp: 5, dur: 0.4 },
  weather: { kind: "rain", intensity: "normal", stop: false, dur: 1 },
  animation: {
    clipId: "",
    await: true,
    enabled: true,
  },
  show: { actor: "", with: "fade", dur: DEFAULT_DURATIONS.show },
  hide: { actor: "", with: "fade", dur: DEFAULT_DURATIONS.hide },
  move: {
    actor: "",
    toX: 0,
    toY: 0,
    dur: DEFAULT_DURATIONS.move,
    ease: "linear",
  },
  shake: { actor: "", amp: 5, dur: DEFAULT_DURATIONS.shake },
  hop: { actor: "", amp: 20, dur: DEFAULT_DURATIONS.hop },
  set: { target: "", variant: "", with: "cut" },
  dim: { actor: "", brightness: 1 },
  blur: { actor: "", blur: 8 },
  flash: { color: "white", dur: DEFAULT_DURATIONS.flash },
  vibrate: { amp: 5, dur: DEFAULT_DURATIONS.vibrate },
  tint: { actor: "", color: "#ff0000", opacity: 0.3 },
  rotate: { actor: "", angle: 15, dur: DEFAULT_DURATIONS.rotate },
  zoom: { actor: "", scale: 1.5, dur: DEFAULT_DURATIONS.zoom },
  bgm: {
    action: "play",
    asset: "",
    volume: DEFAULT_BGM_VOLUME,
    fade: DEFAULT_BGM_FADE,
    loop: DEFAULT_BGM_LOOP,
    duck: DEFAULT_BGM_DUCK,
  },
  sfx: { asset: "", volume: DEFAULT_SFX_VOLUME },
  camera: { action: "push", zoom: 1.08, dur: 0.8 },
  wait: { seconds: 1 },
  rain: { intensity: "normal", stop: false, dur: 1 },
  snow: { intensity: "normal", stop: false, dur: 1 },
};

function getDefaultValue(spec: CoreParamSpec): unknown {
  if (spec.type === "array") return [];
  if (spec.enumOptions && spec.enumOptions.length > 0) {
    return spec.enumOptions[0]?.value;
  }
  if (spec.type === "boolean") return false;
  if (spec.type === "number") return 0;
  return "";
}

export function getDefaultCommandParams<K extends CommandName>(
  name: K,
): CommandParamsByName[K] {
  const coreSpecs = CORE_COMMAND_PARAM_SPECS[name];
  const base: Record<string, unknown> = {};
  for (const [paramKey, spec] of Object.entries(coreSpecs)) {
    if (spec.required) {
      base[paramKey] = getDefaultValue(spec);
    }
  }

  if (name !== "wait") {
    base.await = false;
  }

  const overrides = DEFAULT_COMMAND_PARAM_OVERRIDES[name];
  return { ...base, ...(overrides ?? {}) } as CommandParamsByName[K];
}

export function getResolvedCommandParams<K extends CommandName>(
  name: K,
  params: Partial<CommandParamsByName[K]>,
): CommandParamsByName[K] {
  const provided = (params ?? {}) as Record<string, unknown>;
  const resolved = {
    ...(name === "camera"
      ? cameraActionDefaults(String(provided.action ?? "push"))
      : getDefaultCommandParams(name)),
    ...provided,
  } as Record<string, unknown>;

  if (name === "set" && provided.dur === undefined) {
    resolved.dur = provided.with === "fade" ? 0.5 : 0;
  }

  return resolved as CommandParamsByName[K];
}
