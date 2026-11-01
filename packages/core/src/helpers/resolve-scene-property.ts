import type { Scene, SceneDefaults, ProjectMeta } from "../types/project";
import type { TextDisplayMode } from "../types/timeline";

export interface ResolvedSceneProps {
  autoEntrance: boolean;
  entranceEffect: string;
  transition?: { type: string; duration?: number };
  dimBrightness: number;
  speakerScale: boolean;
  backgroundColor: string;
}

export interface ResolvedDialogueProps {
  dialogueThemeId?: string;
  defaultDisplayMode?: TextDisplayMode;
  readingPace?: number;
  lineGap?: number;
  dialogueX?: number;
  dialogueY?: number;
}

const SCENE_PROP_DEFAULTS: ResolvedSceneProps = {
  autoEntrance: true,
  entranceEffect: "fade",
  dimBrightness: 0.75,
  speakerScale: false,
  backgroundColor: "#000000",
};

export function isScenePropsLinked(scene: Scene): boolean {
  return scene.scenePropsLinked !== false;
}

export function isDialoguePropsLinked(scene: Scene): boolean {
  return scene.dialoguePropsLinked !== false;
}

function resolveLegacySceneProps(
  scene: Scene,
  defaults?: SceneDefaults,
): ResolvedSceneProps {
  if (isScenePropsLinked(scene)) {
    return {
      autoEntrance: defaults?.autoEntrance ?? SCENE_PROP_DEFAULTS.autoEntrance,
      entranceEffect:
        defaults?.entranceEffect ?? SCENE_PROP_DEFAULTS.entranceEffect,
      transition: defaults?.transition,
      dimBrightness:
        defaults?.dimBrightness ?? SCENE_PROP_DEFAULTS.dimBrightness,
      speakerScale: defaults?.speakerScale ?? SCENE_PROP_DEFAULTS.speakerScale,
      backgroundColor:
        defaults?.backgroundColor ?? SCENE_PROP_DEFAULTS.backgroundColor,
    };
  }
  return {
    autoEntrance: scene.autoEntrance ?? SCENE_PROP_DEFAULTS.autoEntrance,
    entranceEffect: scene.entranceEffect ?? SCENE_PROP_DEFAULTS.entranceEffect,
    transition: scene.transition,
    dimBrightness: scene.dimBrightness ?? SCENE_PROP_DEFAULTS.dimBrightness,
    speakerScale: scene.speakerScale ?? SCENE_PROP_DEFAULTS.speakerScale,
    backgroundColor:
      scene.backgroundColor ?? SCENE_PROP_DEFAULTS.backgroundColor,
  };
}

function resolveLegacyDialogueProps(
  scene: Scene,
  meta: ProjectMeta,
): ResolvedDialogueProps {
  if (isDialoguePropsLinked(scene)) {
    return {
      dialogueThemeId: meta.defaultDialogueThemeId,
      defaultDisplayMode: meta.sceneDefaults?.defaultDisplayMode,
      readingPace: meta.sceneDefaults?.readingPace ?? meta.readingPace,
      lineGap: meta.sceneDefaults?.lineGap ?? meta.lineGap,
      dialogueX: meta.defaultDialogueX,
      dialogueY: meta.defaultDialogueY,
    };
  }
  return {
    dialogueThemeId: scene.dialogueThemeId,
    defaultDisplayMode: scene.defaultDisplayMode,
    readingPace: scene.readingPace,
    lineGap: scene.lineGap,
    dialogueX: scene.dialogueThemeOverrides?.dialogueX,
    dialogueY: scene.dialogueThemeOverrides?.dialogueY,
  };
}

/** The unified playback link does not change background or dialogue styling links. */
export function resolveSceneProps(
  scene: Scene,
  defaults?: SceneDefaults,
): ResolvedSceneProps {
  const legacy = resolveLegacySceneProps(scene, defaults);
  if (scene.sceneSettingsLinked === undefined) return legacy;
  return {
    ...resolveLegacySceneProps(
      { ...scene, scenePropsLinked: scene.sceneSettingsLinked },
      defaults,
    ),
    backgroundColor: legacy.backgroundColor,
  };
}

export function resolveDialogueProps(
  scene: Scene,
  meta: ProjectMeta,
): ResolvedDialogueProps {
  const legacy = resolveLegacyDialogueProps(scene, meta);
  if (scene.sceneSettingsLinked === undefined) return legacy;
  const timing = resolveLegacyDialogueProps(
    { ...scene, dialoguePropsLinked: scene.sceneSettingsLinked },
    meta,
  );
  return {
    ...legacy,
    defaultDisplayMode: timing.defaultDisplayMode,
    readingPace: timing.readingPace,
    lineGap: timing.lineGap,
  };
}
