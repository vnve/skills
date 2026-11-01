import type { ScriptDoc } from "./script";
import type { Timeline, TextDisplayMode } from "./timeline";

export interface ProjectMeta {
  id: string;
  title: string;
  width: number;
  height: number;
  fps: number;
  aspect: string;
  /** User-facing visual direction reused by Agent image generation. */
  artDirection?: string;
  createdAt: string;
  updatedAt: string;
  /** Default reading pace multiplier (project-level default, 1.0 = normal). */
  readingPace?: number;
  /** Default pause in seconds inserted between consecutive dialogue lines. */
  lineGap?: number;
  /** Default dialogue theme ID applied to scenes without an explicit theme. */
  defaultDialogueThemeId?: string;
  /** Default dialogue box X position (percentage). */
  defaultDialogueX?: number;
  /** Default dialogue box Y position (percentage). */
  defaultDialogueY?: number;
  /** Project-level defaults applied when creating a new scene. */
  sceneDefaults?: SceneDefaults;
}

export interface SceneDefaults {
  autoEntrance?: boolean;
  entranceEffect?: string;
  transition?: {
    type: SceneTransitionType;
    duration?: number;
  };
  dimBrightness?: number;
  speakerScale?: boolean;
  backgroundColor?: string;
  // Linked dialogue defaults
  defaultDisplayMode?: TextDisplayMode;
  readingPace?: number;
  lineGap?: number;
}

export type AudioCategory = "bgm" | "sfx";

export interface AssetFont {
  id: string;
  name: string;
  url: string;
}

export type DialogueBoxImageFit = "stretch" | "contain" | "cover";

export interface DialogueBoxImageSlice {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface DialogueThemeData {
  boxFill?: string;
  boxGradient?: { top: string; middle: string; bottom: string } | null;
  boxBottomGap?: number;
  boxDecoration?: "none" | "rule" | "corners" | "double-rule" | "side";
  boxAccent?: string;
  boxStroke?: string;
  textColor?: string;
  nameColor?: string;
  cornerRadius?: number;
  nameplateFill?: string;
  nameplateVisible?: boolean;
  fontFamily?: string;
  nameFontFamily?: string;
  fontSize?: number;
  nameFontSize?: number;
  paddingX?: number;
  paddingY?: number;
  boxHeight?: number;
  boxWidthPercent?: number;
  dialogueX?: number;
  dialogueY?: number;
  lineHeight?: number;
  defaultDisplayMode?: TextDisplayMode;
  nameplateX?: number;
  nameplateY?: number;
  nameplateWidth?: number;
  nameplateHeight?: number;
  nameplatePaddingX?: number;
  nameplatePaddingY?: number;
  bodyX?: number;
  bodyY?: number;
  bodyWidth?: number;
  bodyHeight?: number;
  boxImageAssetId?: string;
  boxImageUrl?: string;
  /** How the uploaded frame image fills the dialogue box. Default: stretch. */
  boxImageFit?: DialogueBoxImageFit;
  /** 0–1 opacity of the frame image. Default: 1. */
  boxImageOpacity?: number;
  /** Source-pixel 9-slice insets. Zero on all sides means stretch/fit the whole image. */
  boxImageSlice?: DialogueBoxImageSlice;
}

export interface AssetTheme {
  id: string;
  name: string;
  baseThemeId?: string;
  data: DialogueThemeData;
}

export interface AssetAudio {
  id: string;
  name: string;
  url: string;
  duration?: number;
  source?: "catalog";
  catalogItemId?: string;
  tags?: string[];
  author?: string;
  license?: string;
  sourceUrl?: string;
}

export type MediaType = "static" | "animated" | "video";

export interface AssetVariant {
  id: string;
  name: string;
  /** Stable semantic key independent of localized display name. */
  key?: string;
  url: string;
  width?: number;
  height?: number;
  /** Media type: 'static' (default if undefined), 'animated' (GIF/WebP), 'video' (MP4/WebM/MKV). */
  mediaType?: MediaType;
  /** Whether playback loops. Default: true. */
  loop?: boolean;
  /** Thumbnail URL for animated/video variants (first-frame JPEG). */
  thumbnailUrl?: string;
  /** Duration in seconds for animated/video variants. */
  duration?: number;
}

export interface AssetGroup {
  id: string;
  name: string;
  variants: AssetVariant[];
  defaultVariantId: string;
  /** Project scaffolding only; hidden from the reusable workspace library until replaced. */
  source?: "workspace" | "project-placeholder" | "catalog";
  /** Official catalog item this group was materialized from. */
  catalogItemId?: string;
}

export type VisualAssetType = "character" | "background" | "prop" | "cg";

/** Story-facing visual concepts. These are project data, not reusable media files. */
export type VisualSubjectType = "character" | "location" | "prop" | "cg";

export interface VisualSubjectState {
  id: string;
  name: string;
}

export interface VisualAssetBinding {
  assetGroupId: string;
  /** VisualSubjectState.id -> AssetVariant.id */
  stateMap: Record<string, string>;
}

interface BaseVisualSubject {
  id: string;
  name: string;
  description?: string;
  states: VisualSubjectState[];
  defaultStateId: string;
  binding?: VisualAssetBinding;
}

export interface CharacterVisualSubject extends BaseVisualSubject {
  type: "character";
  gender?: "male" | "female";
  /** A character keeps the same voice when its visual material changes. */
  voiceConfig?: import("./authoring").VoiceConfig;
}

export interface LocationVisualSubject extends BaseVisualSubject {
  type: "location";
}

export interface PropVisualSubject extends BaseVisualSubject {
  type: "prop";
}

export interface CgVisualSubject extends BaseVisualSubject {
  type: "cg";
}

export type VisualSubject =
  | CharacterVisualSubject
  | LocationVisualSubject
  | PropVisualSubject
  | CgVisualSubject;

export interface VisualAssets {
  character: AssetGroup[];
  background: AssetGroup[];
  prop: AssetGroup[];
  cg: AssetGroup[];
}

export interface AudioAssets {
  bgm: AssetAudio[];
  sfx: AssetAudio[];
}

export interface Assets {
  visual: VisualAssets;
  audio: AudioAssets;
  fonts: AssetFont[];
  themes: AssetTheme[];
}

export interface ActorState {
  id: string;
  /** Stable story-facing character/prop identity. */
  visualSubjectId?: string;
  visualStateId?: string;
  /**
   * Source asset type for this stage element.
   * - undefined / 'character': character actor
   * - 'prop': prop instance placed on stage
   */
  assetType?: "character" | "prop";
  characterId: string;
  x: number;
  y: number;
  scale: number;
  visible: boolean;
  zIndex: number;
  variantId: string;
  flipX?: boolean;
  entranceEffect?: string;
  locked?: boolean;
}

export interface DialogueThemeOverrides {
  boxFill?: string;
  boxGradient?: { top: string; middle: string; bottom: string } | null;
  boxBottomGap?: number;
  boxDecoration?: "none" | "rule" | "corners" | "double-rule" | "side";
  boxAccent?: string;
  boxStroke?: string;
  textColor?: string;
  nameColor?: string;
  cornerRadius?: number;
  nameplateFill?: string;
  nameplateVisible?: boolean;
  fontFamily?: string;
  nameFontFamily?: string;
  fontSize?: number;
  nameFontSize?: number;
  paddingX?: number;
  paddingY?: number;
  boxHeight?: number;
  boxWidthPercent?: number;
  dialogueX?: number;
  dialogueY?: number;
  lineHeight?: number;
  defaultDisplayMode?: TextDisplayMode;
  nameplateX?: number;
  nameplateY?: number;
  nameplateWidth?: number;
  nameplateHeight?: number;
  nameplatePaddingX?: number;
  nameplatePaddingY?: number;
  bodyX?: number;
  bodyY?: number;
  bodyWidth?: number;
  bodyHeight?: number;
  boxImageAssetId?: string;
  boxImageUrl?: string;
}

export type SceneTransitionType =
  (typeof import("../scene-transitions").SCENE_TRANSITION_TYPES)[number];

export interface Scene {
  /** Persistent edit locks; playback is unaffected. */
  lockedElements?: Partial<Record<"background" | "cg" | "dialogue", boolean>>;
  id: string;
  name: string;
  /** Stable story-facing location identity for this scene. */
  backgroundSubjectId?: string;
  backgroundStateId?: string;
  backgroundId?: string;
  backgroundVisible?: boolean;
  /** Stable story-facing key-image identity for this scene. */
  cgSubjectId?: string;
  cgStateId?: string;
  cgId?: string;
  cgVisible?: boolean;
  backgroundColor?: string;
  templateId?: string;
  dialogueThemeId?: string;
  dialogueThemeOverrides?: DialogueThemeOverrides;
  coverImage?: string;
  autoEntrance?: boolean;
  entranceEffect?: string;
  transition?: {
    type: SceneTransitionType;
    duration?: number;
  };
  dimBrightness?: number;
  /** Whether to scale the speaking actor by 1.05x. Defaults to false. */
  speakerScale?: boolean;
  defaultDisplayMode?: TextDisplayMode;
  /** Reading pace multiplier (scene-level override, 1.0 = normal). */
  readingPace?: number;
  /** Pause in seconds inserted between consecutive dialogue lines (scene-level override). */
  lineGap?: number;
  /** Whether this scene's scene-group properties follow the global defaults. undefined = true. */
  scenePropsLinked?: boolean;
  /** Unified link for scene playback settings; independent of dialogue theme/layout. */
  sceneSettingsLinked?: boolean;
  /** Whether this scene's dialogue-group properties follow the global defaults. undefined = true. */
  dialoguePropsLinked?: boolean;
  actors: ActorState[];
  script: ScriptDoc;
  timeline?: Timeline;
  /** Deterministic motion authored by a host program; never executed as code by the player. */
  animationClips?: import("../animation").AnimationClip[];
}

export interface Act {
  id: string;
  name: string;
  scenes: Scene[];
}

export interface Project {
  schemaVersion: number;
  meta: ProjectMeta;
  /**
   * Runtime-only in workspace storage mode.
   * Persisted separately in workspace `.vnve/assets.json`.
   */
  assets: Assets;
  /** Project-specific cast, locations, props and key images with workspace asset bindings. */
  visualSubjects: VisualSubject[];
  acts: Act[];
  /** Voice config for narrator lines (TextNodes without actorId). */
  narratorVoiceConfig?: import("./authoring").VoiceConfig;
}
