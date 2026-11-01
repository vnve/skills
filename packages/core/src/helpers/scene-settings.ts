import type { ProjectMeta, Scene, SceneDefaults } from "../types/project";
import {
  resolveDialogueProps,
  resolveSceneProps,
} from "./resolve-scene-property";

export type SceneSettings = Pick<
  SceneDefaults,
  | "transition"
  | "autoEntrance"
  | "entranceEffect"
  | "dimBrightness"
  | "speakerScale"
  | "defaultDisplayMode"
  | "readingPace"
  | "lineGap"
>;

export function areSceneSettingsLinked(scene: Scene): boolean {
  return (
    scene.sceneSettingsLinked ??
    (scene.scenePropsLinked !== false && scene.dialoguePropsLinked !== false)
  );
}

export function resolveSceneSettings(
  scene: Scene,
  meta: ProjectMeta,
): SceneSettings {
  const visual = resolveSceneProps(scene, meta.sceneDefaults);
  const dialogue = resolveDialogueProps(scene, meta);
  return {
    transition: (visual.transition ?? {
      type: "cut",
      duration: 0,
    }) as Scene["transition"],
    autoEntrance: visual.autoEntrance,
    entranceEffect: visual.entranceEffect,
    dimBrightness: visual.dimBrightness,
    speakerScale: visual.speakerScale,
    defaultDisplayMode: dialogue.defaultDisplayMode ?? "typewriter",
    readingPace: dialogue.readingPace ?? 1,
    lineGap: dialogue.lineGap ?? 0.15,
  };
}
