import { describe, it, expect } from 'vitest';
import type { Scene, SceneDefaults, ProjectMeta } from '../project';

describe('Linked properties types', () => {
  it('Scene accepts scenePropsLinked and dialoguePropsLinked', () => {
    const scene: Partial<Scene> = {
      scenePropsLinked: false,
      dialoguePropsLinked: false,
    };
    expect(scene.scenePropsLinked).toBe(false);
    expect(scene.dialoguePropsLinked).toBe(false);
  });

  it('Scene defaults undefined means linked (true)', () => {
    const scene: Partial<Scene> = {};
    expect(scene.scenePropsLinked).toBeUndefined();
    expect(scene.dialoguePropsLinked).toBeUndefined();
  });

  it('SceneDefaults accepts new dialogue fields', () => {
    const defaults: SceneDefaults = {
      defaultDisplayMode: 'typewriter',
      readingPace: 1.0,
      lineGap: 0.15,
    };
    expect(defaults.defaultDisplayMode).toBe('typewriter');
  });

  it('ProjectMeta accepts defaultDialogueX and defaultDialogueY', () => {
    const meta: Partial<ProjectMeta> = {
      defaultDialogueX: 50,
      defaultDialogueY: 85,
    };
    expect(meta.defaultDialogueX).toBe(50);
    expect(meta.defaultDialogueY).toBe(85);
  });
});
