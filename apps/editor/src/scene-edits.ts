import type { Project } from "@vnve/core";
/** Remove only the scene snapshot; shared assets and other scene identities survive undo/save. */
export function removeScene(project: Project, sceneId: string): Project {
  const scenes = project.acts.flatMap((act) => act.scenes);
  if (!scenes.some((scene) => scene.id === sceneId))
    throw new Error("场景不存在");
  if (scenes.length <= 1) throw new Error("至少保留一个场景");
  return {
    ...project,
    acts: project.acts.map((act) => ({
      ...act,
      scenes: act.scenes.filter((scene) => scene.id !== sceneId),
    })),
  };
}
