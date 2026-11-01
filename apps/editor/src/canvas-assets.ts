import {
  type Project,
  type Scene,
  type ProjectPatchPlan,
  type AssetGroup,
  assetVariantSchema,
} from "@vnve/core";
export type CanvasAssetKind = "character" | "actor" | "background" | "cg";
/** Shared media stays independent from story identities and scene placements. */
export function canvasAssetPlan(
  project: Project,
  scene: Scene,
  kind: CanvasAssetKind,
  group: AssetGroup,
  variantId: string,
  actorId?: string,
  createGroup = false,
): ProjectPatchPlan["operations"] {
  const source = group.variants.find((v) => v.id === variantId)!;
  const operations: ProjectPatchPlan["operations"] = [];
  const actor = scene.actors.find((a) => a.id === actorId);
  if (kind === "actor") {
    if (!actor || actor.locked) throw new Error("请先选择未锁定的人物");
    if (actor.characterId === group.id && !createGroup)
      return [
        {
          type: "actor.update",
          sceneId: scene.id,
          actorId: actor.id,
          variantId: source.id,
        },
      ];
    const variants = (createGroup ? group.variants : [source]).map((source) =>
      assetVariantSchema.strip().parse({ ...source, id: crypto.randomUUID() }),
    );
    for (const variant of variants) {
      operations.push({
        type: "asset.variant.create",
        assetType: actor.assetType === "prop" ? "prop" : "character",
        groupId: actor.characterId,
        variant,
      });
      if (actor.visualSubjectId)
        operations.push({
          type: "subject.state.add",
          subjectId: actor.visualSubjectId,
          stateId: crypto.randomUUID(),
          name: variant.name,
          variantId: variant.id,
        });
    }
    operations.push({
      type: "actor.update",
      sceneId: scene.id,
      actorId: actor.id,
      variantId: variants[0].id,
    });
    return operations;
  }
  const assetType = kind === "character" ? "character" : kind;
  if (createGroup)
    operations.push({
      type: "asset.group.create",
      assetType,
      group: {
        id: group.id,
        name: group.name,
        defaultVariantId: source.id,
        variants: group.variants.map((v) =>
          assetVariantSchema.strip().parse(v),
        ),
      },
    });
  const subjectType = kind === "background" ? "location" : kind;
  const subject = project.visualSubjects.find(
    (s) => s.type === subjectType && s.binding?.assetGroupId === group.id,
  );
  const subjectId = subject?.id ?? crypto.randomUUID();
  const state = subject?.states.find(
    (s) => subject.binding?.stateMap[s.id] === source.id,
  );
  const stateId = state?.id ?? crypto.randomUUID();
  if (!subject)
    operations.push({
      type: "subject.create",
      subjectId,
      subjectType,
      name: group.name,
      groupId: group.id,
      stateId,
    });
  if (!state && (subject || group.defaultVariantId !== source.id))
    operations.push({
      type: "subject.state.add",
      subjectId,
      stateId: subject ? stateId : crypto.randomUUID(),
      name: source.name,
      variantId: source.id,
    });
  // subject.create binds its first state to the group's default variant.
  const chosenState = subject
    ? stateId
    : group.defaultVariantId === source.id
      ? stateId
      : operations.findLast((op) => op.type === "subject.state.add")!.stateId;
  if (kind === "character")
    operations.push({
      type: "actor.create",
      sceneId: scene.id,
      actorId: crypto.randomUUID(),
      subjectId,
      stateId: chosenState,
      x: 50,
      y: 100,
      scale: 1,
      visible: true,
      zIndex: Math.min(
        1000,
        Math.max(-1, ...scene.actors.map((a) => a.zIndex)) + 1,
      ),
    });
  else
    operations.push(
      {
        type: "scene.layer.bind",
        sceneId: scene.id,
        subjectId,
        stateId: chosenState,
      },
      {
        type: "scene.update",
        sceneId: scene.id,
        ...(kind === "background"
          ? { backgroundVisible: true, backgroundId: source.id }
          : { cgVisible: true, cgId: source.id }),
      },
    );
  return operations;
}
