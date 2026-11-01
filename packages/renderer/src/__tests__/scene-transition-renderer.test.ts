// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RenderState } from '@vnve/runtime';
import { buildSceneTransitionPlan } from '../scene-transition-compositor';

const { mockBuildStyledTextRenderPlan, mockRenderStyledTextPlan } = vi.hoisted(() => ({
  mockBuildStyledTextRenderPlan: vi.fn(() => ({ lines: [] })),
  mockRenderStyledTextPlan: vi.fn(),
}));

vi.mock('../stage-snapshot', () => ({
  captureStageSnapshot: vi.fn(() => document.createElement('canvas')),
}));
vi.mock('../styled-text', async (importOriginal) => ({
  ...await importOriginal<typeof import('../styled-text')>(),
  buildStyledTextRenderPlan: mockBuildStyledTextRenderPlan,
  renderStyledTextPlan: mockRenderStyledTextPlan,
}));

beforeAll(() => {
  const noop = () => {};
  const stubCtx = {
    fillRect: noop,
    clearRect: noop,
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4),
    }),
    putImageData: noop,
    createImageData: () => [],
    setTransform: noop,
    resetTransform: noop,
    drawImage: noop,
    save: noop,
    restore: noop,
    beginPath: noop,
    moveTo: noop,
    lineTo: noop,
    closePath: noop,
    clip: noop,
    stroke: noop,
    fill: noop,
    translate: noop,
    scale: noop,
    rotate: noop,
    arc: noop,
    arcTo: noop,
    rect: noop,
    fillText: noop,
    strokeText: noop,
    setLineDash: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    measureText: (text: string) => ({ width: text.length * 8 }),
    transform: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
    canvas: { width: 800, height: 600 },
    font: '',
    textAlign: 'left' as const,
    textBaseline: 'top' as const,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt' as const,
    lineJoin: 'miter' as const,
    globalAlpha: 1,
    globalCompositeOperation: 'source-over' as const,
    shadowBlur: 0,
    shadowColor: '',
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    imageSmoothingEnabled: true,
  };

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
    if (type === '2d') {
      return stubCtx as unknown as CanvasRenderingContext2D;
    }
    return origGetContext.call(this, type as any, ...args);
  } as any;
});

import { KonvaFrameRenderer, type ImageMap } from '../konva-renderer';

function makeBaseState(): RenderState {
  return {
    time: 0,
    duration: 10,
    actors: [],
    dialogue: null,
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

function makeImages(): ImageMap {
  return {
    actors: new Map(),
    background: null,
    cg: null,
    layerVariants: new Map(),
  };
}

function computeSceneTransform(state: RenderState, width: number, height: number) {
  const shakeX = state.screenShake?.offsetX ?? 0;
  const shakeY = state.screenShake?.offsetY ?? 0;
  const cam = state.camera;
  if (cam && cam.scale !== 1) {
    const pivotX = (cam.x / 100) * width;
    const pivotY = (cam.y / 100) * height;
    return {
      x: shakeX - pivotX * (cam.scale - 1),
      y: shakeY - pivotY * (cam.scale - 1),
      scale: cam.scale,
    };
  }

  return { x: shakeX, y: shakeY, scale: 1 };
}

let renderer: KonvaFrameRenderer;

afterEach(() => {
  renderer?.dispose();
  mockBuildStyledTextRenderPlan.mockClear();
  mockRenderStyledTextPlan.mockClear();
});

describe('KonvaFrameRenderer.updateTransitionFrame', () => {
  it('does not apply the previous camera or shake twice to baked transition surfaces', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });
    const previous = makeBaseState();
    previous.camera = { x: 50, y: 50, scale: 1.4 };
    previous.screenShake = { offsetX: 8, offsetY: -4 } as RenderState['screenShake'];
    renderer.updateFrame(previous, makeImages());
    const background = (renderer as any).bgLayer;
    expect(background.scaleX()).toBe(1.4);

    const state = makeBaseState();
    renderer.updateTransitionFrame(
      { state, images: makeImages() },
      { state, images: makeImages() },
      {
        effect: 'dissolve', progress: 0.5,
        compositorPlan: buildSceneTransitionPlan({
          effect: 'dissolve', progress: 0.5,
          outgoing: { sceneId: 'a' }, incoming: { sceneId: 'b' },
        }),
      },
    );
    expect(background.position()).toEqual({ x: 0, y: 0 });
    expect(background.scale()).toEqual({ x: 1, y: 1 });
  });

  it('renders outgoing dialogue with fade-out opacity during dissolve', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const outgoingState = makeBaseState();
    outgoingState.dialogue = { speaker: 'Hero', text: 'Goodbye', progress: 1, theme: 'classic' };

    const incomingState = makeBaseState();
    incomingState.time = 1;
    incomingState.dialogue = { speaker: 'Villain', text: 'Hello', progress: 0.5, theme: 'classic' };

    renderer.updateTransitionFrame(
      { state: outgoingState, images: makeImages() },
      { state: incomingState, images: makeImages() },
      {
        effect: 'dissolve',
        progress: 0.3,
        compositorPlan: buildSceneTransitionPlan({
          effect: 'dissolve',
          progress: 0.3,
          outgoing: { sceneId: 'a' },
          incoming: { sceneId: 'b' },
        }),
      },
    );

    const outgoingDG = (renderer as any).outgoingDialogueGroup;
    const incomingDG = (renderer as any).dialogueGroup;

    expect(outgoingDG.visible()).toBe(true);
    expect(outgoingDG.opacity()).toBeGreaterThan(0);
    expect(outgoingDG.opacity()).toBeLessThan(1);
    expect(incomingDG.opacity()).toBeGreaterThan(0);
    expect(incomingDG.opacity()).toBeLessThan(0.1);
  });

  it('hides outgoing elements when switching back to normal frame', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const state1 = makeBaseState();
    state1.dialogue = { speaker: 'Hero', text: 'Hi', progress: 1, theme: 'classic' };

    // First do a transition frame
    renderer.updateTransitionFrame(
      { state: state1, images: makeImages() },
      { state: state1, images: makeImages() },
      {
        effect: 'dissolve',
        progress: 0.5,
        compositorPlan: buildSceneTransitionPlan({
          effect: 'dissolve',
          progress: 0.5,
          outgoing: { sceneId: 'a' },
          incoming: { sceneId: 'b' },
        }),
      },
    );

    // Then do a normal frame
    renderer.updateFrame(state1, makeImages());

    const outgoingDG = (renderer as any).outgoingDialogueGroup;
    const outgoingSceneImage = (renderer as any).outgoingSceneImage;
    expect(outgoingDG.visible()).toBe(false);
    expect(outgoingSceneImage.visible()).toBe(false);
  });

  it('does not carry speaker chrome from the previous scene into incoming narration after transition', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const outgoingState = makeBaseState();
    outgoingState.dialogue = { speaker: 'Hero', text: 'Goodbye', progress: 1, theme: 'classic' };
    outgoingState.actors = [
      {
        id: 'hero',
        x: 50,
        y: 100,
        visible: true,
        opacity: 1,
        scale: 1,
        flipX: false,
        isSpeaker: true,
      } as any,
    ];

    const incomingState = makeBaseState();
    incomingState.time = 1;
    incomingState.narration = { text: 'A new scene begins', progress: 1, theme: 'classic' } as any;

    renderer.updateFrame(outgoingState, makeImages());
    renderer.updateTransitionFrame(
      { state: outgoingState, images: makeImages() },
      { state: incomingState, images: makeImages() },
      {
        effect: 'dissolve',
        progress: 0.9,
        compositorPlan: buildSceneTransitionPlan({
          effect: 'dissolve',
          progress: 0.9,
          outgoing: { sceneId: 'scene-a' },
          incoming: { sceneId: 'scene-b' },
        }),
      },
    );

    const narrationFrame = {
      ...incomingState,
      time: 1.02,
    };
    renderer.updateFrame(narrationFrame, makeImages());

    const speakerText = (renderer as any).speakerText;
    expect(speakerText.visible()).toBe(false);
  });

  it('creates offscreen renderer lazily and reuses it', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    expect((renderer as any).offscreenRenderer).toBeNull();

    const state = makeBaseState();
    renderer.updateTransitionFrame(
      { state, images: makeImages() },
      { state, images: makeImages() },
      {
        effect: 'cut',
        progress: 0.3,
        compositorPlan: buildSceneTransitionPlan({
          effect: 'cut',
          progress: 0.3,
          outgoing: { sceneId: 'a' },
          incoming: { sceneId: 'b' },
        }),
      },
    );

    const offscreen1 = (renderer as any).offscreenRenderer;
    expect(offscreen1).not.toBeNull();

    // Second call reuses the same offscreen renderer
    renderer.updateTransitionFrame(
      { state, images: makeImages() },
      { state, images: makeImages() },
      {
        effect: 'cut',
        progress: 0.6,
        compositorPlan: buildSceneTransitionPlan({
          effect: 'cut',
          progress: 0.6,
          outgoing: { sceneId: 'a' },
          incoming: { sceneId: 'b' },
        }),
      },
    );

    expect((renderer as any).offscreenRenderer).toBe(offscreen1);
  });

  it('disposes offscreen renderer when returning to normal frame without transition', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const state = makeBaseState();
    renderer.updateTransitionFrame(
      { state, images: makeImages() },
      { state, images: makeImages() },
      {
        effect: 'dissolve',
        progress: 0.5,
        compositorPlan: buildSceneTransitionPlan({
          effect: 'dissolve',
          progress: 0.5,
          outgoing: { sceneId: 'a' },
          incoming: { sceneId: 'b' },
        }),
      },
    );

    expect((renderer as any).offscreenRenderer).not.toBeNull();

    // Normal frame without transition disposes offscreen renderer
    renderer.updateFrame(state, makeImages());
    expect((renderer as any).offscreenRenderer).toBeNull();
  });

  it('shows through-color overlay for fade-black transition', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const state = makeBaseState();
    renderer.updateTransitionFrame(
      { state, images: makeImages() },
      { state, images: makeImages() },
      {
        effect: 'fade-black',
        progress: 0.5,
        compositorPlan: buildSceneTransitionPlan({
          effect: 'fade-black',
          progress: 0.5,
          outgoing: { sceneId: 'a' },
          incoming: { sceneId: 'b' },
        }),
      },
    );

    const flashRect = (renderer as any).flashRect;
    expect(flashRect.visible()).toBe(true);
    expect(flashRect.fill()).toBe('#000000');
    expect(flashRect.opacity()).toBeGreaterThan(0);
  });

  it('hides through-color overlay for dissolve transition', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const state = makeBaseState();
    renderer.updateTransitionFrame(
      { state, images: makeImages() },
      { state, images: makeImages() },
      {
        effect: 'dissolve',
        progress: 0.5,
        compositorPlan: buildSceneTransitionPlan({
          effect: 'dissolve',
          progress: 0.5,
          outgoing: { sceneId: 'a' },
          incoming: { sceneId: 'b' },
        }),
      },
    );

    const flashRect = (renderer as any).flashRect;
    expect(flashRect.visible()).toBe(false);
  });

  it('keeps the outgoing base opaque beneath a dissolve', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const state = makeBaseState();
    const plan = buildSceneTransitionPlan({
      effect: 'dissolve',
      progress: 0.4,
      outgoing: { sceneId: 'a' },
      incoming: { sceneId: 'b' },
    });

    renderer.updateTransitionFrame(
      { state, images: makeImages() },
      { state, images: makeImages() },
      { effect: 'dissolve', progress: 0.4, compositorPlan: plan },
    );

    const outgoingSceneImage = (renderer as any).outgoingSceneImage;
    expect(outgoingSceneImage.visible()).toBe(true);
    expect(outgoingSceneImage.opacity()).toBeCloseTo(1, 4);
  });

  it('renders sampled transition plan opacities instead of effect-derived defaults', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const outgoingState = makeBaseState();
    outgoingState.dialogue = { speaker: 'Hero', text: 'Old line', progress: 1, theme: 'classic' };

    const incomingState = makeBaseState();
    incomingState.dialogue = { speaker: 'Rival', text: 'New line', progress: 1, theme: 'classic' };

    const plan = buildSceneTransitionPlan({
      effect: 'fade-black',
      progress: 0.35,
      outgoing: { sceneId: 'scene-a' },
      incoming: { sceneId: 'scene-b' },
      sampled: {
        shot: {
          outgoingOpacity: 0.12,
          incomingOpacity: 0.34,
          throughColorOpacity: 0.54,
        },
        dialogue: {
          outgoingOpacity: 0.27,
          incomingOpacity: 0.63,
          throughColorOpacity: 0,
        },
      },
    });

    renderer.updateTransitionFrame(
      { state: outgoingState, images: makeImages() },
      { state: incomingState, images: makeImages() },
      { effect: 'fade-black', progress: 0.35, compositorPlan: plan },
    );

    const outgoingSceneImage = (renderer as any).outgoingSceneImage;
    const throughColorRect = (renderer as any).flashRect;
    const outgoingDG = (renderer as any).outgoingDialogueGroup;
    const incomingDG = (renderer as any).dialogueGroup;

    const incomingSceneImage = (renderer as any).incomingSceneImage;
    expect(outgoingSceneImage.opacity() * (1 - incomingSceneImage.opacity()) * (1 - throughColorRect.opacity())).toBeCloseTo(0.12, 6);
    expect(incomingSceneImage.opacity() * (1 - throughColorRect.opacity())).toBeCloseTo(0.34, 6);
    expect(throughColorRect.opacity()).toBeCloseTo(0.54, 6);
    expect(outgoingDG.opacity()).toBeCloseTo(0.27, 6);
    expect(incomingDG.opacity()).toBeCloseTo(0.63, 6);
  });

  it('renders outgoing and incoming shot surfaces without live actor layers during transition', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const actorCanvas = document.createElement('canvas');

    const outgoingState = makeBaseState();
    outgoingState.camera = { x: 30, y: 60, scale: 1.25 };
    outgoingState.screenShake = { offsetX: 18, offsetY: -12 };
    outgoingState.actors = [{
      id: 'hero',
      x: 40,
      y: 100,
      visible: true,
      opacity: 0.8,
      scale: 1,
      flipX: false,
    } as any];

    const incomingState = makeBaseState();
    incomingState.camera = { x: 70, y: 20, scale: 1.4 };
    incomingState.screenShake = { offsetX: -14, offsetY: 22 };
    incomingState.actors = [{
      id: 'villain',
      x: 60,
      y: 100,
      visible: true,
      opacity: 0.7,
      scale: 1,
      flipX: false,
    } as any];

    const outgoingImages = makeImages();
    outgoingImages.actors.set('hero', actorCanvas);
    const incomingImages = makeImages();
    incomingImages.actors.set('villain', actorCanvas);

    renderer.updateTransitionFrame(
      { state: outgoingState, images: outgoingImages },
      { state: incomingState, images: incomingImages },
      {
        effect: 'dissolve',
        progress: 0.4,
        compositorPlan: {
          effect: 'dissolve',
          progress: 0.4,
          shot: {
            mode: 'dual-opacity',
            outgoing: { surface: { sceneId: 'scene-a' }, opacity: 0.6 },
            incoming: { surface: { sceneId: 'scene-b' }, opacity: 0.4 },
            throughColor: null,
            throughColorOpacity: 0,
          },
          dialogue: {
            outgoing: { phase: 'hidden', opacity: 0 },
            incoming: { phase: 'hidden', opacity: 0 },
          },
        },
      },
    );

    const outgoingActorGroup = (renderer as any).outgoingActorGroup;
    const incomingActorGroup = (renderer as any).actorGroup;
    const outgoingSceneImage = (renderer as any).outgoingSceneImage;
    const incomingSceneImage = (renderer as any).incomingSceneImage;

    expect(outgoingActorGroup.visible()).toBe(false);
    expect(incomingActorGroup.visible()).toBe(false);
    expect(outgoingSceneImage.visible()).toBe(true);
    expect(incomingSceneImage.visible()).toBe(true);
    expect(outgoingSceneImage.opacity()).toBeCloseTo(1, 6);
    expect(incomingSceneImage.opacity()).toBeCloseTo(0.4, 6);
  });

  it('captures outgoing and incoming shot surfaces with actors but without dialogue chrome', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const offscreenRenderer = {
      updateFrame: vi.fn(),
      captureFrame: vi.fn(() => document.createElement('canvas')),
      dispose: vi.fn(),
    };
    (renderer as any).offscreenRenderer = offscreenRenderer;

    const outgoingState = makeBaseState();
    outgoingState.actors = [
      {
        id: 'hero',
        x: 50,
        y: 100,
        visible: true,
        opacity: 0.8,
        scale: 1,
        flipX: false,
      } as any,
    ];
    outgoingState.dialogue = { speaker: 'Hero', text: 'Goodbye', progress: 1, theme: 'classic' };
    outgoingState.narration = { text: 'See you soon', progress: 1 } as any;
    outgoingState.flash = { color: '#ffffff', progress: 0.4 };
    outgoingState.weather = { type: 'rain', intensity: 'heavy', opacity: 0.7 };
    outgoingState.screenShake = { offsetX: 4, offsetY: -6 };
    outgoingState.camera = { x: 35, y: 65, scale: 1.4 };
    outgoingState.background = { asset: 'bg-forest', previousAsset: 'bg-city', progress: 0.3 };
    outgoingState.cg = { asset: 'cg-closeup', previousAsset: 'cg-wide', progress: 0.6 };
    const incomingState = makeBaseState();
    incomingState.actors = [
      {
        id: 'villain',
        x: 60,
        y: 100,
        visible: true,
        opacity: 0.9,
        scale: 1,
        flipX: false,
      } as any,
    ];
    incomingState.dialogue = { speaker: 'Villain', text: 'Hello', progress: 1, theme: 'classic' };
    incomingState.narration = { text: 'An arrival', progress: 1 } as any;
    incomingState.flash = { color: '#000000', progress: 0.25 };
    incomingState.weather = { type: 'snow', intensity: 'light', opacity: 0.5 };

    renderer.updateTransitionFrame(
      { state: outgoingState, images: makeImages() },
      { state: incomingState, images: makeImages() },
      {
        effect: 'dissolve',
        progress: 0.35,
        compositorPlan: buildSceneTransitionPlan({
          effect: 'dissolve',
          progress: 0.35,
          outgoing: { sceneId: 'scene-a' },
          incoming: { sceneId: 'scene-b' },
        }),
      },
    );

    expect(offscreenRenderer.updateFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        actors: outgoingState.actors,
        dialogue: null,
        narration: null,
        flash: null,
        weather: outgoingState.weather,
        screenShake: outgoingState.screenShake,
        camera: outgoingState.camera,
        background: outgoingState.background,
        cg: outgoingState.cg,
      }),
      expect.any(Object),
      undefined,
    );
    expect(offscreenRenderer.updateFrame).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        actors: incomingState.actors,
        dialogue: null,
        narration: null,
        flash: null,
        weather: incomingState.weather,
      }),
      expect.any(Object),
      undefined,
    );
  });

  it('cleans up offscreen renderer on dispose', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const state = makeBaseState();
    renderer.updateTransitionFrame(
      { state, images: makeImages() },
      { state, images: makeImages() },
      {
        effect: 'dissolve',
        progress: 0.5,
        compositorPlan: buildSceneTransitionPlan({
          effect: 'dissolve',
          progress: 0.5,
          outgoing: { sceneId: 'a' },
          incoming: { sceneId: 'b' },
        }),
      },
    );

    expect((renderer as any).offscreenRenderer).not.toBeNull();
    renderer.dispose();
    expect((renderer as any).offscreenRenderer).toBeNull();
  });
});

it.each(['dissolve', 'fade-black', 'fade-white'] as const)('preserves the authored blend weights for %s instead of fading the shot twice', (effect) => {
  renderer = new KonvaFrameRenderer({width: 800, height: 600});
  for (const progress of [0.25, 0.5, 0.75]) {
    const plan = buildSceneTransitionPlan({effect, progress, outgoing: {sceneId: 'old'}, incoming: {sceneId: 'new'}});
    const state = makeBaseState();
    renderer.updateTransitionFrame({state, images: makeImages()}, {state, images: makeImages()}, {effect, progress, compositorPlan: plan});
    const outgoing = (renderer as any).outgoingSceneImage.opacity();
    const incoming = (renderer as any).incomingSceneImage.opacity();
    const color = (renderer as any).flashRect.visible() ? (renderer as any).flashRect.opacity() : 0;
    expect(outgoing * (1 - incoming) * (1 - color)).toBeCloseTo(plan.shot.outgoing.opacity, 6);
    expect(incoming * (1 - color)).toBeCloseTo(plan.shot.incoming.opacity, 6);
    expect(outgoing * (1 - incoming) * (1 - color) + incoming * (1 - color) + color).toBeCloseTo(1, 6);
  }
});
