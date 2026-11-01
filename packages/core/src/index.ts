export * from "./types/project";
export * from "./types/timeline";
export * from "./types/diagnostic";
export * from "./types/script";
export * from "./types/authoring";
export * from "./contracts/script";
export * from "./contracts/authoring";
export * from "./contracts/project-patch";
export * from "./contracts/json-schema";
export * from "./audio-defaults";
export * from "./scene-time";
export {
  SCHEMA_VERSION,
  ASPECT_PRESETS,
  createId,
  createDefaultAssets,
  createDefaultScene,
  createDefaultAct,
  createDefaultProject,
  getTextNodePlainText,
  getTtsText,
  getTextNodeContent,
  buildTextNodeFromContent,
  applyTextNodeMetadata,
  getAllVariants,
  getVariantThumbnailAssets,
  getThemeBoxImageAssets,
  getAllAudio,
  stripTimelineFromProject,
} from "./helpers";
export type { CreateProjectOptions, AspectPresetKey } from "./helpers";
export * from "./media-utils";
export * from "./helpers/resolve-scene-property";
export {
  DEFAULT_VARIANT_KEY,
  findVariantForReplacement,
  inferVariantKey,
  isDefaultVariantToken,
  normalizeVariantToken,
  resolveVariantKey,
  variantMatchesIdentity,
} from "./helpers/variant-identity";

export { createProjectBuilder } from "./production/project-builder";



export * from "./dialogue-theme";

export * from "./references";

export { assetVariantSchema } from "./contracts/structure-patch";

export * from "./animation";

export * from './helpers/scene-settings';

export * from "./performance-commands";

export * from "./scene-transitions";
export * from "./common-effects";
