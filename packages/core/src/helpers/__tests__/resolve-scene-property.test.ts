import { describe, it, expect } from 'vitest';
import { resolveSceneProps, resolveDialogueProps } from '../resolve-scene-property';
import type { Scene, SceneDefaults, ProjectMeta } from '../../types/project';

const makeScene = (overrides: Partial<Scene> = {}): Scene => ({
  id: 's1',
  name: 'Scene 1',
  actors: [],
  script: { nodes: [] },
  ...overrides,
});

const defaults: SceneDefaults = {
  autoEntrance: true,
  entranceEffect: 'fade',
  transition: { type: 'fade-black', duration: 0.8 },
  dimBrightness: 0.75,
  speakerScale: true,
  backgroundColor: '#000000',
  defaultDisplayMode: 'typewriter',
  readingPace: 1.0,
  lineGap: 0.15,
};

const meta: Partial<ProjectMeta> = {
  sceneDefaults: defaults,
  defaultDialogueThemeId: 'theme-1',
  defaultDialogueX: 50,
  defaultDialogueY: 85,
};

describe('resolveSceneProps', () => {
  it('returns global defaults when scene is linked (undefined)', () => {
    const scene = makeScene();
    const resolved = resolveSceneProps(scene, defaults);
    expect(resolved.autoEntrance).toBe(true);
    expect(resolved.entranceEffect).toBe('fade');
    expect(resolved.transition).toEqual({ type: 'fade-black', duration: 0.8 });
    expect(resolved.dimBrightness).toBe(0.75);
    expect(resolved.speakerScale).toBe(true);
    expect(resolved.backgroundColor).toBe('#000000');
  });

  it('returns global defaults when scene is explicitly linked (true)', () => {
    const scene = makeScene({ scenePropsLinked: true });
    const resolved = resolveSceneProps(scene, defaults);
    expect(resolved.autoEntrance).toBe(true);
  });

  it('falls back to hardcoded defaults when no SceneDefaults provided', () => {
    const scene = makeScene();
    const resolved = resolveSceneProps(scene, undefined);
    expect(resolved.autoEntrance).toBe(true);
    expect(resolved.entranceEffect).toBe('fade');
    expect(resolved.transition).toBeUndefined();
    expect(resolved.dimBrightness).toBe(0.75);
    expect(resolved.speakerScale).toBe(false);
    expect(resolved.backgroundColor).toBe('#000000');
  });

  it('falls back to hardcoded defaults when unlinked scene has no overrides', () => {
    const scene = makeScene({ scenePropsLinked: false });
    const resolved = resolveSceneProps(scene);
    expect(resolved.autoEntrance).toBe(true);
    expect(resolved.entranceEffect).toBe('fade');
    expect(resolved.transition).toBeUndefined();
    expect(resolved.dimBrightness).toBe(0.75);
    expect(resolved.speakerScale).toBe(false);
    expect(resolved.backgroundColor).toBe('#000000');
  });

  it('returns scene values when unlinked', () => {
    const scene = makeScene({
      scenePropsLinked: false,
      autoEntrance: false,
      entranceEffect: 'slide-left',
      dimBrightness: 0.5,
      speakerScale: false,
      backgroundColor: '#ff0000',
    });
    const resolved = resolveSceneProps(scene, defaults);
    expect(resolved.autoEntrance).toBe(false);
    expect(resolved.entranceEffect).toBe('slide-left');
    expect(resolved.dimBrightness).toBe(0.5);
    expect(resolved.speakerScale).toBe(false);
    expect(resolved.backgroundColor).toBe('#ff0000');
  });
});

describe('resolveDialogueProps', () => {
  it('returns global defaults when scene is linked', () => {
    const scene = makeScene();
    const resolved = resolveDialogueProps(scene, meta as ProjectMeta);
    expect(resolved.dialogueThemeId).toBe('theme-1');
    expect(resolved.defaultDisplayMode).toBe('typewriter');
    expect(resolved.readingPace).toBe(1.0);
    expect(resolved.lineGap).toBe(0.15);
    expect(resolved.dialogueX).toBe(50);
    expect(resolved.dialogueY).toBe(85);
  });

  it('falls back to meta-level readingPace and lineGap when sceneDefaults lacks them', () => {
    const scene = makeScene();
    const metaWithPartialDefaults: Partial<ProjectMeta> = {
      sceneDefaults: {
        autoEntrance: true,
        entranceEffect: 'fade',
        dimBrightness: 0.75,
        speakerScale: true,
        backgroundColor: '#000',
      } as SceneDefaults,
      readingPace: 2.0,
      lineGap: 0.5,
      defaultDialogueThemeId: 'theme-1',
      defaultDialogueX: 50,
      defaultDialogueY: 85,
    };
    const resolved = resolveDialogueProps(scene, metaWithPartialDefaults as ProjectMeta);
    expect(resolved.readingPace).toBe(2.0);
    expect(resolved.lineGap).toBe(0.5);
  });

  it('returns scene values when unlinked', () => {
    const scene = makeScene({
      dialoguePropsLinked: false,
      dialogueThemeId: 'theme-2',
      defaultDisplayMode: 'instant',
      readingPace: 1.5,
      lineGap: 0.3,
      dialogueThemeOverrides: { dialogueX: 30, dialogueY: 70 },
    });
    const resolved = resolveDialogueProps(scene, meta as ProjectMeta);
    expect(resolved.dialogueThemeId).toBe('theme-2');
    expect(resolved.defaultDisplayMode).toBe('instant');
    expect(resolved.readingPace).toBe(1.5);
    expect(resolved.lineGap).toBe(0.3);
    expect(resolved.dialogueX).toBe(30);
    expect(resolved.dialogueY).toBe(70);
  });
});
