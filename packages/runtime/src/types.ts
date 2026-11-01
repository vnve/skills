export interface ActorRenderState {
  id: string;
  x: number;
  y: number;
  visible: boolean;
  opacity: number;
  sprite: string | null;
  previousSprite?: string;
  spriteMix?: Array<{ variant: string; weight: number }>;
  spriteTransition?: { effect: 'fade'; progress: number };
  shakeOffsetX: number;
  shakeOffsetY: number;
  scale: number;
  flipX: boolean;
  isSpeaker: boolean;
  brightness: number;
  blur: number;
  rotation: number;
  tintColor: string | null;
  tintOpacity: number;
}

export interface DialogueState {
  speaker: string;
  text: string;
  segments?: import('@vnve/core').StyledSegment[];
  progress: number;
  elapsedSeconds?: number;
  revealDurationSeconds?: number;
  theme?: string;
  themeOverrides?: Record<string, unknown>;
  displayMode?: import('@vnve/core').TextDisplayMode;
}

export interface NarrationState {
  text: string;
  segments?: import('@vnve/core').StyledSegment[];
  progress: number;
  elapsedSeconds?: number;
  revealDurationSeconds?: number;
  theme?: string;
  themeOverrides?: Record<string, unknown>;
  displayMode?: import('@vnve/core').TextDisplayMode;
}

export interface BgmState {
  asset: string;
  status: 'playing' | 'paused';
  volume: number;
  fade: number;
  loop: boolean;
  duck: number;
  ducking: boolean;
  startedAt: number;
}

export interface SfxTrigger {
  asset: string;
  volume: number;
  triggeredAt: number;
}

export interface AudioRenderState {
  bgm: BgmState | null;
  sfxTriggers: SfxTrigger[];
}

export interface FlashState {
  color: string;
  progress: number;
}

export interface ScreenShakeState {
  offsetX: number;
  offsetY: number;
}

export interface LayerImageState {
  asset: string;
  previousAsset?: string;
  transition?: { effect: string; progress: number };
}

export interface CameraRenderState {
  /** Focal point X (0-100%) */
  x: number;
  /** Focal point Y (0-100%) */
  y: number;
  /** Zoom scale (1 = no zoom) */
  scale: number;
}

export interface WeatherRenderState {
  type: 'rain' | 'snow';
  intensity: 'light' | 'normal' | 'heavy';
  opacity: number;
}

export interface RenderState {
  visuals?: import("./animation").VisualRenderState[];
  time: number;
  duration: number;
  actors: ActorRenderState[];
  dialogue: DialogueState | null;
  narration: NarrationState | null;
  activeEventIndex: number;
  audio: AudioRenderState;
  flash: FlashState | null;
  screenShake: ScreenShakeState | null;
  background: LayerImageState | null;
  cg: LayerImageState | null;
  camera: CameraRenderState;
  weather: WeatherRenderState | null;
}
