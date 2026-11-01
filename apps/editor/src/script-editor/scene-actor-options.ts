import {
  SET_TARGET_BACKGROUND,
  SET_TARGET_CG,
  type AssetGroup,
  type Scene,
  type VisualSubject,
} from "@vnve/core";

export interface SceneActorOption {
  actorId: string;
  characterId: string;
  assetType: "character" | "prop";
  label: string;
  voiceName?: string;
  variants: Array<{ id: string; name: string }>;
}

export interface SceneSetTargetOption {
  targetId: string;
  label: string;
  variants: Array<{ id: string; name: string }>;
}

function findGroupByVariantId(
  groups: AssetGroup[],
  variantId: string | undefined,
): AssetGroup | null {
  if (!variantId) return null;
  for (const group of groups) {
    if (group.variants.some((variant) => variant.id === variantId)) {
      return group;
    }
  }
  // Fallback: variantId may actually be a group id
  return groups.find((group) => group.id === variantId) ?? null;
}

function mapCurrentLayerVariants(
  groups: AssetGroup[],
  currentVariantId: string | undefined,
): Array<{ id: string; name: string }> {
  const group = findGroupByVariantId(groups, currentVariantId);
  if (!group) return [];
  return group.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
  }));
}

/**
 * Build actor options from current scene actors and their work-level identities.
 * Raw material instances without a matching VisualSubject are not script targets.
 */
export function buildSceneActorOptions(
  scene: Scene | null | undefined,
  visualSubjects: VisualSubject[],
  characters: AssetGroup[],
  props: AssetGroup[] = [],
): SceneActorOption[] {
  if (!scene) return [];
  return scene.actors.flatMap((actor) => {
    const isProp = actor.assetType === "prop";
    const subject = visualSubjects.find(
      (candidate) =>
        candidate.id === actor.visualSubjectId &&
        candidate.type === (isProp ? "prop" : "character"),
    );
    if (!subject) return [];

    const sourceGroup = isProp
      ? props.find((group) => group.id === actor.characterId)
      : characters.find((group) => group.id === actor.characterId);
    return [
      {
        actorId: actor.id,
        characterId: actor.characterId,
        assetType: isProp ? "prop" : "character",
        label: subject.name,
        voiceName:
          subject.type === "character"
            ? subject.voiceConfig?.voiceName || subject.voiceConfig?.voiceId
            : undefined,
        variants: (sourceGroup?.variants ?? []).map((variant) => ({
          id: variant.id,
          name: variant.name,
        })),
      },
    ];
  });
}

export function buildSceneSetTargetOptions(
  scene: Scene | null | undefined,
  actorOptions: SceneActorOption[],
  backgrounds: AssetGroup[],
  cgs: AssetGroup[],
  t: (key: string) => string = (k) => k,
): SceneSetTargetOption[] {
  if (!scene) return [];

  const actorTargets: SceneSetTargetOption[] = actorOptions.map((actor) => ({
    targetId: actor.actorId,
    label: actor.label,
    variants: actor.variants,
  }));

  if (backgrounds.length > 0) {
    actorTargets.push({
      targetId: SET_TARGET_BACKGROUND,
      label: t("editor.script.setTargetBackground"),
      variants: mapCurrentLayerVariants(backgrounds, scene.backgroundId),
    });
  }

  if (cgs.length > 0) {
    actorTargets.push({
      targetId: SET_TARGET_CG,
      label: t("editor.script.setTargetCg"),
      variants: mapCurrentLayerVariants(cgs, scene.cgId),
    });
  }

  return actorTargets;
}

export function getSetTargetLabel(
  targetId: unknown,
  options: SceneSetTargetOption[],
): string {
  if (typeof targetId !== "string" || !targetId) return "?";
  return (
    options.find((option) => option.targetId === targetId)?.label ?? targetId
  );
}
