import {SoftTransition} from "./soft-transition";
import { blendExpression } from "./expression-blend";
import { VisualNodes } from "./visual-nodes";
import { drawDialogueSurface } from './dialogue-surface';
import {dialogueGeometry} from './dialogue-geometry';
import Konva from 'konva';
import type { RenderState, LayerImageState } from '@vnve/runtime';
import type { SceneTransitionPlan } from './scene-transition-channels';
import { computeDialogueBoxPlacement, isDialogueStrokeVisible, resolveDialogueThemeForCanvas, scaleDialogueThemeForPortrait, type DialogueThemeConfig, type CustomThemeEntry } from './themes';
import { buildStyledTextRenderPlan, renderStyledTextPlan, textNeedsShadow } from './styled-text';
import { clampBoxImageOpacity, drawDialogueBoxImage } from './dialogue-box-image';
import { type TransitionEffect } from './transition-effects';
import { WeatherParticleSystem } from './weather-effects';
import { getFullScreenImageCrop } from './fullscreen-image';

export interface KonvaFrameRendererConfig {
  width: number;
  height: number;
  mode: 'visible' | 'offscreen';
  mountTarget?: HTMLDivElement; // required when mode='visible'
}

export type ImageMap = {
  actors: Map<string, CanvasImageSource>;
  actorPrevious?: Map<string, CanvasImageSource>;
  background: CanvasImageSource | null;
  cg?: CanvasImageSource | null;
  layerVariants?: Map<string, CanvasImageSource>;
};

export interface FrameRendererOptions {
  visualFonts?: Map<string,string>;
  backgroundColor?: string;
  dimBrightness?: number;
  speakerScale?: boolean;
  transition?: {
    effect: string;
    progress: number;
    outgoingSceneId?: string | null;
    incomingSceneId?: string | null;
    compositorPlan?: SceneTransitionPlan;
  };
  customThemes?: CustomThemeEntry[];
  dialogueBoxImage?: CanvasImageSource | null;
  renderScale?: number;
}

export interface FrameRenderer {
  renderFrame(
    state: RenderState,
    images: ImageMap,
    options?: FrameRendererOptions,
  ): HTMLCanvasElement;
  renderTransitionFrame?(
    outgoing: { state: RenderState; images: ImageMap; options?: FrameRendererOptions },
    incoming: { state: RenderState; images: ImageMap; options?: FrameRendererOptions },
    transition: { effect: string; progress: number; compositorPlan: SceneTransitionPlan },
  ): HTMLCanvasElement;
  dispose(): void;
}

function createCombinedFilter(brightness: number, tintColor: string | null, tintOpacity: number) {
  return function combinedFilter(imageData: ImageData) {
    const data = imageData.data;
    let tr = 0, tg = 0, tb = 0;
    if (tintColor) {
      tr = parseInt(tintColor.slice(1, 3), 16) || 0;
      tg = parseInt(tintColor.slice(3, 5), 16) || 0;
      tb = parseInt(tintColor.slice(5, 7), 16) || 0;
    }
    const hasTint = tintColor !== null && tintOpacity > 0;
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] * brightness;
      let g = data[i + 1] * brightness;
      let b = data[i + 2] * brightness;
      if (hasTint) {
        r = r * (1 - tintOpacity) + tr * tintOpacity;
        g = g * (1 - tintOpacity) + tg * tintOpacity;
        b = b * (1 - tintOpacity) + tb * tintOpacity;
      }
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  };
}

const DIALOGUE_INNER_INSET = 3;
const DIALOGUE_TEXT_SHADOW_COLOR = 'rgba(10, 12, 18, 0.5)';
const DIALOGUE_TEXT_SHADOW_BLUR = 2;
const DIALOGUE_TEXT_SHADOW_OFFSET_Y = 1;
const DIALOGUE_TO_NARRATION_CHROME_FADE_SECONDS = 0.1;

type SpeechKind = 'dialogue' | 'narration' | 'none';

interface DialogueChromeSnapshot {
  actorId: string;
  speaker: string;
}

interface OutgoingDialogueChrome extends DialogueChromeSnapshot {
  startedAt: number;
}

interface SceneVisualTransform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

function normalizeRenderScale(scale?: number): number {
  if (typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) {
    return 1;
  }
  return scale;
}

function clampPercent(value: number | undefined, fallback: number): number {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, safe));
}

function createDialogueBoxImageShape(): Konva.Shape {
  return new Konva.Shape({
    listening: false,
    visible: false,
    sceneFunc: (context, shape) => {
      const image = shape.getAttr('boxImageSource') as CanvasImageSource | undefined;
      const native = (context as unknown as { _context: CanvasRenderingContext2D })._context;
      if (!image) {
        const theme = shape.getAttr('surfaceTheme') as DialogueThemeConfig | undefined;
        if (theme) drawDialogueSurface(native, theme, shape.width(), shape.height());
        return;
      }
      const prevAlpha = native.globalAlpha;
      native.globalAlpha = prevAlpha * clampBoxImageOpacity(shape.getAttr('boxImageOpacity'));
      drawDialogueBoxImage(
        native,
        image,
        { x: 0, y: 0, width: shape.width(), height: shape.height() },
        {
          fit: shape.getAttr('boxImageFit'),
          slice: shape.getAttr('boxImageSlice'),
        },
      );
      native.globalAlpha = prevAlpha;
    },
  });
}


export function scaleDialogueThemeForRender(
  theme: DialogueThemeConfig,
  renderScale?: number,
): DialogueThemeConfig {
  const scale = normalizeRenderScale(renderScale);
  if (Math.abs(scale - 1) < 0.0001) return theme;
  return {
    ...theme,
    cornerRadius: theme.cornerRadius * scale,
    fontSize: theme.fontSize * scale,
    nameFontSize: theme.nameFontSize * scale,
    paddingX: theme.paddingX * scale,
    paddingY: theme.paddingY * scale,
    boxHeight: theme.boxHeight * scale,
    ...(theme.boxBottomGap !== undefined ? { boxBottomGap: theme.boxBottomGap * scale } : {}),
    nameplatePaddingX: theme.nameplatePaddingX * scale,
    nameplatePaddingY: theme.nameplatePaddingY * scale,
  };
}

function applyNodeOpacity(node: Konva.Node, opacityMultiplier: number): void {
  if (!node.visible()) return;
  node.opacity(node.opacity() * opacityMultiplier);
}

/**
 * Unified Konva renderer for both preview playback and export.
 *
 * - `visible` mode: mounts the Konva Stage into a provided container (preview)
 * - `offscreen` mode: creates a hidden container at -9999px (export)
 *
 * Call `updateFrame()` each tick for live preview (no toCanvas overhead).
 * Call `captureFrame()` after updateFrame to get an HTMLCanvasElement (export).
 * The legacy `renderFrame()` calls both for backward compatibility.
 */
export class KonvaFrameRenderer implements FrameRenderer {
  private stage: Konva.Stage;
  private container: HTMLDivElement;
  private ownContainer: boolean;
  private bgLayer: Konva.Layer;
  private visualBehind = new Konva.Group({listening:false});
  private visualAbove = new Konva.Group({listening:false});
  private visualNodes = new VisualNodes(this.visualBehind,this.visualAbove);
  private lastFrame?: {
    state: RenderState;
    images: ImageMap;
    options?: FrameRendererOptions;
  };
  private expressionCanvases = new Map<string, HTMLCanvasElement>();
  private actorGroup: Konva.Group;
  private cgGroup: Konva.Group;
  private dialogueLayer: Konva.Layer;

  // Persistent background nodes
  private bgRect: Konva.Rect;
  private bgImage: Konva.Image;
  private bgImage2: Konva.Image; // for bg crossfade
  private cgImage: Konva.Image;
  private cgImage2: Konva.Image; // for cg crossfade

  // Flash overlay node (in transition layer)
  private flashRect: Konva.Rect;
  private wipeRect = new Konva.Rect({fill:"#101318",listening:false,visible:false});

  // Dialogue persistent nodes
  private dialogueGroup: Konva.Group;
  private dialogueClipGroup: Konva.Group;
  private dialogueBoxRect: Konva.Rect;
  private dialogueBoxImage: Konva.Shape;
  private dialogueInnerStroke: Konva.Rect;
  private nameplateRect: Konva.Rect;
  private speakerText: Konva.Text;
  private bodyText: Konva.Text;
  private bodyShape: Konva.Shape;

  // Outgoing scene image (rendered from offscreen canvas)
  private outgoingSceneImage: Konva.Image;
  private incomingSceneImage: Konva.Image;

  // Outgoing dialogue group (mirrors dialogueGroup structure)
  private outgoingDialogueGroup: Konva.Group;
  private outgoingDialogueClipGroup: Konva.Group;
  private outgoingDialogueBoxRect: Konva.Rect;
  private outgoingDialogueBoxImage: Konva.Shape;
  private outgoingDialogueInnerStroke: Konva.Rect;
  private outgoingNameplateRect: Konva.Rect;
  private outgoingSpeakerText: Konva.Text;
  private outgoingBodyText: Konva.Text;
  private outgoingBodyShape: Konva.Shape;

  // Offscreen renderer for outgoing scene
  private offscreenRenderer: KonvaFrameRenderer | null = null;

  // Transition overlay (topmost layer)
  private transitionLayer: Konva.Layer;
  private softTransition:SoftTransition|null=null;
  private activeTransition: { key: string; effect: string; impl: TransitionEffect; lastProgress: number } | null = null;

  // Actor node pool: actorId → Konva.Image
  private outgoingActorGroup: Konva.Group;
  private outgoingActorNodes = new Map<string, Konva.Image>();
  private outgoingActorFadeNodes = new Map<string, Konva.Image>();
  private actorNodes = new Map<string, Konva.Image>();
  private actorFadeNodes = new Map<string, Konva.Image>();

  private weatherLayer: Konva.Layer;
  private weatherShape: Konva.Shape;
  private weatherSystem: WeatherParticleSystem | null = null;
  private weatherKey: string | null = null;
  private lastFrameTime = 0;
  private _weatherOpacity = 0;
  private lastRenderedStateTime: number | null = null;
  private previousSpeechKind: SpeechKind = 'none';
  private previousDialogueChrome: DialogueChromeSnapshot | null = null;
  private outgoingDialogueChrome: OutgoingDialogueChrome | null = null;

  private width: number;
  private height: number;

  constructor(config: KonvaFrameRendererConfig | { width: number; height: number }) {
    this.width = config.width;
    this.height = config.height;

    const mode = 'mode' in config ? config.mode : 'offscreen';

    if (mode === 'visible') {
      const target = (config as KonvaFrameRendererConfig).mountTarget;
      if (!target) throw new Error('mountTarget is required for visible mode');
      this.container = target;
      this.ownContainer = false;
    } else {
      // Hidden container for offscreen rendering (export)
      this.container = document.createElement('div');
      this.container.style.position = 'fixed';
      this.container.style.left = '-9999px';
      this.container.style.top = '-9999px';
      this.container.style.width = `${config.width}px`;
      this.container.style.height = `${config.height}px`;
      document.body.appendChild(this.container);
      this.ownContainer = true;
    }

    this.stage = new Konva.Stage({
      container: this.container,
      width: config.width,
      height: config.height,
    });

    // Unified visual layer: background + prop + actor + cg
    this.bgLayer = new Konva.Layer();
    this.bgRect = new Konva.Rect({
      width: config.width,
      height: config.height,
      listening: false,
    });
    this.bgImage = new Konva.Image({
      image: undefined,
      width: config.width,
      height: config.height,
      listening: false,
      visible: false,
    });
    this.bgImage2 = new Konva.Image({
      image: undefined,
      width: config.width,
      height: config.height,
      listening: false,
      visible: false,
    });
    this.bgLayer.add(this.bgRect);
    this.bgLayer.add(this.bgImage);
    this.bgLayer.add(this.bgImage2);
    this.outgoingSceneImage = new Konva.Image({
      image: undefined,
      width: config.width,
      height: config.height,
      listening: false,
      visible: false,
      name: 'outgoingScene',
    });
    this.bgLayer.add(this.outgoingSceneImage);
    this.incomingSceneImage = new Konva.Image({
      image: undefined,
      width: config.width,
      height: config.height,
      listening: false,
      visible: false,
      name: 'incomingScene',
    });
    this.bgLayer.add(this.incomingSceneImage);
    this.outgoingActorGroup = new Konva.Group({ listening: false, visible: false, name: 'outgoingActors' });
    this.bgLayer.add(this.visualBehind);
    this.bgLayer.add(this.outgoingActorGroup);
    this.actorGroup = new Konva.Group({ listening: false, name: 'actors' });
    this.cgGroup = new Konva.Group({ listening: false });
    this.bgLayer.add(this.actorGroup);
    this.bgLayer.add(this.cgGroup);
    this.bgLayer.add(this.visualAbove);
    this.stage.add(this.bgLayer);

    this.weatherLayer = new Konva.Layer({ listening: false });
    this.weatherShape = new Konva.Shape({
      width: config.width,
      height: config.height,
      name: 'weather',
      listening: false,
      sceneFunc: (context) => {
        if (!this.weatherSystem) return;
        const ctx = (context as unknown as { _context: CanvasRenderingContext2D })._context;
        this.weatherSystem.render(ctx, this._weatherOpacity);
      },
    });
    this.weatherLayer.add(this.weatherShape);
    this.stage.add(this.weatherLayer);

    // CG nodes (above actors, below dialogue)
    this.cgImage = new Konva.Image({
      image: undefined,
      width: config.width,
      height: config.height,
      listening: false,
      visible: false,
    });
    this.cgImage2 = new Konva.Image({
      image: undefined,
      width: config.width,
      height: config.height,
      listening: false,
      visible: false,
    });
    this.cgGroup.add(this.cgImage);
    this.cgGroup.add(this.cgImage2);

    // Dialogue layer with persistent nodes
    this.dialogueLayer = new Konva.Layer();

    // Outgoing dialogue group (rendered below incoming dialogue)
    this.outgoingDialogueGroup = new Konva.Group({ visible: false, name: 'outgoingDialogue' });
    this.outgoingDialogueClipGroup = new Konva.Group();
    this.outgoingDialogueBoxRect = new Konva.Rect({
      listening: false,
      shadowEnabled: false,
      cornerRadius: 0,
    });
    this.outgoingDialogueBoxImage = createDialogueBoxImageShape();
    this.outgoingDialogueInnerStroke = new Konva.Rect({ listening: false, fillEnabled: false, visible: false });
    this.outgoingNameplateRect = new Konva.Rect({ listening: false, visible: false, cornerRadius: 0 });
    this.outgoingSpeakerText = new Konva.Text({ listening: false, visible: false });
    this.outgoingBodyText = new Konva.Text({ listening: false });
    this.outgoingBodyShape = new Konva.Shape({ listening: false, visible: false });

    this.outgoingDialogueClipGroup.add(this.outgoingDialogueBoxRect);
    this.outgoingDialogueClipGroup.add(this.outgoingDialogueBoxImage);
    this.outgoingDialogueGroup.add(this.outgoingDialogueClipGroup);
    this.outgoingDialogueGroup.add(this.outgoingDialogueInnerStroke);
    this.outgoingDialogueGroup.add(this.outgoingNameplateRect);
    this.outgoingDialogueGroup.add(this.outgoingSpeakerText);
    this.outgoingDialogueGroup.add(this.outgoingBodyText);
    this.outgoingDialogueGroup.add(this.outgoingBodyShape);
    this.dialogueLayer.add(this.outgoingDialogueGroup);

    this.dialogueGroup = new Konva.Group({ visible: false, name: 'dialogue' });
    this.dialogueClipGroup = new Konva.Group();
    this.dialogueBoxRect = new Konva.Rect({
      listening: false,
      shadowEnabled: false,
      cornerRadius: 0,
    });
    this.dialogueBoxImage = createDialogueBoxImageShape();
    this.dialogueInnerStroke = new Konva.Rect({ listening: false, fillEnabled: false, visible: false });
    this.nameplateRect = new Konva.Rect({ listening: false, visible: false, cornerRadius: 0 });
    this.speakerText = new Konva.Text({ listening: false, visible: false });
    this.bodyText = new Konva.Text({ listening: false });
    this.bodyShape = new Konva.Shape({ listening: false, visible: false });

    this.dialogueClipGroup.add(this.dialogueBoxRect);
    this.dialogueClipGroup.add(this.dialogueBoxImage);
    this.dialogueGroup.add(this.dialogueClipGroup);
    this.dialogueGroup.add(this.dialogueInnerStroke);
    this.dialogueGroup.add(this.nameplateRect);
    this.dialogueGroup.add(this.speakerText);
    this.dialogueGroup.add(this.bodyText);
    this.dialogueGroup.add(this.bodyShape);
    this.dialogueLayer.add(this.dialogueGroup);

    this.stage.add(this.dialogueLayer);

    // Transition overlay layer (topmost)
    this.transitionLayer = new Konva.Layer({ listening: false });
    this.flashRect = new Konva.Rect({
      width: config.width,
      height: config.height,
      name: 'flash',
      visible: false,
      listening: false,
    });
    this.transitionLayer.add(this.flashRect);
    this.transitionLayer.add(this.wipeRect);
    this.stage.add(this.transitionLayer);
  }

  /**
   * Apply crossfade / static / fallback logic for one full-screen image pair.
   */
  private updateFullScreenLayer(
    image1: Konva.Image,
    image2: Konva.Image,
    state: LayerImageState | null,
    fallbackImage: CanvasImageSource | null | undefined,
    layerVariants: Map<string, CanvasImageSource> | undefined,
    width: number,
    height: number,
  ): void {
    if (state) {
      if (state.transition && state.transition.effect === 'fade' && state.previousAsset) {
        const prevImg = layerVariants?.get(state.previousAsset);
        const nextImg = layerVariants?.get(state.asset);
        if (prevImg) {
          image1.image(prevImg);
          image1.crop(getFullScreenImageCrop(prevImg, width, height));
          image1.width(width);
          image1.height(height);
          image1.opacity(1);
          image1.visible(true);
        } else {
          image1.visible(false);
        }
        if (nextImg) {
          image2.image(nextImg);
          image2.crop(getFullScreenImageCrop(nextImg, width, height));
          image2.width(width);
          image2.height(height);
          image2.opacity(state.transition.progress);
          image2.visible(true);
        } else {
          image2.visible(false);
        }
      } else {
        const img = layerVariants?.get(state.asset);
        if (img) {
          image1.image(img);
          image1.crop(getFullScreenImageCrop(img, width, height));
          image1.width(width);
          image1.height(height);
          image1.opacity(1);
          image1.visible(true);
        } else {
          image1.visible(false);
        }
        image2.visible(false);
      }
    } else if (fallbackImage) {
      image1.image(fallbackImage);
      image1.crop(getFullScreenImageCrop(fallbackImage, width, height));
      image1.width(width);
      image1.height(height);
      image1.opacity(1);
      image1.visible(true);
      image2.visible(false);
    } else {
      image1.visible(false);
      image2.visible(false);
    }
  }

  /**
   * Update all Konva nodes to reflect the given state and trigger batchDraw().
   * For live preview, call this every frame — no toCanvas() overhead.
   */
  updateFrame(
    state: RenderState,
    images: ImageMap,
    options?: FrameRendererOptions,
  ): void {
    this.wipeRect.visible(false);
    this.lastFrame = {state, images, options};
    this.visualNodes.restore();
    const timeWentBack = this.lastRenderedStateTime !== null && state.time < this.lastRenderedStateTime;
    if (timeWentBack) {
      this.previousSpeechKind = 'none';
      this.previousDialogueChrome = null;
      this.outgoingDialogueChrome = null;
    }

    const currentSpeechKind: SpeechKind = state.dialogue
      ? 'dialogue'
      : state.narration
        ? 'narration'
        : 'none';
    const currentDialogueSpeakerActorId = state.dialogue
      ? state.actors.find((actor) => actor.isSpeaker)?.id ?? null
      : null;

    if (currentSpeechKind === 'dialogue' && currentDialogueSpeakerActorId && state.dialogue) {
      this.previousDialogueChrome = {
        actorId: currentDialogueSpeakerActorId,
        speaker: state.dialogue.speaker,
      };
      this.outgoingDialogueChrome = null;
    } else if (currentSpeechKind !== 'narration') {
      this.outgoingDialogueChrome = null;
    }

    if (
      currentSpeechKind === 'narration' &&
      this.previousSpeechKind === 'dialogue' &&
      this.previousDialogueChrome &&
      !this.outgoingDialogueChrome &&
      this.lastRenderedStateTime !== null
    ) {
      this.outgoingDialogueChrome = {
        ...this.previousDialogueChrome,
        startedAt: this.lastRenderedStateTime,
      };
    }

    let outgoingDialogueChrome:
      | (DialogueChromeSnapshot & { opacity: number })
      | null = null;
    if (currentSpeechKind === 'narration' && this.outgoingDialogueChrome) {
      const elapsed = Math.max(0, state.time - this.outgoingDialogueChrome.startedAt);
      const fadeProgress = Math.max(0, Math.min(1, elapsed / DIALOGUE_TO_NARRATION_CHROME_FADE_SECONDS));
      if (fadeProgress < 1) {
        outgoingDialogueChrome = {
          actorId: this.outgoingDialogueChrome.actorId,
          speaker: this.outgoingDialogueChrome.speaker,
          opacity: 1 - fadeProgress,
        };
      } else {
        this.outgoingDialogueChrome = null;
      }
    }

    const actorState = outgoingDialogueChrome && !state.dialogue
      ? {
        ...state,
        dialogue: {} as RenderState['dialogue'],
        actors: state.actors.map((actor) => actor.id === outgoingDialogueChrome.actorId
          ? { ...actor, isSpeaker: true }
          : actor),
      }
      : state;

    this.updateStaticLayers(state, images, options);
    this.applyIncomingStaticOpacity(1);
    this.updateActorGroup(
      this.actorGroup,
      this.actorNodes,
      this.actorFadeNodes,
      actorState,
      images,
      1,
      options,
    );
    this.visualBehind.visible(true);this.visualAbove.visible(true);
    this.visualNodes.update(state.visuals??[],this.width,this.height,this.bgLayer.getTransform(),images.layerVariants,options?.visualFonts,options?.speakerScale&&state.dialogue?{actorId:state.actors.find(a=>a.isSpeaker)?.id??"",scale:1.05}:undefined);
    this.actorGroup.opacity(1);
    this.outgoingActorGroup.visible(false);
    this.outgoingActorGroup.opacity(1);
    this.outgoingActorGroup.x(0);
    this.outgoingActorGroup.y(0);
    this.outgoingActorGroup.scaleX(1);
    this.outgoingActorGroup.scaleY(1);
    this.bgLayer.opacity(1);

    // 3. Update dialogue/narration
    const transitionDialogueOpacity = 1;

    // Hide outgoing transition elements during normal rendering
    this.outgoingSceneImage.visible(false);
    this.incomingSceneImage.visible(false);
    this.outgoingDialogueGroup.visible(false);
    this.weatherLayer.visible(true);
    if (this.offscreenRenderer) {
      this.offscreenRenderer.dispose();
      this.offscreenRenderer = null;
    }

    this.updateDialogueNodes(
      this.dialogueGroup,
      this.dialogueClipGroup,
      this.dialogueBoxRect,
      this.dialogueBoxImage,
      this.dialogueInnerStroke,
      this.nameplateRect,
      this.speakerText,
      this.bodyText,
      this.bodyShape,
      state,
      transitionDialogueOpacity,
      outgoingDialogueChrome,
      options,
    );
    this.dialogueLayer.visible(true);
    this.previousSpeechKind = currentSpeechKind;
    this.lastRenderedStateTime = state.time;

    // 4. Update flash overlay
    if (state.flash) {
      this.flashRect.fill(state.flash.color);
      this.flashRect.opacity(1 - state.flash.progress);
      this.flashRect.visible(true);
    } else {
      this.flashRect.visible(false);
    }

    this.visualNodes.compose(
      state.visuals ?? [],
      (member) => {
        if (member.kind === "actor")
          return [
            this.actorFadeNodes.get(member.actorId),
            this.actorNodes.get(member.actorId),
          ].filter((n): n is Konva.Image => !!n);
        if (member.kind === "background")
          return [this.bgRect, this.bgImage, this.bgImage2];
        if (member.kind === "cg") return [this.cgGroup];
        if (member.kind === "dialogue") return [this.dialogueGroup];
        return [];
      },
      images.layerVariants,
    );
    // 5. Batch draw (renders to screen for visible mode)
    this.stage.batchDraw();
  }

  /**
   * Reusable dialogue/narration rendering for a given set of Konva nodes.
   * Used by both updateFrame (main dialogue) and updateTransitionFrame (dual dialogue).
   */
  private updateDialogueNodes(
    group: Konva.Group,
    clipGroup: Konva.Group,
    boxRect: Konva.Rect,
    boxImage: Konva.Shape,
    innerStroke: Konva.Rect,
    npRect: Konva.Rect,
    spText: Konva.Text,
    bText: Konva.Text,
    bShape: Konva.Shape,
    state: RenderState,
    opacity: number,
    outgoingChrome: (DialogueChromeSnapshot & { opacity: number }) | null,
    options?: FrameRendererOptions,
  ): void {
    const { width, height } = this;
    const dialogue = state.dialogue;
    const narration = state.narration;

    if (!(dialogue || narration)) {
      group.visible(false);
      return;
    }

    const isNarration = !!narration && !dialogue;
    const d = dialogue ?? narration!;

    const renderScale = normalizeRenderScale(options?.renderScale);
    const baseTheme = resolveDialogueThemeForCanvas(
      d.theme,
      d.themeOverrides as Partial<Omit<DialogueThemeConfig, 'id' | 'name'>> | undefined,
      options?.customThemes,
      width / renderScale, height / renderScale,
    );
    const theme = scaleDialogueThemeForRender(baseTheme, renderScale);
    const geometry=dialogueGeometry(theme,width,height);
    const placement = geometry.box;
    const boxW = placement.width;
    const centerX = placement.centerX;
    const centerY = placement.centerY;
    const nameplateX = geometry.name.x;
    const nameplateY = geometry.name.y;
    const nameplateHeight = geometry.name.height;
    const nameplateBaseWidth = geometry.name.width;
    const bodyX = geometry.body.x;
    const bodyY = geometry.body.y;
    const bodyWidth = geometry.body.width;
    const bodyHeight = geometry.body.height;

    const dialogueLift = isNarration ? 0 : (1 - opacity) * 16 * renderScale;

    group.x(centerX);
    group.y(centerY + dialogueLift);
    group.offsetX(boxW / 2);
    group.offsetY(theme.boxHeight / 2);
    group.opacity(opacity);
    group.visible(true);

    // Image skin
    const hasImageSkin = !!(theme.boxImageUrl && options?.dialogueBoxImage);
    if (hasImageSkin) {
      boxImage.setAttr('boxImageSource', options!.dialogueBoxImage!);
      boxImage.setAttr('boxImageFit', theme.boxImageFit??'stretch');
      boxImage.setAttr('boxImageOpacity', clampBoxImageOpacity(theme.boxImageOpacity));
      boxImage.setAttr('boxImageSlice', theme.boxImageSlice);
      boxImage.width(boxW);
      boxImage.height(theme.boxHeight);
      boxImage.visible(true);

      const cr = theme.cornerRadius;
      if (cr > 0) {
        clipGroup.clipFunc((ctx) => {
          ctx.beginPath();
          ctx.moveTo(cr, 0);
          ctx.lineTo(boxW - cr, 0);
          ctx.arcTo(boxW, 0, boxW, cr, cr);
          ctx.lineTo(boxW, theme.boxHeight - cr);
          ctx.arcTo(boxW, theme.boxHeight, boxW - cr, theme.boxHeight, cr);
          ctx.lineTo(cr, theme.boxHeight);
          ctx.arcTo(0, theme.boxHeight, 0, theme.boxHeight - cr, cr);
          ctx.lineTo(0, cr);
          ctx.arcTo(0, 0, cr, 0, cr);
          ctx.closePath();
        });
      } else {
        clipGroup.clipFunc(null);
      }
    } else {
      boxImage.setAttr('boxImageSource', undefined);
      boxImage.setAttr('surfaceTheme', theme);
      boxImage.width(boxW);
      boxImage.height(theme.boxHeight);
      boxImage.visible(true);
      clipGroup.clipFunc(null);
    }

    // Box background
    boxRect.width(boxW);
    boxRect.height(theme.boxHeight);
    const showStroke = !hasImageSkin && isDialogueStrokeVisible(theme.boxStroke);
    boxRect.fill('transparent');
    boxRect.stroke(showStroke ? theme.boxStroke : 'transparent');
    boxRect.strokeWidth(showStroke ? 1 : 0);
    boxRect.cornerRadius(theme.cornerRadius);
    boxRect.shadowEnabled(false);
    boxRect.shadowBlur(0);

    const inset = DIALOGUE_INNER_INSET * renderScale;
    innerStroke.x(inset);
    innerStroke.y(inset);
    innerStroke.width(Math.max(0, boxW - inset * 2));
    innerStroke.height(Math.max(0, theme.boxHeight - inset * 2));
    innerStroke.stroke(theme.boxStroke);
    innerStroke.strokeWidth(1);
    innerStroke.opacity(0.45);
    innerStroke.cornerRadius(Math.max(0, theme.cornerRadius - inset));
    innerStroke.visible(showStroke);

    const fontSize = theme.fontSize;
    const lineHeight = fontSize * Math.max(1, theme.lineHeight);
    const segments = d.segments;
    const displayMode = d.displayMode ?? theme.defaultDisplayMode ?? 'typewriter';

    const fullText = 'text' in d ? d.text : '';
    const sourceSegments = segments && segments.length > 0
      ? segments
      : [{ text: fullText || '...' }];

    const outgoingSpeakerChrome = isNarration ? outgoingChrome : null;
    const showSpeaker = !isNarration || !!outgoingSpeakerChrome;
    if (!showSpeaker) {
      npRect.visible(false);
      spText.visible(false);
    } else {
      const speakerOpacity = outgoingSpeakerChrome?.opacity ?? 1;
      const speaker = dialogue?.speaker ?? outgoingSpeakerChrome!.speaker;
      const nameplateW = nameplateBaseWidth;
      const showHeaderBand = theme.nameplateVisible && !hasImageSkin;

      if (showHeaderBand) {
        npRect.x(0);
        npRect.y(0);
        npRect.width(boxW);
        npRect.height(Math.max(1, nameplateY + nameplateHeight));
        npRect.fill(theme.nameplateFill);
        npRect.cornerRadius(0);
        npRect.opacity(speakerOpacity);
        npRect.visible(true);
      } else {
        npRect.visible(false);
      }

      spText.x(nameplateX);
      spText.y(nameplateY);
      spText.width(nameplateW);
      spText.height(nameplateHeight);
      spText.wrap('none');
      spText.ellipsis(true);
      spText.text(speaker);
      spText.fontSize(theme.nameFontSize);
      spText.fontFamily(theme.nameFontFamily);
      spText.fontStyle('bold');
      spText.fontVariant('normal');
      spText.fill(theme.nameColor);
      spText.letterSpacing(0);
      spText.verticalAlign('middle');
      spText.align('left');
      spText.shadowColor(DIALOGUE_TEXT_SHADOW_COLOR);
      spText.shadowBlur(DIALOGUE_TEXT_SHADOW_BLUR * renderScale);
      spText.shadowOffsetY(DIALOGUE_TEXT_SHADOW_OFFSET_Y * renderScale);
      spText.shadowOffsetX(0);
      spText.shadowEnabled(textNeedsShadow(theme.nameColor));
      spText.opacity(speakerOpacity);
      spText.visible(true);
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    const textRenderPlan = tempCtx
      ? buildStyledTextRenderPlan(tempCtx, sourceSegments, {
          width: bodyWidth,
          fontSize,
          fontFamily: theme.fontFamily,
          padding: 0,
          displayMode,
          progress: d.progress,
          elapsedSeconds: d.elapsedSeconds,
          revealDurationSeconds: d.revealDurationSeconds,
          lineRevealGapSeconds: undefined,
        })
      : null;

    bShape.x(bodyX);
    bShape.y(bodyY);
    bShape.width(bodyWidth);
    bShape.height(bodyHeight);
    bShape.sceneFunc((context) => {
      const ctx = (context as unknown as { _context: CanvasRenderingContext2D })._context;
      if (!textRenderPlan) {
        return;
      }
      renderStyledTextPlan(ctx, textRenderPlan, {
        x: 0,
        y: 0,
        width: bodyWidth,
        fontSize,
        fontFamily: theme.fontFamily,
        defaultColor: theme.textColor,
        lineHeight,
        align: 'left',
        padding: 0,
      });
    });
    bShape.visible(true);
    bText.visible(false);
  }

  private syncSpeechChromeState(state: RenderState): void {
    const currentSpeechKind: SpeechKind = state.dialogue
      ? 'dialogue'
      : state.narration
        ? 'narration'
        : 'none';
    const currentDialogueSpeakerActorId = state.dialogue
      ? state.actors.find((actor) => actor.isSpeaker)?.id ?? null
      : null;

    this.previousSpeechKind = currentSpeechKind;
    this.outgoingDialogueChrome = null;

    if (currentSpeechKind === 'dialogue' && currentDialogueSpeakerActorId && state.dialogue) {
      this.previousDialogueChrome = {
        actorId: currentDialogueSpeakerActorId,
        speaker: state.dialogue.speaker,
      };
      return;
    }

    this.previousDialogueChrome = null;
  }

  /**
   * Build the visual shot surface used for scene transitions.
   * Dialogue and narration remain on the live HUD layer.
   */
  private buildTransitionShotState(state: RenderState): RenderState {
    return {
      ...state,
      dialogue: null,
      narration: null,
      flash: null,
    };
  }

  updateTransitionFrame(
    outgoing: { state: RenderState; images: ImageMap; options?: FrameRendererOptions },
    incoming: { state: RenderState; images: ImageMap; options?: FrameRendererOptions },
    transition: {
      effect: string;
      progress: number;
      compositorPlan: SceneTransitionPlan;
    },
  ): void {
    const { width, height } = this;
    this.visualNodes.restore();
    const plan = transition.compositorPlan;

    // 1. Create offscreen renderer lazily
    if (!this.offscreenRenderer) {
      this.offscreenRenderer = new KonvaFrameRenderer({ width, height });
    }

    // 2. Render full outgoing/incoming shot surfaces offscreen.
    const outgoingShotState = this.buildTransitionShotState(outgoing.state);
    this.offscreenRenderer.updateFrame(outgoingShotState, outgoing.images, outgoing.options);
    const outgoingCanvas = this.offscreenRenderer.captureFrame();
    const incomingShotState = this.buildTransitionShotState(incoming.state);
    this.offscreenRenderer.updateFrame(incomingShotState, incoming.images, incoming.options);
    const incomingCanvas = this.offscreenRenderer.captureFrame();

    // The plan contains final blend weights, while Konva stacks source-over layers.
    // Undo the occlusion from layers above each surface; applying both weights as
    // raw alpha would darken dissolves and fade the shot twice through black/white.
    const colorOpacity = plan.shot.throughColor ? plan.shot.throughColorOpacity : 0;
    const beneathColor = Math.max(0, 1 - colorOpacity);
    const incomingAlpha = beneathColor > 0
      ? Math.min(1, plan.shot.incoming.opacity / beneathColor) : 0;
    const beneathIncoming = Math.max(0, beneathColor - plan.shot.incoming.opacity);
    const outgoingAlpha = beneathIncoming > 1e-9
      ? Math.min(1, plan.shot.outgoing.opacity / beneathIncoming) : 0;

    // 3. Show both shot surfaces as images on the main stage.
    // Camera and shake are already baked into each surface. Sparse preview
    // sampling must not inherit the last normal frame's transform here.
    this.applySceneVisualTransform(this.bgLayer, { x: 0, y: 0, scaleX: 1, scaleY: 1 });
    this.outgoingSceneImage.image(outgoingCanvas);
    this.outgoingSceneImage.width(width);
    this.outgoingSceneImage.height(height);
    this.outgoingSceneImage.opacity(outgoingAlpha);
    this.outgoingSceneImage.visible(true);
    this.incomingSceneImage.image(incomingCanvas);
    this.incomingSceneImage.width(width);
    this.incomingSceneImage.height(height);
    this.incomingSceneImage.opacity(incomingAlpha);
    this.incomingSceneImage.visible(true);
    if(transition.effect==='soft-dissolve'){
      const canvas=transition.progress<=0?outgoingCanvas:transition.progress>=1?incomingCanvas:(this.softTransition??=new SoftTransition()).render(outgoingCanvas,incomingCanvas,transition.progress);
      this.outgoingSceneImage.visible(false);this.incomingSceneImage.image(canvas);this.incomingSceneImage.opacity(1);
    }


    // 4. Hide live visual layers while the baked shot surfaces are active.
    this.visualNodes.hide();
    this.bgRect.visible(false);
    this.bgImage.visible(false);
    this.bgImage2.visible(false);
    this.cgImage.visible(false);
    this.cgImage2.visible(false);
    this.bgLayer.opacity(1);
    this.outgoingActorGroup.visible(false);
    this.actorGroup.visible(false);
    this.weatherShape.visible(false);
    this.weatherLayer.visible(false);

    // 5. Handle transition overlay
    if (plan.shot.throughColor) {
      this.flashRect.fill(plan.shot.throughColor);
      this.flashRect.opacity(plan.shot.throughColorOpacity);
      this.flashRect.visible(true);
    } else {
      this.flashRect.visible(false);
    }

    const isWipe = transition.effect === 'wipe-left' || transition.effect === 'wipe-right';
    this.wipeRect.visible(isWipe);
    if(isWipe){
      const t=Math.max(0,Math.min(1,transition.progress)),smooth=t*t*(3-2*t);
      this.wipeRect.setAttrs({x:(transition.effect==='wipe-right'?-1.3+2.3*smooth:1-2.3*smooth)*width,y:0,width:width*1.3,height});
    }
    // 6. Update outgoing dialogue
    this.updateDialogueNodes(
      this.outgoingDialogueGroup,
      this.outgoingDialogueClipGroup,
      this.outgoingDialogueBoxRect,
      this.outgoingDialogueBoxImage,
      this.outgoingDialogueInnerStroke,
      this.outgoingNameplateRect,
      this.outgoingSpeakerText,
      this.outgoingBodyText,
      this.outgoingBodyShape,
      outgoing.state,
      plan.dialogue.outgoing.opacity,
      null,
      outgoing.options,
    );

    // 7. Update incoming dialogue
    this.updateDialogueNodes(
      this.dialogueGroup,
      this.dialogueClipGroup,
      this.dialogueBoxRect,
      this.dialogueBoxImage,
      this.dialogueInnerStroke,
      this.nameplateRect,
      this.speakerText,
      this.bodyText,
      this.bodyShape,
      incoming.state,
      plan.dialogue.incoming.opacity,
      null,
      incoming.options,
    );

    this.dialogueLayer.visible(true);
    this.syncSpeechChromeState(incoming.state);
    this.lastRenderedStateTime = incoming.state.time;

    // 8. Batch draw
    this.stage.batchDraw();
  }

  /**
   * Render background, actors, CG, and weather for a single scene state.
   * Used by updateTransitionFrame for the incoming scene on the main bgLayer.
   */
  private updateStaticLayers(
    state: RenderState,
    images: ImageMap,
    options?: FrameRendererOptions,
  ): void {
    const { width, height } = this;
    const layerVariants = images.layerVariants;

    // Background
    const bgColor = options?.backgroundColor ?? '#000000';
    this.bgRect.fill(bgColor);
    this.bgRect.visible(true);
    this.updateFullScreenLayer(this.bgImage, this.bgImage2, state.background, images.background, layerVariants, width, height);

    // CG
    this.updateFullScreenLayer(this.cgImage, this.cgImage2, state.cg, images.cg ?? null, layerVariants, width, height);

    // Camera / shake
    this.applySceneVisualTransform(this.bgLayer, this.getSceneVisualTransform(state, options));

    // Weather
    this.weatherLayer.visible(true);
    const weatherState = state.weather;
    if (weatherState) {
      const weatherScale = normalizeRenderScale(options?.renderScale);
      const newKey = `${weatherState.type}-${weatherState.intensity}-${weatherScale}`;
      if (this.weatherKey !== newKey) {
        this.weatherSystem = new WeatherParticleSystem(
          weatherState.type, weatherState.intensity, this.width, this.height, weatherScale,
        );
        this.weatherKey = newKey;
      }
      const dt = state.time - this.lastFrameTime;
      if (dt > 0 && dt < 1) {
        this.weatherSystem!.update(dt);
      }
      this._weatherOpacity = weatherState.opacity;
      this.weatherShape.visible(true);
    } else {
      if (this.weatherSystem) {
        this.weatherSystem = null;
        this.weatherKey = null;
      }
      this.weatherShape.visible(false);
    }
    this.weatherLayer.opacity(1);
    this.lastFrameTime = state.time;
  }

  private applyIncomingStaticOpacity(opacity: number): void {
    const staticOpacity = Math.max(0, Math.min(1, opacity));
    this.bgRect.opacity(staticOpacity);
    applyNodeOpacity(this.bgImage, staticOpacity);
    applyNodeOpacity(this.bgImage2, staticOpacity);
    applyNodeOpacity(this.cgImage, staticOpacity);
    applyNodeOpacity(this.cgImage2, staticOpacity);
    this.weatherLayer.opacity(staticOpacity);
  }

  private getSceneVisualTransform(state: RenderState, options?: FrameRendererOptions): SceneVisualTransform {
    const renderScale = normalizeRenderScale(options?.renderScale);
    const shakeX = (state.screenShake?.offsetX ?? 0) * renderScale;
    const shakeY = (state.screenShake?.offsetY ?? 0) * renderScale;
    const cam = state.camera;

    if (cam && cam.scale !== 1) {
      const pivotX = (cam.x / 100) * this.width;
      const pivotY = (cam.y / 100) * this.height;
      const offsetX = pivotX * (cam.scale - 1);
      const offsetY = pivotY * (cam.scale - 1);
      return {
        x: shakeX - offsetX,
        y: shakeY - offsetY,
        scaleX: cam.scale,
        scaleY: cam.scale,
      };
    }

    return {
      x: shakeX,
      y: shakeY,
      scaleX: 1,
      scaleY: 1,
    };
  }

  private applySceneVisualTransform(node: Konva.Node, transform: SceneVisualTransform): void {
    node.x(transform.x);
    node.y(transform.y);
    node.scaleX(transform.scaleX);
    node.scaleY(transform.scaleY);
  }

  private updateActorGroup(
    group: Konva.Group,
    nodes: Map<string, Konva.Image>,
    fadeNodes: Map<string, Konva.Image>,
    state: RenderState,
    images: ImageMap,
    actorOpacityMultiplier: number,
    options?: FrameRendererOptions,
  ): void {
    const { width, height } = this;
    const hasDialogue = !!state.dialogue;
    const usedIds = new Set<string>();

    for (const actor of state.actors) {
      if (!actor.visible && actor.opacity <= 0) continue;
      usedIds.add(actor.id);
      let actorImage = images.actors.get(actor.id);
      const expressionImage = (variant: string) => {
        const image = images.layerVariants?.get(variant) ?? (
          variant === actor.sprite ? actorImage :
          variant === actor.previousSprite ? images.actorPrevious?.get(actor.id) : undefined
        );
        if (!image) throw new Error(`Missing expression image '${variant}'`);
        return image;
      };
      if (actor.spriteMix && actor.spriteMix.length > 1) {
        let canvas = this.expressionCanvases.get(actor.id);
        if (!canvas) {
          canvas = document.createElement("canvas");
          this.expressionCanvases.set(actor.id, canvas);
        }
        const mix = actor.spriteMix.map(m => ({
          image: expressionImage(m.variant), weight: m.weight,
        }));
        actorImage = blendExpression(mix, height * 0.8, canvas);
      }
      if (actor.spriteMix?.length === 1)
        actorImage = expressionImage(actor.spriteMix[0].variant);
      const previousActorImage = images.actorPrevious?.get(actor.id);
      let node = nodes.get(actor.id);
      let fadeNode = fadeNodes.get(actor.id);
      if (!node) {
        node = new Konva.Image({ image: undefined, listening: false });
        group.add(node);
        nodes.set(actor.id, node);
      }
      if (!fadeNode) {
        fadeNode = new Konva.Image({ image: undefined, listening: false, visible: false });
        group.add(fadeNode);
        fadeNodes.set(actor.id, fadeNode);
      }
      // Existing nodes must follow the current frame order after edits and seeks.
      node.moveToTop();
      fadeNode.moveToTop();
      if (actorImage) {
        const actorIsSpeaker = actor.isSpeaker;
        const autoDimFactor = hasDialogue && !actorIsSpeaker ? (options?.dimBrightness ?? 0.75) : 1.0;
        const effectiveBrightness = autoDimFactor * (actor.brightness ?? 1);
        const blurRadius = Math.max(0, actor.blur ?? 0);
        const hasTint = actor.tintColor !== null && actor.tintOpacity > 0;
        const hasBrightnessOrTint = Math.abs(effectiveBrightness - 1) > 0.001 || hasTint;
        const hasBlur = blurRadius > 0.01;
        const renderScale = normalizeRenderScale(options?.renderScale);
        const px = (actor.x / 100) * width + (actor.shakeOffsetX ?? 0) * renderScale;
        const py = (actor.y / 100) * height + (actor.shakeOffsetY ?? 0) * renderScale;
        const speakerBoost = hasDialogue && actorIsSpeaker && (options?.speakerScale ?? false) ? 1.05 : 1;
        const scaleX = (actor.flipX ? -1 : 1) * actor.scale * speakerBoost;
        const scaleY = actor.scale * speakerBoost;

        const applyActorNode = (
          targetNode: Konva.Image,
          imageSource: CanvasImageSource,
          nodeOpacity: number,
        ) => {
          const sizedImage = imageSource as {
            naturalWidth?: number; naturalHeight?: number; width?: number; height?: number;
          };
          const imgWidth = sizedImage.naturalWidth ?? sizedImage.width ?? 1;
          const imgHeight = sizedImage.naturalHeight ?? sizedImage.height ?? 1;
          const baseHeight = height * 0.8;
          const aspect = imgHeight > 0 ? imgWidth / imgHeight : 1;
          const baseWidth = baseHeight * aspect;
          targetNode.image(imageSource);
          targetNode.x(px);
          targetNode.y(py);
          targetNode.width(baseWidth);
          targetNode.height(baseHeight);
          targetNode.offsetX(baseWidth / 2);
          targetNode.offsetY(baseHeight);
          targetNode.scaleX(scaleX);
          targetNode.scaleY(scaleY);
          targetNode.opacity(Math.max(0, Math.min(1, nodeOpacity * actorOpacityMultiplier)));
          targetNode.rotation(actor.rotation ?? 0);
          targetNode.visible(true);
          if (hasBrightnessOrTint || hasBlur) {
            targetNode.cache();
            const filters: any[] = [];
            if (hasBrightnessOrTint) {
              filters.push(createCombinedFilter(effectiveBrightness, actor.tintColor, actor.tintOpacity));
            }
            if (hasBlur) {
              filters.push(Konva.Filters.Blur);
              targetNode.blurRadius(blurRadius);
            } else {
              targetNode.blurRadius(0);
            }
            targetNode.filters(filters);
          } else {
            targetNode.clearCache();
            targetNode.filters([]);
            targetNode.blurRadius(0);
          }
        };

        const fadeProgress = !actor.spriteMix && actor.spriteTransition?.effect === 'fade'
          ? Math.max(0, Math.min(1, actor.spriteTransition.progress))
          : null;
        if (fadeProgress !== null && previousActorImage) {
          applyActorNode(node, actorImage, actor.opacity * fadeProgress);
          applyActorNode(fadeNode, previousActorImage, actor.opacity * (1 - fadeProgress));
        } else {
          applyActorNode(node, actorImage, actor.opacity);
          fadeNode.visible(false);
        }
      } else {
        node.visible(false);
        fadeNode.visible(false);
      }
    }
    for (const [id, node] of nodes) {
      if (!usedIds.has(id)) node.visible(false);
    }
    for (const [id, node] of fadeNodes) {
      if (!usedIds.has(id)) node.visible(false);
    }
    group.visible(usedIds.size > 0);
  }

  /**
   * Capture the current stage as an HTMLCanvasElement (for export).
   * Call after updateFrame().
   */
  captureFrame(): HTMLCanvasElement {
    return this.stage.toCanvas({ pixelRatio: 1 }) as unknown as HTMLCanvasElement;
  }

  /**
   * Legacy method: updateFrame + captureFrame in one call.
   * Used by the export pipeline.
   */
  renderFrame(
    state: RenderState,
    images: ImageMap,
    options?: FrameRendererOptions,
  ): HTMLCanvasElement {
    this.updateFrame(state, images, options);
    return this.captureFrame();
  }

  /**
   * Render a transition frame and capture it in one call.
   * Used by the export pipeline for dual-state transitions.
   */
  renderTransitionFrame(
    outgoing: { state: RenderState; images: ImageMap; options?: FrameRendererOptions },
    incoming: { state: RenderState; images: ImageMap; options?: FrameRendererOptions },
    transition: { effect: string; progress: number; compositorPlan: SceneTransitionPlan },
  ): HTMLCanvasElement {
    this.updateTransitionFrame(outgoing, incoming, transition);
    return this.captureFrame();
  }

  /**
   * Resize the stage (for responsive preview).
   */
  /** Preview hit regions use the same transformed nodes that draw and export. */
  getActorEditingBounds(): Array<{ id: string; x: number; y: number; width: number; height: number }> {
    return [...this.actorNodes.entries()].filter(([, node]) => node.visible() && node.opacity() > .02)
      .sort(([, a], [, b]) => a.zIndex() - b.zIndex())
      .map(([id, node]) => ({ id, ...node.getClientRect({ relativeTo: this.stage }) }));
  }

  getLayerEditingBounds() {
    return {
      actorSpace: this.actorGroup.getAbsoluteTransform().getMatrix(),
      dialogueBox: this.dialogueGroup.visible() && this.dialogueGroup.opacity() > .02 ? this.dialogueBoxRect.getClientRect({relativeTo:this.stage}) : undefined,
      hasCg: this.cgGroup.visible() && (this.cgImage.visible() || this.cgImage2.visible()),
    };
  }

  /** Transient drag feedback; the application commits one atomic edit on release. */
  previewActorTransform(id: string, transform: { x: number; y: number; scale: number }) {
    if (
      this.lastFrame &&
      this.lastFrame.state.visuals?.some((v) =>
        v.nodes.some((n) =>
          n.attrs.members?.some((m) => m.kind === "actor" && m.actorId === id),
        ),
      )
    ) {
      const { state, images, options } = this.lastFrame;
      this.updateFrame(
        {
          ...state,
          actors: state.actors.map((a) =>
            a.id === id ? { ...a, ...transform } : a,
          ),
        },
        images,
        options,
      );
      return;
    }

    for (const node of [this.actorNodes.get(id), this.actorFadeNodes.get(id)]) {
      if (!node) continue;
      const sign = node.scaleX() < 0 ? -1 : 1;
      node.position({ x: transform.x / 100 * this.width, y: transform.y / 100 * this.height });
      node.scale({ x: sign * transform.scale, y: transform.scale });
    }
    this.stage.batchDraw();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.stage.width(width);
    this.stage.height(height);
    this.bgRect.width(width);
    this.bgRect.height(height);
    this.bgImage.width(width);
    this.bgImage.height(height);
    this.bgImage2.width(width);
    this.bgImage2.height(height);
    this.outgoingSceneImage.width(width);
    this.outgoingSceneImage.height(height);
    this.incomingSceneImage.width(width);
    this.incomingSceneImage.height(height);
    this.cgImage.width(width);
    this.cgImage.height(height);
    this.cgImage2.width(width);
    this.cgImage2.height(height);
    for (const image of [this.bgImage, this.bgImage2, this.cgImage, this.cgImage2]) {
      image.crop(getFullScreenImageCrop(image.image(), width, height));
    }
    this.flashRect.width(width);
    this.flashRect.height(height);
    this.weatherShape.width(width);
    this.weatherShape.height(height);
    this.weatherSystem?.resize(width, height);
  }

  dispose(): void {
    this.softTransition?.dispose();this.softTransition=null;
    this.activeTransition?.impl.teardown();
    this.activeTransition = null;
    if (this.offscreenRenderer) {
      this.offscreenRenderer.dispose();
      this.offscreenRenderer = null;
    }
    this.weatherSystem = null;
    this.previousSpeechKind = 'none';
    this.previousDialogueChrome = null;
    this.outgoingDialogueChrome = null;
    this.lastRenderedStateTime = null;
    this.stage.destroy();
    if (this.ownContainer) {
      this.container.remove();
    }
    this.outgoingActorNodes.clear();
    this.outgoingActorFadeNodes.clear();
    this.actorNodes.clear();
    this.actorFadeNodes.clear();
  }
}

/** @deprecated Use KonvaFrameRenderer instead */
export const KonvaExportRenderer = KonvaFrameRenderer;
