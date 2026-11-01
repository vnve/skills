import type { ActorState, Project, ProjectPatchPlan } from "@vnve/core";
import { localMediaUrl } from "../core/local-workspace";
export type Patch = (
  operations: ProjectPatchPlan["operations"],
  assets?: Project["assets"],
) => boolean;
export const mediaUrl = (url: string) =>
  url.startsWith("assets/") ? localMediaUrl(url) : url;
export function actorInfo(project: Project, actor: ActorState) {
  const subject = project.visualSubjects?.find(
    (s) => s.id === actor.visualSubjectId,
  );
  const group = project.assets.visual[
    actor.assetType === "prop" ? "prop" : "character"
  ].find((g) => g.id === actor.characterId);
  const variant =
    group?.variants.find((v) => v.id === actor.variantId) ??
    group?.variants.find((v) => v.id === group.defaultVariantId) ??
    group?.variants[0];
  return {
    subject,
    group,
    variant,
    name: subject?.name ?? group?.name ?? "未命名角色",
  };
}

export function variantLabel(name: string) {
  return (
    (
      {
        default: "日常",
        neutral: "日常",
        happy: "开心",
        sad: "难过",
        angry: "生气",
        surprised: "惊讶",
        night: "夜晚",
        sunset: "黄昏",
        rain: "雨天",
        "after-hours": "闭店后",
      } as Record<string, string>
    )[name.toLowerCase()] ?? name
  );
}
