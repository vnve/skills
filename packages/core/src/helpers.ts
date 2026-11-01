import { nanoid } from 'nanoid';
import type { Project, ProjectMeta, Scene, Assets, AudioAssets, Act } from './types/project';
import type { AssetVariant, AssetAudio } from './types/project';
import type { TextNode, RichContent, TextSegment } from './types/script';

export const SCHEMA_VERSION = 14;
export const DEFAULT_READING_PACE = 1;

const DEFAULT_SCENE_DEFAULTS = {
  autoEntrance: true,
  entranceEffect: 'fade',
  dimBrightness: 0.75,
  speakerScale: false,
  backgroundColor: '#000000',
} as const;

export function createId(): string {
  return nanoid(8);
}

export function createDefaultAssets(): Assets {
  return {
    visual: { character: [], background: [], prop: [], cg: [] },
    audio: { bgm: [], sfx: [] },
    fonts: [],
    themes: [],
  };
}

export function getAllVariants(assets: Assets): AssetVariant[] {
  return [
    ...assets.visual.character.flatMap((g) => g.variants),
    ...assets.visual.background.flatMap((g) => g.variants),
    ...assets.visual.prop.flatMap((g) => g.variants),
    ...assets.visual.cg.flatMap((g) => g.variants),
  ];
}

export function getVariantThumbnailAssets(assets: Assets): Array<{ id: string; name: string; url: string }> {
  return getAllVariants(assets)
    .filter((variant) => variant.thumbnailUrl)
    .map((variant) => ({
      id: variant.thumbnailUrl!,
      name: `${variant.name} thumbnail`,
      url: variant.thumbnailUrl!,
    }));
}

/**
 * Collect theme box-image assets as resolvable entries.
 * These are NOT part of getAllVariants but need URL resolution after project reload.
 */
export function getThemeBoxImageAssets(
  themes: ReadonlyArray<{ id: string; name: string; data: { boxImageAssetId?: string; boxImageUrl?: string } }>,
): Array<{ id: string; name: string; url: string }> {
  return themes
    .filter((t) => t.data.boxImageAssetId && t.data.boxImageUrl)
    .map((t) => ({ id: t.data.boxImageAssetId!, name: `${t.name} box`, url: t.data.boxImageUrl! }));
}

export function getAllAudio(audio: AudioAssets): AssetAudio[] {
  return [...audio.bgm, ...audio.sfx];
}

export function createDefaultScene(name: string): Scene {
  return {
    id: createId(),
    name,
    actors: [],
    script: { nodes: [] },
  };
}

export function createDefaultAct(name: string): Act {
  return {
    id: createId(),
    name,
    scenes: [createDefaultScene('Scene 1')],
  };
}

export interface CreateProjectOptions {
  title?: string;
  width?: number;
  height?: number;
  fps?: number;
  aspect?: string;
}

export type AspectPresetKey = '16:9' | '9:16';

export const ASPECT_PRESETS: Record<AspectPresetKey, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
};

export function createDefaultProject(options: CreateProjectOptions = {}): Project {
  const now = new Date().toISOString();
  const meta: ProjectMeta = {
    id: createId(),
    title: options.title ?? 'Untitled Project',
    width: options.width ?? 1920,
    height: options.height ?? 1080,
    fps: options.fps ?? 30,
    aspect: options.aspect ?? '16:9',
    createdAt: now,
    updatedAt: now,
    readingPace: DEFAULT_READING_PACE,
    sceneDefaults: { ...DEFAULT_SCENE_DEFAULTS },
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    meta,
    assets: createDefaultAssets(),
    visualSubjects: [],
    acts: [createDefaultAct('Act 1')],
  };
}

/**
 * Return a deep copy of the project with `timeline` stripped from every scene.
 * Timeline is derived data and should not be persisted.
 */
export function stripTimelineFromProject(project: Project): Project {
  return {
    ...project,
    acts: project.acts.map((act) => ({
      ...act,
      scenes: act.scenes.map(({ timeline, ...scene }) => scene),
    })),
  };
}

// --- TextNode rich content helpers ---

/**
 * Extract the plain-text representation from a TextNode, handling both
 * the legacy `text` field and the new `content` array.
 */
export function getTextNodePlainText(node: TextNode): string {
  if (!node.content || node.content.length === 0) {
    return node.text ?? '';
  }
  return node.content
    .filter((seg): seg is TextSegment => seg.type === 'text')
    .map((seg) => seg.text)
    .join('');
}

/**
 * Build TTS-ready text from a TextNode, converting inline tags to MiniMax format:
 * - interjection → (kind) e.g. (laughs)
 * - wait → <#seconds#> e.g. <#1.5#>
 * - other tags → ignored
 */
export function getTtsText(node: TextNode): string {
  if (!node.content || node.content.length === 0) {
    return node.text ?? '';
  }
  // Waits contribute pauses to speech, but a silent stage action needs no voice.
  const hasSpeech = node.content.some((seg) =>
    seg.type === 'text' ? seg.text.trim().length > 0 : seg.name === 'interjection',
  );
  if (!hasSpeech) return '';
  return node.content
    .map((seg) => {
      if (seg.type === 'text') return seg.text;
      if (seg.type === 'tag' && seg.name === 'interjection') {
        return `(${(seg.params as { kind: string }).kind})`;
      }
      if (seg.type === 'tag' && seg.name === 'wait') {
        return `<#${(seg.params as { seconds: number }).seconds}#>`;
      }
      return '';
    })
    .join('');
}

/**
 * Normalize a TextNode into its `RichContent[]` representation.
 * If the node already has a `content` array, return it.
 * Otherwise synthesize one from the legacy `text` field.
 */
export function getTextNodeContent(node: TextNode): RichContent[] {
  if (node.content && node.content.length > 0) {
    return node.content;
  }
  if (!node.text) return [];
  return [{ type: 'text', text: node.text }];
}

/**
 * Build a TextNode from a RichContent array, keeping both `text` and
 * `content` fields in sync.
 */
export function buildTextNodeFromContent(
  content: RichContent[],
  actorId?: string,
): TextNode {
  const plainText = content
    .filter((seg): seg is TextSegment => seg.type === 'text')
    .map((seg) => seg.text)
    .join('');

  const node: TextNode = { type: 'text', text: plainText };
  if (actorId) node.actorId = actorId;

  // Store content if it contains tags or styled text; otherwise keep it simple
  const hasTags = content.some((seg) => seg.type === 'tag');
  const hasStyles = content.some(
    (seg) => seg.type === 'text' && (seg.bold || seg.italic || seg.color),
  );
  if (hasTags || hasStyles) {
    node.content = content;
  }
  return node;
}

/**
 * Reapply metadata that should survive TextNode content rebuilds.
 * This intentionally excludes structural fields like `text`, `content`,
 * and `actorId`, which are owned by the rebuilt node.
 */
export function applyTextNodeMetadata(
  node: TextNode,
  metadata: Pick<Partial<TextNode>, 'id' | 'audioUrl' | 'audioDuration' | 'emotion' | 'ttsSnapshot' | 'audioImportSnapshot' | 'variant'>,
): TextNode {
  const nextNode = { ...node };

  if (metadata.id) nextNode.id = metadata.id;
  if (metadata.audioUrl !== undefined) nextNode.audioUrl = metadata.audioUrl;
  if (metadata.audioDuration !== undefined) nextNode.audioDuration = metadata.audioDuration;
  if (metadata.emotion !== undefined) nextNode.emotion = metadata.emotion;
  if (metadata.ttsSnapshot !== undefined) nextNode.ttsSnapshot = metadata.ttsSnapshot;
  if (metadata.audioImportSnapshot !== undefined) nextNode.audioImportSnapshot = structuredClone(metadata.audioImportSnapshot);
  if (metadata.variant !== undefined) nextNode.variant = metadata.variant;

  return nextNode;
}
