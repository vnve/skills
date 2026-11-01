// @vitest-environment happy-dom
import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import type { RenderState } from '@vnve/runtime';
import type { LayerImageState } from '@vnve/runtime';

// Konva requires a real-ish canvas context. happy-dom's getContext returns null,
// so we patch it with a minimal stub before importing Konva.
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

  // Patch getContext to return our stub
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
    if (type === '2d') {
      return stubCtx as unknown as CanvasRenderingContext2D;
    }
    return origGetContext.call(this, type as any, ...args);
  } as any;
});

// Import Konva-dependent module AFTER the patch
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

let renderer: KonvaFrameRenderer;

afterEach(() => {
  renderer?.dispose();
});

describe('updateFullScreenLayer – dissolve behavior', () => {
  it('covers portrait background and CG with centered proportional source crops', () => {
    renderer = new KonvaFrameRenderer({ width: 1080, height: 1920 });
    const landscape = document.createElement('canvas');
    landscape.width = 1920;
    landscape.height = 1080;
    const portrait = document.createElement('canvas');
    portrait.width = 1080;
    portrait.height = 1920;
    const state = makeBaseState();
    state.background = { asset: 'portrait', previousAsset: 'landscape', transition: { effect: 'fade', progress: 0.5 } };
    const images = makeImages();
    images.cg = landscape;
    images.layerVariants = new Map([['landscape', landscape], ['portrait', portrait]]);
    renderer.updateFrame(state, images);
    expect((renderer as any).bgImage.crop()).toEqual({ x: 656.25, y: 0, width: 607.5, height: 1080 });
    expect((renderer as any).bgImage2.crop()).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
    expect((renderer as any).cgImage.crop()).toEqual({ x: 656.25, y: 0, width: 607.5, height: 1080 });
    images.cg = portrait;
    renderer.updateFrame(state, images);
    expect((renderer as any).cgImage.crop()).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
    renderer.resize(1920, 1080);
    expect((renderer as any).bgImage.crop()).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect((renderer as any).cgImage.crop()).toEqual({ x: 0, y: 656.25, width: 1080, height: 607.5 });
  });

  it('keeps portrait dialogue layout proportional between preview and export', () => {
    const state = makeBaseState();
    state.dialogue = {
      speaker: 'Hero', text: 'Portrait dialogue wraps inside the frame.',
      progress: 1, theme: 'classic', displayMode: 'instant',
    };
    const full = new KonvaFrameRenderer({ width: 1080, height: 1920 });
    renderer = new KonvaFrameRenderer({ width: 540, height: 960 });
    try {
      full.updateFrame(state, makeImages(), { renderScale: 1 });
      renderer.updateFrame(state, makeImages(), { renderScale: 0.5 });
      const fullGroup = (full as any).dialogueGroup;
      const previewGroup = (renderer as any).dialogueGroup;
      expect(previewGroup.offsetY()).toBeCloseTo(fullGroup.offsetY() / 2);
      expect(previewGroup.y()).toBeCloseTo(fullGroup.y() / 2);
    } finally {
      full.dispose();
    }
  });

  it('keeps screen and actor motion proportional across preview and export sizes', () => {
    const state = makeBaseState();
    state.screenShake = { offsetX: 20, offsetY: -12 };
    state.actors = [{
      id: 'hero', x: 50, y: 100, visible: true, opacity: 1, sprite: 'neutral',
      shakeOffsetX: 16, shakeOffsetY: -40, scale: 1, flipX: false,
      isSpeaker: false, brightness: 1, blur: 0, rotation: 0,
      tintColor: null, tintOpacity: 0,
    }];
    const images = makeImages();
    images.actors.set('hero', document.createElement('canvas'));
    const full = new KonvaFrameRenderer({ width: 1920, height: 1080 });
    renderer = new KonvaFrameRenderer({ width: 960, height: 540 });
    try {
      full.updateFrame(state, images, { renderScale: 1 });
      renderer.updateFrame(state, images, { renderScale: 0.5 });
      const fullLayer = (full as any).bgLayer;
      const previewLayer = (renderer as any).bgLayer;
      const fullActor = (full as any).actorNodes.get('hero');
      const previewActor = (renderer as any).actorNodes.get('hero');
      expect(previewLayer.x()).toBeCloseTo(fullLayer.x() / 2);
      expect(previewLayer.y()).toBeCloseTo(fullLayer.y() / 2);
      expect(previewActor.x()).toBeCloseTo(fullActor.x() / 2);
      expect(previewActor.y()).toBeCloseTo(fullActor.y() / 2);
    } finally {
      full.dispose();
    }
  });

  it('shows image at full opacity when no transition (background layer)', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const canvas = document.createElement('canvas');
    const state = makeBaseState();
    state.background = { asset: 'bg-forest' } satisfies LayerImageState;

    const images = makeImages();
    images.layerVariants = new Map([['bg-forest', canvas]]);

    renderer.updateFrame(state, images);

    const bgImage = (renderer as any).bgImage;
    const bgImage2 = (renderer as any).bgImage2;
    expect(bgImage.visible()).toBe(true);
    expect(bgImage.opacity()).toBe(1);
    expect(bgImage2.visible()).toBe(false);
  });

  it('uses fallback image when no LayerImageState (cg layer)', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const fallbackCanvas = document.createElement('canvas');

    const state = makeBaseState();
    state.cg = null;

    const images = makeImages();
    images.cg = fallbackCanvas;

    renderer.updateFrame(state, images);

    const cgImage = (renderer as any).cgImage;
    const cgImage2 = (renderer as any).cgImage2;
    expect(cgImage.visible()).toBe(true);
    expect(cgImage.opacity()).toBe(1);
    expect(cgImage2.visible()).toBe(false);
  });

  it('renders actor crossfades, dialogue skins, flash, and camera transforms together', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const actorCanvas = document.createElement('canvas');
    actorCanvas.width = 200;
    actorCanvas.height = 400;
    const previousActorCanvas = document.createElement('canvas');
    previousActorCanvas.width = 200;
    previousActorCanvas.height = 400;
    const bgCanvas = document.createElement('canvas');
    const cgCanvas = document.createElement('canvas');
    const dialogueSkin = document.createElement('canvas');

    const state = makeBaseState();
    state.actors = [
      {
        id: 'hero',
        x: 50,
        y: 100,
        visible: true,
        opacity: 0.8,
        sprite: 'happy',
        previousSprite: 'neutral',
        spriteTransition: { effect: 'fade', progress: 0.25 },
        shakeOffsetX: 5,
        shakeOffsetY: -3,
        scale: 1.2,
        flipX: true,
        isSpeaker: true,
        brightness: 0.9,
        blur: 2,
        rotation: 12,
        tintColor: '#336699',
        tintOpacity: 0.4,
      },
    ];
    state.dialogue = {
      speaker: 'Hero',
      text: 'hello world',
      segments: [{ text: 'hello', bold: true }, { text: ' world', color: '#ff0' }],
      progress: 0.6,
      theme: 'theme-with-image',
      displayMode: 'line',
    };
    state.flash = { color: '#ffffff', progress: 0.2 };
    state.screenShake = { offsetX: 4, offsetY: -6 };
    state.camera = { x: 40, y: 60, scale: 1.5 };
    state.background = { asset: 'bg-forest' };
    state.cg = { asset: 'cg-closeup' };

    const images = makeImages();
    images.actors.set('hero', actorCanvas);
    images.actorPrevious = new Map([['hero', previousActorCanvas]]);
    images.layerVariants = new Map([
      ['bg-forest', bgCanvas],
      ['cg-closeup', cgCanvas],
    ]);

    const frame = renderer.renderFrame(state, images, {
      customThemes: [
        {
          id: 'theme-with-image',
          name: 'Theme With Image',
          data: { boxImageUrl: '/dialogue-skin.png' },
        },
      ],
      dialogueBoxImage: dialogueSkin,
      speakerScale: true,
      dimBrightness: 0.7,
      renderScale: 1.25,
    });

    const actorNode = (renderer as any).actorNodes.get('hero');
    const fadeNode = (renderer as any).actorFadeNodes.get('hero');
    const dialogueGroup = (renderer as any).dialogueGroup;
    const dialogueBoxImage = (renderer as any).dialogueBoxImage;
    const bodyShape = (renderer as any).bodyShape;
    const flashRect = (renderer as any).flashRect;
    const bgLayer = (renderer as any).bgLayer;

    expect(frame).toBeInstanceOf(HTMLCanvasElement);
    expect(actorNode.visible()).toBe(true);
    expect(actorNode.rotation()).toBe(12);
    expect(actorNode.scaleX()).toBeLessThan(0);
    expect(actorNode.opacity()).toBeCloseTo(0.2, 6);
    expect(fadeNode.visible()).toBe(true);
    expect(fadeNode.opacity()).toBeCloseTo(0.6, 6);
    expect(dialogueGroup.visible()).toBe(true);
    expect(dialogueGroup.opacity()).toBe(1);
    expect(dialogueBoxImage.visible()).toBe(true);
    expect(bodyShape.visible()).toBe(true);
    expect(flashRect.visible()).toBe(true);
    expect(bgLayer.scaleX()).toBe(1.5);
    expect(bgLayer.x()).not.toBe(0);
  });

  it('renders narration in plain-text fallback mode and hides speaker chrome', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });

    const state = makeBaseState();
    state.narration = {
      text: 'A quiet monologue.',
      progress: 1,
      theme: 'classic',
      displayMode: 'instant',
    };

    renderer.updateFrame(state, makeImages(), { customThemes: [] });

    const dialogueGroup = (renderer as any).dialogueGroup;
    const speakerText = (renderer as any).speakerText;
    const bodyText = (renderer as any).bodyText;
    const bodyShape = (renderer as any).bodyShape;

    expect(dialogueGroup.visible()).toBe(true);
    expect(speakerText.visible()).toBe(false);
    expect(bodyText.visible()).toBe(false);
    expect(bodyShape.visible()).toBe(true);
  });

  it('keeps the previous speaker chrome fading out briefly when narration follows dialogue', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });
    const actorCanvas = document.createElement('canvas');
    actorCanvas.width = 200;
    actorCanvas.height = 400;
    const images = makeImages();
    images.actors.set('hero', actorCanvas);

    const dialogueState = makeBaseState();
    dialogueState.time = 1.0;
    dialogueState.actors = [
      {
        id: 'hero',
        x: 50,
        y: 100,
        visible: true,
        opacity: 1,
        sprite: null,
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
    ];
    dialogueState.dialogue = {
      speaker: 'Hero',
      text: 'Dialogue line',
      progress: 1,
      displayMode: 'instant',
    };

    renderer.updateFrame(dialogueState, images, { customThemes: [] });

    const narrationState = makeBaseState();
    narrationState.time = 1.05;
    narrationState.actors = [
      {
        id: 'hero',
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
        blur: 0,
        rotation: 0,
        tintColor: null,
        tintOpacity: 0,
      },
    ];
    narrationState.narration = {
      text: 'Narration line',
      progress: 0.1,
      displayMode: 'instant',
    };

    renderer.updateFrame(narrationState, images, { customThemes: [] });

    const speakerText = (renderer as any).speakerText;
    const actorNode = (renderer as any).actorNodes.get('hero');
    expect(speakerText.visible()).toBe(true);
    expect(speakerText.text()).toBe('Hero');
    expect(speakerText.opacity()).toBeCloseTo(0.5, 6);
    expect(actorNode.scaleX()).toBeCloseTo(1, 6);

    narrationState.time = 1.15;
    renderer.updateFrame(narrationState, images, { customThemes: [] });

    expect(speakerText.visible()).toBe(false);
    expect(actorNode.scaleX()).toBeCloseTo(1, 6);
  });

  it('renders classic galgame dialogue chrome at 1920x1080', () => {
    renderer = new KonvaFrameRenderer({ width: 1920, height: 1080 });

    const state = makeBaseState();
    state.dialogue = {
      speaker: '林夏',
      text: '你也在这里。夜色把旧街的灯都压得很低。',
      progress: 1,
      theme: 'classic',
      displayMode: 'instant',
    };

    renderer.updateFrame(state, makeImages(), { customThemes: [] });

    const group = (renderer as any).dialogueGroup;
    const boxRect = (renderer as any).dialogueBoxRect;
    const innerStroke = (renderer as any).dialogueInnerStroke;
    const speakerText = (renderer as any).speakerText;
    const nameplateRect = (renderer as any).nameplateRect;

    expect(group.visible()).toBe(true);
    expect(group.x()).toBeCloseTo(960);
    expect(boxRect.height()).toBe(300);
    expect(boxRect.cornerRadius()).toBe(0);
    expect(boxRect.shadowEnabled()).toBe(false);
    expect(boxRect.strokeWidth()).toBe(0);
    expect(innerStroke.visible()).toBe(false);
    expect(speakerText.visible()).toBe(true);
    expect(speakerText.text()).toBe('林夏');
    expect(speakerText.fontSize()).toBe(33);
    expect(speakerText.fontStyle()).toBe('bold');
    expect(speakerText.letterSpacing()).toBe(0);
    expect(nameplateRect.visible()).toBe(false);
    expect(1080 - (group.y() + boxRect.height() / 2)).toBeCloseTo(0);
  });

  it('keeps the full-width gradient bottom anchored with stock dialogueY', () => {
    renderer = new KonvaFrameRenderer({ width: 1920, height: 1080 });

    const state = makeBaseState();
    state.dialogue = {
      speaker: '林夏',
      text: '你也在这里。',
      progress: 1,
      theme: 'classic',
      themeOverrides: { dialogueY: 85 },
      displayMode: 'instant',
    };

    renderer.updateFrame(state, makeImages(), { customThemes: [] });

    const group = (renderer as any).dialogueGroup;
    const boxRect = (renderer as any).dialogueBoxRect;
    expect(1080 - (group.y() + boxRect.height() / 2)).toBeCloseTo(0);
  });

  it('resizes and disposes offscreen renderers cleanly', () => {
    renderer = new KonvaFrameRenderer({ width: 800, height: 600 });
    const stage = (renderer as any).stage;
    const container = (renderer as any).container as HTMLDivElement;

    renderer.resize(1024, 768);

    expect(stage.width()).toBe(1024);
    expect(stage.height()).toBe(768);
    expect((renderer as any).bgRect.width()).toBe(1024);
    expect(container.isConnected).toBe(true);

    renderer.dispose();

    expect(container.isConnected).toBe(false);
    expect((renderer as any).actorNodes.size).toBe(0);
  });
});

describe('optional speaker enlargement', () => {
  it('keeps the authored size through speaker changes unless enlargement is explicitly enabled', () => {
    renderer = new KonvaFrameRenderer({ width: 1920, height: 1080 });
    const state = makeBaseState();
    state.actors = [{ id: 'hero', x: 50, y: 100, scale: 1.2, visible: true, opacity: 1, sprite: 'portrait', isSpeaker: false, flipX: false, zIndex: 0 }];
    state.dialogue = { speaker: 'Hero', text: 'Hello', progress: 1, displayMode: 'instant' };
    const portrait = document.createElement('canvas'); portrait.width = 640; portrait.height = 960;
    const images = makeImages(); images.actors.set('hero', portrait);
    renderer.renderFrame(state, images);
    const initialScale = (renderer as any).actorNodes.get('hero').scaleX();
    state.actors[0].isSpeaker = true;
    renderer.renderFrame(state, images);
    expect((renderer as any).actorNodes.get('hero').scaleX()).toBeCloseTo(initialScale);
    renderer.renderFrame(state, images, { speakerScale: false });
    expect((renderer as any).actorNodes.get('hero').scaleX()).toBeCloseTo(initialScale);
    renderer.renderFrame(state, images, { speakerScale: true });
    expect((renderer as any).actorNodes.get('hero').scaleX()).toBeCloseTo(initialScale * 1.05);
  });
});
