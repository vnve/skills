import type { InlineTag } from "./types/script";
export const SCENE_TRANSITION_TYPES = [
  "cut",
  "dissolve",
  "fade-black",
  "fade-white",
  "wipe-left",
  "wipe-right",
  "soft-dissolve",
] as const;
export const sceneTransitionOptions = [
  { value: "cut", label: "直切" },
  { value: "dissolve", label: "交叉淡化" },
  { value: "fade-black", label: "淡黑" },
  { value: "fade-white", label: "淡白" },
  { value: "wipe-left", label: "向左擦除" },
  { value: "wipe-right", label: "向右擦除" },
  { value: "soft-dissolve", label: "柔化溶解" },
] as const;
export function getSceneTransitionDirection(tag: InlineTag) {
  if (tag.name === "wipe")
    return {
      nextScene: tag.params.nextScene,
      effect:
        tag.params.direction === "right"
          ? ("wipe-right" as const)
          : ("wipe-left" as const),
      dur: tag.params.dur ?? 1,
      enabled: tag.params.enabled !== false,
    };
  if (tag.name === "transition")
    return {
      nextScene: tag.params.nextScene,
      effect: tag.params.effect,
      dur: tag.params.dur ?? 0.8,
      enabled: tag.params.enabled !== false,
    };
  return null;
}
export function isDissolveTransition(effect: string) {
  return effect === "dissolve" || effect === "soft-dissolve";
}
