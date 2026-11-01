import { z } from "zod/v3";
import type {
  Project,
  VisualSubject,
  AssetGroup,
  VisualAssetType,
} from "../types/project";
import { createDefaultScene } from "../helpers";
const id = z.string().trim().min(1).max(200),
  label = z.string().trim().min(1).max(500);
const assetType = z.enum(["character", "background", "prop", "cg"]);
const mediaUrl = z
  .string()
  .max(1000)
  .regex(
    /^(assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpe?g|webp|avif|gif|mp4|webm)|\/placeholders\/[a-zA-Z0-9_.-]+)$/i,
  );
export const assetVariantSchema = z
  .object({
    id,
    name: label,
    url: mediaUrl,
    key: id.optional(),
    width: z.number().finite().positive().optional(),
    height: z.number().finite().positive().optional(),
    mediaType: z.enum(["static", "animated", "video"]).optional(),
    duration: z.number().finite().positive().optional(),
    loop: z.boolean().optional(),
  })
  .strict();
export const structureOperationSchemas = [
  z
    .object({
      type: z.literal("act.create"),
      actId: id,
      name: label,
      index: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("scene.create"),
      actId: id,
      sceneId: id,
      name: label,
      index: z.number().int().nonnegative().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("scene.move"),
      sceneId: id,
      actId: id,
      index: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("asset.group.create"),
      assetType,
      group: z
        .object({
          id,
          name: label,
          defaultVariantId: id,
          variants: z.array(assetVariantSchema).min(1).max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("asset.variant.create"),
      assetType,
      groupId: id,
      variant: assetVariantSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("subject.create"),
      subjectId: id,
      subjectType: z.enum(["character", "location", "prop", "cg"]),
      name: label,
      groupId: id,
      stateId: id,
      gender: z.enum(["male", "female"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("subject.state.add"),
      subjectId: id,
      stateId: id,
      name: label,
      variantId: id,
    })
    .strict(),
  z
    .object({
      type: z.literal("subject.bind"),
      subjectId: id,
      groupId: id,
      stateMap: z.record(id, id).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("actor.create"),
      sceneId: id,
      actorId: id,
      subjectId: id,
      stateId: id.optional(),
      x: z.number().finite().min(-200).max(300).default(50),
      y: z.number().finite().min(-200).max(300).default(100),
      scale: z.number().finite().min(0.1).max(4).default(1),
      visible: z.boolean().default(true),
      flipX: z.boolean().optional(),
      zIndex: z.number().int().min(-1000).max(1000).default(0),
    })
    .strict(),
  z
    .object({
      type: z.literal("scene.layer.bind"),
      sceneId: id,
      subjectId: id,
      stateId: id.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("font.register"),
      font: z
        .object({
          id,
          name: label,
          url: z
            .string()
            .max(1000)
            .regex(/^assets\/fonts\/[a-zA-Z0-9_.-]+\.(?:ttf|otf|woff2?)$/i),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("project.update"),
      title: label.optional(),
      width: z.number().int().min(64).max(8192).optional(),
      height: z.number().int().min(64).max(8192).optional(),
      fps: z.number().int().min(1).max(120).optional(),
      artDirection: z.string().max(5000).optional(),
    })
    .strict(),
] as const;
export type StructureOperation = z.infer<
  (typeof structureOperationSchemas)[number]
>;
const types = new Set(structureOperationSchemas.map((s) => s.shape.type.value));
export function isStructureOperation(op: {
  type: string;
}): op is StructureOperation {
  return types.has(op.type as StructureOperation["type"]);
}
const groupType = (subject: VisualSubject) =>
  subject.type === "location" ? "background" : subject.type;
/** Structural edits stay isolated until the enclosing plan has passed all validation. */
export function applyStructureOperation(
  project: Project,
  op: StructureOperation,
):
  | { ok: true; project: Project }
  | { ok: false; code: string; message: string } {
  const next = structuredClone(project);
  const fail = (code: string, message: string) => ({
    ok: false as const,
    code,
    message,
  });
  const groupIds = Object.values(next.assets.visual).flat() as AssetGroup[];
  const variants = groupIds.flatMap((g) => g.variants);
  const occupied = (id: string) =>
    [
      ...next.acts,
      ...next.acts.flatMap((a) => a.scenes),
      ...next.acts.flatMap((a) => a.scenes.flatMap((s) => s.actors)),
      ...next.acts.flatMap((a) => a.scenes.flatMap((s) => s.script.nodes)),
      ...groupIds,
      ...variants,
      ...next.visualSubjects,
      ...next.visualSubjects.flatMap((s) => s.states),
      ...next.assets.fonts,
      ...next.assets.themes,
    ].some((x) => x.id === id);
  if (op.type === "project.update") {
    const { type, ...updates } = op;
    Object.assign(next.meta, updates);
    if (op.width || op.height)
      next.meta.aspect = `${next.meta.width}:${next.meta.height}`;
  } else if (op.type === "act.create") {
    if (occupied(op.actId)) return fail("ID_EXISTS", "Act ID already exists");
    if ((op.index ?? next.acts.length) > next.acts.length)
      return fail("INDEX_INVALID", "Act index is out of range");
    next.acts.splice(op.index ?? next.acts.length, 0, {
      id: op.actId,
      name: op.name,
      scenes: [],
    });
  } else if (op.type === "scene.create") {
    const act = next.acts.find((a) => a.id === op.actId);
    if (!act) return fail("ACT_NOT_FOUND", "Target act does not exist");
    if (occupied(op.sceneId))
      return fail("ID_EXISTS", "Scene ID already exists");
    if ((op.index ?? act.scenes.length) > act.scenes.length)
      return fail("INDEX_INVALID", "Scene index is out of range");
    act.scenes.splice(op.index ?? act.scenes.length, 0, {
      ...createDefaultScene(op.name),
      id: op.sceneId,
    });
  } else if (op.type === "scene.move") {
    const source = next.acts.find((a) =>
        a.scenes.some((s) => s.id === op.sceneId),
      ),
      target = next.acts.find((a) => a.id === op.actId);
    if (!source || !target)
      return fail(
        "SCENE_NOT_FOUND",
        "Source scene or target act does not exist",
      );
    const index = source.scenes.findIndex((s) => s.id === op.sceneId);
    const [scene] = source.scenes.splice(index, 1);
    if (op.index > target.scenes.length)
      return fail("INDEX_INVALID", "Scene index is out of range");
    target.scenes.splice(op.index, 0, scene!);
  } else if (op.type === "asset.group.create") {
    const ids = [op.group.id, ...op.group.variants.map((v) => v.id)];
    if (new Set(ids).size !== ids.length || ids.some(occupied))
      return fail("ID_EXISTS", "Asset IDs must be unique");
    if (!op.group.variants.some((v) => v.id === op.group.defaultVariantId))
      return fail("VARIANT_NOT_FOUND", "Default variant is missing");
    next.assets.visual[op.assetType].push({
      ...op.group,
      source: op.group.variants.every((v) => v.url.startsWith("/placeholders/"))
        ? "project-placeholder"
        : "workspace",
    });
  } else if (op.type === "asset.variant.create") {
    const group = next.assets.visual[op.assetType].find(
      (g) => g.id === op.groupId,
    );
    if (!group)
      return fail("ASSET_GROUP_NOT_FOUND", "Asset group does not exist");
    if (occupied(op.variant.id))
      return fail("ID_EXISTS", "Variant ID already exists");
    group.variants.push(op.variant);
  } else if (op.type === "font.register") {
    if (
      occupied(op.font.id) ||
      next.assets.fonts.some((f) => f.name === op.font.name)
    )
      return fail("ID_EXISTS", "Font ID or family already exists");
    next.assets.fonts.push(op.font);
  } else if (op.type === "subject.create") {
    const kind = op.subjectType === "location" ? "background" : op.subjectType;
    const group = next.assets.visual[kind].find((g) => g.id === op.groupId);
    if (!group)
      return fail(
        "ASSET_GROUP_NOT_FOUND",
        "Subject image group does not exist",
      );
    if (
      op.subjectId === op.stateId ||
      occupied(op.subjectId) ||
      occupied(op.stateId)
    )
      return fail("ID_EXISTS", "Subject and state IDs must be unique");
    next.visualSubjects.push({
      id: op.subjectId,
      type: op.subjectType,
      name: op.name,
      states: [{ id: op.stateId, name: "日常" }],
      defaultStateId: op.stateId,
      binding: {
        assetGroupId: group.id,
        stateMap: { [op.stateId]: group.defaultVariantId },
      },
      ...(op.subjectType === "character" && op.gender
        ? { gender: op.gender }
        : {}),
    } as VisualSubject);
  } else if (op.type === "subject.state.add" || op.type === "subject.bind") {
    const subject = next.visualSubjects.find((s) => s.id === op.subjectId);
    if (!subject)
      return fail("SUBJECT_NOT_FOUND", "Story identity does not exist");
    const oldBinding = subject.binding;
    const group = next.assets.visual[groupType(subject)].find(
      (g) =>
        g.id ===
        (op.type === "subject.bind"
          ? op.groupId
          : subject.binding?.assetGroupId),
    );
    if (!group)
      return fail(
        "ASSET_GROUP_NOT_FOUND",
        "Subject image group does not exist",
      );
    if (op.type === "subject.state.add") {
      if (occupied(op.stateId))
        return fail("ID_EXISTS", "State ID already exists");
      if (!group.variants.some((v) => v.id === op.variantId))
        return fail(
          "VARIANT_NOT_FOUND",
          "Variant must belong to the subject group",
        );
      subject.states.push({ id: op.stateId, name: op.name });
      subject.binding = {
        assetGroupId: group.id,
        stateMap: { ...subject.binding?.stateMap, [op.stateId]: op.variantId },
      };
    } else {
      if (
        Object.keys(op.stateMap ?? {}).some(
          (key) => !subject.states.some((s) => s.id === key),
        )
      )
        return fail(
          "STATE_NOT_FOUND",
          "Mapping contains an unknown story state",
        );
      const map = Object.fromEntries(
        subject.states.map((state) => [
          state.id,
          op.stateMap?.[state.id] ?? group.defaultVariantId,
        ]),
      );
      if (
        Object.values(map).some(
          (id) => !group.variants.some((v) => v.id === id),
        )
      )
        return fail(
          "VARIANT_NOT_FOUND",
          "State mapping must use variants from the new group",
        );
      const resolveState = (variant: string | undefined, stateId?: string) =>
        stateId && subject.states.some((s) => s.id === stateId)
          ? stateId
          : (subject.states.find((s) => oldBinding?.stateMap[s.id] === variant)
              ?.id ?? subject.defaultStateId);
      for (const scene of next.acts.flatMap((a) => a.scenes)) {
        const actors = scene.actors.filter(
          (a) => a.visualSubjectId === subject.id,
        );
        if (actors.some((a) => a.locked))
          return fail("ACTOR_LOCKED", "Cannot rebind a locked actor");
        const layer =
          subject.type === "location" &&
          scene.backgroundSubjectId === subject.id
            ? "background"
            : subject.type === "cg" && scene.cgSubjectId === subject.id
              ? "cg"
              : undefined;
        for (const node of scene.script.nodes)
          for (const tag of node.content ?? []) {
            if (tag.type !== "tag" || tag.name !== "set") continue;
            const target = tag.params.target;
            if (
              actors.some((a) => a.id === target) ||
              (layer && target === "$" + layer)
            ) {
              const state = resolveState(
                tag.params.variant,
                tag.params.stateId,
              );
              tag.params.variant = map[state]!;
              tag.params.stateId = state;
            }
          }
        for (const actor of actors) {
          const state = resolveState(actor.variantId, actor.visualStateId);
          actor.characterId = group.id;
          actor.variantId = map[state]!;
          actor.visualStateId = state;
        }
        if (layer === "background") {
          const state = resolveState(
            scene.backgroundId,
            scene.backgroundStateId,
          );
          scene.backgroundId = map[state];
          scene.backgroundStateId = state;
        }
        if (layer === "cg") {
          const state = resolveState(scene.cgId, scene.cgStateId);
          scene.cgId = map[state];
          scene.cgStateId = state;
        }
      }
      subject.binding = { assetGroupId: group.id, stateMap: map };
    }
  } else if (op.type === "scene.layer.bind") {
    const scene = next.acts
        .flatMap((a) => a.scenes)
        .find((s) => s.id === op.sceneId),
      subject = next.visualSubjects.find((s) => s.id === op.subjectId);
    if (!scene) return fail("SCENE_NOT_FOUND", "Scene does not exist");
    if (
      !subject ||
      !["location", "cg"].includes(subject.type) ||
      !subject.binding
    )
      return fail("SUBJECT_NOT_FOUND", "Bind a location or CG identity");
    const state = op.stateId ?? subject.defaultStateId,
      variant = subject.binding.stateMap[state];
    if (
      !subject.states.some((s) => s.id === state) ||
      !next.assets.visual[groupType(subject)].some(
        (g) =>
          g.id === subject.binding!.assetGroupId &&
          g.variants.some((v) => v.id === variant),
      )
    )
      return fail("VARIANT_NOT_FOUND", "Subject state has no matching image");
    if (subject.type === "location") {
      scene.backgroundSubjectId = subject.id;
      scene.backgroundStateId = state;
      scene.backgroundId = variant;
    } else {
      scene.cgSubjectId = subject.id;
      scene.cgStateId = state;
      scene.cgId = variant;
    }
  } else if (op.type === "actor.create") {
    const scene = next.acts
        .flatMap((a) => a.scenes)
        .find((s) => s.id === op.sceneId),
      subject = next.visualSubjects.find((s) => s.id === op.subjectId);
    if (!scene) return fail("SCENE_NOT_FOUND", "Scene does not exist");
    if (
      !subject ||
      !["character", "prop"].includes(subject.type) ||
      !subject.binding
    )
      return fail(
        "SUBJECT_NOT_FOUND",
        "Place a bound character or prop identity",
      );
    if (occupied(op.actorId))
      return fail("ID_EXISTS", "Actor ID already exists");
    const state = op.stateId ?? subject.defaultStateId,
      variantId = subject.binding.stateMap[state];
    const group = next.assets.visual[groupType(subject)].find(
      (g) => g.id === subject.binding!.assetGroupId,
    );
    if (
      !subject.states.some((s) => s.id === state) ||
      !group?.variants.some((v) => v.id === variantId)
    )
      return fail("VARIANT_NOT_FOUND", "Subject state has no matching image");
    scene.actors.push({
      id: op.actorId,
      visualSubjectId: subject.id,
      visualStateId: state,
      assetType: subject.type === "prop" ? "prop" : "character",
      characterId: group.id,
      variantId,
      x: op.x,
      y: op.y,
      scale: op.scale,
      visible: op.visible,
      flipX: op.flipX,
      zIndex: op.zIndex,
    });
  }
  return { ok: true, project: next };
}
