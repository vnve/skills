export interface Timeline {
  events: TimelineEvent[];
  duration: number;
}

export type TextDisplayMode = 'typewriter' | 'line' | 'instant';

export type TimelineEvent =
  | PerformanceEvent
  | AnimationEvent
  | ShowEvent
  | HideEvent
  | MoveEvent
  | ShakeEvent
  | HopEvent
  | SetEvent
  | SayEvent
  | NarrateEvent
  | WaitEvent
  | BgmEvent
  | SfxEvent
  | FilterEvent
  | FlashEvent
  | VibrateEvent
  | TintEvent
  | RotateEvent
  | ZoomEvent
  | CameraFocusEvent
  | CameraResetEvent
  | WeatherStartEvent
  | WeatherStopEvent;

export interface BaseEvent {
  type: string;
  at: number;
  dur: number;
  targetId?: string;
  envelope?:{sampleRate:number;progress:number[];eased:number[]};
}

/** A script placement of baked data; the browser never evaluates authoring code. */
export interface AnimationEvent extends BaseEvent {
  type: "animation";
  params: {
    clipId: string;
    enabled?: boolean;
    weight?: number;
    x?: number;
    y?: number;
    scale?: number;
  };
}

export interface ShowEvent extends BaseEvent {
  type: 'show';
  params: { x?: number; y?: number; with?: string };
}

export interface HideEvent extends BaseEvent {
  type: 'hide';
  params: { with?: string };
}

export interface MoveEvent extends BaseEvent {
  type: 'move';
  params: { toX: number; toY: number; ease?: string };
}

export interface ShakeEvent extends BaseEvent {
  type: 'shake';
  params: { amp: number };
}

export interface HopEvent extends BaseEvent {
  type: 'hop';
  params: { amp: number };
}

export interface SetEvent extends BaseEvent {
  type: 'set';
  params: {
    target: string;
    variant: string;
    with?: 'fade';
  };
}

export const SET_TARGET_BACKGROUND = '$background';
export const SET_TARGET_CG = '$cg';

export interface SayEvent extends BaseEvent {
  type: 'say';
  params: {
    text: string;
    segments?: import('./script').StyledSegment[];
    theme?: string;
    themeOverrides?: Record<string, unknown>;
    displayMode?: TextDisplayMode;
    /** Inline pauses inserted by sequential inline tags (ratio in 0..1). */
    inlinePauses?: Array<{ ratio: number; dur: number; at?: number }>;
    /** Actual text reveal duration without min-duration clamp.
     *  When shorter than event `dur`, the typewriter finishes early and holds. */
    textAnimDur?: number;
    /** TTS audio URL for voice playback. */
    audioUrl?: string;
    /** Natural audio length, excluding text holds and blocking directions. */
    voiceDuration?: number;
    /** TTS playback volume (0–1). */
    voiceVolume?: number;
  };
}

export interface NarrateEvent extends BaseEvent {
  type: 'narrate';
  params: {
    text: string;
    segments?: import('./script').StyledSegment[];
    theme?: string;
    themeOverrides?: Record<string, unknown>;
    displayMode?: TextDisplayMode;
    /** Inline pauses inserted by sequential inline tags (ratio in 0..1). */
    inlinePauses?: Array<{ ratio: number; dur: number; at?: number }>;
    /** Actual text reveal duration without min-duration clamp.
     *  When shorter than event `dur`, the typewriter finishes early and holds. */
    textAnimDur?: number;
    /** TTS audio URL for voice playback. */
    audioUrl?: string;
    /** Natural audio length, excluding text holds and blocking directions. */
    voiceDuration?: number;
    /** TTS playback volume (0–1). */
    voiceVolume?: number;
  };
}

export interface WaitEvent extends BaseEvent {
  type: 'wait';
  params: { seconds: number };
}

export type BgmAction = 'play' | 'stop' | 'pause' | 'resume';

export interface BgmEvent extends BaseEvent {
  type: 'bgm';
  params: {
    action?: BgmAction;
    asset?: string;
    volume?: number;
    fade?: number;
    loop?: boolean;
    duck?: number;
  };
}

export interface SfxEvent extends BaseEvent {
  type: 'sfx';
  params: { asset: string; volume?: number };
}

export interface FilterEvent extends BaseEvent {
  type: 'filter';
  params: { brightness?: number; blur?: number };
}

export interface FlashEvent extends BaseEvent {
  type: 'flash';
  params: { color?: string };
}

export interface VibrateEvent extends BaseEvent {
  type: 'vibrate';
  params: { amp: number };
}

export interface TintEvent extends BaseEvent {
  type: 'tint';
  params: { color: string; opacity?: number };
}

export interface RotateEvent extends BaseEvent {
  type: 'rotate';
  params: { angle: number };
}

export interface ZoomEvent extends BaseEvent {
  type: 'zoom';
  params: { scale: number };
}

export interface CameraFocusEvent extends BaseEvent {
  type: 'camera-focus';
  params: {
    x?: number;
    y?: number;
    zoom: number;
    other?:string;
    fitPair?:boolean;
    ease?: string;
  };
}

export interface CameraResetEvent extends BaseEvent {
  type: 'camera-reset';
  params: Record<string, never>;
}

export type WeatherType = 'rain' | 'snow';
export type WeatherIntensity = 'light' | 'normal' | 'heavy';

export interface WeatherStartEvent extends BaseEvent {
  type: 'weather-start';
  params: { weather: WeatherType; intensity: WeatherIntensity };
}

export interface WeatherStopEvent extends BaseEvent {
  type: 'weather-stop';
  params: { weather: WeatherType };
}


export interface PerformanceEvent extends BaseEvent {
 type: 'performance';
 params: {name: import('../performance-commands').PerformanceCommandName; values: Record<string, unknown>};
}
