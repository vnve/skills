import { SCENE_TRANSITION_TYPES } from "../scene-transitions";
import { depthCameraMode } from "../common-effects";
import { isPerformanceCommand } from "../performance-commands";
import {
  areSceneSettingsLinked,
  resolveSceneSettings,
} from "../helpers/scene-settings";
import { collectProjectReferences } from "../references";
import {
  structureOperationSchemas,
  isStructureOperation,
  applyStructureOperation,
} from "./structure-patch";
import { z } from "zod/v3";
import {
  BUILTIN_DIALOGUE_THEME_IDS,
  dialogueDisplayModeSchema,
  dialogueThemeSchema,
} from "../dialogue-theme";
import { animationClipSchema, animationOverridesSchema } from "../animation";
import type { Project, Scene } from "../types/project";
import {
  createId,
  getTextNodeContent,
  getTextNodePlainText,
  getTtsText,
} from "../helpers";
const editingDirectionSchema = z.union(
  Object.entries(commandParamsSchemas).map(([name, params]) =>
    z.object({ name: z.literal(name), params }).strict(),
  ) as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
) as z.ZodType<
  InlineTag extends infer T
    ? T extends InlineTag
      ? Omit<T, "type">
      : never
    : never
>;
import {
  commandParamsSchemas,
  dialogueTimingSchema,
  inlineTagSchema,
  textSegmentSchema,
  ttsGenerationSnapshotSchema,
} from "./script";
import {
  resolveDialogueProps,
  resolveSceneProps,
} from "../helpers/resolve-scene-property";
import type { InlineTag, TextNode } from "../types/script";

const idSchema = z.string().trim().min(1).max(200);
const labelSchema = z.string().trim().min(1).max(500);
const sceneSettingsSchema = z
  .object({
    transition: z
      .object({
        type: z.enum(SCENE_TRANSITION_TYPES),
        duration: z.number().finite().min(0).max(30).optional(),
      })
      .strict()
      .optional(),
    autoEntrance: z.boolean().optional(),
    entranceEffect: z.string().min(1).max(100).optional(),
    dimBrightness: z.number().finite().min(0).max(1).optional(),
    speakerScale: z.boolean().optional(),
    defaultDisplayMode: dialogueDisplayModeSchema.optional(),
    readingPace: z.number().finite().min(0.1).max(10).optional(),
    lineGap: z.number().finite().min(0).max(30).optional(),
  })
  .strict()
  .refine(
    (value) => Object.keys(value).length > 0,
    "Settings must contain a changed field",
  );
const actorUpdateOperationSchema = z
  .object({
    type: z.literal("actor.update"),
    sceneId: idSchema,
    actorId: idSchema,
    x: z.number().min(-200).max(300).optional(),
    y: z.number().min(-200).max(300).optional(),
    scale: z.number().min(0.1).max(4).optional(),
    visible: z.boolean().optional(),
    flipX: z.boolean().optional(),
    zIndex: z.number().int().min(-1000).max(1000).optional(),
    variantId: idSchema.optional(),
  })
  .strict()
  .refine(
    (operation) =>
      operation.x !== undefined ||
      operation.y !== undefined ||
      operation.scale !== undefined ||
      operation.visible !== undefined ||
      operation.flipX !== undefined ||
      operation.zIndex !== undefined ||
      operation.variantId !== undefined,
    { message: "actor.update requires at least one changed field" },
  );

const sceneUpdateOperationSchema = z
  .object({
    type: z.literal("scene.update"),
    sceneId: idSchema,
    name: labelSchema.optional(),
    backgroundId: idSchema.nullable().optional(),
    cgId: idSchema.nullable().optional(),
    transition: z
      .object({
        type: z.enum(SCENE_TRANSITION_TYPES),
        duration: z.number().finite().min(0).max(30).optional(),
      })
      .strict()
      .optional(),
    autoEntrance: z.boolean().optional(),
    entranceEffect: z.string().min(1).max(100).optional(),
    speakerScale: z.boolean().optional(),
    backgroundVisible: z.boolean().optional(),
    cgVisible: z.boolean().optional(),
    dimBrightness: z.number().min(0).max(1).optional(),
    backgroundColor: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .refine(
    (operation) =>
      operation.name !== undefined ||
      operation.backgroundId !== undefined ||
      operation.cgId !== undefined ||
      operation.transition !== undefined ||
      operation.autoEntrance !== undefined ||
      operation.entranceEffect !== undefined ||
      operation.speakerScale !== undefined ||
      operation.backgroundVisible !== undefined ||
      operation.cgVisible !== undefined ||
      operation.dimBrightness !== undefined ||
      operation.backgroundColor !== undefined,
    { message: "scene.update requires at least one changed field" },
  );

const dialogueUpdateOperationSchema = z
  .object({
    type: z.literal("dialogue.update"),
    sceneId: idSchema,
    nodeId: idSchema,
    text: z.string().trim().min(1).max(5000),
  })
  .strict();

const lineTarget = { sceneId: idSchema, nodeId: idSchema };
const contentIndexSchema = z.number().int().min(0).max(1000);
const dialogueSegmentUpdateOperationSchema = z
  .object({
    type: z.literal("dialogue.segment.update"),
    ...lineTarget,
    contentIndex: contentIndexSchema,
    text: z.string().max(5000),
  })
  .strict();
const directionInsertOperationSchema = z
  .object({
    type: z.literal("direction.insert"),
    ...lineTarget,
    contentIndex: contentIndexSchema,
    direction: editingDirectionSchema,
  })
  .strict();
const directionUpdateOperationSchema = z
  .object({
    type: z.literal("direction.update"),
    ...lineTarget,
    contentIndex: contentIndexSchema,
    direction: editingDirectionSchema,
  })
  .strict();
const directionRemoveOperationSchema = z
  .object({
    type: z.literal("direction.remove"),
    ...lineTarget,
    contentIndex: contentIndexSchema,
  })
  .strict();
const dialogueSettingsOperationSchema = z
  .object({
    type: z.literal("dialogue.settings"),
    ...lineTarget,
    actorId: idSchema.nullable().optional(),
    emotion: ttsGenerationSnapshotSchema.shape.emotion
      .unwrap()
      .nullable()
      .optional(),
    voiceVolume: z.number().min(0).max(1).optional(),
  })
  .strict()
  .refine(
    (operation) =>
      operation.actorId !== undefined ||
      operation.emotion !== undefined ||
      operation.voiceVolume !== undefined,
    { message: "dialogue.settings requires a changed field" },
  );
const dialogueInsertOperationSchema = z
  .object({
    type: z.literal("dialogue.insert"),
    sceneId: idSchema,
    id: idSchema.optional(),
    index: z.number().int().min(0).max(500),
    text: z.string().max(5000).optional(),
    content: z
      .array(z.union([textSegmentSchema, inlineTagSchema]))
      .min(1)
      .max(1000)
      .optional(),
    actorId: idSchema.optional(),
  })
  .strict()
  .refine(
    (op) =>
      op.content
        ? op.content.some(
            (segment) => segment.type === "tag" || segment.text.trim(),
          )
        : !!op.text?.trim(),
    "dialogue.insert requires readable text or content containing a tag",
  );
const dialogueRemoveOperationSchema = z
  .object({ type: z.literal("dialogue.remove"), ...lineTarget })
  .strict();
const dialogueMoveOperationSchema = z
  .object({
    type: z.literal("dialogue.move"),
    ...lineTarget,
    index: z.number().int().min(0).max(500),
  })
  .strict();

// Small editing operations are shared by the host CLI and the local panel.
const sceneEditOperationSchemas = [
  actorUpdateOperationSchema,
  sceneUpdateOperationSchema,
  dialogueUpdateOperationSchema,
  dialogueSegmentUpdateOperationSchema,
  directionInsertOperationSchema,
  directionUpdateOperationSchema,
  directionRemoveOperationSchema,
  dialogueInsertOperationSchema,
  dialogueRemoveOperationSchema,
  dialogueMoveOperationSchema,
  dialogueSettingsOperationSchema,
  z
    .object({
      type: z.literal("dialogue.content.update"),
      ...lineTarget,
      content: z
        .array(z.union([textSegmentSchema, inlineTagSchema]))
        .min(1)
        .max(1000),
    })
    .strict(),
] as const;
export const projectPatchOperationSchema = z.union([
  ...structureOperationSchemas,
  z
    .object({
      type: z.literal("scene.layer.lock"),
      sceneId: idSchema,
      layer: z.enum(["background", "cg", "dialogue"]),
      locked: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("dialogue.style.update"),
      sceneId: idSchema,
      fontSize: z.number().finite().min(8).max(512).optional(),
      nameFontSize: z.number().finite().min(8).max(512).optional(),
      boxWidthPercent: z.number().finite().positive().max(100).optional(),
      boxHeight: z.number().finite().positive().max(8192).optional(),
    })
    .strict()
    .refine(
      (op) =>
        op.fontSize !== undefined ||
        op.nameFontSize !== undefined ||
        op.boxWidthPercent !== undefined ||
        op.boxHeight !== undefined,
      { message: "dialogue.style.update requires a changed field" },
    ),
  z
    .object({
      type: z.literal("dialogue.layout.update"),
      sceneId: idSchema,
      x: z.number().finite().min(0).max(100),
      y: z.number().finite().min(0).max(100),
    })
    .strict(),
  z
    .object({
      type: z.literal("scene.settings.update"),
      sceneId: idSchema,
      settings: sceneSettingsSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("scene.settings.link"),
      sceneId: idSchema,
      linked: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("scene.props.link"),
      sceneId: idSchema,
      linked: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("scene.defaults.update"),
      sceneId: idSchema,
      defaults: z
        .object({
          entranceEffect: z.string().min(1).max(100).optional(),
          autoEntrance: z.boolean().optional(),
          speakerScale: z.boolean().optional(),
          dimBrightness: z.number().min(0).max(1).optional(),
          backgroundColor: z.string().min(1).max(100).optional(),
          transition: z
            .object({
              type: z.enum(SCENE_TRANSITION_TYPES),
              duration: z.number().finite().min(0).max(30).optional(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    })
    .strict(),

  z
    .object({
      type: z.literal("actor.lock"),
      sceneId: idSchema,
      actorId: idSchema,
      locked: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("actor.remove"),
      sceneId: idSchema,
      actorId: idSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("scene.layer.clear"),
      sceneId: idSchema,
      layer: z.enum(["background", "cg"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("dialogue.timing"),
      ...lineTarget,
      timing: dialogueTimingSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("dialogue.theme.create"),
      sceneId: idSchema,
      theme: dialogueThemeSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("dialogue.theme.apply"),
      sceneId: idSchema,
      themeId: idSchema,
      scope: z.enum(["scene", "project", "default"]).optional(),
      displayMode: dialogueDisplayModeSchema.optional(),
      readingPace: z.number().finite().min(0.1).max(10).optional(),
      lineGap: z.number().finite().min(0).max(30).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("dialogue.theme.link"), sceneId: idSchema })
    .strict(),
  z
    .object({
      type: z.literal("animation.set"),
      sceneId: idSchema,
      clip: animationClipSchema,
      resetOverrides: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("animation.remove"),
      sceneId: idSchema,
      animationId: idSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("animation.override"),
      sceneId: idSchema,
      animationId: idSchema,
      overrides: animationOverridesSchema,
    })
    .strict(),
  ...sceneEditOperationSchemas,
]);

export const projectPatchPlanSchema = z
  .object({
    summary: labelSchema,
    operations: z.array(projectPatchOperationSchema).min(1).max(20),
  })
  .strict();

export type ProjectPatchOperation = z.infer<typeof projectPatchOperationSchema>;
export type ProjectPatchPlan = z.infer<typeof projectPatchPlanSchema>;

export interface ProjectPatchError {
  operationIndex: number;
  code:
    | "ANIMATION_NOT_FOUND"
    | "ANIMATION_OVERRIDE_CONFLICT"
    | "ANIMATION_INTERVAL_INVALID"
    | "ANIMATION_CUE_INVALID"
    | "INVALID_REFERENCE"
    | "ID_EXISTS"
    | "INDEX_INVALID"
    | "ACT_NOT_FOUND"
    | "SUBJECT_NOT_FOUND"
    | "ASSET_GROUP_NOT_FOUND"
    | "STATE_NOT_FOUND"
    | "AUDIO_NOT_FOUND"
    | "ANIMATION_CUE_INVALID"
    | "THEME_ID_EXISTS"
    | "THEME_NOT_FOUND"
    | "THEME_IMAGE_NOT_FOUND"
    | "SCENE_NOT_FOUND"
    | "ACTOR_NOT_FOUND"
    | "ACTOR_LOCKED"
    | "LAYER_LOCKED"
    | "VARIANT_NOT_FOUND"
    | "DIALOGUE_NOT_FOUND"
    | "DIALOGUE_HAS_INLINE_COMMANDS"
    | "CONTENT_INDEX_INVALID"
    | "EMPTY_DIALOGUE"
    | "DIRECTION_REFERENCE_INVALID"
    | "ACTOR_REFERENCED"
    | "ANIMATION_INVALID";
  message: string;
}

export type ApplyProjectPatchResult =
  | { ok: true; project: Project; appliedOperations: number }
  | { ok: false; project: Project; errors: ProjectPatchError[] };

function findScene(project: Project, sceneId: string): Scene | undefined {
  for (const act of project.acts) {
    const scene = act.scenes.find((candidate) => candidate.id === sceneId);
    if (scene) return scene;
  }
  return undefined;
}

function directionTarget(tag: InlineTag): string | undefined {
  if ("actor" in tag.params) return tag.params.actor;
  return tag.name === "set" ? tag.params.target : undefined;
}

function hasLockedDirection(scene: Scene, tags: InlineTag[]): boolean {
  return tags.some(
    (tag) =>
      ((isPerformanceCommand(tag.name) || tag.name === "camera") &&
        scene.actors.some(
          (a) =>
            a.locked &&
            (("actor" in tag.params && tag.params.actor === a.id) ||
              ("other" in tag.params && tag.params.other === a.id) ||
              tag.name === "awake" ||
              !!depthCameraMode(tag)),
        )) ||
      ((tag.name === "awake" || !!depthCameraMode(tag)) &&
        !!(scene.lockedElements?.background || scene.lockedElements?.cg)) ||
      (tag.name === "animation" &&
        !!scene.animationClips
          ?.find((c) => c.id === tag.params.clipId)
          ?.targets.some(
            (t) =>
              t.kind === "actor" &&
              scene.actors.some((a) => a.id === t.ref && a.locked),
          )) ||
      scene.actors.some(
        (actor) => actor.id === directionTarget(tag) && actor.locked,
      ) ||
      (tag.name === "set" &&
        (tag.params.target === "$background" || tag.params.target === "$cg") &&
        !!scene.lockedElements?.[
          tag.params.target === "$background" ? "background" : "cg"
        ]),
  );
}

function validateDirection(
  project: Project,
  scene: Scene,
  tag: InlineTag,
  operationIndex: number,
): ProjectPatchError | undefined {
  if (
    tag.name === "set" &&
    (tag.params.target === "$background" || tag.params.target === "$cg")
  ) {
    const layer = tag.params.target === "$background" ? "background" : "cg";
    if (scene.lockedElements?.[layer])
      return {
        operationIndex,
        code: "LAYER_LOCKED",
        message: "Unlock the layer before editing its directions",
      };
  }
  if (tag.name === "bgm" || tag.name === "sfx") {
    const asset = tag.params.asset;
    if (
      asset &&
      !project.assets.audio[tag.name === "bgm" ? "bgm" : "sfx"].some(
        (a) => a.id === asset || a.name === asset || a.url === asset,
      )
    )
      return {
        operationIndex,
        code: "AUDIO_NOT_FOUND",
        message: "Import the referenced audio before scheduling it",
      };
    return undefined;
  }
  if (
    tag.name === "say" &&
    tag.params.theme &&
    !(BUILTIN_DIALOGUE_THEME_IDS as readonly string[]).includes(
      tag.params.theme,
    ) &&
    !project.assets.themes.some((t) => t.id === tag.params.theme)
  )
    return {
      operationIndex,
      code: "THEME_NOT_FOUND",
      message: "Inline theme does not exist",
    };
  const reference = directionTarget(tag);
  if (!reference) return undefined;
  const actor = scene.actors.find((candidate) => candidate.id === reference);
  const isLayer =
    tag.name === "set" && (reference === "$background" || reference === "$cg");
  if (!actor && !isLayer)
    return {
      operationIndex,
      code: "DIRECTION_REFERENCE_INVALID",
      message: `Direction target '${reference}' does not exist in this scene`,
    };
  if (actor?.locked)
    return {
      operationIndex,
      code: "ACTOR_LOCKED",
      message: `Actor '${reference}' is locked`,
    };
  if (tag.name !== "set") return undefined;
  const groups = actor
    ? project.assets.visual[actor.assetType === "prop" ? "prop" : "character"]
    : reference === "$background"
      ? project.assets.visual.background
      : project.assets.visual.cg;
  const layerReference =
    reference === "$background" ? scene.backgroundId : scene.cgId;
  const group = actor
    ? groups.find((candidate) => candidate.id === actor.characterId)
    : groups.find(
        (candidate) =>
          candidate.id === layerReference ||
          candidate.variants.some((variant) => variant.id === layerReference),
      );
  if (!group?.variants.some((variant) => variant.id === tag.params.variant))
    return {
      operationIndex,
      code: "VARIANT_NOT_FOUND",
      message: "Direction sprite must be an existing variant of its target",
    };
  if (tag.params.stateId) {
    const subjectId =
      actor?.visualSubjectId ??
      (reference === "$background"
        ? scene.backgroundSubjectId
        : scene.cgSubjectId);
    const subject = project.visualSubjects.find((s) => s.id === subjectId);
    if (
      !subject?.states.some((s) => s.id === tag.params.stateId) ||
      subject.binding?.stateMap[tag.params.stateId] !== tag.params.variant
    )
      return {
        operationIndex,
        code: "VARIANT_NOT_FOUND",
        message: "State must match the bound story identity and variant",
      };
  }
  return undefined;
}

function validateOperation(
  project: Project,
  operation: Exclude<
    ProjectPatchOperation,
    import("./structure-patch").StructureOperation
  >,
  operationIndex: number,
): ProjectPatchError | undefined {
  const scene = findScene(project, operation.sceneId);
  if (!scene) {
    return {
      operationIndex,
      code: "SCENE_NOT_FOUND",
      message: `Scene '${operation.sceneId}' does not exist`,
    };
  }
  if (
    operation.type === "animation.set" ||
    operation.type === "animation.remove" ||
    operation.type === "animation.override"
  ) {
    if (
      operation.type === "animation.set" &&
      operation.clip.sceneId !== scene.id
    )
      return {
        operationIndex,
        code: "ANIMATION_INVALID",
        message: "Animation scene binding does not match patch scene",
      };
    const previous = scene.animationClips?.find(
      (c) =>
        c.id ===
        (operation.type === "animation.set"
          ? operation.clip.id
          : operation.animationId),
    );
    const protectedTargets = [
      ...(previous?.targets ?? []),
      ...(operation.type === "animation.set" ? operation.clip.targets : []),
    ];
    for (const target of protectedTargets)
      if (
        target.kind === "actor" &&
        scene.actors.find((a) => a.id === target.ref)?.locked
      )
        return {
          operationIndex,
          code: "ACTOR_LOCKED",
          message:
            "Unlock animation actor before editing or removing its animation",
        };
    if (operation.type !== "animation.set" && !previous)
      return {
        operationIndex,
        code: "ANIMATION_NOT_FOUND",
        message: "Visual fragment does not exist",
      };
    if (
      operation.type === "animation.set" &&
      previous?.overrides &&
      !operation.resetOverrides &&
      (previous.width !== operation.clip.width ||
        previous.height !== operation.clip.height ||
        previous.space !== operation.clip.space ||
        JSON.stringify(previous.follow) !==
          JSON.stringify(operation.clip.follow))
    )
      return {
        operationIndex,
        code: "ANIMATION_OVERRIDE_CONFLICT",
        message:
          "Reference canvas, coordinate space or follow target changed; explicitly reset overrides or preserve the original coordinates",
      };
  }
  if (operation.type === "actor.lock" || operation.type === "actor.remove") {
    const actor = scene.actors.find((a) => a.id === operation.actorId);
    if (!actor)
      return {
        operationIndex,
        code: "ACTOR_NOT_FOUND",
        message: "Actor does not exist",
      };
    if (
      operation.type === "actor.remove" &&
      scene.animationClips?.some(
        (c) =>
          c.follow?.actorId === operation.actorId ||
          c.targets.some(
            (t) => t.kind === "actor" && t.ref === operation.actorId,
          ),
      )
    )
      return {
        operationIndex,
        code: "ACTOR_REFERENCED",
        message: "Remove or rebind the animation before deleting its actor",
      };
    if (operation.type === "actor.remove" && actor.locked)
      return {
        operationIndex,
        code: "ACTOR_LOCKED",
        message: "Unlock the actor before removing it",
      };
  }
  const layers: Array<"background" | "cg" | "dialogue"> = [];
  if (operation.type === "scene.update") {
    if (
      operation.backgroundId !== undefined ||
      operation.backgroundVisible !== undefined
    )
      layers.push("background");
    if (operation.cgId !== undefined || operation.cgVisible !== undefined)
      layers.push("cg");
  }
  if (operation.type === "scene.layer.clear") layers.push(operation.layer);
  if (
    operation.type === "dialogue.style.update" ||
    operation.type === "dialogue.layout.update" ||
    operation.type === "dialogue.theme.apply" ||
    operation.type === "dialogue.theme.link"
  )
    layers.push("dialogue");
  if (layers.some((layer) => scene.lockedElements?.[layer]))
    return {
      operationIndex,
      code: "LAYER_LOCKED",
      message: "Unlock the layer before editing it",
    };
  if (operation.type === "scene.update") {
    for (const [kind, id] of [
      ["background", operation.backgroundId],
      ["cg", operation.cgId],
    ] as const) {
      if (
        id &&
        !project.assets.visual[kind].some((g) =>
          g.variants.some((v) => v.id === id),
        )
      )
        return {
          operationIndex,
          code: "VARIANT_NOT_FOUND",
          message: "Scene layer requires an existing image variant",
        };
    }
  }
  if (operation.type === "dialogue.theme.create") {
    if (
      (BUILTIN_DIALOGUE_THEME_IDS as readonly string[]).includes(
        operation.theme.id,
      ) ||
      project.assets.themes.some((theme) => theme.id === operation.theme.id)
    )
      return {
        operationIndex,
        code: "THEME_ID_EXISTS",
        message:
          "Create a new theme ID; existing shared themes cannot be overwritten",
      };
    const data = operation.theme.data;
    if (data.boxImageUrl) {
      const frames = project.assets.themes.map((theme) => ({
        id: theme.data.boxImageAssetId ?? theme.id,
        url: theme.data.boxImageUrl,
      }));
      const images = [
        ...project.assets.visual.character,
        ...project.assets.visual.background,
        ...project.assets.visual.prop,
        ...project.assets.visual.cg,
      ].flatMap((group) => group.variants);
      if (
        ![...frames, ...images].some(
          (image) =>
            image.url === data.boxImageUrl &&
            (!data.boxImageAssetId || image.id === data.boxImageAssetId),
        )
      )
        return {
          operationIndex,
          code: "THEME_IMAGE_NOT_FOUND",
          message: "Import the frame before referencing it in a theme",
        };
    }
  }
  if (
    operation.type === "dialogue.theme.apply" &&
    !(BUILTIN_DIALOGUE_THEME_IDS as readonly string[]).includes(
      operation.themeId,
    ) &&
    !project.assets.themes.some((theme) => theme.id === operation.themeId)
  )
    return {
      operationIndex,
      code: "THEME_NOT_FOUND",
      message: "Select an existing theme or create it earlier in this plan",
    };
  if (operation.type === "actor.update") {
    const actor = scene.actors.find(
      (candidate) => candidate.id === operation.actorId,
    );
    if (!actor) {
      return {
        operationIndex,
        code: "ACTOR_NOT_FOUND",
        message: `Actor '${operation.actorId}' does not exist in scene '${scene.id}'`,
      };
    }
    if (actor.locked) {
      return {
        operationIndex,
        code: "ACTOR_LOCKED",
        message: `Actor '${operation.actorId}' is locked`,
      };
    }
    if (operation.variantId) {
      const groups =
        actor.assetType === "prop"
          ? project.assets.visual.prop
          : project.assets.visual.character;
      const group = groups.find(
        (candidate) => candidate.id === actor.characterId,
      );
      if (
        !group?.variants.some((variant) => variant.id === operation.variantId)
      ) {
        return {
          operationIndex,
          code: "VARIANT_NOT_FOUND",
          message: `Variant '${operation.variantId}' is not available for actor '${operation.actorId}'`,
        };
      }
    }
  }
  if (operation.type === "dialogue.insert") {
    for (const segment of operation.content ?? []) {
      if (segment.type !== "tag") continue;
      if (hasLockedDirection(scene, [segment]))
        return {
          operationIndex,
          code: "ACTOR_LOCKED",
          message: "Unlock the actor before adding its directions",
        };
      const error = validateDirection(project, scene, segment, operationIndex);
      if (error) return error;
    }
    if (
      operation.id &&
      project.acts.some((a) =>
        a.scenes.some((s) => s.script.nodes.some((n) => n.id === operation.id)),
      )
    )
      return {
        operationIndex,
        code: "ID_EXISTS",
        message: "Dialogue ID already exists",
      };
    if (operation.index > scene.script.nodes.length)
      return {
        operationIndex,
        code: "CONTENT_INDEX_INVALID",
        message: "Dialogue insertion index is out of range",
      };
    if (
      operation.actorId &&
      !scene.actors.some((actor) => actor.id === operation.actorId)
    )
      return {
        operationIndex,
        code: "ACTOR_NOT_FOUND",
        message: "Dialogue speaker does not exist in this scene",
      };
  }
  if ("nodeId" in operation) {
    const node = scene.script.nodes.find(
      (candidate) => candidate.id === operation.nodeId,
    );
    if (!node || node.type !== "text") {
      return {
        operationIndex,
        code: "DIALOGUE_NOT_FOUND",
        message: `Dialogue '${operation.nodeId}' does not exist in scene '${scene.id}'`,
      };
    }
    if (operation.type === "dialogue.content.update") {
      const oldTags = getTextNodeContent(node).filter(
        (p): p is InlineTag => p.type === "tag",
      );
      const newTags = operation.content.filter(
        (p): p is InlineTag => p.type === "tag",
      );
      const locked = (tags: InlineTag[]) =>
        tags.filter((tag) => hasLockedDirection(scene, [tag]));
      if (JSON.stringify(locked(oldTags)) !== JSON.stringify(locked(newTags)))
        return {
          operationIndex,
          code: "ACTOR_LOCKED",
          message: "Directions for locked objects must remain unchanged",
        };
      for (const tag of newTags) {
        if (oldTags.some((old) => JSON.stringify(old) === JSON.stringify(tag)))
          continue;
        const error = validateDirection(project, scene, tag, operationIndex);
        if (error) return error;
      }
    }
    if (
      operation.type === "dialogue.update" &&
      node.content?.some((segment) => segment.type === "tag")
    ) {
      return {
        operationIndex,
        code: "DIALOGUE_HAS_INLINE_COMMANDS",
        message: `Dialogue '${operation.nodeId}' contains inline commands and cannot be replaced by dialogue.update`,
      };
    }
    if (
      operation.type === "dialogue.settings" &&
      operation.actorId &&
      !scene.actors.some((actor) => actor.id === operation.actorId)
    )
      return {
        operationIndex,
        code: "ACTOR_NOT_FOUND",
        message: "Dialogue speaker does not exist in this scene",
      };
    if (
      operation.type === "dialogue.move" &&
      operation.index >= scene.script.nodes.length
    )
      return {
        operationIndex,
        code: "CONTENT_INDEX_INVALID",
        message: "Dialogue move index is out of range",
      };
    if (operation.type === "direction.insert" || "contentIndex" in operation) {
      const content = getTextNodeContent(node);
      const contentIndex = operation.contentIndex;
      const segment =
        contentIndex === undefined ? undefined : content[contentIndex];
      if (
        operation.type === "direction.insert"
          ? contentIndex > content.length
          : operation.type === "dialogue.segment.update"
            ? segment?.type !== "text"
            : segment?.type !== "tag"
      ) {
        return {
          operationIndex,
          code: "CONTENT_INDEX_INVALID",
          message: "The requested text segment or direction does not exist",
        };
      }
      if ("direction" in operation) {
        if (
          hasLockedDirection(scene, [
            { type: "tag", ...operation.direction } as InlineTag,
          ])
        )
          return {
            operationIndex,
            code: "ACTOR_LOCKED",
            message: "Unlock the actor before editing its directions",
          };
        const error = validateDirection(
          project,
          scene,
          { type: "tag", ...operation.direction } as InlineTag,
          operationIndex,
        );
        if (error) return error;
      }
      if (
        (operation.type === "direction.remove" ||
          operation.type === "direction.update") &&
        segment?.type === "tag" &&
        hasLockedDirection(scene, [segment])
      ) {
        return {
          operationIndex,
          code: "ACTOR_LOCKED",
          message: "The original direction targets a locked object",
        };
      }
    }
    if (
      (operation.type === "dialogue.remove" ||
        operation.type === "dialogue.move") &&
      hasLockedDirection(
        scene,
        getTextNodeContent(node).filter(
          (segment): segment is InlineTag => segment.type === "tag",
        ),
      )
    ) {
      return {
        operationIndex,
        code: "ACTOR_LOCKED",
        message: "The line contains a direction targeting a locked actor",
      };
    }
  }
  return undefined;
}

function applyOperation(
  project: Project,
  scene: Scene,
  operation: Exclude<
    ProjectPatchOperation,
    import("./structure-patch").StructureOperation
  >,
): Scene {
  if (operation.type === "animation.set") {
    const previous = scene.animationClips?.find(
      (c) => c.id === operation.clip.id,
    );
    const clip = {
      ...operation.clip,
      overrides: operation.resetOverrides
        ? undefined
        : (previous?.overrides ?? operation.clip.overrides),
    };
    return {
      ...scene,
      animationClips: [
        ...(scene.animationClips ?? []).filter((c) => c.id !== clip.id),
        clip,
      ],
    };
  }
  if (operation.type === "animation.remove")
    return {
      ...scene,
      animationClips: (scene.animationClips ?? []).filter(
        (c) => c.id !== operation.animationId,
      ),
    };
  if (operation.type === "animation.override")
    return {
      ...scene,
      animationClips: (scene.animationClips ?? []).map((c) =>
        c.id === operation.animationId
          ? { ...c, overrides: { ...c.overrides, ...operation.overrides } }
          : c,
      ),
    };
  if (operation.type === "scene.layer.lock")
    return {
      ...scene,
      lockedElements: {
        ...scene.lockedElements,
        [operation.layer]: operation.locked,
      },
    };
  if (operation.type === "dialogue.style.update") {
    const current = resolveDialogueProps(scene, project.meta);
    return {
      ...scene,
      dialoguePropsLinked: false,
      dialogueThemeId: current.dialogueThemeId,
      defaultDisplayMode: current.defaultDisplayMode,
      readingPace: current.readingPace,
      lineGap: current.lineGap,
      dialogueThemeOverrides: {
        ...(scene.dialoguePropsLinked === false
          ? scene.dialogueThemeOverrides
          : {}),
        ...(current.dialogueX !== undefined
          ? { dialogueX: current.dialogueX }
          : {}),
        ...(current.dialogueY !== undefined
          ? { dialogueY: current.dialogueY }
          : {}),
        ...(operation.fontSize !== undefined
          ? { fontSize: operation.fontSize }
          : {}),
        ...(operation.nameFontSize !== undefined
          ? { nameFontSize: operation.nameFontSize }
          : {}),
        ...(operation.boxWidthPercent !== undefined
          ? { boxWidthPercent: operation.boxWidthPercent }
          : {}),
        ...(operation.boxHeight !== undefined
          ? { boxHeight: operation.boxHeight }
          : {}),
      },
    };
  }
  if (operation.type === "dialogue.layout.update") {
    const current = resolveDialogueProps(scene, project.meta);
    return {
      ...scene,
      dialoguePropsLinked: false,
      dialogueThemeId: current.dialogueThemeId,
      defaultDisplayMode: current.defaultDisplayMode,
      readingPace: current.readingPace,
      lineGap: current.lineGap,
      dialogueThemeOverrides: {
        ...(scene.dialoguePropsLinked === false
          ? scene.dialogueThemeOverrides
          : {}),
        dialogueX: operation.x,
        dialogueY: operation.y,
      },
    };
  }
  if (operation.type === "scene.settings.link")
    return operation.linked
      ? { ...scene, sceneSettingsLinked: true }
      : {
          ...scene,
          ...resolveSceneSettings(scene, project.meta),
          sceneSettingsLinked: false,
        };
  if (operation.type === "scene.settings.update")
    return areSceneSettingsLinked(scene)
      ? scene
      : {
          ...scene,
          ...resolveSceneSettings(scene, project.meta),
          ...operation.settings,
          sceneSettingsLinked: false,
        };
  if (operation.type === "scene.defaults.update") return scene;
  if (operation.type === "scene.props.link")
    return operation.linked
      ? { ...scene, scenePropsLinked: true }
      : {
          ...scene,
          ...resolveSceneProps(scene, project.meta.sceneDefaults),
          transition: resolveSceneProps(scene, project.meta.sceneDefaults)
            .transition as Scene["transition"],
          scenePropsLinked: false,
        };
  if (operation.type === "actor.lock")
    return {
      ...scene,
      actors: scene.actors.map((a) =>
        a.id === operation.actorId ? { ...a, locked: operation.locked } : a,
      ),
    };
  if (operation.type === "actor.remove") {
    const id = operation.actorId;
    return {
      ...scene,
      actors: scene.actors.filter((a) => a.id !== id),
      script: {
        ...scene.script,
        nodes: scene.script.nodes.map((node) => {
          const content = getTextNodeContent(node).filter(
            (seg) => seg.type !== "tag" || directionTarget(seg) !== id,
          );
          const changed = node.actorId === id;
          const next = {
            ...node,
            ...(node.content
              ? {
                  content,
                  text: content
                    .filter((seg) => seg.type === "text")
                    .map((seg) => seg.text)
                    .join(""),
                }
              : {}),
            ...(changed ? { actorId: undefined } : {}),
          };
          if (changed || getTtsText(next) !== getTtsText(node)) {
            delete next.audioUrl;
            delete next.audioDuration;
            delete next.ttsSnapshot;
            delete next.audioImportSnapshot;
          }
          return next;
        }),
      },
    };
  }
  if (operation.type === "scene.layer.clear") {
    const target = operation.layer === "background" ? "$background" : "$cg";
    return {
      ...scene,
      [operation.layer === "background" ? "backgroundId" : "cgId"]: undefined,
      [operation.layer === "background"
        ? "backgroundSubjectId"
        : "cgSubjectId"]: undefined,
      [operation.layer === "background" ? "backgroundStateId" : "cgStateId"]:
        undefined,
      script: {
        ...scene.script,
        nodes: scene.script.nodes.map((node) =>
          node.content
            ? {
                ...node,
                content: node.content.filter(
                  (seg) =>
                    seg.type !== "tag" || directionTarget(seg) !== target,
                ),
              }
            : node,
        ),
      },
    };
  }
  if (operation.type === "dialogue.theme.create") return scene;
  if (operation.type === "dialogue.theme.link")
    return {
      ...scene,
      dialoguePropsLinked: true,
      dialogueThemeId: undefined,
      dialogueThemeOverrides: undefined,
      defaultDisplayMode: undefined,
      readingPace: undefined,
      lineGap: undefined,
    };
  if (operation.type === "dialogue.theme.apply") {
    const current = resolveDialogueProps(scene, project.meta);
    const theme = project.assets.themes.find(
      (theme) => theme.id === operation.themeId,
    );
    return {
      ...scene,
      dialoguePropsLinked: false,
      dialogueThemeId: operation.themeId,
      dialogueThemeOverrides: undefined,
      defaultDisplayMode:
        operation.displayMode ??
        theme?.data.defaultDisplayMode ??
        current.defaultDisplayMode,
      readingPace: operation.readingPace ?? current.readingPace,
      lineGap: operation.lineGap ?? current.lineGap,
    };
  }
  if (operation.type === "actor.update") {
    const { type: _type, sceneId: _sceneId, actorId, ...updates } = operation;
    return {
      ...scene,
      actors: scene.actors.map((actor) =>
        actor.id === actorId
          ? {
              ...actor,
              ...updates,
              ...(operation.variantId ? { visualStateId: undefined } : {}),
            }
          : actor,
      ),
    };
  }
  if (operation.type === "dialogue.insert") {
    const nodes = [...scene.script.nodes];
    nodes.splice(operation.index, 0, {
      id: operation.id ?? createId(),
      type: "text",
      text: operation.content
        ? operation.content
            .filter((segment) => segment.type === "text")
            .map((segment) => segment.text)
            .join("")
        : operation.text!,
      ...(operation.content ? { content: operation.content } : {}),
      actorId: operation.actorId,
    });
    return { ...scene, script: { ...scene.script, nodes } };
  }
  if ("nodeId" in operation) {
    if (operation.type === "dialogue.remove")
      return {
        ...scene,
        script: {
          ...scene.script,
          nodes: scene.script.nodes.filter(
            (node) => node.id !== operation.nodeId,
          ),
        },
      };
    if (operation.type === "dialogue.move") {
      const nodes = [...scene.script.nodes];
      const [node] = nodes.splice(
        nodes.findIndex((node) => node.id === operation.nodeId),
        1,
      );
      nodes.splice(operation.index, 0, node!);
      return { ...scene, script: { ...scene.script, nodes } };
    }
    const updateNode = (node: TextNode): TextNode => {
      let next: TextNode;
      if (operation.type === "dialogue.timing") {
        return { ...node, timing: operation.timing };
      }
      if (operation.type === "dialogue.settings") {
        next = { ...node };
        if (operation.actorId !== undefined)
          next.actorId = operation.actorId ?? undefined;
        if (operation.emotion !== undefined)
          next.emotion = operation.emotion ?? undefined;
        if (operation.voiceVolume !== undefined)
          next.voiceVolume = operation.voiceVolume;
      } else if (operation.type === "dialogue.content.update") {
        next = {
          ...node,
          content: operation.content,
          text: operation.content
            .filter((p) => p.type === "text")
            .map((p) => p.text)
            .join(""),
        };
      } else if (operation.type === "dialogue.update") {
        next = { ...node, text: operation.text, content: undefined };
      } else {
        const content = [...getTextNodeContent(node)];
        if (operation.type === "dialogue.segment.update") {
          const segment = content[operation.contentIndex];
          if (segment?.type === "text")
            content[operation.contentIndex] = {
              ...segment,
              text: operation.text,
            };
        } else if (operation.type === "direction.remove")
          content.splice(operation.contentIndex, 1);
        else {
          const tag = {
            type: "tag" as const,
            ...operation.direction,
          } as InlineTag;
          if (operation.type === "direction.insert")
            content.splice(operation.contentIndex, 0, tag);
          else content[operation.contentIndex] = tag;
        }
        next = {
          ...node,
          content,
          text: content
            .filter((segment) => segment.type === "text")
            .map((segment) => segment.text)
            .join(""),
        };
      }
      if (
        getTtsText(next) !== getTtsText(node) ||
        next.actorId !== node.actorId ||
        next.emotion !== node.emotion
      )
        next = {
          ...next,
          audioUrl: undefined,
          audioDuration: undefined,
          ttsSnapshot: undefined,
        };
      return next;
    };
    return {
      ...scene,
      script: {
        ...scene.script,
        nodes: scene.script.nodes.map((node) =>
          node.id === operation.nodeId && node.type === "text"
            ? updateNode(node)
            : node,
        ),
      },
    };
  }
  const {
    type: _type,
    sceneId: _sceneId,
    backgroundId,
    cgId,
    ...updates
  } = operation;
  const changesLinkedProps =
    operation.dimBrightness !== undefined ||
    operation.backgroundColor !== undefined ||
    operation.transition !== undefined ||
    operation.autoEntrance !== undefined ||
    operation.entranceEffect !== undefined ||
    operation.speakerScale !== undefined;
  const inherited =
    changesLinkedProps &&
    (scene.sceneSettingsLinked ?? scene.scenePropsLinked) !== false
      ? {
          ...resolveSceneProps(scene, project.meta.sceneDefaults),
          scenePropsLinked: false,
          ...(scene.sceneSettingsLinked !== undefined
            ? {
                ...resolveSceneSettings(scene, project.meta),
                sceneSettingsLinked: false,
              }
            : {}),
        }
      : {};
  return {
    ...scene,
    ...inherited,
    ...updates,
    ...(backgroundId !== undefined
      ? {
          backgroundId: backgroundId ?? undefined,
          backgroundSubjectId: undefined,
          backgroundStateId: undefined,
        }
      : {}),
    ...(cgId !== undefined
      ? {
          cgId: cgId ?? undefined,
          cgSubjectId: undefined,
          cgStateId: undefined,
        }
      : {}),
  };
}

export function applyProjectPatchPlan(
  project: Project,
  input: ProjectPatchPlan,
): ApplyProjectPatchResult {
  const plan = projectPatchPlanSchema.parse(input);
  let nextProject = project;
  for (const [index, operation] of plan.operations.entries()) {
    if (isStructureOperation(operation)) {
      if (operation.type === "scene.layer.bind") {
        const scene = findScene(nextProject, operation.sceneId),
          subject = nextProject.visualSubjects.find(
            (s) => s.id === operation.subjectId,
          );
        const layer =
          subject?.type === "location"
            ? "background"
            : subject?.type === "cg"
              ? "cg"
              : undefined;
        if (layer && scene?.lockedElements?.[layer])
          return {
            ok: false,
            project,
            errors: [
              {
                operationIndex: index,
                code: "LAYER_LOCKED",
                message: "Unlock the layer before rebinding it",
              },
            ],
          };
      }

      const result = applyStructureOperation(nextProject, operation);
      if (!result.ok)
        return {
          ok: false,
          project,
          errors: [
            {
              operationIndex: index,
              code: result.code as ProjectPatchError["code"],
              message: result.message,
            },
          ],
        };
      nextProject = {
        ...result.project,
        meta: { ...result.project.meta, updatedAt: new Date().toISOString() },
      };
      continue;
    }
    const error = validateOperation(nextProject, operation, index);
    if (error) return { ok: false, project, errors: [error] };
    const currentScene = findScene(nextProject, operation.sceneId)!;
    const nextScene = applyOperation(nextProject, currentScene, operation);
    const projectTheme =
      operation.type === "dialogue.theme.apply" &&
      (operation.scope === "project" || operation.scope === "default")
        ? operation
        : null;
    const themeMode = projectTheme
      ? (projectTheme.displayMode ??
        nextProject.assets.themes.find(
          (theme) => theme.id === projectTheme.themeId,
        )?.data.defaultDisplayMode)
      : undefined;
    nextProject = {
      ...nextProject,
      ...(operation.type === "dialogue.theme.create"
        ? {
            assets: {
              ...nextProject.assets,
              themes: [...nextProject.assets.themes, operation.theme],
            },
          }
        : {}),
      meta: {
        ...nextProject.meta,
        ...(operation.type === "scene.settings.update" &&
        areSceneSettingsLinked(currentScene)
          ? {
              sceneDefaults: {
                ...nextProject.meta.sceneDefaults,
                ...operation.settings,
              },
            }
          : {}),
        ...(operation.type === "scene.defaults.update"
          ? {
              sceneDefaults: {
                ...nextProject.meta.sceneDefaults,
                ...operation.defaults,
              },
            }
          : {}),
        ...(projectTheme
          ? {
              defaultDialogueThemeId: projectTheme.themeId,
              defaultDialogueX: undefined,
              defaultDialogueY: undefined,
              sceneDefaults: {
                ...nextProject.meta.sceneDefaults,
                ...(themeMode ? { defaultDisplayMode: themeMode } : {}),
                ...(projectTheme.readingPace !== undefined
                  ? { readingPace: projectTheme.readingPace }
                  : {}),
                ...(projectTheme.lineGap !== undefined
                  ? { lineGap: projectTheme.lineGap }
                  : {}),
              },
            }
          : {}),
        updatedAt: new Date().toISOString(),
      },
      acts: nextProject.acts.map((act) => ({
        ...act,
        scenes: act.scenes.map((scene) =>
          projectTheme
            ? projectTheme.scope === "project"
              ? applyOperation(nextProject, scene, projectTheme)
              : scene
            : scene.id === operation.sceneId
              ? nextScene
              : scene,
        ),
      })),
    };
  }
  for (const [index, operation] of plan.operations.entries()) {
    if (!("nodeId" in operation) || !("sceneId" in operation)) continue;
    const node = findScene(nextProject, operation.sceneId)!.script.nodes.find(
      (node) => node.id === operation.nodeId,
    );
    if (
      node &&
      !getTextNodePlainText(node).trim() &&
      !getTextNodeContent(node).some((segment) => segment.type === "tag")
    ) {
      return {
        ok: false,
        project,
        errors: [
          {
            operationIndex: index,
            code: "EMPTY_DIALOGUE",
            message: "A line must contain text or a direction",
          },
        ],
      };
    }
  }
  for (const scene of nextProject.acts.flatMap((a) => a.scenes))
    for (const clip of scene.animationClips ?? []) {
      if (
        clip.anchor &&
        !scene.script.nodes.some((n) => n.id === clip.anchor!.nodeId)
      )
        return {
          ok: false,
          project,
          errors: [
            {
              operationIndex: plan.operations.length - 1,
              code: "ANIMATION_CUE_INVALID",
              message:
                "An anchored animation references a deleted or missing dialogue node",
            },
          ],
        };
    }
  const previousIssues = new Set(
    collectProjectReferences(
      project,
      project.acts.flatMap((a) => a.scenes),
    ).issues.map((i) => JSON.stringify(i)),
  );
  const introduced = collectProjectReferences(
    nextProject,
    nextProject.acts.flatMap((a) => a.scenes),
  ).issues.find((i) => !previousIssues.has(JSON.stringify(i)));
  if (introduced)
    return {
      ok: false,
      project,
      errors: [
        {
          operationIndex: plan.operations.length - 1,
          code: introduced.code as ProjectPatchError["code"],
          message: introduced.message,
        },
      ],
    };
  return {
    ok: true,
    project: nextProject,
    appliedOperations: plan.operations.length,
  };
}

export function prepareProjectPatchPlan(
  input: ProjectPatchPlan,
): ProjectPatchPlan {
  const plan = projectPatchPlanSchema.parse(input);
  return {
    ...plan,
    operations: plan.operations.map((op) =>
      op.type === "dialogue.insert" ? { ...op, id: op.id ?? createId() } : op,
    ),
  };
}
