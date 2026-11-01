import { commandParamsSchemas } from "./script";
import { z } from "zod/v3";

const nonEmptyString = z.string().trim().min(1);
const generatedVariantSchema = nonEmptyString.describe("Appearance key; built-in character keys: default, happy, sad, angry, surprised. Custom keys are supported and create placeholders when referenced during create.");

function normalizeRef(value: string): string {
  return value.trim().toLowerCase();
}

function isNarratorLikeName(value: string): boolean {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  return (
    normalized === "narrator" ||
    normalized === "narration" ||
    normalized === "ナレーター" ||
    normalized === "ナレーション" ||
    normalized === "旁白" ||
    normalized === "叙述者" ||
    normalized === "narrateur" ||
    normalized === "narrador" ||
    normalized === "erzähler"
  );
}

const characterManifestEntrySchema = z
  .object({
    name: nonEmptyString,
    description: nonEmptyString,
    gender: z.enum(["male", "female"]).optional(),
  })
  .strict();

const backgroundManifestEntrySchema = z
  .object({
    name: nonEmptyString,
    description: nonEmptyString,
  })
  .strict();

export const GENERATED_STAGE_DIRECTION_NAMES = [
  "show",
  "hide",
  "move",
  "shake",
  "set",
  "camera",
  "flash",
  "wait",
] as const;

export const RECOMMENDED_NON_DEFAULT_VARIANTS_PER_CHARACTER = 4;

export const generatedStageDirectionSchema = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("show"),
      textOffset: z.number().int().nonnegative().describe("Insertion offset in line.text measured in JavaScript UTF-16 code units, not seconds; omitted means 0 (before text). Example: 2 inserts after the first two code units.").optional(),
      params: commandParamsSchemas.show,
    })
    .strict(),
  z
    .object({
      name: z.literal("hide"),
      textOffset: z.number().int().nonnegative().describe("Insertion offset in line.text measured in JavaScript UTF-16 code units, not seconds; omitted means 0 (before text). Example: 2 inserts after the first two code units.").optional(),
      params: commandParamsSchemas.hide,
    })
    .strict(),
  z
    .object({
      name: z.literal("move"),
      textOffset: z.number().int().nonnegative().describe("Insertion offset in line.text measured in JavaScript UTF-16 code units, not seconds; omitted means 0 (before text). Example: 2 inserts after the first two code units.").optional(),
      params: commandParamsSchemas.move,
    })
    .strict(),
  z
    .object({
      name: z.literal("shake"),
      textOffset: z.number().int().nonnegative().describe("Insertion offset in line.text measured in JavaScript UTF-16 code units, not seconds; omitted means 0 (before text). Example: 2 inserts after the first two code units.").optional(),
      params: commandParamsSchemas.shake,
    })
    .strict(),
  z
    .object({
      name: z.literal("set"),
      textOffset: z.number().int().nonnegative().describe("Insertion offset in line.text measured in JavaScript UTF-16 code units, not seconds; omitted means 0 (before text). Example: 2 inserts after the first two code units.").optional(),
      params: commandParamsSchemas.set,
    })
    .strict(),
  z
    .object({
      name: z.literal("camera"),
      textOffset: z.number().int().nonnegative().describe("Insertion offset in line.text measured in JavaScript UTF-16 code units, not seconds; omitted means 0 (before text). Example: 2 inserts after the first two code units.").optional(),
      params: commandParamsSchemas.camera,
    })
    .strict(),
  z
    .object({
      name: z.literal("flash"),
      textOffset: z.number().int().nonnegative().describe("Insertion offset in line.text measured in JavaScript UTF-16 code units, not seconds; omitted means 0 (before text). Example: 2 inserts after the first two code units.").optional(),
      params: commandParamsSchemas.flash,
    })
    .strict(),
  z
    .object({
      name: z.literal("wait"),
      textOffset: z.number().int().nonnegative().describe("Insertion offset in line.text measured in JavaScript UTF-16 code units, not seconds; omitted means 0 (before text). Example: 2 inserts after the first two code units.").optional(),
      params: commandParamsSchemas.wait,
    })
    .strict(),
]);

export const generatedStageDirectionsSchema = z
  .array(generatedStageDirectionSchema)
  .min(1)
  .optional();

function refineGeneratedLineVariant(
  line: {
    speaker?: string;
    variant?: string;
    text?: string;
    directions?: Array<{ textOffset?: number }>;
  },
  ctx: z.RefinementCtx,
): void {
  line.directions?.forEach((direction, index) => {
    if (
      direction.textOffset !== undefined &&
      direction.textOffset > (line.text?.length ?? 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "textOffset exceeds line text length",
        path: ["directions", index, "textOffset"],
      });
    }
  });
  if (!line.speaker && line.variant) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Narration lines must omit variant",
      path: ["variant"],
    });
  }
}

const generatedScriptLineObjectSchema = z
  .object({
    speaker: nonEmptyString.optional(),
    text: nonEmptyString,
    variant: generatedVariantSchema.optional(),
    directions: generatedStageDirectionsSchema,
  })
  .strict();

export const generatedScriptLineSchema =
  generatedScriptLineObjectSchema.superRefine(refineGeneratedLineVariant);

export const scriptWriterLineSchema = generatedScriptLineObjectSchema.omit({
  directions: true,
  variant: true,
});

const generatedSceneSchema = z
  .object({
    name: nonEmptyString,
    background: nonEmptyString,
    backgroundVariant: nonEmptyString.optional(),
    lines: z.array(generatedScriptLineSchema),
  })
  .strict();

const generatedActSchema = z
  .object({
    name: nonEmptyString,
    scenes: z.array(generatedSceneSchema),
  })
  .strict();

const scriptWriterSceneSchema = z
  .object({
    name: nonEmptyString,
    background: nonEmptyString,
    backgroundVariant: nonEmptyString.optional(),
    lines: z.array(scriptWriterLineSchema),
  })
  .strict();

const scriptWriterActSchema = z
  .object({
    name: nonEmptyString,
    scenes: z.array(scriptWriterSceneSchema),
  })
  .strict();

function refineGeneratedScriptPayload(
  payload: {
    characters: Array<{ name: string }>;
    backgrounds: Array<{ name: string }>;
    acts: Array<{
      scenes: Array<{
        background: string;
        lines: Array<{
          speaker?: string;
          directions?: ReadonlyArray<{ params?: Record<string, unknown> }>;
        }>;
      }>;
    }>;
  },
  ctx: z.RefinementCtx,
  options?: { checkDirectionActors?: boolean },
): void {
  const backgroundNames = new Set(payload.backgrounds.map((item) => item.name));
  const characterNames = new Set(payload.characters.map((item) => item.name));
  const normalizedCharacterNames = new Set(
    payload.characters.map((item) => normalizeRef(item.name)),
  );
  const checkDirectionActors = options?.checkDirectionActors ?? true;

  payload.characters.forEach((character, index) => {
    if (!isNarratorLikeName(character.name)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Narrator must not appear in characters",
      path: ["characters", index, "name"],
    });
  });

  payload.acts.forEach((act, actIndex) => {
    act.scenes.forEach((scene, sceneIndex) => {
      if (!backgroundNames.has(scene.background)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown background '${scene.background}'`,
          path: ["acts", actIndex, "scenes", sceneIndex, "background"],
        });
      }

      scene.lines.forEach((line, lineIndex) => {
        if (checkDirectionActors) {
          line.directions?.forEach((direction, directionIndex) => {
            const params = direction.params ?? {};
            const actorRef =
              typeof params.actor === "string"
                ? params.actor
                : typeof params.target === "string"
                  ? params.target
                  : undefined;
            if (
              typeof actorRef !== "string" ||
              normalizedCharacterNames.has(normalizeRef(actorRef))
            )
              return;
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Unknown direction actor '${actorRef}'`,
              path: [
                "acts",
                actIndex,
                "scenes",
                sceneIndex,
                "lines",
                lineIndex,
                "directions",
                directionIndex,
                "params",
                typeof params.target === "string" ? "target" : "actor",
              ],
            });
          });
        }

        const speaker = line.speaker;
        if (!speaker) return;
        if (isNarratorLikeName(speaker)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Narration lines must omit speaker",
            path: [
              "acts",
              actIndex,
              "scenes",
              sceneIndex,
              "lines",
              lineIndex,
              "speaker",
            ],
          });
          return;
        }
        if (
          !Array.from(characterNames).some(
            (name) => normalizeRef(name) === normalizeRef(speaker),
          )
        ) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown speaker '${speaker}'`,
            path: [
              "acts",
              actIndex,
              "scenes",
              sceneIndex,
              "lines",
              lineIndex,
              "speaker",
            ],
          });
        }
      });
    });
  });
}

export const scriptWriterPayloadSchema = z
  .object({
    title: nonEmptyString,
    acts: z.array(scriptWriterActSchema),
    characters: z.array(characterManifestEntrySchema),
    backgrounds: z.array(backgroundManifestEntrySchema),
  })
  .strict()
  .superRefine((payload, ctx) => {
    refineGeneratedScriptPayload(payload, ctx, { checkDirectionActors: false });
  });

export const scriptGenerationPayloadSchema = z
  .object({
    title: nonEmptyString,
    acts: z.array(generatedActSchema),
    characters: z.array(characterManifestEntrySchema),
    backgrounds: z.array(backgroundManifestEntrySchema),
  })
  .strict()
  .superRefine((payload, ctx) => {
    refineGeneratedScriptPayload(payload, ctx, { checkDirectionActors: true });
  });
