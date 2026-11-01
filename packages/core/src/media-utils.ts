import type { MediaType } from './types/project';

export const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mkv']);
export const ANIMATED_EXTS = new Set(['.gif']);
export const STATIC_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.svg', '.webp', '.avif']);

/** All visual asset extensions (static + animated + video). */
export const ALL_VISUAL_EXTS = new Set([...STATIC_IMAGE_EXTS, ...ANIMATED_EXTS, ...VIDEO_EXTS]);

export function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function detectMediaTypeFromExtension(ext: string): MediaType {
  const lower = ext.toLowerCase();
  if (VIDEO_EXTS.has(lower)) return 'video';
  if (ANIMATED_EXTS.has(lower)) return 'animated';
  return 'static';
}

export function isVideoExtension(ext: string): boolean {
  return VIDEO_EXTS.has(ext.toLowerCase());
}

export function isAnimatedExtension(ext: string): boolean {
  return ANIMATED_EXTS.has(ext.toLowerCase());
}
