import { describe, expect, it } from 'vitest';
import { createDefaultProject, type Scene } from '@vnve/core';
import type { RenderState } from '@vnve/runtime';
import {
  buildRenderContext,
  computeTransitionOverlay,
  createEmptyRenderContext,
  findSceneAtTime,
  prepareFrame,
  prepareFrameInput,
} from '../frame-pipeline';

function createFixture() {
  const project = createDefaultProject({ width: 1920, height: 1080 });

  project.assets.visual.character = [
    {
      id: 'char-1',
      name: 'Alice',
      defaultVariantId: 'char-1-v1',
      variants: [
        { id: 'char-1-v1', name: 'Neutral', url: '/alice-neutral.png', mediaType: 'animated' },
        { id: 'char-1-v2', name: 'Happy', url: '/alice-happy.png' },
      ],
    },
    {
      id: 'char-2',
      name: 'Bob',
      defaultVariantId: 'char-2-v1',
      variants: [
        { id: 'char-2-v1', name: 'Neutral', url: '/bob-neutral.png' },
      ],
    },
  ];

  project.assets.visual.background = [
    {
      id: 'bg-1',
      name: 'BG',
      defaultVariantId: 'bg-1-v1',
      variants: [
        { id: 'bg-1-v1', name: 'Day', url: '/bg-day.png', mediaType: 'video' },
        { id: 'bg-1-v2', name: 'Night', url: '/bg-night.png' },
      ],
    },
  ];

  project.assets.themes = [
    {
      id: 'theme-1',
      name: 'Theme One',
      baseThemeId: 'classic',
      data: { boxImageUrl: '/box-theme.png' },
    },
  ];

  const scene1: Scene = {
    id: 'scene-1',
    name: 'Scene One',
    scenePropsLinked: false,
    backgroundId: 'bg-1-v1',
    backgroundColor: '#111111',
    dimBrightness: 0.6,
    actors: [
      {
        id: 'actor-1',
        characterId: 'char-1',
        x: 50,
        y: 100,
        scale: 1.25,
        visible: true,
        zIndex: 1,
        variantId: '',
        flipX: true,
      },
    ],
    script: { nodes: [] },
  };

  const scene2: Scene = {
    id: 'scene-2',
    name: 'Scene Two',
    scenePropsLinked: false,
    backgroundId: 'bg-1-v2',
    backgroundColor: '#222222',
    actors: [
      {
        id: 'actor-2',
        characterId: 'char-2',
        x: 40,
        y: 100,
        scale: 1,
        visible: true,
        zIndex: 1,
        variantId: 'char-2-v1',
        flipX: false,
      },
    ],
    script: { nodes: [] },
  };

  const resolvedUrlMap = new Map<string, string>([
    ['char-1-v1', '/resolved/alice-neutral.png'],
    ['bg-1-v1', '/resolved/bg-day.png'],
  ]);

  return {
    project,
    scenes: [scene1, scene2],
    renderContext: buildRenderContext(project, [scene1, scene2], resolvedUrlMap),
  };
}

function createRenderState(): RenderState {
  return {
    time: 5,
    duration: 10,
    actors: [
      {
        id: 'actor-1',
        x: 50,
        y: 100,
        visible: true,
        opacity: 1,
        sprite: null,
        shakeOffsetX: 0,
        shakeOffsetY: 0,
        scale: 1,
        flipX: false,
        isSpeaker: false,
        brightness: 1,
        rotation: 0,
        tintColor: null,
        tintOpacity: 0,
      },
    ],
    dialogue: {
      speaker: 'actor-1',
      text: 'hello',
      progress: 0.5,
      theme: 'theme-1',
    },
    narration: null,
    activeEventIndex: 0,
    audio: { bgm: null, sfxTriggers: [] },
    flash: null,
    screenShake: null,
    background: null,
    cg: null,
    camera: { x: 50, y: 50, scale: 1 },
  };
}

describe('frame pipeline', () => {
  it('uses story character names independently of shared media in preview and export', () => {
    const { project, scenes } = createFixture();
    project.visualSubjects = [{ id: 'lin', type: 'character', name: '小林', states: [], defaultStateId: '' }];
    scenes[0]!.actors[0]!.visualSubjectId = 'lin';
    const context = buildRenderContext(project, scenes, new Map());
    expect(context.speakerNames.get('actor-1')).toBe('小林');
    expect(context.speakerNames.get('actor-2')).toBe('Bob');
  });

  it('creates an empty render context with initialized collections', () => {
    const context = createEmptyRenderContext();

    expect(context.variantUrlsById.size).toBe(0);
    expect(context.sceneIds).toEqual([]);
    expect(context.customThemes).toEqual([]);
  });

  it('finds scenes before, between, and after configured ranges', () => {
    const ranges = [
      { sceneId: 'scene-1', startTime: 1, endTime: 4 },
      { sceneId: 'scene-2', startTime: 6, endTime: 9 },
    ];

    expect(findSceneAtTime(ranges, 0)).toBe('scene-1');
    expect(findSceneAtTime(ranges, 5)).toBe('scene-1');
    expect(findSceneAtTime(ranges, 7)).toBe('scene-2');
    expect(findSceneAtTime(ranges, 12)).toBe('scene-2');
    expect(findSceneAtTime([], 3)).toBeNull();
  });

  it('computes transition overlays only inside active transition windows', () => {
    const ranges = [
      { startTime: 5, endTime: 10, transitionIn: { type: 'fade-black', duration: 2 } },
      { startTime: 12, endTime: 18, transitionIn: { type: 'fade-white', duration: 0 } },
    ];

    expect(computeTransitionOverlay(ranges, 4)).toEqual({ effect: 'fade-black', progress: 0 });
    expect(computeTransitionOverlay(ranges, 5)).toEqual({ effect: 'fade-black', progress: 0.5 });
    expect(computeTransitionOverlay(ranges, 8)).toBeNull();
  });

  it('buildRenderContext creates speaker and scene mappings', () => {
    const { renderContext } = createFixture();

    expect(renderContext.speakerNames.get('actor-1')).toBe('Alice');
    expect(renderContext.actorSpriteUrls.get('actor-1')?.get('char-1-v1')).toBe('/resolved/alice-neutral.png');
    expect(renderContext.sceneBackgroundUrls.get('scene-1')).toBe('/resolved/bg-day.png');
    expect(renderContext.variantUrlsById.get('bg-1-v2')).toBe('/bg-night.png');
    expect(renderContext.variantMediaTypesById.get('char-1-v1')).toBe('animated');
    expect(renderContext.variantMediaTypesById.get('bg-1-v1')).toBe('video');
    expect(renderContext.variantMediaTypesByUrl.get('/resolved/alice-neutral.png')).toBe('animated');
    expect(renderContext.variantMediaTypesByUrl.get('/resolved/bg-day.png')).toBe('video');
    expect(renderContext.imageUrls).toContain('/bg-night.png');
    expect(renderContext.sceneDimBrightness.get('scene-1')).toBe(0.6);
    expect(renderContext.themeBoxImageUrls.get('theme-1')).toBe('/box-theme.png');
  });

  it('buildRenderContext resolves linked scene props from project defaults', () => {
    const { project, scenes } = createFixture();
    project.meta.sceneDefaults = {
      ...project.meta.sceneDefaults,
      backgroundColor: '#123456',
      dimBrightness: 0.4,
      speakerScale: false,
    };
    scenes[0] = {
      ...scenes[0],
      scenePropsLinked: true,
      backgroundColor: undefined,
      dimBrightness: undefined,
      speakerScale: undefined,
    };

    const renderContext = buildRenderContext(project, scenes, new Map());

    expect(renderContext.sceneBackgroundColors.get('scene-1')).toBe('#123456');
    expect(renderContext.sceneDimBrightness.get('scene-1')).toBe(0.4);
    expect(renderContext.sceneSpeakerScale.get('scene-1')).toBe(false);
  });

  it('prepareFrameInput applies actor defaults and speaker mapping without mutating source state', () => {
    const { renderContext } = createFixture();
    const source = createRenderState();

    const prepared = prepareFrameInput({
      renderState: source,
      time: 5,
      sceneTimeRanges: [{ sceneId: 'scene-1', startTime: 0, endTime: 8 }],
      fallbackSceneId: null,
      renderContext,
      imageResolver: (url) => url as unknown as CanvasImageSource,
      renderScale: 0.5,
    });

    expect(prepared.nextRenderState.actors[0].scale).toBe(1.25);
    expect(prepared.nextRenderState.actors[0].flipX).toBe(true);
    expect(prepared.nextRenderState.actors[0].sprite).toBe('char-1-v1');
    expect(prepared.nextRenderState.dialogue?.speaker).toBe('Alice');

    expect(prepared.imageMap.actors.get('actor-1')).toBe('/resolved/alice-neutral.png');
    expect(prepared.imageMap.background).toBe('/resolved/bg-day.png');
    expect(prepared.frameOptions.backgroundColor).toBe('#111111');
    expect(prepared.frameOptions.dimBrightness).toBe(0.6);
    expect(prepared.frameOptions.renderScale).toBe(0.5);

    expect(source.actors[0].scale).toBe(1);
    expect(source.actors[0].flipX).toBe(false);
    expect(source.actors[0].sprite).toBeNull();
    expect(source.dialogue?.speaker).toBe('actor-1');
  });

  it('orders overlapping actors by saved scene layers without changing timeline state', () => {
    const { project, scenes } = createFixture();
    const scene = scenes[0]!;
    scene.actors.push({ ...scene.actors[0]!, id: 'actor-top', zIndex: 4 });
    const source = createRenderState();
    source.actors.unshift({ ...source.actors[0]!, id: 'actor-top' });
    const prepared = prepareFrameInput({
      renderState: source, time: 5,
      sceneTimeRanges: [{ sceneId: scene.id, startTime: 0, endTime: 8 }],
      fallbackSceneId: null,
      renderContext: buildRenderContext(project, scenes, new Map()),
    });
    expect(prepared.nextRenderState.actors.map(actor => actor.id)).toEqual(['actor-1', 'actor-top']);
    expect(source.actors.map(actor => actor.id)).toEqual(['actor-top', 'actor-1']);
  });

  it('prepareFrameInput resolves non-scene layer variants for set events', () => {
    const { renderContext } = createFixture();
    const source = createRenderState();
    source.background = { asset: 'bg-1-v2' };

    const prepared = prepareFrameInput({
      renderState: source,
      time: 5,
      sceneTimeRanges: [{ sceneId: 'scene-1', startTime: 0, endTime: 8 }],
      fallbackSceneId: null,
      renderContext,
      imageResolver: (url) => url as unknown as CanvasImageSource,
    });

    expect(prepared.imageMap.background).toBe('/bg-night.png');
  });

  it('prepareFrameInput computes transition overlay in multi-scene range', () => {
    const { renderContext } = createFixture();
    const source = createRenderState();

    const prepared = prepareFrameInput({
      renderState: source,
      time: 5,
      sceneTimeRanges: [
        { sceneId: 'scene-1', startTime: 0, endTime: 5 },
        { sceneId: 'scene-2', startTime: 5, endTime: 10, transitionIn: { type: 'fade-black', duration: 1 } },
      ],
      fallbackSceneId: null,
      renderContext,
    });

    expect(prepared.currentSceneId).toBe('scene-2');
    expect(prepared.frameOptions.transition?.effect).toBe('fade-black');
    expect(prepared.frameOptions.transition?.progress).toBe(0.5);
    expect(prepared.frameOptions.transition?.outgoingSceneId).toBe('scene-1');
    expect(prepared.frameOptions.transition?.incomingSceneId).toBe('scene-2');
    expect(prepared.frameOptions.transition?.compositorPlan.shot.throughColor).toBe('#000000');
  });

  it('applies the next scene defaults after a scene boundary reset without reviving previous actors', () => {
    const { renderContext } = createFixture();
    renderContext.sceneBackgroundUrls.set('scene-2', '/bg-night.png');

    const source: RenderState = {
      time: 8.5,
      duration: 12,
      actors: [
        {
          id: 'actor-2',
          x: 40,
          y: 100,
          visible: true,
          opacity: 1,
          sprite: null,
          shakeOffsetX: 0,
          shakeOffsetY: 0,
          scale: 1,
          flipX: false,
          isSpeaker: false,
          brightness: 1,
          blur: 0,
          rotation: 0,
          tintColor: null,
          tintOpacity: 0,
        },
      ],
      dialogue: {
        speaker: 'actor-2',
        text: 'scene two',
        progress: 1,
      },
      narration: null,
      activeEventIndex: 0,
      audio: { bgm: null, sfxTriggers: [] },
      flash: null,
      screenShake: null,
      background: null,
      cg: null,
      camera: { x: 50, y: 50, scale: 1 },
    };

    const prepared = prepareFrameInput({
      renderState: source,
      time: 8.5,
      sceneTimeRanges: [
        { sceneId: 'scene-1', startTime: 0, endTime: 8 },
        { sceneId: 'scene-2', startTime: 8, endTime: 12 },
      ],
      fallbackSceneId: null,
      renderContext,
      imageResolver: (url) => url as unknown as CanvasImageSource,
    });

    expect(prepared.currentSceneId).toBe('scene-2');
    expect(prepared.nextRenderState.actors).toHaveLength(1);
    expect(prepared.nextRenderState.actors[0]?.id).toBe('actor-2');
    expect(prepared.nextRenderState.actors[0]?.sprite).toBe('char-2-v1');
    expect(prepared.nextRenderState.dialogue?.speaker).toBe('Bob');
    expect(prepared.imageMap.actors.get('actor-2')).toBe('/bob-neutral.png');
    expect(prepared.imageMap.actors.has('actor-1')).toBe(false);
    expect(prepared.imageMap.background).toBe('/bg-night.png');
  });

  it('resolves dissolve from scene start without carrying speech', () => {
    const { renderContext } = createFixture();
    const source = createRenderState();
    source.dialogue = null;
    source.narration = null;

    const prepared = prepareFrameInput({
      renderState: source,
      time: 5.6,
      sceneTimeRanges: [
        { sceneId: 'scene-1', startTime: 0, endTime: 5 },
        { sceneId: 'scene-2', startTime: 5.5, endTime: 10, transitionIn: { type: 'dissolve', duration: 1 } },
      ],
      fallbackSceneId: null,
      renderContext,
      imageResolver: (url) => url as unknown as CanvasImageSource,
    });

    expect(prepared.currentSceneId).toBe('scene-2');
    expect(prepared.nextRenderState.actors).toHaveLength(1);
    expect(prepared.nextRenderState.dialogue).toBeNull();
    expect(prepared.nextRenderState.narration).toBeNull();
    expect(prepared.imageMap.background).toBe('/bg-night.png');
    expect(prepared.frameOptions.backgroundColor).toBe('#222222');
    expect(prepared.frameOptions.transition?.effect).toBe('dissolve');
    expect(prepared.frameOptions.transition?.progress).toBeCloseTo(0.1, 6);
    expect(prepared.frameOptions.transition?.outgoingSceneId).toBe('scene-1');
    expect(prepared.frameOptions.transition?.incomingSceneId).toBe('scene-2');
    expect(prepared.frameOptions.transition?.compositorPlan.shot.outgoing.surface.sceneId).toBe('scene-1');
    expect(prepared.frameOptions.transition?.compositorPlan.shot.incoming.surface.sceneId).toBe('scene-2');
  });

  it('keeps fade-black on the symmetric lead-in window', () => {
    const { renderContext } = createFixture();
    const source = createRenderState();

    const prepared = prepareFrameInput({
      renderState: source,
      time: 5.2,
      sceneTimeRanges: [
        { sceneId: 'scene-1', startTime: 0, endTime: 5 },
        { sceneId: 'scene-2', startTime: 5.5, endTime: 10, transitionIn: { type: 'fade-black', duration: 1 } },
      ],
      fallbackSceneId: null,
      renderContext,
      imageResolver: (url) => url as unknown as CanvasImageSource,
    });

    expect(prepared.currentSceneId).toBe('scene-1');
    expect(prepared.imageMap.background).toBe('/resolved/bg-day.png');
    expect(prepared.frameOptions.backgroundColor).toBe('#111111');
    expect(prepared.frameOptions.transition?.effect).toBe('fade-black');
    expect(prepared.frameOptions.transition?.progress).toBeCloseTo(0.2, 6);
    expect(prepared.frameOptions.transition?.outgoingSceneId).toBe('scene-1');
    expect(prepared.frameOptions.transition?.incomingSceneId).toBe('scene-2');
    expect(prepared.frameOptions.transition?.compositorPlan.shot.mode).toBe('through-color');
  });

  it('keeps shot and dialogue timing in compositor metadata instead of mutating render state', () => {
    const { renderContext } = createFixture();
    const source: RenderState = {
      time: 5.6,
      duration: 10,
      actors: [
        {
          id: 'actor-2',
          x: 40,
          y: 100,
          visible: true,
          opacity: 1,
          sprite: 'char-2-v1',
          shakeOffsetX: 0,
          shakeOffsetY: 0,
          scale: 1,
          flipX: false,
          isSpeaker: true,
          brightness: 1,
          blur: 0,
          rotation: 0,
          tintColor: null,
          tintOpacity: 0,
        },
      ],
      dialogue: {
        speaker: 'actor-2',
        text: 'scene two',
        progress: 0.25,
        theme: 'theme-1',
      },
      narration: null,
      activeEventIndex: 0,
      audio: { bgm: null, sfxTriggers: [] },
      flash: null,
      screenShake: null,
      background: null,
      cg: null,
      camera: { x: 50, y: 50, scale: 1 },
    };

    const prepared = prepareFrameInput({
      renderState: source,
      time: 5.6,
      sceneTimeRanges: [
        { sceneId: 'scene-1', startTime: 0, endTime: 5 },
        { sceneId: 'scene-2', startTime: 5.5, endTime: 10, transitionIn: { type: 'dissolve', duration: 1 } },
      ],
      fallbackSceneId: null,
      renderContext,
      imageResolver: (url) => url as unknown as CanvasImageSource,
    });

    expect(prepared.currentSceneId).toBe('scene-2');
    expect(prepared.frameOptions.transition?.progress).toBeCloseTo(0.1, 6);
    expect(prepared.nextRenderState.actors).toHaveLength(1);
    expect(prepared.nextRenderState.actors[0]?.opacity).toBe(1);
    expect(prepared.nextRenderState.dialogue?.speaker).toBe('Bob');
    expect(prepared.imageMap.actors.get('actor-2')).toBe('/bob-neutral.png');
    expect(prepared.frameOptions.transition?.outgoingSceneId).toBe('scene-1');
    expect(prepared.frameOptions.transition?.incomingSceneId).toBe('scene-2');
    expect(prepared.frameOptions.transition?.compositorPlan.shot.outgoing.opacity).toBeGreaterThan(0);
    expect(prepared.frameOptions.transition?.compositorPlan.shot.incoming.opacity).toBeCloseTo(0.1, 6);
    expect(prepared.frameOptions.transition?.compositorPlan.dialogue.outgoing.opacity).toBeGreaterThan(0);
    expect(prepared.frameOptions.transition?.compositorPlan.dialogue.incoming.opacity).toBe(0);
  });

  it('keeps speaker id when mapping is unavailable', () => {
    const { renderContext } = createFixture();
    const source = createRenderState();
    source.dialogue = { ...source.dialogue!, speaker: 'unknown-actor' };

    const prepared = prepareFrameInput({
      renderState: source,
      time: 5,
      sceneTimeRanges: [],
      fallbackSceneId: 'scene-1',
      renderContext,
    });

    expect(prepared.nextRenderState.dialogue?.speaker).toBe('unknown-actor');
  });

  it('prepareFrameInput respects scene visibility toggles and resolves previous assets', () => {
    const { renderContext } = createFixture();
    renderContext.sceneBackgroundVisibility.set('scene-1', false);
    renderContext.sceneCgVisibility.set('scene-1', false);
    renderContext.sceneCgUrls.set('scene-1', '/resolved/cg.png');
    renderContext.themeBoxImageUrls.set('theme-1', '/resolved/theme-box.png');
    const source = createRenderState();
    source.background = { asset: 'bg-1-v2', previousAsset: 'bg-1-v1' };
    source.cg = { asset: 'bg-1-v1', previousAsset: 'bg-1-v2' };
    source.actors[0].sprite = 'char-1-v1';
    source.actors[0].previousSprite = 'char-1-v2';

    const prepared = prepareFrameInput({
      renderState: source,
      time: 5,
      sceneTimeRanges: [{ sceneId: 'scene-1', startTime: 0, endTime: 8 }],
      fallbackSceneId: null,
      renderContext,
      imageResolver: (url) => ({ url } as unknown as CanvasImageSource),
    });

    expect(prepared.nextRenderState.background).toBeNull();
    expect(prepared.nextRenderState.cg).toBeNull();
    expect(prepared.imageMap.actorPrevious?.get('actor-1')).toEqual({ url: '/alice-happy.png' });
    expect(prepared.imageMap.layerVariants).toBeUndefined();
    expect(prepared.frameOptions.dialogueBoxImage).toEqual({ url: '/resolved/theme-box.png' });
  });

  it('omits optional image maps and frame options when no resolvers or scene metadata apply', () => {
    const { renderContext } = createFixture();
    const source = createRenderState();
    source.dialogue = null;

    const prepared = prepareFrameInput({
      renderState: source,
      time: 5,
      sceneTimeRanges: [],
      fallbackSceneId: null,
      renderContext,
    });

    expect(prepared.currentSceneId).toBeNull();
    expect(prepared.imageMap.actorPrevious).toBeUndefined();
    expect(prepared.imageMap.layerVariants).toBeUndefined();
    expect(prepared.frameOptions.transition).toBeUndefined();
    expect(prepared.frameOptions.backgroundColor).toBeUndefined();
  });

  it('prepareFrame returns single for non-transition time', () => {
    const { renderContext } = createFixture();
    const sceneTimelines = [
      {
        sceneId: 'scene-1',
        events: [{ type: 'narrate' as const, at: 0, dur: 3, params: { text: 'Hello' } }],
        startTime: 0,
        contentStartTime: 0,
        endTime: 5,
      },
    ];

    const result = prepareFrame({
      time: 2,
      sceneTimelines,
      renderContext,
      imageResolver: (url) => url as unknown as CanvasImageSource,
    });

    expect(result.single).toBeTruthy();
    expect(result.transition).toBeUndefined();
    expect(result.currentSceneId).toBe('scene-1');
  });

  it('prepareFrame returns dual state during active transition', () => {
    const { renderContext } = createFixture();
    const sceneTimelines = [
      {
        sceneId: 'scene-1',
        events: [{ type: 'narrate' as const, at: 0, dur: 3, params: { text: 'Scene 1' } }],
        startTime: 0,
        contentStartTime: 0,
        endTime: 5,
      },
      {
        sceneId: 'scene-2',
        events: [{ type: 'narrate' as const, at: 5.5, dur: 3, params: { text: 'Scene 2' } }],
        startTime: 5.5,
        contentStartTime: 5.5,
        endTime: 10,
        transitionIn: { type: 'fade-black', duration: 1 },
      },
    ];

    // Time 5.2 is inside the fade-black transition window (5.0 to 6.0 for symmetric lead-in)
    const result = prepareFrame({
      time: 5.2,
      sceneTimelines,
      renderContext,
      imageResolver: (url) => url as unknown as CanvasImageSource,
    });

    expect(result.transition).toBeTruthy();
    expect(result.single).toBeUndefined();
    expect(result.currentSceneId).toBe('scene-2');
    expect(result.transition!.compositorPlan).toBeTruthy();
    expect(result.transition!.compositorPlan.shot.throughColor).toBe('#000000');
    expect(result.transition!.progress).toBeGreaterThan(0);
    expect(result.transition!.progress).toBeLessThan(1);
    expect(result.transition!.outgoing.currentSceneId).toBe('scene-1');
    expect(result.transition!.incoming.currentSceneId).toBe('scene-2');
  });
});
