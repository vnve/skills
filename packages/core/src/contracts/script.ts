import { SCENE_TRANSITION_TYPES } from "../scene-transitions";
import { performanceCommandParamsSchemas } from "../performance-commands";
import { z } from "zod/v3";

const nonEmptyString = z.string().trim().min(1);
const optionalNonEmptyString = nonEmptyString.optional();
const nodeIdSchema = z.string().min(1).optional();
const slotSchema = z.enum([
  "center",
  "left",
  "right",
  "support-left",
  "support-right",
  "off-left",
  "off-right",
]);

function commandParams<TShape extends z.ZodRawShape>(shape: TShape) {
  return z.object({ ...shape, await: z.boolean().optional() }).strict();
}

const showParamsSchema = commandParams({
  actor: nonEmptyString,
  x: z.number().optional(),
  y: z.number().optional(),
  with: optionalNonEmptyString,
  dur: z.number().nonnegative().optional(),
});

const hideParamsSchema = commandParams({
  actor: nonEmptyString,
  with: optionalNonEmptyString,
  dur: z.number().nonnegative().optional(),
});

const moveParamsSchema = commandParams({
  actor: nonEmptyString,
  to: slotSchema.optional(),
  toX: z.number().optional(),
  toY: z.number().optional(),
  dur: z.number().nonnegative().optional(),
  ease: optionalNonEmptyString,
}).superRefine((params, ctx) => {
  const hasSlot = params.to !== undefined;
  const hasCoords =
    typeof params.toX === "number" && typeof params.toY === "number";
  if (!hasSlot && !hasCoords) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "move params require `to` or both `toX` and `toY`",
      path: ["to"],
    });
  }
});

const shakeParamsSchema = commandParams({
  actor: nonEmptyString,
  amp: z
    .number()
    .positive()
    .describe(
      "Shake amplitude in design-canvas pixels (scaled with render resolution); for example 8 is a subtle shake, 14 is stronger.",
    ),
  dur: z.number().nonnegative().optional(),
});

const hopParamsSchema = commandParams({
  actor: nonEmptyString,
  amp: z.number().nonnegative().optional(),
  dur: z.number().nonnegative().optional(),
});

const setParamsSchema = commandParams({
  target: nonEmptyString,
  variant: nonEmptyString,
  stateId: optionalNonEmptyString,
  with: optionalNonEmptyString,
  dur: z.number().nonnegative().optional(),
});

const sayParamsSchema = commandParams({
  actor: nonEmptyString,
  text: nonEmptyString,
  dur: z.number().nonnegative().optional(),
  displayMode: optionalNonEmptyString,
  theme: optionalNonEmptyString,
});

const narrateParamsSchema = commandParams({
  text: nonEmptyString,
  dur: z.number().nonnegative().optional(),
  displayMode: optionalNonEmptyString,
});

const waitParamsSchema = commandParams({
  seconds: z.number().nonnegative(),
});

export const INTERJECTION_KINDS = [
  "laughs",
  "chuckle",
  "coughs",
  "clear-throat",
  "groans",
  "breath",
  "pant",
  "inhale",
  "exhale",
  "gasps",
  "sniffs",
  "sighs",
  "snorts",
  "burps",
  "lip-smacking",
  "humming",
  "hissing",
  "emm",
  "sneezes",
] as const;

export type InterjectionKind = (typeof INTERJECTION_KINDS)[number];

const interjectionParamsSchema = commandParams({
  kind: z.enum(INTERJECTION_KINDS),
});

const bgmParamsSchema = commandParams({
  action: z.enum(["play", "stop", "pause", "resume"]).optional(),
  asset: z.string().optional(),
  volume: z.number().min(0).max(1).optional(),
  fade: z.number().nonnegative().optional(),
  loop: z.boolean().optional(),
  duck: z.number().min(0).max(1).optional(),
}).superRefine((params, ctx) => {
  const action = params.action ?? "play";
  if (
    action === "play" &&
    (!params.asset || params.asset.trim().length === 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "bgm params require non-empty `asset` when action is `play`",
      path: ["asset"],
    });
  }
});

const sfxParamsSchema = commandParams({
  asset: nonEmptyString,
  volume: z.number().min(0).max(1).optional(),
});

const dimParamsSchema = commandParams({
  actor: nonEmptyString,
  brightness: z.number().min(0).max(1),
});

const blurParamsSchema = commandParams({
  actor: nonEmptyString,
  blur: z.number().min(0),
});

const filterParamsSchema = commandParams({
  actor: nonEmptyString,
  brightness: z.number().min(0).max(1).optional(),
  blur: z.number().min(0).optional(),
});

const flashParamsSchema = commandParams({
  color: optionalNonEmptyString,
  dur: z.number().nonnegative().optional(),
});

const vibrateParamsSchema = commandParams({
  amp: z.number().positive(),
  dur: z.number().nonnegative().optional(),
});

const tintParamsSchema = commandParams({
  actor: nonEmptyString,
  color: nonEmptyString,
  opacity: z.number().min(0).max(1).optional(),
});

const rotateParamsSchema = commandParams({
  actor: nonEmptyString,
  angle: z.number(),
  dur: z.number().nonnegative().optional(),
});

const zoomParamsSchema = commandParams({
  actor: nonEmptyString,
  scale: z.number().positive(),
  dur: z.number().nonnegative().optional(),
});

const cameraParamsSchema = commandParams({
  action: z.enum([
    "push",
    "pull",
    "focus",
    "duo",
    "reset",
    "rackfocus",
    "parallax",
  ]),
  target: z.string().optional(),
  actor: optionalNonEmptyString,
  other: optionalNonEmptyString,
  x: z.number().finite().optional(),
  y: z.number().finite().optional(),
  zoom: z.number().finite().positive().optional(),
  dur: z.number().finite().min(0).max(30).optional(),
  ease: optionalNonEmptyString,
  fromTarget: optionalNonEmptyString,
  toTarget: optionalNonEmptyString,
  blur: z.number().finite().min(0).max(30).optional(),
  moveX: z.number().finite().min(-15).max(15).optional(),
  moveY: z.number().finite().min(-10).max(10).optional(),
  backgroundDepth: z.number().finite().min(0).max(1).optional(),
  actorDepth: z.number().finite().min(0).max(1).optional(),
  foregroundDepth: z.number().finite().min(0).max(1).optional(),
  foreground: optionalNonEmptyString,
}).superRefine((p, ctx) => {
  const issue = (message: string, path: string) =>
    ctx.addIssue({ code: "custom", message, path: [path] });
  if (
    p.action === "focus" &&
    !p.actor &&
    p.x === undefined &&
    p.y === undefined
  )
    issue("camera focus requires actor or x/y", "actor");
  if (
    p.action !== "focus" &&
    p.action !== "reset" &&
    p.zoom !== undefined &&
    (p.zoom < 1 || p.zoom > 3)
  )
    issue("Camera zoom must be 1–3", "zoom");
  if (p.action === "duo" && (!p.actor || !p.other || p.actor === p.other))
    issue("Two different actors are required", "other");
  if (
    p.action === "rackfocus" &&
    (!p.toTarget || p.toTarget === (p.fromTarget ?? "$background"))
  )
    issue("Two different focus targets are required", "toTarget");
  if (
    ["rackfocus", "parallax"].includes(p.action) &&
    ((p.zoom !== undefined && (p.zoom < 1 || p.zoom > 1.2)) ||
      (p.dur !== undefined && p.dur < 0.2))
  )
    issue("Depth camera requires zoom 1–1.2 and duration at least .2", "zoom");
});

const weatherIntensitySchema = z.enum(["light", "normal", "heavy"]);

const rainParamsSchema = commandParams({
  intensity: weatherIntensitySchema.optional(),
  stop: z.boolean().optional(),
  dur: z.number().nonnegative().optional(),
});

const snowParamsSchema = commandParams({
  intensity: weatherIntensitySchema.optional(),
  stop: z.boolean().optional(),
  dur: z.number().nonnegative().optional(),
});

export const commandParamsSchemas = {
  ...performanceCommandParamsSchemas,
  presence: commandParams({
    action: z.enum(["show", "hide"]),
    actor: nonEmptyString,
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    with: optionalNonEmptyString,
    dur: z.number().finite().nonnegative().optional(),
  }),
  reaction: commandParams({
    action: z.enum(["shake", "hop"]),
    actor: nonEmptyString,
    amp: z.number().finite().nonnegative().optional(),
    dur: z.number().finite().nonnegative().optional(),
  }).refine((p) => p.action !== "shake" || p.amp === undefined || p.amp > 0, {
    path: ["amp"],
    message: "Shake amplitude must be positive",
  }),
  weather: commandParams({
    kind: z.enum(["rain", "snow"]),
    intensity: weatherIntensitySchema.optional(),
    stop: z.boolean().optional(),
    dur: z.number().finite().nonnegative().optional(),
  }),
  animation: commandParams({
    clipId: nonEmptyString,
    enabled: z.boolean().optional(),
    weight: z.number().min(0).max(2).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
    scale: z.number().positive().max(100).optional(),
  }),
  show: showParamsSchema,
  hide: hideParamsSchema,
  move: moveParamsSchema,
  shake: shakeParamsSchema,
  hop: hopParamsSchema,
  set: setParamsSchema,
  say: sayParamsSchema,
  narrate: narrateParamsSchema,
  wait: waitParamsSchema,
  bgm: bgmParamsSchema,
  sfx: sfxParamsSchema,
  dim: dimParamsSchema,
  blur: blurParamsSchema,
  filter: filterParamsSchema,
  flash: flashParamsSchema,
  vibrate: vibrateParamsSchema,
  tint: tintParamsSchema,
  rotate: rotateParamsSchema,
  zoom: zoomParamsSchema,
  camera: cameraParamsSchema,
  interjection: interjectionParamsSchema,
  rain: rainParamsSchema,
  snow: snowParamsSchema,
} as const;

type InferSchemaMap<T extends Record<string, z.ZodTypeAny>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type CommandParamsByName = InferSchemaMap<typeof commandParamsSchemas>;

type CommandSchemaMap = typeof commandParamsSchemas;
type CommandSchemaName = keyof CommandSchemaMap;
type CommandDiscriminatedOption = z.ZodDiscriminatedUnionOption<"name">;
type InlineTagByName<K extends CommandSchemaName> = {
  type: "tag";
  name: K;
  params: CommandParamsByName[K];
};
type InlineTag = {
  [K in CommandSchemaName]: InlineTagByName<K>;
}[CommandSchemaName];

const commandSchemaEntries = Object.entries(commandParamsSchemas) as Array<
  [CommandSchemaName, CommandSchemaMap[CommandSchemaName]]
>;

export const COMMAND_NAMES = commandSchemaEntries.map(
  ([name]) => name,
) as readonly CommandSchemaName[];

function toOptionTuple(
  options: CommandDiscriminatedOption[],
): [
  CommandDiscriminatedOption,
  CommandDiscriminatedOption,
  ...CommandDiscriminatedOption[],
] {
  if (options.length < 2) {
    throw new Error(
      "At least two command options are required to build discriminated unions",
    );
  }
  const [first, second, ...rest] = options;
  return [first, second, ...rest];
}

function buildInlineTagOptions(): CommandDiscriminatedOption[] {
  return commandSchemaEntries.map(([name, paramsSchema]) =>
    z
      .object({
        type: z.literal("tag"),
        name: z.literal(name),
        params: paramsSchema,
      })
      .strict(),
  );
}

export const inlineTagSchema = z.discriminatedUnion(
  "name",
  toOptionTuple(buildInlineTagOptions()),
) as unknown as z.ZodType<InlineTag>;

export const textSegmentSchema = z
  .object({
    type: z.literal("text"),
    text: z.string(),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    color: z.string().optional(),
  })
  .strict();

export const ttsGenerationSnapshotSchema = z
  .object({
    text: z.string(),
    actorId: z.string().optional(),
    voiceId: z.string().min(1),
    emotion: z
      .enum([
        "happy",
        "sad",
        "angry",
        "fearful",
        "disgusted",
        "surprised",
        "calm",
        "fluent",
      ])
      .optional(),
    providerId: z.string().min(1),
    modelId: z.string().min(1),
  })
  .strict();

export const dialogueTimingSchema = z
  .object({
    leadIn: z.number().finite().min(0).max(300).optional(),
    revealDuration: z.number().finite().min(0).max(300).optional(),
    holdDuration: z.number().finite().min(0).max(300).optional(),
  })
  .strict();

export const textNodeSchema = z
  .object({
    type: z.literal("text"),
    id: nodeIdSchema,
    text: z.string(),
    actorId: z.string().optional(),
    content: z.array(z.union([textSegmentSchema, inlineTagSchema])).optional(),
    audioUrl: z.string().optional(),
    audioDuration: z.number().finite().positive().optional(),
    voiceVolume: z.number().finite().min(0).max(1).optional(),
    timing: dialogueTimingSchema.optional(),
    emotion: z
      .enum([
        "happy",
        "sad",
        "angry",
        "fearful",
        "disgusted",
        "surprised",
        "calm",
        "fluent",
      ])
      .optional(),
    ttsSnapshot: ttsGenerationSnapshotSchema.optional(),
    audioImportSnapshot: z
      .object({ text: z.string(), actorId: z.string().optional() })
      .strict()
      .optional(),
    variant: z.string().trim().min(1).optional(),
  })
  .strict()
  .superRefine((node, ctx) => {
    const plainHasText = node.text.trim().length > 0;
    const contentHasText =
      node.content?.some(
        (seg) => seg.type === "text" && seg.text.trim().length > 0,
      ) ?? false;
    const contentHasTag =
      node.content?.some((seg) => seg.type === "tag") ?? false;

    if (!plainHasText && !contentHasText && !contentHasTag) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Text node requires non-empty text or at least one inline tag",
        path: ["text"],
      });
    }
  });

export const scriptNodeSchema = textNodeSchema;

export const scriptDocSchema = z
  .object({
    nodes: z.array(scriptNodeSchema),
  })
  .strict();

const COMMAND_PROMPT_NOTES: Partial<
  Record<keyof typeof commandParamsSchemas, string>
> = {
  move: "Provide `to` or both `toX` and `toY`.",
  bgm: "`asset` is required when action is `play` or omitted.",
  camera: "focus requires `actor` or coordinates.",
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
  optional: boolean;
} {
  let current = unwrapEffects(schema);
  let optional = current.safeParse(undefined).success;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodNullable
  ) {
    const next =
      (current as unknown as { _def?: { innerType?: z.ZodTypeAny } })._def
        ?.innerType ?? current;
    if (next === current) break;
    current = next;
  }
  current = unwrapEffects(current);
  optional = optional || current.safeParse(undefined).success;
  return { base: current, optional };
}

function enumOptions(schema: z.ZodTypeAny): string[] | null {
  if (schema instanceof z.ZodEnum) {
    return [...schema.options];
  }
  if (schema instanceof z.ZodNativeEnum) {
    return Object.values(schema.enum).filter(
      (value): value is string => typeof value === "string",
    );
  }
  return null;
}

function objectShape(schema: z.ZodTypeAny): z.ZodRawShape {
  const current = unwrapEffects(schema);
  if (current instanceof z.ZodObject) {
    return current.shape;
  }
  return {};
}

function paramToken(name: string, schema: z.ZodTypeAny): string {
  const { base, optional } = unwrapOptional(schema);
  const options = enumOptions(base);
  const optionalMark = optional ? "?" : "";
  const optionsPart =
    options && options.length > 0 ? ` (${options.join("|")})` : "";
  return `${name}${optionalMark}${optionsPart}`;
}

export function buildCommandPromptLines(): readonly string[] {
  return COMMAND_NAMES.map((name) => {
    const shape = objectShape(commandParamsSchemas[name]);
    const params = Object.entries(shape)
      .filter(([key]) => key !== "await")
      .map(([key, schema]) => paramToken(key, schema));
    const note = COMMAND_PROMPT_NOTES[name];
    return `- ${name}: ${params.join(", ")}${note ? ` | ${note}` : ""}`;
  });
}

export const COMMAND_PROMPT_LINES = buildCommandPromptLines();
