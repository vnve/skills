import { describe, it, expect } from 'vitest';
import {
  createDefaultProject,
  createDefaultScene,
  createDefaultAct,
  createDefaultAssets,
  SCHEMA_VERSION,
  ASPECT_PRESETS,
  getAllVariants,
  getAllAudio,
  getVariantThumbnailAssets,
  getThemeBoxImageAssets,
  stripTimelineFromProject,
} from './helpers';
import type { Project } from './types/project';

describe('createDefaultProject', () => {
  it('creates a project with correct schema version', () => {
    const project = createDefaultProject();
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.schemaVersion).toBe(14);
  });

  it('creates a project with default meta', () => {
    const project = createDefaultProject();
    expect(project.meta.title).toBe('Untitled Project');
    expect(project.meta.width).toBe(1920);
    expect(project.meta.height).toBe(1080);
    expect(project.meta.fps).toBe(30);
    expect(project.meta.aspect).toBe('16:9');
    expect(project.meta.readingPace).toBe(1);
    expect(project.meta.id).toBeTruthy();
    expect(project.meta.createdAt).toBeTruthy();
    expect(project.meta.updatedAt).toBeTruthy();
    expect(project.meta.sceneDefaults).toEqual({
      autoEntrance: true,
      entranceEffect: 'fade',
      dimBrightness: 0.75,
      speakerScale: false,
      backgroundColor: '#000000',
    });
  });

  it('creates a project with custom options', () => {
    const project = createDefaultProject({
      title: 'My Project',
      width: 1280,
      height: 720,
      fps: 60,
      aspect: '16:9',
    });
    expect(project.meta.title).toBe('My Project');
    expect(project.meta.width).toBe(1280);
    expect(project.meta.height).toBe(720);
    expect(project.meta.fps).toBe(60);
  });

  it('creates a project with a default act and scene', () => {
    const project = createDefaultProject();
    expect(project.acts).toHaveLength(1);
    expect(project.acts[0].name).toBe('Act 1');
    expect(project.acts[0].scenes).toHaveLength(1);
    expect(project.acts[0].scenes[0].name).toBe('Scene 1');
  });

  it('creates a project with empty assets', () => {
    const project = createDefaultProject();
    expect(project.assets.visual).toEqual({ character: [], background: [], prop: [], cg: [] });
    expect(project.assets.fonts).toEqual([]);
    expect(project.assets.themes).toEqual([]);
    expect(project.assets.audio).toEqual({ bgm: [], sfx: [] });
  });

  it('creates a project with empty characters', () => {
    const project = createDefaultProject();
    expect(project.assets.visual.character).toEqual([]);
    expect(project.visualSubjects).toEqual([]);
  });

  it('serialization round-trip preserves all fields', () => {
    const project = createDefaultProject({ title: 'Round Trip Test' });
    const json = JSON.stringify(project);
    const restored: Project = JSON.parse(json);

    expect(restored.schemaVersion).toBe(project.schemaVersion);
    expect(restored.meta.id).toBe(project.meta.id);
    expect(restored.meta.title).toBe(project.meta.title);
    expect(restored.meta.width).toBe(project.meta.width);
    expect(restored.meta.height).toBe(project.meta.height);
    expect(restored.meta.fps).toBe(project.meta.fps);
    expect(restored.meta.aspect).toBe(project.meta.aspect);
    expect(restored.meta.createdAt).toBe(project.meta.createdAt);
    expect(restored.meta.updatedAt).toBe(project.meta.updatedAt);
    expect(restored.acts).toHaveLength(1);
    expect(restored.acts[0].scenes).toHaveLength(1);
    expect(restored.assets.visual).toEqual({ character: [], background: [], prop: [], cg: [] });
    expect(restored.assets.visual.character).toEqual([]);
  });
});

describe('createDefaultScene', () => {
  it('creates a scene with correct name', () => {
    const scene = createDefaultScene('Test Scene');
    expect(scene.name).toBe('Test Scene');
    expect(scene.id).toBeTruthy();
    expect(scene.actors).toEqual([]);
    expect(scene.script).toEqual({ nodes: [] });
    expect(scene.timeline).toBeUndefined();
  });
});

describe('createDefaultAct', () => {
  it('creates an act with one default scene', () => {
    const act = createDefaultAct('Test Act');
    expect(act.name).toBe('Test Act');
    expect(act.id).toBeTruthy();
    expect(act.scenes).toHaveLength(1);
  });
});

describe('createDefaultAssets', () => {
  it('creates empty assets', () => {
    const assets = createDefaultAssets();
    expect(assets.visual).toEqual({ character: [], background: [], prop: [], cg: [] });
    expect(assets.fonts).toEqual([]);
    expect(assets.themes).toEqual([]);
    expect(assets.audio).toEqual({ bgm: [], sfx: [] });
  });
});

describe('getAllVariants', () => {
  it('returns all variants from all image categories', () => {
    const assets = createDefaultAssets();
    assets.visual.character = [
      { id: 'c1', name: 'Char', defaultVariantId: 'v1', variants: [{ id: 'v1', name: 'Default', url: '/v1.png' }] },
    ];
    assets.visual.background = [
      { id: 'bg1', name: 'BG', defaultVariantId: 'bv1', variants: [{ id: 'bv1', name: 'Day', url: '/bg1.png' }] },
    ];
    const result = getAllVariants(assets);
    expect(result).toHaveLength(2);
    expect(result.map((v) => v.id)).toEqual(['v1', 'bv1']);
  });
});

describe('getAllAudio', () => {
  it('returns combined bgm and sfx', () => {
    const audio = { bgm: [{ id: 'a1', name: 'BGM1', url: '/a1.mp3' }], sfx: [{ id: 'a2', name: 'SFX1', url: '/a2.mp3' }] };
    const result = getAllAudio(audio);
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.id)).toEqual(['a1', 'a2']);
  });
});

describe('asset helper utilities', () => {
  it('collects thumbnail assets from all variant groups', () => {
    const assets = createDefaultAssets();
    assets.visual.character = [
      {
        id: 'c1',
        name: 'Alice',
        defaultVariantId: 'v1',
        variants: [
          { id: 'v1', name: 'default', url: '/alice.png', thumbnailUrl: '/thumb-alice.png' },
          { id: 'v2', name: 'no-thumb', url: '/alice-2.png' },
        ],
      },
    ];

    expect(getVariantThumbnailAssets(assets)).toEqual([
      { id: '/thumb-alice.png', name: 'default thumbnail', url: '/thumb-alice.png' },
    ]);
  });

  it('collects theme box image assets only when id and url both exist', () => {
    const themes = [
      { id: 't1', name: 'A', data: { boxImageAssetId: 'asset-a', boxImageUrl: '/a.png' } },
      { id: 't2', name: 'B', data: { boxImageAssetId: 'asset-b' } },
      { id: 't3', name: 'C', data: { boxImageUrl: '/c.png' } },
    ];

    expect(getThemeBoxImageAssets(themes)).toEqual([
      { id: 'asset-a', name: 'A box', url: '/a.png' },
    ]);
  });
});

describe('stripTimelineFromProject', () => {
  it('removes timeline from all scenes while preserving other fields', () => {
    const project = createDefaultProject();
    project.acts[0].scenes = [
      {
        id: 's1',
        name: 'Scene 1',
        actors: [],
        script: { nodes: [] },
        timeline: [{ type: 'wait', duration: 1 } as any],
      },
      {
        id: 's2',
        name: 'Scene 2',
        actors: [],
        script: { nodes: [] },
        timeline: [{ type: 'wait', duration: 2 } as any],
      },
    ];

    const stripped = stripTimelineFromProject(project);

    expect(stripped.acts[0].scenes[0]).not.toHaveProperty('timeline');
    expect(stripped.acts[0].scenes[1]).not.toHaveProperty('timeline');
    expect(stripped.meta).toEqual(project.meta);
    expect(stripped.assets).toEqual(project.assets);
  });
});

describe('ASPECT_PRESETS', () => {
  it('has 16:9 landscape preset', () => {
    expect(ASPECT_PRESETS['16:9']).toEqual({ width: 1920, height: 1080 });
  });

  it('has 9:16 portrait preset', () => {
    expect(ASPECT_PRESETS['9:16']).toEqual({ width: 1080, height: 1920 });
  });
});
