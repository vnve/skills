export {
  DIALOGUE_THEMES,
  DEFAULT_DIALOGUE_THEME_ID,
  CUSTOM_THEME_BOX_CHROME,
  canonicalDialogueThemeId,
  GALGAME_CANVAS_WIDTH,
  GALGAME_CANVAS_HEIGHT,
  GALGAME_DIALOGUE_BOX_WIDTH,
  GALGAME_DIALOGUE_BOX_HEIGHT,
  GALGAME_DIALOGUE_BOX_LEFT,
  GALGAME_DIALOGUE_BOX_TOP,
  GALGAME_DIALOGUE_BOX_BOTTOM,
  GALGAME_DIALOGUE_LAYOUT,
  computeDialogueBoxPlacement,
  getDialogueBottomGap,
  getDialogueBoxPixelRect,
  isDialogueStrokeVisible,
  resolveDialogueTheme,
  resolveDialogueThemeForCanvas,
  scaleDialogueThemeForPortrait,
  type DialogueThemeConfig,
  type CustomThemeEntry,
  type DialogueBoxPixelRect,
} from './themes';

export {
  layoutDialogueBoxImage,
  drawDialogueBoxImage,
  normalizeBoxImageSlice,
  clampBoxImageOpacity,
} from './dialogue-box-image';
export type {
  DialogueBoxImageDrawRect,
  DialogueBoxImageDrawOptions,
  DialogueBoxImagePatch,
} from './dialogue-box-image';

export { KonvaFrameRenderer, KonvaExportRenderer, scaleDialogueThemeForRender } from './konva-renderer';
export { getFullScreenImageCrop } from './fullscreen-image';
export type { FrameRenderer, FrameRendererOptions, KonvaFrameRendererConfig, ImageMap } from './konva-renderer';

export {
  renderStyledText,
  renderStyledTextPlan,
  truncateSegments,
  computeTextLayout,
  buildStyledTextLayout,
  buildStyledTextRenderPlan,
  sliceSegmentsByCharRange,
} from './styled-text';
export type {
  RenderStyledTextOptions,
  TextLineInfo,
  StyledTextLayout,
  StyledTextRenderPlan,
  StyledTextRenderPlanLine,
} from './styled-text';

export { transitionRegistry } from './transition-effects';
export type { TransitionEffect, TransitionContext } from './transition-effects';
export { captureStageSnapshot } from './stage-snapshot';
export type { CaptureStageSnapshotOptions } from './stage-snapshot';
export { buildSceneTransitionPlan } from './scene-transition-compositor';
export type {
  SceneShotSurface,
  SceneShotChannel,
  SceneDialogueChannel,
  SceneTransitionSampledChannelValue,
  SceneTransitionSampledChannels,
  SceneTransitionSpec,
  SceneShotReveal,
  SceneShotPlanSide,
  SceneShotPlan,
  SceneTransitionPlan,
} from './scene-transition-channels';

export {
  buildRenderContext,
  prepareFrameInput,
  prepareFrame,
  findSceneAtTime,
  computeTransitionOverlay,
  createEmptyRenderContext,
} from './frame-pipeline';
export type {
  RenderContext,
  SceneTimeRange,
  PrepareFrameInputParams,
  PreparedFrameInput,
  PreparedFrame,
  TransitionFrameInput,
  SceneTimelineInput,
  ActorDefault,
} from './frame-pipeline';

export {
  buildDefaultTransitionChannels,
} from './default-transition-channels';

export {
  sampleSequenceTransitionEnvelope,
  sampleSequenceTransitionChannel,
} from './sequence-envelope';
export {
  findSequenceSceneAtTime,
  findSequenceTransitionAtTime,
  sampleSequence,
  sampleSequenceTransition,
} from './sequence-evaluator';

export type {
  SequenceClipChannel,
  SequenceTransitionMode,
  SequenceTransitionEasing,
  SequenceEventTimeBasis,
  ChannelClipRef,
  SequenceTransitionEnvelope,
  SequenceTransitionChannelSpec,
  CompiledSceneClip,
  SequenceTransition,
  CompiledSequence,
} from './sequence-types';

export * from './layout-check';
export * from './dialogue-geometry';

export { drawDialogueSurface } from './dialogue-surface';
