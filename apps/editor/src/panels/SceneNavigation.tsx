import React from "react";
import { createId, type ProjectPatchOperation } from "@vnve/core";
import { getAllVariants, type Project } from "@vnve/core";
import { mediaUrl } from "./shared";
import { SceneFilmstrip } from "../components/SceneFilmstrip";
/** Build scene navigation from the current project snapshot. */
export function SceneNavigation({
  project,
  sceneId,
  selectScene,
  disabled,
  patch,
  deleteScene,
}: {
  patch: (operations: ProjectPatchOperation[]) => boolean;
  deleteScene: (id: string) => void;
  project: Project;
  sceneId?: string;
  selectScene: (id: string) => void;
  disabled?: boolean;
}) {
  const addScene = (actId: string) => {
    const id = createId();
    if (patch([{ type: "scene.create", actId, sceneId: id, name: "新场景" }]))
      selectScene(id);
  };
  const moveScene = (
    srcActId: string,
    index: number,
    actId: string,
    target: number,
  ) => {
    const scene = project.acts.find((a) => a.id === srcActId)?.scenes[index];
    if (scene)
      patch([
        {
          type: "scene.move",
          sceneId: scene.id,
          actId,
          index: Math.min(
            target,
            (project.acts.find((a) => a.id === actId)?.scenes.length ?? 0) -
              (srcActId === actId ? 1 : 0),
          ),
        },
      ]);
  };
  const variants = getAllVariants(project.assets);
  return (
    <nav className="scene-navigation" aria-label="场景导航">
      <SceneFilmstrip
        currentSceneId={sceneId ?? ""}
        onSelectScene={selectScene}
        readOnly={disabled}
        onRenameScene={(sceneId, name) => {
          patch([{ type: "scene.update", sceneId, name }]);
        }}
        onAddScene={addScene}
        onMoveScene={moveScene}
        onDeleteScene={(_actId, id) => deleteScene(id)}
        acts={project.acts.map((act) => ({
          id: act.id,
          actName: act.name,
          scenes: act.scenes.map((scene) => {
            const bg = variants.find((v) => v.id === scene.backgroundId);
            return {
              id: scene.id,
              sceneName: scene.name,
              actorCount: scene.actors.length,
              thumbnailUrl: bg
                ? mediaUrl(bg.thumbnailUrl ?? bg.url)
                : undefined,
            };
          }),
        }))}
      />
    </nav>
  );
}
